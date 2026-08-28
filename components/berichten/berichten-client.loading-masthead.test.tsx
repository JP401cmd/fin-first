/**
 * H11/D4a — de masthead op /berichten mag geen definitief oordeel vellen
 * zolang de lijst nog laadt.
 *
 * Het gemelde symptoom was "badge: Berichten · 1" boven een pagina die
 * "GEEN BERICHTEN" kopte. Op het testaccount stonden er feitelijk twee items:
 * de tester zag de LAADSTAAT. `metaLeft` werd namelijk uit `totalCount`
 * (= 0 zolang de fetch loopt) berekend en de masthead rendert buiten de
 * `loading`-tak, terwijl de lijst eronder wél een spinner toont.
 *
 * Deze test pint precies die naad: tijdens het laden geen "Geen berichten", en
 * ná het laden alsnog het juiste oordeel.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { BerichtenClient } from './berichten-client'

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

/**
 * Bewust een LEGE historie: precies het scenario uit de kaart (badge zegt 1,
 * de lijst is leeg). Ná het laden mág "Geen berichten" er staan — het gaat om
 * het moment waarop dat oordeel valt, niet om het oordeel zelf.
 */
const HISTORY: unknown[] = []

/** Fetch die pas antwoordt als de test hem vrijgeeft — zo is de laadstaat toetsbaar. */
let releaseFetch: () => void

beforeEach(() => {
  global.fetch = vi.fn(
    () =>
      new Promise((resolve) => {
        releaseFetch = () =>
          resolve({ ok: true, json: async () => ({ history: HISTORY }) } as Response)
      }),
  ) as unknown as typeof fetch
})

describe('BerichtenClient — masthead oordeelt niet tijdens het laden (H11/D4a)', () => {
  afterEach(cleanup)

  it('toont geen "Geen berichten" zolang de meldingen laden', async () => {
    render(<BerichtenClient />)
    expect(screen.queryByText('Geen berichten')).toBeNull()
    await waitFor(() => expect(screen.getByText('Berichten laden…')).toBeInTheDocument())
  })

  it('velt ná het laden alsnog het juiste oordeel', async () => {
    render(<BerichtenClient />)
    releaseFetch()
    await waitFor(() => expect(screen.getByText('Geen berichten')).toBeInTheDocument())
    expect(screen.queryByText('Berichten laden…')).toBeNull()
  })
})
