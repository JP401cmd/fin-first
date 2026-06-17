-- =============================================
-- Migration: Factor A (jaarlijkse werkgeverspensioen-aangroei) op `profiles`
--
-- Voegt twee kolommen toe op de per-gebruiker settings-tabel `profiles` om
-- "factor A" te persisteren: de jaarlijkse pensioenaangroei volgens het UPO
-- (de toename van de jaarlijkse pensioenuitkering, in EUR). Factor A wordt in
-- de jaarruimte-formule × 6,27 afgetrokken. Een zzp'er zonder pensioenregeling
-- heeft factor A = 0.
--
--   - `pension_factor_a` — jaarlijkse pensioenaangroei in EUR. Nullable + geen
--     default, omdat NULL ("onbekend / nog niet ingevuld") bewust verschilt van
--     0 ("expliciet géén werkgeverspensioen"). computeJaarruimte (box1 + tips)
--     consumeert dit als single source: het resolved getal dat de gebruiker in
--     de pensioen-strategie-modal invult (of via salaris-schatting laat bepalen).
--
--   - `pension_factor_a_source` — herkomst van het getal: 'upo' (rechtstreeks van
--     het UPO ingevoerd) of 'estimated' (uit een salaris-schatting afgeleid).
--     NULL als er nog niets is ingevuld. De CHECK staat NULL toe, vandaar de
--     `value IS NULL OR value IN (...)`-vorm (een kale `value IN (...)` zou NULLs
--     afwijzen).
--
-- EIGENAARSCHAP / RLS: factor A is privé en per persoon (geen huishoud-deling).
-- `profiles` heeft al RLS aan met de all-verbs eigen-rij policy
--   CREATE POLICY "Users can manage own profile" ON profiles FOR ALL USING (auth.uid() = id);
-- (zie 20260215000000_create_base_tables.sql). Die FOR ALL-policy dekt SELECT,
-- INSERT, UPDATE en DELETE op de eigen rij, dus een gebruiker kan zijn eigen
-- factor A lezen en bijwerken. Er is GEEN nieuwe policy nodig; nieuwe kolommen
-- erven de tabel-RLS. Partner/huishoud-factor-A is bewust out-of-scope.
--
-- IDEMPOTENCY: ADD COLUMN IF NOT EXISTS + DO-block guarded constraint.
-- =============================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pension_factor_a NUMERIC,
  ADD COLUMN IF NOT EXISTS pension_factor_a_source TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_pension_factor_a_source_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_pension_factor_a_source_check
      CHECK (
        pension_factor_a_source IS NULL
        OR pension_factor_a_source IN ('upo', 'estimated')
      );
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.pension_factor_a IS
  'Factor A: jaarlijkse werkgeverspensioen-aangroei in EUR (toename jaarlijkse pensioenuitkering volgens het UPO). Wordt in de jaarruimte-formule x 6,27 afgetrokken. NULL = onbekend/niet ingevuld (verschilt bewust van 0 = expliciet geen werkgeverspensioen, bv. zzp). Single source voor computeJaarruimte (box1 + tips).';
COMMENT ON COLUMN public.profiles.pension_factor_a_source IS
  'Herkomst van pension_factor_a: ''upo'' (rechtstreeks van het UPO ingevoerd) of ''estimated'' (afgeleid uit een salaris-schatting). NULL als leeg/niet ingevuld.';
