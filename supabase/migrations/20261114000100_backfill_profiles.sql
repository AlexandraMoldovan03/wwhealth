-- WWHealth — backfill pentru conturile create fără rândurile din profiles / medical_profiles
-- (ex. utilizatori creați înainte ca triggerul `on_auth_user_created` să existe sau după un reset de tabele).
-- Fără aceste rânduri API-ul răspunde 404 "Patient not found" și rolul nu poate fi citit.
--
-- • Idempotent: inserează doar ce lipsește, nu modifică rânduri existente.
-- • Rolul creat este MEREU 'patient' (DOCTOR se acordă explicit: supabase/demo/promote_test_doctor.sql).
-- • Nu atinge RLS, granturi sau politici.

insert into public.profiles (id, full_name, role)
select u.id, coalesce(left(u.raw_user_meta_data ->> 'full_name', 120), ''), 'patient'
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

insert into public.medical_profiles (user_id)
select p.id
from public.profiles p
where not exists (select 1 from public.medical_profiles m where m.user_id = p.id);
