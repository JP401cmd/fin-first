-- Add linked_asset_id to assets for DGA-lening -> deelneming linking
ALTER TABLE assets ADD COLUMN IF NOT EXISTS linked_asset_id UUID REFERENCES assets(id) ON DELETE SET NULL;

COMMENT ON COLUMN assets.linked_asset_id IS 'Koppeling naar gerelateerde asset, bijv. DGA-lening vordering naar deelneming';
