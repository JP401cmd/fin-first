'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/**
 * De URL zonder één query-sleutel, mét de hash. Route-onafhankelijk: de pathname komt
 * van de aanroeper (`usePathname`), dus dezelfde opruiming werkt op
 * `/toekomst/instellingen`, op een oude route die nog rendert en in een test.
 */
export function urlZonderParam(pathname: string, search: URLSearchParams, key: string, hash = ''): string {
  const p = new URLSearchParams(search)
  p.delete(key)
  const query = p.toString()
  return `${pathname}${query ? `?${query}` : ''}${hash}`
}

/**
 * Een deeplink-param die precies één keer iets opent (`?nieuw=1`, `?strategie=aow`,
 * `?regel=…`). Zodra de param er is, krijgt `onWaarde` de waarde en verdwijnt hij uit de
 * URL (C3 punt 7). Opruimen bij het OPENEN, niet pas bij het sluiten: het sluitpad liep
 * via meerdere wegen (annuleren, opslaan + `router.refresh()`), en langs minstens één
 * bleef de param staan — dan opende dezelfde editor opnieuw bij terug-navigeren of
 * herladen. De hash blijft staan, zodat het anker (`#gebeurtenissen`) klopt.
 *
 * `onWaarde` beslist zelf of de waarde geldig is; ongeldige waarden worden óók
 * opgeruimd (een kapotte deeplink hoort niet in de adresbalk te blijven hangen).
 */
export function useEenmaligeDeeplink(key: string, onWaarde: (waarde: string) => void): void {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  // De nieuwste callback zonder hem in de deps te zetten: een inline-functie zou het
  // effect anders elke render opnieuw laten afgaan.
  const onWaardeRef = useRef(onWaarde)
  useEffect(() => {
    onWaardeRef.current = onWaarde
  })

  useEffect(() => {
    const waarde = searchParams.get(key)
    if (waarde == null) return
    onWaardeRef.current(waarde)
    const hash = typeof window !== 'undefined' ? window.location.hash : ''
    router.replace(urlZonderParam(pathname, searchParams, key, hash), { scroll: false })
  }, [searchParams, pathname, router, key])
}
