'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { VERKEN_SECTION_ID } from '@/components/app/horizon/scenario-chip'

/**
 * Oude bladwijzers naar het lab op Plan (ADR 0179 fase 1 stap 16, besluit Q3).
 *
 * Het lab stond tot stap 16 op `/toekomst` met het anker `#verken-je-aannames`; het woont
 * nu in katern Doelen. Een hash bereikt de server niet, dus een `next.config`-redirect kan
 * dit niet opvangen. Deze handler staat alleen op de Plan-page en stuurt zo'n bladwijzer
 * één keer door naar hetzelfde anker in Doelen. Rendert niets.
 */
export function OudeLabBladwijzer() {
  const router = useRouter()
  useEffect(() => {
    if (window.location.hash === `#${VERKEN_SECTION_ID}`) {
      router.replace(`/toekomst/doelen#${VERKEN_SECTION_ID}`)
    }
  }, [router])
  return null
}
