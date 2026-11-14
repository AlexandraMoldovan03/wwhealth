-- WWHealth — AI Medical Intelligence (rezumat generat cu Gemini din datele existente ale pacientului).
--
-- • medical_profiles.surgeries: intervenții chirurgicale structurate (până acum nu existau în schemă).
-- • ai_processing_consents: consimțământul EXPLICIT al pacientului pentru procesarea datelor prin Gemini.
--   Fără un consimțământ activ backend-ul nu trimite nimic către Gemini (nici pentru pacient, nici pentru medic).
-- • ai_medical_summaries: ULTIMUL rezumat validat, un singur rând per pacient (decizie explicită: păstrăm doar
--   ultima versiune, ca să afișăm data generării). Ștergere: butonul „Șterge rezumatul”, retragerea
--   consimțământului (trigger) sau ștergerea contului (on delete cascade).
-- • Medicul citește rezumatul salvat DOAR dacă are un acces activ care include TOATE secțiunile folosite
--   la generare (source_scopes). La expirare / revocare RLS nu mai returnează rândul.
-- • Nu atinge Emergency Passport, LungVision, OCR sau Medical Timeline.
-- Aditivă: depinde de 20261113000000_medical_core și 20261115000000_doctor_access_consent.

-- ─────────────────────────────────────────────────────────── intervenții chirurgicale
alter table public.medical_profiles
  add column if not exists surgeries jsonb not null default '[]'
  check (jsonb_typeof(surgeries) = 'array' and jsonb_array_length(surgeries) <= 50);

-- ─────────────────────────────────────────────────────────── consimțământ Gemini
create table public.ai_processing_consents (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  granted_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  version     text not null default 'v1' check (char_length(version) <= 20),
  check (revoked_at is null or revoked_at >= granted_at)
);

alter table public.ai_processing_consents enable row level security;
revoke all on public.ai_processing_consents from anon, authenticated;
grant select, insert, update on public.ai_processing_consents to authenticated;

create policy ai_consents_own_select on public.ai_processing_consents
  for select to authenticated using (user_id = (select auth.uid()));
create policy ai_consents_own_insert on public.ai_processing_consents
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy ai_consents_own_update on public.ai_processing_consents
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ─────────────────────────────────────────────────────────── ultimul rezumat
create table public.ai_medical_summaries (
  patient_id     uuid primary key references public.profiles (id) on delete cascade,
  content        jsonb not null check (jsonb_typeof(content) = 'object' and pg_column_size(content) <= 200000),
  source_scopes  text[] not null check (
                   cardinality(source_scopes) between 1 and 3
                   and source_scopes <@ array['profile', 'documents', 'labs']::text[]
                 ),
  model          text not null check (char_length(model) <= 80),
  generated_at   timestamptz not null default now()
);

alter table public.ai_medical_summaries enable row level security;
revoke all on public.ai_medical_summaries from anon, authenticated;
grant select, insert, update, delete on public.ai_medical_summaries to authenticated;

create policy ai_summaries_own_select on public.ai_medical_summaries
  for select to authenticated using (patient_id = (select auth.uid()));
create policy ai_summaries_own_insert on public.ai_medical_summaries
  for insert to authenticated with check (
    patient_id = (select auth.uid())
    and exists (select 1 from public.ai_processing_consents c
                where c.user_id = (select auth.uid()) and c.revoked_at is null)
  );
create policy ai_summaries_own_update on public.ai_medical_summaries
  for update to authenticated using (patient_id = (select auth.uid())) with check (
    patient_id = (select auth.uid())
    and exists (select 1 from public.ai_processing_consents c
                where c.user_id = (select auth.uid()) and c.revoked_at is null)
  );
create policy ai_summaries_own_delete on public.ai_medical_summaries
  for delete to authenticated using (patient_id = (select auth.uid()));

-- Medicul: doar cu acces activ pentru FIECARE secțiune din care a fost generat rezumatul.
create policy ai_summaries_doctor_select on public.ai_medical_summaries
  for select to authenticated using (
    not exists (
      select 1 from unnest(source_scopes) as s(scope)
      where not public.has_doctor_access(patient_id, s.scope)
    )
  );

-- Retragerea consimțământului șterge imediat rezumatul salvat.
create or replace function public.ai_consent_revoked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.revoked_at is not null and old.revoked_at is null then
    delete from public.ai_medical_summaries where patient_id = new.user_id;
  end if;
  return new;
end;
$$;

create trigger ai_consent_revoked
  after update of revoked_at on public.ai_processing_consents
  for each row execute function public.ai_consent_revoked();

-- Pentru medic: află DOAR dacă pacientul a consimțit la procesarea AI, și doar dacă are un acces activ la el.
create or replace function public.ai_consent_active(p_patient uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.ai_processing_consents c
    where c.user_id = p_patient and c.revoked_at is null
  )
  and (
    p_patient = auth.uid()
    or public.has_doctor_access(p_patient, 'profile')
    or public.has_doctor_access(p_patient, 'documents')
    or public.has_doctor_access(p_patient, 'labs')
  );
$$;

revoke execute on function public.ai_consent_active(uuid), public.ai_consent_revoked() from public, anon;
grant execute on function public.ai_consent_active(uuid) to authenticated;
