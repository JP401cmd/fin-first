/**
 * `?tab=` na de redirect opruimen (fixronde C1 punt 9).
 *
 * `next.config.ts` stuurt de oude `/toekomst?tab=…`-deeplinks naar het juiste katern,
 * maar Next laat de query meereizen: `/toekomst/doelen?tab=doelen`. Niets leest `tab`
 * nog, dus de layout-laag haalt hem weg — één `router.replace` zonder scroll, op het
 * huidige pad, met de overige params en de hash. Wachten op de andere deeplink-
 * opruimers, zodat twee replaces elkaars werk niet terugdraaien.
 */
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OudeTabParam } from './oude-tab-param'

const replace = vi.fn()
let pathname = '/toekomst/doelen'
let search = ''
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(search),
}))

beforeEach(() => {
  replace.mockReset()
  pathname = '/toekomst/doelen'
  search = ''
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('OudeTabParam', () => {
  it('haalt tab weg met één replace zonder scroll', () => {
    search = 'tab=doelen'
    render(<OudeTabParam />)
    expect(replace).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenCalledWith('/toekomst/doelen', { scroll: false })
  })

  it('houdt de overige params en de hash', () => {
    pathname = '/toekomst/instellingen'
    search = 'tab=gebeurtenissen&nieuw=1'
    window.history.replaceState(null, '', '/toekomst/instellingen?tab=gebeurtenissen&nieuw=1#gebeurtenissen')
    render(<OudeTabParam />)
    expect(replace).toHaveBeenCalledWith('/toekomst/instellingen?nieuw=1#gebeurtenissen', { scroll: false })
  })

  it('geen lus: zonder tab gebeurt er niets, ook niet na de opruiming', () => {
    search = 'tab=doelen'
    const { rerender } = render(<OudeTabParam />)
    search = ''
    rerender(<OudeTabParam />)
    expect(replace).toHaveBeenCalledTimes(1)
    replace.mockReset()
    render(<OudeTabParam />)
    expect(replace).not.toHaveBeenCalled()
  })

  it('wacht zolang een andere deeplink-opruimer nog aan de beurt is (whatif, planreview, regel)', () => {
    for (const ander of ['whatif=open', 'planreview=open', 'regel=eindstrategie']) {
      replace.mockReset()
      search = `tab=doelen&${ander}`
      const { rerender, unmount } = render(<OudeTabParam />)
      expect(replace, ander).not.toHaveBeenCalled()
      search = 'tab=doelen'
      rerender(<OudeTabParam />)
      expect(replace, ander).toHaveBeenCalledWith('/toekomst/doelen', { scroll: false })
      unmount()
    }
  })
})
