-- WWHealth — Emergency Medical Passport (MVP).
--
-- • QR = token aleatoriu generat în FastAPI; aici se păstrează DOAR hash-ul SHA-256 (tokenul nu conține date).
-- • Valabil 5 minute, de unică folosință, revocabil; un singur QR activ per pacient.
-- • Validarea + consumul tokenului sunt atomice (UPDATE ... WHERE used_at IS NULL ...).
-- • Doar rolul `doctor` din public.profiles poate consuma un token; rolul NU mai poate fi ales la sign-up.
-- • Fiecare creare / revocare / accesare / refuz ajunge în emergency_access_log (imutabil).
-- Tabelele nu au permisiuni directe pentru utilizatori: scrierea se face numai prin funcțiile de mai jos.

-- ─────────────────────────────────────────────────────────── rolul nu mai vine din metadata clientului
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(left(new.raw_user_meta_data ->> 'full_name', 120), ''), 'patient');
  insert into public.medical_profiles (user_id) values (new.id);
  return new;
end;
$$;

-- Rolurile `doctor` existente au fost auto-atribuite din formularul de înregistrare → nu sunt de încredere.
-- Contul DOCTOR de test se promovează explicit după migrare (supabase/demo/promote_test_doctor.sql).
update public.profiles set role = 'patient' where role = 'doctor';

-- ─────────────────────────────────────────────────────────── tokens
create table public.emergency_tokens (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references public.profiles (id) on delete cascade,
  token_hash  text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  used_by     uuid references public.profiles (id) on delete set null,
  revoked_at  timestamptz,
  check (expires_at > created_at and expires_at <= created_at + interval '5 minutes')
);

create index emergency_tokens_patient_idx on public.emergency_tokens (patient_id, created_at desc);

-- ─────────────────────────────────────────────────────────── audit log
create table public.emergency_access_log (
  id          bigint generated always as identity primary key,
  token_id    uuid references public.emergency_tokens (id) on delete set null,
  patient_id  uuid references public.profiles (id) on delete cascade,
  actor_id    uuid references public.profiles (id) on delete set null,
  actor_name  text,  -- instantaneu al numelui medicului, vizibil pacientului
  event       text not null check (event in ('created', 'revoked', 'viewed', 'denied')),
  reason      text check (reason in ('not_found', 'expired', 'used', 'revoked', 'not_doctor')),
  created_at  timestamptz not null default now()
);

create index emergency_access_log_patient_idx on public.emergency_access_log (patient_id, created_at desc);
create index emergency_access_log_actor_idx on public.emergency_access_log (actor_id, created_at desc);

alter table public.emergency_tokens     enable row level security;
alter table public.emergency_access_log enable row level security;

revoke all on public.emergency_tokens, public.emergency_access_log from anon, authenticated;
grant select on public.emergency_access_log to authenticated;

-- Pacientul își vede accesările; medicul își vede propriile accesări. Nimeni nu poate modifica / șterge.
create policy "emergency_log: patient reads own" on public.emergency_access_log
  for select to authenticated using (patient_id = (select auth.uid()));
create policy "emergency_log: actor reads own" on public.emergency_access_log
  for select to authenticated using (actor_id = (select auth.uid()));

-- ─────────────────────────────────────────────────────────── create (pacient)
create or replace function public.create_emergency_token(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
  v_exp timestamptz;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid token hash' using errcode = '22023';
  end if;

  -- un singur QR activ: cele anterioare se revocă
  update public.emergency_tokens
     set revoked_at = now()
   where patient_id = v_uid and used_at is null and revoked_at is null and expires_at > now();

  insert into public.emergency_tokens (patient_id, token_hash, expires_at)
  values (v_uid, p_token_hash, now() + interval '5 minutes')
  returning id, expires_at into v_id, v_exp;

  insert into public.emergency_access_log (token_id, patient_id, actor_id, event)
  values (v_id, v_uid, v_uid, 'created');

  return jsonb_build_object('token_id', v_id, 'expires_at', v_exp);
end;
$$;

-- ─────────────────────────────────────────────────────────── revoke (pacient, doar tokenurile proprii)
create or replace function public.revoke_emergency_token(p_token_id uuid)
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

  update public.emergency_tokens
     set revoked_at = now()
   where id = p_token_id and patient_id = v_uid and used_at is null and revoked_at is null;
  if not found then
    return false;
  end if;

  insert into public.emergency_access_log (token_id, patient_id, actor_id, event)
  values (p_token_id, v_uid, v_uid, 'revoked');
  return true;
end;
$$;

-- ─────────────────────────────────────────────────────────── redeem (medic)
-- Întoarce un status (nu aruncă excepții) ca refuzurile să rămână în audit log.
-- status: ok | forbidden | not_found | expired | used | revoked
create or replace function public.redeem_emergency_token(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_role   text;
  v_name   text;
  v_tok    public.emergency_tokens%rowtype;
  v_tok_id uuid;
  v_mp     public.medical_profiles%rowtype;
  v_reason text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select role, full_name into v_role, v_name from public.profiles where id = v_uid;

  if p_token_hash is not null and p_token_hash ~ '^[0-9a-f]{64}$' then
    select * into v_tok from public.emergency_tokens where token_hash = p_token_hash;
  end if;

  -- autorizare: doar rolul doctor (atribuit de administrator, nu de utilizator)
  if v_role is distinct from 'doctor' then
    insert into public.emergency_access_log (token_id, patient_id, actor_id, actor_name, event, reason)
    values (v_tok.id, v_tok.patient_id, v_uid, v_name, 'denied', 'not_doctor');
    return jsonb_build_object('status', 'forbidden');
  end if;

  if v_tok.id is null then
    insert into public.emergency_access_log (actor_id, actor_name, event, reason)
    values (v_uid, v_name, 'denied', 'not_found');
    return jsonb_build_object('status', 'not_found');
  end if;

  -- consum atomic: două scanări simultane → doar una reușește
  v_tok_id := v_tok.id;
  update public.emergency_tokens
     set used_at = now(), used_by = v_uid
   where id = v_tok_id and used_at is null and revoked_at is null and expires_at > now()
  returning * into v_tok;

  if not found then
    select * into v_tok from public.emergency_tokens where id = v_tok_id;
    v_reason := case
      when v_tok.revoked_at is not null then 'revoked'
      when v_tok.used_at is not null then 'used'
      else 'expired'
    end;
    insert into public.emergency_access_log (token_id, patient_id, actor_id, actor_name, event, reason)
    values (v_tok.id, v_tok.patient_id, v_uid, v_name, 'denied', v_reason);
    return jsonb_build_object('status', v_reason);
  end if;

  select * into v_mp from public.medical_profiles where user_id = v_tok.patient_id;

  insert into public.emergency_access_log (token_id, patient_id, actor_id, actor_name, event)
  values (v_tok.id, v_tok.patient_id, v_uid, v_name, 'viewed');

  -- DOAR datele de urgență
  return jsonb_build_object(
    'status',      'ok',
    'accessed_at', v_tok.used_at,
    'blood_type',  v_mp.blood_type,
    'allergies',   coalesce(v_mp.allergies, '[]'::jsonb),
    'conditions',  coalesce(v_mp.conditions, '[]'::jsonb),
    'medications', coalesce(v_mp.medications, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.create_emergency_token(text), public.revoke_emergency_token(uuid),
  public.redeem_emergency_token(text) from public, anon;
grant execute on function public.create_emergency_token(text), public.revoke_emergency_token(uuid),
  public.redeem_emergency_token(text) to authenticated;
