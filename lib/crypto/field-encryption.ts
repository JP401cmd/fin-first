/**
 * Field-level encryption utilities for sensitive PII (TrueLayer tokens, IBANs).
 *
 * Threat model: makes a stolen DB dump useless for the encrypted columns.
 * Does NOT defend against full server compromise (anyone with both DB
 * and Vercel env vars can still decrypt).
 *
 * Algorithm: AES-256-GCM with random 96-bit IV per record + 128-bit auth tag.
 * Wire format: `v1:<base64(iv ‖ tag ‖ ciphertext)>`. The version prefix lets
 * us rotate to v2 in the future without a schema migration.
 *
 * Blind index: HMAC-SHA256 with a separate key, used so we can still do
 * equality lookups (e.g. "find bank_account by IBAN") on encrypted columns.
 * IBANs are normalised to lowercase + whitespace stripped before hashing so
 * `'NL91 ABNA 0417 1643 00'` and `'nl91abna0417164300'` collide on the same
 * blind index.
 *
 * Keys are loaded lazily from env vars on first use. This avoids crashing
 * the entire app at boot if the keys happen to be missing in a non-encrypt
 * code path (e.g. a unit test that never touches encrypted fields).
 */

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  type CipherGCM,
  type DecipherGCM,
} from 'crypto'

// ── Constants ──────────────────────────────────────────────────────────────

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH_BYTES = 32 // AES-256
const IV_LENGTH_BYTES = 12 // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH_BYTES = 16 // 128-bit auth tag
const VERSION_PREFIX = 'v1:'

// ── Lazy key loading ───────────────────────────────────────────────────────

let cachedEncryptionKey: Buffer | null = null
let cachedIndexKey: Buffer | null = null

/**
 * Reads + validates a hex-encoded 32-byte key from an env var.
 * Throws with a clear error if missing or wrong length so we don't silently
 * encrypt with a zero-key or crash deep in the cipher init.
 */
function loadKeyFromEnv(envVarName: string): Buffer {
  const hex = process.env[envVarName]
  if (!hex) {
    throw new Error(
      `[field-encryption] Missing env var ${envVarName}. ` +
      `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
    )
  }

  let key: Buffer
  try {
    key = Buffer.from(hex, 'hex')
  } catch {
    throw new Error(
      `[field-encryption] ${envVarName} must be a hex string`,
    )
  }

  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `[field-encryption] ${envVarName} must decode to exactly ${KEY_LENGTH_BYTES} bytes ` +
      `(got ${key.length}); generate with crypto.randomBytes(32).toString('hex')`,
    )
  }

  return key
}

function getEncryptionKey(): Buffer {
  if (!cachedEncryptionKey) {
    cachedEncryptionKey = loadKeyFromEnv('ENCRYPTION_KEY_V1')
  }
  return cachedEncryptionKey
}

function getIndexKey(): Buffer {
  if (!cachedIndexKey) {
    cachedIndexKey = loadKeyFromEnv('IBAN_INDEX_KEY_V1')
  }
  return cachedIndexKey
}

/**
 * Test-only helper. Resets the cached keys so a `beforeAll` block can inject
 * different env values per test run. NOT exported through any public surface
 * other than the test file — keep it internal.
 */
export function __resetKeyCacheForTests(): void {
  cachedEncryptionKey = null
  cachedIndexKey = null
}

/**
 * Returns true if both encryption keys are set in the env, without actually
 * loading or validating them. Used by code paths (e.g. test data seeding)
 * that want to OPTIONALLY populate encrypted columns when keys are available
 * but not crash on local-dev environments where the keys haven't been set up
 * yet. The dual-write API routes do NOT use this — they require keys.
 */
export function isFieldEncryptionConfigured(): boolean {
  return Boolean(process.env.ENCRYPTION_KEY_V1 && process.env.IBAN_INDEX_KEY_V1)
}

// ── Encrypt / decrypt ──────────────────────────────────────────────────────

/**
 * Encrypts a string with AES-256-GCM. Returns null for null input so callers
 * can dual-write the same nullable value into both columns without branching.
 */
export function encryptField(plaintext: string | null): string | null {
  if (plaintext === null || plaintext === undefined) {
    return null
  }

  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv) as CipherGCM

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  // Layout: iv (12) ‖ tag (16) ‖ ciphertext (n)
  const payload = Buffer.concat([iv, authTag, ciphertext])
  return `${VERSION_PREFIX}${payload.toString('base64')}`
}

/**
 * Decrypts a `v1:`-prefixed ciphertext produced by encryptField. Returns null
 * for null input so dual-read fallback patterns like
 *   `decryptField(row.x_encrypted) ?? row.x`
 * fall through to the plaintext column when the encrypted column is empty.
 *
 * Throws on:
 *   - missing version prefix (caller passed something we don't recognise)
 *   - unknown version prefix (e.g. v2 before we've shipped a v2 decryptor)
 *   - tampered ciphertext / wrong key (auth tag mismatch)
 */
export function decryptField(ciphertext: string | null): string | null {
  if (ciphertext === null || ciphertext === undefined) {
    return null
  }

  if (!ciphertext.startsWith(VERSION_PREFIX)) {
    throw new Error(
      `[field-encryption] Ciphertext is missing the "${VERSION_PREFIX}" version prefix. ` +
      `Got: "${ciphertext.slice(0, 16)}..."`,
    )
  }

  const payloadB64 = ciphertext.slice(VERSION_PREFIX.length)
  let payload: Buffer
  try {
    payload = Buffer.from(payloadB64, 'base64')
  } catch {
    throw new Error('[field-encryption] Ciphertext payload is not valid base64')
  }

  if (payload.length < IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES) {
    throw new Error(
      `[field-encryption] Ciphertext too short: ${payload.length} bytes ` +
      `(need at least ${IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES})`,
    )
  }

  const iv = payload.subarray(0, IV_LENGTH_BYTES)
  const authTag = payload.subarray(IV_LENGTH_BYTES, IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES)
  const data = payload.subarray(IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES)

  const key = getEncryptionKey()
  const decipher = createDecipheriv(ALGORITHM, key, iv) as DecipherGCM
  decipher.setAuthTag(authTag)

  // .final() throws on auth tag mismatch — that's our tamper detection.
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()])
  return plaintext.toString('utf8')
}

// ── Blind index ────────────────────────────────────────────────────────────

/**
 * Normalises an IBAN-like value for deterministic blind indexing:
 * lowercase + strip ALL whitespace (including non-breaking spaces). This way
 * `'NL91 ABNA 0417 1643 00'`, `'nl91abna0417164300'`, and `'NL91\u00A0ABNA…'`
 * all hash to the same value.
 *
 * Exposed for tests / callers that want to verify the normalisation rules.
 */
export function normalizeIbanForIndex(value: string): string {
  // \s in JS regex matches space, tab, newline, NBSP, etc.
  return value.replace(/\s+/g, '').toLowerCase()
}

/**
 * HMAC-SHA256 blind index over normalised input. Output is hex (deterministic
 * length, easy to put in a btree index, easy to grep in tests).
 *
 * Use this for equality lookups on encrypted columns:
 *   .eq('iban_hash', blindIndex(userInputIban))
 *
 * The HMAC key (`IBAN_INDEX_KEY_V1`) MUST be different from the encryption
 * key — otherwise an attacker who learns the index key would also learn the
 * cipher key. Both keys are 32 random bytes from env.
 */
export function blindIndex(plaintext: string): string {
  const key = getIndexKey()
  const normalized = normalizeIbanForIndex(plaintext)
  return createHmac('sha256', key).update(normalized, 'utf8').digest('hex')
}
