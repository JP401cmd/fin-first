/**
 * Kop- en deck-tekst van de belasting-hub (/overzicht/belasting).
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
 * buiten het totaal — maar de TEKST gaat kloppen. De kop telt daarom wat er
 * werkelijk op het scherm staat:
 *   · geen aanmerkelijk belang → twee kaarten, één som  → "Twee boxen, één rekening"
 *   · wél aanmerkelijk belang  → drie kaarten, twee sommen → "Drie boxen, twee rekeningen"
 *
 * Bewust puur en synchroon (geen React, geen data-toegang): zo is de belofte
 * met een unit-test te pinnen zonder de server-pagina met haar loaders na te
 * bootsen — precies zoals `buildBelastingBoxCards` dat voor de kaartkeuze doet.
 * De opening introduceert geen fiscale claims: hij beschrijft alleen wat deze
 * pagina optelt en waar de rest staat.
 */
export type BelastingHubOpening = {
  /** Hairline-kicker boven de H1. */
  kicker: string
  /** Kop-tekst vóór het `<em>`-accent. */
  titleBefore: string
  /** Het enige italic accent-woord in de H1. */
  emphasis: string
  /** Kop-tekst ná het accent-woord. */
  titleAfter: string
  /** Redactionele deck onder de kop. */
  deck: string
  /**
   * Krant-colophon onderaan de hub. Draagt dezelfde belofte als de kop — vóór
   * H22 stond hier een tweede, hardgecodeerde "Drie boxen, één rekening" die
   * los van de kop kon wegdriften.
   */
  colophon: string
}

export function buildBelastingHubOpening({
  hasAanmerkelijkBelang,
  year,
}: {
  /** Uitkomst van `hasBox2Relevance` — bepaalt of er een derde box in beeld is. */
  hasAanmerkelijkBelang: boolean
  /** Belastingjaar in de kicker. */
  year: number
}): BelastingHubOpening {
  const kicker = `De vierde hefboom · Belasting ${year}`
  const emphasis = 'vrijheid'
  const titleAfter = ''

  if (hasAanmerkelijkBelang) {
    return {
      kicker,
      titleBefore: 'Drie boxen, twee rekeningen — betaald in ',
      emphasis,
      titleAfter,
      deck:
        'Wat de fiscus jaarlijks afroomt is óók vrijheidstijd. Box 1 en Box 3 tellen hier samen ' +
        'op tot één som; Box 2 staat daarbuiten en heeft een eigen pagina. Hieronder zie je waar ' +
        'de hefboom het zwaarst weegt en waar ruimte ligt om vrijheid terug te kopen.',
      colophon: 'Drie boxen, twee rekeningen',
    }
  }

  return {
    kicker,
    titleBefore: 'Twee boxen, één rekening — betaald in ',
    emphasis,
    titleAfter,
    deck:
      'Wat de fiscus jaarlijks afroomt is óók vrijheidstijd. Box 1 en Box 3 tellen hier samen op ' +
      'tot één som — hieronder zie je waar de hefboom het zwaarst weegt en waar ruimte ligt om ' +
      'vrijheid terug te kopen.',
    colophon: 'Twee boxen, één rekening',
  }
}
