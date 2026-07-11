'use client'

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { HORIZON_TIPS_FIRST_CLOSE_NAVIGATED_SLUG } from '@/lib/horizon-data-loader'

/**
 * Eenmalige navigatie naar het post-onboarding stappenplan op /overzicht bij de
 * EERSTE keer dat de gebruiker de tips-overlay op /toekomst sluit.
 *
 * Gedrag:
 *   • Cross-device gate: `initiallyNavigated` komt uit de server-marker
 *     (HORIZON_TIPS_FIRST_CLOSE_NAVIGATED_SLUG in user_feature_visits). Al
 *     genavigeerd → nooit meer navigeren, op géén enkel apparaat.
 *   • Sessie-guard: een ref voorkomt dubbele navigatie binnen dezelfde render-
 *     sessie (dubbelklik, of beide exit-paden na elkaar).
 *   • Bij de eerste echte sluiting wordt de marker fire-and-forget gePOST
 *     (zelfde stijl als de exit-melding-marker) en navigeert de app naar
 *     /overzicht, waar het post-onboarding stappenplan (WelcomeGuideBanner) staat.
 *
 * De teruggegeven functie mag ALLEEN vanaf een echte sluiting van de tips-overlay
 * worden aangeroepen (de exit-melding-afhandelaars) — nooit vanaf het OPENEN van
 * de overlay (onViewChart / persistOverlayVisible(true)).
 */
export function useTipsFirstCloseNavigation(initiallyNavigated: boolean): () => void {
  const router = useRouter()
  const [navigated, setNavigated] = useState<boolean>(initiallyNavigated)
  const guard = useRef(false)

  return useCallback(() => {
    // Al genavigeerd (cross-device marker) of al binnen deze sessie gedaan → stop.
    if (navigated || guard.current) return
    guard.current = true
    setNavigated(true)
    // Marker cross-device zetten zodat de navigatie op elk apparaat maar één keer
    // plaatsvindt. Fire-and-forget: een falende POST mag de navigatie niet blokkeren.
    fetch('/api/feature-visits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature_slug: HORIZON_TIPS_FIRST_CLOSE_NAVIGATED_SLUG }),
    }).catch(() => {})
    router.push('/overzicht')
  }, [navigated, router])
}
