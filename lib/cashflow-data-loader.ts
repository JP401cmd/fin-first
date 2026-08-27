// lib/cashflow-data-loader.ts
// Server-side data loader voor de cashflow-pagina's onder /overzicht/cashflow.
//
// Factort het recurrings/baseline/bank-accounts-blok dat voorheen inline in
// app/(app)/overzicht/cashflow/page.tsx stond. Wordt gedeeld door de
// landingspagina (kaart-KPI's), de Vaste-lasten-pagina en de Forecast-pagina.
// React `cache()` dedupt per request.
//
// GEEN TRANSACTIE-FEED. De loader leverde ooit ook een 3-maands rijen-feed met
// een naam-decoratie erbij; die uitvoer had geen enkele lezer meer en is
// verwijderd. De transactie-as wordt hier alleen nog geaggregeerd (baseline +
// incassodag-afleiding) en verlaat de loader niet per rij. Wie rijen wil toont,
// haalt ze op waar ze getoond worden — niet via deze bundel.
//
// Huishouden-perspectief (plan Onderdeel 4): de transactie-as komt uit
// loadPerspectiveTransactions (single source of truth voor ownership/privacy).
//   • personal  → mijn transacties + mijn aandeel van gedeelde transacties
//   • household → beide partners (gedeeld één keer; partner-persoonlijk gated)
//   • partner   → partner-persoonlijk (privacy-gated) + partner-aandeel gedeeld
// recurring_transactions + bank_accounts-startsaldo worden via ownership/aandeel
// gescoped (RLS levert eigen-persoonlijk + gedeeld; aandeel wordt toegepast).

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { withDerivedDayOfMonth, type RecurringTransaction, type DayDerivationTx } from '@/lib/recurring-data'
import { getOwnProfile } from '@/lib/server-data/base'
import { loadPerspectiveTransactionsServer } from '@/lib/household/perspective-loader-server'
import { type PerspectiveItem } from '@/lib/household/perspective-loader'
import { localMonthEnd, localMonthStartMonthsAgo } from '@/lib/month-range'
import type { OwnershipType, Perspective } from '@/lib/household-data'

/**
 * Lengte van het forecast-baseline-venster in VOLLEDIGE kalendermaanden.
 *
 * Bewust loader-lokaal en NIET gekoppeld aan `SAVINGS_RATE_WINDOW_MONTHS`: dat
 * venster voedt een RATIO (de spaarquote), dit een ABSOLUUT €/maand-gemiddelde.
 * Ze zijn vandaag even lang, maar een wijziging aan het één hoort het ander niet
 * stil mee te verschuiven.
 */
const BASELINE_WINDOW_MONTHS = 6

// ── Result type ───────────────────────────────────────────────

export interface CashflowData {
  /** Huidige maand-label, bv. "juni 2026". */
  monthLabel: string | undefined
  /** Profielnaam — gebruikt door VasteLastenLoader. */
  fullName: string | null
  /** Actieve terugkerende transacties (vaste lasten + inkomsten). */
  recurrings: RecurringTransaction[]
  /** 6-maands gemiddeld maand-inkomen (baseline voor forecast). */
  baselineIncome: number
  /** 6-maands gemiddelde maand-uitgaven (baseline voor forecast). */
  baselineExpenses: number
  /** Som van liquide saldi (startpunt cumulatieve forecast). */
  startingBalance: number
  /** Aantal actieve gekoppelde bankrekeningen. */
  accountCount: number
  /** Perspectief waarmee de cashflow-data gestempeld is. */
  perspective: Perspective
  /**
   * Maandelijks partner-inkomen uit de privacy-gated 'income'-bron, of `null`
   * (solo / eigen-perspectief / partner deelt inkomen niet). Voor gecombineerde
   * inkomstweergave — niet ad hoc opnieuw afleiden.
   */
  partnerMonthlyIncome: number | null
  /** Of de huidige gebruiker een huishouden-partner heeft. */
  hasHousehold: boolean
  /** Naam van de partner (indien aanwezig). */
  partnerName: string | null
}

const EMPTY: CashflowData = {
  monthLabel: undefined,
  fullName: null,
  recurrings: [],
  baselineIncome: 0,
  baselineExpenses: 0,
  startingBalance: 0,
  accountCount: 0,
  perspective: 'personal',
  partnerMonthlyIncome: null,
  hasHousehold: false,
  partnerName: null,
}

// ── Helpers ───────────────────────────────────────────────────

/**
 * Het aandeel (0-1) waarmee een waarde van dit item in het perspectief telt.
 * De loader heeft `_myShareFraction` al perspectief-correct gestempeld; we
 * passen het alleen toe op gedeelde items buiten het huishoud-perspectief.
 */
function shareOf(item: PerspectiveItem, perspective: Perspective): number {
  if (item.ownership === 'shared' && perspective !== 'household') {
    return item._myShareFraction
  }
  return 1
}

