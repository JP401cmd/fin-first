'use client'

// Skills-view: de pijplijn-visualisatie van het development-team. Pijplijnen
// prominent (verticale genummerde keten met agent-chips per stap), tooling
// compacter eronder, ongecategoriseerd neutraal. Read-only naslag.

import { Kicker } from '@/components/editorial'
import type { DevelopmentSkill, SkillKind } from '@/lib/architecture/development-model'
import { agentAccent } from './agent-color'

// De stappen van een DevelopmentSkill zijn verrijkt met `agentRefs`; de
// intersectie-typing collapsed dat in een .map(), dus pakken we het
// element-type expliciet uit het model.
type EnrichedStep = DevelopmentSkill['steps'][number]

const KIND_LABEL: Record<SkillKind, string> = {
  pijplijn: 'Pijplijn',
  tooling: 'Tooling',
  ongecategoriseerd: 'Ongecategoriseerd',
}

interface Props {
  skills: DevelopmentSkill[]
  /** Per agent-id de frontmatter-kleur, voor het accent-streepje op de chips. */
  agentColors: Record<string, string | undefined>
}

export function SkillsView({ skills, agentColors }: Props) {
  if (skills.length === 0) {
    return <EmptyState />
  }

  const pijplijnen = skills.filter((s) => s.kind === 'pijplijn')
  const tooling = skills.filter((s) => s.kind === 'tooling')
  const overig = skills.filter((s) => s.kind === 'ongecategoriseerd')

  return (
    <div className="space-y-8">
      {pijplijnen.length > 0 && (
        <section className="space-y-4">
          <SectionHeader label="Pijplijnen" hint="Zetten het team in volgorde in." />
          <div className="grid gap-4 lg:grid-cols-2">
            {pijplijnen.map((s) => (
              <PijplijnCard key={s.id} skill={s} agentColors={agentColors} />
            ))}
          </div>
        </section>
      )}

      {tooling.length > 0 && (
        <section className="space-y-4">
          <SectionHeader label="Tooling" hint="Losse gereedschappen, geen vaste keten." />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tooling.map((s) => (
              <ToolingCard key={s.id} skill={s} />
            ))}
          </div>
        </section>
      )}

      {overig.length > 0 && (
        <section className="space-y-4">
          <SectionHeader label="Ongecategoriseerd" hint="Nog niet ingedeeld in de curatie." />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {overig.map((s) => (
              <ToolingCard key={s.id} skill={s} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function SectionHeader({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-[var(--border-ed)] pb-2">
      <h2 className="text-[15px] font-bold text-[var(--ink)]">{label}</h2>
      <span className="text-[13px] italic text-[var(--ink-3)]">{hint}</span>
    </div>
  )
}

function KindBadge({ kind }: { kind: SkillKind }) {
  return (
    <span className="inline-flex items-center border border-[var(--border-ed)] bg-[var(--subtle)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
      {KIND_LABEL[kind]}
    </span>
  )
}

function PijplijnCard({
  skill,
  agentColors,
}: {
  skill: DevelopmentSkill
  agentColors: Record<string, string | undefined>
}) {
  return (
    <article className="border border-[var(--border-ed)] bg-[var(--paper)] p-5">
      <header className="mb-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="font-mono text-[15px] font-bold text-[var(--ink)]">{skill.name}</h3>
          <KindBadge kind={skill.kind} />
        </div>
        <p className="text-[13px] leading-snug text-[var(--ink-2)]">{skill.tagline}</p>
      </header>

      {skill.steps.length > 0 ? (
        <ol className="relative mt-4 space-y-3">
          {skill.steps.map((step: EnrichedStep, idx) => (
            <li key={step.index} className="relative flex gap-3 pb-3 last:pb-0">
              {/* Verbindingslijn tussen de stappen (niet onder de laatste). */}
              {idx < skill.steps.length - 1 && (
                <span
                  aria-hidden
                  className="absolute left-[13px] top-7 bottom-[-12px] w-px bg-[var(--rule-soft)]"
                />
              )}
              <span className="z-10 flex h-7 w-7 shrink-0 items-center justify-center border border-[var(--ink)] bg-[var(--paper)] font-mono text-[12px] font-bold tabular-nums text-[var(--ink)]">
                {step.index}
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-[13px] font-semibold text-[var(--ink)]">{step.title}</p>
                {step.agentRefs.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {step.agentRefs.map((ref) => (
                      <AgentChip
                        key={ref.id}
                        id={ref.id}
                        exists={ref.exists}
                        color={agentColors[ref.id]}
                      />
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-[12px] italic text-[var(--ink-3)]">Geen stappen gescand.</p>
      )}
    </article>
  )
}

function AgentChip({ id, exists, color }: { id: string; exists: boolean; color?: string }) {
  if (!exists) {
    return (
      <span
        title="agent niet gevonden — curatie of scan loopt achter"
        className="inline-flex items-center gap-1.5 border border-dashed border-[var(--negative)] bg-[var(--paper)] px-2 py-0.5 font-mono text-[11px] text-[var(--negative)]"
      >
        <span aria-hidden className="inline-block h-2.5 w-0.5 shrink-0 bg-[var(--negative)]" />
        {id}
        <span aria-hidden>!</span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-0.5 font-mono text-[11px] text-[var(--ink-2)]">
      <span aria-hidden className="inline-block h-2.5 w-0.5 shrink-0" style={{ background: agentAccent(color) }} />
      {id}
    </span>
  )
}

function ToolingCard({ skill }: { skill: DevelopmentSkill }) {
  return (
    <article className="border border-[var(--border-ed)] bg-[var(--paper)] p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="font-mono text-[14px] font-bold text-[var(--ink)]">{skill.name}</h3>
        <KindBadge kind={skill.kind} />
      </div>
      <p className="text-[13px] leading-snug text-[var(--ink-2)]">{skill.tagline}</p>
    </article>
  )
}

function EmptyState() {
  return (
    <div className="border border-dashed border-[var(--border-ed)] bg-[var(--paper)] p-8 text-center">
      <Kicker className="justify-center">Leeg</Kicker>
      <p className="mt-3 text-[14px] text-[var(--ink-2)]">
        Geen skills gevonden — draai{' '}
        <code className="font-mono text-[13px] text-[var(--ink)]">npm run arch:diagram</code>.
      </p>
    </div>
  )
}
