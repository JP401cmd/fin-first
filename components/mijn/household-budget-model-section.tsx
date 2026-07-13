'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Wallet, Users, ArrowLeftRight, Check, Clock } from 'lucide-react'
import { BudgetMergeWizard } from '@/components/app/budget-merge-wizard'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'

/**
 * HouseholdBudgetModelSection — beheer van het budget-model van het huishouden:
 * gescheiden budgetten óf één gezamenlijk huishoudbudget. Toont de juiste
 * staat (voorstellen / wachten / reviewen / actief) en opent de
 * BudgetMergeWizard voor het samenvoegen.
 *
 * Self-gating, gemodelleerd naar HouseholdPrivacySettings: laadt
 * /api/household/budget-model; zonder huishouden (hasHousehold=false) rendert
 * het component niets. Alle datalogica leeft in dat endpoint (parallel
 * gebouwd) — dit component is puur presentatie + acties.
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

type BudgetModelData = {
  budgetModel: 'separate' | 'household'
  hasHousehold: boolean
  partnerName: string | null
  pendingProposal: PendingProposal | null
  candidates: Candidate[] | null
  partnerPrivacyBlocksMerge: boolean
}

const ENDPOINT = '/api/household/budget-model'

export function HouseholdBudgetModelSection() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<BudgetModelData | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardMode, setWizardMode] = useState<'propose' | 'review'>('propose')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [accepted, setAccepted] = useState(false)
  // I-05: bevestiging bij terugdraaien naar gescheiden budgetten (vervangt
  // window.confirm door een toegankelijke ShellOverlay-confirm).
  const [showSeparateConfirm, setShowSeparateConfirm] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(ENDPOINT)
      if (!res.ok) {
        setData(null)
        return
      }
      const json = (await res.json()) as BudgetModelData
      setData(json)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const partnerName = data?.partnerName ?? null
  const partnerLabel = partnerName ?? 'je partner'

  /** Stelt voor terug te gaan naar gescheiden budgetten (POST separate).
   *  De bevestiging draait nu via de ShellOverlay-confirm; deze functie voert
   *  na akkoord de call uit. */
  const doProposeSeparate = useCallback(async () => {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetModel: 'separate' }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Voorstel versturen mislukt.')
      }
      setShowSeparateConfirm(false)
      await load()
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Onbekende fout.' })
    } finally {
      setBusy(false)
    }
  }, [load])

  /** PATCH-acties op een bestaand voorstel (intrekken / afwijzen). */
  const patchProposal = useCallback(
    async (action: 'cancel' | 'decline') => {
      if (!data?.pendingProposal) return
      setBusy(true)
      setMessage(null)
      try {
        const res = await fetch(ENDPOINT, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ proposalId: data.pendingProposal.id, action }),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error ?? 'Actie mislukt.')
        }
        await load()
      } catch (e) {
        setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Onbekende fout.' })
      } finally {
        setBusy(false)
      }
    },
    [data, load],
  )

  if (loading || !data || !data.hasHousehold) return null

  const { budgetModel, pendingProposal, candidates, partnerPrivacyBlocksMerge } = data

  return (
    <section
      id="huishoudbudget"
      className="mb-10 scroll-mt-24 rounded-[var(--r-lg)] border border-kern-200 bg-[var(--paper)] p-6 sm:p-8"
      data-testid="household-budget-model-section"
    >
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-kern-100 text-kern-700">
          <Wallet className="h-4 w-4" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--ink)]">Huishoudbudget</h2>
          <p className="mt-1 text-sm text-[var(--ink-2)] leading-relaxed">
            Budgetteren jullie gescheiden, of beheren jullie samen één gezamenlijk
            huishoudbudget?
          </p>
        </div>
      </div>

      {/* Succes na accepteren */}
      {accepted && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-kern-300 bg-kern-50 p-4">
          <div className="flex items-center gap-2.5">
            <Check className="h-4 w-4 text-kern-700" aria-hidden="true" />
            <span className="text-sm font-medium text-kern-800">
              Jullie huishoudbudget is actief.
            </span>
          </div>
          <Link
            href="/core/budgets"
            className="text-sm font-semibold text-kern-700 underline underline-offset-2 hover:text-kern-800"
          >
            Bekijk jullie huishoudbudget
          </Link>
        </div>
      )}

      {/* State 5: voorstel ontvangen van partner (review) */}
      {pendingProposal && !pendingProposal.proposedByMe && (
        <div className="rounded-lg border border-kern-300 bg-kern-50 p-4">
          <div className="mb-3 flex items-start gap-2.5">
            <Users className="mt-0.5 h-4 w-4 shrink-0 text-kern-700" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-kern-800">
                {partnerLabel} stelt voor:{' '}
                {pendingProposal.target_model === 'household'
                  ? 'één gezamenlijk huishoudbudget'
                  : 'terug naar gescheiden budgetten'}
              </p>
              <p className="mt-1 text-sm text-[var(--ink-2)] leading-relaxed">
                {pendingProposal.target_model === 'household'
                  ? `${pendingProposal.merge_mapping.length} dubbele categorieën worden samengevoegd. Bekijk de details voordat je bevestigt.`
                  : 'Jullie keren terug naar gescheiden budgetten per eigenaar.'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {pendingProposal.target_model === 'household' && (
              <button
                type="button"
                onClick={() => {
                  setWizardMode('review')
                  setWizardOpen(true)
                }}
                disabled={busy}
                className="px-4 py-2 text-sm font-semibold bg-kern-600 text-white hover:bg-kern-700 disabled:opacity-50"
              >
                Bekijken
              </button>
            )}
            <button
              type="button"
              onClick={() => void patchProposal('decline')}
              disabled={busy}
              className="px-4 py-2 text-sm font-medium text-negative hover:bg-negative/10 disabled:opacity-50"
            >
              Afwijzen
            </button>
          </div>
        </div>
      )}

      {/* State 4: eigen voorstel wacht op partner */}
      {pendingProposal && pendingProposal.proposedByMe && (
        <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)] p-4">
          <div className="mb-3 flex items-center gap-2.5">
            <Clock className="h-4 w-4 text-[var(--ink-3)]" aria-hidden="true" />
            <p className="text-sm font-medium text-[var(--ink-2)]">
              Wacht op bevestiging van {partnerLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void patchProposal('cancel')}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] border border-[var(--border-ed)] disabled:opacity-50"
          >
            Voorstel intrekken
          </button>
        </div>
      )}

      {/* State 2: gescheiden, geen voorstel → kan voorstellen */}
      {!pendingProposal && budgetModel === 'separate' && (
        <div className="space-y-4">
          <p className="text-sm text-[var(--ink-2)] leading-relaxed">
            Jullie budgetteren nu gescheiden. Met één huishoudbudget worden dubbele
            categorieën samengevoegd tot één gezamenlijke pot.
          </p>
          <div>
            <button
              type="button"
              onClick={() => {
                setWizardMode('propose')
                setWizardOpen(true)
              }}
              disabled={busy || partnerPrivacyBlocksMerge}
              className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-kern-600 text-white hover:bg-kern-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
              Stel huishoudbudget voor
            </button>
            {partnerPrivacyBlocksMerge && (
              <p className="mt-2 text-xs text-amber-700 leading-relaxed">
                {partnerLabel} moet budget-privacy op &apos;Volledig&apos; zetten om
                samen te voegen.
              </p>
            )}
          </div>
        </div>
      )}

      {/* State 3: gezamenlijk actief, geen voorstel → kan terugdraaien */}
      {!pendingProposal && budgetModel === 'household' && (
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-kern-300 bg-kern-50 px-3 py-1 text-sm font-medium text-kern-800">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            Eén huishoudbudget actief
          </div>
          <div>
            <button
              type="button"
              onClick={() => setShowSeparateConfirm(true)}
              disabled={busy}
              className="px-4 py-2 text-sm font-medium text-[var(--ink-2)] border border-[var(--border-ed)] hover:bg-[var(--subtle)] disabled:opacity-50"
            >
              Terug naar gescheiden budgetten voorstellen
            </button>
          </div>
        </div>
      )}

      {message && (
        <p className={`mt-4 text-sm ${message.type === 'success' ? 'text-kern-700' : 'text-negative'}`}>
          {message.text}
        </p>
      )}

      {/* Wizard — propose (eigen voorstel) of review (partner-voorstel) */}
      {wizardOpen && (
        <BudgetMergeWizard
          open={wizardOpen}
          onClose={() => setWizardOpen(false)}
          mode={wizardMode}
          proposal={pendingProposal ?? undefined}
          candidates={candidates ?? []}
          partnerName={partnerName}
          onDone={() => {
            if (wizardMode === 'review') setAccepted(true)
            void load()
          }}
        />
      )}

      {/* I-05: bevestiging "terug naar gescheiden budgetten" — toegankelijke
          ShellOverlay-confirm (focus-trap + Esc) i.p.v. window.confirm. */}
      <ShellOverlay
        open={showSeparateConfirm}
        onClose={() => {
          if (!busy) setShowSeparateConfirm(false)
        }}
        kind="confirm"
        destructive
        title="Terug naar gescheiden budgetten?"
      >
        <div className="p-6">
          <p className="text-sm leading-relaxed text-[var(--ink-2)]">
            De historie gaat per eigenaar terug. Nieuwe gezamenlijke boekingen van{' '}
            {partnerLabel} op nog niet-samengevoegde gedeelde budgetten worden
            ongecategoriseerd.
          </p>
          {message?.type === 'error' && (
            <p className="mt-3 text-sm text-negative">{message.text}</p>
          )}
          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowSeparateConfirm(false)}
              disabled={busy}
              className="rounded-lg border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] disabled:opacity-50"
            >
              Annuleren
            </button>
            <button
              type="button"
              onClick={() => void doProposeSeparate()}
              disabled={busy}
              className="rounded-lg bg-negative px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Versturen…' : 'Voorstel versturen'}
            </button>
          </div>
        </div>
      </ShellOverlay>
    </section>
  )
}

export default HouseholdBudgetModelSection
