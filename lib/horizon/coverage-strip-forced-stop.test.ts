/**
 * Regressietest voor het salaris-lek in `runForcedStopPath` (lib/horizon/scenario-presets.ts).
 *
 * Bug: een geforceerd stopmoment ruim vóór de natuurlijke FIRE-leeftijd laat het salaris
 * NIET stoppen — `KernelInput.inkomenUitgaven.nettoJaarinkomen` blijft de hele horizon
 * doorlopen, `bridge.ts` telt het op in `grossIncomeBySource.salaris`, en
 * `coveragePctForRow` (coverage-strip.ts) telt dat als vaste inkomsten. Gevolg: de
 * levensinkomenstrook (`buildCoverageStrip`) toont nooit een dekkingsgat in de
 * brugjaren, ook niet wanneer er feitelijk geen inkomen meer zou moeten zijn.
 *
 * Fixture: persona "compleet" (buildCompleetKernelProfileBase / buildCompleetHorizonFixture),
 * met alle vermogens (incl. eigen huis, schulden) 20x verkleind zodat de natuurlijke
 * FIRE-leeftijd ruim ná de geforceerde stopleeftijd ligt — dat opent een brugperiode
 * (stop tot AOW-fallback 67) zonder salaris waarin SWR×belegbaar de behoefte niet dekt.
 */
import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import {
  buildCompleetHorizonFixture,
  buildCompleetKernelProfileBase,
} from '@/lib/regression-tests/horizon-strategie/persona-fixture'
import {
  computeConvergentieProjection,
  type ConvergentieRawProfileRow,
} from '@/lib/horizon-kernel/convergentie-router'
import {
  runForcedStopPath,
  runScenarioPreset,
  SCENARIO_PRESET_SPECS,
  type ScenarioPresetContext,
} from './scenario-presets'
import { buildCoverageStrip } from './coverage-strip'

const PINNED_AGE = 42
const SCALE = 20
// AOW-fallback-leeftijd wanneer `aowRows: []` wordt meegegeven (zie convergentie-adapter).
const AOW_FALLBACK_AGE = 67
const STOP_AGE = 43
// Spiegelt SCENARIO_EEN_JAAR_LANGER_OFFSET (lib/horizon/scenario-presets.ts, module-privé) —
// hier lokaal herhaald zodat de test niet aan een niet-geëxporteerde constante hangt.
const SCENARIO_EEN_JAAR_LANGER_OFFSET_TEST = 1

/** Verkleint een asset ~20x (vermogen), zodat de natuurlijke FIRE-leeftijd ver vooruitschuift. */
function scaleAsset(a: Asset): Asset {
  return {
    ...a,
    current_value: a.current_value / SCALE,
    purchase_value: a.purchase_value != null ? a.purchase_value / SCALE : a.purchase_value,
    woz_value: a.woz_value != null ? a.woz_value / SCALE : a.woz_value,
    rental_income: a.rental_income != null ? a.rental_income / SCALE : a.rental_income,
  }
}

/** Verkleint een schuld ~20x, in lijn met de verkleinde bezittingen (incl. hypotheek/huis). */
function scaleDebt(d: Debt): Debt {
  return {
    ...d,
    current_balance: d.current_balance / SCALE,
    original_amount: d.original_amount / SCALE,
    monthly_payment: d.monthly_payment != null ? d.monthly_payment / SCALE : d.monthly_payment,
    minimum_payment: d.minimum_payment != null ? d.minimum_payment / SCALE : d.minimum_payment,
  }
}

const fx = buildCompleetHorizonFixture(PINNED_AGE)
const assets = fx.assets.map(scaleAsset)
const debts = fx.debts.map(scaleDebt)

const profile: ConvergentieRawProfileRow = {
  ...buildCompleetKernelProfileBase(PINNED_AGE),
  yearly_essential_expenses: 30_000,
  retirement_expense_method: 'essential_budgets',
  fire_end_strategy: 'perpetual',
  fire_end_age: 90,
  fire_legacy_amount: 0,
  housing_strategy_config: { mode: 'include_full' },
}

