import { describe, it, expect } from 'vitest'
import {
  computeConvergentieProjection,
  type ConvergentieRawContext,
  type ConvergentieRawProfileRow,
} from '@/lib/horizon-kernel/convergentie-router'
import {
  buildCompleetHorizonFixture,
  buildCompleetKernelProfileBase,
} from '@/lib/regression-tests/horizon-strategie/persona-fixture'
import { runForcedStopPath, type ForcedStopPathInput } from './scenario-presets'

/**
 * GOLDEN — het stop-pad met `endStrategy: 'inherit'` is "de hoofdlijn met een latere gate".
 *
 * De hook (`use-horizon-fire-sim.ts`) draait het gekozen-stop-pad sinds ronde 3 op de EIGEN
 * eindstrategie van het profiel. Deze suite pint de twee eigenschappen vast waarop de
 * doel-lijn op /toekomst leunt:
 *
 *  (a) **Identiteit op de verwachting.** Zet je de stopleeftijd exact op de GESOLVEDE
 *      FIRE-leeftijd en verander je verder niets, dan is de stop-run identiek aan de
 *      hoofdrun — dezelfde rijen, dezelfde FIRE-leeftijd, hetzelfde eindpunt. De
 *      stippellijn valt dan samen met de hoofdlijn; elk verschil dat je ziet komt van een
 *      échte keuze, niet van het recept.
 *  (b) **Monotonie.** Kies je een stopleeftijd op/ná de verwachting, dan ligt de stoplijn
 *      op geen enkele leeftijd ónder het gesolvede pad (langer doorwerken kan je vermogen
 *      niet verlagen).
 *
 * Contrast-test: dezelfde run met de DEFAULT (`'deplete'`) wijkt wél af — dat pint het
 * besluit vast dat de hook op `'inherit'` hoort te staan (spiegel van de
 * router-contrast-test in `scenario-baseline-parity.test.ts`).
 *
 * ## Tolerantie — bewuste keuze
 *  - (a) is een GOLDEN: **exacte gelijkheid, géén epsilon**. Het inherit-pad reduceert per
 *    constructie tot dezelfde `evaluateFireAt`-aanroep op dezelfde kernel-invoer als de
 *    solver zelf; elk verschil zou een echte recept-drift zijn, geen float-ruis.
 *  - (b) is een ORDENING-claim op euro-bedragen die in de miljoenen lopen. Daar is een
 *    RELATIEVE tolerantie fout (bij €3 mln zou 1e-9 al tientallen euro's toestaan en een
 *    kleine systematische dip verbergen), dus gebruiken we een ABSOLUTE tolerantie van
 *    €0,01 — onder de kleinste betekenisvolle geldeenheid. Empirisch is die marge nu
 *    volledig slack: de rijen vóór de gate zijn byte-identiek, dus het gemeten minimum
 *    van (stop − basis) is exact 0.
 */

const PINNED_AGE = 42
/**
 * Hoge essentiële jaaruitgaven (90k) zodat de basislijn FIRE op een échte toekomst-leeftijd
 * bereikt (~62,6) i.p.v. "nu al bereikt" — anders is er geen band tussen verwacht en stop
 * om iets over te beweren.
 */
const ESSENTIAL_YEARLY = 90_000
/** Absolute tolerantie voor de monotonie-ordening (zie tolerantie-keuze in de kop). */
const MONOTONIE_EUR_TOLERANTIE = 0.01

const fx = buildCompleetHorizonFixture(PINNED_AGE)

const profile: ConvergentieRawProfileRow = {
  ...buildCompleetKernelProfileBase(PINNED_AGE),
  yearly_essential_expenses: ESSENTIAL_YEARLY,
  retirement_expense_method: 'essential_budgets',
  // Perpetual: de eindstrategie waar 'inherit' en de geforceerde deplete het duidelijkst
  // uiteenlopen (weergave-eindpunt 100 vs. 90).
  fire_end_strategy: 'perpetual',
  fire_end_age: 90,
  fire_legacy_amount: 0,
  housing_strategy_config: { mode: 'include_full' },
}

const baseContext: ConvergentieRawContext = {
  profile,
  assets: fx.assets,
  debts: fx.debts,
  lifeEvents: fx.lifeEvents,
  aowRows: [],
  yearlyExpenses: ESSENTIAL_YEARLY,
}

