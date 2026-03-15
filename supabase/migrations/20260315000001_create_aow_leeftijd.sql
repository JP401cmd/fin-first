-- =============================================
-- Migration: AOW-leeftijd referentietabel
-- Date: 2026-03-15
-- Source: SVB / Rijksoverheid
-- =============================================

CREATE TABLE IF NOT EXISTS aow_leeftijd (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  birth_date_from DATE NOT NULL,
  birth_date_through DATE NOT NULL,
  aow_years INTEGER NOT NULL,
  aow_months INTEGER NOT NULL DEFAULT 0,
  is_definitive BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL DEFAULT 'SVB',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_range CHECK (birth_date_from <= birth_date_through),
  CONSTRAINT valid_months CHECK (aow_months >= 0 AND aow_months < 12)
);

ALTER TABLE aow_leeftijd ENABLE ROW LEVEL SECURITY;

-- Alle ingelogde gebruikers mogen lezen (nodig voor simulaties)
CREATE POLICY "Authenticated users can read aow_leeftijd" ON aow_leeftijd
  FOR SELECT TO authenticated USING (true);

-- Schrijven via service role (API route checkt superadmin)

-- Seed met actuele data (SVB / Rijksoverheid, maart 2026)
INSERT INTO aow_leeftijd (birth_date_from, birth_date_through, aow_years, aow_months, is_definitive, source) VALUES
  ('1956-06-01', '1957-02-28', 66, 10, true,  'SVB 2026'),
  ('1957-03-01', '1960-12-31', 67, 0,  true,  'SVB 2026'),
  ('1961-01-01', '1964-09-30', 67, 3,  true,  'SVB 2026'),
  ('1964-10-01', '1966-09-30', 67, 3,  false, 'CBS-prognose 2026'),
  ('1966-10-01', '1970-06-30', 67, 6,  false, 'CBS-prognose 2026'),
  ('1970-07-01', '1973-03-31', 67, 9,  false, 'CBS-prognose 2026'),
  ('1973-04-01', '1975-12-31', 68, 0,  false, 'CBS-prognose 2026'),
  ('1976-01-01', '1978-09-30', 68, 3,  false, 'CBS-prognose 2026'),
  ('1978-10-01', '1982-06-30', 68, 6,  false, 'CBS-prognose 2026'),
  ('1982-07-01', '1985-03-31', 68, 9,  false, 'CBS-prognose 2026'),
  ('1985-04-01', '1988-12-31', 69, 0,  false, 'CBS-prognose 2026'),
  ('1989-01-01', '1991-09-30', 69, 3,  false, 'CBS-prognose 2026'),
  ('1991-10-01', '1995-06-30', 69, 6,  false, 'CBS-prognose 2026'),
  ('1995-07-01', '1999-03-31', 69, 9,  false, 'CBS-prognose 2026'),
  ('1999-04-01', '2000-12-31', 70, 0,  false, 'CBS-prognose 2026');
