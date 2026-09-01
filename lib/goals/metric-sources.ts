/**
 * De canonieke BRONNEN achter auto-sync metric-doelen (`metadata.sync === 'auto'`).
 *
 * ## Waarom dit één gedeelde module is, en geen thunk-set per loader
 * Twee loaders voeden dezelfde doelkaarten: `lib/fin-data-loader.ts` (het
 * doelen-scherm) en `lib/dashboard-data-loader.ts` (de Doelen-widget). Zouden
 * beide hun eigen waarde aanleveren, dan zou hetzelfde doel op twee schermen
 * twee getallen kunnen tonen zodra de assemblage ook maar één ingrediënt
 * verschillend samenstelt — en dat verschil is er: de fin-loader heeft geen
 * losse bankrekeningen, geen jaargelaagde FIRE-aannames en geen noodfonds-
 * resolutie in huis. Precies die drift is de bugklasse die `syncActiveGoalValues`
 * bestaat om uit te sluiten (widget 0% naast scherm 42,3%; spaarquote 5,8 %
 * naast 9,5 % naast 30 %).
 *
 * Daarom levert deze module ÉÉN set thunks die beide loaders doorgeven. Alle
 * onderliggende fetchers zijn React-`cache()`'d (`lib/server-data/base.ts`,
 * `loadForecastSectionData`, `loadFiscaleKansen`), dus op een render waar de
 * dashboardbundel toch al draait kost dit geen extra query; op het doelen-scherm
 * is het één lichte extra fetch — en alleen wanneer er daadwerkelijk zo'n doel is.
 *
 * ## Consume, don't recompute
 * Geen enkele functie hier schrijft een financiële formule op. Elke bron roept de
 * bestaande canonieke laag aan:
 *   • netto vermogen      → `computeWeightedNetWorth` (lib/dashboard-wealth-weighting.ts)
 *   • passief inkomen     → `computePassiveIncomeMonthly` (lib/core-metrics.ts)
 *                            met `resolveFireParamsWithAssumptions(...).effectiveSwr`
 *   • noodfonds           → `resolveEmergencyFundFromRows` (lib/emergency-fund.ts)
 *   • belastingdruk       → `buildTaxOverview` (lib/tax-overview.ts) op `loadFiscaleKansen`
 *   • schuldenvrij-datum  → `resolveDebtTermBasis` (lib/debt-term-basis.ts)
 * De enige eigen logica is rij-selectie en een datum→decimaal-jaar-conversie.
 *
 * Elke bron levert `number | null | undefined`; `null`/`undefined` betekent
 * "geen uitspraak" en laat de opgeslagen DB-waarde staan (tolerante degradatie,
 * het bestaande patroon van `injectParameterGoalCurrentValues`).
 */

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

import { CURRENT_TAX_YEAR } from '@/lib/box3-data'
import { computePassiveIncomeMonthly } from '@/lib/core-metrics'
import { loadForecastSectionData } from '@/lib/cashflow-kpis'
import {
  computeWeightedNetWorth,
  type WeightableAssetRow,
  type WeightableDebtRow,
} from '@/lib/dashboard-wealth-weighting'
import { resolveDebtTermBasis, type DebtTermBasis } from '@/lib/debt-term-basis'
import type { DebtType } from '@/lib/debt-data'
import { resolveEmergencyFundFromRows } from '@/lib/emergency-fund'
import type { FireAssumptionRow } from '@/lib/fire-assumptions'
import { resolveFireParamsWithAssumptions, type FireProfileInput } from '@/lib/fire-params'
import type { DebtFreeDateSource, GoalMetricSources } from '@/lib/goal-current-value'
import {
  getActiveAssets,
  getActiveDebts,
  getOwnProfile,
  getUnlinkedBankAccounts,
} from '@/lib/server-data/base'
import { buildTaxOverview } from '@/lib/tax-overview'
import { loadFiscaleKansen } from '@/lib/tax-opportunities-loader'
import { resolveUnlinkedCashShare, unlinkedCashTotal } from '@/lib/unlinked-cash'

// ── Pure helpers ────────────────────────────────────────────────────────────

/**
 * ISO-datum → DECIMAAL JAAR met MAAND-precisie: `jaar + maandIndex / 12`.
 *
 * Exacte inverse van `splitDecimalYear` (lib/goal-data.ts), zodat opslaan en
 * weergeven niet van maand verschuift: 2031-07-14 → 2031.5 → "juli 2031".
 * De dag valt bewust weg — een schuldenvrij-doel wordt in maanden gedacht, en
 * dagprecisie zou een schijnnauwkeurigheid zijn op een einddatum die zelf vaak
 * een afgeleide is (zie `resolveDebtTermBasis`).
 *
 * `null` bij een onbruikbare datum: liever geen waarde dan een verzonnen jaar.
 */