const baseOutcome = computeConvergentieProjection({ rawContext: baseContext })
if (!baseOutcome.ok) throw new Error('fixture ongeldig — basislijn niet ok')
const VERWACHT_FIRE = baseOutcome.result.fireAgeFractional
if (VERWACHT_FIRE === null) throw new Error('fixture ongeldig — basislijn bereikt geen FIRE')

function stopPad(stopAge: number, over: Partial<ForcedStopPathInput> = {}) {
  return runForcedStopPath({
    profile,
    assets: fx.assets,
    debts: fx.debts,
    lifeEvents: fx.lifeEvents,
    aowRows: [],
    yearlyExpenses: ESSENTIAL_YEARLY,
    stopAge,
    fireEndAge: 90,
    endStrategy: 'inherit',
    ...over,
  })
}

describe('stop-pad-pariteit — inherit op de verwachting ≡ de hoofdlijn', () => {
  it('sanity: de basislijn bereikt FIRE op een echte toekomst-leeftijd', () => {
    expect(baseOutcome.ok).toBe(true)
    expect(VERWACHT_FIRE).toBeGreaterThan(PINNED_AGE + 5)
    expect(baseOutcome.ok && baseOutcome.result.fireReachable).toBe(true)
  })

  it('GOLDEN: stopAge = gesolvede fireAgeFractional, geen overrides ⇒ rijen ≡ hoofdrun (exact)', () => {
    const run = stopPad(VERWACHT_FIRE)
    expect(run).not.toBeNull()
    expect(run!.unifiedRows).toEqual(baseOutcome.result.rows)
    expect(run!.result.fireAgeFractional).toBe(baseOutcome.result.fireAgeFractional)
    expect(run!.result.displayEndAge).toBe(baseOutcome.result.displayEndAge)
    expect(run!.result.strategy).toBe(baseOutcome.result.strategy)
    expect(run!.result.requiredFirePortfolio).toBe(baseOutcome.result.requiredFirePortfolio)
  })

  it('contrast: dezelfde run op de DEFAULT (deplete) wijkt af — pint het inherit-besluit vast', () => {
    const geforceerd = stopPad(VERWACHT_FIRE, { endStrategy: undefined })
    expect(geforceerd).not.toBeNull()
    // Zelfde pad, maar een geforceerde deplete-duiding en een 10 jaar vroeger eindpunt →
    // de doel-lijn zou eerder ophouden dan de hoofdlijn (clipRowsToPlanEnd).
    expect(geforceerd!.result.strategy).not.toBe(baseOutcome.result.strategy)
    expect(geforceerd!.result.displayEndAge).not.toBe(baseOutcome.result.displayEndAge)
    expect(geforceerd!.result.displayEndAge).toBeLessThan(baseOutcome.result.displayEndAge)
  })
})

describe('stop-pad-monotonie — stop ≥ verwacht ligt nergens onder het gesolvede pad', () => {
  for (const extraJaren of [0, 1, 3, 5]) {
    it(`stop = verwacht + ${extraJaren} jaar ⇒ geen enkele leeftijd onder de basislijn`, () => {
      const run = stopPad(VERWACHT_FIRE + extraJaren)
      expect(run).not.toBeNull()
      const basisRows = baseOutcome.result.rows
      expect(run!.unifiedRows).toHaveLength(basisRows.length)

      let laagsteVerschil = Number.POSITIVE_INFINITY
      let laagsteLeeftijd = -1
      for (let i = 0; i < basisRows.length; i++) {
        expect(run!.unifiedRows[i].age).toBe(basisRows[i].age)
        const verschil = run!.unifiedRows[i].netWorth - basisRows[i].netWorth
        if (verschil < laagsteVerschil) {
          laagsteVerschil = verschil
          laagsteLeeftijd = basisRows[i].age
        }
      }
      expect(
        laagsteVerschil,
        `stoplijn duikt onder de basislijn op leeftijd ${laagsteLeeftijd}`,
      ).toBeGreaterThanOrEqual(-MONOTONIE_EUR_TOLERANTIE)
    })
  }

  it('later stoppen levert daadwerkelijk méér vermogen op (geen no-op)', () => {
    const opVerwacht = stopPad(VERWACHT_FIRE)!
    const vijfLater = stopPad(VERWACHT_FIRE + 5)!
    const laat = Math.ceil(VERWACHT_FIRE) + 6
    const a = opVerwacht.unifiedRows.find((r) => r.age === laat)!
    const b = vijfLater.unifiedRows.find((r) => r.age === laat)!
    expect(b.netWorth).toBeGreaterThan(a.netWorth)
  })
})
