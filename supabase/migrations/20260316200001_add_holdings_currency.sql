-- Add currency column to holdings table for multi-currency support
-- Default 'EUR' for existing holdings (Dutch finance app)
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'EUR';

-- Add comment for documentation
COMMENT ON COLUMN holdings.currency IS 'ISO 4217 currency code of the holding price (e.g., EUR, USD, GBP). Detected from Yahoo Finance or set manually.';
