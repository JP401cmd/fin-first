/**
 * De compacte klassen per onderdeel van de katern-layout, alleen in Doelen en alleen
 * onder `lg` (ADR 0179 D7, spec §4.2 regel 9: grafiek en knoppen op één scherm).
 * Ze werken via `data-katern` op de `group/katern` die `ToekomstKaternStand` zet.
 *
 * Bewust een gewone module, geen `'use client'`: de server-layout zet deze strings in
 * zijn className. Uit een client-module krijgt een servercomponent alleen
 * client-referenties, geen waarden — de klasse werd dan letterlijk "undefined"
 * (gezien 27 sep 2026; gepind in toekomst-katern-stand.test.tsx).
 */
export const DOELEN_MOBIEL_COMPACT = {
  /** Kopsectie: minder ruimte boven. */
  kopSectie: 'max-lg:group-data-[katern=doelen]/katern:pt-2',
  /** De oordeelzin: 20px i.p.v. 28px (de kop blijft één component, PageVerdictOpening). */
  oordeel: 'max-lg:group-data-[katern=doelen]/katern:[&_h2]:text-[20px] max-lg:group-data-[katern=doelen]/katern:space-y-1',
  /** De ankerregel op één regel, iets kleiner. */
  ankerregel:
    'max-lg:group-data-[katern=doelen]/katern:mb-1 max-lg:group-data-[katern=doelen]/katern:truncate max-lg:group-data-[katern=doelen]/katern:text-[14px]',
  /** De kolom rond canvas en koppen: minder verticale ruimte. */
  canvasKolom: 'max-lg:group-data-[katern=doelen]/katern:py-2',
  /** De katern-koppen: dichter onder het canvas. */
  koppen: 'max-lg:group-data-[katern=doelen]/katern:mt-3',
} as const
