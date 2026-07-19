'use client'

// ── "Vraag Will"-wizard — drie opeenvolgende stappen (feature #881, flow-revisie) ──
//
// Pure presentatie bovenop de review-rijen (RowState) die AICategorizeSheet
// aanlevert. De wizard vervangt de platte reviewlijst voor het "Vraag Will"-pad
// en leidt de gebruiker door drie stappen:
//
//   1. Automatisch herkend — één bulk-kaart voor alles wat Will gratis herkende
//      via je regels en overboekingen (stage-1: bron rule/transfer/mirror). Je
//      past ze in één keer toe, bekijkt ze stuk voor stuk, of gaat verder zonder
//      toepassen (dan blijven ze openstaan en verschijnen ze in stap 3).
//   2. Will's voorstellen — de onbekende tegenpartijen als AI-groepkaarten, één
//      tegelijk, met vier keuzes per groep. De volgorde volgt de MOTOR-comparator
//      (buildCombinedGroups + orderGroupsLargestFirst) — nooit een eigen sortering.
//   3. Controle & opslaan — een eindoverzicht van álle voorgenomen én openstaande
//      toekenningen, gegroepeerd per doelcategorie, met "Opslaan" als afsluiter.
//
// De wizard bezit géén rijen-state: hij leest `rows` en roept de callbacks van de
// sheet aan (wrappers om de bestaande accept/manual/save-handlers). Zo blijft er
// één bron van waarheid en één opslag-pad. De actieve STAP wordt bij voorkeur
// door de sheet aangestuurd (`step`/`onStepChange`) zodat 'ie een uitstapje naar
// de sleepmodus overleeft; zonder die props houdt de wizard z'n eigen stap bij
// (component-tests).
//
// De PRIMAIRE acties per stap staan niet in de scrollende body maar in de niet-
// scrollende sticky footer van de BottomSheet. De sheet levert daarvoor een
// `footerContainer` (het DOM-node van zijn `footerSlot`); de wizard portalt zijn
// actieblok daarin. Zonder container (standalone/tests/SSR) valt de wizard terug
// op inline rendering zodat de acties altijd zichtbaar en testbaar blijven.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  Sparkles, Check, CheckCheck, ChevronDown, ChevronUp, Loader2, Hand, GitFork, Cpu, ListChecks,
} from 'lucide-react'
import { buildBudgetSelectEntries, budgetOptionLabel, type Budget } from '@/lib/budget-data'
import {
  buildCombinedGroups,
  orderGroupsLargestFirst,
  type CombinedTx,
} from '@/lib/auto-categorize'
// "Zeker"-grens die de UI gebruikt om een voorstel met lage confidence als
// "minder zeker" te labelen. Blijft de single source in de resolver (0,8); de
// resolver zet budget_id vanaf 0,5 maar behoudt de confidence, zodat de kaart
// zelf kan bepalen of een voorstel onder de zekerheidsgrens valt.
import { LOCAL_MIN_CONFIDENCE } from '@/lib/ai/local/local-categorize-resolver'
import {
  TransactionRow,
  SOURCE_LABELS,
  formatDate,
  type RowState,
} from '@/components/app/categorize-row'
import { MaskedAmount } from '@/components/app/masked-amount'

/** Boven dit aantal stage-1-rijen blijft de bulk-kaart standaard ingeklapt
 *  (bulk-akkoord i.p.v. 100 rijen doorlopen); daaronder tonen we ze meteen. */
const BULK_AUTO_EXPAND_MAX = 8

const STAGE1_SOURCES = new Set(['rule', 'transfer', 'mirror'])

type WizardStep = 1 | 2 | 3

const STEP_LABEL: Record<WizardStep, string> = {
  1: 'Automatisch',
  2: "Will's voorstellen",
  3: 'Controle',
}

/** Herkomst-badge per rij in stap 3 — inclusief de handmatige keuze (niet in
 *  SOURCE_LABELS, want dat is puur voorstel-bron). */
const SOURCE_BADGE: Record<string, string> = {
  rule: 'Regel',
  transfer: 'Overboeking',
  mirror: 'Overboeking',
  ai: 'Will',
  propagated: 'Afgeleid',
  manual: 'Handmatig',
}

type Props = {
  rows: RowState[]
  budgetGroups: { parent: Budget; children: Budget[] }[]
  eigenRekeningBudgetId: string | null
  /** Draait de motor nog AI-rondes? Stuurt de laadstatus + wakelock. */
  aiPhaseActive: boolean
  /** Privé-modus-hint + sessiestart-feedback (lokaal on-device pad). */
  localMode: boolean
  localSessionState: 'idle' | 'starten' | 'klaar'
  /** Aantal groepen per AI-ronde (voor de prefetch-gate-koppeling). */
  repBatchSize: number
  /**
   * DOM-node van de sticky sheet-footer (`BottomSheet.footerSlot`). Wanneer
   * gegeven portalt de wizard zijn primaire-actieblok daarin (niet-scrollend);
   * null → inline fallback onderaan de wizard (standalone/tests/SSR).
   */
  footerContainer?: HTMLElement | null

  /**
   * Gecontroleerde actieve stap. Geeft de sheet 'm mee (met `onStepChange`), dan
   * stuurt de sheet de stap (en overleeft die een sleepmodus-uitstapje). Weglaten
   * → de wizard beheert z'n eigen stap-state (component-tests).
   */
  step?: WizardStep | null
  onStepChange?: (step: WizardStep) => void
  /**
   * Vastgepind aantal groepen (M) voor de "Groep N van M"-teller. Net als `step`
   * bij voorkeur door de sheet gehouden, zodat het anker een sleepmodus-uitstapje
   * (waarbij de wizard even unmount) overleeft. null = nog niet bepaald; de sheet
   * zet 'm zodra de wizard `onPinTotalGroups` aanroept. Weglaten → de wizard pint
   * intern (eigen ref, identiek gedrag; component-tests).
   */
  pinnedTotalGroups?: number | null
  onPinTotalGroups?: (total: number) => void
  /**
   * Is de gratis stap-1 (regels/overboekingen) al bepaald? Pas dán weten we of
   * stap 1 bestaat en op welke stap we moeten starten. Tijdens de eerste, stille
   * context-laad (streaming) toont de wizard een korte laadstatus. Undefined
   * (tests) telt als "klaar".
   */
  stage1Resolved?: boolean

  // Rij-niveau (hergebruikte TransactionRow) — index in `rows`.
  onAcceptSuggestion: (idx: number) => void
  onManualBudget: (idx: number, budgetId: string) => void
  onToggleMakeRule: (idx: number) => void

  // Bulk-kaart (stage-1).
  onBulkAcceptStage1: () => void

  // Groep-niveau (AI-fase) — op transactie-id's.
  onAcceptGroup: (txIds: string[]) => void
  onSetGroupBudget: (txIds: string[], budgetId: string, makeRule: boolean) => void
  onAcceptOne: (txId: string) => void
  onSplitGroup: (txIds: string[]) => void

  // Afronden.
  onStop: () => void
  /** Opslaan (stap 3, primaire actie) — roept de bestaande handleSave aan. */
  onSave: () => void
  /** Meld aan de gate tot en met welke AI-ronde de wizard nu getoond heeft. */
  onAdvanceRound: (shownRound: number) => void
}

