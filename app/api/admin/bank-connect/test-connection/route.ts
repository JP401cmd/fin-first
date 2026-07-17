import { NextResponse } from 'next/server'
import { forbidden } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import { getBaseUrls, getProviders, getClientId } from '@/lib/truelayer/client'

export async function POST() {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  try {
    const { authUrl } = await getBaseUrls(supabase)
    const { data: envData } = await supabase
      .from('app_settings').select('value').eq('key', 'truelayer_environment').single()
    const isSandbox = envData?.value === 'sandbox'
    // Spiegel het echte gebruikerspad (providers-route): in productie testen we
    // mét clientid + NL-filter, zodat "geslaagd" ook de echte banklijst bewijst.
    const providers = isSandbox
      ? await getProviders(authUrl)
      : await getProviders(authUrl, { clientId: await getClientId(), country: 'nl' })

    return NextResponse.json({
      success: true,
      providers_count: providers.length,
      message: `Verbinding geslaagd. ${providers.length} ${isSandbox ? 'sandbox-providers' : 'Nederlandse banken'} beschikbaar.`,
    })
  } catch (err) {
    console.error('TrueLayer test connection error:', err)
    return NextResponse.json({
      success: false,
      // eslint-disable-next-line no-restricted-syntax -- rauwe error.message: zie [Arch F4] API-error-envelope
      message: err instanceof Error ? err.message : 'Verbinding mislukt',
    }, { status: 500 })
  }
}
