import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isGoCardlessEnabled } from '@/lib/gocardless/feature-flag'
import { getAccessToken, createRequisition } from '@/lib/gocardless/client'

export async function POST(req: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!(await isGoCardlessEnabled(supabase))) {
    return NextResponse.json({ error: 'GoCardless is niet ingeschakeld' }, { status: 503 })
  }

  try {
    const { institution_id, institution_name, institution_logo } = await req.json()

    if (!institution_id) {
      return NextResponse.json({ error: 'institution_id is vereist' }, { status: 400 })
    }

    const token = await getAccessToken(supabase)
    const reference = `fin-${user.id.slice(0, 8)}-${Date.now()}`
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const redirectUrl = `${appUrl}/api/gocardless/callback?ref=${reference}`

    const requisition = await createRequisition(
      supabase,
      token,
      institution_id,
      redirectUrl,
      reference
    )

    // Store requisition in database
    const { error: dbError } = await supabase
      .from('gocardless_requisitions')
      .insert({
        user_id: user.id,
        requisition_id: requisition.id,
        institution_id,
        institution_name: institution_name || institution_id,
        institution_logo: institution_logo || null,
        status: 'pending',
        link: requisition.link,
      })

    if (dbError) {
      console.error('Failed to store requisition:', dbError)
      return NextResponse.json({ error: 'Kon verbinding niet opslaan' }, { status: 500 })
    }

    return NextResponse.json({
      link: requisition.link,
      requisition_id: requisition.id,
    })
  } catch (err) {
    console.error('GoCardless connect error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Verbinding maken mislukt' },
      { status: 500 }
    )
  }
}
