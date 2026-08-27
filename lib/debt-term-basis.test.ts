/**
 * Unit tests voor `lib/debt-term-basis.ts` — de canonieke grondslag-resolver
 * achter de "waarop gebaseerd?"-hint bij afgeleide looptijd-getallen.
 *
 * Kern van de bewijslast: een einddatum die door `buildDebtDraft` stil uit
 * `DEFAULT_TERM_YEARS_PER_TYPE` is afgeleid moet als aanname herkend worden,
 * en een door de gebruiker gezette einddatum mag dat nóóit worden (anders
 * zaait de hint juist twijfel bij een getal dat wél klopt).
 */

import { describe, it, expect } from 'vitest'
import {
  addYearsIso,
  describeDebtTermBasis,
  resolveDebtTermBasis,
} from './debt-term-basis'
import { buildDebtDraft } from './quick-add/build-drafts'

describe('resolveDebtTermBasis', () => {
  it('herkent de stille 30-jaar-default van een via de wizard aangemaakte hypotheek', () => {
    const draft = buildDebtDraft({
      debt_type: 'mortgage',
      name: 'Hypotheek',
      current_balance: 300000,
      field3: 3.5,
      start_date: '2019-05-01',
    })
    expect(resolveDebtTermBasis(draft)).toEqual({
      kind: 'default_term',
      termYears: 30,
    })
  })

  it('markeert een door de gebruiker opgegeven resterende looptijd als eigen invoer', () => {
    const draft = buildDebtDraft({
      debt_type: 'mortgage',
      name: 'Hypotheek',
      current_balance: 300000,
      field3: 3.5,
      start_date: '2019-05-01',
      term_years: 23,
    })
    expect(resolveDebtTermBasis(draft)).toEqual({ kind: 'user_set' })
    expect(describeDebtTermBasis(resolveDebtTermBasis(draft))).toBeNull()
  })

  it('geeft no_end_date bij een ontbrekende einddatum', () => {
    expect(
      resolveDebtTermBasis({
        debt_type: 'credit_card',
        start_date: '2024-01-01',
        end_date: null,
      }),
    ).toEqual({ kind: 'no_end_date' })
  })

  it('behandelt een handmatig afwijkende einddatum als eigen invoer', () => {
    expect(
      resolveDebtTermBasis({
        debt_type: 'mortgage',
        start_date: '2019-05-01',
        end_date: '2042-05-01',
      }),
    ).toEqual({ kind: 'user_set' })
  })

  it('doet geen uitspraak bij een type zonder default-looptijd of een onbruikbare start_date', () => {
    // credit_card heeft `null` in DEFAULT_TERM_YEARS_PER_TYPE — er valt geen
    // aanname te reconstrueren, dus de einddatum is per definitie eigen invoer.
    expect(
      resolveDebtTermBasis({
        debt_type: 'credit_card',
        start_date: '2024-01-01',
        end_date: '2030-01-01',
      }),
    ).toEqual({ kind: 'user_set' })

    // Onbruikbare start_date mag geen RangeError geven (addYearsIso zou op een
    // Invalid Date gooien) en ook geen aanname suggereren.
    expect(
      resolveDebtTermBasis({
        debt_type: 'mortgage',
        start_date: 'niet-een-datum',
        end_date: '2050-01-01',
      }),
    ).toEqual({ kind: 'user_set' })
  })

  it('detecteert exact, niet op jaartal', () => {
    // Zelfde jaar als de default-afleiding, andere dag ⇒ eigen invoer.
    const derived = addYearsIso('2019-05-01', 30)
    expect(derived).toBe('2049-05-01')
    expect(
      resolveDebtTermBasis({
        debt_type: 'mortgage',
        start_date: '2019-05-01',
        end_date: '2049-11-01',
      }),
    ).toEqual({ kind: 'user_set' })
  })
})

describe('describeDebtTermBasis', () => {
  it('noemt de aangenomen looptijd bij een default-einddatum', () => {
    const text = describeDebtTermBasis({ kind: 'default_term', termYears: 30 })
    expect(text).toContain('30 jaar')
    expect(text).toContain('einddatum')
  })

  it('noemt de terugval van het oppervlak wanneer er geen einddatum is', () => {
    expect(describeDebtTermBasis({ kind: 'no_end_date' }, 30)).toContain('30 jaar')
    // Zonder terugval-parameter geen verzonnen getal in de tekst.
    expect(describeDebtTermBasis({ kind: 'no_end_date' })).not.toContain('jaar.')
  })

  it('zwijgt bij eigen invoer', () => {
    expect(describeDebtTermBasis({ kind: 'user_set' })).toBeNull()
  })
})
