'use client'

/**
 * `useViewportHoogte` — `window.innerHeight` in px, voor een hoogte die aan de viewport
 * hangt (de mobiele grafiek in katern Doelen: `clamp(170px, 30vh, 230px)`, ADR 0179 D7).
 *
 * Bewust gemeten bij mount en bij een oriëntatiewissel, NIET bij elke `resize`: iOS Safari
 * vuurt `resize` bij het in- en uitklappen van de werkbalk tijdens het scrollen, en dan zou
 * de grafiek meeverspringen. `null` op de server en in de eerste render (de consument kiest
 * dan zijn eigen middenwaarde).
 */

import { useEffect, useState } from 'react'

export function useViewportHoogte(): number | null {
  const [hoogte, setHoogte] = useState<number | null>(null)
  useEffect(() => {
    const meet = () => setHoogte(window.innerHeight)
    meet()
    // Na een draai is `innerHeight` pas bij de volgende frame bijgewerkt.
    const naDraai = () => window.requestAnimationFrame(meet)
    window.addEventListener('orientationchange', naDraai)
    return () => window.removeEventListener('orientationchange', naDraai)
  }, [])
  return hoogte
}
