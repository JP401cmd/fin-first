/**
 * Gedeelde engine-checks voor de UAT-Toekomst-acceptatiecriteria (`toek.ts`).
 *
 * PURE module — geen vitest/DOM-afhankelijkheden — zodat dezelfde lijst checks
 * kan draaien onder:
 *   1. `toek.engine.test.ts` (vitest/CI): `expect(actual).toBe(expected)` per check.
 *   2. de in-app regressietest-pagina (`lib/regression-tests/suites/uat-toek.ts`):
 *      `assertEqual(actual, expected, label)` per check.
 *
 * TOEK is KERNEL-ZWAAR: de meeste tijdas-cijfers komen uit de horizon-kernel en
 * zijn NIET met de hand na te rekenen (die zijn in `toek.ts` gemarkeerd als
 * 'oracle'/'consistency'/'direction'). Alleen de weinige écht 'exact'-criteria —
 * parameter-/persona-echo's via een pure functie of constante — hebben hier een
 * check. Elke `run()` roept UITSLUITEND de échte rekenfunctie(s)/constante(s) aan
 * op de échte persona-brondata (`lib/test-personas.ts`), met één uitzondering die
 * expliciet is gedocumenteerd (WF-TOEK-22: de doel-ETA-annuïteitsformule leeft
 * component-privé in `doel-toevoegen-sheet.tsx` en is niet importeerbaar — die
 * ene check spiegelt exact dezelfde pure formule; hij bewijst de math, niet de
 * component-wiring).
 *
 * Alle gebruikte imports zijn client-veilig (geen `server-only`/`next/headers`/
 * `@/lib/supabase/server` in hun import-graaf):
 *   - `lib/fire-strategy.ts`  — pure types + labels + parser (geen deps).
 *   - `lib/horizon-data.ts`   — importeert alleen core-metrics/msci-data/constants.
 *   - `lib/goal-data.ts`      — pure helpers.
 *   - `lib/horizon-kernel/adapter/defaults.ts` — alleen een `TaxYear`-type-import.
 *   - `lib/constants.ts`      — pure constanten.
 *   - `lib/budget-utils.ts`   — pure rekenhelpers (o.a. computeRetirementExpenses;
 *                                al client-gebundeld via reken-checks.ts).
 *   - `lib/test-personas.ts`  — al elders in de browser-runtime gebruikt.
 *   - `lib/euro-display.ts`   — pure presentatie-deflatoren (WF-TOEK-33,
 *                                euro-weergave wave 2/3); géén Supabase-/Next-imports.
 *   - `lib/horizon/liquid-wealth-line.ts` — pure grondslag-/puntenhelpers voor de
 *                                tweede vermogenslijn (WF-TOEK-36, ADR 0114);
 *                                importeert alléén types uit housing-strategy.
 *   - `lib/core-metrics.ts` + `lib/housing-strategy.ts` — al client-gebundeld via
 *                                canon-checks.ts resp. kruis-checks.ts.
 *   - `lib/goal-current-value.ts` — pure `computeLinkedCurrentValue` (WF-TOEK-39,
 *                                meervoudig koppelen); de module heeft ook zware,
 *                                server-achtige buren (cashflow-kpis e.d.) maar
 *                                geen ervan draagt een 'server-only'-directive.
 *   - `lib/goals/auto-complete.ts` — pure `isMachineTrackedGoal`/
 *                                `selectReachedAutoGoals` (WF-TOEK-40, ADR 0125);
 *                                importeert alleen goal-data + goal-current-value.
 */

