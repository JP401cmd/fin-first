/**
 * Bron-grendel op de weergavemodus van /overzicht/bezittingen (S11).
 *
 * De bevinding: in Eenvoudig krompen de vier KPI's tot één cel — het eigen
 * portefeuillerendement viel weg — terwijl béide promo-simulators eronder
 * integraal bleven staan. Een beginner kreeg wél "0,5% fee kost je €51.091" en
 * niet zijn eigen cijfer. De oorzaak was noch `SIMPLE_MAX_FIGURES` noch
 * `HideInSimple`, maar een DERDE mechanisme: twee losse `figures`-arrays achter
 * een `mode`-ternary op de call-site — precies wat ADR 0026 verbiedt.
 *
 * WAAROM EEN BRON-TEST: alle drie de eigenschappen die S11 herstelt zijn
 * compositie-eigenschappen van de bron, niet van een gerenderde waarde. De
 * reductie zélf is al volledig afgedekt op de primitive
 * (`components/editorial/figures-strip.test.tsx` — max 2, `simpleFigures`-keuze,
 * cols-forcering); die opnieuw renderen via `AssetsPage` zou een supabase-
 * fetchende client-component moeten optuigen om iets te bewijzen dat letterlijk
 * in de bron staat. Wat de render-test níet vangt, en deze wél: dat de call-site
 * de primitive überhaupt zijn werk laat doen. Precedent:
 * `components/overview/overzicht-hero.block-order.test.ts`.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const clientSource = readFileSync(
  join(process.cwd(), 'components', 'core', 'assets-client.tsx'),
  'utf8',
)
const pageSource = readFileSync(
  join(process.cwd(), 'app', '(app)', 'overzicht', 'bezittingen', 'page.tsx'),
  'utf8',
)

/** Index van een fragment, met een sprekende fout als het ontbreekt. */
function at(source: string, needle: string, where: string): number {
  const i = source.indexOf(needle)
  expect(i, `"${needle}" niet gevonden in ${where} — grendel staat stil`).toBeGreaterThan(-1)
  return i
}

describe('/overzicht/bezittingen — één figures-strip, geen mode-ternary (S11)', () => {
  it('rendert de strip precies één keer', () => {
    const treffers = clientSource.split('<FiguresStrip').length - 1
    expect(
      treffers,
      'twee <FiguresStrip>-aanroepen betekent bijna zeker weer twee losse arrays achter een mode-ternary',
    ).toBe(1)
  })

  it('bouwt één bron-array `figures` en geeft die ongefilterd door', () => {
    at(clientSource, 'const figures: FigureProps[] = [', 'assets-client.tsx')
    at(clientSource, 'figures={figures}', 'assets-client.tsx')
  })

  it('laat de kéuze welke twee cellen blijven aan `simpleFigures`, niet aan een ternary', () => {
    const strip = at(clientSource, '<FiguresStrip', 'assets-client.tsx')
    const simpleProp = at(clientSource, 'simpleFigures={', 'assets-client.tsx')
    expect(simpleProp).toBeGreaterThan(strip)
    // Cel 0 = Totale waarde, cel 2 = het eigen rendement. Dát is de inversie die
    // S11 herstelt: het eigen antwoord vóór de hypothetische promo eronder.
    expect(clientSource).toContain('[figures[0], figures[2]]')
    // Terugval wanneer er geen kostprijs bekend is: dan rendert cel 2 een
    // streepje, en twee cellen waarvan één leeg is, is geen antwoord.
    expect(clientSource).toContain('[figures[0], figures[1]]')
  })

  it('de rekenmodal-knop is niet meer op `!simple` gegate', () => {
    const knop = at(clientSource, 'Zo is het rendement berekend', 'assets-client.tsx')
    // Zoek de dichtstbijzijnde gate vóór de knop; die mocht daar niet staan.
    const blok = clientSource.slice(Math.max(0, knop - 900), knop)
    expect(
      blok.includes('{!simple &&'),
      'de knop staat weer alleen in Volledig — maar de rendement-cel staat er in Eenvoudig óók, dus de uitleg hoort erbij',
    ).toBe(false)
  })
})

describe('/overzicht/bezittingen — hoogstens één inspiratiekaart in Eenvoudig (OVZ-5, beperkt)', () => {
  it('de beheerkosten-simulator staat in `HideInSimple`', () => {
    const hide = at(pageSource, '<HideInSimple>', 'bezittingen/page.tsx')
    const fee = at(pageSource, '<FeeImpactCard', 'bezittingen/page.tsx')
    expect(fee).toBeGreaterThan(hide)
    expect(pageSource.indexOf('</HideInSimple>')).toBeGreaterThan(fee)
  })

  it('de samengestelde-rente-kaart blijft in BEIDE modi staan', () => {
    const compound = at(pageSource, '<CompoundInsightCard', 'bezittingen/page.tsx')
    const hide = at(pageSource, '<HideInSimple>', 'bezittingen/page.tsx')
    expect(
      compound,
      'CompoundInsightCard is mee naar Volledig verhuisd — dat is optie B, en die is niet gekozen: hij is de enige "waarom zou ik"-motivatie voor wie nog niet belegt',
    ).toBeLessThan(hide)
  })

  it('de kaarten-container klapt weg als er in Eenvoudig niets overblijft', () => {
    expect(
      clientSource,
      'zonder empty:hidden blijft er een lege doos met marge staan zodra alleen de fee-kaart haar drempel haalt',
    ).toContain('space-y-4 empty:hidden')
  })
})
