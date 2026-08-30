import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * B-012 — bron-grendel op het terugknop-gedrag van de `?asset=<id>`-pane.
 *
 * Given de bezittingen-pagina met een gesloten detail-pane,
 * When de gebruiker hem opent,
 * Then hoort er één history-entry bij (push) zodat de mobiele terugknop de
 *   pane sluit i.p.v. de route te verlaten; sluiten consumeert die entry
 *   (back) en een deeplink valt terug op replace.
 *
 * WAAROM EEN BRON-TEST (precedent: `assets-client.figures-strip.test.ts`):
 * de push/back/replace-semantiek zélf is volledig afgedekt op de helper
 * (`lib/pane-url-history.test.ts`) en op controller-niveau gerenderd bewezen
 * in `components/core/holdings-client.pane-history.test.tsx`. Wat hier
 * overblijft is een BEDRADINGS-eigenschap van de bron: dat élk open- en
 * sluitpad van deze controller door die helper gaat, dat de deeplink-promotie
 * er juist buiten blijft, en dat de pane-URL de huidige pathname behoudt.
 * `AssetsPage` (4.9k regels, Supabase-fetchend, pane-open achter een genest
 * ⋯-menu) mounten om dát te bewijzen is niet proportioneel.
 */

const source = readFileSync(
  join(process.cwd(), 'components', 'core', 'assets-client.tsx'),
  'utf8',
)

/** Het codeblok tussen twee ankers, met een sprekende fout als er één mist. */
function slice(from: string, to: string): string {
  const start = source.indexOf(from)
  expect(start, `anker "${from}" niet gevonden — grendel staat stil`).toBeGreaterThan(-1)
  const end = source.indexOf(to, start)
  expect(end, `anker "${to}" niet gevonden — grendel staat stil`).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe('assets-client — ?asset-pane hangt aan pane-url-history (B-012)', () => {
  it('gebruikt één createPaneUrlHistory-instantie, gebonden aan de router', () => {
    expect(source).toContain("from '@/lib/pane-url-history'")
    expect(source).toContain(
      'const paneHistory = useMemo(() => createPaneUrlHistory(router), [router])',
    )
  })

  it('opent via paneHistory.open met de alreadyOpen-vlag en sluit via paneHistory.close', () => {
    const setter = slice(
      'const setSelectedAssetId = useCallback(',
      'const closeReturnModal',
    )
    expect(setter).toContain('paneHistory.open(url, requestedAssetId != null)')
    expect(setter).toContain('paneHistory.close(url)')
    // Een kale replace hier is precies het defect: geen entry bij openen, dus
    // de terugknop verlaat de hele route.
    expect(setter).not.toContain('router.replace(')
  })

  it('meldt een door popstate gesloten pane met reset(), zodat close geen tweede back doet', () => {
    expect(source).toContain('paneHistory.reset()')
    expect(source).toContain('paneOpenRef.current = requestedAssetId != null')
  })

  it('houdt de deeplink-promotie (initialAssetId) buiten de history', () => {
    const effect = slice('const initialAssetIdAppliedRef', 'const handleAssetEdit')
    expect(effect).toContain('router.replace(')
    expect(effect).not.toContain('paneHistory.')
  })

  it('bouwt de pane-URL op de huidige pathname, niet op een vaste /core/assets-basis', () => {
    const builder = slice('const buildPaneUrl = useCallback(', 'const paneHistory')
    expect(builder).toContain('${pathname}?${queryString}')
    // Deze client draait ook embedded onder /overzicht/bezittingen; een harde
    // basis wisselde daar bij elke pane-actie de hele route.
    expect(source).not.toContain('`/core/assets${')
  })
})
