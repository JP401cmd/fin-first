/**
 * Unit tests for lib/crypto/field-encryption.
 *
 * We inject hardcoded test keys via beforeAll so the tests don't depend on
 * a developer's .env.local. Real prod keys live in Vercel env vars and are
 * rotated separately.
 */

import { beforeAll, describe, expect, it } from 'vitest'
import {
  __resetKeyCacheForTests,
  blindIndex,
  decryptField,
  encryptField,
  normalizeIbanForIndex,
} from './field-encryption'

// Two distinct 32-byte hex keys. Generated with crypto.randomBytes(32).toString('hex')
// at test-write time. They are NOT used in any environment except this test file.
const TEST_ENCRYPTION_KEY = '11111111111111111111111111111111111111111111111111111111111111ff'
const TEST_INDEX_KEY = '22222222222222222222222222222222222222222222222222222222222222ff'

beforeAll(() => {
  process.env.ENCRYPTION_KEY_V1 = TEST_ENCRYPTION_KEY
  process.env.IBAN_INDEX_KEY_V1 = TEST_INDEX_KEY
  // Drop any cached key from a previous test run that might have set
  // different env vars.
  __resetKeyCacheForTests()
})

describe('encryptField / decryptField', () => {
  it('round-trips a basic ASCII string', () => {
    const plaintext = 'hello world'
    const ciphertext = encryptField(plaintext)
    expect(ciphertext).not.toBeNull()
    expect(ciphertext).not.toContain(plaintext)
    expect(ciphertext).toMatch(/^v1:/)
    expect(decryptField(ciphertext)).toBe(plaintext)
  })

  it('round-trips an empty string', () => {
    const ciphertext = encryptField('')
    expect(ciphertext).toMatch(/^v1:/)
    expect(decryptField(ciphertext)).toBe('')
  })

  it('round-trips an IBAN-shaped string', () => {
    const iban = 'NL91ABNA0417164300'
    const ciphertext = encryptField(iban)
    expect(ciphertext).not.toContain('NL91')
    expect(decryptField(ciphertext)).toBe(iban)
  })

  it('round-trips a long random-looking access token', () => {
    const token = 'a'.repeat(2000) + '_b_' + 'c'.repeat(2000)
    const ciphertext = encryptField(token)
    expect(decryptField(ciphertext)).toBe(token)
  })

  it('round-trips emoji + unicode', () => {
    const text = 'spaargeld voor 🐰 Lumen — Ø€¥'
    const ciphertext = encryptField(text)
    expect(decryptField(ciphertext)).toBe(text)
  })

  it('returns null for null input on encrypt', () => {
    expect(encryptField(null)).toBeNull()
  })

  it('returns null for null input on decrypt', () => {
    expect(decryptField(null)).toBeNull()
  })

  it('produces a different ciphertext each time for the same plaintext (random IV)', () => {
    const a = encryptField('same plaintext')
    const b = encryptField('same plaintext')
    expect(a).not.toBe(b)
    // But both decrypt to the same value
    expect(decryptField(a)).toBe(decryptField(b))
  })

  it('throws if a single byte is flipped (auth tag verifies)', () => {
    const ciphertext = encryptField('tamper me') as string
    // Strip prefix, decode base64, flip last byte, re-encode
    const payload = Buffer.from(ciphertext.slice(3), 'base64')
    payload[payload.length - 1] ^= 0x01
    const tampered = `v1:${payload.toString('base64')}`
    expect(() => decryptField(tampered)).toThrow()
  })

  it('throws if the version prefix is missing', () => {
    expect(() => decryptField('not a real ciphertext')).toThrow(/version prefix/)
  })

  it('throws if the version prefix is unknown', () => {
    expect(() => decryptField('v999:abcdefgh')).toThrow(/version prefix/)
  })

  it('throws if the payload is too short', () => {
    // Valid base64 but only a few bytes — must be < 28 (12 IV + 16 tag)
    const short = `v1:${Buffer.from([1, 2, 3]).toString('base64')}`
    expect(() => decryptField(short)).toThrow(/too short/)
  })
})

describe('blindIndex', () => {
  it('is deterministic for the same input', () => {
    const a = blindIndex('NL91ABNA0417164300')
    const b = blindIndex('NL91ABNA0417164300')
    expect(a).toBe(b)
  })

  it('produces a 64-char hex string', () => {
    const hash = blindIndex('NL91ABNA0417164300')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('normalises spaces and case (regression: IBAN with spaces)', () => {
    const a = blindIndex('NL91 ABNA 0417 1643 00')
    const b = blindIndex('nl91abna0417164300')
    const c = blindIndex('NL91ABNA0417164300')
    expect(a).toBe(b)
    expect(b).toBe(c)
  })

  it('normalises non-breaking spaces and tabs', () => {
    const a = blindIndex('NL91\u00A0ABNA\t0417 1643 00')
    const b = blindIndex('NL91ABNA0417164300')
    expect(a).toBe(b)
  })

  it('produces different hashes for different inputs', () => {
    const a = blindIndex('NL91ABNA0417164300')
    const b = blindIndex('NL91ABNA0417164301')
    expect(a).not.toBe(b)
  })

  it('does NOT contain the plaintext', () => {
    const iban = 'NL91ABNA0417164300'
    const hash = blindIndex(iban)
    expect(hash).not.toContain('0417')
    expect(hash.toLowerCase()).not.toContain('abna')
  })
})

describe('normalizeIbanForIndex', () => {
  it('lowercases + strips whitespace', () => {
    expect(normalizeIbanForIndex('NL91 ABNA 0417 1643 00')).toBe('nl91abna0417164300')
  })

  it('handles already-normalised input', () => {
    expect(normalizeIbanForIndex('nl91abna0417164300')).toBe('nl91abna0417164300')
  })
})
