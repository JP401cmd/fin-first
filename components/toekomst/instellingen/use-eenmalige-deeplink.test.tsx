import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'

/**
 * `useEenmaligeDeeplink` (C3 punt 7) — de hook achter `?nieuw=` (Gebeurtenissen) en
 * `?strategie=`/`?regel=` (Voorkeuren): de waarde gaat één keer naar de opener en de
 * param verdwijnt meteen uit de URL, route-onafhankelijk via de huidige pathname.
 */
const nav = vi.hoisted(() => ({
  search: new URLSearchParams(),
  pathname: '/toekomst/instellingen',
  replace: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => nav.search,
  usePathname: () => nav.pathname,
}))

import { urlZonderParam, useEenmaligeDeeplink } from './use-eenmalige-deeplink'

function Probe({ onWaarde }: { onWaarde: (w: string) => void }) {
  useEenmaligeDeeplink('nieuw', onWaarde)
  return null
}

beforeEach(() => {
  nav.search = new URLSearchParams()
  nav.pathname = '/toekomst/instellingen'
  nav.replace.mockClear()
})
afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})

describe('urlZonderParam', () => {
  it('haalt alleen de sleutel weg en houdt de rest plus de hash', () => {
    expect(urlZonderParam('/a', new URLSearchParams('nieuw=1&x=2'), 'nieuw', '#g')).toBe('/a?x=2#g')
    expect(urlZonderParam('/a', new URLSearchParams('nieuw=1'), 'nieuw')).toBe('/a')
  })
})

describe('useEenmaligeDeeplink', () => {
  it('?nieuw=1: opener krijgt de waarde, de param verdwijnt, de hash blijft', () => {
    window.history.replaceState(null, '', '/toekomst/instellingen?nieuw=1#gebeurtenissen')
    nav.search = new URLSearchParams('nieuw=1')
    const onWaarde = vi.fn()
    render(<Probe onWaarde={onWaarde} />)
    expect(onWaarde).toHaveBeenCalledWith('1')
    expect(nav.replace).toHaveBeenCalledWith('/toekomst/instellingen#gebeurtenissen', { scroll: false })
  })

  it('volgt de huidige pathname (geen vaste route)', () => {
    nav.pathname = '/toekomst/iets'
    nav.search = new URLSearchParams('nieuw=true')
    render(<Probe onWaarde={vi.fn()} />)
    expect(nav.replace).toHaveBeenCalledWith('/toekomst/iets', { scroll: false })
  })

  it('zonder param: niets openen, niets vervangen', () => {
    const onWaarde = vi.fn()
    render(<Probe onWaarde={onWaarde} />)
    expect(onWaarde).not.toHaveBeenCalled()
    expect(nav.replace).not.toHaveBeenCalled()
  })
})
