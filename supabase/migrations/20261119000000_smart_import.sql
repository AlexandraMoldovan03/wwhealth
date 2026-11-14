-- WWHealth — Smart Medical Record: Universal Smart Import + Document Library.
-- NU presupune că a fost aplicată: backend-ul răspunde 503 „smart import not set up” până la rulare
-- (upload-ul clasic de documente și restul aplicației funcționează și fără ea).
-- Aditiv: tabelele existente rămân compatibile; nicio politică existentă nu este relaxată.
--
--   medical_documents  + metadate (categorie, specialitate, dată eveniment, instituție, hash, status, demo)
--                      + update DOAR pe coloanele editabile (titlu / categorie / ...), doar de proprietar
--   document_imports   un rând per (utilizator, hash SHA-256, versiune pipeline) = cache + istoric + preview
--   document_facts     datele CONFIRMATE de pacient (diagnostice, medicație istorică, proceduri, ...) cu sursă
--   ai_usage_log       consum Gemini (tokeni / cost estimat) — fără conținut medical

-- ─────────────────────────────────────────────────────────── medical_documents: metadate noi
alter table public.medical_documents
  add column if not exists original_filename text check (original_filename is null or char_length(original_filename) <= 200),
  add column if not exists content_sha256    text check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$'),
  add column if not exists specialty         text check (specialty is null or char_length(specialty) <= 40),
  add column if not exists event_date        date check (event_date is null or event_date >= date '1900-01-01'),
  add column if not exists document_date     date check (document_date is null or document_date >= date '1900-01-01'),
  add column if not exists institution       text check (institution is null or char_length(institution) <= 160),
  add column if not exists processing_status text not null default 'uploaded'
        check (processing_status in ('uploaded', 'processing', 'needs_review', 'confirmed', 'failed')),
  add column if not exists is_demo           boolean not null default false,
  add column if not exists updated_at        timestamptz;

-- Categorii noi de document (cele vechi rămân valide).
alter table public.medical_documents drop constraint if exists medical_documents_document_type_check;
alter table public.medical_documents add constraint medical_documents_document_type_check
  check (document_type in ('lab_result', 'prescription', 'discharge_summary', 'imaging_report', 'other',
                           'consultation', 'trauma', 'surgery', 'vaccination'));

-- Formate noi: FHIR JSON / NDJSON și CSV (originalul se păstrează ca atare).
alter table public.medical_documents drop constraint if exists medical_documents_mime_type_check;
alter table public.medical_documents add constraint medical_documents_mime_type_check
  check (mime_type in ('application/pdf', 'image/jpeg', 'image/png',
                       'application/fhir+json', 'application/x-ndjson', 'text/csv'));

-- Același fișier o singură dată per utilizator (importuri repetate = idempotente).
create unique index if not exists medical_documents_user_sha_uidx
  on public.medical_documents (user_id, content_sha256) where content_sha256 is not null;
create index if not exists medical_documents_user_event_idx on public.medical_documents (user_id, event_date desc);

-- Update doar pe coloanele editabile și doar de proprietar. storage_path / user_id / mime / hash rămân imuabile.
grant update (title, document_type, specialty, event_date, document_date, institution, processing_status, updated_at)
  on public.medical_documents to authenticated;
create policy "medical_documents: update own metadata" on public.medical_documents
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Bucket: aceleași reguli de acces, tipuri noi de fișier.
update storage.buckets
   set allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png',
                                  'application/fhir+json', 'application/x-ndjson', 'text/csv']
 where id = 'medical-documents';

-- ─────────────────────────────────────────────────────────── document_imports (cache + preview + istoric)
create table if not exists public.document_imports (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  document_id      uuid references public.medical_documents (id) on delete set null,
  content_sha256   text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  pipeline_version text not null check (char_length(pipeline_version) between 1 and 20),
  source_format    text not null check (source_format in ('pdf_text', 'pdf_scanned', 'image', 'fhir_json', 'fhir_ndjson', 'csv')),
  original_filename text check (original_filename is null or char_length(original_filename) <= 200),
  status           text not null default 'preview'
                   check (status in ('preview', 'confirmed', 'rejected', 'failed')),
  method           text not null check (method in ('local', 'gemini', 'local_fallback')),
  model            text check (model is null or char_length(model) <= 60),
  extraction       jsonb not null default '{}'::jsonb,   -- rezultatul structurat (cu sursă per element)
  identity         jsonb not null default '{}'::jsonb,   -- rezultatul verificării identității (fără CNP complet)
  duplicates       jsonb not null default '[]'::jsonb,
  contradictions   jsonb not null default '[]'::jsonb,
  history          jsonb not null default '[]'::jsonb,   -- [{at, action, fields}] — cine/ce a corectat
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  confirmed_at     timestamptz,
  unique (user_id, content_sha256, pipeline_version)
);
create index if not exists document_imports_user_idx on public.document_imports (user_id, created_at desc);
create index if not exists document_imports_doc_idx on public.document_imports (document_id);