// ── Baseline-venster ──────────────────────────────────────────

/**
 * Het forecast-baseline-venster: de laatste `BASELINE_WINDOW_MONTHS` VOLLEDIGE
 * kalendermaanden, de lopende maand exclusief.
 *
 * Het venster was dag-rollend (`setMonth(-6)` + `toISOString()`) en had daardoor
 * drie gebreken, alle drie met een vaste deler 6 eronder:
 *   1. `setMonth`-overflow op een 31e — 31-08 rolde door naar 3 maart, dus het
 *      venster kromp naar 5 mnd 28 dgn terwijl er door 6 werd gedeeld;
 *   2. `toISOString()` op een LOKALE `Date` — precies het patroon dat
 *      lib/month-range.ts verbiedt (schuift de grens in NL een dag terug);
 *   3. geen bovengrens — toekomstgedateerde transacties telden mee in een
 *      venster dat "de afgelopen 6 maanden" heet.
 *
 * Volledige maanden lossen bovendien de halve-lopende-maand-verwatering op: bij
 * een ABSOLUUT €/maand-gemiddelde valt een deels geboekte maand niet weg tegen
 * zichzelf (anders dan bij een RATIO zoals de spaarquote). De deler klopt
 * hiermee eindelijk met het venster.
 *
 * `until` is INCLUSIEF — `windowPerspectiveItems` filtert op `date > until`.
 *
 * Geëxporteerd zodat de grenzen los toetsbaar zijn (zie de bijbehorende test);
 * de loader is de enige productie-lezer.
 */