function rowToCombinedTx(row: RowState): CombinedTx {
  const tx = row.tx
  return {
    id: tx.id,
    description: tx.description,
    counterparty_name: tx.counterparty_name,
    counterparty_iban: tx.counterparty_iban,
    amount: tx.amount,
    date: tx.date ?? null,
    account_id: tx.account_id ?? null,
    reference: tx.reference ?? null,
  }
}

export function CategorizeWizard({
  rows,
  budgetGroups,
  aiPhaseActive,
  localMode,
  localSessionState,
  repBatchSize,
  footerContainer,
  step,
  onStepChange,
  pinnedTotalGroups,
  onPinTotalGroups,
  stage1Resolved,
  onAcceptSuggestion,
  onManualBudget,
  onToggleMakeRule,
  onBulkAcceptStage1,
  onAcceptGroup,
  onSetGroupBudget,
  onAcceptOne,
  onSplitGroup,
  onStop,
  onSave,
  onAdvanceRound,
}: Props) {
  // Index van elke rij, zodat de rij-handlers (op index) aangeroepen kunnen worden.
  const indexById = useMemo(() => {
    const m = new Map<string, number>()
    rows.forEach((r, i) => m.set(r.tx.id, i))
    return m
  }, [rows])

  const rowsById = useMemo(() => {
    const m = new Map<string, RowState>()
    for (const r of rows) m.set(r.tx.id, r)
    return m
  }, [rows])

  // ── Stage-1 (bulk) vs. AI-fase splitsen ──
  const stage1Rows = useMemo(
    () => rows.filter((r) => r.suggestion && STAGE1_SOURCES.has(r.suggestion.source)),
    [rows],
  )
  const aiRows = useMemo(
    () => rows.filter((r) => !(r.suggestion && STAGE1_SOURCES.has(r.suggestion.source))),
    [rows],
  )

  // Nog-te-beoordelen AI-rijen → groepen (zelfde volgorde als de motor).
  const pendingGroups = useMemo(() => {
    const pending = aiRows.filter((r) => !r.accepted)
    const groupMap = buildCombinedGroups(pending.map(rowToCombinedTx))
    const orderedKeys = orderGroupsLargestFirst(Array.from(groupMap.keys()), groupMap)
    return orderedKeys.map((k) => groupMap.get(k)!)
  }, [aiRows])

  const currentGroup = pendingGroups[0] ?? null
  const currentKey = currentGroup ? currentGroup[0].id : null

  // ── Welke stappen bestaan? ────────────────────────────────────────────────
  const hasStage1 = stage1Rows.length > 0
  const hasAi = aiRows.length > 0
  const steps = useMemo<WizardStep[]>(() => {
    const s: WizardStep[] = []
    if (hasStage1) s.push(1)
    if (hasAi) s.push(2)
    s.push(3)
    return s
  }, [hasStage1, hasAi])

  // Pas nadat stap-1 bepaald is (of de AI-fase klaar is) weten we welke stappen
  // bestaan en op welke we starten. Undefined stage1Resolved (tests) telt als klaar.
  const structPinned = rows.length > 0 && ((stage1Resolved ?? true) || !aiPhaseActive)

  // ── Gecontroleerde vs. eigen stap-state ──
  const [internalStep, setInternalStep] = useState<WizardStep | null>(null)
  const controlled = step !== undefined
  const currentStep = controlled ? (step ?? null) : internalStep
  const setStep = useCallback(
    (s: WizardStep) => {
      onStepChange?.(s)
      if (!controlled) setInternalStep(s)
    },
    [controlled, onStepChange],
  )

  // Init op de eerste bestaande stap zodra de structuur bekend is.
  useEffect(() => {
    if (currentStep === null && structPinned && steps.length > 0) setStep(steps[0])
  }, [currentStep, structPinned, steps, setStep])

  // Automatische overgang stap 2 → 3 zodra de wachtrij leeg is (eigenaarsbesluit A2).
  useEffect(() => {
    if (currentStep === 2 && structPinned && pendingGroups.length === 0) setStep(3)
  }, [currentStep, structPinned, pendingGroups.length, setStep])

  const goNext = useCallback(
    (from: WizardStep) => {
      const idx = steps.indexOf(from)
      setStep(steps[Math.min(idx + 1, steps.length - 1)])
    },
    [steps, setStep],
  )

  // "Stoppen en controleren": breek de motor af (via de sheet) én route naar de
  // controle-stap (niet meer direct opslaan).
  const handleStop = useCallback(() => {
    onStop()
    setStep(3)
  }, [onStop, setStep])

  // ── Voortgangsteller (M/N) voor stap 2 ─────────────────────────────────────
  // Anker M bij voorkeur in de sheet (pinnedTotalGroups/onPinTotalGroups) zodat de
  // teller een sleepmodus-uitstapje overleeft; zonder die props (standalone/tests)
  // valt de wizard terug op een eigen ref met identiek gedrag.
  const internalTotalRef = useRef<number | null>(null)
  const totalControlled = pinnedTotalGroups !== undefined
  const pinnedTotal = totalControlled ? (pinnedTotalGroups ?? null) : internalTotalRef.current
  const canPin = pendingGroups.length > 0 && (rows.some((r) => r.suggestion) || !aiPhaseActive)
  useEffect(() => {
    if (pinnedTotal === null && canPin) {
      if (totalControlled) onPinTotalGroups?.(pendingGroups.length)
      else internalTotalRef.current = pendingGroups.length
    }
  }, [pinnedTotal, totalControlled, onPinTotalGroups, canPin, pendingGroups.length])
  const totalGroups = pinnedTotal ?? pendingGroups.length
  const progressM = totalGroups
  const progressN = Math.max(1, totalGroups - pendingGroups.length + 1)
  // Hoeveel van de wachtende groepen hebben nú al een voorstel klaar.
  const readyCount = pendingGroups.filter((g) => !!rowsById.get(g[0].id)?.suggestion?.budget_id).length
  // Hoeveel daarvan zijn "minder zeker" (dezelfde tweede-trap-grens als de kaart).
  // Transparantie-telling op de bulk-knop; het knopgedrag verandert hier niet.
  const lessConfidentCount = pendingGroups.filter((g) => {
    const s = rowsById.get(g[0].id)?.suggestion
    return (
      !!s?.budget_id &&
      (s.source === 'ai' || s.source === 'propagated') &&
      s.confidence != null &&
      s.confidence < LOCAL_MIN_CONFIDENCE
    )
  }).length

  // Prefetch-gate: meld na elke afhandeling tot welke AI-ronde de wizard staat.
  const advancesRef = useRef(0)
  const advance = useCallback(() => {
    advancesRef.current += 1
    onAdvanceRound(Math.floor(advancesRef.current / Math.max(1, repBatchSize)))
  }, [onAdvanceRound, repBatchSize])

  // ── Bulk-kaart in/uitklappen (stap 1) ──
  const [bulkExpanded, setBulkExpanded] = useState(false)
  const bulkAutoOpen = stage1Rows.length > 0 && stage1Rows.length <= BULK_AUTO_EXPAND_MAX
  const showBulkRows = bulkExpanded || bulkAutoOpen
  const stage1Pending = stage1Rows.filter((r) => !r.accepted).length

  // ── "Andere categorie"-paneel per (huidige) groep (stap 2) ──
  const [otherOpen, setOtherOpen] = useState(false)
  const [otherBudgetId, setOtherBudgetId] = useState('')
  const [otherMakeRule, setOtherMakeRule] = useState(false)
  useEffect(() => {
    setOtherOpen(false)
    setOtherBudgetId('')
    setOtherMakeRule(false)
  }, [currentKey])

  // ── Wakelock (best-effort) tijdens de actieve AI-fase ──
  const wakeRef = useRef<{ release: () => Promise<void> } | null>(null)
  useEffect(() => {
    let cancelled = false
    async function acquire() {
      try {
        const wl = (navigator as Navigator & {
          wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> }
        }).wakeLock
        if (!wl) return
        const sentinel = await wl.request('screen')
        if (cancelled) {
          void sentinel.release().catch(() => {})
          return
        }
        wakeRef.current = sentinel
      } catch {
        // Wakelock is puur comfort — nooit een foutstatus.
      }
    }
    if (aiPhaseActive) void acquire()
    return () => {
      cancelled = true
      const s = wakeRef.current
      wakeRef.current = null
      if (s) void s.release().catch(() => {})
    }
  }, [aiPhaseActive])

  // ── Huidige groep-afgeleiden (voor de footer-acties) ──
  const currentRep = currentGroup ? currentGroup[0] : null
  const currentTxIds = currentGroup ? currentGroup.map((t) => t.id) : []
  const currentSuggestion = currentRep ? rowsById.get(currentRep.id)?.suggestion ?? null : null
  const currentHasProposal = !!currentSuggestion?.budget_id
  const currentMultiple = (currentGroup?.length ?? 0) > 1

  function applyOther(ids: string[]) {
    if (!otherBudgetId) return
    onSetGroupBudget(ids, otherBudgetId, otherMakeRule)
    advance()
  }

  // "Alle AI-voorstellen goedkeuren": accepteer alle wachtrij-groepen die nú een
  // voorstel hebben (bestaande acceptGroup-semantiek). advance() net zo vaak als
  // er groepen geaccepteerd worden, zodat de prefetch-telling blijft kloppen.
  // No-op bij 0 groepen-met-voorstel.
  function acceptAllProposals() {
    const withProposal = pendingGroups.filter((g) => !!rowsById.get(g[0].id)?.suggestion?.budget_id)
    if (withProposal.length === 0) return
    for (const g of withProposal) {
      onAcceptGroup(g.map((t) => t.id))
      advance()
    }
  }

  // ── Stap 3: overzicht per doelcategorie ────────────────────────────────────
  const acceptedCount = rows.filter((r) => r.accepted).length
  const childName = useCallback(
    (id: string | null) =>
      id ? budgetGroups.flatMap((g) => g.children).find((b) => b.id === id)?.name ?? null : null,
    [budgetGroups],
  )
  function badgeForRow(row: RowState): string {
    if (row.accepted && row.acceptedCategorySource) return SOURCE_BADGE[row.acceptedCategorySource] ?? 'Handmatig'
    if (row.suggestion) return SOURCE_BADGE[row.suggestion.source] ?? 'Will'
    return 'Nog te kiezen'
  }
  type S3Group = { key: string; name: string; badges: string[]; rows: { row: RowState; idx: number }[]; acceptedN: number }
  const s3Groups = useMemo<S3Group[]>(() => {
    const map = new Map<string, S3Group>()
    rows.forEach((row) => {
      const idx = indexById.get(row.tx.id)!
      const targetId = row.accepted ? row.acceptedBudgetId : row.suggestion?.budget_id ?? null
      const key = targetId ?? '__none__'
      const name = targetId
        ? (row.accepted
            ? row.acceptedBudgetName ?? childName(targetId)
            : childName(targetId) ?? row.suggestion?.budget_name) ?? '—'
        : 'Nog te kiezen'
      let g = map.get(key)
      if (!g) {
        g = { key, name, badges: [], rows: [], acceptedN: 0 }
        map.set(key, g)
      }
      g.rows.push({ row, idx })
      if (row.accepted) g.acceptedN += 1
      const badge = badgeForRow(row)
      if (!g.badges.includes(badge)) g.badges.push(badge)
    })
    return Array.from(map.values()).sort((a, b) => {
      if ((a.key === '__none__') !== (b.key === '__none__')) return a.key === '__none__' ? 1 : -1
      return b.rows.length - a.rows.length
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, indexById, childName])
  const [groupToggles, setGroupToggles] = useState<Record<string, boolean>>({})
  const s3Open = (g: S3Group) => groupToggles[g.key] ?? g.acceptedN < g.rows.length
  const toggleS3 = (g: S3Group) => setGroupToggles((p) => ({ ...p, [g.key]: !s3Open(g) }))

  // ── aria-live: kondig stap- én kaartwissels aan ──
  const stepPos = currentStep ? steps.indexOf(currentStep) + 1 : 1
  const stepTotal = steps.length
  const currentName = currentGroup ? currentGroup[0].counterparty_name || currentGroup[0].description : ''
  const liveMessage =
    currentStep === 1
      ? `Stap ${stepPos} van ${stepTotal}: automatisch herkend. ${stage1Rows.length} ${stage1Rows.length === 1 ? 'transactie' : 'transacties'}.`
      : currentStep === 2
        ? currentGroup
          ? `Stap ${stepPos} van ${stepTotal}: Will's voorstellen. Groep ${progressN} van ${progressM}: ${currentName}`
          : `Stap ${stepPos} van ${stepTotal}: Will's voorstellen.`
        : currentStep === 3
          ? `Stap ${stepPos} van ${stepTotal}: controle en opslaan.`
          : 'Will bekijkt je transacties'

  // ── Primaire-actieblok voor de sticky footer (per stap) ──
  let footerContent: ReactNode = null
  if (currentStep === 1) {
    footerContent = (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => { onBulkAcceptStage1(); goNext(1) }}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-[var(--r)] bg-kern-600 px-3 py-2 min-h-[44px] text-xs font-medium text-white hover:bg-kern-700"
        >
          <Check className="h-3.5 w-3.5" />
          {stage1Pending > 0 ? `Alle ${stage1Pending} toepassen` : 'Verder'}
        </button>
        {/* Flow-navigatie: outline, secundair aan de primaire "toepassen"-knop. */}
        <button
          type="button"
          onClick={() => goNext(1)}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-[var(--r)] border border-[var(--border-md)] px-3 py-2 min-h-[44px] text-xs font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
        >
          Verder zonder toepassen
        </button>
        {/* Weergave-toggle (geen flow-navigatie): bewust tertiair/link-stijl met
            chevron, zodat 'ie visueel niet met de outline-flowknop concurreert. */}
        {!bulkAutoOpen && (
          <button
            type="button"
            onClick={() => setBulkExpanded((v) => !v)}
            aria-expanded={showBulkRows}
            className="inline-flex w-full items-center justify-center gap-1 rounded-[var(--r)] px-3 py-2 min-h-[44px] text-[11px] font-medium text-[var(--ink-3)] underline-offset-2 hover:text-[var(--ink-2)] hover:underline"
          >
            {showBulkRows ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Stuk voor stuk bekijken
          </button>
        )}
        <button
          type="button"
          onClick={handleStop}
          className="w-full rounded-[var(--r)] px-3 py-2 min-h-[44px] text-[11px] text-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-[var(--ink-2)]"
        >
          Stoppen en controleren
        </button>
      </div>
    )
  } else if (currentStep === 2) {
    footerContent = (
      <div className="flex flex-col gap-2">
        {currentHasProposal && !otherOpen && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => { onAcceptGroup(currentTxIds); advance() }}
              className="inline-flex items-center justify-center gap-1.5 rounded-[var(--r)] bg-wil-600 px-3 py-2 min-h-[44px] text-xs font-medium text-white hover:bg-wil-700"
            >
              <Check className="h-3.5 w-3.5" />
              Akkoord &amp; verder
            </button>
            <button
              type="button"
              onClick={() => setOtherOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 rounded-[var(--r)] border border-[var(--border-md)] px-3 py-2 min-h-[44px] text-xs font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
            >
              Andere categorie
            </button>
            {currentMultiple && currentRep && (
              <button
                type="button"
                onClick={() => { onAcceptOne(currentRep.id); advance() }}
                className="inline-flex items-center justify-center gap-1.5 rounded-[var(--r)] border border-[var(--border-md)] px-3 py-2 min-h-[44px] text-xs font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
              >
                Alleen deze ene
              </button>
            )}
            <button
              type="button"
              onClick={() => onSplitGroup(currentTxIds)}
              className="inline-flex items-center justify-center gap-1.5 rounded-[var(--r)] border border-[var(--border-md)] px-3 py-2 min-h-[44px] text-xs font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
            >
              <Hand className="h-3.5 w-3.5" />
              Zelf indelen (sleepmodus)
            </button>
          </div>
        )}
        {readyCount > 0 && (
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={acceptAllProposals}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-[var(--r)] border border-wil-300 px-3 py-2 min-h-[44px] text-xs font-medium text-wil-700 hover:bg-wil-50"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Alle AI-voorstellen goedkeuren
            </button>
            {/* Transparantie: bulk pakt óók de minder-zekere voorstellen mee. */}
            {lessConfidentCount > 0 && (
              <p className="text-center text-[10px] text-[var(--ink-3)]">
                waarvan{' '}
                <span className="font-[var(--font-dm-mono)] tabular-nums">{lessConfidentCount}</span>{' '}
                minder zeker
              </p>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={handleStop}
          className="w-full rounded-[var(--r)] px-3 py-2 min-h-[44px] text-[11px] text-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-[var(--ink-2)]"
        >
          Stoppen en controleren
        </button>
      </div>
    )
  } else if (currentStep === 3) {
    footerContent = (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={acceptedCount === 0}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-[var(--r)] bg-kern-600 px-3 py-2 min-h-[44px] text-xs font-medium text-white hover:bg-kern-700 disabled:opacity-40"
        >
          <Check className="h-3.5 w-3.5" />
          Opslaan
        </button>
        {acceptedCount === 0 && (
          <p className="text-center text-[11px] text-[var(--ink-4)]">
            Keur minstens één transactie goed om op te slaan.
          </p>
        )}
      </div>
    )
  }

  // ── Nog aan het bepalen (eerste, stille context-laad) → korte laadstatus ──
  if (!structPinned || currentStep === null) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <div aria-live="polite" className="sr-only">{liveMessage}</div>
        <Loader2 className="h-5 w-5 animate-spin text-wil-500" />
        <p className="text-[11px] text-[var(--ink-3)]">Will bekijkt je transacties…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div aria-live="polite" className="sr-only">{liveMessage}</div>

      <StepIndicator steps={steps} current={currentStep} />

      {/* ── Stap 1 · Automatisch herkend ── */}
      {currentStep === 1 && stage1Rows.length > 0 && (
        <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s1)]">
          <div className="flex items-start gap-3 px-4 py-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-kern-100">
              <Check className="h-4 w-4 text-kern-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--ink)]">
                Will herkende{' '}
                <span className="font-[var(--font-dm-mono)] tabular-nums">{stage1Rows.length}</span>{' '}
                {stage1Rows.length === 1 ? 'transactie' : 'transacties'} via je regels en overboekingen
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-3)]">
                Deze kende je al — pas ze in één keer toe, bekijk ze stuk voor stuk, of ga verder zonder ze nu toe te passen.
              </p>
            </div>
          </div>

          {showBulkRows && (
            <div className="space-y-3 border-t border-[var(--border-ed)] px-4 py-4">
              {stage1Rows.map((row) => {
                const idx = indexById.get(row.tx.id)!
                return (
                  <TransactionRow
                    key={row.tx.id}
                    row={row}
                    idx={idx}
                    budgetGroups={budgetGroups}
                    onAcceptSuggestion={() => onAcceptSuggestion(idx)}
                    onManualBudget={(bId) => onManualBudget(idx, bId)}
                    onToggleMakeRule={() => onToggleMakeRule(idx)}
                  />
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Stap 2 · Will's voorstellen ── */}
      {currentStep === 2 && (
        <>
          <p className="px-1 text-[11px] text-[var(--ink-3)]">
            {currentGroup ? (
              <>
                Nog{' '}
                <span className="font-[var(--font-dm-mono)] tabular-nums">{pendingGroups.length}</span>{' '}
                {pendingGroups.length === 1 ? 'tegenpartij' : 'tegenpartijen'} ·{' '}
                <span className="font-[var(--font-dm-mono)] tabular-nums">{readyCount}</span>{' '}
                {readyCount === 1 ? 'voorstel' : 'voorstellen'} klaar
              </>
            ) : (
              'Alle tegenpartijen behandeld.'
            )}
          </p>

          {currentGroup ? (
            <AiGroupCard
              key={currentKey!}
              group={currentGroup}
              rowsById={rowsById}
              budgetGroups={budgetGroups}
              aiPhaseActive={aiPhaseActive}
              localMode={localMode}
              localSessionState={localSessionState}
              progressN={progressN}
              progressM={progressM}
              otherOpen={otherOpen}
              otherBudgetId={otherBudgetId}
              otherMakeRule={otherMakeRule}
              onOtherBudgetId={setOtherBudgetId}
              onOtherMakeRule={setOtherMakeRule}
              onApplyOther={applyOther}
            />
          ) : (
            <p className="px-1 text-[11px] italic text-[var(--ink-4)]">
              Geen onbekende tegenpartijen meer — ga verder naar de controle.
            </p>
          )}
        </>
      )}

      {/* ── Stap 3 · Controle & opslaan ── */}
      {currentStep === 3 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--subtle)]">
              <ListChecks className="h-4 w-4 text-[var(--ink-2)]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--ink)]">Controleer en sla op</p>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-3)]">
                Alles op een rij, gegroepeerd per categorie. Wijzig waar nodig; alleen goedgekeurde transacties worden opgeslagen.
              </p>
            </div>
          </div>

          {/* Nog niets opgeslagen — geruststelling dat opslaan pas met de knop
              gebeurt. In stap 3 is er per definitie nog niets weggeschreven (Opslaan
              wisselt de fase en unmount deze wizard), dus dit staat er altijd. */}
          <p className="rounded-[var(--r-sm)] border border-dashed border-[var(--border-ed)] bg-[var(--subtle)]/50 px-3 py-2 text-[11px] text-[var(--ink-3)]">
            Nog niets opgeslagen — controleer en bevestig met Opslaan.
          </p>

          {acceptedCount === 0 && (
            <p className="text-[11px] leading-relaxed text-[var(--ink-4)]">
              Nog niets goedgekeurd — sluiten kan zonder gevolgen; je kunt &lsquo;Vraag Will&rsquo; later opnieuw starten.
            </p>
          )}

          {s3Groups.map((g) => {
            const open = s3Open(g)
            return (
              <div key={g.key} className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)]">
                <button
                  type="button"
                  onClick={() => toggleS3(g)}
                  aria-expanded={open}
                  className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-[var(--subtle)]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--ink)]">
                      <span className="font-[var(--font-dm-mono)] tabular-nums">{g.rows.length}</span>{' '}
                      {g.rows.length === 1 ? 'transactie' : 'transacties'} · {g.name}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] text-[var(--ink-4)]">
                        <span className="font-[var(--font-dm-mono)] tabular-nums">{g.acceptedN}</span>/
                        <span className="font-[var(--font-dm-mono)] tabular-nums">{g.rows.length}</span> gekeurd
                      </span>
                      {g.badges.map((b) => (
                        <span
                          key={b}
                          className="rounded-full border border-[var(--border-ed)] bg-[var(--paper)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]"
                        >
                          {b}
                        </span>
                      ))}
                    </div>
                  </div>
                  {open ? (
                    <ChevronUp className="h-4 w-4 shrink-0 text-[var(--ink-4)]" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-[var(--ink-4)]" />
                  )}
                </button>
                {open && (
                  <div className="space-y-3 border-t border-[var(--border-ed)] px-4 py-4">
                    {g.rows.map(({ row, idx }) => (
                      <TransactionRow
                        key={row.tx.id}
                        row={row}
                        idx={idx}
                        budgetGroups={budgetGroups}
                        onAcceptSuggestion={() => onAcceptSuggestion(idx)}
                        onManualBudget={(bId) => onManualBudget(idx, bId)}
                        onToggleMakeRule={() => onToggleMakeRule(idx)}
                        // Controle-stap: een reeds goedgekeurde rij blijft wijzigbaar
                        // (de "andere categorie"-select blijft zichtbaar).
                        editableWhenAccepted
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Primaire acties: sticky sheet-footer, of inline fallback ── */}
      {footerContent &&
        (footerContainer
          ? createPortal(footerContent, footerContainer)
          : (
            <div className="mt-1 border-t border-[var(--border-ed)] pt-3">
              {footerContent}
            </div>
          ))}
    </div>
  )
}

// ─── Stap-indicator ─────────────────────────────────────────────────────────────

function StepIndicator({ steps, current }: { steps: WizardStep[]; current: WizardStep | null }) {
  const total = steps.length
  const pos = current ? steps.indexOf(current) + 1 : 1
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-4)]">
        Stap <span className="font-[var(--font-dm-mono)] tabular-nums">{pos}</span> van{' '}
        <span className="font-[var(--font-dm-mono)] tabular-nums">{total}</span>
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        {steps.map((s, i) => {
          const active = s === current
          const done = current !== null && steps.indexOf(current) > i
          return (
            <span key={s} className="flex items-center gap-2">
              <span
                className={
                  active
                    ? 'text-xs font-semibold text-[var(--ink)]'
                    : done
                      ? 'text-xs text-[var(--ink-3)]'
                      : 'text-xs text-[var(--ink-4)]'
                }
              >
                {STEP_LABEL[s]}
              </span>
              {i < steps.length - 1 && <span className="text-[var(--ink-4)]" aria-hidden="true">›</span>}
            </span>
          )
        })}
      </div>
    </div>
  )
}

// ─── AI-groepkaart ──────────────────────────────────────────────────────────────

type GroupCardProps = {
  group: CombinedTx[]
  rowsById: Map<string, RowState>
  budgetGroups: { parent: Budget; children: Budget[] }[]
  aiPhaseActive: boolean
  localMode: boolean
  localSessionState: 'idle' | 'starten' | 'klaar'
  progressN: number
  progressM: number
  otherOpen: boolean
  otherBudgetId: string
  otherMakeRule: boolean
  onOtherBudgetId: (v: string) => void
  onOtherMakeRule: (v: boolean) => void
  onApplyOther: (txIds: string[]) => void
}

function AiGroupCard({
  group,
  rowsById,
  budgetGroups,
  aiPhaseActive,
  localMode,
  localSessionState,
  progressN,
  progressM,
  otherOpen,
  otherBudgetId,
  otherMakeRule,
  onOtherBudgetId,
  onOtherMakeRule,
  onApplyOther,
}: GroupCardProps) {
  const rep = group[0]
  const txIds = group.map((t) => t.id)
  const repRow = rowsById.get(rep.id)
  const suggestion = repRow?.suggestion ?? null
  const hasProposal = !!suggestion?.budget_id
  // No-match: door de motor beoordeeld zonder bruikbaar voorstel → meteen de
  // handmatige fallback (niet wachten op het einde van de run). Eén lid volstaat.
  const noMatch = group.some((t) => rowsById.get(t.id)?.aiNoMatch)
  // "Minder zeker": Will heeft wél een voorstel, maar met een confidence onder de
  // zekerheidsgrens (de tweede trap, 0,5–0,8). Path-agnostisch — geldt óók voor
  // cloud-voorstellen met lage confidence en voor gepropageerde voorstellen (een
  // zustergroep die hetzelfde AI-oordeel erft mét dezelfde geërfde confidence);
  // rule/transfer/mirror blijven uitgesloten (die dragen geen onzekerheid).
  const isLessConfident =
    hasProposal &&
    (suggestion!.source === 'ai' || suggestion!.source === 'propagated') &&
    suggestion!.confidence != null &&
    suggestion!.confidence < LOCAL_MIN_CONFIDENCE
  const total = group.reduce((s, t) => s + t.amount, 0)
  const name = rep.counterparty_name || rep.description
  // Ledenlijst standaard uitklappen wanneer de gebruiker zélf moet beslissen: bij
  // een no-match heeft 'ie de transactiedetails nodig om te kiezen. Een "minder
  // zeker"-voorstel blijft ingeklapt, maar met een uitnodigende affordance.
  const [membersOpen, setMembersOpen] = useState(noMatch)
  // Auto-uitgeklapte ledenlijst (no-match) capt op de eerste MEMBER_CAP leden zodat
  // een grote groep de sheet niet volloopt. Een handmatige toggle (of "toon nog")
  // toont alles — dan zet de gebruiker de cap bewust af.
  const [membersCapped, setMembersCapped] = useState(true)
  // sr-only aankondiging bij de automatische onthulling (één keer, niet storend).
  const [revealAnnounce, setRevealAnnounce] = useState('')
  // No-match kan ook mid-run arriveren (dezelfde kaart blijft gemount): klap de
  // ledenlijst dan éénmalig open. Een handmatige inklap daarna respecteren we
  // (autoExpandedRef), en we openen alleen — nooit dwingend sluiten.
  const autoExpandedRef = useRef(false)
  useEffect(() => {
    if (noMatch && !autoExpandedRef.current) {
      autoExpandedRef.current = true
      setMembersOpen(true)
      setRevealAnnounce('Transacties van deze groep getoond zodat je zelf kunt kiezen.')
    }
  }, [noMatch])

  const MEMBER_CAP = 6
  const membersCapActive = membersCapped && group.length > MEMBER_CAP
  const visibleMembers = membersCapActive ? group.slice(0, MEMBER_CAP) : group

  const budgetName =
    (suggestion
      ? budgetGroups.flatMap((g) => g.children).find((b) => b.id === suggestion.budget_id)?.name ?? suggestion.budget_name
      : null) ?? null

  return (
    // Kaart-chrome volgt de Kern-review (conform TransactionRow: border-kern-200 /
    // bg-kern-50-familie) — de kaart "hoort bij" het categoriseer-overzicht. Will's
    // stem blijft wil: de WILL-badge, de reasoning en de primaire actieknoppen.
    <div className="rounded-[var(--r-lg)] border border-kern-200 bg-kern-50/40 shadow-[var(--s1)]">
      {/* Kondigt de automatische onthulling van de ledenlijst (no-match) één keer aan. */}
      <div aria-live="polite" className="sr-only">{revealAnnounce}</div>
      {/* Kop: tegenpartij + aantal (uitklapbaar) + totaal */}
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-3)]">
            Groep <span className="font-[var(--font-dm-mono)] tabular-nums">{progressN}</span> van{' '}
            <span className="font-[var(--font-dm-mono)] tabular-nums">{progressM}</span>
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-[var(--ink)]">{name}</p>
          {group.length > 1 ? (
            <button
              type="button"
              // Handmatig openen = de cap bewust afzetten (toon alles).
              onClick={() => { setMembersCapped(false); setMembersOpen((v) => !v) }}
              aria-expanded={membersOpen}
              className={`mt-0.5 inline-flex min-h-[44px] items-center gap-1 py-1 text-[11px] ${
                isLessConfident && !membersOpen
                  ? 'font-medium text-[var(--ink-2)] hover:text-[var(--ink)]'
                  : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
              }`}
            >
              {/* Bij een "minder zeker"-voorstel nodigen we uit om te verifiëren
                  vóór akkoord ("Bekijk N transacties"); anders de neutrale teller.
                  De tekst blijft op een contrastrijk ink-token; het wil-accent zit
                  alléén op het chevron-icoon (niet-tekst-kritisch). */}
              {isLessConfident && !membersOpen && <span>Bekijk</span>}
              <span className="font-[var(--font-dm-mono)] tabular-nums">{group.length}</span> transacties
              {membersOpen
                ? <ChevronUp className="h-3 w-3" />
                : <ChevronDown className={`h-3 w-3 ${isLessConfident ? 'text-wil-600' : ''}`} />}
            </button>
          ) : (
            <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">
              <span className="font-[var(--font-dm-mono)] tabular-nums">{group.length}</span> transactie
            </p>
          )}
        </div>
        {/* tone="wil" is bewust: dit bedrag hoort bij Will's voorstel-groep (Will's
            stem), niet bij de Kern-kaartchrome — géén module-lookup-misser. */}
        <p className={`shrink-0 text-sm font-medium ${
          total > 0 ? 'text-positive' : 'text-[var(--ink)]'
        }`}>
          {total > 0 ? '+' : ''}<MaskedAmount value={total} tone="wil" />
        </p>
      </div>

      {/* Uitgeklapte ledenlijst (read-only) — hergebruikt de formatters uit categorize-row.
          Bij de auto-onthulling (no-match) tonen we eerst MEMBER_CAP leden met een
          "toon nog N"-knop, zodat een grote groep de sheet niet volloopt. */}
      {group.length > 1 && membersOpen && (
        <>
          <ul className="mt-2 divide-y divide-[var(--border-ed)] border-t border-[var(--border-ed)]">
            {visibleMembers.map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-2 px-4 py-2">
                <div className="min-w-0 flex-1">
                  {m.date && <p className="text-[10px] text-[var(--ink-4)]">{formatDate(m.date)}</p>}
                  <p className="truncate text-xs text-[var(--ink-2)]">{m.description}</p>
                </div>
                <p className={`shrink-0 font-[var(--font-dm-mono)] text-xs tabular-nums ${
                  m.amount > 0 ? 'text-positive' : 'text-[var(--ink)]'
                }`}>
                  {m.amount > 0 ? '+' : ''}<MaskedAmount value={m.amount} tone="wil" />
                </p>
              </li>
            ))}
          </ul>
          {membersCapActive ? (
            <button
              type="button"
              onClick={() => setMembersCapped(false)}
              className="flex w-full items-center justify-center gap-1 border-b border-[var(--border-ed)] px-4 py-2 min-h-[44px] text-[11px] font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
            >
              <ChevronDown className="h-3 w-3" />
              Toon nog <span className="font-[var(--font-dm-mono)] tabular-nums">{group.length - MEMBER_CAP}</span>
            </button>
          ) : (
            <div className="border-b border-[var(--border-ed)]" />
          )}
        </>
      )}

      {/* Voorstel / no-match / laadstatus / fallback */}
      <div className="px-4 pt-3">
        {hasProposal ? (
          <div className="rounded-[var(--r-sm)] border border-dashed border-kern-200 bg-[var(--paper)] px-3 py-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <Sparkles className="h-3 w-3 shrink-0 text-wil-500" />
              <span className="shrink-0 rounded-full border border-wil-200 bg-[var(--paper)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-2)]">
                {SOURCE_LABELS[suggestion!.source]}
              </span>
              {/* Subtiele duiding wanneer Will minder zeker is (tweede trap). Ink-
                  token, dezelfde familie als de badge — bewust niet alarmerend. */}
              {isLessConfident && (
                <span className="shrink-0 text-[10px] text-[var(--ink-3)]">· minder zeker</span>
              )}
              <span className="text-xs text-[var(--ink-3)]">voorstel:</span>
              <span className="text-xs font-medium text-[var(--ink)]">{budgetName}</span>
            </div>
            {suggestion!.reasoning && (
              <p className="mt-2 font-[var(--font-source-serif)] text-[11px] italic leading-relaxed text-[var(--ink-2)]">
                {suggestion!.reasoning}
              </p>
            )}
          </div>
        ) : noMatch ? (
          // No-match: Will kon dit niet zeker plaatsen → meteen handmatig kiezen.
          <ManualFallback
            intro="Will kon dit niet zeker plaatsen — kies zelf een categorie voor deze groep."
            budgetGroups={budgetGroups}
            value={otherBudgetId}
            onChange={onOtherBudgetId}
            onApply={() => onApplyOther(txIds)}
          />
        ) : aiPhaseActive ? (
          localMode && localSessionState === 'starten' ? (
            // Opstart-substap (lokaal): eenmalige GPU-warmup — eigen vlak, geen subregel.
            <div className="flex items-start gap-2.5 rounded-[var(--r-sm)] border border-wil-200 bg-wil-50/60 px-3 py-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-wil-100">
                <Cpu className="h-3.5 w-3.5 text-wil-600" />
              </div>
              <p className="text-[11px] leading-relaxed text-[var(--ink-2)]">
                Lokale AI wordt gestart — dit duurt ongeveer een minuut, eenmalig per sessie. Je gegevens blijven op dit apparaat.
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-[var(--r-sm)] border border-dashed border-wil-200 bg-[var(--paper)] px-3 py-3">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-wil-500" />
              <p className="text-[11px] text-[var(--ink-2)]">
                Will beoordeelt groep{' '}
                <span className="font-[var(--font-dm-mono)] tabular-nums">{progressN}</span> van{' '}
                <span className="font-[var(--font-dm-mono)] tabular-nums">{progressM}</span>…
              </p>
            </div>
          )
        ) : (
          <ManualFallback
            intro="Will kon dit niet zeker plaatsen — kies zelf een categorie voor deze groep."
            budgetGroups={budgetGroups}
            value={otherBudgetId}
            onChange={onOtherBudgetId}
            onApply={() => onApplyOther(txIds)}
          />
        )}
      </div>

      {/* "Andere categorie"-paneel (select + regel-toggle) — bewust in de kaart-body;
          de vier keuzes + "Stoppen" leven in de sticky footer. */}
      {hasProposal && otherOpen && (
        <div className="px-4 pb-4 pt-3">
          <div className="rounded-[var(--r-sm)] border border-dashed border-[var(--border-ed)] bg-[var(--paper)] px-3 py-3">
            <p className="mb-2 text-[11px] font-medium text-[var(--ink-2)]">Kies een andere categorie</p>
            <GroupBudgetSelect budgetGroups={budgetGroups} value={otherBudgetId} onChange={onOtherBudgetId} />
            <label className="mt-2 flex items-center gap-2 text-[11px] text-[var(--ink-3)]">
              <input
                type="checkbox"
                checked={otherMakeRule}
                onChange={(e) => onOtherMakeRule(e.target.checked)}
                className="h-3.5 w-3.5 accent-wil-600"
              />
              <GitFork className="h-3 w-3" /> Maak hier ook een regel van
            </label>
            <button
              type="button"
              disabled={!otherBudgetId}
              onClick={() => onApplyOther(txIds)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-[var(--r)] bg-wil-600 px-3 py-2 min-h-[44px] text-xs font-medium text-white hover:bg-wil-700 disabled:opacity-40"
            >
              <Check className="h-3.5 w-3.5" />
              Toepassen op deze groep
            </button>
          </div>
        </div>
      )}

      {/* Onderrand-lucht wanneer er geen body-paneel is (de acties staan in de footer). */}
      {!(hasProposal && otherOpen) && <div className="pb-4" />}
    </div>
  )
}

// ─── Handmatige fallback (no-match óf AI klaar zonder voorstel) ──────────────────

function ManualFallback({
  intro,
  budgetGroups,
  value,
  onChange,
  onApply,
}: {
  intro: string
  budgetGroups: { parent: Budget; children: Budget[] }[]
  value: string
  onChange: (v: string) => void
  onApply: () => void
}) {
  return (
    <div className="rounded-[var(--r-sm)] border border-dashed border-[var(--border-ed)] bg-[var(--paper)] px-3 py-3">
      <p className="mb-2 text-[11px] text-[var(--ink-3)]">{intro}</p>
      <GroupBudgetSelect budgetGroups={budgetGroups} value={value} onChange={onChange} />
      <button
        type="button"
        disabled={!value}
        onClick={onApply}
        className="mt-3 inline-flex items-center gap-1.5 rounded-[var(--r)] bg-wil-600 px-3 py-2 min-h-[44px] text-xs font-medium text-white hover:bg-wil-700 disabled:opacity-40"
      >
        <Check className="h-3.5 w-3.5" />
        Deze groep indelen
      </button>
    </div>
  )
}

function GroupBudgetSelect({
  budgetGroups,
  value,
  onChange,
}: {
  budgetGroups: { parent: Budget; children: Budget[] }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-[var(--border-ed)] px-2 py-2 min-h-[44px] text-xs outline-none focus:border-wil-500"
      aria-label="Categorie kiezen voor deze groep"
    >
      <option value="">Kies een categorie</option>
      {buildBudgetSelectEntries(budgetGroups).map((entry) =>
        entry.kind === 'group' ? (
          <optgroup key={entry.id} label={entry.label}>
            {entry.options.map((c) => (
              <option key={c.id} value={c.id}>{budgetOptionLabel(c)}</option>
            ))}
          </optgroup>
        ) : (
          <option key={entry.id} value={entry.id}>{budgetOptionLabel(entry)}</option>
        ),
      )}
    </select>
  )
}
