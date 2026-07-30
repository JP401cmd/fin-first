import { describe, it, expect } from 'vitest'
import {
  shapeExportRows,
  shapeExportRow,
  EXPORT_REDACTED_COLUMNS,
  EXPORT_DECRYPTED_COLUMNS,
} from './account-export-shape'

/**
 * De AVG-export (`/api/account/export`, `/api/admin/user-export`) deed
 * `select('*')`. Twee dingen zijn daaraan mis, en beide worden hier vastgelegd:
 *
 *  1. Ná de Stage B-drop van `bank_accounts.iban` levert die export
 *     `iban_encrypted` + `iban_hash` in plaats van een leesbaar rekeningnummer.
 *     Dat is geen geldige invulling van het inzagerecht (AVG art. 15/20).
 *  2. `select('*')` sleept server-interne kolommen mee: de blind index
 *     (`iban_hash`, een stabiele identifier uit een server-only sleutel) en —
 *     ernstiger — de bank-OAuth-tokens en de exchange-/broker-API-sleutels.
 */

const fakeDecrypt = (value: string | null): string | null =>
  value === null ? null : value.replace(/^v1:/, '')

describe('shapeExportRows — bank_accounts', () => {
  it('levert het rekeningnummer leesbaar en strip de crypto-kolommen', () => {
    const [rij] = shapeExportRows(
      'bank_accounts',
      [{ id: 'a1', name: 'Betaalrekening', iban_encrypted: 'v1:NL00BANK0123456789', iban_hash: 'h4sh' }],
      fakeDecrypt,
    )
    expect(rij.iban).toBe('NL00BANK0123456789')
    expect(rij).not.toHaveProperty('iban_encrypted')
    expect(rij).not.toHaveProperty('iban_hash')
    expect(rij.name).toBe('Betaalrekening')
  })

  it('overschrijft een achtergebleven plaintext-kolom met de ontsleutelde waarde', () => {
    // Zolang `bank_accounts.iban` nog bestaat is dit dezelfde waarde; de test
    // legt vast dat de VERSLEUTELDE kolom de bron is, niet de plaintext-kolom.
    const [rij] = shapeExportRows(
      'bank_accounts',
      [{ id: 'a1', iban: 'OUD', iban_encrypted: 'v1:NIEUW', iban_hash: 'h' }],
      fakeDecrypt,
    )
    expect(rij.iban).toBe('NIEUW')
  })

  it('zet iban op null als er geen versleutelde waarde is', () => {
    const [rij] = shapeExportRows('bank_accounts', [{ id: 'a1', iban_encrypted: null }], fakeDecrypt)
    expect(rij.iban).toBeNull()
    expect(rij).not.toHaveProperty('iban_encrypted')
  })

  it('laat een onleesbare rij de rest van de export niet slopen', () => {
    const kapot = (): string | null => {
      throw new Error('sleutel klopt niet')
    }
    const rijen = shapeExportRows(
      'bank_accounts',
      [{ id: 'a1', iban_encrypted: 'v1:kapot' }, { id: 'a2', iban_encrypted: 'v1:ok' }],
      (v) => (v === 'v1:kapot' ? kapot() : fakeDecrypt(v)),
    )
    expect(rijen).toHaveLength(2)
    expect(rijen[0].iban).toBeNull()
    expect(rijen[1].iban).toBe('ok')
  })
})

