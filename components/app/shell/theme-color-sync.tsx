'use client'

import { useEffect } from 'react'

/**
 * Media-query van de mobiele shell. Gelijk aan Tailwinds `lg` (64rem): daar
 * boven is de TopBar `lg:hidden` en staat de pagina op papier, dus hoort de
 * browserchrome daar de papierkleur uit de root-layout te houden.
 */
export const TOPBAR_THEME_MEDIA = '(max-width: 1023.98px)'

/**
 * Laat de browserchrome (de statusbalk op Android, de tabbalk van Safari) de
 * kleur van de mobiele TopBar dragen (ADR 0174).
 *
 * De root-layout zet een statische `theme-color` (`#faf9f6`, papier) die voor
 * de hele site geldt, ook voor landing en onboarding. Die blijft staan. Deze
 * component zet er een tweede `<meta name="theme-color">` vóór, met een
 * media-query. De browser kiest de eerste meta waarvan de media klopt: onder
 * `lg` is dat de balkkleur, daarboven valt hij door naar het papier.
 *
 * Rendert niets. Hij hangt ín de TopBar, dus bij `topBar.kind: 'hidden'`
 * (full-screen flows zonder balk) unmount hij en valt de chrome terug op
 * papier. Tijdens een stack-transitie staan er even twee TopBars en dus twee
 * identieke metas; dat is onschadelijk.
 *
 * Bewust een DOM-effect en geen gerenderde `<meta>`: React 19 hoist een
 * `<meta>` achteraan in de head, en dan wint de statische meta van de root-
 * layout (zonder media, dus altijd passend) omdat die eerder staat.
 */
export function ThemeColorSync({ color }: { color: string }) {
  useEffect(() => {
    // Attributen, geen IDL-properties: `HTMLMetaElement.media` ontbreekt in
    // oudere engines, en dan zou de media-query stil wegvallen (en de balkkleur
    // ook op desktop gelden).
    const meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    meta.setAttribute('content', color)
    meta.setAttribute('media', TOPBAR_THEME_MEDIA)
    meta.setAttribute('data-topbar-theme-color', '')
    // insertBefore met `null` als referentie = achteraan toevoegen.
    const bestaande = document.head.querySelector('meta[name="theme-color"]')
    document.head.insertBefore(meta, bestaande)
    return () => meta.remove()
  }, [color])

  return null
}
