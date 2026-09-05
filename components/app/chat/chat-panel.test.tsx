import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ChatPanel } from './chat-panel'
import { DefaultChatTransport } from 'ai'
import { LocalChatTransport } from '@/lib/ai/local/local-chat-transport'
import { LOCAL_READINESS_FLAP_HINT } from '@/lib/ai/local/local-readiness'
import { resolveAllExecutionModes } from '@/lib/ai/execution-groups'
import { getOverlayCount, __resetOverlayCount } from '@/lib/overlay-signal'
import { WelcomeGuideProvider } from './gids/welcome-guide-provider'
import { DEFAULT_WELCOME_GUIDE, DEFAULT_WELCOME_GUIDE_STATE } from '@/lib/welcome-guide'
import { getOverlayHistoryDepth, __resetOverlayHistory } from '@/lib/overlay-history'

/**
 * Regressietest voor de Wft-akkoord-gate in de Fin-chat.
 *
 * Bug (Notion 397f9e8d): bij het openen van de chat MET een vooraf-ingevulde
 * vraag (openWithMessage → pendingMessage, of autoOpenMessage) vuurde het
 * auto-send-effect `sendMessage` af zodra `isOpen && hasAi && !isStreaming`,
 * ZONDER te wachten op Wft-acceptatie. Voor een nieuwe gebruiker (lege
 * localStorage) toonde het akkoordscherm wel de UI-blokkade, maar de AI-aanroep
 * ging tóch door — Fin begon te antwoorden vóór de klik op 'Ik begrijp het'.
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
// Per-test in te stellen berichten-historie — default leeg (bestaande gedrags-
// tests raken 'm niet); de data-finActie-tests zetten 'm vooraf aan render.
let mockMessages: unknown[] = []

// Mutabele chat-context — per test in te stellen
let ctx: Record<string, unknown> = {}

// Elke useChat(...)-aanroep wordt bewaard zodat een test kan verifiëren welke
// transport-instance (cloud vs. lokaal) daadwerkelijk werd doorgegeven.
let mockUseChatCalls: Array<{ transport: unknown }> = []

vi.mock('@ai-sdk/react', () => ({
  useChat: (opts: { transport: unknown }) => {
    mockUseChatCalls.push(opts)
    return {
      messages: mockMessages,
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

// MeldingView draagt de verzend-state; hier meldt hij meteen "bezig", zodat de
// sluit-blokkade (`meldingBezig`) in ChatPanel actief is.
vi.mock('./melding/melding-view', () => ({
  MeldingView: ({ onBezigChange }: { onBezigChange: (bezig: boolean) => void }) => {
    onBezigChange(true)
    return <div>melding-formulier</div>
  },
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
    // M25: de koppeling "pas gelezen bij een echt antwoord". ChatPanel roept
    // deze aan vanuit zijn effecten; hier alleen als spy aanwezig.
    resolvePendingAnswer: vi.fn(),
    dropPendingAnswer: vi.fn(),
    // ADR 0130 — de gids-intent-drieslag, spiegel van de meldmodus.
    gidsRequested: false,
    clearGidsRequest: vi.fn(),
    ...overrides,
  }
}

/**
 * Stubt `global.fetch` voor de drie endpoints die de uitvoermodus-swap raakt:
 * `/api/ai-execution-prefs` (de per-groep keuze), `/api/local-chat-overview` en
 * `/api/local-knowledge`. Retourneert de spy zodat een test kan verifiëren wélke
 * endpoints wel/niet zijn aangeroepen (bv. "geen lokale fetches" op het cloudpad).
 *
 * De `modes`-map wordt met de CANONIEKE resolver gebouwd (`resolveAllExecutionModes`,
 * exact wat GET /api/ai-execution-prefs doet) i.p.v. met de hand — zo toetsen de
 * override-tests hieronder de echte voorrangsregel en niet een in de test
 * nagebouwde variant ervan.
 */
