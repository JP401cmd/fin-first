import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChatPanel } from './chat-panel'
import { FeatureAccessProvider } from '@/components/app/feature-access-provider'
import type { FeatureAccessData } from '@/lib/compute-feature-access'

/**
 * Regressietest voor de layout-plaatsingsbug rond de AI-abonnee-gate in de
 * Will-chat.
 *
 * Bug: `<ChatPanelLazy />` werd in `app/(app)/layout.tsx` gerenderd BUITEN
 * `<FeatureAccessProvider>`. `ChatPanel` leest de abonnementsstatus via
 * `useModuleAccess()` → `useFeatureAccess()`. Buiten de provider valt die
 * hook terug op de default-context in `feature-access-provider.tsx` met
 * `subscriptions: []`, dus `hasAi = hasSubscription([], 'ai')` is altijd
 * `false` — ELKE AI-abonnee zag de upsell i.p.v. het chat-invoerveld,
 * ongeacht een écht `'ai'`-abonnement in de DB.
 *
 * In tegenstelling tot `chat-panel.test.tsx` (dat `feature-access-provider`
 * mockt en dus deze regressie nooit had kunnen vangen) gebruikt deze test de
 * ÉCHTE `FeatureAccessProvider`, zodat "binnen de provider" vs. "buiten de
 * provider" een waarneembaar, bug-vangend verschil oplevert.
 */

const mockSendMessage = vi.fn()

vi.mock('@ai-sdk/react', () => ({
  useChat: () => ({
    messages: [],
    sendMessage: mockSendMessage,
    status: 'ready',
    error: undefined,
    clearError: vi.fn(),
    regenerate: vi.fn(),
  }),
}))

vi.mock('ai', () => ({
  DefaultChatTransport: class {
    constructor(_opts: unknown) {}
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/overzicht',
}))

const chatCtx = {
  isOpen: true,
  close: vi.fn(),
  pendingMessage: null,
  clearPendingMessage: vi.fn(),
  isPinned: false,
  togglePin: vi.fn(),
  autoOpenMessage: null,
  setAutoOpenMessage: vi.fn(),
}

vi.mock('./chat-provider', () => ({
  useChatContext: () => chatCtx,
}))

// Bewust GEEN mock van '@/components/app/feature-access-provider' — dit is
// precies het contract dat de bug brak. `@/lib/feature-registry` blijft ook
// ongemockt (hasSubscription is pure logica zonder side effects).

const WFT_KEY = 'trifinity-chat-wft-accepted'

const aiSubscriberData: FeatureAccessData = {
  features: {},
  phase: 'stability',
  level: 2,
  subscriptions: ['ai'],
  netWorth: 100_000,
  monthlyExpenses: 3_000,
  freedomPct: 50,
  tier: 'ai',
}

beforeEach(() => {
  mockSendMessage.mockClear()
  // Wft al geaccepteerd — anders overschaduwt het akkoordscherm het
  // invoerveld en test je de verkeerde gate.
  localStorage.setItem(WFT_KEY, 'true')
  Element.prototype.scrollIntoView = vi.fn()
})

describe('ChatPanel — AI-abonnee-toegang via de échte FeatureAccessProvider', () => {
  it('toont het chat-invoerveld (geen upsell) voor een AI-abonnee BINNEN FeatureAccessProvider', () => {
    render(
      <FeatureAccessProvider data={aiSubscriberData}>
        <ChatPanel />
      </FeatureAccessProvider>,
    )

    expect(screen.getByPlaceholderText('Vraag Will iets...')).toBeInTheDocument()
    expect(screen.queryByTestId('ai-upsell-panel')).not.toBeInTheDocument()
  })

  it('toont de upsell (geen invoerveld) voor dezelfde AI-abonnee BUITEN FeatureAccessProvider — karakterisering van de faalmodus', () => {
    // Mimic van de oude (foute) layout-plaatsing: ChatPanel zonder een
    // FeatureAccessProvider-ancestor. useFeatureAccess() valt terug op de
    // default-context (subscriptions: []) → hasAi=false, ondanks een écht
    // AI-abonnement in `aiSubscriberData` dat hier bewust niet gebruikt wordt
    // (er is geen provider om het aan te leveren).
    render(<ChatPanel />)

    expect(screen.getByTestId('ai-upsell-panel')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Vraag Will iets...')).not.toBeInTheDocument()
  })
})
