'use client'

import { useModuleAccess } from '@/lib/feature-access/context'
import { navSurfaceFor, type NavSurface } from '@/lib/nav-config'

/**
 * De navigatie voor de moduleset van het ingelogde account (Krant 2B).
 *
 * Dunne client-brug naar `navSurfaceFor` in lib/nav-config.ts — dáár valt de
 * beslissing, hier alleen de lezing van de actieve modules uit de
 * FeatureAccessProvider. Buiten die provider zijn dat alle modules, dus een
 * losse render (test, storybook) ziet de volledige navigatie.
 *
 * `navSurfaceFor` geeft vaste instanties terug, dus geen `useMemo` nodig: de
 * referentie is stabiel zolang het product gelijk blijft.
 */
export function useNavSurface(): NavSurface {
  const { activeModules } = useModuleAccess()
  return navSurfaceFor(activeModules)
}
