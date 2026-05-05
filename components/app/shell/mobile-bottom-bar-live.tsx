'use client'

/**
 * MobileBottomBarLive — runtime action-bar override voor de tray-of-three.
 *
 * Plaats deze component in een form-flow of detail-pagina om een action-bar
 * (`primary` + optionele `secondary` CTA) te tonen onderaan de mobile shell
 * met **echte `onClick`-handlers** die toegang hebben tot pagina-state.
 *
 * Verschil met `<NavStackMeta bottomBar={...}>`:
 * - NavStackMeta dispatcht via CustomEvent + serialiseert naar sessionStorage,
 *   waardoor functions worden gestripped (zie `replaceFunctions` in
 *   nav-stack-meta.tsx). Geschikt voor `href`-only actions of declaratieve
 *   labels die de provider leest bij rehydration.
 * - MobileBottomBarLive populeert een React-context (LiveBottomBarContext in
 *   nav-stack-provider.tsx) die runtime-only bestaat. `onClick` handlers
 *   blijven intact zolang het component gemount is. Geen sessionStorage-
 *   persistentie — bij refresh moet de pagina opnieuw mounten en handlers
 *   opnieuw registreren (acceptabel: state moet sowieso opnieuw opgebouwd).
 *
 * Gebruik:
 *
 *   <MobileBottomBarLive
 *     primary={{ label: 'Opslaan', icon: 'Save', onClick: handleSave }}
 *     secondary={{ label: 'Annuleren', href: '/core/budgets' }}
 *   />
 *
 * De Live-override neemt ALTIJD voorrang op de stack-entry config zolang dit
 * component gemount is. Bij unmount (gebruiker verlaat de pagina) wordt de
 * config gewist en valt MobileBottomBar terug op de stack-entry default.
 *
 * Render-loos — return null. State leeft in NavStackProvider's
 * LiveBottomBarContext via useEffect-cleanup.
 */

import { useEffect } from 'react'
import { useLiveBottomBar, type BottomBarAction } from './nav-stack-provider'

type MobileBottomBarLiveProps = {
  /** Primaire CTA — rechts in de bar, solid styling. */
  primary: BottomBarAction
  /** Optionele secondary CTA — links, outline styling. */
  secondary?: BottomBarAction
}

export function MobileBottomBarLive({ primary, secondary }: MobileBottomBarLiveProps): null {
  const live = useLiveBottomBar()

  // Stable serialization-key voor de useEffect-deps. Functions worden via
  // replacer weggehouden uit de key zodat een inline-onClick (nieuwe ref per
  // render maar gelijke semantiek) geen re-register triggert. Andere primitives
  // (label, icon, href, destructive) tellen wel mee.
  const key = JSON.stringify(
    { primary, secondary },
    (_k, v) => (typeof v === 'function' ? undefined : v),
  )

  useEffect(() => {
    if (!live) return
    live.setConfig({ kind: 'action-bar', primary, secondary })
    return () => {
      // Cleanup wanneer pagina unmount of props wijzigen → terugvallen op
      // stack-entry's bottomBar (meestal `'hidden'` voor form-flows).
      live.setConfig(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return null
}