function stubExecutionFetch(overrides: {
  /** De hoofdschakelaar (profiles.privacy_mode). */
  privacyMode?: boolean
  /** De per-groep-override voor 'gesprek' (profiles.ai_execution_prefs). */
  gesprek?: 'lokaal' | 'cloud' | null
  /** Staat het 'ai'-abonnement nog open? De hook eist dit veld expliciet: zonder
   *  boolean blijft hij fail-closed in 'resolving' hangen. */
  hasAiSubscription?: boolean
  overviewOk?: boolean
  overview?: unknown
  knowledgeOk?: boolean
  knowledgeItems?: unknown[]
} = {}) {
  const {
    privacyMode = false,
    gesprek = null,
    hasAiSubscription = true,
    overviewOk = true,
    overview = { hasData: true, nettoVermogen: 85000 },
    knowledgeOk = true,
    knowledgeItems = [],
  } = overrides
  const modes = resolveAllExecutionModes({
    privacy_mode: privacyMode,
    ai_execution_prefs: gesprek ? { gesprek } : {},
  })
  const fn = vi.fn((url: string) => {
    if (url === '/api/ai-execution-prefs') {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            privacyMode,
            prefs: gesprek ? { gesprek } : {},
            modes,
            hasAiSubscription,
            aiEnabled: true,
          }),
      })
    }
    if (url === '/api/local-chat-overview') {
      return Promise.resolve({ ok: overviewOk, json: () => Promise.resolve(overview) })
    }
    if (url === '/api/local-knowledge') {
      return Promise.resolve({ ok: knowledgeOk, json: () => Promise.resolve({ items: knowledgeItems }) })
    }
    // De gidsweergave doet bij openen één verse GET (ADR 0130). Zonder deze tak
    // valt de test op een afgewezen promise i.p.v. op wat hij wil toetsen.
    if (url === '/api/welcome-guide') {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ config: DEFAULT_WELCOME_GUIDE, state: DEFAULT_WELCOME_GUIDE_STATE }),
      })
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
  mockMessages = []
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
    const fetchSpy = stubExecutionFetch({ privacyMode: false })
    ctx = makeCtx({ pendingMessage: 'Doorlicht mijn financiën' })
    render(<ChatPanel />)

    // Akkoordscherm zichtbaar (lege localStorage → wftAccepted === false)
    expect(screen.getByText('Belangrijke mededeling')).toBeInTheDocument()
    // Cruciaal: nog geen AI-aanroep
    expect(mockSendMessage).not.toHaveBeenCalled()
    // Laat de privacy-mode-resolutie afronden zodat de test geen hangende
    // state-update ná afloop achterlaat (act-warning).
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith('/api/ai-execution-prefs'))
  })

  it('verstuurt de pending-vraag alsnog ná klik op "Ik begrijp het"', async () => {
    // De modus-resolutie is async (fetch /api/ai-execution-prefs) en
    // moet naar 'cloud' resolven (chatReady) vóórdat het auto-send-effect mag
    // versturen — spiegelt de echte fail-closed-garantie i.p.v. 'm te omzeilen.
    stubExecutionFetch({ privacyMode: false })
    ctx = makeCtx({ pendingMessage: 'Doorlicht mijn financiën' })
    render(<ChatPanel />)

    expect(mockSendMessage).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Ik begrijp het' }))

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1))
    expect(mockSendMessage).toHaveBeenCalledWith({ text: 'Doorlicht mijn financiën' })
  })

  it('verstuurt een autoOpenMessage (whatif-context) pas ná acceptatie', async () => {
    stubExecutionFetch({ privacyMode: false })
    ctx = makeCtx({ autoOpenMessage: 'Bespreek dit scenario' })
    render(<ChatPanel />)

    expect(mockSendMessage).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Ik begrijp het' }))

    await waitFor(() =>
      expect(mockSendMessage).toHaveBeenCalledWith({ text: 'Bespreek dit scenario' }),
    )
  })

  it('verstuurt de pending-vraag direct wanneer Wft al eerder is geaccepteerd', async () => {
    stubExecutionFetch({ privacyMode: false })
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
    const fetchSpy = stubExecutionFetch({ privacyMode: false })
    render(<ChatPanel />)

    await waitFor(() => expect(mockUseChatCalls.length).toBeGreaterThan(0))

    const lastCall = mockUseChatCalls[mockUseChatCalls.length - 1]
    expect(lastCall.transport).toBeInstanceOf(DefaultChatTransport)
    expect(mockLocalTransportInstances).toHaveLength(0)
    expect(mockCheckLocalAiCapability).not.toHaveBeenCalled()
    expect(mockGetLocalModelState).not.toHaveBeenCalled()

    expect(fetchSpy).toHaveBeenCalledWith('/api/ai-execution-prefs')
    expect(fetchSpy).not.toHaveBeenCalledWith('/api/local-chat-overview')
    expect(fetchSpy).not.toHaveBeenCalledWith('/api/local-knowledge')
  })

  it('privacy AAN + gereed → LocalChatTransport gekozen, geen POST naar /api/ai/chat', async () => {
    mockCheckLocalAiCapability.mockResolvedValue({ ok: true, reasons: [], shaderF16: true, deviceMemoryGb: 8 })
    mockGetLocalModelState.mockResolvedValue({ state: 'klaar', bytes: null })
    const fetchSpy = stubExecutionFetch({ privacyMode: true })
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
    const fetchSpy = stubExecutionFetch({ privacyMode: true })
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
    stubExecutionFetch({ privacyMode: true })
    render(<ChatPanel />)

    await screen.findByText('Experimenteel · lokaal')
    expect(screen.getByText(/Fin denkt lokaal na/)).toBeInTheDocument()
    expect(screen.getByText(/Ook lokaal kan Fin actievoorstellen doen/)).toBeInTheDocument()
    expect(screen.getByText(/Wat-als-simulaties kan Fin lokaal nog niet uitvoeren/)).toBeInTheDocument()
    expect(screen.getByText('Draait op je toestel')).toBeInTheDocument()
  })

  it('dispose() wordt aangeroepen bij unmount (geen lekkende lokale sessie)', async () => {
    mockCheckLocalAiCapability.mockResolvedValue({ ok: true, reasons: [], shaderF16: true, deviceMemoryGb: 8 })
    mockGetLocalModelState.mockResolvedValue({ state: 'klaar', bytes: null })
    stubExecutionFetch({ privacyMode: true })
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
    stubExecutionFetch({ privacyMode: true })
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
    stubExecutionFetch({ privacyMode: false })
    render(<ChatPanel />)

    const retry = await screen.findByTestId('chat-retry-button')
    await waitFor(() => expect(retry).not.toBeDisabled())

    fireEvent.click(retry)
    expect(mockRegenerate).toHaveBeenCalledTimes(1)
  })
})

