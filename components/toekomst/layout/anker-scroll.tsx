'use client'

import { useEffect } from 'react'

/**
 * Scrollt na hydratie naar het anker in de hash, als dat een van de `ankers` is
 * (C3 punt 7). De browser doet dat bij het laden zelf, maar op de katernen staat het
 * doel dan nog niet op zijn plek: het canvas erboven en de views laden client-side na,
 * waardoor een deeplink als `/toekomst#gebeurtenissen` of `/toekomst/instellingen#voorkeuren`
 * bovenaan bleef staan. Eén frame na mount staan de secties er wel. Gedeeld door Plan en
 * Instellingen, dus in `layout/` (fase 6).
 *
 * Rendert niets. Onbekende hashes laat hij met rust: die zijn niet van deze pagina.
 */
export function AnkerScroll({ ankers }: { ankers: readonly string[] }) {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.replace(/^#/, ''))
    if (!id || !ankers.includes(id)) return
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
    // Alleen bij mount: een latere hashwissel regelt de browser zelf.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}
