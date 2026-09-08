import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { GesprekkenLijst } from './gesprekken-lijst'
import type { ChatHistoryFacade } from '@/lib/chat/history/facade'
import type { ChatConversationMeta } from '@/lib/chat/history/types'

/**
 * De gesprekkenlijst (W-004, A4/A5).
 *
 * De lijst is het enige oppervlak waar de twee ruggen zichtbaar samenkomen. Wat
 * hier vast moet staan: beide ruggen door elkaar op recentheid, een "lokaal"-
 * markering waar die hoort, verwijderen met één bevestiging dat de rest
 * ongemoeid laat, en een lege staat die één regel uitleg geeft in plaats van
 * een foutmelding.
 */

function meta(over: Partial<ChatConversationMeta> = {}): ChatConversationMeta {
  return {
    id: 'g-1',
    title: 'Hoeveel vrijheid heb ik?',
    origin: 'cloud',
    backend: 'server',
    messageCount: 4,
    nextSeq: 4,
    truncated: false,
    createdAt: '2026-09-01T10:00:00.000Z',
    lastMessageAt: '2026-09-01T10:00:00.000Z',
    ...over,
  }
}

function maakFacade(over: Partial<ChatHistoryFacade> = {}): ChatHistoryFacade {
  return {
    list: vi.fn(async () => []),
    load: vi.fn(async () => []),
    create: vi.fn(async () => null),
    appendTurn: vi.fn(async () => null),
    rename: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    removeAllDevice: vi.fn(async () => {}),
    deviceAantal: vi.fn(async () => 0),
    deviceBeschikbaar: vi.fn(async () => true),
    backendVoorNieuwGesprek: vi.fn(() => 'server' as const),
    ...over,
  }
}