/**
 * C2c: het lokale (privé-)pad heeft geen tool-invocations — het transport
 * (`local-chat-transport.ts`) surfaced een geparste actie als een NIET-transient
 * `data-finActie`-part i.p.v. een `suggestAction`-tool-output. `renderAssistantMessage`
 * hergebruikt dezelfde `ActionSuggestionCard` voor dat part-type (regel ~932).
 *
 * Deze suite bewijst het render-contract end-to-end via de useChat-messages-mock
 * (geen echte transport nodig — dat is al gedekt door local-chat-transport.test.ts
 * en parse-intent.test.ts):
 *  - een geldig `data-finActie`-part náást tekst rendert de kaart;
 *  - een `data-finActie`-part MET LEGE tekst (`cleanedText === ''`, het geval
 *    waarin het model ALLEEN het fin-actie-blok teruggeeft) rendert de kaart óók —
 *    dit is de regressie-val: `hasContent` checkte oorspronkelijk alleen op
 *    text/suggestAction/showVisualization en zou een berichtje met UITSLUITEND
 *    een data-finActie-part stilzwijgend laten verdwijnen;
 *  - een ontbrekend/leeg `data` op het part (defensieve malformed-guard,
 *    `part.type === 'data-finActie' && part.data`) rendert GEEN kaart.
 */
describe('ChatPanel — data-finActie kaart (lokaal actievoorstel, C2c)', () => {
  beforeEach(() => {
    localStorage.setItem(WFT_KEY, 'true')
    stubExecutionFetch({ privacyMode: false })
  })

  const FIN_ACTIE_DATA = {
    title: 'Verhoog je maandelijkse inleg',
    description: 'Bespaar ~5 vrijheidsdagen per jaar.',
    freedom_days_impact: 5,
    euro_impact_monthly: 50,
    priority_score: 3,
  }

  it('rendert de kaart voor een data-finActie-part náást gewone tekst', async () => {
    mockMessages = [{
      id: 'm1',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Hier is een voorstel:' },
        { type: 'data-finActie', id: 'hash-1', data: FIN_ACTIE_DATA },
      ],
    }]

    render(<ChatPanel />)

    expect(await screen.findByText('Verhoog je maandelijkse inleg')).toBeInTheDocument()
    expect(screen.getByText('Hier is een voorstel:')).toBeInTheDocument()
    expect(screen.getByText('+ Toevoegen')).toBeInTheDocument()
  })

  it('rendert de kaart óók wanneer het bericht UITSLUITEND het data-finActie-part bevat (lege tekst)', async () => {
    // Spiegelt local-chat-transport.ts: cleanedText kan '' zijn wanneer het
    // model alleen het fin-actie-fence-blok teruggaf (geen omringende proza).
    mockMessages = [{
      id: 'm1',
      role: 'assistant',
      parts: [
        { type: 'text', text: '' },
        { type: 'data-finActie', id: 'hash-1', data: FIN_ACTIE_DATA },
      ],
    }]

    render(<ChatPanel />)

    expect(await screen.findByText('Verhoog je maandelijkse inleg')).toBeInTheDocument()
  })

  it('rendert GEEN kaart wanneer het data-finActie-part geen data heeft (malformed-guard)', async () => {
    mockMessages = [{
      id: 'm1',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Even nadenken...' },
        { type: 'data-finActie', id: 'hash-1', data: null },
      ],
    }]

    render(<ChatPanel />)

    expect(await screen.findByText('Even nadenken...')).toBeInTheDocument()
    expect(screen.queryByText('+ Toevoegen')).not.toBeInTheDocument()
  })

  it('POST\'t de metadata.origin:local-chat bij het toevoegen van een lokale actie', async () => {
    const fetchSpy = stubExecutionFetch({ privacyMode: false })
    mockMessages = [{
      id: 'm1',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Voorstel:' },
        { type: 'data-finActie', id: 'hash-1', data: FIN_ACTIE_DATA },
      ],
    }]
    fetchSpy.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/ai-execution-prefs') return Promise.resolve({ ok: true, json: () => Promise.resolve({ modes: { gesprek: 'cloud' }, hasAiSubscription: true, aiEnabled: true }) })
      if (url === '/api/ai/actions') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ action: { id: 'a1', ...JSON.parse(String(init?.body)) } }),
        })
      }
      return Promise.reject(new Error(`onverwachte fetch in test: ${url}`))
    })

    render(<ChatPanel />)
    const addButton = await screen.findByText('+ Toevoegen')
    fireEvent.click(addButton)

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith('/api/ai/actions', expect.anything()))
    const calls = fetchSpy.mock.calls as unknown as Array<[string, RequestInit?]>
    const call = calls.find(([url]) => url === '/api/ai/actions')
    const body = JSON.parse(String(call?.[1]?.body))
    expect(body.metadata).toEqual({ origin: 'local-chat' })
    expect(body.source).toBe('chat')
  })
})

/**
 * ADR 0078 — de per-groep-override wint van de hoofdschakelaar.
 *
 * Dit is precies het gedrag dat ontbrak: de ChatPanel las de kale
 * `profiles.privacy_mode` via /api/privacy-mode, zodat de schakelaar "Gesprek met
 * Fin" op /mijn/privacy decoratief was. Beide richtingen worden hier vastgepind,
 * met de `modes`-map gebouwd door de canonieke `resolveAllExecutionModes`.
 */
