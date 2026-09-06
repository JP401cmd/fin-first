import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'

/**
 * Long-press op de waffle-knop (1 s) → direct naar het gekozen homescherm.
 *
 * Borgt de gedragingen die ertoe doen:
 *  - korte tik blijft de menu-toggle (bestaand gedrag, regressie-eis)
 *  - 1000 ms vasthouden navigeert naar `homeHref` uit useHomeScreen, sluit het
 *    menu en onderdrukt de click die ná touchend automatisch nog vuurt
 *  - loslaten vóór 1000 ms navigeert NIET
 *  - >8px bewegen (scroll/swipe) cancelt de long-press
 *  - de druk-registratie (data-pressing, voedt huisje-icoon + groei-animatie)
 *    gaat pas aan ná PRESS_VISUAL_DELAY_MS (250 ms) écht vasthouden — een
 *    korte tik toont nooit een huisje — en uit bij loslaten én bij het afgaan
 *  - vangnet: komt de click (menu-toggle) door zonder dat touchend de knop
 *    bereikte (device-gesture-anomalie, bug 1 sep 2026), dan wist de
 *    menu-toggle zelf de press-state en de nog lopende home-timer
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

  it('1000 ms vasthouden navigeert naar het gekozen homescherm, sluit het menu en onderdrukt de na-click', () => {
    renderPill()
    // Menu eerst open, zodat het sluiten door de long-press zichtbaar is.
    fireEvent.click(waffleButton())
    expect(sheetOpen()).toBe('true')

    fireEvent.touchStart(waffleButton(), touchAt(10, 10))
    // Druk-registratie nog niet direct — pas ná PRESS_VISUAL_DELAY_MS.
    expect(waffleButton().getAttribute('data-pressing')).toBeNull()
    act(() => {
      vi.advanceTimersByTime(250)
    })
    expect(waffleButton().getAttribute('data-pressing')).toBe('true')
    act(() => {
      vi.advanceTimersByTime(750)
    })
    // …en uit zodra de navigatie afgaat.
    expect(waffleButton().getAttribute('data-pressing')).toBeNull()

    expect(pushMock).toHaveBeenCalledTimes(1)
    expect(pushMock).toHaveBeenCalledWith('/overzicht/budget')
    expect(sheetOpen()).toBe('false')

    // Click vuurt op mobiel automatisch ná touchend — die mag het menu nu
    // niet alsnog togglen.
    fireEvent.touchEnd(waffleButton())
    fireEvent.click(waffleButton())
    expect(sheetOpen()).toBe('false')
    expect(pushMock).toHaveBeenCalledTimes(1)
  })

  it('loslaten vóór 1000 ms navigeert niet en zet de druk-registratie uit', () => {
    renderPill()
    fireEvent.touchStart(waffleButton(), touchAt(10, 10))
    act(() => {
      vi.advanceTimersByTime(900)
    })
    fireEvent.touchEnd(waffleButton())
    expect(waffleButton().getAttribute('data-pressing')).toBeNull()
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('korte tik toont nooit de druk-registratie (geen huisje-flits)', () => {
    renderPill()
    fireEvent.touchStart(waffleButton(), touchAt(10, 10))
    act(() => {
      vi.advanceTimersByTime(200)
    })
    // Onder PRESS_VISUAL_DELAY_MS: geen huisje, gewoon een tik.
    expect(waffleButton().getAttribute('data-pressing')).toBeNull()
    fireEvent.touchEnd(waffleButton())
    fireEvent.click(waffleButton())
    expect(sheetOpen()).toBe('true')
    expect(waffleButton().getAttribute('data-pressing')).toBeNull()
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('vangnet: click zonder touchend wist de press-state en de home-timer (bug 1 sep 2026)', () => {
    renderPill()
    // Device-anomalie: touchstart komt aan, de touchend bereikt de knop
    // nooit, maar de click (menu-toggle) komt wél door. Zonder vangnet bleef
    // data-pressing hangen (huisje-icoon terwijl het menu open stond) en
    // navigeerde de nog lopende timer 1 s later alsnog naar home.
    fireEvent.touchStart(waffleButton(), touchAt(10, 10))
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(waffleButton().getAttribute('data-pressing')).toBe('true')
    fireEvent.click(waffleButton())
    expect(sheetOpen()).toBe('true')
    // De menu-toggle is het bewijs dat de tik voorbij is: state gewist…
    expect(waffleButton().getAttribute('data-pressing')).toBeNull()
    // …en de home-timer ontwapend: geen spooknavigatie op de drempel.
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(pushMock).not.toHaveBeenCalled()
    expect(sheetOpen()).toBe('true')
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
