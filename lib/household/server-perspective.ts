// lib/household/server-perspective.ts
//
// Server-side lezing van het gekozen perspectief. De client schrijft het
// perspectief naast localStorage ook als cookie `tf_perspective` (zie
// components/app/perspective-provider.tsx), zodat server-componenten
// (/overzicht, /core, /dashboard, ...) meteen het juiste perspectief renderen
// zonder een "eigen-data-flits". Default = 'personal'.

import { cookies } from 'next/headers'
import type { Perspective } from '@/lib/household-data'

export const PERSPECTIVE_COOKIE = 'tf_perspective'

const VALID: readonly Perspective[] = ['personal', 'household', 'partner']

/**
 * Lees het perspectief uit de `tf_perspective`-cookie en valideer het.
 * Valt veilig terug op 'personal' wanneer de cookie ontbreekt/ongeldig is of
 * `cookies()` niet beschikbaar is (bv. tijdens statische rendering).
 */
export async function getServerPerspective(): Promise<Perspective> {
  try {
    const store = await cookies()
    const raw = store.get(PERSPECTIVE_COOKIE)?.value
    if (raw && (VALID as readonly string[]).includes(raw)) {
      return raw as Perspective
    }
  } catch {
    // cookies() niet beschikbaar in deze render-context
  }
  return 'personal'
}
