import { NextResponse } from 'next/server'
import { z } from 'zod'
import { unauthorized, forbidden, notFound, serverError } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'
import { isSuperAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/admin-audit'
import { validateModules } from '@/lib/module-registry'
import { PRODUCTS, PRODUCT_PRESETS } from '@/lib/modules/resolve'

/**
 * POST /api/admin/users/product — beheer zet het product van een account om
 * (Krant 2D fase 1, besluit B12).
 *
 * Waarom een beheer-actie: omhoog (Krant → Geheel) doet de lezer zelf via
 * /krant/meer (`PUT /api/modules`). Terug naar alleen de Krant heeft bewust
 * géén knop voor de lezer (B12) — dat loopt via support, en support heeft deze
 * route nodig om het te kunnen.
 *
 * Body: `{ userId: uuid, product: 'krant' | 'geheel' }` (strikt: een extra veld
 * is een 400). De preset komt uit `PRODUCT_PRESETS` (lib/modules/resolve.ts) —
 * dezelfde bron als `PUT /api/modules`, geen tweede definitie.
 *
 * ER WORDT NIETS GEWIST. Alleen `profiles.active_modules` en
 * `profiles.home_screen` veranderen; bezittingen, budgetten, transacties en het
 * nieuwsprofiel blijven staan. Geborgd in route.test.ts (de mock-chain kent
 * geen delete, en een bron-scan weigert elke delete-, insert- of
 * upsert-aanroep in dit bestand).
 *
 * GEEN INHOUD (ADR 0146): de route leest van `profiles` alleen `id` en
 * `full_name` (bestaanscontrole + label voor het auditlog). De huidige
 * moduleset leest hij bewust níét — `active_modules` staat niet op de
 * beheer-kolomlijst van `lib/beheer/geen-inhoud.test.ts`, en een "van → naar"
 * in het log is die verruiming niet waard. Het log legt daarom alleen het doel
 * vast.
 *
 * Service-role alleen voor de schrijfactie op een ándere rij dan de eigen —
 * achter de superadmin-poort, net als `app/api/admin/users/role`.
 *
 * TODO(Krant 2C): zodra 2C het `'identity'`-signaal schrijft, zet de weg omhoog
 * (`PUT /api/modules` met 'geheel') `onboarding_completed` terug op false voor
 * een account dat de Geheel-onboarding nooit deed (besluit eigenaar 29 sep,
 * keuze 1). Of deze beheer-route dat óók doet, is een 2C-vraag; fase 1 raakt de
 * onboarding-status niet.
 */

const ProductBodySchema = z.strictObject({
  userId: z.uuid(),
  product: z.enum(PRODUCTS),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user: adminUser },
  } = await supabase.auth.getUser()
  if (!adminUser) return unauthorized()
  if (!(await isSuperAdmin(supabase))) return forbidden()

  const parsed = await parseBody(ProductBodySchema, req)
  if (!parsed.ok) return parsed.response
  const { userId, product } = parsed.data

  const preset = PRODUCT_PRESETS[product]
  const modules = [...preset.modules]
  const check = validateModules(modules)
  if (!check.valid) {
    return serverError(
      new Error(`Ongeldige preset '${product}': ${check.errors.join(' ')}`),
      'admin-users-product:POST',
    )
  }

  const service = getServiceClient()

  const { data: target, error: readError } = await service
    .from('profiles')
    .select('id, full_name')
    .eq('id', userId)
    .maybeSingle()
  if (readError) return serverError(readError, 'admin-users-product:POST')
  if (!target) return notFound()

  const { error } = await service
    .from('profiles')
    .update({ active_modules: modules, home_screen: preset.homeScreen })
    .eq('id', userId)
  if (error) return serverError(error, 'admin-users-product:POST')

  await logAdminAction(service, {
    actorId: adminUser.id,
    actorEmail: adminUser.email,
    action: 'user.product',
    targetUser: userId,
    targetLabel: (target.full_name as string | null) ?? userId,
    detail: { to: product },
  })

  return NextResponse.json({ ok: true, product, modules, homeScreen: preset.homeScreen })
}
