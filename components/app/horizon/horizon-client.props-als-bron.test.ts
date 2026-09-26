/**
 * Bron-grendel: de sim-invoer van /toekomst komt uit `useHorizonBron(initialData)`
 * (ADR 0179 fase 1 stap 3). Het gedrag zelf (nieuwe bundel → nieuwe invoer,
 * gelijke bundel → zelfde referenties, events-resync) bewijst
 * `lib/hooks/use-horizon-bron.test.tsx`. Deze test pint dat de horizon-client die
 * hook ook echt gebruikt, en dat de oude bevroren seeds en de client-herlading
 * niet terugkomen.
 *
 * WAAROM EEN BRON-TEST: `horizon-client.tsx` hangt aan de volledige kernel-bundel;
 * renderen in vitest is niet realistisch. Verhuist de sim naar de provider (fase 1
 * stap 13), dan verhuist `SOURCE_PATH` mee.
 */
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { readSourceLF } from '@/lib/test-utils/read-source'
import { leesToekomstAlles } from '@/lib/test-utils/toekomst-bronnen'

/**
 * Sinds ADR 0179 fase 1 stap 13 leest de sim-hook van de state-provider de bundel
 * (`use-toekomst-sim.ts`). De "geen bevroren useState"-toets geldt voor álle
 * /toekomst-bronnen: de host en elke state-hook.
 */
const SOURCE_PATH = join(process.cwd(), 'components', 'toekomst', 'state', 'use-toekomst-sim.ts')
const source = readSourceLF(SOURCE_PATH)
const alles = leesToekomstAlles()

/** De velden die de hook levert en die `useHorizonFireSim` (mede) voeden. */
const BRON_VELDEN = [
  'input',
  'fireParams',
  'withdrawalStrategyConfig',
  'fireStrategy',
  'kernelRawProfile',
  'aowRows',
  'userAowAge',
  'debts',
  'events',
] as const

describe('horizon-client — props-als-bron (ADR 0179 fase 1 stap 3)', () => {
  it('haalt de sim-invoer uit useHorizonBron(initialData)', () => {
    const match = source.match(/const \{([^}]*)\} = useHorizonBron\(initialData\)/)
    expect(match, 'useHorizonBron(initialData)-destructuring niet gevonden').not.toBeNull()
    const velden = match![1].split(',').map((v) => v.trim()).filter(Boolean)
    for (const veld of BRON_VELDEN) expect(velden).toContain(veld)
  })

  it('seedt geen invoer meer met een bevroren useState(initialData.x)', () => {
    for (const veld of ['effectiveInput', 'fireParams', 'withdrawalStrategy', 'fireStrategy', 'rawProfile', 'aowRows', 'debts', 'actions', 'events', 'avgIncome6m', 'avgExpenses6m', 'resilienceSnapshots']) {
      expect(alles, `useState(initialData.${veld}) is terug`).not.toMatch(
        new RegExp(`useState(<[^>]*>)?\\(\\s*(\\(\\)\\s*=>\\s*)?initialData\\??\\.${veld}\\b`),
      )
    }
  })

  it('loadData ververst de server-bundel en leest zelf niets meer', () => {
    expect(source).toMatch(/const loadData = useCallback\(\(\) => \{\n\s*startRefresh\(\(\) => router\.refresh\(\)\)\n\s*\}, \[router\]\)/)
    expect(alles).not.toMatch(/function loadKernelContext\b/)
    expect(alles).not.toMatch(/\.select\(/)
  })
})
