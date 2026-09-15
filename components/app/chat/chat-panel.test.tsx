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
import { resolveBackend } from '@/lib/chat/history/resolve'
import type {
  ChatConversationMeta,
  ChatHistoryMode,
  ChatOrigin,
  StoredChatMessage,
} from '@/lib/chat/history/types'
import type { CoachDataGaps } from '@/lib/coach-suggestions'

/**
 * Regressietest voor de Wft-akkoord-gate in de Fin-chat.
 *
 * Bug (Notion 397f9e8d): bij het openen van de chat MET een vooraf-ingevulde
 * vraag (openWithMessage → pendingMessage) vuurde het
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
// Per-test in te stellen useChat-status. Het opslag-effect vuurt alleen op de
// OVERGANG streaming/submitted → ready; een test die een afgeronde beurt wil
// zien moet die overgang dus echt maken.
let mockStatus: 'ready' | 'streaming' | 'submitted' | 'error' = 'ready'

// Mutabele chat-context — per test in te stellen
let ctx: Record<string, unknown> = {}

// Elke useChat(...)-aanroep wordt bewaard zodat een test kan verifiëren welke
// transport-instance (cloud vs. lokaal) daadwerkelijk werd doorgegeven.
// Sinds W-004 dragen de opties óók de gespreksidentiteit (`id`) en de
// hydratatie (`messages`). Beide worden bewaard, want de regressie-eis
// WF-WILL-24 gaat er letterlijk over: de vierde paneelmodus mag ze niet
// aanraken.
let mockUseChatCalls: Array<{ transport: unknown; id?: string; messages?: unknown[] }> = []

vi.mock('@ai-sdk/react', () => ({
  useChat: (opts: { transport: unknown; id?: string; messages?: unknown[] }) => {
    mockUseChatCalls.push(opts)
    return {
      messages: mockMessages,
      sendMessage: mockSendMessage,
      status: mockStatus,
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
    // W-004/C4: het paneel sluit hiermee de on-device conversatie af bij een
    // nieuw of hervat gesprek — zónder de gedeelde engine te slopen.
    resetConversation = vi.fn()
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

// De gespreksgeschiedenis-facade. Bewust gemockt: de echte zou hier de
// IndexedDB-rug openen (die jsdom niet heeft) én de serverroutes aanroepen,
// terwijl deze tests over het PANEEL gaan — welke beurten het wegschrijft, waar,
// en met welk volgnummer.
let facadeMock: FakeFacade
vi.mock('@/lib/chat/history/facade', () => ({
  createChatHistoryFacade: () => facadeMock,
}))

// MeldingView draagt de verzend-state; hier meldt hij meteen "bezig", zodat de
// sluit-blokkade (`meldingBezig`) in ChatPanel actief is.
vi.mock('./melding/melding-view', () => ({
  MeldingView: ({ onBezigChange }: { onBezigChange: (bezig: boolean) => void }) => {
    onBezigChange(true)
    return <div>melding-formulier</div>
  },
}))

// Vragenlijstmodus: de lijst wordt per test gestuurd, zodat de fetch-stubs van
// de overige tests niet ook /api/questionnaires hoeven te kennen.
// Sinds ADR 0147 leest ChatPanel het GEDEELDE signaal (één fetch voor chat-kop,
// teller en popup) i.p.v. zijn eigen hook — dus mocken we de provider-hook.
const vragenlijstenMock = vi.hoisted(() => ({
  lijsten: [] as { id: string }[],
  // Stabiele referentie: ChatPanel hangt `herlaad` aan een effect-dep.
  herlaad: () => {},
}))
vi.mock('@/components/app/vragenlijst/vragenlijst-signaal-provider', () => ({
  useVragenlijstSignaalOptional: () => ({
    lijsten: vragenlijstenMock.lijsten,
    openCount: vragenlijstenMock.lijsten.length,
    popupKandidaatId: null,
    geladen: true,
    herlaad: vragenlijstenMock.herlaad,
  }),
}))
vi.mock('./vragenlijst/vragenlijst-view', () => ({
  VragenlijstView: () => <div>vragenlijst-weergave</div>,
}))

vi.mock('@/components/app/feature-access-provider', () => ({
  useModuleAccess: () => ({ activeModules: ['inzicht_acties'], subscriptions: ['ai'] }),
}))

vi.mock('@/lib/feature-registry', () => ({
  hasSubscription: () => true,
}))

const NU = '2026-09-08T10:00:00.000Z'

type FakeFacade = ReturnType<typeof maakFacadeMock>

function maakMeta(over: Partial<ChatConversationMeta> = {}): ChatConversationMeta {
  return {
    id: 'gesprek-1',
    title: 'Hoeveel vrijheid heb ik?',
    origin: 'cloud',
    backend: 'server',
    messageCount: 0,
    nextSeq: 0,
    truncated: false,
    createdAt: NU,
    lastMessageAt: NU,
    ...over,
  }
}

/**
 * De dubbel van de facade. `backendVoorNieuwGesprek` draait op de ECHTE
 * `resolveBackend` — de privacyvloer hoort niet in een test nagebouwd te worden,
 * anders toetst hij zijn eigen kopie.
 */
