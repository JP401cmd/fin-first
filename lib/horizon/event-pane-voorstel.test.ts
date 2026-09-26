import { describe, it, expect } from 'vitest'
import { risicoEventVoorstel, wijktAfVanVoorstel, isVoorstelEventType } from './event-pane-voorstel'
import { initFormState, buildDraftEvent } from './event-pane-edit-form'
import { computeSuggestedEventValues } from './event-prefill'
import { berekenWerkloosheidImpact, berekenOverlijdenPartnerImpact } from './risico-event-regels'
import { lookupAowAge } from '@/lib/aow-leeftijd'
import type { FinancialInput } from '@/lib/horizon-data'

/**
 * Het voorstel in de EventPane is een VERTALING van de canonieke rekenregels naar
 * de drie blokken — geen eigen som. Deze tests pinnen de ingevulde waarden én de
 * kasstroom van het opgeslagen event tegen de motoren voor dezelfde invoer.
 */

const profiel = { monthlyIncome: 3200, monthlyExpenses: 2800 }

function prefillMetadata(type: string, p: { monthlyIncome: number; monthlyExpenses: number }) {
  const input: FinancialInput = {
    totalAssets: 0, totalDebts: 0, monthlyIncome: p.monthlyIncome, monthlyExpenses: p.monthlyExpenses,
    yearlyMustExpenses: 0, monthlyContributions: 0, dateOfBirth: null,
  }
  return computeSuggestedEventValues(type, {
    userAowAge: lookupAowAge([], null), currentAge: 40, effectiveInput: input,
    isHouseholdView: false, effectiveNetWorth: 0, debts: [],
  }).metadata
}

describe('risicoEventVoorstel — werkloosheid', () => {
  it('pint transitievergoeding en inkomensgat tegen berekenWerkloosheidImpact', () => {
    const v = risicoEventVoorstel('werkloosheid', profiel, 40)!
    const meta = prefillMetadata('werkloosheid', profiel)
    expect(meta.huidigNetto).toBe(3200) // netto uit het profiel, via de gedeelde prefill
    const impact = berekenWerkloosheidImpact(meta)

    expect(v.velden.oneTimeAmount).toBe(Math.round(impact.transitievergoeding))
    expect(v.velden.oneTimeDirection).toBe('income')
    expect(v.velden.tempEnabled).toBe(impact.inkomensgatPerMaand > 0)
    expect(v.velden.tempAmount).toBe(Math.round(impact.inkomensgatPerMaand))
    expect(v.velden.tempDirection).toBe('expense')
    expect(v.velden.tempDurationYears).toBe(Math.max(1, Math.round(impact.totaleDuurMaanden / 12)))
    expect(v.velden.contEnabled).toBe(false)
  })

  it('het opgeslagen event draagt dezelfde kasstroom als de motor', () => {
    const state = initFormState('werkloosheid', null, 40, profiel)
    const draft = buildDraftEvent(state, null)
    const impact = berekenWerkloosheidImpact(prefillMetadata('werkloosheid', profiel))
    expect(draft.one_time_cost).toBe(-Math.round(impact.transitievergoeding))
    // inkomen − lasten = het (negatieve) inkomensgat
    expect(draft.monthly_income_change - draft.monthly_cost_change).toBe(-Math.round(impact.inkomensgatPerMaand))
    expect(draft.duration_months).toBe(impact.totaleDuurMaanden)
  })

  it('zonder profielinkomen valt de prefill terug op de catalogus-aanname (en zegt dat)', () => {
    const v = risicoEventVoorstel('werkloosheid', { monthlyIncome: 0, monthlyExpenses: 0 }, 40)!
    expect(v.grondslag.kind).toBe('werkloosheid')
    if (v.grondslag.kind === 'werkloosheid') expect(v.grondslag.nettoUitProfiel).toBe(false)
  })
})

describe('risicoEventVoorstel — overlijden partner', () => {
  it('pint de blijvende maandimpact tegen berekenOverlijdenPartnerImpact', () => {
    const v = risicoEventVoorstel('overlijden_partner', profiel, 40)!
    const impact = berekenOverlijdenPartnerImpact(prefillMetadata('overlijden_partner', profiel), {
      maandlastenHuishouden: profiel.monthlyExpenses,
    })
    expect(impact.nabestaandenpensioen).toBe(0) // geen PDF-bron meer
    expect(v.velden.contEnabled).toBe(true)
    expect(v.velden.contAmount).toBe(Math.abs(Math.round(impact.nettoMaandImpact)))
    expect(v.velden.contDirection).toBe(impact.nettoMaandImpact < 0 ? 'expense' : 'income')
    expect(v.velden.contUntilStop).toBe(false)
    expect(v.velden.tempEnabled).toBe(false)
    expect(v.velden.oneTimeAmount).toBe(0)
  })

  it('is nooit meer een blijvende INKOMST bij de catalogus-defaults (oude tekenfout)', () => {
    const state = initFormState('overlijden_partner', null, 40, profiel)
    const draft = buildDraftEvent(state, null)
    const impact = berekenOverlijdenPartnerImpact(prefillMetadata('overlijden_partner', profiel), {
      maandlastenHuishouden: profiel.monthlyExpenses,
    })
    expect(draft.monthly_income_change - draft.monthly_cost_change).toBe(Math.round(impact.nettoMaandImpact))
    expect(draft.monthly_income_change - draft.monthly_cost_change).toBeLessThan(0)
    expect(draft.duration_months).toBe(0)
  })
})

describe('initFormState met profiel — regressie', () => {
  it('andere types blijven identiek aan de aanroep zonder profiel', () => {
    for (const type of ['house_purchase', 'sabbatical', 'pension', 'custom', 'world_trip', 'scheiding']) {
      expect(initFormState(type, null, 40, profiel), type).toEqual(initFormState(type, null, 40))
    }
  })

  it('een bestaand event wordt nooit door het voorstel overschreven', () => {
    const existing = {
      id: 'x', name: 'Ontslag', event_type: 'werkloosheid', target_age: 45, target_date: null,
      one_time_cost: -1000, monthly_cost_change: 123, monthly_income_change: 0, duration_months: 24,
      icon: 'UserMinus', is_active: true, sort_order: 0, is_indexed: false, metadata: {},
    }
    expect(initFormState('werkloosheid', existing, 40, profiel)).toEqual(initFormState('werkloosheid', existing, 40))
  })

  it('isVoorstelEventType en wijktAfVanVoorstel', () => {
    expect(isVoorstelEventType('werkloosheid')).toBe(true)
    expect(isVoorstelEventType('house_purchase')).toBe(false)
    const v = risicoEventVoorstel('werkloosheid', profiel, 40)!
    const state = initFormState('werkloosheid', null, 40, profiel)
    expect(wijktAfVanVoorstel(state, v.velden)).toBe(false)
    expect(wijktAfVanVoorstel({ ...state, oneTimeAmount: state.oneTimeAmount + 1 }, v.velden)).toBe(true)
    // velden van een uitgeschakeld blok tellen niet mee
    expect(wijktAfVanVoorstel({ ...state, contAmount: 999 }, v.velden)).toBe(false)
  })
})
