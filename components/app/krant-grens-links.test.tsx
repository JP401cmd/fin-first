/**
 * Krant 2B — dode links binnen de grens, en het chat-randgeval.
 *
 *  - Breadcrumb op /mijn/*: een crumb naar buiten de grens ("Mijn" → /mijn)
 *    valt weg; blijft er één crumb over, dan verdwijnt het kruimelpad.
 *  - Meldingen-modal: "Bekijk alles" (/berichten) alleen binnen de grens.
 *  - /mijn/account: geen add-on-catalogus en geen AI-tegoed voor een Krant-account.
 *  - ChatProvider: een productwissel Krant → Geheel zonder reload laat een oude
 *    pin de chat niet ineens openen.
 * Voor een Geheel-account blijft alles zoals het was.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { ALL_MODULES, type ModuleId } from '@/lib/module-registry'
import type { FeatureAccessData } from '@/lib/compute-feature-access'

const nav = vi.hoisted(() => ({ pathname: '/mijn/account' }))

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/components/app/notifications/notification-provider', () => ({
  useNotifications: () => ({
    history: [],
    unreadCount: 0,
    loading: false,
    isModalOpen: true,
    closeModal: () => {},
    markAsRead: () => {},
    markAllRead: () => {},
    refresh: () => {},
  }),
}))
vi.mock('@/components/mijn/account/abonnement-section', () => ({ AbonnementSection: () => <p>add-on-catalogus</p> }))
vi.mock('@/components/mijn/account/ai-credits-section', () => ({ AiCreditsSection: () => <p>ai-tegoed</p> }))
vi.mock('@/components/mijn/account/account-basis-section', () => ({ AccountBasisSection: () => <p>inloggegevens</p> }))
vi.mock('@/components/mijn/account/danger-zone', () => ({ DangerZone: () => <p>danger-zone</p> }))

import { FeatureAccessProvider } from '@/components/app/feature-access-provider'
import { Breadcrumb } from '@/components/app/breadcrumb'
import { NotificationModal } from '@/components/app/notifications/notification-panel'
import { AccountClient } from '@/components/mijn/account/account-client'
import { ChatProvider, useChatContext } from '@/components/app/chat/chat-provider'

const DATA = {
  features: {},
  phase: 'stability',
  level: 1,
  subscriptions: [],
  netWorth: 0,
  monthlyExpenses: 0,
  freedomPct: 0,
} as unknown as FeatureAccessData

function met(modules: ModuleId[], node: React.ReactNode) {
  return render(
    <FeatureAccessProvider data={DATA} activeModules={modules}>
      {node}
    </FeatureAccessProvider>,
  )
}

afterEach(() => {
  cleanup()
  nav.pathname = '/mijn/account'
  try { localStorage.clear() } catch {}
})

describe('Breadcrumb binnen de grens', () => {
  it('Krant-account op /mijn/account: geen kruimelpad (geen link naar /mijn)', () => {
    met(['nieuws'], <Breadcrumb color="teal" />)
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb navigatie' })).toBeNull()
    expect(document.querySelector('a[href="/mijn"]')).toBeNull()
  })

  it('Geheel-account op /mijn/account: Mijn → Account zoals voorheen', () => {
    met([...ALL_MODULES], <Breadcrumb color="teal" />)
    const crumb = screen.getByRole('navigation', { name: 'Breadcrumb navigatie' })
    expect(crumb.querySelector('a[href="/mijn"]')).not.toBeNull()
    expect(crumb.textContent).toContain('Account')
  })
})

describe('Meldingen-modal: "Bekijk alles"', () => {
  it('Krant-account: geen link naar /berichten, wel naar de instellingen', () => {
    render(<NotificationModal activeModules={['nieuws']} />)
    expect(document.querySelector('a[href="/berichten"]')).toBeNull()
    expect(document.querySelector('a[href="/mijn/notificaties"]')).not.toBeNull()
  })

  it('zonder prop (alle modules): "Bekijk alles" zoals voorheen', () => {
    render(<NotificationModal />)
    expect(screen.getByText(/Bekijk alles/)).toBeInTheDocument()
    expect(document.querySelector('a[href="/berichten"]')).not.toBeNull()
  })
})

describe('/mijn/account', () => {
  it('Krant-account: geen add-on-catalogus en geen AI-tegoed; inloggegevens en danger zone blijven', () => {
    met(['nieuws'], <AccountClient email="jan@test.nl" activeSubscriptions={[]} />)
    expect(screen.queryByText('add-on-catalogus')).toBeNull()
    expect(screen.queryByText('ai-tegoed')).toBeNull()
    expect(screen.getByText('inloggegevens')).toBeInTheDocument()
    expect(screen.getByText('danger-zone')).toBeInTheDocument()
  })

  it('Geheel-account: alle vier secties', () => {
    met([...ALL_MODULES], <AccountClient email="jan@test.nl" activeSubscriptions={[]} />)
    for (const s of ['add-on-catalogus', 'ai-tegoed', 'inloggegevens', 'danger-zone']) {
      expect(screen.getByText(s)).toBeInTheDocument()
    }
  })
})

function ChatState() {
  const { isOpen } = useChatContext()
  return <span data-testid="open">{String(isOpen)}</span>
}

describe('ChatProvider — productwissel Krant → Geheel zonder reload', () => {
  it('een oude pin opent de chat niet ineens', () => {
    localStorage.setItem('trifinity-chat-pinned', 'true')
    const { rerender } = render(
      <ChatProvider finEnabled={false}>
        <ChatState />
      </ChatProvider>,
    )
    expect(screen.getByTestId('open').textContent).toBe('false')
    act(() => {
      rerender(
        <ChatProvider finEnabled>
          <ChatState />
        </ChatProvider>,
      )
    })
    expect(screen.getByTestId('open').textContent).toBe('false')
    expect(document.documentElement.style.getPropertyValue('--chat-sidebar-width')).toBe('0px')
  })

  it('zonder wissel (Geheel vanaf het begin) opent een pin de chat zoals voorheen', () => {
    localStorage.setItem('trifinity-chat-pinned', 'true')
    render(
      <ChatProvider>
        <ChatState />
      </ChatProvider>,
    )
    expect(screen.getByTestId('open').textContent).toBe('true')
  })
})
