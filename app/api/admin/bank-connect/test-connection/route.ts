import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import { getBaseUrls, getProviders } from '@/lib/truelayer/client'

export async function POST() {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { authUrl } = await getBaseUrls(supabase)
    const providers = await getProviders(authUrl)

    return NextResponse.json({
      success: true,
      providers_count: providers.length,
      message: `Verbinding geslaagd. ${providers.length} Nederlandse banken beschikbaar.`,
    })
  } catch (err) {
    console.error('TrueLayer test connection error:', err)
    return NextResponse.json({
      success: false,
      message: err instanceof Error ? err.message : 'Verbinding mislukt',
    }, { status: 500 })
  }
}
