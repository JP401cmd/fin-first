'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { moduleVanPad } from '@/lib/activity/modules'
import { meldModuleGebruik } from '@/lib/activity/meld-module'

/**
 * ActivityModuleTracker — meldt per app-deel "vandaag gebruikt" (ADR 0147,
 * fase 2). Rendert niets; staat één keer in de app-layout, naast de
 * GuideVisitTracker.
 *
 * Het pad wordt alléén lokaal naar een gesloten modulesleutel vertaald
 * (`moduleVanPad`); de route zelf verlaat de browser nooit. Paden die niet
 * meetellen (beheer, onboarding, onbekend) melden niets. Fin heeft geen route —
 * dat meldt het chatvenster zelf.
 */
export function ActivityModuleTracker() {
  const pathname = usePathname()
  // Niet `module` noemen: dat is in Next een gereserveerde naam
  // (@next/next/no-assign-module-variable).
  const appDeel = moduleVanPad(pathname)

  useEffect(() => {
    if (appDeel) meldModuleGebruik(appDeel)
  }, [appDeel])

  return null
}
