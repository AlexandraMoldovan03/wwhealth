-- DEMO: activează rolul DOCTOR pentru un cont de test (până există verificarea medicilor).
-- Rulează în Supabase → SQL Editor (rol postgres). Utilizatorii NU își pot atribui singuri rolul:
-- `profiles.role` nu are grant de UPDATE pentru `authenticated`, iar sign-up-ul setează mereu 'patient'.
--
-- 1) Creează contul din aplicație (Register) și înlocuiește emailul de mai jos (de 2 ori).

-- 0) Diagnostic: ce rol are fiecare cont (profile_missing = rândul din profiles lipsește)
select u.email, coalesce(p.role, 'profile_missing') as role
from auth.users u left join public.profiles p on p.id = u.id
order by u.created_at desc;

-- 2) Promovare (creează rândul din profiles dacă lipsește)
insert into public.profiles (id, full_name, role)
select id, coalesce(left(raw_user_meta_data ->> 'full_name', 120), ''), 'doctor'
from auth.users where email = lower('doctor.test@example.com')
on conflict (id) do update set role = 'doctor';

insert into public.medical_profiles (user_id)
select id from auth.users where email = lower('doctor.test@example.com')
on conflict (user_id) do nothing;

-- 3) Verificare
select u.email, p.role from public.profiles p join auth.users u on u.id = p.id where p.role = 'doctor';