function maakFacadeMock(over: Record<string, unknown> = {}) {
  const mode: ChatHistoryMode = 'account'
  return {
    list: vi.fn(async () => [] as ChatConversationMeta[]),
    load: vi.fn(async () => [] as StoredChatMessage[]),
    create: vi.fn(async (init: { title: string; origin: ChatOrigin }) =>
      maakMeta({
        id: 'nieuw-gesprek',
        title: init.title,
        origin: init.origin,
        backend: resolveBackend(mode, init.origin) === 'server' ? 'server' : 'apparaat',
      }),
    ),
    appendTurn: vi.fn(async (doel: { id: string; backend: 'server' | 'apparaat' }, berichten: StoredChatMessage[]) =>
      maakMeta({
        id: doel.id,
        backend: doel.backend,
        messageCount: berichten.length,
        nextSeq: berichten[berichten.length - 1].seq + 1,
      }),
    ),
    rename: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    removeAllDevice: vi.fn(async () => {}),
    deviceAantal: vi.fn(async () => 0),
    deviceBeschikbaar: vi.fn(async () => true),
    backendVoorNieuwGesprek: vi.fn((origin: ChatOrigin) => resolveBackend(mode, origin)),
    ...over,
  }
}

const WFT_KEY = 'trifinity-chat-wft-accepted'

/** Alles aanwezig — het tegenbeeld van `LEGE_DATA_GAPS`. */
const VOLLE_DATA_GAPS: CoachDataGaps = {
  hasBank: true,
  hasAssets: true,
  hasBudgets: true,
  hasGoals: true,
  hasDebts: true,
  hasTransactions: true,
  hasHoldings: true,
  hasHoldingsWithIsin: true,
  hasFireParams: true,
  hasLifeEvents: true,
}

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    isOpen: true,
    close: vi.fn(),
    pendingMessage: null,
    clearPendingMessage: mockClearPendingMessage,
    isPinned: false,
    togglePin: vi.fn(),
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
  mockStatus = 'ready'
  facadeMock = maakFacadeMock()
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
 * UR3-09 / ADR 0132: een `ai_provider_refused`-envelope (de provider weigert
 * zelf — tegoed op, sleutel ongeldig; `affordance: 'geen'` in error-copy.ts)
 * mag GEEN "Opnieuw proberen"-knop tonen — retry kan dit per definitie niet
 * oplossen. `describeAiThrown` leest de code uit de JSON-envelope in
 * `error.message` (spiegelt de andere describeAiThrown-tests in
 * lib/ai/error-copy.test.ts); chat-panel.tsx zelf is generiek over
 * `errorCopy.affordance` en is voor deze test niet gewijzigd.
 */
