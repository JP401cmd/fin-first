'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { PLAN_REVIEW_PARAM } from '@/lib/plan-review/types'
import { RIJ_DEEPLINK_PARAMS, RIJ_OPRUIM_PARAMS, resolveRijDeeplink, type RijSleutel } from '@/lib/toekomst/instellingen-rij'

/**
 * De rij-deeplink van katern Instellingen (ADR 0179 fase 3): `?rij=<sleutel>`, met de oude
 * `?regel=` en `?strategie=` als aliassen (`resolveRijDeeplink`). Opent precies één keer en
 * ruimt alle drie de sleutels in één `router.replace` op, bij het OPENEN (C3 punt 7: langs
 * het sluitpad bleef de param soms hangen). De hash blijft staan.
 *
 * Staat de plan-review-param of `modal` er ook, dan wacht deze hook: die hebben een eigen
 * opruimer (de plan-review-provider resp. de overlay-state in de katern-layout), en twee
 * `router.replace`s op dezelfde momentopname draaien elkaars werk terug en lieten de rij
 * twee keer openen (review, `?modal=strategie|withdrawal` → `…?rij=…&modal=…`; patroon
 * `oude-tab-param.tsx`). Na hun opruiming verandert de URL en gaat deze hook één keer af.
 *
 * `via` gaat mee naar de aanroeper: `?strategie=pensioen` (de verwijzing vanaf Box 1) opent
 * de factor-A-uitvraag meteen (S6).
 */
/** Params met een eigen opruimer; zolang ze er staan, wacht de rij-deeplink. */
const ANDERE_OPRUIMERS = [PLAN_REVIEW_PARAM, 'modal'] as const

export function useInstellingenRijDeeplink(onRij: (rij: RijSleutel, via: 'rij' | 'regel' | 'strategie') => void): void {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const onRijRef = useRef(onRij)
  // De router via een ref: alleen een nieuwe URL mag de deeplink opnieuw laten afgaan, niet
  // een nieuwe router-identiteit (dan zou een gesloten editor weer opengaan).
  const routerRef = useRef(router)
  useEffect(() => {
    onRijRef.current = onRij
    routerRef.current = router
  })

  useEffect(() => {
    if (!RIJ_DEEPLINK_PARAMS.some((k) => searchParams.has(k))) return
    if (ANDERE_OPRUIMERS.some((k) => searchParams.has(k))) return
    const doel = resolveRijDeeplink(searchParams)
    if (doel) onRijRef.current(doel.rij, doel.via)
    const rest = new URLSearchParams(searchParams)
    for (const k of RIJ_OPRUIM_PARAMS) rest.delete(k)
    const query = rest.toString()
    const hash = typeof window !== 'undefined' ? window.location.hash : ''
    routerRef.current.replace(`${pathname}${query ? `?${query}` : ''}${hash}`, { scroll: false })
  }, [searchParams, pathname])
}
