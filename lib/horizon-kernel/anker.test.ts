import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import {
  buildCompleetHorizonFixture,
  buildCompleetKernelProfileBase,
} from '@/lib/regression-tests/horizon-strategie/persona-fixture'
import { buildKernelInputFromApp } from './adapter'
import {
  buildConvergentieAdapterProfile,
  computeConvergentieProjection,
  type ConvergentieRawProfileRow,
} from './convergentie-router'
import { solveFire, evaluateFireAt, resolveVastAnker, type SolverStatus } from './solver'
import { computeEs } from './tables/es'
import { eindleeftijdVan, eindMaandVan, prognoseJ } from './gap'
import { buildKernelSlotMeta, kernelToUnifiedResult } from './bridge'
import { deriveEigenHuisIds } from './adapter'
import { depletionMonth } from './runway'

/**
 * ADR 0129 — **stop-anker × eind-vorm**: één anker-resolutie in de kernel.
 *
 * Deze suite is de anker-brede opvolger van `nu-stoppen.test.ts` (ADR 0127). Wat daar
 * per strategie werd vastgepind geldt nu generiek over de drie VASTE ankers:
 *
 *  D3  `resolveVastAnker` is de ENIGE plek die een vast stopmoment naar een leeftijd
 *      omzet: `aow` → `persoon.aowLeeftijd`, `nu` → `startLeeftijd`, `leeftijd` →
 *      geklemd op `[startLeeftijd, eindleeftijd − 1/12]` (B7). Geen blok ⇒ letterlijk
 *      het oude gedrag (oracle-kortsluiting bij pensioen, anders bisectie).
 *  D3  Status: `anchor_shortfall` onder een vast anker met een tekort-lening vóór de
 *      eindleeftijd; het `nu`-anker houdt in F2 nog zijn ADR 0127-naam
 *      (`stop_now_shortfall`) omdat de /toekomst-blokken die nog lezen.
 *      De M6-schijnbereik-tak is voor élk vast anker met doel €0 onbereikbaar.
 *  D4  Bridge markeert `requiredFireIsAnchorPortfolio` en echoot `stopAnker`/`ankerMaand`.
 *  D7  Onder het `nu`-anker geldt nog steeds exact: `reached_now ⇔ runway reikt tot de
 *      eindleeftijd`.
 *
 * Buiten oracle-domein: geen fixture draagt `stopAnker`, dus de 736 parity-fixtures
 * blijven byte-identiek (aparte suite, `test/horizon-oracle`).
 */

const PINNED_AGE = 42
const AOW_FALLBACK = 67 // `aowRows: []` → `lookupAowAge`-fallback
const fx = buildCompleetHorizonFixture(PINNED_AGE)

const basisProfiel: ConvergentieRawProfileRow = {
  ...buildCompleetKernelProfileBase(PINNED_AGE),
  fire_end_strategy: 'deplete',
  fire_end_age: 90,
  fire_legacy_amount: 0,
  housing_strategy_config: { mode: 'include_full' },
}

/** De vier plan-vormen die deze suite doorrekent (drie vaste ankers + de terugval). */
const ANKER_RIJEN = {
  /** Legacy-rijvorm: het anker zit nog in `fire_end_strategy` (tegenspraak-regel D2). */
  nuLegacy: { fire_end_strategy: 'nu-stoppen' },
  nu: { fire_stop_anchor: 'now' },
  aow: { fire_stop_anchor: 'aow' },
  leeftijd58: { fire_stop_anchor: 'age', fire_stop_age: 58 },
} satisfies Record<string, Partial<ConvergentieRawProfileRow>>

const scaleAssets = (factor: number): Asset[] =>
  fx.assets.map((a) => ({ ...a, current_value: a.current_value * factor }) as Asset)

function makeInput(
  over: Partial<ConvergentieRawProfileRow> = {},
  assets: readonly Asset[] = fx.assets,
) {
  return buildKernelInputFromApp({
    profile: buildConvergentieAdapterProfile({ ...basisProfiel, ...over }),
    assets,
    debts: fx.debts,
    lifeEvents: fx.lifeEvents,
    aowRows: [],
  })
}

