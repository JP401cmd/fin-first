import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowLeft, Briefcase } from 'lucide-react'

// UUID v4 regex for validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Check if the holdings table exists by trying a lightweight query.
 */
async function holdingsTableExists(supabase: Awaited<ReturnType<typeof createClient>>): Promise<boolean> {
  const { error } = await supabase.from('holdings').select('id').limit(0)
  return !error || !error.message.includes('Could not find')
}

export default async function HoldingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // Validate UUID format — malformed IDs get a 404 immediately
  if (!UUID_REGEX.test(id)) {
    notFound()
  }

  // Valid UUID format — check if the holding actually exists
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    notFound()
  }

  // Try the dedicated holdings table first, fall back to assets
  const hasTable = await holdingsTableExists(supabase)

  let holdingData: Record<string, unknown> | null = null

  if (hasTable) {
    const { data, error } = await supabase
      .from('holdings')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!error && data) {
      holdingData = data
    }
  }

  // Fallback: try the assets table if not found in holdings
  if (!holdingData) {
    const { data: asset, error: assetError } = await supabase
      .from('assets')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!assetError && asset) {
      holdingData = {
        id: asset.id,
        name: asset.name,
        ticker: asset.ticker_symbol || null,
        asset_type: asset.asset_type,
        notes: asset.notes,
      }
    }
  }

  // If still not found, show the not-found page
  if (!holdingData) {
    notFound()
  }

  const name = holdingData.name as string
  const ticker = holdingData.ticker as string | null

  // If the holding exists, show a detail view with link to the holdings list
  return (
    <div className="mx-auto max-w-4xl px-4 py-8" data-testid="holding-detail-page">
      <Link
        href="/core/assets/holdings"
        className="mb-6 inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
        data-testid="back-to-holdings-link"
      >
        <ArrowLeft className="h-4 w-4" />
        Terug naar holdings
      </Link>

      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/50">
            <Briefcase className="h-6 w-6 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100" data-testid="holding-name">{name}</h1>
            {ticker && (
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{ticker}</p>
            )}
          </div>
        </div>
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          Dit holding wordt beheerd via de{' '}
          <Link href="/core/assets/holdings" className="text-amber-600 hover:underline">
            holdings overzichtspagina
          </Link>.
        </p>
      </div>
    </div>
  )
}
