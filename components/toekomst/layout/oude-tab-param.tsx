'use client'

import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CONSUMED_DEEPLINK_PARAMS } from '@/lib/horizon/deeplink-cleanup'
import { GEBEURTENISSEN_ANKER } from './oude-lab-bladwijzer'
import { KATERN_HREF } from './katern-routes'
import { RIJ_DEEPLINK_PARAMS } from '@/lib/toekomst/instellingen-rij'

/**
 * Params die een ándere opruimer zelf uit de URL haalt: de tijdas-deeplinks
 * (`buildDeeplinkCleanupUrl`), de plan-review (`?planreview=open`) en de regel-editor in
 * Instellingen (`?rij=` en de aliassen `?regel=`/`?strategie=`, bij openen). Staat er zo één, dan wacht deze opruimer: twee
 * `router.replace`s op dezelfde momentopname zouden elkaars werk terugdraaien.
 */
const ANDERE_OPRUIMERS: readonly string[] = [...CONSUMED_DEEPLINK_PARAMS, 'planreview', ...RIJ_DEEPLINK_PARAMS]

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
 *
 * `?tab=gebeurtenissen` (addendum 26 sep op ADR 0179): de levensgebeurtenissen staan onder
 * het plan, op `/toekomst` zelf. Een redirect van `/toekomst` naar `/toekomst` zou een lus
 * zijn (de query reist mee), dus hier: `tab` weg, het anker `#gebeurtenissen` erbij, en na
 * één frame naar de lijst scrollen. Met een levensstrategie erbij
 * (`&strategie=aow|pensioen|huis|werk`) blijft die param staan: de levensstrategieën staan
 * sinds 27 sep op Plan, en de editor-host daar opent de strategie (ADR 0179 addendum (e)).
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
    const naarGebeurtenissen = pathname === KATERN_HREF.plan && params.get('tab') === 'gebeurtenissen'
    params.delete('tab')
    const rest = params.toString()
    const hash = naarGebeurtenissen ? `#${GEBEURTENISSEN_ANKER}` : window.location.hash
    router.replace(`${pathname}${rest ? `?${rest}` : ''}${hash}`, { scroll: false })
    if (!naarGebeurtenissen) return
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(GEBEURTENISSEN_ANKER)?.scrollIntoView({ block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [query, pathname, router])

  return null
}
