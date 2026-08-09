'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowRight, Plus, Upload, Link2, ChevronRight, MoreHorizontal } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { usePerspective } from '@/components/app/perspective-provider'
import {
  resolvePeriodWindow,
  resolveHeatmapWindow,
  resolveFetchWindow,
  heatmapWindowCovered,
  summarizeFlow,
  newCounterparties,
  counterpartyKey,
  type AnalysisTransaction,
  type PeriodKind,
} from '@/lib/transaction-insights'
import {
  loadPerspectiveTransactions,
  windowPerspectiveItems,
  type PerspectiveItem,
} from '@/lib/household/perspective-loader'
import type { Perspective } from '@/lib/household-data'
import type { Budget } from '@/lib/budget-data'
import { fetchOwnAccountIbans, ibanById } from '@/lib/own-accounts-ibans'
import { TransactieTijdlijn, type AccountOption } from './transactie-tijdlijn'
import { TransactionForm } from '@/components/app/transaction-form'
import { HideInSimple } from '@/components/app/hide-in-simple'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { CounterpartyAnalysisPanel } from '@/components/app/counterparty-analysis-panel'
import { PeriodeSelector, resolvePeriodForMode } from './periode-selector'
import { GeldstroomGauge } from './geldstroom-gauge'
import { TopTegenpartijen } from './top-tegenpartijen'
import { GrootsteUitgaven } from './grootste-uitgaven'
import { NieuweTegenpartijen } from './nieuwe-tegenpartijen'
import { WeekdagPatroon } from './weekdag-patroon'
import { PeriodeTrend } from './periode-trend'
import { UitgavenHeatmap } from './uitgaven-heatmap'
import { TransactieDetailSheet } from './transactie-detail-sheet'

/**
 * TransactiesAnalyse — periode-gestuurde transactie-analyse op
 * /overzicht/cashflow/transacties.
 *
 * Client-component (zoals cash-account-view): haalt zélf de transacties op per
 * gekozen periode, zodat door de historie bladeren mogelijk is. Perspectief +
 * privacy lopen via de dual-use `loadPerspectiveTransactions` (de enige bron
 * van waarheid voor ownership/privacy). De pure rekenfuncties uit
 * `lib/transaction-insights` voeden alle inzichten.
 *
 * Fetcht het venster [prevSince, until] in één keer zodat de huidige én vorige
 * periode beschikbaar zijn (voor de trend), plus een lichte prior-query voor de
 * "nieuwe tegenpartijen". De uitgaven-heatmap heeft een eigen, vast
 * 12-maands-venster dat daar normaal volledig binnen valt; in dat geval wordt
 * hij uit dezelfde ruwe set gesneden in plaats van een tweede keer gedownload.
 * Klik op een transactie → bestaand TransactionForm;
 * klik op een tegenpartij → bestaande CounterpartyAnalysisPanel.
 */

type FullTransaction = {
  id: string
  account_id: string
  budget_id: string | null
  date: string
  amount: number
  description: string
  counterparty_name: string | null
  counterparty_iban: string | null
  is_income: boolean
  notes: string | null
  category_source: string
  is_split?: boolean
  ownership?: 'personal' | 'shared'
}

type BudgetGroup = { parent: Budget; children: Budget[] }

/** Aandeel (0-1) waarmee een item in dit perspectief telt — spiegelt cashflow-data-loader. */
function shareOf(item: PerspectiveItem, perspective: Perspective): number {
  if (item.ownership === 'shared' && perspective !== 'household') {
    return item._myShareFraction
  }
  return 1
}

