import type { Metadata } from 'next'
import archData from '@/docs/architecture/architecture.json'
import { buildArchimateModel, type ArchFacts } from '@/lib/architecture/archimate-model'
import { selectInsights } from '@/lib/architecture/facts'
import { ArchitectuurShell } from './architectuur-shell'
import type { ArchDiff } from './architectuur-client'

// De feiten (tellingen, relaties, diff) komen uit de gegenereerde snapshot
// docs/architecture/architecture.json — ververst via `npm run arch:diagram`.
// De gecureerde topologie/curatie staat in lib/architecture/*.

export const metadata: Metadata = { title: 'Architectuur — Beheer' }

export default function ArchitectuurPage() {
  const facts: ArchFacts = {
    version: archData.repo.version,
    generatedDate: archData.generatedDate,
    stats: {
      api: archData.stats.api,
      components: archData.stats.components,
      providers: archData.stats.providers,
      tables: archData.stats.tables,
      migrations: archData.stats.migrations,
    },
  }
  const model = buildArchimateModel(facts)
  const insights = selectInsights(archData)
  const diff = (archData.diff ?? null) as unknown as ArchDiff | null

  return (
    <div className="space-y-6">
      <ArchitectuurShell
        model={model}
        insights={insights}
        diff={diff}
        generatedDate={facts.generatedDate}
        version={facts.version}
      />
    </div>
  )
}
