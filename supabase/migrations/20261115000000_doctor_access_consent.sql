-- WWHealth — Doctor Access & Consent (pacientul acordă unui medic verificat acces temporar la dosar).
--
-- • Acordul îl creează DOAR pacientul, pentru propriile date (patient_id = auth.uid()), prin funcții
--   `security definer`. Tabelele nu au permisiuni de scriere pentru utilizatori → medicul nu poate
--   crea, prelungi sau lărgi un acord.
-- • Secțiuni: profile (date de bază, alergii, afecțiuni, medicație) · documents · labs (valori confirmate).
-- • Durată: 1 h, 24 h sau 7 zile. Revocare imediată. Un singur acord activ per (pacient, medic).
-- • Medicul citește datele prin RLS doar cât timp acordul e activ, nerevocat, are secțiunea cerută și contul
--   are încă rolul `doctor` (public.profiles, atribuit de administrator).
-- • Fiecare acordare / revocare / accesare / refuz ajunge în doctor_access_log (imutabil).
-- • Nu atinge Emergency Passport (emergency_tokens / redeem_emergency_token rămân neschimbate).
-- Aditivă: nu modifică politicile existente, doar adaugă politici de citire pentru medic.

-- ─────────────────────────────────────────────────────────── cod de identificare medic
-- Derivat din id (nu poate fi ales / schimbat de utilizator). Pacientul îl poate introduce în loc de căutare.
alter table public.profiles
  add column if not exists doctor_code text
  generated always as ('DR-' || upper(substr(md5(id::text), 1, 6))) stored;
create unique index if not exists profiles_doctor_code_idx on public.profiles (doctor_code);

-- ─────────────────────────────────────────────────────────── acorduri
create table public.doctor_access_grants (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references public.profiles (id) on delete cascade,
  doctor_id   uuid not null references public.profiles (id) on delete cascade,
  scopes      text[] not null check (
                cardinality(scopes) between 1 and 3
                and scopes <@ array['profile', 'documents', 'labs']::text[]
              ),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  check (patient_id <> doctor_id),
  check (expires_at > created_at and expires_at <= created_at + interval '7 days')
);

create index doctor_access_grants_patient_idx on public.doctor_access_grants (patient_id, created_at desc);
create index doctor_access_grants_doctor_idx on public.doctor_access_grants (doctor_id, patient_id, created_at desc);

-- ─────────────────────────────────────────────────────────── jurnal
create table public.doctor_access_log (
  id          bigint generated always as identity primary key,
  grant_id    uuid references public.doctor_access_grants (id) on delete set null,
  patient_id  uuid references public.profiles (id) on delete cascade,
  doctor_id   uuid references public.profiles (id) on delete set null,
  event       text not null check (event in ('granted', 'revoked', 'viewed', 'denied')),
  section     text check (section in ('summary', 'profile', 'documents', 'labs', 'document_file')),
  reason      text check (reason in ('not_doctor', 'no_grant', 'expired', 'revoked', 'scope', 'replaced')),
  created_at  timestamptz not null default now()
);

create index doctor_access_log_patient_idx on public.doctor_access_log (patient_id, created_at desc);
create index doctor_access_log_doctor_idx on public.doctor_access_log (doctor_id, created_at desc);

alter table public.doctor_access_grants enable row level security;
alter table public.doctor_access_log    enable row level security;

revoke all on public.doctor_access_grants, public.doctor_access_log from anon, authenticated;
grant select on public.doctor_access_grants, public.doctor_access_log to authenticated;

create policy "doctor_grants: patient reads own" on public.doctor_access_grants
  for select to authenticated using (patient_id = (select auth.uid()));
create policy "doctor_grants: doctor reads own" on public.doctor_access_grants
  for select to authenticated using (doctor_id = (select auth.uid()));
create policy "doctor_log: patient reads own" on public.doctor_access_log
  for select to authenticated using (patient_id = (select auth.uid()));
create policy "doctor_log: doctor reads own" on public.doctor_access_log
  for select to authenticated using (doctor_id = (select auth.uid()));

-- ─────────────────────────────────────────────────────────── verificarea centrală (folosită de RLS)
-- true doar pentru medicul autentificat, cu rol doctor, acord activ și secțiunea cerută.
create or replace function public.has_doctor_access(p_patient uuid, p_scope text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.doctor_access_grants g
    join public.profiles p on p.id = g.doctor_id and p.role = 'doctor'
    where g.doctor_id = (select auth.uid())
      and g.patient_id = p_patient
      and g.revoked_at is null
      and g.expires_at > now()
      and p_scope = any (g.scopes)
  );
$$;