export function decimalYearFromIso(iso: string | null | undefined): number | null {
  if (!iso) return null
  const d = new Date(iso)
  const ms = d.getTime()
  if (!Number.isFinite(ms)) return null
  return d.getUTCFullYear() + d.getUTCMonth() / 12
}

/** Minimale schuldvorm die de schuldenvrij-datum nodig heeft. */
export interface DebtFreeDateInput {
  debt_type: DebtType
  start_date: string
  end_date: string | null
  is_active?: boolean | null
  current_balance?: number | string | null
}

/**
 * SCHULDENVRIJ-DATUM over de actieve schulden: de LAATSTE (max) einddatum, als
 * decimaal jaar, plus de grondslag waarop die datum rust.
 *
 * ## Keuzes, expliciet
 *  1. **Geen actieve schulden ⇒ het HUIDIGE jaar** (schuldenvrij nú), niet
 *     `null`. Bij `null` zou de opgeslagen DB-waarde blijven staan, en dat is
 *     precies het verkeerde moment om een oude datum te tonen: de gebruiker heeft
 *     zojuist zijn laatste schuld afgelost. De provenance is dan `user_set` —
 *     "je hebt geen schulden" is een feit, geen aanname van ons.
 *  2. **Provenance = die van de schuld die de maximum-datum zet.** Die datum
 *     bepáált het getal, dus zijn herkomst bepaalt of het een hard feit is.
 *  3. **Eén actieve schuld zonder einddatum ⇒ `no_end_date` wint**, ongeacht de
 *     rest: de werkelijke schuldenvrij-datum ligt dan mogelijk ná de gevonden
 *     maximum-datum. De waarde blijft staan (het is de best beschikbare
 *     ondergrens) maar het label moet zeggen dat er iets ontbreekt.
 *
 * Alleen `user_set` mag als hard feit op het scherm; voor `default_term` en
 * `no_end_date` hoort er een aanname-regel bij het getal
 * (`describeDebtTermBasis` → components/editorial/aanname-hint.tsx).
 */
export function resolveDebtFreeDate(
  debts: readonly DebtFreeDateInput[],
  now: Date = new Date(),
): DebtFreeDateSource {
  const active = debts.filter(d => d.is_active !== false)

  if (active.length === 0) {
    return {
      decimalYear: now.getFullYear() + now.getMonth() / 12,
      basis: { kind: 'user_set' },
    }
  }

  let maxIso: string | null = null
  let maxBasis: DebtTermBasis | null = null
  let anyMissingEndDate = false

  for (const debt of active) {
    const basis = resolveDebtTermBasis({
      debt_type: debt.debt_type,
      start_date: debt.start_date,
      end_date: debt.end_date,
    })
    if (basis.kind === 'no_end_date' || !debt.end_date) {
      anyMissingEndDate = true
      continue
    }
    if (maxIso === null || debt.end_date > maxIso) {
      maxIso = debt.end_date
      maxBasis = basis
    }
  }

  const decimalYear = decimalYearFromIso(maxIso)
  if (decimalYear == null) {
    // Uitsluitend schulden zónder einddatum: geen datum af te leiden.
    return { decimalYear: null, basis: { kind: 'no_end_date' } }
  }
  return {
    decimalYear,
    basis: anyMissingEndDate ? { kind: 'no_end_date' } : maxBasis,
  }
}

// ── Gedeelde, cache()'de bron-loaders ───────────────────────────────────────

/**
 * Netto vermogen op de canonieke inclusion-weging — dezelfde helper als
 * `DashboardData.netWorth`, maar op de EIGEN rijen.
 *
 * De scoping is niet optioneel. `getActiveAssets`/`getActiveDebts` zijn bewust
 * RLS-breed: voor een huishoud-account leveren ze óók de `ownership='shared'`-
 * rijen van de partner, en die tellen in de weging voor 100% mee. Dat is juist
 * voor een huishoudweergave, maar een doel is persoonlijk — en sinds ADR 0125
 * SCHRIJFT dit getal: haalt het de doelwaarde, dan sluit `reconcileAutoCompleted-
 * Goals` het doel af en volgt er een regel in een append-only mijlpalenlogboek.
 * Een persoonlijk doel dat permanent afgevinkt raakt op grond van het vermogen
 * van je partner is niet terug te draaien.
 *
 * DIT WIJKT DUS BEWUST AF VAN `DashboardData.netWorth`, en die afwijking is
 * enger, niet ruimer — de veilige kant. Claim geen pariteit die er niet is:
 * de bundelsom is RLS-breed en telt gedeelde partnerrijen voor 100% mee (alleen
 * de vermogens-selectie-widget filtert daar zelf op eigen rijen, ADR 0120). Voor
 * een huishoud-account kan de doelkaart dus een ander netto vermogen tonen dan
 * de hero op /overzicht.
 *
 * TWEEDE, KLEINERE AFWIJKING, bewust niet gedicht: dit pad kent de module-gate
 * `hasVermogen` niet. Staat vermogensregistratie uit, dan toont /overzicht alleen
 * de kaspositie terwijl dit doel het volledige gewogen vermogen blijft volgen.
 * Wie een netto-vermogen-doel stelt heeft die module in de praktijk aan; komt het
 * toch voor, dan is de gate hier de juiste plek.
 */