describe('adapter — het anker reist als BLOK, de eind-vorm als selector (D3)', () => {
  it('een legacy `nu-stoppen`-rij levert eind-vorm "Vermogen opeten" + anker `nu`', () => {
    const input = makeInput(ANKER_RIJEN.nuLegacy)
    expect(input.eindstrategie.selector).toBe('Vermogen opeten')
    expect(input.stopAnker).toEqual({ soort: 'nu' })
    // De eindleeftijd komt van de EIND-VORM (B51), niet van het anker — ongewijzigd
    // t.o.v. ADR 0127, waar de code 'nu' daar een eigen uitzondering voor had.
    expect(eindleeftijdVan(computeEs(input))).toBe(90)
  })

  it('een legacy `pensioen`-rij levert eind-vorm "Vermogen opeten" + anker `aow`', () => {
    const input = makeInput({ fire_end_strategy: 'pensioen' })
    expect(input.eindstrategie.selector).toBe('Vermogen opeten')
    expect(input.stopAnker).toEqual({ soort: 'aow' })
  })

  it('`aow × legacy` — de combinatie die vóór dit besluit onuitdrukbaar was', () => {
    const input = makeInput({
      ...ANKER_RIJEN.aow,
      fire_end_strategy: 'legacy',
      fire_legacy_amount: 100_000,
    })
    expect(input.stopAnker).toEqual({ soort: 'aow' })
    expect(input.eindstrategie.selector).toBe('Nalatenschap')
    expect(input.eindstrategie.nalatenschapBedrag).toBe(100_000)
  })

  it('`solved` laat het blok WEG (⇒ het oude bisectie-pad)', () => {
    expect(makeInput().stopAnker).toBeUndefined()
    expect(makeInput({ fire_stop_anchor: 'solved' }).stopAnker).toBeUndefined()
  })
})

describe('resolveVastAnker — de enige omzetting van anker naar leeftijd (D3/B7)', () => {
  it('aow → de AOW-leeftijd uit `persoon.aowLeeftijd` (niet een hardcoded 67)', () => {
    const input = makeInput(ANKER_RIJEN.aow)
    expect(resolveVastAnker(input, computeEs(input))).toBe(input.persoon.aowLeeftijd)
    expect(input.persoon.aowLeeftijd).toBe(AOW_FALLBACK)
  })

  it('nu → de startleeftijd in HELE jaren (P!B7, FIRE-maand 0)', () => {
    const input = makeInput(ANKER_RIJEN.nu)
    expect(resolveVastAnker(input, computeEs(input))).toBe(PINNED_AGE)
  })

  it('leeftijd → de gekozen leeftijd, fractioneel (halve jaren blijven staan)', () => {
    const input = makeInput({ fire_stop_anchor: 'age', fire_stop_age: 58.5 })
    expect(resolveVastAnker(input, computeEs(input))).toBe(58.5)
  })

  it('B7 — een stopleeftijd in het VERLEDEN gedraagt zich als "nu"', () => {
    const input = makeInput({ fire_stop_anchor: 'age', fire_stop_age: 30 })
    expect(resolveVastAnker(input, computeEs(input))).toBe(PINNED_AGE)
  })

  it('B7 — een stopleeftijd op/voorbij de eindleeftijd wordt één maand naar binnen geklemd', () => {
    const input = makeInput({ fire_stop_anchor: 'age', fire_stop_age: 95, fire_end_age: 90 })
    expect(resolveVastAnker(input, computeEs(input))).toBeCloseTo(90 - 1 / 12, 10)
  })

  it('zonder blok → null (het oude pad), óók bij eind-vorm legacy/perpetual', () => {
    for (const strategy of ['deplete', 'legacy', 'perpetual']) {
      const input = makeInput({ fire_end_strategy: strategy })
      expect(resolveVastAnker(input, computeEs(input))).toBeNull()
    }
  })
})

