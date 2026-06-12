import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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

vi.mock('@/components/app/chat/chat-provider', () => ({
  useChatContext: () => ({ openWithMessage: vi.fn() }),
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
})