const loadGoalNetWorth = cache(async function loadGoalNetWorth(
  supabase: SupabaseClient,
): Promise<number | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const [assetsRes, debtsRes, bankRes] = await Promise.all([
    getActiveAssets(supabase),
    getActiveDebts(supabase),
    getUnlinkedBankAccounts(supabase),
  ])
  const ownRows = <T extends { user_id?: string | null }>(rows: readonly T[] | null | undefined) =>
    (rows ?? []).filter((r) => r.user_id === user.id)
  const unlinkedCash = unlinkedCashTotal(
    ownRows(bankRes.data as unknown as { user_id?: string | null }[]) as typeof bankRes.data,
    await resolveUnlinkedCashShare(supabase, bankRes.data),
  )
  const value = computeWeightedNetWorth(
    ownRows(assetsRes.data as unknown as { user_id?: string | null }[]) as unknown as WeightableAssetRow[],
    unlinkedCash,
    ownRows(debtsRes.data as unknown as { user_id?: string | null }[]) as unknown as WeightableDebtRow[],
  )
  return Number.isFinite(value) ? value : null
})

/**
 * Effectieve onttrekkingsvoet — `resolveFireParamsWithAssumptions`, dus MÉT de
 * jaargelaagde beheerders-aannames (`fire_assumptions`). Dat is de volledige
 * canonieke keten; zou hier het kale `resolveFireParams` staan, dan rekende het
 * passief-inkomen-doel met een andere SWR dan de rest van de app zodra beheer
 * een jaarlaag zet (de drift die `fire-params.ts` expliciet benoemt).
 *
 * De `fire_assumptions`-query degradeert tolerant (ontbrekende tabel/lege set →
 * TS-constanten), identiek aan de dashboard-loader.
 */
const loadGoalEffectiveSwr = cache(async function loadGoalEffectiveSwr(
  supabase: SupabaseClient,
): Promise<number | null> {
  const [profileRes, assumptionsRes] = await Promise.all([
    getOwnProfile(supabase),
    supabase
      .from('fire_assumptions')
      .select('year, expected_return, inflation, volatility, source, is_definitive')
      .order('year', { ascending: true })
      .then(r => r, () => ({ data: null })),
  ])
  // `resolveFireParamsWithAssumptions` past de jaarlaag-shadow zelf toe
  // (`resolveFireAssumptions` zit erin) — hier alleen de rijen doorgeven.
  const rows = (assumptionsRes.data ?? null) as FireAssumptionRow[] | null
  const params = resolveFireParamsWithAssumptions(
    (profileRes.data ?? null) as FireProfileInput | null,
    rows,
  )
  return Number.isFinite(params.effectiveSwr) ? params.effectiveSwr : null
})

/**
 * Noodfonds-dekking in maanden — de canonieke `resolveEmergencyFundFromRows`
 * (liquide pot / netto maandsalaris) op de effectieve maand-cijfers uit
 * `loadForecastSectionData`. Dat is dezelfde effectieve grondslag die
 * `DashboardData.emergencyFund` voedt.
 */
const loadGoalEmergencyMonths = cache(async function loadGoalEmergencyMonths(
  supabase: SupabaseClient,
): Promise<number | null> {
  const [assetsRes, bankRes, scalars] = await Promise.all([
    getActiveAssets(supabase),
    getUnlinkedBankAccounts(supabase),
    loadForecastSectionData(supabase),
  ])
  const unlinkedCash = unlinkedCashTotal(
    bankRes.data,
    await resolveUnlinkedCashShare(supabase, bankRes.data),
  )
  const result = resolveEmergencyFundFromRows(
    (assetsRes.data ?? []) as unknown as Parameters<typeof resolveEmergencyFundFromRows>[0],
    unlinkedCash,
    scalars.monthlyIncome,
    scalars.monthlyExpenses,
  )
  return Number.isFinite(result.monthsCovered) ? result.monthsCovered : null
})