describe('solveFire — één kortsluiting voor alle drie de ankers (D3)', () => {
  it.each([
    ['nu (legacy-rij)', ANKER_RIJEN.nuLegacy, PINNED_AGE],
    ['nu', ANKER_RIJEN.nu, PINNED_AGE],
    ['aow', ANKER_RIJEN.aow, AOW_FALLBACK],
    ['leeftijd 58', ANKER_RIJEN.leeftijd58, 58],
  ])('%s → FIRE = het anker, één engine-run, geen bisectie', (_label, over, verwacht) => {
    const input = makeInput(over)
    const solve = solveFire(input)
    expect(solve.fireAge).toBe(verwacht)
    expect(solve.engineRuns).toBe(1)
    expect(solve.projection.summary.fireMonth).toBe(Math.round((verwacht - PINNED_AGE) * 12))
  })

  it.each([
    ['nu', ANKER_RIJEN.nu],
    ['aow', ANKER_RIJEN.aow],
    ['leeftijd 58', ANKER_RIJEN.leeftijd58],
  ])('%s ≡ evaluateFireAt op dezelfde leeftijd: identiek statusblok', (_label, over) => {
    const input = makeInput(over)
    const solve = solveFire(input)
    expect(evaluateFireAt(input, solve.fireAge)).toEqual(solve)
  })

  it('zonder anker bisecteert de solver zoals vóór dit besluit (meerdere engine-runs)', () => {
    const solve = solveFire(makeInput())
    expect(solve.engineRuns).toBeGreaterThan(1)
  })

  it('het ORACLE-pad blijft: eind-vorm-selector "Pensioenleeftijd" zonder blok kortsluit op AOW', () => {
    const input = makeInput()
    const oracleInput = {
      ...input,
      stopAnker: undefined,
      eindstrategie: { ...input.eindstrategie, selector: 'Pensioenleeftijd' as const },
    }
    const solve = solveFire(oracleInput)
    expect(solve.fireAge).toBe(oracleInput.persoon.aowLeeftijd)
    expect(solve.engineRuns).toBe(1)
    // Oracle-vorm: pensioen leest de eindleeftijd uit het Excel-artefact 100.
    expect(solve.eindleeftijd).toBe(100)
  })
})

describe('status — anchor_shortfall generiek; het nu-anker houdt in F2 zijn ADR 0127-naam', () => {
  const toegestaanNu: SolverStatus[] = ['reached_now', 'stop_now_shortfall']
  // BEVINDING (gemeten, niet aangenomen): onder een anker dat NIET vandaag ligt is
  // `reached_at` wél bereikbaar. Bij een uitgeklede persona is J(0) negatief, dus de
  // `reached_now`-toets (`J(0) ≥ doel 0`) faalt, terwijl er tot het stopmoment nog
  // jaren salaris bijkomen — het plan is dan op de eindleeftijd gedekt (gap ≥ 0)
  // zonder ooit een tekort-lening te trekken. Alleen het `nu`-anker sluit die stand
  // uit (daar valt het salaris per maand 0 weg). `unreachable_within_horizon` blijft
  // voor élk vast anker met doel €0 onbereikbaar — dat is de M6-claim.
  const toegestaanAnker: SolverStatus[] = ['reached_now', 'reached_at', 'anchor_shortfall']

  it.each([0.05, 0.25, 1, 5, 20])(
    'nu-anker, bezittingen ×%s → status ∈ {reached_now, stop_now_shortfall}',
    (factor) => {
      const solve = solveFire(makeInput(ANKER_RIJEN.nu, scaleAssets(factor)))
      expect(toegestaanNu).toContain(solve.status)
    },
  )

  it.each([0.05, 0.25, 1, 5, 20])(
    'leeftijd-anker (58), bezittingen ×%s → status ∈ {reached_now, anchor_shortfall}',
    (factor) => {
      const solve = solveFire(makeInput(ANKER_RIJEN.leeftijd58, scaleAssets(factor)))
      expect(toegestaanAnker).toContain(solve.status)
      // De M6-schijnbereik-tak is hier onbereikbaar: doel €0 + tekortAflossingUitLiquide
      // ⇒ `gap < 0` kan niet zonder tekort-lening > 0.
      expect(solve.status).not.toBe('unreachable_within_horizon')
      expect(solve.status).not.toBe('pension_shortfall')
      // Het `nu`-anker houdt zijn eigen naam; een leeftijd-anker mag 'm niet erven.
      expect(solve.status).not.toBe('stop_now_shortfall')
    },
  )

  it('arm (×0,05) + stop op 43 ⇒ anchor_shortfall (geen AOW-/stop-nu-kopij)', () => {
    // Stop vlak ná de startleeftijd: het salaris valt bijna meteen weg, dus de
    // tekort-lening springt vóór de eindleeftijd aan.
    const solve = solveFire(
      makeInput({ fire_stop_anchor: 'age', fire_stop_age: 43 }, scaleAssets(0.05)),
    )
    expect(solve.status).toBe('anchor_shortfall')
    expect(solve.tekortLeningTotEindleeftijd).toBeGreaterThan(0)
  })

  it('arm (×0,05) op het nu-anker ⇒ stop_now_shortfall (F2-compat, F4 verwijdert dit)', () => {
    const solve = solveFire(makeInput(ANKER_RIJEN.nu, scaleAssets(0.05)))
    expect(solve.status).toBe('stop_now_shortfall')
  })

  it('rijk (×20) op het nu-anker: het geld reikt tot 90 ⇒ reached_now, geen tekort-lening', () => {
    const solve = solveFire(makeInput(ANKER_RIJEN.nu, scaleAssets(20)))
    expect(solve.status).toBe('reached_now')
    expect(solve.tekortLeningTotEindleeftijd).toBe(0)
  })
})

