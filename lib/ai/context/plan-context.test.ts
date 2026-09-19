import { describe, it, expect } from 'vitest'
import {
  REVERSE_MORTGAGE_DEFAULT_MAX_LOAN_PCT,
  REVERSE_MORTGAGE_DEFAULT_RATE,
} from '@/lib/constants'
import type { FirePlan } from '@/lib/fire-strategy'
import type { EindsituatieDuiding } from '@/lib/horizon/eindsituatie-duiding'
import { eindOorzaakKort } from '@/lib/horizon/eindsituatie-copy'
import { buildPlanInstellingenLines, type PlanContextInput } from './plan-context'

const PLAN: FirePlan = { anchor: { kind: 'solved' }, endForm: 'deplete', endAge: 90, legacyAmount: 0 }

function build(over: Partial<PlanContextInput> = {}): string[] {
  return buildPlanInstellingenLines({
    firePlan: PLAN,
    profile: { housing_strategy_config: { mode: 'include_full' } },
    anchorFixed: false,
    eindsituatie: null,
    ...over,
  })
}

const text = (over: Partial<PlanContextInput> = {}) => build(over).join('\n')

/** Een duiding met alleen de velden die de bouwer leest; de rest is neutrale vulling. */
function makeDuiding(oorzaken: EindsituatieDuiding['oorzaken']): EindsituatieDuiding {
  const nul = { age: 90, bedrag: 250_000, inflationFactor: 2.2 }
  return {
    eindAge: 90,
    overschot: nul,
    dieptepunt: null,
    oorzaken,
    context: { huis: null, opeetschuld: null },
    eenduidig: oorzaken.length === 1,
  }
}

describe('buildPlanInstellingenLines — eind-vorm', () => {
  it('noemt "vermogen opeten" met de plan-eindleeftijd onder een niet-vast anker', () => {
    expect(text()).toContain('vermogen opeten')
    expect(text()).toContain('tot je 90e')
  })

  it('laat de plan-eindleeftijd weg onder een vast anker (die draagt buildAnkerContextLine al)', () => {
    // Twee formuleringen van hetzelfde planeinde laten het model kiezen — risico 1.
    expect(text({ anchorFixed: true })).not.toContain('90e')
  })

  it('noemt bij nalatenschap dát er een bedrag moet overblijven, zonder het bedrag', () => {
    const t = text({ firePlan: { ...PLAN, endForm: 'legacy', legacyAmount: 150_000 } })
    expect(t).toContain('nalatenschap')
    expect(t).not.toContain('150')
  })

  it('noemt bij "niet laten slinken" geen eindleeftijd (de horizon-cap is geen keuze)', () => {
    const t = text({ firePlan: { ...PLAN, endForm: 'perpetual' } })
    expect(t).toContain('niet laten slinken')
    expect(t).not.toContain('90e')
  })

  it('laat de eind-vorm-regel weg zonder plan', () => {
    expect(text({ firePlan: null })).not.toContain('Eind-vorm')
  })
})

describe('buildPlanInstellingenLines — tekort-lening (ADR 0149)', () => {
  it('leest NULL/afwezig als AAN-staande eis ("geen tekort-lening", de standaard)', () => {
    expect(text()).toContain('Tekort-lening: UIT')
    expect(text({ profile: { fire_no_deficit_loan: null } })).toContain('Tekort-lening: UIT')
    expect(text({ profile: { fire_no_deficit_loan: true } })).toContain('Tekort-lening: UIT')
  })

  it('noemt bij een toegestane tekort-lening de rente uit resolveDeficitLoanRate', () => {
    const t = text({ profile: { fire_no_deficit_loan: false, deficit_loan_rate: 0.062 } })
    expect(t).toContain('Tekort-lening: AAN')
    expect(t).toContain('6.2%')
  })

  it('valt bij een ontbrekende rente terug op de Excel-default (5%), niet op een eigen getal', () => {
    // CONSUME, DON'T RECOMPUTE: een eigen `?? 0.05` hier zou driften van
    // EXCEL_TEKORT_LENING_RENTE. De resolver is de enige bron.
    expect(text({ profile: { fire_no_deficit_loan: false } })).toContain('5%')
  })
})

describe('buildPlanInstellingenLines — woonstrategie', () => {
  it('zwijgt bij "meerekenen" en "uitsluiten" (geen mechaniek te vertellen)', () => {
    expect(text()).not.toContain('Woonstrategie')
    expect(text({ profile: { housing_strategy_config: { mode: 'exclude_from_fire' } } })).not.toContain(
      'Woonstrategie',
    )
  })

  it('noemt bij opeethypotheek startleeftijd, plafond-% en rente uit buildWoning', () => {
    const t = text({
      profile: { housing_strategy_config: { mode: 'reverse_mortgage', trigger: 'fixed_age', triggerAge: 70 } },
    })
    expect(t).toContain('opeethypotheek')
    expect(t).toContain('vanaf je 70e')
    expect(t).toContain(`${REVERSE_MORTGAGE_DEFAULT_MAX_LOAN_PCT * 100}%`)
    expect(t).toContain(`${REVERSE_MORTGAGE_DEFAULT_RATE * 100}%`)
    expect(t).toContain('leenplafond')
  })

  it('beschrijft de behoefte-trigger als "zodra …", niet als een vaste leeftijd', () => {
    const t = text({
      profile: {
        housing_strategy_config: {
          mode: 'reverse_mortgage',
          trigger: 'on_depletion',
          triggerAge: 67,
          fallbackAge: 80,
        },
      },
    })
    // Zelfde bewoording als de verkoop-tak: beide triggers delen één kernel-drempel.
    expect(t).toContain('zodra je liquide vermogen onder je marge zakt')
    expect(t).toContain('80e')
  })

  it('noemt bij verkopen het verkoopmoment', () => {
    const t = text({
      profile: { housing_strategy_config: { mode: 'downsize', trigger: 'fixed_age', triggerAge: 72 } },
    })
    expect(t).toContain('huis verkopen')
    expect(t).toContain('op je 72e')
  })
})

