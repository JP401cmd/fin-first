import { describe, it, expect } from 'vitest'
import type { LifeEvent } from '@/lib/horizon-data'
import { POT_RULES_DEFAULTS } from '@/lib/pot-rules'
import { RIJ_SLEUTELS } from './instellingen-rij'
import { freedomDaysToday } from '@/lib/horizon/vrijheidsdagen'
import {
  RIJ_LABEL,
  rijStaat,
  rijwaarde,
  rijwaardeTekst,
  sectieSamenvatting,
  wizardIngangActie,
  type RijwaardenInput,
} from './instellingen-rijwaarden'

const EUR = (n: number) => `€ ${n}`

const BASIS: RijwaardenInput = {
  firePlan: { anchor: { kind: 'solved' }, endForm: 'deplete', endAge: 90, legacyAmount: 0 },
  fireStrategy: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
  withdrawalProfiel: 'afnemend',
  withdrawalStrategy: { strategy: 'static', guardrailFloor: 0.8, guardrailCeiling: 1.2, guardrailCutStep: 0.1 },
  retirementMethod: 'essential_budgets',
  uitgaveNaPensioen: 31_500,
  geenTekortLening: true,
  tekortLeningRente: 0.05,
  potRules: POT_RULES_DEFAULTS,
  events: [],
  housingStrategy: { mode: 'include_full' },
  inflationRate: 0.02,
  grossReturn: 0.05,
  box3Method: 'werkelijk',
  dagtarief: 100,
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
    expect(t('stopmoment')).toBe('zo vroeg mogelijk')
    expect(t('stopmoment')).not.toMatch(/\d/)
    expect(t('stopmoment', { firePlan: { ...BASIS.firePlan!, anchor: { kind: 'aow' } } })).toBe('op je AOW-leeftijd')
    expect(t('stopmoment', { firePlan: { ...BASIS.firePlan!, anchor: { kind: 'now' } } })).toBe('nu')
    expect(t('stopmoment', { firePlan: { ...BASIS.firePlan!, anchor: { kind: 'age', age: 58.5 } } })).toBe('op 58,5')
  })

  it('Einde van je plan beantwoordt de vraag: tot welke leeftijd en wat er over is', () => {
    expect(RIJ_LABEL.eindleeftijd).toBe('Einde van je plan')
    expect(t('eindleeftijd')).toBe('tot 90 · € 0 over')
    expect(t('eindleeftijd', { firePlan: { ...BASIS.firePlan!, endForm: 'legacy', endAge: 95, legacyAmount: 300_000 } })).toBe(
      'tot 95 · € 300000 over',
    )
    expect(t('eindleeftijd', { firePlan: { ...BASIS.firePlan!, endForm: 'perpetual' } })).toBe('vermogen blijft staan')
    // Zonder plan (oude bundel): de legacy-configuratie.
    expect(t('eindleeftijd', { firePlan: null, fireStrategy: { strategy: 'legacy', endAge: 85, legacyAmount: 1000 } })).toBe(
      'tot 85 · € 1000 over',
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
    // De presetnaam uit dezelfde bron als de presetkiezer; een eigen volgorde als pijlen.
    expect(t('onttrekkingsvolgorde')).toBe('Spaargeld eerst')
    expect(
      t('onttrekkingsvolgorde', { potRules: { ...POT_RULES_DEFAULTS, withdrawalOrderGroups: ['vastgoed', 'spaargeld', 'overig', 'pensioen', 'beleggingen'] } }),
    ).toContain(' → ')
  })

  it('levensstrategieën uit de beheerde gebeurtenissen', () => {
    const ev = (e: Partial<LifeEvent>) => ({ is_active: true, target_age: null, metadata: null, ...e }) as LifeEvent
    expect(t('aow')).toBe('nog niet op je tijdas')
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

describe('tekort-leningrente: de rente waar de kern mee rekent (review Y2)', () => {
  it('de rij toont de geresolveerde rente en kent zelf geen default', async () => {
    const { readFileSync } = await import('node:fs')
    const path = await import('node:path')
    const bron = readFileSync(path.join(process.cwd(), 'lib/toekomst/instellingen-rijwaarden.ts'), 'utf8')
    expect(bron).not.toMatch(/0\.05/)
    const page = readFileSync(path.join(process.cwd(), 'app/(app)/toekomst/(katern)/instellingen/page.tsx'), 'utf8')
    expect(page).toContain('resolveDeficitLoanRate(')
  })

  it.each([
    [null, 0.05],
    [0.045, 0.045],
    [4.5, 0.05], // buiten 0..1: de kern valt terug op de default — de rij ook
    ['x', 0.05],
  ])('DB %s → rij toont de rente van de kern (%s)', async (raw, verwacht) => {
    const { resolveDeficitLoanRate } = await import('@/lib/horizon-kernel/adapter/params')
    const rente = resolveDeficitLoanRate({ date_of_birth: null, deficit_loan_rate: raw as never })
    expect(rente).toBe(verwacht)
    expect(t('geen-tekort-lening', { geenTekortLening: false, tekortLeningRente: rente })).toBe(
      `uit · rente ${String(verwacht * 100).replace('.', ',')}${Number.isInteger(verwacht * 100) ? ',0' : ''}%`,
    )
  })
})

describe('R1 — staat per rij, sectiesamenvatting en wizardknop', () => {
  it('standaard alleen waar de app een eigen default heeft', () => {
    expect(rijStaat('stopmoment', BASIS)).toBe('standaard')
    expect(rijStaat('stopmoment', { ...BASIS, firePlan: { ...BASIS.firePlan!, anchor: { kind: 'aow' } } })).toBe('ingesteld')
    expect(rijStaat('geen-tekort-lening', BASIS)).toBe('standaard')
    expect(rijStaat('geen-tekort-lening', { ...BASIS, geenTekortLening: false })).toBe('ingesteld')
    expect(rijStaat('verdeling-toename', { ...BASIS, potRules: { ...POT_RULES_DEFAULTS, surplusGroup: 'spaargeld' } })).toBe('ingesteld')
    expect(rijStaat('inflatie', BASIS)).toBe('standaard')
    expect(rijStaat('rendement', BASIS)).toBe('ingesteld') // 5% ≠ de default van de app
    expect(rijStaat('box3', BASIS)).toBe('ingesteld')
    expect(rijStaat('uitgave-na-pensioen', { ...BASIS, uitgaveNaPensioen: 0 })).toBe('ontbreekt')
    expect(rijStaat('aow', BASIS)).toBe('ontbreekt')
    expect(rijStaat('huis', { ...BASIS, housingStrategy: null })).toBe('standaard')
  })

  it('de samenvatting van sectie II telt de aangepaste regels', () => {
    const potten = ['geen-tekort-lening', 'onttrekkingsvolgorde', 'verdeling-toename', 'onttrekking-afname'] as const
    expect(sectieSamenvatting(potten, BASIS)).toBe('4 regels · alle standaard')
    expect(sectieSamenvatting(potten, { ...BASIS, geenTekortLening: false })).toBe('4 regels · 1 aangepast')
  })

  it('de knop van de wizard-ingang volgt de stand (0 · deels · klaar)', () => {
    expect(wizardIngangActie({ bevestigd: 0, voltooid: false })).toBe('Beginnen')
    expect(wizardIngangActie({ bevestigd: 2, voltooid: false })).toBe('Verder')
    expect(wizardIngangActie({ bevestigd: 5, voltooid: true })).toBe('Opnieuw doorlopen')
  })

  it('uitgave na pensioen: vrijheidstijd uit freedomDaysToday met het dagtarief uit de bundel', () => {
    const [, bedrag] = rijwaarde('uitgave-na-pensioen', { ...BASIS, dagtarief: 90 })
    expect(bedrag).toMatchObject({
      bedrag: 31_500,
      vrijheidsdagen: freedomDaysToday({ nominalAmount: 31_500, canonicalDailyRate: 90 }),
    })
    expect(typeof bedrag === 'object' && bedrag.vrijheidsdagen).toBe(350)
    // Onbekende grondslag (ADR 0131): geen getal.
    const [, zonder] = rijwaarde('uitgave-na-pensioen', { ...BASIS, dagtarief: 90, dagtariefBron: 'none' })
    expect(typeof zonder === 'object' && zonder.vrijheidsdagen).toBeNull()
  })
})
