'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import {
  ChevronLeft, ChevronRight, Wallet,
  Upload, Link2, ArrowRight, ExternalLink,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { type Account } from '@/components/app/account-form-modal'
import { fetchOwnAccountIbans, ibanById } from '@/lib/own-accounts-ibans'
import { formatCurrency as formatCurrencyShort } from '@/components/app/budget-shared'
import { FreedomTimeBadge } from '@/components/app/freedom-time-label'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { usePerspective } from '@/components/app/perspective-provider'
import { useToast } from '@/components/app/toast-provider'
import { HideInSimple } from '@/components/app/hide-in-simple'
import { EenvoudigPillList, type PillItem } from '@/components/overview/eenvoudig-pill-list'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'
import { Kicker } from '@/components/editorial'
import { MaskedAmount } from '@/components/app/masked-amount'
import { AssetPane } from '@/components/app/core/assets/asset-pane'
import { ValuationModal } from '@/components/core/assets-client'
import { QuickAddWizard } from '@/components/app/quick-add-wizard/quick-add-wizard'
import { VermogenAssetCard } from '@/components/core/vermogen-asset-card'
import { loadPerspectiveData } from '@/lib/household/perspective-loader'
import { loadEntitySparklines } from '@/lib/load-entity-sparklines'
import { localMonthBounds, localMonthStart } from '@/lib/month-range'
import { type Asset, ASSET_TYPE_COLORS } from '@/lib/asset-data'
import type { Provenance } from '@/lib/household-data'
import {
  bankLinkForAsset,
  bankLinkRowForAccount,
  bankLinkRowForAsset,
  type BankLinkState,
  type CashBankLink,
} from '@/lib/bank-connection-status'
import { detailBankAccountIdForAsset } from '@/lib/cash-detail-target'
import { startBankRelink } from '@/lib/truelayer/start-relink'

