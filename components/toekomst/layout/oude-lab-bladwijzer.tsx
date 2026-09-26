'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { VERKEN_SECTION_ID } from '@/components/app/horizon/scenario-chip'

const OUDE_HASH = `#${VERKEN_SECTION_ID}`
const DOEL = `/toekomst/doelen${OUDE_HASH}`

/**
 * Herhaalmomenten (ms na mount). Eén keer opnieuw via de router; lukt ook dat niet, dan
 * een harde navigatie — een bladwijzer die op Plan blijft staan is erger dan een reload.
 */
const HERHAAL_NA_MS = [250, 1_000] as const

/** Los object, zodat de test de harde navigatie kan vervangen (jsdom navigeert niet). */
export const bladwijzerNavigatie = {
  hard(url: string): void {
    window.location.replace(url)
  },
}

/** Staat de adresbalk nog op de oude bladwijzer (Plan mét het lab-anker)? */
function opOudeBladwijzer(): boolean {
  return window.location.pathname === '/toekomst' && window.location.hash === OUDE_HASH
}

/**
 * Oude bladwijzers naar het lab op Plan (ADR 0179 fase 1 stap 16, besluit Q3).
 *
 * Het lab stond tot stap 16 op `/toekomst` met het anker `#verken-je-aannames`; het woont
 * nu in katern Doelen. Een hash bereikt de server niet, dus een `next.config`-redirect kan
 * dit niet opvangen. Deze handler staat alleen op de Plan-page en stuurt zo'n bladwijzer
 * door naar hetzelfde anker in Doelen. Rendert niets.
 *
 * Robuust (fixronde C1): een `router.replace` die direct in het mount-effect vertrekt,
 * viel in de browser weg tijdens de hydratie — het effect van dit kind draait vóór de
 * effecten van de app-router zelf. Daarom kijkt de handler daarna nog kort of de
 * adresbalk is meegegaan, probeert het één keer opnieuw en navigeert anders hard. Zodra
 * de navigatie lukt, ontkoppelt de Plan-page en ruimt de cleanup de timers op.
 */
export function OudeLabBladwijzer() {
  const router = useRouter()
  useEffect(() => {
    if (!opOudeBladwijzer()) return
    router.replace(DOEL)
    const timers = HERHAAL_NA_MS.map((ms, i) =>
      window.setTimeout(() => {
        if (!opOudeBladwijzer()) return
        if (i < HERHAAL_NA_MS.length - 1) router.replace(DOEL)
        else bladwijzerNavigatie.hard(DOEL)
      }, ms),
    )
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [router])
  return null
}