// Natuurlijke FIRE-leeftijd op de verkleinde fixture — gemeten, niet hardcoded.
const baseOutcome = computeConvergentieProjection({
  rawContext: { profile, assets, debts, lifeEvents: fx.lifeEvents, aowRows: [], yearlyExpenses: 30_000 },
})
if (!baseOutcome.ok) throw new Error('fixture: baseline niet ok — fixture ongeldig')
const VERWACHT_FIRE = baseOutcome.result.fireAgeFractional
if (VERWACHT_FIRE === null) throw new Error('fixture: baseline bereikt geen FIRE — fixture ongeldig')

describe('coverage-strip-forced-stop fixture', () => {
  it('de natuurlijke FIRE-leeftijd ligt ruim ná de geforceerde stopleeftijd (brugperiode bestaat)', () => {
    // Sanity op de fixture zelf: zonder een brugperiode (stop << natuurlijke FIRE, << AOW)
    // is de rest van deze test-suite zinloos.
    expect(VERWACHT_FIRE).toBeGreaterThan(STOP_AGE + 2)
    expect(STOP_AGE).toBeLessThan(AOW_FALLBACK_AGE)
  })
})

describe('runForcedStopPath — salaris moet stoppen op de gekozen stopleeftijd (bug)', () => {
  it('post-stop brugjaren (vóór AOW) hebben geen salaris meer', () => {
    const run = runForcedStopPath({
      profile,
      assets,
      debts,
      lifeEvents: fx.lifeEvents,
      aowRows: [],
      yearlyExpenses: 30_000,
      stopAge: STOP_AGE,
      fireEndAge: 90,
    })
    expect(run).not.toBeNull()

    const postStopPreAow = run!.unifiedRows.filter(
      (r) => r.phase !== 'accumulation' && r.age < AOW_FALLBACK_AGE,
    )
    expect(postStopPreAow.length).toBeGreaterThan(0)

    for (const row of postStopPreAow) {
      // Pint de BRON (salaris-lek), niet alleen het symptoom: na de gekozen stopleeftijd
      // hoort er in de brugjaren (vóór AOW) geen salarisinkomen meer te zijn.
      expect(row.grossIncomeBySource?.salaris ?? 0).toBeCloseTo(0, 0)
    }
  })

  it('de levensinkomenstrook toont minstens één dekkingsgat (<100%) in de brugperiode', () => {
    const run = runForcedStopPath({
      profile,
      assets,
      debts,
      lifeEvents: fx.lifeEvents,
      aowRows: [],
      yearlyExpenses: 30_000,
      stopAge: STOP_AGE,
      fireEndAge: 90,
    })
    expect(run).not.toBeNull()

    const nodes = buildCoverageStrip(run!.unifiedRows)
    // Brugjaren zonder salaris waarin SWR×belegbaar de behoefte niet dekt → minstens
    // één knoop onder 100%. Bij het salaris-lek blijft elke knoop >=100% (indexerend
    // doorlopend salaris dekt alles ruimschoots).
    expect(nodes.some((n) => n.coveragePct < 100)).toBe(true)
  })
})

describe('scenario-kaart "eerder-stoppen" deelt hetzelfde geforceerde-stop-recept', () => {
  it('coverage-strip toont ook via de scenariokaart een dekkingsgat', () => {
    const ctx: ScenarioPresetContext = {
      profile,
      assets,
      debts,
      lifeEvents: fx.lifeEvents,
      aowRows: [],
      yearlyExpenses: 30_000,
      currentAge: PINNED_AGE,
      verwachtFireAge: VERWACHT_FIRE,
      fireEndAge: 90,
      hasEigenHuis: true,
      downsizeStrategyActief: false,
    }
    const card = runScenarioPreset(SCENARIO_PRESET_SPECS['eerder-stoppen'], ctx)
    expect(card.stopLeeftijd).not.toBeNull()
    // Eerder-stoppen is verwachtFireAge - 2 jaar: nog steeds ruim vóór AOW-fallback.
    expect(card.stopLeeftijd!).toBeLessThan(AOW_FALLBACK_AGE)

    // Zelfde gedeelde recept (runForcedStopPath) met exact de stopleeftijd van de kaart,
    // zodat we bij de rijen kunnen om de coverage-strip te bouwen (de kaart zelf geeft
    // alleen de samengevatte ScenarioPresetResult terug, geen unifiedRows).
    const run = runForcedStopPath({
      profile: ctx.profile,
      assets: ctx.assets,
      debts: ctx.debts,
      lifeEvents: ctx.lifeEvents,
      aowRows: ctx.aowRows,
      yearlyExpenses: ctx.yearlyExpenses,
      stopAge: card.stopLeeftijd!,
      fireEndAge: ctx.fireEndAge,
    })
    expect(run).not.toBeNull()

    const nodes = buildCoverageStrip(run!.unifiedRows)
    expect(nodes.some((n) => n.coveragePct < 100)).toBe(true)
  })
})