describe('ChatPanel — per-groep-override wint van de hoofdschakelaar (ADR 0078)', () => {
  beforeEach(() => {
    localStorage.setItem(WFT_KEY, 'true')
  })

  it('(a) hoofdschakelaar CLOUD + groep "gesprek" LOKAAL → lokaal transport, geen cloud-fetch', async () => {
    mockCheckLocalAiCapability.mockResolvedValue({ ok: true, reasons: [], shaderF16: true, deviceMemoryGb: 8 })
    mockGetLocalModelState.mockResolvedValue({ state: 'klaar', bytes: null })
    const fetchSpy = stubExecutionFetch({ privacyMode: false, gesprek: 'lokaal' })
    render(<ChatPanel />)

    // De override wint: on-device transport, niet de cloud-default.
    await waitFor(() => expect(mockLocalTransportInstances).toHaveLength(1))
    const lastCall = mockUseChatCalls[mockUseChatCalls.length - 1]
    expect(lastCall.transport).toBeInstanceOf(LocalChatTransport)
    expect(screen.getByText('Experimenteel · lokaal')).toBeInTheDocument()

    // Geen enkele aanroep naar de cloud-chat-route.
    expect(fetchSpy).not.toHaveBeenCalledWith('/api/ai/chat', expect.anything())
    const urls = fetchSpy.mock.calls.map((c) => String(c[0]))
    expect(urls).not.toContain('/api/ai/chat')
  })

  it('(b) hoofdschakelaar LOKAAL + groep "gesprek" CLOUD → cloudpad, geen lokale sessie', async () => {
    const fetchSpy = stubExecutionFetch({ privacyMode: true, gesprek: 'cloud' })
    render(<ChatPanel />)

    await waitFor(() => expect(mockUseChatCalls.length).toBeGreaterThan(0))
    // Cloud-transport actief en de chat is verzendklaar (chatReady) — bewijs dat
    // de override de hoofdschakelaar overstemt.
    const textarea = await screen.findByPlaceholderText('Vraag Fin iets...')
    await waitFor(() => expect(textarea).not.toBeDisabled())
    const lastCall = mockUseChatCalls[mockUseChatCalls.length - 1]
    expect(lastCall.transport).toBeInstanceOf(DefaultChatTransport)

    // Er is geen enkele lokale sessie opgetuigd: geen GPU-check, geen model-
    // staat, geen lokale hydratie.
    expect(mockLocalTransportInstances).toHaveLength(0)
    expect(mockCheckLocalAiCapability).not.toHaveBeenCalled()
    expect(mockGetLocalModelState).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalledWith('/api/local-chat-overview')
  })

  it('(c) modus nog onbekend (fetch hangt) → fail-closed: invoer uit, niets verstuurd', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    ctx = makeCtx({ pendingMessage: 'Doorlicht mijn financiën' })
    render(<ChatPanel />)

    const textarea = await screen.findByPlaceholderText('Even geduld…')
    expect(textarea).toBeDisabled()
    expect(mockSendMessage).not.toHaveBeenCalled()
  })
})

/**
 * Regressietest voor de zwevende nav-pill boven het Fin-paneel
 * (Notion 2026-08-09-testbug-53fc3d, ADR 0039 fase 2).
 *
 * Bug: het paneel rendeerde mobiel full-screen op `z-50` en meldde zich nooit
 * aan bij `lib/overlay-signal`. De `FloatingNavButton` (`z-[60]`) bleef daardoor
 * op <1024px zichtbaar bovenop het paneel en dekte de sticky footerknoppen af
 * ("Terug"/"Verstuur melding" in de meldflow) — in álle Fin-modi.
 *
 * Deze test pint drie dingen vast: (1) het open, niet-gepinde paneel claimt een
 * overlay zodat de pill zich verbergt, (2) het geeft die claim weer vrij bij
 * sluiten/unmount, en (3) de modale laag is `z-[70]` — bóven de pill.
 */
describe('ChatPanel — meldt zich als overlay (pill verdwijnt)', () => {
  beforeEach(() => {
    __resetOverlayCount()
    localStorage.setItem(WFT_KEY, 'true')
    stubExecutionFetch({ privacyMode: false })
  })

  afterEach(() => {
    __resetOverlayCount()
  })

  it('claimt een overlay zolang het paneel open staat en geeft die vrij bij sluiten', async () => {
    const { rerender, unmount } = render(<ChatPanel />)
    await waitFor(() => expect(getOverlayCount()).toBe(1))

    // Sluiten (isOpen=false) geeft het signaal direct vrij — de pill komt terug.
    ctx = makeCtx({ isOpen: false })
    rerender(<ChatPanel />)
    await waitFor(() => expect(getOverlayCount()).toBe(0))

    unmount()
    expect(getOverlayCount()).toBe(0)
  })

  it('claimt GEEN overlay in gepinde (zijbalk-)modus — de pagina blijft bruikbaar', async () => {
    ctx = makeCtx({ isPinned: true })
    render(<ChatPanel />)
    await waitFor(() => expect(screen.getByText('Fin')).toBeInTheDocument())
    expect(getOverlayCount()).toBe(0)
  })

  it('rendert het modale paneel én de backdrop op z-[70], boven de nav-pill (z-[60])', async () => {
    const { container } = render(<ChatPanel />)
    await waitFor(() => expect(getOverlayCount()).toBe(1))

    const divs = Array.from(container.querySelectorAll('div'))
    // Sinds de mobiele top-marge (bewust géén volle 100dvh meer, zie
    // panelClasses) is dit de stabiele marker voor het modale paneel.
    const panel = divs.find((el) => el.className.includes('fixed bottom-0 right-0'))
    expect(panel).toBeDefined()
    expect(panel!.className).toContain('z-[70]')
    expect(panel!.className).not.toContain('z-50')

    const backdrop = divs.find((el) => el.className.includes('bg-[var(--scrim)]'))
    expect(backdrop).toBeDefined()
    expect(backdrop!.className).toContain('z-[70]')
  })
})

/**
 * Swipe-down-to-dismiss (gedeeld gebaar uit lib/hooks/use-swipe-to-dismiss.ts,
 * dezelfde hook die BottomSheet gebruikt). Deze tests pinnen de bedrading, niet
 * de drempelwaarden zelf: (1) een voldoende grote sleep aan de header sluit via
 * `veiligSluiten`, (2) een korte sleep veert terug, (3) de berichtenlijst
 * beslist scroll-vs-drag, en (4) de gepinde zijbalk krijgt het gebaar niet.
 */
