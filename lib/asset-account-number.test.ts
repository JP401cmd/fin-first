/**
 * Unit tests for lib/asset-account-number.ts — het spiegelbeeld van
 * lib/bank-account-iban.ts, maar dan voor `assets.account_number`.
 *
 * We injecteren hardcoded test-sleutels via beforeAll (zelfde patroon als
 * lib/crypto/field-encryption.test.ts) zodat de tests niet afhankelijk zijn
 * van een developer's .env.local. Dit bestand draait geïsoleerd (eigen
 * vitest-modulescope), dus er is geen afterAll-restore nodig — andere
 * testbestanden zien deze env-vars niet.
 */

import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  accountNumberWriteColumns,
  resolveAssetAccountNumber,
} from './asset-account-number'
import { __resetKeyCacheForTests, decryptField, encryptField } from './crypto/field-encryption'

// Twee losse 32-byte hex-sleutels, alleen gebruikt in dit testbestand.
const TEST_ENCRYPTION_KEY = 'aa'.repeat(32)
const TEST_INDEX_KEY = 'bb'.repeat(32)

beforeAll(() => {
  process.env.ENCRYPTION_KEY_V1 = TEST_ENCRYPTION_KEY
  process.env.IBAN_INDEX_KEY_V1 = TEST_INDEX_KEY
  __resetKeyCacheForTests()
})

describe('accountNumberWriteColumns', () => {
  it('lege string, null en whitespace leveren alle drie de kolommen als null op', () => {
    const leeg = { account_number: null, account_number_encrypted: null, account_number_hash: null }
    expect(accountNumberWriteColumns(null)).toEqual(leeg)
    expect(accountNumberWriteColumns(undefined)).toEqual(leeg)
    expect(accountNumberWriteColumns('')).toEqual(leeg)
    expect(accountNumberWriteColumns('   ')).toEqual(leeg)
  })

  it('een echte waarde levert plaintext + v1:-ciphertext + hash op, en de ciphertext ontsleutelt terug naar dezelfde waarde', () => {
    const value = 'NL01TEST0123456789'
    const cols = accountNumberWriteColumns(value)

    expect(cols.account_number).toBe(value)
    expect(cols.account_number_encrypted).toMatch(/^v1:/)
    expect(cols.account_number_encrypted).not.toContain(value)
    expect(cols.account_number_hash).toMatch(/^[0-9a-f]{64}$/)

    expect(decryptField(cols.account_number_encrypted)).toBe(value)
  })
})

describe('resolveAssetAccountNumber', () => {
  it('geval (a): plaintext gevuld wint — ook als er een AFWIJKENDE ciphertext staat (anti-staleness)', () => {
    const versWaarde = 'NL01TEST0123456789'
    const staleWaarde = 'NL02OUD9999999999'
    const staleCiphertext = encryptField(staleWaarde)

    const result = resolveAssetAccountNumber({
      account_number: versWaarde,
      account_number_encrypted: staleCiphertext,
    })

    expect(result).toBe(versWaarde)
  })

  it('geval (b): plaintext null + ciphertext gevuld → de ontsleutelde waarde (bankkoppeling-geval)', () => {
    const value = 'NL03BANK5555555555'
    const ciphertext = encryptField(value)

    const result = resolveAssetAccountNumber({
      account_number: null,
      account_number_encrypted: ciphertext,
    })

    expect(result).toBe(value)
  })

  it('geval (c): beide leeg → null', () => {
    expect(
      resolveAssetAccountNumber({ account_number: null, account_number_encrypted: null }),
    ).toBeNull()
    expect(
      resolveAssetAccountNumber({ account_number: '', account_number_encrypted: null }),
    ).toBeNull()
    expect(resolveAssetAccountNumber({})).toBeNull()
  })

  it('een beschadigde ciphertext geeft null terug en gooit NIET (plaintext leeg, alleen ciphertext beschikbaar)', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const ciphertext = encryptField('NL04TAMPER11111111') as string
      // Zelfde tamper-techniek als field-encryption.test.ts: laatste byte van de
      // payload omkeren zodat de auth tag niet meer klopt.
      const payload = Buffer.from(ciphertext.slice(3), 'base64')
      payload[payload.length - 1] ^= 0x01
      const tampered = `v1:${payload.toString('base64')}`

      const result = resolveAssetAccountNumber({
        account_number: null,
        account_number_encrypted: tampered,
      })

      expect(result).toBeNull()
      expect(consoleSpy).toHaveBeenCalled()
    } finally {
      consoleSpy.mockRestore()
    }
  })

  it('whitespace-only plaintext telt niet als gevuld — valt door naar de ciphertext-tak', () => {
    const value = 'NL05SPACE22222222'
    const ciphertext = encryptField(value)

    const result = resolveAssetAccountNumber({
      account_number: '   ',
      account_number_encrypted: ciphertext,
    })

    expect(result).toBe(value)
  })
})
