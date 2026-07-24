/**
 * Generieke aandachtspunten-laag — PURE (geen Supabase, geen React).
 *
 * Eén genormaliseerd `Aandachtspunt`-type waarmee app-brede signalen
 * (belasting-kansen, NIBUD-budgetoverschrijdingen, dure schulden) op TWEE
 * manieren bruikbaar worden:
 *
 *   (a) ACTIE  — `aandachtspuntToActionPayload` levert exact de body voor
 *               POST /api/ai/actions. Deterministisch, los van Fin.
 *   (b) BUS     — dezelfde laag voedt Fin als chat-context (zie
 *               aandachtspunten-loader.ts → collectAandachtspunten).
 *
 * Dit bestand bevat alleen de adapters + de payload-mapping; de Supabase-
 * assemblage zit in `aandachtspunten-loader.ts`. Zo blijft de rekenkern
 * testbaar zonder DB (zie aandachtspunten.test.ts).
 */

import type { TaxOpportunity } from './tax-overview'
import type { Debt } from './debt-data'
import type { Asset, AssetType } from './asset-data'

// ── Type ─────────────────────────────────────────────────────

export type AandachtspuntDomain = 'tax' | 'budget' | 'debt' | 'asset'

/**
 * Stabiele namespaced id van de jaarruimte-kans ('{domain}:{bron-id}'). Eén
 * bron voor alle consumers die specifiek de jaarruimte-tip willen (h)erkennen of
 * onderdrukken — de AI-context-builders (cloud tax-context + lokale chat) matchen
 * hierop i.p.v. op de titel (die is prompt-dna-copy en kan hernoemd worden).
 */
export const JAARRUIMTE_AANDACHTSPUNT_ID = 'tax:jaarruimte'

export interface Aandachtspunt {
  /** Namespaced id: '{domain}:{bron-id}'. Stabiel over re-loads. */
  id: string
  domain: AandachtspuntDomain
  title: string
  description?: string
  /** Geschatte besparing in EUR/jaar. 0 = onbekend (toch tonen). */
  savings: number
  /** Maandelijkse euro-impact, indien bekend. */
  euroImpactMonthly?: number
  /** Vrijheidsdagen-equivalent van de jaarbesparing. */
  freedomDays: number
  /** Vrije-tekst deadline ('31 dec') of ISO-datum. */
  deadline?: string
  /** Bron-link naar de verdiepingspagina. */
  href: string
  /** Optionele prioriteit-hint (hoger = belangrijker). */
  priority?: number
}

// ── Action-payload mapping ───────────────────────────────────

export interface AandachtspuntActionPayload {
  title: string
  description: string
  freedom_days_impact: number
  euro_impact_monthly?: number
  due_date?: string
  priority_score?: number
  metadata: {
    kind: 'aandachtspunt'
    domain: AandachtspuntDomain
    aandachtspunt_id: string
  }
}

/**
 * Detecteer of een deadline een echte (parsebare) datum is. Vrije teksten als
 * '31 dec' parsen niet betrouwbaar en mogen NIET als due_date doorgaan — die
 * laten we weg. Alleen ISO-achtige strings (YYYY-MM-DD…) accepteren we.
 */
function toDueDate(deadline: string | undefined): string | undefined {
  if (!deadline) return undefined
  // Alleen een ISO-datumvorm accepteren (YYYY-MM-DD, evt. met tijd).
  if (!/^\d{4}-\d{2}-\d{2}/.test(deadline)) return undefined
  const t = Date.parse(deadline)
  if (Number.isNaN(t)) return undefined
  // Normaliseer naar YYYY-MM-DD.
  return new Date(t).toISOString().split('T')[0]
}

/** EUR-bedrag in nl-NL-stijl, hele euro's — server-safe (geen format.ts-import nodig). */
function euro(value: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0)
}

/**
 * Zet een `Aandachtspunt` om naar de body voor POST /api/ai/actions.
 *
 * - title           → a.title
 * - description      → €-besparing + vrijheidsdagen + (deadline) + bron-link
 * - freedom_days_impact → afgerond a.freedomDays
 * - euro_impact_monthly → a.euroImpactMonthly, anders savings/12 (indien >0)
 * - due_date         → alleen wanneer deadline een echte datum is
 * - priority_score   → a.priority (indien gezet)
 * - metadata         → herkomst-stempel zodat de actie traceerbaar blijft
 */
