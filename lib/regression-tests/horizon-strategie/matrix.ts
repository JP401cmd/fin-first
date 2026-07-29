/**
 * Horizon-strategie-regressiematrix — op de **horizon-kernel** (FASE 6, stap 5A — kernel-only).
 *
 * Draait de horizon-FIRE-projectie over álle strategie-combinaties op de complete
 * persona en valideert per combinatie de **vrijheidsleeftijd (FIRE)** en het
 * **doelbedrag** tegen een golden mét marges, plus structurele en relationele
 * invarianten.
 *
 * ## Eén motor: de horizon-kernel
 * Sinds de v2-grootboek-engine (`lib/horizon-engine`) fysiek is verwijderd is de
 * horizon-kernel (`lib/horizon-kernel`) de enige rekenmotor. De vroegere tweede arm
 * ("v2-vergelijk / drift-bewaking", `runSelectedProjection` + `EXPECTED_V2`) is met de
 * engine mee verdwenen; er is geen `builtInput`/`v2FlagArg`/`kernelEnabled`-schakelaar
 * meer en geen `isV2Expressible`-splitsing. De kernel-goldens (`EXPECTED`) blijven de
 * assertie-basis.
 *
 * ### Historie — waarom er ooit twee armen waren
 * In de flag-periode (FASE 6 stap 2) draaide de matrix nog een v2-vergelijkarm tegen de
 * oude productie-goldens om drift in de nog-live v2-tak zichtbaar te houden. Die arm is
 * met de v2-deletie (stap 5) vervallen; de v2-goldens en `runComboV2` bestaan niet meer.
 *
 * ## Vier groepen (16 combinaties), telkens op de standaard-baseline
 *   A — Huisvesting varieert   (× opmaken × vast)
 *   B — Eindstrategie varieert  (× woning meetellen × vast)
 *   C — Onttrekkingsprofiel     (vast / afnemend / oplopend / guardrails)
 *   D — Werk-strategie varieert (inkomenslijn-life-event op de baseline)
 *
 * ## Groep C — de onttrekkingsPROFIELEN (F4)
 * De oude v2-onttrekkings-enum kende vier keuzes (static/guardrails/vpw/bucket); de kernel
 * kent alleen nog de vier onttrekkingsPROFIELEN (`withdrawal_profile_config.profiel`, zie
 * `withdrawal-strategy.ts`): **vast / afnemend / oplopend / guardrails**. `afnemend`/
 * `oplopend` discrimineren alleen mét een expliciete fase-curve (`withdrawalCurve`) — de
 * kernel (`tables/ont.ts` `actieveFactor`) past voor beide profielen dezelfde fase-factor F
 * toe; de RICHTING (dalend vs. stijgend) zit uitsluitend in de curve-getallen.
 *
 * ## Kernel-context-assemblage
 * Per combinatie wordt een `ConvergentieRawContext` gebouwd uit de persona-fixture
 * (`buildCompleetKernelProfileBase` + `fx.assets/debts/lifeEvents`) met de combo-config
 * uitgedrukt als profielrij-kolommen — exact zoals `/toekomst` de kernel voedt.
 *
 * Consumenten: de vitest (`matrix.test.ts`, CI-regressie) én de beheerpagina
 * (`/beheer/horizon-strategie`, on-demand). Puur/synchroon: geen Supabase, geen netwerk.
 */

import {
  computeConvergentieProjection,
  type ConvergentieRawContext,
  type ConvergentieRawProfileRow,
} from '@/lib/horizon-kernel/convergentie-router'
import {
  DEFAULT_HOUSING_STRATEGY,
  DEFAULT_DOWNSIZE_CONFIG,
  DEFAULT_REVERSE_MORTGAGE_CONFIG,
  type HousingStrategyConfig,
} from '@/lib/housing-strategy'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import {
  WITHDRAWAL_DEFAULTS,
  type WithdrawalStrategyConfig,
  type WithdrawalProfiel,
} from '@/lib/withdrawal-strategy'
import type { LifeEvent, WerkMetadata } from '@/lib/horizon-data'
import { buildCompleetHorizonFixture, buildCompleetKernelProfileBase } from './persona-fixture'

// ── Marges ───────────────────────────────────────────────────
export const FIRE_AGE_MARGIN_YEARS = 0.5
export const DOELBEDRAG_REL_MARGIN = 0.02 // ±2%
export const LEGACY_TARGET_REL_MARGIN = 0.02
export const TARGET_DEPLETE_REL_MARGIN = 0.05
export const SWR_MIN = 0.005
export const SWR_MAX = 0.06