-- Varianta pentru Storage: primul segment din cale = id-ul pacientului (text, poate să nu fie uuid).
create or replace function public.has_doctor_access_path(p_object_name text, p_scope text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_patient uuid;
begin
  begin
    v_patient := (storage.foldername(p_object_name))[1]::uuid;
  exception when others then
    return false;
  end;
  return public.has_doctor_access(v_patient, p_scope);
end;
$$;

-- ─────────────────────────────────────────────────────────── citire pentru medic (doar cu acord)
create policy "medical_profiles: doctor reads with consent" on public.medical_profiles
  for select to authenticated using ((select public.has_doctor_access(user_id, 'profile')));
create policy "medical_documents: doctor reads with consent" on public.medical_documents
  for select to authenticated using ((select public.has_doctor_access(user_id, 'documents')));
create policy "lab_values: doctor reads with consent" on public.document_lab_values
  for select to authenticated using ((select public.has_doctor_access(user_id, 'labs')));
create policy "medical-documents: doctor reads with consent" on storage.objects
  for select to authenticated
  using (bucket_id = 'medical-documents' and public.has_doctor_access_path(name, 'documents'));

-- ─────────────────────────────────────────────────────────── medici verificați (căutare / cod)
create or replace function public.list_verified_doctors(p_query text default '')
returns table (id uuid, full_name text, doctor_code text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name, p.doctor_code
  from public.profiles p
  where (select auth.uid()) is not null
    and p.role = 'doctor'
    and p.id <> (select auth.uid())
    and (
      coalesce(trim(p_query), '') = ''
      or p.full_name ilike '%' || left(trim(p_query), 60) || '%'
      or p.doctor_code = upper(trim(p_query))
    )
  order by p.full_name
  limit 20;
$$;

-- ─────────────────────────────────────────────────────────── acordare (pacient)
-- status: ok | invalid_duration | invalid_scopes | doctor_not_found
create or replace function public.grant_doctor_access(p_doctor_id uuid, p_scopes text[], p_hours integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_scopes text[];
  v_grant  public.doctor_access_grants%rowtype;
  v_old    record;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_hours is null or p_hours not in (1, 24, 168) then
    return jsonb_build_object('status', 'invalid_duration');
  end if;
  select array_agg(distinct s order by s) into v_scopes from unnest(p_scopes) s;
  if v_scopes is null or not (v_scopes <@ array['profile', 'documents', 'labs']::text[]) then
    return jsonb_build_object('status', 'invalid_scopes');
  end if;
  if p_doctor_id is null or p_doctor_id = v_uid
     or not exists (select 1 from public.profiles where id = p_doctor_id and role = 'doctor') then
    return jsonb_build_object('status', 'doctor_not_found');
  end if;

  -- un singur acord activ per medic: cel vechi se închide (înlocuire, nu extindere)
  for v_old in
    update public.doctor_access_grants
       set revoked_at = now()
     where patient_id = v_uid and doctor_id = p_doctor_id and revoked_at is null and expires_at > now()
    returning id
  loop
    insert into public.doctor_access_log (grant_id, patient_id, doctor_id, event, reason)
    values (v_old.id, v_uid, p_doctor_id, 'revoked', 'replaced');
  end loop;

  insert into public.doctor_access_grants (patient_id, doctor_id, scopes, expires_at)
  values (v_uid, p_doctor_id, v_scopes, now() + make_interval(hours => p_hours))
  returning * into v_grant;

  insert into public.doctor_access_log (grant_id, patient_id, doctor_id, event)
  values (v_grant.id, v_uid, p_doctor_id, 'granted');

  return jsonb_build_object('status', 'ok', 'grant_id', v_grant.id, 'expires_at', v_grant.expires_at,
                            'scopes', to_jsonb(v_grant.scopes));
end;
$$;

-- ─────────────────────────────────────────────────────────── revocare (pacient, doar acordurile proprii)
create or replace function public.revoke_doctor_access(p_grant_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_grant public.doctor_access_grants%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  update public.doctor_access_grants
     set revoked_at = now()
   where id = p_grant_id and patient_id = v_uid and revoked_at is null and expires_at > now()
  returning * into v_grant;
  if not found then
    return false;
  end if;
  insert into public.doctor_access_log (grant_id, patient_id, doctor_id, event)
  values (v_grant.id, v_uid, v_grant.doctor_id, 'revoked');
  return true;
end;
$$;

-- ─────────────────────────────────────────────────────────── istoric (pacient)
create or replace function public.patient_doctor_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'grants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'doctor_id', g.doctor_id, 'doctor_name', d.full_name, 'doctor_code', d.doctor_code,
        'scopes', to_jsonb(g.scopes), 'created_at', g.created_at, 'expires_at', g.expires_at,
        'revoked_at', g.revoked_at,
        'status', case when g.revoked_at is not null then 'revoked'
                       when g.expires_at <= now() then 'expired' else 'active' end
      ) order by g.created_at desc)
      from public.doctor_access_grants g
      left join public.profiles d on d.id = g.doctor_id
      where g.patient_id = (select auth.uid())
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(e order by e.created_at desc) from (
        select l.id, l.event, l.section, l.reason, l.created_at, d.full_name as doctor_name
        from public.doctor_access_log l
        left join public.profiles d on d.id = l.doctor_id
        where l.patient_id = (select auth.uid())
        order by l.created_at desc
        limit 100
      ) e
    ), '[]'::jsonb)
  );
