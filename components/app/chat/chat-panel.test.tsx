import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ChatPanel } from './chat-panel'
import { DefaultChatTransport } from 'ai'
import { LocalChatTransport } from '@/lib/ai/local/local-chat-transport'
import { LOCAL_READINESS_FLAP_HINT } from '@/lib/ai/local/local-readiness'

/**
 * Regressietest voor de Wft-akkoord-gate in de Will-chat.
 *
 * Bug (Notion 397f9e8d): bij het openen van de chat MET een vooraf-ingevulde
 * vraag (openWithMessage → pendingMessage, of autoOpenMessage) vuurde het
 * auto-send-effect `sendMessage` af zodra `isOpen && hasAi && !isStreaming`,
 * ZONDER te wachten op Wft-acceptatie. Voor een nieuwe gebruiker (lege
 * localStorage) toonde het akkoordscherm wel de UI-blokkade, maar de AI-aanroep
 * ging tóch door — Will begon te antwoorden vóór de klik op 'Ik begrijp het'.
 *
 * Deze test pint vast: (1) geen sendMessage zolang het akkoordscherm er staat,
 * en (2) de vooraf-ingevulde vraag gaat NIET verloren maar wordt alsnog
 * verstuurd ná acceptatie.
 */

const mockSendMessage = vi.fn()
let mockClearPendingMessage = vi.fn()
// Per-test in te stellen useChat-retourwaarden (error-banner + retry-pad).
let mockError: unknown = undefined
let mockRegenerate = vi.fn()
let mockClearError = vi.fn()

// Mutabele chat-context — per test in te stellen
let ctx: Record<string, unknown> = {}

// Elke useChat(...)-aanroep wordt bewaard zodat een test kan verifiëren welke
// transport-instance (cloud vs. lokaal) daadwerkelijk werd doorgegeven.
let mockUseChatCalls: Array<{ transport: unknown }> = []

vi.mock('@ai-sdk/react', () => ({
  useChat: (opts: { transport: unknown }) => {
    mockUseChatCalls.push(opts)
    return {
      messages: [],
      sendMessage: mockSendMessage,
      status: 'ready',
      error: mockError,
      clearError: mockClearError,
      regenerate: mockRegenerate,
    }
  },
}))

vi.mock('ai', () => ({
  DefaultChatTransport: class {
    constructor(public opts: unknown) {}
  },
}))

// Lokale-transport-mock: elke instance wordt bewaard zodat een test op
// `dispose` (vi.fn()) kan spy'en — bewijst de cleanup-effect (rode vlag 2:
// géén lekkende WebGPU-sessie bij transport-wissel/unmount).
let mockLocalTransportInstances: Array<{ opts: unknown; dispose: ReturnType<typeof vi.fn> }> = []

vi.mock('@/lib/ai/local/local-chat-transport', () => ({
  LocalChatTransport: class {
    dispose = vi.fn()
    constructor(public opts: unknown) {
      mockLocalTransportInstances.push(this)
    }
  },
}))

const mockCheckLocalAiCapability = vi.fn()
const mockGetLocalModelState = vi.fn()

vi.mock('@/lib/ai/local/webgpu-capability', () => ({
  checkLocalAiCapability: (...args: unknown[]) => mockCheckLocalAiCapability(...args),
}))

vi.mock('@/lib/ai/local/model-manager', () => ({
  getLocalModelState: (...args: unknown[]) => mockGetLocalModelState(...args),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/overzicht',
}))

vi.mock('./chat-provider', () => ({
  useChatContext: () => ctx,
}))

vi.mock('@/components/app/feature-access-provider', () => ({
  useModuleAccess: () => ({ activeModules: ['inzicht_acties'], subscriptions: ['ai'] }),
}))

vi.mock('@/lib/feature-registry', () => ({
  hasSubscription: () => true,
}))

const WFT_KEY = 'trifinity-chat-wft-accepted'

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    isOpen: true,
    close: vi.fn(),
    pendingMessage: null,
    clearPendingMessage: mockClearPendingMessage,
    isPinned: false,
    togglePin: vi.fn(),
    autoOpenMessage: null,
    setAutoOpenMessage: vi.fn(),
    ...overrides,
  }
}