// ── Standaard-baseline ───────────────────────────────────────
const STD_HOUSING: HousingStrategyConfig = DEFAULT_HOUSING_STRATEGY // include_full
const STD_END: FireStrategyConfig = { strategy: 'deplete', endAge: 90, legacyAmount: 0 }
/**
 * Perpetual-baseline voor de groepen C (onttrekkingsprofiel) en D (werk-strategie).
 * Bewust NIET deplete: de kernel-deplete-FIRE is voor deze (vermogende) persona "reached
 * now" (B93-doel=0-quirk, `solver.ts`/`bridge.ts`), waardoor de onttrekkings- en werk-
 * varianten degeneratief samenvallen (8× dezelfde waarde). Op de perpetual-baseline valt
 * FIRE op een echte toekomst-datum (~45,8 jr) en werken de profiel-/werk-verschillen wél
 * door in de uitkomst. Groepen A en B blijven op deplete.
 */
const PERP_END: FireStrategyConfig = { strategy: 'perpetual', endAge: 90, legacyAmount: 0 }
const STD_WITHDRAWAL: WithdrawalStrategyConfig = { ...WITHDRAWAL_DEFAULTS, strategy: 'static' }
const LEGACY_AMOUNT = 100_000

// ── Combinatie-definities ────────────────────────────────────
export type GroupKey = 'housing' | 'end' | 'withdrawal' | 'werk'

/**
 * Werk-strategie-trajectorie voor een combinatie (de vorm; het netto inkomen en
 * de huidige leeftijd worden in `runComboKernel` uit de fixture gebonden). `null` =
 * geen werk-event (baseline-referentie).
 */
export type ComboWerk = Pick<
  WerkMetadata,
  'reeleGroeiPct' | 'groeiTotLeeftijd' | 'plafondNettoMaand' | 'faseStappen' | 'sprongen'
> | null

export interface ComboConfig {
  housing: HousingStrategyConfig
  end: FireStrategyConfig
  /** Onttrekkingsstrategie (static/guardrails) — voedt `withdrawal_strategy` in het profiel. */
  withdrawal: WithdrawalStrategyConfig
  /**
   * Kernel-onttrekkingsPROFIEL (groep C). Afwezig → de kernel valt via de enum-mapping
   * (`WITHDRAWAL_TO_PROFIEL`, static→'Vast') terug op 'vast'. Bij groep C expliciet gezet
   * zodat afnemend/oplopend (kernel-only) bereikbaar zijn.
   */
  withdrawalProfiel?: WithdrawalProfiel
  /**
   * Extra fase-curve-velden voor `withdrawal_profile_config` (naast `profiel`). NODIG voor
   * echte discriminatie tussen 'afnemend' en 'oplopend': de kernel (`tables/ont.ts`
   * `actieveFactor`) past voor BEIDE profielen dezelfde fase-factor F toe — de RICHTING
   * (dalend vs. stijgend) zit uitsluitend in de curve-getallen (gogo/slowgo/nogo-pct),
   * niet in de selector. Zonder curve vallen beide terug op dezelfde Excel-default
   * (100/85/70 = dalend) → identieke uitkomst. Sleutels = de JSONB-vorm die
   * `parseWithdrawalProfileConfig` leest (`gogo_pct`/`slowgo_pct`/`nogo_pct`/…).
   */
  withdrawalCurve?: Record<string, number>
  /** Werk-strategie-life-event dat bovenop de baseline wordt geïnjecteerd. */
  werk?: ComboWerk
}

export interface ComboDef {
  id: string
  label: string
  group: GroupKey
  config: ComboConfig
}

export const GROUP_LABELS: Record<GroupKey, string> = {
  housing: 'A — Huisvestingsstrategie (× opmaken × vast)',
  end: 'B — Eindstrategie (× woning meetellen × vast)',
  withdrawal: 'C — Onttrekkingsprofiel op eeuwigdurende baseline (vast / afnemend / oplopend / guardrails)',
  werk: 'D — Werk-strategie op eeuwigdurende baseline (× woning meetellen × vast)',
}

