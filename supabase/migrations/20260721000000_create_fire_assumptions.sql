-- =============================================
-- Migration: FIRE-marktaannames (jaargelaagde override-laag)
-- Date: 2026-07-21
-- Source: Markt/aanname (redactioneel beheerd op /beheer/fiscale-kerngetallen)
-- =============================================
--
-- Optie 2 (DB-override met TS-fallback): de lange-termijn marktaannames onder de
-- FIRE-projecties -- verwacht rendement, inflatie en volatiliteit -- worden hier
-- PER JAAR beheerbaar. De TypeScript-constanten in lib/constants.ts
-- (DEFAULT_RETURN / INFLATION / DEFAULT_VOLATILITY) blijven de fallback: de pure
-- resolver lib/fire-assumptions.ts#resolveFireAssumptions leest een reeds
-- gequerierde set rijen (caller queryt, resolver consumeert -- zelfde scheiding
-- als lookupAowAge) en valt bij een ontbrekende jaarrij terug op die constanten.
-- Een LEGE tabel => 100% TS-fallback => byte-identiek aan het gedrag ervoor.
--
-- SWR wordt NOOIT opgeslagen: SWR = rendement - Box 3-drag - inflatie blijft puur
-- afgeleid (lib/fire-params.ts#computeEffectiveSwr) en beweegt mee met alle drie.

CREATE TABLE IF NOT EXISTS fire_assumptions (
  year            INTEGER PRIMARY KEY,
  expected_return NUMERIC NOT NULL,
  inflation       NUMERIC NOT NULL,
  volatility      NUMERIC NOT NULL,
  source          TEXT,
  is_definitive   BOOLEAN NOT NULL DEFAULT false,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE fire_assumptions IS
  'Jaargelaagde FIRE-marktaannames (verwacht rendement, inflatie, volatiliteit). Fallback = lib/constants.ts (DEFAULT_RETURN/INFLATION/DEFAULT_VOLATILITY) via resolveFireAssumptions. SWR wordt NIET opgeslagen (afgeleid: rendement - Box3-drag - inflatie). Beheer via /beheer/fiscale-kerngetallen; writes via service-role achter isSuperAdmin.';

ALTER TABLE fire_assumptions ENABLE ROW LEVEL SECURITY;

-- Alle ingelogde gebruikers mogen lezen: de FIRE-loaders (horizon/dashboard/core)
-- resolven de jaarlaag server-side als onderdeel van de normale datalaadflow
-- (spiegelt de leespolicy van aow_leeftijd).
CREATE POLICY "Authenticated users can read fire_assumptions" ON fire_assumptions
  FOR SELECT TO authenticated USING (true);

-- BEWUST GEEN insert/update/delete-policy: schrijven loopt uitsluitend via de
-- service-role achter de isSuperAdmin-gate in app/api/admin/fire-assumptions
-- (ADR 0006). Zonder write-policy zijn mutaties voor anon/authenticated-clients
-- RLS-geblokkeerd -- dat is de bedoeling.

-- Seed het actieve belastingjaar met de HUIDIGE TS-default-waarden, zodat de
-- override-laag byte-identiek start (resolver geeft exact DEFAULT_RETURN/INFLATION/
-- DEFAULT_VOLATILITY terug) en de beheerpagina meteen een concrete, bewerkbare
-- baseline toont. Zodra een jaarrij bestaat, WINT die van de TS-constante -- dat is
-- de override-semantiek (de DB wordt de bron voor dat jaar).
INSERT INTO fire_assumptions (year, expected_return, inflation, volatility, source, is_definitive) VALUES
  (2026, 0.07, 0.02, 0.15, 'TriFinity model-aanname (baseline = lib/constants.ts)', false)
ON CONFLICT (year) DO NOTHING;