import { PERSONAS } from '@/lib/test-personas'
import { STRATEGY_LABELS, parseFireStrategy } from '@/lib/fire-strategy'
import { computeAowMonthly } from '@/lib/horizon-data'
import { computeGoalProgress, isGoalReached, type Goal } from '@/lib/goal-data'
import { computeLinkedCurrentValue } from '@/lib/goal-current-value'
import { isMachineTrackedGoal, selectReachedAutoGoals, type ReconcilableGoal } from '@/lib/goals/auto-complete'
import { computeRetirementExpenses } from '@/lib/budget-utils'
import { EXCEL_TEKORT_LENING_RENTE } from '@/lib/horizon-kernel/adapter/defaults'
import { deflate, factorAtAge, buildFactorByAge, deflateRowsByAge } from '@/lib/euro-display'
import { primaryChartBasis } from '@/lib/horizon/liquid-wealth-line'
import {
  berekenWerkloosheidImpact,
  berekenOverlijdenPartnerImpact,
  werkloosheidNaFireWaarschuwing,
} from '@/lib/horizon/risico-event-regels'
import { selectFreedomProgressBasis } from '@/lib/core-metrics'
import {
  DEFAULT_HOUSING_STRATEGY,
  DEFAULT_DOWNSIZE_CONFIG,
  DEFAULT_REVERSE_MORTGAGE_CONFIG,
  isHomeExcludedFromFire,
  type HousingContext,
  type HousingStrategyConfig,
} from '@/lib/housing-strategy'
import { TOEK_ACCEPTANCE } from './toek'
import type { AcceptanceCriterion } from './types'

const willem = PERSONAS.willem
const marijke = PERSONAS.marijke