export function baselineWindow(now: Date): { since: string; until: string } {
  return {
    since: localMonthStartMonthsAgo(now, BASELINE_WINDOW_MONTHS),
    until: localMonthEnd(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
  }
}

// ── Loader ────────────────────────────────────────────────────

export const loadCashflowData = cache(async (
  supabase: SupabaseClient,
  perspective: Perspective = 'personal',
): Promise<CashflowData> => {
  const user = await getCachedUser(supabase)
  if (!user) return EMPTY

  const { since: baselineSince, until: baselineUntil } = baselineWindow(new Date())

  // Eén perspectief-gestempelde transactie-set over het 6-maands baseline-
  // venster. Ownership/privacy zijn door de loader/RPC al toegepast. De set
  // wordt hier alleen geaggregeerd — er verlaat geen enkele rij deze loader.
  const [
    perspectiveTx,
    profileResult,
    recurResult,
    accountsResult,
  ] = await Promise.all([
    loadPerspectiveTransactionsServer(supabase, perspective, {
      since: baselineSince,
      until: baselineUntil,
    }),
    // Eigen profielrij uit de GEDEELDE basisdata-laag. Op de drie
    // pagina-callsites draait `loadCashflowKpis`/`loadForecastSectionData` in
    // dezelfde render en die lezen 'm al; `cache()` maakt daar een hele
    // roundtrip vrij. Op de twee niet-render-callsites (de cashflow-status-route
    // en lib/page-status/compute.ts) is `cache()` een passthrough — daar is dit
    // neutraal, niet goedkoper. De vroegere `.eq('id', user.id)` vervalt —
    // profiles-RLS is own-only — en de bredere kolomset kost niets: het is één
    // rij, en de loader leest er nog steeds alleen `full_name` uit.
    getOwnProfile(supabase),
    // RLS levert eigen-persoonlijk + ALLE gedeelde recurrings van het huishouden.
    //
    // BLIJFT LOADER-LOKAAL. De basisdata-laag heeft geen recurring-fetcher, en er
    // één toevoegen levert pas iets op als óók `lib/vaste-lasten-summary.ts` 'm
    // consumeert — de enige andere lezer in deze render. Die leest een smalle
    // 7-kolomsselectie; hem op deze `*` zetten verbreedt zijn egress en raakt het
    // fingerprint-gecachte detectiepad, voor precies één bespaarde query op één
    // van de vier cashflow-pagina's. Dat is geen gratis winst.
    supabase
      .from('recurring_transactions')
      .select('*')
      .eq('is_active', true),
    // Liquide saldo voor cumulatief-startpunt — RLS levert eigen + gedeeld.
    // ⚠️ géén partner_split_pct selecteren: die kolom bestaat niet op
    // bank_accounts en PostgREST laat de hele query dan stil falen (saldo 0).
    //
    // BLIJFT LOADER-LOKAAL. De gedeelde `getUnlinkedBankAccounts` is een ANDERE
    // RIJENSET: die filtert op `linked_asset_id IS NULL` (de grondslag "welk geld
    // telt náást de assets mee", lib/unlinked-cash.ts) en levert geen
    // `ownership`/`user_id` — precies de twee kolommen waarop de
    // perspectief-scoping hieronder draait. Omzetten zou `startingBalance` en
    // `accountCount` numeriek veranderen.
    supabase
      .from('bank_accounts')
      .select('id, balance, name, ownership, user_id')
      .eq('is_active', true),
  ])

  const ctx = perspectiveTx.context

  // ── Baseline-aggregaat over het perspectief-gestempelde 6m-venster ───────
  // Per-line rijen: pas het aandeel toe (gedeeld buiten huishouden → aandeel).
  // De privacy='totals'-aggregaatrij draagt zijn total_income/total_expense
  // rechtstreeks bij zonder per-line detail.
  let totalIncome = 0
  let totalExpenses = 0
  for (const t of perspectiveTx.transactions) {
    if (t._aggregated) {
      totalIncome += Number(t.total_income) || 0
      totalExpenses += Number(t.total_expense) || 0
      continue
    }
    const frac = shareOf(t, perspective)
    const a = Number(t.amount) * frac
    if (a > 0) totalIncome += a
    else totalExpenses += Math.abs(a)
  }
  const baselineIncome = Math.round(totalIncome / BASELINE_WINDOW_MONTHS)
  const baselineExpenses = Math.round(totalExpenses / BASELINE_WINDOW_MONTHS)

  // ── Recurrings: scope op ownership + aandeel ─────────────────────────────
  // RLS levert eigen-persoonlijk + gedeeld. Personal/partner: filter naar het
  // juiste aandeel; gedeelde bedragen worden naar rato geschaald.
  const recurRaw = (recurResult.data ?? []) as Array<RecurringTransaction & {
    ownership?: OwnershipType
    user_id?: string
    partner_split_pct?: number | null
  }>
  const recurrings: RecurringTransaction[] = recurRaw
    .filter((r) => {
      const own = (r.ownership ?? 'personal') as OwnershipType
      if (perspective === 'partner') {
        // Partner-perspectief: alleen gedeelde recurrings (partner-persoonlijke
        // recurrings zijn niet via de RPC beschikbaar — bewust geen detail).
        return own === 'shared'
      }
      // personal/household: eigen-persoonlijk + gedeeld (beide via RLS).
      return true
    })
    .map((r) => {
      const own = (r.ownership ?? 'personal') as OwnershipType
      if (own !== 'shared' || perspective === 'household') return r as RecurringTransaction
      const frac =
        perspective === 'personal'
          ? ctx.mySharePct / 100
          : 1 - ctx.mySharePct / 100
      return { ...r, amount: Number(r.amount) * frac } as RecurringTransaction
    })

  // ── Incassodag afleiden voor regels zonder day_of_month ──────────────────
  // De AI-abonnementen-detectie slaat recurrings op zónder day_of_month; zonder
  // dag klonteren ze op de kalender allemaal op één rand-dag samen. De werkelijke
  // incassodag staat in de transactiegeschiedenis (het 6-maands perspectief-
  // venster dat we hierboven al laadden) — leid 'm daaruit af (per-regel, geen
  // globale vaste dag). Aggregaat-rijen (privacy='totals') missen per-post-detail
  // en dragen niet bij.
  const derivationTx: DayDerivationTx[] = perspectiveTx.transactions
    .filter((t) => !t._aggregated)
    .map((t) => ({
      counterparty_name: (t.counterparty_name as string | null | undefined) ?? null,
      date: t.date as string,
      amount: Number(t.amount),
    }))
  const recurringsWithDays = withDerivedDayOfMonth(recurrings, derivationTx)

  // ── Bank-saldo: scope op ownership + aandeel ─────────────────────────────
  const accountsRows = (accountsResult.data ?? []) as Array<{
    id: string
    balance: number
    name: string
    ownership?: OwnershipType
    user_id?: string
  }>
  const scopedAccounts = accountsRows.filter((a) => {
    const own = (a.ownership ?? 'personal') as OwnershipType
    if (perspective === 'partner') return own === 'shared'
    return true
  })
  const startingBalance = scopedAccounts.reduce((s, a) => {
    const own = (a.ownership ?? 'personal') as OwnershipType
    let frac = 1
    if (own === 'shared' && perspective !== 'household') {
      frac =
        perspective === 'personal'
          ? ctx.mySharePct / 100
          : 1 - ctx.mySharePct / 100
    }
    return s + Number(a.balance ?? 0) * frac
  }, 0)
  // Account-count blijft het aantal zichtbare gekoppelde rekeningen.
  const accountCount = scopedAccounts.length

  const fullName = (profileResult.data as { full_name?: string | null } | null)?.full_name ?? null
  const monthLabel = new Intl.DateTimeFormat('nl-NL', {
    month: 'long',
    year: 'numeric',
  }).format(new Date())

  return {
    monthLabel,
    fullName,
    recurrings: recurringsWithDays,
    baselineIncome,
    baselineExpenses,
    startingBalance,
    accountCount,
    perspective: perspectiveTx.perspective,
    partnerMonthlyIncome: perspectiveTx.partnerMonthlyIncome,
    hasHousehold: ctx.hasHousehold,
    partnerName: ctx.partnerName,
  }
})
