import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { badRequest, notFound, serverError, unauthorized } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { SALE_CONFIG_ASSET_TYPES } from '@/lib/asset-data'
import { isUuid } from '@/lib/unlinked-cash'
import { getHouseholdIdForUser, selectAflosbareSchulden } from '@/lib/sale-config-debts'

/**
 * PATCH /api/assets/[id]/sale-config — alleen de verkoopinstelling (`assets.sale_config`)
 * van één eigen, niet-liquide bezitting (TPR-15, stap 4 van de plan-review).
 *
 * ## Waarom een eigen, smalle route
 *
 * Het bezittingenformulier schrijft `sale_config` mee in een client-directe update van de
 * hele rij (grandfathered, ADR 0058). De plan-review wil alleen deze ene instelling
 * wijzigen, zonder de rest van de rij te kennen of te herschrijven. Een generieke
 * PATCH-met-kolomset zou een tweede, open schrijfpad op `assets` openen; deze route
 * schrijft uitsluitend `sale_config`, met een gesloten schema.
 *
 * ## Autorisatie — dezelfde vorm als `app/api/assets/[id]/route.ts`
 *
 * Anon RLS-client mét sessie (nooit service-role), `.eq('user_id', user.id)` en
 * `.select('id')` + 404 bij 0 geraakte rijen. De SELECT-policy op `assets` is
 * huishoud-gedeeld, de UPDATE-policy strikt eigen-rij: zonder de select zou een write op
 * de rij van de partner een stille "succes" opleveren. Het id-vormfilter en de 404 op een
 * vreemd id spiegelen die route (geen bestaans-orakel).
 *
 * ## Welke bezittingen
 *
 * Alleen de typen waarvoor het formulier de verkoopinstelling toont (`ASSET_TYPE_FIELDS`
 * met `'sale_config'`): één bron, dus een type dat daar verdwijnt kan hier niet meer
 * geschreven worden. Het eigen huis heeft zijn eigen woonstrategie
 * (`/api/housing-strategy`) en valt er per constructie buiten. Het typefilter zit in de
 * update zelf, zodat er geen lees-dan-schrijf-race is.
 *
 * ## Aflossen bij verkoop
 *
 * `payoffDebtIds` moeten schulden zijn die de gebruiker mag aanwijzen: eigen schulden en
 * gedeelde schulden binnen het eigen huishouden — dezelfde set die het bezittingenformulier
 * aanbiedt (`lib/sale-config-debts.ts`), zodat deze route geen config weigert die het
 * formulier opsloeg. De kern koppelt op id; een vreemd id zou niets aflossen, maar opslaan
 * zou wel een verwijzing naar andermans rij bewaren. Daarom een controle vóór de write, met
 * de scope expliciet in de query. Inactieve schulden tellen mee: een eerder opgeslagen
 * config moet opnieuw op te slaan zijn nadat een schuld is afgelost.
 */

const leeftijd = z.number().positive().max(120)
const datum = z.iso.date()
/** Zelfde bereik als `parseSaleConfig` accepteert; daarbuiten zou de parser 'm stil laten vallen. */
const kosten = z.number().min(0).max(0.2)
const schuldIds = z.array(z.string().refine(isUuid, 'Ongeldige schuld')).max(50)

const SaleConfigSchema = z
  .discriminatedUnion('stand', [
    z.object({ stand: z.literal('niet_verkopen') }).strict(),
    z
      .object({
        stand: z.literal('vast_moment'),
        triggerAge: leeftijd.nullable().optional(),
        triggerDate: datum.nullable().optional(),
        salesCostsPct: kosten.optional(),
        payoffDebtIds: schuldIds.optional(),
      })
      .strict(),
    z
      .object({
        stand: z.literal('wanneer_nodig'),
        triggerAge: leeftijd.nullable().optional(),
        salesCostsPct: kosten.optional(),
        payoffDebtIds: schuldIds.optional(),
      })
      .strict(),
  ])
  .refine((c) => c.stand !== 'vast_moment' || c.triggerAge != null || c.triggerDate != null, {
    message: 'Kies een leeftijd of datum voor de verkoop',
  })

const BodySchema = z.object({ sale_config: SaleConfigSchema }).strict()

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Anon RLS-client mét de sessie van de aanroeper — nooit service-role.
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return unauthorized()

    const { id } = await params
    if (!isUuid(id)) return notFound('Bezitting niet gevonden')

    const parsed = await parseBody(BodySchema, req)
    if (!parsed.ok) return parsed.response
    const saleConfig = parsed.data.sale_config

    const ids = saleConfig.stand === 'niet_verkopen' ? [] : [...new Set(saleConfig.payoffDebtIds ?? [])]
    if (ids.length > 0) {
      const householdId = await getHouseholdIdForUser(supabase, user.id)
      const { data: toegestaan, error: debtError } = await selectAflosbareSchulden(supabase, user.id, householdId).in(
        'id',
        ids,
      )
      if (debtError) return serverError(debtError, 'assets:sale-config:PATCH:debts')
      if ((toegestaan ?? []).length !== ids.length) return badRequest('Onbekende schuld bij aflossen')
    }

    const { data, error } = await supabase
      .from('assets')
      .update({ sale_config: saleConfig })
      .eq('id', id)
      .eq('user_id', user.id)
      .in('asset_type', [...SALE_CONFIG_ASSET_TYPES])
      .select('id')
      .maybeSingle()

    if (error) return serverError(error, 'assets:sale-config:PATCH:update')
    // 0 rijen = niet van deze gebruiker, bestaat niet, of geen type met een verkoopinstelling.
    if (!data) return notFound('Bezitting niet gevonden')

    return NextResponse.json({ id: data.id, sale_config: saleConfig })
  } catch (err) {
    return serverError(err, 'assets:sale-config:PATCH')
  }
}
