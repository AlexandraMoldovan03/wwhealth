-- WWHealth — Persoane de urgență: retragerea accesului oprește și QR-urile generate de membru.
-- PROPUNERE, NEAPLICATĂ: se rulează manual, după 20261120000000_emergency_guardians.sql.
--
-- • Relația e direcțională: A invită B → B vede DOAR pașaportul de urgență al lui A; A nu primește nimic de la B.
-- • Revocare (pacient) / renunțare (membru): QR-urile încă nefolosite generate de acel membru sunt anulate,
--   iar evenimentul ajunge în emergency_access_log (event 'revoked', reason 'guardian_access').
-- • Pacientul vede și invitațiile refuzate din ultimele 30 de zile (dacă nu a trimis între timp alta pe același email).
-- Înlocuiește doar funcțiile revoke/respond/my_emergency_guardians; tabelele și politicile rămân neschimbate.

create or replace function public._revoke_guardian_tokens(p_patient_id uuid, p_guardian_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.emergency_tokens t
     set revoked_at = now()
   where t.patient_id = p_patient_id and t.used_at is null and t.revoked_at is null and t.expires_at > now()
     and exists (select 1 from public.emergency_access_log l
                  where l.token_id = t.id and l.event = 'created' and l.actor_id = p_guardian_id);
$$;

create or replace function public.revoke_emergency_guardian(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_guardian uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  update public.emergency_guardians
     set status = 'revoked', revoked_at = now()
   where id = p_id and patient_id = v_uid and status in ('pending', 'active')
  returning guardian_id into v_guardian;
  if not found then
    return false;
  end if;
  if v_guardian is not null then
    perform public._revoke_guardian_tokens(v_uid, v_guardian);
    insert into public.emergency_access_log (patient_id, actor_id, actor_name, event, reason)
    values (v_uid, v_uid, (select full_name from public.profiles where id = v_uid), 'revoked', 'guardian_access');
  end if;
  return true;
end;
$$;

create or replace function public.respond_emergency_guardian(p_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_email   text := public._guardian_caller_email();
  v_patient uuid;
  v_was     text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_accept then
    update public.emergency_guardians
       set status = 'active', guardian_id = v_uid, responded_at = now()
     where id = p_id and status = 'pending' and v_email is not null
       and invite_email = v_email and patient_id <> v_uid
    returning patient_id into v_patient;
    return jsonb_build_object('status', case when v_patient is not null then 'ok' else 'not_found' end);
  end if;

  select status into v_was from public.emergency_guardians where id = p_id;
  update public.emergency_guardians
     set status = 'declined', responded_at = now()
   where id = p_id and (
           (status = 'pending' and v_email is not null and invite_email = v_email)
        or (status = 'active' and guardian_id = v_uid)
         )
  returning patient_id into v_patient;
  if v_patient is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_was = 'active' then
    perform public._revoke_guardian_tokens(v_patient, v_uid);
    insert into public.emergency_access_log (patient_id, actor_id, actor_name, event, reason)
    values (v_patient, v_uid, (select full_name from public.profiles where id = v_uid), 'revoked', 'guardian_access');
  end if;
  return jsonb_build_object('status', 'ok');
end;
$$;

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
      where g.patient_id = (select auth.uid())
        and (g.status in ('pending', 'active')
             or (g.status = 'declined' and g.responded_at > now() - interval '30 days'
                 and g.id = (select d.id from public.emergency_guardians d
                              where d.patient_id = g.patient_id and d.invite_email = g.invite_email
                              order by d.created_at desc limit 1)))
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

revoke all on function public._revoke_guardian_tokens(uuid, uuid) from public, anon, authenticated;
revoke all on function public.revoke_emergency_guardian(uuid), public.respond_emergency_guardian(uuid, boolean),
  public.my_emergency_guardians() from public, anon;
grant execute on function public.revoke_emergency_guardian(uuid), public.respond_emergency_guardian(uuid, boolean),
  public.my_emergency_guardians() to authenticated;
