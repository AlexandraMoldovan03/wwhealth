-- MFA enforcement at the database level (NOT applied automatically — needs approval before production).
--
-- The FastAPI backend already refuses aal1 tokens of accounts that have a verified TOTP factor. This
-- migration closes the same gap for direct PostgREST calls made with the publishable key + a user JWT:
-- every RLS-protected table in `public` gets a RESTRICTIVE policy that requires aal2 when the user has a
-- verified factor. Accounts without MFA are unaffected (aal1 keeps working).
--
-- Security-definer RPCs bypass RLS: they must call public.mfa_satisfied() themselves (follow-up, see
-- docs/SECURITY.md). Test on a staging project with real test accounts before applying to production.

create or replace function public.mfa_satisfied()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = auth.uid() and f.status = 'verified'
      );
$$;

revoke all on function public.mfa_satisfied() from public;
grant execute on function public.mfa_satisfied() to authenticated;

do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  loop
    execute format('drop policy if exists mfa_aal2_required on public.%I', t.relname);
    execute format(
      'create policy mfa_aal2_required on public.%I as restrictive for all to authenticated '
      'using (public.mfa_satisfied()) with check (public.mfa_satisfied())', t.relname);
  end loop;
end
$$;
