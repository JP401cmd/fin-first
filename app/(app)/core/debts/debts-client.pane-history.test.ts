import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * B-012 — bron-grendel op het terugknop-gedrag van de `?debt=<id>`-pane.
 *
 * Given de schuldenpagina met een gesloten detail-pane,
 * When de gebruiker hem opent,
 * Then hoort er één history-entry bij (push) zodat de mobiele terugknop de
 *   pane sluit i.p.v. de route te verlaten; sluiten consumeert die entry
 *   (back) en een deeplink valt terug op replace.
 *
 * WAAROM EEN BRON-TEST: zie de toelichting in
 * `components/core/assets-client.pane-history.test.ts`. De push/back/replace-
 * semantiek staat in `lib/pane-url-history.test.ts` en is gerenderd bewezen in
 * `components/core/holdings-client.pane-history.test.tsx`; hier grendelen we de
 * bedrading van déze controller. Extra reden voor de bronvorm: het enige pad
 * dat de pane opent zit achter het genest ⋯-menu van een schuldkaart — de
 * kaart-body navigeert bewust naar de categoriepagina.
 *
 * De laatste test legt bovendien de BEOORDELING van `?strategie=` vast: dat is
 * géén overlay-state en hoort dus juist NIET aan de pane-history.
 */

const source = readFileSync(
  join(process.cwd(), 'app', '(app)', 'core', 'debts', 'debts-client.tsx'),
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

describe('debts-client — ?debt-pane hangt aan pane-url-history (B-012)', () => {
  it('gebruikt één createPaneUrlHistory-instantie, gebonden aan de router', () => {
    expect(source).toContain("from '@/lib/pane-url-history'")
    expect(source).toContain(
      'const paneHistory = useMemo(() => createPaneUrlHistory(router), [router])',
    )
  })

  it('opent via paneHistory.open met de alreadyOpen-vlag en sluit via paneHistory.close', () => {
    const setter = slice(
      'const setSelectedDebtId = useCallback(',
      'const VALID_STRATEGIES',
    )
    expect(setter).toContain('paneHistory.open(url, requestedDebtId != null)')
    expect(setter).toContain('paneHistory.close(url)')
    // Een kale replace hier is precies het defect: geen entry bij openen, dus
    // de terugknop verlaat de hele route.
    expect(setter).not.toContain('router.replace(')
  })

  it('meldt een door popstate gesloten pane met reset(), zodat close geen tweede back doet', () => {
    expect(source).toContain('paneHistory.reset()')
    expect(source).toContain('paneOpenRef.current = requestedDebtId != null')
  })

  it('bouwt de pane-URL op de huidige pathname, niet op een vaste /core/debts-basis', () => {
    const builder = slice('const buildPaneUrl = useCallback(', 'const paneHistory')
    expect(builder).toContain('${pathname}?${queryString}')
    // Deze client draait ook embedded onder /overzicht/schulden; een harde
    // basis wisselde daar bij elke pane-actie de hele route.
    expect(source).not.toContain('`/core/debts${')
  })

  it('laat ?strategie= bewust buiten de pane-history (inline kaart, geen overlay)', () => {
    const strategie = slice('const setStrategieInUrl = useCallback(', 'const selectedDebt')
    expect(strategie).toContain('router.replace(url, { scroll: false })')
    expect(strategie).not.toContain('paneHistory.')
    // Wél pathname-behoudend, net als de pane-URL.
    expect(strategie).toContain('buildPaneUrl(')
  })
})