export const COMBOS: ComboDef[] = [
  // ── Groep A — huisvesting varieert ──
  { id: 'A-include_full', label: 'Woning volledig meetellen', group: 'housing', config: { housing: { mode: 'include_full' }, end: STD_END, withdrawal: STD_WITHDRAWAL } },
  { id: 'A-exclude', label: 'Woning uitsluiten van FIRE-pot', group: 'housing', config: { housing: { mode: 'exclude_from_fire' }, end: STD_END, withdrawal: STD_WITHDRAWAL } },
  { id: 'A-downsize', label: 'Woning verkopen op 67 (downsize)', group: 'housing', config: { housing: { ...DEFAULT_DOWNSIZE_CONFIG, trigger: 'fixed_age', triggerAge: 67 }, end: STD_END, withdrawal: STD_WITHDRAWAL } },
  { id: 'A-reverse', label: 'Opeethypotheek vanaf 67', group: 'housing', config: { housing: { ...DEFAULT_REVERSE_MORTGAGE_CONFIG, trigger: 'fixed_age', triggerAge: 67 }, end: STD_END, withdrawal: STD_WITHDRAWAL } },

  // ── Groep B — eindstrategie varieert ──
  { id: 'B-deplete', label: 'Opmaken (deplete)', group: 'end', config: { housing: STD_HOUSING, end: { strategy: 'deplete', endAge: 90, legacyAmount: 0 }, withdrawal: STD_WITHDRAWAL } },
  { id: 'B-legacy', label: `Nalaten €${LEGACY_AMOUNT.toLocaleString('nl-NL')} (legacy)`, group: 'end', config: { housing: STD_HOUSING, end: { strategy: 'legacy', endAge: 90, legacyAmount: LEGACY_AMOUNT }, withdrawal: STD_WITHDRAWAL } },
  { id: 'B-perpetual', label: 'Eeuwigdurend (perpetual)', group: 'end', config: { housing: STD_HOUSING, end: { strategy: 'perpetual', endAge: 90, legacyAmount: 0 }, withdrawal: STD_WITHDRAWAL } },
  { id: 'B-pensioen', label: 'Pensioen (opbouw tot AOW)', group: 'end', config: { housing: STD_HOUSING, end: { strategy: 'pensioen', endAge: 90, legacyAmount: 0 }, withdrawal: STD_WITHDRAWAL } },

  // ── Groep C — onttrekkingsprofiel varieert (F4: profielen, niet de oude v2-enum) ──
  //    Op de PERPETUAL-baseline (PERP_END), niet deplete — zie PERP_END-doc.
  { id: 'C-vast', label: 'Vast onttrekkingsprofiel', group: 'withdrawal', config: { housing: STD_HOUSING, end: PERP_END, withdrawal: { ...WITHDRAWAL_DEFAULTS, strategy: 'static' }, withdrawalProfiel: 'vast' } },
  // Afnemend = dalende curve (go-go 100% → no-go 70%, = Excel-default, expliciet gezet).
  { id: 'C-afnemend', label: 'Afnemend (go-go → no-go)', group: 'withdrawal', config: { housing: STD_HOUSING, end: PERP_END, withdrawal: { ...WITHDRAWAL_DEFAULTS, strategy: 'static' }, withdrawalProfiel: 'afnemend', withdrawalCurve: { gogo_pct: 100, slowgo_pct: 85, nogo_pct: 70 } } },
  // Oplopend = stijgende curve (spiegel: go-go 70% → no-go 100%), zodat 'oplopend' echt
  // stijgt i.p.v. de dalende default te erven (anders identiek aan afnemend — zie ont.ts).
  { id: 'C-oplopend', label: 'Oplopend (uitgaven stijgen)', group: 'withdrawal', config: { housing: STD_HOUSING, end: PERP_END, withdrawal: { ...WITHDRAWAL_DEFAULTS, strategy: 'static' }, withdrawalProfiel: 'oplopend', withdrawalCurve: { gogo_pct: 70, slowgo_pct: 85, nogo_pct: 100 } } },
  { id: 'C-guardrails', label: 'Guardrails (Guyton-Klinger)', group: 'withdrawal', config: { housing: STD_HOUSING, end: PERP_END, withdrawal: { ...WITHDRAWAL_DEFAULTS, strategy: 'guardrails' }, withdrawalProfiel: 'guardrails' } },

  // ── Groep D — werk-strategie varieert (inkomenslijn-life-event op de baseline) ──
  //    Op de PERPETUAL-baseline (PERP_END), niet deplete — zie PERP_END-doc.
  { id: 'D-geen', label: 'Geen werk-strategie (referentie)', group: 'werk', config: { housing: STD_HOUSING, end: PERP_END, withdrawal: STD_WITHDRAWAL, werk: null } },
  { id: 'D-groei', label: 'Salarisgroei 4%/jr reëel', group: 'werk', config: { housing: STD_HOUSING, end: PERP_END, withdrawal: STD_WITHDRAWAL, werk: { reeleGroeiPct: 0.04, faseStappen: [], sprongen: [] } } },
  { id: 'D-deeltijd', label: 'Minder werken: 60% vanaf 44', group: 'werk', config: { housing: STD_HOUSING, end: PERP_END, withdrawal: STD_WITHDRAWAL, werk: { reeleGroeiPct: 0, faseStappen: [{ fromAge: 44, pct: 60 }], sprongen: [] } } },
  { id: 'D-combi', label: 'Groei 3% + plafond + grote promotie', group: 'werk', config: { housing: STD_HOUSING, end: PERP_END, withdrawal: STD_WITHDRAWAL, werk: { reeleGroeiPct: 0.03, plafondNettoMaand: 12000, faseStappen: [], sprongen: [{ atAge: 43, deltaNettoMaand: 2500 }] } } },
]

