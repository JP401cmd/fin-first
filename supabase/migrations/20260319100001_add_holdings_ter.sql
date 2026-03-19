-- Add TER (Total Expense Ratio) fields to holdings table
-- TER is stored as a decimal (e.g., 0.0022 for 0.22%)
-- ter_source indicates how the TER was determined: 'manual', 'lookup', or null

ALTER TABLE holdings ADD COLUMN ter NUMERIC DEFAULT NULL;
ALTER TABLE holdings ADD COLUMN ter_source TEXT DEFAULT NULL;

-- Validation: TER must be between 0 and 0.10 (0% to 10%)
ALTER TABLE holdings ADD CONSTRAINT holdings_ter_range
  CHECK (ter IS NULL OR (ter >= 0 AND ter <= 0.10));

-- Validation: ter_source must be 'manual', 'lookup', or null
ALTER TABLE holdings ADD CONSTRAINT holdings_ter_source_values
  CHECK (ter_source IS NULL OR ter_source IN ('manual', 'lookup'));