function mapRow(
  item: PerspectiveItem,
  perspective: Perspective,
  budgetMap: Map<string, string>,
  accountMap: Map<string, string>,
): AnalysisTransaction | null {
  if (item._aggregated) return null // privacy-'totalen' → geen regel-detail
  const id = item.id != null ? String(item.id) : null
  if (!id) return null
  const budget_id = (item.budget_id as string | null) ?? null
  const account_id = (item.account_id as string | null) ?? null
  const frac = shareOf(item, perspective)
  return {
    id,
    date: String(item.date ?? ''),
    amount: Number(item.amount) * frac,
    description: String(item.description ?? ''),
    counterparty_name: (item.counterparty_name as string | null) ?? null,
    counterparty_iban: (item.counterparty_iban as string | null) ?? null,
    budget_id,
    category: budget_id ? budgetMap.get(budget_id) ?? null : null,
    account_id,
    account_name: account_id ? accountMap.get(account_id) ?? null : null,
    is_income: Boolean(item.is_income),
    transaction_type: (item.transaction_type as string | null) ?? null,
    bank_code: (item.bank_code as string | null) ?? null,
    running_balance: item.running_balance != null ? Number(item.running_balance) : null,
    creditor_id: (item.creditor_id as string | null) ?? null,
    fx_amount: item.fx_amount != null ? Number(item.fx_amount) : null,
    fx_currency: (item.fx_currency as string | null) ?? null,
    fx_rate: item.fx_rate != null ? Number(item.fx_rate) : null,
  }
}

const WEEKDAY_FULL = [
  'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag',
]
const NL_WEEKDAY_ABBR = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'] // index = Date.getDay()
const NL_MONTH_ABBR = [
  'jan', 'feb', 'mrt', 'apr', 'mei', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'dec',
]

/** Weekdag-index (0 = maandag … 6 = zondag) van een ISO-datum, lokaal geparsed. */
function weekdayIndex(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return (new Date(y, m - 1, d).getDay() + 6) % 7
}

