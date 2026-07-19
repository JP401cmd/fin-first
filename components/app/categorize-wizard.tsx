'use client'

// ── "Vraag Will"-wizard (WP-C, feature #881) ──────────────────────────────────
//
// Pure presentatie bovenop de review-rijen (RowState) die AICategorizeSheet
// aanlevert. De wizard vervangt de platte reviewlijst voor het "Vraag Will"-pad:
//
//   1. Eén bulk-kaart voor alles wat Will gratis herkende via je regels en
//      overboekingen (stage-1: bron rule/transfer/mirror) — "Akkoord, allemaal"
//      of stuk voor stuk bekijken (hergebruikt exact dezelfde TransactionRow).
//   2. Daarna de onbekende tegenpartijen als AI-groepkaarten, één tegelijk, met
//      vier duidelijke keuzes per groep. De volgorde volgt de MOTOR-comparator
//      (buildCombinedGroups + orderGroupsLargestFirst) — nooit een eigen sortering.
//
// De wizard bezit géén rijen-state: hij leest `rows` en roept de callbacks van de
// sheet aan (wrappers om de bestaande accept/manual/save-handlers). Zo blijft er
// één bron van waarheid en één opslag-pad.
//
// De PRIMAIRE acties (de vier groep-keuzes + "Stoppen", of de bulk-actie) staan
// niet in de scrollende kaart-body maar in de niet-scrollende sticky footer van
// de BottomSheet. De sheet levert daarvoor een `footerContainer` (het DOM-node
// van zijn `footerSlot`); de wizard portalt zijn actieblok daarin. Zonder
// container (standalone/tests/SSR) valt de wizard terug op inline rendering zodat
// de acties altijd zichtbaar en testbaar blijven.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles, Check, ChevronDown, ChevronUp, Loader2, Hand, GitFork } from 'lucide-react'
import { buildBudgetSelectEntries, budgetOptionLabel, type Budget } from '@/lib/budget-data'
import {
  buildCombinedGroups,
  orderGroupsLargestFirst,
  type CombinedTx,
} from '@/lib/auto-categorize'
import {
  TransactionRow,
  SOURCE_LABELS,
  type RowState,
} from '@/components/app/categorize-row'
import { MaskedAmount } from '@/components/app/masked-amount'

/** Boven dit aantal stage-1-rijen blijft de bulk-kaart standaard ingeklapt
 *  (bulk-akkoord i.p.v. 100 rijen doorlopen); daaronder tonen we ze meteen. */
const BULK_AUTO_EXPAND_MAX = 8

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

  // Rij-niveau (hergebruikte TransactionRow in de bulk-kaart) — index in `rows`.
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
  /** Meld aan de gate tot en met welke AI-ronde de wizard nu getoond heeft. */
  onAdvanceRound: (shownRound: number) => void
}

