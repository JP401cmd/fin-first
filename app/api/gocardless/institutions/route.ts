import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isGoCardlessEnabled } from '@/lib/gocardless/feature-flag'
import { getAccessToken, listInstitutions } from '@/lib/gocardless/client'

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!(await isGoCardlessEnabled(supabase))) {
    return NextResponse.json({ error: 'GoCardless is niet ingeschakeld' }, { status: 503 })
  }

  try {
    const token = await getAccessToken(supabase)
    const institutions = await listInstitutions(supabase, token, 'NL')

    const result = institutions.map((inst) => ({
      id: inst.id,
      name: inst.name,
      logo: inst.logo,
      bic: inst.bic,
    }))

    return NextResponse.json(result)
  } catch (err) {
    console.error('GoCardless institutions error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Kon banken niet ophalen' },
      { status: 500 }
    )
  }
}
