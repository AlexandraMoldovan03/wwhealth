-- WWHealth — Smart Care: catalog de specialități, specialitățile medicilor, calendar de disponibilitate, programări.
--
-- • Catalogul de specialități e controlat de backend (backend/app/services/specialty_catalog.py are aceleași id-uri).
-- • Specialitățile unui medic le atribuie DOAR un administrator (ca rolul `doctor`): fără permisiuni de scriere
--   pentru utilizatori. Exemplu (SQL Editor):
--     insert into public.doctor_specialties (doctor_id, specialty_id) values ('<uuid medic>', 'cardiology');
-- • Medicul își publică singur intervalele libere (doctor_availability), doar pentru contul propriu cu rol `doctor`.
-- • Programările se creează / modifică DOAR prin funcții `security definer` care verifică rolul, proprietarul și
--   starea (requested → confirmed | rejected | proposed → confirmed | cancelled). Fără scriere directă în tabel.
-- • Pacientul vede doar programările proprii; medicul doar pe cele adresate lui. Nu se copiază date medicale:
--   nota pacientului (opțională, max 500 caractere) e trimisă medicului doar dacă pacientul o completează.
-- Aditivă: nu modifică tabelele / politicile existente.

-- ─────────────────────────────────────────────────────────── catalog
create table if not exists public.medical_specialties (
  id       text primary key check (id ~ '^[a-z_]{2,40}$'),
  name_ro  text not null,
  name_en  text not null,
  sort     integer not null default 0
);

insert into public.medical_specialties (id, name_ro, name_en, sort) values
  ('family_medicine', 'Medicină de familie', 'Family medicine', 1),
  ('internal_medicine', 'Medicină internă', 'Internal medicine', 2),
  ('cardiology', 'Cardiologie', 'Cardiology', 3),
  ('pulmonology', 'Pneumologie', 'Pulmonology', 4),
  ('gastroenterology', 'Gastroenterologie', 'Gastroenterology', 5),
  ('neurology', 'Neurologie', 'Neurology', 6),
  ('dermatology', 'Dermatologie', 'Dermatology', 7),
  ('ent', 'ORL', 'ENT (ear, nose, throat)', 8),
  ('ophthalmology', 'Oftalmologie', 'Ophthalmology', 9),
  ('endocrinology', 'Endocrinologie', 'Endocrinology', 10),
  ('nephrology', 'Nefrologie', 'Nephrology', 11),
  ('urology', 'Urologie', 'Urology', 12),
  ('gynecology', 'Obstetrică-ginecologie', 'Obstetrics & gynecology', 13),
  ('orthopedics', 'Ortopedie', 'Orthopedics', 14),
  ('rheumatology', 'Reumatologie', 'Rheumatology', 15),
  ('allergology', 'Alergologie și imunologie', 'Allergy & immunology', 16),
  ('psychiatry', 'Psihiatrie', 'Psychiatry', 17),
  ('pediatrics', 'Pediatrie', 'Pediatrics', 18),
  ('infectious_diseases', 'Boli infecțioase', 'Infectious diseases', 19),
  ('hematology', 'Hematologie', 'Hematology', 20),
  ('oncology', 'Oncologie', 'Oncology', 21),
  ('general_surgery', 'Chirurgie generală', 'General surgery', 22),
  ('emergency_medicine', 'Medicină de urgență', 'Emergency medicine', 23)
on conflict (id) do update set name_ro = excluded.name_ro, name_en = excluded.name_en, sort = excluded.sort;

-- ─────────────────────────────────────────────────────────── specialitățile medicilor (admin)
create table if not exists public.doctor_specialties (
  doctor_id     uuid not null references public.profiles (id) on delete cascade,
  specialty_id  text not null references public.medical_specialties (id) on delete cascade,
  primary key (doctor_id, specialty_id)
);

