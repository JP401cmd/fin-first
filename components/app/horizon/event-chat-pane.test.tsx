import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { EventChatPane } from './event-chat-pane'
import { resolveAllExecutionModes } from '@/lib/ai/execution-groups'

/**
 * De brainstorm-pane ("Wat heb je in gedachten?") postte rechtstreeks naar
 * /api/ai/chat, zónder enige privacy-afhandeling. Twee gevolgen:
 *  (1) bij een override 'gesprek' = 'lokaal' vertrok hier alsnog een cloud-call;
 *  (2) bij een hoofdschakelaar op lokaal kreeg de gebruiker een kale streamfout.
 *
 * Sinds ADR 0078 gate't dit oppervlak op `useExecutionMode('gesprek')`:
 * fail-closed (alleen `canUseCloud` opent de invoer) en een eerlijke melding bij
 * lokaal/blocked. Een lokaal transport krijgt deze pane bewust NIET — hij leunt
 * op de `suggestLifeEvent`-tool, die het on-device model niet kent.
 */

const mockSendMessage = vi.fn()

vi.mock('@ai-sdk/react', () => ({
  useChat: () => ({
    messages: [],
    sendMessage: mockSendMessage,
    status: 'ready',
  }),
}))

vi.mock('ai', () => ({
  DefaultChatTransport: class {
    constructor(_opts: unknown) {}
  },
}))

// jsdom kent geen WebGPU/modelcache; zonder deze mocks resolvet elke lokale
// keuze naar 'blocked' en wordt de 'lokaal'-tak nooit geraakt.
let localReady = true
vi.mock('@/lib/ai/local/webgpu-capability', () => ({
  checkLocalAiCapability: () =>
    Promise.resolve({
      ok: localReady,
      reasons: localReady ? [] : ['Je browser ondersteunt WebGPU niet.'],
      shaderF16: localReady,
      deviceMemoryGb: 8,
    }),
}))
vi.mock('@/lib/ai/local/model-manager', () => ({
  getLocalModelState: () =>
    Promise.resolve({ state: localReady ? 'klaar' : 'niet-gedownload', bytes: null }),
}))

/** Stubt GET /api/ai-execution-prefs met de CANONIEKE resolver voor `modes`. */
function stubExecutionFetch(opts: {
  privacyMode?: boolean
  gesprek?: 'lokaal' | 'cloud' | null
  hasAiSubscription?: boolean
} = {}) {
  const { privacyMode = false, gesprek = null, hasAiSubscription = true } = opts
  const prefs = gesprek ? { gesprek } : {}
  const fn = vi.fn((url: string) => {
    if (String(url) === '/api/ai-execution-prefs') {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            privacyMode,
            prefs,
            modes: resolveAllExecutionModes({ privacy_mode: privacyMode, ai_execution_prefs: prefs }),
            hasAiSubscription,
            aiEnabled: true,
          }),
      })
    }
    return Promise.reject(new Error(`onverwachte fetch in test: ${url}`))
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

const OPEN_PLACEHOLDER = /vertel fin wat je in gedachten hebt/i
const BLOCKED_PLACEHOLDER = /niet beschikbaar/i
const LOKAAL_RE = /draaien op je eigen toestel/i

function renderPane() {
  return render(<EventChatPane events={[]} onAcceptSuggestion={vi.fn()} />)
}

beforeEach(() => {
  mockSendMessage.mockReset()
  localReady = true
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('EventChatPane — fail-closed zonder cloud-groen licht', () => {
  it('cloud: invoer open en een starter-vraag vertrekt gewoon', async () => {
    stubExecutionFetch({ privacyMode: false })
    renderPane()

    const textarea = (await screen.findByPlaceholderText(OPEN_PLACEHOLDER)) as HTMLTextAreaElement
    await waitFor(() => expect(textarea).not.toBeDisabled())
    expect(screen.queryByText(LOKAAL_RE)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Een sabbatical' }))
    expect(mockSendMessage).toHaveBeenCalledTimes(1)
  })

  it('lokaal: eerlijke melding, invoer + starter-vragen uit, GEEN cloud-verzending', async () => {
    stubExecutionFetch({ privacyMode: true })
    renderPane()

    expect(await screen.findByText(LOKAAL_RE)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(BLOCKED_PLACEHOLDER)).toBeDisabled()

    const starter = screen.getByRole('button', { name: 'Een sabbatical' })
    expect(starter).toBeDisabled()
    fireEvent.click(starter)
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('blocked: de concrete reden uit de hook, nog steeds geen cloud-uitwijk', async () => {
    localReady = false
    stubExecutionFetch({ privacyMode: true })
    renderPane()

    expect(await screen.findByText(/Je browser ondersteunt WebGPU niet/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(BLOCKED_PLACEHOLDER)).toBeDisabled()
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('modus nog onbekend (fetch hangt) → fail-closed: niets verstuurd', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    renderPane()

    const textarea = screen.getByPlaceholderText(BLOCKED_PLACEHOLDER) as HTMLTextAreaElement
    expect(textarea).toBeDisabled()

    fireEvent.change(textarea, { target: { value: 'Ik wil een wereldreis' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    expect(mockSendMessage).not.toHaveBeenCalled()
  })
})

describe('EventChatPane — per-groep-override wint van de hoofdschakelaar (ADR 0078)', () => {
  it('(a) hoofdschakelaar CLOUD + groep "gesprek" LOKAAL → geblokkeerd, geen cloud-verzending', async () => {
    stubExecutionFetch({ privacyMode: false, gesprek: 'lokaal' })
    renderPane()

    expect(await screen.findByText(LOKAAL_RE)).toBeInTheDocument()
    const starter = screen.getByRole('button', { name: 'Een grote reis' })
    expect(starter).toBeDisabled()
    fireEvent.click(starter)
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('(b) hoofdschakelaar LOKAAL + groep "gesprek" CLOUD → gewoon het cloudpad', async () => {
    stubExecutionFetch({ privacyMode: true, gesprek: 'cloud' })
    renderPane()

    const textarea = (await screen.findByPlaceholderText(OPEN_PLACEHOLDER)) as HTMLTextAreaElement
    await waitFor(() => expect(textarea).not.toBeDisabled())
    expect(screen.queryByText(LOKAAL_RE)).not.toBeInTheDocument()

    fireEvent.change(textarea, { target: { value: 'Ik wil een huis kopen' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    expect(mockSendMessage).toHaveBeenCalledWith({ text: 'Ik wil een huis kopen' })
  })
})