describe('buildPlanInstellingenLines — eindsituatie-oorzaken (laag C)', () => {
  it('noemt de oorzaken met hun leeftijden, in de volgorde van de detector', () => {
    const t = text({
      eindsituatie: makeDuiding([
        { id: 'geen-tekort-lening', age: 68, bedrag: null },
        { id: 'opeet-plafond', age: 69, bedrag: null },
        { id: 'later-inkomen', age: 80, bedrag: null },
      ]),
    })
    expect(t).toContain('rond je 68e is je liquide geld (bijna) op')
    expect(t).toContain('op je 69e is het leenplafond van je opeethypotheek bereikt')
    expect(t).toContain('vanaf je 80e dekt inkomen')
    expect(t.indexOf('68e')).toBeLessThan(t.indexOf('80e'))
  })

  it('valt bij een oorzaak zonder leeftijd terug op "een later moment" (gedeelde tabel)', () => {
    expect(text({ eindsituatie: makeDuiding([{ id: 'nu-stoppen', age: null, bedrag: null }]) })).toContain(
      'het vroegste stopmoment is vandaag',
    )
    expect(text({ eindsituatie: makeDuiding([{ id: 'late-baten', age: null, bedrag: null }]) })).toContain(
      'een later moment',
    )
  })

  it('gebruikt LETTERLIJK dezelfde zinnen als de kick-off-tekst, alleen in de je-vorm', () => {
    // Eén tabel, twee afnemers: zou plan-context een eigen formulering krijgen, dan
    // draagt hetzelfde gesprek dezelfde oorzaak in twee bewoordingen.
    const o = { id: 'opeet-plafond' as const, age: 69, bedrag: null }
    expect(text({ eindsituatie: makeDuiding([o]) })).toContain(eindOorzaakKort(o, 'je'))
    expect(eindOorzaakKort(o, 'ik')).toContain('mijn opeethypotheek')
  })

  it('zwijgt zonder duiding', () => {
    expect(text()).not.toContain('Waarom er aan het eind')
  })
})

describe('buildPlanInstellingenLines — grendels', () => {
  /** Elke variant die de bouwer kan produceren, in één lijst. */
  const ALLE_VARIANTEN: string[] = (['deplete', 'legacy', 'perpetual'] as const).flatMap((endForm) =>
    [true, false].flatMap((anchorFixed) =>
      [undefined, false].flatMap((noDeficit) =>
        (
          [
            { mode: 'include_full' },
            { mode: 'exclude_from_fire' },
            { mode: 'downsize', trigger: 'fixed_age', triggerAge: 72 },
            { mode: 'reverse_mortgage', trigger: 'on_depletion', triggerAge: 67, fallbackAge: 82 },
          ] as const
        ).map((housing) =>
          text({
            firePlan: { ...PLAN, endForm, legacyAmount: 150_000 },
            anchorFixed,
            profile: {
              fire_no_deficit_loan: noDeficit,
              deficit_loan_rate: 0.062,
              housing_strategy_config: housing,
            },
            eindsituatie: makeDuiding([
              { id: 'geen-tekort-lening', age: 68, bedrag: { age: 68, bedrag: 12_500, inflationFactor: 1.8 } },
              { id: 'opeet-plafond', age: 69, bedrag: null },
            ]),
          }),
        ),
      ),
    ),
  )

  it('produceert NOOIT een euro-bedrag (spiegelt de grendel in eindsituatie-copy.test.ts)', () => {
    for (const t of ALLE_VARIANTEN) {
      expect(t).not.toMatch(/€/)
      // Duizendtallen in welke notatie dan ook: 12.500 / 12,500 / 12500.
      expect(t).not.toMatch(/\b\d{1,3}[.,]?\d{3}\b/)
    }
  })

  it('noemt NOOIT een stop- of vrijheidsleeftijd (die draagt buildAnkerContextLine/buildFireMomentLine)', () => {
    for (const t of ALLE_VARIANTEN) {
      expect(t).not.toMatch(/stopmoment: /i)
      expect(t).not.toMatch(/vrijheidsleeftijd/i)
      expect(t).not.toMatch(/vrij mogelijk vanaf/i)
      expect(t).not.toMatch(/FIRE-datum/i)
    }
  })

  it('blijft beschrijvend — geen advies, geen imperatief (Wft)', () => {
    for (const t of ALLE_VARIANTEN) {
      expect(t).not.toMatch(/\b(je zou|je moet|overweeg|advies|adviseer|beter kun je|raad(en)? (wij|we) )/i)
    }
  })

  it('houdt een standaardgebruiker op de minimale set regels', () => {
    // deplete + tekort-lening uit + woning meerekenen + geen duiding = eind-vorm,
    // tekort-lening, slotinstructie. Elke nieuwe vaste regel is permanent én per beurt.
    expect(build()).toHaveLength(3)
    // Strak gezet: elke permanente contextregel kost per chatbeurt, voor elke gebruiker.
    expect(text().length).toBeLessThan(420)
  })

  it('levert een lege lijst (en dus geen slotinstructie) wanneer er niets te vertellen valt', () => {
    expect(buildPlanInstellingenLines({ firePlan: null, profile: null, anchorFixed: false, eindsituatie: null })).toEqual(
      [],
    )
  })
})
