/**
 * `?whatif=open` scrolt naar het doelscenario-lab — bij élke deeplink, niet één keer per sessie.
 *
 * Given de provider staat in de katern-layout en blijft dus staan bij een katernwissel,
 *       en het lab (de sectie met `verkenSectionRef`) rendert pas als de sim-uitkomst er is,
 * When  de deeplink `?whatif=open` binnenkomt (eerste keer, de sectie verschijnt later),
 *       daarna de gebruiker naar Plan gaat en dezelfde link opnieuw volgt,
 * Then  scrolt de sectie beide keren in beeld.
 *
 * Het defect: de trigger was een boolean die nooit terugviel. De tweede deeplink zette
 * `true` op `true` — geen state-wissel, dus geen scroll. En de eerste keer vuurde de
 * scroll na 120 ms op een ref die nog leeg was (het lab wacht op `simResult`); dan
 * scrolde hij nooit (vangnet §3.3).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render } from '@testing-library/react'
import { useToekomstOverlayState } from './use-toekomst-overlay-state'
import type { ToekomstPerspectief } from './use-toekomst-perspectief'

let huidigeParams = new URLSearchParams()
const replace = vi.fn()
// Referentie-stabiel, zoals Next' router: de deeplink-effect hangt aan `router`.
const router = { replace }

vi.mock('next/navigation', () => ({
  useSearchParams: () => huidigeParams,
  useRouter: () => router,
  usePathname: () => '/toekomst/doelen',
}))

const PERSPECTIEF = { isHouseholdView: false, householdRetireInfo: null } as unknown as ToekomstPerspectief

function Harnas({ labZichtbaar }: { labZichtbaar: boolean }) {
  const { verkenSectionRef } = useToekomstOverlayState({ perspectief: PERSPECTIEF })
  return labZichtbaar ? <section ref={verkenSectionRef} data-testid="lab" /> : null
}

const scrollIntoView = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  scrollIntoView.mockClear()
  replace.mockClear()
  Element.prototype.scrollIntoView = scrollIntoView
  huidigeParams = new URLSearchParams()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useToekomstOverlayState — ?whatif=open scrolt naar het lab', () => {
  it('scrolt de eerste keer ook als het lab pas na de sim-uitkomst verschijnt', () => {
    huidigeParams = new URLSearchParams('whatif=open')
    const { rerender } = render(<Harnas labZichtbaar={false} />)

    // De sim loopt nog: geen sectie, dus ook geen scroll.
    act(() => { vi.advanceTimersByTime(600) })
    expect(scrollIntoView).not.toHaveBeenCalled()

    // `simResult` komt binnen, het lab rendert.
    rerender(<Harnas labZichtbaar />)
    act(() => { vi.advanceTimersByTime(600) })
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('scrolt opnieuw bij dezelfde deeplink na een uitstap naar Plan', () => {
    huidigeParams = new URLSearchParams('whatif=open')
    const { rerender } = render(<Harnas labZichtbaar />)
    act(() => { vi.advanceTimersByTime(600) })
    expect(scrollIntoView).toHaveBeenCalledTimes(1)

    // De URL is opgeschoond; de gebruiker gaat naar Plan (het lab unmount, de provider blijft).
    huidigeParams = new URLSearchParams()
    rerender(<Harnas labZichtbaar={false} />)
    act(() => { vi.advanceTimersByTime(600) })

    // Dezelfde widget-link opnieuw.
    huidigeParams = new URLSearchParams('whatif=open')
    rerender(<Harnas labZichtbaar />)
    act(() => { vi.advanceTimersByTime(600) })
    expect(scrollIntoView).toHaveBeenCalledTimes(2)
  })

  it('scrolt niet zonder deeplink, en niet nog eens bij een gewone re-render', () => {
    const { rerender } = render(<Harnas labZichtbaar />)
    act(() => { vi.advanceTimersByTime(600) })
    rerender(<Harnas labZichtbaar />)
    act(() => { vi.advanceTimersByTime(600) })
    expect(scrollIntoView).not.toHaveBeenCalled()
  })
})
