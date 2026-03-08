-- Add belastingschuld-specific columns to debts table
ALTER TABLE debts ADD COLUMN IF NOT EXISTS tax_year integer;
ALTER TABLE debts ADD COLUMN IF NOT EXISTS has_payment_plan boolean DEFAULT false;

COMMENT ON COLUMN debts.tax_year IS 'Belastingjaar waarop de schuld betrekking heeft (bijv. 2024)';
COMMENT ON COLUMN debts.has_payment_plan IS 'Of er een betalingsregeling met de Belastingdienst is afgesproken';
