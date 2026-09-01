import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'

/**
 * Long-press op de waffle-knop (1,5 s) → direct naar het gekozen homescherm.
 *
 * Borgt de vier gedragingen die ertoe doen:
 *  - korte tik blijft de menu-toggle (bestaand gedrag, regressie-eis)
 *  - 1500 ms vasthouden navigeert naar `homeHref` uit useHomeScreen, sluit het
 *    menu en onderdrukt de click die ná touchend automatisch nog vuurt
 *  - loslaten vóór 1500 ms navigeert NIET
 *  - >8px bewegen (scroll/swipe) cancelt de long-press
 */

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  usePathname: () => '/overzicht',
  useRouter: () => ({ push: pushMock }),
}))
vi.mock('@/components/command-palette/command-palette-provider', () => ({
  useCommandPalette: () => ({ open: vi.fn() }),
}))
vi.mock('@/lib/overlay-signal', () => ({
  useOverlayOpen: () => false,
}))
vi.mock('@/lib/shell/fin-slot', () => ({
  useFinSlot: () => ({ registerSlot: vi.fn() }),
}))
vi.mock('./nav-menu-sheet', () => ({
  NavMenuSheet: ({ open }: { open: boolean }) => (
    <div data-testid="nav-menu-sheet" data-open={String(open)} />
  ),
}))

import { FloatingNavButton } from './floating-nav-button'
import { HomeScreenProvider } from '@/lib/hooks/use-home-screen'

function renderPill() {
  return render(
    <HomeScreenProvider initialHomeScreen="budget">
      <FloatingNavButton />
    </HomeScreenProvider>,
  )
}

function waffleButton() {
  return screen.getByRole('button', { name: /Menu openen|Menu sluiten/ })
}

function sheetOpen() {
  return screen.getByTestId('nav-menu-sheet').getAttribute('data-open')
}

const touchAt = (x: number, y: number) => ({ touches: [{ clientX: x, clientY: y }] })

describe('FloatingNavButton — long-press waffle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    pushMock.mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('korte tik togglet het menu (bestaand gedrag)', () => {
    renderPill()
    expect(sheetOpen()).toBe('false')
    fireEvent.click(waffleButton())
    expect(sheetOpen()).toBe('true')
    fireEvent.click(waffleButton())
    expect(sheetOpen()).toBe('false')
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('1500 ms vasthouden navigeert naar het gekozen homescherm, sluit het menu en onderdrukt de na-click', () => {
    renderPill()
    // Menu eerst open, zodat het sluiten door de long-press zichtbaar is.
    fireEvent.click(waffleButton())
    expect(sheetOpen()).toBe('true')

    fireEvent.touchStart(waffleButton(), touchAt(10, 10))
    act(() => {
      vi.advanceTimersByTime(1500)
    })

    expect(pushMock).toHaveBeenCalledTimes(1)
    expect(pushMock).toHaveBeenCalledWith('/overzicht/cashflow/budget')
    expect(sheetOpen()).toBe('false')

    // Click vuurt op mobiel automatisch ná touchend — die mag het menu nu
    // niet alsnog togglen.
    fireEvent.touchEnd(waffleButton())
    fireEvent.click(waffleButton())
    expect(sheetOpen()).toBe('false')
    expect(pushMock).toHaveBeenCalledTimes(1)
  })

  it('loslaten vóór 1500 ms navigeert niet', () => {
    renderPill()
    fireEvent.touchStart(waffleButton(), touchAt(10, 10))
    act(() => {
      vi.advanceTimersByTime(1400)
    })
    fireEvent.touchEnd(waffleButton())
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('meer dan 8px bewegen cancelt de long-press (scroll wint)', () => {
    renderPill()
    fireEvent.touchStart(waffleButton(), touchAt(10, 10))
    fireEvent.touchMove(waffleButton(), touchAt(10, 30))
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(pushMock).not.toHaveBeenCalled()
  })
})
