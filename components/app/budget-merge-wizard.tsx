'use client'

import { useMemo, useState } from 'react'
import { Users, ArrowLeftRight, Check } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { formatCurrency } from '@/lib/format'
import { buildMergeMapping, type MergeCandidate } from '@/lib/budget-merge'

/**
 * BudgetMergeWizard — de voorstel-/review-flow voor het samenvoegen van
 * dubbele budget-categorieën tot één gezamenlijk huishoudbudget.
 *
 * Gemodelleerd naar HouseholdRetirementPane: een BottomSheet (size="xl") met
 * een footerSlot voor de primaire/secundaire acties en een lichte stepper in
 * de content. Twee modi:
 *  - 'propose' : de gebruiker kiest per dubbel-paar welke kant canoniek wordt
 *                en verstuurt een voorstel (POST budget-model).
 *  - 'review'  : de partner bekijkt het ontvangen voorstel (read-only) en
 *                accepteert/wijst af (PATCH budget-model).
 *
 * De pure merge-mapping wordt opgebouwd door `buildMergeMapping` uit
 * '@/lib/budget-merge' — children erven automatisch de kant van hun root-paar,
 * dus de keuze tonen we alleen op root-paren.
 */

type BudgetLike = {
  id: string
  user_id?: string
  parent_id: string | null
  name: string
  slug: string
  budget_type: string
  ownership?: string
  default_limit?: number | null
  icon?: string | null
}

type Candidate = {
  canonical: BudgetLike
  duplicate: BudgetLike
  txCountCanonical?: number
  txCountDuplicate?: number
}

type MergeMapEntry = { canonical_budget_id: string; duplicate_budget_id: string }

type PendingProposal = {
  id: string
  target_model: 'household' | 'separate'
  merge_mapping: MergeMapEntry[]
  proposed_by: string
  proposedByMe: boolean
  created_at: string
  expires_at: string
}

/** Per root-budget de gekozen kant (eigen budget of dat van de partner). */
type CanonicalChoice = Record<string, 'own' | 'partner'>

type WizardProps = {
  open: boolean
  onClose: () => void
  mode: 'propose' | 'review'
  proposal?: PendingProposal
  candidates: Candidate[]
  partnerName: string | null
  onDone: () => void
}

const BUDGET_MODEL_ENDPOINT = '/api/household/budget-model'

/** True wanneer dit een root-paar is (geen parent op de canonieke kant). */
function isRootCandidate(c: Candidate): boolean {
  return c.canonical.parent_id == null
}

/**
 * De GET-payload (en `detectMergeCandidates`) zet de EIGEN kant altijd als
 * `candidate.canonical` neer en de partnerkant als `candidate.duplicate`. De
 * segmented-control sluit hierop aan: optie 'own' = `canonical` (van jou),
 * 'partner' = `duplicate` (van de partner). De keuze wordt — net als in
 * `buildMergeMapping` — gekeyd op `candidate.canonical.id`.
 */
function ownSide(c: Candidate): { own: BudgetLike; ownTx?: number; other: BudgetLike; otherTx?: number } {
  return {
    own: c.canonical,
    ownTx: c.txCountCanonical,
    other: c.duplicate,
    otherTx: c.txCountDuplicate,
  }
}

/** Default-keuze per root: de kant met de meeste transacties (gelijk → eigen). */
function defaultChoice(c: Candidate): 'own' | 'partner' {
  const own = c.txCountCanonical ?? 0
  const other = c.txCountDuplicate ?? 0
  return other > own ? 'partner' : 'own'
}

