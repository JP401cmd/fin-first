import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import {
  loadHoldingsImportTargets,
  type HoldingsImportTarget,
} from '@/lib/holdings-import-targets'
import HoldingsImportClient from './import-client'

/**
 * Server-schil van de CSV-import-wizard.
 *
 * De wizard eist een doel-bezitting; die keuzelijst komt server-side uit
 * `loadHoldingsImportTargets` (datapad-conventie: lezen via loader, niet via een
 * directe client-read). De client-wizard leest daarnaast `?asset=<uuid>` uit de
 * URL en heeft daarvoor de Suspense-grens hieronder nodig.
 */
function ImportLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-kern-500 border-t-transparent" />
      </div>
    </div>
  )
}

export default async function HoldingsImportServerPage() {
  const supabase = await createClient()

  let targets: HoldingsImportTarget[] = []
  try {
    targets = await loadHoldingsImportTargets(supabase)
  } catch {
    // Lege lijst is een geldige uitkomst: de wizard biedt dan alleen
    // "nieuwe belegging aanmaken" aan.
  }

  return (
    <Suspense fallback={<ImportLoading />}>
      <HoldingsImportClient targets={targets} />
    </Suspense>
  )
}
