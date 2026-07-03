/**
 * Horizon-strategie-regressiematrix — op de **horizon-kernel** (FASE 6, stap 2).
 *
 * Draait de horizon-FIRE-projectie over álle strategie-combinaties op de complete
 * persona en valideert per combinatie de **vrijheidsleeftijd (FIRE)** en het
 * **doelbedrag** tegen een golden mét marges, plus structurele en relationele
 * invarianten.
 *
 * ## Twee armen per combinatie
 *  - **Kernel (primair)** — `computeConvergentieProjection({ kernelEnabled: true, … })`:
 *    de nieuwe rekenkern (`lib/horizon-kernel`) is sinds FASE 6 stap 2 de gemeten motor.
 *    Per combinatie eist de suite dat de motor daadwerkelijk `'kernel'` was (geen stille
 *    v2-terugval) en dat de kernel-goldens + invarianten kloppen.
 *  - **v2 (vergelijk, drift-bewaking flag-periode)** — de bestaande v2-grootboek-engine
 *    (`runSelectedProjection(input, true, …)`), getoetst tegen de vroegere goldens
 *    (`EXPECTED_V2`). Behouden tot de v2-deletie (stap 5) zodat een drift in de nog-live
 *    v2-tak zichtbaar blijft. Alléén voor combinaties die v2 kan uitdrukken.
 *
 * ## Vier groepen (16 combinaties), telkens op de standaard-baseline
 *   A — Huisvesting varieert   (× opmaken × vast)
 *   B — Eindstrategie varieert  (× woning meetellen × vast)
 *   C — Onttrekkingsprofiel     (vast / afnemend / oplopend / guardrails)
 *   D — Werk-strategie varieert (inkomenslijn-life-event op de baseline)
 *
 * ## Groep C — herdefinitie op de kernel (F4)
 * De v2-onttrekkings-enum kende vier keuzes (static/guardrails/vpw/bucket), maar
 * `WITHDRAWAL_TO_PROFIEL` (`adapter/params.ts`) mapt vpw/bucket sinds F4 op 'Vast' —
 * ze bestaan niet meer als kernel-keuze. De nieuwe groep C zijn de vier
 * onttrekkingsPROFIELEN (`withdrawal_profile_config.profiel`, zie `withdrawal-strategy.ts`):
 * **vast / afnemend / oplopend / guardrails**. `afnemend`/`oplopend` zijn KERNEL-ONLY
 * (v2 kent ze niet → geen v2-vergelijkarm, geen EXPECTED_V2). De v2-vpw/bucket-
 * varianten verdwijnen dus uit deze matrix; hun v2-gedrag blijft gedekt door
 * `lib/fire-withdrawal-integration.test.ts` (byte-identiteit static, guardrails ≤ static,
 * vpw/bucket-bereikbaarheid).
 *
 * ## Kernel-context-assemblage
 * Per combinatie wordt een `ConvergentieRawContext` gebouwd uit de persona-fixture
 * (`buildCompleetKernelProfileBase` + `fx.assets/debts/lifeEvents`) met de combo-config
 * uitgedrukt als profielrij-kolommen — exact zoals `/toekomst` de kernel voedt. De
 * `builtInput` (v2) reist mee als byte-identieke v2-tak binnen de router.
 *
 * Consumenten: de vitest (`matrix.test.ts`, CI-regressie) én de beheerpagina
 * (`/beheer/horizon-strategie`, on-demand). Puur/synchroon: geen Supabase, geen netwerk.
 */

