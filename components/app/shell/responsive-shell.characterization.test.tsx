import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ResponsiveShell } from './responsive-shell'

/**
 * Karakteriseringstest voor Task 4.1 — ResponsiveShell enkelvoudig.
 *
 * Vóór de fix rendert de shell pré-hydratie BEIDE breakpoint-takken (desktop
 * `<main>` + mobiele `<MobileStackShell>`), elk met een eigen kopie van
 * `children` → `children` staat TWEE keer in de SSR-HTML (dubbele hydratie op
 * élke pagina). Na de fix draagt één persistente `<main>` de content exact één
 * keer; de chrome hangt als CSS-gegate siblings (`lg:hidden`) in dezelfde boom.
 *
 * We renderen server-side (`renderToStaticMarkup`) omdat de dubbeling een
 * pré-hydratie fenomeen is: bij een client-render zouden de effecten al
 * gelopen hebben en zou de inactieve tak al ge-unmount zijn. De chrome-
 * componenten mocken we naar `null` — deze test gaat puur over de STRUCTUUR
 * (hoe vaak `children` voorkomt), niet over de chrome-inhoud (die eigen
 * providers vereist).
 */

vi.mock('next/navigation', () => ({
  usePathname: () => '/overzicht',
  useRouter: () => ({ back: () => {}, push: () => {}, replace: () => {} }),
}))

// Chrome-componenten zijn niet relevant voor de children-telling; mock ze weg
// zodat we geen NotificationProvider/CommandPaletteProvider e.d. hoeven op te
// tuigen. Zowel de `@/`-alias-import als de relatieve `./`-import resolven naar
// hetzelfde absolute bestand, dus de mock dekt beide.
vi.mock('./sidebar', () => ({ Sidebar: () => null }))
vi.mock('./floating-nav-button', () => ({ FloatingNavButton: () => null }))
vi.mock('./top-bar', () => ({ TopBar: () => null }))
vi.mock('./mobile-bottom-bar', () => ({ MobileBottomBar: () => null }))

const MARKER = 'shell-single-child-marker'

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

describe('ResponsiveShell — enkelvoudige render van children (Task 4.1)', () => {
  it('rendert children exact één keer in de SSR-HTML (geen dubbele breakpoint-tak)', () => {
    const html = renderToStaticMarkup(
      <ResponsiveShell email="test@example.com" role="user">
        <div data-testid={MARKER}>PAGINA-CONTENT</div>
      </ResponsiveShell>,
    )

    expect(countOccurrences(html, MARKER)).toBe(1)
    expect(countOccurrences(html, 'PAGINA-CONTENT')).toBe(1)
  })

  it('rendert precies één <main>-element in de SSR-HTML (a11y: één main per pagina)', () => {
    const html = renderToStaticMarkup(
      <ResponsiveShell email="test@example.com" role="user">
        <div data-testid={MARKER}>PAGINA-CONTENT</div>
      </ResponsiveShell>,
    )

    expect(countOccurrences(html, '<main')).toBe(1)
  })
})
