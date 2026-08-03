import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { WhatIfChat } from './whatif-chat'
import { resolveAllExecutionModes } from '@/lib/ai/execution-groups'

/**
 * De WhatIfChat houdt bewust zijn eigen CLOUD-transport (/api/ai/chat). Draait de
 * groep 'gesprek' lokaal, dan wordt dit oppervlak eerlijk geblokkeerd — invoer +
 * verzendknop uit, met een melding — i.p.v. stil naar de cloud te gaan of te
 * stranden op een server-403.
 *
 * REGRESSIE (ADR 0078). Dit component las `usePrivacyMode()`: een cosmetische,
 * per-proces gecachte singleton die alleen de HOOFDSCHAKELAAR kent. Twee gaten:
 *  (1) een per-groep-override op "Gesprek met Fin" deed hier niets;
 *  (2) zolang de lezing liep (null) stond de invoer gewoon open — precies het
 *      venster waarin er alsnog een cloud-aanroep kon vertrekken.
 * Sinds de overstap naar `useExecutionMode('gesprek')` gelden beide richtingen
 * van de voorrangsregel én is 'resolving' fail-closed.
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

// jsdom heeft geen WebGPU en geen modelcache. Zonder deze twee mocks resolvet de
// hook bij een lokale keuze altijd naar 'blocked' en zou de 'lokaal'-tak nooit
// getoetst worden. Per test omzetbaar via `localReady`.
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

/**
 * Stubt GET /api/ai-execution-prefs. De `modes`-map komt uit de CANONIEKE
 * resolver (exact wat de route doet), zodat deze tests de echte voorrangsregel
 * toetsen en niet een in de test nagebouwde variant.
 */
function stubExecutionFetch(opts: {
  privacyMode?: boolean
  gesprek?: 'lokaal' | 'cloud' | null
  /** De hook eist dit veld expliciet; zonder boolean blijft hij in 'resolving'. */
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
          }),
      })
    }
    return Promise.reject(new Error(`onverwachte fetch in test: ${url}`))
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

const OPEN_PLACEHOLDER = /wat zijn je dromen/i
const BLOCKED_PLACEHOLDER = /niet beschikbaar/i
const LOKAAL_RE = /draaien op je eigen toestel/i

beforeEach(() => {
  mockSendMessage.mockReset()
  localReady = true
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('WhatIfChat — fail-closed zonder cloud-groen licht', () => {
  it('groep "gesprek" op LOKAAL: melding zichtbaar, invoer uit, submit onmogelijk', async () => {
    stubExecutionFetch({ privacyMode: true })
    render(<WhatIfChat onAddEvent={vi.fn()} />)

    expect(await screen.findByText(LOKAAL_RE)).toBeInTheDocument()

    const textarea = screen.getByPlaceholderText(BLOCKED_PLACEHOLDER) as HTMLTextAreaElement
    expect(textarea).toBeDisabled()
    // In de lege staat is de verzendknop de enige knop.
    expect(screen.getByRole('button')).toBeDisabled()

    // Zelfs een Enter-toets stuurt niets naar de cloud.
    fireEvent.change(textarea, { target: { value: 'Ik wil een wereldreis maken' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('groep "gesprek" op CLOUD: wat-als werkt gewoon', async () => {
    stubExecutionFetch({ privacyMode: false })
    render(<WhatIfChat onAddEvent={vi.fn()} />)

    const textarea = (await screen.findByPlaceholderText(OPEN_PLACEHOLDER)) as HTMLTextAreaElement
    await waitFor(() => expect(textarea).not.toBeDisabled())
    expect(screen.queryByText(LOKAAL_RE)).not.toBeInTheDocument()

    fireEvent.change(textarea, { target: { value: 'Ik wil een wereldreis maken' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    expect(mockSendMessage).toHaveBeenCalledWith({ text: 'Ik wil een wereldreis maken' })
  })

  it('modus nog onbekend (fetch hangt) → FAIL-CLOSED: invoer uit, niets verstuurd', () => {
    // Dit was de oude val: usePrivacyMode gaf `null` tijdens het laden en het
    // oppervlak liet de invoer dan gewoon open staan.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    render(<WhatIfChat onAddEvent={vi.fn()} />)

    const textarea = screen.getByPlaceholderText(BLOCKED_PLACEHOLDER) as HTMLTextAreaElement
    expect(textarea).toBeDisabled()

    fireEvent.change(textarea, { target: { value: 'Ik wil een wereldreis maken' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('lokaal gekozen maar toestel kan het niet ("blocked") → de concrete reden, nog steeds geen cloud', async () => {
    localReady = false
    stubExecutionFetch({ privacyMode: true })
    render(<WhatIfChat onAddEvent={vi.fn()} />)

    expect(await screen.findByText(/Je browser ondersteunt WebGPU niet/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(BLOCKED_PLACEHOLDER)).toBeDisabled()
    expect(mockSendMessage).not.toHaveBeenCalled()
  })
})

describe('WhatIfChat — per-groep-override wint van de hoofdschakelaar (ADR 0078)', () => {
  it('(a) hoofdschakelaar CLOUD + groep "gesprek" LOKAAL → geblokkeerd, geen cloud-verzending', async () => {
    stubExecutionFetch({ privacyMode: false, gesprek: 'lokaal' })
    render(<WhatIfChat onAddEvent={vi.fn()} />)

    expect(await screen.findByText(LOKAAL_RE)).toBeInTheDocument()
    const textarea = screen.getByPlaceholderText(BLOCKED_PLACEHOLDER) as HTMLTextAreaElement
    expect(textarea).toBeDisabled()

    fireEvent.change(textarea, { target: { value: 'Ik wil een sabbatical' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('(b) hoofdschakelaar LOKAAL + groep "gesprek" CLOUD → gewoon het cloudpad', async () => {
    stubExecutionFetch({ privacyMode: true, gesprek: 'cloud' })
    render(<WhatIfChat onAddEvent={vi.fn()} />)

    const textarea = (await screen.findByPlaceholderText(OPEN_PLACEHOLDER)) as HTMLTextAreaElement
    await waitFor(() => expect(textarea).not.toBeDisabled())
    expect(screen.queryByText(LOKAAL_RE)).not.toBeInTheDocument()

    fireEvent.change(textarea, { target: { value: 'Ik wil een sabbatical' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    expect(mockSendMessage).toHaveBeenCalledWith({ text: 'Ik wil een sabbatical' })
  })
})
