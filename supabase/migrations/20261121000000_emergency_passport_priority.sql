-- WWHealth — Emergency Passport prioritizat.  PROPUNERE, NEAPLICATĂ: se rulează manual.
--
-- Aditivă: redeem_emergency_token (aceeași semnătură, aceleași verificări, același audit) întoarce în plus
-- intervențiile chirurgicale și valorile de laborator CONFIRMATE ale pacientului (ultimele 300), ca backend-ul să
-- poată afișa analizele critice / anormale în pașaport. Backend-ul NU trimite medicului valorile normale.
-- Dacă migrarea nu e aplicată, aplicația funcționează ca înainte (fără analize în pașaport).

-- valori confirmate (document_lab_values), cu documentul-sursă; folosit doar din funcții security definer
create or replace function public._emergency_lab_values(p_patient uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(row_data), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'name', l.name, 'value', l.value, 'unit', l.unit, 'reference_range', l.reference_range,
      'measured_at', l.measured_at, 'document_id', l.document_id, 'document_title', d.title,
      'document_date', d.uploaded_at::date
    ) as row_data
    from public.document_lab_values l
    join public.medical_documents d on d.id = l.document_id
    where l.user_id = p_patient
    order by l.created_at desc
    limit 300
  ) rows;
$$;

revoke all on function public._emergency_lab_values(uuid) from public, anon, authenticated;

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
    'medications', coalesce(v_mp.medications, '[]'::jsonb),
    'surgeries',   coalesce(v_mp.surgeries, '[]'::jsonb),
    'labs',        public._emergency_lab_values(v_tok.patient_id)
  );
end;
$$;
