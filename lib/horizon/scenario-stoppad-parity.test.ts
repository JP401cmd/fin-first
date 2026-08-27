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

/**
 * M2 — het stop-pad draagt de €/mnd-hint van zijn EIGEN stand.
 *
 * De bevinding was geen rekenfout: de solver berekende P!B96 (`maandHint`) al voor elke
 * doorgerekende stand, maar `runForcedStopPath` liet het veld vallen. Het scherm kon
 * daardoor bij een zelfgekozen stopleeftijd wél tonen dát het niet gedekt is, maar nooit
 * wat daar dan bij hoort. Deze suite pint de drie eigenschappen vast waarop het nieuwe
 * tekstblok op /toekomst leunt.
 *
 * (a) PARITEIT — op de gesolvede FIRE-leeftijd reduceert het inherit-stop-pad tot de
 *     hoofdrun (zie de GOLDEN hierboven), dus hoort ook de hint EXACT gelijk te zijn aan
 *     de hoofdrun-hint (`kernelMaandHint`, de bridge-uitvoer die de banner al gebruikt).
 *     Exacte gelijkheid, geen epsilon: het is per constructie hetzelfde `solve`-object.
 * (b) TEKEN — eerder stoppen dan de verwachting laat een gat vallen, dus is de hint
 *     positief. Dat teken is tegelijk de UI-gate ("dekking onder 100%"), dus het is geen
 *     losse sanity-check maar de voorwaarde zelf.
 * (c) MONOTONIE — hoe eerder je wilt stoppen, hoe meer er per maand bij hoort. Een hint
 *     die de verkeerde kant op loopt zou op het scherm plausibel ogen.
 */
describe('stop-pad-maandHint — het omgekeerde antwoord op de gekozen stopleeftijd (M2)', () => {
  it('(a) stopAge = gesolvede fireAgeFractional ⇒ maandHint ≡ de hoofdrun-hint (exact)', () => {
    const run = stopPad(VERWACHT_FIRE)
    expect(run).not.toBeNull()
    expect(baseOutcome.ok).toBe(true)
    expect(run!.maandHint).toBe(baseOutcome.ok ? baseOutcome.kernelMaandHint : NaN)
  })

  it('(b) eerder stoppen dan de verwachting ⇒ maandHint > 0 (= de UI-gate "dekking < 100%")', () => {
    const run = stopPad(VERWACHT_FIRE - 5)
    expect(run).not.toBeNull()
    expect(run!.maandHint).toBeGreaterThan(0)
    // Het gat waar de hint uit volgt, hoort in dezelfde run te zitten (−gap ÷ maanden).
    expect(Number.isFinite(run!.maandHint)).toBe(true)
  })

  it('(c) hoe eerder de gekozen stop, hoe hoger de maandHint', () => {
    const drieEerder = stopPad(VERWACHT_FIRE - 3)!
    const achtEerder = stopPad(VERWACHT_FIRE - 8)!
    expect(achtEerder.maandHint).toBeGreaterThan(drieEerder.maandHint)
  })
})
