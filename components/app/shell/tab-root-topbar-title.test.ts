import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mainNav } from '@/lib/nav-config'

/**
 * Regressie: de mobiele TopBar toonde géén titel op de tab-roots /overzicht en
 * /toekomst, terwijl /mijn dat wél deed. Oorzaak: alleen /mijn renderde een
 * <NavStackMeta title=...>; de andere tab-roots lieten hun stack-entry op
 * `title: ''` staan, en de resolveRouteTitle-fallback in top-bar.tsx springt
 * bewust niet voor de 'rich'-variant. De titel van een tab-root komt dus van
 * de NavStackMeta-prop op de pagina zelf.
 *
 * Deze test pint het invariant: elke canonieke tab-root rendert een
 * <NavStackMeta> met (1) zijn tab-label als titel en (2) topBar kind 'rich',
 * zodat zowel de titel als de utility-cluster zichtbaar blijven. Single-sourced
 * op `mainNav` zodat een nieuwe/hernoemde tab-root vanzelf wordt meegenomen.
 */
describe('tab-root TopBar-titel (mobiele bovenbalk)', () => {
  for (const { label, href } of mainNav) {
    const segment = href.replace(/^\//, '')
    const pagePath = join(process.cwd(), 'app', '(app)', segment, 'page.tsx')

    it(`${href} rendert NavStackMeta met titel "${label}" en kind 'rich'`, () => {
      const src = readFileSync(pagePath, 'utf-8')
      expect(src).toContain('<NavStackMeta')
      expect(src).toContain(`title="${label}"`)
      expect(src).toMatch(/topBar=\{\{\s*kind:\s*'rich'/)
    })
  }
})
