-- WWHealth — valori de laborator confirmate de utilizator (AI Medical Document Scanner, MVP).
-- Valorile sunt extrase LOCAL din PDF-uri digitale, verificate/editate de utilizator și abia apoi salvate.
-- Se păstrează exact textul din document (value/unit/reference_range ca text) — fără interpretare.
-- NU presupune că a fost aplicată: backend-ul răspunde 503 „storage not set up” până la rulare.

create table public.document_lab_values (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  document_id      uuid not null references public.medical_documents (id) on delete cascade,
  position         integer not null default 0,
  name             text not null check (char_length(name) between 1 and 80),
  value            text not null check (char_length(value) between 1 and 20),
  unit             text check (unit is null or char_length(unit) <= 20),
  reference_range  text check (reference_range is null or char_length(reference_range) <= 40),
  source_line      text check (source_line is null or char_length(source_line) <= 200),
  created_at       timestamptz not null default now()
);

create index document_lab_values_doc_idx on public.document_lab_values (document_id, position);

alter table public.document_lab_values enable row level security;
revoke all on public.document_lab_values from anon;
revoke update on public.document_lab_values from authenticated;

-- Doar proprietarul, și doar pentru documentele lui.
create policy "lab_values: read own" on public.document_lab_values
  for select to authenticated using (user_id = (select auth.uid()));
create policy "lab_values: insert own" on public.document_lab_values
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.medical_documents d where d.id = document_id and d.user_id = (select auth.uid()))
  );
create policy "lab_values: delete own" on public.document_lab_values
  for delete to authenticated using (user_id = (select auth.uid()));
