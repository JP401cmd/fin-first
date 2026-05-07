-- =============================================
-- Migration: Aangifte-import profile fields
--
-- Adds three new columns on `profiles` that the aangifte-import flow needs
-- to map Box 1 income components (loon, AOW, pensioen, uitkering, winst)
-- onto the user's profile:
--
--   - `gross_annual_income` — bruto jaarloon from the jaaropgaaf. The
--     existing `net_monthly_income` column tracks net take-home, which is
--     useful for budget projections but not for FIRE/Box-3 calculations
--     that need gross figures. Nullable + no default so we can distinguish
--     "user hasn't told us yet" from "0".
--
--   - `aow_active` — boolean flag set when the user confirms they
--     receive AOW. The actual AOW amount is constant (NL_AOW_MONTHLY in
--     lib/horizon-data.ts), so we don't store the bedrag — only whether
--     the FIRE simulation should add it.
--
--   - `income_type` — categorical: employee / self_employed / mixed /
--     pension / unemployed. Used by the simulation engine to pick the
--     correct tax + savings-rate assumptions.
--
-- The CHECK constraint allows NULL (user not yet onboarded for income),
-- which is why it is `value IN (...) OR value IS NULL`. The pure
-- `value IN (...)` form would reject NULLs.
--
-- IDEMPOTENCY: ADD COLUMN IF NOT EXISTS + DO-block guarded constraint.
-- =============================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gross_annual_income NUMERIC,
  ADD COLUMN IF NOT EXISTS aow_active BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS income_type TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_income_type_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_income_type_check
      CHECK (
        income_type IS NULL
        OR income_type IN ('employee', 'self_employed', 'mixed', 'pension', 'unemployed')
      );
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.gross_annual_income IS
  'Bruto jaarloon in EUR, sourced from the jaaropgaaf during aangifte-import or set manually. NULL means not yet captured. Used by FIRE simulation and Box 3 calculations that need gross figures (net_monthly_income covers the net side).';
COMMENT ON COLUMN public.profiles.aow_active IS
  'Whether the user currently receives AOW (state pension). The bedrag itself is constant (NL_AOW_MONTHLY), so we only store the boolean toggle.';
COMMENT ON COLUMN public.profiles.income_type IS
  'Categorisation of the primary income source: employee, self_employed, mixed, pension, unemployed. NULL until the user has confirmed it during onboarding or aangifte-import.';