describe('ChatPanel — swipe-down-to-dismiss', () => {
  const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')

  function vindDiv(container: HTMLElement, deelKlasse: string) {
    return Array.from(container.querySelectorAll('div')).find((el) =>
      el.className.includes(deelKlasse),
    )
  }

  beforeEach(() => {
    localStorage.setItem(WFT_KEY, 'true')
    stubExecutionFetch({ privacyMode: false })
    // jsdom geeft elk element hoogte 0, terwijl de dismiss-drempel 30% van de
    // paneelhoogte is — die hoogte pinnen we dus expliciet.
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      value: 800,
    })
  })

  afterEach(() => {
    if (originalOffsetHeight) {
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight)
    } else {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetHeight
    }
  })

  it('sluit het paneel na een neerwaartse sleep aan de header', async () => {
    const close = vi.fn()
    ctx = makeCtx({ close })
    const { container } = render(<ChatPanel />)
    await waitFor(() => expect(screen.getByText('Fin')).toBeInTheDocument())

    const header = vindDiv(container, 'justify-between border-b')!
    fireEvent.touchStart(header, { touches: [{ clientY: 100 }] })
    fireEvent.touchMove(header, { touches: [{ clientY: 500 }] })
    fireEvent.touchEnd(header)

    await waitFor(() => expect(close).toHaveBeenCalledTimes(1))
  })

  it('sluit NIET bij een korte sleep (onder de drempel) — het paneel veert terug', async () => {
    const close = vi.fn()
    ctx = makeCtx({ close })
    const { container } = render(<ChatPanel />)
    await waitFor(() => expect(screen.getByText('Fin')).toBeInTheDocument())

    const header = vindDiv(container, 'justify-between border-b')!
    // Zonder gecontroleerde tijd meet de snelheids-tracker de afstand tussen
    // twee synchrone fireEvent-aanroepen — dat is al 0ms of "instant" en dus
    // een willekeurig hoge px/s, ongeacht de bedoelde sleepafstand. 80px in
    // 200ms (400px/s) is een realistische trage sleep, ruim onder zowel de
    // snelheids- (800px/s) als de percentage-drempel (30% van de 800px
    // gemockte paneelhoogte hierboven).
    const dateNowSpy = vi.spyOn(Date, 'now')
    dateNowSpy.mockReturnValueOnce(1_000).mockReturnValueOnce(1_200)
    fireEvent.touchStart(header, { touches: [{ clientY: 100 }] })
    fireEvent.touchMove(header, { touches: [{ clientY: 180 }] })
    dateNowSpy.mockRestore()
    fireEvent.touchEnd(header)

    // Ruim langer dan de langste dismiss-animatie (350ms + marge).
    await new Promise((r) => setTimeout(r, 450))
    expect(close).not.toHaveBeenCalled()
  })

  it('sluit vanuit de berichtenlijst wanneer die bovenaan staat', async () => {
    const close = vi.fn()
    ctx = makeCtx({ close })
    const { container } = render(<ChatPanel />)
    const lijst = await waitFor(() => vindDiv(container, 'overflow-y-auto px-4 py-3')!)

    fireEvent.touchStart(lijst, { touches: [{ clientY: 100 }] })
    // Eerste beweging beslist scroll-vs-drag (bovenaan + omlaag = drag).
    fireEvent.touchMove(lijst, { touches: [{ clientY: 150 }] })
    fireEvent.touchMove(lijst, { touches: [{ clientY: 550 }] })
    fireEvent.touchEnd(lijst)

    await waitFor(() => expect(close).toHaveBeenCalledTimes(1))
  })

  it('sluit NIET wanneer de berichtenlijst gescrold is — dat blijft native scroll', async () => {
    const close = vi.fn()
    ctx = makeCtx({ close })
    const { container } = render(<ChatPanel />)
    const lijst = await waitFor(() => vindDiv(container, 'overflow-y-auto px-4 py-3')!)
    Object.defineProperty(lijst, 'scrollTop', { configurable: true, value: 120 })

    fireEvent.touchStart(lijst, { touches: [{ clientY: 100 }] })
    fireEvent.touchMove(lijst, { touches: [{ clientY: 150 }] })
    fireEvent.touchMove(lijst, { touches: [{ clientY: 550 }] })
    fireEvent.touchEnd(lijst)

    await new Promise((r) => setTimeout(r, 450))
    expect(close).not.toHaveBeenCalled()
  })

  it('krijgt het gebaar NIET in gepinde (zijbalk-)modus', async () => {
    const close = vi.fn()
    ctx = makeCtx({ close, isPinned: true })
    const { container } = render(<ChatPanel />)
    await waitFor(() => expect(screen.getByText('Fin')).toBeInTheDocument())

    const header = vindDiv(container, 'justify-between border-b')!
    fireEvent.touchStart(header, { touches: [{ clientY: 100 }] })
    fireEvent.touchMove(header, { touches: [{ clientY: 500 }] })
    fireEvent.touchEnd(header)

    await new Promise((r) => setTimeout(r, 450))
    expect(close).not.toHaveBeenCalled()
  })
})

/**
 * Terug-knop sluit de chat, niet de pagina — hetzelfde mechanisme als elke
 * andere modal (lib/overlay-history.ts, gedeeld met BottomSheet). Deze tests
 * pinnen de bedrading: (1) een open paneel meldt precies één history-entry aan,
 * (2) een echte terug-druk sluit langs `veiligSluiten` en laat de route staan,
 * (3) sluiten via het kruisje laat geen weesentry achter, (4) heropenen meldt
 * opnieuw aan, en (5) de gepinde zijbalk doet er niet aan mee.
 */
