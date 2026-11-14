-- WWHealth — data analizei pentru valorile de laborator confirmate (Medical Timeline / grafice de evoluție).
-- Data este cea scrisă în document (ex. „Data recoltării”), confirmată sau corectată de pacient; poate lipsi.
-- Aditiv: nu schimbă RLS / granturi. Backend-ul funcționează și înainte de aplicare (salvează fără dată).

alter table public.document_lab_values
  add column if not exists measured_at date
  check (measured_at is null or measured_at >= date '1990-01-01');

create index if not exists document_lab_values_user_idx on public.document_lab_values (user_id, measured_at);
