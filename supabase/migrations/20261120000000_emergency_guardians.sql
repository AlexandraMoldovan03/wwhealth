-- WWHealth — Persoane de urgență (emergency guardians).  PROPUNERE, NEAPLICATĂ: se rulează manual.
--
-- Problema: `medical_profiles.emergency_contact` e doar text (nume / telefon), fără legătură cu un cont,
-- deci membrul familiei nu vede că e persoană de urgență și nu poate deschide pașaportul.
--
-- • Pacientul invită un cont după email. Legătura devine activă DOAR după ce titularul acelui email
--   (confirmat în auth.users) acceptă. Nu se face nicio potrivire după nume.
-- • Pacientul vede cine are acces și poate revoca oricând; membrul poate refuza / renunța.
-- • Membrul activ primește DOAR datele de urgență (grupă sanguină, alergii, afecțiuni active, medicație
--   activă, contact de urgență) și poate genera QR-ul de 5 minute al pacientului pentru un medic.
--   Fișa completă (documente, analize, istoric) NU e accesibilă.
-- • Tabelul nu are permisiuni directe pentru utilizatori (nici select): totul trece prin funcțiile
--   `security definer` de mai jos, care filtrează pe auth.uid() → fără acces încrucișat între pacienți.
-- • Fiecare deschidere / generare de QR de către membru ajunge în emergency_access_log (vizibil pacientului).
-- Aditivă: nu modifică tabelele, politicile sau funcțiile existente.

create table public.emergency_guardians (
  id            uuid primary key default gen_random_uuid(),
  patient_id    uuid not null references public.profiles (id) on delete cascade,
  guardian_id   uuid references public.profiles (id) on delete cascade,
  invite_email  text not null check (
                  invite_email = lower(invite_email)
                  and char_length(invite_email) between 3 and 254
                  and invite_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
                ),
  relation      text not null default '' check (char_length(relation) <= 40),
  status        text not null default 'pending' check (status in ('pending', 'active', 'declined', 'revoked')),
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  revoked_at    timestamptz,
  check (guardian_id is null or guardian_id <> patient_id),
  check (status <> 'active' or guardian_id is not null)
);

-- o singură invitație deschisă / legătură activă per (pacient, email)
create unique index emergency_guardians_open_idx
  on public.emergency_guardians (patient_id, invite_email) where status in ('pending', 'active');
create index emergency_guardians_patient_idx on public.emergency_guardians (patient_id, created_at desc);
create index emergency_guardians_guardian_idx on public.emergency_guardians (guardian_id) where status = 'active';
create index emergency_guardians_email_idx on public.emergency_guardians (invite_email) where status = 'pending';

alter table public.emergency_guardians enable row level security;
revoke all on public.emergency_guardians from anon, authenticated;
-- Fără politici / grant-uri: accesul se face exclusiv prin funcțiile de mai jos.

-- ─────────────────────────────────────────────────────────── email-ul confirmat al apelantului
create or replace function public._guardian_caller_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(u.email)
  from auth.users u
  where u.id = (select auth.uid()) and u.email_confirmed_at is not null;
$$;

-- ─────────────────────────────────────────────────────────── invitare (pacient)
-- status: ok | invalid_email | self | duplicate | limit
-- Nu dezvăluie dacă există un cont cu acel email.
create or replace function public.invite_emergency_guardian(p_email text, p_relation text default '')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(trim(coalesce(p_email, '')));
  v_rel   text := left(trim(coalesce(p_relation, '')), 40);
  v_me    text;
  v_id    uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if char_length(v_email) not between 3 and 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('status', 'invalid_email');
  end if;
  select lower(email) into v_me from auth.users where id = v_uid;
  if v_me = v_email then
    return jsonb_build_object('status', 'self');
  end if;
  if exists (select 1 from public.emergency_guardians
              where patient_id = v_uid and invite_email = v_email and status in ('pending', 'active')) then
    return jsonb_build_object('status', 'duplicate');
  end if;
  if (select count(*) from public.emergency_guardians
       where patient_id = v_uid and status in ('pending', 'active')) >= 5 then
    return jsonb_build_object('status', 'limit');
  end if;

  insert into public.emergency_guardians (patient_id, invite_email, relation)
  values (v_uid, v_email, v_rel)
  returning id into v_id;
  return jsonb_build_object('status', 'ok', 'id', v_id);
end;
$$;

-- ─────────────────────────────────────────────────────────── revocare (pacient, doar ale lui)
create or replace function public.revoke_emergency_guardian(p_id uuid)
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
  update public.emergency_guardians
     set status = 'revoked', revoked_at = now()
   where id = p_id and patient_id = v_uid and status in ('pending', 'active');
  return found;
end;
$$;

