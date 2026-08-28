'use client'

import { ListChecks } from 'lucide-react'
import { TapTarget } from '@/components/editorial/tap-target'
import { useWelcomeGuide } from './welcome-guide-provider'

/**
 * WelcomeGuideDot — de GEMINIMALISEERDE vorm van de welkomstgids (S13): een
 * klein rond knopje naast de pagina-'i' dat de gids weer uitklapt. Verschijnt
 * uitsluitend wanneer de provider `display === 'minimized'` zegt.
 *
 * Spiegelt vorm en plaatsing van `PageStatusDot` / `PageInfoButton` (h-7 w-7,
 * ronde rand, papier-vlak) zodat de pagina-header-controls één visuele familie
 * blijven — de meldingen-conventie in CLAUDE.md.
 *
 * WAAROM EEN ICOON EN GEEN GEKLEURD PUNT: de conventie beschrijft een
 * stoplicht-punt omdát de kleur daar de ERNST draagt. De gids heeft geen ernst
 * — hij is onboarding, geen status. Een tweede gekleurde stip naast de
 * status-stip zou een alarmsignaal suggereren dat er niet is, en beide punten
 * onderling onherkenbaar maken. Vandaar een checklist-icoon in het
 * module-accent van de route (`--module-active-*`, op /overzicht = Kern),
 * hetzelfde accent waarin de gids zelf staat.
 *
 * RAAKGEBIED: het zichtbare vlak blijft 28×28 (de vastgelegde uitzondering voor
 * pagina-header-controls), maar het raakgebied groeit verticaal naar 44px via
 * `TapTarget hit="extend-block"` — de cluster is horizontaal te dicht voor een
 * volle 44×44 zonder de buren te overlappen.
 */
export function WelcomeGuideDot() {
  const { display, restore } = useWelcomeGuide()

  if (display !== 'minimized') return null

  return (
    <TapTarget
      label="Welkomstgids weer tonen"
      hit="extend-block"
      onClick={restore}
      className="h-7 w-7 rounded-full border border-[var(--border-ed)] bg-[var(--paper)] text-[var(--module-active-700)] transition-colors hover:border-[var(--module-active-500)] hover:text-[var(--module-active-900)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
    >
      <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
    </TapTarget>
  )
}
