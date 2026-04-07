#!/usr/bin/env node
/**
 * One-time backfill script for the field-encryption rollout (PR1).
 *
 * Walks every existing row that holds plaintext bank credentials and writes
 * the encrypted + blind-index columns. Idempotent: rows whose `*_encrypted`
 * column is already non-NULL are skipped, so re-running the script after a
 * partial failure is safe.
 *
 * MUST be run AFTER migration `20260408000001_encrypt_bank_credentials.sql`
 * has been applied (otherwise the new columns don't exist) and BEFORE PR2's
 * `20260415000001_drop_plaintext_bank_credentials.sql` which drops the
 * plaintext source columns.
 *
 * Usage (against prod, locally):
 *   ENCRYPTION_KEY_V1=<hex32> \
 *   IBAN_INDEX_KEY_V1=<hex32> \
 *   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role-jwt> \
 *   node scripts/encrypt-existing-bank-credentials.mjs
 *
 * The two encryption keys MUST be the same ones that prod's Vercel env
 * uses, otherwise prod will not be able to decrypt the rows we just wrote.
 *
 * NEVER commit the values of any of these env vars.
 */

import { createClient } from '@supabase/supabase-js'
import {
  createCipheriv,
  createHmac,
  randomBytes,
} from 'node:crypto'

// ── Crypto helpers (mirrors lib/crypto/field-encryption.ts) ────────────────
//
// Duplicated here so this script can run as a plain `node` script without a
// TypeScript build step. If you change the wire format in
// lib/crypto/field-encryption.ts, mirror it here AND vice-versa. The two
// implementations are tested for round-trip compatibility by hand before
// each backfill run.

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 12
const VERSION_PREFIX = 'v1:'

function loadKey(name) {
  const hex = process.env[name]
  if (!hex) {
    throw new Error(`Missing env var ${name}`)
  }
  const buf = Buffer.from(hex, 'hex')
  if (buf.length !== KEY_LENGTH) {
    throw new Error(`${name} must decode to ${KEY_LENGTH} bytes (got ${buf.length})`)
  }
  return buf
}

const ENCRYPTION_KEY = loadKey('ENCRYPTION_KEY_V1')
const INDEX_KEY = loadKey('IBAN_INDEX_KEY_V1')

function encryptField(plaintext) {
  if (plaintext === null || plaintext === undefined) return null
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv)
  const ciphertext = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return `${VERSION_PREFIX}${Buffer.concat([iv, tag, ciphertext]).toString('base64')}`
}

function blindIndex(plaintext) {
  if (plaintext === null || plaintext === undefined) return null
  const normalised = String(plaintext).replace(/\s+/g, '').toLowerCase()
  return createHmac('sha256', INDEX_KEY).update(normalised, 'utf8').digest('hex')
}

// ── Supabase client (service role bypasses RLS) ────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// ── Backfill helpers ───────────────────────────────────────────────────────

const BATCH_SIZE = 200

async function backfillBankConnections() {
  let processed = 0
  let updated = 0
  let from = 0

  while (true) {
    const { data: rows, error } = await supabase
      .from('bank_connections')
      .select('id, access_token, refresh_token, access_token_encrypted, refresh_token_encrypted')
      .is('access_token_encrypted', null)
      .range(from, from + BATCH_SIZE - 1)

    if (error) throw new Error(`bank_connections select failed: ${error.message}`)
    if (!rows || rows.length === 0) break

    for (const row of rows) {
      processed++

      // Skip if somebody else (a parallel write from the live app) already
      // populated the encrypted column between our select and now.
      if (row.access_token_encrypted) continue

      const update = {
        access_token_encrypted: encryptField(row.access_token ?? ''),
        refresh_token_encrypted: encryptField(row.refresh_token ?? null),
      }

      const { error: updErr } = await supabase
        .from('bank_connections')
        .update(update)
        .eq('id', row.id)

      if (updErr) {
        console.error(`  bank_connections ${row.id}: ${updErr.message}`)
        continue
      }
      updated++
    }

    if (rows.length < BATCH_SIZE) break
    from += BATCH_SIZE
  }

  return { processed, updated }
}

