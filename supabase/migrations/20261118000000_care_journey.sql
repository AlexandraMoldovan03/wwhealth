-- WWHealth — Care Journey: agenda medicului, program săptămânal, prevenirea suprapunerilor, pregătirea consultației,
-- prescripții / planuri de tratament cu istoric nemodificabil, jurnalul dozelor (pacient) și audit clinic.
--
-- • Suprapuneri: constrângere EXCLUDE (btree_gist) pe programările care ocupă timpul medicului
--   (requested / confirmed la ora lor, proposed la ora propusă). Două cereri simultane pentru același interval:
--   una reușește, cealaltă primește `slot_unavailable` — garantat de PostgreSQL, nu doar de aplicație.
-- • Program: medicul își salvează orele (pe zile, cu pauze), durata consultației și orizontul; intervalele libere
--   din doctor_availability (source = 'schedule') sunt recalculate. Intervalele ocupate și programările NU sunt
--   șterse niciodată la schimbarea programului. Zilele libere / concediile / blocările exclud intervalele la
--   interogare (fără ștergeri).
-- • Pregătirea consultației: ce scrie pacientul (motiv, simptome, întrebări, rezumatul Smart Care ales de el) e
--   trimis DOAR medicului programării. Dosarul (istoric, alergii, tratamente, analize, documente) rămâne protejat
--   de acordul explicit din 20261115000000 (has_doctor_access) — verificat de RLS.
-- • Tratamente: create / modificate / încheiate DOAR prin funcții security definer, de un medic cu rol `doctor`
--   și acces activ la secțiunea `profile` a pacientului. Fiecare schimbare = versiune nouă, imuabilă (cine, când,
--   ce doză). O înregistrare WWHealth NU este o rețetă electronică CNAS.
-- • Dozele marcate de pacient (luat / omis) sunt auto-raportate (MedicationStatement în FHIR), nu administrări
--   clinice.
-- Aditivă: depinde de 20261115000000_doctor_access_consent și 20261117000100_smart_care_appointments.
-- Nu șterge date existente și nu dezactivează RLS.

create extension if not exists btree_gist with schema extensions;

-- ─────────────────────────────────────────────────────────── 1. fără suprapuneri (PostgreSQL)
alter table public.appointments
  add column if not exists blocking_range tstzrange
  generated always as (
    case
      when status = 'proposed' then tstzrange(proposed_starts_at, proposed_ends_at)
      when status in ('requested', 'confirmed') then tstzrange(starts_at, ends_at)
    end
  ) stored;

do $$
begin
  if exists (
    select 1 from public.appointments a
    join public.appointments b on b.doctor_id = a.doctor_id and b.id > a.id and b.blocking_range && a.blocking_range
  ) then
    raise exception 'Există deja programări suprapuse pentru același medic. Rezolvați-le înainte de această migrare.';
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'appointments_no_overlap') then
    alter table public.appointments add constraint appointments_no_overlap
      exclude using gist (doctor_id extensions.gist_uuid_ops with =, blocking_range with &&)
      where (blocking_range is not null);
  end if;
end $$;

alter table public.doctor_availability
  add column if not exists source text not null default 'manual' check (source in ('manual', 'schedule'));

-- Intervalele publicate nu se suprapun (dacă datele existente o permit; altfel rămâne verificarea din funcții).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'doctor_availability_no_overlap') then
    if exists (
      select 1 from public.doctor_availability a
      join public.doctor_availability b on b.doctor_id = a.doctor_id and b.id <> a.id
       and tstzrange(a.starts_at, a.ends_at) && tstzrange(b.starts_at, b.ends_at)
    ) then
      raise notice 'doctor_availability are intervale suprapuse; constrângerea EXCLUDE nu a fost adăugată.';
    else
      alter table public.doctor_availability add constraint doctor_availability_no_overlap
        exclude using gist (doctor_id extensions.gist_uuid_ops with =, tstzrange(starts_at, ends_at) with &&);
    end if;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────── 2. programul medicului
create table if not exists public.doctor_schedule_settings (
  doctor_id     uuid primary key references public.profiles (id) on delete cascade,
  timezone      text not null default 'Europe/Bucharest' check (char_length(timezone) between 1 and 64),
  slot_minutes  integer not null default 30 check (slot_minutes in (15, 20, 30, 45, 60)),
  horizon_days  integer not null default 30 check (horizon_days between 7 and 60),
  synced_on     date,
  updated_at    timestamptz not null default now()
);

create table if not exists public.doctor_weekly_hours (
  id          uuid primary key default gen_random_uuid(),
  doctor_id   uuid not null references public.profiles (id) on delete cascade,
  weekday     smallint not null check (weekday between 1 and 7),  -- ISO: 1 = luni … 7 = duminică
  kind        text not null default 'work' check (kind in ('work', 'break')),
  start_time  time not null,
  end_time    time not null,
  check (end_time > start_time)
);
create index if not exists doctor_weekly_hours_doctor_idx on public.doctor_weekly_hours (doctor_id, weekday);

create table if not exists public.doctor_time_off (
  id          uuid primary key default gen_random_uuid(),
  doctor_id   uuid not null references public.profiles (id) on delete cascade,
  kind        text not null check (kind in ('day_off', 'vacation', 'blocked')),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  note        text check (char_length(note) <= 120),
  created_at  timestamptz not null default now(),
  check (ends_at > starts_at and ends_at <= starts_at + interval '366 days')
);
create index if not exists doctor_time_off_doctor_idx on public.doctor_time_off (doctor_id, starts_at);

