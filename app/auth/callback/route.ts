import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { safeRelativePath } from '@/lib/safe-redirect'
import { SIGNUP_NOT_INVITED_SENTINEL } from '@/lib/auth-errors'

/** Herkent de besloten-testfase-sentinel (ADR 0047) case-insensitief. */
function containsNotInvitedSentinel(value: string | null | undefined): boolean {
  if (!value) return false
  return value.toLowerCase().includes(SIGNUP_NOT_INVITED_SENTINEL.toLowerCase())
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // OAuth-providers (Google) sturen bij annulering/fout terug met ?error=…
  // i.p.v. een code. Dan is de "verlopen bevestigingslink"-banner misleidend.
  const oauthError = searchParams.get('error')
  // Besloten testfase (ADR 0047): GoTrue geeft de hook-melding mee in
  // error_description bij een geweigerde niet-uitgenodigde OAuth-signup.
  const errorDescription = searchParams.get('error_description')
  // safeRelativePath weigert open-redirect-patronen (//evil.com, @evil.com, .evil.com, absolute URLs)
  const next = safeRelativePath(searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
    // Defensief: een geweigerde niet-uitgenodigde signup kan ook via de
    // code-uitwisseling terugkomen. Herken de sentinel en toon de nette
    // not-invited-banner i.p.v. de generieke verlopen-link-melding.
    if (containsNotInvitedSentinel(error.message)) {
      return NextResponse.redirect(`${origin}/login?not_invited=1`)
    }
  }

  // Google-login geannuleerd of geweigerd (geen code, wel ?error=access_denied):
  // stuur terug naar een kale /login zónder de e-mailbevestigings-banner — die
  // copy slaat nergens op bij een afgebroken OAuth-poging.
  if (oauthError) {
    // Allowlist-weigering (ADR 0047): GoTrue redirect met de hook-melding in
    // error_description. Toon dan de besloten-testfase-banner; anders het
    // bestaande kale-/login-gedrag.
    if (containsNotInvitedSentinel(errorDescription) || containsNotInvitedSentinel(oauthError)) {
      return NextResponse.redirect(`${origin}/login?not_invited=1`)
    }
    return NextResponse.redirect(`${origin}/login`)
  }

  // Geen code of mislukte uitwisseling: de bevestigings-/resetlink is verlopen
  // of al gebruikt. Stuur naar /login met een vlag zodat de loginpagina een
  // duidelijke banner toont i.p.v. een kale loginpagina (A-01).
  return NextResponse.redirect(`${origin}/login?confirm_error=1`)
}