describe('shapeExportRows — geheimen', () => {
  it('strip bank-OAuth-tokens, ook de plaintext-voorgangers', () => {
    const [rij] = shapeExportRows(
      'bank_connections',
      [
        {
          id: 'c1',
          provider_name: 'ING',
          status: 'active',
          access_token: 'live-token',
          refresh_token: 'live-refresh',
          access_token_encrypted: 'v1:x',
          refresh_token_encrypted: 'v1:y',
        },
      ],
      fakeDecrypt,
    )
    expect(rij).not.toHaveProperty('access_token')
    expect(rij).not.toHaveProperty('refresh_token')
    expect(rij).not.toHaveProperty('access_token_encrypted')
    expect(rij).not.toHaveProperty('refresh_token_encrypted')
    // Wat de betrokkene wél toekomt blijft staan.
    expect(rij.provider_name).toBe('ING')
    expect(rij.status).toBe('active')
  })

  it('strip exchange- en broker-API-sleutels maar houdt het herkenbare staartje', () => {
    for (const tabel of ['exchange_connections', 'broker_connections']) {
      const [rij] = shapeExportRows(
        tabel,
        [{ id: 'e1', label: 'Kraken', api_key_encrypted: 'v1:k', api_key_hash: 'h', api_secret_encrypted: 'v1:s', api_key_last4: '9876' }],
        fakeDecrypt,
      )
      expect(rij).not.toHaveProperty('api_key_encrypted')
      expect(rij).not.toHaveProperty('api_key_hash')
      expect(rij).not.toHaveProperty('api_secret_encrypted')
      expect(rij.api_key_last4).toBe('9876')
      expect(rij.label).toBe('Kraken')
    }
  })

  it('strip de blind index van assets.account_number en levert het nummer leesbaar', () => {
    // Dit is geen kopie van de bank_accounts-test: de OAuth-callback schrijft
    // `assets.account_number_hash` en `bank_accounts.iban_hash` in dezelfde flow
    // met dezelfde blindIndex() op dezelfde IBAN. Zonder deze regel strip je de
    // blind index op de ene tabel en lever je 'm één tabel verderop alsnog uit —
    // de redactie zou dan een no-op zijn (securityreview 30 juli).
    const [rij] = shapeExportRows(
      'assets',
      [{ id: 'as1', name: 'Betaalrekening', asset_type: 'cash', account_number_encrypted: 'v1:NL03BANK0000000003', account_number_hash: 'zelfde-hash-als-iban_hash' }],
      fakeDecrypt,
    )
    expect(rij.account_number).toBe('NL03BANK0000000003')
    expect(rij).not.toHaveProperty('account_number_encrypted')
    expect(rij).not.toHaveProperty('account_number_hash')
    expect(rij.name).toBe('Betaalrekening')
  })

  it('laat een tabel zonder regels ongemoeid', () => {
    const rijen = [{ id: 't1', amount: -12.5, description: 'Albert Heijn' }]
    expect(shapeExportRows('transactions', rijen, fakeDecrypt)).toEqual(rijen)
  })
})

describe('shapeExportRow', () => {
  it('doet hetzelfde voor een enkele rij en slikt null', () => {
    expect(shapeExportRow('bank_accounts', null, fakeDecrypt)).toBeNull()
    const rij = shapeExportRow('bank_accounts', { id: 'a', iban_encrypted: 'v1:NL01' }, fakeDecrypt)
    expect(rij?.iban).toBe('NL01')
  })
})

describe('de curatie zelf', () => {
  it('houdt geen kolom tegelijk in redactie én in ontsleuteling als DOEL', () => {
    // `iban_encrypted` is bron van de ontsleuteling én doelwit van de redactie —
    // dat mag. Wat NIET mag is dat de leesbare doelkolom zelf geredigeerd wordt,
    // want dan levert de export alsnog niets.
    for (const [tabel, kolommen] of Object.entries(EXPORT_DECRYPTED_COLUMNS)) {
      const geredigeerd = EXPORT_REDACTED_COLUMNS[tabel] ?? []
      for (const { plainColumn } of kolommen) {
        expect(geredigeerd).not.toContain(plainColumn)
      }
    }
  })

  it('redigeert élke bron-kolom van een ontsleuteling', () => {
    // Anders lekt de ciphertext alsnog mee naast de leesbare waarde.
    for (const [tabel, kolommen] of Object.entries(EXPORT_DECRYPTED_COLUMNS)) {
      const geredigeerd = EXPORT_REDACTED_COLUMNS[tabel] ?? []
      for (const { cipherColumn } of kolommen) {
        expect(geredigeerd).toContain(cipherColumn)
      }
    }
  })
})
