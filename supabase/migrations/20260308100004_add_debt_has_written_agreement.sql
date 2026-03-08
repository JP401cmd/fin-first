-- Add has_written_agreement column for familielening debt type
ALTER TABLE debts ADD COLUMN IF NOT EXISTS has_written_agreement boolean DEFAULT false;

COMMENT ON COLUMN debts.has_written_agreement IS 'Whether a written agreement exists for this debt (relevant for familielening/onderhandse lening)';