const DynCashAccountView = dynamic(
  () => import('@/components/app/cash-account-view').then(m => ({ default: m.CashAccountView })),
  { loading: () => <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-kern-500 border-t-transparent" /></div> },
)

type BudgetRow = {
  id: string
  name: string
  icon: string | null
  parent_id: string | null
  budget_type: string
  default_limit: number | null
}

type TxAgg = {
  amount: number
  account_id: string
  budget_id: string | null
  is_income: boolean
  transaction_type: string | null
  date: string
}

type BudgetExpense = {
  id: string
  name: string
  icon: string | null
  amount: number
  limit: number
}

// Cash-asset uit de perspectief-loader: het rauwe asset-object aangevuld met
// de herkomst-stempels (_provenance/_myShareFraction/_aggregated) die
// VermogenAssetCard nodig heeft om gedeelde/partner-rijen correct te tonen.
type StampedAsset = Asset & { _provenance?: Provenance; _myShareFraction?: number; _aggregated?: boolean }

/**
 * Stabiele default voor `bankLinks`. Een inline `[]` in de destructurering zou
 * elke render een nieuwe referentie zijn en de `useCallback`/`useMemo`-ketens
 * hieronder onnodig invalideren.
 */
const EMPTY_BANK_LINKS: CashBankLink[] = []

/**
 * Kolommen van `bank_accounts` die dit oppervlak leest. Expliciet, nooit
 * `select('*')`: die stuurde óók `iban_encrypted` en `iban_hash` naar de
 * browser. De ciphertext is zonder sleutel onschadelijk, maar de blind index is
 * een stabiele gelijkheids-identifier afgeleid van een server-only sleutel —
 * die hoort niet in browsercache, devtools of een error-reporter
 * (securityreview 30 juli). De leesbare IBAN komt uit `/api/own-accounts/ibans`.
 */
const BANK_ACCOUNT_COLUMNS =
  'id, name, bank_name, account_type, balance, is_active, sort_order, linked_asset_id, ownership'

/**
 * Dezelfde kolommen plus het ene veld dat de asset→rekening-map nodig heeft.
 * Alleen in de brede modus opgevraagd: daarbuiten heeft niemand de map, en dan
 * hoort de join er ook niet te zijn.
 */
const BANK_ACCOUNT_COLUMNS_WITH_TRACKING =
  `${BANK_ACCOUNT_COLUMNS}, linked_asset:assets!bank_accounts_linked_asset_id_fkey(has_budget_tracking)`

/** Rij zoals hij uit de gecombineerde leesronde komt. */
type BankAccountRow = Account & {
  linked_asset?: { has_budget_tracking?: boolean | null } | null
}

/**
 * asset.id → bank_account.id, maar alléén voor budget-getrackte rekeningen.
 * Bepaalt welke rekeningkaart de rekeningdetail opent i.p.v. het
 * bezittings-paneel. Draait op de ONGEFILTERDE set: een gedeelde
 * huishoudrekening kan als bezitting in het persoonlijke perspectief staan
 * terwijl zijn `bank_accounts`-rij daar niet in valt.
 */
export function budgetTrackedBankByAsset(
  rows: Pick<BankAccountRow, 'id' | 'linked_asset_id' | 'linked_asset'>[],
): Record<string, string> {
  const map: Record<string, string> = {}
  for (const b of rows) {
    if (!b.linked_asset_id) continue
    if (b.linked_asset?.has_budget_tracking === true) map[b.linked_asset_id] = b.id
  }
  return map
}

/**
 * Welke koppeltoestand krijgt déze rekeningkaart te zien?
 *
 * Twee keer `undefined` (= geen symbool), elk om een eigen reden:
 *  - een **aggregaatrij** (privacy='totalen', partner-totaal) is geen echte
 *    rekening en kan dus geen koppeling hebben;
 *  - een **handmatige** rekening is de normale toestand en verdient geen
 *    markering (besluit B4).
 *
 * Naar de kaart reizen dus alleen `linked` en `linked-broken`. Het component kan
 * `manual` wél renderen — de filterchips op Transacties doen dat, bestaand
 * gedrag — maar hier is dat bewust niet gewenst.
 */
function cashAssetBankLink(
  asset: StampedAsset,
  links: CashBankLink[],
): BankLinkState | undefined {
  if (asset._aggregated) return undefined
  const state = bankLinkForAsset(links, asset.id)
  return state === 'manual' ? undefined : state
}

export function CashOverview({
  embedded = false,
  onNavigateToAccount,
  hideAccountsSection = false,
  hideQuickActions = false,
  showAllCashAccounts = false,
  showMonthLinks = false,
  bankLinks = EMPTY_BANK_LINKS,
}: {
  embedded?: boolean
  onNavigateToAccount?: (accountId: string) => void
  hideAccountsSection?: boolean
  hideQuickActions?: boolean
  showAllCashAccounts?: boolean
  /** Toont in de geldstroom-banner twee deeplinks (Budget/Transacties) die de
   *  geselecteerde maand meenemen via `?maand=YYYY-MM`. Alleen aangezet op de
   *  cashflow-landing; de cash-categoriepagina blijft zonder deze links. */
  showMonthLinks?: boolean
  /**
   * De koppelstatus per bankrekening, uit `loadCashBankLinks()` op de
   * server-pagina (ADR 0058: weergavedata via de loader). Voedt zowel het
   * herkomst-symbool op de rekeningkaarten als de koppeltoestand die de
   * rekeningdetail (`CashAccountView`) leest — één bron, twee oppervlakken.
   *
   * Leeg = onbekend (host geeft niets mee, of de leesronde faalde). Dan
   * verdwijnt het symbool en verschijnt er géén onterecht "verbinding kwijt".
   */
  bankLinks?: CashBankLink[]
}) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [cashAssets, setCashAssets] = useState<StampedAsset[]>([])
  const [bankByAsset, setBankByAsset] = useState<Record<string, string>>({}) // asset.id -> bank_account.id (budget-tracked)
  // Per-asset waardeverloop (12 maandwaarden) voor de breuklijn-overlay op de
  // rekening-kaarten — zelfde bron als de bezittingen-pagina (`assets-client`),
  // zodat het silhouet op cashflow identiek is. Failure/lege map → vlakke
  // overlay (huidige gedrag), geen crash.
  const [cashSparklines, setCashSparklines] = useState<Record<string, number[]>>({})
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null)
  const [revalueAsset, setRevalueAsset] = useState<Asset | null>(null)
  // Handmatig een betaalrekening toevoegen vanaf de cashflow-pagina — opent de
  // bestaande QuickAddWizard voor-geselecteerd op asset_type='cash', zodat de
  // rekening als cash-bezitting wordt aangemaakt (zelfde pad als /core/assets).
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [budgets, setBudgets] = useState<BudgetRow[]>([])
  const [transactions, setTransactions] = useState<TxAgg[]>([])
  const [loading, setLoading] = useState(true)
  const [monthDate, setMonthDate] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  // Datum van de recentste transactie, perspectief-gescoped en los van de
  // geselecteerde maand. `undefined` = nog aan het laden, `null` = er is er
  // geen. Beantwoordt twee vragen die vroeger elk hun eigen query deden:
  //   • staat er in een ándere maand wél iets? (sprong naar de recentste maand)
  //   • was er de laatste 90 dagen enige activiteit? (lege-staat van het blok)
  // Eén `max(date)` volstaat voor allebei: bestaat er een rij op of ná de
  // 90-dagengrens, dan ligt de recentste rij daar per definitie ook op of ná.
  const [latestTxDate, setLatestTxDate] = useState<string | null | undefined>(undefined)

  // Kassabon state
  const [showIncomeReceipt, setShowIncomeReceipt] = useState(false)
  const [showExpenseReceipt, setShowExpenseReceipt] = useState(false)
  const [expenseReceiptBudgetId, setExpenseReceiptBudgetId] = useState<string | null>(null)

  // Nested account detail modal (only used in embedded mode)
  const [detailAccountId, setDetailAccountId] = useState<string | null>(null)

  // Capture-phase Escape handler: closes the nested detail modal
  // without also closing the parent FullScreenModal (which uses bubble phase)
  useEffect(() => {
    if (!detailAccountId) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        setDetailAccountId(null)
      }
    }
    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [detailAccountId])

  const { perspective } = usePerspective()
  const { addToast } = useToast()
  // Eenvoudig-modus: rekeningen als pills + geldstroom-sectie verbergen.
  const simple = useDisplayMode().mode === 'simple'

  // ── Herstelactie bij een kwijtgeraakte bankkoppeling (fase 7, B6) ──────────
  //
  // Start de herautorisatie meteen: één klik op de kaart, dan door naar de bank.
  // De POST, de foutcuratie en de NL-fallback wonen in
  // `lib/truelayer/start-relink.ts` — dezelfde functie die de herstelknop op de
  // rekeningdetail (`ConnectedAccountCard`) gebruikt. Eén implementatie, want twee
  // fetch-blokken met elk hun eigen foutafhandeling lopen binnen één release
  // uiteen; dat is dezelfde driftklasse als de twee koppelstatus-afleidingen die
  // deze fase opruimt.
  //
  // De client noemt alleen de KOPPELING; `auth-link` leidt de doelrekening, de
  // intentie (`link_intent = 'herautoriseren'`) én de bank er zelf uit af. Daarom
  // heeft deze kaart géén provider-kolom nodig en dus ook geen eigen leesronde —
  // precies het pad dat deze fase dichtzet.
  //
  // Eén stabiele `useCallback` voor álle kaarten: `VermogenAssetCard` is
  // `memo()`'d, dus een closure per kaart zou bij elke render van deze pagina de
  // hele rekeningenlijst opnieuw laten renderen.
  const handleReconnect = useCallback(
    async (asset: Asset) => {
      const link = bankLinkRowForAsset(bankLinks, asset.id)
      if (!link?.connectionAccountId) {
        // Onbereikbaar zolang de band alleen bij `linked-broken` rendert (die
        // toestand heeft per definitie een actieve koppelrij), maar een verouderde
        // bundel mag geen stille klik worden.
        console.error('Herkoppelen zonder bekende koppeling', { assetId: asset.id })
        addToast({
          type: 'error',
          title: 'Verbinden mislukt',
          message: 'Deze koppeling is even niet te lezen. Ververs de pagina en probeer het opnieuw.',
        })
        return
      }

      const result = await startBankRelink(link.connectionAccountId)
      if (!result.ok) {
        // De melding van de route is NL en bevat de uitweg (bv. "verbreek die
        // koppeling eerst bij de rekening"); die hoort de gebruiker te lezen.
        addToast({ type: 'error', title: 'Verbinden mislukt', message: result.message })
        return
      }

      // Volledige navigatie, geen router.push: we verlaten de app naar de bank.
      window.location.href = result.authUrl
    },
    [bankLinks, addToast],
  )

  // Tijdzone-veilige maandgrenzen (zie localMonthBounds): NIET via toISOString,
  // dat schuift in UTC+ tijdzones een dag terug en laat een 31-juli-salaris in
  // het augustus-overzicht lekken.
  const monthStart = useMemo(() => localMonthBounds(monthDate).start, [monthDate])
  const monthEnd = useMemo(() => localMonthBounds(monthDate).end, [monthDate])

  const monthLabel = useMemo(
    () => monthDate.toLocaleDateString('nl-NL', { year: 'numeric', month: 'long' }),
    [monthDate],
  )

  // `YYYY-MM` van de geselecteerde maand voor de deeplinks — lokaal opgebouwd
  // (NIET via toISOString, dat schuift in UTC+ tijdzones een dag terug en kan
  // de maand verkeerd zetten).
  const monthParam = useMemo(
    () => `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`,
    [monthDate],
  )

  const prevMonth = () => setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  const nextMonth = () => setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))

  const loadAccounts = useCallback(async () => {
    const supabase = createClient()
    // Alle ACTIEVE cash-rekeningen voeden de geldstroom. Transacties hangen via
    // `account_id` aan `bank_accounts` — niet aan assets — dus de weergave op de
    // cashflow-pagina mag NIET afhangen van `has_budget_tracking` (een veld van
    // het optioneel gekoppelde cash-asset). Een ongekoppelde of niet-getrackte
    // rekening liet anders ál zijn transacties volledig verdwijnen uit dit
    // overzicht, terwijl cash-account-view ze wél toont (alle actieve
    // rekeningen).
    //
    // RLS-scope, geverifieerd tegen `pg_policies`: de SELECT-policy "Users view
    // own or shared bank_accounts" is NIET eigen-rij maar huishoud-verbreed —
    //   (auth.uid() = user_id)
    //   OR (ownership = 'shared' AND household_id = user_household_id())
    // (`20260719090108_perf_rls_initplan_consolidatie.sql`). Hier stond eerder het
    // tegenovergestelde ("own-row, géén household-verbreding"); dat klopte niet en
    // is precies het soort aanname waarop iemand een `user_id`-filter toevoegt en
    // daarmee de gedeelde huishoudrekening stil uit beeld haalt. In 'personal'
    // versmalt het extra ownership-filter hieronder wél tot je niet-gedeelde
    // rekeningen — in de query, of (brede modus) op de opgehaalde rijen; zie
    // hieronder. Handmatige cash-assets zonder bank_accounts-rij vallen sowieso
    // buiten deze query.
    // Eén leesronde voor twee afnemers (zie BANK_ACCOUNT_COLUMNS voor de
    // kolomkeuze): de rekeningkaarten hieronder én — in de brede modus — de
    // asset→rekening-map. Die map heeft de ONGEFILTERDE set nodig, dus daar
    // versmalt het persoonlijke perspectief pas ná het ophalen. Dat levert
    // exact dezelfde rekeningen op als het `ownership`-filter in de query
    // (`ownership` staat in de kolomlijst), maar scheelt een tweede rondje.
    const wide = showAllCashAccounts
    let q = supabase
      .from('bank_accounts')
      .select(wide ? BANK_ACCOUNT_COLUMNS_WITH_TRACKING : BANK_ACCOUNT_COLUMNS)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    if (perspective === 'personal' && !wide) q = q.eq('ownership', 'personal')
    // De plaintext-IBAN verdwijnt in Stage B en ontsleutelen kan alleen
    // server-side. Hier dient hij puur als regel onder de rekeningnaam, dus de
    // niet-strikte variant met een eigen terugval volstaat: zonder IBAN toont de
    // kaart alleen de banknaam, en dat mag het rekeningoverzicht niet laten
    // vallen.
    const [{ data }, ibanResult] = await Promise.all([
      q,
      fetchOwnAccountIbans().catch((err) => {
        console.warn('[cash-overview] IBANs niet beschikbaar:', err)
        return { accounts: [], unreadable: 0 }
      }),
    ])
    if (data) {
      const rows = data as unknown as BankAccountRow[]
      const ibanFor = ibanById(ibanResult.accounts)
      const visible =
        perspective === 'personal' ? rows.filter((a) => a.ownership === 'personal') : rows
      setAccounts(visible.map((a) => ({ ...a, iban: ibanFor.get(a.id) ?? null })))
      if (wide) setBankByAsset(budgetTrackedBankByAsset(rows))
    }
  }, [perspective, showAllCashAccounts])

  // Laadt ALLE cash-rekeningen (bank-gekoppeld én handmatige cash-assets) —
  // los van `has_budget_tracking`. Voedt de asset-gedreven rekeningenlijst die
  // alleen actief is wanneer `showAllCashAccounts` aanstaat; de
  // geldstroom-aggregatie blijft op de budget-tracked `accounts` draaien.
  const loadAllCashRekeningen = useCallback(async () => {
    if (!showAllCashAccounts) return
    const supabase = createClient()
    // Perspectief-loader: RLS levert eigen + gedeelde items, gestempeld met
    // _provenance/_myShareFraction. Zelfde bron als de bezittingen-pagina zodat
    // gedeelde rekeningen ook in het persoonlijke perspectief zichtbaar blijven.
    const pd = await loadPerspectiveData(supabase, perspective)
    // PerspectiveItem is een losse Record-vorm; Asset is een concrete shape.
    // Dezelfde unknown-cast die assets-client.tsx voor diezelfde loader gebruikt.
    const cash = (pd.assets as unknown as StampedAsset[]).filter(
      (a) => (a as { asset_type?: string }).asset_type === 'cash' && (a as { is_active?: boolean }).is_active !== false,
    )
    setCashAssets(cash)

    // De asset→bank_account-map voor de klik-flow (welke kaart opent de
    // rekeningdetail i.p.v. het bezittings-paneel) stond hier vroeger als eigen
    // `bank_accounts`-query. Die is weg: `loadAccounts` leest die tabel toch al
    // en levert de map nu uit dezelfde rijen. De KOPPELSTATUS was daarvóór al
    // vertrokken naar `bankLinks` uit `loadCashBankLinks()` op de server,
    // dezelfde bron die `CashAccountView` leest (fase 7, ADR 0058).
  }, [showAllCashAccounts, perspective])

  // Waardeverloop-sparklines voor de rekening-kaarten — exact dezelfde fetch
  // als de bezittingen-pagina (`assets-client.tsx`): `loadEntitySparklines`
  // op `balance_snapshots` per asset-ID. Alleen actief in de brede modus.
  // Aggregaatrijen (privacy='totalen') hebben geen echt entity-ID en worden
  // overgeslagen. Failure is non-fataal: lege map → vlakke overlay.
  useEffect(() => {
    if (!showAllCashAccounts) return
    const ids = cashAssets
      .filter((a) => a._aggregated !== true)
      .map((a) => a.id)
    if (ids.length === 0) {
      setCashSparklines({})
      return
    }
    const supabase = createClient()
    let cancelled = false
    loadEntitySparklines(supabase, 'asset', ids)
      .then((map) => {
        if (!cancelled) setCashSparklines(map)
      })
      .catch(() => {
        if (!cancelled) setCashSparklines({})
      })
    return () => { cancelled = true }
  }, [showAllCashAccounts, cashAssets])

  // Account-IDs die de geldstroom-aggregaties mogen voeden. Wanneer er geen
  // budget-tracked rekeningen zijn, slaan we de transactions-query over —
  // anders levert `.in('account_id', [])` een 400 op en ruisen we de
  // server onnodig met een lege query.
  const accountIds = useMemo(() => accounts.map((a) => a.id), [accounts])

  const loadTransactions = useCallback(async () => {
    if (accountIds.length === 0) {
      setTransactions([])
      return
    }
    const supabase = createClient()
    let q = supabase
      .from('transactions')
      .select('amount, account_id, budget_id, is_income, transaction_type, date')
      .gte('date', monthStart)
      .lt('date', monthEnd)
      .in('account_id', accountIds)
    if (perspective === 'personal') q = q.eq('ownership', 'personal')
    const { data } = await q
    if (data) setTransactions(data as TxAgg[])
  }, [monthStart, monthEnd, perspective, accountIds])

  const loadBudgets = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('budgets')
      // Expliciete kolomlijst; `is_income` staat NIET op `budgets` (alleen op
      // `transactions`) — die kolom erbij zetten geeft 42703 → 400 en laat de
      // hele budget-opsplitsing stil leeglopen.
      .select('id, name, icon, parent_id, budget_type, default_limit')
      .order('sort_order', { ascending: true })
    if (data) setBudgets(data as BudgetRow[])
  }, [])

  // Historisch dagverloop per dag-van-de-maand (laatste 12 afgesloten
  // maanden). Per dag het gemiddelde van inkomen + uitgaven; alleen
  // gemiddeld over maanden die die dag daadwerkelijk hebben (dag 30/31
  // valt automatisch over minder maanden). Wordt gebruikt door de
  // forecast-curve: het verloop volgt het historische ritme i.p.v.
  // lineair vanaf vandaag.
  type HistoricalDayPattern = Array<{ day: number; avgIncome: number; avgExpense: number }>
  const [historicalDayPattern, setHistoricalDayPattern] = useState<HistoricalDayPattern | null>(null)

  const loadHistorical = useCallback(async () => {
    if (accountIds.length === 0) {
      setHistoricalDayPattern(null)
      return
    }
    const supabase = createClient()
    // Lokale YYYY-MM-DD grens (zie localMonthBounds: toISOString schuift in UTC+
    // tijdzones een dag terug).
    const start = localMonthStart(new Date(monthDate.getFullYear(), monthDate.getMonth() - 12, 1))
    let q = supabase
      .from('transactions')
      .select('amount, is_income, transaction_type, date')
      .gte('date', start)
      .lt('date', monthStart)
      .in('account_id', accountIds)
    if (perspective === 'personal') q = q.eq('ownership', 'personal')
    const { data } = await q
    if (!data || data.length === 0) {
      setHistoricalDayPattern(null)
      return
    }

    // Bucket: YYYY-MM → dayOfMonth → { income, expense }.
    const perMonthDay = new Map<string, Map<number, { income: number; expense: number }>>()
    for (const tx of data as Array<{ amount: number; is_income: boolean; transaction_type: string | null; date: string }>) {
      if (tx.transaction_type === 'transfer') continue
      const monthKey = tx.date.slice(0, 7)
      const day = Number(tx.date.slice(8, 10))
      if (!Number.isFinite(day)) continue
      let monthMap = perMonthDay.get(monthKey)
      if (!monthMap) {
        monthMap = new Map()
        perMonthDay.set(monthKey, monthMap)
      }
      let entry = monthMap.get(day)
      if (!entry) {
        entry = { income: 0, expense: 0 }
        monthMap.set(day, entry)
      }
      if (tx.is_income) {
        entry.income += tx.amount
      } else {
        entry.expense += Math.abs(tx.amount)
      }
    }
    if (perMonthDay.size === 0) {
      setHistoricalDayPattern(null)
      return
    }

    // Per dag-van-de-maand gemiddeld over maanden die die dag bevatten.
    const monthLengths = new Map<string, number>()
    for (const monthKey of perMonthDay.keys()) {
      const [y, m] = monthKey.split('-').map(Number)
      monthLengths.set(monthKey, new Date(y, m, 0).getDate())
    }

    const pattern: HistoricalDayPattern = []
    for (let d = 1; d <= 31; d++) {
      let sumIncome = 0
      let sumExpense = 0
      let monthCount = 0
      for (const [monthKey, monthMap] of perMonthDay.entries()) {
        const len = monthLengths.get(monthKey) ?? 31
        if (d > len) continue
        monthCount++
        const entry = monthMap.get(d)
        if (entry) {
          sumIncome += entry.income
          sumExpense += entry.expense
        }
      }
      if (monthCount > 0) {
        pattern.push({
          day: d,
          avgIncome: sumIncome / monthCount,
          avgExpense: sumExpense / monthCount,
        })
      }
    }

    setHistoricalDayPattern(pattern)
  }, [accountIds, monthStart, monthDate, perspective])

  useEffect(() => {
    setLoading(true)
    Promise.all([loadAccounts(), loadBudgets()]).then(() => setLoading(false))
    void loadAllCashRekeningen()
  }, [loadAccounts, loadBudgets, loadAllCashRekeningen])

  useEffect(() => {
    loadTransactions()
  }, [loadTransactions])

  useEffect(() => {
    loadHistorical()
  }, [loadHistorical])

  // Eén leesronde voor beide bestaans-vragen (zie `latestTxDate`).
  useEffect(() => {
    let cancelled = false
    const loadLatest = async () => {
      const supabase = createClient()
      let query = supabase
        .from('transactions')
        .select('date')
        .order('date', { ascending: false })
        .limit(1)
      if (perspective === 'personal') query = query.eq('ownership', 'personal')
      const { data } = await query
      if (!cancelled) setLatestTxDate(data && data.length > 0 ? (data[0].date as string) : null)
    }
    loadLatest()
    return () => { cancelled = true }
  }, [perspective])

  // 90-dagengrens, lokaal opgebouwd (NIET via toISOString: dat schuift in UTC+
  // tijdzones een dag terug). Eén keer per mount vastgezet, zoals de query dat
  // vroeger per aanroep deed.
  const recentActivityCutoff = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 90)
    return `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`
  }, [])

  // Was er de afgelopen 90 dagen enige transactie-activiteit? Bepaalt of het
  // hele geldstroom-blok getoond wordt of vervangen door een lege-staat
  // call-to-action. null = nog aan het laden (toon dan het normale blok).
  const hasRecentActivity =
    latestTxDate === undefined ? null : latestTxDate !== null && latestTxDate >= recentActivityCutoff

  // Staat er buiten de geselecteerde maand wél iets? De render combineert dit
  // met `transactions.length === 0`.
  const hasOtherMonthTx = latestTxDate != null

  function goToLatestTransaction() {
    if (!latestTxDate) return
    const d = new Date(latestTxDate + 'T00:00:00')
    setMonthDate(new Date(d.getFullYear(), d.getMonth(), 1))
  }

  // Aggregations
  const totalBalance = useMemo(() => accounts.reduce((s, a) => s + Number(a.balance), 0), [accounts])

  // ── Eenvoudig-modus: rekening-kaarten als pills (zoals bezittingen) ──
  // Presentatie-only: zelfde data en klik-flow als de kaart-grid hierboven,
  // alleen compacter. Kies de bron die in deze modus zou renderen:
  // showAllCashAccounts → cashAssets (mét sparklines), anders accounts.
  // Icoon + accentkleur = cash (Wallet / kern-700), conform de kaart.
  const CASH_ICON_COLOR = ASSET_TYPE_COLORS.cash // kern-700, accent-aware var(--color-kern-700)
  const accountPillItems = useMemo<PillItem[]>(() => {
    if (showAllCashAccounts) {
      const total = cashAssets.reduce((s, a) => {
        const raw = Number(a.current_value) || 0
        const shared = a.ownership === 'shared' && perspective !== 'household'
        return s + (shared ? raw * (a._myShareFraction ?? 1) : raw)
      }, 0)
      return cashAssets.map((a) => {
        const raw = Number(a.current_value) || 0
        const shared = a.ownership === 'shared' && perspective !== 'household'
        const amount = shared ? raw * (a._myShareFraction ?? 1) : raw
        return {
          id: a.id,
          name: a.name,
          iconName: 'Wallet',
          iconColor: CASH_ICON_COLOR,
          amount,
          sharePct: total > 0 ? (amount / total) * 100 : 0,
          sparklineValues: cashSparklines[a.id],
          // Zelfde keuze als op de kaarten (`detailBankAccountIdForAsset`): de
          // eenvoudig-modus mag niet in een ánder paneel eindigen dan de brede
          // modus voor dezelfde rekening.
          onClick: () => {
            const bankId = detailBankAccountIdForAsset(bankLinks, bankByAsset, a.id)
            if (bankId) setDetailAccountId(bankId)
            else setEditingAsset(a as Asset)
          },
        }
      })
    }
    return accounts.map((acc) => ({
      id: acc.id,
      name: acc.name,
      iconName: 'Wallet',
      iconColor: CASH_ICON_COLOR,
      amount: Number(acc.balance),
      sharePct: totalBalance > 0 ? (Number(acc.balance) / totalBalance) * 100 : 0,
      onClick:
        embedded && onNavigateToAccount
          ? () => onNavigateToAccount(acc.id)
          : embedded
            ? () => setDetailAccountId(acc.id)
            : undefined,
    }))
  }, [
    showAllCashAccounts, cashAssets, cashSparklines, bankByAsset, bankLinks, perspective,
    accounts, totalBalance, embedded, onNavigateToAccount,
  ])

  // Hash-focus: wanneer de URL een `#rekening-<assetId>`-anker bevat, scroll
  // de bijbehorende kaart in beeld en geef hem een tijdelijke ring-highlight.
  // Alleen actief in de brede (showAllCashAccounts) modus.
  useEffect(() => {
    if (!showAllCashAccounts || cashAssets.length === 0) return
    if (typeof window === 'undefined') return
    const hash = window.location.hash
    if (!hash.startsWith('#rekening-')) return
    const el = document.getElementById(hash.slice(1))
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('ring-2', 'ring-kern-400', 'ring-offset-2')
    const t = window.setTimeout(() => {
      el.classList.remove('ring-2', 'ring-kern-400', 'ring-offset-2')
    }, 2400)
    return () => window.clearTimeout(t)
  }, [showAllCashAccounts, cashAssets])

  const nonTransferTx = useMemo(
    () => transactions.filter((t) => t.transaction_type !== 'transfer'),
    [transactions],
  )

  const incomeByAccount = useMemo(() => {
    const map = new Map<string, number>()
    for (const tx of nonTransferTx) {
      if (tx.is_income) {
        map.set(tx.account_id, (map.get(tx.account_id) ?? 0) + tx.amount)
      }
    }
    return map
  }, [nonTransferTx])

  const totalIncome = useMemo(
    () => Array.from(incomeByAccount.values()).reduce((s, v) => s + v, 0),
    [incomeByAccount],
  )

  const expensesByBudget = useMemo(() => {
    // Build parent lookup
    const parentMap = new Map<string, string>()
    const budgetMap = new Map<string, BudgetRow>()
    for (const b of budgets) {
      budgetMap.set(b.id, b)
      if (b.parent_id) parentMap.set(b.id, b.parent_id)
    }

    // Aggregate by parent budget (of door het budget zelf als er geen
    // parent is). Transacties waarvan het budget niet in de geladen
    // `budgets`-array zit (verwijderd, gearchiveerd, andere RLS-scope)
    // mogen NIET stilzwijgend wegvallen — die routen we naar
    // "Ongecategoriseerd" zodat `totalExpenses` blijft kloppen met de
    // chart-aggregatie. Anders zien gebruikers wel een bar maar geen
    // bedrag in de totalen.
    const aggMap = new Map<string, number>()
    let orphanAmount = 0
    for (const tx of nonTransferTx) {
      if (tx.is_income) continue
      if (!tx.budget_id) continue
      const knownBudget = budgetMap.has(tx.budget_id)
      if (!knownBudget) {
        orphanAmount += Math.abs(tx.amount)
        continue
      }
      const parentId = parentMap.get(tx.budget_id) ?? tx.budget_id
      // Als de parent zelf onbekend is (broken hierarchy) val terug op
      // het budget zelf zodat het bedrag niet alsnog verdwijnt.
      const aggKey = budgetMap.has(parentId) ? parentId : tx.budget_id
      aggMap.set(aggKey, (aggMap.get(aggKey) ?? 0) + Math.abs(tx.amount))
    }

    const result: BudgetExpense[] = []
    for (const [budgetId, amount] of aggMap) {
      const b = budgetMap.get(budgetId)
      if (!b) continue
      let limit = b.default_limit ?? 0
      for (const child of budgets) {
        if (child.parent_id === budgetId) {
          limit += (child.default_limit ?? 0)
        }
      }
      result.push({ id: budgetId, name: b.name, icon: b.icon, amount, limit })
    }

    const nullBudgetAmount = nonTransferTx
      .filter((tx) => !tx.is_income && !tx.budget_id)
      .reduce((s, tx) => s + Math.abs(tx.amount), 0)
    const uncatAmount = nullBudgetAmount + orphanAmount
    if (uncatAmount > 0) {
      result.push({ id: '__uncat', name: 'Ongecategoriseerd', icon: null, amount: uncatAmount, limit: 0 })
    }

    result.sort((a, b) => b.amount - a.amount)
    return result
  }, [nonTransferTx, budgets])

  const totalExpenses = useMemo(
    () => expensesByBudget.reduce((s, b) => s + b.amount, 0),
    [expensesByBudget],
  )

  const netAmount = totalIncome - totalExpenses

  // Spaarquote (% van inkomen wat overblijft)
  const savingsRate = totalIncome > 0 ? (netAmount / totalIncome) * 100 : 0

  // Dagelijkse geldstroom — voor de cashflow-grafiek. Aggregeert alle
  // transacties (alle rekeningen, transfers uitgesloten) per dag van de
  // huidige maand. Cumulatief saldo telt netto per dag op zodat de lijn
  // de loop van de maand visualiseert.
  const dailyFlow = useMemo(() => {
    const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate()
    const buckets: Array<{ day: number; income: number; expense: number; cumulative: number }> = []
    for (let i = 1; i <= daysInMonth; i++) {
      buckets.push({ day: i, income: 0, expense: 0, cumulative: 0 })
    }
    for (const tx of nonTransferTx) {
      const d = new Date(tx.date + 'T00:00:00')
      const dayIdx = d.getDate() - 1
      if (dayIdx < 0 || dayIdx >= buckets.length) continue
      if (tx.is_income) {
        buckets[dayIdx].income += tx.amount
      } else {
        buckets[dayIdx].expense += Math.abs(tx.amount)
      }
    }
    let running = 0
    for (const b of buckets) {
      running += b.income - b.expense
      b.cumulative = running
    }
    return buckets
  }, [nonTransferTx, monthDate])

  // ── Maandbudget + prognose + uitgavesnelheid ─────────────────
  // `totalMonthlyBudget` = som van alle expense-budget limieten (parent +
  // childs als child niet onder parent telt, vermijden we dubbeltelling
  // door alleen leaves mee te nemen).
  const totalMonthlyBudget = useMemo(() => {
    const childIds = new Set(budgets.filter((b) => b.parent_id).map((b) => b.parent_id as string))
    let sum = 0
    for (const b of budgets) {
      if (b.budget_type !== 'expense') continue
      // Skip parents die kinderen hebben (anders dubbeltellen).
      if (childIds.has(b.id)) continue
      sum += Number(b.default_limit) || 0
    }
    return sum
  }, [budgets])

  // Forecast / snelheid alléén voor de huidige maand. De forecast-curve
  // zelf volgt het historisch dagpatroon (laatste 12 afgesloten maanden):
  // voor elke dag na vandaag wordt het gemiddelde inkomen − uitgaven van
  // die dag-van-de-maand opgeteld bij de cumulatieve stand van vandaag.
  // Bij ontbrekende historie valt de curve terug op een lineair verloop
  // op basis van het tempo-tot-nu, zodat een nieuwe gebruiker tóch iets
  // ziet.
  const forecast = useMemo(() => {
    const now = new Date()
    const isCurrentMonth =
      now.getFullYear() === monthDate.getFullYear() &&
      now.getMonth() === monthDate.getMonth()
    const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate()

    if (!isCurrentMonth) {
      return {
        isCurrentMonth: false,
        daysInMonth,
        dayOfMonth: daysInMonth,
        projectedExpenses: totalExpenses,
        projectedNet: netAmount,
        expectedByNow: 0,
        velocity: 0,
        forecastSource: 'actual' as const,
        forecastPath: [] as Array<{ day: number; cumulative: number }>,
      }
    }

    const dayOfMonth = Math.min(now.getDate(), daysInMonth)
    const daysRemaining = Math.max(0, daysInMonth - dayOfMonth)

    // Cumulative stand op vandaag — uit de daadwerkelijke daily flow.
    const cumulativeToday = (() => {
      let running = 0
      for (let i = 0; i < dayOfMonth; i++) {
        const d = dailyFlow[i]
        if (d) running += d.income - d.expense
      }
      return running
    })()

    let forecastSource: 'historical' | 'current_pace'
    const forecastPath: Array<{ day: number; cumulative: number }> = []

    const usableHistory =
      historicalDayPattern && historicalDayPattern.length > 0
        ? historicalDayPattern
        : null

    if (usableHistory) {
      forecastSource = 'historical'
      // Lookup map voor snelle dag-toegang.
      const byDay = new Map<number, { avgIncome: number; avgExpense: number }>()
      for (const p of usableHistory) byDay.set(p.day, { avgIncome: p.avgIncome, avgExpense: p.avgExpense })
      let running = cumulativeToday
      for (let d = dayOfMonth + 1; d <= daysInMonth; d++) {
        const entry = byDay.get(d)
        if (entry) {
          running += entry.avgIncome - entry.avgExpense
        }
        forecastPath.push({ day: d, cumulative: running })
      }
    } else {
      // Fallback: huidig tempo, lineair voortzetten.
      forecastSource = 'current_pace'
      const dailyNet =
        dayOfMonth > 0 ? cumulativeToday / dayOfMonth : 0
      let running = cumulativeToday
      for (let d = dayOfMonth + 1; d <= daysInMonth; d++) {
        running += dailyNet
        forecastPath.push({ day: d, cumulative: running })
      }
    }

    // Geprojecteerde maandtotalen — afgeleid van het laatste forecast-punt
    // zodat KPI-strip en grafiek consistent zijn.
    const projectedNet =
      forecastPath.length > 0 ? forecastPath[forecastPath.length - 1].cumulative : cumulativeToday
    // Inkomsten en uitgaven afzonderlijk projecteren via dezelfde bron.
    let projectedIncomeRemaining = 0
    let projectedExpenseRemaining = 0
    if (usableHistory) {
      const byDay = new Map<number, { avgIncome: number; avgExpense: number }>()
      for (const p of usableHistory) byDay.set(p.day, { avgIncome: p.avgIncome, avgExpense: p.avgExpense })
      for (let d = dayOfMonth + 1; d <= daysInMonth; d++) {
        const e = byDay.get(d)
        if (e) {
          projectedIncomeRemaining += e.avgIncome
          projectedExpenseRemaining += e.avgExpense
        }
      }
    } else {
      const dailyExpenseRate = dayOfMonth > 0 ? totalExpenses / dayOfMonth : 0
      projectedExpenseRemaining = dailyExpenseRate * daysRemaining
      // Inkomen extrapolatie zonder historie is bewust 0 — meeste salarissen
      // komen één keer en zijn al binnen; een "tempo"-aanname zou het cijfer
      // opblazen.
    }
    const projectedExpenses = totalExpenses + projectedExpenseRemaining
    const projectedIncome = totalIncome + projectedIncomeRemaining

    const expectedByNow = totalMonthlyBudget * (dayOfMonth / daysInMonth)
    const velocity = expectedByNow > 0 ? totalExpenses / expectedByNow : 0

    return {
      isCurrentMonth: true,
      daysInMonth,
      dayOfMonth,
      projectedExpenses,
      projectedIncome,
      projectedNet,
      expectedByNow,
      velocity,
      forecastSource,
      forecastPath,
    }
  }, [monthDate, totalExpenses, totalIncome, totalMonthlyBudget, netAmount, historicalDayPattern, dailyFlow])

  // Child budgets for expense receipt drill-down
  const expenseReceiptChildren = useMemo(() => {
    if (!expenseReceiptBudgetId) return []
    const children = budgets.filter((b) => b.parent_id === expenseReceiptBudgetId)
    if (children.length === 0) return []

    // Aggregate by child budget
    const childMap = new Map<string, number>()
    for (const tx of nonTransferTx) {
      if (!tx.is_income && tx.budget_id && children.some((c) => c.id === tx.budget_id)) {
        childMap.set(tx.budget_id, (childMap.get(tx.budget_id) ?? 0) + Math.abs(tx.amount))
      }
    }

    return children
      .map((c) => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        amount: childMap.get(c.id) ?? 0,
        limit: c.default_limit ?? 0,
      }))
      .filter((c) => c.amount > 0)
      .sort((a, b) => b.amount - a.amount)
  }, [expenseReceiptBudgetId, budgets, nonTransferTx])

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-kern-300 border-t-kern-600" />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">

      {/* === 1. Rekeningen === */}
      {!hideAccountsSection && (
      <section className="mt-5 sm:mt-8">
        <div className="mb-4">
          <Kicker>Rekeningen</Kicker>
        </div>

        {simple ? (
          <EenvoudigPillList items={accountPillItems} variant="asset" />
        ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          {showAllCashAccounts
            ? cashAssets.map((a) => (
                <div key={a.id} id={`rekening-${a.id}`} className="scroll-mt-24">
                  <VermogenAssetCard
                    asset={a as Asset}
                    sparklineValues={cashSparklines[a.id]}
                    /* Alleen een rekening MÉT koppeling krijgt een symbool (besluit
                       B4): handmatig bijhouden is de normale toestand en verdient
                       geen markering. `undefined` = niets renderen, dus ook voor
                       aggregaatrijen (partner-totaal), die geen echte rekening zijn.
                       De toestand komt uit de server-loader, niet uit een eigen
                       leesronde — zie de `bankLinks`-prop. */
                    bankLink={cashAssetBankLink(a, bankLinks)}
                    /* Alleen aanbieden wanneer de rekeningdetail-overlay er ook
                       ís (die rendert onder `embedded`) — een herstelknop die
                       niets opent is erger dan geen knop. */
                    onReconnect={embedded ? handleReconnect : undefined}
                    /* De koppelrij wint van de budget-map: zie
                       `detailBankAccountIdForAsset`. Een gekoppelde rekening
                       waarop budgetteren uitstaat opende anders het bewerk-paneel
                       in plaats van de rekeningdetail — juist het paneel met de
                       bankverbinding en het herstelpad. */
                    onClick={(asset) => {
                      const bankId = detailBankAccountIdForAsset(bankLinks, bankByAsset, asset.id)
                      if (bankId) setDetailAccountId(bankId)
                      else setEditingAsset(asset)
                    }}
                    onEditClick={(asset) => {
                      const bankId = detailBankAccountIdForAsset(bankLinks, bankByAsset, asset.id)
                      if (bankId) setDetailAccountId(bankId)
                      else setEditingAsset(asset)
                    }}
                    onRevalueClick={(asset) => setRevalueAsset(asset)}
                    perspective={perspective}
                    provenance={a._provenance}
                    shareFraction={a._myShareFraction}
                    aggregated={a._aggregated}
                  />
                </div>
              ))
            : accounts.map((acc) => {
                const sharePct = totalBalance > 0 ? (Number(acc.balance) / totalBalance) * 100 : 0
                const useCallbackNav = embedded && onNavigateToAccount
                const Wrapper = (embedded ? 'button' : Link) as any
                const wrapperProps = useCallbackNav
                  ? { type: 'button' as const, onClick: () => onNavigateToAccount(acc.id) }
                  : embedded
                    ? { type: 'button' as const, onClick: () => setDetailAccountId(acc.id) }
                    : { href: `/core/assets/cash/${acc.id}` }
                return (
                  <Wrapper
                    key={acc.id}
                    {...wrapperProps as any}
                    className="group card-editorial overflow-hidden p-0 text-left transition-all hover:shadow-[var(--s1)] hover:-translate-y-px"
                  >
                    <div className="flex h-1 items-stretch">
                      <div className="w-1 bg-kern-500" />
                      <div className="flex-1" />
                    </div>
                    <div className="p-3 sm:p-5">
                      <div className="mb-2 flex items-center gap-2.5">
                        <div className="flex h-7 w-7 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-[var(--r)] bg-[var(--subtle)] group-hover:bg-kern-50">
                          <Wallet className="h-4 w-4 sm:h-5 sm:w-5 text-kern-600" />
                        </div>
                        <p className="text-sm font-semibold text-[var(--ink-2)]">{acc.name}</p>
                      </div>

                      {(acc.iban || acc.bank_name) && (
                        <p className="mb-2 text-xs text-[var(--ink-3)]">
                          {acc.iban}{acc.iban && acc.bank_name ? ' · ' : ''}{acc.bank_name}
                        </p>
                      )}

                      <p className="font-mono text-2xl font-bold tabular-nums text-[var(--ink)]">
                        {<MaskedAmount value={Number(acc.balance)} tone="kern" decimals />}
                      </p>

                      <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-[var(--subtle)]">
                        <div
                          className="h-full rounded-full bg-kern-300"
                          style={{ width: `${Math.max(sharePct, 2)}%` }}
                        />
                      </div>
                      <p className="mt-0.5 text-[10px] text-[var(--ink-4)]">
                        {sharePct.toFixed(0)}% van totaal
                      </p>

                      <FreedomTimeBadge amount={Number(acc.balance)} className="mt-2" />

                      <div className="mt-3 flex items-center justify-between">
                        <span className="label-editorial text-kern-600 opacity-0 transition-opacity group-hover:opacity-100">
                          Bekijk rekening
                        </span>
                        <ArrowRight className="h-4 w-4 text-[var(--ink-4)] transition-colors group-hover:text-kern-500" />
                      </div>
                    </div>
                  </Wrapper>
                )
              })}
        </div>
        )}
      </section>
      )}

      {/* === 2. Geldstroom — Sankey + banner-style figures-strip === */}
      {/* Verborgen in Eenvoudig: maandselector + figures-strip + dag-grafiek
          zijn detail. De KassabonSheets hieronder blijven buiten de wrap. */}
      <HideInSimple>
      <section className="mt-5 sm:mt-8">
        {hasRecentActivity === false ? (
          // Geen transactie-activiteit in de laatste 90 dagen → vervang het
          // hele geldstroom-blok (maand-banner + KPI's + grafiek) door een
          // lege-staat call-to-action.
          <div
            className="rounded-[var(--r)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)] px-4 py-10 text-center"
            data-testid="cashflow-empty-90d"
          >
            <p
              className="text-sm text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
            >
              Voeg transacties toe om je cashflow te zien.
            </p>
          </div>
        ) : (
          <>
        {/* Editorial banner: maand-selector links + Kicker rechts */}
        <div className="border-t border-b border-[var(--ink)]">
          {/* Top-rij: maand-selector + label */}
          <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-[var(--rule-soft)]">
            <div className="flex items-center gap-3">
              <button
                onClick={prevMonth}
                className="rounded-full p-1 text-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-[var(--ink)]"
                aria-label="Vorige maand"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span
                className="min-w-[120px] text-center text-[16px] font-bold capitalize text-[var(--ink)] tabular-nums"
                style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
              >
                {monthLabel}
              </span>
              <button
                onClick={nextMonth}
                className="rounded-full p-1 text-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-[var(--ink)]"
                aria-label="Volgende maand"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
              {showMonthLinks && (
                <>
                  <Link
                    href={`/overzicht/cashflow/budget?maand=${monthParam}`}
                    className="inline-flex items-center gap-1 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)] transition-colors hover:text-[var(--ink)]"
                  >
                    Naar budget <ArrowRight className="h-3 w-3" />
                  </Link>
                  <Link
                    href={`/overzicht/cashflow/transacties?maand=${monthParam}`}
                    className="inline-flex items-center gap-1 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)] transition-colors hover:text-[var(--ink)]"
                  >
                    Naar transacties <ArrowRight className="h-3 w-3" />
                  </Link>
                </>
              )}
              <Kicker>Geldstroom</Kicker>
            </div>
          </div>

          {/* Figures-strip totalen — 4 kolommen: Inkomen / Uitgaven / Saldo / Spaarquote */}
          <div className="grid grid-cols-2 sm:grid-cols-4">
            <button
              type="button"
              onClick={() => setShowIncomeReceipt(true)}
              className="p-4 text-left border-r border-[var(--rule-soft)] [&:nth-child(-n+2)]:border-b sm:[&:nth-child(-n+2)]:border-b-0 transition-colors hover:bg-[var(--subtle)]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            >
              <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--positive)] mb-1.5">
                Inkomen
              </div>
              <div
                className="text-[22px] sm:text-[26px] font-black leading-none tracking-[-0.02em] tabular-nums"
                style={{ fontFamily: 'var(--font-playfair, Georgia, serif)', color: 'var(--positive)' }}
              >
                {<MaskedAmount value={totalIncome} tone="kern" decimals />}
              </div>
              <div
                className="italic text-[11px] text-[var(--ink-3)] mt-1.5"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                ontvangen
              </div>
            </button>

            <button
              type="button"
              onClick={() => setShowExpenseReceipt(true)}
              className="p-4 text-left border-r border-[var(--rule-soft)] [&:nth-child(-n+2)]:border-b sm:[&:nth-child(-n+2)]:border-b-0 transition-colors hover:bg-[var(--subtle)]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            >
              <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--negative)] mb-1.5">
                Uitgaven
              </div>
              <div
                className="text-[22px] sm:text-[26px] font-black leading-none tracking-[-0.02em] tabular-nums"
                style={{ fontFamily: 'var(--font-playfair, Georgia, serif)', color: 'var(--negative)' }}
              >
                {<MaskedAmount value={totalExpenses} tone="kern" decimals />}
              </div>
              <div
                className="italic text-[11px] text-[var(--ink-3)] mt-1.5"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                besteed
              </div>
            </button>

            <div className="p-4 border-r border-[var(--rule-soft)]">
              <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-1.5">
                Saldo
              </div>
              <div
                className="text-[22px] sm:text-[26px] font-black leading-none tracking-[-0.02em] tabular-nums"
                style={{
                  fontFamily: 'var(--font-playfair, Georgia, serif)',
                  color: netAmount >= 0 ? 'var(--positive)' : 'var(--negative)',
                }}
              >
                <span
                  className="inline px-1"
                  style={{
                    backgroundImage:
                      'linear-gradient(transparent 60%, var(--module-active-200) 60%)',
                  }}
                >
                  <MaskedAmount value={netAmount} signPrefix={netAmount >= 0 ? '+' : ''} tone="kern" decimals />
                </span>
              </div>
              <div
                className="italic text-[11px] text-[var(--ink-3)] mt-1.5"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                netto
              </div>
            </div>

            <div className="p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-1.5">
                Spaarquote
              </div>
              <div
                className="text-[22px] sm:text-[26px] font-black leading-none tracking-[-0.02em] tabular-nums"
                style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
              >
                {savingsRate.toFixed(0)}%
              </div>
              <div
                className="italic text-[11px] text-[var(--ink-3)] mt-1.5"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                {savingsRate >= 30 ? 'sterk' : savingsRate >= 15 ? 'gezond' : 'laag'}
              </div>
            </div>
          </div>
        </div>

        {/* Geldstroom-grafiek — dagelijkse in/uit + cumulatief saldo over alle rekeningen */}
        <div className="mt-6 card-editorial p-4 sm:p-6">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="label-editorial text-[var(--ink-2)]">Geldstroom</span>
              <span className="text-[11px] italic text-[var(--ink-4)]" style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}>
                {monthLabel.toLowerCase()}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
              <span className="flex items-center gap-1.5">
                <span className="block h-2 w-2 bg-emerald-500" aria-hidden="true" />
                <span>Inkomsten</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="block h-2 w-2 bg-red-500" aria-hidden="true" />
                <span>Uitgaven</span>
              </span>
              <span className="hidden items-center gap-1.5 sm:flex">
                <span className="block h-px w-3 bg-[var(--ink-2)]" aria-hidden="true" />
                <span>Saldo</span>
              </span>
            </div>
          </div>

          <CashflowChart
            data={dailyFlow}
            netAmount={netAmount}
            totalIncome={totalIncome}
            totalExpenses={totalExpenses}
            totalMonthlyBudget={totalMonthlyBudget}
            forecast={forecast}
          />
        </div>

        {/* Hint: transactions exist in other months */}
        {transactions.length === 0 && hasOtherMonthTx && (
          <div className="mt-3 rounded-[var(--r)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)] p-4 text-center" data-testid="other-month-hint">
            <p className="text-xs text-[var(--ink-3)]">
              Geen transacties in {monthLabel}. Er zijn transacties in andere maanden — gebruik ◀ ▶ om te navigeren.
            </p>
            {latestTxDate && (
              <button
                onClick={goToLatestTransaction}
                className="mt-2 inline-flex items-center gap-1.5 rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-1.5 text-xs font-medium text-[var(--ink-2)] hover:bg-[var(--paper)]"
                data-testid="go-to-latest-tx"
              >
                <ChevronRight className="h-3 w-3" />
                Ga naar recentste transactie
              </button>
            )}
          </div>
        )}
          </>
        )}
      </section>
      </HideInSimple>

      {/* === 4. Snelle acties === */}
      {!hideQuickActions && (
        <HideInSimple>
          <section className="mt-5 sm:mt-8">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAddAccount(true)}
                className="inline-flex items-center gap-2 rounded-[var(--r)] border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
              >
                <Wallet className="h-4 w-4" />
                Betaalrekening toevoegen
              </button>
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
            </div>
          </section>
        </HideInSimple>
      )}

      {/* === Kassabon: Inkomsten === */}
      <BottomSheet
        open={showIncomeReceipt}
        onClose={() => setShowIncomeReceipt(false)}
        title="Inkomsten deze maand"
      >
        <KassabonShell>
          <div className="space-y-2">
            {accounts
              .filter((a) => (incomeByAccount.get(a.id) ?? 0) > 0)
              .map((acc) => {
                const amt = incomeByAccount.get(acc.id) ?? 0
                return (
                  <div key={acc.id} className="flex items-center justify-between">
                    <span className="text-[var(--ink-2)]">{acc.name}</span>
                    <span className="font-bold tabular-nums">{<MaskedAmount value={amt} tone="kern" decimals />}</span>
                  </div>
                )
              })}
            <div className="border-t border-dashed border-[var(--border-md)] pt-2 mt-2">
              <div className="flex items-center justify-between font-bold">
                <span>Totaal</span>
                <span className="tabular-nums">{<MaskedAmount value={totalIncome} tone="kern" decimals />}</span>
              </div>
              <FreedomTimeBadge amount={totalIncome} className="mt-1" />
            </div>
          </div>
        </KassabonShell>
      </BottomSheet>

      {/* === Kassabon: Uitgaven === */}
      <BottomSheet
        open={showExpenseReceipt && !expenseReceiptBudgetId}
        onClose={() => setShowExpenseReceipt(false)}
        title="Uitgaven deze maand"
      >
        <KassabonShell>
          <div className="space-y-2">
            {expensesByBudget.map((item) => (
              <div key={item.id} className="flex items-center justify-between">
                <span className="text-[var(--ink-2)]">{item.name}</span>
                <div className="text-right">
                  <span className="font-bold tabular-nums">{<MaskedAmount value={item.amount} tone="kern" decimals />}</span>
                  {item.limit > 0 && (
                    <span className="ml-1 text-[10px] text-[var(--ink-4)]">/ <MaskedAmount value={item.limit} tone="kern" monoWhenVisible={false} /></span>
                  )}
                </div>
              </div>
            ))}
            <div className="border-t border-dashed border-[var(--border-md)] pt-2 mt-2">
              <div className="flex items-center justify-between font-bold">
                <span>Totaal</span>
                <span className="tabular-nums">{<MaskedAmount value={totalExpenses} tone="kern" decimals />}</span>
              </div>
              <FreedomTimeBadge amount={totalExpenses} className="mt-1" />
            </div>
          </div>
        </KassabonShell>
      </BottomSheet>

      {/* === Kassabon: Budget detail === */}
      <BottomSheet
        open={showExpenseReceipt && !!expenseReceiptBudgetId}
        onClose={() => { setShowExpenseReceipt(false); setExpenseReceiptBudgetId(null) }}
        title={expensesByBudget.find((b) => b.id === expenseReceiptBudgetId)?.name ?? 'Budget detail'}
      >
        <KassabonShell>
          <div className="space-y-2">
            {expenseReceiptChildren.length > 0 ? (
              <>
                {expenseReceiptChildren.map((child) => (
                  <div key={child.id} className="flex items-center justify-between">
                    <span className="text-[var(--ink-2)]">{child.name}</span>
                    <div className="text-right">
                      <span className="font-bold tabular-nums">{<MaskedAmount value={child.amount} tone="kern" decimals />}</span>
                      {child.limit > 0 && (
                        <span className="ml-1 text-[10px] text-[var(--ink-4)]">/ <MaskedAmount value={child.limit} tone="kern" monoWhenVisible={false} /></span>
                      )}
                    </div>
                  </div>
                ))}
                <div className="border-t border-dashed border-[var(--border-md)] pt-2 mt-2">
                  <div className="flex items-center justify-between font-bold">
                    <span>Totaal</span>
                    <span className="tabular-nums">
                      {<MaskedAmount value={expensesByBudget.find((b) => b.id === expenseReceiptBudgetId)?.amount ?? 0} tone="kern" decimals />}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between font-bold">
                <span>{expensesByBudget.find((b) => b.id === expenseReceiptBudgetId)?.name ?? ''}</span>
                <span className="tabular-nums">
                  {<MaskedAmount value={expensesByBudget.find((b) => b.id === expenseReceiptBudgetId)?.amount ?? 0} tone="kern" decimals />}
                </span>
              </div>
            )}
          </div>
        </KassabonShell>
      </BottomSheet>

      {/* === Nested account detail modal (embedded mode) === */}
      {/* Gemigreerd naar <ShellOverlay kind="sheet"> (ADR 0039). De
          "Open volledig"-deeplink staat als header-action naast de titel; de
          X-sluitknop levert de shell zelf. */}
      {embedded && (
        <ShellOverlay
          open={Boolean(detailAccountId)}
          onClose={() => setDetailAccountId(null)}
          kind="sheet"
          size="full"
          title={accounts.find((a) => a.id === detailAccountId)?.name ?? 'Rekening'}
          actions={
            detailAccountId ? (
              <Link
                href={`/core/assets/cash/${detailAccountId}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-ed)] px-3 py-1.5 text-xs font-medium text-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-[var(--ink-2)]"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open volledig
              </Link>
            ) : undefined
          }
        >
          {detailAccountId && (
            /* De koppeltoestand reist mee als prop: de rekeningdetail leest 'm
               uit dezelfde loader-bundel als de kaarten hierboven, in plaats van
               'm nóg een keer uit zijn eigen koppelrijen af te leiden (fase 7). */
            <DynCashAccountView
              accountId={detailAccountId}
              embedded
              bankLink={bankLinkRowForAccount(bankLinks, detailAccountId)}
            />
          )}
        </ShellOverlay>
      )}

      {/* === Edit-pane voor handmatige cash-assets (brede modus) === */}
      <QuickAddWizard
        open={showAddAccount}
        onClose={() => setShowAddAccount(false)}
        initialIntent="asset"
        initialAssetType="cash"
        onSaved={() => { void loadAllCashRekeningen() }}
      />

      {editingAsset && (
        <AssetPane
          asset={editingAsset}
          onClose={() => setEditingAsset(null)}
          onChanged={() => { void loadAllCashRekeningen() }}
        />
      )}

      {/* === Herwaardeer-modal voor handmatige cash-assets (brede modus) === */}
      {revalueAsset && (
        <ValuationModal
          entityId={revalueAsset.id}
          entityType="asset"
          entityName={revalueAsset.name}
          entitySubtype={revalueAsset.asset_type}
          netWorthInclusionPct={(revalueAsset as { net_worth_inclusion_pct?: number | null }).net_worth_inclusion_pct ?? 100}
          currentValue={Number(revalueAsset.current_value)}
          onClose={() => setRevalueAsset(null)}
          onSaved={() => { setRevalueAsset(null); void loadAllCashRekeningen() }}
        />
      )}
    </div>
  )
}

// ── Geldstroom-grafiek ────────────────────────────────────────────
//
// SVG-grafiek over de huidige maand. Per dag een groene balk omhoog
// (inkomsten) en rode balk omlaag (uitgaven), plus een dunne lijn die
// het cumulatieve saldo vanaf dag 1 traceert. Footer-strip toont totaal
// in/uit + netto in dezelfde regel zodat de informatie van de oude
// detail-cards niet verloren gaat.

interface CashflowForecast {
  isCurrentMonth: boolean
  daysInMonth: number
  dayOfMonth: number
  projectedExpenses: number
  projectedIncome?: number
  projectedNet: number
  expectedByNow: number
  velocity: number
  forecastSource: 'historical' | 'current_pace' | 'actual'
  forecastPath: Array<{ day: number; cumulative: number }>
}

interface CashflowChartProps {
  data: Array<{ day: number; income: number; expense: number; cumulative: number }>
  netAmount: number
  totalIncome: number
  totalExpenses: number
  totalMonthlyBudget: number
  forecast: CashflowForecast
}

function CashflowChart({
  data,
  netAmount,
  totalIncome,
  totalExpenses,
  totalMonthlyBudget,
  forecast,
}: CashflowChartProps) {
  // Forecast cumulative voor toekomstige dagen — komt rechtstreeks uit
  // `forecast.forecastPath` (per dag), gebaseerd op het historisch
  // dagverloop van de afgelopen 12 maanden. Alleen actief in de huidige
  // maand.
  const todayIdx = forecast.isCurrentMonth
    ? Math.min(forecast.dayOfMonth - 1, data.length - 1)
    : data.length - 1
  const cumToday = data[todayIdx]?.cumulative ?? 0

  // Eén gedeelde y-schaal voor bars (incomes + expenses) én cumulatief-lijn
  // én forecast-curve. Anders meten gebruikers in hun hoofd twee
  // verschillende waardes — een €100-bar leek even hoog als een €5.000-saldo.
  const forecastCumulatives = forecast.forecastPath.map((p) => p.cumulative)
  const allCumValues = [
    ...data.slice(0, todayIdx + 1).map((d) => d.cumulative),
    ...forecastCumulatives,
  ]
  const yMaxRaw = Math.max(
    0,
    ...allCumValues,
    ...data.map((d) => d.income),
  )
  const yMinRaw = Math.min(
    0,
    ...allCumValues,
    ...data.map((d) => -d.expense),
  )

  // Nice-step algoritme voor y-as ticks: round naar 1/2/5×10^n zodat
  // labels schoon zijn (€0, €100, €1.000, …) onafhankelijk van data-range.
  const range = Math.max(yMaxRaw - yMinRaw, 1)
  const niceStep = (() => {
    const target = range / 4
    const exp = Math.floor(Math.log10(target))
    const mag = Math.pow(10, exp)
    const norm = target / mag
    if (norm < 1.5) return 1 * mag
    if (norm < 3) return 2 * mag
    if (norm < 7) return 5 * mag
    return 10 * mag
  })()
  const yMax = Math.ceil(yMaxRaw / niceStep) * niceStep || niceStep
  const yMin = Math.floor(yMinRaw / niceStep) * niceStep
  const ySpan = Math.max(yMax - yMin, niceStep)

  const ticks: number[] = []
  for (let v = yMin; v <= yMax + niceStep * 0.001; v += niceStep) {
    // Rond naar dichtstbijzijnde integer-cent om floating-point-drift weg te
    // werken bij kleine stappen.
    ticks.push(Math.round(v * 100) / 100)
  }

  const W = 640
  const H = 200
  const padLeft = 56 // ruimte voor y-as labels
  const padX = 8
  const padTop = 8
  const padBottom = 20
  const innerW = W - padLeft - padX
  const innerH = H - padTop - padBottom

  const yToPixel = (v: number) => padTop + innerH - ((v - yMin) / ySpan) * innerH
  const baselineY = yToPixel(0)

  const slotW = innerW / data.length
  const barW = Math.max(2, slotW * 0.55)

  const xForIdx = (i: number) => padLeft + slotW * i + slotW / 2

  // Cumulatieve lijn t/m vandaag (massief).
  const actualLinePath = data
    .slice(0, todayIdx + 1)
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xForIdx(i).toFixed(2)} ${yToPixel(d.cumulative).toFixed(2)}`)
    .join(' ')

  // Forecast-curve — gestippeld vanaf vandaag, volgt het historisch
  // dagverloop. We starten het pad bij (todayIdx, cumToday) en plotten
  // vervolgens elk forecast-punt; door dezelfde y-schaal te delen sluit
  // de curve naadloos aan op het actual-pad.
  const showForecast = forecast.isCurrentMonth && forecast.forecastPath.length > 0
  const forecastStartX = xForIdx(todayIdx)
  const forecastStartY = yToPixel(cumToday)
  const forecastPathStr = showForecast
    ? `M ${forecastStartX.toFixed(2)} ${forecastStartY.toFixed(2)} ` +
      forecast.forecastPath
        .map((p) => {
          const x = xForIdx(p.day - 1)
          const y = yToPixel(p.cumulative)
          return `L ${x.toFixed(2)} ${y.toFixed(2)}`
        })
        .join(' ')
    : ''

  const labelDays = data
    .map((d) => d.day)
    .filter((d) => d === 1 || d === data.length || d % 5 === 0)

  const hasActivity = data.some((d) => d.income > 0 || d.expense > 0)

  // Snelheid-tone: <90% goed, 90-110% op tempo, >110% te snel.
  const velocityPct = forecast.velocity * 100
  const velocityTone =
    !forecast.isCurrentMonth || forecast.expectedByNow === 0
      ? 'text-[var(--ink-2)]'
      : velocityPct < 90
        ? 'text-emerald-600'
        : velocityPct <= 110
          ? 'text-[var(--ink-2)]'
          : 'text-red-600'
  const velocityLabel =
    !forecast.isCurrentMonth || forecast.expectedByNow === 0
      ? '—'
      : velocityPct < 90
        ? 'rustig'
        : velocityPct <= 110
          ? 'op tempo'
          : 'te snel'

  // Forecast-tone: prognose binnen budget = goed, daarboven = rood.
  const forecastOverBudget =
    forecast.isCurrentMonth &&
    totalMonthlyBudget > 0 &&
    forecast.projectedExpenses > totalMonthlyBudget
  const forecastTone = forecast.isCurrentMonth
    ? forecastOverBudget
      ? 'text-red-600'
      : 'text-[var(--ink-2)]'
    : 'text-[var(--ink-3)]'

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-[200px] w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Geldstroom per dag"
      >
        {/* Y-as gridlines + labels — stille horizontale rules + bedrag links */}
        {ticks.map((tick) => {
          const y = yToPixel(tick)
          const isZero = tick === 0
          return (
            <g key={tick}>
              <line
                x1={padLeft}
                x2={W - padX}
                y1={y}
                y2={y}
                stroke={isZero ? 'var(--border-md)' : 'var(--border-md)'}
                strokeWidth={isZero ? 1 : 0.5}
                opacity={isZero ? 1 : 0.4}
                strokeDasharray={isZero ? '' : '2 3'}
              />
              <text
                x={padLeft - 6}
                y={y + 3}
                textAnchor="end"
                fontSize={9}
                fill="var(--ink-4)"
                fontFamily="var(--font-mono, ui-monospace)"
              >
                {formatCurrencyShort(tick)}
              </text>
            </g>
          )
        })}

        {/* Vandaag-marker (verticale stippellijn) */}
        {forecast.isCurrentMonth && todayIdx < data.length - 1 && (
          <line
            x1={forecastStartX}
            x2={forecastStartX}
            y1={padTop}
            y2={padTop + innerH}
            stroke="var(--ink-4)"
            strokeWidth={1}
            strokeDasharray="2 3"
            opacity={0.6}
          />
        )}

        {/* Per-dag bars — alleen voor actuals (t/m vandaag in current month).
            Gebruikt dezelfde y-schaal als de cumulatief-lijn: een €100-bar
            staat exact op €100 op de y-as, naast een eventuele €5.000-saldolijn. */}
        {data.map((d, i) => {
          if (forecast.isCurrentMonth && i > todayIdx) return null
          const xCenter = xForIdx(i)
          const incTop = yToPixel(d.income)
          const expBottom = yToPixel(-d.expense)
          return (
            <g key={d.day}>
              {d.income > 0 && (
                <rect
                  x={xCenter - barW / 2}
                  y={incTop}
                  width={barW}
                  height={Math.max(0, baselineY - incTop)}
                  fill="var(--positive)"
                  opacity={0.85}
                />
              )}
              {d.expense > 0 && (
                <rect
                  x={xCenter - barW / 2}
                  y={baselineY}
                  width={barW}
                  height={Math.max(0, expBottom - baselineY)}
                  fill="var(--negative)"
                  opacity={0.8}
                />
              )}
            </g>
          )
        })}

        {/* Cumulatief saldo-lijn t/m vandaag */}
        {hasActivity && actualLinePath && (
          <path
            d={actualLinePath}
            fill="none"
            stroke="var(--ink-2)"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* Forecast-curve — gestippeld, volgt historisch dagpatroon */}
        {showForecast && (
          <path
            d={forecastPathStr}
            fill="none"
            stroke={forecastOverBudget ? 'var(--negative)' : 'var(--ink-3)'}
            strokeWidth={1.5}
            strokeDasharray="3 3"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {labelDays.map((day) => {
          const x = xForIdx(day - 1)
          return (
            <text
              key={day}
              x={x}
              y={H - 4}
              textAnchor="middle"
              fontSize={10}
              fill="var(--ink-4)"
              fontFamily="var(--font-mono, ui-monospace)"
            >
              {day}
            </text>
          )
        })}
      </svg>

      {!hasActivity && (
        <p className="mt-2 text-center text-xs italic text-[var(--ink-4)]" style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}>
          Geen transacties deze maand
        </p>
      )}

      {/* Footer-strip: 4 KPI's — Inkomsten · Uitgaven (vs budget) · Snelheid · Prognose */}
      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--border-ed)] pt-3 sm:grid-cols-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">Inkomsten</div>
          <div className="font-mono text-sm font-semibold tabular-nums text-positive">
            {<MaskedAmount value={totalIncome} tone="kern" decimals />}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">Uitgaven</div>
          <div className="font-mono text-sm font-semibold tabular-nums text-negative">
            {<MaskedAmount value={totalExpenses} tone="kern" decimals />}
          </div>
          {totalMonthlyBudget > 0 && (
            <div className="mt-0.5 font-mono text-[10px] tabular-nums text-[var(--ink-4)]">
              van {<MaskedAmount value={totalMonthlyBudget} tone="kern" decimals />}
            </div>
          )}
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">Snelheid</div>
          <div className={`font-mono text-sm font-semibold tabular-nums ${velocityTone}`}>
            {forecast.isCurrentMonth && forecast.expectedByNow > 0
              ? `${velocityPct.toFixed(0)}%`
              : '—'}
          </div>
          <div
            className="mt-0.5 text-[10px] italic text-[var(--ink-4)]"
            style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
          >
            {velocityLabel}
          </div>
        </div>
        <div className="text-left sm:text-right">
          <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
            {forecast.isCurrentMonth ? 'Prognose' : 'Netto'}
          </div>
          <div className={`text-sm font-semibold ${forecast.isCurrentMonth ? forecastTone : netAmount >= 0 ? 'text-positive' : 'text-negative'}`}>
            {forecast.isCurrentMonth
              ? <MaskedAmount value={forecast.projectedExpenses} tone="kern" decimals className="text-sm font-semibold" />
              : <MaskedAmount value={netAmount} signPrefix={netAmount >= 0 ? '+' : ''} tone="kern" decimals className="text-sm font-semibold" />}
          </div>
          {forecast.isCurrentMonth && (
            <div className="mt-0.5 font-mono text-[10px] tabular-nums text-[var(--ink-4)]">
              {totalMonthlyBudget > 0
                ? forecastOverBudget
                  ? <><MaskedAmount value={forecast.projectedExpenses - totalMonthlyBudget} signPrefix="+" tone="kern" decimals /> over</>
                  : <><MaskedAmount value={totalMonthlyBudget - forecast.projectedExpenses} tone="kern" decimals /> ruimte</>
                : forecast.forecastSource === 'historical'
                  ? 'o.b.v. 12 mnd'
                  : 'o.b.v. tempo'}
            </div>
          )}
          {forecast.isCurrentMonth && totalMonthlyBudget > 0 && (
            <div
              className="mt-0.5 text-[10px] italic text-[var(--ink-4)]"
              style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
            >
              {forecast.forecastSource === 'historical' ? 'o.b.v. 12 mnd historie' : 'o.b.v. huidig tempo'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
