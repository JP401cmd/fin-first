'use client'

// Detailpaneel-inhoud voor één UAT-scenario (Deel 3 §3.3). Gedeeld tussen het
// desktop-zijpaneel en de mobiele BottomSheet. Toont scenario-meta (WF-ID,
// kriticiteit, platformdoelen, rooktest) en per subscenario × platform de
// huidige status + resultaatinvoer (UatResultForm). Read-only bij een gesloten
// ronde of wanneer er nog geen ronde is.

import { AlertTriangle, Lock, Zap } from 'lucide-react'
import type { UatScenario } from '@/lib/uat/catalog'
import {
  buildResultLookup,
  deriveScenarioStatus,
  deriveSubStatus,
  resultKey,
  UAT_STATUS_VISUAL,
  type UatResultRow,
} from '@/lib/uat/status'
import { BEZIT_ACCEPTANCE } from '@/lib/uat/acceptance/bezit'
import type { AcceptanceAssertionKind, AcceptanceCriterion } from '@/lib/uat/acceptance/types'
import { UatResultForm } from './uat-result-form'

const ASSERTION_KIND_LABEL: Record<AcceptanceAssertionKind, string> = {
  exact: 'exact',
  consistency: 'consistentie',
  oracle: 'oracle',
  direction: 'richting',
  'ui-only': 'ui-only',
}

interface Props {
  scenario: UatScenario
  roundId: string | null
  roundClosed: boolean
  results: readonly UatResultRow[]
  onSaved: (row: UatResultRow) => void
  onRoundClosed: () => void
}

const KRITICITEIT_LABEL: Record<UatScenario['kriticiteit'], string> = {
  KERN: 'Kern',
  BELANGRIJK: 'Belangrijk',
  OVERIG: 'Overig',
}

function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-0.5 text-[11px] text-[var(--ink-2)]">
      {children}
    </span>
  )
}

export function UatDetailPanel({ scenario, roundId, roundClosed, results, onSaved, onRoundClosed }: Props) {
  const lookup = buildResultLookup(results)
  const agg = deriveScenarioStatus(scenario, lookup)
  const readOnly = !roundId || roundClosed
  const aggVisual = UAT_STATUS_VISUAL[agg.status]
  const acceptanceCriteria = BEZIT_ACCEPTANCE.criteria.filter((c) => c.scenarioId === scenario.id)

  return (
    <div className="space-y-4">
      {/* Scenario-kop */}
      <div>
        <div className="flex items-center gap-2">
          <p className="font-mono text-xs font-semibold text-[var(--ink-2)]">{scenario.id}</p>
          <span
            className="inline-flex h-2.5 w-2.5 rounded-full"
            aria-hidden
            style={{ backgroundColor: aggVisual.fill === 'none' ? 'var(--ink-4)' : aggVisual.fill }}
          />
          <span className="text-[11px] text-[var(--ink-3)]">{aggVisual.label}</span>
          {scenario.rooktest && (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-[var(--ink-2)]">
              <Zap className="h-3 w-3" /> rooktest
            </span>
          )}
        </div>
        <h3 className="mt-1 font-serif text-lg leading-snug text-[var(--ink)]">{scenario.naam}</h3>
      </div>

      {/* Meta-chips */}
      <div className="flex flex-wrap gap-1.5">
        <MetaChip>Kriticiteit: {KRITICITEIT_LABEL[scenario.kriticiteit]}</MetaChip>
        <MetaChip>Platform: {scenario.platforms.join(' · ')}</MetaChip>
        <MetaChip>~{scenario.duurMin} min</MetaChip>
        {scenario.wf && <MetaChip>Plan: {scenario.wf}</MetaChip>}
        {scenario.kruisZones && scenario.kruisZones.length > 0 && (
          <MetaChip>Raakt: {scenario.kruisZones.join(', ')}</MetaChip>
        )}
      </div>
      {scenario.wf && (
        <p className="text-[11px] text-[var(--ink-3)]">
          Zie <span className="font-mono">{scenario.wf}</span> in <span className="font-mono">docs/uat/uat-plan.md</span>.
        </p>
      )}

      {/* Acceptatiecriterium/-criteria (alleen bij een match op scenarioId — puur additief) */}
      {acceptanceCriteria.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-2)]">
            {acceptanceCriteria.length > 1 ? 'Acceptatiecriteria' : 'Acceptatiecriterium'}
          </h4>
          {acceptanceCriteria.map((criterion) => (
            <AcceptanceCriterionCard
              key={criterion.workflow}
              criterion={criterion}
              showWorkflow={acceptanceCriteria.length > 1}
            />
          ))}
        </div>
      )}

      {/* Read-only-melding */}
      {readOnly && (
        <div className="flex items-start gap-2 rounded-md border border-[var(--border-ed)] bg-[var(--subtle,transparent)] p-2.5 text-xs text-[var(--ink-2)]">
          {roundClosed ? <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          <span>
            {roundClosed
              ? 'Ronde gesloten — heropen om te bewerken. De registraties hieronder zijn alleen-lezen.'
              : 'Er is nog geen open testronde. Start een ronde om resultaten te registreren.'}
          </span>
        </div>
      )}

      {/* Per subscenario × platform */}
      <div className="space-y-3">
        {scenario.subscenarios.flatMap((sub) =>
          scenario.platforms.map((platform) => {
            const key = resultKey(scenario.id, sub, platform)
            const existing = lookup.get(key)
            const st = deriveSubStatus(existing?.status)
            return (
              <div key={key}>
                {readOnly ? (
                  <ReadOnlyRow sub={sub} platform={platform} existing={existing} status={st} />
                ) : (
                  <UatResultForm
                    roundId={roundId as string}
                    scenarioId={scenario.id}
                    sub={sub}
                    platform={platform}
                    existing={existing}
                    onSaved={onSaved}
                    onRoundClosed={onRoundClosed}
                  />
                )}
              </div>
            )
          }),
        )}
      </div>
    </div>
  )
}

