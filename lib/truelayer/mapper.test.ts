import { describe, it, expect } from 'vitest'
import { mapAccountType, mapTransaction } from './mapper'
import type { TLTransaction } from './types'

// Vastgepind gedrag: transaction_type blijft altijd null (die kolom heeft een
// CHECK-constraint op een vaste enum, zie lib/parsers/csv.ts en
// lib/parsers/shared.ts) — rauwe TrueLayer-categorieën ('PURCHASE',
// 'DIRECT_DEBIT', ...) landen in bank_code, net als bij de CSV-parser.

describe('mapTransaction', () => {
  it('zet transaction_category in bank_code, transaction_type blijft null', async () => {
    const tl: TLTransaction = {
      transaction_id: 'tl-1',
      timestamp: '2026-03-15T08:00:00Z',
      amount: -12.5,
      currency: 'EUR',
      description: 'Albert Heijn',
      transaction_type: 'DEBIT',
      transaction_category: 'PURCHASE',
    }

    const result = await mapTransaction(tl)

    expect(result.transaction_type).toBeNull()
    expect(result.bank_code).toBe('PURCHASE')
  })

  it('valt terug op transaction_type in bank_code als transaction_category ontbreekt', async () => {
    const tl: TLTransaction = {
      transaction_id: 'tl-2',
      timestamp: '2026-03-16T09:00:00Z',
      amount: 100,
      currency: 'EUR',
      description: 'Salaris',
      transaction_type: 'CREDIT',
      transaction_category: undefined as unknown as string,
    }

    const result = await mapTransaction(tl)

    expect(result.bank_code).toBe('CREDIT')
    expect(result.transaction_type).toBeNull()
  })

  it('sanity: bestaande mapping (date/amount/description/reference/import_hash/running_balance) blijft intact', async () => {
    const tl: TLTransaction = {
      transaction_id: 'tl-3',
      timestamp: '2026-03-17T10:30:00Z',
      amount: -42.5,
      currency: 'EUR',
      description: 'Coffeeshop Betaling',
      transaction_type: 'DEBIT',
      transaction_category: 'PURCHASE',
      merchant_name: 'Coffeeshop BV',
      running_balance: { amount: 1234.56, currency: 'EUR' },
    }

    const result = await mapTransaction(tl)

    expect(result.date).toBe('2026-03-17')
    expect(result.amount).toBe(-42.5)
    expect(result.description).toBe('Coffeeshop Betaling')
    expect(result.counterparty_name).toBe('Coffeeshop BV')
    expect(result.reference).toBe('tl-3')
    expect(result.running_balance).toBe(1234.56)
    expect(typeof result.import_hash).toBe('string')
    expect(result.import_hash.length).toBeGreaterThan(0)
  })

  // Rabobank (provider xs2a-rabobank, live) vult merchant_name NIET (0/354
  // transacties in de echte sync); naam + IBAN zitten in `meta.counter_party_*`.
  // mapTransaction valt daarop terug zodat de tegenpartij niet leeg blijft.
  it('leest counterparty uit meta.counter_party_* wanneer merchant_name ontbreekt (Rabobank xs2a)', async () => {
    const tl = {
      transaction_id: 'tl-rabo-meta-1',
      timestamp: '2026-07-29T06:05:01.241Z',
      amount: -11.99,
      currency: 'EUR',
      description: 'BRN?00000000,0: S-0000000, 2026-07-25 - 2026-08-24',
      transaction_type: 'DEBIT',
      transaction_category: 'DEBIT',
      meta: {
        transaction_type: 'Debit',
        counter_party_preferred_name: 'VIDEOLAND DOOR BUCKAROO',
        counter_party_iban: 'NL00TEST0123456789',
      },
    } as unknown as TLTransaction

    const result = await mapTransaction(tl)

    expect(result.counterparty_name).toBe('VIDEOLAND DOOR BUCKAROO')
    expect(result.counterparty_iban).toBe('NL00TEST0123456789')
  })

  it('leest counterparty uit meta.counter_party_* wanneer merchant_name alleen whitespace bevat', async () => {
    const tl = {
      transaction_id: 'tl-5',
      timestamp: '2026-07-29T06:05:01.241Z',
      amount: -11.99,
      currency: 'EUR',
      description: 'Videoland abonnement',
      transaction_type: 'DEBIT',
      transaction_category: 'DEBIT',
      merchant_name: '   ',
      meta: {
        transaction_type: 'Debit',
        counter_party_preferred_name: 'VIDEOLAND DOOR BUCKAROO',
        counter_party_iban: 'NL00TEST0123456789',
      },
    } as unknown as TLTransaction

    const result = await mapTransaction(tl)

    expect(result.counterparty_name).toBe('VIDEOLAND DOOR BUCKAROO')
  })

  it('zonder merchant_name én zonder meta geeft counterparty_name/iban null (geen lege string)', async () => {
    const tl: TLTransaction = {
      transaction_id: 'tl-6',
      timestamp: '2026-07-29T06:05:01.241Z',
      amount: -5,
      currency: 'EUR',
      description: 'Onbekende afschrijving',
      transaction_type: 'DEBIT',
      transaction_category: 'DEBIT',
    }

    const result = await mapTransaction(tl)

    expect(result.counterparty_name).toBeNull()
    expect(result.counterparty_iban).toBeNull()
  })

  it('een gevulde merchant_name houdt voorrang boven meta.counter_party_preferred_name', async () => {
    const tl = {
      transaction_id: 'tl-4',
      timestamp: '2026-07-29T06:05:01.241Z',
      amount: -11.99,
      currency: 'EUR',
      description: 'Videoland abonnement',
      transaction_type: 'DEBIT',
      transaction_category: 'DEBIT',
      merchant_name: 'Videoland B.V.',
      meta: {
        transaction_type: 'Debit',
        counter_party_preferred_name: 'VIDEOLAND DOOR BUCKAROO',
        counter_party_iban: 'NL00TEST0123456789',
      },
    } as unknown as TLTransaction

    const result = await mapTransaction(tl)

    expect(result.counterparty_name).toBe('Videoland B.V.')
  })

  // ── UR3-02: tegenrekening afleiden uit de omschrijving ─────────────────────
  //
  // Juist bij een overboeking tussen twee EIGEN rekeningen laten de Nederlandse
  // xs2a-banken `meta.counter_party_iban` leeg. Zonder tegenrekening grijpt
  // `isOwnAccountTransfer` in de sync-route niet, valt de rij door naar gewone
  // keyword-categorisatie, en telt een spaarstorting als uitgave.

  function savingsTransfer(description: string): TLTransaction {
    return {
      transaction_id: 'tl-ur302',
      timestamp: '2026-09-01T07:00:00Z',
      amount: -1700,
      currency: 'EUR',
      description,
      transaction_type: 'DEBIT',
      transaction_category: 'TRANSFER',
    }
  }

  it('leidt de tegenrekening af uit de omschrijving als de provider counter_party_iban leeg laat', async () => {
    const result = await mapTransaction(
      savingsTransfer('NL20INGB0001234567 Spaarrekening storting'),
      { selfIbans: ['NL44RABO0123456789'] },
    )

    expect(result.counterparty_iban).toBe('NL20INGB0001234567')
  })

  it('leidt niets af zodra de provider zelf een tegenrekening levert', async () => {
    const tl = {
      ...savingsTransfer('NL20INGB0001234567 Spaarrekening storting'),
      meta: { counter_party_iban: 'NL91ABNA0417164300' },
    } as unknown as TLTransaction

    const result = await mapTransaction(tl, { selfIbans: ['NL44RABO0123456789'] })

    expect(result.counterparty_iban).toBe('NL91ABNA0417164300')
  })

  it('maakt van de EIGEN rekening in de omschrijving nooit een tegenrekening', async () => {
    // Anders zou elke transactie op een rekening waarvan de bank het eigen
    // nummer in de omschrijving herhaalt als eigen overboeking gestempeld
    // worden — en die verdwijnt stil uit de uitgaven.
    const result = await mapTransaction(
      savingsTransfer('NL44RABO0123456789 pinbetaling Albert Heijn'),
      { selfIbans: ['NL44RABO0123456789'] },
    )

    expect(result.counterparty_iban).toBeNull()
  })

  it('leidt niets af bij twee kandidaten in dezelfde omschrijving', async () => {
    const result = await mapTransaction(
      savingsTransfer('Doorbelasting NL20INGB0001234567 en NL02SNSB0900123456'),
    )

    expect(result.counterparty_iban).toBeNull()
  })

  it('leidt niets af op een incasso — die omschrijving vult de tegenpartij', async () => {
    // Anders kan een incassant die één van je eigen IBANs kent zijn eigen
    // afschrijving als "eigen overboeking" laten wegvallen uit je uitgaven.
    const incasso = {
      ...savingsTransfer('Incasso NL20INGB0001234567 abonnement'),
      transaction_category: 'DIRECT_DEBIT',
      transaction_type: 'DEBIT',
    } as TLTransaction

    const result = await mapTransaction(incasso, { selfIbans: ['NL44RABO0123456789'] })

    expect(result.counterparty_iban).toBeNull()
  })

  it('leidt wél af op een doorlopende opdracht — die omschrijving schrijf je zelf', async () => {
    const standingOrder = {
      ...savingsTransfer('NL20INGB0001234567 maandelijkse storting spaarrekening'),
      transaction_category: 'STANDING_ORDER',
    } as TLTransaction

    const result = await mapTransaction(standingOrder, { selfIbans: ['NL44RABO0123456789'] })

    expect(result.counterparty_iban).toBe('NL20INGB0001234567')
  })

  it('laat de dedup-sleutel ongemoeid — de afleiding verrijkt alleen de rij', async () => {
    const description = 'NL20INGB0001234567 Spaarrekening storting'
    const zonder = await mapTransaction(savingsTransfer(description))
    const met = await mapTransaction(savingsTransfer(description), {
      selfIbans: ['NL20INGB0001234567'],
    })

    expect(met.import_hash).toBe(zonder.import_hash)
  })
})

