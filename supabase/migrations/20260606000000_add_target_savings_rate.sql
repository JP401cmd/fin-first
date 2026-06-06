-- Doel-spaarquote (target savings rate) voor het cashflow-instellingen-blok.
-- In procenten (0-100). NULL = gebruiker heeft geen doel ingesteld.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS target_savings_rate numeric;
COMMENT ON COLUMN profiles.target_savings_rate IS 'Door gebruiker ingesteld doel-spaarquote in procenten (0-100), NULL = geen doel.';
