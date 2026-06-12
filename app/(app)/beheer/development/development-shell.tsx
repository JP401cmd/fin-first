'use client'

// Top-orchestrator van de development-pagina: schakelt tussen twee views —
// de skill-pijplijnen en het agent-team ("Ons team"). De keuze staat in de URL
// (?view=skills|agents) zodat een view deelbaar is. Skills is de default; een
// ongeldige/ontbrekende waarde valt op skills terug. Patroon spiegelt
// architectuur-shell.tsx (role=tablist + aria-selected, toetsenbord-bedienbaar).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Workflow, Users } from 'lucide-react'
import type { DevelopmentModel } from '@/lib/architecture/development-model'
import { SkillsView } from './skills-view'
import { AgentsView } from './agents-view'

type View = 'skills' | 'agents'

const VIEWS: Array<{ id: View; label: string; icon: typeof Workflow }> = [
  { id: 'skills', label: 'Skills', icon: Workflow },
  { id: 'agents', label: 'Ons team', icon: Users },
]

function isView(v: string | null): v is View {
  return v === 'skills' || v === 'agents'
}

interface Props {
  model: DevelopmentModel
}

export function DevelopmentShell({ model }: Props) {
  const [view, setView] = useState<View>('skills')

  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get('view')
    if (isView(v)) setView(v)
  }, [])

  const switchView = useCallback((next: View) => {
    setView(next)
    const url = new URL(window.location.href)
    if (next === 'skills') url.searchParams.delete('view')
    else url.searchParams.set('view', next)
    window.history.replaceState(null, '', url.toString())
  }, [])

  // ARIA-tablist-patroon: roving tabindex + pijltoetsen tussen de tabs.
  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, current: View) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
      e.preventDefault()
      const idx = VIEWS.findIndex((v) => v.id === current)
      const delta = e.key === 'ArrowRight' ? 1 : -1
      const next = VIEWS[(idx + delta + VIEWS.length) % VIEWS.length].id
      switchView(next)
      document.getElementById(`dev-tab-${next}`)?.focus()
    },
    [switchView],
  )

  const { counts } = model

  // Kleur per agent-id, zodat de chips in de pijplijn-stappen het agent-accent
  // kunnen tonen (kleur nooit enige drager — naam staat er altijd bij).
  const agentColors = useMemo(() => {
    const map: Record<string, string | undefined> = {}
    for (const g of model.groups) for (const a of g.agents) map[a.id] = a.color
    for (const a of model.ungrouped) map[a.id] = a.color
    return map
  }, [model])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Development-weergave">
          {VIEWS.map((v) => {
            const Icon = v.icon
            const active = view === v.id
            return (
              <button
                key={v.id}
                type="button"
                role="tab"
                id={`dev-tab-${v.id}`}
                aria-selected={active}
                aria-controls={`dev-panel-${v.id}`}
                tabIndex={active ? 0 : -1}
                onClick={() => switchView(v.id)}
                onKeyDown={(e) => handleTabKeyDown(e, v.id)}
                className={`inline-flex items-center gap-2 border px-3.5 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                    : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-2)] hover:bg-[var(--subtle)]'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {v.label}
              </button>
            )
          })}
        </div>

        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
          <span className="tabular-nums text-[var(--ink-2)]">{counts.skills}</span> skills{' '}
          <span aria-hidden className="mx-1">·</span>{' '}
          <span className="tabular-nums text-[var(--ink-2)]">{counts.pijplijnen}</span> pijplijnen{' '}
          <span aria-hidden className="mx-1">/</span>{' '}
          <span className="tabular-nums text-[var(--ink-2)]">{counts.agents}</span> agents
        </p>
      </div>

      {view === 'skills' && (
        <div role="tabpanel" id="dev-panel-skills" aria-labelledby="dev-tab-skills">
          <SkillsView skills={model.skills} agentColors={agentColors} />
        </div>
      )}
      {view === 'agents' && (
        <div role="tabpanel" id="dev-panel-agents" aria-labelledby="dev-tab-agents">
          <AgentsView groups={model.groups} ungrouped={model.ungrouped} />
        </div>
      )}
    </div>
  )
}