-- ─────────────────────────────────────────────────────────── 3. pregătirea consultației (scrisă de pacient)
create table if not exists public.appointment_preparations (
  appointment_id  uuid primary key references public.appointments (id) on delete cascade,
  patient_id      uuid not null references public.profiles (id) on delete cascade,
  reason          text check (char_length(reason) <= 500),
  symptoms        text check (char_length(symptoms) <= 2000),
  questions       jsonb not null default '[]'
                  check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) <= 10),
  care_summary    jsonb check (care_summary is null or (jsonb_typeof(care_summary) = 'object'
                                                       and pg_column_size(care_summary) <= 20000)),
  updated_at      timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────── 4. tratamente / prescripții
create table if not exists public.treatment_plans (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid not null references public.profiles (id) on delete cascade,
  prescriber_id    uuid references public.profiles (id) on delete set null,
  prescriber_name  text not null default '' check (char_length(prescriber_name) <= 120),
  appointment_id   uuid references public.appointments (id) on delete set null,
  -- prescription = prescripție medicală formală emisă în WWHealth (NU rețetă electronică CNAS)
  -- instructions = instrucțiuni de tratament
  kind             text not null check (kind in ('prescription', 'instructions')),
  status           text not null default 'active' check (status in ('active', 'discontinued', 'cancelled')),
  current_version  integer not null default 1 check (current_version >= 1),
  external_ids     jsonb not null default '[]' check (jsonb_typeof(external_ids) = 'array'),
  issued_at        timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (patient_id <> prescriber_id)
);
create index if not exists treatment_plans_patient_idx on public.treatment_plans (patient_id, issued_at desc);
create index if not exists treatment_plans_prescriber_idx on public.treatment_plans (prescriber_id, issued_at desc);

create table if not exists public.treatment_plan_versions (
  id                uuid primary key default gen_random_uuid(),
  plan_id           uuid not null references public.treatment_plans (id) on delete cascade,
  version           integer not null check (version >= 1),
  medication_name   text not null check (char_length(medication_name) between 1 and 120),
  active_substance  text check (char_length(active_substance) <= 120),
  strength          text check (char_length(strength) <= 60),        -- concentrație
  dosage_form       text check (char_length(dosage_form) <= 60),     -- formă farmaceutică
  dose_amount       numeric(10, 3) check (dose_amount > 0),
  dose_unit         text check (char_length(dose_unit) <= 30),
  route             text check (char_length(route) <= 60),           -- cale de administrare
  -- fixed_times: orele documentate de medic · as_needed: la nevoie · undocumented: ore nespecificate
  schedule_type     text not null check (schedule_type in ('fixed_times', 'as_needed', 'undocumented')),
  times_of_day      text[] not null default '{}' check (cardinality(times_of_day) <= 12),
  frequency_text    text check (char_length(frequency_text) <= 120),
  start_date        date not null,
  end_date          date,
  instructions      text check (char_length(instructions) <= 1000),
  status            text not null check (status in ('active', 'discontinued', 'cancelled')),
  change_kind       text not null check (change_kind in ('created', 'updated', 'discontinued', 'cancelled')),
  change_reason     text check (char_length(change_reason) <= 300),
  changed_by        uuid,              -- fără FK: istoricul rămâne neschimbat chiar dacă contul dispare
  changed_by_name   text not null default '' check (char_length(changed_by_name) <= 120),
  changed_at        timestamptz not null default now(),
  unique (plan_id, version),
  check (end_date is null or end_date >= start_date),
  check ((schedule_type = 'fixed_times') = (cardinality(times_of_day) > 0))
);

-- Versiunile emise nu se modifică și nu se șterg (doar odată cu pacientul / planul, la ștergerea contului).
create or replace function public.treatment_versions_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.treatment_plans where id = old.plan_id) then
    return old;  -- ștergere în cascadă (contul pacientului a fost șters)
  end if;
  raise exception 'treatment plan versions are immutable' using errcode = '42501';
end;
$$;

drop trigger if exists treatment_versions_immutable on public.treatment_plan_versions;
create trigger treatment_versions_immutable before update or delete on public.treatment_plan_versions
  for each row execute function public.treatment_versions_immutable();

-- ─────────────────────────────────────────────────────────── 5. dozele marcate de pacient
create table if not exists public.medication_dose_log (
  id             uuid primary key default gen_random_uuid(),
  patient_id     uuid not null references public.profiles (id) on delete cascade,
  plan_id        uuid not null references public.treatment_plans (id) on delete cascade,
  plan_version   integer not null check (plan_version >= 1),
  scheduled_for  timestamptz not null,
  status         text not null check (status in ('taken', 'skipped')),
  recorded_at    timestamptz not null default now(),
  unique (plan_id, scheduled_for)
);
create index if not exists medication_dose_log_patient_idx on public.medication_dose_log (patient_id, scheduled_for desc);

-- ─────────────────────────────────────────────────────────── 6. audit clinic (imutabil)
create table if not exists public.clinical_audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid,
  patient_id  uuid references public.profiles (id) on delete cascade,
  action      text not null check (action in (
                'consultation_viewed', 'preparation_saved', 'treatment_created', 'treatment_updated',
                'treatment_discontinued', 'treatment_cancelled', 'schedule_saved', 'time_off_added',
                'time_off_deleted', 'fhir_exported')),
  entity_id   uuid,
  created_at  timestamptz not null default now()
);
create index if not exists clinical_audit_patient_idx on public.clinical_audit_log (patient_id, created_at desc);
create index if not exists clinical_audit_actor_idx on public.clinical_audit_log (actor_id, created_at desc);

-- ─────────────────────────────────────────────────────────── helpers
-- The helpers below must exist before the policies that use them.
create or replace function public.is_doctor(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = p_user and role = 'doctor');
$$;

-- Un interval e blocat de o zi liberă / concediu / blocare a medicului.
create or replace function public.slot_is_blocked(p_doctor uuid, p_start timestamptz, p_end timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.doctor_time_off t
    where t.doctor_id = p_doctor and tstzrange(t.starts_at, t.ends_at) && tstzrange(p_start, p_end)
  );
$$;

