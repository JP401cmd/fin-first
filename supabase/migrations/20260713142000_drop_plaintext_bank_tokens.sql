-- Field-level encryptie — Stage A (PR2), stap 3/3: plaintext-token-kolommen droppen.
--
-- Waarom: sluitstuk van Stage A. De TrueLayer access/refresh-tokens leven nu
-- uitsluitend versleuteld in access_token_encrypted / refresh_token_encrypted.
-- Deze migratie verwijdert de plaintext-kolommen definitief, zodat een
-- database-lek geen werkende banktokens meer prijsgeeft.
--
-- ⚠ ONOMKEERBAAR (dataverlies). Voer pas uit NA:
--   1. backfill gedraaid (encrypted gevuld voor alle rijen),
--   2. count-gate = 0 (zie 20260713141000_null_plaintext_bank_tokens.sql),
--   3. nul-migratie toegepast,
--   4. encrypted-only code gedeployed en live token-refresh bewezen.
-- Zie het RUNBOOK op het Notion-kaartje. Alleen onder toezicht draaien.
--
-- Scope = ALLEEN de tokens (Stage A). De plaintext-IBAN-kolommen
-- (bank_accounts.iban, bank_connection_accounts.iban, assets.account_number)
-- worden in Stage B (apart vervolgkaartje) gedropt.

ALTER TABLE public.bank_connections
  DROP COLUMN IF EXISTS access_token,
  DROP COLUMN IF EXISTS refresh_token;
