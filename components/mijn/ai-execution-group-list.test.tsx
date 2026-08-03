import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AiExecutionGroupList } from './ai-execution-group-list'
import { AI_EXECUTION_GROUPS, type AiExecutionGroup, type AiExecutionMode } from '@/lib/ai/execution-groups'

/**
 * Tests voor de per-functionaliteit-lijst op /mijn/privacy.
 *
 * De lijst is het oppervlak waar de belofte "kan iets lokaal niet, dan wordt het
 * geblokkeerd — niet stilzwijgend via de cloud" zichtbaar moet zijn. Vandaar dat
 * hier niet alleen het happy-path-klikgedrag staat, maar ook:
 *  - de beperkingen van een 'gedeeltelijk'-groep zichtbaar ZONDER uitklappen
 *    zodra die groep daadwerkelijk lokaal draait,
 *  - de uitleg-regel bij Nieuws (centrale ingest is geen schakelaar).
 *
 * Alle data loopt via /api/ai-execution-prefs (GET + POST) — geen supabase-client
 * in dit component, conform de datapad-conventie (ADR 0058).
 */

const ALL_CLOUD: Record<AiExecutionGroup, AiExecutionMode> = {
  gesprek: 'cloud',
  transacties: 'cloud',
  briefing: 'cloud',
  tips: 'cloud',
  rapporten: 'cloud',
  documenten: 'cloud',
  nieuws: 'cloud',
}

let getResponse: {
  privacyMode: boolean
  prefs: Partial<Record<AiExecutionGroup, AiExecutionMode>>
  modes: Record<AiExecutionGroup, AiExecutionMode>
}
let fetchMock: ReturnType<typeof vi.fn>

/** De body van de laatste POST naar /api/ai-execution-prefs, geparsed. */
function lastPostBody(): unknown {
  const posts = fetchMock.mock.calls.filter(
    (call) => call[0] === '/api/ai-execution-prefs' && call[1]?.method === 'POST',
  )
  const last = posts[posts.length - 1]
  return last ? JSON.parse(last[1].body as string) : null
}

beforeEach(() => {
  getResponse = { privacyMode: false, prefs: {}, modes: { ...ALL_CLOUD } }
  fetchMock = vi.fn().mockImplementation(async (url: unknown, init?: { method?: string; body?: string }) => {
    if (init?.method === 'POST') {
      const { group, mode } = JSON.parse(init.body ?? '{}') as {
        group: AiExecutionGroup
        mode: AiExecutionMode | null
      }
      const prefs = { ...getResponse.prefs }
      if (mode === null) delete prefs[group]
      else prefs[group] = mode
      const modes = { ...getResponse.modes, [group]: mode ?? (getResponse.privacyMode ? 'lokaal' : 'cloud') }
      getResponse = { ...getResponse, prefs, modes }
      return { ok: true, json: async () => ({ ok: true, prefs, modes }) }
    }
    return { ok: true, json: async () => getResponse }
  })
  vi.stubGlobal('fetch', fetchMock)
})

/** Klapt een groep open via zijn rij-knop. */
async function openGroup(label: string): Promise<void> {
  const header = await screen.findByRole('button', { name: new RegExp(label, 'i') })
  fireEvent.click(header)
  await waitFor(() => expect(header.getAttribute('aria-expanded')).toBe('true'))
}

