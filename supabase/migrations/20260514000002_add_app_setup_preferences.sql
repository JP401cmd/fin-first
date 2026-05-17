-- ─────────────────────────────────────────────────────────────
-- Migratie: App-setup voorkeuren
--
-- Voegt kolommen toe aan `profiles` om de keuzes uit de
-- AppSetupGate's vast te leggen voor de Holdings- en
-- Verhuurrendement-apps. Hypotheekplanner-strategie krijgt
-- een kolom op `debts` zodat hij per-mortgage werkt.
-- Budgetteren-setup heeft géén nieuwe kolommen nodig: de
-- gekozen template wordt direct als budget-rows geseed en de
-- gekozen rekening(en) via `assets.has_budget_tracking`.
--
-- Alle nieuwe kolommen zijn `NULL`-able zodat bestaande rijen
-- blijven werken zonder backfill — de setup-API zet ze pas
-- bij voltooien.
-- ─────────────────────────────────────────────────────────────

-- ── Aandelen-holdings voorkeuren ────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS aandelen_input_method text
    CHECK (aandelen_input_method IN ('manual', 'csv', 'api'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS aandelen_brokers jsonb;

COMMENT ON COLUMN public.profiles.aandelen_input_method IS
  'Hoe de gebruiker aandelen-posities invoert: manual/csv/api. Gezet door /api/aandelen-holdings/setup.';
COMMENT ON COLUMN public.profiles.aandelen_brokers IS
  'JSON-array van broker-ids waar de gebruiker belegt (degiro, bux, ibkr, ...). Gezet door /api/aandelen-holdings/setup.';

-- ── Crypto-holdings voorkeuren ──────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS crypto_input_method text
    CHECK (crypto_input_method IN ('manual', 'csv', 'api'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS crypto_sources jsonb;

COMMENT ON COLUMN public.profiles.crypto_input_method IS
  'Hoe de gebruiker crypto-posities invoert: manual/csv/api. Gezet door /api/crypto-holdings/setup.';
COMMENT ON COLUMN public.profiles.crypto_sources IS
  'JSON-array van exchange/wallet-ids waar crypto staat (bitvavo, ledger, ...). Gezet door /api/crypto-holdings/setup.';

-- ── Verhuurrendement rapportage-frequentie ──────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS rental_reporting_frequency text
    CHECK (rental_reporting_frequency IN ('monthly', 'quarterly', 'yearly'));

COMMENT ON COLUMN public.profiles.rental_reporting_frequency IS
  'Hoe vaak de gebruiker verhuurrendement wil reviewen. Gezet door /api/verhuurrendement/setup.';

-- ── Hypotheekplanner strategie ──────────────────────────────
-- Per-mortgage voorkeur — niet op profile, want een gebruiker kan in
-- theorie meerdere hypotheken hebben met verschillende strategieën.
ALTER TABLE public.debts
  ADD COLUMN IF NOT EXISTS hypotheekplanner_strategy text
    CHECK (hypotheekplanner_strategy IN ('aflossen', 'beleggen', 'mix'));

COMMENT ON COLUMN public.debts.hypotheekplanner_strategy IS
  'Aflos-strategie-voorkeur voor de Hypotheekplanner-app. Gezet door /api/hypotheekplanner/setup.';
