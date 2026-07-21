-- ============================================================
-- [Arch F3] AVG-rechten — FK ON DELETE-hardening voor account-verwijdering
--
-- Achtergrond (Enterprise-architectuurreview 3 jul 2026, bevinding #18):
-- `admin.deleteUser()` (het AVG-verwijderrecht) kan technisch FALEN wanneer
-- rijen met een FK → auth.users een ON DELETE NO ACTION hebben en niet vooraf
-- door de app-laag (deleteAllUserData) gewist zijn. Deze migratie geeft die FK's
-- een expliciet, AVG-correct verwijdergedrag:
--
--   * Eigen-data (financieel/persoonlijk) → ON DELETE CASCADE:
--     DB-cascade als VANGNET naast deleteAllUserData, zodat een deels-gefaalde
--     app-wipe de auth-delete niet alsnog blokkeert en er geen orphan-UUID
--     achterblijft.
--
--   * Historie/grootboek/audit-verwijzingen → ON DELETE SET NULL:
--     de rij (bedrag/uitkomst) blijft bestaan voor de achterblijvende partij,
--     maar de identifier van de vertrekkende gebruiker verdwijnt (anonimisering).
--     Dit is de door de eigenaar goedgekeurde huishouden-keuze ("beide akkoord":
--     settlement_entries anonimiseren i.p.v. hard verwijderen, bedrag behouden
--     voor het grootboek van de achterblijvende partner).
--
-- Idempotent: DROP CONSTRAINT IF EXISTS gevolgd door ADD. Bestaande rijen
-- voldoen al aan de referentie (alleen het ON DELETE-gedrag wijzigt), dus de
-- her-toevoeging valideert zonder herstel.
--
-- NB (migratie-drift): dit dossier is zelf een symptoom van drift. Deze migratie
-- hoort op remote ÉN in de repo toegepast te worden; het remote-applyen is een
-- release-/productie-actie buiten de drain.
-- ============================================================

-- ── 1. Eigen-data-FK's → ON DELETE CASCADE (vangnet + orphan-preventie) ──────
-- assets/debts/bank_*/category_corrections/goal_contributions stonden op
-- NO ACTION en blokkeerden een auth-delete zodra de app-wipe deels faalde.

ALTER TABLE public.assets DROP CONSTRAINT IF EXISTS assets_user_id_fkey;
ALTER TABLE public.assets ADD CONSTRAINT assets_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.debts DROP CONSTRAINT IF EXISTS debts_user_id_fkey;
ALTER TABLE public.debts ADD CONSTRAINT debts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.bank_connections DROP CONSTRAINT IF EXISTS bank_connections_user_id_fkey;
ALTER TABLE public.bank_connections ADD CONSTRAINT bank_connections_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.bank_connection_accounts DROP CONSTRAINT IF EXISTS bank_connection_accounts_user_id_fkey;
ALTER TABLE public.bank_connection_accounts ADD CONSTRAINT bank_connection_accounts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.bank_sync_log DROP CONSTRAINT IF EXISTS bank_sync_log_user_id_fkey;
ALTER TABLE public.bank_sync_log ADD CONSTRAINT bank_sync_log_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.category_corrections DROP CONSTRAINT IF EXISTS category_corrections_user_id_fkey;
ALTER TABLE public.category_corrections ADD CONSTRAINT category_corrections_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.goal_contributions DROP CONSTRAINT IF EXISTS goal_contributions_user_id_fkey;
ALTER TABLE public.goal_contributions ADD CONSTRAINT goal_contributions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ── 2. Grootboek/audit-FK's → ON DELETE SET NULL (anonimiseren) ──────────────

-- settlement_entries: onderlinge verrekeningen in een huishouden. from/to_user_id
-- waren NOT NULL — voor anonimisering moeten ze NULL-baar worden. Het bedrag en
-- de tegenpartij-rij blijven behouden zodat het saldo van de achterblijvende
-- partner klopt; alleen de identifier van de vertrekkende gebruiker verdwijnt.
ALTER TABLE public.settlement_entries ALTER COLUMN from_user_id DROP NOT NULL;
ALTER TABLE public.settlement_entries ALTER COLUMN to_user_id DROP NOT NULL;

ALTER TABLE public.settlement_entries DROP CONSTRAINT IF EXISTS settlement_entries_from_user_id_fkey;
ALTER TABLE public.settlement_entries ADD CONSTRAINT settlement_entries_from_user_id_fkey
  FOREIGN KEY (from_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.settlement_entries DROP CONSTRAINT IF EXISTS settlement_entries_to_user_id_fkey;
ALTER TABLE public.settlement_entries ADD CONSTRAINT settlement_entries_to_user_id_fkey
  FOREIGN KEY (to_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.settlement_entries.from_user_id IS
  'Betalende partij. NULL-baar sinds AVG-anonimisering (ON DELETE SET NULL): bij accountverwijdering blijft de post bestaan voor het grootboek van de tegenpartij, maar verdwijnt de identifier van de vertrokken gebruiker.';
COMMENT ON COLUMN public.settlement_entries.to_user_id IS
  'Ontvangende partij. NULL-baar sinds AVG-anonimisering (ON DELETE SET NULL): zie from_user_id.';

-- app_settings.updated_by: audit-kolom (wie wijzigde een globale setting). Al
-- NULL-baar; SET NULL zodat een auth-delete van die actor niet blokkeert.
ALTER TABLE public.app_settings DROP CONSTRAINT IF EXISTS app_settings_updated_by_fkey;
ALTER TABLE public.app_settings ADD CONSTRAINT app_settings_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- uat_results.tester / uat_rounds.created_by: UAT-audit. Al NULL-baar; SET NULL
-- zodat het verwijderen van een account dat ooit UAT draaide niet blokkeert.
ALTER TABLE public.uat_results DROP CONSTRAINT IF EXISTS uat_results_tester_fkey;
ALTER TABLE public.uat_results ADD CONSTRAINT uat_results_tester_fkey
  FOREIGN KEY (tester) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.uat_rounds DROP CONSTRAINT IF EXISTS uat_rounds_created_by_fkey;
ALTER TABLE public.uat_rounds ADD CONSTRAINT uat_rounds_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── 3. actions.assigned_to/assigned_by (defensief) ───────────────────────────
-- De oorspronkelijke kaart-premisse #1 noemde deze partner-toewijzingskolommen,
-- maar de migratie die ze introduceert (20260308000003) is NOOIT op remote
-- toegepast: de kolommen bestaan vandaag niet. Deze DO-block is daarom een no-op
-- op de huidige DB, maar borgt dat — mocht de partner-toewijzing ooit live gaan —
-- de FK's meteen op ON DELETE SET NULL staan (behoud van de actie, anonimiseren
-- van de toegewezen/toewijzende partner) i.p.v. NO ACTION.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'actions' AND column_name = 'assigned_to'
  ) THEN
    ALTER TABLE public.actions DROP CONSTRAINT IF EXISTS actions_assigned_to_fkey;
    ALTER TABLE public.actions ADD CONSTRAINT actions_assigned_to_fkey
      FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'actions' AND column_name = 'assigned_by'
  ) THEN
    ALTER TABLE public.actions DROP CONSTRAINT IF EXISTS actions_assigned_by_fkey;
    ALTER TABLE public.actions ADD CONSTRAINT actions_assigned_by_fkey
      FOREIGN KEY (assigned_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;