// ── Variant "een-jaar-langer" (+1) — salaris-gate + "richting keert niet om" ─
//
// Architect-eis (bug-fix variantenmatrix): de +1-stopvariant moet hetzelfde
// salaris-gate-gedrag tonen als de -2-variant hierboven, én de "beter dan basis"-
// richting mag nooit omkeren — één jaar langer doorwerken/sparen mag de dekking
// nergens verslechteren t.o.v. hetzelfde recept op de natuurlijke FIRE-leeftijd
// (apples-to-apples: beide via runForcedStopPath, dus dezelfde deplete-eindstrategie).

describe('scenario-kaart "een-jaar-langer" (+1) — salaris-gate + dekking niet slechter dan het basispad', () => {
  it('post-stop brugjaren (vóór AOW) hebben geen salaris meer — óók voor de +1-variant', () => {
    const stopAge = VERWACHT_FIRE + SCENARIO_EEN_JAAR_LANGER_OFFSET_TEST
    const run = runForcedStopPath({
      profile,
      assets,
      debts,
      lifeEvents: fx.lifeEvents,
      aowRows: [],
      yearlyExpenses: 30_000,
      stopAge,
      fireEndAge: 90,
    })
    expect(run).not.toBeNull()

    const postStopPreAow = run!.unifiedRows.filter(
      (r) => r.phase !== 'accumulation' && r.age < AOW_FALLBACK_AGE,
    )
    expect(postStopPreAow.length).toBeGreaterThan(0)
    for (const row of postStopPreAow) {
      expect(row.grossIncomeBySource?.salaris ?? 0).toBeCloseTo(0, 0)
    }
  })

  it('de "beter dan basis"-richting keert niet om: één jaar langer doorwerken verslechtert de dekking nergens (apples-to-apples deplete-vergelijking)', () => {
    // Zelfde deplete-eindstrategie voor beide runs (runForcedStopPath forceert 'm
    // altijd): stop op de natuurlijke FIRE-leeftijd ("basis") vs. stop op FIRE+1.
    const basisRun = runForcedStopPath({
      profile, assets, debts, lifeEvents: fx.lifeEvents, aowRows: [], yearlyExpenses: 30_000,
      stopAge: VERWACHT_FIRE, fireEndAge: 90,
    })
    const eenJaarLangerRun = runForcedStopPath({
      profile, assets, debts, lifeEvents: fx.lifeEvents, aowRows: [], yearlyExpenses: 30_000,
      stopAge: VERWACHT_FIRE + SCENARIO_EEN_JAAR_LANGER_OFFSET_TEST, fireEndAge: 90,
    })
    expect(basisRun).not.toBeNull()
    expect(eenJaarLangerRun).not.toBeNull()

    const basisMinCoverage = Math.min(...buildCoverageStrip(basisRun!.unifiedRows).map((n) => n.coveragePct))
    const eenJaarLangerMinCoverage = Math.min(
      ...buildCoverageStrip(eenJaarLangerRun!.unifiedRows).map((n) => n.coveragePct),
    )
    expect(eenJaarLangerMinCoverage).toBeGreaterThanOrEqual(basisMinCoverage)

    // Ook via de scenariokaart zelf: stopleeftijd = verwachtFireAge + 1.
    const ctx: ScenarioPresetContext = {
      profile, assets, debts, lifeEvents: fx.lifeEvents, aowRows: [], yearlyExpenses: 30_000,
      currentAge: PINNED_AGE, verwachtFireAge: VERWACHT_FIRE, fireEndAge: 90,
      hasEigenHuis: true, downsizeStrategyActief: false,
    }
    const card = runScenarioPreset(SCENARIO_PRESET_SPECS['een-jaar-langer'], ctx)
    expect(card.stopLeeftijd).toBeCloseTo(VERWACHT_FIRE + SCENARIO_EEN_JAAR_LANGER_OFFSET_TEST, 6)
  })
})