describe('ChatPanel — terug-knop sluit het paneel', () => {
  let backSpy: ReturnType<typeof vi.spyOn>

  function simuleerBrowserBack() {
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }))
  }

  beforeEach(() => {
    __resetOverlayHistory()
    window.history.replaceState(null, '')
    // jsdom voert `history.back()` asynchroon uit en vuurt niet altijd popstate;
    // we simuleren de browser expliciet (zelfde aanpak als overlay-history.test.ts).
    backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {
      simuleerBrowserBack()
    })
    localStorage.setItem(WFT_KEY, 'true')
    stubExecutionFetch({ privacyMode: false })
  })

  afterEach(() => {
    backSpy.mockRestore()
    __resetOverlayHistory()
  })

  it('meldt één history-entry aan zolang het paneel open staat', async () => {
    render(<ChatPanel />)
    await waitFor(() => expect(getOverlayHistoryDepth()).toBe(1))
  })

  it('sluit het paneel bij een terug-druk in plaats van de pagina weg te navigeren', async () => {
    const close = vi.fn()
    ctx = makeCtx({ close })
    render(<ChatPanel />)
    await waitFor(() => expect(getOverlayHistoryDepth()).toBe(1))

    simuleerBrowserBack()

    expect(close).toHaveBeenCalledTimes(1)
    expect(getOverlayHistoryDepth()).toBe(0)
  })

  it('houdt zijn history-entry wanneer een lopende verzending het sluiten blokkeert', async () => {
    // Terug-druk tijdens een verzending: `veiligSluiten` weigert. Zonder
    // teruggave van de entry stond het paneel open zónder entry — en verliet de
    // volgende terug-druk de pagina met de chat nog open.
    const close = vi.fn()
    ctx = makeCtx({ close, meldingRequested: true, clearMeldingRequest: vi.fn() })
    render(<ChatPanel />)
    await waitFor(() => expect(screen.getByText('melding-formulier')).toBeTruthy())
    await waitFor(() => expect(getOverlayHistoryDepth()).toBe(1))

    simuleerBrowserBack()

    expect(close).not.toHaveBeenCalled()
    expect(getOverlayHistoryDepth()).toBe(1)
  })

  it('laat geen weesentry achter bij sluiten via het kruisje, en meldt opnieuw aan bij heropenen', async () => {
    const close = vi.fn()
    ctx = makeCtx({ close })
    const { rerender } = render(<ChatPanel />)
    await waitFor(() => expect(getOverlayHistoryDepth()).toBe(1))

    // Sluiten (isOpen=false) consumeert de eigen entry — anders zou de eerste
    // terug-druk daarna niets doen.
    ctx = makeCtx({ isOpen: false, close })
    rerender(<ChatPanel />)
    await waitFor(() => expect(getOverlayHistoryDepth()).toBe(0))
    expect(backSpy).toHaveBeenCalledTimes(1)
    // Onze eigen back mag `close` niet nóg eens aanroepen.
    expect(close).not.toHaveBeenCalled()

    // Heropenen meldt opnieuw aan.
    ctx = makeCtx({ close })
    rerender(<ChatPanel />)
    await waitFor(() => expect(getOverlayHistoryDepth()).toBe(1))
  })

  it('meldt GEEN entry aan in gepinde (zijbalk-)modus — terug navigeert daar gewoon', async () => {
    ctx = makeCtx({ isPinned: true })
    render(<ChatPanel />)
    await waitFor(() => expect(screen.getByText('Fin')).toBeInTheDocument())
    expect(getOverlayHistoryDepth()).toBe(0)
  })
})

/**
 * M27: het chatpaneel sloot als enige overlay-oppervlak NIET met Escape. Het is
 * een handgerolde overlay (buiten ShellOverlay om — de gedocumenteerde
 * z-index-uitzondering) en erfde het gedrag van BottomSheet/SlideInPane dus
 * niet. Escape loopt nu langs dezelfde `veiligSluiten` als het kruisje, de
 * terug-knop en de swipe-dismiss, met exact dezelfde guards.
 */
describe('ChatPanel — Escape sluit het paneel (M27)', () => {
  beforeEach(() => {
    localStorage.setItem(WFT_KEY, 'true')
    stubExecutionFetch({ privacyMode: false })
  })

  function drukEscape() {
    fireEvent.keyDown(document, { key: 'Escape' })
  }

  it('sluit het niet-gepinde paneel', async () => {
    const close = vi.fn()
    ctx = makeCtx({ close })
    render(<ChatPanel />)
    await waitFor(() => expect(screen.getByText('Fin')).toBeInTheDocument())

    drukEscape()

    expect(close).toHaveBeenCalledTimes(1)
  })

  it('sluit NIET in gepinde (zijbalk-)modus — dat is geen modaal venster', async () => {
    const close = vi.fn()
    ctx = makeCtx({ close, isPinned: true })
    render(<ChatPanel />)
    await waitFor(() => expect(screen.getByText('Fin')).toBeInTheDocument())

    drukEscape()

    expect(close).not.toHaveBeenCalled()
  })

  it('sluit NIET tijdens een lopende melding-verzending', async () => {
    const close = vi.fn()
    ctx = makeCtx({ close, meldingRequested: true, clearMeldingRequest: vi.fn() })
    render(<ChatPanel />)
    await waitFor(() => expect(screen.getByText('melding-formulier')).toBeTruthy())

    drukEscape()

    expect(close).not.toHaveBeenCalled()
  })

  it('reageert niet meer nadat het paneel gesloten is', async () => {
    const close = vi.fn()
    ctx = makeCtx({ close })
    const { rerender } = render(<ChatPanel />)
    await waitFor(() => expect(screen.getByText('Fin')).toBeInTheDocument())

    ctx = makeCtx({ isOpen: false, close })
    rerender(<ChatPanel />)
    drukEscape()

    expect(close).not.toHaveBeenCalled()
  })
})

