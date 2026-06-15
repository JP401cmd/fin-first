/**
 * Horizon-strategie-regressiematrix.
 *
 * Draait de horizon-FIRE-projectie (productie-engine v2) over álle
 * strategie-combinaties op de complete persona en valideert per combinatie de
 * **vrijheidsleeftijd (FIRE)** en het **doelbedrag** tegen een vooraf opgezette
 * verwachting (golden) mét marges, plus structurele en relationele invarianten.
 *
 * Vier groepen (16 combinaties), telkens op de standaard-baseline:
 *   A — Huisvesting varieert  (× deplete × static)
 *   B — Eindstrategie varieert (× include_full × static)
 *   C — Onttrekking varieert   (× include_full × deplete)
 *   D — Werk-strategie varieert (inkomenslijn-life-event op de baseline)
 *
 * Eén bron: `buildHorizonInput` → `runSelectedProjection(input, /*useV2*‍/ true)`
 * — exact het pad van `/toekomst`. Puur/synchroon: geen Supabase, geen netwerk.
 *
 * Consumenten: de vitest (`matrix.test.ts`, CI-regressie) én de beheerpagina
 * (`/beheer/horizon-strategie`, on-demand).
 */

import { buildHorizonInput } from '@/lib/horizon-engine/build-input'
import { runSelectedProjection } from '@/lib/horizon-engine/select'
import {
  DEFAULT_HOUSING_STRATEGY,
  DEFAULT_DOWNSIZE_CONFIG,
  DEFAULT_REVERSE_MORTGAGE_CONFIG,
  type HousingStrategyConfig,
} from '@/lib/housing-strategy'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import { WITHDRAWAL_DEFAULTS, type WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import type { LifeEvent, WerkMetadata } from '@/lib/horizon-data'
import { buildCompleetHorizonFixture } from './persona-fixture'

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
const STD_WITHDRAWAL: WithdrawalStrategyConfig = { ...WITHDRAWAL_DEFAULTS, strategy: 'static' }
const LEGACY_AMOUNT = 100_000

// ── Combinatie-definities ────────────────────────────────────
export type GroupKey = 'housing' | 'end' | 'withdrawal' | 'werk'

/**
 * Werk-strategie-trajectorie voor een combinatie (de vorm; het netto inkomen en
 * de huidige leeftijd worden in `runCombo` uit de fixture gebonden). `null` =
 * geen werk-event (baseline-referentie).
 */
export type ComboWerk = Pick<
  WerkMetadata,
  'reeleGroeiPct' | 'groeiTotLeeftijd' | 'plafondNettoMaand' | 'faseStappen' | 'sprongen'
> | null

export interface ComboConfig {
  housing: HousingStrategyConfig
  end: FireStrategyConfig
  withdrawal: WithdrawalStrategyConfig
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
  withdrawal: 'C — Onttrekkingsstrategie (× woning meetellen × opmaken)',
  werk: 'D — Werk-strategie (× woning meetellen × opmaken × vast)',
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

  // ── Groep C — onttrekking varieert ──
  { id: 'C-static', label: 'Vast (static)', group: 'withdrawal', config: { housing: STD_HOUSING, end: STD_END, withdrawal: { ...WITHDRAWAL_DEFAULTS, strategy: 'static' } } },
  { id: 'C-guardrails', label: 'Guardrails (Guyton-Klinger)', group: 'withdrawal', config: { housing: STD_HOUSING, end: STD_END, withdrawal: { ...WITHDRAWAL_DEFAULTS, strategy: 'guardrails' } } },
  { id: 'C-vpw', label: 'Variabel percentage (VPW)', group: 'withdrawal', config: { housing: STD_HOUSING, end: STD_END, withdrawal: { ...WITHDRAWAL_DEFAULTS, strategy: 'vpw' } } },
  { id: 'C-bucket', label: 'Emmer-strategie (bucket)', group: 'withdrawal', config: { housing: STD_HOUSING, end: STD_END, withdrawal: { ...WITHDRAWAL_DEFAULTS, strategy: 'bucket' } } },

  // ── Groep D — werk-strategie varieert (inkomenslijn-life-event op de baseline) ──
  { id: 'D-geen', label: 'Geen werk-strategie (referentie)', group: 'werk', config: { housing: STD_HOUSING, end: STD_END, withdrawal: STD_WITHDRAWAL, werk: null } },
  { id: 'D-groei', label: 'Salarisgroei 4%/jr reëel', group: 'werk', config: { housing: STD_HOUSING, end: STD_END, withdrawal: STD_WITHDRAWAL, werk: { reeleGroeiPct: 0.04, faseStappen: [], sprongen: [] } } },
  { id: 'D-deeltijd', label: 'Minder werken: 60% vanaf 44', group: 'werk', config: { housing: STD_HOUSING, end: STD_END, withdrawal: STD_WITHDRAWAL, werk: { reeleGroeiPct: 0, faseStappen: [{ fromAge: 44, pct: 60 }], sprongen: [] } } },
  { id: 'D-combi', label: 'Groei 3% + plafond + grote promotie', group: 'werk', config: { housing: STD_HOUSING, end: STD_END, withdrawal: STD_WITHDRAWAL, werk: { reeleGroeiPct: 0.03, plafondNettoMaand: 12000, faseStappen: [], sprongen: [{ atAge: 43, deltaNettoMaand: 2500 }] } } },
]

// ── Verwachtingen (golden) ───────────────────────────────────
export interface ComboExpectation {
  /** Verwachte vrijheidsleeftijd (fractioneel); null = onbereikbaar verwacht. */
  fireAgeFractional: number | null
  /** Verwacht doelbedrag (requiredFirePortfolio) in euro's. */
  doelbedrag: number
}

/**
 * Golden-waarden, opgezet vanuit de testsuite. Gegenereerd uit de productie-
 * engine (v2) op de complete persona; regenereer met
 * `npx vitest run …/_generate-golden` na een bewuste rekenmotor-wijziging.
 *
 * GENERATED:GOLDEN:START
 */
export const EXPECTED: Record<string, ComboExpectation> = {
  'A-include_full': { fireAgeFractional: 47, doelbedrag: 1667397 },
  'A-exclude': { fireAgeFractional: 46, doelbedrag: 1186411 },
  'A-downsize': { fireAgeFractional: 50, doelbedrag: 2071910 },
  'A-reverse': { fireAgeFractional: 50, doelbedrag: 1525903 },
  'B-deplete': { fireAgeFractional: 47, doelbedrag: 1667397 },
  'B-legacy': { fireAgeFractional: 48, doelbedrag: 1704878 },
  'B-perpetual': { fireAgeFractional: 54, doelbedrag: 2229618 },
  'B-pensioen': { fireAgeFractional: 67, doelbedrag: 1049325 },
  'C-static': { fireAgeFractional: 47, doelbedrag: 1667397 },
  'C-guardrails': { fireAgeFractional: 45, doelbedrag: 1672485 },
  'C-vpw': { fireAgeFractional: 44, doelbedrag: 2083402 },
  'C-bucket': { fireAgeFractional: 47, doelbedrag: 1667397 },
  'D-geen': { fireAgeFractional: 47, doelbedrag: 1667397 },
  'D-groei': { fireAgeFractional: 47, doelbedrag: 1669922 },
  'D-deeltijd': { fireAgeFractional: 48, doelbedrag: 1662606 },
  'D-combi': { fireAgeFractional: 46, doelbedrag: 1671337 },
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
  expected: ComboExpectation | null
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

// ── Run één combinatie via de productie-engine (v2) ──────────
export function runCombo(combo: ComboDef, pinnedAge?: number): ComboActual {
  const fx = buildCompleetHorizonFixture(pinnedAge)
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
  const r = runSelectedProjection(built.input, true, built.strategyOptions)
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

// ── Checks ───────────────────────────────────────────────────
function fmtEur(n: number): string {
  return `€${Math.round(n).toLocaleString('nl-NL')}`
}
function relDiff(actual: number, expected: number): number {
  if (expected === 0) return actual === 0 ? 0 : 1
  return Math.abs(actual - expected) / Math.abs(expected)
}

function goldenChecks(actual: ComboActual, expected: ComboExpectation | null): Check[] {
  const checks: Check[] = []

  // FIRE-leeftijd binnen marge
  if (!expected) {
    checks.push({ name: 'Golden vrijheidsleeftijd', pass: false, detail: 'geen golden-waarde opgezet — genereer eerst' })
    checks.push({ name: 'Golden doelbedrag', pass: false, detail: 'geen golden-waarde opgezet — genereer eerst' })
    return checks
  }

  const ea = expected.fireAgeFractional
  const aa = actual.fireAgeFractional
  if (ea === null || aa === null) {
    const pass = ea === aa
    checks.push({
      name: 'Golden vrijheidsleeftijd',
      pass,
      detail: pass ? `beide ${aa === null ? 'onbereikbaar' : aa}` : `verwacht ${ea ?? 'onbereikbaar'}, werkelijk ${aa ?? 'onbereikbaar'}`,
    })
  } else {
    const delta = Math.abs(aa - ea)
    const pass = delta <= FIRE_AGE_MARGIN_YEARS
    checks.push({
      name: 'Golden vrijheidsleeftijd',
      pass,
      detail: `verwacht ${ea.toFixed(2)}, werkelijk ${aa.toFixed(2)} (Δ ${delta.toFixed(2)} ≤ ${FIRE_AGE_MARGIN_YEARS})`,
    })
  }

  // Doelbedrag binnen relatieve marge
  const rd = relDiff(actual.requiredFirePortfolio, expected.doelbedrag)
  const passDoel = rd <= DOELBEDRAG_REL_MARGIN
  checks.push({
    name: 'Golden doelbedrag',
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
  // die mode dwingt FIRE op AOW af en rapporteert een afwijkende
  // requiredFirePortfolio (de hook overschrijft 'm post-run), waardoor de
  // impliciete ratio buiten de normale SWR-band valt — geen drift-signaal.
  if (strat !== 'pensioen') {
    checks.push({
      name: 'Impliciete SWR plausibel',
      pass: actual.implicitWithdrawalRate > SWR_MIN && actual.implicitWithdrawalRate < SWR_MAX,
      detail: `${(actual.implicitWithdrawalRate * 100).toFixed(2)}% ∈ (${(SWR_MIN * 100).toFixed(1)}%, ${(SWR_MAX * 100).toFixed(0)}%)`,
    })
  }

  // targetEndPortfolio past bij eindstrategie
  if (strat === 'deplete' || strat === 'pensioen') {
    // ≈0 t.o.v. doelbedrag. Marge ruimer (5%) omdat VPW-onttrekking bij deplete
    // een klein restvermogen kan laten staan (herberekent % per jaar).
    const ratio = actual.requiredFirePortfolio > 0 ? Math.abs(actual.targetEndPortfolio) / actual.requiredFirePortfolio : Math.abs(actual.targetEndPortfolio)
    checks.push({
      name: `Eind-doelvermogen ≈ €0 (${strat})`,
      pass: ratio <= TARGET_DEPLETE_REL_MARGIN,
      detail: `${fmtEur(actual.targetEndPortfolio)} (${(ratio * 100).toFixed(2)}% van doelbedrag)`,
    })
  } else if (strat === 'perpetual') {
    // Perpetual behoudt koopkracht eeuwigdurend → eind-doelvermogen is juist
    // GROOT (de bewaarde pot), niet €0. Invariant: positief en eindig.
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
  // De referentie zonder werk-event MOET gelijk zijn aan de standaard-baseline
  // (include_full × deplete × static) — anders lekt het lege werk-event iets.
  const baseInc = byId.get('A-include_full')
  if (geen && baseInc) {
    add('D-geen', {
      name: 'Referentie = baseline (geen werk-event is inert)',
      pass: fa(geen) === fa(baseInc) && Math.abs(geen.requiredFirePortfolio - baseInc.requiredFirePortfolio) < 1,
      detail: `vrijheidsleeftijd ${fa(geen) ?? '—'} vs ${fa(baseInc) ?? '—'}`,
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
  for (const combo of COMBOS) actuals.set(combo.id, runCombo(combo, pinnedAge))

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
    arr.push({ id: combo.id, label: combo.label, group: combo.group, config: combo.config, expected, actual, checks, status })
    groupsMap.set(combo.group, arr)
  }

  const groups: GroupResult[] = (['housing', 'end', 'withdrawal', 'werk'] as GroupKey[]).map((key) => ({
    key,
    label: GROUP_LABELS[key],
    combos: groupsMap.get(key) ?? [],
  }))

  return { groups, summary: { total: COMBOS.length, passed, failed }, currentAge }
}