// ── Verwachtingen (golden) ───────────────────────────────────
export interface ComboExpectation {
  /** Verwachte vrijheidsleeftijd (fractioneel); null = onbereikbaar verwacht. */
  fireAgeFractional: number | null
  /** Verwacht doelbedrag (requiredFirePortfolio) in euro's. */
  doelbedrag: number
}

/**
 * **Kernel-goldens.** Gegenereerd uit de horizon-kernel op de complete persona.
 * Regenereer bewust na een gewenste rekenmotor-wijziging.
 *
 * ## Kern-eigenschappen die de waarden verklaren (ADR 0032)
 *  (a) **Nominaal/maandbasis met één-maand-lag.**
 *  (b) **`requiredFirePortfolio` = Prognose!J@FIRE** (nominaal benodigd liquide op de
 *      FIRE-maand).
 *  (c) **Liquide-grondslag (dominant op deze persona).** De kernel telt ÁLLE categorieën
 *      behalve 'Eigen huis' als FIRE-eligible liquide (Prognose!J = I − niet-liquide;
 *      `adapter/prio-overgang.ts` vlagt enkel Eigen huis, en dan alléén bij woning-
 *      uitsluiten). Het verhuurde appartement (Vastgoed), het BV-belang (Overig), pensioen,
 *      kapitaalverzekering en vordering tellen dus VOL mee in de FIRE-pot. Combineer dat met
 *      de rijke persona (~€1,18 mln netto vermogen, €48k pensioenuitgaven → ~4% aanvangs-
 *      onttrekking) én 7% nominaal rendement, dan is de opmaak-strategie (deplete) op de
 *      startleeftijd al haalbaar. **Gevolg:** de deplete-FIRE valt ≈ nú (42 jr + 1 mnd; de
 *      B93-doel=0-quirk maakt deplete triviaal "reached_now" — zie
 *      `bridge.ts#isKernelReachedNowDisplay`). Geen mapping-fout; de kernel-liquide-
 *      categorisatie op een vermogende persona.
 *  (d) **AOW/pensioen endogeen**: de kernel rekent de AOW-hoogte zelf en annuïtiseert het
 *      pensioen-event. De AOW-BASIS komt sinds ADR 0064 (gap V20) als invoer binnen —
 *      op dit app-pad de canonieke SVB-constante `NL_AOW_MONTHLY_SAMENWONEND`, niet meer
 *      de Excel-oracle-basis €993/mnd; start = canonieke AOW-leeftijd 67. Dat verlaagde de
 *      goldens (herijkt 2026-07-29): doelbedrag −2 à −3%, vrijheidsleeftijd 0,1–0,4 jr
 *      eerder — meer AOW-inkomen ⇒ minder benodigde portefeuille.
 *  (e) **Spaargrondslag** = netto jaarinkomen − geschatte jaaruitgaven ((7600−4100)×12 =
 *      42.000).
 *
 * ## Groep C/D op de PERPETUAL-baseline (scope-besluit)
 * Op de deplete-baseline vallen groep C (onttrekkingsprofiel) en D (werk-strategie)
 * degeneratief samen (8× 42,083 / €1.102.575): de kernel-deplete-FIRE is voor deze
 * vermogende persona "reached now" (B93-doel=0-quirk, oorzaak c). Daarom draaien C en D op
 * de **perpetual-baseline** (`PERP_END`), waar FIRE een echte toekomst-datum (~45,8 jr) is:
 *   - Groep C discrimineert: oplopend 42,08 < afnemend 43,17 < vast 45,58 < guardrails 47,50.
 *   - Groep D discrimineert: combi 44,92 < groei 45,42 < geen 45,58 < deeltijd 46,42.
 *
 * GENERATED:GOLDEN:START
 */