/**
 * L7: `submit()` leegde het invoerveld onvoorwaardelijk, ook als de verzending
 * mislukte. De vraag zelf ging niet verloren (bubbel + "Opnieuw proberen"), maar
 * wie zijn vraag wilde HERFORMULEREN moest 'm overtypen. Bij een fout komt de
 * tekst nu terug in het veld — zonder ooit een verse invoer te overschrijven.
 */
describe('ChatPanel — getypte vraag komt terug bij een fout (L7)', () => {
  beforeEach(() => {
    localStorage.setItem(WFT_KEY, 'true')
    stubExecutionFetch({ privacyMode: false })
  })

  async function typEnVerstuur(vraag: string) {
    const { container, rerender } = render(<ChatPanel />)
    await waitFor(() => expect(container.querySelector('textarea')).toBeTruthy())
    const veld = container.querySelector('textarea') as HTMLTextAreaElement
    fireEvent.change(veld, { target: { value: vraag } })
    fireEvent.keyDown(veld, { key: 'Enter' })
    // Verzenden leegt het veld direct — dat blijft zo (optimistisch).
    expect(veld.value).toBe('')
    expect(mockSendMessage).toHaveBeenCalledWith({ text: vraag })
    return { container, rerender, veld }
  }

  it('zet de vraag terug in het invoerveld zodra de verzending mislukt', async () => {
    const vraag = 'Hoeveel vrijheidstijd kost mijn abonnement?'
    const { rerender, veld } = await typEnVerstuur(vraag)

    mockError = new Error('Er ging iets mis')
    rerender(<ChatPanel />)

    await waitFor(() => expect(veld.value).toBe(vraag))
  })

  it('overschrijft een inmiddels nieuw getypte vraag NIET', async () => {
    const { rerender, veld } = await typEnVerstuur('eerste vraag')

    fireEvent.change(veld, { target: { value: 'iets heel anders' } })
    mockError = new Error('Er ging iets mis')
    rerender(<ChatPanel />)

    await waitFor(() => expect(screen.getByTestId('chat-error-banner')).toBeTruthy())
    expect(veld.value).toBe('iets heel anders')
  })

  it('consumeert de teruggezette tekst bij "Opnieuw proberen" — geen dubbele vraag', async () => {
    const vraag = 'Wat betekent dit voor mijn FIRE-datum?'
    const { rerender, veld } = await typEnVerstuur(vraag)

    mockError = new Error('Er ging iets mis')
    rerender(<ChatPanel />)
    await waitFor(() => expect(veld.value).toBe(vraag))

    fireEvent.click(screen.getByTestId('chat-retry-button'))

    expect(mockRegenerate).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(veld.value).toBe(''))
  })

  it('zet niets terug bij een fout op een automatisch verstuurde vraag', async () => {
    // Notificatie-/deeplink-pad: de gebruiker heeft niets getypt, dus er hoort
    // ook niets in zijn invoerveld te verschijnen.
    ctx = makeCtx({ pendingMessage: 'Vraag uit een notificatie' })
    const { container, rerender } = render(<ChatPanel />)
    await waitFor(() => expect(mockSendMessage).toHaveBeenCalled())

    mockError = new Error('Er ging iets mis')
    rerender(<ChatPanel />)

    await waitFor(() => expect(screen.getByTestId('chat-error-banner')).toBeTruthy())
    expect((container.querySelector('textarea') as HTMLTextAreaElement).value).toBe('')
  })
})

/**
 * ADR 0130 — de WELKOMSTGIDS woont in Fin.
 *
 * De gids was een banner op /overzicht met een geminimaliseerd punt naast de
 * pagina-'i'. Hij heeft nu één thuis: een vierde icoon in deze kop, vóór de
 * megafoon, met een eigen weergave die — net als de meldmodus — BUITEN alle
 * AI-gates valt. Wat hier vastligt is de wiring: het icoon verschijnt alleen als
 * er iets te tonen is, schakelt heen en terug, staat op slot tijdens een
 * lopende melding-verzending, is bereikbaar via `openGids()` en valt terug op
 * het gesprek zodra het paneel sluit.
 */