export function aandachtspuntToActionPayload(a: Aandachtspunt): AandachtspuntActionPayload {
  const freedomDays = Math.round(a.freedomDays || 0)

  // Beschrijving opbouwen — alleen zinvolle onderdelen.
  const descParts: string[] = []
  if (a.savings > 0) {
    descParts.push(`Bespaar ~${euro(a.savings)} per jaar`)
  }
  if (freedomDays > 0) {
    descParts.push(`~${freedomDays} ${freedomDays === 1 ? 'vrijheidsdag' : 'vrijheidsdagen'}`)
  }
  if (a.deadline) {
    descParts.push(`Deadline: ${a.deadline}`)
  }
  let description = descParts.join(' · ')
  description = description ? `${description}.` : ''
  // Bron-link altijd meegeven zodat de actie terugleidt naar de verdieping.
  description = description
    ? `${description} Meer: ${a.href}`
    : `Meer: ${a.href}`

  const euroImpactMonthly =
    a.euroImpactMonthly ?? (a.savings > 0 ? Math.round((a.savings / 12) * 100) / 100 : undefined)

  const dueDate = toDueDate(a.deadline)

  const payload: AandachtspuntActionPayload = {
    title: a.title,
    description,
    freedom_days_impact: freedomDays,
    metadata: {
      kind: 'aandachtspunt',
      domain: a.domain,
      aandachtspunt_id: a.id,
    },
  }
  if (euroImpactMonthly != null) payload.euro_impact_monthly = euroImpactMonthly
  if (dueDate) payload.due_date = dueDate
  if (a.priority != null) payload.priority_score = a.priority

  return payload
}

/**
 * Filter aandachtspunten waarvoor de gebruiker al een actie heeft (open of
 * recent afgerond). `actionedIds` bevat de `metadata.aandachtspunt_id`-waarden
 * van die acties; elk aandachtspunt waarvan `id` daarin voorkomt valt weg (het
 * staat al op de actielijst — het als suggestie herhalen is ruis).
 */
export function filterActionedAandachtspunten(
  punten: Aandachtspunt[],
  actionedIds: ReadonlySet<string>,
): Aandachtspunt[] {
  return punten.filter((a) => !actionedIds.has(a.id))
}

/**
 * Venster (in maanden) waarin een AFGERONDE actie het bijbehorende aandachtspunt
 * blijft onderdrukken. Rationale: veel aandachtspunten zijn jaarlijks terugkerend
 * (bv. jaarruimte). Wie het dit jaar benutte, wil er niet meteen weer over
 * gepusht worden — maar ná ~9 maanden mag de kans wél opnieuw opduiken zodat de
 * volgende ronde niet gemist wordt. Bewust < 12 mnd om de nieuwe cyclus te vangen.
 */
export const ACTIONED_COMPLETED_WINDOW_MONTHS = 9

/** Minimale vorm van een `actions`-rij die `collectActionedIds` nodig heeft. */
export interface ActionSuppressionRow {
  metadata: { aandachtspunt_id?: unknown } | null
  status?: string | null
  /** ISO-timestamp (timestamptz) — alleen relevant voor status 'completed'. */
  completed_at?: string | null
}

/**
 * Bepaal welke aandachtspunt-ids als 'geactioneerd' tellen en dus onderdrukt
 * moeten worden:
 *   - elke OPEN actie (staat nu op de lijst), en
 *   - elke AFGERONDE (completed) actie waarvan `completed_at` binnen het venster
 *     (default {@link ACTIONED_COMPLETED_WINDOW_MONTHS} maanden vóór `now`) valt.
 * Afgeronde acties ouder dan het venster tellen NIET meer mee, zodat een
 * jaarlijks terugkerende kans na verloop van tijd weer als suggestie verschijnt.
 *
 * Puur en `now`-injecteerbaar (testbaar zonder DB/klok). Andere statussen
 * (postponed/rejected) onderdrukken bewust niet — een uitgestelde of afgewezen
 * actie is geen 'gedaan'.
 */
