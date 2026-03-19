-- Add marginaal_tarief column for hypotheekrenteaftrek calculations
-- Stores the marginal income tax rate: 0.3697 (36.97%) or 0.4950 (49.50%)
-- NULL means "automatic" (derived from income)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS marginaal_tarief numeric DEFAULT NULL;
