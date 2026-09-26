import { describe, it, expect } from 'vitest'
import type { LifeEvent } from '@/lib/horizon-data'
import { POT_RULES_DEFAULTS } from '@/lib/pot-rules'
import { RIJ_SLEUTELS } from './instellingen-rij'
import { RIJ_LABEL, rijwaarde, rijwaardeTekst, type RijwaardenInput } from './instellingen-rijwaarden'

const EUR = (n: number) => `€ ${n}`

const BASIS: RijwaardenInput = {
  firePlan: { anchor: { kind: 'solved' }, endForm: 'deplete', endAge: 90, legacyAmount: 0 },
  fireStrategy: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
  withdrawalProfiel: 'afnemend',
  withdrawalStrategy: { strategy: 'static', guardrailFloor: 0.8, guardrailCeiling: 1.2, guardrailCutStep: 0.1 },
  retirementMethod: 'essential_budgets',
  uitgaveNaPensioen: 31_500,
  geenTekortLening: true,
  tekortLeningRente: null,
  potRules: POT_RULES_DEFAULTS,
  events: [],
  housingStrategy: { mode: 'include_full' },
  inflationRate: 0.02,
  grossReturn: 0.05,
  effectiveSwr: 0.034,
  box3Method: 'werkelijk',
}

const t = (rij: Parameters<typeof rijwaarde>[0], over: Partial<RijwaardenInput> = {}) =>
  rijwaardeTekst(rijwaarde(rij, { ...BASIS, ...over }), EUR)

describe('rijwaarden van katern Instellingen', () => {
  it('elke rij heeft een label en een niet-lege waarde', () => {
    for (const rij of RIJ_SLEUTELS) {
      expect(RIJ_LABEL[rij]).toBeTruthy()
      expect(t(rij).length).toBeGreaterThan(0)
    }
  })

  it('Stopmoment noemt de keuze, nooit een leeftijdsgetal onder een opgelost anker (§4.9)', () => {
    expect(t('stopmoment')).toBe('zo vroeg als het kan')
    expect(t('stopmoment')).not.toMatch(/\d/)
    expect(t('stopmoment', { firePlan: { ...BASIS.firePlan!, anchor: { kind: 'aow' } } })).toBe('op mijn AOW-leeftijd')
    expect(t('stopmoment', { firePlan: { ...BASIS.firePlan!, anchor: { kind: 'now' } } })).toBe('nu')
    expect(t('stopmoment', { firePlan: { ...BASIS.firePlan!, anchor: { kind: 'age', age: 58.5 } } })).toBe('op 58,5')
  })

  it('eindleeftijd en wat er overblijft volgen de eind-vorm', () => {
    expect(t('eindleeftijd')).toBe('tot je 90e · niets over')
    expect(t('eindleeftijd', { firePlan: { ...BASIS.firePlan!, endForm: 'legacy', endAge: 95, legacyAmount: 300_000 } })).toBe(
      'tot je 95e · € 300000 over',
    )
    expect(t('eindleeftijd', { firePlan: { ...BASIS.firePlan!, endForm: 'perpetual' } })).toBe('je vermogen mag niet slinken')
    // Zonder plan (oude bundel): de legacy-configuratie.
    expect(t('eindleeftijd', { firePlan: null, fireStrategy: { strategy: 'legacy', endAge: 85, legacyAmount: 1000 } })).toBe(
      'tot je 85e · € 1000 over',
    )
  })

  it('uitgave na pensioen = methode + het bedrag uit de bron van KPI 4', () => {
    expect(t('uitgave-na-pensioen')).toBe('je essentiële budgetten · € 31500 per jaar')
    expect(t('uitgave-na-pensioen', { retirementMethod: 'custom_amount' })).toMatch(/^een eigen bedrag/)
  })

  it('onttrekking, tekort-lening, pot-regels', () => {
    expect(t('onttrekking')).toBe('afnemend')
    expect(t('onttrekking', { withdrawalProfiel: 'guardrails' })).toBe('guardrails · vloer 80% · plafond 120%')
    expect(t('geen-tekort-lening')).toBe('aan')
    expect(t('geen-tekort-lening', { geenTekortLening: false, tekortLeningRente: 0.045 })).toBe('uit · rente 4,5%')
    expect(t('verdeling-toename', { potRules: { ...POT_RULES_DEFAULTS, surplusGroup: 'schuld_aflossen' } })).toBe(
      'schulden aflossen',
    )
    expect(t('onttrekkingsvolgorde')).toContain(' → ')
  })

  it('levensstrategieën uit de beheerde gebeurtenissen', () => {
    const ev = (e: Partial<LifeEvent>) => ({ is_active: true, target_age: null, metadata: null, ...e }) as LifeEvent
    expect(t('aow')).toBe('niet op je tijdas')
    expect(t('aow', { events: [ev({ event_type: 'aow', metadata: { leefsituatie: 'alleenstaand' } as never })] })).toBe(
      'wettelijke leeftijd · alleenstaand',
    )
    expect(t('pensioen', { events: [ev({ event_type: 'pension' }), ev({ event_type: 'pension' })] })).toBe('2 pensioenpotten')
    expect(t('werk')).toBe('nog niet ingesteld')
    expect(t('huis', { housingStrategy: { mode: 'reverse_mortgage' } as never })).toBe('opeethypotheek')
  })

  it('marktaannames in nl-NL', () => {
    expect(t('inflatie')).toBe('2,0% per jaar')
    expect(t('rendement')).toBe('5,0% per jaar')
    expect(t('box3')).toBe('werkelijk rendement')
  })
})
