/**
 * MIJN-1 — de /mijn-tabbalk verdwijnt op de hub (waar het kaartengrid exact
 * dezelfde bestemmingen toont) en blijft op de subpagina's staan.
 *
 * Geldt in BEIDE weergavemodi: dit is een dubbeling wegnemen, geen diepte
 * verbergen. Bron: docs/eenvoudige-weergave-audit.md §7 (/mijn).
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ModuleNav } from './module-nav'
import { mijnNav } from '@/lib/navigation'

const pathnameRef = { current: '/mijn' }

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameRef.current,
}))

function renderNav(pathname: string, hideOnBasePath: boolean) {
  pathnameRef.current = pathname
  return render(<ModuleNav config={mijnNav} hideOnBasePath={hideOnBasePath} />)
}

describe('ModuleNav — hideOnBasePath (MIJN-1)', () => {
  afterEach(cleanup)

  it('verbergt de tabbalk op de hub-route zelf', () => {
    renderNav('/mijn', true)
    expect(screen.queryByRole('navigation', { name: 'Mijn navigatie' })).toBeNull()
  })

  it('verbergt de tabbalk ook op de hub-route met trailing slash', () => {
    renderNav('/mijn/', true)
    expect(screen.queryByRole('navigation', { name: 'Mijn navigatie' })).toBeNull()
  })

  it('toont de tabbalk op een subpagina', () => {
    renderNav('/mijn/notificaties', true)
    const nav = screen.getByRole('navigation', { name: 'Mijn navigatie' })
    expect(nav).toBeInTheDocument()
    expect(screen.getByText('Notificaties')).toBeInTheDocument()
  })

  it('laat de balk zonder de prop ongemoeid staan op de hub (opt-in gedrag)', () => {
    renderNav('/mijn', false)
    expect(screen.getByRole('navigation', { name: 'Mijn navigatie' })).toBeInTheDocument()
  })
})
