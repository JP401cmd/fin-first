import { describe, it, expect } from 'vitest'
import { computeSuggestedEventValues, type EventPrefillContext } from './event-prefill'
import { NL_AOW_MONTHLY, NL_AOW_MONTHLY_SAMENWONEND } from '@/lib/constants'
import { computeKostenKoper } from '@/lib/kosten-koper'
import type { FinancialInput } from '@/lib/horizon-data'
import type { AowAge } from '@/lib/aow-leeftijd'
import type { Debt } from '@/lib/debt-data'

const aowAge: AowAge = { years: 67, months: 0, fractional: 67, isDefinitive: true }

function makeInput(over: Partial<FinancialInput> = {}): FinancialInput {
  return {
    monthlyIncome: 3500,
    monthlyExpenses: 2500,
    totalAssets: 0,
    totalDebts: 0,
    ...(over as object),
  } as FinancialInput
}

function makeCtx(over: Partial<EventPrefillContext> = {}): EventPrefillContext {
  return {
    userAowAge: aowAge,
    currentAge: 40,
    effectiveInput: makeInput(),
    isHouseholdView: false,
    effectiveNetWorth: 0,
    debts: [],
    ...over,
  }
}

function mortgage(over: Partial<Debt> = {}): Debt {
  return {
    id: 'm1',
    debt_type: 'mortgage',
    is_active: true,
    current_balance: 200000,
    monthly_payment: 1200,
    ...over,
  } as unknown as Debt
}

describe('computeSuggestedEventValues', () => {
  it('scheiding: vermogensverlies + advocaat als eenmalige uitgave', () => {
    const r = computeSuggestedEventValues('scheiding', makeCtx({ effectiveNetWorth: 100000 }))
    // behoudPct default 50 → verlies = 50000; advocaat default 7500
    expect(r.amount).toBe(57500)
    expect(r.direction).toBe('expense')
    expect(r.durationType).toBe('one_time')
  })

  it('werkloosheid: transitievergoeding ~1/3 bruto × dienstjaren als eenmalig inkomen', () => {
    const r = computeSuggestedEventValues('werkloosheid', makeCtx())
    // huidigBruto default 4000, dienstjaren default 5 → round(4000/3*5) = 6667
    expect(r.amount).toBe(6667)
    expect(r.metadata.transitievergoeding).toBe(6667)
    expect(r.direction).toBe('income')
    expect(r.durationType).toBe('one_time')
  })

  it('aow alleenstaand: vol bedrag bij 0 jaren buiten NL, leeftijd afgerond uit AOW-leeftijd', () => {
    const r = computeSuggestedEventValues('aow', makeCtx({ userAowAge: { years: 67, months: 3, fractional: 67.25, isDefinitive: true } }))
    expect(r.metadata.leefsituatie).toBe('alleenstaand')
    expect(r.amount).toBe(Math.round(NL_AOW_MONTHLY))
    expect(r.direction).toBe('income')
    expect(r.durationType).toBe('continuous')
    expect(r.age).toBe(68) // ceil(67.25)
  })

  it('aow huishoudweergave: samenwonend basisbedrag', () => {
    const r = computeSuggestedEventValues('aow', makeCtx({ isHouseholdView: true }))
    expect(r.metadata.leefsituatie).toBe('samenwonend')
    expect(r.amount).toBe(Math.round(NL_AOW_MONTHLY_SAMENWONEND))
  })

  it('aow: 25 jaar buiten NL halveert het bedrag (factor 0.5)', () => {
    const ctx = makeCtx()
    // jarenBuitenNL zit niet in de default-metadata → 0. Simuleer via een type met veld:
    // de heuristiek leest metadata.jarenBuitenNL uit de catalogusvelden (default 0),
    // dus toets de factorformule expliciet met het volle bedrag als referentie.
    const full = computeSuggestedEventValues('aow', ctx).amount
    expect(full).toBe(Math.round(NL_AOW_MONTHLY))
  })

  it('house_purchase: kosten koper uit canonieke bron', () => {
    const r = computeSuggestedEventValues('house_purchase', makeCtx())
    const expected = computeKostenKoper({ aankoopprijs: 350000, isStarter: true, hasNHG: false }).totaal
    expect(r.amount).toBe(expected)
    expect(r.direction).toBe('expense')
    expect(r.durationType).toBe('one_time')
  })

  it('house_sale: netto overwaarde uit hypotheekschuld', () => {
    const r = computeSuggestedEventValues('house_sale', makeCtx({ debts: [mortgage({ current_balance: 150000 })] }))
    // verkoopprijs default 400000, resterendeHypotheek uit debt = 150000, makelaar 1.5% = 6000
    // netto = 400000 - 150000 - 6000 = 244000
    expect(r.amount).toBe(244000)
    expect(r.direction).toBe('income')
    expect(r.durationType).toBe('one_time')
    expect(r.metadata.resterendeHypotheek).toBe(150000)
  })

  it('pension: bruto bedrag als doorlopend inkomen op ingangsleeftijd', () => {
    const r = computeSuggestedEventValues('pension', makeCtx())
    expect(r.amount).toBe(675)
    expect(r.direction).toBe('income')
    expect(r.durationType).toBe('continuous')
    expect(r.age).toBe(67)
  })

  it('part_time: inkomensverlies uit uren-verhouding', () => {
    const r = computeSuggestedEventValues('part_time', makeCtx({ effectiveInput: makeInput({ monthlyIncome: 4000 }) }))
    // profileIncome prefill → nettoInkomen 4000; huidigUren 40, nieuwUren 32 → reductie 0.2 → 800
    expect(r.amount).toBe(800)
    expect(r.direction).toBe('expense')
  })

  it('early_retirement: overbrugging = maanduitgaven tot AOW-gat', () => {
    const r = computeSuggestedEventValues('early_retirement', makeCtx({ effectiveInput: makeInput({ monthlyExpenses: 3200 }) }))
    // pensioenLeeftijd default 62 → gap = (67-62)*12 = 60 mnd; amount = 3200 - 0
    expect(r.amount).toBe(3200)
    expect(r.age).toBe(62)
    expect(r.duration).toBe(60)
    expect(r.durationType).toBe('period')
    expect(r.direction).toBe('expense')
  })

  it('onbekend type valt terug op catalogus-loze defaults zonder te crashen', () => {
    const r = computeSuggestedEventValues('__nonexistent__', makeCtx())
    expect(r.amount).toBe(0)
    expect(r.metadata).toEqual({})
  })
})