describe('bridge — D4 (geen doelvermogen) + de anker-echo', () => {
  function bridged(over: Partial<ConvergentieRawProfileRow>, assets: readonly Asset[] = fx.assets) {
    const input = makeInput(over, assets)
    const solve = solveFire(input)
    const { assetSlotMeta, debtSlotMeta } = buildKernelSlotMeta(assets, fx.debts, deriveEigenHuisIds(assets))
    const unified = kernelToUnifiedResult(solve, { input, yearlyExpenses: 30_000, assetSlotMeta, debtSlotMeta })
    return { input, solve, unified }
  }

  it.each([
    ['nu', ANKER_RIJEN.nu, { soort: 'nu' }, 0],
    ['aow', ANKER_RIJEN.aow, { soort: 'aow' }, (AOW_FALLBACK - PINNED_AGE) * 12],
    ['leeftijd 58', ANKER_RIJEN.leeftijd58, { soort: 'leeftijd', leeftijd: 58 }, (58 - PINNED_AGE) * 12],
  ])('%s: echoot stopAnker + ankerMaand en markeert requiredFireIsAnchorPortfolio', (_l, over, anker, maand) => {
    const { unified } = bridged(over)
    expect(unified.stopAnker).toEqual(anker)
    expect(unified.ankerMaand).toBe(maand)
    expect(unified.requiredFireIsAnchorPortfolio).toBe(true)
  })

  it('zonder anker: echo null, geen ankerMaand, vlag uit', () => {
    const { unified } = bridged({})
    expect(unified.stopAnker).toBeNull()
    expect(unified.ankerMaand).toBeNull()
    expect(unified.requiredFireIsAnchorPortfolio).toBe(false)
  })

  it('nu-anker: "requiredFirePortfolio" is J(0) — geen doel (ADR 0127 D4 blijft gelden)', () => {
    const { solve, unified } = bridged(ANKER_RIJEN.nu)
    expect(unified.requiredFireIsStartPortfolio).toBe(true)
    expect(unified.requiredFirePortfolio).toBe(prognoseJ(solve.projection, 0))
    expect(unified.targetEndPortfolio).toBe(0)
    expect(unified.displayEndAge).toBe(90)
  })

  it('F2-COMPAT: `strategy` draagt nog het ANKER, zodat de /toekomst-takken blijven werken', () => {
    // F3a zet die takken over op `stopAnker`; tot dan projecteert de bridge het anker
    // terug op de legacy-label (zie `resolveLegacyStrategy`).
    expect(bridged(ANKER_RIJEN.nu).unified.strategy).toBe('nu-stoppen')
    expect(bridged(ANKER_RIJEN.aow).unified.strategy).toBe('pensioen')
    // Het `age`-anker heeft geen legacy-label → de eind-vorm.
    expect(bridged(ANKER_RIJEN.leeftijd58).unified.strategy).toBe('deplete')
    expect(bridged({ fire_end_strategy: 'perpetual' }).unified.strategy).toBe('perpetual')
  })

  it.each([0.05, 0.25, 1, 5, 20])(
    'D7 exact bij ×%s (nu-anker): reached_now ⇔ kernelDepletionMonth reikt voorbij de eindmaand',
    (factor) => {
      const { input, solve, unified } = bridged(ANKER_RIJEN.nu, scaleAssets(factor))
      const eindMaand = eindMaandVan(solve.eindleeftijd, input.startLeeftijd)
      const m = unified.kernelDepletionMonth
      expect(m).toBe(depletionMonth(solve.projection))
      const runwayReiktTotEind = m === null || m > eindMaand
      expect(solve.status === 'reached_now').toBe(runwayReiktTotEind)
      expect(solve.status === 'stop_now_shortfall').toBe(!runwayReiktTotEind)
    },
  )
})

