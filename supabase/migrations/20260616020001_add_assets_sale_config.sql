-- Add sale_config to assets: per-bezitting instelbare verkoop/liquidatie-strategie
-- voor niet-liquide bezittingen in de FIRE-prognose.
--
-- Tot nu toe was de verkoop-/liquidatiestrategie van een niet-liquide bezitting
-- (bijv. eigen huis, deelneming) impliciet of centraal geregeld. Met deze kolom
-- wordt die strategie op de bezitting zelf instelbaar: {stand: niet_verkopen |
-- vast_moment | wanneer_nodig, ...}.
--
-- Bewust NULLABLE en GEEN DB-default: de resolve-default 'wanneer_nodig' leeft in
-- de parser-laag (lib/asset-data.ts), niet als opgeslagen waarde. Geen backfill van
-- bestaande rijen — NULL betekent simpelweg "gebruik de parser-default". Dit houdt
-- het schema vrij van een betekenis die alleen de applicatie kent, en voorkomt een
-- migratie-shock voor bestaande bezittingen.
--
-- Geen FK (config-blob, geen relatie) en geen index (we filteren niet op deze kolom).
--
-- RLS: assets heeft al een rij-gescopede policy ("Users can manage own assets",
-- FOR ALL USING auth.uid() = user_id). RLS werkt per RIJ, niet per kolom, dus een
-- nieuwe kolom valt automatisch onder dezelfde eigenaarscheck — net als bij eerdere
-- additieve kolommen (linked_asset_id, levensverzekering/deelneming-velden). Geen
-- nieuwe policy nodig.

ALTER TABLE assets ADD COLUMN IF NOT EXISTS sale_config jsonb;

COMMENT ON COLUMN assets.sale_config IS 'Verkoop/liquidatie-strategie van een niet-liquide bezitting in de FIRE-prognose: {stand: niet_verkopen|vast_moment|wanneer_nodig, ...}. NULL = resolve-default wanneer_nodig (parser-laag, geen backfill).';