/**
 * Stubt `global.fetch` voor de drie endpoints die de privé-modus-swap raakt:
 * `/api/privacy-mode`, `/api/local-chat-overview`, `/api/local-knowledge`.
 * Retourneert de spy zodat een test kan verifiëren wélke endpoints wel/niet
 * zijn aangeroepen (bv. "geen lokale fetches" wanneer privacy uit staat).
 */
function stubPrivacySwapFetch(overrides: {
  privacyMode?: boolean
  overviewOk?: boolean
  overview?: unknown
  knowledgeOk?: boolean
  knowledgeItems?: unknown[]
} = {}) {
  const {
    privacyMode = false,
    overviewOk = true,
    overview = { hasData: true, nettoVermogen: 85000 },
    knowledgeOk = true,
    knowledgeItems = [],
  } = overrides
  const fn = vi.fn((url: string) => {
    if (url === '/api/privacy-mode') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ privacyMode }) })
    }
    if (url === '/api/local-chat-overview') {
      return Promise.resolve({ ok: overviewOk, json: () => Promise.resolve(overview) })
    }
    if (url === '/api/local-knowledge') {
      return Promise.resolve({ ok: knowledgeOk, json: () => Promise.resolve({ items: knowledgeItems }) })
    }
    return Promise.reject(new Error(`onverwachte fetch in test: ${url}`))
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

beforeEach(() => {
  mockSendMessage.mockClear()
  mockClearPendingMessage = vi.fn()
  mockError = undefined
  mockRegenerate = vi.fn()
  mockClearError = vi.fn()
  localStorage.clear()
  ctx = makeCtx()
  mockUseChatCalls = []
  mockLocalTransportInstances = []
  mockCheckLocalAiCapability.mockReset()
  mockGetLocalModelState.mockReset()
  // jsdom implementeert scrollIntoView niet (het messages-auto-scroll-effect
  // roept het aan bij mount) — stub het zodat de render niet crasht.
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ChatPanel — Wft-akkoord-gate', () => {
  it('toont het akkoordscherm en verstuurt de pending-vraag NIET vóór acceptatie', async () => {
    const fetchSpy = stubPrivacySwapFetch({ privacyMode: false })
    ctx = makeCtx({ pendingMessage: 'Doorlicht mijn financiën' })
    render(<ChatPanel />)

    // Akkoordscherm zichtbaar (lege localStorage → wftAccepted === false)
    expect(screen.getByText('Belangrijke mededeling')).toBeInTheDocument()
    // Cruciaal: nog geen AI-aanroep
    expect(mockSendMessage).not.toHaveBeenCalled()
    // Laat de privacy-mode-resolutie afronden zodat de test geen hangende
    // state-update ná afloop achterlaat (act-warning).
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith('/api/privacy-mode'))
  })

  it('verstuurt de pending-vraag alsnog ná klik op "Ik begrijp het"', async () => {
    // Privé-modus-resolutie is sinds FR-C2a async (fetch /api/privacy-mode) en
    // moet naar 'cloud' resolven (chatReady) vóórdat het auto-send-effect mag
    // versturen — spiegelt de echte fail-closed-garantie i.p.v. 'm te omzeilen.
    stubPrivacySwapFetch({ privacyMode: false })
    ctx = makeCtx({ pendingMessage: 'Doorlicht mijn financiën' })
    render(<ChatPanel />)

    expect(mockSendMessage).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Ik begrijp het' }))

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1))
    expect(mockSendMessage).toHaveBeenCalledWith({ text: 'Doorlicht mijn financiën' })
  })

  it('verstuurt een autoOpenMessage (whatif-context) pas ná acceptatie', async () => {
    stubPrivacySwapFetch({ privacyMode: false })
    ctx = makeCtx({ autoOpenMessage: 'Bespreek dit scenario' })
    render(<ChatPanel />)

    expect(mockSendMessage).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Ik begrijp het' }))

    await waitFor(() =>
      expect(mockSendMessage).toHaveBeenCalledWith({ text: 'Bespreek dit scenario' }),
    )
  })

  it('verstuurt de pending-vraag direct wanneer Wft al eerder is geaccepteerd', async () => {
    stubPrivacySwapFetch({ privacyMode: false })
    localStorage.setItem(WFT_KEY, 'true')
    ctx = makeCtx({ pendingMessage: 'Doorlicht mijn financiën' })
    render(<ChatPanel />)

    // Geen akkoordscherm meer, vraag gaat door zodra de cloud-modus is vastgesteld
    expect(screen.queryByText('Belangrijke mededeling')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(mockSendMessage).toHaveBeenCalledWith({ text: 'Doorlicht mijn financiën' }),
    )
  })
})

