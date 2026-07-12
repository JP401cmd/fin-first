import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChatPanel } from './chat-panel'

/**
 * Regressietest voor de Wft-akkoord-gate in de Will-chat.
 *
 * Bug (Notion 397f9e8d): bij het openen van de chat MET een vooraf-ingevulde
 * vraag (openWithMessage → pendingMessage, of autoOpenMessage) vuurde het
 * auto-send-effect `sendMessage` af zodra `isOpen && hasAi && !isStreaming`,
 * ZONDER te wachten op Wft-acceptatie. Voor een nieuwe gebruiker (lege
 * localStorage) toonde het akkoordscherm wel de UI-blokkade, maar de AI-aanroep
 * ging tóch door — Will begon te antwoorden vóór de klik op 'Ik begrijp het'.
 *
 * Deze test pint vast: (1) geen sendMessage zolang het akkoordscherm er staat,
 * en (2) de vooraf-ingevulde vraag gaat NIET verloren maar wordt alsnog
 * verstuurd ná acceptatie.
 */

const mockSendMessage = vi.fn()
let mockClearPendingMessage = vi.fn()

// Mutabele chat-context — per test in te stellen
let ctx: Record<string, unknown> = {}

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

vi.mock('./chat-provider', () => ({
  useChatContext: () => ctx,
}))

vi.mock('@/components/app/feature-access-provider', () => ({
  useModuleAccess: () => ({ activeModules: ['inzicht_acties'], subscriptions: ['ai'] }),
}))

vi.mock('@/lib/feature-registry', () => ({
  hasSubscription: () => true,
}))

const WFT_KEY = 'trifinity-chat-wft-accepted'

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    isOpen: true,
    close: vi.fn(),
    pendingMessage: null,
    clearPendingMessage: mockClearPendingMessage,
    isPinned: false,
    togglePin: vi.fn(),
    autoOpenMessage: null,
    setAutoOpenMessage: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  mockSendMessage.mockClear()
  mockClearPendingMessage = vi.fn()
  localStorage.clear()
  ctx = makeCtx()
  // jsdom implementeert scrollIntoView niet (het messages-auto-scroll-effect
  // roept het aan bij mount) — stub het zodat de render niet crasht.
  Element.prototype.scrollIntoView = vi.fn()
})

describe('ChatPanel — Wft-akkoord-gate', () => {
  it('toont het akkoordscherm en verstuurt de pending-vraag NIET vóór acceptatie', () => {
    ctx = makeCtx({ pendingMessage: 'Doorlicht mijn financiën' })
    render(<ChatPanel />)

    // Akkoordscherm zichtbaar (lege localStorage → wftAccepted === false)
    expect(screen.getByText('Belangrijke mededeling')).toBeInTheDocument()
    // Cruciaal: nog geen AI-aanroep
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('verstuurt de pending-vraag alsnog ná klik op "Ik begrijp het"', () => {
    ctx = makeCtx({ pendingMessage: 'Doorlicht mijn financiën' })
    render(<ChatPanel />)

    expect(mockSendMessage).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Ik begrijp het' }))

    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    expect(mockSendMessage).toHaveBeenCalledWith({ text: 'Doorlicht mijn financiën' })
  })

  it('verstuurt een autoOpenMessage (whatif-context) pas ná acceptatie', () => {
    ctx = makeCtx({ autoOpenMessage: 'Bespreek dit scenario' })
    render(<ChatPanel />)

    expect(mockSendMessage).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Ik begrijp het' }))

    expect(mockSendMessage).toHaveBeenCalledWith({ text: 'Bespreek dit scenario' })
  })

  it('verstuurt de pending-vraag direct wanneer Wft al eerder is geaccepteerd', () => {
    localStorage.setItem(WFT_KEY, 'true')
    ctx = makeCtx({ pendingMessage: 'Doorlicht mijn financiën' })
    render(<ChatPanel />)

    // Geen akkoordscherm meer, vraag gaat meteen door
    expect(screen.queryByText('Belangrijke mededeling')).not.toBeInTheDocument()
    expect(mockSendMessage).toHaveBeenCalledWith({ text: 'Doorlicht mijn financiën' })
  })
})
