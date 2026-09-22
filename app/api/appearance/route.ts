import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { unauthorized, badRequest, serverError } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import {
  DEFAULT_MODULE_COLORS,
  DEFAULT_BUDGET_COLORS,
  normalizeTopbarColor,
  type ModuleColorConfig,
  type BudgetColorConfig,
} from '@/lib/color-palette'

/**
 * /api/appearance — persistentie van de kleur-personalisatie die op
 * /mijn/uiterlijk wordt gekozen. Schrijft de accentkleuren (module_colors),
 * budget-tints (budget_colors) en de TopBar-kleur (topbar_color, ADR 0174 D3)
 * naar de eigen profiles-rij.
 *
 * De ModuleColorProvider roept dit debounced aan bij elke kleurkeuze; de
 * layout laadt de opgeslagen waardes weer in bij de volgende render zodat
 * het rondje klopt: kiezen → opslaan → refresh → behouden.
 *
 * Elke groep is optioneel en wordt alleen geschreven als hij meekomt. Wie
 * alleen `topbar_color` stuurt, raakt de accenten en budget-tints dus niet.
 *
 * Eigen rij only — RLS op profiles dwingt af dat een gebruiker alleen zijn
 * eigen kleuren kan schrijven (auth.uid()). Geen service-role.
 */

const HEX_RE = /^#[0-9a-fA-F]{6}$/

const MODULE_KEYS = Object.keys(DEFAULT_MODULE_COLORS) as (keyof ModuleColorConfig)[]
const BUDGET_KEYS = Object.keys(DEFAULT_BUDGET_COLORS) as (keyof BudgetColorConfig)[]

/**
 * De kleur-maps blijven bewust ruim (`unknown`) en gaan door
 * `sanitizeColorMap`: een onbekende sleutel of één ongeldige waarde laat de
 * rest van de map gewoon opslaan, zoals vóór de zod-retrofit. De TopBar-kleur
 * is één waarde en is streng: `#rrggbb` of `null` (= de standaard), anders 400.
 */
const AppearanceSchema = z.object({
  module_colors: z.unknown().optional(),
  budget_colors: z.unknown().optional(),
  topbar_color: z
    .string()
    .regex(HEX_RE, 'moet een kleur als #rrggbb zijn')
    .nullable()
    .optional(),
})

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

export async function PUT(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return unauthorized()

  const parsed = await parseBody(AppearanceSchema, request)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  const moduleColors = sanitizeColorMap(body.module_colors, MODULE_KEYS)
  const budgetColors = sanitizeColorMap(body.budget_colors, BUDGET_KEYS)
  const hasTopbar = body.topbar_color !== undefined
  // Lowercase vóór de upsert: de DB-check is `^#[0-9a-f]{6}$`. De standaard
  // zelf wordt null, zodat een reset een latere wijziging van de standaard volgt.
  const topbarColor = hasTopbar ? normalizeTopbarColor(body.topbar_color) : undefined

  if (!moduleColors && !budgetColors && !hasTopbar) {
    return badRequest('Geen geldige kleuren ontvangen')
  }

  const updateData: Record<string, unknown> = {
    id: user.id,
    updated_at: new Date().toISOString(),
  }
  if (moduleColors) updateData.module_colors = moduleColors
  if (budgetColors) updateData.budget_colors = budgetColors
  if (hasTopbar) updateData.topbar_color = topbarColor

  const { error } = await supabase.from('profiles').upsert(updateData)

  if (error) return serverError(error, 'appearance:PUT', 'Fout bij opslaan kleuren')

  return NextResponse.json({
    success: true,
    module_colors: moduleColors ?? null,
    budget_colors: budgetColors ?? null,
    ...(hasTopbar ? { topbar_color: topbarColor } : {}),
  })
}
