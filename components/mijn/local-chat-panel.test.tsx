/**
 * Component test for LocalChatPanel — de ON-DEVICE Fin-chat (fase C1b).
 *
 * Verifieert:
 *  1. Gated state: model niet op dit toestel → "nog niet klaar"-melding + link
 *     naar Mijn → Privacy, en GEEN chat-invoer.
 *  2. Ready + versturen: bij een klaar model bouwt de panel een systeemprompt
 *     (met FINANCIEEL OVERZICHT), start de gemockte lokale sessie en toont de
 *     gestreamde deltas + het eigen bericht.
 *
 * De lokale runtime + capability/model-checks zijn gemockt — er draait geen
 * echte WASM/WebGPU en er gaat niets naar een server.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LocalChatPanel } from './local-chat-panel'
import type { LocalChatOverview } from '@/lib/ai/local/local-chat-context'

const { sendSpy, createChatSessionSpy, capSpy, modelSpy } = vi.hoisted(() => {
  const sendSpy = vi.fn(async (_text: string, onDelta: (d: string) => void) => {
    onDelta('Hallo ')
    onDelta('wereld')
    return 'Hallo wereld'
  })
  const createChatSessionSpy = vi.fn(async (systemPrompt: string) => {
    void systemPrompt // param behouden zodat calls[0][0] getypeerd blijft
    return { send: sendSpy, dispose: vi.fn() }
  })
  return { sendSpy, createChatSessionSpy, capSpy: vi.fn(), modelSpy: vi.fn() }
})

vi.mock('@/lib/ai/local/litert-runtime', () => ({ createChatSession: createChatSessionSpy }))
vi.mock('@/lib/ai/local/webgpu-capability', () => ({ checkLocalAiCapability: capSpy }))
vi.mock('@/lib/ai/local/model-manager', () => ({ getLocalModelState: modelSpy }))

const OVERVIEW: LocalChatOverview = {
  hasData: true,
  nettoVermogen: 85000,
  vrijheidstijd: '2 jaar en 9 maanden',
  fireDoel: 600000,
  vrijheidsPct: 14,
  maandinkomen: 3400,
  maanduitgaven: 2550,
  spaarquotePct: 25,
  dagtarief: 85,
  swrPct: 3.4,
  noodbuffer: { bedrag: 7500, maanden: 2.9 },
}

const CAPABLE = { ok: true, reasons: [], shaderF16: true, deviceMemoryGb: 16 }

beforeEach(() => {
  vi.clearAllMocks()
  // Kennisbank-fetch: standaard leeg (chat werkt zonder kennis).
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ items: [] }) })),
  )
})

describe('LocalChatPanel — gated state (model ontbreekt)', () => {
  it('toont "nog niet klaar" + link naar Privacy en geen invoer', async () => {
    capSpy.mockResolvedValue(CAPABLE)
    modelSpy.mockResolvedValue({ state: 'niet-gedownload', bytes: null })

    render(<LocalChatPanel overview={OVERVIEW} />)

    expect(await screen.findByText(/Nog niet klaar op dit toestel/)).toBeTruthy()
    const link = screen.getByRole('link', { name: /Naar Mijn/ })
    expect(link.getAttribute('href')).toBe('/mijn/privacy')
    // Geen chat-invoer in de gated state.
    expect(screen.queryByLabelText('Je vraag aan Fin')).toBeNull()
  })
})

describe('LocalChatPanel — ready + versturen', () => {
  it('start de lokale sessie met een overzicht-prompt en streamt het antwoord', async () => {
    capSpy.mockResolvedValue(CAPABLE)
    modelSpy.mockResolvedValue({ state: 'klaar', bytes: null })

    render(<LocalChatPanel overview={OVERVIEW} />)

    const textarea = await screen.findByLabelText('Je vraag aan Fin')
    fireEvent.change(textarea, { target: { value: 'Hoe sta ik er eigenlijk voor?' } })
    fireEvent.click(screen.getByRole('button', { name: /Verstuur/ }))

    // Het gestreamde antwoord + het eigen bericht verschijnen.
    expect(await screen.findByText('Hallo wereld')).toBeTruthy()
    expect(screen.getByText('Hoe sta ik er eigenlijk voor?')).toBeTruthy()

    await waitFor(() => expect(createChatSessionSpy).toHaveBeenCalledTimes(1))
    // De systeemprompt bevat het canonieke overzicht.
    expect(String(createChatSessionSpy.mock.calls[0][0])).toContain('FINANCIEEL OVERZICHT')
    expect(sendSpy).toHaveBeenCalledWith('Hoe sta ik er eigenlijk voor?', expect.any(Function))
  })
})
