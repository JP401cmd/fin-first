'use client'

import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CONSUMED_DEEPLINK_PARAMS } from '@/lib/horizon/deeplink-cleanup'

/**
 * Params die een ándere opruimer zelf uit de URL haalt: de tijdas-deeplinks
 * (`buildDeeplinkCleanupUrl`), de plan-review (`?planreview=open`) en de regel-editor in
 * Instellingen (`?regel=` bij sluiten). Staat er zo één, dan wacht deze opruimer: twee
 * `router.replace`s op dezelfde momentopname zouden elkaars werk terugdraaien.
 */
const ANDERE_OPRUIMERS: readonly string[] = [...CONSUMED_DEEPLINK_PARAMS, 'planreview', 'regel']

/**
 * Ruimt `?tab=` op na de redirect van een oude `/toekomst?tab=…`-deeplink (ADR 0179
 * besluit Q2, fixronde C1).
 *
 * `next.config.ts` stuurt die links rechtstreeks naar het juiste katern, maar Next laat
 * de inkomende query meereizen: `/toekomst/doelen?tab=doelen`. Niets leest `tab` nog.
 * Deze component in de `(katern)`-layout haalt hem weg met één `router.replace` op het
 * huidige pad, zonder navigatie-scroll, en laat de overige params en de hash staan. Geen
 * lus: na de replace staat er geen `tab` meer, en geen redirect-regel matcht een
 * katern-pad. Rendert niets.
 */
export function OudeTabParam() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const query = searchParams.toString()

  useEffect(() => {
    const params = new URLSearchParams(query)
    if (!params.has('tab')) return
    if (ANDERE_OPRUIMERS.some((p) => params.has(p))) return
    params.delete('tab')
    const rest = params.toString()
    router.replace(`${pathname}${rest ? `?${rest}` : ''}${window.location.hash}`, { scroll: false })
  }, [query, pathname, router])

  return null
}