const STAGE1_SOURCES = new Set(['rule', 'transfer', 'mirror'])

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
  onAcceptSuggestion,
  onManualBudget,
  onToggleMakeRule,
  onBulkAcceptStage1,
  onAcceptGroup,
  onSetGroupBudget,
  onAcceptOne,
  onSplitGroup,
  onStop,
  onAdvanceRound,
}: Props) {
  // Index van elke rij, zodat de bulk-kaart de bestaande rij-handlers (op index)
  // kan aanroepen.
  const indexById = useMemo(() => {
    const m = new Map<string, number>()
    rows.forEach((r, i) => m.set(r.tx.id, i))
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

  // Nog-te-beoordelen AI-rijen → groepen (zelfde volgorde als de motor). Herberekend
  // uit de nog-onbeoordeelde rijen, zodat "Alleen deze ene" de rest later als een
  // kleinere kaart terugbrengt.
  const pendingGroups = useMemo(() => {
    const pending = aiRows.filter((r) => !r.accepted)
    const groupMap = buildCombinedGroups(pending.map(rowToCombinedTx))
    const orderedKeys = orderGroupsLargestFirst(Array.from(groupMap.keys()), groupMap)
    return orderedKeys.map((k) => groupMap.get(k)!)
  }, [aiRows])

  const currentGroup = pendingGroups[0] ?? null
  const rowsById = useMemo(() => {
    const m = new Map<string, RowState>()
    for (const r of rows) m.set(r.tx.id, r)
    return m
  }, [rows])

  // ── Voortgangsteller (M/N) ──────────────────────────────────────────────────
  // M = het aantal unieke AI-groepen bij de EERSTE bepaling ná stage-1 (stabiel
  // gedurende de sessie). We pinnen het pas wanneer stage-1 zijn voorstellen heeft
  // geflusht (`rows.some(suggestion)`) óf de AI-fase klaar is — vóór die flush zijn
  // ALLE rijen nog voorstel-loos en zouden ook de latere bulk-tegenpartijen als
  // AI-groep meetellen (M te hoog). N = M − pendingGroups.length + 1: "Alleen deze
  // ene" laat de groep pending → N schuift niet op; een volledig weggewerkte groep
  // (accepteren of via sleepmodus) verlaagt pending → N schuift wél op.
  const totalGroupsRef = useRef<number | null>(null)
  const canPin = pendingGroups.length > 0 && (rows.some((r) => r.suggestion) || !aiPhaseActive)
  useEffect(() => {
    if (totalGroupsRef.current === null && canPin) {
      totalGroupsRef.current = pendingGroups.length
    }
  }, [canPin, pendingGroups.length])
  const totalGroups = totalGroupsRef.current ?? pendingGroups.length
  const progressM = totalGroups
  const progressN = Math.max(1, totalGroups - pendingGroups.length + 1)

  // Prefetch-gate: meld na elke afhandeling tot welke AI-ronde de wizard staat.
  // Monotone teller in een ref (nooit stale — de vorige setState-closure telde
  // verkeerd, code-review-LOW). "Splitsen" (sleepmodus) verbruikt geen ronde.
  const advancesRef = useRef(0)
  function advance() {
    advancesRef.current += 1
    onAdvanceRound(Math.floor(advancesRef.current / Math.max(1, repBatchSize)))
  }

  // ── Bulk-kaart in/uitklappen ──
  const [bulkExpanded, setBulkExpanded] = useState(false)
  const bulkAutoOpen = stage1Rows.length > 0 && stage1Rows.length <= BULK_AUTO_EXPAND_MAX
  const showBulkRows = bulkExpanded || bulkAutoOpen
  const stage1Pending = stage1Rows.filter((r) => !r.accepted).length

  // ── "Andere categorie"-paneel per (huidige) groep ──
  const [otherOpen, setOtherOpen] = useState(false)
  const [otherBudgetId, setOtherBudgetId] = useState('')
  const [otherMakeRule, setOtherMakeRule] = useState(false)
  const currentKey = currentGroup ? currentGroup[0].id : null
  // Reset het paneel zodra we op een andere groep landen.
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

  // ── aria-live: kondig kaartwissels aan ──
  const liveMessage = currentGroup
    ? `Groep ${progressN} van ${progressM}: ${currentGroup[0].counterparty_name || currentGroup[0].description}`
    : stage1Pending > 0
      ? 'Bekijk de herkende transacties'
      : 'Alle groepen behandeld'

  // ── Primaire-actieblok voor de sticky footer ──
  // AI-groep actief → de vier keuzes (tenzij het "Andere categorie"-paneel open
  // staat; dat leeft in de kaart-body) + "Stoppen". Anders, als er nog bulk-rijen
  // openstaan → de bulk-actie. Loading/handmatig-fallback → alleen "Stoppen".
  let footerContent: ReactNode = null
  if (currentGroup) {
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
        <button
          type="button"
          onClick={onStop}
          className="w-full rounded-[var(--r)] px-3 py-2 min-h-[44px] text-[11px] text-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-[var(--ink-2)]"
        >
          Stoppen en tot hier bewaren
        </button>
      </div>
    )
  } else if (stage1Pending > 0) {
    footerContent = (
      <button
        type="button"
        onClick={onBulkAcceptStage1}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-[var(--r)] bg-kern-600 px-3 py-2 min-h-[44px] text-xs font-medium text-white hover:bg-kern-700"
      >
        <Check className="h-3.5 w-3.5" />
        Akkoord, allemaal
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div aria-live="polite" className="sr-only">{liveMessage}</div>

      {/* ── Bulk-kaart: alles wat Will gratis herkende ── */}
      {stage1Rows.length > 0 && (
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
                Deze kende je al — controleer ze in één keer of bekijk ze stuk voor stuk.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {/* De primaire bulk-actie staat in de sticky footer wanneer er geen
                    AI-groep meer open staat; zolang er nog een groepkaart actief is
                    (footer = de vier keuzes) blijft "Akkoord, allemaal" hier in de
                    kaart bereikbaar. */}
                {stage1Pending > 0 && currentGroup && (
                  <button
                    type="button"
                    onClick={onBulkAcceptStage1}
                    className="inline-flex items-center gap-1.5 rounded-[var(--r)] bg-kern-600 px-3 py-2 min-h-[44px] text-xs font-medium text-white hover:bg-kern-700"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Akkoord, allemaal
                  </button>
                )}
                {!bulkAutoOpen && (
                  <button
                    type="button"
                    onClick={() => setBulkExpanded((v) => !v)}
                    className="inline-flex items-center gap-1.5 rounded-[var(--r)] border border-[var(--border-md)] px-3 py-2 min-h-[44px] text-xs font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
                    aria-expanded={showBulkRows}
                  >
                    {showBulkRows ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    {showBulkRows ? 'Verberg' : 'Bekijk stuk voor stuk'}
                  </button>
                )}
              </div>
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

      {/* ── AI-groepkaart: één onbekende tegenpartij tegelijk ── */}
      {currentGroup && (
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
      )}

      {/* Alle AI-groepen behandeld: rustige afsluitregel. */}
      {!currentGroup && stage1Rows.length > 0 && (
        <p className="px-1 text-[11px] italic text-[var(--ink-4)]">
          Geen onbekende tegenpartijen meer — controleer hierboven en sla op.
        </p>
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
  const total = group.reduce((s, t) => s + t.amount, 0)
  const name = rep.counterparty_name || rep.description

  const budgetName =
    (suggestion
      ? budgetGroups.flatMap((g) => g.children).find((b) => b.id === suggestion.budget_id)?.name ?? suggestion.budget_name
      : null) ?? null

  return (
    <div className="rounded-[var(--r-lg)] border border-wil-200 bg-wil-50/40 shadow-[var(--s1)]">
      {/* Kop: tegenpartij + aantal + totaal */}
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-3)]">
            Groep <span className="font-[var(--font-dm-mono)] tabular-nums">{progressN}</span> van{' '}
            <span className="font-[var(--font-dm-mono)] tabular-nums">{progressM}</span>
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-[var(--ink)]">{name}</p>
          <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">
            <span className="font-[var(--font-dm-mono)] tabular-nums">{group.length}</span>{' '}
            {group.length === 1 ? 'transactie' : 'transacties'}
          </p>
        </div>
        <p className={`shrink-0 text-sm font-medium ${
          total > 0 ? 'text-positive' : 'text-[var(--ink)]'
        }`}>
          {total > 0 ? '+' : ''}<MaskedAmount value={total} tone="wil" />
        </p>
      </div>

      {/* Voorstel of laadstatus */}
      <div className="px-4 pt-3">
        {hasProposal ? (
          <div className="rounded-[var(--r-sm)] border border-dashed border-wil-300 bg-[var(--paper)] px-3 py-3">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 shrink-0 text-wil-500" />
              <span className="shrink-0 rounded-full border border-wil-200 bg-[var(--paper)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-2)]">
                {SOURCE_LABELS[suggestion!.source]}
              </span>
              <span className="text-xs text-[var(--ink-3)]">voorstel:</span>
              <span className="text-xs font-medium text-[var(--ink)]">{budgetName}</span>
            </div>
            {suggestion!.reasoning && (
              <p className="mt-2 font-[var(--font-source-serif)] text-[11px] italic leading-relaxed text-[var(--ink-2)]">
                {suggestion!.reasoning}
              </p>
            )}
          </div>
        ) : aiPhaseActive ? (
          <div className="flex items-center gap-2 rounded-[var(--r-sm)] border border-dashed border-wil-200 bg-[var(--paper)] px-3 py-3">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-wil-500" />
            <p className="text-[11px] text-[var(--ink-2)]">
              Will denkt na over <span className="font-medium">{name}</span>…
              {localMode && localSessionState === 'starten' && (
                <span className="mt-0.5 block text-[10px] text-[var(--ink-3)]">Lokale AI wordt gestart — een paar seconden…</span>
              )}
            </p>
          </div>
        ) : (
          // Definitief geen voorstel → handmatig indelen, de wizard loopt door.
          <div className="rounded-[var(--r-sm)] border border-dashed border-[var(--border-ed)] bg-[var(--paper)] px-3 py-3">
            <p className="mb-2 text-[11px] text-[var(--ink-3)]">
              Will wist het niet zeker — kies zelf een categorie voor deze groep.
            </p>
            <GroupBudgetSelect
              budgetGroups={budgetGroups}
              value={otherBudgetId}
              onChange={onOtherBudgetId}
            />
            <button
              type="button"
              disabled={!otherBudgetId}
              onClick={() => onApplyOther(txIds)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-[var(--r)] bg-wil-600 px-3 py-2 min-h-[44px] text-xs font-medium text-white hover:bg-wil-700 disabled:opacity-40"
            >
              <Check className="h-3.5 w-3.5" />
              Deze groep indelen
            </button>
          </div>
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
