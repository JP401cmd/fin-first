'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import dynamic from 'next/dynamic'
import {
  Loader2, CheckCircle, HelpCircle, Check, ChevronDown, Sparkles, Wand2, Hand,
} from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { createClient } from '@/lib/supabase/client'
import { type Budget } from '@/lib/budget-data'
import { useHouseholdStatus } from '@/components/app/ownership-toggle'
import { loadAutoCatContext as loadSharedAutoCatContext } from '@/lib/auto-categorize-context'
import {
  computeAutoCategorization,
  runCombinedCategorization,
  type AutoCatContext,
  type AutoCatTx,
  type AutoAssignment,
  type CombinedAiBatchItem,
  type CombinedAiResult,
  type CombinedProposal,
} from '@/lib/auto-categorize'
import { buildBudgetOptions, type BudgetRow } from '@/lib/ai/categorize-budget-options'
import { createLocalAiResolver, LOCAL_REP_BATCH_SIZE } from '@/lib/ai/local/local-categorize-resolver'
import { useExecutionMode } from '@/lib/ai/local/use-execution-mode'
import { createPrefetchGate, LOCAL_PREFETCH_WINDOW, type PrefetchGate } from '@/lib/categorize/wizard-gate'
import { CategorizeWizard } from '@/components/app/categorize-wizard'
import { escapeLikePattern } from '@/lib/transactions/search-query'
import {
  TransactionRow,
  type Transaction,
  type RowState,
} from '@/components/app/categorize-row'

// Groepen die de gratis stap-1 (regel/eigen-rekening/spiegelpaar) oplevert; deze
// landen in de wizard-bulk-kaart i.p.v. als losse AI-groepkaart.
const STAGE1_SOURCES = new Set(['rule', 'transfer', 'mirror'])
// De Sleepmodus (drag-&-drop) sleept dnd-kit mee — eigen chunk, laadt pas
// wanneer de gebruiker de modus opent.
const SleepmodusOverlay = dynamic(
  () => import('@/components/app/sleepmodus/sleepmodus-overlay').then((m) => ({ default: m.SleepmodusOverlay })),
  { ssr: false },
)

// ─── Types ────────────────────────────────────────────────────────────────────
//
// Transaction / SheetSuggestion / RowState / SOURCE_LABELS / TransactionRow /
// formatCurrency / formatDate wonen in components/app/categorize-row.tsx zodat
// zowel de platte reviewlijst als de "Vraag Fin"-wizard exact dezelfde rij
// hergebruiken (WP-C, feature #881).

type BulkApplyPrompt = {
  matchField: 'counterparty_name' | 'description'
  matchValue: string
  budgetId: string
  budgetName: string
  siblingCount: number
}

type Props = {
  transactions: Transaction[]
  budgets: Budget[]
  budgetGroups: { parent: Budget; children: Budget[] }[]
  onClose: () => void
  onSaved: () => void
  /**
   * Optionele props voor de scope-toggle in de choice-fase.
   * Wanneer accountId is gegeven (of currentUserId voor combined view),
   * krijgt de gebruiker de keuze tussen "Deze maand" (default, gebruikt
   * `transactions`) en "Alle tijden" (lazy-fetch van álle ongekoppelde
   * transacties op deze rekening of gebruiker).
   */
  accountId?: string | null
  monthLabel?: string
  currentUserId?: string | null
}

const ALL_TIME_LIMIT = 10000
/** PostgREST capt één query op 1000 rijen; daarom pagineren we per 1000. */
const ALL_TIME_PAGE_SIZE = 1000

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SHOW_MORE_STEP = 20

/** Map een sheet-transactie naar de minimale vorm voor de auto-categorisatie.
 *  `reference` gaat mee zodat de combined pass 'm aan de AI-resolver kan geven. */
