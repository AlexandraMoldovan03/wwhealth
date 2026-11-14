-- Local test for 20261118000000_care_journey.sql. Run ONLY on a throwaway local Postgres (never on Supabase):
--   supabase/tests/run_local.sh
-- Fictive users; every check raises an exception on failure.
\set ON_ERROR_STOP 1
set client_min_messages = notice;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', '{"full_name":"Test Pacient","role":"patient"}'),
  ('00000000-0000-0000-0000-0000000000a2', '{"full_name":"Alt Pacient","role":"patient"}'),
  ('00000000-0000-0000-0000-0000000000d1', '{"full_name":"Dr. Test Unu","role":"doctor"}'),
  ('00000000-0000-0000-0000-0000000000d2', '{"full_name":"Dr. Test Doi","role":"doctor"}');
-- The doctor role is assigned only by an administrator (sign-up metadata is ignored).
update public.profiles set role = 'doctor' where id in ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d2');

create or replace function pg_temp.act(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p::text, ''), false);
  if p is null then reset role; else set role authenticated; end if;
end $$;
create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if;
  raise notice 'ok: %', what;
end $$;

-- ───────── schedule
select pg_temp.act('00000000-0000-0000-0000-0000000000d1');
select pg_temp.check((public.save_doctor_schedule('Europe/Bucharest', 30, 14,
  '[{"weekday":1,"kind":"work","start":"08:00","end":"12:00"},{"weekday":1,"kind":"break","start":"10:00","end":"10:30"},
    {"weekday":2,"kind":"work","start":"08:00","end":"12:00"},{"weekday":3,"kind":"work","start":"08:00","end":"12:00"},
    {"weekday":4,"kind":"work","start":"08:00","end":"12:00"},{"weekday":5,"kind":"work","start":"08:00","end":"12:00"}]'::jsonb)) ->> 'status' = 'ok',
  'doctor saves weekly schedule');
select pg_temp.check((public.save_doctor_schedule('Mars/Olympus', 30, 14, '[]')) ->> 'status' = 'invalid_timezone', 'invalid timezone rejected');
select pg_temp.check((public.save_doctor_schedule('Europe/Bucharest', 30, 14,
  '[{"weekday":1,"kind":"work","start":"08:00","end":"12:00"},{"weekday":1,"kind":"work","start":"11:00","end":"13:00"}]')) ->> 'status' = 'overlapping_hours',
  'overlapping work hours rejected');
select pg_temp.check((select count(*) from public.doctor_availability where doctor_id = auth.uid()) > 0, 'slots generated from schedule');
select pg_temp.check(not exists (select 1 from public.doctor_availability
  where doctor_id = auth.uid() and (starts_at at time zone 'Europe/Bucharest')::time >= '10:00' and (starts_at at time zone 'Europe/Bucharest')::time < '10:30'
    and extract(isodow from starts_at at time zone 'Europe/Bucharest') = 1), 'no slot inside the Monday break');
select pg_temp.check(not exists (select 1 from public.doctor_availability where doctor_id = auth.uid()
  and extract(isodow from starts_at at time zone 'Europe/Bucharest') in (6, 7)), 'no weekend slots');

-- a patient cannot write the schedule
select pg_temp.act('00000000-0000-0000-0000-0000000000a1');
select pg_temp.check((public.save_doctor_schedule('Europe/Bucharest', 30, 14, '[]')) ->> 'status' = 'forbidden', 'patient cannot save a schedule');
select pg_temp.check((select count(*) from public.doctor_weekly_hours) = 0, 'patient cannot read doctor hours (RLS)');

-- ───────── booking + overlap
create temp table t_slot as select id, starts_at, ends_at from public.doctor_free_slots('00000000-0000-0000-0000-0000000000d1', 14) limit 2;
grant select on t_slot to authenticated;
select pg_temp.check((select count(*) from t_slot) = 2, 'patient sees free slots');
select pg_temp.check((public.request_appointment((select id from t_slot order by starts_at limit 1), 'cardiology', 'Control')) ->> 'status' = 'ok', 'patient books a slot');
select pg_temp.act('00000000-0000-0000-0000-0000000000a2');
select pg_temp.check((public.request_appointment((select id from t_slot order by starts_at limit 1), null, null)) ->> 'status' = 'slot_unavailable', 'second patient cannot book the same slot');
select pg_temp.act(null);
-- Direct insert (bypassing the functions) still fails: PostgreSQL EXCLUDE constraint.
do $$ begin
  insert into public.appointments (patient_id, doctor_id, starts_at, ends_at)
  select '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000d1', starts_at + interval '10 minutes', ends_at
  from t_slot order by starts_at limit 1;
  raise exception 'FAILED: overlapping insert was accepted';
exception when exclusion_violation then raise notice 'ok: EXCLUDE constraint blocks an overlapping appointment';
end $$;

-- ───────── time off
select pg_temp.act('00000000-0000-0000-0000-0000000000d1');
select pg_temp.check((public.add_doctor_time_off('blocked', (select starts_at from t_slot order by starts_at desc limit 1),
  (select ends_at from t_slot order by starts_at desc limit 1), 'Ședință')) ->> 'status' = 'ok', 'doctor blocks an interval');
select pg_temp.act('00000000-0000-0000-0000-0000000000a2');
select pg_temp.check(not exists (select 1 from public.doctor_free_slots('00000000-0000-0000-0000-0000000000d1', 14) f
  where f.id = (select id from t_slot order by starts_at desc limit 1)), 'blocked slot hidden from patients');
select pg_temp.check((public.request_appointment((select id from t_slot order by starts_at desc limit 1), null, null)) ->> 'status' = 'slot_unavailable', 'blocked slot cannot be booked');

-- ───────── confirmed appointments survive a schedule change
select pg_temp.act('00000000-0000-0000-0000-0000000000d1');
select pg_temp.check((public.respond_appointment((select id from public.appointments limit 1), 'accept')) ->> 'status' = 'ok', 'doctor confirms');
select pg_temp.check((public.save_doctor_schedule('Europe/Bucharest', 60, 14, '[{"weekday":6,"kind":"work","start":"09:00","end":"11:00"}]')) ->> 'status' = 'ok', 'doctor changes the schedule');
select pg_temp.check((select count(*) from public.appointments where status = 'confirmed') = 1, 'confirmed appointment kept after the change');
select pg_temp.check(exists (select 1 from public.doctor_availability a join public.appointments p on p.starts_at = a.starts_at where a.doctor_id = auth.uid()), 'booked slot kept after the change');
select pg_temp.check((public.doctor_agenda(now(), now() + interval '14 days')) ->> 'status' = 'ok', 'agenda loads');

-- ───────── preparation + consultation
select pg_temp.act('00000000-0000-0000-0000-0000000000a1');
select pg_temp.check((public.save_appointment_preparation((select id from public.appointments limit 1), 'Control tensiune',
  'Amețeli dimineața', '["Pot face sport?"]', null)) ->> 'status' = 'ok', 'patient saves the preparation');
select pg_temp.act('00000000-0000-0000-0000-0000000000d2');
select pg_temp.check((select count(*) from public.appointment_preparations) = 0, 'another doctor cannot read the preparation');
select pg_temp.check((public.doctor_consultation((select id from public.appointments limit 1))) is null
  or (public.doctor_consultation((select id from public.appointments limit 1))) ->> 'status' = 'not_found', 'another doctor cannot open the consultation');
select pg_temp.act('00000000-0000-0000-0000-0000000000d1');
select pg_temp.check((public.doctor_consultation((select id from public.appointments limit 1))) -> 'preparation' ->> 'reason' = 'Control tensiune', 'appointment doctor sees the preparation');
select pg_temp.check((public.doctor_consultation((select id from public.appointments limit 1))) -> 'grant' is null
  or (public.doctor_consultation((select id from public.appointments limit 1))) -> 'grant' = 'null'::jsonb, 'no record access without a grant');

-- ───────── treatments
create temp table t_plan (id uuid); grant all on t_plan to authenticated;
select pg_temp.check((public.doctor_save_treatment(null, '00000000-0000-0000-0000-0000000000a1', null, 'prescription',
  '{"medication_name":"Exemplu 5 mg","schedule_type":"fixed_times","times_of_day":["08:00"],"start_date":"2026-11-15"}')) ->> 'status' = 'no_access',
  'no prescription without explicit access');
select pg_temp.act('00000000-0000-0000-0000-0000000000a1');
select pg_temp.check((public.grant_doctor_access('00000000-0000-0000-0000-0000000000d1', array['profile'], 24)) ->> 'status' = 'ok', 'patient grants profile access');
select pg_temp.act('00000000-0000-0000-0000-0000000000d1');
select pg_temp.check((public.doctor_save_treatment(null, '00000000-0000-0000-0000-0000000000a1', null, 'prescription',
  '{"medication_name":"Exemplu","schedule_type":"fixed_times","times_of_day":[],"start_date":"2026-11-15"}')) ->> 'status' = 'invalid', 'fixed times need hours');
select pg_temp.check((public.doctor_save_treatment(null, '00000000-0000-0000-0000-0000000000a1', null, 'prescription',
  '{"medication_name":"Exemplu","schedule_type":"as_needed","times_of_day":["08:00"],"start_date":"2026-11-15"}')) ->> 'status' = 'invalid', 'as-needed has no generated hours');
insert into t_plan select (public.doctor_save_treatment(null, '00000000-0000-0000-0000-0000000000a1', null, 'prescription',
  '{"medication_name":"Exemplu","strength":"5 mg","dosage_form":"comprimat","dose_amount":"1","dose_unit":"comprimat","route":"oral",
    "schedule_type":"fixed_times","times_of_day":["20:00","08:00"],"start_date":"2026-11-15","end_date":"2026-12-15"}') ->> 'id')::uuid;
select pg_temp.check((select id from t_plan) is not null, 'doctor creates a prescription');
select pg_temp.check((public.doctor_save_treatment((select id from t_plan), null, null, null,
  '{"medication_name":"Exemplu","dose_amount":"2","dose_unit":"comprimat","schedule_type":"fixed_times","times_of_day":["08:00"],"start_date":"2026-11-15"}',
  'Doză ajustată')) ->> 'version' = '2', 'doctor changes the dose → version 2');
select pg_temp.act('00000000-0000-0000-0000-0000000000d2');
select pg_temp.check((public.doctor_save_treatment((select id from t_plan), null, null, null,
  '{"medication_name":"X","schedule_type":"undocumented","start_date":"2026-11-15"}')) ->> 'status' in ('not_prescriber'), 'another doctor cannot modify it');
select pg_temp.check((select count(*) from public.treatment_plans) = 0, 'another doctor without access cannot read it');
select pg_temp.act('00000000-0000-0000-0000-0000000000a1');
select pg_temp.check((select count(*) from public.treatment_plan_versions where plan_id = (select id from t_plan)) = 2, 'patient sees the full version history');
select pg_temp.check((select array_to_string(times_of_day, ',') from public.treatment_plan_versions where plan_id = (select id from t_plan) and version = 1) = '08:00,20:00', 'times are normalised');
do $$ begin
  update public.treatment_plan_versions set dose_amount = 5;
  if found then raise exception 'FAILED: patient changed a version'; end if;
  raise notice 'ok: patient cannot update versions (no rows / no privilege)';
exception when insufficient_privilege then raise notice 'ok: patient cannot update versions';
end $$;
select pg_temp.act(null);
do $$ begin
  update public.treatment_plan_versions set dose_amount = 5;
  raise exception 'FAILED: owner changed an issued version';
exception when insufficient_privilege then raise notice 'ok: issued versions are immutable even for the owner';
end $$;

-- dose log
select pg_temp.act('00000000-0000-0000-0000-0000000000a1');
insert into public.medication_dose_log (patient_id, plan_id, plan_version, scheduled_for, status)
values (auth.uid(), (select id from t_plan), 2, now() - interval '1 hour', 'taken');
select pg_temp.check((select count(*) from public.medication_dose_log) = 1, 'patient records a dose as taken');
select pg_temp.act('00000000-0000-0000-0000-0000000000a2');
do $$ begin
  insert into public.medication_dose_log (patient_id, plan_id, plan_version, scheduled_for, status)
  values (auth.uid(), (select id from t_plan), 2, now(), 'taken');
  raise exception 'FAILED: another patient logged a dose on a foreign plan';
exception when insufficient_privilege then raise notice 'ok: a patient cannot log doses on another patient''s plan';
end $$;

-- end treatment
select pg_temp.act('00000000-0000-0000-0000-0000000000d1');
select pg_temp.check((public.doctor_end_treatment((select id from t_plan), 'discontinued', 'Reacție adversă raportată')) ->> 'status' = 'ok', 'doctor discontinues the treatment');
select pg_temp.check((public.doctor_save_treatment((select id from t_plan), null, null, null,
  '{"medication_name":"X","schedule_type":"undocumented","start_date":"2026-11-15"}')) ->> 'status' = 'invalid_state', 'ended treatment cannot be edited');
select pg_temp.check((select status from public.treatment_plans where id = (select id from t_plan)) = 'discontinued', 'plan status discontinued');
-- access revoked → doctor can no longer modify
select pg_temp.act('00000000-0000-0000-0000-0000000000a1');
select pg_temp.check(public.revoke_doctor_access((select id from public.doctor_access_grants limit 1)), 'patient revokes access');
select pg_temp.act('00000000-0000-0000-0000-0000000000d1');
select pg_temp.check((public.doctor_save_treatment(null, '00000000-0000-0000-0000-0000000000a1', null, 'instructions',
  '{"medication_name":"Y","schedule_type":"undocumented","start_date":"2026-11-15"}')) ->> 'status' = 'no_access', 'no new treatment after revocation');
select pg_temp.check((select count(*) from public.treatment_plans) = 1, 'prescriber still sees what they issued');
select pg_temp.check((select count(*) from public.clinical_audit_log where action like 'treatment_%') = 3, 'treatment changes are audited');

select pg_temp.act(null);
-- account deletion still cascades (immutability does not block it)
delete from auth.users where id = '00000000-0000-0000-0000-0000000000a1';
delete from public.profiles where id = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.check((select count(*) from public.treatment_plan_versions) = 0, 'deleting the patient removes their versions');
\echo ALL CARE JOURNEY CHECKS PASSED
