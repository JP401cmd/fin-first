/**
 * Krant 2B — geen Fin in de Krant (besluit B11).
 *
 * De layout mount voor een Krant-account geen chatpaneel en geen companion
 * (bronscan in lib/modules/krant-layout.source.test.ts). Deze suite bewijst de
 * andere helft: met `ChatProvider finEnabled={false}` gaat de chat nooit open en
 * verdwijnen alle "Vraag Fin"/"Bespreek met Fin"-ingangen die een Krant-account
 * kan zien — in de Krant zelf (/nieuws) en in het meldingenpaneel. Met de
 * standaard (`finEnabled` weggelaten = true) is alles als vóór 2B.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ChatProvider, useChatContext } from './chat-provider'
import { BesprekMetWillButton } from './bespreek-met-fin-button'
import { NewsArticleActions } from '@/components/berichten/news-components'
import { NotificationItem } from '@/components/app/notifications/notification-item'
import type { Notification } from '@/app/api/notifications/route'
import type { NewsItem } from '@/lib/news-item'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/nieuws',
}))

afterEach(() => {
  cleanup()
  try { localStorage.clear() } catch {}
})

const ITEM: NewsItem = {
  id: 'news-2026-09-28-1',
  headline: 'Rente omlaag',
  summary: 'De ECB verlaagt de rente.',
  impactType: 'direct',
  personalImpact: 'Je spaarrente daalt.',
  impactScore: 3,
  impactDirection: 'negatief',
  category: 'rente',
  date: '2026-09-28',
}

const MELDING: Notification = {
  id: 'n1',
  type: 'budget',
  priority: 1,
  title: 'Testbericht',
  description: 'Omschrijving',
  icon: 'info',
  color: 'teal',
  createdAt: '2026-09-28T10:00:00.000Z',
  read: false,
  aiContext: 'Wat betekent dit?',
}

function metFin(finEnabled: boolean | undefined, node: ReactNode) {
  return render(
    finEnabled === undefined ? <ChatProvider>{node}</ChatProvider> : <ChatProvider finEnabled={finEnabled}>{node}</ChatProvider>,
  )
}

function ChatState() {
  const { isOpen, openWithMessage, open, pendingMessage, finEnabled } = useChatContext()
  return (
    <div>
      <span data-testid="open">{String(isOpen)}</span>
      <span data-testid="pending">{pendingMessage ?? ''}</span>
      <span data-testid="fin">{String(finEnabled)}</span>
      <button onClick={() => openWithMessage('hoi')}>vraag</button>
      <button onClick={open}>open</button>
    </div>
  )
}

describe('ChatProvider finEnabled', () => {
  it('zonder Fin gaat de chat nooit open en blijft er geen wachtende vraag', () => {
    metFin(false, <ChatState />)
    act(() => screen.getByText('vraag').click())
    act(() => screen.getByText('open').click())
    expect(screen.getByTestId('open').textContent).toBe('false')
    expect(screen.getByTestId('pending').textContent).toBe('')
    expect(screen.getByTestId('fin').textContent).toBe('false')
  })

  it('zonder Fin opent ook een vastgepinde stand uit localStorage de chat niet (geen zijbalkbreedte)', () => {
    localStorage.setItem('trifinity-chat-pinned', 'true')
    metFin(false, <ChatState />)
    expect(screen.getByTestId('open').textContent).toBe('false')
    expect(document.documentElement.style.getPropertyValue('--chat-sidebar-width')).toBe('0px')
  })

  it('standaard (vlag weggelaten) is alles als voorheen: vraag opent de chat', () => {
    metFin(undefined, <ChatState />)
    expect(screen.getByTestId('fin').textContent).toBe('true')
    act(() => screen.getByText('vraag').click())
    expect(screen.getByTestId('open').textContent).toBe('true')
    expect(screen.getByTestId('pending').textContent).toBe('hoi')
  })
})

describe('"Vraag Fin"-ingangen verbergen zich zonder Fin', () => {
  it('Krant-artikel: geen "Bespreek met Fin" en geen "Maak actie"; "Gelezen" blijft', () => {
    metFin(false, <NewsArticleActions item={ITEM} isRead={false} onMarkRead={() => {}} />)
    expect(screen.queryByText('Bespreek met Fin')).not.toBeInTheDocument()
    expect(screen.queryByText('Maak actie')).not.toBeInTheDocument()
    expect(screen.getByText('Gelezen')).toBeInTheDocument()
  })

  it('Krant-artikel met Fin: beide knoppen zoals voorheen', () => {
    metFin(undefined, <NewsArticleActions item={ITEM} isRead={false} onMarkRead={() => {}} />)
    expect(screen.getByText('Bespreek met Fin')).toBeInTheDocument()
    expect(screen.getByText('Maak actie')).toBeInTheDocument()
  })

  it('melding: geen "Vraag Fin" zonder Fin, wél met', () => {
    metFin(false, <NotificationItem notification={MELDING} onRead={() => {}} onClose={() => {}} />)
    expect(screen.queryByText('Vraag Fin')).not.toBeInTheDocument()
    cleanup()
    metFin(undefined, <NotificationItem notification={MELDING} onRead={() => {}} onClose={() => {}} />)
    expect(screen.getByText('Vraag Fin')).toBeInTheDocument()
  })

  it('BesprekMetWillButton: weg zonder Fin, zichtbaar met Fin en buiten een provider', () => {
    metFin(false, <BesprekMetWillButton onderwerp="Box 3" />)
    expect(screen.queryByText('Bespreek met Fin')).not.toBeInTheDocument()
    cleanup()
    metFin(true, <BesprekMetWillButton onderwerp="Box 3" />)
    expect(screen.getByText('Bespreek met Fin')).toBeInTheDocument()
    cleanup()
    render(<BesprekMetWillButton onderwerp="Box 3" />)
    expect(screen.getByText('Bespreek met Fin')).toBeInTheDocument()
  })
})
