-- Deelneming-specifieke kolommen voor assets tabel
-- Deze kolommen zijn alleen relevant voor asset_type='deelneming'

ALTER TABLE assets ADD COLUMN IF NOT EXISTS kvk_number text;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS ownership_percentage numeric;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS annual_dividend numeric;

COMMENT ON COLUMN assets.kvk_number IS 'KvK-nummer van de vennootschap (alleen voor asset_type=deelneming)';
COMMENT ON COLUMN assets.ownership_percentage IS 'Eigendomspercentage in de vennootschap, 0-100 (alleen voor asset_type=deelneming)';
COMMENT ON COLUMN assets.annual_dividend IS 'Verwacht jaarlijks dividend in EUR (alleen voor asset_type=deelneming)';
