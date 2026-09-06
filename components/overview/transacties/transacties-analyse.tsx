'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowRight, Plus, Upload, Link2, ChevronRight, MoreHorizontal, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { usePerspective } from '@/components/app/perspective-provider'
import {
  resolvePeriodWindow,
  resolveHeatmapWindow,
  resolveFetchWindow,
  heatmapWindowCovered,
  summarizeFlow,
  describeFlow,
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
import { GeldstroomGauge, GeldstroomZin } from './geldstroom-gauge'
import { GeldstroomKassabonnen, type KassabonKind } from './geldstroom-kassabonnen'
import { GeldstroomDaggrafiek } from './geldstroom-daggrafiek'
import { TopTegenpartijen } from './top-tegenpartijen'
import { GrootsteUitgaven } from './grootste-uitgaven'
import { NieuweTegenpartijen } from './nieuwe-tegenpartijen'
import { WeekdagPatroon } from './weekdag-patroon'
import { PeriodeTrend } from './periode-trend'
import { UitgavenHeatmap } from './uitgaven-heatmap'
import { TransactieDetailSheet } from './transactie-detail-sheet'
import { BulkBewerkenOverlay } from './bulk/bulk-bewerken-overlay'
import { TeBesprekenSection } from './te-bespreken-section'
import { BespreekMetPartnerKnop } from './bespreek-met-partner-knop'
import type { TransactionFlagsData } from '@/lib/household/transaction-flags'

/**
 * TransactiesAnalyse — periode-gestuurde transactie-analyse op
 * /overzicht/budget/transacties.
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
  /** Verschuivings-markering; het bewerkformulier moet weten of hij al gezet is. */
  transaction_type: string | null
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

export function TransactiesAnalyse({
  naGeldstroom,
  teBespreken = null,
  vulIngangenInBanner = false,
}: {
  /**
   * Server-gerenderde sectie die direct ónder de geldstroom-/spaarquote-kaart
   * hoort (de grenzenpotten). Als slot doorgegeven omdat die sectie server-side
   * geladen wordt (ADR 0058) terwijl deze analyse een client-component is; de
   * plek in de leesvolgorde hoort bij de analyse, niet bij de page-wrapper.
   */
  naGeldstroom?: React.ReactNode
  /**
   * "Te bespreken"-lijst van het huishouden (ADR 0128), server-geladen via
   * `loadTransactionFlags`. `null` = solo of geen partner → de sectie én de
   * markeer-knop in het bewerkformulier verschijnen niet. Als DATA doorgegeven
   * (niet als slot) omdat een rij in de lijst het bewerkformulier van déze
   * component moet kunnen openen.
   */
  teBespreken?: TransactionFlagsData | null
  /**
   * Staat de `KoppelRekeningBanner` bovenaan de pagina (= nul rekeningen)? Dan
   * laat de actie-rij "Importeer transacties" en "Bank koppelen" wég: die
   * banner biedt beide al, uitgebreider, twee blokken hoger.
   *
   * Dat is geen nieuwe keuze maar de bestaande. De banner dekt bewust ALLEEN de
   * zuivere 0-rekeningen-stand en verdwijnt zodra er één rekening is; de
   * actie-rij bestaat voor het vervolg-vullen dáárna (M40). Dat die twee elkaar
   * bij nul rekeningen overlapten was een omissie, geen ontwerp.
   */
  vulIngangenInBanner?: boolean
} = {}) {
  const { perspective } = usePerspective()
  const searchParams = useSearchParams()
  const { mode } = useDisplayMode()
  const simple = mode === 'simple'

  // Deeplink vanaf de geldstroom-banner (/overzicht/budget) opent een
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

  // TXN-2: Eenvoudig kent '30d', 'month' en 'year' — alleen 'quarter' is daar
  // diepte. Een bewaarde keuze die geen tab heeft (dus 'quarter' uit Volledig)
  // valt terug op '30d' — met offset 0, want de kalenderpositie van een
  // kwartaal zegt niets over een rollend 30-dagen-venster. De KEUZE zelf blijft
  // in state staan, dus terugschakelen naar Volledig levert weer exact dat
  // kwartaalvenster. De `?maand=`-deeplink werkt sinds Maand terugkeerde in
  // beide modi.
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
  // /overzicht/budget, die anders naar niets kon wijzen. Zelfde vorm als de
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
  // Bulkbewerk-overlay: zoeken over de VOLLEDIGE historie + meervoudige acties.
  // Bewust conditioneel gemount (net als het bewerkformulier hierboven), zodat
  // criterium, selectie en resultaat bij heropenen vers beginnen — een
  // achtergebleven selectie op een gesloten scherm is precies de situatie waarin
  // je straks een actie uitvoert op rijen die je niet meer voor je hebt.
  const [bulkOpen, setBulkOpen] = useState(false)
  const [drillCp, setDrillCp] = useState<{ name: string; iban: string | null } | null>(null)
  // Welke kassabon staat open (UR3-28 fase 2b): de opsomming achter het
  // Inkomen- of Uitgaven-getal van de geldstroom-kaart. `null` = geen.
  const [kassabon, setKassabon] = useState<KassabonKind | null>(null)
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
    const groups = parents.map((parent) => ({
      parent,
      children: children.filter((c) => c.parent_id === parent.id),
    }))

    // De archive-emmer "Eigen rekening" hoort er WÉL bij: zonder deze groep is
    // een onderlinge overboeking niet als zodanig te boeken in het
    // bewerkformulier, en blijft een verschuiving als echte uitgave meetellen.
    // `buildBudgetSelectEntries` toont hem als platte, direct kiesbare optie.
    // Spiegelt cash-account-view.tsx.
    const archiveParents = budgets.filter((b) => !b.parent_id && b.budget_type === 'archive')
    const archiveChildren = budgets.filter((b) => b.parent_id && b.budget_type === 'archive')
    const archiveGroups = archiveParents.map((parent) => ({
      parent,
      children: archiveChildren.filter((c) => c.parent_id === parent.id),
    }))

    return [...groups, ...archiveGroups]
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
  // Alles vóór de periode — de 12 maanden historie die `resolveFetchWindow`
  // sowieso al ophaalt. Voedt het historische dagpatroon onder de forecast-curve
  // van de daggrafiek; géén extra query, en dezelfde perspectief-lens als de
  // rest van de pagina.
  const priorTxns = useMemo(
    () => allMapped.filter((t) => t.date < periodWindow.since),
    [allMapped, periodWindow.since],
  )

  const currentSummary = useMemo(() => summarizeFlow(currentTxns), [currentTxns])
  const prevSummary = useMemo(() => summarizeFlow(prevTxns), [prevTxns])
  const newCps = useMemo(() => newCounterparties(currentTxns, priorKeys), [currentTxns, priorKeys])

  // S3 — dezelfde geldstroom, in woorden. Tweede LEZING van `currentSummary`/
  // `prevSummary`, geen tweede berekening: `describeFlow` kiest alleen welke
  // formulering past bij het venster. Voedt de zin in Eenvoudig én het
  // venster-onderschrift onder de meter in Volledig.
  const flowDescription = useMemo(
    () => describeFlow(currentSummary, prevSummary, period, offset, periodWindow, new Date()),
    [currentSummary, prevSummary, period, offset, periodWindow],
  )

  // (Tot M22 stond hier `periodDays`: de lengte van de gekozen periode, enkel om
  // de tijdlijn een vensterafhankelijk dagtarief te laten maken. De tijdlijn leest
  // nu het canonieke dagtarief uit de gedeelde bron, dus die periodelengte heeft
  // geen consument meer — de PeriodeSelector blijft alleen bepalen WELKE
  // transacties je ziet, niet wat een dag vrijheid kost.)

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

  /**
   * Eén transactie in het bewerkformulier openen op id. Bestond eerder alleen
   * als `openEdit(tx)`; de bulkbewerk-overlay kent alleen het id van een rij,
   * dus de query staat nu hier en `openEdit` is de dunne schil eromheen. Zelfde
   * query, zelfde bestand — geen tweede client-lezer erbij.
   */
  const openEditById = useCallback(async (id: string) => {
    const supabase = createClient()
    const { data } = await supabase
      .from('transactions')
      .select(
        'id, account_id, budget_id, date, amount, description, counterparty_name, counterparty_iban, is_income, notes, category_source, is_split, ownership, transaction_type',
      )
      .eq('id', id)
      .single()
    if (data) setEditTx(data as FullTransaction)
  }, [])

  const openEdit = useCallback(
    (tx: AnalysisTransaction) => {
      void openEditById(tx.id)
    },
    [openEditById],
  )

  /**
   * Rij openen vanuit de bulkoverlay: eerst de overlay sluiten. Twee overlays
   * met een eigen focus-trap tegelijk open is geen navigatie maar een val — en
   * "één rij bewerken" is bovendien een stap wég van de bulkbedoeling.
   */
  const openRowFromBulk = useCallback(
    (id: string) => {
      setBulkOpen(false)
      void openEditById(id)
    },
    [openEditById],
  )

  // De "te bespreken"-lijst hoort in de leesvolgorde direct achter de
  // grenzenpotten: eerst je grenzen, dan wat jullie samen nog moeten bekijken.
  const naGeldstroomMetLijst = (
    <>
      {naGeldstroom}
      {teBespreken && (
        <TeBesprekenSection data={teBespreken} onOpenTransaction={openEditById} />
      )}
    </>
  )

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

          TXN-1 (herzien, M40 · 28 aug 2026) — in EENVOUDIG staan de drie
          vúl-routes in de rij: "Nieuwe transactie", "Importeer transacties" en
          "Bank koppelen". Achter het "…"-menu staat alleen "Zoeken en
          bulkbewerken".

          De oorspronkelijke TXN-1 (9 aug 2026) deed het omgekeerd, vanuit de
          gedachte dat importeren en bank koppelen beheer-acties zijn "die je
          zelden doet". M40 weerlegt dat voor precies de groep die per default in
          Eenvoudig staat: een beginner moet de app nog vúllen, en dat gaat via
          import en koppeling. De KoppelRekeningBanner dekt alleen de zuivere
          0-rekeningen-stand; zodra er één rekening is verdwijnt hij, en juist
          dan begint het vervolg-vullen (tweede bank, tweede CSV-batch, jaren
          historie). Zoeken en bulkbewerken is daarentegen expertgereedschap dat
          pas nut heeft als er al véél data is — dát hoort achter het menu.

          In VOLLEDIG staan alle vier de knoppen ongewijzigd naast elkaar. */}
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
          {/* Expliciete ingang naar het zoeken over de VOLLEDIGE historie (F1).
              Het inline-zoekveld in de tijdlijn hieronder blijft ongewijzigd op
              het zichtbare venster werken — dit is een ingang erbij, geen
              vervanging. In Eenvoudig staat dezelfde ingang in het "…"-menu. */}
          <button
            type="button"
            onClick={() => setBulkOpen(true)}
            className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--r)] border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] transition-colors duration-150 hover:bg-[var(--subtle)]"
          >
            <Search className="h-4 w-4" aria-hidden />
            Zoeken en bulkbewerken
          </button>
        </HideInSimple>
        {/* Vul-routes: in BEIDE modi in de rij (M40). De import zelf verandert
            niet — dit is puur de vindbaarheid van de ingang. Ze wijken alleen
            wanneer de koppel-banner er staat, want die biedt ze dan al. */}
        {!vulIngangenInBanner && (
          <>
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
          </>
        )}
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

      {/* De grenzenpotten hangen niet aan de transactie-fetch (server-props), dus
          ze blijven ook in de fout- en laadstand staan — op dezelfde plek in de
          leesvolgorde als in de geladen stand: direct onder de geldstroom. */}
      {error ? (
        <>
          <Card>
            <p className="text-sm text-red-700">{error}</p>
          </Card>
          {naGeldstroomMetLijst}
        </>
      ) : initialLoading ? (
        <>
          <Card>
            <div className="flex items-center justify-center py-16">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--ink-3)] border-t-transparent" />
            </div>
          </Card>
          {naGeldstroomMetLijst}
        </>
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
              {/* S3 — WAT DUIDT ER IN EENVOUDIG?
                  Zodra de zes analyseblokken hieronder wegvallen, is de meter het
                  enige duidingselement dat overblijft: een naald op een
                  −100…+100-schaal, zonder trend of vergelijking eromheen die 'm
                  leesbaar maakt. In Eenvoudig staat daar daarom een zin (die
                  bovendien zijn venster benoemt); in Volledig blijft de meter
                  precies zoals hij was, met het venster-label als onderschrift.

                  De gating staat HIER en niet in `GeldstroomGauge` zelf, zodat de
                  meter presentational blijft — zelfde keuze als CF-3 op de
                  cashflow-hub. `summarizeFlow` is bewust NIET aangeraakt: het
                  ongeclampte leescijfer en de 0%-bij-geen-inkomen zijn C6-terrein
                  en moeten in Volledig reproduceerbaar blijven. */}
              {/* De Inkomen-/Uitgaven-cel van de strip is in BEIDE modi de
                  ingang naar zijn kassabon (UR3-28 fase 2b). De cijfers stonden
                  er al; wat de hub uniek had was de doorklik. */}
              {simple ? (
                <GeldstroomZin
                  description={flowDescription}
                  summary={currentSummary}
                  onOpenIncome={() => setKassabon('income')}
                  onOpenExpense={() => setKassabon('expense')}
                />
              ) : (
                <GeldstroomGauge
                  summary={currentSummary}
                  windowLabel={flowDescription.windowLabel}
                  onOpenIncome={() => setKassabon('income')}
                  onOpenExpense={() => setKassabon('expense')}
                />
              )}
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

          {naGeldstroomMetLijst}

          {/* Geldstroom per dag — UITSLUITEND in de maand-stand. De grafiek is
              maand-vormig (dag-van-de-maand op de x-as, "vandaag"-marker,
              forecast tot het maandeinde); een rollend 30-dagen-venster, een
              kwartaal of een jaar heeft geen van die ankers. Voor die perioden
              dekken de heatmap en het weekdag-patroon dezelfde textuur.
              In Eenvoudig verborgen, net als op de hub. */}
          {period === 'month' && (
            <HideInSimple>
              <Card>
                <GeldstroomDaggrafiek
                  transactions={currentTxns}
                  priorTransactions={priorTxns}
                  budgets={budgets}
                  summary={currentSummary}
                  monthStart={periodWindow.since}
                  monthLabel={periodWindow.label}
                />
              </Card>
            </HideInSimple>
          )}

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
            accounts={accounts}
            selectedAccountId={selectedAccountId}
            onSelectAccount={setSelectedAccountId}
            onSelect={openEdit}
          />

          <p className="text-[11px] italic text-[var(--ink-3)]">
            Op zoek naar de vooruitblik?{' '}
            <Link
              href="/overzicht/budget/forecast"
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
          // Alleen bij een partner én een gedeelde boeking; of de rekening ook
          // op 'full' staat beslist de database (ADR 0128).
          secondaryAction={
            teBespreken && editTx.ownership === 'shared' ? (
              <BespreekMetPartnerKnop
                transactionId={editTx.id}
                partnerName={teBespreken.partnerName}
              />
            ) : undefined
          }
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

      {/* "…"-menu (alleen Eenvoudig): het expertgereedschap uit de actie-rij.
          Sinds M40 is dat alléén "Zoeken en bulkbewerken" — de vul-routes
          (importeren, bank koppelen) staan weer in de rij zelf.
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
          <button
            type="button"
            onClick={() => {
              setMoreOpen(false)
              setBulkOpen(true)
            }}
            className="flex w-full cursor-pointer items-center gap-3 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 text-left text-sm font-medium text-[var(--ink)] transition-colors duration-150 hover:bg-[var(--subtle)]"
          >
            <Search className="h-4 w-4 shrink-0 text-[var(--ink-3)]" aria-hidden />
            Zoeken en bulkbewerken
          </button>
          <p className="px-1 pt-1 text-xs text-[var(--ink-3)]">
            Zoek door je volledige historie en pas meerdere transacties tegelijk aan.
          </p>
        </div>
      </ShellOverlay>

      {/* Bulkbewerken: zoeken over de volledige historie + meervoudige acties.
          De overlay leest en muteert uitsluitend via /api/transactions/**
          (ADR 0058) en toont bewust alléén eigen transacties — schrijven op
          `transactions` is strikt eigen rijen, ook op een gedeelde rekening. */}
      {bulkOpen && (
        <BulkBewerkenOverlay
          open
          onClose={() => setBulkOpen(false)}
          budgetGroups={budgetGroups}
          budgetNameById={budgetMap}
          accounts={accounts}
          onOpenRow={openRowFromBulk}
          onMutated={refetch}
        />
      )}

      {/* Kassabonnen achter het Inkomen-/Uitgaven-getal van de geldstroom-kaart.
          Lezen dezelfde `currentTxns` + `budgets` + rekeningnamen die de pagina
          al in geheugen heeft — geen extra query, en dus per definitie hetzelfde
          venster als de PeriodeSelector. */}
      <GeldstroomKassabonnen
        open={kassabon}
        onClose={() => setKassabon(null)}
        transactions={currentTxns}
        budgets={budgets}
        accountMap={accountMap}
        summary={currentSummary}
        windowLabel={flowDescription.windowLabel}
      />

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
