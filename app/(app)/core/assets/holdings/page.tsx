import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { loadHoldingsData, type HoldingsPageData } from '@/lib/holdings-data-loader'
import HoldingsPage from '@/components/core/holdings-client'

function HoldingsLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-12">
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-kern-500 border-t-transparent" />
      </div>
    </div>
  )
}

export default async function HoldingsServerPage() {
  const supabase = await createClient()

  // Load data outside try/catch to keep JSX out of error-prone blocks
  let holdingsData: HoldingsPageData | null = null
  try {
    holdingsData = await loadHoldingsData(supabase)
  } catch {
    // Fallback to client-side loading if server-side fails
  }

  return (
    <Suspense fallback={<HoldingsLoading />}>
      <HoldingsPage initialData={holdingsData ?? undefined} />
    </Suspense>
  )
}
