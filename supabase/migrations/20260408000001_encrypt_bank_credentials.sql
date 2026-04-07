-- Field-level encryption rollout — phase 1: ADD encrypted columns + blind indexes.
--
-- This is a non-destructive, additive migration. The plaintext columns
-- (access_token, refresh_token, iban, account_number) are NOT touched here so
-- we can dual-write + dual-read for at least a week before flipping over.
-- A separate migration (20260415000001_drop_plaintext_bank_credentials.sql)
-- drops them after we've verified the encrypted columns are populated and
-- decrypt cleanly in production.
--
-- See lib/crypto/field-encryption.ts for the wire format (`v1:<base64>`).
-- See scripts/encrypt-existing-bank-credentials.mjs for the backfill.

-- ── bank_connections: TrueLayer access + refresh tokens ─────────────────────
ALTER TABLE public.bank_connections
  ADD COLUMN IF NOT EXISTS access_token_encrypted text,
  ADD COLUMN IF NOT EXISTS refresh_token_encrypted text;

COMMENT ON COLUMN public.bank_connections.access_token_encrypted IS
  'AES-256-GCM ciphertext of access_token, format v1:<base64>. See lib/crypto/field-encryption.ts.';
COMMENT ON COLUMN public.bank_connections.refresh_token_encrypted IS
  'AES-256-GCM ciphertext of refresh_token, format v1:<base64>. See lib/crypto/field-encryption.ts.';

-- ── bank_accounts: IBAN + blind index ───────────────────────────────────────
ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS iban_encrypted text,
  ADD COLUMN IF NOT EXISTS iban_hash text;

COMMENT ON COLUMN public.bank_accounts.iban_encrypted IS
  'AES-256-GCM ciphertext of iban, format v1:<base64>.';
COMMENT ON COLUMN public.bank_accounts.iban_hash IS
  'HMAC-SHA256(IBAN_INDEX_KEY_V1, normalize(iban)) hex — used for equality lookups on encrypted IBANs.';

CREATE INDEX IF NOT EXISTS bank_accounts_iban_hash_idx
  ON public.bank_accounts (user_id, iban_hash)
  WHERE iban_hash IS NOT NULL;

-- ── bank_connection_accounts: IBAN duplicate + blind index ─────────────────
ALTER TABLE public.bank_connection_accounts
  ADD COLUMN IF NOT EXISTS iban_encrypted text,
  ADD COLUMN IF NOT EXISTS iban_hash text;

COMMENT ON COLUMN public.bank_connection_accounts.iban_encrypted IS
  'AES-256-GCM ciphertext of iban, format v1:<base64>.';
COMMENT ON COLUMN public.bank_connection_accounts.iban_hash IS
  'HMAC-SHA256 blind index of normalised iban — for equality lookups.';

CREATE INDEX IF NOT EXISTS bank_connection_accounts_iban_hash_idx
  ON public.bank_connection_accounts (user_id, iban_hash)
  WHERE iban_hash IS NOT NULL;

-- ── assets: account_number (cash-as-asset records hold IBAN here) ──────────
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS account_number_encrypted text,
  ADD COLUMN IF NOT EXISTS account_number_hash text;

COMMENT ON COLUMN public.assets.account_number_encrypted IS
  'AES-256-GCM ciphertext of account_number (IBAN for cash assets), format v1:<base64>.';
COMMENT ON COLUMN public.assets.account_number_hash IS
  'HMAC-SHA256 blind index of normalised account_number.';
