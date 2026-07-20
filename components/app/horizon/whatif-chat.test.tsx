import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WhatIfChat } from './whatif-chat'

/**
 * Regressietest fase C2a: /api/ai/chat geeft in privé-modus een onvoorwaardelijke
 * server-403. De WhatIfChat houdt bewust zijn EIGEN cloud-transport, dus zou in
 * privé-modus stil falen (submit → 403 → geen zichtbare fout). Consistent met
 * "privacy aan = geen cloud-fallback" wordt het oppervlak daarom eerlijk
 * GEBLOKKEERD: invoer + verzendknop uit, en een blokkeer-melding i.p.v. een
 * misleidende cloud-belofte. Privé-modus UIT = whatif werkt gewoon (cloud).
 */

const mockUsePrivacyMode = vi.fn()
const mockSendMessage = vi.fn()

vi.mock('@/components/app/use-privacy-mode', () => ({
  usePrivacyMode: () => mockUsePrivacyMode(),
}))

vi.mock('@ai-sdk/react', () => ({
  useChat: () => ({
    messages: [],
    sendMessage: mockSendMessage,
    status: 'ready',
  }),
}))

vi.mock('ai', () => ({
  DefaultChatTransport: class {
    constructor(_opts: unknown) {}
  },
}))

const BLOCK_RE = /niet beschikbaar in privé-modus/i

beforeEach(() => {
  mockUsePrivacyMode.mockReset()
  mockSendMessage.mockReset()
})

describe('WhatIfChat — fail-closed in privé-modus (fase C2a)', () => {
  it('blokkeert de wat-als in privé-modus: melding zichtbaar, invoer uit, submit onmogelijk', () => {
    mockUsePrivacyMode.mockReturnValue(true)
    render(<WhatIfChat onAddEvent={vi.fn()} />)

    // Blokkeer-melding zichtbaar (geen cloud-belofte meer)
    expect(screen.getByText(BLOCK_RE)).toBeInTheDocument()

    // Invoer + verzendknop uitgeschakeld
    const textarea = screen.getByPlaceholderText(/privé-modus staat aan/i) as HTMLTextAreaElement
    expect(textarea).toBeDisabled()
    // In de lege staat is de verzendknop de enige knop.
    expect(screen.getByRole('button')).toBeDisabled()

    // Zelfs een Enter-toets stuurt niets naar de cloud
    fireEvent.change(textarea, { target: { value: 'Ik wil een wereldreis maken' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('laat de wat-als gewoon werken wanneer privé-modus UIT staat', () => {
    mockUsePrivacyMode.mockReturnValue(false)
    render(<WhatIfChat onAddEvent={vi.fn()} />)

    expect(screen.queryByText(BLOCK_RE)).not.toBeInTheDocument()

    const textarea = screen.getByPlaceholderText(/wat zijn je dromen/i) as HTMLTextAreaElement
    expect(textarea).not.toBeDisabled()

    fireEvent.change(textarea, { target: { value: 'Ik wil een wereldreis maken' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    expect(mockSendMessage).toHaveBeenCalledWith({ text: 'Ik wil een wereldreis maken' })
  })

  it('blokkeert niet zolang de privé-modus nog wordt gelezen (null)', () => {
    mockUsePrivacyMode.mockReturnValue(null)
    render(<WhatIfChat onAddEvent={vi.fn()} />)

    expect(screen.queryByText(BLOCK_RE)).not.toBeInTheDocument()
    const textarea = screen.getByPlaceholderText(/wat zijn je dromen/i) as HTMLTextAreaElement
    expect(textarea).not.toBeDisabled()
  })
})
