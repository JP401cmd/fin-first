'use client'

// Agents-view ("Ons team"): de gespecialiseerde subagents, gegroepeerd per
// team. Per agent een kaart met rol, inzetmoment, optioneel model-badge en een
// kleur-accent uit de frontmatter. Read-only naslag. `ungrouped` hoort leeg te
// zijn; als 'ie toch gevuld is, tonen we dat onderaan als waarschuwing.

import { Kicker } from '@/components/editorial'
import type { DevelopmentAgent, DevelopmentModel } from '@/lib/architecture/development-model'
import { agentAccent } from './agent-color'

type GroupWithAgents = DevelopmentModel['groups'][number]

interface Props {
  groups: GroupWithAgents[]
  ungrouped: DevelopmentAgent[]
}

export function AgentsView({ groups, ungrouped }: Props) {
  const filledGroups = groups.filter((g) => g.agents.length > 0)

  if (filledGroups.length === 0 && ungrouped.length === 0) {
    return <EmptyState />
  }

  return (
    <div className="space-y-8">
      {filledGroups.map((group) => (
        <section key={group.id} className="space-y-4">
          <header className="border-b border-[var(--border-ed)] pb-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 className="text-[15px] font-bold text-[var(--ink)]">{group.label}</h2>
              <span className="font-mono text-[11px] tabular-nums text-[var(--ink-3)]">
                {group.agents.length} {group.agents.length === 1 ? 'agent' : 'agents'}
              </span>
            </div>
            <p className="mt-1 max-w-[70ch] text-[13px] italic text-[var(--ink-3)]">
              {group.description}
            </p>
          </header>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        </section>
      ))}

      {ungrouped.length > 0 && (
        <section className="space-y-4">
          <header className="border-b border-[var(--negative)] pb-2">
            <h2 className="text-[15px] font-bold text-[var(--negative)]">Nog niet ingedeeld</h2>
            <p className="mt-1 text-[13px] italic text-[var(--ink-3)]">
              Deze agents staan op schijf maar missen curatie — vul ze aan in{' '}
              <code className="font-mono text-[12px] text-[var(--ink-2)]">development-model.ts</code>.
            </p>
          </header>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ungrouped.map((agent) => (
              <AgentCard key={agent.id} agent={agent} warn />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function AgentCard({ agent, warn = false }: { agent: DevelopmentAgent; warn?: boolean }) {
  const accent = warn ? 'var(--negative)' : agentAccent(agent.color)
  return (
    <article
      className="flex border border-[var(--border-ed)] bg-[var(--paper)]"
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <div className="min-w-0 flex-1 p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="truncate font-mono text-[14px] font-bold text-[var(--ink)]" title={agent.name}>
            {agent.name}
          </h3>
          {agent.model && (
            <span className="shrink-0 border border-[var(--border-ed)] bg-[var(--subtle)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
              {agent.model}
            </span>
          )}
        </div>
        <p className="text-[13px] leading-snug text-[var(--ink-2)]">{agent.rol}</p>
        <p className="mt-2 text-[12px] leading-snug text-[var(--ink-3)]">
          <span className="font-semibold text-[var(--ink-2)]">Inzet:</span> {agent.inzet}
        </p>
      </div>
    </article>
  )
}

function EmptyState() {
  return (
    <div className="border border-dashed border-[var(--border-ed)] bg-[var(--paper)] p-8 text-center">
      <Kicker className="justify-center">Leeg</Kicker>
      <p className="mt-3 text-[14px] text-[var(--ink-2)]">
        Geen agents gevonden — draai{' '}
        <code className="font-mono text-[13px] text-[var(--ink)]">npm run arch:diagram</code>.
      </p>
    </div>
  )
}
