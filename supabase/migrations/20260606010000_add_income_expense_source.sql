-- Override-bron voor inkomen/uitgaven op de cashflow-kassabonnen.
-- 'auto' = berekend (transacties, met profiel-fallback); 'manual' = handmatig bedrag wint overal.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS income_source text NOT NULL DEFAULT 'auto';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS expenses_source text NOT NULL DEFAULT 'auto';