import { buildHorizonInput } from '@/lib/horizon-engine/build-input'
import { runSelectedProjection } from '@/lib/horizon-engine/select'
import {
  computeConvergentieProjection,
  type ConvergentieEngine,
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
 * Perpetual-baseline voor de groepen C (onttrekkingsprofiel) en D (werk-strategie),
 * FASE 6 stap 2. Bewust NIET deplete: de kernel-deplete-FIRE is voor deze (vermogende)
 * persona "reached now" (B93-doel=0-quirk, `solver.ts`/`bridge.ts`), waardoor de
 * onttrekkings- en werk-varianten degeneratief samenvallen (8× dezelfde waarde).
 * Op de perpetual-baseline valt FIRE op een echte toekomst-datum (~45,8 jr) en werken de
 * profiel-/werk-verschillen wél door in de uitkomst. Groepen A en B blijven op deplete.
 */
const PERP_END: FireStrategyConfig = { strategy: 'perpetual', endAge: 90, legacyAmount: 0 }
const STD_WITHDRAWAL: WithdrawalStrategyConfig = { ...WITHDRAWAL_DEFAULTS, strategy: 'static' }
const LEGACY_AMOUNT = 100_000

// ── Combinatie-definities ────────────────────────────────────
export type GroupKey = 'housing' | 'end' | 'withdrawal' | 'werk'

/**
 * Werk-strategie-trajectorie voor een combinatie (de vorm; het netto inkomen en
 * de huidige leeftijd worden in `runCombo*` uit de fixture gebonden). `null` =
 * geen werk-event (baseline-referentie).
 */
export type ComboWerk = Pick<
  WerkMetadata,
  'reeleGroeiPct' | 'groeiTotLeeftijd' | 'plafondNettoMaand' | 'faseStappen' | 'sprongen'
> | null

export interface ComboConfig {
  housing: HousingStrategyConfig
  end: FireStrategyConfig
  /** v2-onttrekkingsstrategie — voedt de v2-vergelijkarm (byte-identiek pad). */
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

/**
 * Kan v2 deze combinatie uitdrukken? De onttrekkingsprofielen `afnemend`/`oplopend`
 * zijn kernel-only (de v2-enum kent ze niet). Alle overige combo's — inclusief
 * `vast` (≈ v2 static) en `guardrails` (v2 guardrails) — dragen een v2-vergelijkarm.
 */
export function isV2Expressible(combo: ComboDef): boolean {
  const p = combo.config.withdrawalProfiel
  return p === undefined || p === 'vast' || p === 'guardrails'
}

// ── Verwachtingen (golden) ───────────────────────────────────
export interface ComboExpectation {
  /** Verwachte vrijheidsleeftijd (fractioneel); null = onbereikbaar verwacht. */
  fireAgeFractional: number | null
  /** Verwacht doelbedrag (requiredFirePortfolio) in euro's. */
  doelbedrag: number
}

/**
 * **Kernel-goldens** (primaire arm). Gegenereerd uit de horizon-kernel op de complete
 * persona (FASE 6, stap 2). Regenereer bewust na een gewenste rekenmotor-wijziging.
 *
 * ## Waarom de kernel-waarden verschillen van de v2-goldens (EXPECTED_V2)
 * Structurele oorzaken (ADR 0032), per combinatie geduid — GEEN verkapte regressie:
 *  (a) **Nominaal/maandbasis met één-maand-lag** vs. v2 reëel/jaarbasis.
 *  (b) **`requiredFirePortfolio` = Prognose!J@FIRE** (nominaal benodigd liquide op de
 *      FIRE-maand) — een ANDERE grootheid dan v2's reële doelbedrag (V_nodig). Grote
 *      doelbedrag-verschuivingen t.o.v. v2 zijn dus per constructie, niet weg te masseren.
 *  (c) **Liquide-grondslag (dé dominante oorzaak op deze persona).** De kernel telt
 *      ÁLLE categorieën behalve 'Eigen huis' als FIRE-eligible liquide (Prognose!J =
 *      I − niet-liquide; `adapter/prio-overgang.ts` vlagt enkel Eigen huis, en dan nog
 *      alléén bij woning-uitsluiten). Het verhuurde appartement (Vastgoed), het
 *      BV-belang (Overig), pensioen, kapitaalverzekering en vordering tellen dus VOL
 *      mee in de FIRE-pot. Combineer dat met de rijke persona (~€1,18 mln netto vermogen,
 *      €48k pensioenuitgaven → ~4% aanvangs-onttrekking) én 7% nominaal rendement, dan
 *      is de opmaak-strategie (deplete: gap = J@eindleeftijd ≥ 0) op de startleeftijd al
 *      haalbaar. **Gevolg (belangrijk):** de deplete-FIRE valt ≈ nú (42 jr + 1 mnd; de
 *      B93-doel=0-quirk maakt deplete triviaal "reached_now" — zie
 *      `bridge.ts#isKernelReachedNowDisplay`). Dat is GEEN mapping-fout (mapping
 *      spiegelt /toekomst); het is de kernel-liquide-categorisatie op een vermogende
 *      persona. Zie het rapport — de v2-baseline (~48) is conservatiever dan de
 *      kernel-baseline (~42).
 *  (d) **AOW/pensioen endogeen**: de kernel rekent de AOW-hoogte zelf (basis 993/mnd
 *      samenwonend, start = canonieke AOW-leeftijd 67) en annuïtiseert het pensioen-event,
 *      i.p.v. de v2-event-inkomensbedragen (1050/1100).
 *  (e) **Spaargrondslag** = netto jaarinkomen − geschatte jaaruitgaven; voor deze fixture
 *      gelijk aan `baseAnnualSavingsFromCashflow` ((7600−4100)×12 = 42.000) → geen divergentie.
 *
 * ## Groep C/D op de PERPETUAL-baseline (FASE-6-herijking, scope-besluit)
 * Op de deplete-baseline vallen groep C (onttrekkingsprofiel) en D (werk-strategie)
 * degeneratief samen (8× 42,083 / €1.102.575): de kernel-deplete-FIRE is voor deze
 * vermogende persona "reached now" (B93-doel=0-quirk, oorzaak c), dus er is geen
 * decumulatie-/accumulatiefase over om de varianten te laten doorwerken. Daarom draaien
 * C en D op de **perpetual-baseline** (`PERP_END`), waar FIRE een echte toekomst-datum
 * (~45,8 jr) is en de profiel-/werk-verschillen wél doorwerken. A en B blijven op deplete.
 *   - Groep C discrimineert nu: oplopend 42,08 < afnemend 43,50 < vast 45,83 < guardrails
 *     47,75. NB: 'Afnemend' en 'Oplopend' gebruiken in de kernel (`tables/ont.ts`
 *     `actieveFactor`) DEZELFDE fase-factor F — de richting zit uitsluitend in de
 *     curve-getallen, niet in de profiel-selector. Daarom dragen C-afnemend (dalend
 *     100/85/70) en C-oplopend (stijgend 70/85/100) een expliciete fase-curve
 *     (`withdrawalCurve`); zónder die curve zouden beide op de Excel-default (dalend) vallen
 *     en identiek zijn.
 *   - Groep D discrimineert: combi 45,17 < groei 45,67 < geen 45,83 < deeltijd 46,83.
 *
 * GENERATED:GOLDEN:START
 */
export const EXPECTED: Record<string, ComboExpectation> = {
  'A-include_full': { fireAgeFractional: 42.083, doelbedrag: 1102575 },
  'A-exclude': { fireAgeFractional: 43.0, doelbedrag: 1036734 },
  'A-downsize': { fireAgeFractional: 42.583, doelbedrag: 997273 },
  'A-reverse': { fireAgeFractional: 42.083, doelbedrag: 950670 },
  'B-deplete': { fireAgeFractional: 42.083, doelbedrag: 1102575 },
  'B-legacy': { fireAgeFractional: 42.083, doelbedrag: 1102575 },
  'B-perpetual': { fireAgeFractional: 45.833, doelbedrag: 1562958 },
  'B-pensioen': { fireAgeFractional: 67.0, doelbedrag: 5747356 },
  // Groep C/D op de PERPETUAL-baseline (PERP_END) — hier discrimineren de profielen/
  // werk-varianten wél (op deplete vielen ze samen op 42,083). Ordening klopt semantisch:
  // oplopend (minder vroeg onttrekken) → vroegst vrij; guardrails → laatst; deeltijd later
  // dan geen-werk; groei/combi eerder.
  'C-vast': { fireAgeFractional: 45.833, doelbedrag: 1562958 },
  'C-afnemend': { fireAgeFractional: 43.5, doelbedrag: 1269697 },
  'C-oplopend': { fireAgeFractional: 42.083, doelbedrag: 1103777 },
  'C-guardrails': { fireAgeFractional: 47.75, doelbedrag: 1823619 },
  'D-geen': { fireAgeFractional: 45.833, doelbedrag: 1562958 },
  'D-groei': { fireAgeFractional: 45.667, doelbedrag: 1561132 },
  'D-deeltijd': { fireAgeFractional: 46.833, doelbedrag: 1583739 },
  'D-combi': { fireAgeFractional: 45.167, doelbedrag: 1558998 },
}
// GENERATED:GOLDEN:END

/**
 * **v2-goldens** (vergelijkarm, drift-bewaking flag-periode). De productie-engine-
 * goldens (v2), behouden tot de v2-deletie (stap 5). Alléén voor de combinaties die v2
 * kan uitdrukken (`isV2Expressible`): A×4, B×4, D×4, C-vast (≈ v2 `static`) en
 * C-guardrails (v2 `guardrails`) = 14. C-afnemend/C-oplopend zijn kernel-only en staan
 * hier bewust NIET (hun v2-vpw/bucket-voorgangers zijn uit de matrix verdwenen; dat
 * v2-gedrag blijft gedekt door `lib/fire-withdrawal-integration.test.ts`).
 *
 * HER-BASELINE FASE 6, stap 2: deze v2-goldens zijn t.o.v. de pre-FASE-6-matrix
 * VERSCHOVEN (bv. baseline 53 → 48). Oorzaak: de fixture pint de vijf generieke
 * niet-liquide bezittingen nu op `niet_verkopen` (nodig om de kernel te kunnen draaien
 * — zie `persona-fixture.ts`), waardoor v2 ze niet langer on-demand liquideert. Dat is
 * een bewuste, gedocumenteerde her-baseline, geen v2-regressie.
 */
export const EXPECTED_V2: Record<string, ComboExpectation> = {
  'A-include_full': { fireAgeFractional: 48.0, doelbedrag: 1862900 },
  'A-exclude': { fireAgeFractional: 46.418, doelbedrag: 1203370 },
  'A-downsize': { fireAgeFractional: 51.0, doelbedrag: 2320720 },
  'A-reverse': { fireAgeFractional: 50.0, doelbedrag: 1687994 },
  'B-deplete': { fireAgeFractional: 48.0, doelbedrag: 1862900 },
  'B-legacy': { fireAgeFractional: 48.0, doelbedrag: 1917249 },
  'B-perpetual': { fireAgeFractional: 54.0, doelbedrag: 2665256 },
  'B-pensioen': { fireAgeFractional: 67.0, doelbedrag: 1135484 },
  // Groep C/D op de PERPETUAL-baseline (PERP_END) — v2-vergelijk. C-afnemend/C-oplopend
  // zijn kernel-only (v2 kent geen 'Afnemend'/'Oplopend') → geen v2-golden.
  'C-vast': { fireAgeFractional: 54.0, doelbedrag: 2665256 },
  'C-guardrails': { fireAgeFractional: 53.0, doelbedrag: 2645167 },
  'D-geen': { fireAgeFractional: 54.0, doelbedrag: 2665256 },
  'D-groei': { fireAgeFractional: 52.0, doelbedrag: 2624051 },
  'D-deeltijd': { fireAgeFractional: 59.0, doelbedrag: 2734167 },
  'D-combi': { fireAgeFractional: 51.0, doelbedrag: 2601985 },
}

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

/** Uitkomst van de kernel-arm: de standen + welke motor daadwerkelijk rekende. */
export interface ComboKernelOutcome {
  actual: ComboActual
  engine: ConvergentieEngine
  fallbackReason?: string
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
  /** Kernel-only (geen v2-equivalent) → geen v2-vergelijkarm. */
  kernelOnly: boolean
  /** Motor die de primaire (kernel-)run daadwerkelijk berekende — verwacht 'kernel'. */
  engine: ConvergentieEngine
  fallbackReason?: string
  /** Kernel-arm (primair). */
  kernelExpected: ComboExpectation | null
  kernelActual: ComboActual
  /** v2-arm (vergelijk, drift-bewaking); null voor kernel-only combo's. */
  v2Expected: ComboExpectation | null
  v2Actual: ComboActual | null
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

/** Bouw de gedeelde v2-input (`buildHorizonInput`) voor een combinatie. */
function buildComboInput(combo: ComboDef, fx: ReturnType<typeof buildCompleetHorizonFixture>) {
  const built = buildHorizonInput({
    horizonInput: fx.financialInput,
    lifeEvents: [...fx.lifeEvents, ...werkEventFor(combo.config.werk ?? null, fx)],
    assets: fx.assets,
    debts: fx.debts,
    hasPartner: fx.hasPartner,
    box3Method: fx.box3Method,
    baseAnnualSavingsFromCashflow: fx.baseAnnualSavingsFromCashflow,
    grossReturn: fx.grossReturn,
    inflation: fx.inflation,
    fireStrategy: combo.config.end,
    withdrawalStrategy: combo.config.withdrawal,
    housingStrategy: combo.config.housing,
    horizonEngineV2: true,
  })
  if (!built) {
    throw new Error(`buildHorizonInput gaf null voor combinatie ${combo.id} (controleer persona/fixture)`)
  }
  return built
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

// ── Run één combinatie via de horizon-kernel (primaire motor) ─
export function runComboKernel(combo: ComboDef, pinnedAge?: number): ComboKernelOutcome {
  const fx = buildCompleetHorizonFixture(pinnedAge)
  const built = buildComboInput(combo, fx)

  // Combo-config → profielrij-kolommen (spiegelt de /toekomst-context-assemblage).
  const profile: ConvergentieRawProfileRow = {
    ...buildCompleetKernelProfileBase(fx.currentAge),
    fire_end_strategy: combo.config.end.strategy,
    fire_end_age: combo.config.end.endAge,
    fire_legacy_amount: combo.config.end.legacyAmount,
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
    yearlyExpenses: built.input.yearlyExpenses,
  }

  const outcome = computeConvergentieProjection({
    builtInput: built.input,
    strategyOptions: built.strategyOptions,
    v2FlagArg: true,
    kernelEnabled: true,
    rawContext,
  })
  return { actual: toActual(outcome.result), engine: outcome.engine, fallbackReason: outcome.fallbackReason }
}

// ── Run één combinatie via de v2-grootboek-engine (vergelijkarm) ─
export function runComboV2(combo: ComboDef, pinnedAge?: number): ComboActual {
  const fx = buildCompleetHorizonFixture(pinnedAge)
  const built = buildComboInput(combo, fx)
  return toActual(runSelectedProjection(built.input, true, built.strategyOptions))
}

// ── Checks ───────────────────────────────────────────────────
function fmtEur(n: number): string {
  return `€${Math.round(n).toLocaleString('nl-NL')}`
}
function relDiff(actual: number, expected: number): number {
  if (expected === 0) return actual === 0 ? 0 : 1
  return Math.abs(actual - expected) / Math.abs(expected)
}

/** Golden-toets (vrijheidsleeftijd ±0,5 jr + doelbedrag ±2%). `arm` labelt de check. */
function goldenChecks(actual: ComboActual, expected: ComboExpectation | null, arm: string): Check[] {
  const checks: Check[] = []

  if (!expected) {
    checks.push({ name: `${arm}: golden vrijheidsleeftijd`, pass: false, detail: 'geen golden-waarde opgezet — genereer eerst' })
    checks.push({ name: `${arm}: golden doelbedrag`, pass: false, detail: 'geen golden-waarde opgezet — genereer eerst' })
    return checks
  }

  const ea = expected.fireAgeFractional
  const aa = actual.fireAgeFractional
  if (ea === null || aa === null) {
    const pass = ea === aa
    checks.push({
      name: `${arm}: golden vrijheidsleeftijd`,
      pass,
      detail: pass ? `beide ${aa === null ? 'onbereikbaar' : aa}` : `verwacht ${ea ?? 'onbereikbaar'}, werkelijk ${aa ?? 'onbereikbaar'}`,
    })
  } else {
    const delta = Math.abs(aa - ea)
    const pass = delta <= FIRE_AGE_MARGIN_YEARS
    checks.push({
      name: `${arm}: golden vrijheidsleeftijd`,
      pass,
      detail: `verwacht ${ea.toFixed(2)}, werkelijk ${aa.toFixed(2)} (Δ ${delta.toFixed(2)} ≤ ${FIRE_AGE_MARGIN_YEARS})`,
    })
  }

  const rd = relDiff(actual.requiredFirePortfolio, expected.doelbedrag)
  const passDoel = rd <= DOELBEDRAG_REL_MARGIN
  checks.push({
    name: `${arm}: golden doelbedrag`,
    pass: passDoel,
    detail: `verwacht ${fmtEur(expected.doelbedrag)}, werkelijk ${fmtEur(actual.requiredFirePortfolio)} (Δ ${(rd * 100).toFixed(2)}% ≤ ${(DOELBEDRAG_REL_MARGIN * 100).toFixed(0)}%)`,
  })

  return checks
}

/** Assert dat de primaire run daadwerkelijk de kernel was (geen stille v2-terugval). */
function engineCheck(outcome: ComboKernelOutcome): Check {
  return {
    name: 'Motor = kernel (geen v2-terugval)',
    pass: outcome.engine === 'kernel' && !outcome.fallbackReason,
    detail:
      outcome.engine === 'kernel'
        ? 'kernel'
        : `terugval op v2${outcome.fallbackReason ? ` — ${outcome.fallbackReason}` : ''}`,
  }
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
    // Kernel: B36 = 0 bij deplete → exact €0 (geen VPW-restvermogen zoals v2). Marge
    // ruim (5%) gehouden voor de pensioen-tak (B36 ≠ 0 mogelijk).
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
  // Wijkt het af, dan lekt het lege werk-event iets. (Was A-include_full; die staat nu op
  // deplete i.p.v. perpetual en is geen geldige referentie meer voor de perpetual-groepen.)
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

  // Primaire (kernel-)arm + v2-vergelijkarm per combinatie.
  const kernelOutcomes = new Map<string, ComboKernelOutcome>()
  const kernelActuals = new Map<string, ComboActual>()
  const v2Actuals = new Map<string, ComboActual>()
  for (const combo of COMBOS) {
    const outcome = runComboKernel(combo, pinnedAge)
    kernelOutcomes.set(combo.id, outcome)
    kernelActuals.set(combo.id, outcome.actual)
    if (isV2Expressible(combo)) v2Actuals.set(combo.id, runComboV2(combo, pinnedAge))
  }

  // Relationele checks draaien op de KERNEL-arm (de gemeten motor).
  const relational = relationalChecks(kernelActuals)

  const groupsMap = new Map<GroupKey, ComboResult[]>()
  let passed = 0
  let failed = 0

  for (const combo of COMBOS) {
    const outcome = kernelOutcomes.get(combo.id)!
    const kernelActual = outcome.actual
    const kernelExpected = EXPECTED[combo.id] ?? null
    const kernelOnly = !isV2Expressible(combo)
    const v2Actual = v2Actuals.get(combo.id) ?? null
    const v2Expected = kernelOnly ? null : EXPECTED_V2[combo.id] ?? null

    const checks: Check[] = [
      engineCheck(outcome),
      ...goldenChecks(kernelActual, kernelExpected, 'kernel'),
      ...invariantChecks(combo, kernelActual, currentAge),
      ...(relational.get(combo.id) ?? []),
    ]
    // v2-drift-bewaking (alleen voor v2-uitdrukbare combo's).
    if (!kernelOnly && v2Actual) {
      checks.push(...goldenChecks(v2Actual, v2Expected, 'v2'))
    }

    const status: 'pass' | 'fail' = checks.every((c) => c.pass) ? 'pass' : 'fail'
    if (status === 'pass') passed++
    else failed++

    const arr = groupsMap.get(combo.group) ?? []
    arr.push({
      id: combo.id,
      label: combo.label,
      group: combo.group,
      config: combo.config,
      kernelOnly,
      engine: outcome.engine,
      fallbackReason: outcome.fallbackReason,
      kernelExpected,
      kernelActual,
      v2Expected,
      v2Actual,
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