function toAutoCatTx(tx: Transaction): AutoCatTx & { reference?: string | null } {
  return {
    id: tx.id,
    description: tx.description,
    counterparty_name: tx.counterparty_name,
    counterparty_iban: tx.counterparty_iban,
    amount: tx.amount,
    date: tx.date,
    account_id: tx.account_id ?? null,
    reference: tx.reference ?? null,
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AICategorizeSheet({
  transactions,
  budgets,
  budgetGroups,
  onClose,
  onSaved,
  accountId,
  monthLabel,
  currentUserId,
}: Props) {
  const [phase, setPhase] = useState<'choice' | 'ai' | 'review' | 'saving' | 'applying' | 'success' | 'sleep'>('choice')
  const [rows, setRows] = useState<RowState[]>([])
  // Review-weergave: 'wizard' voor het "Vraag Fin"-pad (bulk-kaart + AI-
  // groepkaarten), 'list' voor het handmatige pad (de bestaande platte lijst,
  // ongewijzigd). fetchSuggestions zet 'wizard', startManual zet 'list'.
  const [reviewMode, setReviewMode] = useState<'wizard' | 'list'>('list')
  // DOM-node van de sticky footer-slot van de BottomSheet: de wizard portalt zijn
  // primaire-actieblok hierin (niet-scrollend), zodat de vier keuzes + "Stoppen"
  // niet met de kaart-body meescrollen (CLAUDE.md: primaire acties in footerSlot).
  const [wizardFooterNode, setWizardFooterNode] = useState<HTMLDivElement | null>(null)
  // Draait de motor nog AI-rondes? Stuurt de "Fin denkt na…"-laadstatus en de
  // wakelock in de wizard.
  const [aiRunning, setAiRunning] = useState(false)
  // Deelverzameling voor de sleepmodus vanuit een wizard-groep ("Zelf indelen"):
  // de tx-id's van die groep. null = de gewone, volledige sleepmodus.
  const [sleepSubset, setSleepSubset] = useState<string[] | null>(null)
  // Budgetten die de gebruiker binnen de sleepmodus heeft aangemaakt. Ze staan
  // server-side, maar de `budgetGroups`-prop ververst pas na een herlaad — en de
  // wizard-variant herlaadt bewust niet tussen twee groepen door. Op sheet-niveau
  // bewaard omdat de overlay per groep unmount: zonder dit zou het verse budget
  // bij de volgende groep verdwenen zijn en maakt de gebruiker 'm nóg een keer.
  const [sleepCreatedBudgets, setSleepCreatedBudgets] = useState<Budget[]>([])
  // Incrementele voorstellen tijdens de streaming AI-fase: we verzamelen ze in een
  // ref en flushen per ronde naar `rows` (nooit setState per individueel voorstel —
  // dat zouden er duizenden zijn bij "Alle tijden").
  const proposalsRef = useRef<Map<string, CombinedProposal>>(new Map())
  // Prefetch-gate (alleen lokaal pad): remt de motor af tot een venster vóór de
  // getoonde groep. De wizard meldt voortgang via gate.releaseUpTo.
  const gateRef = useRef<PrefetchGate | null>(null)
  const { hasHousehold } = useHouseholdStatus()
  // Standaard aan: een keuze voor een gedeeld budget maakt de transactie ook
  // gezamenlijk. Alleen relevant met een huishouden + minstens één gedeeld budget.
  const [shareSharedBudgetTx, setShareSharedBudgetTx] = useState(true)
  const [aiError, setAiError] = useState<string | null>(null)
  const [showCount, setShowCount] = useState(SHOW_MORE_STEP)
  const [savedCount, setSavedCount] = useState(0)
  const [ruleCount, setRuleCount] = useState(0)
  const [bulkUpdated, setBulkUpdated] = useState(0)
  const [bulkApplyPrompt, setBulkApplyPrompt] = useState<BulkApplyPrompt | null>(null)
  // ── Waar draait de AI-fase? ───────────────────────────────────────────────
  //
  // Eén hook beslist het (lib/ai/local/use-execution-mode.ts) volgens de
  // canonieke regel van ADR 0078: een per-groep-override op /mijn/privacy wint
  // van de hoofdschakelaar. Deze sheet las eerder rechtstreeks
  // `profiles.privacy_mode`, waardoor een override op "Transacties & vaste
  // lasten" niets deed — de schakelaar was decoratief.
  //
  // FAIL-CLOSED: we lezen `canUseCloud`/`canUseLocal`, nooit een eigen
  // vergelijking op `status`. In 'resolving' en 'blocked' zijn beide false en
  // vertrekt er dus geen enkele AI-aanroep — ook niet "even via de cloud".
  //
  // Geen `active`-vlag: de sheet wordt door al zijn callers pas GEMOUNT wanneer
  // de gebruiker 'm opent (budgets-client, cash-account-view, import-pagina),
  // dus gemount === open.
  const exec = useExecutionMode('transacties')
  // UI-hint-vlag voor de wizard ("experimenteel — lokaal op dit apparaat").
  // Gezet bij de start van de AI-fase, zodat het label bij de daadwerkelijk
  // gebruikte resolver hoort en niet halverwege omklapt.
  const [localMode, setLocalMode] = useState(false)
  // Sessiestart-feedback voor het lokale pad: de eerste GPU-warmup is ~45-60s
  // volledig stil; 'starten' toont een geruststellende regel zodat het niet als
  // een hang voelt. Gevoed door createLocalAiResolver's onSessionState.
  const [localSessionState, setLocalSessionState] = useState<'idle' | 'starten' | 'klaar'>('idle')
  // Annuleren van de combined pass: abort tussen AI-rondes; de al-gedane
  // voorstellen blijven staan en landen gewoon in de review (niets toegepast).
  const abortRef = useRef<AbortController | null>(null)
  // Unmount/sluit-abort: sluit de gebruiker de sheet (X/backdrop/Escape) terwijl
  // de motor nog draait, dan hangt die op het lokale pad gesuspendeerd op de gate
  // (`await onBeforeRound`) en blijft de lokale modelsessie hangen. Bij unmount
  // breken we motor én gate af zodat alles netjes stopt.
  useEffect(() => () => {
    abortRef.current?.abort()
    gateRef.current?.abort()
  }, [])
  // Actieve wizard-stap (1 Automatisch · 2 Fin's voorstellen · 3 Controle). Leeft
  // in de sheet zodat 'ie een sleepmodus-uitstapje (phase 'sleep' → 'review')
  // overleeft; de wizard is gecontroleerd via step/onStepChange. null = nog niet
  // bepaald (de wizard init 'm op de eerste bestaande stap zodra stap-1 klaar is).
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | null>(null)
  // Vastgepind aantal AI-groepen (M) voor de "Groep N van M"-teller. Leeft — net
  // als wizardStep — in de sheet zodat de teller een sleepmodus-uitstapje (waarbij
  // de wizard even unmount) overleeft en niet herpint op de kleiner geworden set.
  const [pinnedTotalGroups, setPinnedTotalGroups] = useState<number | null>(null)
  // Is de gratis stap-1 (regels/overboekingen) al geflusht? Pas dán weet de wizard
  // of stap 1 bestaat en waar 'ie moet starten (voorkomt een flikkering waarbij
  // stap 1 na de context-laad alsnog "verschijnt").
  const [stage1Resolved, setStage1Resolved] = useState(false)
  // Budget-id van de "Eigen rekening"-post, geresolved bij de auto-context-laad.
  // Nodig zodat handleSave bij een geaccepteerd eigen-rekening-budget óók
  // transaction_type='transfer' meeschrijft (de cijfer-filtering hangt aan die
  // vlag, niet aan het budget). Geldt voor een geaccepteerd spiegelpaar-voorstel
  // én voor het handmatig kiezen van dit budget via "Kies handmatig".
  const [eigenRekeningBudgetId, setEigenRekeningBudgetId] = useState<string | null>(null)
  // Auto-flows (optie 3 & 4): foutmelding op de choice-fase + resultaat-samenvatting.
  const [actionError, setActionError] = useState<string | null>(null)
  // Samenvatting van de slimme-regels-flow (optie 3). Eigen-rekening-herkenning
  // is geen losse optie meer — die zit nu in de slimme regels én de AI-flow.
  // `mirrorCandidateCount`: spiegelpaar-kandidaten die NIET zijn toegepast (fuzzy
  // signaal) — de samenvatting meldt ze als "mogelijke overboekingen".
  const [autoSummary, setAutoSummary] = useState<{
    ruleCount: number
    transferCount: number
    mirrorCandidateCount: number
    unmatchedCount: number
  } | null>(null)

  // ── Scope-toggle state (optional feature; only shown when accountId or
  //    currentUserId is provided so we know which transactions to fetch). ──
  const scopeAvailable = accountId !== undefined || !!currentUserId
  const [scope, setScope] = useState<'month' | 'all'>('month')
  const [allTransactions, setAllTransactions] = useState<Transaction[] | null>(null)
  const [loadingAll, setLoadingAll] = useState(false)
  const [allError, setAllError] = useState<string | null>(null)
  const [allCapped, setAllCapped] = useState(false)

  /** Resolved working set used by both AI and manual flow. */
  const activeTransactions = scope === 'all' && allTransactions ? allTransactions : transactions

  // ⚠️ Sommige callers (budgets-client) geven de budget-BOOM door (parents met
  // geneste children); cash-account-view geeft een platte lijst. Alle interne
  // lookups (slugMap/idMap in de auto-cat-context, eigen-rekening-resolve,
  // naam/ownership per suggestie) hebben de PLATTE lijst nodig — zonder
  // flatten zijn deelbudgetten onzichtbaar voor Slimme regels en lookups
  // (salaris-bug jun 2026). Structureel flattenen + dedupe op id, zodat élke
  // caller-vorm veilig is.
  const flatBudgets = useMemo(() => {
    const seen = new Set<string>()
    const flat: Budget[] = []
    for (const b of budgets) {
      const children = (b as { children?: Budget[] }).children ?? []
      for (const item of [b, ...children]) {
        if (!seen.has(item.id)) {
          seen.add(item.id)
          flat.push(item)
        }
      }
    }
    return flat
  }, [budgets])

  // Fetch all uncategorized transactions for the current account/user.
  // Lazy: only triggered when the user picks the 'all' tab. Capped at
  // ALL_TIME_LIMIT (10.000) om AI-batchbudget en UX beheersbaar te houden;
  // de cap wordt via `allCapped` aan de choice-fase als voetnoot getoond.
  // We pagineren per ALL_TIME_PAGE_SIZE (1000) omdat PostgREST één query
  // hard op 1000 rijen capt — alleen `.limit(10000)` zetten levert dus
  // nooit meer dan 1000 rijen op.
  const loadAllUncategorized = useCallback(async () => {
    if (allTransactions) return // already cached
    setLoadingAll(true)
    setAllError(null)
    try {
      const supabase = createClient()

      // Doorlussend ophalen in chunks tot een chunk korter is dan een volle
      // pagina (= laatste pagina) óf tot we de harde cap raken.
      const raw: Transaction[] = []
      for (let offset = 0; offset < ALL_TIME_LIMIT; offset += ALL_TIME_PAGE_SIZE) {
        let query = supabase
          .from('transactions')
          // Expliciete kolomlijst i.p.v. `*`: bij 10k rijen scheelt dat fors
          // aan egress (raw import-velden, household_id e.d. zijn hier niet
          // nodig). `transaction_type` moet mee voor het JS-transferfilter;
          // `account_id` voor de spiegelpaar-detectie (overboekingen tussen
          // eigen rekeningen).
          .select('id, date, description, counterparty_name, counterparty_iban, amount, import_hash, budget_id, reference, transaction_type, account_id')
          .is('budget_id', null)

        if (accountId) {
          query = query.eq('account_id', accountId)
        } else if (currentUserId) {
          query = query.eq('user_id', currentUserId)
        }

        const { data, error } = await query
          .order('date', { ascending: false })
          .range(offset, offset + ALL_TIME_PAGE_SIZE - 1)

        if (error) throw new Error(error.message)
        const chunk = (data ?? []) as Transaction[]
        raw.push(...chunk)
        // Minder dan een volle pagina → dit was de laatste pagina.
        if (chunk.length < ALL_TIME_PAGE_SIZE) break
      }

      // Filter transfers in JS rather than SQL: PostgreSQL evaluates
      // `NULL != 'transfer'` as UNKNOWN which strips manually-unlinked rows
      // (where `transaction_type` is NULL). JS `!==` returns true for null,
      // matching the existing behaviour in cash-account-view.tsx (regel 531).
      const list = raw.filter(
        (t) => (t as { transaction_type?: string | null }).transaction_type !== 'transfer'
      )
      setAllTransactions(list)
      // Cap detection runs on the *raw* result so the footnote stays accurate
      // even if some rows are dropped by the JS transfer filter afterwards.
      setAllCapped(raw.length >= ALL_TIME_LIMIT)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Kon transacties niet laden'
      setAllError(msg)
      setScope('month') // fall back so the user is never stuck
    } finally {
      setLoadingAll(false)
    }
  }, [accountId, currentUserId, allTransactions])

  function handleScopeChange(next: 'month' | 'all') {
    if (next === scope) return
    setScope(next)
    if (next === 'all') void loadAllUncategorized()
  }

  // ── Auto-flow helpers (gedeeld door slimme regels én de AI-pre-detectie) ───

  /** Laadt regels, geschiedenis en eigen-rekening-identifiers voor de auto-flows.
   *  Gedeelde implementatie in lib/auto-categorize-context.ts (ook gebruikt door
   *  de Sleepmodus-overlay). */
  const loadAutoCatContext = useCallback(
    async (): Promise<AutoCatContext> => loadSharedAutoCatContext(createClient(), flatBudgets),
    [flatBudgets],
  )

  /** Schrijft de toewijzingen gebatcht weg: één update per budget/bron/transfer. */
  const applyAssignments = useCallback(async (assignments: AutoAssignment[]): Promise<void> => {
    if (assignments.length === 0) return
    const supabase = createClient()
    const groups = new Map<string, { ids: string[]; budget_id: string; category_source: string; isTransfer: boolean }>()
    for (const a of assignments) {
      const key = `${a.budget_id}|${a.category_source}|${a.isTransfer ? 'T' : 'F'}`
      const g = groups.get(key) ?? { ids: [], budget_id: a.budget_id, category_source: a.category_source, isTransfer: a.isTransfer }
      g.ids.push(a.id)
      groups.set(key, g)
    }
    for (const g of groups.values()) {
      const update: Record<string, unknown> = { budget_id: g.budget_id, category_source: g.category_source }
      if (g.isTransfer) update.transaction_type = 'transfer'
      // Chunk om de PostgREST URL-lengte te respecteren bij grote selecties.
      for (let i = 0; i < g.ids.length; i += 200) {
        const { error } = await supabase.from('transactions').update(update).in('id', g.ids.slice(i, i + 200))
        if (error) throw new Error(error.message)
      }
    }
  }, [])

  // ── "Vraag Fin": de gecombineerde automaat (regels → AI → propagatie) ─────
  //
  // Sinds de combined pass (Notion-kaart jul 2026) is dit niet langer een puur
  // AI-pad: eerst deelt de gratis regelmotor alles in wat hij weet, daarna gaan
  // ALLEEN de overgebleven onbekende tegenpartijen — één representant per
  // genormaliseerde tegenpartij, per 20 — naar de AI, waarna elk AI-oordeel
  // slim propageert naar de overige transacties van dezelfde tegenpartij. Dat
  // herhaalt tot alles behandeld is, dus ook een batch van duizenden
  // transacties wordt opgebroken en afwisselend AI ↔ slim verwerkt.
  //
  // Eis 2 van de kaart: NIETS wordt in deze flow stil toegepast — ook regel- en
  // transfer-hits landen als voorstel in de review, met een herkomst-label.

  const fetchSuggestions = useCallback(async () => {
    setAiError(null)
    setLocalSessionState('idle')
    setReviewMode('wizard')
    setWizardStep(null)
    setPinnedTotalGroups(null)
    setStage1Resolved(false)
    setAiRunning(true)
    proposalsRef.current = new Map()
    gateRef.current = null
    abortRef.current = new AbortController()

    // Snapshot the resolved set so async work below can't race with a scope
    // change. Manual / AI flow always operates on the same list.
    const sourceTx = activeTransactions

    // Toon de wizard meteen (streaming): lege rijen die per ronde worden gevuld —
    // de bulk-kaart is direct zichtbaar zodra stap 1 (regels/overboekingen) klaar
    // is, de AI-groepkaarten druppelen daarna binnen.
    setRows(sourceTx.map((tx) => ({
      tx,
      suggestion: null,
      accepted: false,
      acceptedBudgetId: null,
      acceptedBudgetName: null,
      acceptedCategorySource: null,
      makeRule: false,
      aiNoMatch: false,
    })))
    setPhase('review')

    // Context laden. Mislukt dat, dan STOPPEN we — we degraderen niet meer naar
    // een lege context.
    //
    // Waarom die degradatie weg moest: `ctx.ownIbans` is de enige reden dat een
    // overboeking naar je eigen spaarrekening als verschuiving wordt herkend.
    // Een lege set betekende dat zulke transacties gewoon aan de AI werden
    // aangeboden, die er een gewone post van maakt — waarna diezelfde euro als
    // inkomst én als uitgave meetelt en de spaarquote structureel verkeerd staat.
    // Dat gebeurde zonder één zichtbaar signaal. Sinds de IBANs via
    // `/api/own-accounts/ibans` komen (server-only sleutels) is een mislukte
    // ophaal bovendien een reëel netwerkscenario in plaats van een randgeval.
    // Liever geen voorstellen dan stil verkeerde voorstellen.
    let ctx: AutoCatContext
    try {
      ctx = await loadAutoCatContext()
    } catch (err) {
      setAiError(
        err instanceof Error && err.message
          ? `Je regels en eigen rekeningen konden niet worden geladen: ${err.message}`
          : 'Je regels en eigen rekeningen konden niet worden geladen. Probeer het zo opnieuw.',
      )
      setStage1Resolved(true)
      setAiRunning(false)
      return
    }
    setEigenRekeningBudgetId(ctx.eigenRekeningBudgetId)

    // Cloud-resolver (default): één POST = één batch van ≤20 representanten.
    // Bewust GEEN counterparty_iban in de payload: sanitizeForAI maskeert elk
    // IBAN naar de constante "[IBAN]" vóór het de provider bereikt — privacy-
    // correct maar nul signaal. IBAN-matching gebeurt lokaal (regelmotor).
    const cloudResolver = async (batch: CombinedAiBatchItem[]): Promise<CombinedAiResult[]> => {
      const res = await fetch('/api/ai/categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactions: batch.map((t) => ({
            import_hash: t.id,
            description: t.description,
            counterparty_name: t.counterparty_name,
            amount: t.amount,
            reference: t.reference,
            date: t.date,
          })),
        }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error((errData as { error?: string }).error ?? 'AI-analyse niet beschikbaar')
      }
      const data = await res.json() as { results: { import_hash: string; budget_id: string | null; confidence: number; reasoning: string }[] }
      return data.results.map((s) => ({
        id: s.import_hash,
        budget_id: s.budget_id,
        confidence: s.confidence,
        reasoning: s.reasoning,
      }))
    }

    // ── Bestemming van de AI-fase: cloud of on-device ─────────────────────────
    // De keuze komt van `useExecutionMode('transacties')` (zie de hook-aanroep
    // bovenin): override wint van de hoofdschakelaar, en de gereedheid van dít
    // toestel (capability-flap vs. geëvicteerd model) zit daar al in verwerkt —
    // de concrete melding staat in `exec.message`.
    let aiResolver = cloudResolver
    let aiBatchSize: number | undefined
    // Geen bestemming waar iets naartoe MAG: 'blocked' (lokaal gekozen, toestel
    // kan het niet) of 'resolving' (voorkeur nog niet gelezen). In beide gevallen
    // draait de gratis regelmotor gewoon door, maar vertrekt er geen AI-aanroep.
    let aiBlocked = false
    let aiBlockedMessage: string | null = null
    setLocalMode(exec.canUseLocal)

    if (exec.canUseLocal) {
      // Lokale opties mét budget_id via dezelfde leaf/slug-logica als het
      // cloud-pad (buildBudgetOptions), zodat de resolver de teruggegeven slug
      // naar een budget_id kan mappen.
      const rows: BudgetRow[] = flatBudgets.map((b) => ({
        id: b.id,
        parent_id: b.parent_id,
        name: b.name,
        slug: b.slug,
        budget_type: b.budget_type,
        description: b.description,
        ownership: b.ownership,
      }))
      const { options, slugToId } = buildBudgetOptions(rows)
      const localOptions = options.map((o) => ({ ...o, id: slugToId.get(o.slug) ?? null }))
      // onSessionState voedt de "wordt gestart…"-regel tijdens de stille
      // GPU-warmup van de eerste chunk (zie localSessionState).
      aiResolver = createLocalAiResolver(localOptions, {
        onSessionState: (s) => setLocalSessionState(s),
      })
      // Lokaal pad: kleine groep-rondes (LOCAL_REP_BATCH_SIZE) + prefetch-gate
      // (LOCAL_PREFETCH_WINDOW) zodat de wizard voorstellen krijgt zodra ze klaar
      // zijn, zonder de hele batch vooruit te draaien. Cloud houdt de default (20
      // groepen, geen gate). INVARIANT: aiBatchSize === repBatchSize (== de
      // wizard-`repBatchSize`, LOCAL_REP_BATCH_SIZE) — de gate rekent rondes ↔
      // getoonde groepen om via dat gelijke getal (zie wizard-gate.ts).
      aiBatchSize = LOCAL_REP_BATCH_SIZE
      gateRef.current = createPrefetchGate(LOCAL_PREFETCH_WINDOW)
    } else if (!exec.canUseCloud) {
      aiBlocked = true
      aiBlockedMessage =
        exec.message ??
        (exec.status === 'resolving'
          ? 'We konden nog niet bepalen waar Fin mag draaien. Probeer het zo opnieuw — je regels en eerdere keuzes staan wel klaar.'
          : 'Lokale AI is nu niet beschikbaar op dit toestel.')
      // Elke batch laten falen → de bestaande failedBatches-flow vangt het op;
      // NOOIT een stille cloud-fallback (privacy fail-closed, FR-3.6).
      aiResolver = async () => {
        throw new Error('ai-bestemming-niet-beschikbaar')
      }
    }

    // Flush: bouw de suggesties opnieuw op uit de ref (per ronde aangeroepen).
    // Behoudt reeds geaccepteerde rijen; overschrijft nooit een gebruikerskeuze.
    const budgetNameById = new Map(flatBudgets.map((b) => [b.id, b.name] as const))
    const flushRows = () => {
      const map = proposalsRef.current
      setRows((prev) =>
        prev.map((r) => {
          if (r.accepted) return r
          const p = map.get(r.tx.id)
          const suggestion = p
            ? {
                budget_id: p.budget_id,
                budget_name: budgetNameById.get(p.budget_id) ?? null,
                confidence: p.confidence,
                reasoning: p.reasoning,
                source: p.source,
                category_source: p.category_source,
              }
            : null
          return { ...r, suggestion }
        }),
      )
    }

    // Markeer de gegeven ids als "Fin kon dit niet plaatsen" (aiNoMatch) zodat de
    // wizard-kaart meteen de handmatige fallback toont. Rijen die (alsnog) een
    // voorstel kregen laten we ongemoeid — een voorstel wint van no-match.
    const markNoMatch = (ids: string[]) => {
      if (ids.length === 0) return
      const set = new Set(ids)
      setRows((prev) =>
        prev.map((r) =>
          set.has(r.tx.id) && !r.suggestion?.budget_id && !r.accepted ? { ...r, aiNoMatch: true } : r,
        ),
      )
    }

    try {
      const result = await runCombinedCategorization(
        sourceTx.map(toAutoCatTx),
        ctx,
        aiResolver,
        {
          batchSize: aiBatchSize,
          groupOrder: 'largest-first',
          onBeforeRound: gateRef.current?.onBeforeRound,
          // Verzamel elk voorstel in de ref; NIET per voorstel setState (kunnen er
          // duizenden zijn) — we flushen per ronde in onProgress.
          onProposal: (p) => proposalsRef.current.set(p.id, p),
          // Per ronde: flush de tot nu toe binnengekomen voorstellen naar de rijen
          // (bulk-kaart + AI-groepkaarten updaten). Nooit per individueel voorstel.
          // De eerste flush (na de gratis stap-1) markeert stage-1 als bepaald zodat
          // de wizard z'n stappen kan vastpinnen.
          onProgress: () => {
            flushRows()
            setStage1Resolved(true)
          },
          // No-match per ronde: markeer die rijen zodat de wizard-kaart meteen naar
          // de handmatige fallback springt i.p.v. eindeloos te blijven laden.
          onNoMatch: (txIds) => markNoMatch(txIds),
          signal: abortRef.current.signal,
        },
      )

      // Definitieve flush (vangt een eventuele laatste, niet-geëmitte ronde af).
      flushRows()
      // Vangnet: markeer álle no-match-ids uit het resultaat (voor het geval de
      // per-ronde-hook er een miste). Alleen rijen zonder voorstel.
      if (result.noMatchIds.length > 0) markNoMatch(result.noMatchIds)

      // Alle AI-rondes mislukt en géén enkel AI-voorstel → meld het; de lokale
      // (regel/transfer/spiegel-)voorstellen staan wél gewoon in de review.
      if (result.failedBatches.length > 0 && result.counts.ai === 0) {
        setAiError(
          aiBlocked
            ? (aiBlockedMessage ??
                'Lokale AI is niet beschikbaar — beheer dit via Mijn → Privacy. Je regels en eerdere keuzes staan wel klaar.')
            : exec.canUseLocal
              ? 'Lokale categorisatie is niet gelukt. Probeer het opnieuw of categoriseer handmatig. Je regels staan wel klaar.'
              : 'AI-analyse is nu niet beschikbaar — de voorstellen van je regels staan wel klaar.',
        )
      }
    } catch (err) {
      // Onverwachte fout buiten de AI-rondes om (resolver-fouten worden al per
      // ronde opgevangen) → de al-binnengekomen voorstellen staan al in de wizard;
      // toon enkel een melding.
      const msg = err instanceof Error ? err.message : 'AI-analyse niet beschikbaar'
      setAiError(msg)
      flushRows()
    } finally {
      // Vangnet: zodra de run eindigt is stap 1 hoe dan ook bepaald. onProgress
      // vuurt normaal minstens één keer (emitProgress vóór de AI-rondes) en zet
      // stage1Resolved al, maar bij 0 AI-rondes of een vroege fout in de opzet-
      // fase (context/capability) kan die hook uitblijven. Hier pinnen we 'm
      // gegarandeerd zodat structPinned in de wizard nooit blijft hangen op
      // "Fin bekijkt je transacties…".
      setStage1Resolved(true)
      setAiRunning(false)
    }
  }, [activeTransactions, loadAutoCatContext, flatBudgets, exec.canUseLocal, exec.canUseCloud, exec.status, exec.message])

  function startManual() {
    setReviewMode('list')
    setAiRunning(false)
    setRows(activeTransactions.map((tx) => ({
      tx,
      suggestion: null,
      accepted: false,
      acceptedBudgetId: null,
      acceptedBudgetName: null,
      acceptedCategorySource: null,
      makeRule: false,
    })))
    setPhase('review')
  }

  /** Optie 3 — slimme regels: volledige keten, direct toepassen. */
  async function runSmartRules() {
    setActionError(null)
    setPhase('applying')
    try {
      const ctx = await loadAutoCatContext()
      const result = computeAutoCategorization(activeTransactions.map(toAutoCatTx), ctx)
      await applyAssignments(result.assignments)
      setAutoSummary({
        ruleCount: result.ruleCount,
        transferCount: result.transferCount,
        mirrorCandidateCount: result.mirrorCandidateCount,
        unmatchedCount: result.unmatchedCount,
      })
      setSavedCount(result.ruleCount + result.transferCount)
      setPhase('success')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Automatisch indelen lukte niet. Probeer het opnieuw.')
      setPhase('choice')
    }
  }

  // ── Row actions ───────────────────────────────────────────────────────────

  function acceptSuggestion(idx: number) {
    setBulkApplyPrompt(null)
    const row = rows[idx]
    if (!row?.suggestion?.budget_id) return
    const budget = flatBudgets.find((b) => b.id === row.suggestion!.budget_id)
    // Een eigen-rekening-voorstel (transfer/spiegelpaar) is een eenmalige
    // overboeking, geen terugkerende categorie: geen regel en geen sibling-detectie.
    const isEigenRekening = !!eigenRekeningBudgetId && row.suggestion.budget_id === eigenRekeningBudgetId
    const updatedRows = rows.map((r, i) => {
      if (i !== idx || !r.suggestion?.budget_id) return r
      return {
        ...r,
        accepted: true,
        acceptedBudgetId: r.suggestion.budget_id,
        acceptedBudgetName: budget?.name ?? r.suggestion.budget_name,
        acceptedCategorySource: r.suggestion.category_source,
        // Regel-standaard alléén voor een écht AI-oordeel: regel-hits hébben al
        // een regel/geschiedenis en propagatie dekt de siblings via de bulk-
        // toepassing van de representant. Toggle blijft per rij beschikbaar.
        makeRule: r.suggestion.source === 'ai' && !isEigenRekening,
      }
    })
    setRows(updatedRows)
    if (isEigenRekening) return
    const matchField = row.tx.counterparty_name ? 'counterparty_name' as const : 'description' as const
    const matchValue = row.tx.counterparty_name || row.tx.description
    const budgetId = row.suggestion.budget_id
    const budgetName = budget?.name ?? row.suggestion.budget_name ?? ''
    if (matchValue) detectSiblings(updatedRows, idx, matchField, matchValue, budgetId, budgetName)
  }

  function setManualBudget(idx: number, budgetId: string) {
    setBulkApplyPrompt(null)
    const row = rows[idx]
    const budget = flatBudgets.find((b) => b.id === budgetId)
    const updatedRows = rows.map((r, i) => {
      if (i !== idx) return r
      return {
        ...r,
        accepted: !!budgetId,
        acceptedBudgetId: budgetId || null,
        acceptedBudgetName: budget?.name ?? null,
        acceptedCategorySource: budgetId ? 'manual' : null,
        makeRule: false,
      }
    })
    setRows(updatedRows)
    if (budgetId && row) {
      const matchField = row.tx.counterparty_name ? 'counterparty_name' as const : 'description' as const
      const matchValue = row.tx.counterparty_name || row.tx.description
      const budgetName = budget?.name ?? ''
      if (matchValue) detectSiblings(updatedRows, idx, matchField, matchValue, budgetId, budgetName)
    }
  }

  function toggleMakeRule(idx: number) {
    setRows((prev) => prev.map((r, i) =>
      i === idx ? { ...r, makeRule: !r.makeRule } : r
    ))
  }

  function detectSiblings(
    updatedRows: RowState[],
    currentIdx: number,
    matchField: 'counterparty_name' | 'description',
    matchValue: string,
    budgetId: string,
    budgetName: string,
  ) {
    const siblings = updatedRows.filter((r, i) =>
      i !== currentIdx &&
      !r.accepted &&
      (matchField === 'counterparty_name'
        ? r.tx.counterparty_name?.toLowerCase() === matchValue.toLowerCase()
        : r.tx.description?.toLowerCase().includes(matchValue.toLowerCase()))
    )
    if (siblings.length > 0) {
      setBulkApplyPrompt({ matchField, matchValue, budgetId, budgetName, siblingCount: siblings.length })
    }
  }

  function applyToSiblings() {
    if (!bulkApplyPrompt) return
    const { matchField, matchValue, budgetId, budgetName } = bulkApplyPrompt
    setRows((prev) => prev.map((r) => {
      if (r.accepted) return r
      const matches = matchField === 'counterparty_name'
        ? r.tx.counterparty_name?.toLowerCase() === matchValue.toLowerCase()
        : r.tx.description?.toLowerCase().includes(matchValue.toLowerCase())
      if (!matches) return r
      return { ...r, accepted: true, acceptedBudgetId: budgetId, acceptedBudgetName: budgetName, acceptedCategorySource: 'manual', makeRule: false }
    }))
    setBulkApplyPrompt(null)
  }

  function acceptAll() {
    setRows((prev) => prev.map((r) => {
      if (!r.suggestion?.budget_id) return r
      const budget = flatBudgets.find((b) => b.id === r.suggestion!.budget_id)
      const isEigenRekening = !!eigenRekeningBudgetId && r.suggestion.budget_id === eigenRekeningBudgetId
      return {
        ...r,
        accepted: true,
        acceptedBudgetId: r.suggestion.budget_id,
        acceptedBudgetName: budget?.name ?? r.suggestion.budget_name,
        acceptedCategorySource: r.suggestion.category_source,
        // Zelfde discipline als acceptSuggestion: regel-standaard alleen voor
        // een écht AI-oordeel, nooit voor eigen-rekening-voorstellen.
        makeRule: r.suggestion.source === 'ai' && !isEigenRekening,
      }
    }))
  }

  // ── Wizard-acties ("Vraag Fin"-pad) ───────────────────────────────────────
  // Wrappers om de bestaande accept-semantiek — NIETS herimplementeren. De
  // wizard werkt op tx-id's; opslaan loopt via het bestaande handleSave-pad.

  /** Accepteer alle stap-1-voorstellen in één keer (bulk-kaart "Akkoord, allemaal"). */
  function acceptStage1() {
    setRows((prev) => prev.map((r) => {
      if (!r.suggestion?.budget_id || r.accepted) return r
      if (!STAGE1_SOURCES.has(r.suggestion.source)) return r
      const budget = flatBudgets.find((b) => b.id === r.suggestion!.budget_id)
      return {
        ...r,
        accepted: true,
        acceptedBudgetId: r.suggestion.budget_id,
        acceptedBudgetName: budget?.name ?? r.suggestion.budget_name,
        acceptedCategorySource: r.suggestion.category_source,
        makeRule: false,
      }
    }))
  }

  /** Accepteer het voorstel voor een hele AI-groep (alle tx-id's samen). */
  function acceptGroup(txIds: string[]) {
    const idset = new Set(txIds)
    setRows((prev) => prev.map((r) => {
      if (!idset.has(r.tx.id) || !r.suggestion?.budget_id || r.accepted) return r
      const budget = flatBudgets.find((b) => b.id === r.suggestion!.budget_id)
      const isEigenRekening = !!eigenRekeningBudgetId && r.suggestion.budget_id === eigenRekeningBudgetId
      return {
        ...r,
        accepted: true,
        acceptedBudgetId: r.suggestion.budget_id,
        acceptedBudgetName: budget?.name ?? r.suggestion.budget_name,
        acceptedCategorySource: r.suggestion.category_source,
        makeRule: r.suggestion.source === 'ai' && !isEigenRekening,
      }
    }))
  }

  /** Zet een handmatig gekozen budget op een hele AI-groep ("Andere categorie"). */
  function setGroupBudget(txIds: string[], budgetId: string, makeRule: boolean) {
    if (!budgetId) return
    const idset = new Set(txIds)
    const budget = flatBudgets.find((b) => b.id === budgetId)
    setRows((prev) => prev.map((r) => {
      if (!idset.has(r.tx.id)) return r
      return {
        ...r,
        accepted: true,
        acceptedBudgetId: budgetId,
        acceptedBudgetName: budget?.name ?? null,
        acceptedCategorySource: 'manual',
        makeRule,
      }
    }))
  }

  /** Accepteer het voorstel alléén voor de getoonde transactie ("Alleen deze ene").
   *  De siblings blijven onbeoordeeld en keren later als kleinere kaart terug. */
  function acceptOne(txId: string) {
    setRows((prev) => prev.map((r) => {
      if (r.tx.id !== txId || !r.suggestion?.budget_id || r.accepted) return r
      const budget = flatBudgets.find((b) => b.id === r.suggestion!.budget_id)
      return {
        ...r,
        accepted: true,
        acceptedBudgetId: r.suggestion.budget_id,
        acceptedBudgetName: budget?.name ?? r.suggestion.budget_name,
        acceptedCategorySource: r.suggestion.category_source,
        makeRule: false,
      }
    }))
  }

  /** Open de sleepmodus voor precies de tx-id's van een groep ("Zelf indelen"). */
  function splitGroup(txIds: string[]) {
    setSleepSubset(txIds)
    setPhase('sleep')
  }

  /** Sluit de wizard-sleepmodus af: haal de behandelde rijen uit de wizard zodat
   *  de volgende groep verschijnt (niet terug naar het keuzescherm). */
  function finishSleepSubset() {
    const idset = new Set(sleepSubset ?? [])
    setRows((prev) => prev.filter((r) => !idset.has(r.tx.id)))
    setSleepSubset(null)
    setPhase('review')
  }

  /** "Stoppen en controleren": breek de nog lopende motor + gate af (zodat
   *  prefetched-maar-ongetoonde voorstellen niet meer binnenkomen). De wizard
   *  routeert zelf naar stap 3 (Controle & opslaan) — hier wordt NIET meer direct
   *  opgeslagen; dat gebeurt bewust pas via de "Opslaan"-knop in stap 3. */
  function handleStop() {
    abortRef.current?.abort()
    gateRef.current?.abort()
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    setPhase('saving')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setPhase('review')
      return
    }

    const accepted = rows.filter((r) => r.accepted && r.acceptedBudgetId)
    let saved = 0
    let rules = 0
    let bulk = 0

    for (const row of accepted) {
      // Update transaction. Wanneer het doelbudget gedeeld is en de gebruiker de
      // optie aan heeft staan, zet de transactie meteen op 'shared' (DB-trigger
      // herstempelt household_id). Anders blijft het eigendom ongemoeid.
      const update: {
        budget_id: string | null
        category_source: string
        ownership?: 'shared'
        transaction_type?: 'transfer'
      } = {
        budget_id: row.acceptedBudgetId,
        // Herkomst-getrouw: 'rule'/'manual'/'transfer'/'ai' uit het geaccepteerde
        // voorstel; een handmatige keuze schrijft 'manual'. Fallback 'ai' voor
        // rijen uit oudere flows zonder herkomst.
        category_source: row.acceptedCategorySource ?? 'ai',
      }
      // Eigen-rekening-budget gekozen (via een spiegelpaar-voorstel óf handmatig via
      // "Kies handmatig") → markeer als overboeking. De cijfer-filtering hangt aan
      // deze vlag, niet aan het budget — zelfde discipline als applyAssignments.
      const isEigenRekening = !!eigenRekeningBudgetId && row.acceptedBudgetId === eigenRekeningBudgetId
      if (isEigenRekening) {
        update.transaction_type = 'transfer'
      }
      if (showShareToggle && shareSharedBudgetTx && isSharedBudget(row.acceptedBudgetId)) {
        update.ownership = 'shared'
      }
      await supabase
        .from('transactions')
        .update(update)
        .eq('id', row.tx.id)

      saved++

      // Create rule if requested
      if (row.makeRule) {
        const matchField = row.tx.counterparty_name ? 'counterparty_name' : 'description'
        const matchValue = row.tx.counterparty_name || row.tx.description
        if (matchValue) {
          await supabase.from('category_corrections')
            .delete()
            .eq('user_id', user.id)
            .eq('match_field', matchField)
            .ilike('match_value', escapeLikePattern(matchValue))
          await supabase.from('category_corrections')
            .insert({ user_id: user.id, match_field: matchField, match_value: matchValue, budget_id: row.acceptedBudgetId })
          rules++

          // Also save IBAN correction if IBAN is available (more reliable matching)
          if (row.tx.counterparty_iban) {
            const normalizedIban = row.tx.counterparty_iban.replace(/\s/g, '').toUpperCase()
            await supabase.from('category_corrections')
              .delete()
              .eq('user_id', user.id)
              .eq('match_field', 'counterparty_iban')
              .ilike('match_value', escapeLikePattern(normalizedIban))
            await supabase.from('category_corrections')
              .insert({ user_id: user.id, match_field: 'counterparty_iban', match_value: normalizedIban, budget_id: row.acceptedBudgetId })
          }

          // Retroactively apply rule to all uncategorised matching transactions
          let bulkQuery = supabase
            .from('transactions')
            .update({ budget_id: row.acceptedBudgetId, category_source: 'rule' })
            .eq('user_id', user.id)
            .is('budget_id', null)
            .neq('id', row.tx.id)

          if (matchField === 'counterparty_name') {
            bulkQuery = bulkQuery.ilike('counterparty_name', escapeLikePattern(matchValue))
          } else {
            bulkQuery = bulkQuery.ilike('description', `%${escapeLikePattern(matchValue)}%`)
          }

          // Also match by IBAN for retroactive application
          if (row.tx.counterparty_iban) {
            const { data: ibanBulk } = await supabase
              .from('transactions')
              .update({ budget_id: row.acceptedBudgetId, category_source: 'rule' })
              .eq('user_id', user.id)
              .is('budget_id', null)
              .neq('id', row.tx.id)
              .eq('counterparty_iban', row.tx.counterparty_iban)
              .select('id')
            bulk += ibanBulk?.length ?? 0
          }

          const { data: bulkResult } = await bulkQuery.select('id')
          bulk += bulkResult?.length ?? 0
        }
      }
    }

    setSavedCount(saved)
    setRuleCount(rules)
    setBulkUpdated(bulk)
    setPhase('success')
  }

  // ── Derived counts ────────────────────────────────────────────────────────

  const acceptedCount = rows.filter((r) => r.accepted).length
  const pendingCount = rows.filter((r) => !r.accepted).length
  const aiSuggestionCount = rows.filter((r) => r.suggestion?.budget_id).length
  // Aangeboden minus daadwerkelijk opgeslagen = wat er na de Vraag-Fin/handmatige
  // route nog onbeoordeeld/ongecategoriseerd blijft. Spiegel van de autoSummary-tak,
  // die dit via computeAutoCategorization al toont (WF-CASH-32).
  const unmatchedCount = rows.length - savedCount

  // Is een budget-id een gedeeld huishoudbudget?
  const isSharedBudget = useCallback(
    (budgetId: string | null | undefined) =>
      !!budgetId && flatBudgets.find((b) => b.id === budgetId)?.ownership === 'shared',
    [flatBudgets],
  )
  // Checkbox alleen tonen wanneer er een huishouden is én minstens één voorstel/
  // keuze een gedeeld budget raakt.
  const anySharedTarget = rows.some(
    (r) => isSharedBudget(r.acceptedBudgetId) || isSharedBudget(r.suggestion?.budget_id),
  )
  const showShareToggle = hasHousehold && anySharedTarget

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
    {/* De sheet sluit visueel tijdens de Sleepmodus (open=false) — daarmee
        deactiveren ook zijn document-level Escape-listener en focus-trap,
        zodat die niet vechten met de fullscreen overlay. State blijft staan. */}
    <BottomSheet
      open={phase !== 'sleep'}
      onClose={onClose}
      title="Transacties categoriseren"
      footerSlot={
        phase === 'review' && reviewMode === 'wizard'
          ? <div ref={setWizardFooterNode} />
          : undefined
      }
    >

      {/* ── Choice ── */}
      {/* BottomSheet's content-area heeft zelf geen horizontale padding —
          consumers leveren die zelf (conventie: px-5 sm:px-6, zie o.a.
          sync-report-modal en strategie-modal-shell). */}
      {phase === 'choice' && (
        <div className="flex flex-col gap-5 px-5 py-5 sm:px-6">
          {actionError && (
            <div role="alert" className="rounded-[var(--r)] border border-orange-200 bg-orange-50 px-3 py-2.5 text-[11px] text-orange-700">
              {actionError}
            </div>
          )}
          <p className="text-sm text-[var(--ink-2)]">
            <strong className="text-[var(--ink)] font-mono tabular-nums">{activeTransactions.length}</strong>{' '}
            {activeTransactions.length === 1 ? 'transactie' : 'transacties'} zonder categorie
            {scope === 'month' && monthLabel ? <> in <span className="text-[var(--ink)]">{monthLabel}</span></> : null}
            {scope === 'all' ? <> op deze rekening</> : null}
            . Hoe wil je verdergaan?
          </p>

          {/* Scope-toggle — alleen wanneer caller een scope-bron meegeeft.
              Compacte segmented control in tab-strip-stijl: het is een
              filter/setting, niet een primaire actie, dus visueel rustig
              en zonder module-kleur. */}
          {scopeAvailable && (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)]">
                Scope <span className="ml-1 normal-case tracking-normal text-[var(--ink-4)]">— welke transacties?</span>
              </p>
              <div className="flex gap-1 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)]/40 p-0.5">
                <button
                  type="button"
                  onClick={() => handleScopeChange('month')}
                  className={[
                    'flex-1 min-h-[44px] rounded-[var(--r-sm)] px-3 py-2 text-xs font-medium transition-colors',
                    scope === 'month'
                      ? 'bg-[var(--paper)] text-[var(--ink)] shadow-[var(--s1)]'
                      : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]',
                  ].join(' ')}
                  aria-pressed={scope === 'month'}
                >
                  Deze maand
                  <span className="ml-1.5 font-mono tabular-nums text-[var(--ink-4)]">({transactions.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleScopeChange('all')}
                  className={[
                    'flex-1 min-h-[44px] rounded-[var(--r-sm)] px-3 py-2 text-xs font-medium transition-colors inline-flex items-center justify-center gap-1.5',
                    scope === 'all'
                      ? 'bg-[var(--paper)] text-[var(--ink)] shadow-[var(--s1)]'
                      : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]',
                  ].join(' ')}
                  aria-pressed={scope === 'all'}
                  disabled={loadingAll}
                >
                  Alle tijden
                  {loadingAll ? (
                    <Loader2 className="h-3 w-3 animate-spin text-[var(--ink-3)]" aria-label="Laden" />
                  ) : (
                    <span className="font-mono tabular-nums text-[var(--ink-4)]">
                      ({allTransactions ? allTransactions.length : '?'})
                    </span>
                  )}
                </button>
              </div>
              {allError && (
                <p className="mt-2 text-[11px] text-orange-700">{allError}</p>
              )}
              {scope === 'all' && allCapped && (
                <p className="mt-2 text-[11px] italic text-[var(--ink-4)]">
                  Maximaal {ALL_TIME_LIMIT} nieuwste ongekoppelde transacties meegenomen.
                </p>
              )}
            </div>
          )}

          {/* Subtiele scheiding tussen scope-setting en de primaire acties */}
          {scopeAvailable && <div className="border-t border-[var(--border-ed)]" />}

          {/* Vraag Fin — pas beschikbaar zodra we weten WAAR Fin mag draaien.
              Fail-closed: tijdens 'resolving' vertrekt er niets, dus dan is de
              knop uit i.p.v. een AI-fase te starten die toch geblokkeerd wordt. */}
          <button
            type="button"
            onClick={() => void fetchSuggestions()}
            disabled={loadingAll || activeTransactions.length === 0 || exec.status === 'resolving'}
            className="flex items-start gap-3 rounded-[var(--r-lg)] border border-dashed border-wil-300 bg-wil-50/50 px-4 py-4 text-left transition-all hover:border-wil-400 hover:shadow-[var(--s1)] disabled:opacity-50 disabled:hover:shadow-none disabled:hover:border-wil-300"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-wil-100">
              <Sparkles className="h-4 w-4 text-wil-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--ink)]">Vraag Fin</p>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-3)]">
                Je regels en eerdere keuzes delen eerst gratis in; alleen onbekende tegenpartijen gaan in kleine rondes naar Fin en zijn oordeel wordt slim doorgetrokken naar vergelijkbare transacties. Alles komt ter controle in één overzicht.
              </p>
              {exec.status === 'resolving' && (
                <p className="mt-1.5 text-[11px] text-[var(--ink-4)]">
                  Even kijken waar Fin mag draaien…
                </p>
              )}
              {exec.status === 'lokaal' && (
                <p className="mt-1.5 text-[11px] text-[var(--ink-4)]">
                  Draait op dit apparaat — je transacties verlaten je toestel niet.
                </p>
              )}
            </div>
          </button>

          {/* Slimme regels (optie 3) */}
          <button
            type="button"
            onClick={() => void runSmartRules()}
            disabled={loadingAll || activeTransactions.length === 0}
            className="flex items-start gap-3 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-4 text-left transition-all hover:border-[var(--border-md)] hover:shadow-[var(--s1)] disabled:opacity-50 disabled:hover:shadow-none disabled:hover:border-[var(--border-ed)]"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--subtle)]">
              <Wand2 className="h-4 w-4 text-[var(--ink-2)]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--ink)]">Slimme regels</p>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-3)]">
                Deel direct in op basis van je regels, je eerdere keuzes en herkende tegenpartijen — zonder AI. Eigen-rekening-overboekingen worden meteen herkend.
              </p>
            </div>
          </button>

          {/* Scheiding: automatisch (↑) vs. zelf doen (↓) */}
          <div className="flex items-center gap-3" aria-hidden="true">
            <div className="h-px flex-1 bg-[var(--border-ed)]" />
            <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">of zelf</span>
            <div className="h-px flex-1 bg-[var(--border-ed)]" />
          </div>

          {/* Sleepmodus (drag & drop) */}
          <button
            type="button"
            onClick={() => setPhase('sleep')}
            disabled={loadingAll || activeTransactions.length === 0}
            className="flex items-start gap-3 rounded-[var(--r-lg)] border border-dashed border-kern-300 bg-kern-50/50 px-4 py-4 text-left transition-all hover:border-kern-400 hover:shadow-[var(--s1)] disabled:opacity-50 disabled:hover:shadow-none disabled:hover:border-kern-300"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-kern-100">
              <Hand className="h-4 w-4 text-kern-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--ink)]">Sleepmodus</p>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-3)]">
                Sleep elke transactie naar het juiste budget. Eén voor één, met je budgetten als doelen om de transactie heen — vergelijkbare transacties vliegen mee.
              </p>
            </div>
          </button>

          {/* Handmatig */}
          <button
            type="button"
            onClick={startManual}
            disabled={loadingAll || activeTransactions.length === 0}
            className="flex items-start gap-3 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-4 text-left transition-all hover:border-[var(--border-md)] hover:shadow-[var(--s1)] disabled:opacity-50 disabled:hover:shadow-none disabled:hover:border-[var(--border-ed)]"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--subtle)]">
              <HelpCircle className="h-4 w-4 text-[var(--ink-3)]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--ink)]">Handmatig categoriseren</p>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-3)]">
                Wijs zelf per transactie een categorie toe vanuit een keuzelijst.
              </p>
            </div>
          </button>
        </div>
      )}

      {/* ── Review ── */}
      {phase === 'review' && (
        <div className="flex flex-col gap-0 px-5 pb-5 sm:px-6">
          {/* AI error fallback */}
          {aiError && (
            <div className="mb-4 rounded-[var(--r)] border border-orange-200 bg-orange-50 px-3 py-3 text-[11px] text-orange-700">
              {aiError}
            </div>
          )}

          {/* Sticky header — alléén in het handmatige (list) pad. De wizard geeft
              elke stap zijn eigen kloppende teller + acties (in de sticky footer),
              dus deze globale header wordt in wizard-modus bewust NIET gerenderd. */}
          {reviewMode === 'list' && (
            <div className="sticky top-0 z-10 bg-[var(--paper)] border-b border-[var(--border-ed)] px-0 py-4 flex flex-wrap items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-3 text-sm text-[var(--ink-2)]">
                <span>
                  <strong className="text-[var(--ink)]">{pendingCount}</strong> van {rows.length} nog te beoordelen
                </span>
                {aiSuggestionCount > 0 && (
                  <span className="flex items-center gap-1 text-kern-600 text-xs font-medium">
                    <Sparkles className="h-3 w-3" />
                    {aiSuggestionCount} {aiSuggestionCount === 1 ? 'voorstel' : 'voorstellen'}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                {aiSuggestionCount > 0 && (
                  <button
                    type="button"
                    onClick={acceptAll}
                    className="inline-flex items-center gap-1.5 rounded-[var(--r)] border border-kern-300 px-3 py-2 min-h-[44px] text-xs font-medium text-kern-700 hover:bg-kern-50"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Alles goedkeuren
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={acceptedCount === 0}
                  className="inline-flex items-center gap-1.5 rounded-[var(--r)] bg-kern-600 px-3 py-2 min-h-[44px] text-xs font-medium text-white hover:bg-kern-700 disabled:opacity-40"
                >
                  <Check className="h-3.5 w-3.5" />
                  Opslaan
                </button>
              </div>
            </div>
          )}

          {/* Gedeeld-budget → gezamenlijke transactie (alleen met huishouden + gedeeld budget) */}
          {showShareToggle && (
            <label className="mb-4 flex items-start gap-2 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2.5 text-xs text-[var(--ink-2)]">
              <input
                type="checkbox"
                checked={shareSharedBudgetTx}
                onChange={(e) => setShareSharedBudgetTx(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-kern-600"
              />
              <span>Transacties op gezamenlijke budgetten ook gezamenlijk maken</span>
            </label>
          )}

          {/* Bulk-apply prompt */}
          {bulkApplyPrompt && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-[var(--r)] border border-dashed border-wil-300 bg-wil-50/50 px-4 py-4 text-sm">
              <p className="text-[var(--ink-2)]">
                <span className="font-medium text-[var(--ink)]">{bulkApplyPrompt.siblingCount}</span> andere{' '}
                <span className="font-medium text-[var(--ink)]">'{bulkApplyPrompt.matchValue}'</span>-transacties.{' '}
                Ook als <span className="font-medium text-[var(--ink)]">{bulkApplyPrompt.budgetName}</span>?
              </p>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={applyToSiblings}
                  className="rounded-[var(--r-sm)] bg-wil-600 px-3 py-2 min-h-[44px] text-xs font-medium text-white hover:bg-wil-700"
                >
                  Ja, allemaal
                </button>
                <button
                  type="button"
                  onClick={() => setBulkApplyPrompt(null)}
                  className="rounded-[var(--r-sm)] border border-[var(--border-md)] px-3 py-2 min-h-[44px] text-xs text-[var(--ink-2)] hover:bg-[var(--subtle)]"
                >
                  Overslaan
                </button>
              </div>
            </div>
          )}

          {/* Review-weergave: wizard ("Vraag Fin") of platte lijst (handmatig) */}
          {reviewMode === 'wizard' ? (
            <CategorizeWizard
              rows={rows}
              budgetGroups={budgetGroups}
              eigenRekeningBudgetId={eigenRekeningBudgetId}
              aiPhaseActive={aiRunning}
              localMode={localMode}
              localSessionState={localSessionState}
              repBatchSize={LOCAL_REP_BATCH_SIZE}
              footerContainer={wizardFooterNode}
              step={wizardStep}
              onStepChange={setWizardStep}
              pinnedTotalGroups={pinnedTotalGroups}
              onPinTotalGroups={setPinnedTotalGroups}
              stage1Resolved={stage1Resolved}
              onAcceptSuggestion={acceptSuggestion}
              onManualBudget={setManualBudget}
              onToggleMakeRule={toggleMakeRule}
              onBulkAcceptStage1={acceptStage1}
              onAcceptGroup={acceptGroup}
              onSetGroupBudget={setGroupBudget}
              onAcceptOne={acceptOne}
              onSplitGroup={splitGroup}
              onStop={handleStop}
              onSave={() => void handleSave()}
              onAdvanceRound={(n) => gateRef.current?.releaseUpTo(n)}
            />
          ) : (
            <>
              {/* Transaction rows (handmatig pad) */}
              <div className="space-y-3">
                {rows.slice(0, showCount).map((row, idx) => (
                  <TransactionRow
                    key={row.tx.id}
                    row={row}
                    idx={idx}
                    budgetGroups={budgetGroups}
                    onAcceptSuggestion={() => acceptSuggestion(idx)}
                    onManualBudget={(bId) => setManualBudget(idx, bId)}
                    onToggleMakeRule={() => toggleMakeRule(idx)}
                  />
                ))}
              </div>

              {rows.length > showCount && (
                <button
                  type="button"
                  onClick={() => setShowCount((n) => n + SHOW_MORE_STEP)}
                  className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-[var(--r)] border border-dashed border-[var(--border-md)] py-3 text-xs text-[var(--ink-3)] hover:bg-[var(--subtle)]"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                  {rows.length - showCount} meer transacties tonen
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Saving ── */}
      {phase === 'saving' && (
        <div className="flex flex-col items-center justify-center px-5 py-16 gap-4 sm:px-6">
          <Loader2 className="h-7 w-7 animate-spin text-kern-500" />
          <p className="text-sm text-[var(--ink-3)]">Opslaan…</p>
        </div>
      )}

      {/* ── Applying (auto-flows: optie 3 & 4) ── */}
      {phase === 'applying' && (
        <div className="flex flex-col items-center justify-center px-5 py-16 gap-4 sm:px-6">
          <Loader2 className="h-7 w-7 animate-spin text-kern-500" />
          <p className="text-sm text-[var(--ink-3)]">Bezig met indelen…</p>
        </div>
      )}

      {/* ── Success ── */}
      {phase === 'success' && (
        <div className="flex flex-col items-center justify-center px-5 py-16 gap-4 text-center sm:px-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-kern-100">
            <CheckCircle className="h-7 w-7 text-kern-600" />
          </div>
          <div>
            <p className="text-lg font-bold font-[var(--font-playfair)] text-[var(--ink)]">Klaar</p>
            {autoSummary ? (
              <>
                <p className="mt-2 text-sm text-[var(--ink-2)]">
                  {savedCount === 0
                    ? 'Niets kon automatisch ingedeeld worden'
                    : <>{savedCount} {savedCount === 1 ? 'transactie' : 'transacties'} ingedeeld</>}
                </p>
                <p className="mt-1 text-xs text-[var(--ink-3)]">
                  {autoSummary.ruleCount} op regels
                  {autoSummary.transferCount > 0 && <> · {autoSummary.transferCount} als eigen rekening</>}
                  {autoSummary.unmatchedCount > 0 && <> · {autoSummary.unmatchedCount} nog open voor Fin of handmatig</>}
                </p>
                {autoSummary.mirrorCandidateCount > 0 && (
                  <p className="mt-1 text-xs text-[var(--ink-3)]">
                    {autoSummary.mirrorCandidateCount} {autoSummary.mirrorCandidateCount === 1 ? 'mogelijke overboeking' : 'mogelijke overboekingen'} gevonden — bekijk ze via Vraag Fin of handmatig.
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-[var(--ink-2)]">
                  {savedCount} {savedCount === 1 ? 'transactie' : 'transacties'} gecategoriseerd
                  {unmatchedCount > 0 && <> · {unmatchedCount} nog open voor Fin of handmatig</>}
                </p>
                {ruleCount > 0 && (
                  <p className="mt-1 text-xs text-[var(--ink-3)]">
                    {ruleCount} {ruleCount === 1 ? 'regel' : 'regels'} aangemaakt
                    {bulkUpdated > 0 && (
                      <> — {bulkUpdated} eerder{bulkUpdated === 1 ? 'e transactie' : 'e transacties'} automatisch gecategoriseerd</>
                    )}
                  </p>
                )}
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onSaved}
            className="rounded-[var(--r)] bg-kern-600 px-6 py-2 text-sm font-medium text-white hover:bg-kern-700"
          >
            Terug naar budgetten
          </button>
        </div>
      )}
    </BottomSheet>

    {/* ── Sleepmodus — fullscreen drag-&-drop boven de (gesloten) sheet ──
        Twee ingangen: het keuzescherm (volledige set) én een wizard-groep
        ("Zelf indelen", sleepSubset = die tx-id's). Bij de wizard-variant keren
        we ná afloop terug naar de wizard (volgende groep), niet naar het
        keuzescherm. */}
    {phase === 'sleep' && (
      <SleepmodusOverlay
        transactions={
          sleepSubset
            ? rows.filter((r) => sleepSubset.includes(r.tx.id)).map((r) => r.tx)
            : activeTransactions
        }
        budgets={budgets}
        budgetGroups={budgetGroups}
        hasHousehold={hasHousehold}
        monthLabel={sleepSubset ? undefined : scope === 'month' ? monthLabel : undefined}
        extraBudgets={sleepCreatedBudgets}
        onBudgetCreated={(b) => setSleepCreatedBudgets((prev) => [...prev, b])}
        onExit={() => (sleepSubset ? finishSleepSubset() : setPhase('choice'))}
        onDone={() => (sleepSubset ? finishSleepSubset() : onSaved())}
      />
    )}
    </>
  )
}