async function backfillIbanTable(table) {
  let processed = 0
  let updated = 0
  let from = 0

  while (true) {
    const { data: rows, error } = await supabase
      .from(table)
      .select('id, iban, iban_encrypted, iban_hash')
      .is('iban_encrypted', null)
      .not('iban', 'is', null)
      .range(from, from + BATCH_SIZE - 1)

    if (error) throw new Error(`${table} select failed: ${error.message}`)
    if (!rows || rows.length === 0) break

    for (const row of rows) {
      processed++
      if (row.iban_encrypted) continue
      if (!row.iban) continue

      const { error: updErr } = await supabase
        .from(table)
        .update({
          iban_encrypted: encryptField(row.iban),
          iban_hash: blindIndex(row.iban),
        })
        .eq('id', row.id)

      if (updErr) {
        console.error(`  ${table} ${row.id}: ${updErr.message}`)
        continue
      }
      updated++
    }

    if (rows.length < BATCH_SIZE) break
    from += BATCH_SIZE
  }

  return { processed, updated }
}

async function backfillCashAssets() {
  let processed = 0
  let updated = 0
  let from = 0

  while (true) {
    // Only cash-as-asset rows hold IBANs in `account_number`. Other asset
    // types (stocks, real estate, …) reuse the column for unrelated values
    // and must NOT be hashed/encrypted.
    const { data: rows, error } = await supabase
      .from('assets')
      .select('id, account_number, account_number_encrypted, account_number_hash, asset_type')
      .eq('asset_type', 'cash')
      .is('account_number_encrypted', null)
      .not('account_number', 'is', null)
      .range(from, from + BATCH_SIZE - 1)

    if (error) throw new Error(`assets select failed: ${error.message}`)
    if (!rows || rows.length === 0) break

    for (const row of rows) {
      processed++
      if (row.account_number_encrypted) continue
      if (!row.account_number) continue

      const { error: updErr } = await supabase
        .from('assets')
        .update({
          account_number_encrypted: encryptField(row.account_number),
          account_number_hash: blindIndex(row.account_number),
        })
        .eq('id', row.id)

      if (updErr) {
        console.error(`  assets ${row.id}: ${updErr.message}`)
        continue
      }
      updated++
    }

    if (rows.length < BATCH_SIZE) break
    from += BATCH_SIZE
  }

  return { processed, updated }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('Starting field-encryption backfill…')
  console.log(`  target: ${SUPABASE_URL}`)
  console.log()

  const results = {}

  console.log('1/4 bank_connections (access + refresh tokens)…')
  results.bank_connections = await backfillBankConnections()
  console.log(`     processed=${results.bank_connections.processed} updated=${results.bank_connections.updated}`)

  console.log('2/4 bank_accounts (IBAN)…')
  results.bank_accounts = await backfillIbanTable('bank_accounts')
  console.log(`     processed=${results.bank_accounts.processed} updated=${results.bank_accounts.updated}`)

  console.log('3/4 bank_connection_accounts (IBAN)…')
  results.bank_connection_accounts = await backfillIbanTable('bank_connection_accounts')
  console.log(`     processed=${results.bank_connection_accounts.processed} updated=${results.bank_connection_accounts.updated}`)

  console.log('4/4 assets (account_number for cash assets)…')
  results.assets = await backfillCashAssets()
  console.log(`     processed=${results.assets.processed} updated=${results.assets.updated}`)

  console.log()
  console.log('Done. Summary:')
  for (const [table, { processed, updated }] of Object.entries(results)) {
    console.log(`  ${table}: encrypted ${updated} of ${processed} considered`)
  }
}

main().catch((err) => {
  console.error('Backfill failed:', err)
  process.exit(1)
})
