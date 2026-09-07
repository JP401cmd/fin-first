import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import type { Notification } from '@/app/api/notifications/route'

// UR3-31 — de meldingen-widget las het tijdstempel uit de VERSE
// `notifications`-array. Die krijgt per poll `createdAt: now`, dus de widget
// toonde bij elke poll "zojuist" voor elke melding en sorteerde op een waarde
// die voor alle items gelijk was (waarneming: vier tijdstempels in elf minuten
// voor dezelfde melding). Alleen `history` bewaart het oorspronkelijke tijdstip.
// Deze suite legt vast dat de widget het tijdstip uit `history` consumeert.

const providerState: { notifications: Notification[]; history: Notification[]; unreadCount: number } = {
  notifications: [],
  history: [],
  unreadCount: 0,
}

vi.mock('@/components/app/notifications/notification-provider', () => ({
  useNotifications: () => providerState,
}))

import { MeldingenWidget } from './meldingen-widget'
import type { DashboardData } from './widget-renderer'

const DATA = {} as unknown as DashboardData

// Vast "nu" zodat formatTimestamp deterministisch is: 10 april 2026, 14:00 in
// Amsterdam (CEST, UTC+2).
const NOW = new Date('2026-04-10T12:00:00.000Z')

function melding(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'budget_boodschappen',
    type: 'budget',
    priority: 3,
    title: 'Budget boodschappen bijna op',
    description: 'Nog 12% van je maandbudget over.',
    icon: 'wallet',
    color: 'amber',
    createdAt: NOW.toISOString(),
    read: false,
    ...overrides,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  providerState.notifications = []
  providerState.history = []
  providerState.unreadCount = 0
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('MeldingenWidget — stabiel tijdstempel uit history (AC2)', () => {
  it('toont het tijdstip uit history, niet de verse createdAt van de poll', () => {
    // Zelfde deterministische melding-ID; de poll geeft "nu", history bewaart
    // 5 maart. De widget hoort 5 maart te tonen.
    providerState.notifications = [melding({ createdAt: NOW.toISOString() })]
    providerState.history = [melding({ createdAt: '2026-03-05T09:00:00.000Z' })]

    const { container } = render(<MeldingenWidget size="full" data={DATA} />)
    const text = container.textContent ?? ''

    expect(text).toContain('5 mrt')
    expect(text).not.toContain('14:00')
  })

  it('geeft bij twee opeenvolgende polls hetzelfde tijdstempel', () => {
    const stable = melding({ createdAt: '2026-03-05T09:00:00.000Z' })
    providerState.history = [stable]

    // Poll 1 — verse createdAt op 13:40.
    providerState.notifications = [melding({ createdAt: '2026-04-10T11:40:00.000Z' })]
    const first = render(<MeldingenWidget size="full" data={DATA} />)
    const firstText = first.container.textContent ?? ''
    cleanup()

    // Poll 2, elf minuten later — opnieuw een verse createdAt.
    providerState.notifications = [melding({ createdAt: '2026-04-10T11:51:00.000Z' })]
    const second = render(<MeldingenWidget size="full" data={DATA} />)
    const secondText = second.container.textContent ?? ''

    expect(firstText).toContain('5 mrt')
    expect(secondText).toContain('5 mrt')
    expect(secondText).toBe(firstText)
  })

  it('sorteert op het history-tijdstip, niet op de gelijke verse waarden', () => {
    // Beide meldingen krijgen van de poll exact hetzelfde "nu"; alleen history
    // onderscheidt ze. Zonder history is de sortering betekenisloos.
    const vers = NOW.toISOString()
    providerState.notifications = [
      melding({ id: 'briefing_2026w10', title: 'Oude briefing', createdAt: vers }),
      melding({ id: 'milestone_ton', title: 'Verse mijlpaal', createdAt: vers }),
    ]
    providerState.history = [
      melding({ id: 'briefing_2026w10', title: 'Oude briefing', createdAt: '2026-03-05T09:00:00.000Z' }),
      melding({ id: 'milestone_ton', title: 'Verse mijlpaal', createdAt: '2026-04-08T09:00:00.000Z' }),
    ]

    const { container } = render(<MeldingenWidget size="full" data={DATA} />)
    const text = container.textContent ?? ''

    expect(text.indexOf('Verse mijlpaal')).toBeGreaterThan(-1)
    expect(text.indexOf('Verse mijlpaal')).toBeLessThan(text.indexOf('Oude briefing'))
  })

  it('valt terug op de verse createdAt wanneer de melding nog niet in history staat', () => {
    // De route geeft `history` alleen binnen het days-venster terug, dus een
    // actieve melding zonder history-rij is een reëel geval.
    providerState.notifications = [melding({ createdAt: NOW.toISOString() })]
    providerState.history = []

    const { container } = render(<MeldingenWidget size="full" data={DATA} />)
    expect(container.textContent ?? '').toContain('14:00')
  })

  it('laat gelezen/ongelezen-volgorde voorgaan op het tijdstip', () => {
    providerState.notifications = [
      melding({ id: 'briefing_2026w14', title: 'Gelezen nieuw', read: true, createdAt: NOW.toISOString() }),
      melding({ id: 'briefing_2026w10', title: 'Ongelezen oud', read: false, createdAt: NOW.toISOString() }),
    ]
    providerState.history = [
      melding({ id: 'briefing_2026w14', title: 'Gelezen nieuw', read: true, createdAt: '2026-04-09T09:00:00.000Z' }),
      melding({ id: 'briefing_2026w10', title: 'Ongelezen oud', read: false, createdAt: '2026-03-05T09:00:00.000Z' }),
    ]

    const { container } = render(<MeldingenWidget size="full" data={DATA} />)
    const text = container.textContent ?? ''
    expect(text.indexOf('Ongelezen oud')).toBeLessThan(text.indexOf('Gelezen nieuw'))
  })
})
