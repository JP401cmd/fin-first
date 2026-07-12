import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { safeRelativePath } from '@/lib/safe-redirect'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // safeRelativePath weigert open-redirect-patronen (//evil.com, @evil.com, .evil.com, absolute URLs)
  const next = safeRelativePath(searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Geen code of mislukte uitwisseling: de bevestigings-/resetlink is verlopen
  // of al gebruikt. Stuur naar /login met een vlag zodat de loginpagina een
  // duidelijke banner toont i.p.v. een kale loginpagina (A-01).
  return NextResponse.redirect(`${origin}/login?confirm_error=1`)
}
