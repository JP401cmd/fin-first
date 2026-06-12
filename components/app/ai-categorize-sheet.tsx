'use client'

import { useState, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import {
  Loader2, CheckCircle, HelpCircle, Check, ChevronDown, GitFork, Sparkles, Wand2, Hand,
} from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { createClient } from '@/lib/supabase/client'
import { buildBudgetSelectEntries, budgetOptionLabel, type Budget } from '@/lib/budget-data'
import { useHouseholdStatus } from '@/components/app/ownership-toggle'
import { loadAutoCatContext as loadSharedAutoCatContext } from '@/lib/auto-categorize-context'
import {
  computeAutoCategorization,
  detectTransferPairs,
  type AutoCatContext,
  type AutoCatTx,
  type AutoAssignment,
} from '@/lib/auto-categorize'
import { isOwnAccountTransfer } from '@/lib/parsers/categorize'

// De Sleepmodus (drag-&-drop) sleept dnd-kit mee — eigen chunk, laadt pas
// wanneer de gebruiker de modus opent.
const SleepmodusOverlay = dynamic(
  () => import('@/components/app/sleepmodus/sleepmodus-overlay').then((m) => ({ default: m.SleepmodusOverlay })),
  { ssr: false },
)

// ─── Types ────────────────────────────────────────────────────────────────────

type Transaction = {
  id: string
  date: string
  description: string
  counterparty_name: string | null
  counterparty_iban: string | null
  amount: number
  import_hash: string | null
  budget_id: string | null
  reference?: string | null
  /** Nodig voor spiegelpaar-detectie (overboekingen tussen eigen rekeningen). */
  account_id?: string | null
}

type AISuggestion = {
  import_hash: string
  budget_slug: string | null
  budget_id: string | null
  confidence: number
  reasoning: string
}

type RowState = {
  tx: Transaction
  suggestion: AISuggestion | null
  accepted: boolean
  acceptedBudgetId: string | null
  acceptedBudgetName: string | null
  makeRule: boolean
}

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

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('nl-NL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

const SHOW_MORE_STEP = 20

/** Map een sheet-transactie naar de minimale vorm voor de auto-categorisatie. */
function toAutoCatTx(tx: Transaction): AutoCatTx {
  return {
    id: tx.id,
    description: tx.description,
    counterparty_name: tx.counterparty_name,
    counterparty_iban: tx.counterparty_iban,
    amount: tx.amount,
    date: tx.date,
    account_id: tx.account_id ?? null,
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
  const [aiBatchProgress, setAiBatchProgress] = useState({ current: 0, total: 0 })
  // Aantal overboekingen tussen eigen rekeningen dat de AI-flow vóór de payload
  // automatisch heeft gemarkeerd (info-regel boven de review-rijen). Alléén
  // STERKE signalen (IBAN/naam) worden zo stil toegepast; spiegelparen (fuzzy)
  // komen als review-voorstel terug.
  const [preMarkedTransfers, setPreMarkedTransfers] = useState(0)
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

  // ── Fetch AI suggestions (parallel batches, max 3 concurrent) ─────────────

  const fetchSuggestions = useCallback(async () => {
    setPhase('ai')
    setAiError(null)
    setAiBatchProgress({ current: 0, total: 0 })
    setPreMarkedTransfers(0)

    // Snapshot the resolved set so async work below can't race with a scope
    // change. Manual / AI flow always operates on the same list.
    const sourceTx = activeTransactions

    // ── Pre-detectie: overboekingen tussen eigen rekeningen NOOIT naar de AI ──
    // Dit gebeurt volledig client-side; counterparty_iban (privacygrens) bereikt
    // de provider sowieso niet, maar zo houden we transfers ook uit de batch.
    //
    // STERK vs. FUZZY signaal (besluit code-review H1):
    //  - IBAN/naam-detectie (sterk) → direct toepassen (transaction_type='transfer'
    //    + eigen-rekening-budget), exact zoals de slimme-regels-flow. Deze rijen
    //    verschijnen NIET als review-rij; alleen geteld in `preMarkedTransfers`.
    //  - Spiegelpaar (fuzzy: gelijk bedrag, tegengesteld teken, ≤2 dagen, andere
    //    rekening) → NIET stil toepassen. Wel uit de AI-batch houden en als review-
    //    rij met een voorgevuld "Eigen rekening (overboeking)"-voorstel tonen, zodat
    //    een vals-positief (échte uitgave + toevallig gelijke ontvangst) zichtbaar
    //    blijft. Een tx die ÉN spiegelpaar ÉN IBAN/naam matcht is een sterk signaal
    //    en valt in het eerste pad.
    //
    // Degradeert: lukt het laden niet of is er geen eigen-rekening-budget, dan
    // blijven alle transacties gewoon in de AI-batch.
    let aiTx = sourceTx
    // Spiegelpaar-leden (fuzzy) → review-rij met voorgevuld eigen-rekening-voorstel.
    const mirrorSuggestions = new Map<string, AISuggestion>()
    try {
      const ctx = await loadAutoCatContext()
      setEigenRekeningBudgetId(ctx.eigenRekeningBudgetId)
      if (ctx.eigenRekeningBudgetId) {
        const autoTxs = sourceTx.map(toAutoCatTx)
        const pairIds = detectTransferPairs(autoTxs)
        // Sterk signaal: direct toepassen.
        const strongTransferIds = new Set<string>()
        // Fuzzy signaal (spiegelpaar zónder sterk signaal): review-voorstel.
        const mirrorOnlyTxs: typeof sourceTx = []
        for (const tx of sourceTx) {
          const strong = isOwnAccountTransfer(tx.counterparty_iban, ctx.ownIbans, tx.counterparty_name, ctx.ownNamePatterns)
          if (strong) {
            strongTransferIds.add(tx.id)
          } else if (pairIds.has(tx.id)) {
            mirrorOnlyTxs.push(tx)
          }
        }
        if (strongTransferIds.size > 0) {
          await applyAssignments(
            Array.from(strongTransferIds).map((id) => ({
              id,
              budget_id: ctx.eigenRekeningBudgetId!,
              category_source: 'transfer',
              isTransfer: true,
            })),
          )
          setPreMarkedTransfers(strongTransferIds.size)
        }
        // Bouw een review-voorstel per spiegelpaar-only-lid: zelfde vorm als een
        // AI-voorstel (import_hash-key) maar lokaal gegenereerd. Accepteren schrijft
        // bij opslaan transaction_type='transfer' (handleSave herkent het budget).
        // Leesbare naam van de eigen-rekening-post (voor de voorstel-weergave als
        // het budget niet in budgetGroups.children zit — archive-bucket).
        const eigenRekeningName =
          flatBudgets.find((b) => b.id === ctx.eigenRekeningBudgetId)?.name ?? 'Eigen rekening (overboeking)'
        for (const tx of mirrorOnlyTxs) {
          const hash = tx.import_hash ?? `${tx.date}-${tx.amount}-${tx.description}`
          mirrorSuggestions.set(hash, {
            import_hash: hash,
            budget_slug: eigenRekeningName,
            budget_id: ctx.eigenRekeningBudgetId,
            confidence: 0.85,
            reasoning: `Spiegelboeking: zelfde bedrag tegengesteld op een andere rekening, ${formatDate(tx.date)}`,
          })
        }
        // Alleen de sterke transfers verlaten de AI-batch; spiegelpaar-leden gaan er
        // wél doorheen (als review-rij), maar krijgen geen AI-call: ze hebben al een
        // lokaal voorstel.
        aiTx = sourceTx.filter((tx) => !strongTransferIds.has(tx.id))
      }
    } catch {
      // Context laden mislukte → degradeer stilletjes: stuur de volledige set
      // naar de AI (zelfde gedrag als wanneer er geen eigen-rekening-budget is).
      aiTx = sourceTx
    }

    // Edge: alles was een overboeking → geen lege batch naar de API, direct naar
    // review met enkel de info-regel.
    if (aiTx.length === 0) {
      setRows([])
      setPhase('review')
      return
    }

    try {
      // Spiegelpaar-leden krijgen geen AI-call: ze hebben al een lokaal voorstel.
      // Ze blijven wel review-rij (zie initialRows), maar gaan niet naar de provider.
      const payload = aiTx
        .filter((tx) => {
          const hash = tx.import_hash ?? `${tx.date}-${tx.amount}-${tx.description}`
          return !mirrorSuggestions.has(hash)
        })
        .map((tx) => ({
          import_hash: tx.import_hash ?? `${tx.date}-${tx.amount}-${tx.description}`,
          description: tx.description,
          counterparty_name: tx.counterparty_name,
          // Bewust GEEN counterparty_iban: sanitizeForAI maskeert elk IBAN naar de
          // constante "[IBAN]" vóór het de provider bereikt — privacy-correct maar
          // nul signaal voor het model. IBAN-matching gebeurt lokaal (slimme regels).
          amount: tx.amount,
          reference: tx.reference,
          date: tx.date,
        }))

      // Split into batches of 20
      const batches: typeof payload[] = []
      for (let i = 0; i < payload.length; i += 20) {
        batches.push(payload.slice(i, i + 20))
      }

      setAiBatchProgress({ current: 0, total: payload.length })

      // Parallel fetch with max 3 concurrent (semaphore pattern)
      const allResults: AISuggestion[] = []
      let completedCount = 0
      let nextIdx = 0

      async function runWorker(): Promise<void> {
        while (nextIdx < batches.length) {
          const idx = nextIdx++
          const batch = batches[idx]
          const res = await fetch('/api/ai/categorize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transactions: batch }),
          })

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}))
            throw new Error((errData as { error?: string }).error ?? 'AI-analyse niet beschikbaar')
          }

          const data = await res.json() as { results: AISuggestion[] }
          allResults.push(...data.results)
          completedCount += batch.length
          setAiBatchProgress((prev) => ({ ...prev, current: completedCount }))
        }
      }

      const workers = Array.from({ length: Math.min(3, batches.length) }, () => runWorker())
      await Promise.all(workers)

      // Build suggestion map
      const suggestionMap = new Map<string, AISuggestion>()
      for (const s of allResults) {
        suggestionMap.set(s.import_hash, s)
      }

      // Build rows — de review-set: AI-voorgelegde transacties (sterke transfers zijn
      // er vooraf uitgehaald en al toegepast) PLUS spiegelpaar-leden, die een lokaal
      // voorgevuld eigen-rekening-voorstel meekrijgen i.p.v. een AI-voorstel.
      const initialRows: RowState[] = aiTx.map((tx) => {
        const hash = tx.import_hash ?? `${tx.date}-${tx.amount}-${tx.description}`
        const suggestion = mirrorSuggestions.get(hash) ?? suggestionMap.get(hash) ?? null

        // Suggesties worden NIET vooraf geaccepteerd; de gebruiker beslist per rij.
        return {
          tx,
          suggestion,
          accepted: false,
          acceptedBudgetId: null,
          acceptedBudgetName: null,
          makeRule: false,
        }
      })

      setRows(initialRows)
      setPhase('review')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI-analyse niet beschikbaar'
      setAiError(msg)
      // Fall back to review mode without AI-suggestions. De lokaal bepaalde
      // spiegelpaar-voorstellen blijven wél staan (die hangen niet aan de AI-call).
      setRows(aiTx.map((tx) => {
        const hash = tx.import_hash ?? `${tx.date}-${tx.amount}-${tx.description}`
        return {
          tx,
          suggestion: mirrorSuggestions.get(hash) ?? null,
          accepted: false,
          acceptedBudgetId: null,
          acceptedBudgetName: null,
          makeRule: false,
        }
      }))
      setPhase('review')
    }
  }, [activeTransactions, loadAutoCatContext, applyAssignments, budgets])

  function startManual() {
    setRows(activeTransactions.map((tx) => ({
      tx,
      suggestion: null,
      accepted: false,
      acceptedBudgetId: null,
      acceptedBudgetName: null,
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
    // Een eigen-rekening-voorstel (spiegelpaar) is een eenmalige overboeking, geen
    // terugkerende categorie: geen regel aanmaken en geen sibling-detectie.
    const isEigenRekening = !!eigenRekeningBudgetId && row.suggestion.budget_id === eigenRekeningBudgetId
    const updatedRows = rows.map((r, i) => {
      if (i !== idx || !r.suggestion?.budget_id) return r
      return {
        ...r,
        accepted: true,
        acceptedBudgetId: r.suggestion.budget_id,
        acceptedBudgetName: budget?.name ?? r.suggestion.budget_slug,
        makeRule: !isEigenRekening,
      }
    })
    setRows(updatedRows)
    if (isEigenRekening) return
    const matchField = row.tx.counterparty_name ? 'counterparty_name' as const : 'description' as const
    const matchValue = row.tx.counterparty_name || row.tx.description
    const budgetId = row.suggestion.budget_id
    const budgetName = budget?.name ?? row.suggestion.budget_slug ?? ''
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
      return { ...r, accepted: true, acceptedBudgetId: budgetId, acceptedBudgetName: budgetName, makeRule: false }
    }))
    setBulkApplyPrompt(null)
  }

  function acceptAll() {
    setRows((prev) => prev.map((r) => {
      if (!r.suggestion?.budget_id) return r
      const budget = flatBudgets.find((b) => b.id === r.suggestion!.budget_id)
      return {
        ...r,
        accepted: true,
        acceptedBudgetId: r.suggestion.budget_id,
        acceptedBudgetName: budget?.name ?? r.suggestion.budget_slug,
        makeRule: true,
      }
    }))
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
        category_source: 'ai',
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
            .ilike('match_value', matchValue)
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
              .ilike('match_value', normalizedIban)
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
            bulkQuery = bulkQuery.ilike('counterparty_name', matchValue)
          } else {
            bulkQuery = bulkQuery.ilike('description', `%${matchValue}%`)
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
    <BottomSheet open={phase !== 'sleep'} onClose={onClose} title="Transacties categoriseren">

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

          {/* Vraag Will */}
          <button
            type="button"
            onClick={() => void fetchSuggestions()}
            disabled={loadingAll || activeTransactions.length === 0}
            className="flex items-start gap-3 rounded-[var(--r-lg)] border border-dashed border-wil-300 bg-wil-50/50 px-4 py-4 text-left transition-all hover:border-wil-400 hover:shadow-[var(--s1)] disabled:opacity-50 disabled:hover:shadow-none disabled:hover:border-wil-300"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-wil-100">
              <Sparkles className="h-4 w-4 text-wil-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--ink)]">Vraag Will</p>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-3)]">
                Will analyseert de transacties en stelt categorieën voor op basis van beschrijving en tegenpartij.
              </p>
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

      {/* ── AI processing ── */}
      {phase === 'ai' && (
        <div className="space-y-5 px-5 py-6 sm:px-6">
          <div className="flex flex-col items-center gap-3 pb-3">
            <Loader2 className="h-7 w-7 animate-spin text-wil-500" />
            <p className="text-sm font-medium text-[var(--ink-2)]">
              {aiBatchProgress.total > 0
                ? <>Will categoriseert… <span className="font-mono tabular-nums">{aiBatchProgress.current}</span> van <span className="font-mono tabular-nums">{aiBatchProgress.total}</span> transacties</>
                : 'Will analyseert'
              }
            </p>
          </div>

          {/* Progress bar */}
          {aiBatchProgress.total > 0 && (
            <div className="h-1.5 rounded-full bg-wil-100 overflow-hidden mx-4">
              <div
                className="h-1.5 rounded-full bg-wil-500"
                style={{
                  width: `${(aiBatchProgress.current / aiBatchProgress.total) * 100}%`,
                  transition: 'width 0.4s ease-out',
                }}
              />
            </div>
          )}

          {/* Will editorial quote card — toon het WERKELIJKE aantal dat naar de AI
              gaat (aiBatchProgress.total = de payload ná pre-detectie: sterke
              transfers en spiegelpaar-leden zitten daar niet in). Vóór de teller
              gezet is, val terug op de actieve set. */}
          <div className="rounded-[var(--r-lg)] border border-dashed border-wil-200 bg-wil-50/50 px-4 py-4">
            <p className="font-[var(--font-source-serif)] text-[13px] italic leading-relaxed text-[var(--ink-2)] border-l-[3px] border-wil-500 pl-3">
              &ldquo;{aiBatchProgress.total > 0 ? aiBatchProgress.total : activeTransactions.length} transacties worden vergeleken met jouw eerdere gewoonten…&rdquo;
            </p>
            <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-wil-600">— Will</p>
          </div>

          {/* Skeleton rows */}
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] p-3 animate-pulse">
                <div className="flex justify-between">
                  <div className="h-3 w-32 rounded bg-[var(--subtle)]" />
                  <div className="h-3 w-16 rounded bg-[var(--subtle)]" />
                </div>
                <div className="mt-2 h-2.5 w-48 rounded bg-[var(--subtle)]" />
                <div className="mt-2 h-7 w-full rounded bg-[var(--subtle)]" />
              </div>
            ))}
          </div>
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

          {/* Vooraf gemarkeerde eigen-rekening-overboekingen — neutraal/informatief.
              Deze rijen verschijnen bewust NIET als review-rij; ze zijn al toegepast. */}
          {preMarkedTransfers > 0 && (
            <div className="mb-4 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2.5 text-[11px] text-[var(--ink-2)]">
              {preMarkedTransfers} {preMarkedTransfers === 1 ? 'overboeking' : 'overboekingen'} tussen eigen rekeningen automatisch gemarkeerd.
            </div>
          )}

          {/* Sticky header */}
          <div className="sticky top-0 z-10 bg-[var(--paper)] border-b border-[var(--border-ed)] px-0 py-4 flex flex-wrap items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-3 text-sm text-[var(--ink-2)]">
              <span>
                <strong className="text-[var(--ink)]">{pendingCount}</strong> van {rows.length} nog te beoordelen
              </span>
              {aiSuggestionCount > 0 && (
                <span className="flex items-center gap-1 text-kern-600 text-xs font-medium">
                  <Sparkles className="h-3 w-3" />
                  {aiSuggestionCount} AI-voorstellen
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

          {/* Transaction rows */}
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
                  {autoSummary.unmatchedCount > 0 && <> · {autoSummary.unmatchedCount} nog open voor Will of handmatig</>}
                </p>
                {autoSummary.mirrorCandidateCount > 0 && (
                  <p className="mt-1 text-xs text-[var(--ink-3)]">
                    {autoSummary.mirrorCandidateCount} {autoSummary.mirrorCandidateCount === 1 ? 'mogelijke overboeking' : 'mogelijke overboekingen'} gevonden — bekijk ze via Vraag Will of handmatig.
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-[var(--ink-2)]">
                  {savedCount} {savedCount === 1 ? 'transactie' : 'transacties'} gecategoriseerd
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

    {/* ── Sleepmodus — fullscreen drag-&-drop boven de (gesloten) sheet ── */}
    {phase === 'sleep' && (
      <SleepmodusOverlay
        transactions={activeTransactions}
        budgets={budgets}
        budgetGroups={budgetGroups}
        hasHousehold={hasHousehold}
        monthLabel={scope === 'month' ? monthLabel : undefined}
        onExit={() => setPhase('choice')}
        onDone={onSaved}
      />
    )}
    </>
  )
}

// ─── Transaction Row ───────────────────────────────────────────────────────────

type RowProps = {
  row: RowState
  idx: number
  budgetGroups: { parent: Budget; children: Budget[] }[]
  onAcceptSuggestion: () => void
  onManualBudget: (budgetId: string) => void
  onToggleMakeRule: () => void
}

function TransactionRow({ row, budgetGroups, onAcceptSuggestion, onManualBudget, onToggleMakeRule }: RowProps) {
  const { tx, suggestion, accepted, acceptedBudgetName, makeRule } = row
  const hasSuggestion = !!suggestion?.budget_id

  return (
    <div className={`rounded-[var(--r-lg)] border p-4 transition-colors ${
      accepted
        ? 'border-positive/30 bg-positive/5'
        : 'border-[var(--border-ed)] bg-[var(--paper)]'
    }`}>
      {/* Row header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-[var(--ink-3)]">{formatDate(tx.date)}</p>
          <p className="mt-1 truncate text-sm font-medium text-[var(--ink)] line-clamp-2">{tx.description}</p>
          {tx.counterparty_name && (
            <p className="mt-1 truncate text-[11px] text-[var(--ink-3)]">{tx.counterparty_name}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className={`font-[var(--font-dm-mono)] text-sm font-medium tabular-nums ${
            tx.amount > 0 ? 'text-positive' : 'text-[var(--ink)]'
          }`}>
            {tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount)}
          </p>
          {accepted && (
            <span className="mt-1 flex items-center justify-end gap-0.5 text-[10px] text-positive">
              <Check className="h-3 w-3" />
              Gekeurd
            </span>
          )}
        </div>
      </div>

      {/* AI suggestion block */}
      {hasSuggestion && !accepted && (
        <div className="mt-3 rounded-r-[var(--r-sm)] border border-dashed border-kern-200 bg-kern-50/50 px-3 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 mb-2">
                <Sparkles className="h-3 w-3 text-kern-500 shrink-0" />
                <p className="font-[var(--font-source-serif)] text-[11px] italic text-[var(--ink-2)] line-clamp-2">
                  {suggestion.reasoning}
                </p>
              </div>
              <p className="text-xs font-medium text-kern-700">
                {budgetGroups.flatMap((g) => g.children).find((b) => b.id === suggestion.budget_id)?.name ?? suggestion.budget_slug}
              </p>
            </div>
            <button
              type="button"
              onClick={onAcceptSuggestion}
              className="shrink-0 inline-flex items-center gap-1 rounded-[var(--r-sm)] bg-[var(--kern)] px-3 py-2 text-xs font-medium text-white min-h-[44px] hover:opacity-90"
            >
              <Check className="h-3 w-3" />
              OK
            </button>
          </div>
        </div>
      )}

      {/* Accepted AI suggestion — show rule toggle */}
      {accepted && hasSuggestion && (
        <div className="mt-3 flex items-center gap-2 rounded-[var(--r-sm)] border border-dashed border-[var(--border-ed)] px-3 py-2.5">
          <GitFork className="h-3.5 w-3.5 text-[var(--ink-3)] shrink-0" />
          <span className="text-[11px] text-[var(--ink-3)] flex-1">
            Maak ook een regel
            <span className="ml-1 text-[var(--ink-4)]">
              Altijd &ldquo;{tx.counterparty_name || tx.description.slice(0, 30)}&rdquo; → {acceptedBudgetName}
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={makeRule}
            onClick={onToggleMakeRule}
            className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
              makeRule ? 'bg-kern-500' : 'bg-[var(--border-md)]'
            }`}
          >
            <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${
              makeRule ? 'translate-x-3.5' : 'translate-x-0.5'
            }`} />
          </button>
        </div>
      )}

      {/* Manual selection — no AI suggestion or manual override */}
      {!hasSuggestion && (
        <div className="mt-3 flex items-center gap-2">
          <HelpCircle className="h-3.5 w-3.5 text-[var(--ink-4)] shrink-0" />
          <select
            value={row.acceptedBudgetId ?? ''}
            onChange={(e) => onManualBudget(e.target.value)}
            className="flex-1 rounded border border-[var(--border-ed)] px-2 py-2 min-h-[44px] text-xs outline-none focus:border-kern-500"
          >
            <option value="">Kies handmatig</option>
            {buildBudgetSelectEntries(budgetGroups).map((entry) =>
              entry.kind === 'group' ? (
                <optgroup key={entry.id} label={entry.label}>
                  {entry.options.map((c) => (
                    <option key={c.id} value={c.id}>{budgetOptionLabel(c)}</option>
                  ))}
                </optgroup>
              ) : (
                <option key={entry.id} value={entry.id}>{budgetOptionLabel(entry)}</option>
              )
            )}
          </select>
        </div>
      )}

      {/* Manual selection for rows with AI suggestion (override) */}
      {hasSuggestion && !accepted && (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => {
              // Show the select by setting a flag — handled via manual select appearing below
            }}
            className="font-[var(--font-source-serif)] text-[11px] italic text-kern-600 hover:underline"
          >
            Andere categorie kiezen →
          </button>
        </div>
      )}

      {/* Manual override dropdown for rows that had AI suggestions */}
      {hasSuggestion && (
        <div className={`mt-2 ${accepted ? 'hidden' : ''}`} id={`manual-${row.tx.id}`}>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) onManualBudget(e.target.value)
            }}
            className="w-full rounded border border-dashed border-[var(--border-ed)] px-2 py-2 min-h-[44px] text-xs text-[var(--ink-3)] outline-none focus:border-kern-500 focus:text-[var(--ink)]"
            aria-label="Andere categorie kiezen"
          >
            <option value="">— Andere categorie kiezen —</option>
            {buildBudgetSelectEntries(budgetGroups).map((entry) =>
              entry.kind === 'group' ? (
                <optgroup key={entry.id} label={entry.label}>
                  {entry.options.map((c) => (
                    <option key={c.id} value={c.id}>{budgetOptionLabel(c)}</option>
                  ))}
                </optgroup>
              ) : (
                <option key={entry.id} value={entry.id}>{budgetOptionLabel(entry)}</option>
              )
            )}
          </select>
        </div>
      )}
    </div>
  )
}
