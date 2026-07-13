-- Field-level encryptie — Stage A (PR2), stap 1/3: prep.
--
-- Waarom: de OAuth-tokens van TrueLayer worden voortaan UITSLUITEND in de
-- *_encrypted-kolommen bewaard (zie de bank-connect-routes callback/sync/
-- balances/auth-link). Zolang `bank_connections.access_token` NOT NULL is,
-- zou de encrypted-only insert in auth-link (pending-rij zonder plaintext
-- token) de NOT NULL-constraint schenden. Deze migratie maakt de kolom
-- nullable zodat de code kan stoppen met plaintext schrijven — ZONDER al
-- data te verwijderen (volledig omkeerbaar).
--
-- refresh_token was al nullable (callback schreef `?? null`), dus alleen
-- access_token hoeft ontgrendeld te worden.
--
-- VOLGORDE (expand/contract): deze migratie MOET op remote toegepast zijn
-- VOORDAT de encrypted-only code deployt — anders faalt de auth-link insert
-- op NOT NULL. Zie het RUNBOOK op het Notion-kaartje.
--
-- NB migratie-drift: bank_connections heeft geen baseline-migratie
-- (pre-existing tabel). Dat blokkeert deze ALTER niet.

ALTER TABLE public.bank_connections
  ALTER COLUMN access_token DROP NOT NULL;