const noop = () => {}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GesprekkenLijst', () => {
  it('toont gesprekken uit beide ruggen, met de lokaal-markering waar die hoort', async () => {
    const facade = maakFacade({
      list: vi.fn(async () => [
        meta({ id: 'g-server', title: 'Mijn FIRE-datum', backend: 'server', origin: 'cloud' }),
        meta({
          id: 'g-lokaal',
          title: 'Mijn schulden',
          backend: 'apparaat',
          origin: 'lokaal',
          lastMessageAt: '2026-08-30T10:00:00.000Z',
        }),
      ]),
    })
    render(
      <GesprekkenLijst
        facade={facade}
        actieveConversationId={null}
        onNieuw={noop}
        onHervat={noop}
        onActiefVerwijderd={noop}
      />,
    )

    expect(await screen.findByRole('button', { name: 'Mijn FIRE-datum' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mijn schulden' })).toBeInTheDocument()
    // Precies één markering: alleen het gesprek dat lokaal gevoerd is.
    expect(screen.getAllByText('lokaal')).toHaveLength(1)
  })

  it('lege staat is één regel uitleg, geen foutmelding', async () => {
    render(
      <GesprekkenLijst
        facade={maakFacade()}
        actieveConversationId={null}
        onNieuw={noop}
        onHervat={noop}
        onActiefVerwijderd={noop}
      />,
    )
    expect(
      await screen.findByText('Zodra je met Fin praat, verschijnt het gesprek hier.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/niet worden opgehaald/i)).not.toBeInTheDocument()
  })

  it('meldt het als dit apparaat niets kan bewaren — nooit stil falen', async () => {
    render(
      <GesprekkenLijst
        facade={maakFacade({ deviceBeschikbaar: vi.fn(async () => false) })}
        actieveConversationId={null}
        onNieuw={noop}
        onHervat={noop}
        onActiefVerwijderd={noop}
      />,
    )
    expect(await screen.findByText(/Op dit apparaat kan niets bewaard worden/i)).toBeInTheDocument()
  })

  it('hervat het gekozen gesprek met zijn eigen rug', async () => {
    const onHervat = vi.fn()
    const gesprek = meta({ id: 'g-lokaal', title: 'Mijn schulden', backend: 'apparaat', origin: 'lokaal' })
    render(
      <GesprekkenLijst
        facade={maakFacade({ list: vi.fn(async () => [gesprek]) })}
        actieveConversationId={null}
        onNieuw={noop}
        onHervat={onHervat}
        onActiefVerwijderd={noop}
      />,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Mijn schulden' }))
    expect(onHervat).toHaveBeenCalledWith(gesprek)
  })

  it('A5 — verwijderen vraagt één bevestiging en laat de rest staan', async () => {
    const remove = vi.fn(async () => {})
    const facade = maakFacade({
      list: vi.fn(async () => [
        meta({ id: 'g-1', title: 'Eerste' }),
        meta({ id: 'g-2', title: 'Tweede', lastMessageAt: '2026-08-30T10:00:00.000Z' }),
      ]),
      remove,
    })
    render(
      <GesprekkenLijst
        facade={facade}
        actieveConversationId={null}
        onNieuw={noop}
        onHervat={noop}
        onActiefVerwijderd={noop}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Gesprek "Eerste" verwijderen' }))
    // Eén bevestiging, geen tweede venster erbovenop.
    expect(screen.getByText(/definitief verwijderen/i)).toBeInTheDocument()
    expect(remove).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Ja, verwijderen' }))
    await waitFor(() => expect(remove).toHaveBeenCalledWith({ id: 'g-1', backend: 'server' }))

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Eerste' })).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: 'Tweede' })).toBeInTheDocument()
  })

  it('annuleren verwijdert niets', async () => {
    const remove = vi.fn(async () => {})
    render(
      <GesprekkenLijst
        facade={maakFacade({ list: vi.fn(async () => [meta({ title: 'Eerste' })]), remove })}
        actieveConversationId={null}
        onNieuw={noop}
        onHervat={noop}
        onActiefVerwijderd={noop}
      />,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Gesprek "Eerste" verwijderen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Annuleren' }))
    expect(remove).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Eerste' })).toBeInTheDocument()
  })

  it('meldt het aan de ouder als juist het ACTIEVE gesprek verdwijnt', async () => {
    const onActiefVerwijderd = vi.fn()
    render(
      <GesprekkenLijst
        facade={maakFacade({ list: vi.fn(async () => [meta({ id: 'g-1', title: 'Eerste' })]) })}
        actieveConversationId="g-1"
        onNieuw={noop}
        onHervat={noop}
        onActiefVerwijderd={onActiefVerwijderd}
      />,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Gesprek "Eerste" verwijderen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ja, verwijderen' }))
    await waitFor(() => expect(onActiefVerwijderd).toHaveBeenCalledTimes(1))
  })

  it('hernoemt inline en schrijft de nieuwe titel door', async () => {
    const rename = vi.fn(async () => {})
    render(
      <GesprekkenLijst
        facade={maakFacade({ list: vi.fn(async () => [meta({ title: 'Eerste' })]), rename })}
        actieveConversationId={null}
        onNieuw={noop}
        onHervat={noop}
        onActiefVerwijderd={noop}
      />,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Gesprek "Eerste" hernoemen' }))
    const veld = screen.getByLabelText('Nieuwe titel voor dit gesprek')
    fireEvent.change(veld, { target: { value: 'Mijn vrijheidsplan' } })
    fireEvent.click(screen.getByRole('button', { name: 'Titel opslaan' }))

    await waitFor(() =>
      expect(rename).toHaveBeenCalledWith({ id: 'g-1', backend: 'server' }, 'Mijn vrijheidsplan'),
    )
    expect(await screen.findByRole('button', { name: 'Mijn vrijheidsplan' })).toBeInTheDocument()
  })

  it('"Nieuw gesprek" laat de ouder beslissen — de lijst gooit zelf niets weg', async () => {
    const onNieuw = vi.fn()
    const facade = maakFacade({ list: vi.fn(async () => [meta({ title: 'Eerste' })]) })
    render(
      <GesprekkenLijst
        facade={facade}
        actieveConversationId={null}
        onNieuw={onNieuw}
        onHervat={noop}
        onActiefVerwijderd={noop}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Nieuw gesprek' }))
    expect(onNieuw).toHaveBeenCalledTimes(1)
    expect(facade.remove).not.toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: 'Eerste' })).toBeInTheDocument()
  })


  it('M2 — Escape tijdens hernoemen breekt alleen het hernoemen af, niet het paneel', async () => {
    // Het chatpaneel hangt zijn eigen Escape-sluiter aan `document`. Die trekt
    // zich alleen terug voor de bewerkmodal en het instellingenmenu, dus deze
    // inline bewerking moet het gebaar zélf tegenhouden — anders sloot Escape
    // het hele gesprek in plaats van het invoerveld.
    const documentEscape = vi.fn()
    document.addEventListener('keydown', documentEscape)
    try {
      render(
        <GesprekkenLijst
          facade={maakFacade({ list: vi.fn(async () => [meta({ title: 'Eerste' })]) })}
          actieveConversationId={null}
          onNieuw={noop}
          onHervat={noop}
          onActiefVerwijderd={noop}
        />,
      )
      fireEvent.click(await screen.findByRole('button', { name: 'Gesprek "Eerste" hernoemen' }))
      const veld = screen.getByLabelText('Nieuwe titel voor dit gesprek')
      fireEvent.keyDown(veld, { key: 'Escape' })

      expect(documentEscape).not.toHaveBeenCalled()
      expect(screen.queryByLabelText('Nieuwe titel voor dit gesprek')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Eerste' })).toBeInTheDocument()
    } finally {
      document.removeEventListener('keydown', documentEscape)
    }
  })

  it('koppen blijven binnen het paneelcontract: h2 voor de lijst, h3 per gesprek', async () => {
    render(
      <GesprekkenLijst
        facade={maakFacade({ list: vi.fn(async () => [meta({ title: 'Eerste' })]) })}
        actieveConversationId={null}
        onNieuw={noop}
        onHervat={noop}
        onActiefVerwijderd={noop}
      />,
    )
    // Geen niveau overslaan: het paneel draagt zelf geen h2, dus de lijstkop
    // is de h2 en de gesprekstitels staan er één onder.
    expect(await screen.findByRole('heading', { level: 2, name: 'Je gesprekken' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Eerste' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 4 })).not.toBeInTheDocument()
  })

  it('een mislukte lijst is een melding met een tweede kans, geen leeg scherm', async () => {
    render(
      <GesprekkenLijst
        facade={maakFacade({
          list: vi.fn(async () => {
            throw new Error('netwerk')
          }),
        })}
        actieveConversationId={null}
        onNieuw={noop}
        onHervat={noop}
        onActiefVerwijderd={noop}
      />,
    )
    expect(await screen.findByText(/konden niet worden opgehaald/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Opnieuw proberen' })).toBeInTheDocument()
  })
})