/**
 * BELASTINGDRUK in % — `buildTaxOverview(...).effectiveRate × 100`.
 *
 * GRONDSLAG, expliciet (bevinding C9): dit is de Box 1-heffing over het Box
 * 1-INKOMEN, exact het percentage van /overzicht/belasting en
 * /overzicht/belasting/box1. Het is NADRUKKELIJK niet `total / inkomen`: `total`
 * bevat ook de Box 3-VERMOGENSheffing, en die heeft geen inkomens-noemer. Die
 * teller/noemer-menging is ooit uit `buildTaxOverview` verwijderd omdat ze
 * "36,6% effectief naast 35,8% marginaal" opleverde — een combinatie die in een
 * progressief stelsel niet kan bestaan. Een doel op "totale belastingdruk %" zou
 * die menging terugzetten; daarom meet dit doel het enige percentage met een
 * sluitende grondslag.
 *
 * `null` zonder bekend inkomen (dan levert de motor zelf `null`) — de kaart
 * houdt dan zijn opgeslagen waarde in plaats van een misleidende 0%.
 */
const loadGoalTaxBurdenPct = cache(async function loadGoalTaxBurdenPct(
  supabase: SupabaseClient,
): Promise<number | null> {
  let kansen
  try {
    // Persoonlijke blik + het lopende belastingjaar: dezelfde sleutel waarmee de
    // hub 'm standaard laadt. `cache()`'d op (client, perspectief, jaar).
    kansen = await loadFiscaleKansen(supabase, 'personal', CURRENT_TAX_YEAR)
  } catch {
    return null
  }
  const overview = buildTaxOverview({
    box1Tax: kansen.box1Tax,
    // Box 2 blijft buiten het totaal (BEL-1) — de hub doet hetzelfde.
    box2Tax: null,
    box3Tax: kansen.box3PerspectiveTax,
    effectiveRate: kansen.box1EffectiveRate,
    marginalRate: kansen.box1MarginalRate,
    dailyExpenses: kansen.dailyExpenses,
  })
  if (overview.effectiveRate == null || !Number.isFinite(overview.effectiveRate)) return null
  // De motor levert een FRACTIE (0.366); de doel-unit is '%' (36,6). Eén
  // conversie, hier, met de afronding van `formatGoalValue` voor '%'.
  return Math.round(overview.effectiveRate * 100 * 10) / 10
})

/** Schuldenvrij-datum over de gedeelde, cache()'de actieve-schulden-fetch. */
const loadGoalDebtFreeDate = cache(async function loadGoalDebtFreeDate(
  supabase: SupabaseClient,
): Promise<DebtFreeDateSource> {
  const debtsRes = await getActiveDebts(supabase)
  return resolveDebtFreeDate((debtsRes.data ?? []) as unknown as DebtFreeDateInput[])
})

// ── De set die beide loaders doorgeven ──────────────────────────────────────

/**
 * De gedeelde metric-bronnen voor `syncActiveGoalValues`. Puur thunk-assemblage:
 * niets draait tot `syncActiveGoalValues` vaststelt dat er een actief doel van
 * dat type is.
 *
 * Beide loaders geven LETTERLIJK dit object door, zodat het doelen-scherm en de
 * Doelen-widget per constructie hetzelfde cijfer per doel tonen.
 */
export function buildGoalMetricSources(supabase: SupabaseClient): GoalMetricSources {
  return {
    netWorth: () => loadGoalNetWorth(supabase),
    passiveIncomeMonthly: async () => {
      const [netWorth, swr] = await Promise.all([
        loadGoalNetWorth(supabase),
        loadGoalEffectiveSwr(supabase),
      ])
      if (netWorth == null || swr == null) return null
      return computePassiveIncomeMonthly(netWorth, swr)
    },
    emergencyFundMonths: () => loadGoalEmergencyMonths(supabase),
    taxBurdenPct: () => loadGoalTaxBurdenPct(supabase),
    debtFreeDate: () => loadGoalDebtFreeDate(supabase),
  }
}

// ── goal_links-fetch (gedeeld door beide loaders) ───────────────────────────

/**
 * Haal de koppelrijen op voor een set doelen. Kolom-scoped en gefilterd op de
 * al geladen goal-ids, dus geen extra RLS-oppervlak en geen onnodige egress.
 *
 * TOLERANT OP EEN ONTBREKENDE TABEL: `goal_links` komt via een aparte migratie
 * binnen. Zolang die niet gedraaid is levert PostgREST een 400; die vangen we op
 * en geven `[]` terug — de doelen vallen dan terug op de legacy-kolommen
 * (`linked_asset_id`/`linked_debt_id`), exact het gedrag van voor deze wijziging.
 */
export async function loadGoalLinks(
  supabase: SupabaseClient,
  goalIds: readonly string[],
): Promise<{ goal_id: string; asset_id: string | null; debt_id: string | null }[]> {
  if (goalIds.length === 0) return []
  const { data } = await supabase
    .from('goal_links')
    .select('goal_id, asset_id, debt_id')
    .in('goal_id', goalIds as string[])
    .then(r => r, () => ({ data: null }))
  return (data ?? []) as { goal_id: string; asset_id: string | null; debt_id: string | null }[]
}