describe('ChatPanel — ai_provider_refused geeft geen retry-lus (UR3-09 / ADR 0132)', () => {
  beforeEach(() => {
    localStorage.setItem(WFT_KEY, 'true')
    stubExecutionFetch({ privacyMode: false })
    mockError = new Error(
      JSON.stringify({
        error: 'Fin werkt op dit moment niet. Dat ligt aan ons, niet aan jou — opnieuw proberen helpt nu niet.',
        code: 'ai_provider_refused',
      }),
    )
  })

  it('toont de foutmelding maar geen "Opnieuw proberen"-knop', async () => {
    render(<ChatPanel />)

    await waitFor(() => expect(screen.getByTestId('chat-error-banner')).toBeTruthy())
    expect(screen.getByText(/Fin werkt op dit moment niet/)).toBeTruthy()
    expect(screen.queryByTestId('chat-retry-button')).toBeNull()
    expect(screen.queryByTestId('chat-error-link')).toBeNull()
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

/**
 * W-004 — de vierde paneelmodus (`gesprekken`) en de gespreksidentiteit.
 *
 * DE ZWAARSTE REGRESSIE-EIS VAN DEZE WIJZIGING IS R1 / WF-WILL-24: het openen
 * van de gesprekkenlijst mag het LOPENDE gesprek niet aanraken. Concreet: de
 * `id` die naar `useChat` gaat blijft dezelfde en de hydratatie-array verandert
 * niet. Dat is precies het gedrag dat een refactor per ongeluk sloopt (een
 * `key` op de verkeerde plek, een `setMessages([])` bij het wisselen van modus),
 * en het is aan de buitenkant pas zichtbaar als iemand zijn halve gesprek
 * kwijt is.
 */
describe('ChatPanel — gesprekkenmodus laat het lopende gesprek intact (R1)', () => {
  const GESPREK = [
    { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hoeveel vrijheid heb ik?' }] },
    { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Ruim acht jaar.' }] },
  ]

  function laatsteUseChat() {
    return mockUseChatCalls[mockUseChatCalls.length - 1]
  }

  function renderMetGeschiedenis() {
    stubExecutionFetch({ privacyMode: false })
    localStorage.setItem(WFT_KEY, 'true')
    mockMessages = GESPREK
    ctx = makeCtx({ userId: 'gebruiker-a', chatHistoryMode: 'account', dataGaps: null })
    render(<ChatPanel />)
  }

  it('houdt conversationId én de hydratatie ongewijzigd bij heen-en-weer schakelen', async () => {
    renderMetGeschiedenis()

    const idVoor = laatsteUseChat().id
    const berichtenVoor = laatsteUseChat().messages
    expect(typeof idVoor).toBe('string')

    // Naar de gesprekkenlijst…
    fireEvent.click(screen.getByRole('button', { name: 'Je gesprekken' }))
    expect(await screen.findByRole('heading', { name: 'Je gesprekken' })).toBeInTheDocument()
    expect(laatsteUseChat().id).toBe(idVoor)
    expect(laatsteUseChat().messages).toEqual(berichtenVoor)

    // …en terug. Het gesprek staat er nog precies zo.
    fireEvent.click(screen.getByRole('button', { name: 'Terug naar de chat' }))
    expect(screen.getByText('Ruim acht jaar.')).toBeInTheDocument()
    expect(laatsteUseChat().id).toBe(idVoor)
    expect(laatsteUseChat().messages).toEqual(berichtenVoor)
  })

  it('"Nieuw gesprek" geeft wél een verse identiteit met een lege hydratatie (A3)', async () => {
    renderMetGeschiedenis()
    const idVoor = laatsteUseChat().id

    fireEvent.click(screen.getByRole('button', { name: 'Je gesprekken' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Nieuw gesprek' }))

    await waitFor(() => expect(laatsteUseChat().id).not.toBe(idVoor))
    expect(laatsteUseChat().messages).toEqual([])
  })

  it('toont de knop niet zonder ingelogde gebruiker — er is dan geen rug om in te kijken', async () => {
    stubExecutionFetch({ privacyMode: false })
    localStorage.setItem(WFT_KEY, 'true')
    ctx = makeCtx()
    render(<ChatPanel />)

    expect(screen.queryByRole('button', { name: 'Je gesprekken' })).not.toBeInTheDocument()
    await waitFor(() => expect(mockUseChatCalls.length).toBeGreaterThan(0))
  })
})

/**
 * De lege staat: de vaste tip-chip, de paginachip en de drie volzin-suggesties.
 * R6 zit hier in: de vijf oude CONTEXT_CHIPS-prompts bestaan nog, alleen niet
 * meer als tweede tabel in dit bestand.
 */
describe('ChatPanel — suggesties in de lege staat', () => {
  it('toont de vaste tip-chip, de paginachip van deze route en drie suggesties', async () => {
    stubExecutionFetch({ privacyMode: false })
    localStorage.setItem(WFT_KEY, 'true')
    ctx = makeCtx()
    render(<ChatPanel />)

    // usePathname is in deze suite gemockt op '/overzicht'; daar hoort géén
    // tip-chip bij (die vijf zijn route-specifieker), wél drie suggesties.
    expect(screen.getByRole('button', { name: 'Geef me een tip' })).toBeInTheDocument()
    expect(screen.getByText('Of vraag me eens:')).toBeInTheDocument()
    await waitFor(() => expect(mockUseChatCalls.length).toBeGreaterThan(0))
  })

  it('verstuurt de suggestie letterlijk zoals hij in de tabel staat', async () => {
    stubExecutionFetch({ privacyMode: false })
    localStorage.setItem(WFT_KEY, 'true')
    ctx = makeCtx()
    render(<ChatPanel />)

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Geef me een tip' })).not.toBeDisabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Geef me een tip' }))

    expect(mockSendMessage).toHaveBeenCalledWith({
      text: 'Geef me één concrete tip op basis van mijn huidige situatie. Begin met de grootste kans.',
    })
  })

  it('"andere vragen" toont een andere selectie zonder het gesprek te raken', async () => {
    stubExecutionFetch({ privacyMode: false })
    localStorage.setItem(WFT_KEY, 'true')
    // MET databeeld: sinds elke vraag die persoonlijke cijfers belooft een
    // datavereiste draagt (M4), houdt een leeg account alleen de handvol
    // uitlegvragen over — en dan is er per definitie niets te verversen. De
    // rotatie hoort thuis bij iemand die wél gegevens heeft.
    ctx = makeCtx({ dataGaps: VOLLE_DATA_GAPS })
    render(<ChatPanel />)

    const regels = () =>
      screen
        .getAllByRole('listitem')
        .map((li) => li.textContent ?? '')
        .join('|')

    // Pas klikken als de bestemming beslist is: tot dan staan de knoppen
    // fail-closed op slot en zou de klik niets doen.
    const verversKnop = screen.getByRole('button', { name: /andere vragen/i })
    await waitFor(() => expect(verversKnop).not.toBeDisabled())

    const voor = regels()
    fireEvent.click(verversKnop)
    expect(regels()).not.toBe(voor)
    expect(mockSendMessage).not.toHaveBeenCalled()
  })
})


/**
 * W-004, reparatieronde — de privacyvloer bij HERVATTEN (B1), het volgnummer
 * dat de rug bepaalt (H1) en het venster op de verzonden historie (M3).
 *
 * Deze drie hangen samen: ze gaan allemaal over wat er ná "hervatten" gebeurt.
 * Vóór die functie was een gesprek begrensd door de sessie en kon een lopend
 * gesprek nooit van bestemming wisselen; sindsdien kan het allebei, en dan telt
 * niet meer wat er ooit op het gesprek werd gezet maar waar het NU draait.
 */
describe('ChatPanel — hervatten: vloer, volgnummer en venster', () => {
  function laatsteUseChat() {
    return mockUseChatCalls[mockUseChatCalls.length - 1]
  }

  function bericht(seq: number, role: 'user' | 'assistant'): StoredChatMessage {
    return { seq, role, content: `bericht ${seq}`, richKinds: [], createdAt: NU }
  }

  /** Rondt één beurt af: streaming → ready, met vraag + antwoord in beeld. */
  async function voltooiBeurt(rerender: (ui: React.ReactElement) => void) {
    mockMessages = [
      { id: 'u9', role: 'user', parts: [{ type: 'text', text: 'En als ik dat verdubbel?' }] },
      { id: 'a9', role: 'assistant', parts: [{ type: 'text', text: 'Dan ruim negen jaar.' }] },
    ]
    mockStatus = 'streaming'
    rerender(<ChatPanel />)
    mockStatus = 'ready'
    rerender(<ChatPanel />)
  }

  async function openLijstEnHervat(titel: string) {
    fireEvent.click(screen.getByRole('button', { name: 'Je gesprekken' }))
    fireEvent.click(await screen.findByRole('button', { name: titel }))
  }

  it('B1 — een cloud-gesprek hervatten terwijl Fin lokaal draait SPLITST i.p.v. adopteert', async () => {
    mockCheckLocalAiCapability.mockResolvedValue({ ok: true, reasons: [], shaderF16: true, deviceMemoryGb: 8 })
    mockGetLocalModelState.mockResolvedValue({ state: 'klaar', bytes: null })
    stubExecutionFetch({ privacyMode: true })
    localStorage.setItem(WFT_KEY, 'true')
    const cloudGesprek = maakMeta({ id: 'cloud-1', title: 'Cloudgesprek', origin: 'cloud', backend: 'server' })
    facadeMock = maakFacadeMock({
      list: vi.fn(async () => [cloudGesprek]),
      load: vi.fn(async () => [bericht(0, 'user'), bericht(1, 'assistant')]),
    })
    // De opslagkeuze staat op 'account' — juist dán is de vloer aan zet.
    ctx = makeCtx({ userId: 'gebruiker-a', chatHistoryMode: 'account', dataGaps: null })
    render(<ChatPanel />)

    await waitFor(() => expect(mockLocalTransportInstances).toHaveLength(1))
    const idVoor = laatsteUseChat().id

    await openLijstEnHervat('Cloudgesprek')

    // Niet geladen, niet geadopteerd: een vers gesprek met een eerlijke uitleg.
    await waitFor(() => expect(laatsteUseChat().id).not.toBe(idVoor))
    expect(facadeMock.load).not.toHaveBeenCalled()
    expect(laatsteUseChat().id).not.toBe('cloud-1')
    expect(laatsteUseChat().messages).toEqual([])
    expect(screen.getByText(/Dat gesprek is in de cloud gevoerd/)).toBeInTheDocument()
  })

  it('B1 — de beurt zelf landt op de rug die bij de HUIDIGE uitvoering hoort', async () => {
    mockCheckLocalAiCapability.mockResolvedValue({ ok: true, reasons: [], shaderF16: true, deviceMemoryGb: 8 })
    mockGetLocalModelState.mockResolvedValue({ state: 'klaar', bytes: null })
    stubExecutionFetch({ privacyMode: true })
    localStorage.setItem(WFT_KEY, 'true')
    ctx = makeCtx({ userId: 'gebruiker-a', chatHistoryMode: 'account', dataGaps: null })
    const { rerender } = render(<ChatPanel />)
    await waitFor(() => expect(mockLocalTransportInstances).toHaveLength(1))

    await voltooiBeurt(rerender)

    // Modus 'account' + lokaal gevoerd ⇒ de vloer stuurt 'm naar het apparaat.
    await waitFor(() => expect(facadeMock.create).toHaveBeenCalledTimes(1))
    expect(facadeMock.create.mock.calls[0][0].origin).toBe('lokaal')
    expect(facadeMock.backendVoorNieuwGesprek).toHaveBeenCalledWith('lokaal')
    await waitFor(() => expect(facadeMock.appendTurn).toHaveBeenCalledTimes(1))
    expect(facadeMock.appendTurn.mock.calls[0][0].backend).toBe('apparaat')
  })

  it('H1 — het volgnummer komt van de rug, niet van een clientteller', async () => {
    stubExecutionFetch({ privacyMode: false })
    localStorage.setItem(WFT_KEY, 'true')
    const bestaand = maakMeta({
      id: 'cloud-2',
      title: 'Lang gesprek',
      messageCount: 12,
      nextSeq: 12,
    })
    facadeMock = maakFacadeMock({
      list: vi.fn(async () => [bestaand]),
      load: vi.fn(async () =>
        Array.from({ length: 12 }, (_, i) => bericht(i, i % 2 === 0 ? 'user' : 'assistant')),
      ),
      // De rug hertelt en springt bewust NIET naar 14: alleen een client die de
      // teruggegeven waarde adopteert komt hierna op 99 uit.
      appendTurn: vi.fn(async () => maakMeta({ id: 'cloud-2', messageCount: 14, nextSeq: 99 })),
    })
    ctx = makeCtx({ userId: 'gebruiker-a', chatHistoryMode: 'account', dataGaps: null })
    const { rerender } = render(<ChatPanel />)
    await waitFor(() => expect(mockUseChatCalls.length).toBeGreaterThan(0))

    await openLijstEnHervat('Lang gesprek')
    await waitFor(() => expect(laatsteUseChat().id).toBe('cloud-2'))

    await voltooiBeurt(rerender)
    await waitFor(() => expect(facadeMock.appendTurn).toHaveBeenCalledTimes(1))
    // Verdergaan waar het gesprek gebleven was — niet op 0.
    expect(facadeMock.appendTurn.mock.calls[0][1].map((b: StoredChatMessage) => b.seq)).toEqual([12, 13])

    mockStatus = 'ready'
    rerender(<ChatPanel />)
    await voltooiBeurt(rerender)
    await waitFor(() => expect(facadeMock.appendTurn).toHaveBeenCalledTimes(2))
    expect(facadeMock.appendTurn.mock.calls[1][1].map((b: StoredChatMessage) => b.seq)).toEqual([99, 100])
  })

  it('H1 — een gesprek dat niet opgehaald kan worden wordt NIET hervat', async () => {
    stubExecutionFetch({ privacyMode: false })
    localStorage.setItem(WFT_KEY, 'true')
    facadeMock = maakFacadeMock({
      list: vi.fn(async () => [maakMeta({ id: 'cloud-3', title: 'Onbereikbaar', nextSeq: 12 })]),
      load: vi.fn(async () => {
        throw new Error('netwerk weg')
      }),
    })
    ctx = makeCtx({ userId: 'gebruiker-a', chatHistoryMode: 'account', dataGaps: null })
    const { rerender } = render(<ChatPanel />)
    await waitFor(() => expect(mockUseChatCalls.length).toBeGreaterThan(0))
    const idVoor = laatsteUseChat().id

    await openLijstEnHervat('Onbereikbaar')

    // Blijft in de lijst staan, mét melding — half hervatten zou de volgende
    // beurt op bezette volgnummers laten schrijven.
    expect(await screen.findByRole('alert')).toHaveTextContent(/kon niet worden opgehaald/i)
    expect(laatsteUseChat().id).toBe(idVoor)
    expect(screen.getByRole('heading', { name: 'Je gesprekken' })).toBeInTheDocument()

    // En er wordt niets weggeschreven op het gesprek dat niet geladen is.
    await voltooiBeurt(rerender)
    await waitFor(() => expect(facadeMock.create).toHaveBeenCalledTimes(1))
    expect(facadeMock.create.mock.calls[0][0].origin).toBe('cloud')
    expect(facadeMock.appendTurn.mock.calls[0][1].map((b: StoredChatMessage) => b.seq)).toEqual([0, 1])
  })

  it('H2 — een lokaal hervat gesprek zegt eerlijk dat Fin zonder geheugen begint', async () => {
    mockCheckLocalAiCapability.mockResolvedValue({ ok: true, reasons: [], shaderF16: true, deviceMemoryGb: 8 })
    mockGetLocalModelState.mockResolvedValue({ state: 'klaar', bytes: null })
    stubExecutionFetch({ privacyMode: true })
    localStorage.setItem(WFT_KEY, 'true')
    facadeMock = maakFacadeMock({
      list: vi.fn(async () => [
        maakMeta({ id: 'lokaal-1', title: 'Op mijn toestel', origin: 'lokaal', backend: 'apparaat', nextSeq: 2 }),
      ]),
      load: vi.fn(async () => [bericht(0, 'user'), bericht(1, 'assistant')]),
    })
    ctx = makeCtx({ userId: 'gebruiker-a', chatHistoryMode: 'apparaat', dataGaps: null })
    render(<ChatPanel />)
    await waitFor(() => expect(mockLocalTransportInstances).toHaveLength(1))

    // Het transcript staat in de useChat-hydratatie; de weergave komt uit de
    // gemockte messages, dus die zetten we gelijk aan wat er hervat wordt.
    mockMessages = [
      { id: 'lokaal-1:0', role: 'user', parts: [{ type: 'text', text: 'bericht 0' }] },
      { id: 'lokaal-1:1', role: 'assistant', parts: [{ type: 'text', text: 'bericht 1' }] },
    ]
    await openLijstEnHervat('Op mijn toestel')

    expect(await screen.findByText(/begint zonder geheugen/i)).toBeInTheDocument()
    expect(laatsteUseChat().id).toBe('lokaal-1')
  })

  it('M3 — de cloud-transport stuurt hooguit tien beurten mee, beginnend bij een vraag', async () => {
    stubExecutionFetch({ privacyMode: false })
    localStorage.setItem(WFT_KEY, 'true')
    ctx = makeCtx({ userId: 'gebruiker-a', chatHistoryMode: 'account', dataGaps: null })
    render(<ChatPanel />)
    await waitFor(() => expect(mockUseChatCalls.length).toBeGreaterThan(0))

    const transport = laatsteUseChat().transport as { opts: Record<string, unknown> }
    const prepare = transport.opts.prepareSendMessagesRequest as (o: {
      id: string
      messages: unknown[]
      body: Record<string, unknown>
      trigger: string
      messageId: string | undefined
    }) => { body: Record<string, unknown> }
    expect(typeof prepare).toBe('function')

    // Een hervat gesprek van 60 berichten: zonder venster ging dát bij ELKE
    // beurt opnieuw over de lijn.
    const lang = Array.from({ length: 60 }, (_, i) => ({
      id: `m${i}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      parts: [{ type: 'text', text: `bericht ${i}` }],
    }))
    const { body } = prepare({
      id: 'c1',
      messages: lang,
      body: { domain: 'wil' },
      trigger: 'submit-message',
      messageId: undefined,
    })
    const verzonden = body.messages as Array<{ id: string; role: string }>
    expect(verzonden.length).toBeLessThanOrEqual(20)
    expect(verzonden[0].role).toBe('user')
    expect(verzonden[verzonden.length - 1].id).toBe('m59')
    // Het domein blijft meegaan — de route leest dat uit dezelfde body.
    expect(body.domain).toBe('wil')

    // Een kort gesprek gaat ongewijzigd mee.
    const kort = lang.slice(0, 4)
    expect((prepare({ id: 'c1', messages: kort, body: {}, trigger: 'submit-message', messageId: undefined }).body.messages as unknown[]).length).toBe(4)
  })
})

/**
 * Vragenlijst in de chat bij Fin — de vijfde modus. Het icoon verschijnt alleen
 * als er een actieve vragenlijst klaarstaat, schakelt heen en terug en valt —
 * net als melden en de gids — buiten de AI-gates.
 */
describe('ChatPanel — vragenlijst in de chat-kop', () => {
  afterEach(() => {
    vragenlijstenMock.lijsten = []
  })

  it('toont géén vragenlijst-icoon zonder actieve vragenlijst', async () => {
    localStorage.setItem(WFT_KEY, 'true')
    stubExecutionFetch({ privacyMode: false })
    ctx = makeCtx()
    render(<ChatPanel />)

    await screen.findByRole('button', { name: 'Melding maken' })
    expect(screen.queryByRole('button', { name: 'Vragenlijst invullen' })).not.toBeInTheDocument()
  })

  it('toont het icoon bij een actieve lijst en schakelt heen en terug', async () => {
    vragenlijstenMock.lijsten = [{ id: 'q1' }]
    localStorage.setItem(WFT_KEY, 'true')
    stubExecutionFetch({ privacyMode: false })
    ctx = makeCtx()
    render(<ChatPanel />)

    const knop = await screen.findByRole('button', { name: 'Vragenlijst invullen' })
    expect(knop.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(knop)

    await waitFor(() => expect(screen.getByText('vragenlijst-weergave')).toBeInTheDocument())
    const terug = screen.getByRole('button', { name: 'Terug naar de chat' })
    expect(terug.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(terug)
    expect(screen.queryByText('vragenlijst-weergave')).not.toBeInTheDocument()
  })

  it('werkt ZONDER AI-abonnement — de vragenlijst staat buiten de AI-gates', async () => {
    vragenlijstenMock.lijsten = [{ id: 'q1' }]
    stubExecutionFetch({ privacyMode: false, hasAiSubscription: false })
    ctx = makeCtx()
    render(<ChatPanel />)

    fireEvent.click(await screen.findByRole('button', { name: 'Vragenlijst invullen' }))
    await waitFor(() => expect(screen.getByText('vragenlijst-weergave')).toBeInTheDocument())
    expect(screen.queryByText('Belangrijke mededeling')).not.toBeInTheDocument()
  })
})
