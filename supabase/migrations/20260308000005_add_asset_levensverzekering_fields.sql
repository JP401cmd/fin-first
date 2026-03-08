-- Add expiry_date and beneficiary fields for levensverzekering asset type
ALTER TABLE assets ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS beneficiary TEXT;

COMMENT ON COLUMN assets.expiry_date IS 'Einddatum/expiratiedatum van de polis, primair voor levensverzekeringen';
COMMENT ON COLUMN assets.beneficiary IS 'Begunstigde van de polis, primair voor levensverzekeringen';