export function collectActionedIds(
  rows: ActionSuppressionRow[],
  now: Date = new Date(),
  windowMonths: number = ACTIONED_COMPLETED_WINDOW_MONTHS,
): Set<string> {
  const cutoff = new Date(now)
  cutoff.setMonth(cutoff.getMonth() - windowMonths)
  const cutoffMs = cutoff.getTime()

  const ids = new Set<string>()
  for (const row of rows) {
    const rawId = row.metadata?.aandachtspunt_id
    if (typeof rawId !== 'string' || rawId.length === 0) continue
    if (row.status === 'open') {
      ids.add(rawId)
    } else if (row.status === 'completed') {
      const completedMs = row.completed_at ? Date.parse(row.completed_at) : NaN
      if (Number.isFinite(completedMs) && completedMs >= cutoffMs) ids.add(rawId)
    }
  }
  return ids
}

// ── Adapters (PURE) ──────────────────────────────────────────

/**
 * Belasting-kansen (uit `buildTaxOverview(...).opportunities`) → aandachtspunten.
 * Behoudt savings/freedomDays/deadline/href 1-op-1; id krijgt 'tax:'-namespace.
 */
export function taxOpportunitiesToAandachtspunten(opps: TaxOpportunity[]): Aandachtspunt[] {
  return opps.map((opp) => ({
    id: `tax:${opp.id}`,
    domain: 'tax' as const,
    title: opp.title,
    savings: opp.savings,
    freedomDays: opp.freedomDays,
    deadline: opp.deadline,
    href: opp.href,
  }))
}

/** Minimale benchmark-vorm die de budget-adapter nodig heeft (subset van NibudBenchmark). */
export interface BudgetBenchmarkLike {
  nibud_category_name: string
  /** Overschrijding in EUR/maand (positief = boven NIBUD-norm). */
  delta: number
  freedom_days_potential: number
  mapped_budget_slug?: string | null
}

/**
 * NIBUD-budgetoverschrijdingen → aandachtspunten.
 *
 * - Alleen categorieën BOVEN de norm (delta > 0) — een budget onder de norm is
 *   geen aandachtspunt.
 * - savings = delta × 12 (maand-overschrijding → jaarbesparing-potentieel).
 * - freedomDays = freedom_days_potential (al per jaar berekend door NIBUD).
 * - euroImpactMonthly = delta (de maandelijkse overschrijding).
 * - id-namespace 'budget:' op slug (fallback op categorienaam).
 */
export function budgetBenchmarksToAandachtspunten(
  benchmarks: BudgetBenchmarkLike[],
): Aandachtspunt[] {
  return benchmarks
    .filter((b) => b.delta > 0)
    .map((b) => {
      const key = b.mapped_budget_slug || b.nibud_category_name
      const monthly = Math.round(b.delta * 100) / 100
      return {
        id: `budget:${key}`,
        domain: 'budget' as const,
        title: `Bespaar op ${b.nibud_category_name}`,
        savings: Math.round(b.delta * 12 * 100) / 100,
        euroImpactMonthly: monthly,
        freedomDays: b.freedom_days_potential,
        href: '/overzicht/cashflow',
      }
    })
}

/**
 * Rente-drempel waarboven een schuld een versneld-aflossen-aandachtspunt wordt.
 * Onder deze grens (bv. studielening, lage hypotheek) loont versneld aflossen
 * fiscaal/rationeel zelden — niet als aandachtspunt opvoeren.
 */
export const DEBT_INTEREST_THRESHOLD = 4

/**
 * Actieve schulden met betekenisvolle rente → "versneld aflossen"-aandachtspunten.
 *
 * - Alleen `is_active`, `current_balance > 0` EN `interest_rate >= DEBT_INTEREST_THRESHOLD`.
 *   (Lage-rente hypotheek/studielening worden zo niet over-agressief opgevoerd.)
 * - savings = current_balance × (interest_rate / 100) — de jaarlijkse rentelast
 *   die je terugkoopt als je de schuld wegwerkt.
 * - freedomDays = savings / dailyExpenses (0 als dailyExpenses ≤ 0).
 * - id-namespace 'debt:' op debt.id.
 */