function ReadOnlyRow({
  sub,
  platform,
  existing,
  status,
}: {
  sub: string
  platform: string
  existing: UatResultRow | undefined
  status: ReturnType<typeof deriveSubStatus>
}) {
  const v = UAT_STATUS_VISUAL[status]
  return (
    <div className="rounded-md border border-[var(--border-ed)] bg-[var(--subtle,transparent)] p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-2)]">
          {sub}
          <span className="mx-1.5 text-[var(--ink-4)]">·</span>
          {platform}
        </p>
        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--ink-2)]">
          <span
            className="inline-block h-2 w-2 rounded-full"
            aria-hidden
            style={{ backgroundColor: v.fill === 'none' ? 'var(--ink-4)' : v.fill }}
          />
          {v.label}
        </span>
      </div>
      {existing?.faalstap && (
        <p className="mt-1.5 text-xs text-[var(--ink-2)]">
          Faalstap: {existing.faalstap}
          {existing.severity ? ` (${existing.severity})` : ''}
        </p>
      )}
      {existing?.opmerking && <p className="mt-1 text-xs text-[var(--ink-3)]">{existing.opmerking}</p>}
      {existing?.frictie && (
        <p className="mt-1 text-xs italic text-[var(--ink-3)]">Frictie: {existing.frictie}</p>
      )}
    </div>
  )
}

function AcceptanceCriterionCard({
  criterion,
  showWorkflow,
}: {
  criterion: AcceptanceCriterion
  showWorkflow: boolean
}) {
  return (
    <div className="space-y-2 rounded-md border border-[var(--border-ed)] bg-[var(--subtle,transparent)] p-3">
      {showWorkflow && (
        <p className="font-mono text-[11px] font-semibold text-[var(--ink-2)]">{criterion.workflow}</p>
      )}
      {criterion.persona && (
        <p className="text-[11px] text-[var(--ink-3)]">Persona: {criterion.persona}</p>
      )}
      <dl className="space-y-1.5 text-xs leading-snug">
        <div>
          <dt className="font-semibold text-[var(--ink-2)]">Gegeven</dt>
          <dd className="text-[var(--ink)]">{criterion.given}</dd>
        </div>
        <div>
          <dt className="font-semibold text-[var(--ink-2)]">Wanneer</dt>
          <dd className="text-[var(--ink)]">{criterion.when}</dd>
        </div>
        <div>
          <dt className="font-semibold text-[var(--ink-2)]">Dan</dt>
          <dd className="text-[var(--ink)]">{criterion.then}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--border-ed)] pt-2">
        <MetaChip>{ASSERTION_KIND_LABEL[criterion.assertion.kind]}</MetaChip>
      </div>
      {criterion.assertion.expected !== undefined && (
        <p className="font-mono text-sm font-semibold leading-snug text-[var(--ink)]">
          {criterion.assertion.expected}
        </p>
      )}
      {criterion.assertion.source && (
        <p className="font-mono text-[11px] leading-snug text-[var(--ink-3)]">{criterion.assertion.source}</p>
      )}
    </div>
  )
}
