-- Rulează exclusiv în proiectul Supabase dedicat demonstrației.
-- Precondiții: migrările WWHealth până la 20261117000100 și scriptul Admin API alăturat.
-- Profilurile poartă prefixul [DEMO] în toate ecranele care afișează full_name.
-- Bio, experiența, orașul și tipul consultației sunt în metadatele Auth.
-- Aplicația actuală nu expune acele câmpuri în lista de medici.
begin;

create temporary table smartcare_demo_roster (
  ordinal integer primary key,
  doctor_id uuid unique not null,
  full_name text not null,
  specialty_id text not null,
  minutes integer not null
) on commit drop;

insert into smartcare_demo_roster
select
  (u.raw_app_meta_data ->> 'smartcare_demo_ordinal')::integer,
  u.id,
  u.raw_user_meta_data ->> 'full_name',
  u.raw_app_meta_data ->> 'smartcare_demo_specialty',
  (u.raw_app_meta_data ->> 'smartcare_demo_minutes')::integer
from auth.users u
where u.raw_app_meta_data ->> 'smartcare_demo_batch' = 'wwhealth-smartcare-v1'
  and u.email = 'wwhealth-smartcare-demo-' ||
    lpad(u.raw_app_meta_data ->> 'smartcare_demo_ordinal', 2, '0') || '@example.invalid';

do $$
begin
  if (select count(*) from smartcare_demo_roster) <> 40
     or exists (select from smartcare_demo_roster where ordinal not between 1 and 40
                or full_name not like '[DEMO] %' or minutes not in (30, 45)) then
    raise exception 'Expected 40 marked demo Auth accounts. Run the Admin API script first.';
  end if;
  if exists (
    with expected(specialty_id, doctors) as (values
      ('family_medicine',4),('cardiology',3),('neurology',3),('orthopedics',3),('dermatology',3),
      ('ent',2),('ophthalmology',2),('gastroenterology',2),('endocrinology',4),('gynecology',2),
      ('urology',2),('pulmonology',2),('pediatrics',2),('psychiatry',2),('rheumatology',2),('allergology',2)
    ), actual as (
      select specialty_id, count(*) as doctors from smartcare_demo_roster group by specialty_id
    )
    select from expected full join actual using (specialty_id)
    where expected.doctors is distinct from actual.doctors
  ) or exists (
    select from smartcare_demo_roster r
    where not exists (select from public.medical_specialties s where s.id = r.specialty_id)
  ) then
    raise exception 'Demo roster does not match the installed Smart Care specialty catalog.';
  end if;
end $$;

insert into public.profiles (id, full_name, role)
select doctor_id, full_name, 'doctor' from smartcare_demo_roster
on conflict (id) do update set full_name = excluded.full_name, role = excluded.role
where (profiles.full_name, profiles.role) is distinct from (excluded.full_name, excluded.role);

insert into public.doctor_specialties (doctor_id, specialty_id)
select doctor_id, specialty_id from smartcare_demo_roster
on conflict (doctor_id, specialty_id) do nothing;

-- Generate local wall-clock shifts before converting to timestamptz (including DST).
-- Schedule only selected blocks of each shift, with breaks and staggered blocked slots.
with dates as (
  select (now() at time zone 'Europe/Bucharest')::date + day_offset as day
  from generate_series(0,30) day_offset
), shifts as (
  select r.*, d.day,
    case r.ordinal % 3 when 0 then 8 when 1 then 14 else 9 end as first_hour,
    case r.ordinal % 3 when 0 then 14 when 1 then 20 else 17 end as last_hour
  from smartcare_demo_roster r cross join dates d
  where extract(isodow from d.day) <= 5
     or (extract(isodow from d.day) = 6 and r.ordinal % 6 = 0)
), slots as (
  select s.doctor_id,
    local_start at time zone 'Europe/Bucharest' as starts_at,
    (local_start + make_interval(mins => s.minutes)) at time zone 'Europe/Bucharest' as ends_at
  from shifts s
  cross join lateral generate_series(
    s.day + make_time(s.first_hour,0,0),
    s.day + make_time(s.last_hour,0,0) - make_interval(mins => s.minutes),
    make_interval(mins => s.minutes)
  ) with ordinality as g(local_start, slot_number)
  where g.slot_number not in (4, 5)
    and (g.slot_number + s.ordinal + extract(doy from s.day)::integer) % 7 <> 0
)
insert into public.doctor_availability (doctor_id, starts_at, ends_at)
select s.doctor_id, s.starts_at, s.ends_at from slots s
where s.starts_at > now() and s.ends_at <= now() + interval '720 hours'
  and not exists (
    select from public.doctor_availability a
    where a.doctor_id = s.doctor_id
      and tstzrange(a.starts_at, a.ends_at) && tstzrange(s.starts_at, s.ends_at)
  )
on conflict (doctor_id, starts_at) do nothing;

-- Same booking window and occupancy check as specialty_doctors.
select r.specialty_id, s.name_ro, count(distinct r.doctor_id) as doctors,
  count(distinct r.doctor_id) filter (where a.id is not null) as doctors_with_free_slots,
  count(a.id) as free_slots_next_14_days
from smartcare_demo_roster r
join public.medical_specialties s on s.id = r.specialty_id
left join public.doctor_availability a on a.doctor_id = r.doctor_id
  and a.starts_at > now() and a.starts_at < now() + interval '14 days'
  and not public.slot_is_taken(r.doctor_id, a.starts_at, a.ends_at)
group by r.specialty_id, s.name_ro
order by r.specialty_id;

commit;
