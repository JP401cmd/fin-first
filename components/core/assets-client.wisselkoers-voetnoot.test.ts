/**
 * Bron-grendel op de wisselkoers-voetnoot van /overzicht/bezittingen (UR3-08).
 *
 * De bevinding: deze pagina toont een vrijheidstijd op zes plekken (twee
 * strip-cellen, het subtotaal excl. eigen woning, de taartpunt, elke
 * bezittingkaart, de rekenmodal) zonder er ooit bij te zeggen wáár die tijd
 * vandaan komt. Persona Henk las "1j 4m" bij zijn eerste bezitting en begreep pas
 * twee schermen later dat vrijheidstijd niets meer is dan bedrag ÷ dagtarief.
 *
 * WAAROM EEN BRON-TEST: de drie eigenschappen die hier bewaakt worden zijn
 * compositie-eigenschappen van de call-site, niet van een gerenderde waarde. Het
 * gedrág van de voetnoot zelf (maskering, `source: 'none'`, schatting-zin,
 * inline/regel) is volledig afgedekt op het component
 * (`components/app/vrijheidstijd-voetnoot.test.tsx`); dat opnieuw bewijzen via
 * `AssetsPage` zou een supabase-fetchende client-component van 4.000 regels
 * moeten optuigen. Wat die componenttest níet kan vangen, en deze wél: dat déze
 * pagina de voetnoot één keer plaatst, hem de canonieke koers ÉN de bron voert,
 * en er geen tweede formulering van diezelfde zin naast zet. Precedent:
 * `components/core/assets-client.figures-strip.test.ts`.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const clientSource = readFileSync(
  join(process.cwd(), 'components', 'core', 'assets-client.tsx'),
  'utf8',
)
const loaderSource = readFileSync(
  join(process.cwd(), 'lib', 'assets-data-loader.ts'),
  'utf8',
)

/** Index van een fragment, met een sprekende fout als het ontbreekt. */
function at(source: string, needle: string, where: string): number {
  const i = source.indexOf(needle)
  expect(i, `"${needle}" niet gevonden in ${where} — grendel staat stil`).toBeGreaterThan(-1)
  return i
}

describe('/overzicht/bezittingen — de wisselkoers staat naast de tijdgetallen (UR3-08)', () => {
  it('rendert de voetnoot precies één keer (eigenaarsbesluit A: één per grid)', () => {
    const treffers = clientSource.split('<VrijheidstijdVoetnoot').length - 1
    expect(
      treffers,
      'meer dan één voetnoot betekent de koers per cel/kaart herhalen — precies wat besluit A uitsluit',
    ).toBe(1)
  })

  it('plaatst hem direct ná de figures-strip, waar het eerste tijdgetal staat', () => {
    const strip = at(clientSource, '<FiguresStrip', 'assets-client.tsx')
    const voetnoot = at(clientSource, '<VrijheidstijdVoetnoot', 'assets-client.tsx')
    const subtotaal = at(clientSource, '<SubtotalLine', 'assets-client.tsx')
    expect(voetnoot).toBeGreaterThan(strip)
    expect(
      voetnoot,
      'de voetnoot hoort vóór het subtotaal excl. eigen woning: die deelt dezelfde koers',
    ).toBeLessThan(subtotaal)
  })

  it('voert hem de bundelkoers én de bron — geen eigen som, geen afgeleide bron', () => {
    at(clientSource, 'dailyRate={dailyExpenses}', 'assets-client.tsx')
    at(clientSource, 'source={dailyExpensesSource}', 'assets-client.tsx')
    at(clientSource, "const dailyExpenses = initialData?.dailyExpenses ?? 0", 'assets-client.tsx')
    at(
      clientSource,
      'const dailyExpensesSource = initialData?.dailyExpensesSource',
      'assets-client.tsx',
    )
  })

  it('zet geen tweede formulering van de koers naast de voetnoot', () => {
    // `formatFreedomRateFootnote` (lib/format.ts) is het enige huis van de zin en
    // wordt uitsluitend via het component aangeroepen. Wie hier zélf de helper
    // aanroept, of met de hand "Tegen je dagtarief van …" typt, maakt een tweede
    // waarheid over dezelfde koers — precies de drift die deze kaart opheft.
    expect(
      clientSource,
      'roep de helper niet rechtstreeks aan — de voetnoot loopt via <VrijheidstijdVoetnoot>',
    ).not.toContain('formatFreedomRateFootnote')
    expect(
      clientSource,
      'de zin met de hand overtypen maakt een tweede formulering van dezelfde koers',
    ).not.toMatch(/dagtarief van/)
  })

  it('laat de loader de bron meesturen vanaf dezelfde bron als het tarief', () => {
    at(loaderSource, 'const dailyExpenses = expenseRate.dailyRate', 'assets-data-loader.ts')
    at(loaderSource, 'dailyExpensesSource: expenseRate.source', 'assets-data-loader.ts')
  })
})
