/**
 * BER-1 — de ruim/compact-dichtheidsschakelaar op /berichten staat alleen in
 * Volledig. De opgeslagen dichtheid blijft in beide modi werken; alleen de knop
 * verdwijnt in Eenvoudig.
 *
 * Bron: docs/eenvoudige-weergave-audit.md §7 (/berichten & /nieuws).
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { BerichtenClient } from './berichten-client'
import { DisplayModeProvider, type DisplayMode } from '@/lib/hooks/use-display-mode'

vi.mock('next/navigation', () => ({
  usePathname: () => '/berichten',
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
}))

vi.mock('@/components/app/notifications/notification-provider', () => ({
  useNotifications: () => ({
    unreadCount: 1,
    markAsRead: () => {},
    refresh: () => {},
    openModal: () => {},
  }),
}))

const HISTORY = [
  {
    id: 'n1',
    type: 'budget',
    title: 'Budget-melding',
    message: 'Je zit boven je budget.',
    priority: 3,
    read: false,
    created_at: new Date().toISOString(),
  },
]

beforeEach(() => {
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ history: HISTORY }),
  })) as unknown as typeof fetch
})

function renderClient(mode: DisplayMode) {
  return render(
    <DisplayModeProvider initialMode={mode}>
      <BerichtenClient />
    </DisplayModeProvider>,
  )
}

describe('BerichtenClient — dichtheidsschakelaar (BER-1)', () => {
  afterEach(cleanup)

  it("toont de ruim/compact-schakelaar in 'full'", async () => {
    renderClient('full')
    await waitFor(() => {
      expect(screen.getByTestId('density-toggle')).toBeInTheDocument()
    })
  })

  it("verbergt de ruim/compact-schakelaar in 'simple'", async () => {
    renderClient('simple')
    // "Alles gelezen" staat in dezelfde actiebalk als de dichtheidsschakelaar en
    // verschijnt pas ná de history-fetch — zo bewijst dit dat de balk er stáát en
    // dat alleen de schakelaar ontbreekt (geen vals groen op een lege render).
    await waitFor(() => {
      expect(screen.getByText('Alles gelezen')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('density-toggle')).toBeNull()
  })
})
