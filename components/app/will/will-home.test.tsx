import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { WillHome } from './will-home'
import type { CoachDataGaps } from '@/lib/coach-suggestions'

const open = vi.fn()
const toggle = vi.fn()
const openWithMessage = vi.fn()
let isOpenValue = false

vi.mock('@/components/app/chat/chat-provider', () => ({
  useChatContext: () => ({ isOpen: isOpenValue, open, toggle, openWithMessage, close: vi.fn() }),
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/overzicht',
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

const gaps = (over: Partial<CoachDataGaps> = {}): CoachDataGaps => ({
  hasBank: true, hasAssets: true, hasBudgets: true, hasGoals: true, hasDebts: true,
  hasTransactions: true, hasHoldings: true, hasHoldingsWithIsin: true, hasFireParams: true,
  hasLifeEvents: true, ...over,
})

beforeEach(() => {
  vi.useFakeTimers(); localStorage.clear(); isOpenValue = false
  open.mockReset(); toggle.mockReset(); openWithMessage.mockReset()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ count: 0 }) }))
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('WillHome', () => {
  it('toont de bubbel-launcher en opent de chat bij klik', () => {
    render(<WillHome dataGaps={gaps()} delayMs={1000} />)
    const launcher = screen.getByRole('button', { name: /Open chat met Will/i })
    fireEvent.click(launcher)
    expect(toggle).toHaveBeenCalled()
  })

  it('toont de melding na delayMs met reduced-motion-tekst', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as unknown as MediaQueryList)
    render(<WillHome dataGaps={gaps({ hasBank: false })} delayMs={1000} autoDismissMs={999999} />)
    act(() => { vi.advanceTimersByTime(1000 + 400) })
    expect(screen.getByText(/Koppel je bank/i)).toBeInTheDocument()
  })

  it('× sluit de melding zonder de chat te openen', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as unknown as MediaQueryList)
    render(<WillHome dataGaps={gaps({ hasBank: false })} delayMs={0} autoDismissMs={999999} />)
    await act(async () => {})
    act(() => { vi.advanceTimersByTime(400) })
    fireEvent.click(screen.getByRole('button', { name: /Sluiten/i }))
    expect(open).not.toHaveBeenCalled()
    expect(screen.queryByText(/Koppel je bank/i)).not.toBeInTheDocument()
  })

  it('rendert niets wanneer de chat open is (één Will)', () => {
    isOpenValue = true
    const { container } = render(<WillHome dataGaps={gaps()} delayMs={0} />)
    expect(container).toBeEmptyDOMElement()
  })
})