/**
 * Transport-swap tussen cloud (DefaultChatTransport, default) en on-device
 * (LocalChatTransport, privé-modus + gereed op dit toestel). FR-C2a: geen byte
 * naar de server zodra privé-modus AAN staat en het lokale pad gereed is;
 * fail-closed (nooit stille cloud-fallback) wanneer het niet gereed is.
 *
 * Wft is in elke test al geaccepteerd (localStorage) zodat het akkoordscherm
 * de messages/banner-UI niet verbergt.
 */
describe('ChatPanel — privé-modus transport-swap (cloud ↔ lokaal, FR-C2a)', () => {
  beforeEach(() => {
    localStorage.setItem(WFT_KEY, 'true')
  })

  it('privacy UIT → DefaultChatTransport (cloud), geen lokale gereedheids-/overview-fetches', async () => {
    const fetchSpy = stubPrivacySwapFetch({ privacyMode: false })
    render(<ChatPanel />)

    await waitFor(() => expect(mockUseChatCalls.length).toBeGreaterThan(0))

    const lastCall = mockUseChatCalls[mockUseChatCalls.length - 1]
    expect(lastCall.transport).toBeInstanceOf(DefaultChatTransport)
    expect(mockLocalTransportInstances).toHaveLength(0)
    expect(mockCheckLocalAiCapability).not.toHaveBeenCalled()
    expect(mockGetLocalModelState).not.toHaveBeenCalled()

    expect(fetchSpy).toHaveBeenCalledWith('/api/privacy-mode')
    expect(fetchSpy).not.toHaveBeenCalledWith('/api/local-chat-overview')
    expect(fetchSpy).not.toHaveBeenCalledWith('/api/local-knowledge')
  })

  it('privacy AAN + gereed → LocalChatTransport gekozen, geen POST naar /api/ai/chat', async () => {
    mockCheckLocalAiCapability.mockResolvedValue({ ok: true, reasons: [], shaderF16: true, deviceMemoryGb: 8 })
    mockGetLocalModelState.mockResolvedValue({ state: 'klaar', bytes: null })
    const fetchSpy = stubPrivacySwapFetch({ privacyMode: true })
    render(<ChatPanel />)

    await waitFor(() => expect(mockLocalTransportInstances).toHaveLength(1))

    const lastCall = mockUseChatCalls[mockUseChatCalls.length - 1]
    expect(lastCall.transport).toBeInstanceOf(LocalChatTransport)
    expect(fetchSpy).toHaveBeenCalledWith('/api/local-chat-overview')
    expect(fetchSpy).toHaveBeenCalledWith('/api/local-knowledge')
    // Nooit een aanroep naar de cloud-chat-route wanneer het lokale pad actief is.
    expect(fetchSpy).not.toHaveBeenCalledWith('/api/ai/chat', expect.anything())
  })

  it('privacy AAN + NIET gereed → fail-closed blokkade met de readiness-melding, geen cloud-fallback', async () => {
    mockCheckLocalAiCapability.mockResolvedValue({
      ok: false,
      reasons: ['Je browser ondersteunt WebGPU niet.'],
      shaderF16: false,
      deviceMemoryGb: null,
    })
    mockGetLocalModelState.mockResolvedValue({ state: 'niet-gedownload', bytes: null })
    const fetchSpy = stubPrivacySwapFetch({ privacyMode: true })
    render(<ChatPanel />)

    await screen.findByText('Lokale chat nog niet klaar')
    expect(
      screen.getByText(`Je browser ondersteunt WebGPU niet. ${LOCAL_READINESS_FLAP_HINT}`),
    ).toBeInTheDocument()

    // Fail-closed: geen invoerveld/berichten-UI, geen lokale transport gebouwd,
    // en de overview/knowledge-hydratatie werd niet eens aangeroepen.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(mockLocalTransportInstances).toHaveLength(0)
    expect(fetchSpy).not.toHaveBeenCalledWith('/api/local-chat-overview')
    expect(fetchSpy).not.toHaveBeenCalledWith('/api/local-knowledge')

    // useChat kreeg (nog steeds) de cloud-transport — er is nooit een sendMessage
    // mogelijk in deze staat (chatReady blijft false), dus geen stille fallback.
    const lastCall = mockUseChatCalls[mockUseChatCalls.length - 1]
    expect(lastCall.transport).toBeInstanceOf(DefaultChatTransport)
  })

  it('labeling "Experimenteel · lokaal" + de permanente banner blijven zichtbaar in privé-modus', async () => {
    mockCheckLocalAiCapability.mockResolvedValue({ ok: true, reasons: [], shaderF16: true, deviceMemoryGb: 8 })
    mockGetLocalModelState.mockResolvedValue({ state: 'klaar', bytes: null })
    stubPrivacySwapFetch({ privacyMode: true })
    render(<ChatPanel />)

    await screen.findByText('Experimenteel · lokaal')
    expect(screen.getByText(/Will denkt lokaal na/)).toBeInTheDocument()
    expect(screen.getByText(/Acties en wat-als-simulaties kan Will lokaal nog niet uitvoeren/)).toBeInTheDocument()
    expect(screen.getByText('Draait op je toestel')).toBeInTheDocument()
  })

  it('dispose() wordt aangeroepen bij unmount (geen lekkende lokale sessie)', async () => {
    mockCheckLocalAiCapability.mockResolvedValue({ ok: true, reasons: [], shaderF16: true, deviceMemoryGb: 8 })
    mockGetLocalModelState.mockResolvedValue({ state: 'klaar', bytes: null })
    stubPrivacySwapFetch({ privacyMode: true })
    const { unmount } = render(<ChatPanel />)

    await waitFor(() => expect(mockLocalTransportInstances).toHaveLength(1))
    const disposeSpy = mockLocalTransportInstances[0].dispose
    expect(disposeSpy).not.toHaveBeenCalled()

    unmount()

    expect(disposeSpy).toHaveBeenCalledTimes(1)
  })

  it('dispose() wordt aangeroepen bij transport-wissel (chat sluiten)', async () => {
    mockCheckLocalAiCapability.mockResolvedValue({ ok: true, reasons: [], shaderF16: true, deviceMemoryGb: 8 })
    mockGetLocalModelState.mockResolvedValue({ state: 'klaar', bytes: null })
    stubPrivacySwapFetch({ privacyMode: true })
    const { rerender } = render(<ChatPanel />)

    await waitFor(() => expect(mockLocalTransportInstances).toHaveLength(1))
    const disposeSpy = mockLocalTransportInstances[0].dispose

    // Chat sluit → isOpen wordt false → de resolutie-effect valt terug naar
    // 'resolving', wat de dispose-cleanup van de lopende lokale sessie triggert.
    ctx = makeCtx({ isOpen: false })
    rerender(<ChatPanel />)

    await waitFor(() => expect(disposeSpy).toHaveBeenCalledTimes(1))
  })
})