-- ─────────────────────────────────────────────────────────── calendar (intervale publicate de medic)
create table if not exists public.doctor_availability (
  id          uuid primary key default gen_random_uuid(),
  doctor_id   uuid not null references public.profiles (id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  created_at  timestamptz not null default now(),
  check (ends_at > starts_at and ends_at <= starts_at + interval '4 hours'),
  unique (doctor_id, starts_at)
);
create index if not exists doctor_availability_doctor_idx on public.doctor_availability (doctor_id, starts_at);

-- ─────────────────────────────────────────────────────────── programări
create table if not exists public.appointments (
  id                  uuid primary key default gen_random_uuid(),
  patient_id          uuid not null references public.profiles (id) on delete cascade,
  doctor_id           uuid not null references public.profiles (id) on delete cascade,
  specialty_id        text references public.medical_specialties (id),
  starts_at           timestamptz not null,
  ends_at             timestamptz not null,
  status              text not null default 'requested'
                      check (status in ('requested', 'confirmed', 'rejected', 'proposed', 'cancelled')),
  proposed_starts_at  timestamptz,
  proposed_ends_at    timestamptz,
  patient_note        text check (char_length(patient_note) <= 500),
  doctor_note         text check (char_length(doctor_note) <= 300),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (patient_id <> doctor_id),
  check (ends_at > starts_at),
  check ((status = 'proposed') = (proposed_starts_at is not null and proposed_ends_at is not null))
);
create index if not exists appointments_patient_idx on public.appointments (patient_id, starts_at desc);
create index if not exists appointments_doctor_idx on public.appointments (doctor_id, starts_at);

alter table public.medical_specialties enable row level security;
alter table public.doctor_specialties  enable row level security;
alter table public.doctor_availability enable row level security;
alter table public.appointments        enable row level security;

revoke all on public.medical_specialties, public.doctor_specialties, public.doctor_availability, public.appointments
  from anon, authenticated;
grant select on public.medical_specialties, public.doctor_specialties, public.appointments to authenticated;
grant select, insert, delete on public.doctor_availability to authenticated;

create policy "specialties: read" on public.medical_specialties for select to authenticated using (true);
create policy "doctor_specialties: read" on public.doctor_specialties for select to authenticated using (true);
create policy "appointments: participants read" on public.appointments for select to authenticated
  using (patient_id = (select auth.uid()) or doctor_id = (select auth.uid()));

-- Medicul își gestionează doar propriile intervale (și doar cât are rolul `doctor`); pacienții le văd prin funcții.
create policy "availability: doctor reads own" on public.doctor_availability for select to authenticated
  using (doctor_id = (select auth.uid()));
create policy "availability: doctor adds own" on public.doctor_availability for insert to authenticated
  with check (
    doctor_id = (select auth.uid())
    and exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'doctor')
    and starts_at > now()
    and starts_at < now() + interval '90 days'
  );
create policy "availability: doctor deletes own" on public.doctor_availability for delete to authenticated
  using (doctor_id = (select auth.uid()));

-- ─────────────────────────────────────────────────────────── ocupare
-- Un interval e ocupat de o programare cerută / confirmată (ora ei) sau propusă (ora propusă).
create or replace function public.slot_is_taken(p_doctor uuid, p_start timestamptz, p_end timestamptz, p_ignore uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.appointments a
    where a.doctor_id = p_doctor
      and (p_ignore is null or a.id <> p_ignore)
      and (
        (a.status in ('requested', 'confirmed') and tstzrange(a.starts_at, a.ends_at) && tstzrange(p_start, p_end))
        or (a.status = 'proposed' and tstzrange(a.proposed_starts_at, a.proposed_ends_at) && tstzrange(p_start, p_end))
      )
  );
$$;

-- ─────────────────────────────────────────────────────────── medici dintr-o specialitate (pacient)
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
  where (select auth.uid()) is not null
    and ds.specialty_id = p_specialty
    and p.id <> (select auth.uid())
  group by p.id, p.full_name, p.doctor_code
  order by (count(s.id) = 0), min(s.starts_at) nulls last, p.full_name
  limit 30;
$$;

-- ─────────────────────────────────────────────────────────── intervale libere ale unui medic
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
  order by s.starts_at
  limit 200;
$$;

-- ─────────────────────────────────────────────────────────── cerere de programare (pacient)
-- status: ok | doctor_not_found | slot_unavailable | not_patient
create or replace function public.request_appointment(p_slot_id uuid, p_specialty text default null, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_slot public.doctor_availability%rowtype;
  v_appt public.appointments%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and role = 'patient') then
    return jsonb_build_object('status', 'not_patient');
  end if;
  select * into v_slot from public.doctor_availability where id = p_slot_id;
  if not found or v_slot.doctor_id = v_uid
     or not exists (select 1 from public.profiles where id = v_slot.doctor_id and role = 'doctor') then
    return jsonb_build_object('status', 'doctor_not_found');
  end if;
  perform pg_advisory_xact_lock(hashtext(v_slot.doctor_id::text));
  if v_slot.starts_at <= now() or public.slot_is_taken(v_slot.doctor_id, v_slot.starts_at, v_slot.ends_at) then
    return jsonb_build_object('status', 'slot_unavailable');
  end if;
  if p_specialty is not null and not exists (select 1 from public.medical_specialties where id = p_specialty) then
    p_specialty := null;
  end if;
  insert into public.appointments (patient_id, doctor_id, specialty_id, starts_at, ends_at, patient_note)
  values (v_uid, v_slot.doctor_id, p_specialty, v_slot.starts_at, v_slot.ends_at, nullif(left(trim(coalesce(p_note, '')), 500), ''))
  returning * into v_appt;
  return jsonb_build_object('status', 'ok', 'id', v_appt.id);
