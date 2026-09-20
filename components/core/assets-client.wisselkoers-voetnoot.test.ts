/**
 * Bron-grendel op de wisselkoers-voetnoot van /overzicht/bezittingen
 * (UR3-08, verplaatst per melding B-039).
 *
 * De oorspronkelijke bevinding: deze pagina toonde een vrijheidstijd op zes
 * plekken zonder er ooit bij te zeggen wáár die tijd vandaan komt. Persona Henk
 * las "1j 4m" bij zijn eerste bezitting en begreep pas twee schermen later dat
 * vrijheidstijd niets meer is dan bedrag ÷ dagtarief. UR3-08 zette daarom één
 * voetnoot bovenaan de pagina, onder de figures-strip.
 *
 * WAT B-039 VERANDERT — niet de eis, wel de plek. Sinds UR3-08 zijn er
 * tijdgetallen van die pagina verdwenen: UR3-19 haalde de vrijheidstijd van het
 * subtotaal excl. eigen woning én van de strip-cellen (bruto teller op een
 * niet-netto grondslag), B-035 haalde de runway-zin uit de deck. Wat overbleef
 * was een koers-voetnoot boven aan de pagina die daar zelf niets meer uitlegde,
 * terwijl de plek waar de koers wél gebruikt wordt — de rekenmodal, die het
 * rendement omzet in "X vrijheid" — hem niet had. De voetnoot is meeverhuisd.
 *
 * WAAROM EEN BRON-TEST: de eigenschappen die hier bewaakt worden zijn
 * compositie-eigenschappen van de call-site, niet van een gerenderde waarde. Het
 * gedrág van de voetnoot zelf (maskering, `source: 'none'`, schatting-zin,
 * inline/regel) is volledig afgedekt op het component
 * (`components/app/vrijheidstijd-voetnoot.test.tsx`). Wat die componenttest níet
 * kan vangen, en deze wél: dat de koers precies één keer geplaatst wordt, dat
 * hij de canonieke bundelkoers ÉN de bron gevoerd krijgt over de hele keten
 * (loader → pagina → modal), en dat er geen tweede formulering van diezelfde zin
 * naast komt te staan. Precedent: `assets-client.figures-strip.test.ts`.
 */

import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { readSourceLF } from '@/lib/test-utils/read-source'

// Via `readSourceLF`, niet `readFileSync`: de grendel hieronder zoekt een
// fragment dat over twee regels loopt (`activeAssets\n        .filter(…)`). Op
// een checkout die van vóór de `eol=lf`-regel in `.gitattributes` dateert staat
// het bestand nog met CRLF op schijf — git hernormaliseert bestaande bestanden
// niet — en dan vindt een `\n`-naald niets, terwijl de gecommitte blob wél
// klopt. Zie de toelichting in `lib/test-utils/read-source.ts`.
const clientSource = readSourceLF(
  join(process.cwd(), 'components', 'core', 'assets-client.tsx'),
)
const modalSource = readSourceLF(
  join(process.cwd(), 'components', 'core', 'asset-return-modal.tsx'),
)
const loaderSource = readSourceLF(
  join(process.cwd(), 'lib', 'assets-data-loader.ts'),
)

/** Index van een fragment, met een sprekende fout als het ontbreekt. */
function at(source: string, needle: string, where: string): number {
  const i = source.indexOf(needle)
  expect(i, `"${needle}" niet gevonden in ${where} — grendel staat stil`).toBeGreaterThan(-1)
  return i
}