describe('convergentie-router — erft het anker zonder eigen tak', () => {
  it.each([
    ['nu (legacy-rij)', ANKER_RIJEN.nuLegacy, PINNED_AGE],
    ['aow', ANKER_RIJEN.aow, AOW_FALLBACK],
    ['leeftijd 58', ANKER_RIJEN.leeftijd58, 58],
  ])('%s: FIRE op het anker, vlag gezet', (_label, over, verwacht) => {
    const outcome = computeConvergentieProjection({
      rawContext: {
        profile: { ...basisProfiel, ...over },
        assets: fx.assets,
        debts: fx.debts,
        lifeEvents: fx.lifeEvents,
        aowRows: [],
        yearlyExpenses: 30_000,
      },
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.result.fireAgeFractional).toBe(verwacht)
    expect(outcome.result.requiredFireIsAnchorPortfolio).toBe(true)
  })
})

/**
 * NEGATIEVE FIRE-MAAND — tot ADR 0129 ONGEVERIFIEERD gedrag.
 *
 * Twee routes leiden naar een stopmoment vóór de startleeftijd:
 *  (a) een AOW-anker bij iemand die de AOW al gepasseerd is (67 < 70);
 *  (b) de "eerder stoppen"-scenariokaart (verwacht-FIRE − 2 jaar) op een plan dat op
 *      maand 0 stopt — dan wordt de geforceerde leeftijd `start − 2`.
 *
 * Wat de engine dan doet, is vastgelegd (niet gerepareerd): de FIRE-gate staat vanaf
 * maand 0 open (de hele run is onttrekkingsfase), het guardrails-anker wordt zoals bij
 * FIRE-maand 0 op de T0-liquide-stand geïnitialiseerd — en `nettoLiquideBijFire` valt
 * op `null`, want maand −24 bestaat niet in de projectie. De bridge markeert dat met
 * `requiredFireIsEndOfHorizonFallback`, zodat de weergavelaag geen doelbedrag toont
 * (M6-vangrail) in plaats van de eindstand op leeftijd 100 als "benodigd vermogen".
 */
describe('negatieve FIRE-maand — vastgepind, niet gerepareerd', () => {
  const OUDE_LEEFTIJD = 70
  const oudFx = buildCompleetHorizonFixture(OUDE_LEEFTIJD)
  const oudProfiel: ConvergentieRawProfileRow = {
    ...buildCompleetKernelProfileBase(OUDE_LEEFTIJD),
    fire_end_strategy: 'deplete',
    fire_end_age: 90,
    fire_legacy_amount: 0,
    housing_strategy_config: { mode: 'include_full' },
    fire_stop_anchor: 'aow',
  }
  const oudInput = buildKernelInputFromApp({
    profile: buildConvergentieAdapterProfile(oudProfiel),
    assets: oudFx.assets,
    debts: oudFx.debts,
    lifeEvents: oudFx.lifeEvents,
    aowRows: [],
  })

  it('(a) AOW-anker voorbij de AOW: het anker wordt NIET geklemd — FIRE-maand is negatief', () => {
    expect(oudInput.startLeeftijd).toBe(OUDE_LEEFTIJD)
    const solve = solveFire(oudInput)
    expect(solve.fireAge).toBe(AOW_FALLBACK)
    expect(solve.projection.summary.fireMonth).toBe((AOW_FALLBACK - OUDE_LEEFTIJD) * 12)
    expect(solve.projection.summary.fireMonth).toBeLessThan(0)
  })

  it('(a) `nettoLiquideBijFire` is null ⇒ de bridge valt terug op de eind-horizonstand én markeert dat', () => {
    const solve = solveFire(oudInput)
    expect(solve.projection.summary.nettoLiquideBijFire).toBeNull()
    const { assetSlotMeta, debtSlotMeta } = buildKernelSlotMeta(
      oudFx.assets,
      oudFx.debts,
      deriveEigenHuisIds(oudFx.assets),
    )
    const unified = kernelToUnifiedResult(solve, {
      input: oudInput,
      yearlyExpenses: 30_000,
      assetSlotMeta,
      debtSlotMeta,
    })
    expect(unified.requiredFireIsEndOfHorizonFallback).toBe(true)
    // De maand-0-vlag staat bewust UIT (de FIRE-maand is niet 0 maar negatief); de
    // anker-vlag staat WEL aan — het stopmoment ligt vast, dus er is geen doelvermogen.
    expect(unified.requiredFireIsStartPortfolio).toBe(false)
    expect(unified.requiredFireIsAnchorPortfolio).toBe(true)
    expect(unified.ankerMaand).toBeLessThan(0)
  })

  it('(b) een geforceerde stop VÓÓR de startleeftijd is PROJECTIE-IDENTIEK aan FIRE-maand 0', () => {
    // DE GEMETEN UITKOMST (dit was het ongeverifieerde gedrag): de maandloop leest de
    // FIRE-gate als `m ≥ fireMaand`, en die is vanaf maand 0 waar voor élke fireMaand
    // ≤ 0. Ook de guardrails-anker-init (`fireMaand < 1` ⇒ T0-liquide-stand) valt in
    // dezelfde tak. De hele 1200-maands projectie is dus bit-voor-bit gelijk aan een
    // stop op de startleeftijd — een stop "in het verleden" wordt niet met terugwerkende
    // kracht gerekend, maar ook niet afgewezen.
    const input = makeInput(ANKER_RIJEN.nu)
    const eerder = evaluateFireAt(input, PINNED_AGE - 2)
    const opStart = evaluateFireAt(input, PINNED_AGE)
    expect(eerder.projection.summary.fireMonth).toBe(-24)
    expect(eerder.projection.summary.guardrailsAnker).toBe(opStart.projection.summary.guardrailsAnker)
    expect(eerder.projection.summary.guardrailsAnker).toBeGreaterThan(0)
    for (const m of [0, 1, 12, 120, 600, 1199]) {
      expect(prognoseJ(eerder.projection, m)).toBe(prognoseJ(opStart.projection, m))
    }
    expect(eerder.projection.summary.eindNettoLiquide).toBe(opStart.projection.summary.eindNettoLiquide)

    // HET ENIGE VERSCHIL zit in de samenvatting: maand −24 bestaat niet, dus de
    // "stand bij FIRE" is null waar hij bij maand 0 een echt getal is. Dát is wat de
    // bridge naar de eind-horizon-terugval duwt.
    expect(eerder.projection.summary.nettoLiquideBijFire).toBeNull()
    expect(opStart.projection.summary.nettoLiquideBijFire).not.toBeNull()
  })
})
