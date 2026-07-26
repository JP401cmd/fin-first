'use client'

import { useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Plus, BarChart3, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { MaskedAmount } from '@/components/app/masked-amount'
import {
  type Debt,
  type DebtType,
  type PayoffStrategy,
  DEBT_TYPE_LABELS,
  DEBT_TYPE_ICONS,
  DEBT_TYPE_COLORS,
} from '@/lib/debt-data'
import type { Asset } from '@/lib/asset-data'
import type { Perspective } from '@/lib/household-data'
import {
  deriveHousingContext,
  parseHousingStrategy,
  shouldShowDualHousingBasis,
  type HousingStrategyConfig,
} from '@/lib/housing-strategy'
import { usePerspective, usePerspectiveAbort } from '@/components/app/perspective-provider'
import { PerspectiveContextLabel } from '@/components/app/perspective-context-label'
import { PrivacyHiddenNotice } from '@/components/app/privacy-hidden-notice'
import {
  loadPerspectiveData,
  type PerspectiveContext,
} from '@/lib/household/perspective-loader'
import { formatOwnershipSubline } from '@/lib/household-data'
import { DebtPayoffStrategy } from '@/components/core/deepenings/debt-payoff-strategy'
import { OVERLAY_QUERY_KEYS } from '@/lib/navigation'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'

// Detail-flow draait via `<DebtPane>` — dezelfde slide-in pane als op
// `/core/debts/[type]`. URL-driven via `?debt=<id>` zodat deeplinks en
// browser-back symmetrisch werken met de categorie-pagina's.
import type { Valuation } from '@/components/app/core/debts/debt-types'
import { DebtPane } from '@/components/app/core/debts/debt-pane'
import { ValuationModal as DebtValuationModal } from '@/components/app/core/debts/debt-valuation-modal'
import { QuickAddWizard } from '@/components/app/quick-add-wizard/quick-add-wizard'
import { EmptyState as QuickAddEmptyState } from '@/components/app/quick-add-wizard/empty-state'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { VermogenDebtCard } from '@/components/core/vermogen-debt-card'
import { AddCategoryCard } from '@/components/core/add-category-card'
import { CategoryGroupHeader } from '@/components/core/category-group-header'
import { EenvoudigPillList, type PillItem } from '@/components/overview/eenvoudig-pill-list'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'
import { Kicker, FiguresStrip, PageInfoButton, GlossaryTerm, PageOpening, SubtotalLine } from '@/components/editorial'
import { PAGE_INFO } from '@/lib/page-info-content'
import { loadEntitySparklines } from '@/lib/load-entity-sparklines'
import { buildKpiContext } from '@/lib/kpi-context'
import { computeDebtKpi } from '@/lib/debt-kpi'
import type { KpiPair } from '@/lib/asset-kpi'

// ── Types ───────────────────────────────────────────────────

/**
 * Een schuld zoals de perspectief-loader hem stempelt: de rauwe DB-rij plus
 * provenance + aandeel + eventuele privacy-aggregaatvlag. `current_balance`
 * blijft altijd de VOLLEDIGE saldo-waarde — het aandeel zit in
 * `_myShareFraction` zodat de aflos-engine op volledige balances kan draaien
 * (fractionele amortisatie is onzin) terwijl headline-cijfers wel schalen.
 */
export type PerspectiveDebt = Debt & {
  _provenance: 'eigen' | 'partner' | 'gezamenlijk'
  _myShareFraction: number
  _aggregated?: boolean
  _aggregatedCount?: number
}

/**
 * Server-geseede first-paint-data. De server-shells (`/core/debts` +
 * `/overzicht/schulden`) laden dit via `loadDebtsPageData` (RLS-cookie-client,
 * geen service-role) en geven het als prop mee, zodat de eerste render meteen
 * content toont i.p.v. een fullscreen-spinner. `perspective` is het perspectief
 * (tf_perspective-cookie) waarvoor de seed is samengesteld — de client slaat de
 * eerste client-fetch over zolang dit gelijk is aan het actieve perspectief.
 */
export interface DebtsInitialData {
  perspective: Perspective
  debts: PerspectiveDebt[]
  context: PerspectiveContext
  assets: Asset[]
  housingStrategyConfig: unknown
}

const DEBT_ITEM_NOUN: Record<DebtType, string> = {
  mortgage: 'hypotheek',
  personal_loan: 'lening',
  student_loan: 'studielening',
  car_loan: 'autolening',
  credit_card: 'creditcard',
  revolving_credit: 'krediet',
  payment_plan: 'regeling',
  belastingschuld: 'belastingschuld',
  familielening: 'familielening',
  dga_schuld: 'DGA-schuld',
  other: 'schuld',
}

function addDebtCta(type: DebtType): string {
  return `Voeg ${DEBT_ITEM_NOUN[type]} toe`
}

/** Sorteer schulden op sort_order — één plek zodat seed en her-fetch identiek zijn. */
function sortDebts(rows: PerspectiveDebt[]): PerspectiveDebt[] {
  return [...rows].sort(
    (a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0),
  )
}

// ── Component ───────────────────────────────────────────────

/**
 * `/core/debts` — registratie-overzicht van schulden.
 *
 * Dezelfde structuur als `/core/assets`: hero met totaal en aantal,
 * gegroepeerd per `debt_type` met klikbare type-headers die door-linken
 * naar `/core/debts/[type]`. Klikken op een individuele schuld opent het
 * bestaande detail-modal-patroon.
 *
 * Bewust géén aflossingsstrategie, freedom-time of Box 3-content meer in
 * dit overzicht — die noise is verhuisd naar dedicated pagina's. Overzicht
 * is een registratie-fundament, niet een berekenings-tool.
 *
 * Dit is het client-eiland; de server-shells (`page.tsx` +
 * `overzicht/schulden/page.tsx`) laden de data server-side en seeden het via
 * `initialData` zodat de first paint content bevat (content-first).
 */
type DebtsPageProps = {
  /** Filter-control die naast de "Schuld toevoegen"-knop rendert. Doorgegeven
   *  vanaf `/overzicht/schulden` zodat de filter in de toolbar zit i.p.v.
   *  een aparte rij erboven. Optioneel zodat `/core/debts` zonder filter
   *  blijft werken. */
  toolbarFilter?: ReactNode
  /** Wanneer gezet: client-side filter op debt-type. Verbergt alle
   *  categorie-groepen behalve die met het gefilterde type. Wordt
   *  gecontroleerd door de page-wrapper die ook `toolbarFilter` rendert
   *  zodat dropdown en lijst in sync blijven. */
  debtTypeFilter?: DebtType | null
  /** Server-geseede first-paint-data (zie `DebtsInitialData`). Aanwezig →
   *  content-first render zonder spinner en zonder eerste client-fetch;
   *  afwezig (bv. in tests of bij een server-load-fout) → oude client-fetch
   *  op mount, byte-identiek aan voorheen. */
  initialData?: DebtsInitialData
  /** Verberg de ingebouwde PageInfoButton in de PageOpening. Default `true`
   *  (standalone `/core/debts`). Ge-embed via `<SchuldenView>` op
   *  `/overzicht/schulden` rendert de page-shell zélf de `i` (+ statuspunt);
   *  dan `false` om een dubbele info-knop te voorkomen. */
  showPageInfo?: boolean
}

export function DebtsClient({ toolbarFilter, debtTypeFilter, initialData, showPageInfo = true }: DebtsPageProps = {}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  // /overzicht/schulden toont nieuwe overzicht-tekst; legacy /core/debts blijft fallback
  const pageInfoText = (pathname && PAGE_INFO[pathname]) || PAGE_INFO['/core/debts']

  // URL-driven pane-state: `?debt=<id>` opent de slide-in pane voor die
  // schuld. Consistent met `/core/debts/[type]` (debt-category-page.tsx).
  const requestedDebtId = searchParams.get('debt')
  // URL-driven strategie-keuze voor de "Schuldenprofiel & Aflosroute"-kaart.
  // Deeplink-vriendelijk en symmetrisch met `?debt=...` — een geldige waarde
  // valt direct in de juiste segmented-control. Onbekende waarden vallen
  // terug op `avalanche` (bespaart de meeste rente per simulatie).
  const requestedStrategie = searchParams.get(OVERLAY_QUERY_KEYS.strategie)

  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [quickAddInitialType, setQuickAddInitialType] = useState<DebtType | null>(null)
  // Seed-aware init: bij server-seed toont de eerste render meteen de schulden
  // (gesorteerd zoals loadDebts) i.p.v. een lege lijst achter de spinner.
  const [debts, setDebts] = useState<PerspectiveDebt[]>(() =>
    initialData ? sortDebts(initialData.debts) : [],
  )
  const [ctx, setCtx] = useState<PerspectiveContext | null>(initialData?.context ?? null)
  const [valuationsByDebtId, setValuationsByDebtId] = useState<Record<string, Valuation[]>>({})
  const [userAssets, setUserAssets] = useState<Asset[]>(initialData?.assets ?? [])
  // Woonstrategie-config (JSONB op `profiles`) — bepaalt of de dubbele
  // grondslag (incl./excl. eigen woning) getoond wordt. Default = include_full
  // tot geladen, zodat het extra subtotaal niet flikkert bij de eerste render.
  // Bij server-seed meteen de echte config zodat het subtotaal niet ná
  // hydratie inklapt/verschijnt.
  const [housingStrategy, setHousingStrategy] = useState<HousingStrategyConfig>(() =>
    parseHousingStrategy(initialData ? initialData.housingStrategyConfig : null),
  )
  // Per-debt sparkline-historie (12 maanden) voor de breuklijn-overlay op
  // VermogenDebtCard. Zelfde shape als asset-categorie-pagina.
  const [debtSparklines, setDebtSparklines] = useState<Record<string, number[]>>({})
  // Bij server-seed is de first-paint-data er al → geen spinner. Zonder seed
  // (tests / server-load-fout) start de pagina in laadtoestand zoals voorheen.
  const [loading, setLoading] = useState(initialData == null)
  const [error, setError] = useState<string | null>(null)
  // Aflosroute-kaart open/dicht. Gesloten by default zodat de pagina rustig
  // start; gebruiker klapt 'm open zodra ze de strategie willen verkennen.
  const [aflosrouteOpen, setAflosrouteOpen] = useState(false)
  const { masked } = useMaskedAmounts()
  const fc = useCallback((v: number) => formatMaskedCurrency(v, masked), [masked])

  const { perspective, loading: perspectiveLoading } = usePerspective()
  const perspectiveSignal = usePerspectiveAbort(perspective)
  // Weergavemodus — in 'simple' rendert de schuldenlijst als compacte
  // pill-lijst i.p.v. het kaart-grid. Zelfde host levert alle data/groepering.
  const simple = useDisplayMode().mode === 'simple'

  // Het perspectief dat onze huidige `debts`/`ctx`-state weerspiegelt. Bij seed
  // = het seed-perspectief; zonder seed = nog niets geladen (null).
  const hasSeed = initialData != null
  const loadedPerspectiveRef = useRef<Perspective | null>(
    initialData ? initialData.perspective : null,
  )

  // Perspectief voor de AFGELEIDE cijfers/labels (shareOf, totalen, ownership-
  // subline, kaart-props). Tijdens SSR en de eerste client-render staat de
  // PerspectiveProvider nog op zijn provisorische 'personal' (hij resolvet het
  // echte perspectief pas async via /api/perspective → `perspectiveLoading`).
  // Zou de afgeleide rekenlogica dán op 'personal' draaien terwijl de seed voor
  // household/partner is samengesteld, dan flitsen er verkeerde totalen tot de
  // provider resolvet. Daarom: zolang we een seed hebben ÉN de provider nog
  // resolvet, reken met het seed-perspectief — dat matcht de geseede rijen. Na
  // resolutie is dit exact `perspective` (== cookie in het normale geval), dus
  // naadloos en zonder hydratie-mismatch (SSR == eerste client-render). De
  // FETCH-logica (loadDebts/abort) blijft op het echte `perspective` draaien.
  const effectivePerspective: Perspective =
    hasSeed && perspectiveLoading ? initialData.perspective : perspective

  // ── Data laden ─────────────────────────────────────────────
  //
  // Eén bron van waarheid: de perspectief-loader levert eigen + gedeelde +
  // (privacy-gated) partner-schulden, reeds gestempeld met `_provenance` en
  // `_myShareFraction`. Geen bespoke ownership-query of handmatige
  // partner-privacy-fetch meer — de loader past privacy server-side toe
  // (partner 'hidden' → partner-schulden simpelweg afwezig; 'totals' → één
  // aggregaatrij met `_aggregated:true`).

  const loadDebts = useCallback(async (signal?: AbortSignal) => {
    try {
      const supabase = createClient()
      const { debts: loadedDebts, context } = await loadPerspectiveData(supabase, perspective)
      if (signal?.aborted) return

      // sort_order behouden zoals de oude query (loader sorteert niet).
      const sorted = sortDebts(loadedDebts as unknown as PerspectiveDebt[])
      setCtx(context)
      setDebts(sorted)
    } catch (err) {
      console.error('Error loading debts:', err)
      if (!signal?.aborted) setError('Kon schulden niet laden. Probeer het opnieuw.')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [perspective])

  // Lazy-load valuations zodra een specifieke schuld geselecteerd wordt —
  // pane gebruikt dit voor de waarde-historie sectie.
  const loadValuations = useCallback(async (debtId: string) => {
    const supabase = createClient()
    const { data } = await supabase
      .from('valuations')
      .select('*')
      .eq('entity_id', debtId)
      .eq('entity_type', 'debt')
      .order('valuation_date', { ascending: false })
      .limit(20)
    if (data) {
      setValuationsByDebtId((prev) => ({ ...prev, [debtId]: data as Valuation[] }))
    }
  }, [])

  const loadUserAssets = useCallback(async () => {
    const supabase = createClient()
    // KPI-context heeft `current_value` + `linked_asset_id` nodig voor LTV
    // op hypotheken. Zonder die velden kan `buildKpiContext` geen
    // linkedAssetValueByDebtId opbouwen en blijft de LTV-KPI leeg.
    const { data } = await supabase
      .from('assets')
      .select('id, name, asset_type, current_value, linked_asset_id, is_active')
      .eq('is_active', true)
      .order('name')
    if (data) setUserAssets(data as Asset[])
  }, [])

  // Woonstrategie-config lezen — één lichte eigen-rij fetch. Bepaalt samen met
  // `deriveHousingContext` of de dubbele grondslag (incl./excl. eigen woning)
  // relevant is. Failure is non-fataal: default `include_full` → geen subtotaal.
  const loadHousingStrategy = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('profiles')
      .select('housing_strategy_config')
      .single()
    setHousingStrategy(parseHousingStrategy(data?.housing_strategy_config ?? null))
  }, [])

  useEffect(() => {
    // Content-first seeding: zolang de perspectief-provider nog resolvet
    // (`perspectiveLoading`) EN we een seed hebben, vertrouwen we de server-
    // geseede data — anders zou de provisorische 'personal'-startwaarde van de
    // provider een fetch triggeren die de (correcte) household/partner-seed
    // overschrijft. Zodra de provider resolvet: sla de fetch over als het
    // actieve perspectief al door onze state gedekt wordt (seed-hit = de winst),
    // fetch anders (perspectief-wissel, of stale seed). Zonder seed valt dit
    // terug op het oude gedrag: direct fetchen bij mount.
    if (hasSeed && perspectiveLoading) return
    if (loadedPerspectiveRef.current === perspective) return
    loadedPerspectiveRef.current = perspective
    const signal = perspectiveSignal
    loadDebts(signal)
    loadUserAssets()
    loadHousingStrategy()
  }, [hasSeed, perspective, perspectiveLoading, perspectiveSignal, loadDebts, loadUserAssets, loadHousingStrategy])

  // ── Per-debt sparklines voor de cards-grid ──────────────────
  // Eén batched query op `balance_snapshots` zodra debts geladen zijn.
  // Failure is non-fataal: lege map → kaarten zonder breuklijn-overlay.
  useEffect(() => {
    const activeDebtIds = debts
      .filter((d) => !d._aggregated && d.is_active && Number(d.current_balance) > 0)
      .map((d) => d.id)
    if (activeDebtIds.length === 0) {
      setDebtSparklines({})
      return
    }
    const supabase = createClient()
    let cancelled = false
    loadEntitySparklines(supabase, 'debt', activeDebtIds)
      .then((sparklines) => { if (!cancelled) setDebtSparklines(sparklines) })
      .catch(() => { if (!cancelled) setDebtSparklines({}) })
    return () => { cancelled = true }
  }, [debts])

  // ── Pane-state setters ─────────────────────────────────────

  // URL-state setter — opent/sluit de pane via shallow route-replace zodat
  // deeplinks deelbaar zijn en browser-back de pane sluit zonder van pagina
  // te wisselen. Optionele `editMode` zet `edit=1` voor één-klik bewerken
  // vanaf de kaart. Bij sluiten (`id === null`) worden alle keys gestript.
  const setSelectedDebtId = useCallback(
    (id: string | null, editMode = false) => {
      const params = new URLSearchParams(searchParams.toString())
      params.delete('edit')
      if (id) {
        params.set('debt', id)
        if (editMode) params.set('edit', '1')
      } else {
        params.delete('debt')
      }
      const queryString = params.toString()
      router.replace(`/core/debts${queryString ? `?${queryString}` : ''}`, { scroll: false })
    },
    [router, searchParams],
  )

  // Valideer de URL-waarde tegen de bekende strategie-set. Onbekende of
  // ontbrekende waarden vallen terug op `avalanche` (default in de engine).
  const VALID_STRATEGIES: readonly PayoffStrategy[] = useMemo(
    () => ['snowball', 'avalanche', 'highest_balance', 'custom'] as const,
    [],
  )
  const strategieFromUrl: PayoffStrategy = useMemo(() => {
    if (
      requestedStrategie &&
      (VALID_STRATEGIES as readonly string[]).includes(requestedStrategie)
    ) {
      return requestedStrategie as PayoffStrategy
    }
    return 'avalanche'
  }, [requestedStrategie, VALID_STRATEGIES])

  // URL-sync voor de strategie-keuze. We schrijven alleen wanneer de waarde
  // verandert om history-vervuiling te voorkomen. `avalanche` (default) komt
  // niet in de URL terecht — net als andere "default"-states blijft de URL
  // dan kort.
  const setStrategieInUrl = useCallback(
    (s: PayoffStrategy) => {
      const params = new URLSearchParams(searchParams.toString())
      if (s === 'avalanche') {
        params.delete(OVERLAY_QUERY_KEYS.strategie)
      } else {
        params.set(OVERLAY_QUERY_KEYS.strategie, s)
      }
      const queryString = params.toString()
      router.replace(`/core/debts${queryString ? `?${queryString}` : ''}`, { scroll: false })
    },
    [router, searchParams],
  )

  // Auto-open de kaart wanneer de gebruiker via deeplink `?strategie=…` arriveert
  // — anders zou de query-param opnieuw moeten worden geactiveerd met een klik.
  useEffect(() => {
    if (requestedStrategie) setAflosrouteOpen(true)
  }, [requestedStrategie])

  // Geselecteerde debt = lookup uit lijst o.b.v. URL-state.
  const selectedDebt = useMemo(
    () => debts.find((d) => d.id === requestedDebtId) ?? null,
    [debts, requestedDebtId],
  )

  // Lazy-load valuations zodra een schuld via URL-state geselecteerd wordt —
  // de pane heeft de waarde-historie nodig voor de view-mode-charts.
  useEffect(() => {
    if (!selectedDebt) return
    if (valuationsByDebtId[selectedDebt.id]) return
    loadValuations(selectedDebt.id)
  }, [selectedDebt, valuationsByDebtId, loadValuations])

  function openDebtModal(debt: Debt) {
    // Klik op de kaart-body opent de view-modal op de categoriepagina van de
    // schuld: `/core/debts/[type]?debt=<id>`. De categoriepagina leest `?debt=`
    // zelf uit de URL. `router.push` zodat browser-Back terugkeert naar dit
    // overzicht. Snelle acties (Saldo bijwerken / Bewerken) openen wél ter
    // plekke — zie handleDebtRevalue / handleDebtEdit.
    router.push(`/core/debts/${debt.debt_type}?debt=${debt.id}`)
  }

  // Direct revaluation-target — gezet door de "Saldo bijwerken"-knop op een
  // kaart. Opent uitsluitend de ValuationModal (sheet), zonder eerst de
  // detail-pane.
  const [revalueDebt, setRevalueDebt] = useState<Debt | null>(null)

  // Snelle acties vanuit de kaart-actie-rij. Bewerken opent de detail-pane
  // direct in edit-mode; Saldo bijwerken opent ALLEEN de ValuationModal als
  // sibling-sheet, zonder de pane ertussen.
  const handleDebtEdit = useCallback(
    (debtId: string) => setSelectedDebtId(debtId, true),
    [setSelectedDebtId],
  )
  const handleDebtRevalue = useCallback(
    (debtId: string) => {
      const debt = debts.find((d) => d.id === debtId)
      if (debt) setRevalueDebt(debt)
    },
    [debts],
  )

  // ── Afgeleide waarden ──────────────────────────────────────

  // Het perspectief-correcte aandeel van een waarde: gedeelde items schalen
  // mee in eigen/partner-view (`* _myShareFraction`), in huishouden-view en
  // voor persoonlijke items telt de volle waarde. Aggregaatrijen (privacy
  // 'totalen') dragen ownership 'personal' + fractie 1 → volle som.
  const shareOf = useCallback(
    (debt: PerspectiveDebt, raw: number): number =>
      debt.ownership === 'shared' && effectivePerspective !== 'household'
        ? raw * (debt._myShareFraction ?? 1)
        : raw,
    [effectivePerspective],
  )

  // Privacy-aggregaatrijen (één "Partner schulden (totaal)"-kaart) staan los
  // van de echte, bewerkbare schulden. Echte schulden voeden grouping, KPI's,
  // sparklines en de aflos-engine; de aggregaatrij rendert als losse kaart.
  const aggregatedDebts = debts.filter((d) => d._aggregated)
  const realDebts = debts.filter((d) => !d._aggregated)
  const activeDebts = realDebts.filter((d) => d.is_active && Number(d.current_balance) > 0)

  // Headline-totalen schalen mee met het perspectief (aandeel van gedeeld).
  // De aggregaatrij draagt zijn volledige (reeds gesommeerde) saldo mee.
  const totalBalance =
    activeDebts.reduce((s, d) => s + shareOf(d, Number(d.current_balance)), 0) +
    aggregatedDebts.reduce((s, d) => s + Number(d.current_balance), 0)

  // ── Dubbele grondslag: subtotaal excl. eigen woning ────────────
  // De aan de eigen woning gekoppelde hypotheek(en) — canoniek bepaald via
  // `deriveHousingContext` (mortgage + linked_asset_id → actief eigen_huis).
  // Het "excl. eigen woning"-subtotaal draait EXACT dezelfde aandeel-gewogen
  // `totalBalance`-reduce, maar dan op de lijst ZONDER die hypotheken —
  // weging-consistent (perspectief/partner-aandeel blijft upstream input),
  // NIET een los ongewogen hypotheekbedrag aftrekken.
  const housingContext = deriveHousingContext(userAssets, realDebts)
  const showDualHousingBasis =
    shouldShowDualHousingBasis(housingContext, housingStrategy) && activeDebts.length > 0
  const eigenHuisMortgageIds = new Set(housingContext.eigenHuisMortgages.map((m) => m.id))
  const totalBalanceExHome =
    activeDebts
      .filter((d) => !eigenHuisMortgageIds.has(d.id))
      .reduce((s, d) => s + shareOf(d, Number(d.current_balance)), 0) +
    aggregatedDebts.reduce((s, d) => s + Number(d.current_balance), 0)
  const totalMonthlyPayment = activeDebts.reduce(
    (s, d) => s + shareOf(d, Number(d.monthly_payment ?? 0)),
    0,
  )
  // Gewogen gemiddelde rente — met (aandeel-gewogen) current_balance als
  // weegfactor, zodat grote hypotheken zwaarder meetellen dan een kleine
  // creditcard. Aggregaatrijen hebben geen rente-detail en blijven buiten
  // de weging.
  const interestWeightBase = activeDebts.reduce(
    (s, d) => s + shareOf(d, Number(d.current_balance)),
    0,
  )
  const weightedAvgInterest = interestWeightBase > 0
    ? activeDebts.reduce(
        (s, d) => s + Number(d.interest_rate ?? 0) * shareOf(d, Number(d.current_balance)),
        0,
      ) / interestWeightBase
    : 0

  // Group by type — analoog aan `assets-client.tsx`. Per-type totaal is
  // perspectief-correct (aandeel-gewogen) zodat de CategoryGroupHeader hetzelfde
  // cijfer toont als de headline optelt.
  const byType = (Object.keys(DEBT_TYPE_LABELS) as DebtType[]).reduce(
    (acc, type) => {
      const items = activeDebts.filter(d => d.debt_type === type)
      acc[type] = {
        debts: items,
        total: items.reduce((s, d) => s + shareOf(d, Number(d.current_balance)), 0),
      }
      return acc
    },
    {} as Record<DebtType, { debts: PerspectiveDebt[]; total: number }>,
  )

  // ── Pill-items voor de Eenvoudig-weergave ────────────────────
  // Eén PLATTE lijst over alle categorieën heen: géén CategoryGroupHeader-
  // koppen meer; categorie loopt uitsluitend via het pill-icoon (type-naam +
  // type-kleur). Spiegelt de icoon/kleur/klik-keuzes van het kaart-grid en de
  // perspectief-correcte waarde (`shareOf`) + dezelfde sparkline-serie
  // (`debtSparklines`). Géén nieuwe data-bron.
  //
  // Partner-aggregaatrijen (privacy='totalen', géén debt_type) lopen als
  // gewone pills mee aan het eind — fallback-icoon/-kleur zoals de aggregaat-
  // kaart ('other'), zonder sparkline (geen historie). Read-only (geen klik).
  const debtPillItems = useMemo<PillItem[]>(() => {
    const items = (Object.keys(DEBT_TYPE_LABELS) as DebtType[])
      .filter((type) => !debtTypeFilter || type === debtTypeFilter)
      .flatMap((type): PillItem[] => {
        const group = byType[type]
        if (!group || group.debts.length === 0) return []
        const iconName = DEBT_TYPE_ICONS[type] ?? 'CircleDot'
        const iconColor = DEBT_TYPE_COLORS[type]
        return group.debts.map((debt) => ({
          id: debt.id,
          name: debt.name,
          iconName,
          iconColor,
          amount: shareOf(debt, Number(debt.current_balance)),
          sparklineValues: debtSparklines[debt.id],
          onClick: () => openDebtModal(debt),
        }))
      })

    // Partner-aggregaat als pills (optie A) — alleen buiten een type-filter,
    // zelfde conditie als het kaart-grid (aggregatedDebts.length > 0).
    if (!debtTypeFilter) {
      for (const debt of aggregatedDebts) {
        items.push({
          id: debt.id,
          name: debt.name,
          iconName: DEBT_TYPE_ICONS.other ?? 'CircleDot',
          iconColor: DEBT_TYPE_COLORS.other,
          amount: Number(debt.current_balance),
        })
      }
    }
    // Aandeel van elke post in het getoonde totaal (voor de balk in de pill).
    const total = items.reduce((s, it) => s + it.amount, 0)
    if (total > 0) for (const it of items) it.sharePct = (it.amount / total) * 100
    return items
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byType, debtTypeFilter, shareOf, debtSparklines, aggregatedDebts])

  // "Partner schulden privé"-notice: in huishouden/partner-view met partner
  // maar geen enkele partner-schuld zichtbaar (privacy 'hidden' → loader laat
  // ze weg, geen aggregaatrij). We berekenen de privacy niet meer zelf; de
  // afwezigheid van partner-data ís het signaal.
  const partnerDebtsHidden =
    !!ctx?.hasHousehold &&
    effectivePerspective !== 'personal' &&
    !debts.some((d) => d._provenance === 'partner')

  // ── KPI's per schuld (zelfde patroon als debt-category-page) ──
  // userAssets levert linked_asset_id + current_value voor mortgage LTV.
  // computeDebtKpi heeft alleen DebtKpiContext nodig.
  const kpiByDebtId = useMemo(() => {
    // KPI's draaien op de VOLLEDIGE saldo's (LTV, rente, looptijd zijn niet
    // perspectief-afhankelijk). Het aandeel zit alleen in de headline/subline.
    const kpiCtx = buildKpiContext({
      assets: userAssets.map((a) => ({
        id: a.id,
        asset_type: a.asset_type,
        current_value: Number(a.current_value ?? 0),
        linked_asset_id: a.linked_asset_id ?? null,
      })),
      debts: activeDebts.map((d) => ({
        id: d.id,
        debt_type: d.debt_type,
        current_balance: Number(d.current_balance),
        linked_asset_id: d.linked_asset_id ?? null,
      })),
      holdings: [],
    }).debt
    const map = new Map<string, KpiPair>()
    for (const debt of activeDebts) {
      const pair = computeDebtKpi(debt, kpiCtx)
      if (pair.primary || pair.secondary) {
        map.set(debt.id, pair)
      }
    }
    return map
  }, [activeDebts, userAssets])

  // ── Rendering ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-12">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-kern-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-12">
        <div className="rounded-[var(--r-lg)] border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-700">{error}</p>
          <button
            onClick={() => { setError(null); setLoading(true); loadDebts() }}
            className="mt-3 rounded-[var(--r)] bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Opnieuw proberen
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      <NavStackMeta title="Schulden" bottomBar={{ kind: 'tabs' }} />

      {/* ═══ Editorial pagina-opening (standaard-aanhef) ════════════
          Canonieke PageOpening: hairline-kicker → narratieve Playfair-H1
          met één <em>-accent → deck. Alles eronder (FiguresStrip, aflos-
          route, grid) ongewijzigd. */}
      <PageOpening
        // Rechter-gutter blijft óók bij showPageInfo=false: de overzicht-shell
        // rendert daar zijn eigen i-cluster (i + statuspunt), dus de kicker/H1
        // mogen die zone niet in lopen.
        className="mb-5 pr-20 sm:pr-24"
        kicker={
          <>
            Schulden · vrijheid die je terugkoopt
            <PerspectiveContextLabel className="normal-case tracking-normal" />
          </>
        }
        titleBefore="Elke schuld is vrijheid die je "
        emphasis="terugkoopt"
        titleAfter="."
        deck={
          <>
            Elke schuld is een claim op je toekomst. Door af te lossen koop je vrijheid terug — euro voor euro,
            maand na maand. Een lagere <GlossaryTerm term="schuldgraad">schuldgraad</GlossaryTerm> betekent meer financiële speelruimte.
          </>
        }
      >
        {showPageInfo && (
          <PageInfoButton
            description={pageInfoText}
            className="absolute right-0 top-0"
          />
        )}
        {partnerDebtsHidden && (
          <PrivacyHiddenNotice hiddenCategories={['debts']} forCategories={['debts']} />
        )}
      </PageOpening>

      {/* Figures-strip (mini-hero) — Type 2 blueprint sectie 2 */}
      {/* In Eenvoudig zonder de "Categorieën"-teller (cols 3). */}
      {simple ? (
        <FiguresStrip
          cols={3}
          figures={[
            {
              kicker: 'Totale schuld',
              amount: <MaskedAmount value={totalBalance} tone="kern" />,
              sub: `${activeDebts.length} schuld${activeDebts.length !== 1 ? 'en' : ''}`,
              variant: 'winner',
            },
            {
              kicker: 'Maandlasten',
              amount: <MaskedAmount value={totalMonthlyPayment} tone="kern" />,
              sub: 'per maand aflossen',
            },
            {
              kicker: 'Rente (gewogen)',
              amount: `${weightedAvgInterest.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`,
              sub: 'gemiddeld per jaar',
            },
          ]}
        />
      ) : (
        <FiguresStrip
          cols={4}
          figures={[
            {
              kicker: 'Totale schuld',
              amount: <MaskedAmount value={totalBalance} tone="kern" />,
              sub: `${activeDebts.length} schuld${activeDebts.length !== 1 ? 'en' : ''}`,
              variant: 'winner',
            },
            {
              kicker: 'Maandlasten',
              amount: <MaskedAmount value={totalMonthlyPayment} tone="kern" />,
              sub: 'per maand aflossen',
            },
            {
              kicker: 'Rente (gewogen)',
              amount: `${weightedAvgInterest.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`,
              sub: 'gemiddeld per jaar',
            },
            {
              kicker: 'Categorieën',
              amount: `${(Object.keys(byType) as DebtType[]).filter((t) => byType[t]?.debts.length > 0).length}`,
              sub: `type${(Object.keys(byType) as DebtType[]).filter((t) => byType[t]?.debts.length > 0).length === 1 ? '' : 's'} schuld`,
            },
          ]}
        />
      )}

      {/* ═══ Subtotaal excl. eigen woning (dubbele grondslag) ═══════
          Eén subtieler subtotaal onder de figures-strip: dezelfde aandeel-
          gewogen som, maar met de hypotheek op de eigen woning eruit. Kern-
          accent zodat het als tweede lezing van "Totale schuld" leest. Alleen
          zichtbaar bij de dubbele grondslag (eigen woning + strategie die de
          woning niet volledig meerekent). */}
      {showDualHousingBasis && (
        <SubtotalLine
          label="Totale schuld · excl. eigen woning"
          amount={totalBalanceExHome}
          trailing="hypotheek eigen woning eruit"
        />
      )}

      {/* Schuldenprofiel & Aflosroute — collapsible card.
          Spiegelbeeld van de "Verdeling & Projectie"-kaart op /core/assets
          (zie components/core/assets-client.tsx). Embed `<DebtPayoffStrategy>`
          met 4-strategie segmented control + extra-aflos-slider. Strategie-
          keuze persist via `?strategie=…` (zie OVERLAY_QUERY_KEYS) zodat
          deeplinks deelbaar zijn. */}
      {activeDebts.length > 0 && (
        <div className="mt-3 sm:mt-6 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s0)] overflow-hidden">
          {/* ── Accent bar ── */}
          <div className="h-[3px] w-full bg-kern-500" />

          {/* ── Header (clickable toggle) ── */}
          <button
            type="button"
            onClick={() => setAflosrouteOpen((v) => !v)}
            aria-expanded={aflosrouteOpen}
            className="flex w-full items-center gap-3 border-b border-[var(--border-ed)] px-4 py-4 text-left transition-colors hover:bg-[var(--subtle)] sm:px-5"
          >
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-[var(--ink-3)] transition-transform duration-200 ${aflosrouteOpen ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
            <div className="flex min-w-0 flex-1 items-center justify-between">
              <Kicker>
                <BarChart3 className="h-3 w-3 -mt-0.5 inline mr-1" aria-hidden="true" />
                Schuldenprofiel &amp; Aflosroute
              </Kicker>
              <p className="font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                {fc(totalBalance)}
              </p>
            </div>
          </button>

          {/* ── Content ── */}
          {aflosrouteOpen && (
            <div className="p-4 sm:p-6">
              {/* De aflos-engine draait ALTIJD op volledige huishoud-saldo's —
                  fractionele amortisatie is onzin. `activeDebts` dragen het
                  volledige `current_balance`; het aandeel zit enkel in de
                  headline. In een huishouden maken we dat expliciet. */}
              {ctx?.hasHousehold && (
                <p className="mb-3 text-[11px] italic text-[var(--ink-3)]">
                  Aflosroute toont het hele huishouden.
                </p>
              )}
              <DebtPayoffStrategy
                debts={activeDebts as unknown as Debt[]}
                initialStrategy={strategieFromUrl}
                kicker="Aflosroute"
                onStrategyChange={setStrategieInUrl}
              />
            </div>
          )}
        </div>
      )}

      {/* Toolbar — filter links (indien meegegeven), primaire CTA rechts.
          flex-wrap zorgt dat op smalle schermen de filter onder de actie-knop
          vouwt zonder overlap. */}
      <div className="flex flex-wrap items-center justify-end gap-2 mb-5 mt-5 sm:mt-6">
        {toolbarFilter && (
          <div className="mr-auto">{toolbarFilter}</div>
        )}
        <button
          type="button"
          onClick={() => { setQuickAddInitialType(null); setQuickAddOpen(true) }}
          aria-label="Schuld toevoegen"
          className="inline-flex min-h-[40px] items-center gap-2 border border-[var(--ink)] bg-[var(--paper)] px-4 py-2 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-[var(--ink)] hover:text-[var(--paper)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
        >
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          <span className="hidden sm:inline">Schuld toevoegen</span>
        </button>
      </div>

      {/* ═══ Grid per debt-categorie ════════════════════════════
          Zelfde layout als /core/debts/[type] items-tab: per categorie een
          grid van VermogenDebtCard + één AddCategoryCard die de QuickAddWizard
          opent met dat debt-type voor-geselecteerd. */}
      <section className="mt-3 sm:mt-6 space-y-6" data-testid="debt-list-section">
        {activeDebts.length === 0 && (
          <QuickAddEmptyState intent="debt" onAdd={() => setQuickAddOpen(true)} />
        )}

        {/* Eenvoudig — compacte pill-lijst i.p.v. het kaart-grid. Zelfde
            redactionele kop "Vrijheid die je terugkoopt" (header) blijft staan;
            hier alleen een korte italic deck + de pills. */}
        {simple && activeDebts.length > 0 && debtPillItems.length > 0 && (
          <>
            <p
              className="text-[13px] italic text-[var(--ink-3)] pl-4"
              style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)', borderLeft: '2px solid var(--module-active-500)' }}
            >
              Schulden die je stap voor stap aflost.
            </p>
            <EenvoudigPillList items={debtPillItems} variant="debt" />
          </>
        )}

        {!simple && (Object.keys(DEBT_TYPE_LABELS) as DebtType[]).map((type) => {
          // Client-side filter: verberg alle types behalve het geselecteerde.
          if (debtTypeFilter && type !== debtTypeFilter) return null
          const group = byType[type]
          if (!group || group.debts.length === 0) return null

          const groupColor = DEBT_TYPE_COLORS[type]
          const groupIcon = DEBT_TYPE_ICONS[type] ?? 'CircleDot'

          return (
            <div key={type} id={`debt-group-${type}`} className="scroll-mt-24">
              {/* Group header — gedeelde component (zie assets-client.tsx):
                  icoon + label + chevron = link naar /core/debts/[type]. */}
              <CategoryGroupHeader
                href={`/core/debts/${type}`}
                label={DEBT_TYPE_LABELS[type]}
                iconName={groupIcon}
                iconColor={groupColor}
                total={group.total}
              />

              {/* Debt cards — zelfde grid + cards als /core/debts/[type].
                  KPI-strip + sparkline-overlay worden door VermogenDebtCard
                  zelf gerenderd zodra de props aanwezig zijn. */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.debts.map((debt, idx) => (
                  <VermogenDebtCard
                    key={debt.id}
                    debt={debt}
                    kpiPair={kpiByDebtId.get(debt.id)}
                    sparklineValues={debtSparklines[debt.id]}
                    onClick={() => openDebtModal(debt)}
                    onEditClick={handleDebtEdit}
                    onRevalueClick={handleDebtRevalue}
                    staggerIndex={idx}
                    provenance={debt._provenance}
                    perspective={effectivePerspective}
                    partnerName={ctx?.partnerName}
                    ownershipSubline={formatOwnershipSubline(
                      debt,
                      effectivePerspective,
                      Number(debt.current_balance),
                    )}
                  />
                ))}
                <AddCategoryCard
                  label={addDebtCta(type)}
                  onClick={() => { setQuickAddInitialType(type); setQuickAddOpen(true) }}
                  variant="debt"
                  shape="item"
                  staggerIndex={group.debts.length}
                  ariaLabel={`Voeg item toe aan ${DEBT_TYPE_LABELS[type]}`}
                />
              </div>
            </div>
          )
        })}

        {/* ═══ Partner-aggregaat (privacy 'totalen') ═══════════════
            Wanneer de partner alleen totalen deelt, levert de loader één
            niet-bewerkbare aggregaatrij ("Partner schulden (totaal)"). Geen
            categorie-grouping — losse read-only kaart, alleen in
            huishouden/partner-view. Respecteert de actieve type-filter niet
            (er is geen echte debt_type). */}
        {!simple && !debtTypeFilter && aggregatedDebts.length > 0 && (
          <div id="debt-group-partner-aggregaat" className="scroll-mt-24">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {aggregatedDebts.map((debt, idx) => (
                <VermogenDebtCard
                  key={debt.id}
                  debt={debt}
                  onClick={() => {}}
                  onEditClick={() => {}}
                  onRevalueClick={() => {}}
                  staggerIndex={idx}
                  aggregated
                  provenance="partner"
                  perspective={effectivePerspective}
                  partnerName={ctx?.partnerName}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ═══ Detail-pane — uniforme slide-in flow (driewegregel kind="pane")
          Zelfde pane als op `/core/debts/[type]` zodat klikken op een
          debt-card geen page-navigatie meer triggert maar de detail/edit/
          revaluatie ter plekke opent. */}
      <DebtPane
        debt={selectedDebt}
        valuations={selectedDebt ? valuationsByDebtId[selectedDebt.id] : undefined}
        userAssets={userAssets}
        allDebts={realDebts}
        dailyExpenses={0}
        onClose={() => setSelectedDebtId(null)}
        onChanged={() => {
          loadDebts()
          if (selectedDebt) loadValuations(selectedDebt.id)
          router.refresh()
        }}
      />

      {/* Direct saldo-bijwerken — geopend door de "Saldo bijwerken"-knop op
          een kaart. Sibling sheet (driewegregel kind="sheet"): single-form,
          retour-context behouden. Slaat de detail-pane bewust over zodat
          één klik direct in de invoer-modal landt. */}
      {revalueDebt && (
        <DebtValuationModal
          entityId={revalueDebt.id}
          entityType="debt"
          entityName={revalueDebt.name}
          entitySubtype={revalueDebt.debt_type}
          netWorthInclusionPct={revalueDebt.net_worth_inclusion_pct ?? 100}
          currentValue={Number(revalueDebt.current_balance)}
          onClose={() => setRevalueDebt(null)}
          onSaved={() => {
            setRevalueDebt(null)
            loadDebts()
            if (selectedDebt) loadValuations(selectedDebt.id)
            router.refresh()
          }}
        />
      )}

      <QuickAddWizard
        open={quickAddOpen}
        onClose={() => { setQuickAddOpen(false); setQuickAddInitialType(null) }}
        initialIntent="debt"
        initialDebtType={quickAddInitialType ?? undefined}
        onSaved={() => { loadDebts(); router.refresh() }}
      />
    </div>
  )
}