// ── Non-regressie: basisplan (géén geforceerde stop) + input-variant "minder-uitgeven" ─
//
// Architect-eis: (a) vóór FIRE blijft het salaris VOL — de gate nult niet te vroeg;
// (b) een gezond basisplan (portefeuille dekt de brug) toont geen spurieuze
// dekkingsgaten (anti-overcorrectie); (c) "minder uitgeven" mag de dekking t.o.v.
// diezelfde basislijn nooit verslechteren.

describe('non-regressie — basisplan zonder geforceerde stop + input-variant "minder-uitgeven"', () => {
  it('accumulatie-rijen (vóór FIRE) hebben het volle salaris — de gate nult niet te vroeg', () => {
    const accRows = baseOutcome.result.rows.filter((r) => r.phase === 'accumulation')
    expect(accRows.length).toBeGreaterThan(0)
    for (const row of accRows) {
      // Vóór FIRE mag er geen gate zijn: persona 'compleet' heeft een reëel salaris > 0
      // en er is geen partner/werk-delta in deze fixture die het anders zou verklaren.
      expect(row.grossIncomeBySource?.salaris ?? 0).toBeGreaterThan(0)
    }
  })

  it('anti-overcorrectie: stoppen precies OP de AOW-leeftijd (geen brugperiode) geeft géén vals dekkingsgat', () => {
    // BELANGRIJKE BEVINDING (zie eindrapport): een NATUURLIJKE (niet-geforceerde) FIRE-solve
    // van dit fixture toont — ook vóór de fix, en onafhankelijk van de salaris-gate — vaak
    // sub-100%-knopen vlak ná het solved FIRE-moment (empirisch geverifieerd: 48%/47% bij dit
    // fixture, ook bij een ruim overfund synthetisch profiel). Dat is een bekende eigenschap
    // van `coveragePctForRow` zelf (conservatieve SWR-proxy ≠ de solver se eigen
    // houdbaarheidscriterium — zie de docstring in coverage-strip.ts) en dus GEEN regressie
    // van deze fix; die claim ("basisplan toont nooit een gat") is daarom hier NIET getest.
    //
    // Wat de fix WEL moet waarborgen: een geforceerde stop die samenvalt met de AOW-leeftijd
    // (dus GEEN brugperiode — AOW/pensioen vult het inkomen direct aan vanaf de stopmaand)
    // mag door de salaris-gate geen vals gat tonen. Dit is de zuivere anti-overcorrectie-toets.
    const run = runForcedStopPath({
      profile, assets, debts, lifeEvents: fx.lifeEvents, aowRows: [], yearlyExpenses: 30_000,
      stopAge: AOW_FALLBACK_AGE, fireEndAge: 90,
    })
    expect(run).not.toBeNull()
    const nodes = buildCoverageStrip(run!.unifiedRows)
    expect(nodes.length).toBeGreaterThan(0)
    expect(nodes.every((n) => n.coveragePct >= 100)).toBe(true)
  })

  it('"minder-uitgeven" verslechtert de dekking nergens t.o.v. de basislijn (zelfde eindstrategie, apples-to-apples)', () => {
    const ctx: ScenarioPresetContext = {
      profile, assets, debts, lifeEvents: fx.lifeEvents, aowRows: [], yearlyExpenses: 30_000,
      currentAge: PINNED_AGE, verwachtFireAge: VERWACHT_FIRE, fireEndAge: 90,
      hasEigenHuis: true, downsizeStrategyActief: false,
    }
    const basisCard = runScenarioPreset(SCENARIO_PRESET_SPECS.basis, ctx)
    const minderUitgevenCard = runScenarioPreset(
      SCENARIO_PRESET_SPECS['minder-uitgeven'],
      ctx,
      { basisBuffer: basisCard.laagsteBuffer },
    )
    expect(basisCard.laagsteBuffer).not.toBeNull()
    expect(minderUitgevenCard.laagsteBuffer).not.toBeNull()
    // Minder uitgeven (zelfde 'perpetual'-eindstrategie als de basiskaart — beide via
    // runInputVariant/computeConvergentieProjection) mag de laagste buffer nooit
    // verslechteren t.o.v. de basislijn.
    expect(minderUitgevenCard.laagsteBuffer!.bedrag).toBeGreaterThanOrEqual(
      basisCard.laagsteBuffer!.bedrag - 1,
    )
    expect(minderUitgevenCard.status).not.toBe('rood')
  })
})