export function debtsToAandachtspunten(debts: Debt[], dailyExpenses: number): Aandachtspunt[] {
  const result: Aandachtspunt[] = []
  for (const debt of debts) {
    if (!debt.is_active) continue
    const balance = Number(debt.current_balance) || 0
    const rate = Number(debt.interest_rate) || 0
    if (balance <= 0 || rate < DEBT_INTEREST_THRESHOLD) continue

    const savings = Math.round(balance * (rate / 100) * 100) / 100
    const freedomDays = dailyExpenses > 0 ? Math.round(savings / dailyExpenses) : 0
    result.push({
      id: `debt:${debt.id}`,
      domain: 'debt',
      title: `Versneld aflossen: ${debt.name}`,
      savings,
      freedomDays,
      href: '/overzicht/schulden',
    })
  }
  return result
}

// ── Asset-adapter (PURE) ─────────────────────────────────────

/**
 * Asset-types die als direct-opneembaar spaargeld tellen — gelijk aan de
 * 'spaargeld'-groep in `WEALTH_GROUPS` (lib/wealth-composition.ts). Bewust
 * geïnlined zodat deze pure adapter de zware wealth-composition-module niet
 * hoeft te importeren.
 */
const LIQUID_SAVINGS_TYPES: AssetType[] = ['cash', 'savings']

/** Aanbevolen noodbuffer in maanden uitgaven — gangbare vuistregel. */
export const CASH_BUFFER_MONTHS = 6

/**
 * Minimaal overschot bóven de buffer (EUR) voordat cash-drag een aandachtspunt
 * wordt. Onder deze grens is het effect te klein om op te voeren.
 */
export const MIN_CASH_EXCESS = 5_000

/**
 * Overtollig spaargeld (bóven een gezonde noodbuffer) → "zet overtollig
 * spaargeld aan het werk"-aandachtspunt.
 *
 * Feitelijke, Wft-veilige framing: stilstaand spaargeld verliest jaarlijks
 * koopkracht door inflatie. We doen GEEN beleggings-/productaanbeveling — dat
 * blijft bewust aan de gebruiker (+ een erkend adviseur). Het aandachtspunt
 * benoemt alleen de kans en kwantificeert het koopkrachtverlies.
 *
 * - Alleen actieve assets in de spaargeld-groep (cash + savings).
 * - buffer = CASH_BUFFER_MONTHS × maanduitgaven (= CASH_BUFFER_MONTHS × 30 × daguitgaven).
 * - excess = spaargeld − buffer; alleen bij excess ≥ MIN_CASH_EXCESS.
 * - savings = excess × inflatie (jaarlijks koopkrachtverlies dat je voorkomt).
 * - freedomDays = savings / daguitgaven.
 *
 * Faalt zacht: bij ontbrekende dag-uitgaven of inflatie ≤ 0 → geen aandachtspunt
 * (we verzinnen geen buffer uit het niets).
 */
export function assetsToAandachtspunten(
  assets: Asset[],
  dailyExpenses: number,
  inflationRate: number,
): Aandachtspunt[] {
  if (dailyExpenses <= 0 || inflationRate <= 0) return []

  const spaargeld = assets
    .filter((a) => a.is_active && LIQUID_SAVINGS_TYPES.includes(a.asset_type))
    .reduce((sum, a) => sum + (Number(a.current_value) || 0), 0)

  const buffer = CASH_BUFFER_MONTHS * 30 * dailyExpenses
  const excess = spaargeld - buffer
  if (excess < MIN_CASH_EXCESS) return []

  const savings = Math.round(excess * inflationRate)
  if (savings <= 0) return []
  const freedomDays = Math.round(savings / dailyExpenses)

  return [
    {
      id: 'asset:cash-drag',
      domain: 'asset',
      title: 'Zet overtollig spaargeld aan het werk',
      savings,
      freedomDays,
      href: '/overzicht/bezittingen',
    },
  ]
}
