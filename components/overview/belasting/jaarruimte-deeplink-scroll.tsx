'use client'

import { useEffect } from 'react'

/**
 * Deeplink-scroll naar het jaarruimte-uitlegblok.
 *
 * Bij mount: als de URL-hash `#jaarruimte-uitleg` is, scroll naar dat blok
 * (smooth, tenzij de gebruiker `prefers-reduced-motion` heeft). De Next.js App
 * Router voert native hash-scroll bij een cross-route navigatie niet altijd
 * betrouwbaar uit, vandaar deze expliciete fallback (patroon zoals
 * `beheer/architectuur/architectuur-client.tsx`). `scroll-mt-24` op het doel
 * geeft de offset onder de sticky header.
 */
export function JaarruimteDeeplinkScroll() {
  useEffect(() => {
    if (window.location.hash !== '#jaarruimte-uitleg') return
    const el = document.getElementById('jaarruimte-uitleg')
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }, [])
  return null
}
