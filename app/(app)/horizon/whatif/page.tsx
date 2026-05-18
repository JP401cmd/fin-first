import { redirect } from 'next/navigation'
import WhatIfPageClient from './whatif-page-client'

/**
 * /horizon/whatif — Server wrapper voor conditionele redirect.
 *
 * Feature #800: uniforme tijdas — bestaande bookmarks blijven werken.
 *
 * • Directe toegang (bookmark/URL) → redirect naar /horizon?whatif=open
 *   zodat de dream-gate-transitie automatisch opent.
 * • Via dream gate (?via=dreamgate) → toon de volledige what-if ervaring.
 */
export default async function WhatIfPage({
  searchParams,
}: {
  searchParams: Promise<{ via?: string }>
}) {
  const params = await searchParams
  if (params.via !== 'dreamgate') {
    redirect('/horizon?whatif=open')
  }
  return <WhatIfPageClient />
}
