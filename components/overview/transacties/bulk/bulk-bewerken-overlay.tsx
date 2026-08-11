'use client'

/**
 * BulkBewerkenOverlay — zoeken over de volledige transactiehistorie, selecteren,
 * en in één keer hercategoriseren of verwijderen.
 *
 * Requirements: `docs/requirements-transactie-bulkbewerken.md` (F1–F20).
 * Besluit: `docs/adr/0104-bulkselectie-is-een-bevroren-idlijst.md`.
 *
 * ── Wat dit component wél en niet doet ──────────────────────────────────────
 * Het houdt het criterium, de pagina en de selectie vast; het rekent niets uit
 * wat een motor al kent. De vrijheidstijd komt uit het canonieke dagtarief
 * (`BulkImpact`), de geraakte-rijen-tellingen komen uit het antwoord van de
 * mutatieroutes, en de selectie-statemachine woont in `selection-model.ts`.
 * Data-toegang loopt uitsluitend via `bulk-api.ts` → `/api/transactions/**`
 * (ADR 0058): geen `createClient()` in dit bestand.
 *
 * ── De asymmetrische RLS is hier zichtbaar gedrag ───────────────────────────
 * Op `transactions` is SELECT huishoud-verbreed, maar UPDATE/DELETE zijn strikt
 * eigen rijen. De overlay toont daarom alléén eigen transacties — óók op een
 * gedeelde rekening, en dus mínder dan de transactiepagina zelf laat zien. Wat
 * je niet kunt muteren tonen zou een scherm opleveren dat liegt. Bij een actief
 * huishouden staat dat er neutraal bij; het aantal partnerrijen wordt bewust
 * NIET geteld — dat zou een privacy-lezing zijn die nergens voor nodig is.
 *
 * ── Twee soorten selectie, één regel ────────────────────────────────────────
 * "Selecteer alle N" en een expliciete rij-selectie worden allebei één keer
 * server-side gematerialiseerd tot een selectiemanifest — de eerste vanuit het
 * criterium, de tweede vanuit de aangevinkte id's. Aantal, sommen,
 * waarschuwingen én de te muteren id's komen daarmee altijd uit dezelfde
 * uitvoering (ADR 0104 besluit 1). De mutatieroutes krijgen nooit een criterium
 * mee.
 *
 * Een expliciete selectie ís al bevroren voor de id's, maar niet voor de
 * afgeleiden die de bevestiging moet stellen — en de tegenboekingen die bij
 * verwijderen standaard meegaan (`linked_transfer_id`) liggen per definitie
 * BUITEN de selectie. Zonder manifest noemde de knoptekst daar een lager getal
 * dan wat de server verwijderde. Het manifest wordt dus vlak vóór elke
 * bevestiging opgehaald, en vervalt zodra de selectie verandert.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Users } from 'lucide-react'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { useHouseholdStatus } from '@/components/app/ownership-toggle'
import {
  BUDGET_SLUGS,
  buildBudgetSelectEntries,
  type BudgetSelectGroup,
} from '@/lib/budget-data'
import {
  DEFAULT_PAGE_SIZE,
  type SelectionManifest,
  type TransactionSearchCriteria,
  type TransactionSearchResponse,
  type TransactionSearchRow,
} from '@/lib/transactions/bulk-contract'
import { MIN_RULE_MATCH_LENGTH } from '@/lib/transactions/rule-target'
import {
  BulkApiError,
  bulkDelete,
  bulkSetBudget,
  createBulkRule,
  fetchSelectionManifest,
  searchTransactions,
} from './bulk-api'
import { BulkBudgetSheet, BulkDeleteConfirm } from './bulk-bevestigingen'
import { BulkFilters } from './bulk-filters'
import { BulkImpact } from './bulk-impact'
import { BulkResultaten } from './bulk-resultaten'
import {
  BulkUitkomst,
  type BulkUitkomstData,
  type RuleCandidate,
  type RuleOfferState,
} from './bulk-uitkomst'
import { criteriaKey, describeCriteria, EMPTY_CRITERIA } from './criteria'
import { KERN_MODULE_TINT } from './kern-tint'
import {
  clearSelection,
  EMPTY_SELECTION,
  selectAllMatching,
  selectionCount as countSelection,
  selectRange,
  togglePage,
  toggleRow,
  type BulkSelection,
} from './selection-model'

/**
 * Budget-groep zoals het bewerkformulier hem kent: `buildBudgetSelectEntries`
 * heeft alleen id/naam/type nodig, de `slug` dient om de archive-post
 * "Eigen rekening" te herkennen (die schrijft het canonieke trio — F15).
 */