export const EXPECTED: Record<string, ComboExpectation> = {
  'A-include_full': { fireAgeFractional: 42.083, doelbedrag: 1102575 },
  'A-exclude': { fireAgeFractional: 42.833, doelbedrag: 1020880 },
  'A-downsize': { fireAgeFractional: 42.417, doelbedrag: 981649 },
  'A-reverse': { fireAgeFractional: 42.083, doelbedrag: 950670 },
  'B-deplete': { fireAgeFractional: 42.083, doelbedrag: 1102575 },
  'B-legacy': { fireAgeFractional: 42.083, doelbedrag: 1102575 },
  'B-perpetual': { fireAgeFractional: 45.583, doelbedrag: 1530312 },
  'B-pensioen': { fireAgeFractional: 67.0, doelbedrag: 5747506 },
  // Groep C/D op de PERPETUAL-baseline (PERP_END) — hier discrimineren de profielen/
  // werk-varianten wél (op deplete vielen ze samen op 42,083).
  'C-vast': { fireAgeFractional: 45.583, doelbedrag: 1530312 },
  'C-afnemend': { fireAgeFractional: 43.167, doelbedrag: 1229674 },
  'C-oplopend': { fireAgeFractional: 42.083, doelbedrag: 1103777 },
  'C-guardrails': { fireAgeFractional: 47.5, doelbedrag: 1788538 },
  'D-geen': { fireAgeFractional: 45.583, doelbedrag: 1530312 },
  'D-groei': { fireAgeFractional: 45.417, doelbedrag: 1525573 },
  'D-deeltijd': { fireAgeFractional: 46.417, doelbedrag: 1544750 },
  'D-combi': { fireAgeFractional: 44.917, doelbedrag: 1516249 },
}
// GENERATED:GOLDEN:END

// ── Uitkomsten ───────────────────────────────────────────────
export interface ComboActual {
  fireAgeFractional: number | null
  fireReachable: boolean
  requiredFirePortfolio: number
  firePortfolioAtFire: number
  targetEndPortfolio: number
  implicitWithdrawalRate: number
  strategy: string
}

export interface Check {
  name: string
  pass: boolean
  detail: string
}

export interface ComboResult {
  id: string
  label: string
  group: GroupKey
  config: ComboConfig
  /** Golden-verwachting (kernel). */
  expected: ComboExpectation | null
  /** Kernel-uitkomst. */
  actual: ComboActual
  checks: Check[]
  status: 'pass' | 'fail'
}

export interface GroupResult {
  key: GroupKey
  label: string
  combos: ComboResult[]
}

export interface MatrixResult {
  groups: GroupResult[]
  summary: { total: number; passed: number; failed: number }
  currentAge: number
}

/**
 * Bouw het Werk-strategie-life-event voor een combinatie (of geen, bij `null`).
 * Het netto inkomen en de huidige leeftijd worden uit de fixture gebonden zodat
 * de delta's op de juiste schaal staan en deterministisch blijven.
 */
function werkEventFor(werk: ComboWerk, fx: ReturnType<typeof buildCompleetHorizonFixture>): LifeEvent[] {
  if (!werk) return []
  const metadata: WerkMetadata = {
    huidigNettoMaand: fx.financialInput.monthlyIncome,
    reeleGroeiPct: werk.reeleGroeiPct ?? 0,
    groeiTotLeeftijd: werk.groeiTotLeeftijd,
    plafondNettoMaand: werk.plafondNettoMaand,
    faseStappen: werk.faseStappen ?? [],
    sprongen: werk.sprongen ?? [],
    source: 'werk-strategy',
    schemaVersie: 1,
  }
  return [
    {
      id: 'werk-regression',
      name: 'Werk & inkomen',
      event_type: 'werk',
      target_age: fx.currentAge,
      target_date: null,
      one_time_cost: 0,
      monthly_cost_change: 0,
      monthly_income_change: 0,
      duration_months: 0,
      icon: 'Briefcase',
      is_active: true,
      sort_order: 0,
      is_indexed: true,
      metadata: metadata as unknown as Record<string, unknown>,
    },
  ]
}

/** Vertaal een `UnifiedProjectionResult`-achtige naar het `ComboActual`-contract. */
function toActual(r: {
  fireAgeFractional: number | null
  fireReachable: boolean
  requiredFirePortfolio: number
  firePortfolioAtFire: number
  targetEndPortfolio: number
  implicitWithdrawalRate: number
  strategy: string
}): ComboActual {
  return {
    fireAgeFractional: r.fireAgeFractional,
    fireReachable: r.fireReachable,
    requiredFirePortfolio: r.requiredFirePortfolio,
    firePortfolioAtFire: r.firePortfolioAtFire,
    targetEndPortfolio: r.targetEndPortfolio,
    implicitWithdrawalRate: r.implicitWithdrawalRate,
    strategy: r.strategy,
  }
}

