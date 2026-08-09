/**
 * MIJN-4 — de zeven AI-uitvoeringsgroepen op /mijn/privacy staan in Eenvoudig
 * standaard ingeklapt achter één samenvattende regel; in Volledig staan ze open
 * met hun eigen kop. Bewust inklappen-met-behoud (`DepthSection`) en geen
 * hard-hide: dit is de enige plek waar je per functionaliteit kiest waar je
 * gegevens heen gaan.
 *
 * Bron: docs/eenvoudige-weergave-audit.md §7 (/mijn).
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { AiExecutionSettings } from './local-categorization-settings'
import { DisplayModeProvider, type DisplayMode } from '@/lib/hooks/use-display-mode'
import { AI_EXECUTION_GROUPS } from '@/lib/ai/execution-groups'

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { ai_enabled: true, privacy_mode: false, active_subscriptions: [] },
          }),
        }),
      }),
    }),
  }),
}))

// De lokale-AI-primitieven raken WebGPU/IndexedDB — niet relevant voor de
// inklap-vraag, dus deterministisch weggemockt.
vi.mock('@/lib/ai/local/webgpu-capability', () => ({
  checkLocalAiCapability: async () => ({ ok: false, reasons: ['test'] }),
}))
vi.mock('@/lib/ai/local/model-manager', () => ({
  getLocalModelState: async () => ({ state: 'afwezig', bytes: null }),
  downloadLocalModel: async () => {},
  deleteLocalModel: async () => {},
  proveLocalModel: async () => ({ ok: false, reasons: [], results: [] }),
  selectLocalModel: async () => {},
}))

beforeEach(() => {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.startsWith('/api/ai-execution-prefs')) {
      return {
        ok: true,
        json: async () => ({
          privacyMode: false,
          prefs: {},
          modes: Object.fromEntries(AI_EXECUTION_GROUPS.map((g) => [g.id, 'cloud'])),
        }),
      }
    }
    return { ok: true, json: async () => ({}) }
  }) as unknown as typeof fetch
})

function renderSettings(mode: DisplayMode) {
  return render(
    <DisplayModeProvider initialMode={mode}>
      <AiExecutionSettings />
    </DisplayModeProvider>,
  )
}

describe('AiExecutionSettings — groepenlijst in Eenvoudig (MIJN-4)', () => {
  afterEach(cleanup)

  it("zet de groepen in 'simple' ingeklapt achter één regel", async () => {
    renderSettings('simple')
    const section = await screen.findByTestId('depth-section')
    expect(section.getAttribute('data-collapsed')).toBe('true')
    expect(screen.getByTestId('depth-section-title').textContent).toBe(
      'Liever per onderdeel kiezen?',
    )
    // Inklappen-met-behoud: de groepen staan er nog, één klik ver weg.
    await waitFor(() => {
      expect(screen.getByText(AI_EXECUTION_GROUPS[0].label)).toBeInTheDocument()
    })
    // Geen dubbele kop: de eigen kicker/kop van de lijst is onderdrukt.
    expect(screen.queryByText('Per functionaliteit')).toBeNull()
  })

  it("laat de groepen in 'full' open staan met hun eigen kop", async () => {
    renderSettings('full')
    await waitFor(() => {
      expect(screen.getByText('Per functionaliteit')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('depth-section')).toBeNull()
  })
})
