import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getCachedUser } from '@/lib/supabase/cached-user'

/**
 * PUT /api/display-mode
 *
 * Slaat de profiel-brede weergavemodus ('simple' | 'full') op de EIGEN
 * profielrij op. Body: `{ mode: 'simple' | 'full' }`.
 *
 * Cross-device: de modus staat op `profiles.display_mode` (scalar) en wordt door
 * de layout-render server-side ingelezen (geen flash). Deze route is het enige
 * schrijfpad.
 *
 * SINGLE SOURCE / SECURITY: own-row update via de anon RLS-client
 * (`.eq('id', user.id)`), NOOIT service-role. RLS op `profiles`
 * (`USING (auth.uid() = id)`) dwingt af dat een gebruiker alleen de eigen rij
 * schrijft. Geen PII, één scalar. 401 als niet ingelogd, 400 bij ongeldige body
 * of waarde. Spiegelt `app/api/overzicht/page-status` (own-row write) en de
 * parse-/allowlist-guard van `app/api/appearance`.
 */

const ALLOWED_MODES = ['simple', 'full'] as const
type DisplayMode = (typeof ALLOWED_MODES)[number]

function asMode(value: unknown): DisplayMode | null {
  return value === 'simple' || value === 'full' ? value : null
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await getCachedUser(supabase)
    if (!user) {
      return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
    }

    // Malformed/ontbrekende body → 400 i.p.v. een generieke 500 (spiegelt de
    // parse-guard van /api/appearance + page-status).
    let body: { mode?: unknown }
    try {
      body = (await request.json()) as { mode?: unknown }
    } catch {
      return NextResponse.json({ error: 'Ongeldig verzoek' }, { status: 400 })
    }

    const mode = asMode(body.mode)
    if (!mode) {
      return NextResponse.json({ error: 'Ongeldige weergavemodus' }, { status: 400 })
    }

    // Own-row scalar update — uitsluitend de eigen rij (RLS), geen service-role.
    const { error } = await supabase
      .from('profiles')
      .update({ display_mode: mode })
      .eq('id', user.id)

    if (error) throw error

    return NextResponse.json({ ok: true, mode })
  } catch (err) {
    console.error('[/api/display-mode PUT]', err)
    return NextResponse.json({ error: 'Interne fout' }, { status: 500 })
  }
}