describe('AiExecutionGroupList', () => {
  it('toont alle zeven groepen uit de registry', async () => {
    render(<AiExecutionGroupList privacyMode={false} canChooseLocal />)
    for (const group of AI_EXECUTION_GROUPS) {
      expect(await screen.findByRole('button', { name: new RegExp(group.label, 'i') })).toBeTruthy()
    }
  })

  it('toont de opgeslagen override als eigen keuze, met de opgeloste modus erbij', async () => {
    // Hoofdschakelaar staat op cloud, maar 'tips' is expliciet op lokaal gezet.
    getResponse = {
      privacyMode: false,
      prefs: { tips: 'lokaal' },
      modes: { ...ALL_CLOUD, tips: 'lokaal' },
    }

    render(<AiExecutionGroupList privacyMode={false} canChooseLocal />)

    const tipsHeader = await screen.findByRole('button', { name: /Tips & scenario's/i })
    // De chip in de rij toont de opgeloste modus.
    await waitFor(() => expect(tipsHeader.textContent).toContain('Lokaal'))
    // De overige groepen volgen de hoofdkeuze.
    const gesprekHeader = screen.getByRole('button', { name: /Gesprek met Fin/i })
    expect(gesprekHeader.textContent).toContain('Cloud')

    // Uitgeklapt is de override herkenbaar én terug te draaien.
    await openGroup("Tips & scenario's")
    expect(screen.getByRole('button', { name: /volg weer de hoofdkeuze/i })).toBeTruthy()
    // Groepen zonder override tonen die knop niet.
    await openGroup('Gesprek met Fin')
    expect(screen.queryByRole('button', { name: /volg weer de hoofdkeuze/i })).toBeNull()
  })

  it('klik op "Lokaal op je apparaat" post de juiste body', async () => {
    render(<AiExecutionGroupList privacyMode={false} canChooseLocal />)
    await openGroup('Gesprek met Fin')

    const lokaalBtn = screen.getByRole('radio', { name: /Lokaal op je apparaat/i })
    expect(lokaalBtn.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(lokaalBtn)

    await waitFor(() => expect(lastPostBody()).toEqual({ group: 'gesprek', mode: 'lokaal' }))
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: /Lokaal op je apparaat/i }).getAttribute('aria-checked')).toBe(
        'true',
      ),
    )
  })

  it('klik op "Cloud-AI" post de juiste body', async () => {
    getResponse = {
      privacyMode: true,
      prefs: {},
      modes: Object.fromEntries(
        AI_EXECUTION_GROUPS.map((g) => [g.id, 'lokaal']),
      ) as Record<AiExecutionGroup, AiExecutionMode>,
    }

    render(<AiExecutionGroupList privacyMode canChooseLocal />)
    await openGroup('Dagelijkse briefing')

    fireEvent.click(screen.getByRole('radio', { name: /^Cloud-AI$/i }))
    await waitFor(() => expect(lastPostBody()).toEqual({ group: 'briefing', mode: 'cloud' }))
  })

  it('"volg weer de hoofdkeuze" wist de override met mode null', async () => {
    getResponse = {
      privacyMode: false,
      prefs: { documenten: 'lokaal' },
      modes: { ...ALL_CLOUD, documenten: 'lokaal' },
    }

    render(<AiExecutionGroupList privacyMode={false} canChooseLocal />)
    await openGroup('Documenten lezen')

    fireEvent.click(screen.getByRole('button', { name: /volg weer de hoofdkeuze/i }))
    await waitFor(() => expect(lastPostBody()).toEqual({ group: 'documenten', mode: null }))
  })

  it('beperkingen staan zichtbaar zónder uitklappen zodra de groep lokaal draait', async () => {
    getResponse = {
      privacyMode: true,
      prefs: {},
      modes: { ...ALL_CLOUD, rapporten: 'lokaal' },
    }

    render(<AiExecutionGroupList privacyMode canChooseLocal />)

    // Ingeklapt — en tóch leesbaar wat je inlevert.
    expect(await screen.findByText(/Wat je hierbij inlevert/i)).toBeTruthy()
    expect(
      screen.getByText(/Een rekenhulp wordt een eenvoudigere versie: één scenario, minder invoervelden\./i),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /Rapporten & rekenhulpen/i }).getAttribute('aria-expanded'),
    ).toBe('false')
  })

  it('een volledig-lokale groep toont geen inlever-blok', async () => {
    getResponse = { privacyMode: true, prefs: {}, modes: { ...ALL_CLOUD, briefing: 'lokaal' } }

    render(<AiExecutionGroupList privacyMode canChooseLocal />)
    await screen.findByRole('button', { name: /Dagelijkse briefing/i })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Dagelijkse briefing/i }).textContent).toContain('Lokaal'),
    )
    expect(screen.queryByText(/Wat je hierbij inlevert/i)).toBeNull()
  })

  it('nieuws-ingest is geen schakelaar maar wordt wel benoemd', async () => {
    render(<AiExecutionGroupList privacyMode={false} canChooseLocal />)
    expect(
      await screen.findByText(/Het verzamelen van nieuwsbronnen gebeurt centraal/i),
    ).toBeTruthy()
  })

  it('zonder mogelijkheid tot lokaal: de lokaal-knop is uitgeschakeld en de reden staat erbij', async () => {
    render(
      <AiExecutionGroupList
        privacyMode={false}
        canChooseLocal={false}
        localBlockedReason="Lokaal draaien hoort bij het AI-abonnement."
      />,
    )

    expect(await screen.findByText(/Lokaal draaien hoort bij het AI-abonnement\./i)).toBeTruthy()
    await openGroup('Gesprek met Fin')
    expect(screen.getByRole('radio', { name: /Lokaal op je apparaat/i })).toBeDisabled()
    expect(screen.getByRole('radio', { name: /^Cloud-AI$/i })).not.toBeDisabled()
  })

  it('mislukte GET: eerlijke foutmelding in plaats van een stille lege lijst', async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, json: async () => ({}) }))
    render(<AiExecutionGroupList privacyMode={false} canChooseLocal />)
    expect(await screen.findByRole('alert')).toBeTruthy()
  })
})
