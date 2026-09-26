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
 * compactere kop, ankerregel op één regel, minder ruimte rond canvas en koppen. De klassen
 * zelf staan in `doelen-mobiel-compact.ts` — een gewone module, want de server-layout leest
 * ze (uit dit client-bestand kreeg hij alleen client-referenties).
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
