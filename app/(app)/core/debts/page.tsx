import { createClient } from '@/lib/supabase/server'
import { getServerPerspective } from '@/lib/household/server-perspective'
import { loadDebtsPageData } from './load-debts-page-data'
import { DebtsClient } from './debts-client'

/**
 * `/core/debts` — server-shell (content-first).
 *
 * Laadt de schulden-data server-side (cookie-server-client, RLS afgedwongen,
 * geen service-role) en geeft die als seed mee aan het client-eiland
 * `<DebtsClient>`, zodat de first paint content bevat i.p.v. een fullscreen-
 * spinner. Het client-eiland slaat de eerste client-fetch over zolang het
 * actieve perspectief gelijk is aan het geseede perspectief.
 *
 * Perspectief komt uit de `tf_perspective`-cookie (`getServerPerspective`),
 * exact dezelfde bron als `usePerspective()` na hydratie; op een perspectief-
 * wissel her-fetcht het client-eiland zelf.
 *
 * Faalt de server-load (bv. RLS/transient), dan rendert `<DebtsClient>` zonder
 * seed en valt terug op het oude client-fetch-gedrag — byte-identiek aan
 * voorheen.
 */
export default async function CoreDebtsPage() {
  const supabase = await createClient()
  const perspective = await getServerPerspective()
  const initialData = await loadDebtsPageData(supabase, perspective).catch(() => undefined)

  return <DebtsClient initialData={initialData} />
}
