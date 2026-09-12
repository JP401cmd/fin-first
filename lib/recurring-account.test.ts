/**
 * Welke rekening krijgt een bevestigde terugkerende regel? (P2, 11 sep 2026)
 *
 * WAT ER MISGING: `POST /api/recurring` koos "de eerste rekening van de gebruiker"
 * met `.from('bank_accounts').select('id').limit(1)` — zonder sortering, zonder
 * filter op actief, en zonder `.eq('user_id', …)`. Drie gevolgen: de keuze was
 * willekeurig (PostgREST garandeert geen volgorde zonder order), een INACTIEVE of
 * archiefrekening kon gekozen worden (zo hingen vier bevestigde abonnementen aan een
 * uitgezette creditcardrekening), en omdat de SELECT-policy op `bank_accounts`
 * huishoud-gedeeld is, kon het zelfs de rekening van de PARTNER zijn.
 *
 * DE NORM: de regel landt op de eigen rekening waar de betalingen van die tegenpartij
 * ook echt staan; anders op een deterministisch gekozen actieve eigen rekening; nooit
 * op een inactieve, archief- of andermans rekening.
 */

import { describe, it, expect } from 'vitest'
import { pickRecurringAccountId, type RecurringAccountCandidate } from './recurring-account'

const ACTIEF: RecurringAccountCandidate = { id: 'rabo', is_active: true, is_archive_bucket: false, sort_order: 1 }
const TWEEDE: RecurringAccountCandidate = { id: 'spaar', is_active: true, is_archive_bucket: false, sort_order: 2 }
const INACTIEF: RecurringAccountCandidate = { id: 'creditcard', is_active: false, is_archive_bucket: false, sort_order: 0 }
const ARCHIEF: RecurringAccountCandidate = { id: 'archief', is_active: false, is_archive_bucket: true, sort_order: 9999 }

describe('pickRecurringAccountId', () => {
  it('Given betalingen van die tegenpartij, When er gekozen wordt, Then wint de rekening waar ze staan', () => {
    const keuze = pickRecurringAccountId({
      accounts: [ACTIEF, TWEEDE],
      accountIdsOfCounterparty: ['spaar', 'spaar', 'rabo'],
    })

    expect(keuze).toBe('spaar')
  })

  it('Given de meeste betalingen op een uitgezette rekening, When er gekozen wordt, Then telt die niet mee', () => {
    const keuze = pickRecurringAccountId({
      accounts: [ACTIEF, INACTIEF, ARCHIEF],
      accountIdsOfCounterparty: ['creditcard', 'creditcard', 'archief', 'rabo'],
    })

    expect(keuze).toBe('rabo')
  })

  it('Given geen betalingen, When er gekozen wordt, Then wint de laagste sort_order onder de actieve rekeningen', () => {
    const keuze = pickRecurringAccountId({
      accounts: [TWEEDE, ACTIEF, INACTIEF],
      accountIdsOfCounterparty: [],
    })

    expect(keuze).toBe('rabo')
  })

  it('Given alleen uitgezette rekeningen, When er gekozen wordt, Then is er geen keuze', () => {
    const keuze = pickRecurringAccountId({
      accounts: [INACTIEF, ARCHIEF],
      accountIdsOfCounterparty: ['creditcard'],
    })

    expect(keuze).toBeNull()
  })
})

describe('POST /api/recurring — bron-grendel op de rekeningkeuze', () => {
  it('filtert op de eigen gebruiker en gebruikt de gedeelde keuzefunctie', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const bron = readFileSync(join(process.cwd(), 'app/api/recurring/route.ts'), 'utf8')

    // bank_accounts is huishoud-gedeeld: zichtbaar is geen bewijs van eigenaarschap.
    expect(bron).toMatch(/\.eq\('user_id', user\.id\)/)
    expect(bron).toMatch(/pickRecurringAccountId/)
    expect(bron).not.toMatch(/Get user's first account as default/)
  })
})
