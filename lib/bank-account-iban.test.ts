import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * De gedeelde schrijfvorm voor de IBAN-kolommen van `bank_accounts`.
 *
 * De reden dat dit bestand bestaat is één concreet incident (securityreview
 * 30 juli). `components/core/assets-client.tsx` is een client-component en riep
 * — via `syncBankAccountCompanion` — deze keten aan. In de browser bestaat
 * `ENCRYPTION_KEY_V1` niet, dus `encryptField` faalde, en de `catch` in de
 * companion schreef toen alleen de plaintext-kolom. Zolang de leespaden die kolom
 * lazen was dat een nette degradatie. Sinds ze uitsluitend `iban_encrypted` lezen
 * is zo'n rij voor de app een rekening ZÓNDER IBAN — en dan telt elke interne
 * overboeking van of naar die rekening mee als een échte inkomst én uitgave.
 * Stille corruptie van de spaarquote, zonder één signaal.
 *
 * Wat hier vastligt:
 *  1. de drie kolommen worden altijd als één blok geschreven;
 *  2. een lege IBAN levert drie keer `null` — nooit een blind index over `''`,
 *     want die zou voor élke lege rekening identiek zijn en de `iban_hash`-tak
 *     van de OAuth-callback twee ongerelateerde rekeningen laten verwarren;
 *  3. een onbruikbare sleutel gooit door naar de aanroeper in plaats van stil een
 *     halve rij op te leveren.
 *
 * Wat hier bewust NIET ligt: een `typeof window`-guard. De hele suite draait onder
 * jsdom, dus die zou in élke test aanslaan en niets zeggen over de echte bundel.
 * De browsergrens wordt afgedwongen doordat `encryptField` zonder sleutel gooit én
 * geen enkele aanroeper die throw nog opvangt om er plaintext van te maken — zie
 * `lib/bank-account-companion.test.ts`.
 */

const { mockEncryptField } = vi.hoisted(() => ({ mockEncryptField: vi.fn() }))

vi.mock('@/lib/crypto/field-encryption', () => ({
  encryptField: mockEncryptField,
  blindIndex: (s: string) => `hash:${s.replace(/\s/g, '').toLowerCase()}`,
}))

import { ibanWriteColumns } from './bank-account-iban'

beforeEach(() => {
  mockEncryptField.mockImplementation((s: string | null) => (s === null ? null : `enc:${s}`))
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('ibanWriteColumns', () => {
  it('schrijft plaintext, ciphertext en blind index als één blok', () => {
    expect(ibanWriteColumns('NL91ABNA0417164300')).toEqual({
      iban: 'NL91ABNA0417164300',
      iban_encrypted: 'enc:NL91ABNA0417164300',
      iban_hash: 'hash:nl91abna0417164300',
    })
  })

  it('behandelt null, lege string en whitespace alle drie als "geen IBAN"', () => {
    const leeg = { iban: null, iban_encrypted: null, iban_hash: null }
    expect(ibanWriteColumns(null)).toEqual(leeg)
    expect(ibanWriteColumns(undefined)).toEqual(leeg)
    expect(ibanWriteColumns('')).toEqual(leeg)
    expect(ibanWriteColumns('   ')).toEqual(leeg)
  })

  it('laat een ontbrekende/ongeldige sleutel dóórgooien — nooit een halve rij', () => {
    // Zo faalt dit in de browser: `encryptField` vindt `ENCRYPTION_KEY_V1` niet.
    // Deze helper mag dat niet opvangen, want een resultaat met alleen `iban`
    // gevuld is voor élke lezer een rekening zonder IBAN.
    mockEncryptField.mockImplementation(() => {
      throw new Error('[field-encryption] Missing env var ENCRYPTION_KEY_V1')
    })

    expect(() => ibanWriteColumns('NL91ABNA0417164300')).toThrow(/ENCRYPTION_KEY_V1/)
  })
})