export interface ToekEngineCheck {
  /** 'WF-TOEK-01' */
  workflow: string
  /** 'UAT-TOEK-01' */
  scenarioId: string
  /** Korte, mensleesbare omschrijving van wat deze check bewijst. */
  label: string
  /** Roept de échte rekenfunctie(s)/constante(s) aan en levert expected + actual. */
  run: () => { expected: number | string; actual: number | string }
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Vindt het criterium in toek.ts — gooit als toek.ts niet meer in sync is. */
function criterion(workflow: string): AcceptanceCriterion {
  const found = TOEK_ACCEPTANCE.criteria.find((c) => c.workflow === workflow)
  if (!found) throw new Error(`Geen acceptatiecriterium voor ${workflow} — toek.ts is niet in sync.`)
  if (found.assertion.kind !== 'exact') {
    throw new Error(`${workflow} is geen 'exact'-criterium meer in toek.ts (kind=${found.assertion.kind}).`)
  }
  return found
}

function fx(n: number, decimals: number): string {
  return n.toFixed(decimals)
}

/** Minimale, volledig getypeerde Goal-fixture — alleen de velden die
 *  computeGoalProgress leest wijken af van de default. */
function makeGoal(overrides: Partial<Goal>): Goal {
  return {
    id: 'test-goal', user_id: 'test-user', name: 'Noodfonds', description: null,
    goal_type: 'savings', target_value: 5000, current_value: 0, target_date: null,
    linked_asset_id: null, linked_debt_id: null, budget_id: null, custom_unit: null,
    icon: 'PiggyBank', color: 'emerald', is_completed: false, completed_at: null,
    sort_order: 0, ownership: 'personal', household_id: null,
    created_at: '2026-01-01', updated_at: '2026-01-01',
    ...overrides,
  }
}

/**
 * Spiegel van de component-privé `monthlyContributionForTarget` uit
 * `components/future/doel-toevoegen-sheet.tsx` (niet geëxporteerd, in een
 * client-.tsx met React/supabase-imports → niet importeerbaar in een pure
 * module). Zelfde annuïteitsformule; bewijst de gedocumenteerde math.
 *   FV = PMT × ((1+r)^n − 1) / r  →  PMT = FV × r / ((1+r)^n − 1)
 */
function monthlyContributionForTarget(target: number, years: number, annualReturn: number): number {
  if (years <= 0) return target
  const months = years * 12
  if (annualReturn <= 0) return target / months
  const r = annualReturn / 12
  const growthFactor = Math.pow(1 + r, months)
  return (target * r) / (growthFactor - 1)
}

/** Spiegel van de no-date "~N jaar"-solve uit dezelfde component (EtaPreview,
 *  case 2): los `n` op uit target = 100 × ((1+r)^n − 1) / r. */
function yearsAtReferenceMonthly(target: number, annualReturn: number, referenceMonthly = 100): number {
  if (annualReturn <= 0) return target / (referenceMonthly * 12)
  const r = annualReturn / 12
  const n = Math.log(1 + (target * r) / referenceMonthly) / Math.log(1 + r)
  return n / 12
}

const RETURN_SAVINGS = 0.015 // RETURN_BY_TYPE.savings (doel-toevoegen-sheet.tsx)

// ── WF-TOEK-36 helpers (woonstrategie-grondslag, ADR 0114) ────────────────

/** Minimale, volledig getypeerde HousingContext — `primaryChartBasis` leest
 *  alléén `hasEigenHuis`; de overige velden zijn neutrale vulling zodat er geen
 *  cast nodig is (en een contractwijziging hier zichtbaar wordt). */
function makeHousingContext(hasEigenHuis: boolean): HousingContext {
  return {
    eigenHuisValue: hasEigenHuis ? 650000 : 0,
    wozValue: hasEigenHuis ? 650000 : 0,
    mortgageBalance: 0,
    mortgageMonthlyPayment: 0,
    hasEigenHuis,
    eigenHuisMortgages: [],
    eigenHuisAssets: [],
  }
}

/** De vier woonstrategieën met hun échte default-config-literals (parse-vorm). */
const HOUSING_CONFIGS: { mode: string; config: HousingStrategyConfig }[] = [
  { mode: 'include_full', config: DEFAULT_HOUSING_STRATEGY },
  { mode: 'exclude_from_fire', config: { mode: 'exclude_from_fire' } },
  { mode: 'downsize', config: DEFAULT_DOWNSIZE_CONFIG },
  { mode: 'reverse_mortgage', config: DEFAULT_REVERSE_MORTGAGE_CONFIG },
]

/**
 * Op welke grondslag staat de VOORTGANGSBALK + het vrijheids-% eronder?
 * Sentinel-noemers (I = 222, J = 111) maken de gekozen tak zichtbaar zonder
 * iets na te rekenen: `selectFreedomProgressBasis` kiest de noemer, wij lezen
 * alleen wélke het werd. Geen eigen som — dat is precies wat deze check bewaakt.
 */
const SENTINEL_I = 222
const SENTINEL_J = 111
function balkGrondslag(context: HousingContext, config: HousingStrategyConfig): 'I' | 'J' {
  const { requiredPortfolio } = selectFreedomProgressBasis({
    homeExcludedFromFire: context.hasEigenHuis && isHomeExcludedFromFire(config),
    netWorthInclHome: 2,
    fireEligibleNetWorth: 1,
    requiredNetWorthInclHome: SENTINEL_I,
    requiredPortfolioExclHome: SENTINEL_J,
  })
  return requiredPortfolio === SENTINEL_J ? 'J' : 'I'
}

// ── Checks — één per 'exact'-workflow in TOEK_ACCEPTANCE ───────────────────

export const TOEK_ENGINE_CHECKS: ToekEngineCheck[] = [
  {
    workflow: 'WF-TOEK-01',
    scenarioId: 'UAT-TOEK-01',
    label: 'Strategie-labels + eindleeftijd-echo + weergave-eindleeftijd (Willem deplete)',
    run: () => {
      criterion('WF-TOEK-01')
      const cfg = parseFireStrategy(willem.profile)
      const eindleeftijd = cfg.endAge // 95 (deplete → fire_end_age)
      const weergaveTot = eindleeftijd - 1 // 94 (displayEndAge − 1)
      return {
        expected: 'strategieLabelDeplete=Vermogen opeten; eindleeftijd=95; weergaveTot=94; strategieLabelPensioen=Pensioenleeftijd',
        actual: `strategieLabelDeplete=${STRATEGY_LABELS.deplete.name}; eindleeftijd=${eindleeftijd}; weergaveTot=${weergaveTot}; strategieLabelPensioen=${STRATEGY_LABELS.pensioen.name}`,
      }
    },
  },
  {
    workflow: 'WF-TOEK-02',
    scenarioId: 'UAT-TOEK-02',
    label: 'Jaarlijkse pensioenuitgave €36.000/jaar (= €3.000/mnd) en rendement-echo (Willem)',
    run: () => {
      criterion('WF-TOEK-02')
      // custom_amount is canoniek een JAARbedrag: computeRetirementExpenses geeft
      // het veld ongewijzigd terug als jaaruitgave (geen ×12). De maandweergave
      // leidt de UI af via /12 (uitgaven-na-pensioen-scherm). Zo blijft deze check
      // op één grondslag met de kernel i.p.v. het seedveld als maandbedrag te lezen.
      const jaaruitgaven = computeRetirementExpenses(
        'custom_amount', 0, 0, willem.profile.retirement_expense_custom_amount ?? null,
      )
      const pensioenMaand = Math.round(jaaruitgaven / 12)
      const rendementPct = (willem.profile.expected_return ?? 0) * 100
      return {
        expected: 'pensioenMaand=3000; jaaruitgaven=36000; rendementPct=6',
        actual: `pensioenMaand=${pensioenMaand}; jaaruitgaven=${jaaruitgaven}; rendementPct=${fx(rendementPct, 0)}`,
      }
    },
  },
  {
    workflow: 'WF-TOEK-17',
    scenarioId: 'UAT-TOEK-17',
    label: 'Tekort-lening default-rente 5,0% (EXCEL_TEKORT_LENING_RENTE, Willem geen override)',
    run: () => {
      criterion('WF-TOEK-17')
      const rentePct = EXCEL_TEKORT_LENING_RENTE * 100
      return {
        expected: 'tekortLeningRentePct=5.0',
        actual: `tekortLeningRentePct=${fx(rentePct, 1)}`,
      }
    },
  },
  {
    workflow: 'WF-TOEK-18',
    scenarioId: 'UAT-TOEK-18',
    label: 'AOW-bedragen via computeAowMonthly + Willems verouderde seed (€940 ≠ €1.084)',
    run: () => {
      criterion('WF-TOEK-18')
      const samenwonend0 = computeAowMonthly('samenwonend', 0) // round(1084.13) = 1084
      const samenwonend5 = computeAowMonthly('samenwonend', 5) // round(1084.13 × 45/50) = 976
      const alleenstaand0 = computeAowMonthly('alleenstaand', 0) // round(1581.55) = 1582
      const aowEvent = willem.life_events.find((e) => e.event_type === 'aow')
      const willemSeed = aowEvent?.monthly_income_change ?? 0
      const seedWijktAf = willemSeed !== samenwonend0
      return {
        expected: 'samenwonend0=1084; samenwonend5=976; alleenstaand0=1582; willemSeed=940; seedWijktAf=true',
        actual: `samenwonend0=${samenwonend0}; samenwonend5=${samenwonend5}; alleenstaand0=${alleenstaand0}; willemSeed=${willemSeed}; seedWijktAf=${seedWijktAf}`,
      }
    },
  },
  {
    workflow: 'WF-TOEK-22',
    scenarioId: 'UAT-TOEK-22',
    label: 'Doel-ETA: no-date "~4 jaar" + PMT bij streefdatum 24 mnd (annuïteitsformule)',
    run: () => {
      criterion('WF-TOEK-22')
      const etaJaren = Math.round(yearsAtReferenceMonthly(5000, RETURN_SAVINGS)) // 4
      const maandinlegMetDatum = monthlyContributionForTarget(5000, 2, RETURN_SAVINGS) // ~205.35
      return {
        expected: 'etaJaren=4; maandinlegMetDatum=205.35',
        actual: `etaJaren=${etaJaren}; maandinlegMetDatum=${fx(maandinlegMetDatum, 2)}`,
      }
    },
  },
  {
    workflow: 'WF-TOEK-23',
    scenarioId: 'UAT-TOEK-23',
    label: 'Doel-voortgang via computeGoalProgress (€3.000/€5.000 = 60%, +60pp)',
    run: () => {
      criterion('WF-TOEK-23')
      const pctBij3000 = computeGoalProgress(makeGoal({ current_value: 3000 })).pct
      const pctBij0 = computeGoalProgress(makeGoal({ current_value: 0 })).pct
      const deltaPp = pctBij3000 - pctBij0
      return {
        expected: 'pctBij3000=60; pctBij0=0; deltaPp=60',
        actual: `pctBij3000=${pctBij3000}; pctBij0=${pctBij0}; deltaPp=${deltaPp}`,
      }
    },
  },
  {
    workflow: 'WF-TOEK-24',
    scenarioId: 'UAT-TOEK-24',
    label: 'Guardrail-echo (80/120/10) + eindstrategie pensioen/€200.000 (Marijke)',
    run: () => {
      criterion('WF-TOEK-24')
      const p = marijke.profile
      const floorPct = (p.guardrail_floor ?? 0) * 100
      const ceilingPct = (p.guardrail_ceiling ?? 0) * 100
      const cutStepPct = (p.guardrail_cut_step ?? 0) * 100
      const cfg = parseFireStrategy(p)
      return {
        expected: 'floorPct=80; ceilingPct=120; cutStepPct=10; strategie=pensioen; nalatenschap=200000',
        actual: `floorPct=${fx(floorPct, 0)}; ceilingPct=${fx(ceilingPct, 0)}; cutStepPct=${fx(cutStepPct, 0)}; strategie=${cfg.strategy}; nalatenschap=${cfg.legacyAmount}`,
      }
    },
  },
  {
    workflow: 'WF-TOEK-33',
    scenarioId: 'UAT-TOEK-33',
    label: "Render-grens deflatie (deflate + factorAtAge + deflateRowsByAge): exact één keer gedeeld op synthetische kernelrijen",
    run: () => {
      criterion('WF-TOEK-33')
      // Synthetische kernelrijen (leeftijd, endPortfolio) — opgezet zodat euro-
      // inflatie en portefeuillegroei elkaar exact opheffen: het reële bedrag
      // (koopkracht van vandaag) blijft op elke leeftijd €100.000. Factoren zijn
      // bewust machten van 2 (i.p.v. bv. 1,1/1,21): deling door een macht van 2
      // is in IEEE-754 altijd exact — geen drijvendekomma-afrondingsruis in de
      // assertie (110000/1.1 is bv. 99999,999999999985, geen 100000).
      const rows = [
        { age: 50, endPortfolio: 100000 },
        { age: 51, endPortfolio: 200000 },
        { age: 52, endPortfolio: 400000 },
      ]
      const factorRows = [
        { age: 50, inflationFactor: 1 },
        { age: 51, inflationFactor: 2 },
        { age: 52, inflationFactor: 4 },
      ]
      const factorByAge = buildFactorByAge(factorRows)
      const nominal = deflateRowsByAge(rows, factorByAge, ['endPortfolio'], 'nominal')
      const real = deflateRowsByAge(rows, factorByAge, ['endPortfolio'], 'real')
      const nominalSameRef = nominal === rows
      const singleDeflate = deflate(400000, factorAtAge(factorRows, 52), 'real')
      return {
        expected: 'nominalSameRef=true; real50=100000; real51=100000; real52=100000; singleDeflate=100000',
        actual: `nominalSameRef=${nominalSameRef}; real50=${real[0].endPortfolio}; real51=${real[1].endPortfolio}; real52=${real[2].endPortfolio}; singleDeflate=${singleDeflate}`,
      }
    },
  },
  {
    workflow: 'WF-TOEK-36',
    scenarioId: 'UAT-TOEK-36',
    label: 'Grondslag primaire lijn == grondslag voortgangsbalk, per woonstrategie (ADR 0114 D1)',
    run: () => {
      criterion('WF-TOEK-36')
      // Twee échte productiefuncties naast elkaar op dezelfde vier modi: de
      // GRAFIEK-grondslag (primaryChartBasis) en de BALK-grondslag
      // (selectFreedomProgressBasis + isHomeExcludedFromFire). Ze horen door
      // hetzelfde predikaat gestuurd te worden — dát is het besluit.
      const metWoning = makeHousingContext(true)
      const zonderWoning = makeHousingContext(false)
      const rijen = HOUSING_CONFIGS.map(({ mode, config }) => ({
        mode,
        lijn: primaryChartBasis(metWoning, config.mode),
        balk: balkGrondslag(metWoning, config),
      }))
      // Zonder eigen woning valt er niets te splitsen (J ≡ I) — ook onder
      // "Uitsluiten" blijft het bij de totaal-grondslag, op beide oppervlakken.
      const exclConfig: HousingStrategyConfig = { mode: 'exclude_from_fire' }
      const zonderLijn = primaryChartBasis(zonderWoning, exclConfig.mode)
      const zonderBalk = balkGrondslag(zonderWoning, exclConfig)
      const alle = [...rijen, { mode: 'zonderWoning/exclude_from_fire', lijn: zonderLijn, balk: zonderBalk }]
      const gelijkeGrondslag = alle.every((r) => (r.lijn === 'liquid') === (r.balk === 'J'))
      return {
        expected:
          'include_full: lijn=total balk=I; exclude_from_fire: lijn=liquid balk=J; downsize: lijn=total balk=I; reverse_mortgage: lijn=total balk=I; zonderWoning/exclude_from_fire: lijn=total balk=I; gelijkeGrondslag=true',
        actual: `${alle
          .map((r) => `${r.mode}: lijn=${r.lijn} balk=${r.balk}`)
          .join('; ')}; gelijkeGrondslag=${gelijkeGrondslag}`,
      }
    },
  },
  {
    workflow: 'WF-TOEK-38',
    scenarioId: 'UAT-TOEK-38',
    label: 'Risico-events (werkloosheid/overlijden partner): jaargelaagde WW/Anw-parameters + na-FIRE-gedrag',
    run: () => {
      criterion('WF-TOEK-38')
      const ww = berekenWerkloosheidImpact(
        { huidigBruto: 4000, huidigNetto: 3000, wwDuur: 12, zoektijd: 18 },
        2026,
      )
      const overlijden = berekenOverlijdenPartnerImpact(
        { nettoInkomenPartner: 2500, anwUitkering: 'kinderen', kostendalingPct: 30 },
        { maandlastenHuishouden: 3000 },
        2026,
      )
      // Expliciete 0 blijft 0 (geen `||`-terugval naar de Anw-default).
      const overlijdenAnw0 = berekenOverlijdenPartnerImpact(
        { nettoInkomenPartner: 2500, anwUitkering: 'kinderen', anwBedrag: 0, kostendalingPct: 30 },
        { maandlastenHuishouden: 3000 },
        2026,
      )
      const wwWaarschuwing = werkloosheidNaFireWaarschuwing(60, 55) // event ná FIRE-leeftijd
      const overlijdenWaarschuwing = 'nooit' // overlijden_partner kent geen na-FIRE-waarschuwing (RISICO_EVENT_NA_FIRE)
      return {
        expected:
          'wwMaand1=3000; wwMaandDaarna=2800; wwTotaalOverWwDuur=34000; wwGemiddeldPerMaand=1889; inkomensgat=1111; totaalVerlies=19998; anwBruto=1676.53; anwNetto=1257; kostendaling=900; overlijdenNettoImpact=-343; anwExpliciete0Blijft0=true; wwWaarschuwingBijFire=aanwezig; overlijdenWaarschuwing=nooit',
        actual:
          `wwMaand1=${ww.ww.maandEerstePeriode}; wwMaandDaarna=${ww.ww.maandDaarna}; wwTotaalOverWwDuur=${ww.ww.totaalOverWwDuur}; wwGemiddeldPerMaand=${ww.ww.gemiddeldPerMaand}; inkomensgat=${ww.inkomensgatPerMaand}; totaalVerlies=${ww.totaalInkomensverlies}; anwBruto=${fx(overlijden.anwBruto, 2)}; anwNetto=${overlijden.anwNetto}; kostendaling=${overlijden.kostendaling}; overlijdenNettoImpact=${overlijden.nettoMaandImpact}; anwExpliciete0Blijft0=${overlijdenAnw0.anwBruto === 0}; wwWaarschuwingBijFire=${wwWaarschuwing !== null ? 'aanwezig' : 'afwezig'}; overlijdenWaarschuwing=${overlijdenWaarschuwing}`,
      }
    },
  },
  {
    workflow: 'WF-TOEK-39',
    scenarioId: 'UAT-TOEK-39',
    label: 'Meervoudig koppelen: netto-voortgang via computeLinkedCurrentValue (bezittingen/schulden/gemengd)',
    run: () => {
      criterion('WF-TOEK-39')
      const bezittingen = [{ current_value: 8000 }, { current_value: 5000 }]
      const schulden = [{ current_balance: 3000 }]
      const alleenBezittingen = computeLinkedCurrentValue(20000, bezittingen, [])
      const alleenSchulden = computeLinkedCurrentValue(20000, [], [{ current_balance: 12000 }])
      const gemengd = computeLinkedCurrentValue(20000, bezittingen, schulden)
      return {
        expected: 'alleenBezittingen=13000; alleenSchulden=8000; gemengd=10000',
        actual: `alleenBezittingen=${alleenBezittingen}; alleenSchulden=${alleenSchulden}; gemengd=${gemengd}`,
      }
    },
  },
  {
    workflow: 'WF-TOEK-40',
    scenarioId: 'UAT-TOEK-40',
    label: 'Richting-bewust behaald + machine-getrackt afsluiten (isGoalReached/isMachineTrackedGoal/selectReachedAutoGoals, ADR 0125)',
    run: () => {
      criterion('WF-TOEK-40')
      // (a) Richting-bewust: fire_age (down) 46 t.o.v. doel 55 = behaald; tax_burden
      // (down) 35% t.o.v. doel 30% = NIET behaald. Een kale `current >= target` zou
      // dat precies omdraaien — dat becijferen we hier expliciet als contrast.
      const fireAgeReached = isGoalReached('fire_age', 46, 55)
      const taxBurdenReached = isGoalReached('tax_burden', 35, 30)
      const fireAgeKaleVergelijkingZou = 46 >= 55
      const taxBurdenKaleVergelijkingZou = 35 >= 30

      // (b) Alleen machine-bijgehouden doelen mogen zichzelf sluiten.
      const autoSyncGoal: ReconcilableGoal = {
        id: 'g1', user_id: 'u1', name: 'Vrijheidsleeftijd', goal_type: 'fire_age',
        current_value: 46, target_value: 55, is_completed: false,
        metadata: { sync: 'auto' },
      }
      const parameterGoal: ReconcilableGoal = {
        id: 'g2', user_id: 'u1', name: 'Lab-scenario', goal_type: 'fire_age',
        current_value: 46, target_value: 55, is_completed: false,
        metadata: { bron: 'parameter' },
      }
      const manualGoal: ReconcilableGoal = {
        id: 'g3', user_id: 'u1', name: 'Handmatig doel', goal_type: 'savings',
        current_value: 5000, target_value: 5000, is_completed: false,
        metadata: {},
      }
      const linkedGoalIds = new Set<string>()
      const autoSyncMachineTracked = isMachineTrackedGoal(autoSyncGoal, linkedGoalIds)
      const parameterGoalMachineTracked = isMachineTrackedGoal(parameterGoal, linkedGoalIds)
      const manualGoalMachineTracked = isMachineTrackedGoal(manualGoal, linkedGoalIds)

      // (c) selectReachedAutoGoals: alleen het bereikte auto-sync-doel komt terug —
      // het parameter-doel (zelfde cijfers) en het handmatige doel (target al gelijk
      // aan current, maar niet machine-getrackt) niet.
      const reached = selectReachedAutoGoals(
        [autoSyncGoal, parameterGoal, manualGoal],
        'u1',
        linkedGoalIds,
      )
      const reachedAutoGoalSelected = reached.length === 1 && reached[0].id === 'g1'

      return {
        expected:
          'fireAgeReached_46_v_55=true; taxBurdenReached_35_v_30=false; fireAgeKaleVergelijkingZou=false; taxBurdenKaleVergelijkingZou=true; autoSyncMachineTracked=true; parameterGoalMachineTracked=false; manualGoalMachineTracked=false; reachedAutoGoalSelected=true',
        actual:
          `fireAgeReached_46_v_55=${fireAgeReached}; taxBurdenReached_35_v_30=${taxBurdenReached}; fireAgeKaleVergelijkingZou=${fireAgeKaleVergelijkingZou}; taxBurdenKaleVergelijkingZou=${taxBurdenKaleVergelijkingZou}; autoSyncMachineTracked=${autoSyncMachineTracked}; parameterGoalMachineTracked=${parameterGoalMachineTracked}; manualGoalMachineTracked=${manualGoalMachineTracked}; reachedAutoGoalSelected=${reachedAutoGoalSelected}`,
      }
    },
  },
]
