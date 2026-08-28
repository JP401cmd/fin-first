import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NotificationItem } from './notification-item'
import type { Notification, NotificationType } from '@/app/api/notifications/route'

/**
 * Regressie: /berichten crashte met "Cannot read properties of undefined
 * (reading 'colorVar')" zodra de DB een bericht bevatte met een type dat
 * niet (meer) in MODULE_MAP staat — bv. de gesaneerde legacy-types
 * insight/streak/badge (jun 2026). Runtime-data houdt zich niet aan de
 * NotificationType-union; de component moet daarom een vangnet hebben.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

const openWithMessage = vi.fn()

vi.mock('@/components/app/chat/chat-provider', () => ({
  useChatContext: () => ({ openWithMessage }),
}))

function makeNotification(overrides: Partial<Notification> & { type: NotificationType }): Notification {
  return {
    id: 'n1',
    priority: 1,
    title: 'Testbericht',
    description: 'Omschrijving',
    icon: 'info',
    color: 'teal',
    createdAt: new Date('2026-06-12T10:00:00Z').toISOString(),
    read: false,
    ...overrides,
  }
}

describe('NotificationItem — onbekende/legacy bericht-types', () => {
  it('crasht niet op een legacy-type dat niet in MODULE_MAP staat en toont het fallback-label', () => {
    // 'insight' is een gesaneerd legacy-type dat nog in de DB kan staan;
    // de cast bootst runtime-data na die buiten de union valt.
    const legacy = makeNotification({ type: 'insight' as NotificationType })

    render(<NotificationItem notification={legacy} onRead={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByText('Bericht')).toBeInTheDocument()
    expect(screen.getByText('Testbericht')).toBeInTheDocument()
  })

  it('toont voor een bekend type gewoon het module-label', () => {
    const known = makeNotification({ type: 'budget' })

    render(<NotificationItem notification={known} onRead={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByText('Budget')).toBeInTheDocument()
  })

  // E-07: de rij is een role="button"-div (bevat een geneste knop). De globale
  // focus-ring pakt hem niet, dus verifiëren we een expliciete focus-visible-
  // outline én dat Enter de klik-handler nog steeds triggert.
  it('heeft een zichtbare focus-ring en reageert op Enter (E-07)', () => {
    const onRead = vi.fn()
    const n = makeNotification({ type: 'budget' })

    render(<NotificationItem notification={n} onRead={onRead} onClose={vi.fn()} />)

    const item = screen.getByRole('button')
    expect(item.className).toMatch(/focus-visible:outline/)

    fireEvent.keyDown(item, { key: 'Enter' })
    expect(onRead).toHaveBeenCalledWith('n1')
  })
})

/**
 * M25: "Vraag Fin" markeerde het bericht synchroon bij de klik als gelezen,
 * terwijl de AI-aanvraag pas later async vertrok — of nooit. Bij een storing
 * liep de ongelezen-teller dus terug zonder dat er iets te lezen viel, en
 * markAsRead kent geen rollback. De lezing hangt nu aan een callback die pas
 * vuurt zodra Fin echt antwoordt (ChatPanel roept 'm aan).
 */
describe('NotificationItem — "Vraag Fin" markeert pas gelezen bij een antwoord (M25)', () => {
  it('markeert NIET bij de klik, maar geeft de lezing mee als callback', () => {
    openWithMessage.mockClear()
    const onRead = vi.fn()
    const n = makeNotification({ type: 'budget', aiContext: 'Leg mijn budget uit' })

    render(<NotificationItem notification={n} onRead={onRead} onClose={vi.fn()} />)
    // De rij zelf is óók een role="button" (met de knoptekst in z'n
    // toegankelijke naam), dus expliciet de geneste knop pakken.
    fireEvent.click(screen.getByText('Vraag Fin'))

    // De kern van de bevinding: bij de klik is er nog niets gelezen.
    expect(onRead).not.toHaveBeenCalled()
    expect(openWithMessage).toHaveBeenCalledWith('Leg mijn budget uit', expect.any(Function))

    // Pas de callback — die ChatPanel aanroept bij een gerenderd antwoord —
    // markeert het bericht alsnog.
    const onAnswered = openWithMessage.mock.calls[0][1] as () => void
    onAnswered()
    expect(onRead).toHaveBeenCalledWith('n1')
  })

  it('markeert wél direct als er geen AI-vervolg mogelijk is', () => {
    openWithMessage.mockClear()
    const onRead = vi.fn()
    const n = makeNotification({ type: 'budget' })

    render(<NotificationItem notification={n} onRead={onRead} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))

    expect(onRead).toHaveBeenCalledWith('n1')
  })
})
