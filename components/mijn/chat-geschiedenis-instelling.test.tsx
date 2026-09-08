import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { ChatGeschiedenisInstelling } from './chat-geschiedenis-instelling'

/**
 * "Gesprekken met Fin" op /mijn/privacy (W-004, M5 + L3).
 *
 * WAT HIER VAST MOET STAAN. "Verwijder mijn gesprekken" telde alleen de
 * servergesprekken en riep alleen de serverroute aan. Wie op 'apparaat' bewaart
 * kreeg daardoor een knop die zegt te wissen wat hij niet aanraakt — en bij nul
 * servergesprekken bood het uitzet-scherm nog steeds "Verwijder ze nu" aan
 * iemand met twintig gesprekken in IndexedDB. De teller en de handeling moeten
 * allebei de twee stapels dekken.
 *
 * En: de knoppen van een bevestiging horen in de STICKY footer van de overlay,
 * niet onderaan de scroll-content (modal-conventie).
 */

const facadeMock = {
  list: vi.fn(async () => []),
  load: vi.fn(async () => []),
  create: vi.fn(async () => null),
  appendTurn: vi.fn(async () => null),
  rename: vi.fn(async () => {}),
  remove: vi.fn(async () => {}),
  removeAllDevice: vi.fn(async () => {}),
  deviceAantal: vi.fn(async () => 0),
  deviceBeschikbaar: vi.fn(async () => true),
  backendVoorNieuwGesprek: vi.fn(() => 'apparaat' as const),
}

vi.mock('@/lib/chat/history/facade', () => ({
  createChatHistoryFacade: () => facadeMock,
}))

vi.mock('@/components/app/chat/chat-provider', () => ({
  useChatContextOptional: () => ({ userId: 'gebruiker-a', chatHistoryMode: 'apparaat' }),
}))

// De overlay zelf is elders getest; hier gaat het om WAAR de knoppen landen.
// De `footer`-prop rendert daarom in een eigen testid — dat is de sticky voet.
vi.mock('@/components/app/shell/shell-overlay', () => ({
  ShellOverlay: ({
    open,
    title,
    footer,
    children,
  }: {
    open: boolean
    title?: string
    footer?: React.ReactNode
    children: React.ReactNode
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        <div data-testid="overlay-content">{children}</div>
        <div data-testid="overlay-footer">{footer}</div>
      </div>
    ) : null,
}))

function stubFetch(serverConversationCount: number) {
  const fn = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/chat/history-settings' && (!init || init.method !== 'PUT')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ mode: 'apparaat', serverConversationCount }),
      })
    }
    if (url === '/api/chat/history-settings' && init?.method === 'PUT') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ mode: 'apparaat', deleted: serverConversationCount }),
      })
    }
    return Promise.reject(new Error(`onverwachte fetch in test: ${url}`))
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

beforeEach(() => {
  facadeMock.removeAllDevice.mockClear()
  facadeMock.deviceAantal.mockReset()
  facadeMock.deviceAantal.mockResolvedValue(0)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ChatGeschiedenisInstelling — twee stapels, één knop', () => {
  it('telt de gesprekken op dit apparaat mee in de regel én in de knop', async () => {
    facadeMock.deviceAantal.mockResolvedValue(20)
    stubFetch(0)
    render(<ChatGeschiedenisInstelling />)

    // Nul op het account, twintig op dit toestel: precies het geval waarin de
    // oude tekst "Er staan nu geen gesprekken op je account" beweerde en de knop
    // op slot stond.
    expect(
      await screen.findByText('Je hebt 0 gesprekken op je account en 20 gesprekken op dit apparaat.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Verwijder mijn gesprekken' })).not.toBeDisabled()
  })

  it('zonder enig gesprek blijft de wisknop op slot', async () => {
    facadeMock.deviceAantal.mockResolvedValue(0)
    stubFetch(0)
    render(<ChatGeschiedenisInstelling />)

    expect(await screen.findByText('Je hebt nu geen bewaarde gesprekken.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Verwijder mijn gesprekken' })).toBeDisabled()
  })

  it('wist bij "Ja, verwijderen" ook de apparaatrug, en zet de knoppen in de sticky footer', async () => {
    facadeMock.deviceAantal.mockResolvedValue(3)
    const fetchSpy = stubFetch(2)
    render(<ChatGeschiedenisInstelling />)

    fireEvent.click(await screen.findByRole('button', { name: 'Verwijder mijn gesprekken' }))

    const voet = await screen.findByTestId('overlay-footer')
    // L3 — de bevestigingsknoppen staan in de footer-prop, niet in de content.
    const bevestig = within(voet).getByRole('button', { name: 'Ja, verwijderen' })
    expect(within(voet).getByRole('button', { name: 'Annuleren' })).toBeInTheDocument()
    expect(
      within(screen.getByTestId('overlay-content')).queryByRole('button', { name: 'Ja, verwijderen' }),
    ).not.toBeInTheDocument()

    fireEvent.click(bevestig)

    await waitFor(() => expect(facadeMock.removeAllDevice).toHaveBeenCalledTimes(1))
    const put = fetchSpy.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'PUT')
    expect(put).toBeDefined()
    expect(JSON.parse((put![1] as RequestInit).body as string)).toMatchObject({ deleteExisting: true })
    // 2 op het account + 3 op dit toestel worden samen gemeld.
    expect(await screen.findByRole('status')).toHaveTextContent('5 gesprekken zijn verwijderd')
  })
})
