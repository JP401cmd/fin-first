import type { Metadata } from 'next'
import archData from '@/docs/architecture/architecture.json'
import { selectClaudeTeam } from '@/lib/architecture/facts'
import { buildDevelopmentModel } from '@/lib/architecture/development-model'
import { DevelopmentShell } from './development-shell'

// De feiten (agents + skills + pijplijn-stappen) komen uit de gegenereerde
// snapshot docs/architecture/architecture.json onder de sleutel `claudeTeam` —
// ververst via `npm run arch:diagram`. De betekenis (groepen, rollen,
// inzetmomenten, taglines) is gecureerd in lib/architecture/development-model.ts.

export const metadata: Metadata = { title: 'Development — Beheer' }

export default function DevelopmentPage() {
  const facts = selectClaudeTeam(archData)
  const model = buildDevelopmentModel(facts)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--ink)]">Development</h1>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          Het agent-team en de skill-pijplijnen waarmee TriFinity gebouwd wordt — gescand uit{' '}
          <code className="font-mono text-[12px] text-[var(--ink-2)]">.claude/</code>, betekenis gecureerd.
        </p>
      </div>

      <DevelopmentShell model={model} />
    </div>
  )
}