end;
$$;

-- ─────────────────────────────────────────────────────────── răspunsul medicului
-- p_action: accept | reject | propose (cu unul dintre intervalele lui libere). status: ok | not_found | invalid_state | slot_unavailable
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
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select * into v_appt from public.appointments where id = p_id and doctor_id = v_uid for update;
  if not found or not exists (select 1 from public.profiles where id = v_uid and role = 'doctor') then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_appt.status <> 'requested' then
    return jsonb_build_object('status', 'invalid_state');
  end if;
  if p_action = 'accept' then
    update public.appointments set status = 'confirmed', doctor_note = nullif(left(trim(coalesce(p_note, '')), 300), ''),
      updated_at = now() where id = p_id;
  elsif p_action = 'reject' then
    update public.appointments set status = 'rejected', doctor_note = nullif(left(trim(coalesce(p_note, '')), 300), ''),
      updated_at = now() where id = p_id;
  elsif p_action = 'propose' then
    perform pg_advisory_xact_lock(hashtext(v_uid::text));
    select * into v_slot from public.doctor_availability where id = p_slot_id and doctor_id = v_uid;
    if not found or v_slot.starts_at <= now() or public.slot_is_taken(v_uid, v_slot.starts_at, v_slot.ends_at, p_id) then
      return jsonb_build_object('status', 'slot_unavailable');
    end if;
    update public.appointments set status = 'proposed', proposed_starts_at = v_slot.starts_at,
      proposed_ends_at = v_slot.ends_at, doctor_note = nullif(left(trim(coalesce(p_note, '')), 300), ''),
      updated_at = now() where id = p_id;
  else
    return jsonb_build_object('status', 'invalid_state');
  end if;
  return jsonb_build_object('status', 'ok');
end;
$$;

-- ─────────────────────────────────────────────────────────── pacientul: răspuns la propunere / anulare
-- p_action: accept_proposal | decline_proposal | cancel. status: ok | not_found | invalid_state | slot_unavailable
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
    update public.appointments set status = 'confirmed', starts_at = v_appt.proposed_starts_at,
      ends_at = v_appt.proposed_ends_at, proposed_starts_at = null, proposed_ends_at = null, updated_at = now()
      where id = p_id;
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

-- ─────────────────────────────────────────────────────────── liste (cu numele celeilalte părți)
create or replace function public.my_appointments()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'patient_id', a.patient_id, 'doctor_id', a.doctor_id,
      'patient_name', case when a.doctor_id = (select auth.uid()) then pp.full_name end,
      'doctor_name', d.full_name, 'specialty_id', a.specialty_id, 'starts_at', a.starts_at, 'ends_at', a.ends_at,
      'status', a.status, 'proposed_starts_at', a.proposed_starts_at, 'proposed_ends_at', a.proposed_ends_at,
      'patient_note', a.patient_note, 'doctor_note', a.doctor_note, 'created_at', a.created_at, 'updated_at', a.updated_at
    ) order by a.starts_at desc), '[]'::jsonb)
  from public.appointments a
  join public.profiles d on d.id = a.doctor_id
  join public.profiles pp on pp.id = a.patient_id
  where a.patient_id = (select auth.uid()) or a.doctor_id = (select auth.uid());
$$;

revoke all on function public.slot_is_taken(uuid, timestamptz, timestamptz, uuid), public.specialty_doctors(text),
  public.doctor_free_slots(uuid, integer), public.request_appointment(uuid, text, text),
  public.respond_appointment(uuid, text, uuid, text), public.patient_update_appointment(uuid, text),
  public.my_appointments() from public, anon;
grant execute on function public.specialty_doctors(text), public.doctor_free_slots(uuid, integer),
  public.request_appointment(uuid, text, text), public.respond_appointment(uuid, text, uuid, text),
  public.patient_update_appointment(uuid, text), public.my_appointments() to authenticated;
