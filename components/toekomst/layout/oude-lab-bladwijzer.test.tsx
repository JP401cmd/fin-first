/**
 * Oude bladwijzer `/toekomst#verken-je-aannames` → katern Doelen (fixronde C1 punt 8).
 *
 * In de browser bleef zo'n bladwijzer op Plan staan: de `router.replace` in het
 * mount-effect viel weg tijdens de hydratie. De handler probeert het nu na mount, kijkt
 * daarna kort of de adresbalk is meegegaan en probeert het opnieuw; lukt het dan nog
 * niet, dan een harde navigatie.
 */
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OudeLabBladwijzer, bladwijzerNavigatie } from './oude-lab-bladwijzer'

const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))

const DOEL = '/toekomst/doelen#verken-je-aannames'

beforeEach(() => {
  vi.useFakeTimers()
  replace.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('OudeLabBladwijzer', () => {
  it('stuurt /toekomst#verken-je-aannames na mount door naar het lab in Doelen', () => {
    window.history.replaceState(null, '', '/toekomst#verken-je-aannames')
    render(<OudeLabBladwijzer />)
    expect(replace).toHaveBeenCalledWith(DOEL)
  })

  it('valt de eerste replace weg (hydratie), dan opnieuw; daarna een harde navigatie', () => {
    const hard = vi.spyOn(bladwijzerNavigatie, 'hard').mockImplementation(() => {})
    window.history.replaceState(null, '', '/toekomst#verken-je-aannames')
    render(<OudeLabBladwijzer />)
    expect(replace).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(300)
    expect(replace).toHaveBeenCalledTimes(2)
    expect(hard).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1_000)
    expect(hard).toHaveBeenCalledWith(DOEL)
  })

  it('is de navigatie gelukt, dan geen herhaling', () => {
    const hard = vi.spyOn(bladwijzerNavigatie, 'hard').mockImplementation(() => {})
    replace.mockImplementation((url: string) => window.history.replaceState(null, '', url))
    window.history.replaceState(null, '', '/toekomst#verken-je-aannames')
    render(<OudeLabBladwijzer />)
    vi.advanceTimersByTime(2_000)
    expect(replace).toHaveBeenCalledTimes(1)
    expect(hard).not.toHaveBeenCalled()
  })

  it('zonder die hash doet hij niets', () => {
    window.history.replaceState(null, '', '/toekomst#iets-anders')
    render(<OudeLabBladwijzer />)
    vi.advanceTimersByTime(2_000)
    expect(replace).not.toHaveBeenCalled()
  })
})
