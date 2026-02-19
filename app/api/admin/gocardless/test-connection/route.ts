import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import { getAccessToken, listInstitutions } from '@/lib/gocardless/client'

export async function POST() {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const token = await getAccessToken(supabase)
    const institutions = await listInstitutions(supabase, token, 'NL')

    return NextResponse.json({
      success: true,
      institutions_count: institutions.length,
      message: `Verbinding geslaagd. ${institutions.length} Nederlandse banken beschikbaar.`,
    })
  } catch (err) {
    console.error('GoCardless test connection error:', err)
    return NextResponse.json({
      success: false,
      message: err instanceof Error ? err.message : 'Verbinding mislukt',
    }, { status: 500 })
  }
}