/** "za 14 feb 2026" — titel voor de dagweergave. */
function formatDayTitle(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${NL_WEEKDAY_ABBR[new Date(y, m - 1, d).getDay()]} ${d} ${NL_MONTH_ABBR[m - 1]} ${y}`
}

export function TransactiesAnalyse() {
  const { perspective } = usePerspective()
  const searchParams = useSearchParams()
  const { mode } = useDisplayMode()
  const simple = mode === 'simple'

  // Deeplink vanaf de geldstroom-banner (/overzicht/cashflow) opent een
  // specifieke kalendermaand via `?maand=YYYY-MM` → periode 'month' + de offset
  // (aantal maanden) t.o.v. de huidige maand. Eénmalig bij mount uitgelezen;
  // daarna stuurt de periode-selector de state. Geen param → huidig gedrag (30d).
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKind>(() =>
    /^\d{4}-\d{2}$/.test(searchParams.get('maand') ?? '') ? 'month' : '30d',
  )
  const [selectedOffset, setSelectedOffset] = useState(() => {
    const maand = searchParams.get('maand')
    if (!maand || !/^\d{4}-\d{2}$/.test(maand)) return 0
    const [y, m] = maand.split('-').map(Number)
    if (!y || m < 1 || m > 12) return 0
    const now = new Date()
    return (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth())
  })

  // TXN-2: Eenvoudig kent alleen '30d' en 'year'. Een bewaarde keuze die daar
  // geen tab heeft (bv. 'month' uit Volledig of uit de `?maand=`-deeplink) valt
  // terug op '30d' — met offset 0, want de kalenderpositie van een maand zegt
  // niets over een rollend 30-dagen-venster. De KEUZE zelf blijft in state
  // staan, dus terugschakelen naar Volledig levert weer exact dat maandvenster.
  const period = resolvePeriodForMode(selectedPeriod, mode)
  const offset = period === selectedPeriod ? selectedOffset : 0

  const [rawTxns, setRawTxns] = useState<PerspectiveItem[]>([])
  // Rijen van het VASTE heatmap-venster. Bewust eigen state en géén afleiding
  // van `rawTxns`: de dekkingsvraag hoort bij het venster dat de rijen hééft
  // opgeleverd, niet bij het venster dat op dit moment wordt aangevraagd. Een
  // memo op het aangevraagde venster klapt om zodra de gebruiker navigeert,
  // terwijl `rawTxns` dan nog de vorige — mogelijk smallere — set bevat; de
  // heatmap zou de ontbrekende maanden als "niets uitgegeven" tonen.
  //
  // Beide schrijvers zetten daarom alléén een VOLLEDIGE heatmapset: het
  // hoofd-effect wanneer zijn eigen venster de heatmap omvatte, het
  // heatmap-effect met zijn eigen fetch. Tussendoor blijft de laatst bekende
  // volledige set staan — en die blijft geldig, want het heatmap-venster ligt
  // vast voor de levensduur van het component.
  const [heatmapRows, setHeatmapRows] = useState<PerspectiveItem[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [accountMap, setAccountMap] = useState<Map<string, string>>(new Map())
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  // Deeplink `?rekening=<id>` — gebruikt door de archief-regel op
  // /overzicht/cashflow, die anders naar niets kon wijzen. Zelfde vorm als de
  // `?maand=`-deeplink hierboven: eenmalig bij mount, daarna stuurt de
  // chip-rij de state. Géén validatie op bestaan: is het id onzin, dan filtert
  // de tijdlijn op nul rijen en zet de gebruiker 'm met één klik terug op
  // "Alle rekeningen" — een fout-scherm is hier zwaarder dan het probleem.
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    () => searchParams.get('rekening') || null,
  )
  const [loading, setLoading] = useState(true)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [editTx, setEditTx] = useState<FullTransaction | null>(null)
  // Toevoeg-modus: dezelfde TransactionForm zónder `transaction`-prop. De form
  // vereist een `accountId`; bij >1 rekening kiezen we die eerst in een
  // BottomSheet, bij precies 1 rekening openen we de form direct.
  const [addAccountId, setAddAccountId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  // "…"-menu met de beheer-acties; bestaat alleen in Eenvoudig (TXN-1).
  const [moreOpen, setMoreOpen] = useState(false)
  const [drillCp, setDrillCp] = useState<{ name: string; iban: string | null } | null>(null)
  const [listDetail, setListDetail] = useState<
    { kind: 'day'; date: string } | { kind: 'weekday'; index: number } | null
  >(null)
  const [reloadKey, setReloadKey] = useState(0)

  // Venster voor de gekozen periode + kalender-offset.
  const periodWindow = useMemo(() => resolvePeriodWindow(period, offset, new Date()), [period, offset])
  // Vast heatmap-venster: 12 maanden t/m vorige maand (los van de periode-keuze).
  const heatmapWindow = useMemo(() => resolveHeatmapWindow(new Date()), [])

  // Eén perspectief-correct venster: 12 maanden vóór de periode t/m het
  // periode-einde. Dekt de huidige periode (gauge/feed), de vorige periode
  // (trend) én de prior-historie (nieuwe-tegenpartij-detectie) in één keer,
  // zónder een losse RLS-query die het perspectief zou omzeilen.
  const fetchWindow = useMemo(() => resolveFetchWindow(periodWindow), [periodWindow])

  // Valt het hele heatmap-venster binnen dat ophaal-venster? Dan snijden we de
  // heatmap uit dezelfde ruwe set en blijft de tweede, vrijwel volledig
  // overlappende download achterwege. Alleen bij een ver terug-genavigeerde
  // periode (het heatmap-venster steekt er dan aan de recente kant bovenuit)
  // is een eigen fetch nog nodig.
  //
  // LET OP: dit gaat over het AANGEVRAAGDE venster — precies goed voor de vraag
  // "moet ik zo meteen zelf ophalen?", en precies verkeerd voor de vraag "mag ik
  // de rijen die ik nú in state heb uitsnijden?". Die tweede vraag wordt niet
  // hier maar in het laad-effect beantwoord, waar het venster en de rijen uit
  // dezelfde aanroep komen (zie `heatmapRows`).
  const heatmapCovered = useMemo(
    () => heatmapWindowCovered(fetchWindow, heatmapWindow),
    [fetchWindow, heatmapWindow],
  )

  // ── Data laden bij periode-/perspectief-wissel ──────────────────────────
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    async function load() {
      const supabase = createClient()
      try {
        const [txResult, budgetsResult, accountsResult, connectionsResult, ibanResult] = await Promise.all([
          loadPerspectiveTransactions(supabase, perspective, {
            since: fetchWindow.since,
            until: fetchWindow.until,
          }),
          supabase.from('budgets').select('*').order('sort_order', { ascending: true }),
          // Actieve rekeningen PLUS het archief. Het archief draagt bewust
          // `is_active = false` (ADR 0082) en viel daardoor uit deze lijst —
          // waarmee bewaarde boekingen nergens meer terug te vinden waren. Hij
          // hoort hier als filter thuis, maar niet in de kiezer waarmee je een
          // nieuwe transactie boekt; die scheiding maakt `bookableAccounts`.
          supabase
            .from('bank_accounts')
            .select('id, name, bank_name, sort_order, is_archive_bucket')
            .or('is_active.eq.true,is_archive_bucket.eq.true')
            .order('sort_order', { ascending: true }),
          supabase
            .from('bank_connection_accounts')
            .select('bank_account_id')
            .eq('is_active', true),
          // De IBAN dient hier één doel: de laatste vier tekens in de rekening-
          // kiezer. Plaintext `bank_accounts.iban` verdwijnt in Stage B en
          // ontsleutelen kan alleen server-side, dus dat gaat via deze route.
          //
          // Bewust de NIET-strikte variant én een eigen terugval: een ontbrekend
          // staartje is een schoonheidsfoutje, en dat mag de hele transactie-
          // analyse niet laten vallen. Precies het omgekeerde van de import- en
          // categorisatiepaden, waar dezelfde IBAN een match-identifier is en een
          // stille terugval de spaarquote zou vervuilen — vandaar twee varianten
          // in `lib/own-accounts-ibans.ts` in plaats van één compromis.
          fetchOwnAccountIbans().catch((err) => {
            console.warn('[transacties-analyse] IBAN-staartjes niet beschikbaar:', err)
            return { accounts: [], unreadable: 0 }
          }),
        ])
        if (cancelled) return

        const connRows = (connectionsResult.data ?? []) as Array<{ bank_account_id: string }>
        const connectedIds = new Set<string>(connRows.map((r) => r.bank_account_id))

        const accRows = (accountsResult.data ?? []) as Array<{
          id: string
          name: string
          bank_name: string | null
          sort_order: number | null
          is_archive_bucket: boolean | null
        }>
        const ibanFor = ibanById(ibanResult.accounts)
        const accMap = new Map<string, string>()
        const accList: AccountOption[] = []
        for (const a of accRows) {
          const isArchive = a.is_archive_bucket === true
          // Korte chip-naam. De DB-naam is "Archief — verwijderde rekeningen";
          // die past niet in een filterchip naast de rekeningnamen.
          const label = isArchive ? 'Archief' : a.name
          accMap.set(a.id, label)
          const iban = ibanFor.get(a.id) ?? null
          accList.push({
            id: a.id,
            name: label,
            bankName: isArchive ? null : (a.bank_name ?? null),
            ibanTail: isArchive ? null : (iban ? iban.replace(/\s/g, '').slice(-4) : null),
            connected: isArchive ? false : connectedIds.has(a.id),
            isArchive,
          })
        }

        setRawTxns(txResult.transactions)
        // Omvatte HET VENSTER VAN DEZE AANROEP de heatmap? Dan is de heatmap een
        // deelverzameling van wat we net binnenkregen en snijden we 'm er hier
        // uit — met de vensterregel van de loader zelf, dus gegarandeerd
        // dezelfde rijen als een eigen fetch. Omvatte het venster de heatmap
        // niet, dan raken we `heatmapRows` niet aan: dan heeft het effect
        // hieronder een eigen, volledige set opgehaald (of doet dat nog).
        if (heatmapCovered) {
          setHeatmapRows(
            windowPerspectiveItems(txResult.transactions, {
              since: heatmapWindow.start,
              until: heatmapWindow.end,
            }),
          )
        }
        setBudgets((budgetsResult.data ?? []) as Budget[])
        setAccountMap(accMap)
        setAccounts(accList)
        setHasLoadedOnce(true)
      } catch {
        if (!cancelled) setError('Kon transacties niet laden. Probeer het opnieuw.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [perspective, fetchWindow, heatmapCovered, heatmapWindow.start, heatmapWindow.end, reloadKey])

  // ── Heatmap-data: vast 12-maands-venster, los van de periode-keuze ────────
  // Alleen nodig wanneer het ophaal-venster hierboven het heatmap-venster niet
  // dekt; anders levert het laad-effect de heatmap uit dezelfde ruwe set.
  useEffect(() => {
    if (heatmapCovered) return
    let cancelled = false
    async function loadHeatmap() {
      const supabase = createClient()
      try {
        const res = await loadPerspectiveTransactions(supabase, perspective, {
          since: heatmapWindow.start,
          until: heatmapWindow.end,
        })
        if (cancelled) return
        setHeatmapRows(res.transactions)
      } catch {
        if (!cancelled) setHeatmapRows([])
      }
    }
    loadHeatmap()
    return () => {
      cancelled = true
    }
  }, [perspective, heatmapCovered, heatmapWindow.start, heatmapWindow.end, reloadKey])

  // ── Afgeleide data ──────────────────────────────────────────────────────
  const budgetMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const b of budgets) m.set(b.id, b.name)
    return m
  }, [budgets])

  const budgetGroups = useMemo<BudgetGroup[]>(() => {
    const parents = budgets.filter((b) => !b.parent_id && b.budget_type !== 'archive')
    const children = budgets.filter((b) => b.parent_id && b.budget_type !== 'archive')
    return parents.map((parent) => ({
      parent,
      children: children.filter((c) => c.parent_id === parent.id),
    }))
  }, [budgets])

  const allMapped = useMemo(
    () =>
      rawTxns
        .map((t) => mapRow(t, perspective, budgetMap, accountMap))
        .filter((t): t is AnalysisTransaction => t !== null),
    [rawTxns, perspective, budgetMap, accountMap],
  )

  // Heatmap-transacties (vast 12-maands-venster), met budget-/rekening-namen
  // zodra die geladen zijn — voedt zowel de heatmap-visualisatie als de
  // dagweergave bij een klik op een cel.
  const heatmapTxns = useMemo(
    () =>
      heatmapRows
        .map((t) => mapRow(t, perspective, budgetMap, accountMap))
        .filter((t): t is AnalysisTransaction => t !== null),
    [heatmapRows, perspective, budgetMap, accountMap],
  )

  // Tegenpartijen die vóór de periode al voorkwamen (zelfde perspectief-lens) —
  // voor "nieuwe tegenpartijen". Afgeleid uit hetzelfde gevenster i.p.v. een
  // losse RLS-query die het perspectief zou omzeilen.
  const priorKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const t of allMapped) {
      if (t.date < periodWindow.since) {
        const k = counterpartyKey(t.counterparty_name, t.counterparty_iban)
        if (k !== '__unknown__') keys.add(k)
      }
    }
    return keys
  }, [allMapped, periodWindow.since])

  // Deelt de partner enkel totalen (privacy='totals')? Dan levert de RPC één
  // aggregaatrij zonder regel-detail én zonder periode-window — die kunnen we
  // niet eerlijk in dit periodeoverzicht verrekenen. We melden het i.p.v. de
  // huishoud-cijfers stilzwijgend te onderrapporteren.
  const hasPartnerTotals = useMemo(
    () => perspective === 'household' && rawTxns.some((t) => t._aggregated === true),
    [perspective, rawTxns],
  )

  const currentTxns = useMemo(
    () => allMapped.filter((t) => t.date >= periodWindow.since && t.date <= periodWindow.until),
    [allMapped, periodWindow.since, periodWindow.until],
  )
  const prevTxns = useMemo(
    () => allMapped.filter((t) => t.date >= periodWindow.prevSince && t.date <= periodWindow.prevUntil),
    [allMapped, periodWindow.prevSince, periodWindow.prevUntil],
  )

  const currentSummary = useMemo(() => summarizeFlow(currentTxns), [currentTxns])
  const prevSummary = useMemo(() => summarizeFlow(prevTxns), [prevTxns])
  const newCps = useMemo(() => newCounterparties(currentTxns, priorKeys), [currentTxns, priorKeys])

  // Lengte van de gekozen periode in dagen (lokaal geparsed) — voedt de
  // vrijheidsdag-omrekening in de tijdlijn (gem. dag-uitgave over het venster).
  const periodDays = useMemo(() => {
    const [ys, ms, ds] = periodWindow.since.split('-').map(Number)
    const [yu, mu, du] = periodWindow.until.split('-').map(Number)
    const a = new Date(ys, ms - 1, ds).getTime()
    const b = new Date(yu, mu - 1, du).getTime()
    return Math.max(1, Math.round((b - a) / 86400000) + 1)
  }, [periodWindow.since, periodWindow.until])

  // Rekening-filter voor de tijdlijn (null = alle rekeningen).
  const accountFiltered = useMemo(
    () => (selectedAccountId ? currentTxns.filter((t) => t.account_id === selectedAccountId) : currentTxns),
    [currentTxns, selectedAccountId],
  )

  // Detail-selectie: dag (uit de heatmap) of weekdag (uit het weekdag-patroon).
  // Als filter bewaard (niet als snapshot) zodat de lijst meeschuift na een
  // bewerking/herlaad.
  const detailTxns = useMemo(() => {
    if (!listDetail) return []
    if (listDetail.kind === 'day') return heatmapTxns.filter((t) => t.date === listDetail.date)
    return currentTxns.filter((t) => weekdayIndex(t.date) === listDetail.index)
  }, [listDetail, heatmapTxns, currentTxns])

  const detailTitle = !listDetail
    ? ''
    : listDetail.kind === 'day'
      ? formatDayTitle(listDetail.date)
      : `${WEEKDAY_FULL[listDetail.index]} · ${periodWindow.label}`

  // ── Handlers ─────────────────────────────────────────────────────────────
  const onPeriodChange = useCallback((p: PeriodKind) => {
    setSelectedPeriod(p)
    setSelectedOffset(0)
  }, [])
  const onOffsetChange = useCallback((delta: number) => {
    setSelectedOffset((o) => Math.min(0, o + delta))
  }, [])

  const openEdit = useCallback(async (tx: AnalysisTransaction) => {
    const supabase = createClient()
    const { data } = await supabase
      .from('transactions')
      .select(
        'id, account_id, budget_id, date, amount, description, counterparty_name, counterparty_iban, is_income, notes, category_source, is_split, ownership',
      )
      .eq('id', tx.id)
      .single()
    if (data) setEditTx(data as FullTransaction)
  }, [])

  const refetch = useCallback(() => {
    setEditTx(null)
    setAddAccountId(null)
    setPickerOpen(false)
    setReloadKey((k) => k + 1) // her-trigger het laad-effect
  }, [])

  /**
   * De rekeningen waarop je écht kunt boeken — `accounts` minus het archief.
   *
   * Het archief staat bewust wél in `accounts` (anders is er geen filter en
   * geen naam bij een bewaarde boeking), maar een nieuwe transactie erop
   * boeken mag niet: het is een verzamelplek voor het verleden, hij is
   * `is_active = false` en zou daarna nergens meer opduiken.
   */
  const bookableAccounts = useMemo(() => accounts.filter((a) => !a.isArchive), [accounts])

  // "Nieuwe transactie": 1 rekening → direct openen; >1 → eerst kiezen.
  const openAdd = useCallback(() => {
    if (bookableAccounts.length === 1) {
      setAddAccountId(bookableAccounts[0].id)
    } else if (bookableAccounts.length > 1) {
      setPickerOpen(true)
    }
  }, [bookableAccounts])

  const initialLoading = loading && !hasLoadedOnce

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Actie-rij: transactie toevoegen + importeren + bank koppelen.
          Spiegelt de "Snelle acties" van de cashflow-pagina (De Kern → kern-*).

          TXN-1 — in EENVOUDIG staat hier één primaire knop; importeren en bank
          koppelen zijn beheer-acties die je zelden doet en verhuizen naar het
          "…"-menu. Ze verdwijnen dus niet, ze staan één klik verderop (zelfde
          gedachte als de kassabon-deep-dives). In VOLLEDIG staan alle drie de
          knoppen ongewijzigd naast elkaar. */}
      <div className={`flex flex-wrap items-center gap-2${error ? ' opacity-60 pointer-events-none' : ''}`}>
        {bookableAccounts.length > 0 && (
          <button
            onClick={openAdd}
            className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--r)] bg-kern-600 px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-kern-700"
          >
            <Plus className="h-4 w-4" />
            Nieuwe transactie
          </button>
        )}
        <HideInSimple>
          <Link
            href="/core/cash/import"
            className="inline-flex items-center gap-2 rounded-[var(--r)] border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
          >
            <Upload className="h-4 w-4" />
            Importeer transacties
          </Link>
          <Link
            href="/core/cash/connect"
            className="inline-flex items-center gap-2 rounded-[var(--r)] border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
          >
            <Link2 className="h-4 w-4" />
            Bank koppelen
          </Link>
        </HideInSimple>
        {simple && (
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-label="Meer acties"
            title="Meer acties"
            className="inline-flex cursor-pointer items-center justify-center rounded-[var(--r)] border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] transition-colors duration-150 hover:bg-[var(--subtle)]"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      <Card>
        <PeriodeSelector
          period={period}
          offset={offset}
          label={periodWindow.label}
          canGoForward={offset < 0}
          onPeriodChange={onPeriodChange}
          onOffsetChange={onOffsetChange}
        />
      </Card>

      {error ? (
        <Card>
          <p className="text-sm text-red-700">{error}</p>
        </Card>
      ) : initialLoading ? (
        <Card>
          <div className="flex items-center justify-center py-16">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--ink-3)] border-t-transparent" />
          </div>
        </Card>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-1 [&:only-child]:lg:col-span-3">
              {hasPartnerTotals && (
                <p className="mb-3 border-l-2 border-[var(--border-md)] pl-3 text-xs italic text-[var(--ink-3)]">
                  Je partner deelt alleen totalen. Diens persoonlijke transacties tellen niet mee in
                  dit periodeoverzicht.
                </p>
              )}
              <GeldstroomGauge summary={currentSummary} />
              {currentSummary.income === 0 && currentSummary.expense === 0 && (
                <p className="text-sm text-[var(--ink-3)]">Geen transacties in deze periode.</p>
              )}
            </Card>
            <HideInSimple>
              <Card className="lg:col-span-2">
                <UitgavenHeatmap
                  transactions={heatmapTxns}
                  start={heatmapWindow.start}
                  end={heatmapWindow.end}
                  onSelectDay={(date) => setListDetail({ kind: 'day', date })}
                />
              </Card>
            </HideInSimple>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <HideInSimple>
              <Card>
                <PeriodeTrend current={currentSummary} previous={prevSummary} />
              </Card>
            </HideInSimple>
            <HideInSimple>
              <Card>
                <WeekdagPatroon
                  transactions={currentTxns}
                  onSelectWeekday={(index) => setListDetail({ kind: 'weekday', index })}
                />
              </Card>
            </HideInSimple>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <HideInSimple>
              <Card>
                <TopTegenpartijen transactions={currentTxns} onSelect={setDrillCp} />
              </Card>
            </HideInSimple>
            <HideInSimple>
              <Card>
                <GrootsteUitgaven transactions={currentTxns} onSelect={openEdit} />
              </Card>
            </HideInSimple>
          </div>

          <HideInSimple>
            <Card>
              <NieuweTegenpartijen items={newCps} onSelect={setDrillCp} />
            </Card>
          </HideInSimple>

          <TransactieTijdlijn
            transactions={accountFiltered}
            windowDays={periodDays}
            accounts={accounts}
            selectedAccountId={selectedAccountId}
            onSelectAccount={setSelectedAccountId}
            onSelect={openEdit}
          />

          <p className="text-[11px] italic text-[var(--ink-3)]">
            Op zoek naar de vooruitblik?{' '}
            <Link
              href="/overzicht/cashflow/forecast"
              className="inline-flex items-center gap-0.5 not-italic font-medium text-[var(--ink-2)] underline hover:text-[var(--ink)]"
            >
              Cashflow-prognose <ArrowRight className="h-3 w-3" />
            </Link>
          </p>
        </>
      )}

      {/* Bewerk-paneel (eigen bottom-sheet in TransactionForm) */}
      {editTx && (
        <TransactionForm
          transaction={editTx}
          accountId={editTx.account_id ?? ''}
          budgetGroups={budgetGroups}
          onClose={() => setEditTx(null)}
          onSaved={refetch}
        />
      )}

      {/* Toevoeg-paneel: dezelfde TransactionForm, zónder `transaction`-prop. */}
      {addAccountId && (
        <TransactionForm
          accountId={addAccountId}
          budgetGroups={budgetGroups}
          onClose={() => setAddAccountId(null)}
          onSaved={refetch}
        />
      )}

      {/* Rekening-kiezer (alleen bij >1 rekening) vóór een nieuwe transactie. */}
      {pickerOpen && (
        <BottomSheet open onClose={() => setPickerOpen(false)} title="Kies een rekening" size="md">
          <div className="space-y-2 py-1">
            {bookableAccounts.map((a) => (
              <button
                key={a.id}
                onClick={() => {
                  setPickerOpen(false)
                  setAddAccountId(a.id)
                }}
                aria-label={`Kies rekening: ${a.name}${a.ibanTail ? ` (••${a.ibanTail})` : ''}`}
                className="flex w-full items-center justify-between gap-3 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 text-left transition-colors duration-150 hover:bg-[var(--subtle)]"
              >
                <span className="text-sm font-medium text-[var(--ink)]">{a.name}</span>
                <div className="flex items-center gap-2">
                  {(a.bankName || a.ibanTail) && (
                    <span className="text-xs text-[var(--ink-3)]">
                      {a.bankName}
                      {a.bankName && a.ibanTail ? ' · ' : ''}
                      {a.ibanTail ? `••${a.ibanTail}` : ''}
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 shrink-0 text-[var(--ink-4)]" />
                </div>
              </button>
            ))}
          </div>
        </BottomSheet>
      )}

      {/* "…"-menu (alleen Eenvoudig): de beheer-acties uit de actie-rij.
          Via ShellOverlay — één overlay-systeem (ADR 0039), dus geen
          hand-rolled dropdown en geen eigen z-index. `simple &&` in de
          open-conditie zodat een modus-wissel het menu meteen opruimt. */}
      <ShellOverlay
        open={simple && moreOpen}
        onClose={() => setMoreOpen(false)}
        kind="sheet"
        size="sm"
        title="Meer acties"
      >
        <div className="space-y-2 p-5">
          <Link
            href="/core/cash/import"
            onClick={() => setMoreOpen(false)}
            className="flex w-full items-center gap-3 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 text-sm font-medium text-[var(--ink)] transition-colors duration-150 hover:bg-[var(--subtle)]"
          >
            <Upload className="h-4 w-4 shrink-0 text-[var(--ink-3)]" aria-hidden />
            Importeer transacties
          </Link>
          <Link
            href="/core/cash/connect"
            onClick={() => setMoreOpen(false)}
            className="flex w-full items-center gap-3 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 text-sm font-medium text-[var(--ink)] transition-colors duration-150 hover:bg-[var(--subtle)]"
          >
            <Link2 className="h-4 w-4 shrink-0 text-[var(--ink-3)]" aria-hidden />
            Bank koppelen
          </Link>
        </div>
      </ShellOverlay>

      {/* Tegenpartij-analyse */}
      {drillCp && (
        <BottomSheet open onClose={() => setDrillCp(null)} title={drillCp.name} size="lg">
          <CounterpartyAnalysisPanel
            counterpartyName={drillCp.name}
            counterpartyIban={drillCp.iban}
            budgetGroups={budgetGroups}
            onBack={() => setDrillCp(null)}
          />
        </BottomSheet>
      )}

      {/* Dag- / weekdag-weergave (heatmap-cel of weekdag-staaf) */}
      {listDetail && (
        <BottomSheet open onClose={() => setListDetail(null)} title={detailTitle} size="lg">
          <TransactieDetailSheet
            transactions={detailTxns}
            showDate={listDetail.kind === 'weekday'}
            onSelectTx={openEdit}
          />
        </BottomSheet>
      )}
    </div>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6 ${className}`}
    >
      {children}
    </section>
  )
}
