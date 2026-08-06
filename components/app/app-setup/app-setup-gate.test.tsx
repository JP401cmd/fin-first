/**
 * Regressietests voor `<AppSetupGateInner>` — de React #300-fix (aug 2026).
 *
 * De gate riep sectie-bodies aan als gewone functie (`section.render({...})`).
 * Secties met eigen hooks (zoals CryptoAssetSelector) hingen daardoor hun
 * hooks aan de gate-fiber, en de React Compiler memoïseerde de aanroep —
 * waarna een sectie-interne state-update de hooks oversloeg: React #300 in
 * productie, een bevroren skeleton in dev. De fix mount secties als échte
 * componenten. Deze tests pinnen de twee faalwijzen vast:
 *
 * 1. Een sectie-interne (async) state-update moet renderen — de bevroren-
 *    skeleton-symptoom.
 * 2. Sectie-interne state moet een parent-re-render overleven zónder remount
 *    — de valkuil van een instabiele component-referentie (inline arrow in
 *    de config zou de sectie elke render remounten en zijn state wissen).
 *
 * NB: de compiler draait niet onder vitest, dus het exacte #300-pad is hier
 * niet reproduceerbaar; het element-mount-contract dat deze tests afdwingen
 * is de eigenschap die dat pad onmogelijk maakt.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useEffect, useState } from 'react'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { AppSetupGateInner } from './app-setup-gate'
import type { AppSetupConfig, AppSetupSectionRenderProps } from './types'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/core/assets/crypto',
  useSearchParams: () => new URLSearchParams(),
}))

// ── Synthetische secties (module-level, zoals de echte configs) ──

interface TestState {
  choice: string | null
}

/** Telt mounts — een remount door instabiele component-identiteit maakt dit >1. */
let asyncSectionMounts = 0

/**
 * Spiegel van CryptoAssetSelector: eigen state die pas ná mount asynchroon
 * gevuld wordt. Vóór de fix bleef dit in dev eeuwig op "sectie-laadt…"
 * hangen zodra de gate-render gememoïseerd werd.
 */
function AsyncRowsSection(_props: AppSetupSectionRenderProps<TestState>) {
  const [rows, setRows] = useState<string[] | null>(null)
  const [localCount, setLocalCount] = useState(0)
  useEffect(() => {
    asyncSectionMounts += 1
    let aborted = false
    void Promise.resolve(['rij-één', 'rij-twee']).then((data) => {
      if (!aborted) setRows(data)
    })
    return () => {
      aborted = true
    }
  }, [])

  if (rows === null) return <p>sectie-laadt…</p>
  return (
    <div>
      <p>{rows.join(' + ')}</p>
      <button type="button" onClick={() => setLocalCount((c) => c + 1)}>
        lokaal verhogen
      </button>
      <p>lokaal: {localCount}</p>
    </div>
  )
}

/** Sectie die via setState een parent-re-render van de gate veroorzaakt. */
function ChoiceSection({ state, setState }: AppSetupSectionRenderProps<TestState>) {
  return (
    <button
      type="button"
      onClick={() => setState((prev) => ({ ...prev, choice: 'gekozen' }))}
    >
      kies optie ({state.choice ?? 'geen'})
    </button>
  )
}

const TEST_CONFIG: AppSetupConfig<TestState> = {
  appKey: 'crypto_holdings',
  featureSlug: 'test_setup_completed',
  kicker: 'Testsetup',
  title: 'Synthetische gate',
  intro: 'Alleen voor de regressietest.',
  initialState: () => ({ choice: null }),
  sections: [
    { id: 'async', kicker: '1', title: 'Async sectie', render: AsyncRowsSection },
    { id: 'choice', kicker: '2', title: 'Keuze sectie', render: ChoiceSection },
  ],
  validate: () => ({ ok: false, reason: 'test blijft onvoltooid' }),
  endpoint: '/api/never-called',
  buildPayload: (state) => state,
}

beforeEach(() => {
  asyncSectionMounts = 0
})

afterEach(() => {
  cleanup()
})

// ── Tests ────────────────────────────────────────────────────

describe('AppSetupGateInner — secties als echte componenten (React #300-regressie)', () => {
  it('rendert een sectie-interne async state-update (geen bevroren skeleton)', async () => {
    render(<AppSetupGateInner config={TEST_CONFIG} />)
    expect(screen.getByText('sectie-laadt…')).toBeTruthy()

    await waitFor(() => expect(screen.getByText('rij-één + rij-twee')).toBeTruthy())
  })

  it('behoudt sectie-interne state over een parent-re-render, zonder remount', async () => {
    render(<AppSetupGateInner config={TEST_CONFIG} />)
    await waitFor(() => expect(screen.getByText('rij-één + rij-twee')).toBeTruthy())

    // Sectie-interne state opbouwen…
    fireEvent.click(screen.getByRole('button', { name: 'lokaal verhogen' }))
    expect(screen.getByText('lokaal: 1')).toBeTruthy()

    // …dan een parent-re-render forceren via de form-state van de gate…
    fireEvent.click(screen.getByRole('button', { name: /kies optie/ }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'kies optie (gekozen)' })).toBeTruthy(),
    )

    // …en de sectie moet zijn eigen state en fiber behouden hebben.
    expect(screen.getByText('lokaal: 1')).toBeTruthy()
    expect(asyncSectionMounts).toBe(1)
  })
})