// ── Run één combinatie via de horizon-kernel ─────────────────
export function runComboKernel(combo: ComboDef, pinnedAge?: number): ComboActual {
  const fx = buildCompleetHorizonFixture(pinnedAge)

  // Combo-config → profielrij-kolommen (spiegelt de /toekomst-context-assemblage).
  const profile: ConvergentieRawProfileRow = {
    ...buildCompleetKernelProfileBase(fx.currentAge),
    fire_end_strategy: combo.config.end.strategy,
    fire_end_age: combo.config.end.endAge,
    fire_legacy_amount: combo.config.end.legacyAmount,
    withdrawal_strategy: combo.config.withdrawal.strategy,
    housing_strategy_config: combo.config.housing,
    withdrawal_profile_config: combo.config.withdrawalProfiel
      ? { profiel: combo.config.withdrawalProfiel, ...combo.config.withdrawalCurve }
      : undefined,
  }

  const rawContext: ConvergentieRawContext = {
    profile,
    assets: fx.assets,
    debts: fx.debts,
    lifeEvents: [...fx.lifeEvents, ...werkEventFor(combo.config.werk ?? null, fx)],
    aowRows: [], // afwezig → adapter-default (deterministische AOW-leeftijd 67)
    // Reële jaaruitgaven (koopkracht-nu) voor de bridge-`implicitWithdrawalRate`. De
    // FIRE-behoefte zelf leidt de kernel af uit `yearly_essential_expenses` op het profiel.
    yearlyExpenses: fx.financialInput.yearlyMustExpenses,
  }

  const outcome = computeConvergentieProjection({ rawContext })
  if (!outcome.ok) {
    throw new Error(`computeConvergentieProjection faalde voor combinatie ${combo.id}: ${outcome.reason}`)
  }
  return toActual(outcome.result)
}

// ── Checks ───────────────────────────────────────────────────
function fmtEur(n: number): string {
  return `€${Math.round(n).toLocaleString('nl-NL')}`
}
function relDiff(actual: number, expected: number): number {
  if (expected === 0) return actual === 0 ? 0 : 1
  return Math.abs(actual - expected) / Math.abs(expected)
}

/** Golden-toets (vrijheidsleeftijd ±0,5 jr + doelbedrag ±2%). */
function goldenChecks(actual: ComboActual, expected: ComboExpectation | null): Check[] {
  const checks: Check[] = []

  if (!expected) {
    checks.push({ name: 'golden vrijheidsleeftijd', pass: false, detail: 'geen golden-waarde opgezet — genereer eerst' })
    checks.push({ name: 'golden doelbedrag', pass: false, detail: 'geen golden-waarde opgezet — genereer eerst' })
    return checks
  }

  const ea = expected.fireAgeFractional
  const aa = actual.fireAgeFractional
  if (ea === null || aa === null) {
    const pass = ea === aa
    checks.push({
      name: 'golden vrijheidsleeftijd',
      pass,
      detail: pass ? `beide ${aa === null ? 'onbereikbaar' : aa}` : `verwacht ${ea ?? 'onbereikbaar'}, werkelijk ${aa ?? 'onbereikbaar'}`,
    })
  } else {
    const delta = Math.abs(aa - ea)
    const pass = delta <= FIRE_AGE_MARGIN_YEARS
    checks.push({
      name: 'golden vrijheidsleeftijd',
      pass,
      detail: `verwacht ${ea.toFixed(2)}, werkelijk ${aa.toFixed(2)} (Δ ${delta.toFixed(2)} ≤ ${FIRE_AGE_MARGIN_YEARS})`,
    })
  }

  const rd = relDiff(actual.requiredFirePortfolio, expected.doelbedrag)
  const passDoel = rd <= DOELBEDRAG_REL_MARGIN
  checks.push({
    name: 'golden doelbedrag',
    pass: passDoel,
    detail: `verwacht ${fmtEur(expected.doelbedrag)}, werkelijk ${fmtEur(actual.requiredFirePortfolio)} (Δ ${(rd * 100).toFixed(2)}% ≤ ${(DOELBEDRAG_REL_MARGIN * 100).toFixed(0)}%)`,
  })

  return checks
}