describe('/overzicht/bezittingen — de wisselkoers staat waar hij gebruikt wordt (UR3-08 → B-039)', () => {
  it('de pagina zelf draagt de voetnoot niet meer — die hoort bij de uitleg', () => {
    expect(
      clientSource,
      'de koers boven aan de pagina legde niets meer uit: de tijdgetallen daar zijn met UR3-19/B-035 vervallen',
    ).not.toContain('<VrijheidstijdVoetnoot')
  })

  it('de rekenmodal rendert hem precies één keer (eigenaarsbesluit A: één per oppervlak)', () => {
    const treffers = modalSource.split('<VrijheidstijdVoetnoot').length - 1
    expect(
      treffers,
      'meer dan één voetnoot betekent de koers per cel/sectie herhalen — precies wat besluit A uitsluit',
    ).toBe(1)
  })

  it('staat direct ná de strip met de vrijheidstijd-cel, vóór de drie stapels', () => {
    const strip = at(modalSource, '<FiguresStrip', 'asset-return-modal.tsx')
    const voetnoot = at(modalSource, '<VrijheidstijdVoetnoot', 'asset-return-modal.tsx')
    const eersteSectie = at(modalSource, '<Section', 'asset-return-modal.tsx')
    expect(voetnoot).toBeGreaterThan(strip)
    expect(
      voetnoot,
      'de koers hoort bij de cel die hem gebruikt, niet onderaan de kassabon',
    ).toBeLessThan(eersteSectie)
  })

  it('voert hem de bundelkoers én de bron — geen eigen som, geen afgeleide bron', () => {
    at(modalSource, 'dailyRate={dailyExpenses}', 'asset-return-modal.tsx')
    at(modalSource, 'source={dailyExpensesSource}', 'asset-return-modal.tsx')
    // De keten ernaartoe: de pagina leest beide uit de bundel en geeft ze door.
    at(clientSource, 'const dailyExpenses = initialData?.dailyExpenses ?? 0', 'assets-client.tsx')
    at(clientSource, 'const dailyExpensesSource = initialData?.dailyExpensesSource', 'assets-client.tsx')
    at(clientSource, 'dailyExpenses={dailyExpenses}', 'assets-client.tsx')
    at(clientSource, 'dailyExpensesSource={dailyExpensesSource}', 'assets-client.tsx')
  })

  it('zet nergens in de keten een tweede formulering van de koers', () => {
    // `formatFreedomRateFootnote` (lib/format.ts) is het enige huis van de zin en
    // wordt uitsluitend via het component aangeroepen. Wie de helper zélf
    // aanroept, of met de hand "Tegen je dagtarief van …" typt, maakt een tweede
    // waarheid over dezelfde koers — precies de drift die deze kaart opheft.
    for (const [naam, src] of [
      ['assets-client.tsx', clientSource],
      ['asset-return-modal.tsx', modalSource],
    ] as const) {
      expect(
        src,
        `${naam}: roep de helper niet rechtstreeks aan — de voetnoot loopt via <VrijheidstijdVoetnoot>`,
      ).not.toContain('formatFreedomRateFootnote')
      expect(
        src,
        `${naam}: de zin met de hand overtypen maakt een tweede formulering van dezelfde koers`,
      ).not.toMatch(/dagtarief van/)
    }
  })

  it('laat de loader de bron meesturen vanaf dezelfde bron als het tarief', () => {
    at(loaderSource, 'const dailyExpenses = expenseRate.dailyRate', 'assets-data-loader.ts')
    at(loaderSource, 'dailyExpensesSource: expenseRate.source', 'assets-data-loader.ts')
  })
})

/**
 * Melding B-039 — het subtotaal "excl. eigen woning" hoort ín de cel Totale
 * waarde, niet als losse strook eronder.
 *
 * Het is een variant op dát getal ("hetzelfde totaal, zonder het huis"), en als
 * volle-breedte-regel onder de strip vormde het een derde uitlijning naast de
 * kicker-kolommen — op 384px een losse regel tussen de cijfers en de meta-regel.
 * De gating blijft ongemoeid: alleen bij een eigen woning én een strategie
 * ≠ include_full (`shouldShowDualHousingBasis`).
 */
describe('/overzicht/bezittingen — het subtotaal hangt onder het totaal (B-039)', () => {
  it('staat als `sub2` in de figures-cel, niet meer als losse SubtotalLine', () => {
    expect(
      clientSource,
      'de losse strook onder de strip is opgeheven — het subtotaal zit in de cel Totale waarde',
    ).not.toContain('<SubtotalLine')
    at(clientSource, "sub2: showExclHomeSubtotal", 'assets-client.tsx')
    at(clientSource, 'excl. eigen woning ${fc(totalValueExclHome)}', 'assets-client.tsx')
  })

  it('houdt de gating én de gewogen grondslag ongewijzigd', () => {
    // Niet opnieuw uitrekenen en niet ruimer tonen dan voorheen: dezelfde
    // helper, dezelfde per-item waarde-functie.
    at(clientSource, 'shouldShowDualHousingBasis(ctx, housingStrategyConfig)', 'assets-client.tsx')
    at(clientSource, "activeAssets\n        .filter((a) => a.asset_type !== 'eigen_huis')", 'assets-client.tsx')
  })

  it('blijft gemaskeerd in privacymodus — via `fc`, niet via een kale formatter', () => {
    const cel = clientSource.indexOf("sub2: showExclHomeSubtotal")
    const blok = clientSource.slice(cel, cel + 200)
    expect(
      blok,
      'gebruik `fc` (useFc → formatMaskedCurrency); een kale formatter zou het bedrag in privacymodus tonen',
    ).toContain('fc(totalValueExclHome)')
  })
})