describe('ChatPanel — welkomstgids in de chat-kop (ADR 0130)', () => {
  const SEED = { config: DEFAULT_WELCOME_GUIDE, state: DEFAULT_WELCOME_GUIDE_STATE }

  function renderMetGids(ctxOverrides: Record<string, unknown> = {}) {
    ctx = makeCtx(ctxOverrides)
    return render(
      <WelcomeGuideProvider seed={SEED}>
        <ChatPanel />
      </WelcomeGuideProvider>,
    )
  }

  it('toont het gids-icoon met aria-pressed, en schakelt heen en terug', async () => {
    localStorage.setItem(WFT_KEY, 'true')
    stubExecutionFetch({ privacyMode: false })
    renderMetGids()

    const knop = await screen.findByRole('button', { name: 'Welkomstgids openen' })
    expect(knop.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(knop)

    await waitFor(() => expect(screen.getByTestId('gids-view')).toBeInTheDocument())
    const terug = screen.getByRole('button', { name: 'Terug naar de chat' })
    expect(terug.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(terug)
    expect(screen.queryByTestId('gids-view')).not.toBeInTheDocument()
  })

  it('toont "Welkomstgids · N open" in de kop-subtitel', async () => {
    localStorage.setItem(WFT_KEY, 'true')
    stubExecutionFetch({ privacyMode: false })
    renderMetGids()

    fireEvent.click(await screen.findByRole('button', { name: 'Welkomstgids openen' }))

    // Verse gids, niets afgevinkt: het aantal open stappen op de zichtbare
    // (= verplichte) schermen. Bewust berekend uit de config i.p.v.
    // hardgecodeerd — anders breekt deze test op elke redactionele wijziging.
    const open = DEFAULT_WELCOME_GUIDE.screens
      .filter((sc) => sc.enabled && sc.required)
      .reduce((n, sc) => n + sc.steps.filter((st) => st.enabled).length, 0)
    expect(await screen.findByText('Welkomstgids · ' + open + ' open')).toBeInTheDocument()
  })

  it('werkt ZONDER AI-abonnement — de gids staat buiten de AI-gates', async () => {
    // Geen Wft-akkoord in localStorage: het akkoordscherm zou de chat blokkeren.
    // De gids hoort daar bovenuit te komen, precies zoals de meldmodus.
    stubExecutionFetch({ privacyMode: false, hasAiSubscription: false })
    renderMetGids()

    fireEvent.click(await screen.findByRole('button', { name: 'Welkomstgids openen' }))

    await waitFor(() => expect(screen.getByTestId('gids-view')).toBeInTheDocument())
    expect(screen.queryByText('Belangrijke mededeling')).not.toBeInTheDocument()
  })

  it('staat op slot tijdens een lopende melding-verzending', async () => {
    localStorage.setItem(WFT_KEY, 'true')
    stubExecutionFetch({ privacyMode: false })
    renderMetGids({ meldingRequested: true, clearMeldingRequest: vi.fn() })

    await waitFor(() => expect(screen.getByText('melding-formulier')).toBeTruthy())
    // Megafoon én gids dragen tijdens een verzending hetzelfde label; beide
    // horen uitgeschakeld te zijn.
    const opSlot = screen.getAllByRole('button', { name: 'Je melding wordt verstuurd' })
    expect(opSlot.length).toBeGreaterThanOrEqual(2)
    for (const knop of opSlot) expect(knop).toBeDisabled()
  })

  it('opent direct in de gidsmodus via openGids() en wist die intent', async () => {
    localStorage.setItem(WFT_KEY, 'true')
    stubExecutionFetch({ privacyMode: false })
    const clearGidsRequest = vi.fn()
    renderMetGids({ gidsRequested: true, clearGidsRequest })

    await waitFor(() => expect(screen.getByTestId('gids-view')).toBeInTheDocument())
    expect(clearGidsRequest).toHaveBeenCalled()
  })

  it('valt bij sluiten terug op het gesprek', async () => {
    localStorage.setItem(WFT_KEY, 'true')
    stubExecutionFetch({ privacyMode: false })
    ctx = makeCtx({ gidsRequested: true, clearGidsRequest: vi.fn() })
    const { rerender } = render(
      <WelcomeGuideProvider seed={SEED}>
        <ChatPanel />
      </WelcomeGuideProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('gids-view')).toBeInTheDocument())

    ctx = makeCtx({ isOpen: false })
    rerender(
      <WelcomeGuideProvider seed={SEED}>
        <ChatPanel />
      </WelcomeGuideProvider>,
    )
    ctx = makeCtx()
    rerender(
      <WelcomeGuideProvider seed={SEED}>
        <ChatPanel />
      </WelcomeGuideProvider>,
    )

    await waitFor(() => expect(screen.getByText('Fin')).toBeInTheDocument())
    expect(screen.queryByTestId('gids-view')).not.toBeInTheDocument()
  })

  it('zegt "afgesloten" in de kop-subtitel bij een afgesloten gids — niet "0 open"', async () => {
    localStorage.setItem(WFT_KEY, 'true')
    stubExecutionFetch({ privacyMode: false })
    ctx = makeCtx()
    render(
      <WelcomeGuideProvider seed={null} dismissed>
        <ChatPanel />
      </WelcomeGuideProvider>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Welkomstgids openen' }))

    // Synchroon ná de klik: de gidsweergave doet bij openen één verse GET, en
    // de stub hierboven antwoordt daarop met een ACTIEVE gids (niet met de
    // afgesloten staat die de echte route zou teruggeven) — daarna klapt de
    // lege staat dus om. Wat hier vastligt is de subtitel op het moment dat de
    // lege staat op het scherm staat.
    expect(screen.getByText('Welkomstgids · afgesloten')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gids opnieuw tonen' })).toBeInTheDocument()
    expect(screen.queryByText(/0 open/)).not.toBeInTheDocument()
  })

  it('rendert geen gids-icoon wanneer er niets te tonen is', async () => {
    localStorage.setItem(WFT_KEY, 'true')
    stubExecutionFetch({ privacyMode: false })
    ctx = makeCtx()
    render(
      <WelcomeGuideProvider
        seed={{
          config: { ...DEFAULT_WELCOME_GUIDE, enabled: false },
          state: DEFAULT_WELCOME_GUIDE_STATE,
        }}
      >
        <ChatPanel />
      </WelcomeGuideProvider>,
    )

    await waitFor(() => expect(screen.getByText('Fin')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Welkomstgids openen' })).not.toBeInTheDocument()
  })
})