/**
 * Besluit B3 (fase 5): het rekeningtype komt van de bank, niet uit een aanname.
 *
 * Waarom dit een aparte, expliciete suite verdient: `is_liquid` bepaalt het
 * liquide vermogen, en dat voedt noodfonds, spaarquote én de FIRE-motor. Een
 * spaarrekening of creditcard die als betaalrekening wordt gestempeld is dus een
 * grondslagfout die downstream niet meer te repareren is.
 */
describe('mapAccountType (B3 — rekeningtype van de bank)', () => {
  it('TRANSACTION → betaalrekening, liquide (het gedrag van vóór B3, nu expliciet)', () => {
    expect(mapAccountType('TRANSACTION')).toEqual({
      account_type: 'checking',
      subtype: 'checking',
      is_liquid: true,
    })
  })

  it('SAVINGS → spaarrekening, en dus NIET checking', () => {
    const mapped = mapAccountType('SAVINGS')

    expect(mapped.account_type).toBe('savings')
    expect(mapped.subtype).toBe('savings_account')
    expect(mapped.is_liquid).toBe(true)
    // De kern van de bug die B3 repareert:
    expect(mapped.account_type).not.toBe('checking')
    expect(mapped.subtype).not.toBe('checking')
  })

  it('BUSINESS_TRANSACTION en BUSINESS_SAVINGS → zakelijk (één slot in de woordenlijst)', () => {
    expect(mapAccountType('BUSINESS_TRANSACTION').account_type).toBe('business')
    expect(mapAccountType('BUSINESS_SAVINGS').account_type).toBe('business')
    expect(mapAccountType('BUSINESS_SAVINGS').subtype).toBe('business')
  })

  it('CREDIT_CARD → niet-liquide: een kredietrekening mag het liquide vermogen niet opblazen', () => {
    const mapped = mapAccountType('CREDIT_CARD')

    expect(mapped.is_liquid).toBe(false)
    expect(mapped.account_type).toBe('other')
    expect(mapped.subtype).toBe('other_cash')
  })

  it('onbekend, leeg en ontbrekend type → val-terug op betaalrekening, zonder te gooien', () => {
    for (const input of ['SOMETHING_NEW', '', '   ', null, undefined]) {
      expect(mapAccountType(input)).toEqual({
        account_type: 'checking',
        subtype: 'checking',
        is_liquid: true,
      })
    }
  })

  it('is niet gevoelig voor casing of omringende spaties uit de providerrespons', () => {
    expect(mapAccountType(' savings ')).toEqual(mapAccountType('SAVINGS'))
    expect(mapAccountType('Transaction')).toEqual(mapAccountType('TRANSACTION'))
  })

  it('levert altijd een account_type dat de CHECK-constraint op bank_accounts toestaat', () => {
    // Spiegelt bank_accounts_account_type_check
    // (20260616000000_widen_bank_accounts_account_type_check.sql). Een mapping die
    // hierbuiten valt laat de insert in de callback stuklopen — midden in een
    // OAuth-callback, dus zonder bruikbare foutmelding voor de gebruiker.
    const allowed = new Set(['checking', 'savings', 'joint', 'business', 'contant_geld', 'other'])
    const providerTypes = [
      'TRANSACTION',
      'SAVINGS',
      'BUSINESS_TRANSACTION',
      'BUSINESS_SAVINGS',
      'CREDIT_CARD',
      'CARD',
      'ONBEKEND',
    ]

    for (const type of providerTypes) {
      expect(allowed.has(mapAccountType(type).account_type)).toBe(true)
    }
  })
})