function invariantChecks(combo: ComboDef, actual: ComboActual, currentAge: number): Check[] {
  const checks: Check[] = []
  const endAge = combo.config.end.endAge
  const strat = combo.config.end.strategy

  // FIRE bereikbaar (persona is op bereikbaarheid ontworpen)
  checks.push({
    name: 'FIRE bereikbaar',
    pass: actual.fireReachable === true && actual.fireAgeFractional !== null,
    detail: actual.fireReachable ? `vrijheidsleeftijd ${actual.fireAgeFractional?.toFixed(2)}` : 'niet bereikbaar binnen horizon',
  })

  // fireReachable consistent met fireAge
  checks.push({
    name: 'fireReachable ↔ fireAge consistent',
    pass: actual.fireReachable === (actual.fireAgeFractional !== null),
    detail: `reachable=${actual.fireReachable}, fireAge=${actual.fireAgeFractional ?? 'null'}`,
  })

  // FIRE-leeftijd binnen [currentAge, endAge]
  if (actual.fireAgeFractional !== null) {
    const inRange = actual.fireAgeFractional >= currentAge - 1e-6 && actual.fireAgeFractional <= endAge + 1e-6
    checks.push({
      name: 'Vrijheidsleeftijd binnen horizon',
      pass: inRange,
      detail: `${currentAge} ≤ ${actual.fireAgeFractional.toFixed(2)} ≤ ${endAge}`,
    })
  }

  // Doelbedrag > 0 en eindig
  checks.push({
    name: 'Doelbedrag positief en eindig',
    pass: Number.isFinite(actual.requiredFirePortfolio) && actual.requiredFirePortfolio > 0,
    detail: fmtEur(actual.requiredFirePortfolio),
  })

  // Impliciete SWR binnen redelijke bandbreedte. Pensioen is bewust uitgezonderd:
  // die mode verankert FIRE op de AOW-leeftijd en rapporteert een afwijkende
  // requiredFirePortfolio, waardoor de impliciete ratio buiten de normale SWR-band
  // valt — geen drift-signaal.
  if (strat !== 'pensioen') {
    checks.push({
      name: 'Impliciete SWR plausibel',
      pass: actual.implicitWithdrawalRate > SWR_MIN && actual.implicitWithdrawalRate < SWR_MAX,
      detail: `${(actual.implicitWithdrawalRate * 100).toFixed(2)}% ∈ (${(SWR_MIN * 100).toFixed(1)}%, ${(SWR_MAX * 100).toFixed(0)}%)`,
    })
  }

  // targetEndPortfolio past bij eindstrategie.
  // KERNEL-SEMANTIEK: targetEndPortfolio = `solve.doelbedrag` (P!B36, het EIND-doel op
  // de eindleeftijd) — bij deplete per constructie 0 (B93-doel=0-quirk, zie
  // bridge.ts#isKernelReachedNowDisplay-docs), bij perpetual de bewaarde pot, bij legacy
  // het nominaal-op-eindleeftijd nagelaten bedrag.
  if (strat === 'deplete' || strat === 'pensioen') {
    // Kernel: B36 = 0 bij deplete → exact €0 (geen VPW-restvermogen). Marge ruim (5%)
    // gehouden voor de pensioen-tak (B36 ≠ 0 mogelijk).
    const ratio = actual.requiredFirePortfolio > 0 ? Math.abs(actual.targetEndPortfolio) / actual.requiredFirePortfolio : Math.abs(actual.targetEndPortfolio)
    checks.push({
      name: `Eind-doelvermogen ≈ €0 (${strat})`,
      pass: ratio <= TARGET_DEPLETE_REL_MARGIN,
      detail: `${fmtEur(actual.targetEndPortfolio)} (${(ratio * 100).toFixed(2)}% van doelbedrag)`,
    })
  } else if (strat === 'perpetual') {
    // Perpetual behoudt koopkracht eeuwigdurend → eind-doelvermogen is juist GROOT
    // (de bewaarde pot), niet €0. Invariant: positief en eindig.
    checks.push({
      name: 'Eind-doelvermogen behouden (perpetual)',
      pass: Number.isFinite(actual.targetEndPortfolio) && actual.targetEndPortfolio > 0,
      detail: fmtEur(actual.targetEndPortfolio),
    })
  } else if (strat === 'legacy') {
    const fx = buildCompleetHorizonFixture()
    const years = endAge - currentAge
    const indexedLegacy = combo.config.end.legacyAmount * Math.pow(1 + fx.inflation, years)
    const rd = relDiff(actual.targetEndPortfolio, indexedLegacy)
    checks.push({
      name: 'Eind-doelvermogen ≈ geïndexeerd legacy-bedrag',
      pass: rd <= LEGACY_TARGET_REL_MARGIN,
      detail: `verwacht ${fmtEur(indexedLegacy)}, werkelijk ${fmtEur(actual.targetEndPortfolio)} (Δ ${(rd * 100).toFixed(2)}%)`,
    })
  }

  return checks
}

