import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * W-010 — de donut en de projectie in de kaart "Verdeling & Projectie" moeten DEZELFDE
 * sizing-strategie volgen.
 *
 * `ProjectionChart` was fluïde (`viewBox` + `w-full`, de gevestigde chart-conventie in
 * deze codebase), `AllocationPie` had een vaste SVG-pixelgrootte. In dezelfde
 * `lg:grid-cols-2`-rij groeide de projectie daardoor mee met de kolom terwijl de donut op
 * 120 px bleef staan — op een brede desktop 6-7× verschil tussen twee gelijkwaardige
 * zusterelementen.
 *
 * BRON-TEST, geen render-test (precedent: de euro-view-bronpoort in
 * `components/app/horizon/horizon-client.euro-view.test.ts`). Wat hier misgaat is geen
 * gedrag maar een CSS-strategie: jsdom kent geen breakpoints en zou de regressie niet
 * zien, terwijl een `width={size}` dat terugsluipt precies de fout is die dit hersteld
 * heeft. De visuele controle op 375/768/2184 px blijft handwerk.
 */
const SRC = readFileSync(resolve(__dirname, 'assets-client.tsx'), 'utf8')

/** De `<svg>` van de donut, vanaf de opening tot de eerste `>`. */
function donutSvgTag(): string {
  const start = SRC.indexOf('viewBox={`0 0 ${size} ${size}`}')
  expect(start, 'de donut-viewBox is niet meer te vinden').toBeGreaterThan(-1)
  const open = SRC.lastIndexOf('<svg', start)
  return SRC.slice(open, SRC.indexOf('>', start) + 1)
}

describe('AllocationPie — fluïde, zoals elke andere chart', () => {
  it('draagt geen vaste width/height op de SVG', () => {
    const tag = donutSvgTag()
    expect(tag).not.toMatch(/\bwidth=\{size\}/)
    expect(tag).not.toMatch(/\bheight=\{size\}/)
  })

  it('schaalt via responsive classes, niet via één vast groter getal', () => {
    const tag = donutSvgTag()
    // Minstens één breakpoint-variant: een enkele vaste class zou dezelfde fout zijn
    // in een ander jasje (en breekt de 4-regelige legend op ~360 px).
    expect(tag).toMatch(/className="[^"]*\bw-\d+\b[^"]*\bsm:w-\d+\b/)
    expect(tag).toMatch(/className="[^"]*\bh-\d+\b[^"]*\bsm:h-\d+\b/)
  })

  it('houdt de viewBox op de 120×120-coördinatenruimte (radius/stroke/fontSize schalen mee)', () => {
    expect(SRC).toMatch(/const size = 120/)
    expect(donutSvgTag()).toContain('viewBox={`0 0 ${size} ${size}`}')
  })
})

describe('ProjectionChart-kolom — begrensd op brede schermen', () => {
  it('de projectie-sectie draagt een max-width', () => {
    const sectie = SRC.slice(SRC.indexOf('data-testid="portfolio-projection-section"'))
    const tagEinde = sectie.indexOf('>')
    expect(sectie.slice(0, tagEinde)).toMatch(/max-w-\[\d+px\]/)
  })

  it('de chart zelf blijft fluïde binnen die cap', () => {
    expect(SRC).toMatch(/data-testid="projection-area-chart"/)
    const svg = SRC.slice(SRC.indexOf('<svg viewBox={`0 0 ${w} ${h}`}'))
    expect(svg.slice(0, svg.indexOf('>'))).toContain('w-full')
  })
})