-- ─────────────────────────────────────────────────────────── răspuns (membrul invitat)
-- accept: doar invitațiile pending trimise pe email-ul CONFIRMAT al apelantului.
-- refuz: invitație pending (după email) sau renunțare la o legătură activă (după guardian_id).
-- status: ok | not_found
create or replace function public.respond_emergency_guardian(p_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := public._guardian_caller_email();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_accept then
    update public.emergency_guardians
       set status = 'active', guardian_id = v_uid, responded_at = now()
     where id = p_id and status = 'pending' and v_email is not null
       and invite_email = v_email and patient_id <> v_uid;
  else
    update public.emergency_guardians
       set status = 'declined', responded_at = now()
     where id = p_id and (
             (status = 'pending' and v_email is not null and invite_email = v_email)
          or (status = 'active' and guardian_id = v_uid)
           );
  end if;

  return jsonb_build_object('status', case when found then 'ok' else 'not_found' end);
end;
$$;

-- ─────────────────────────────────────────────────────────── privire de ansamblu (ambele roluri)
-- guardians:   persoanele invitate de mine (pacient)
-- invitations: invitațiile pending primite pe email-ul meu confirmat
-- protecting:  pacienții pentru care sunt persoană de urgență activă
create or replace function public.my_emergency_guardians()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'guardians', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'email', g.invite_email, 'relation', g.relation, 'status', g.status,
        'guardian_name', case when g.status = 'active' then p.full_name end,
        'created_at', g.created_at, 'responded_at', g.responded_at
      ) order by g.created_at desc)
      from public.emergency_guardians g
      left join public.profiles p on p.id = g.guardian_id
      where g.patient_id = (select auth.uid()) and g.status in ('pending', 'active')
    ), '[]'::jsonb),
    'invitations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'patient_name', p.full_name, 'relation', g.relation, 'created_at', g.created_at
      ) order by g.created_at desc)
      from public.emergency_guardians g
      join public.profiles p on p.id = g.patient_id
      where g.status = 'pending'
        and g.invite_email = public._guardian_caller_email()
        and g.patient_id <> (select auth.uid())
    ), '[]'::jsonb),
    'protecting', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'patient_id', g.patient_id, 'patient_name', p.full_name, 'relation', g.relation,
        'since', g.responded_at
      ) order by p.full_name)
      from public.emergency_guardians g
      join public.profiles p on p.id = g.patient_id
      where g.status = 'active' and g.guardian_id = (select auth.uid())
    ), '[]'::jsonb)
  );
$$;

-- ─────────────────────────────────────────────────────────── pașaportul (membru activ)
-- status: ok | none (fără legătură activă: nu se confirmă nici existența pacientului)
create or replace function public.guardian_emergency_view(p_patient_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_name text;
  v_pat  text;
  v_mp   public.medical_profiles%rowtype;
  v_labs jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.emergency_guardians
                  where patient_id = p_patient_id and guardian_id = v_uid and status = 'active') then
    return jsonb_build_object('status', 'none');
  end if;

  select full_name into v_name from public.profiles where id = v_uid;
  select full_name into v_pat from public.profiles where id = p_patient_id;
  select * into v_mp from public.medical_profiles where user_id = p_patient_id;
  -- analizele confirmate vin din 20261121000000; până la aplicarea ei, pașaportul rămâne fără analize
  if to_regprocedure('public._emergency_lab_values(uuid)') is not null then
    execute 'select public._emergency_lab_values($1)' into v_labs using p_patient_id;
  end if;

  insert into public.emergency_access_log (patient_id, actor_id, actor_name, event)
  values (p_patient_id, v_uid, v_name, 'viewed');

  -- DOAR datele de urgență
  return jsonb_build_object(
    'status',            'ok',
    'accessed_at',       now(),
    'patient_name',      v_pat,
    'blood_type',        v_mp.blood_type,
    'allergies',         coalesce(v_mp.allergies, '[]'::jsonb),
    'conditions',        coalesce(v_mp.conditions, '[]'::jsonb),
    'medications',       coalesce(v_mp.medications, '[]'::jsonb),
    'emergency_contact', v_mp.emergency_contact,
    'surgeries',         coalesce(v_mp.surgeries, '[]'::jsonb),
    'labs',              v_labs
  );
end;
$$;

-- ─────────────────────────────────────────────────────────── QR-ul pacientului (membru activ)
-- Aceleași reguli ca create_emergency_token (5 minute, unică folosință, un singur QR activ),
-- doar că îl generează membrul pentru pacient; doar un cont de medic îl poate consuma.
-- status: ok | none
create or replace function public.guardian_create_emergency_token(p_patient_id uuid, p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_name text;
  v_id   uuid;
  v_exp  timestamptz;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid token hash' using errcode = '22023';
  end if;
  if not exists (select 1 from public.emergency_guardians
                  where patient_id = p_patient_id and guardian_id = v_uid and status = 'active') then
    return jsonb_build_object('status', 'none');
  end if;

  select full_name into v_name from public.profiles where id = v_uid;

  update public.emergency_tokens
     set revoked_at = now()
   where patient_id = p_patient_id and used_at is null and revoked_at is null and expires_at > now();

  insert into public.emergency_tokens (patient_id, token_hash, expires_at)
  values (p_patient_id, p_token_hash, now() + interval '5 minutes')
  returning id, expires_at into v_id, v_exp;

  insert into public.emergency_access_log (token_id, patient_id, actor_id, actor_name, event)
  values (v_id, p_patient_id, v_uid, v_name, 'created');

  return jsonb_build_object('status', 'ok', 'token_id', v_id, 'expires_at', v_exp);
end;
$$;

revoke all on function public._guardian_caller_email(), public.invite_emergency_guardian(text, text),
  public.revoke_emergency_guardian(uuid), public.respond_emergency_guardian(uuid, boolean),
  public.my_emergency_guardians(), public.guardian_emergency_view(uuid),
  public.guardian_create_emergency_token(uuid, text) from public, anon, authenticated;
grant execute on function public.invite_emergency_guardian(text, text),
  public.revoke_emergency_guardian(uuid), public.respond_emergency_guardian(uuid, boolean),
  public.my_emergency_guardians(), public.guardian_emergency_view(uuid),
  public.guardian_create_emergency_token(uuid, text) to authenticated;
