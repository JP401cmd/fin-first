/**
 * Deck- en colophon-tekst van de belasting-hub (/overzicht/belasting).
 *
 * WAAROM EEN EIGEN MODULE (bevinding H22, 26-08-2026) — de pagina-opening deed
 * een belofte die het hero-totaal niet waarmaakt: "Drie boxen, één rekening"
 * met daaronder "Drie boxen, één som", terwijl het totaal by design uit twee
 * boxen bestaat. De hub rekent Box 2 bewust NIET door (BEL-1: per persoon,
 * eigen berekening; zie `box-cards.ts` en `page.tsx`) — de box2-subpagina toont
 * dat bedrag. Voor een DGA viel daarmee de duurste post buiten het getal dat
 * "totale druk" heet, terwijl de kop drie boxen beloofde.
 *
 * Eigenaarsbesluit 26-08-2026 (optie B): het ONTWERP blijft — Box 2 blijft
 * buiten het totaal — maar de TEKST gaat kloppen. De belofte telt daarom wat er
 * werkelijk op het scherm staat:
 *   · geen aanmerkelijk belang → twee kaarten, één som  → "Twee boxen, één rekening"
 *   · wél aanmerkelijk belang  → drie kaarten, twee sommen → "Drie boxen, twee rekeningen"
 *
 * VERHUISD VAN DE KOP NAAR DE DECK (kop-herziening sep 2026). De hub-aanhef is
 * sinds die herziening een `PageVerdictOpening`: de titel is "Belasting |
 * <oordeel>" en draagt dus geen telwoord meer. De H22-belofte is daarmee niet
 * vervallen maar verplaatst — hij staat nu in de eerste zin van de deck en in
 * de colophon, en `hub-opening-copy.test.ts` pint 'm daar tegen hetzelfde
 * canonieke kaart-/som-aantal. De `year`-parameter is weg met de kicker.
 *
 * Het OORDEEL zelf staat bewust NIET in dit bestand: dat is de Box 3-status
 * (`box3TaxStatus` → `box3StatusVerdict`, lib/box3-taxable-input.ts), gedeeld
 * met de Box 3-kaart op deze hub en met de titel van /overzicht/belasting/box3.
 * Eén oordeelszin, drie oppervlakken.
 *
 * Bewust puur en synchroon (geen React, geen data-toegang): zo is de belofte
 * met een unit-test te pinnen zonder de server-pagina met haar loaders na te
 * bootsen — precies zoals `buildBelastingBoxCards` dat voor de kaartkeuze doet.
 * De opening introduceert geen fiscale claims: hij beschrijft alleen wat deze
 * pagina optelt en waar de rest staat.
 */
export type BelastingHubOpening = {
  /**
   * Redactionele deck onder de kop. Twee zinnen: wat deze pagina optelt (de
   * H22-belofte) en wat het oordeel in de titel betekent.
   */
  deck: string
  /**
   * Krant-colophon onderaan de hub. Draagt dezelfde belofte als de deck — vóór
   * H22 stond hier een tweede, hardgecodeerde "Drie boxen, één rekening" die
   * los van de kop kon wegdriften.
   */
  colophon: string
}

/**
 * Tweede zin van de deck — identiek in beide takken: het oordeel in de titel is
 * de Box 3-stand, ongeacht of Box 2 meespeelt. Eén constante zodat de twee
 * takken niet los van elkaar kunnen wegdriften.
 *
 * WFT — beschrijvend ("volgt je vermogen boven de vrijstelling"), geen
 * aansporing om iets aan dat vermogen te doen.
 */
const OORDEEL_ZIN = 'Het oordeel volgt je Box 3-vermogen boven de vrijstelling.'

export function buildBelastingHubOpening({
  hasAanmerkelijkBelang,
}: {
  /** Uitkomst van `hasBox2Relevance` — bepaalt of er een derde box in beeld is. */
  hasAanmerkelijkBelang: boolean
}): BelastingHubOpening {
  if (hasAanmerkelijkBelang) {
    const colophon = 'Drie boxen, twee rekeningen'
    return {
      deck: `${colophon}: Box 2 telt apart, in euro’s en vrijheidstijd. ${OORDEEL_ZIN}`,
      colophon,
    }
  }

  const colophon = 'Twee boxen, één rekening'
  return {
    deck: `${colophon}: Box 1 en Box 3, in euro’s en vrijheidstijd. ${OORDEEL_ZIN}`,
    colophon,
  }
}
