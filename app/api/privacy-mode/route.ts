import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { checkTierGate } from '@/lib/require-tier'

/**
 * /api/privacy-mode — de per-gebruiker privé-modus voor lokale
 * transactie-categorisatie (`profiles.privacy_mode`, scope A, ADR 0043 / FR-2.x).
 *
 * GET  → leest de EIGEN waarde: `{ privacyMode: boolean }` (lezen is altijd vrij).
 * POST → zet de boolean: body `{ enabled: boolean }` → `{ ok: true, privacyMode }`.
 *        AANzetten is gated achter het 'ai'-abonnement (403 `tier_required`);
 *        UITzetten blijft altijd vrij (eigenaarsbesluit, requirements §5 optie 2).
 *
 * SINGLE SOURCE / SECURITY: own-row read-modify-write via de anon RLS-client
 * (`.eq('id', user.id)`), NOOIT service-role. De bestaande eigen-rij policy op
 * `profiles` (`USING (auth.uid() = id)`) dwingt af dat een gebruiker alleen de
 * eigen rij leest/schrijft. Eén scalar boolean, geen PII. Spiegelt
 * `app/api/display-mode/route.ts`. 401 zonder sessie, 400 bij malformed body of
 * een niet-boolean waarde.
 */

export async function GET() {
  try {
    const supabase = await createClient()
    const user = await getCachedUser(supabase)
    if (!user) {
      return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('privacy_mode')
      .eq('id', user.id)
      .maybeSingle()

    if (error) throw error

    const privacyMode = (data as { privacy_mode?: boolean | null } | null)?.privacy_mode ?? false
    return NextResponse.json({ privacyMode })
  } catch (err) {
    console.error('[/api/privacy-mode GET]', err)
    return NextResponse.json({ error: 'Interne fout' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await getCachedUser(supabase)
    if (!user) {
      return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
    }

    // Malformed/ontbrekende body → 400 i.p.v. een generieke 500 (spiegelt de
    // parse-guard van /api/display-mode).
    let body: { enabled?: unknown }
    try {
      body = (await request.json()) as { enabled?: unknown }
    } catch {
      return NextResponse.json({ error: 'Ongeldig verzoek' }, { status: 400 })
    }

    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'Ongeldige waarde' }, { status: 400 })
    }
    const privacyMode = body.enabled

    // TIER-GATE (eigenaarsbesluit 17 jul 2026 — requirements §5, optie 2): AANzetten
    // van lokale categorisatie vereist het 'ai'-abonnement, consistent met de rest
    // van de AI-functies. UITzetten blijft bewust altijd vrij, zodat een verlopen
    // abonnement niemand in privé-modus opsluit — daarom gate-t deze check
    // uitsluitend bij `privacyMode === true`. Dit is de autoritatieve laag; de
    // toggle-UI spiegelt hem alleen.
    if (privacyMode === true) {
      const tierGate = await checkTierGate(supabase, user.id, 'ai')
      if (tierGate) {
        return NextResponse.json({ error: tierGate.error, code: 'tier_required' }, { status: 403 })
      }
    }

    // Own-row scalar update — uitsluitend de eigen rij (RLS), geen service-role.
    const { error } = await supabase
      .from('profiles')
      .update({ privacy_mode: privacyMode })
      .eq('id', user.id)

    if (error) throw error

    return NextResponse.json({ ok: true, privacyMode })
  } catch (err) {
    console.error('[/api/privacy-mode POST]', err)
    return NextResponse.json({ error: 'Interne fout' }, { status: 500 })
  }
}
