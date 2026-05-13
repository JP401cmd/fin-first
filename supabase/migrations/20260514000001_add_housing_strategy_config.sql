-- Add housing_strategy_config + housing_strategy_dismissed_at to profiles.
--
-- Models how the user's primary residence (asset type 'eigen_huis') interacts
-- with the FIRE projection. Four modes via discriminated union (see
-- lib/housing-strategy.ts for the TypeScript schema):
--
--   include_full     — default; eigen woning telt 100% mee in FIRE-pot
--                      (= huidige gedrag vóór deze migratie). Geen migratie-
--                      shock voor bestaande gebruikers.
--   exclude_from_fire — eigen woning + linked mortgage worden voor de FIRE-
--                      berekening weggefilterd; gebruiker blijft wonen.
--   downsize         — bij trigger (fixed_age | on_depletion) wordt het huis
--                      verkocht: opbrengst → liquide vermogen, oude hypotheek-
--                      cashflow stopt, nieuwe woonlast (huur of kleinere
--                      hypotheek) verschijnt als uitgave.
--   reverse_mortgage — bij trigger komt er maandelijks geld uit overwaarde
--                      (opeethypotheek/verzilverhypotheek); rente stapelt op
--                      schaduw-schuld.
--
-- housing_strategy_dismissed_at: timestamp van wanneer de gebruiker de
-- educatieve sheet bij eerste Horizon-bezoek heeft gezien/dismissed. NULL =
-- nog niet getoond → sheet verschijnt eenmaal bij volgende Horizon-bezoek
-- mits gebruiker een eigen_huis-asset heeft.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS housing_strategy_config jsonb NOT NULL
    DEFAULT '{"mode":"include_full"}'::jsonb;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS housing_strategy_dismissed_at timestamptz NULL;

COMMENT ON COLUMN profiles.housing_strategy_config IS
  'Strategie voor eigen woning in FIRE-projectie. Zie lib/housing-strategy.ts voor het discriminated-union schema.';

COMMENT ON COLUMN profiles.housing_strategy_dismissed_at IS
  'Wanneer de educatieve sheet bij eerste Horizon-bezoek is getoond/dismissed. NULL = nog niet getoond.';
