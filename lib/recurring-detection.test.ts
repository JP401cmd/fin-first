/**
 * Tests voor de `alreadyExists`-vlag van `detectRecurringTransactions`.
 *
 * Dat is het gedrag dat de `existingRecurrings`-vergelijking bewaakt: een al
 * bevestigde vaste last mag niet opnieuw als "nieuw gedetecteerd" aan de gebruiker
 * worden voorgelegd. De vergelijking draait op GENORMALISEERDE namen
 * (`normalizeCounterparty`), zodat "NETFLIX INTERNATIONAL B.V." en
 * "Netflix International BV" dezelfde vaste last zijn.
 *
 * De opbouw van die vergelijkingsset is uit de groepslus gehoist (T1.4). Deze
 * suite legt vast dat dat gedragsneutraal is: dezelfde vlag per groep, per
 * richting, met dezelfde normalisatie- en fallback-regels.
 */

import { describe, it, expect } from 'vitest'
import { detectRecurringTransactions, type TransactionForDetection } from './recurring-detection'

/** Vier maandelijkse afschrijvingen van dezelfde tegenpartij → één detectie. */
function maandelijkseTx(
  counterparty: string,
  amount: number,
  opts: { startDag?: string } = {},
): TransactionForDetection[] {
  const maanden = ['2026-02', '2026-03', '2026-04', '2026-05']
  const dag = opts.startDag ?? '12'
  return maanden.map((maand, i) => ({
    id: `${counterparty}-${i}`,
    date: `${maand}-${dag}`,
    amount,
    description: `${counterparty} abonnement`,
    counterparty_name: counterparty,
    is_income: amount > 0,
    budget_id: null,
  }))
}

const NETFLIX = 'Netflix International B.V.'
const SPOTIFY = 'Spotify AB'

const vind = (detected: ReturnType<typeof detectRecurringTransactions>, naam: string) =>
  detected.find((d) => d.counterpartyName === naam)

describe('detectRecurringTransactions — alreadyExists', () => {
  it('zonder bevestigde recurrings is niets als bestaand gemarkeerd', () => {
    const detected = detectRecurringTransactions(maandelijkseTx(NETFLIX, -12.99))
    expect(detected).toHaveLength(1)
    expect(vind(detected, NETFLIX)!.alreadyExists).toBe(false)
  })

  it('een bevestigde recurring met dezelfde tegenpartij wordt als bestaand gemarkeerd', () => {
    const detected = detectRecurringTransactions(
      maandelijkseTx(NETFLIX, -12.99),
      [{ counterparty_name: NETFLIX, amount: -12.99, name: 'Netflix' }],
    )
    expect(detected).toHaveLength(1)
    expect(vind(detected, NETFLIX)!.alreadyExists).toBe(true)
  })

  it('markeert alleen de groep die écht matcht, niet alle groepen', () => {
    // De kern van de hoist: de vergelijkingsset is loop-invariant, de UITKOMST
    // per groep niet. Zou `alreadyExists` één keer buiten de lus bepaald worden,
    // dan zou Spotify hier ten onrechte meeliften.
    const detected = detectRecurringTransactions(
      [...maandelijkseTx(NETFLIX, -12.99), ...maandelijkseTx(SPOTIFY, -10.99, { startDag: '03' })],
      [{ counterparty_name: NETFLIX, amount: -12.99, name: 'Netflix' }],
    )
    expect(detected).toHaveLength(2)
    expect(vind(detected, NETFLIX)!.alreadyExists).toBe(true)
    expect(vind(detected, SPOTIFY)!.alreadyExists).toBe(false)
  })

  it('vergelijkt genormaliseerd: andere casing/leestekens is dezelfde vaste last', () => {
    const detected = detectRecurringTransactions(
      maandelijkseTx(NETFLIX, -12.99),
      [{ counterparty_name: 'NETFLIX  INTERNATIONAL BV!', amount: -12.99, name: 'x' }],
    )
    expect(vind(detected, NETFLIX)!.alreadyExists).toBe(true)
  })

  it('valt terug op `name` wanneer de bevestigde recurring geen counterparty_name heeft', () => {
    const detected = detectRecurringTransactions(
      maandelijkseTx(NETFLIX, -12.99),
      [{ counterparty_name: null, amount: -12.99, name: NETFLIX }],
    )
    expect(vind(detected, NETFLIX)!.alreadyExists).toBe(true)
  })

  it('een bevestigde recurring van een ándere tegenpartij markeert niets', () => {
    const detected = detectRecurringTransactions(
      maandelijkseTx(NETFLIX, -12.99),
      [{ counterparty_name: SPOTIFY, amount: -10.99, name: 'Spotify' }],
    )
    expect(vind(detected, NETFLIX)!.alreadyExists).toBe(false)
  })

  it('inkomsten en uitgaven van dezelfde tegenpartij krijgen elk hun eigen vlag', () => {
    // Eén tegenpartij kan twee richtingen hebben (bv. salaris + terugbetaling).
    // Beide subgroepen delen dezelfde genormaliseerde naam, dus beide vlaggen
    // horen mee te bewegen met dezelfde bevestigde recurring.
    const werkgever = 'Werkgever BV'
    const detected = detectRecurringTransactions(
      [
        ...maandelijkseTx(werkgever, 2500),
        ...maandelijkseTx(werkgever, -75, { startDag: '20' }),
      ],
      [{ counterparty_name: werkgever, amount: 2500, name: 'Salaris' }],
    )
    expect(detected).toHaveLength(2)
    expect(detected.every((d) => d.alreadyExists)).toBe(true)
    expect(detected.filter((d) => d.isIncome)).toHaveLength(1)
  })
})
