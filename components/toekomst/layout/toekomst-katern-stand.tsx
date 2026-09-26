'use client'

/**
 * Zet het actieve katern op de layout als `data-katern` op een `group/katern`
 * (ADR 0179 D8: alleen de layout-laag kent de route). Zo kunnen de server-gerenderde
 * delen van de layout per katern een compacte variant krijgen met alleen CSS
 * (`max-lg:group-data-[katern=doelen]/katern:…`), zonder zelf de route te lezen of
 * client-component te worden. `display: contents`: de wrapper zelf telt niet mee in de
 * opmaak.
 *
 * Gebruikt voor de één-scherm-eis in Doelen op mobiel (ADR 0179 D7, spec §4.2 regel 9):
 * compactere kop, ankerregel op één regel, minder ruimte rond canvas en koppen.
 */

import type { ReactNode } from 'react'
import { useActiefKatern } from './actief-katern'

export function ToekomstKaternStand({ children }: { children: ReactNode }) {
  const katern = useActiefKatern()
  return (
    <div className="group/katern contents" data-katern={katern} data-testid="toekomst-katern-stand">
      {children}
    </div>
  )
}

/**
 * De compacte klassen per onderdeel van de layout, alleen in Doelen en alleen onder `lg`.
 * Eén plek, zodat de layout ze niet los hoeft te spellen en een test ze kan pinnen.
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