$$;

-- ─────────────────────────────────────────────────────────── pacienții medicului
-- Ultimul acord per pacient (activ, expirat sau revocat — ca medicul să vadă clar starea). Doar rol doctor.
create or replace function public.doctor_patients()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(row_data order by (row_data ->> 'status') = 'active' desc, row_data ->> 'created_at' desc), '[]'::jsonb)
  from (
    select distinct on (g.patient_id) jsonb_build_object(
      'patient_id', g.patient_id, 'full_name', p.full_name, 'grant_id', g.id,
      'scopes', to_jsonb(g.scopes), 'created_at', g.created_at, 'expires_at', g.expires_at,
      'revoked_at', g.revoked_at,
      'status', case when g.revoked_at is not null then 'revoked'
                     when g.expires_at <= now() then 'expired' else 'active' end
    ) as row_data
    from public.doctor_access_grants g
    join public.profiles p on p.id = g.patient_id
    where g.doctor_id = (select auth.uid())
      and exists (select 1 from public.profiles me where me.id = (select auth.uid()) and me.role = 'doctor')
    order by g.patient_id, g.created_at desc
  ) rows;
$$;

-- ─────────────────────────────────────────────────────────── deschiderea unui dosar (medic)
-- status: ok | forbidden (nu e medic) | none (niciun acord) | expired | revoked | scope (secțiune nepermisă)
-- Fiecare deschidere e jurnalizată (viewed / denied + motiv).
create or replace function public.doctor_open_patient(p_patient_id uuid, p_section text default 'summary')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_role    text;
  v_grant   public.doctor_access_grants%rowtype;
  v_name    text;
  v_status  text;
  v_section text := case when p_section in ('summary', 'profile', 'documents', 'labs', 'document_file')
                         then p_section else 'summary' end;
  v_needed  text := case when p_section = 'document_file' then 'documents' else p_section end;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select role into v_role from public.profiles where id = v_uid;
  if v_role is distinct from 'doctor' then
    return jsonb_build_object('status', 'forbidden');
  end if;

  select * into v_grant from public.doctor_access_grants
   where doctor_id = v_uid and patient_id = p_patient_id
   order by created_at desc limit 1;

  if v_grant.id is null then
    -- fără acord: nu se confirmă nici existența pacientului (nu se jurnalizează pe pacient)
    return jsonb_build_object('status', 'none');
  end if;

  select full_name into v_name from public.profiles where id = p_patient_id;
  v_status := case when v_grant.revoked_at is not null then 'revoked'
                   when v_grant.expires_at <= now() then 'expired'
                   when v_needed in ('profile', 'documents', 'labs') and not (v_needed = any (v_grant.scopes)) then 'scope'
                   else 'ok' end;

  insert into public.doctor_access_log (grant_id, patient_id, doctor_id, event, section, reason)
  values (v_grant.id, p_patient_id, v_uid, case when v_status = 'ok' then 'viewed' else 'denied' end,
          v_section, case when v_status = 'ok' then null else v_status end);

  return jsonb_build_object('status', v_status, 'grant_id', v_grant.id, 'patient_name', v_name,
                            'scopes', to_jsonb(v_grant.scopes), 'expires_at', v_grant.expires_at,
                            'revoked_at', v_grant.revoked_at);
end;
$$;

revoke all on function public.has_doctor_access(uuid, text), public.has_doctor_access_path(text, text),
  public.list_verified_doctors(text), public.grant_doctor_access(uuid, text[], integer),
  public.revoke_doctor_access(uuid), public.patient_doctor_access(), public.doctor_patients(),
  public.doctor_open_patient(uuid, text) from public, anon;
grant execute on function public.has_doctor_access(uuid, text), public.has_doctor_access_path(text, text),
  public.list_verified_doctors(text), public.grant_doctor_access(uuid, text[], integer),
  public.revoke_doctor_access(uuid), public.patient_doctor_access(), public.doctor_patients(),
  public.doctor_open_patient(uuid, text) to authenticated;
