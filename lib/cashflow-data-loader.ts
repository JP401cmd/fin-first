// lib/cashflow-data-loader.ts
// Server-side data loader voor de cashflow-pagina's onder /overzicht/cashflow.
//
// Factort het transactions/recurrings/baseline/bank-accounts-blok dat voorheen
// inline in app/(app)/overzicht/cashflow/page.tsx stond. Wordt gedeeld door de
// landingspagina (kaart-KPI's), de Transacties-pagina, de Vaste-lasten-pagina
// en de Forecast-pagina. React `cache()` dedupt per request.
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
import type { TransactionRow } from '@/lib/types/transactions'
import { withDerivedDayOfMonth, type RecurringTransaction, type DayDerivationTx } from '@/lib/recurring-data'
import { getOwnProfile } from '@/lib/server-data/base'
import { loadPerspectiveTransactionsServer } from '@/lib/household/perspective-loader-server'
import { type PerspectiveItem } from '@/lib/household/perspective-loader'
import type { OwnershipType, Perspective } from '@/lib/household-data'

// ── Result type ───────────────────────────────────────────────

export interface CashflowData {
  /** Laatste 3 maanden transacties (voor de Transacties-pagina). */
  transactions: TransactionRow[]
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
  transactions: [],
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

/**
 * Maximaal aantal id's per decoratie-batch (zie de feed-sectie onderaan).
 * PostgREST zet `in.(…)` in de query-STRING, dus een ongebonden id-lijst loopt
 * tegen de URL-lengtegrens van proxies/CDN aan. Klein genoeg om ruim onder die
 * grens te blijven, groot genoeg om het aantal roundtrips laag te houden.
 */
const DECORATION_BATCH_SIZE = 100

// ── Loader ────────────────────────────────────────────────────

export const loadCashflowData = cache(async (
  supabase: SupabaseClient,
  perspective: Perspective = 'personal',
): Promise<CashflowData> => {
  const user = await getCachedUser(supabase)
  if (!user) return EMPTY

  // 3-maands venster voor de transactie-feed (display).
  const since = new Date()
  since.setMonth(since.getMonth() - 3)
  const sinceIso = since.toISOString().split('T')[0]
  // Baseline-venster voor forecast: laatste 6 maanden gemiddeld inkomen +
  // uitgaven. Zelfde 6m-periode als de health-score (consistentie).
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const sixMonthsAgoIso = sixMonthsAgo.toISOString().split('T')[0]

  // Eén perspectief-gestempelde transactie-set over het 6-maands baseline-
  // venster (het 3-maands feed-venster is een subset). Ownership/privacy zijn
  // door de loader/RPC al toegepast.
  const [
    perspectiveTx,
    profileResult,
    recurResult,
    accountsResult,
  ] = await Promise.all([
    loadPerspectiveTransactionsServer(supabase, perspective, { since: sixMonthsAgoIso }),
    // Eigen profielrij uit de GEDEELDE basisdata-laag. Op elke cashflow-pagina
    // draait `loadCashflowKpis`/`loadForecastSectionData` in dezelfde render en
    // die lezen 'm al; `cache()` maakt hier dus een hele roundtrip vrij. De
    // vroegere `.eq('id', user.id)` vervalt — profiles-RLS is own-only — en de
    // bredere kolomset kost niets: het is één rij, en de loader leest er nog
    // steeds alleen `full_name` uit.
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
  const baselineIncome = Math.round(totalIncome / 6)
  const baselineExpenses = Math.round(totalExpenses / 6)

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

  // ── Display-transacties (feed) ───────────────────────────────────────────
  // De perspectief-loader is de bron-of-waarheid voor WELKE rijen tellen
  // (ownership/privacy); een tweede query levert alleen nog de account-/
  // categorienaam erbij. Volgorde is hier de crux: eerst vaststellen wélke rijen
  // de feed toont, dán precies die rijen decoreren.
  //
  // Vroeger stond het andersom — een venster-query met een vaste `.limit(...)`
  // waarvan de uitkomst per ID op de feed werd gemapt. Voor wie meer rijen in
  // het 3-maands venster had dan die limiet, vielen de OUDSTE feed-rijen buiten
  // de join en verloren stil hun rekening- en categorienaam: geen fout, geen
  // signaal, alleen ontbrekende data. Selecteren op de feed-ID's zelf maakt die
  // afkap per constructie onmogelijk, en vraagt tegelijk minder op dan voorheen.
  const feedRows: PerspectiveItem[] = []
  for (const t of perspectiveTx.transactions) {
    if (t._aggregated) continue
    // Leeg/ontbrekend id → niet toonbaar én niet decoreerbaar (ongewijzigd).
    if (t.id == null || String(t.id) === '') continue
    if (String(t.date ?? '') < sinceIso) continue
    feedRows.push(t)
  }

  // Partner-PERSOONLIJKE rijen komen uit de privacy-gated RPC en bestaan niet
  // onder de eigen RLS. Die vragen we bewust NIET op: naamloos is voor hen het
  // bedoelde privacy-gedrag, geen ontbrekende data. Gedeelde rijen horen er wél
  // bij, óók als ze op naam van de partner staan — daarom geen `user_id`-filter
  // op de query hieronder.
  const decorateIds = feedRows
    .filter((t) => t._provenance !== 'partner')
    .map((t) => String(t.id))

  const displayById = new Map<string, Record<string, unknown>>()
  if (decorateIds.length > 0) {
    const batches: string[][] = []
    for (let i = 0; i < decorateIds.length; i += DECORATION_BATCH_SIZE) {
      batches.push(decorateIds.slice(i, i + DECORATION_BATCH_SIZE))
    }
    const decorated = await Promise.all(
      batches.map((ids) =>
        supabase
          .from('transactions')
          // Alleen de naam-kolommen: datum/omschrijving/bedrag komen uit de
          // perspectief-set, die ze al perspectief-correct gestempeld draagt.
          .select('id, bank_accounts(name), budgets(name)')
          .in('id', ids),
      ),
    )
    for (const res of decorated) {
      for (const r of (res.data ?? []) as Array<Record<string, unknown>>) {
        displayById.set(String(r.id), r)
      }
    }
  }

  const transactions: TransactionRow[] = []
  for (const t of feedRows) {
    const id = String(t.id)

    const joinRow = displayById.get(id)
    const bankField = joinRow
      ? (joinRow as { bank_accounts?: { name?: string } | { name?: string }[] | null }).bank_accounts
      : undefined
    const accountName = Array.isArray(bankField) ? bankField[0]?.name : bankField?.name
    const budgetField = joinRow
      ? (joinRow as { budgets?: { name?: string } | { name?: string }[] | null }).budgets
      : undefined
    const categoryName = Array.isArray(budgetField) ? budgetField[0]?.name : budgetField?.name

    const frac = shareOf(t, perspective)
    transactions.push({
      id,
      date: String(t.date ?? ''),
      description: String(t.description ?? ''),
      category: categoryName ?? null,
      amount: Number(t.amount) * frac,
      account_name: accountName ?? null,
    })
  }
  transactions.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

  const fullName = (profileResult.data as { full_name?: string | null } | null)?.full_name ?? null
  const monthLabel = new Intl.DateTimeFormat('nl-NL', {
    month: 'long',
    year: 'numeric',
  }).format(new Date())

  return {
    transactions,
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