-- ─────────────────────────────────────────────────────────── RLS
alter table public.doctor_schedule_settings enable row level security;
alter table public.doctor_weekly_hours      enable row level security;
alter table public.doctor_time_off          enable row level security;
alter table public.appointment_preparations enable row level security;
alter table public.treatment_plans          enable row level security;
alter table public.treatment_plan_versions  enable row level security;
alter table public.medication_dose_log      enable row level security;
alter table public.clinical_audit_log       enable row level security;

revoke all on public.doctor_schedule_settings, public.doctor_weekly_hours, public.doctor_time_off,
  public.appointment_preparations, public.treatment_plans, public.treatment_plan_versions,
  public.medication_dose_log, public.clinical_audit_log from anon, authenticated;
grant select on public.doctor_schedule_settings, public.doctor_weekly_hours, public.doctor_time_off,
  public.appointment_preparations, public.treatment_plans, public.treatment_plan_versions,
  public.clinical_audit_log to authenticated;
grant select, insert on public.medication_dose_log to authenticated;
grant update (status, recorded_at) on public.medication_dose_log to authenticated;

create policy "schedule: doctor reads own" on public.doctor_schedule_settings for select to authenticated
  using (doctor_id = (select auth.uid()));
create policy "weekly_hours: doctor reads own" on public.doctor_weekly_hours for select to authenticated
  using (doctor_id = (select auth.uid()));
create policy "time_off: doctor reads own" on public.doctor_time_off for select to authenticated
  using (doctor_id = (select auth.uid()));

create policy "preparation: patient reads own" on public.appointment_preparations for select to authenticated
  using (patient_id = (select auth.uid()));
create policy "preparation: appointment doctor reads" on public.appointment_preparations for select to authenticated
  using ((select public.is_doctor((select auth.uid())))
         and exists (select 1 from public.appointments a where a.id = appointment_id and a.doctor_id = (select auth.uid())));

create policy "treatments: patient reads own" on public.treatment_plans for select to authenticated
  using (patient_id = (select auth.uid()));
create policy "treatments: prescriber reads own" on public.treatment_plans for select to authenticated
  using (prescriber_id = (select auth.uid()) and (select public.is_doctor((select auth.uid()))));
create policy "treatments: doctor reads with consent" on public.treatment_plans for select to authenticated
  using ((select public.has_doctor_access(patient_id, 'profile')));
create policy "treatment_versions: readable with the plan" on public.treatment_plan_versions for select to authenticated
  using (exists (select 1 from public.treatment_plans p where p.id = plan_id));

create policy "dose_log: patient reads own" on public.medication_dose_log for select to authenticated
  using (patient_id = (select auth.uid()));
create policy "dose_log: patient adds own" on public.medication_dose_log for insert to authenticated
  with check (
    patient_id = (select auth.uid())
    and exists (select 1 from public.treatment_plans p where p.id = plan_id and p.patient_id = (select auth.uid()))
    and scheduled_for < now() + interval '1 day'
  );
create policy "dose_log: patient corrects own" on public.medication_dose_log for update to authenticated
  using (patient_id = (select auth.uid())) with check (patient_id = (select auth.uid()));
create policy "dose_log: doctor reads with consent" on public.medication_dose_log for select to authenticated
  using ((select public.has_doctor_access(patient_id, 'profile')));

create policy "clinical_audit: patient reads own" on public.clinical_audit_log for select to authenticated
  using (patient_id = (select auth.uid()));
create policy "clinical_audit: actor reads own" on public.clinical_audit_log for select to authenticated
  using (actor_id = (select auth.uid()));

-- Intervalele dorite din programul săptămânal (ora locală a medicului → UTC; schimbarea orei e tratată de Postgres).
create or replace function public.schedule_desired_slots(p_doctor uuid)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with s as (
    select timezone, slot_minutes, horizon_days, (now() at time zone timezone)::date as today
    from public.doctor_schedule_settings where doctor_id = p_doctor
  )
  select ((d.day + w.start_time + make_interval(mins => s.slot_minutes * n)) at time zone s.timezone),
         ((d.day + w.start_time + make_interval(mins => s.slot_minutes * (n + 1))) at time zone s.timezone)
  from s
  cross join lateral generate_series(s.today::timestamp, (s.today + s.horizon_days)::timestamp, interval '1 day') as d(day)
  join public.doctor_weekly_hours w
    on w.doctor_id = p_doctor and w.kind = 'work' and w.weekday = extract(isodow from d.day)
  cross join lateral generate_series(
    0, floor(extract(epoch from (w.end_time - w.start_time)) / 60 / s.slot_minutes)::integer - 1) as n
  where not exists (
    select 1 from public.doctor_weekly_hours b
    where b.doctor_id = p_doctor and b.kind = 'break' and b.weekday = w.weekday
      and b.start_time < w.start_time + make_interval(mins => s.slot_minutes * (n + 1))
      and w.start_time + make_interval(mins => s.slot_minutes * n) < b.end_time
  );
$$;