export function BudgetMergeWizard({
  open,
  onClose,
  mode,
  proposal,
  candidates,
  partnerName,
  onDone,
}: WizardProps) {
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rootCandidates = useMemo(
    () => candidates.filter(isRootCandidate),
    [candidates],
  )

  // Per root-budget gekozen kant; default afgeleid uit transactie-aantallen.
  const [choices, setChoices] = useState<CanonicalChoice>(() => {
    const init: CanonicalChoice = {}
    for (const c of candidates.filter(isRootCandidate)) {
      const { own } = ownSide(c)
      init[own.id] = defaultChoice(c)
    }
    return init
  })

  const partnerLabel = partnerName ?? 'je partner'
  const isReview = mode === 'review'

  /** Children per root, voor de ingesprongen read-only weergave. */
  const childrenByRoot = useMemo(() => {
    const map = new Map<string, Candidate[]>()
    for (const c of candidates) {
      if (isRootCandidate(c)) continue
      // Children hangen onder hun parent via canonical.parent_id; we groeperen
      // op de root waarvan de canonical-id de parent is.
      const parentId = c.canonical.parent_id
      if (!parentId) continue
      const list = map.get(parentId) ?? []
      list.push(c)
      map.set(parentId, list)
    }
    return map
  }, [candidates])

  const pairCount = rootCandidates.length

  async function submitProposal() {
    setSubmitting(true)
    setError(null)
    try {
      // `candidates` volgt de GET-contractvorm (slug: string, default_limit:
      // number | null); de lib accepteert de iets lossere `MergeCandidate`
      // (slug: string | null, default_limit: number | undefined). De velden die
      // de merge-logica raakt (id/parent_id/slug/budget_type) zijn identiek,
      // dus de cast is veilig.
      const mergeMapping = buildMergeMapping(candidates as unknown as MergeCandidate[], choices)
      const res = await fetch(BUDGET_MODEL_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetModel: 'household', mergeMapping }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Voorstel versturen mislukt.')
      }
      onDone()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Onbekende fout.')
    } finally {
      setSubmitting(false)
    }
  }

  async function respondToProposal(action: 'accept' | 'decline') {
    if (!proposal) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(BUDGET_MODEL_ENDPOINT, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ proposalId: proposal.id, action }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Reageren op voorstel mislukt.')
      }
      onDone()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Onbekende fout.')
    } finally {
      setSubmitting(false)
    }
  }

  const isLastStep = step === 2

  const footer = (
    <div className="flex items-center justify-end gap-3">
      {error && (
        <p className="mr-auto text-xs text-negative" role="alert">
          {error}
        </p>
      )}
      {step > 0 && (
        <button
          type="button"
          onClick={() => setStep((s) => s - 1)}
          disabled={submitting}
          className="px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] disabled:opacity-50"
        >
          Terug
        </button>
      )}
      {!isLastStep && (
        <button
          type="button"
          onClick={() => setStep((s) => s + 1)}
          className="px-5 py-2 text-sm font-semibold bg-kern-600 text-white hover:bg-kern-700"
        >
          Volgende
        </button>
      )}
      {isLastStep && !isReview && (
        <button
          type="button"
          onClick={() => void submitProposal()}
          disabled={submitting}
          className="px-5 py-2 text-sm font-semibold bg-kern-600 text-white hover:bg-kern-700 disabled:opacity-50"
        >
          {submitting ? 'Versturen…' : 'Voorstel versturen'}
        </button>
      )}
      {isLastStep && isReview && (
        <>
          <button
            type="button"
            onClick={() => void respondToProposal('decline')}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-negative hover:bg-negative/10 disabled:opacity-50"
          >
            Afwijzen
          </button>
          <button
            type="button"
            onClick={() => void respondToProposal('accept')}
            disabled={submitting}
            className="px-5 py-2 text-sm font-semibold bg-kern-600 text-white hover:bg-kern-700 disabled:opacity-50"
          >
            {submitting ? 'Bezig…' : 'Accepteren'}
          </button>
        </>
      )}
    </div>
  )

  const steps = ['Uitleg', 'Samenvoegen', 'Bevestigen']

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={isReview ? `Voorstel van ${partnerLabel}` : 'Huishoudbudget voorstellen'}
      size="xl"
      footerSlot={footer}
    >
      <div className="px-5 py-5 space-y-6">
        {/* Stepper */}
        <ol className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.14em]">
          {steps.map((label, i) => {
            const active = i === step
            const done = i < step
            return (
              <li key={label} className="flex items-center gap-2">
                <span
                  className={`flex h-6 w-6 items-center justify-center border text-[11px] ${
                    active
                      ? 'border-kern-700 bg-kern-50 text-kern-700'
                      : done
                        ? 'border-kern-300 bg-kern-100 text-kern-700'
                        : 'border-[var(--border-ed)] text-[var(--ink-4)]'
                  }`}
                >
                  {done ? <Check className="h-3 w-3" aria-hidden="true" /> : i + 1}
                </span>
                <span className={active ? 'text-kern-700' : 'text-[var(--ink-4)]'}>{label}</span>
                {i < steps.length - 1 && (
                  <span aria-hidden className="mx-1 h-px w-5 bg-[var(--border-ed)]" />
                )}
              </li>
            )
          })}
        </ol>

        {/* Step 1 — Uitleg */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-kern-100 text-kern-700">
                <Users className="h-4 w-4" aria-hidden="true" />
              </div>
              <p className="text-sm text-[var(--ink-2)] leading-relaxed">
                Met één gezamenlijk huishoudbudget beheren jullie samen dezelfde
                categorieën. Dit is wat er gebeurt:
              </p>
            </div>
            <ul className="space-y-2.5 text-sm text-[var(--ink-2)] leading-relaxed">
              <li className="flex gap-2.5">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-kern-600" aria-hidden="true" />
                <span>Jullie krijgen één gedeelde categorie-boom die je allebei kunt bewerken.</span>
              </li>
              <li className="flex gap-2.5">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-kern-600" aria-hidden="true" />
                <span>Dubbele categorieën worden samengevoegd — met behoud van de volledige historie.</span>
              </li>
              <li className="flex gap-2.5">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-kern-600" aria-hidden="true" />
                <span>Je eigen potjes blijven persoonlijk; alleen gedeelde categorieën worden samengevoegd.</span>
              </li>
              <li className="flex gap-2.5">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-kern-600" aria-hidden="true" />
                <span>Inkomstenbudgetten doen niet mee — die blijven per persoon.</span>
              </li>
              <li className="flex gap-2.5">
                <ArrowLeftRight className="mt-0.5 h-4 w-4 shrink-0 text-kern-600" aria-hidden="true" />
                <span>Het is omkeerbaar: jullie kunnen later weer terug naar gescheiden budgetten.</span>
              </li>
            </ul>
            {isReview && (
              <p className="text-sm italic text-[var(--ink-3)] border-l-2 border-kern-300 pl-3">
                {partnerLabel} stelt dit voor. Bekijk de samenvoegingen in de volgende
                stap en accepteer of wijs af.
              </p>
            )}
          </div>
        )}

        {/* Step 2 — Samenvoegen */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--ink-3)] leading-relaxed">
              {isReview
                ? `Dit zijn de categorieën die ${partnerLabel} wil samenvoegen. De gekozen kant blijft behouden als gezamenlijke categorie.`
                : 'Kies per dubbele categorie welke versie de gezamenlijke categorie wordt. De andere wordt erin samengevoegd, inclusief historie.'}
            </p>
            {pairCount === 0 && (
              <p className="text-sm italic text-[var(--ink-4)]">
                Geen dubbele categorieën gevonden om samen te voegen.
              </p>
            )}
            <div className="space-y-3">
              {rootCandidates.map((c) => {
                const { own, ownTx, other, otherTx } = ownSide(c)
                const chosen = choices[own.id] ?? defaultChoice(c)
                const kids = childrenByRoot.get(c.canonical.id) ?? []
                return (
                  <div
                    key={own.id}
                    className="border border-[var(--border-ed)] bg-[var(--paper)] p-4"
                  >
                    <div className="mb-3 text-sm font-semibold text-[var(--ink)]">{own.name}</div>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { side: 'own' as const, budget: own, tx: ownTx, label: 'Die van jou' },
                        { side: 'partner' as const, budget: other, tx: otherTx, label: `Die van ${partnerLabel}` },
                      ]).map((opt) => {
                        const active = chosen === opt.side
                        return (
                          <button
                            key={opt.side}
                            type="button"
                            aria-pressed={active}
                            disabled={isReview}
                            onClick={() =>
                              !isReview &&
                              setChoices((prev) => ({ ...prev, [own.id]: opt.side }))
                            }
                            className={`text-left border p-3 transition-colors ${
                              active
                                ? 'border-kern-700 bg-kern-50'
                                : 'border-[var(--border-ed)] hover:border-[var(--border-md)]'
                            } ${isReview ? 'cursor-default' : ''}`}
                          >
                            <div className="text-[10px] uppercase tracking-[0.14em] font-mono text-kern-700">
                              {opt.label}
                            </div>
                            <div className="mt-1 text-sm font-medium text-[var(--ink)] truncate">
                              {opt.budget.name}
                            </div>
                            <div className="mt-0.5 text-xs text-[var(--ink-3)] font-mono tabular-nums">
                              {opt.tx ?? '–'} transacties
                            </div>
                          </button>
                        )
                      })}
                    </div>
                    {kids.length > 0 && (
                      <ul className="mt-3 space-y-1 border-l border-[var(--border-ed)] pl-3">
                        {kids.map((k) => (
                          <li
                            key={k.canonical.id}
                            className="flex items-center justify-between text-xs text-[var(--ink-3)]"
                          >
                            <span className="truncate">{k.canonical.name}</span>
                            <span className="font-mono tabular-nums shrink-0 ml-2">
                              {(k.txCountCanonical ?? 0) + (k.txCountDuplicate ?? 0)} transacties
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Step 3 — Bevestigen */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="border border-[var(--border-ed)] bg-[var(--subtle)] p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--ink-2)]">Categorieën samengevoegd</span>
                <span className="font-mono tabular-nums font-semibold text-[var(--ink)]">
                  {isReview ? proposal?.merge_mapping.length ?? 0 : pairCount} paar
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--ink-2)]">Eigen potjes</span>
                <span className="text-[var(--ink-3)]">blijven persoonlijk</span>
              </div>
            </div>
            {!isReview ? (
              <p className="text-sm text-[var(--ink-3)] leading-relaxed">
                {partnerLabel} ontvangt dit voorstel en moet het bevestigen voordat
                het gezamenlijke huishoudbudget actief wordt. Tot die tijd verandert
                er niets aan jullie budgetten.
              </p>
            ) : (
              <p className="text-sm text-amber-700 leading-relaxed border-l-2 border-amber-300 pl-3">
                Let op: bij accepteren wordt de historie van {partnerLabel} in de
                gezamenlijke categorieën samengevoegd. Dit is later omkeerbaar.
              </p>
            )}
          </div>
        )}
      </div>
    </BottomSheet>
  )
}

export default BudgetMergeWizard