function relationalChecks(byId: Map<string, ComboActual>): Map<string, Check[]> {
  const out = new Map<string, Check[]>()
  const add = (id: string, check: Check) => {
    const arr = out.get(id) ?? []
    arr.push(check)
    out.set(id, arr)
  }

  // NB: bewust GÉÉN "exclude ⇒ later FIRE dan include_full"-invariant. De motor
  // levert empirisch een (iets) lager doelbedrag én vroegere vrijheidsleeftijd
  // voor exclude (huis-equity uit de pot ⇒ kleinere te overbruggen som). Dat is
  // legitiem motorgedrag; de golden-waarden leggen het exact vast.

  // Doelbedrag-ordening per eindstrategie is wél robuust: meer kapitaal nodig om
  // na te laten (legacy) of eeuwig te behouden (perpetual) dan om op te maken.
  const dep = byId.get('B-deplete')
  const leg = byId.get('B-legacy')
  const per = byId.get('B-perpetual')
  if (dep && leg) {
    const pass = leg.requiredFirePortfolio >= dep.requiredFirePortfolio - 1e-6
    add('B-legacy', {
      name: 'Doelbedrag legacy ≥ deplete',
      pass,
      detail: `${fmtEur(leg.requiredFirePortfolio)} ≥ ${fmtEur(dep.requiredFirePortfolio)}`,
    })
  }
  if (dep && per) {
    const pass = per.requiredFirePortfolio >= dep.requiredFirePortfolio - 1e-6
    add('B-perpetual', {
      name: 'Doelbedrag perpetual ≥ deplete',
      pass,
      detail: `${fmtEur(per.requiredFirePortfolio)} ≥ ${fmtEur(dep.requiredFirePortfolio)}`,
    })
  }

  // ── Werk-strategie — semantische ordening t.o.v. de referentie (geen werk) ──
  const geen = byId.get('D-geen')
  const groei = byId.get('D-groei')
  const deeltijd = byId.get('D-deeltijd')
  const fa = (a?: ComboActual) => a?.fireAgeFractional ?? null
  // De referentie zonder werk-event MOET gelijk zijn aan de PERPETUAL-baseline die groep
  // C/D delen: C-vast (include_full × perpetual × vast, géén werk). D-geen heeft geen
  // expliciet profiel (enum static → 'Vast'), wat de kernel op exact hetzelfde 'Vast'-
  // profiel + Excel-fasecurve mapt als C-vast → identieke invoer, dus identieke uitkomst.
  const perpRef = byId.get('C-vast')
  if (geen && perpRef) {
    add('D-geen', {
      name: 'Referentie = perpetual-baseline C-vast (geen werk-event is inert)',
      pass: fa(geen) === fa(perpRef) && Math.abs(geen.requiredFirePortfolio - perpRef.requiredFirePortfolio) < 1,
      detail: `vrijheidsleeftijd ${fa(geen) ?? '—'} vs ${fa(perpRef) ?? '—'}`,
    })
  }
  // Salarisgroei (volledig gespaard) ⇒ eerder of gelijk vrij dan zonder werk.
  if (groei && geen && fa(groei) !== null && fa(geen) !== null) {
    add('D-groei', {
      name: 'Salarisgroei ⇒ eerder (of gelijk) vrij',
      pass: fa(groei)! <= fa(geen)! + 1e-6,
      detail: `groei ${fa(groei)} ≤ referentie ${fa(geen)}`,
    })
  }
  // Minder werken ⇒ later of gelijk vrij dan zonder werk.
  if (deeltijd && geen && fa(deeltijd) !== null && fa(geen) !== null) {
    add('D-deeltijd', {
      name: 'Minder werken ⇒ later (of gelijk) vrij',
      pass: fa(deeltijd)! >= fa(geen)! - 1e-6,
      detail: `deeltijd ${fa(deeltijd)} ≥ referentie ${fa(geen)}`,
    })
  }

  return out
}

// ── Hoofd-runner ─────────────────────────────────────────────
export function runHorizonStrategyMatrix(pinnedAge?: number): MatrixResult {
  const fx = buildCompleetHorizonFixture(pinnedAge)
  const currentAge = fx.currentAge

  const actuals = new Map<string, ComboActual>()
  for (const combo of COMBOS) {
    actuals.set(combo.id, runComboKernel(combo, pinnedAge))
  }

  const relational = relationalChecks(actuals)

  const groupsMap = new Map<GroupKey, ComboResult[]>()
  let passed = 0
  let failed = 0

  for (const combo of COMBOS) {
    const actual = actuals.get(combo.id)!
    const expected = EXPECTED[combo.id] ?? null

    const checks: Check[] = [
      ...goldenChecks(actual, expected),
      ...invariantChecks(combo, actual, currentAge),
      ...(relational.get(combo.id) ?? []),
    ]

    const status: 'pass' | 'fail' = checks.every((c) => c.pass) ? 'pass' : 'fail'
    if (status === 'pass') passed++
    else failed++

    const arr = groupsMap.get(combo.group) ?? []
    arr.push({
      id: combo.id,
      label: combo.label,
      group: combo.group,
      config: combo.config,
      expected,
      actual,
      checks,
      status,
    })
    groupsMap.set(combo.group, arr)
  }

  const groups: GroupResult[] = (['housing', 'end', 'withdrawal', 'werk'] as GroupKey[]).map((key) => ({
    key,
    label: GROUP_LABELS[key],
    combos: groupsMap.get(key) ?? [],
  }))

  return { groups, summary: { total: COMBOS.length, passed, failed }, currentAge }
}
