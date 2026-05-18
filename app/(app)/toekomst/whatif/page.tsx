import { redirect } from 'next/navigation'
import WhatIfPageClient from '../../horizon/whatif/whatif-page-client'

/**
 * /toekomst/whatif — wrapper voor de what-if-flow onder de nieuwe route.
 *
 * Volgt hetzelfde patroon als /horizon/whatif (feature #800):
 *  - Directe toegang (bookmark/URL) → redirect naar /toekomst?whatif=open
 *    zodat de dream-gate-transitie automatisch opent
 *  - Via dream gate (?via=dreamgate) → toon de volledige what-if-ervaring
 *
 * Bestaande /horizon/whatif blijft werken (next.config.ts top-level
 * redirects pakken /horizon → /toekomst alleen exact-match, sub-paden
 * blijven onder /horizon).
 */
export default async function ToekomstWhatIfPage({
  searchParams,
}: {
  searchParams: Promise<{ via?: string }>
}) {
  const params = await searchParams
  if (params.via !== 'dreamgate') {
    redirect('/toekomst?whatif=open')
  }
  return <WhatIfPageClient />
}
