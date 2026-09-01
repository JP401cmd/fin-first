'use client'

import { MilestoneCelebration } from '@/components/app/milestone-celebration'
import { isReeksMijlpaal, reeksTelwoord, reeksZin } from '@/lib/checkin/reeks'

/**
 * CheckinAfsluitViering — het afsluitmoment na een afgeronde geldcheck-in.
 *
 * De check-in eindigde jarenlang met "opslaan en wegsturen": één klik, en de
 * gebruiker stond weer op /overzicht zonder dat het ritueel ergens landde. Dit
 * is de beat ertussen — één ingetogen vignet dat vaststelt wát er nu staat,
 * waarna de bestaande navigatie alsnog volgt (`onDismiss`).
 *
 * Twee varianten, één vorm:
 *  - **standaard** — "Je maandbeeld staat vast" · "Tot volgende maand."
 *  - **reeks-mijlpaal** (3, 6 of 12 maanden op rij) — de erkenning uit
 *    `reeksZin`, met het telwoord uit dezelfde bron in de kop.
 *
 * Erkennen, niet straffen: er bestaat géén variant voor een gebroken reeks. Een
 * gat reset stil de telling en de gewone afsluiting verschijnt.
 *
 * Once-guard is bewust `guard="none"`: het afsluitmoment hoort bij *deze*
 * afronding, niet bij een mijlpaal die je maar één keer in je leven passeert.
 * De aanroeper mount 'm precies één keer per afronding (component-state) —
 * zelfde klasse als de scherm-lokale beats uit ADR 0123 D9. Geen localStorage,
 * geen regel in `achieved_milestones`.
 */
export function CheckinAfsluitViering({
  reeks,
  onDismiss,
}: {
  /** Lopende reeks in maanden, uit `berekenReeks` op de verse lijst. */
  reeks: number
  /** Aangeroepen zodra de viering weg is — hier hangt de navigatie aan. */
  onDismiss: () => void
}) {
  const zin = reeksZin(reeks)
  const telwoord = reeksTelwoord(reeks)
  const isMijlpaal = isReeksMijlpaal(reeks) && zin !== null && telwoord !== null

  return (
    <MilestoneCelebration
      celebrationKey="checkin-afsluiting"
      guard="none"
      kicker={isMijlpaal ? 'Mijlpaal' : 'Check-in'}
      title={
        isMijlpaal ? (
          <>
            {telwoord} maanden <em>op rij</em>
          </>
        ) : (
          <>
            Je maandbeeld <em>staat vast</em>
          </>
        )
      }
      // Ook bij een mijlpaal blijft de primaire terugkoppeling staan: de kop
      // draagt de erkenning, de duiding bevestigt dat het maandbeeld is
      // vastgelegd (review 1 sep — kop en reeksZin zeiden anders hetzelfde).
      meaning={isMijlpaal ? 'Je maandbeeld staat vast — tot volgende maand.' : 'Tot volgende maand.'}
      onDismiss={onDismiss}
    />
  )
}
