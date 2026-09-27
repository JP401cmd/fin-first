'use client'

/**
 * De slots van de canvas-rij (ADR 0179 D7, fase 4; eigenaarsbesluit 27 sep):
 * - `CanvasZijkolom` — de rechterkolom naast de grafiek, op desktop. In Doelen het lab
 *   (standaard harp), zodat een knop en zijn effect samen in beeld staan (§4.2 regel 9).
 *   In Plan de levensgebeurtenissen, zodat de grafiek bij een wissel Plan ↔ Doelen op
 *   dezelfde plek en in dezelfde maat blijft staan. Buiten die twee is er geen kolom.
 * - `CanvasActierij` — de rij over de volle breedte ónder grafiek en kolom. In Doelen de
 *   lab-acties (stopmoment, plan-keuzes, opslaan-balk): de harp draagt alleen het lab en
 *   bepaalt zo de hoogte van de rij. Buiten Doelen leeg.
 *
 * Staat in de layout-laag, omdat alleen die de route kent (D8): het canvas zit in de
 * `(katern)`-layout boven het katern, dus de page (daaronder) kan hem niet leveren. Een parallelle route (`@zij`) zou bij client-navigatie zijn vorige inhoud
 * vasthouden, een portal verschijnt pas na mount; een slot vanuit de layout rendert
 * server-side op zijn plek. De actierij is daarom een tweede slot van hetzelfde soort, en
 * geen deel van de kolom: de kolom moet alleen het lab bevatten om als maat te dienen.
 */

import { DoelenKaternLab, DoelenKaternLabActies } from '@/components/toekomst/doelen/doelen-katern-lab'
import { PlanGebeurtenissen } from '@/components/toekomst/plan/plan-gebeurtenissen'
import { useToekomstPerspectiefContext } from '@/components/toekomst/state/toekomst-state-provider'
import { useActiefKatern } from './actief-katern'
import { ToekomstKaternAccentScope } from './toekomst-katern-navigatie'

// Beide slots dragen het accent van de actieve tab (eigenaarswens 27 sep): hun inhoud hoort
// bij het katern, ook al staat die in de canvas. De scope is `display: contents`, dus de
// maat van de kolom verandert niet.

export function CanvasZijkolom() {
  const katern = useActiefKatern()
  if (katern === 'doelen') return <ToekomstKaternAccentScope><DoelenKaternLab plek="kolom" /></ToekomstKaternAccentScope>
  if (katern === 'plan') return <ToekomstKaternAccentScope><PlanGebeurtenissen plek="kolom" /></ToekomstKaternAccentScope>
  return null
}

export function CanvasActierij() {
  const katern = useActiefKatern()
  const { verkenSectieZichtbaar } = useToekomstPerspectiefContext()
  // Leeg moet leeg blijven: de rij verbergt zich met `lg:empty:hidden`, dus de scope mag er
  // alleen staan als de acties iets tonen — dezelfde voorwaarde als `DoelenLabActies`.
  if (katern !== 'doelen' || !verkenSectieZichtbaar) return null
  return <ToekomstKaternAccentScope><DoelenKaternLabActies /></ToekomstKaternAccentScope>
}
