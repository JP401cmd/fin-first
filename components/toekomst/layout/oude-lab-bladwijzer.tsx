'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { VERKEN_SECTION_ID } from '@/components/app/horizon/scenario-chip'
import { CONSUMED_DEEPLINK_PARAMS } from '@/lib/horizon/deeplink-cleanup'

/**
 * Herhaalmomenten (ms na mount). Eén keer opnieuw via de router; lukt ook dat niet, dan
 * een harde navigatie — een bladwijzer die op het oude katern blijft staan is erger dan
 * een reload.
 */
const HERHAAL_NA_MS = [250, 1_000] as const

/** Los object, zodat de test de harde navigatie kan vervangen (jsdom navigeert niet). */
export const bladwijzerNavigatie = {
  hard(url: string): void {
    window.location.replace(url)
  },
}

/**
 * Een oude bladwijzer `<vanPad>#<hash>` naar een anker dat verhuisde. Een hash bereikt de
 * server niet, dus een `next.config`-redirect kan dit niet opvangen; deze handler stuurt
 * na mount door naar `doel()`. Rendert niets.
 *
 * Robuust (fixronde C1): een `router.replace` die direct in het mount-effect vertrekt,
 * viel in de browser weg tijdens de hydratie — het effect van dit kind draait vóór de
 * effecten van de app-router zelf (en vóór de deeplink-opruiming van de provider in de
 * layout). Daarom kijkt de handler daarna nog kort of de adresbalk is meegegaan,
 * probeert het één keer opnieuw en navigeert anders hard. Zodra de navigatie lukt,
 * ontkoppelt de page en ruimt de cleanup de timers op.
 */
function useHashBladwijzer(vanPad: string, hash: string, doel: () => string): void {
  const router = useRouter()
  useEffect(() => {
    const opOudeBladwijzer = () =>
      window.location.pathname === vanPad && window.location.hash === `#${hash}`
    if (!opOudeBladwijzer()) return
    const url = doel()
    router.replace(url)
    const timers = HERHAAL_NA_MS.map((ms, i) =>
      window.setTimeout(() => {
        if (!opOudeBladwijzer()) return
        if (i < HERHAAL_NA_MS.length - 1) router.replace(url)
        else bladwijzerNavigatie.hard(url)
      }, ms),
    )
    return () => timers.forEach((t) => window.clearTimeout(t))
    // Alleen bij mount: de bladwijzer is een eenmalige binnenkomst.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])
}

const LAB_DOEL = `/toekomst/doelen#${VERKEN_SECTION_ID}`

/**
 * Oude bladwijzers naar het lab op Plan (ADR 0179 fase 1 stap 16, besluit Q3): het lab
 * stond tot stap 16 op `/toekomst#verken-je-aannames` en woont nu in katern Doelen.
 * Staat alleen op de Plan-page.
 */
export function OudeLabBladwijzer() {
  useHashBladwijzer('/toekomst', VERKEN_SECTION_ID, () => LAB_DOEL)
  return null
}

/** Het anker van de levensgebeurtenissen op Plan (ADR 0179, addendum 26 sep). */
export const GEBEURTENISSEN_ANKER = 'gebeurtenissen'

/**
 * Het doel van een oude `/toekomst/instellingen…#gebeurtenissen`-bladwijzer: Plan met
 * hetzelfde anker. Overige params reizen mee; de tijdas-deeplinks (`?nieuw=`, `?event=`
 * …) en `?tab=` niet — die heeft de provider in de layout op Instellingen al geopend en
 * opgeruimd, en het venster blijft over de katernwissel staan.
 */
export function gebeurtenissenDoel(search: string): string {
  const p = new URLSearchParams(search)
  for (const key of [...CONSUMED_DEEPLINK_PARAMS, 'tab']) p.delete(key)
  const query = p.toString()
  return `/toekomst${query ? `?${query}` : ''}#${GEBEURTENISSEN_ANKER}`
}

/**
 * Oude bladwijzers naar de gebeurtenissen in Instellingen (ADR 0179, addendum 26 sep): de
 * lijst stond tot het addendum op `/toekomst/instellingen#gebeurtenissen` en staat nu
 * onder het plan. Staat alleen op de Instellingen-page.
 */
export function OudeGebeurtenissenBladwijzer() {
  useHashBladwijzer('/toekomst/instellingen', GEBEURTENISSEN_ANKER, () =>
    gebeurtenissenDoel(window.location.search),
  )
  return null
}