alter table public.document_imports enable row level security;
revoke all on public.document_imports from anon;
create policy "document_imports: read own" on public.document_imports
  for select to authenticated using (user_id = (select auth.uid()));
create policy "document_imports: insert own" on public.document_imports
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and (document_id is null or exists (
      select 1 from public.medical_documents d where d.id = document_id and d.user_id = (select auth.uid())))
  );
create policy "document_imports: update own" on public.document_imports
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "document_imports: delete own" on public.document_imports
  for delete to authenticated using (user_id = (select auth.uid()));

-- ─────────────────────────────────────────────────────────── document_facts (date confirmate, cu proveniență)
create table if not exists public.document_facts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  document_id    uuid not null references public.medical_documents (id) on delete cascade,
  import_id      uuid references public.document_imports (id) on delete set null,
  kind           text not null check (kind in ('diagnosis', 'symptom', 'medication', 'allergy', 'procedure',
                                               'investigation', 'recommendation', 'follow_up', 'vaccination', 'reason')),
  label          text not null check (char_length(label) between 1 and 200),
  detail         text check (detail is null or char_length(detail) <= 400),
  -- diagnostic: confirmed / suspected / ruled_out / history; medicație: historical / at_discharge / during_stay / prior
  status         text check (status is null or char_length(status) <= 20),
  value          jsonb not null default '{}'::jsonb,   -- coduri FHIR (coding), doză etc.
  event_date     date check (event_date is null or event_date >= date '1900-01-01'),
  source_page    integer check (source_page is null or source_page between 1 and 500),
  source_excerpt text check (source_excerpt is null or char_length(source_excerpt) <= 300),
  fingerprint    text not null check (char_length(fingerprint) between 8 and 80),
  edited         boolean not null default false,       -- corectat de pacient față de extracție
  created_at     timestamptz not null default now(),
  unique (document_id, fingerprint)
);
create index if not exists document_facts_user_idx on public.document_facts (user_id, kind, event_date desc);

alter table public.document_facts enable row level security;
revoke all on public.document_facts from anon;
revoke update on public.document_facts from authenticated;   -- o corecție = ștergere + reinserare la confirmare
create policy "document_facts: read own" on public.document_facts
  for select to authenticated using (user_id = (select auth.uid()));
create policy "document_facts: insert own" on public.document_facts
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.medical_documents d where d.id = document_id and d.user_id = (select auth.uid()))
  );
create policy "document_facts: delete own" on public.document_facts
  for delete to authenticated using (user_id = (select auth.uid()));
-- Medicul vede faptele doar cu acordul pacientului pentru secțiunea „documents” (aceeași regulă ca fișierele).
create policy "document_facts: doctor reads with consent" on public.document_facts
  for select to authenticated using ((select public.has_doctor_access(user_id, 'documents')));

-- ─────────────────────────────────────────────────────────── ai_usage_log (fără PHI)
create table if not exists public.ai_usage_log (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  feature        text not null check (feature in ('document_import', 'summary', 'insights')),
  model          text not null check (char_length(model) <= 60),
  prompt_tokens  integer not null default 0 check (prompt_tokens >= 0),
  output_tokens  integer not null default 0 check (output_tokens >= 0),
  est_cost_usd   numeric(10, 6) not null default 0 check (est_cost_usd >= 0),
  status         text not null check (status in ('ok', 'invalid', 'error', 'timeout', 'rate_limited', 'skipped_budget')),
  created_at     timestamptz not null default now()
);
create index if not exists ai_usage_log_user_idx on public.ai_usage_log (user_id, created_at desc);

alter table public.ai_usage_log enable row level security;
revoke all on public.ai_usage_log from anon;
revoke update, delete on public.ai_usage_log from authenticated;
create policy "ai_usage_log: read own" on public.ai_usage_log
  for select to authenticated using (user_id = (select auth.uid()));
create policy "ai_usage_log: insert own" on public.ai_usage_log
  for insert to authenticated with check (user_id = (select auth.uid()));
