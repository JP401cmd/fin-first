import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGuideHelp } from '@/lib/briefing/guide-help'

// ── GET — Hele help-content blob (publiek voor ingelogde users) ─────
//
// Retourneert `Record<helpKey, HelpEntry>`. Lege response als er nog
// geen content is geconfigureerd. Caller wordt verwacht zelf op
// `blob[helpKey]` te indexeren — een ontbrekende key betekent
// "nog geen uitleg".

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const blob = await getGuideHelp(supabase)
  return NextResponse.json(blob)
}
