'use client'

// Top-orchestrator: schakelt tussen drie áfzonderlijke views — de ArchiMate-
// plaat, de database-ERD en de berekeningen-catalogus. De keuze wordt in de
// URL (?view=) bewaard zodat een view deelbaar is. Een klik op "→ plaat" in de
// berekeningen zet de element-hash en schakelt naar de plaat; die mount vers en
// leest de hash, zodat het element meteen geselecteerd opent.

import { useCallback, useEffect, useState } from 'react'
import { GitBranch, Database, Calculator, Map } from 'lucide-react'
import type { ArchimateModel } from '@/lib/architecture/archimate-model'
import type { ArchInsights } from '@/lib/architecture/facts'
import { ArchitectuurClient, type ArchDiff } from './architectuur-client'
import { ArchimateDatabaseView } from './archimate-database-view'
import { ArchimateCalculationsView } from './archimate-calculations-view'
import { ArchimateHldView } from './archimate-hld-view'

type View = 'plaat' | 'database' | 'berekeningen' | 'praatplaat'

const VIEWS: Array<{ id: View; label: string; icon: typeof GitBranch }> = [
  { id: 'praatplaat', label: 'Praatplaat', icon: Map },
  { id: 'plaat', label: 'Plaat', icon: GitBranch },
  { id: 'database', label: 'Database', icon: Database },
  { id: 'berekeningen', label: 'Berekeningen', icon: Calculator },
]

function isView(v: string | null): v is View {
  return v === 'plaat' || v === 'database' || v === 'berekeningen' || v === 'praatplaat'
}

interface Props {
  model: ArchimateModel
  insights: ArchInsights
  diff: ArchDiff | null
  generatedDate: string
  version: string
}

export function ArchitectuurShell({ model, insights, diff, generatedDate, version }: Props) {
  const [view, setView] = useState<View>('plaat')

  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get('view')
    if (isView(v)) setView(v)
  }, [])

  const switchView = useCallback((next: View) => {
    setView(next)
    const url = new URL(window.location.href)
    if (next === 'plaat') url.searchParams.delete('view')
    else url.searchParams.set('view', next)
    // hash wissen bij vrije view-wissel (behalve bij gerichte open-element)
    window.history.replaceState(null, '', url.toString())
  }, [])

  const openElement = useCallback(
    (id: string) => {
      const url = new URL(window.location.href)
      url.searchParams.delete('view')
      url.hash = id
      window.history.replaceState(null, '', url.toString())
      setView('plaat')
    },
    [],
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Architectuur-weergave">
        {VIEWS.map((v) => {
          const Icon = v.icon
          const active = view === v.id
          return (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => switchView(v.id)}
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

      {view === 'praatplaat' && <ArchimateHldView />}
      {view === 'plaat' && (
        <ArchitectuurClient model={model} insights={insights} diff={diff} generatedDate={generatedDate} />
      )}
      {view === 'database' && <ArchimateDatabaseView insights={insights} />}
      {view === 'berekeningen' && (
        <ArchimateCalculationsView model={model} insights={insights} onOpenElement={openElement} />
      )}

      <footer className="cursor-default select-none pt-2 text-center font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">
        TriFinity ✦ Beheer ✦ fin@{version} · snapshot {generatedDate}
      </footer>
    </div>
  )
}
