-- Drift-reconstructie: auto_apply en category_corrections_user_idx zijn ooit
-- rechtstreeks via het Supabase-dashboard op de tabel gezet en stonden daardoor
-- in GEEN enkele geregistreerde migratie. Daardoor reproduceerde een verse replay
-- (`supabase db reset` / CI) de remote-staat niet volledig. We leggen ze hier
-- idempotent vast, met een timestamp NA de CREATE (20260213122235) en VÓÓR de
-- IBAN-verruiming (20260611150000), zodat de keten van een lege DB af klopt en op
-- de bestaande remote een no-op is.

-- auto_apply: schakelaar of een leer-regel automatisch op nieuwe transacties mag
-- worden toegepast (default uit).
alter table public.category_corrections
  add column if not exists auto_apply boolean default false;

-- Non-unieke user-index voor lookups per gebruiker.
create index if not exists category_corrections_user_idx
  on public.category_corrections (user_id);
