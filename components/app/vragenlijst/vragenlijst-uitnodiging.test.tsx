/**
 * De uitnodigings-popup (ADR 0147). Wat hier vastligt is niet de opmaak maar de
 * omgangsvorm: hij wacht op rust, claimt dan het aandachtsregister, vraagt het
 * hoogstens één keer per sessie, en elk van de drie knoppen betekent iets anders
 * voor de server.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

const signaal = vi.hoisted(() => ({
  lijsten: [] as Array<Record<string, unknown>>,
  openCount: 0,
  popupKandidaatId: null as string | null,
  geladen: true,
  herlaad: vi.fn(),
}))
vi.mock('./vragenlijst-signaal-provider', () => ({
  useVragenlijstSignaal: () => signaal,
}))

const chat = vi.hoisted(() => ({ openVragenlijst: vi.fn() }))
vi.mock('@/components/app/chat/chat-provider', () => ({
  useChatContext: () => chat,
}))

const quiet = vi.hoisted(() => ({ waarde: false }))
vi.mock('@/lib/hooks/use-attention-quiet', () => ({
  useAttentionQuiet: () => quiet.waarde,
}))

const attention = vi.hoisted(() => ({ claim: vi.fn((_id: string) => () => {}) }))
vi.mock('@/lib/attention-signal', () => ({
  claimAttention: (id: string) => attention.claim(id),
}))

const pad = vi.hoisted(() => ({ waarde: '/overzicht' }))
vi.mock('next/navigation', () => ({
  usePathname: () => pad.waarde,
}))

import { VragenlijstUitnodiging } from './vragenlijst-uitnodiging'

const QID = 'q-1'

const LIJST = {
  id: QID,
  title: 'Eerste indruk',
  description: 'Vijf vragen over je eerste week.',
  question_count: 5,
  answered_count: 0,
  has_open_session: false,
  has_completed: false,
  open: true,
}

let fetchSpy: ReturnType<typeof vi.fn>

function patches() {
  return fetchSpy.mock.calls.map(([url, init]) => ({
    url: String(url),
    body: init?.body ? (JSON.parse(init.body as string) as { actie: string }) : null,
  }))
}

beforeEach(() => {
  vi.useFakeTimers()
  sessionStorage.clear()
  signaal.lijsten = [LIJST]
  signaal.popupKandidaatId = QID
  signaal.herlaad = vi.fn()
  chat.openVragenlijst = vi.fn()
  quiet.waarde = false
  pad.waarde = '/overzicht'
  attention.claim = vi.fn((_id: string) => () => {})
  fetchSpy = vi.fn(() =>
    Promise.resolve(new Response(JSON.stringify({ invitation: null }), { status: 200 })),
  )
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** Laat de rustperiode verstrijken. */
function wachtRust() {
  act(() => { vi.advanceTimersByTime(3000) })
}

/**
 * Leeg de microtask-wachtrij. Bewust GEEN `waitFor`: die leunt zelf op timers
 * en loopt onder `vi.useFakeTimers()` vast, terwijl de keten hier puur uit
 * promises bestaat (fetch → .then(herlaad)).
 */
async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve()
  })
}

describe('VragenlijstUitnodiging', () => {
  it('toont niets zonder kandidaat', () => {
    signaal.popupKandidaatId = null
    render(<VragenlijstUitnodiging />)
    wachtRust()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('verschijnt pas ná de rustperiode, met de titel van de lijst', () => {
    render(<VragenlijstUitnodiging />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    wachtRust()

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText('Eerste indruk')).toBeInTheDocument()
    // Het tonen zelf is een 'gezien' voor de server — anders loopt de cooldown niet.
    expect(patches()).toEqual([
      { url: `/api/questionnaires/${QID}/uitnodiging`, body: { actie: 'gezien' } },
    ])
  })

  it('claimt het aandachtsregister zolang hij openstaat', () => {
    render(<VragenlijstUitnodiging />)
    wachtRust()
    expect(attention.claim).toHaveBeenCalledWith('vragenlijst-uitnodiging')
  })

  it('zwijgt zolang een andere laag de aandacht heeft', () => {
    quiet.waarde = true
    render(<VragenlijstUitnodiging />)
    wachtRust()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('zwijgt in het beheer', () => {
    pad.waarde = '/beheer/vragenlijsten'
    render(<VragenlijstUitnodiging />)
    wachtRust()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('"Later" sluit en meldt uitstel', async () => {
    render(<VragenlijstUitnodiging />)
    wachtRust()

    fireEvent.click(screen.getByRole('button', { name: 'Later' }))

    expect(patches().at(-1)).toEqual({
      url: `/api/questionnaires/${QID}/uitnodiging`,
      body: { actie: 'later' },
    })
    await flush()
    expect(signaal.herlaad).toHaveBeenCalled()
  })

  it('"Niet meer vragen" meldt een definitieve weigering', async () => {
    render(<VragenlijstUitnodiging />)
    wachtRust()

    fireEvent.click(screen.getByRole('button', { name: 'Niet meer vragen' }))

    expect(patches().at(-1)).toEqual({
      url: `/api/questionnaires/${QID}/uitnodiging`,
      body: { actie: 'niet_meer' },
    })
    await flush()
    expect(signaal.herlaad).toHaveBeenCalled()
  })

  it('"Nu invullen" opent de vragenlijst in de chat', () => {
    render(<VragenlijstUitnodiging />)
    wachtRust()

    fireEvent.click(screen.getByRole('button', { name: 'Nu invullen' }))

    expect(chat.openVragenlijst).toHaveBeenCalledWith(QID)
    // Geen tweede PATCH: "Nu invullen" is geen weigering.
    expect(patches().map((p) => p.body?.actie)).toEqual(['gezien'])
  })

  it('vraagt het deze sessie geen tweede keer', () => {
    const eerste = render(<VragenlijstUitnodiging />)
    wachtRust()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    eerste.unmount()

    render(<VragenlijstUitnodiging />)
    wachtRust()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