export type BulkBudgetGroup = BudgetSelectGroup & {
  parent: { slug?: string | null }
  children: { slug?: string | null }[]
}

export interface BulkBewerkenOverlayProps {
  open: boolean
  onClose: () => void
  budgetGroups: readonly BulkBudgetGroup[]
  budgetNameById: ReadonlyMap<string, string>
  accounts: readonly { id: string; name: string }[]
  /** Eén rij openen om te bewerken (F11). Weglaten = geen rij-actie tonen. */
  onOpenRow?: (id: string) => void
  /** Na een geslaagde mutatie: de onderliggende pagina verversen. */
  onMutated?: () => void
}

const SELECTION_LOST_NOTICE =
  'Je selectie is vervallen omdat de zoekopdracht wijzigde — kies opnieuw wat je wilt bewerken.'

export function BulkBewerkenOverlay({
  open,
  onClose,
  budgetGroups,
  budgetNameById,
  accounts,
  onOpenRow,
  onMutated,
}: BulkBewerkenOverlayProps) {
  const { hasHousehold } = useHouseholdStatus()

  // ── Criterium & pagina ────────────────────────────────────────────────────
  const [criteria, setCriteria] = useState<TransactionSearchCriteria>(EMPTY_CRITERIA)
  const [qDraft, setQDraft] = useState('')
  const [page, setPage] = useState(1)
  const [reloadKey, setReloadKey] = useState(0)

  // ── Resultaten ────────────────────────────────────────────────────────────
  const [response, setResponse] = useState<TransactionSearchResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchError, setSearchError] = useState<string | null>(null)
  /**
   * Rijen die de gebruiker gezien heeft, over pagina's heen. Voedt de
   * impact-samenvatting van een expliciete selectie: elke aangevinkte rij stond
   * per definitie een keer op het scherm, dus staat hij hier.
   */
  const [rowCache, setRowCache] = useState<ReadonlyMap<string, TransactionSearchRow>>(new Map())

  // ── Selectie ──────────────────────────────────────────────────────────────
  const [selection, setSelection] = useState<BulkSelection>(EMPTY_SELECTION)
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null)
  const [manifest, setManifest] = useState<SelectionManifest | null>(null)
  const [manifestBusy, setManifestBusy] = useState(false)

  // ── Acties ────────────────────────────────────────────────────────────────
  const [confirmKind, setConfirmKind] = useState<'budget' | 'delete' | null>(null)
  const [targetBudgetId, setTargetBudgetId] = useState<string | null>(null)
  const [mutating, setMutating] = useState(false)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [uitkomst, setUitkomst] = useState<BulkUitkomstData | null>(null)
  const [ruleCandidate, setRuleCandidate] = useState<RuleCandidate | null>(null)
  const [ruleState, setRuleState] = useState<RuleOfferState>('idle')
  const [ruleError, setRuleError] = useState<string | null>(null)

  // Refs voor waarden die handlers nodig hebben zónder ze tot dependency te
  // maken (en daarmee een extra fetch of een gereset debounce te veroorzaken).
  const criteriaRef = useRef(criteria)
  criteriaRef.current = criteria
  const criteriaKeyRef = useRef(criteriaKey(EMPTY_CRITERIA))
  const hasSelectionRef = useRef(false)
  hasSelectionRef.current = selection.allMatching || selection.ids.size > 0

  // ── Afgeleiden uit de budgetten ───────────────────────────────────────────
  const budgetEntries = useMemo(() => buildBudgetSelectEntries([...budgetGroups]), [budgetGroups])

  /** De "Eigen rekening"-posten; kiezen daarvan schrijft het canonieke trio. */
  const eigenRekeningIds = useMemo(() => {
    const ids = new Set<string>()
    for (const group of budgetGroups) {
      for (const b of [group.parent, ...group.children]) {
        if (b.slug === BUDGET_SLUGS.EIGEN_REKENING || b.slug === BUDGET_SLUGS.EIGEN_REKENING_SUB) {
          ids.add(b.id)
        }
      }
    }
    return ids
  }, [budgetGroups])

  const budgetName = useCallback((id: string) => budgetNameById.get(id), [budgetNameById])
  const accountName = useCallback(
    (id: string) => accounts.find((a) => a.id === id)?.name,
    [accounts],
  )

  // ── Zoeken ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const ctrl = new AbortController()
    setLoading(true)
    setSearchError(null)

    searchTransactions({ ...criteria, page, pageSize: DEFAULT_PAGE_SIZE }, ctrl.signal)
      .then((res) => {
        if (ctrl.signal.aborted) return
        setResponse(res)
        setRowCache((prev) => {
          const next = new Map(prev)
          for (const row of res.rows) next.set(row.id, row)
          return next
        })
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return
        setSearchError(
          err instanceof BulkApiError
            ? err.message
            : 'Zoeken lukte niet. Controleer je verbinding en probeer het opnieuw.',
        )
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false)
      })

    return () => ctrl.abort()
  }, [open, criteria, page, reloadKey])

  /**
   * Eén ingang voor elke criterium-wijziging — en daarmee één plek waar de
   * selectie vervalt (F10/AC4). Zou dit per veld gebeuren, dan is er altijd een
   * pad waarlangs een selectie een filterwissel overleeft, en dat is precies de
   * situatie waarin je een actie uitvoert op rijen die niet meer op je scherm
   * staan.
   */
  const commitCriteria = useCallback((next: TransactionSearchCriteria) => {
    const key = criteriaKey(next)
    if (key === criteriaKeyRef.current) return
    criteriaKeyRef.current = key
    setCriteria(next)
    setPage(1)
    setUitkomst(null)
    setManifest(null)
    setSelection(clearSelection())
    setSelectionNotice(hasSelectionRef.current ? SELECTION_LOST_NOTICE : null)
  }, [])

  // Zoekterm debounced (300ms) — een filterwissel commit direct, tikken niet.
  useEffect(() => {
    const timer = setTimeout(() => {
      const q = qDraft.trim()
      commitCriteria({ ...criteriaRef.current, q: q === '' ? undefined : q })
    }, 300)
    return () => clearTimeout(timer)
  }, [qDraft, commitCriteria])

  // ── Selectie-handlers ─────────────────────────────────────────────────────
  const rows = useMemo(() => response?.rows ?? [], [response])
  const total = response?.total ?? 0
  const pageIds = useMemo(() => rows.map((r) => r.id), [rows])

  // Elke selectiewijziging laat het manifest vervallen: het beschrijft een
  // verzameling die niet meer bestaat, en een bevestiging op een verouderd
  // manifest is precies het getal-dat-niet-klopt dat ADR 0104 uitsluit.
  const handleToggleRow = useCallback(
    (id: string, withShift: boolean) => {
      setSelectionNotice(null)
      setManifest(null)
      setSelection((sel) => (withShift ? selectRange(sel, id, pageIds) : toggleRow(sel, id, pageIds)))
    },
    [pageIds],
  )

  const handleTogglePage = useCallback(() => {
    setSelectionNotice(null)
    setManifest(null)
    setSelection((sel) => togglePage(sel, pageIds))
  }, [pageIds])

  const handleClearSelection = useCallback(() => {
    setSelection(clearSelection())
    setManifest(null)
    setSelectionNotice(null)
  }, [])

  /**
   * Meld een afkap die de server rapporteert (R-NF2). Kan alleen optreden als
   * PostgREST's `max_rows` onder de paginagrootte van het manifest ligt; de
   * richting is veilig (te weinig), maar de gebruiker vroeg om alles.
   */
  const noticeForManifest = useCallback((result: SelectionManifest): string | null => {
    if (!result.truncated) return null
    return `Er konden maar ${result.count} transacties worden vastgezet — de rest valt buiten deze bewerking. Verfijn je filter en werk in delen.`
  }, [])

  /** "Selecteer alle N": één server-uitvoering, daarna bevroren (ADR 0104). */
  const handleSelectAllMatching = useCallback(async () => {
    setManifestBusy(true)
    setSelectionNotice(null)
    try {
      const result = await fetchSelectionManifest({ ...criteriaRef.current })
      setManifest(result)
      setSelection(selectAllMatching())
      setSelectionNotice(noticeForManifest(result))
    } catch (err) {
      setManifest(null)
      setSelectionNotice(
        err instanceof BulkApiError
          ? err.message
          : 'De volledige selectie kon niet worden vastgezet. Probeer het opnieuw.',
      )
    } finally {
      setManifestBusy(false)
    }
  }, [noticeForManifest])

  // ── Impact van de selectie ────────────────────────────────────────────────
  const selectedCount = countSelection(selection, manifest?.count ?? total)

  /**
   * Aantal, sommen en waarschuwingen van de huidige selectie.
   *
   * Zodra er een manifest is, komt ALLES daaruit — dezelfde uitvoering die de
   * id's opleverde. Zonder manifest (de gebruiker is nog aan het aanvinken) is
   * dit een voorlopige samenvatting uit de rijen die op het scherm stonden: goed
   * genoeg voor de teller in de balk, maar nooit de grondslag voor een
   * bevestiging — daarvoor wordt eerst gematerialiseerd (`materializeSelection`).
   */
  const impact = useMemo(() => {
    if (manifest) {
      return {
        ids: manifest.ids,
        count: manifest.count,
        sumPositief: manifest.sumPositief,
        sumNegatief: manifest.sumNegatief,
        splitCount: manifest.splitIds.length,
        bankLinkedCount: manifest.bankLinkedCount,
        linkedCounterpartCount: manifest.linkedCounterpartIds.length,
      }
    }
    const ids = [...selection.ids]
    let sumPositief = 0
    let sumNegatief = 0
    let splitCount = 0
    let bankLinkedCount = 0
    for (const id of ids) {
      const row = rowCache.get(id)
      if (!row) continue
      if (row.amount >= 0) sumPositief += row.amount
      else sumNegatief += row.amount
      if (row.is_split) splitCount++
      if (row.is_bank_linked) bankLinkedCount++
    }
    return {
      ids,
      count: ids.length,
      sumPositief,
      sumNegatief,
      splitCount,
      bankLinkedCount,
      // Tegenboekingen buiten de selectie kent alleen het manifest.
      linkedCounterpartCount: 0,
    }
  }, [selection, manifest, rowCache])

  const filterLines = useMemo(
    () => describeCriteria(criteria, { accountName, budgetName }),
    [criteria, accountName, budgetName],
  )

  /**
   * Materialiseer de selectie (als dat nog niet gebeurd is) en open dán pas de
   * bevestiging.
   *
   * Dit is de poort waar C1 op zat: bij een expliciete selectie kende de client
   * de tegenboekingen niet, dus noemde de knop "Verwijder 5 transacties" terwijl
   * de server er 6 verwijderde — zonder type-to-confirm, want 5 ligt onder de
   * drempel. Nu telt de bevestiging altijd met server-opgeloste getallen, en is
   * het aantal op de knop hetzelfde aantal dat de server toetst.
   */
  const openConfirm = useCallback(
    async (kind: 'budget' | 'delete') => {
      setMutationError(null)
      if (manifest) {
        setConfirmKind(kind)
        return
      }
      const ids = [...selection.ids]
      if (ids.length === 0) return

      setManifestBusy(true)
      setSelectionNotice(null)
      try {
        const result = await fetchSelectionManifest({ ids })
        if (result.count === 0) {
          // Alle aangevinkte rijen zijn intussen weg (of van de partner). Niets
          // om te bevestigen — en zeker geen bevestiging met een nul erin.
          setManifest(null)
          setSelectionNotice(
            'Geen van de geselecteerde transacties bestaat nog. Zoek opnieuw en kies wat je wilt bewerken.',
          )
          return
        }
        setManifest(result)
        setSelectionNotice(noticeForManifest(result))
        setConfirmKind(kind)
      } catch (err) {
        setManifest(null)
        setSelectionNotice(
          err instanceof BulkApiError
            ? err.message
            : 'De selectie kon niet worden vastgezet. Probeer het opnieuw.',
        )
      } finally {
        setManifestBusy(false)
      }
    },
    [manifest, selection.ids, noticeForManifest],
  )

  // ── Mutaties ──────────────────────────────────────────────────────────────
  const afterMutation = useCallback(() => {
    setSelection(clearSelection())
    setManifest(null)
    setSelectionNotice(null)
    setConfirmKind(null)
    setPage(1)
    setRowCache(new Map())
    setReloadKey((k) => k + 1)
    onMutated?.()
  }, [onMutated])

  /**
   * Waar een blijvende regel op zou matchen (F20). Alleen aanbieden wanneer dat
   * aantoonbaar is: één gedeelde tegenpartij binnen de selectie, of anders de
   * zoekterm die de gebruiker zelf intypte. Nooit iets afleiden uit rijen die we
   * niet hebben gezien.
   *
   * De ondergrens `MIN_RULE_MATCH_LENGTH` staat hier ook — niet als tweede
   * waarheid maar als tweede rem: de server weigert een te korte matchwaarde
   * (`planRuleTarget`), en een aanbod dat gegarandeerd op een 400 uitloopt is
   * een aanbod dat je niet moet doen. Vooral de zoekterm-terugval is riskant:
   * een `description`-regel matcht als SUBSTRING op alle volgende imports.
   */
  const deriveRuleCandidate = useCallback(
    (budgetId: string): RuleCandidate | null => {
      const label = budgetNameById.get(budgetId)
      if (!label) return null
      if (!selection.allMatching) {
        const selectedRows = [...selection.ids]
          .map((id) => rowCache.get(id))
          .filter((r): r is TransactionSearchRow => r != null)
        const names = selectedRows.map((r) => (r.counterparty_name ?? '').trim())
        const first = names[0]
        // Alleen wanneer élke geselecteerde rij dezelfde, niet-lege tegenpartij
        // draagt — anders belooft de regel iets breders dan de gebruiker koos.
        if (
          names.length > 0 &&
          first.length >= MIN_RULE_MATCH_LENGTH &&
          names.every((n) => n === first)
        ) {
          return {
            matchField: 'counterparty_name',
            matchValue: first,
            budgetId,
            budgetLabel: label,
          }
        }
      }
      const q = criteria.q?.trim()
      if (q && q.length >= MIN_RULE_MATCH_LENGTH) {
        return { matchField: 'description', matchValue: q, budgetId, budgetLabel: label }
      }
      return null
    },
    [selection, rowCache, criteria.q, budgetNameById],
  )

  /**
   * Het getal dat de gebruiker heeft bevestigd — het getal op de knop, uit het
   * manifest. Bewust NIET `ids.length`: dat is afgeleid uit dezelfde array die
   * we meesturen, dus de server-poort van ADR 0104 besluit 3 kon alleen op
   * duplicaten afgaan en nooit op de divergentie waar hij voor bedoeld is.
   */
  const confirmedCount = impact.count

  const runBudgetMutation = useCallback(async () => {
    const ids = impact.ids
    if (ids.length === 0) return
    setMutating(true)
    setMutationError(null)
    try {
      const res = await bulkSetBudget({
        ids: [...ids],
        expectedCount: confirmedCount,
        budgetId: targetBudgetId,
      })
      setUitkomst({
        kind: 'budget',
        requested: res.requested,
        changed: res.updated,
        skipped: res.skipped,
        failedIds: res.failedIds,
        truncated: res.truncated,
        budgetLabel: targetBudgetId
          ? (budgetNameById.get(targetBudgetId) ?? 'het gekozen budget')
          : 'Niet gecategoriseerd',
      })
      setRuleState('idle')
      setRuleError(null)
      setRuleCandidate(
        res.updated > 0 && targetBudgetId ? deriveRuleCandidate(targetBudgetId) : null,
      )
      afterMutation()
    } catch (err) {
      setMutationError(
        err instanceof BulkApiError ? err.message : 'De wijziging is niet doorgevoerd.',
      )
    } finally {
      setMutating(false)
    }
  }, [impact.ids, confirmedCount, targetBudgetId, budgetNameById, deriveRuleCandidate, afterMutation])

  const runDeleteMutation = useCallback(
    async (input: { confirmCount?: number; includeLinkedCounterparts: boolean }) => {
      const ids = impact.ids
      if (ids.length === 0) return
      setMutating(true)
      setMutationError(null)
      try {
        const res = await bulkDelete({
          ids: [...ids],
          expectedCount: confirmedCount,
          confirmCount: input.confirmCount,
          includeLinkedCounterparts: input.includeLinkedCounterparts,
        })
        setUitkomst({
          kind: 'delete',
          requested: res.requested,
          changed: res.deleted,
          orphansCleared: res.orphansCleared,
          failedIds: res.failedIds,
          truncated: res.truncated,
        })
        setRuleCandidate(null)
        afterMutation()
      } catch (err) {
        setMutationError(
          err instanceof BulkApiError ? err.message : 'Het verwijderen is niet doorgevoerd.',
        )
      } finally {
        setMutating(false)
      }
    },
    [impact.ids, confirmedCount, afterMutation],
  )

  const handleCreateRule = useCallback(async () => {
    if (!ruleCandidate) return
    setRuleState('busy')
    setRuleError(null)
    try {
      await createBulkRule({
        matchField: ruleCandidate.matchField,
        matchValue: ruleCandidate.matchValue,
        budgetId: ruleCandidate.budgetId,
      })
      setRuleState('created')
    } catch (err) {
      setRuleState('error')
      setRuleError(
        err instanceof BulkApiError ? err.message : 'De regel kon niet worden aangemaakt.',
      )
    }
  }, [ruleCandidate])

  // ── Render ────────────────────────────────────────────────────────────────
  const hasSelection = selectedCount > 0
  const mutableCount = Math.max(0, impact.count - impact.splitCount)

  return (
    <>
      {/* De pane-footer ÍS de bulk-actiebalk (F12): impact + acties, sticky op
          desktop én mobiel. De annuleer-affordance staat er bewust naast én
          bovenaan bij de teller — op een lijst van vijftig rijen is de bovenste
          variant weggescrold precies wanneer je 'm nodig hebt. */}
      <ShellOverlay
        open={open}
        onClose={onClose}
        kind="pane"
        title="Zoeken en bulkbewerken"
        footerInfo={
          hasSelection ? (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <BulkImpact
                count={impact.count}
                sumPositief={impact.sumPositief}
                sumNegatief={impact.sumNegatief}
              />
              <button
                type="button"
                onClick={handleClearSelection}
                className="text-[12px] font-medium text-[var(--ink-2)] underline underline-offset-2 hover:text-[var(--ink)]"
              >
                Selectie wissen
              </button>
            </span>
          ) : undefined
        }
        primaryAction={
          hasSelection
            ? {
                label: 'Koppel aan budget',
                onClick: () => {
                  void openConfirm('budget')
                },
                // `mutableCount` telt alleen bij een gematerialiseerde selectie;
                // zonder manifest kennen we de splits nog niet en blokkeert die
                // teller de knop dus niet vooraf.
                disabled: manifestBusy || (manifest != null && mutableCount === 0),
              }
            : undefined
        }
        secondaryAction={
          hasSelection
            ? {
                label: 'Verwijderen…',
                onClick: () => {
                  void openConfirm('delete')
                },
                disabled: manifestBusy,
              }
            : undefined
        }
      >
        <div className="space-y-5" style={KERN_MODULE_TINT}>
          <p className="font-serif text-sm italic leading-relaxed text-[var(--ink-2)]">
            Doorzoek je volledige historie — zonder datumvenster — en werk meerdere boekingen in één
            keer bij. Elke euro die je hier verplaatst, verplaatst ook je vrijheidstijd.
          </p>

          {hasHousehold && (
            <p className="flex items-start gap-2 border-l-[3px] border-[var(--border-md)] pl-3 text-[12px] text-[var(--ink-3)]">
              <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                Je ziet hier alleen je eigen transacties. Boekingen van je partner staan er niet
                tussen — ook niet op een gedeelde rekening, want die kun je niet bewerken of
                verwijderen.
              </span>
            </p>
          )}

          {uitkomst && (
            <BulkUitkomst
              data={uitkomst}
              onDismiss={() => {
                setUitkomst(null)
                setRuleCandidate(null)
                setRuleState('idle')
              }}
              ruleCandidate={ruleCandidate}
              ruleState={ruleState}
              ruleError={ruleError}
              onCreateRule={handleCreateRule}
              onDeclineRule={() => setRuleCandidate(null)}
            />
          )}

          <BulkFilters
            criteria={criteria}
            onCriteriaChange={commitCriteria}
            qDraft={qDraft}
            onQDraftChange={setQDraft}
            accounts={accounts}
            budgetEntries={budgetEntries}
            labels={{ accountName, budgetName }}
            total={response ? response.total : null}
            busy={loading}
          />

          <BulkResultaten
            rows={rows}
            total={total}
            page={page}
            pageSize={response?.pageSize ?? DEFAULT_PAGE_SIZE}
            loading={loading}
            error={searchError}
            selection={selection}
            selectedCount={selectedCount}
            selectionNotice={selectionNotice}
            budgetName={budgetName}
            accountName={accountName}
            onToggleRow={handleToggleRow}
            onTogglePage={handleTogglePage}
            onSelectAllMatching={handleSelectAllMatching}
            onClearSelection={handleClearSelection}
            onPageChange={setPage}
            onOpenRow={onOpenRow}
            manifestBusy={manifestBusy}
          />
        </div>
      </ShellOverlay>

      {/* Sub-overlays als sibling — elke overlay houdt zijn eigen focus-trap en
          Esc-afhandeling; nesten zou de pane sluiten bij Esc op de bevestiging.
          Conditioneel gemount zodat elke bevestiging vers begint: een half
          ingevulde type-to-confirm uit een afgebroken poging mag nooit
          meeliften naar de volgende. */}
      {confirmKind === 'budget' && (
        <BulkBudgetSheet
          open
          onClose={() => setConfirmKind(null)}
          onConfirm={runBudgetMutation}
          busy={mutating}
          error={mutationError}
          count={impact.count}
          mutableCount={mutableCount}
          sumPositief={impact.sumPositief}
          sumNegatief={impact.sumNegatief}
          filterLines={filterLines}
          splitCount={impact.splitCount}
          budgetEntries={budgetEntries}
          budgetId={targetBudgetId}
          onBudgetChange={setTargetBudgetId}
          isEigenRekening={targetBudgetId != null && eigenRekeningIds.has(targetBudgetId)}
        />
      )}

      {confirmKind === 'delete' && (
        <BulkDeleteConfirm
          open
          onClose={() => setConfirmKind(null)}
          onConfirm={runDeleteMutation}
          busy={mutating}
          error={mutationError}
          count={impact.count}
          sumPositief={impact.sumPositief}
          sumNegatief={impact.sumNegatief}
          filterLines={filterLines}
          bankLinkedCount={impact.bankLinkedCount}
          linkedCounterpartCount={impact.linkedCounterpartCount}
          splitCount={impact.splitCount}
        />
      )}
    </>
  )
}
