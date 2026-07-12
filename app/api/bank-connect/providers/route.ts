import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isTrueLayerEnabled } from '@/lib/truelayer/feature-flag'
import { getBaseUrls, getProviders, getClientId } from '@/lib/truelayer/client'

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!(await isTrueLayerEnabled(supabase))) {
    return NextResponse.json({ error: 'Bank Connect is niet ingeschakeld' }, { status: 503 })
  }

  try {
    const { authUrl } = await getBaseUrls(supabase)
    const { data: envData } = await supabase
      .from('app_settings').select('value').eq('key', 'truelayer_environment').single()
    const isSandbox = envData?.value === 'sandbox'
    // Productie: filter op NL via het client-id-pad (country wordt client-side
    // toegepast; TrueLayer kent geen country-queryparam). Sandbox: kale lijst.
    const providers = isSandbox
      ? await getProviders(authUrl)
      : await getProviders(authUrl, { clientId: await getClientId(), country: 'nl' })

    const result = providers.map((p) => ({
      id: p.provider_id,
      name: p.display_name,
      logo: p.logo_url,
    }))

    return NextResponse.json(result)
  } catch (err) {
    console.error('TrueLayer providers error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Kon banken niet ophalen' },
      { status: 500 }
    )
  }
}
