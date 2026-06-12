-- BUG-FIX: category_corrections.budget_id verwees met ON DELETE NO ACTION naar
-- budgets(id) en was NOT NULL — de enige outlier; alle andere budget-FK's zijn
-- CASCADE of SET NULL. Gevolg: een budget verwijderen faalde zodra er een
-- leer-regel naar verwees. Gewenst gedrag (requirements + architect): de
-- leer-regel BLIJFT bestaan met budget_id = NULL (kennis behouden, doelwit los).
-- Conventie: budget-referenties = ON DELETE SET NULL.
--
-- De tabel zelf (canonieke CREATE + RLS + indexen) staat in
-- 20260213122235_add_category_corrections.sql; de IBAN-verruiming van de
-- check-constraint in 20260611150000_category_corrections_allow_iban.sql.
-- Hier doen we alléén de FK/NOT-NULL-fix.

-- budget_id nullable maken.
alter table public.category_corrections
  alter column budget_id drop not null;

-- FK herdefiniëren als ON DELETE SET NULL.
alter table public.category_corrections
  drop constraint if exists category_corrections_budget_id_fkey;

alter table public.category_corrections
  add constraint category_corrections_budget_id_fkey
  foreign key (budget_id) references budgets(id) on delete set null;
