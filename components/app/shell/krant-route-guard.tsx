'use client'

import { useEffect, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useModuleAccess } from '@/components/app/feature-access-provider'
import { krantRedirect } from '@/lib/modules/krant-grens'

/**
 * Client-kant van de Krant-grens (Krant 2B).
 *
 * WAAROM NAAST DE LAYOUT-REDIRECT: `app/(app)/layout.tsx` stuurt een
 * Krant-account server-side naar /nieuws, maar Next rendert een gedeelde layout
 * bij een client-navigatie niet opnieuw (Partial Rendering). Een `<Link>` binnen
 * de app zou de server-grens dus stil passeren. Deze wacht leest het pad op de
 * client en neemt exact dezelfde beslissing (`krantRedirect`) — één functie,
 * twee momenten.
 *
 * Buiten de grens rendert hij níéts (de pagina verschijnt niet, ook niet even)
 * en vervangt hij de route door /nieuws. `replace`, geen `push`: de terugknop
 * mag niet terug naar de geweigerde pagina.
 *
 * Voor elk niet-Krant-account is `krantRedirect` altijd `null`: dan is dit een
 * doorgeefluik dat `children` ongewijzigd rendert.
 */
export function KrantRouteGuard({
  isSuperadmin,
  children,
}: {
  isSuperadmin: boolean
  children: ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { activeModules } = useModuleAccess()
  // `usePathname()` is binnen de app-router altijd gezet; `null` behandelen we
  // als "onbekend", dus fail-closed — dezelfde regel als de layout.
  const target = krantRedirect(pathname, activeModules, isSuperadmin)

  useEffect(() => {
    if (target) router.replace(target)
  }, [target, router])

  if (target) return null
  return <>{children}</>
}
