-- WWHealth — schema minimă Supabase (PROPUNERE, neaplicată).
-- profiles · medical_profiles · medical_documents · lungvision_analyses
-- + bucket privat `medical-documents` + RLS pe utilizator.
--
-- Auth: Supabase Auth (auth.users). FastAPI validează JWT-ul Supabase și accesează datele
-- cu token-ul utilizatorului, deci RLS se aplică și pe drumul prin backend.

-- ─────────────────────────────────────────────────────────── helpers
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────── profiles
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '' check (char_length(full_name) <= 120),
  role        text not null default 'patient' check (role in ('patient', 'doctor')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────── medical_profiles (1:1 cu profiles)
-- Listele păstrează forma actuală din API (Allergy / Diagnosis / Treatment) → fără refactor în app.
create table public.medical_profiles (
  user_id            uuid primary key references public.profiles (id) on delete cascade,
  date_of_birth      date,
  sex                text check (sex in ('female', 'male', 'other')),
  blood_type         text check (blood_type in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  height_cm          numeric(5, 1) check (height_cm between 30 and 260),
  weight_kg          numeric(5, 1) check (weight_kg between 1 and 400),
  emergency_contact  jsonb,
  allergies          jsonb not null default '[]' check (jsonb_typeof(allergies) = 'array'),
  conditions         jsonb not null default '[]' check (jsonb_typeof(conditions) = 'array'),
  medications        jsonb not null default '[]' check (jsonb_typeof(medications) = 'array'),
  updated_at         timestamptz not null default now()
);

create trigger medical_profiles_updated_at before update on public.medical_profiles
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────── medical_documents
-- Fișierul stă în Storage la `<user_id>/<id>.<ext>`; aici doar metadatele.
create table public.medical_documents (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  title          text not null check (char_length(title) between 1 and 120),
  document_type  text not null default 'other'
                 check (document_type in ('lab_result', 'prescription', 'discharge_summary', 'imaging_report', 'other')),
  storage_path   text not null unique check (storage_path like user_id::text || '/%'),
  mime_type      text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes     integer not null check (size_bytes between 1 and 10485760),
  uploaded_at    timestamptz not null default now()
);

create index medical_documents_user_idx on public.medical_documents (user_id, uploaded_at desc);

-- ─────────────────────────────────────────────────────────── lungvision_analyses
-- Doar rezultatul (scor, prag). Imaginea NU se salvează implicit → image_path/heatmap_path rămân null
-- dacă utilizatorul nu alege explicit să păstreze imaginea.
create table public.lungvision_analyses (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  score               real not null check (score between 0 and 1),
  threshold           real not null check (threshold between 0 and 1),
  above_threshold     boolean not null,
  model_version       text not null,
  processing_time_ms  integer check (processing_time_ms >= 0),
  image_path          text check (image_path is null or image_path like user_id::text || '/%'),
  heatmap_path        text check (heatmap_path is null or heatmap_path like user_id::text || '/%'),
  created_at          timestamptz not null default now()
);

create index lungvision_analyses_user_idx on public.lungvision_analyses (user_id, created_at desc);

-- ─────────────────────────────────────────────────────────── profil creat automat la sign-up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(left(new.raw_user_meta_data ->> 'full_name', 120), ''),
    -- metadata vine de la client: orice altceva decât 'doctor' devine 'patient'
    case when new.raw_user_meta_data ->> 'role' = 'doctor' then 'doctor' else 'patient' end
  );
  insert into public.medical_profiles (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────── RLS: fiecare utilizator vede doar ale lui
alter table public.profiles            enable row level security;
alter table public.medical_profiles    enable row level security;
alter table public.medical_documents   enable row level security;
alter table public.lungvision_analyses enable row level security;

-- anon nu are acces deloc la date medicale
revoke all on public.profiles, public.medical_profiles, public.medical_documents, public.lungvision_analyses from anon;

-- profiles: citire/editare proprie; `role` nu poate fi schimbat de utilizator
create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke insert, update, delete on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

-- medical_profiles
create policy "medical_profiles: read own" on public.medical_profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy "medical_profiles: insert own" on public.medical_profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "medical_profiles: update own" on public.medical_profiles
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke delete on public.medical_profiles from authenticated;

-- medical_documents (imutabile: fără update)
create policy "medical_documents: read own" on public.medical_documents
  for select to authenticated using (user_id = (select auth.uid()));
create policy "medical_documents: insert own" on public.medical_documents
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "medical_documents: delete own" on public.medical_documents
  for delete to authenticated using (user_id = (select auth.uid()));
revoke update on public.medical_documents from authenticated;

-- lungvision_analyses (imutabile: fără update)
create policy "lungvision: read own" on public.lungvision_analyses
  for select to authenticated using (user_id = (select auth.uid()));
create policy "lungvision: insert own" on public.lungvision_analyses
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "lungvision: delete own" on public.lungvision_analyses
  for delete to authenticated using (user_id = (select auth.uid()));
revoke update on public.lungvision_analyses from authenticated;

-- ─────────────────────────────────────────────────────────── Storage privat
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('medical-documents', 'medical-documents', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- Primul segment din cale = id-ul utilizatorului: `<auth.uid()>/<fișier>`
create policy "medical-documents: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'medical-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "medical-documents: upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'medical-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "medical-documents: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'medical-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- fără policy de update → fișierele nu pot fi suprascrise
