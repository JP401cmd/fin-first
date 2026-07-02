import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import {
  KERNEL_FLAG_KEYS,
  readKernelFlags,
  type KernelFlagName,
} from '@/lib/horizon-kernel/flag'

/**
 * /api/horizon-kernel-flags — beheer-toggle voor de FASE 5-uitrol van de
 * horizon-kernel (gap-besluit V13, ADR 0032 §6).
 *
 * Deze route bestaat zodat een account de vier kernel-vlaggen per stuk aan/uit kan
 * zetten zonder in de DB te hoeven prikken. De stand leeft in de user-writable JSONB-
 * kolom `profiles.feature_preferences`; deze route is het schrijfpad, `readKernelFlags`
 * (`@/lib/horizon-kernel/flag`) het leescontract.
 *
 * De `convergentie`-vlag is BEWUST één schakelaar voor de hele kern-getallen-set
 * (/overzicht-hero + /toekomst-grafiek + dashboard-loader/`freedomPct` + AI-context) —
 * zie de module-doc van `flag.ts`. Deze route valideert alleen de vlagnaam en de
 * boolean; de invariant zelf zit in hoe de consumenten de vlag lezen.
 *
 * SECURITY: own-row read-modify-write via de anon RLS-client (`.eq('id', user.id)`),
 * NOOIT service-role. RLS op `profiles` (`auth.uid() = id`) dwingt af dat een gebruiker
 * uitsluitend de eigen `feature_preferences` leest/schrijft. Whitelist op de vlagnaam
 * zodat de body geen willekeurige JSONB-sleutel kan zetten. 401 zonder sessie, 400 bij
 * onbekende vlag / niet-boolean `enabled` / malformed body, 500 bij DB-fout.
 */

const FLAG_NAMES = Object.keys(KERNEL_FLAG_KEYS) as KernelFlagName[]

/** Whitelist-guard: accepteert uitsluitend de vier bekende logische vlagnamen. */
function isKernelFlagName(value: unknown): value is KernelFlagName {
  return typeof value === 'string' && (FLAG_NAMES as string[]).includes(value)
}

// ── GET — huidige stand van alle vier de vlaggen ─────────────────────

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const { data, error } = await supabase
    .from('profiles')
    .select('feature_preferences')
    .eq('id', user.id)
    .single()

  if (error) return NextResponse.json({ error: 'Fout bij laden' }, { status: 500 })

  return NextResponse.json({ flags: readKernelFlags(data) })
}

// ── PUT — één vlag aan/uit zetten (own-row RMW) ──────────────────────

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldig verzoek' }, { status: 400 })
  }

  // Whitelist de vlagnaam zodat de body geen willekeurige JSONB-sleutel kan zetten.
  if (!isKernelFlagName(body.flag)) {
    return NextResponse.json({ error: 'Onbekende vlag' }, { status: 400 })
  }
  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled moet een boolean zijn' }, { status: 400 })
  }
  const flag = body.flag
  const enabled = body.enabled

  // Own-row read: huidige preferences ophalen om er non-destructief in te mergen.
  const { data: current, error: readError } = await supabase
    .from('profiles')
    .select('feature_preferences')
    .eq('id', user.id)
    .single()
  if (readError) {
    return NextResponse.json({ error: 'Fout bij laden' }, { status: 500 })
  }

  const fp = (current?.feature_preferences ?? {}) as Record<string, unknown>
  const key = KERNEL_FLAG_KEYS[flag]
  if (enabled) {
    // Alleen een letterlijke `true` telt als aan (spiegelt isKernelFlagEnabled).
    fp[key] = true
  } else {
    // Wis de sleutel bij uitzetten zodat de JSONB schoon blijft (geen `false`-ruis).
    delete fp[key]
  }

  // Own-row write — uitsluitend de eigen rij (RLS), geen service-role.
  const { error: writeError } = await supabase
    .from('profiles')
    .update({ feature_preferences: fp })
    .eq('id', user.id)
  if (writeError) {
    return NextResponse.json({ error: 'Opslaan mislukt' }, { status: 500 })
  }

  return NextResponse.json({ flags: readKernelFlags({ feature_preferences: fp }) })
}
