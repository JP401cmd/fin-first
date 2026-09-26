// Verplaatst uit components/app/horizon/horizon-client.tsx r457–488 @ c1b4849eb (fase 1, ADR 0179).
// Kaart V1: de hook hoort bij het Plan-paneel dat de geobserveerde sectie rendert
// (PlanVerdieping), niet bij een provider die eerder mount dan die sectie.
// Kaart §8 stap 4 noemt components/toekomst/state/use-in-view-once.ts als eindplek;
// de integrator mag hem daarheen verplaatsen (de import in plan-verdieping.tsx volgt).
'use client'

import { useEffect, useState, type RefObject } from 'react'

/**
 * Zichtbaarheids-gate (Task 4.2): `true` zodra het gegeven element (bijna) in beeld komt.
 * Gebruikt om de zware duiding-secties (scenario-presets) pas te laten
 * rekenen wanneer de gebruiker er (dreigt te) scrollen — niet meer eager in idle. Blijft
 * `true` na de eerste keer (unobserve): een eenmaal-berekende sectie hoeft niet te herrekenen
 * op scroll-terug. SSR-veilig: `IntersectionObserver` ontbreekt server-side → `true`
 * (degradeert naar het oude altijd-berekenen-gedrag, geen regressie).
 * `remountKey`: mount het geobserveerde element pas later (conditioneel gerenderd),
 * geef dan de mount-conditie mee — een wissel re-runt het effect zodat de observer
 * alsnog aanhaakt (een ref-wissel triggert zelf géén effect).
 */
export function useInViewOnce(ref: RefObject<HTMLElement | null>, rootMargin = '600px', remountKey: unknown = null): boolean {
  const [inView, setInView] = useState(false)
  useEffect(() => {
    if (inView) return
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') { setInView(true); return }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true)
          obs.disconnect()
        }
      },
      { rootMargin },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [ref, rootMargin, inView, remountKey])
  return inView
}
