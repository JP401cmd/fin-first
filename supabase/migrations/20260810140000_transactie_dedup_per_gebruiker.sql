-- Transactie-ontdubbeling per gebruiker in plaats van globaal.
--
-- PROBLEEM
-- De dedup-index op `investment_transactions` en `crypto_transactions` stond op
-- (external_source, external_trade_id) ZONDER user_id. Dat maakt de sleutel
-- globaal: zodra twee gebruikers dezelfde broker gebruiken en die broker een
-- kort, niet-globaal-uniek id levert — Trading 212 nummert 'T-001', eToro geeft
-- een korte numerieke Position ID — dan botst de import van de tweede gebruiker
-- op de rij van de eerste. De import-route upsert met `ignoreDuplicates: true`,
-- dus die rij verdwijnt STIL: geen fout, geen melding, gewoon een transactie die
-- er nooit is gekomen en een positie die daarna te laag staat.
--
-- Het wordt urgent door de overlappende-upload-fix: die leidt een dedup-sleutel
-- af uit de inhoud van de rij (datum, instrument, soort, aantal, prijs) wanneer
-- de broker geen id levert. Twee gebruikers die op dezelfde dag hetzelfde fonds
-- voor dezelfde prijs kopen krijgen dan per definitie dezelfde sleutel.
--
-- FIX
-- user_id vooraan in de unieke index. Ontdubbelen hoort binnen één gebruiker te
-- gebeuren; tussen gebruikers valt er niets te ontdubbelen.
--
-- VEILIG HERBOUWBAAR: de nieuwe sleutel is een SUPERSET van de oude. Alles wat
-- onder de oude (smallere) index paste, past onder de nieuwe — het opnieuw
-- aanmaken kan dus niet op bestaande data stuklopen.
--
-- De aanroepers moeten meebewegen: PostgREST's `onConflict` moet exact de
-- kolommen van de index noemen. Zie app/api/holdings/import/route.ts en
-- lib/integrations/exchange-sync.ts.

-- ── investment_transactions ──────────────────────────────────────────
DROP INDEX IF EXISTS public.investment_tx_dedup_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS investment_tx_dedup_uidx
  ON public.investment_transactions (user_id, external_source, external_trade_id)
  WHERE external_source IS NOT NULL;

COMMENT ON INDEX public.investment_tx_dedup_uidx IS
  'Ontdubbeling van broker-imports, per gebruiker. user_id staat vooraan omdat broker-trade-ids (Trading 212, eToro) niet globaal uniek zijn.';

-- ── crypto_transactions ──────────────────────────────────────────────
-- Zelfde defect, andere tabel: de exchange-sync upsert op dezelfde sleutel.
DROP INDEX IF EXISTS public.crypto_tx_dedup_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS crypto_tx_dedup_uidx
  ON public.crypto_transactions (user_id, external_source, external_trade_id)
  WHERE external_source IS NOT NULL;

COMMENT ON INDEX public.crypto_tx_dedup_uidx IS
  'Ontdubbeling van exchange-syncs, per gebruiker. Spiegelt investment_tx_dedup_uidx.';
