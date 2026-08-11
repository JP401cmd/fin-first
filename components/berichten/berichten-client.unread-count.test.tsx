/**
 * WF-WILL-11-bug1 — de ongelezen-teller op /berichten moet exact overeenkomen
 * met de bel-badge en het sidebar-aantal (A = B). Vóór de fix telde deze
 * pagina lokaal ongelezen items uit de 30-daagse `history`-array; de bel/
 * sidebar lazen de server-canonieke `unreadCount` (7-daags live venster).
 * Een item dat wél in `history` maar niet meer in de live set zit (bv. een
 * eenmalige, gegate briefing-melding — zie de kaart) gaf dan een hogere
 * teller op /berichten dan op bel/sidebar.
 *
 * Optie A (gekozen, "Antwoord gebruiker" = A): /berichten consumeert de
 * canonieke `unreadCount` uit NotificationProvider — dezelfde bron als
 * top-bar.tsx en sidebar.tsx. Deze test reproduceert de exacte divergentie
 * uit de kaart (history-unread = 7, provider-unreadCount = 6) en bewijst dat
 * de getoonde teller (Masthead metaLeft + "Ongelezen"-tabbadge) het
 * canonieke getal volgt, niet de lokale hertelling.
 *
 * Bron: 2026-07-17-WF-WILL-11-bug1 (Notion), IMPLEMENTATIE 2026-07-21.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { BerichtenClient } from './berichten-client'

vi.mock('next/navigation', () => ({
  usePathname: () => '/berichten',
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
}))

// Canonieke bron (7-daags live venster) — zelfde context als top-bar/sidebar.
// Bewust 6, terwijl de 30-daagse history-fixture hieronder 7 ongelezen items telt.
const PROVIDER_UNREAD_COUNT = 6

vi.mock('@/components/app/notifications/notification-provider', () => ({
  useNotifications: () => ({
    unreadCount: PROVIDER_UNREAD_COUNT,
    markAsRead: () => {},
    refresh: () => {},
    openModal: () => {},
  }),
}))

function mkNotification(id: string, read: boolean, daysAgo: number) {
  const created = new Date(Date.now() - daysAgo * 86_400_000).toISOString()
  return {
    id,
    type: 'budget',
    title: `Melding ${id}`,
    message: 'Test-melding.',
    priority: 3,
    read,
    createdAt: created,
    created_at: created,
  }
}

// 7 ongelezen in de 30-daagse history — 1 ervan (n-briefing) valt buiten het
// 7-daagse live venster van de provider, precies zoals de weekbriefing-
// melding uit de kaart. Als /berichten dit lokaal hertelt komt de teller op
// 7 uit; met optie A moet hij 6 tonen (== PROVIDER_UNREAD_COUNT).
const HISTORY = [
  mkNotification('n-briefing', false, 10), // buiten het 7-daagse live venster
  ...Array.from({ length: 6 }, (_, i) => mkNotification(`n-recent-${i}`, false, 1)),
]

beforeEach(() => {
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ history: HISTORY }),
  })) as unknown as typeof fetch
})

describe('BerichtenClient — canonieke ongelezen-teller (WF-WILL-11)', () => {
  afterEach(cleanup)

  it('toont de canonieke unreadCount (6), niet de lokale history-hertelling (7)', async () => {
    render(<BerichtenClient />)

    await waitFor(() => {
      expect(screen.getByText('6 ongelezen')).toBeInTheDocument()
    })
    expect(screen.queryByText('7 ongelezen')).toBeNull()
  })

  it('het "Ongelezen"-tabbadge volgt hetzelfde canonieke getal', async () => {
    render(<BerichtenClient />)

    await waitFor(() => {
      const tab = screen.getByRole('tab', { name: /Ongelezen/ })
      expect(tab).toHaveTextContent('6')
      expect(tab).not.toHaveTextContent('7')
    })
  })
})