/**
 * FR-C2a (LOW): alle verzendpaden zijn op `chatReady` gegate behalve de retry.
 * Tijdens 'resolving' (chatReady=false) mag een klik op "Opnieuw proberen" NIET
 * regenerate() vuren — anders schiet een oude error-state alsnog over de
 * cloud-transport. De knop is disabled én handleRetry fail-closed.
 */
describe('ChatPanel — retry fail-closed tijdens niet-ready (FR-C2a)', () => {
  beforeEach(() => {
    localStorage.setItem(WFT_KEY, 'true')
    mockError = new Error('Er ging iets mis')
  })

  it('retry-knop is disabled en doet niets zolang de transport niet gereed is', async () => {
    // Privé-modus-fetch hangt → localState blijft 'resolving' → chatReady=false,
    // maar de messages/error-UI (incl. retry) rendert wel (status !== 'blocked').
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    render(<ChatPanel />)

    const retry = await screen.findByTestId('chat-retry-button')
    expect(retry).toBeDisabled()

    fireEvent.click(retry)
    expect(mockRegenerate).not.toHaveBeenCalled()
    expect(mockClearError).not.toHaveBeenCalled()
  })

  it('retry werkt wél zodra de transport gereed is (cloud)', async () => {
    stubPrivacySwapFetch({ privacyMode: false })
    render(<ChatPanel />)

    const retry = await screen.findByTestId('chat-retry-button')
    await waitFor(() => expect(retry).not.toBeDisabled())

    fireEvent.click(retry)
    expect(mockRegenerate).toHaveBeenCalledTimes(1)
  })
})
