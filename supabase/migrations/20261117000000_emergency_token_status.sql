-- Allow a patient to check whether their own short-lived emergency QR was consumed.
create or replace function public.emergency_token_status(p_token_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_token public.emergency_tokens%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_token
    from public.emergency_tokens
   where id = p_token_id and patient_id = v_uid;

  if not found then return 'not_found'; end if;
  if v_token.used_at is not null then return 'used'; end if;
  if v_token.revoked_at is not null then return 'revoked'; end if;
  if v_token.expires_at <= now() then return 'expired'; end if;
  return 'active';
end;
$$;

revoke all on function public.emergency_token_status(uuid) from public, anon;
grant execute on function public.emergency_token_status(uuid) to authenticated;
