import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import {
  DEFAULT_MODULE_COLORS,
  DEFAULT_BUDGET_COLORS,
  type ModuleColorConfig,
  type BudgetColorConfig,
} from '@/lib/color-palette'

/**
 * /api/appearance — persistentie van de kleur-personalisatie die op
 * /mijn/uiterlijk wordt gekozen. Schrijft de accentkleuren (module_colors)
 * en budget-tints (budget_colors) naar de eigen profiles-rij.
 *
 * De ModuleColorProvider roept dit debounced aan bij elke kleurkeuze; de
 * layout laadt de opgeslagen waardes weer in bij de volgende render zodat
 * het rondje klopt: kiezen → opslaan → refresh → behouden.
 *
 * Eigen rij only — RLS op profiles dwingt af dat een gebruiker alleen zijn
 * eigen accentkleuren kan schrijven (auth.uid()). Geen service-role.
 */

const HEX_RE = /^#[0-9a-fA-F]{6}$/

const MODULE_KEYS = Object.keys(DEFAULT_MODULE_COLORS) as (keyof ModuleColorConfig)[]
const BUDGET_KEYS = Object.keys(DEFAULT_BUDGET_COLORS) as (keyof BudgetColorConfig)[]

/**
 * Sanitiseert een binnenkomende kleur-map: alleen bekende keys, alleen
 * geldige 6-cijferige hex. Onbekende keys / ongeldige waardes worden
 * stilletjes genegeerd. Geeft `undefined` terug als er niets bruikbaars
 * overblijft, zodat we de kolom dan niet aanraken.
 */
function sanitizeColorMap<K extends string>(
  raw: unknown,
  allowedKeys: readonly K[]
): Record<K, string> | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const input = raw as Record<string, unknown>
  const out = {} as Record<K, string>
  let any = false
  for (const key of allowedKeys) {
    const v = input[key]
    if (typeof v === 'string' && HEX_RE.test(v)) {
      out[key] = v.toLowerCase()
      any = true
    }
  }
  return any ? out : undefined
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldig verzoek' }, { status: 400 })
  }

  const moduleColors = sanitizeColorMap(body.module_colors, MODULE_KEYS)
  const budgetColors = sanitizeColorMap(body.budget_colors, BUDGET_KEYS)

  if (!moduleColors && !budgetColors) {
    return NextResponse.json({ error: 'Geen geldige kleuren ontvangen' }, { status: 400 })
  }

  const updateData: Record<string, unknown> = {
    id: user.id,
    updated_at: new Date().toISOString(),
  }
  if (moduleColors) updateData.module_colors = moduleColors
  if (budgetColors) updateData.budget_colors = budgetColors

  const { error } = await supabase.from('profiles').upsert(updateData)

  if (error) {
    return NextResponse.json({ error: 'Fout bij opslaan kleuren' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    module_colors: moduleColors ?? null,
    budget_colors: budgetColors ?? null,
  })
}
