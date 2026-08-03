/**
 * Component-test voor AiVasteKostenSheet — de cloud/lokaal-naad.
 *
 * De kern die hier bewaakt wordt is FAIL-CLOSED: staat de uitvoergroep
 * 'transacties' op lokaal (of is de bestemming nog onbekend, of kan het toestel
 * het niet), dan mag er GEEN cloud-AI-aanroep vertrekken. Op het lokale pad
 * praat de sheet nog wél met de server, maar uitsluitend in `candidatesOnly`-
 * modus — die tak stopt server-side vóór `getModel`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { ExecutionModeState } from '@/lib/ai/local/use-execution-mode'
import type {
  VasteKostenCandidate,
  VasteKostenClassificatie,
  LocalVasteKostenOptions,
} from '@/lib/ai/local/local-vaste-kosten-resolver'

// ── Uitvoermodus-hook: per test in te stellen ────────────────────────────────
let execState: ExecutionModeState

vi.mock('@/lib/ai/local/use-execution-mode', () => ({
  useExecutionMode: () => execState,
}))

// ── Lokale resolver: gemockt, zodat er geen model/GPU aan te pas komt ────────
let resolverImpl: (
  candidates: VasteKostenCandidate[],
  opts: LocalVasteKostenOptions,
) => Promise<VasteKostenClassificatie[]>
const resolverFactory = vi.fn((opts?: LocalVasteKostenOptions) =>
  (candidates: VasteKostenCandidate[]) => resolverImpl(candidates, opts ?? {}),
)

vi.mock('@/lib/ai/local/local-vaste-kosten-resolver', () => ({
  createLocalVasteKostenResolver: (opts?: LocalVasteKostenOptions) => resolverFactory(opts),
}))

import { AiVasteKostenSheet } from './ai-vaste-kosten-sheet'

// ── fetch-spion ──────────────────────────────────────────────────────────────
type FetchCall = { url: string; body: unknown }
let fetchCalls: FetchCall[] = []
let candidatesResponse: VasteKostenCandidate[] = []
let cloudResponse: unknown = { suggestions: [], analysedCount: 0, skippedCount: 0 }

function mode(status: ExecutionModeState['status'], message: string | null = null): ExecutionModeState {
  return {
    status,
    message,
    intended: status === 'cloud' ? 'cloud' : status === 'resolving' ? null : 'lokaal',
    canUseCloud: status === 'cloud',
    canUseLocal: status === 'lokaal',
    refresh: () => {},
  }
}

function candidate(id: string, over: Partial<VasteKostenCandidate> = {}): VasteKostenCandidate {
  return {
    id,
    name: `Naam ${id}`,
    monthlyAmount: 12.5,
    averageAmount: 12.5,
    frequency: 'monthly',
    occurrences: 12,
    autoCategory: 'other_expense',
    autoCategoryLabel: 'Overige uitgave',
    confidence: 'high',
    ...over,
  }
}

beforeEach(() => {
  fetchCalls = []
  candidatesResponse = []
  cloudResponse = { suggestions: [], analysedCount: 0, skippedCount: 0 }
  execState = mode('cloud')
  resolverFactory.mockClear()
  resolverImpl = async () => []

  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null
    fetchCalls.push({ url: String(url), body })
    const isCandidatesOnly = (body as { candidatesOnly?: boolean } | null)?.candidatesOnly === true
    return {
      ok: true,
      status: 200,
      json: async () => (isCandidatesOnly ? { candidates: candidatesResponse } : cloudResponse),
    } as Response
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const noop = () => {}

// ── FAIL-CLOSED ──────────────────────────────────────────────────────────────

describe('AiVasteKostenSheet — fail-closed op de uitvoermodus', () => {
  it("bij 'lokaal' vertrekt er GEEN cloud-AI-fetch; alleen de candidatesOnly-databron", async () => {
    execState = mode('lokaal')
    candidatesResponse = [candidate('k-1')]
    resolverImpl = async (cands, opts) => {
      const results: VasteKostenClassificatie[] = cands.map((c) => ({
        id: c.id, klasse: 'subscription', reden: 'streamingdienst',
      }))
      opts.onChunk?.(results, results.length, results.length)
      return results
    }

    render(<AiVasteKostenSheet open onOpenChange={noop} onComplete={noop} />)

    await waitFor(() => expect(fetchCalls.length).toBe(1))
    expect(fetchCalls[0].url).toContain('/api/subscriptions/analyse-ai')
    expect(fetchCalls[0].body).toEqual({ candidatesOnly: true })
    // Het bewijs: er is geen enkele aanroep die de cloud-analyse zou starten.
    expect(fetchCalls.some((c) => (c.body as { candidatesOnly?: boolean })?.candidatesOnly !== true)).toBe(false)
    // En de classificatie liep écht via de on-device resolver.
    expect(resolverFactory).toHaveBeenCalledTimes(1)
  })

  it("bij 'resolving' (bestemming nog onbekend) vertrekt er niets", async () => {
    execState = mode('resolving')
    render(<AiVasteKostenSheet open onOpenChange={noop} onComplete={noop} />)

    await new Promise((r) => setTimeout(r, 20))
    expect(fetchCalls).toHaveLength(0)
    expect(resolverFactory).not.toHaveBeenCalled()
  })

  it("bij 'blocked' vertrekt er niets en krijgt de gebruiker de concrete reden te zien", async () => {
    execState = mode('blocked', 'Je browser ondersteunt WebGPU niet.')
    render(<AiVasteKostenSheet open onOpenChange={noop} onComplete={noop} />)

    await screen.findByText('Je browser ondersteunt WebGPU niet.')
    expect(fetchCalls).toHaveLength(0)
    expect(resolverFactory).not.toHaveBeenCalled()
    // Geen "opnieuw proberen" — dat zou valse hoop zijn zolang het toestel het niet kan.
    expect(screen.queryByText('Opnieuw proberen')).toBeNull()
  })

  it('bij gesloten sheet gebeurt er niets', async () => {
    execState = mode('cloud')
    render(<AiVasteKostenSheet open={false} onOpenChange={noop} onComplete={noop} />)
    await new Promise((r) => setTimeout(r, 20))
    expect(fetchCalls).toHaveLength(0)
  })
})

// ── CLOUD-PAD ONGEWIJZIGD ────────────────────────────────────────────────────

describe('AiVasteKostenSheet — cloud-pad', () => {
  it("vraagt bij 'cloud' de volledige analyse (géén candidatesOnly) en gebruikt de lokale resolver niet", async () => {
    execState = mode('cloud')
    cloudResponse = {
      suggestions: [{
        id: 'k-1', name: 'Netflix', monthlyAmount: 13.99, frequency: 'monthly', occurrences: 12,
        autoCategory: 'subscription', autoCategoryLabel: 'Abonnement',
        aiClassification: 'subscription', aiReason: 'streamingdienst', confidence: 'high',
      }],
      analysedCount: 1,
      skippedCount: 0,
    }

    render(<AiVasteKostenSheet open onOpenChange={noop} onComplete={noop} />)

    await screen.findByText('Netflix')
    expect(fetchCalls).toHaveLength(1)
    expect(fetchCalls[0].body).toEqual({})
    expect(resolverFactory).not.toHaveBeenCalled()
  })
})

// ── PROGRESSIEVE WEERGAVE ────────────────────────────────────────────────────

describe('AiVasteKostenSheet — progressieve weergave op het lokale pad', () => {
  it('toont de eerste chunk terwijl de rest nog draait (geen minutenlange spinner)', async () => {
    execState = mode('lokaal')
    candidatesResponse = [candidate('k-1', { name: 'Spotify' }), candidate('k-2', { name: 'Vattenfall' })]

    let releaseTweede: () => void = () => {}
    const tweedeChunk = new Promise<void>((r) => { releaseTweede = r })

    resolverImpl = async (cands, opts) => {
      const eerste: VasteKostenClassificatie[] = [{ id: cands[0].id, klasse: 'subscription', reden: 'streamingdienst' }]
      opts.onChunk?.(eerste, 1, 2)
      await tweedeChunk
      const tweede: VasteKostenClassificatie[] = [{ id: cands[1].id, klasse: 'vaste_kosten', reden: 'energieleverancier' }]
      opts.onChunk?.(tweede, 2, 2)
      return [...eerste, ...tweede]
    }

    render(<AiVasteKostenSheet open onOpenChange={noop} onComplete={noop} />)

    // Chunk 1 staat er terwijl chunk 2 nog loopt.
    await screen.findByText('Spotify')
    expect(screen.queryByText('Vattenfall')).toBeNull()
    expect(screen.getByText('1 van 2 beoordeeld')).toBeTruthy()

    releaseTweede()
    await screen.findByText('Vattenfall')
  })

  it('toont "model wordt gestart" tijdens de stille GPU-warmup', async () => {
    execState = mode('lokaal')
    candidatesResponse = [candidate('k-1')]

    let releaseKlaar: () => void = () => {}
    const klaar = new Promise<void>((r) => { releaseKlaar = r })

    resolverImpl = async (cands, opts) => {
      opts.onSessionState?.('starten')
      await klaar
      opts.onSessionState?.('klaar')
      const results: VasteKostenClassificatie[] = [{ id: cands[0].id, klasse: 'skip', reden: 'variabel' }]
      opts.onChunk?.(results, 1, 1)
      return results
    }

    render(<AiVasteKostenSheet open onOpenChange={noop} onComplete={noop} />)

    await screen.findByText(/Model wordt gestart/)
    releaseKlaar()
    await waitFor(() => expect(screen.queryByText(/Model wordt gestart/)).toBeNull())
  })
})