-- Recalculează intervalele libere generate din program. Nu atinge intervalele ocupate, pe cele adăugate manual
-- sau programările. Rulează cel mult o dată pe zi, dacă nu e forțată (salvarea programului o forțează).
create or replace function public.sync_doctor_availability(p_doctor uuid, p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_set     public.doctor_schedule_settings%rowtype;
  v_today   date;
  v_removed integer := 0;
  v_added   integer := 0;
begin
  select * into v_set from public.doctor_schedule_settings where doctor_id = p_doctor;
  if not found or not public.is_doctor(p_doctor) then
    return jsonb_build_object('status', 'no_schedule');
  end if;
  v_today := (now() at time zone v_set.timezone)::date;
  if not p_force and v_set.synced_on = v_today then
    return jsonb_build_object('status', 'fresh');
  end if;
  perform pg_advisory_xact_lock(hashtext(p_doctor::text));

  delete from public.doctor_availability a
   where a.doctor_id = p_doctor and a.source = 'schedule' and a.starts_at > now()
     and not public.slot_is_taken(p_doctor, a.starts_at, a.ends_at)
     and not exists (select 1 from public.schedule_desired_slots(p_doctor) x
                     where x.starts_at = a.starts_at and x.ends_at = a.ends_at);
  get diagnostics v_removed = row_count;

  insert into public.doctor_availability (doctor_id, starts_at, ends_at, source)
  select p_doctor, x.starts_at, x.ends_at, 'schedule'
  from public.schedule_desired_slots(p_doctor) x
  where x.starts_at > now()
    and not exists (select 1 from public.doctor_availability a
                    where a.doctor_id = p_doctor and tstzrange(a.starts_at, a.ends_at) && tstzrange(x.starts_at, x.ends_at))
  on conflict do nothing;
  get diagnostics v_added = row_count;

  update public.doctor_schedule_settings set synced_on = v_today where doctor_id = p_doctor;
  return jsonb_build_object('status', 'ok', 'added', v_added, 'removed', v_removed);
end;
$$;

-- Apelabile de orice utilizator autentificat: doar extind orizontul din programul medicului (idempotent).
create or replace function public.ensure_doctor_availability(p_doctor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  perform public.sync_doctor_availability(p_doctor, false);
end;
$$;

create or replace function public.ensure_specialty_availability(p_specialty text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  for v_doc in
    select s.doctor_id from public.doctor_schedule_settings s
    join public.doctor_specialties ds on ds.doctor_id = s.doctor_id and ds.specialty_id = p_specialty
    where s.synced_on is distinct from (now() at time zone s.timezone)::date
    limit 30
  loop
    perform public.sync_doctor_availability(v_doc, false);
  end loop;
end;
$$;

-- ─────────────────────────────────────────────────────────── program: salvare (medic)
-- p_hours: [{"weekday":1,"kind":"work","start":"08:00","end":"14:00"}, {"weekday":1,"kind":"break","start":"11:00","end":"11:30"}]
-- status: ok | forbidden | invalid_timezone | invalid_hours | overlapping_hours
create or replace function public.save_doctor_schedule(p_timezone text, p_slot_minutes integer, p_horizon_days integer,
                                                       p_hours jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_item jsonb;
  v_sync jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.is_doctor(v_uid) then
    return jsonb_build_object('status', 'forbidden');
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    return jsonb_build_object('status', 'invalid_timezone');
  end if;
  if p_slot_minutes not in (15, 20, 30, 45, 60) or p_horizon_days not between 7 and 60
     or jsonb_typeof(p_hours) <> 'array' or jsonb_array_length(p_hours) > 70 then
    return jsonb_build_object('status', 'invalid_hours');
  end if;
  for v_item in select * from jsonb_array_elements(p_hours) loop
    if (v_item ->> 'weekday') !~ '^[1-7]$' or coalesce(v_item ->> 'kind', '') not in ('work', 'break')
       or coalesce(v_item ->> 'start', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or coalesce(v_item ->> 'end', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or (v_item ->> 'end')::time <= (v_item ->> 'start')::time then
      return jsonb_build_object('status', 'invalid_hours');
    end if;
  end loop;
  if exists (
    select 1
    from jsonb_array_elements(p_hours) with ordinality a(v, i)
    join jsonb_array_elements(p_hours) with ordinality b(v, j) on j > i
    where a.v ->> 'weekday' = b.v ->> 'weekday' and a.v ->> 'kind' = b.v ->> 'kind'
      and (a.v ->> 'start')::time < (b.v ->> 'end')::time and (b.v ->> 'start')::time < (a.v ->> 'end')::time
  ) then
    return jsonb_build_object('status', 'overlapping_hours');
  end if;

  insert into public.doctor_schedule_settings (doctor_id, timezone, slot_minutes, horizon_days, updated_at)
  values (v_uid, p_timezone, p_slot_minutes, p_horizon_days, now())
  on conflict (doctor_id) do update set timezone = excluded.timezone, slot_minutes = excluded.slot_minutes,
    horizon_days = excluded.horizon_days, updated_at = now();
  delete from public.doctor_weekly_hours where doctor_id = v_uid;
  insert into public.doctor_weekly_hours (doctor_id, weekday, kind, start_time, end_time)
  select v_uid, (v ->> 'weekday')::smallint, v ->> 'kind', (v ->> 'start')::time, (v ->> 'end')::time
  from jsonb_array_elements(p_hours) v;

  v_sync := public.sync_doctor_availability(v_uid, true);
  insert into public.clinical_audit_log (actor_id, action) values (v_uid, 'schedule_saved');
  return jsonb_build_object('status', 'ok', 'added', coalesce((v_sync ->> 'added')::integer, 0),
                            'removed', coalesce((v_sync ->> 'removed')::integer, 0));
end;
$$;

-- Zi liberă / concediu / interval blocat. Programările existente NU sunt anulate: sunt raportate ca `conflicts`.
-- status: ok | forbidden | invalid_range
create or replace function public.add_doctor_time_off(p_kind text, p_starts_at timestamptz, p_ends_at timestamptz,
                                                      p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.is_doctor(v_uid) then
    return jsonb_build_object('status', 'forbidden');
  end if;
  if p_kind not in ('day_off', 'vacation', 'blocked') or p_starts_at is null or p_ends_at is null
     or p_ends_at <= p_starts_at or p_ends_at > p_starts_at + interval '366 days'
     or p_ends_at <= now() then
    return jsonb_build_object('status', 'invalid_range');
  end if;
  insert into public.doctor_time_off (doctor_id, kind, starts_at, ends_at, note)
  values (v_uid, p_kind, p_starts_at, p_ends_at, nullif(left(trim(coalesce(p_note, '')), 120), ''))
  returning id into v_id;
  insert into public.clinical_audit_log (actor_id, action, entity_id) values (v_uid, 'time_off_added', v_id);
  return jsonb_build_object('status', 'ok', 'id', v_id, 'conflicts', (
    select count(*) from public.appointments a
    where a.doctor_id = v_uid and a.status in ('requested', 'confirmed', 'proposed')
      and a.blocking_range && tstzrange(p_starts_at, p_ends_at)));
end;
$$;

create or replace function public.delete_doctor_time_off(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  delete from public.doctor_time_off where id = p_id and doctor_id = v_uid;
  if not found then
    return false;
  end if;
  insert into public.clinical_audit_log (actor_id, action, entity_id) values (v_uid, 'time_off_deleted', p_id);
  return true;
end;
$$;

-- ─────────────────────────────────────────────────────────── disponibilitate (redefinite: + zile libere)
create or replace function public.specialty_doctors(p_specialty text)
returns table (id uuid, full_name text, doctor_code text, next_slot timestamptz, free_slots integer)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name, p.doctor_code,
         min(s.starts_at) as next_slot,
         count(s.id)::integer as free_slots
  from public.doctor_specialties ds
  join public.profiles p on p.id = ds.doctor_id and p.role = 'doctor'
  left join public.doctor_availability s
         on s.doctor_id = p.id
        and s.starts_at > now()
        and s.starts_at < now() + interval '14 days'
        and not public.slot_is_taken(p.id, s.starts_at, s.ends_at)
        and not public.slot_is_blocked(p.id, s.starts_at, s.ends_at)
  where (select auth.uid()) is not null
    and ds.specialty_id = p_specialty
    and p.id <> (select auth.uid())
  group by p.id, p.full_name, p.doctor_code
  order by (count(s.id) = 0), min(s.starts_at) nulls last, p.full_name
  limit 30;
$$;

create or replace function public.doctor_free_slots(p_doctor uuid, p_days integer default 14)
returns table (id uuid, starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.starts_at, s.ends_at
  from public.doctor_availability s
  join public.profiles p on p.id = s.doctor_id and p.role = 'doctor'
  where (select auth.uid()) is not null
    and s.doctor_id = p_doctor
    and s.starts_at > now()
    and s.starts_at < now() + make_interval(days => least(greatest(coalesce(p_days, 14), 1), 60))
    and not public.slot_is_taken(s.doctor_id, s.starts_at, s.ends_at)
    and not public.slot_is_blocked(s.doctor_id, s.starts_at, s.ends_at)
  order by s.starts_at
  limit 200;
$$;

-- ─────────────────────────────────────────────────────────── programări (redefinite: zile libere + EXCLUDE)
create or replace function public.request_appointment(p_slot_id uuid, p_specialty text default null, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_slot public.doctor_availability%rowtype;
  v_id   uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and role = 'patient') then
    return jsonb_build_object('status', 'not_patient');
  end if;
  select * into v_slot from public.doctor_availability where id = p_slot_id;
  if not found or v_slot.doctor_id = v_uid or not public.is_doctor(v_slot.doctor_id) then
    return jsonb_build_object('status', 'doctor_not_found');
  end if;
  perform pg_advisory_xact_lock(hashtext(v_slot.doctor_id::text));
  if v_slot.starts_at <= now() or public.slot_is_taken(v_slot.doctor_id, v_slot.starts_at, v_slot.ends_at)
     or public.slot_is_blocked(v_slot.doctor_id, v_slot.starts_at, v_slot.ends_at) then
    return jsonb_build_object('status', 'slot_unavailable');
  end if;
  if p_specialty is not null and not exists (select 1 from public.medical_specialties where id = p_specialty) then
    p_specialty := null;
  end if;
  begin
    insert into public.appointments (patient_id, doctor_id, specialty_id, starts_at, ends_at, patient_note)
    values (v_uid, v_slot.doctor_id, p_specialty, v_slot.starts_at, v_slot.ends_at,
            nullif(left(trim(coalesce(p_note, '')), 500), ''))
    returning id into v_id;
  exception when exclusion_violation then
    return jsonb_build_object('status', 'slot_unavailable');
  end;
  return jsonb_build_object('status', 'ok', 'id', v_id);
end;
$$;

create or replace function public.respond_appointment(p_id uuid, p_action text, p_slot_id uuid default null, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_appt public.appointments%rowtype;
  v_slot public.doctor_availability%rowtype;
  v_note text := nullif(left(trim(coalesce(p_note, '')), 300), '');
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select * into v_appt from public.appointments where id = p_id and doctor_id = v_uid for update;
  if not found or not public.is_doctor(v_uid) then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_appt.status <> 'requested' then
    return jsonb_build_object('status', 'invalid_state');
  end if;
  if p_action = 'accept' then
    if v_appt.starts_at <= now() then
      return jsonb_build_object('status', 'slot_unavailable');
    end if;
    update public.appointments set status = 'confirmed', doctor_note = v_note, updated_at = now() where id = p_id;
  elsif p_action = 'reject' then
    update public.appointments set status = 'rejected', doctor_note = v_note, updated_at = now() where id = p_id;
  elsif p_action = 'propose' then
    perform pg_advisory_xact_lock(hashtext(v_uid::text));
    select * into v_slot from public.doctor_availability where id = p_slot_id and doctor_id = v_uid;
    if not found or v_slot.starts_at <= now() or public.slot_is_taken(v_uid, v_slot.starts_at, v_slot.ends_at, p_id)
       or public.slot_is_blocked(v_uid, v_slot.starts_at, v_slot.ends_at) then
      return jsonb_build_object('status', 'slot_unavailable');
    end if;
    begin
      update public.appointments set status = 'proposed', proposed_starts_at = v_slot.starts_at,
        proposed_ends_at = v_slot.ends_at, doctor_note = v_note, updated_at = now() where id = p_id;
    exception when exclusion_violation then
      return jsonb_build_object('status', 'slot_unavailable');
    end;
  else
    return jsonb_build_object('status', 'invalid_state');
  end if;
  return jsonb_build_object('status', 'ok');
end;
$$;

create or replace function public.patient_update_appointment(p_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_appt public.appointments%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select * into v_appt from public.appointments where id = p_id and patient_id = v_uid for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if p_action = 'accept_proposal' then
    if v_appt.status <> 'proposed' then
      return jsonb_build_object('status', 'invalid_state');
    end if;
    if v_appt.proposed_starts_at <= now() then
      return jsonb_build_object('status', 'slot_unavailable');
    end if;
    begin
      update public.appointments set status = 'confirmed', starts_at = v_appt.proposed_starts_at,
        ends_at = v_appt.proposed_ends_at, proposed_starts_at = null, proposed_ends_at = null, updated_at = now()
        where id = p_id;
    exception when exclusion_violation then
      return jsonb_build_object('status', 'slot_unavailable');
    end;
  elsif p_action in ('decline_proposal', 'cancel') then
    if (p_action = 'decline_proposal' and v_appt.status <> 'proposed')
       or v_appt.status not in ('requested', 'proposed', 'confirmed') then
      return jsonb_build_object('status', 'invalid_state');
    end if;
    update public.appointments set status = 'cancelled', proposed_starts_at = null, proposed_ends_at = null,
      updated_at = now() where id = p_id;
  else
    return jsonb_build_object('status', 'invalid_state');
  end if;
  return jsonb_build_object('status', 'ok');
end;
$$;

-- ─────────────────────────────────────────────────────────── agenda (medic)
create or replace function public.doctor_agenda(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.is_doctor(v_uid) then
    return jsonb_build_object('status', 'forbidden');
  end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to > p_from + interval '62 days' then
    return jsonb_build_object('status', 'invalid_range');
  end if;
  return jsonb_build_object(
    'status', 'ok',
    'appointments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'patient_id', a.patient_id, 'patient_name', p.full_name, 'specialty_id', a.specialty_id,
        'starts_at', a.starts_at, 'ends_at', a.ends_at, 'status', a.status,
        'proposed_starts_at', a.proposed_starts_at, 'proposed_ends_at', a.proposed_ends_at,
        'patient_note', a.patient_note, 'doctor_note', a.doctor_note,
        'created_at', a.created_at, 'updated_at', a.updated_at,
        'prepared', exists (select 1 from public.appointment_preparations x where x.appointment_id = a.id)
      ) order by coalesce(a.proposed_starts_at, a.starts_at))
      from public.appointments a join public.profiles p on p.id = a.patient_id
      where a.doctor_id = v_uid
        and (tstzrange(a.starts_at, a.ends_at) && tstzrange(p_from, p_to)
             or (a.proposed_starts_at is not null and tstzrange(a.proposed_starts_at, a.proposed_ends_at) && tstzrange(p_from, p_to)))
    ), '[]'::jsonb),
    'slots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'source', s.source,
        'booked', public.slot_is_taken(v_uid, s.starts_at, s.ends_at),
        'blocked', public.slot_is_blocked(v_uid, s.starts_at, s.ends_at)
      ) order by s.starts_at)
      from public.doctor_availability s
      where s.doctor_id = v_uid and s.starts_at >= p_from and s.starts_at < p_to
    ), '[]'::jsonb),
    'time_off', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'kind', t.kind, 'starts_at', t.starts_at,
                                          'ends_at', t.ends_at, 'note', t.note) order by t.starts_at)
      from public.doctor_time_off t
      where t.doctor_id = v_uid and tstzrange(t.starts_at, t.ends_at) && tstzrange(p_from, p_to)
    ), '[]'::jsonb)
  );
