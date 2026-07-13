import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * /api/briefing/email/pref — opt-in voor de wekelijkse briefing-e-mail.
 *
 * Eigen rij only — RLS op profiles (auth.uid() = id) dwingt af dat een gebruiker
 * alleen zijn eigen opt-in kan lezen/schrijven. Geen service-role; spiegel het
 * /api/appearance-patroon (anon RLS-client, own-row update). De toggle op
 * /mijn/notificaties gebruikt GET om de huidige stand te laden en PUT om te zetten.
 *
 * Consent-helder: de waarde leeft in een aparte kolom (profiles.weekly_briefing_email,
 * DEFAULT FALSE) — bewust NIET in de notifications_preferences-blob, die naar
 * default-true coerced (opt-out-semantiek, verkeerd voor een e-mail-kanaal).
 */

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('weekly_briefing_email')
    .eq('id', user.id)
    .single()

  if (error) {
    // Kolom nog niet gemigreerd (42703) of transient → val veilig terug op false.
    return NextResponse.json({ enabled: false })
  }

  return NextResponse.json({
    enabled: (data as { weekly_briefing_email?: boolean } | null)?.weekly_briefing_email === true,
  })
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldig verzoek' }, { status: 400 })
  }

  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'Veld "enabled" moet een boolean zijn' }, { status: 400 })
  }

  const { error } = await supabase
    .from('profiles')
    .update({ weekly_briefing_email: body.enabled })
    .eq('id', user.id)

  if (error) {
    return NextResponse.json({ error: 'Fout bij opslaan voorkeur' }, { status: 500 })
  }

  return NextResponse.json({ success: true, enabled: body.enabled })
}
