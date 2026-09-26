'use client'

/**
 * De rechterkolom van de canvas-rij (ADR 0179 D7, fase 4): in katern Doelen staat het lab
 * op desktop náást de grafiek, zodat een knop en zijn effect samen in beeld staan
 * (§4.2 regel 9). Buiten Doelen is er geen kolom.
 *
 * Staat in de layout-laag, omdat alleen die de route kent (D8): het canvas zit in de
 * `(katern)`-layout boven de katern-koppen, dus de page (ónder de koppen) kan hem niet
 * leveren. Een parallelle route (`@zij`) zou bij client-navigatie zijn vorige inhoud
 * vasthouden, een portal verschijnt pas na mount; een slot vanuit de layout rendert
 * server-side op zijn plek.
 */

import { DoelenKaternLab } from '@/components/toekomst/doelen/doelen-katern-lab'
import { useActiefKatern } from './actief-katern'

export function CanvasZijkolom() {
  if (useActiefKatern() !== 'doelen') return null
  return <DoelenKaternLab plek="kolom" />
}