end;
$$;

-- ─────────────────────────────────────────────────────────── pregătirea consultației (pacient)
-- status: ok | not_found | invalid_state
create or replace function public.save_appointment_preparation(p_id uuid, p_reason text, p_symptoms text,
                                                               p_questions jsonb, p_care_summary jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_appt public.appointments%rowtype;
  v_questions jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select * into v_appt from public.appointments where id = p_id and patient_id = v_uid;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_appt.status not in ('requested', 'proposed', 'confirmed') then
    return jsonb_build_object('status', 'invalid_state');
  end if;
  select coalesce(jsonb_agg(left(trim(q), 300)), '[]'::jsonb) into v_questions
  from (select jsonb_array_elements_text(case when jsonb_typeof(p_questions) = 'array' then p_questions else '[]' end) q
        limit 10) x
  where trim(q) <> '';
  insert into public.appointment_preparations (appointment_id, patient_id, reason, symptoms, questions, care_summary, updated_at)
  values (p_id, v_uid, nullif(left(trim(coalesce(p_reason, '')), 500), ''),
          nullif(left(trim(coalesce(p_symptoms, '')), 2000), ''), v_questions,
          case when jsonb_typeof(p_care_summary) = 'object' then p_care_summary end, now())
  on conflict (appointment_id) do update set reason = excluded.reason, symptoms = excluded.symptoms,
    questions = excluded.questions, care_summary = excluded.care_summary, updated_at = now();
  insert into public.clinical_audit_log (actor_id, patient_id, action, entity_id)
  values (v_uid, v_uid, 'preparation_saved', p_id);
  return jsonb_build_object('status', 'ok');
end;
$$;

-- ─────────────────────────────────────────────────────────── fișa consultației (medic)
-- Programarea + pregătirea pacientului + starea acordului. Dosarul îl citește backend-ul separat, prin RLS
-- (doar cu acord activ). status: ok | not_found
create or replace function public.doctor_consultation(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_appt  public.appointments%rowtype;
  v_grant public.doctor_access_grants%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select * into v_appt from public.appointments where id = p_id and doctor_id = v_uid;
  if not found or not public.is_doctor(v_uid) then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into v_grant from public.doctor_access_grants
   where doctor_id = v_uid and patient_id = v_appt.patient_id order by created_at desc limit 1;
  insert into public.clinical_audit_log (actor_id, patient_id, action, entity_id)
  values (v_uid, v_appt.patient_id, 'consultation_viewed', p_id);
  return jsonb_build_object(
    'status', 'ok',
    'appointment', jsonb_build_object(
      'id', v_appt.id, 'patient_id', v_appt.patient_id, 'doctor_id', v_appt.doctor_id,
      'patient_name', (select full_name from public.profiles where id = v_appt.patient_id),
      'specialty_id', v_appt.specialty_id, 'starts_at', v_appt.starts_at, 'ends_at', v_appt.ends_at,
      'status', v_appt.status, 'proposed_starts_at', v_appt.proposed_starts_at,
      'proposed_ends_at', v_appt.proposed_ends_at, 'patient_note', v_appt.patient_note,
      'doctor_note', v_appt.doctor_note, 'created_at', v_appt.created_at, 'updated_at', v_appt.updated_at),
    'preparation', (select jsonb_build_object('reason', x.reason, 'symptoms', x.symptoms, 'questions', x.questions,
                                              'care_summary', x.care_summary, 'updated_at', x.updated_at)
                    from public.appointment_preparations x where x.appointment_id = p_id),
    'grant', case when v_grant.id is null then null else jsonb_build_object(
      'scopes', to_jsonb(v_grant.scopes), 'expires_at', v_grant.expires_at,
      'status', case when v_grant.revoked_at is not null then 'revoked'
                     when v_grant.expires_at <= now() then 'expired' else 'active' end) end
  );
end;
$$;

-- ─────────────────────────────────────────────────────────── tratamente (medic)
-- p_data: {"medication_name","active_substance","strength","dosage_form","dose_amount","dose_unit","route",
--          "schedule_type","times_of_day":["08:00"],"frequency_text","start_date","end_date","instructions"}
-- status: ok | forbidden (nu e medic) | no_access (fără acord activ cu „profile”) | not_found | not_prescriber |
--         invalid_state (plan încheiat) | invalid (date invalide: field)
create or replace function public.doctor_save_treatment(p_plan_id uuid, p_patient_id uuid, p_appointment_id uuid,
                                                        p_kind text, p_data jsonb, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_name    text;
  v_plan    public.treatment_plans%rowtype;
  v_times   text[];
  v_type    text := p_data ->> 'schedule_type';
  v_start   date;
  v_end     date;
  v_amount  numeric;
  v_version integer;
  v_t       text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.is_doctor(v_uid) then
    return jsonb_build_object('status', 'forbidden');
  end if;
  select full_name into v_name from public.profiles where id = v_uid;

  if p_plan_id is not null then
    select * into v_plan from public.treatment_plans where id = p_plan_id for update;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_plan.prescriber_id is distinct from v_uid then
      return jsonb_build_object('status', 'not_prescriber');
    end if;
    if v_plan.status <> 'active' then
      return jsonb_build_object('status', 'invalid_state');
    end if;
    p_patient_id := v_plan.patient_id;
  elsif p_kind not in ('prescription', 'instructions') then
    return jsonb_build_object('status', 'invalid', 'field', 'kind');
  end if;
  if p_patient_id is null or p_patient_id = v_uid or not public.has_doctor_access(p_patient_id, 'profile') then
    return jsonb_build_object('status', 'no_access');
  end if;

  -- validare
  if coalesce(trim(p_data ->> 'medication_name'), '') = '' or char_length(p_data ->> 'medication_name') > 120 then
    return jsonb_build_object('status', 'invalid', 'field', 'medication_name');
  end if;
  if v_type not in ('fixed_times', 'as_needed', 'undocumented') then
    return jsonb_build_object('status', 'invalid', 'field', 'schedule_type');
  end if;
  select coalesce(array_agg(distinct t order by t), '{}') into v_times
  from jsonb_array_elements_text(case when jsonb_typeof(p_data -> 'times_of_day') = 'array'
                                      then p_data -> 'times_of_day' else '[]' end) t;
  foreach v_t in array v_times loop
    if v_t !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      return jsonb_build_object('status', 'invalid', 'field', 'times_of_day');
    end if;
  end loop;
  if (v_type = 'fixed_times') <> (cardinality(v_times) > 0) or cardinality(v_times) > 12 then
    return jsonb_build_object('status', 'invalid', 'field', 'times_of_day');
  end if;
  begin
    v_start := (p_data ->> 'start_date')::date;
    v_end := nullif(p_data ->> 'end_date', '')::date;
    v_amount := nullif(p_data ->> 'dose_amount', '')::numeric;
  exception when others then
    return jsonb_build_object('status', 'invalid', 'field', 'dates_or_dose');
  end;
  if v_start is null or (v_end is not null and v_end < v_start) then
    return jsonb_build_object('status', 'invalid', 'field', 'dates');
  end if;
  if v_amount is not null and (v_amount <= 0 or v_amount >= 10000000) then
    return jsonb_build_object('status', 'invalid', 'field', 'dose_amount');
  end if;

  if p_plan_id is null then
    if p_appointment_id is not null and not exists (
      select 1 from public.appointments where id = p_appointment_id and doctor_id = v_uid and patient_id = p_patient_id) then
      p_appointment_id := null;
    end if;
    insert into public.treatment_plans (patient_id, prescriber_id, prescriber_name, appointment_id, kind)
    values (p_patient_id, v_uid, coalesce(v_name, ''), p_appointment_id, p_kind)
    returning * into v_plan;
    v_version := 1;
  else
    v_version := v_plan.current_version + 1;
    update public.treatment_plans set current_version = v_version, updated_at = now() where id = v_plan.id;
  end if;

  insert into public.treatment_plan_versions (
    plan_id, version, medication_name, active_substance, strength, dosage_form, dose_amount, dose_unit, route,
    schedule_type, times_of_day, frequency_text, start_date, end_date, instructions, status, change_kind,
    change_reason, changed_by, changed_by_name)
  values (
    v_plan.id, v_version, trim(p_data ->> 'medication_name'),
    nullif(left(trim(coalesce(p_data ->> 'active_substance', '')), 120), ''),
    nullif(left(trim(coalesce(p_data ->> 'strength', '')), 60), ''),
    nullif(left(trim(coalesce(p_data ->> 'dosage_form', '')), 60), ''),
    v_amount,
    nullif(left(trim(coalesce(p_data ->> 'dose_unit', '')), 30), ''),
    nullif(left(trim(coalesce(p_data ->> 'route', '')), 60), ''),
    v_type, v_times,
    nullif(left(trim(coalesce(p_data ->> 'frequency_text', '')), 120), ''),
    v_start, v_end,
    nullif(left(trim(coalesce(p_data ->> 'instructions', '')), 1000), ''),
    'active', case when v_version = 1 then 'created' else 'updated' end,
    nullif(left(trim(coalesce(p_reason, '')), 300), ''), v_uid, coalesce(v_name, ''));

  insert into public.clinical_audit_log (actor_id, patient_id, action, entity_id)
  values (v_uid, p_patient_id, case when v_version = 1 then 'treatment_created' else 'treatment_updated' end, v_plan.id);
  return jsonb_build_object('status', 'ok', 'id', v_plan.id, 'version', v_version);
end;
$$;

-- p_status: discontinued (oprit) | cancelled (anulat, emis din greșeală). Versiune nouă, aceleași date clinice.
create or replace function public.doctor_end_treatment(p_plan_id uuid, p_status text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_plan public.treatment_plans%rowtype;
  v_name text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.is_doctor(v_uid) then
    return jsonb_build_object('status', 'forbidden');
  end if;
  if p_status not in ('discontinued', 'cancelled') then
    return jsonb_build_object('status', 'invalid', 'field', 'status');
  end if;
  select * into v_plan from public.treatment_plans where id = p_plan_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_plan.prescriber_id is distinct from v_uid then
    return jsonb_build_object('status', 'not_prescriber');
  end if;
  if not public.has_doctor_access(v_plan.patient_id, 'profile') then
    return jsonb_build_object('status', 'no_access');
  end if;
  if v_plan.status <> 'active' then
    return jsonb_build_object('status', 'invalid_state');
  end if;
  select full_name into v_name from public.profiles where id = v_uid;
  insert into public.treatment_plan_versions (
    plan_id, version, medication_name, active_substance, strength, dosage_form, dose_amount, dose_unit, route,
    schedule_type, times_of_day, frequency_text, start_date, end_date, instructions, status, change_kind,
    change_reason, changed_by, changed_by_name)
  select plan_id, version + 1, medication_name, active_substance, strength, dosage_form, dose_amount, dose_unit, route,
         schedule_type, times_of_day, frequency_text, start_date, end_date, instructions, p_status, p_status,
         nullif(left(trim(coalesce(p_reason, '')), 300), ''), v_uid, coalesce(v_name, '')
  from public.treatment_plan_versions where plan_id = p_plan_id and version = v_plan.current_version;
  update public.treatment_plans set status = p_status, current_version = v_plan.current_version + 1, updated_at = now()
   where id = p_plan_id;
  insert into public.clinical_audit_log (actor_id, patient_id, action, entity_id)
  values (v_uid, v_plan.patient_id, case when p_status = 'discontinued' then 'treatment_discontinued'
                                         else 'treatment_cancelled' end, p_plan_id);
  return jsonb_build_object('status', 'ok', 'version', v_plan.current_version + 1);
end;
$$;

-- Exportul FHIR e jurnalizat (cine a exportat dosarul cui).
create or replace function public.log_fhir_export(p_patient uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_patient = auth.uid() or public.has_doctor_access(p_patient, 'profile') then
    insert into public.clinical_audit_log (actor_id, patient_id, action) values (auth.uid(), p_patient, 'fhir_exported');
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────── permisiuni pe funcții
revoke all on function public.is_doctor(uuid) from public, anon;
grant execute on function public.is_doctor(uuid) to authenticated;  -- used by RLS policies (role check only)
revoke all on function public.slot_is_blocked(uuid, timestamptz, timestamptz),
  public.schedule_desired_slots(uuid), public.sync_doctor_availability(uuid, boolean),
  public.treatment_versions_immutable() from public, anon, authenticated;
revoke all on function public.ensure_doctor_availability(uuid), public.ensure_specialty_availability(text),
  public.save_doctor_schedule(text, integer, integer, jsonb),
  public.add_doctor_time_off(text, timestamptz, timestamptz, text), public.delete_doctor_time_off(uuid),
  public.doctor_agenda(timestamptz, timestamptz), public.save_appointment_preparation(uuid, text, text, jsonb, jsonb),
  public.doctor_consultation(uuid), public.doctor_save_treatment(uuid, uuid, uuid, text, jsonb, text),
  public.doctor_end_treatment(uuid, text, text), public.log_fhir_export(uuid) from public, anon;
grant execute on function public.ensure_doctor_availability(uuid), public.ensure_specialty_availability(text),
  public.save_doctor_schedule(text, integer, integer, jsonb),
  public.add_doctor_time_off(text, timestamptz, timestamptz, text), public.delete_doctor_time_off(uuid),
  public.doctor_agenda(timestamptz, timestamptz), public.save_appointment_preparation(uuid, text, text, jsonb, jsonb),
  public.doctor_consultation(uuid), public.doctor_save_treatment(uuid, uuid, uuid, text, jsonb, text),
  public.doctor_end_treatment(uuid, text, text), public.log_fhir_export(uuid) to authenticated;
-- Funcțiile redefinite păstrează permisiunile din 20261117000100 (create or replace nu le schimbă).
