import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { ChatPromptDeeplink } from './chat-prompt-deeplink'

/**
 * Tests voor ChatPromptDeeplink — luistert op `?prompt=…` en opent
 * de chat met een vooraf-bepaalde kick-off-vraag. Cruciaal voor de
 * acties-pool-flow: briefing-kaarten + teasers linken via deze
 * deeplink naar /berichten?prompt=toon-voorstel&rec=<id>.
 */

const mockReplace = vi.fn()
const mockOpenWithMessage = vi.fn()
let mockSearchParams = new URLSearchParams()
let mockPathname = '/overzicht'

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => mockPathname,
}))

vi.mock('./chat-provider', () => ({
  useChatContext: () => ({ openWithMessage: mockOpenWithMessage }),
}))

beforeEach(() => {
  mockReplace.mockClear()
  mockOpenWithMessage.mockClear()
  mockSearchParams = new URLSearchParams()
  mockPathname = '/overzicht'
})

describe('ChatPromptDeeplink', () => {
  it('does nothing when no prompt param is present', () => {
    mockSearchParams = new URLSearchParams()
    render(<ChatPromptDeeplink />)
    expect(mockOpenWithMessage).not.toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('opens the chat with the analyseer-mijn-financien kick-off', () => {
    mockSearchParams = new URLSearchParams('prompt=analyseer-mijn-financien')
    render(<ChatPromptDeeplink />)
    expect(mockOpenWithMessage).toHaveBeenCalledTimes(1)
    expect(mockOpenWithMessage.mock.calls[0][0]).toContain('Doorlicht mijn financiën')
  })

  it('opens the chat with herbekijk-uitgesteld kick-off', () => {
    mockSearchParams = new URLSearchParams('prompt=herbekijk-uitgesteld')
    render(<ChatPromptDeeplink />)
    expect(mockOpenWithMessage).toHaveBeenCalledTimes(1)
    expect(mockOpenWithMessage.mock.calls[0][0]).toContain('uitgesteld')
  })

  it('strips prompt from the URL after firing while preserving other params', () => {
    mockSearchParams = new URLSearchParams('prompt=analyseer-mijn-financien&other=keep')
    mockPathname = '/overzicht'
    render(<ChatPromptDeeplink />)
    expect(mockReplace).toHaveBeenCalledTimes(1)
    const target = mockReplace.mock.calls[0][0] as string
    expect(target).not.toContain('prompt=')
    expect(target).toContain('other=keep')
    expect(target.startsWith('/overzicht')).toBe(true)
  })

  it('does not open the chat for the removed toon-voorstel prompt key', () => {
    mockSearchParams = new URLSearchParams('prompt=toon-voorstel&rec=abc-123')
    render(<ChatPromptDeeplink />)
    expect(mockOpenWithMessage).not.toHaveBeenCalled()
  })

  it('ignores unknown prompt keys (no chat-open, no URL-rewrite)', () => {
    mockSearchParams = new URLSearchParams('prompt=onbekend')
    render(<ChatPromptDeeplink />)
    expect(mockOpenWithMessage).not.toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('returns to plain pathname when no other params remain after cleanup', () => {
    mockSearchParams = new URLSearchParams('prompt=analyseer-mijn-financien')
    mockPathname = '/overzicht'
    render(<ChatPromptDeeplink />)
    expect(mockReplace).toHaveBeenCalledWith('/overzicht', { scroll: false })
  })
})
