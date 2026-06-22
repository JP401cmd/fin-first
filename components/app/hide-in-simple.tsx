'use client'

/**
 * HideInSimple — verbergt zijn inhoud volledig in de weergavemodus "Eenvoudig"
 * en toont 'm in "Volledig". Het hard-hide-zusje van `DepthSection`:
 *   'simple' → kinderen worden NIET gerenderd (rustig, beginnervriendelijk).
 *   'full'   → kinderen worden gerenderd (expert ziet alles).
 *
 * Bewuste keuze t.o.v. DepthSection (inklapbaar-maar-bereikbaar): hard-hide is
 * het uitgangspunt voor secundaire diepte. "Volledig" betekent dan letterlijk
 * "alles tonen". Wie de diepte wil zien, schakelt via ⌘K naar Volledig — er is
 * bewust GEEN per-sectie-hint of -toggle (dat zou de rust ondermijnen).
 *
 * SINGLE SOURCE OF TRUTH: leest uitsluitend `useDisplayMode()` — net als
 * DepthSection. Géén eigen state, géén localStorage, géén prop-drilling van de
 * modus; daardoor geen drift (zie ADR 0026 + use-display-mode.tsx).
 *
 * Server-children-patroon: het component is zelf 'use client', maar de kinderen
 * blijven server-gerenderd en worden als prop over de grens doorgegeven. Een
 * async Server Component kan dus `<HideInSimple><ServerSectie/></HideInSimple>`
 * renderen zonder zelf client te worden.
 *
 * Rendert een fragment (géén wrapper-node) zodat layout-containers als
 * `space-y-*`/grids hun directe-kind-selectors behouden — zero layout-impact.
 */

import type { ReactNode } from 'react'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'

export function HideInSimple({ children }: { children: ReactNode }) {
  const { mode } = useDisplayMode()
  if (mode === 'simple') return null
  return <>{children}</>
}
