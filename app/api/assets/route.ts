import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { badRequest, serverError, unauthorized } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import {
  ASSET_AMOUNT_LIMITS,
  ASSET_RETURN_BANDS,
  PURCHASE_DATE_FUTURE_ERROR,
  assetAmountLimitError,
  assetReturnBandError,
  isPurchaseDateInFuture,
  isWithinAssetReturnBand,
} from '@/lib/asset-parameter-bands'

/**
 * POST /api/assets — een nieuwe bezitting aanmaken.
 *
 * ## Waarom deze route bestaat (bevindingen H8 + H9)
 *
 * `components/core/assets-client.tsx` maakte een bezitting aan met een
 * CLIENT-DIRECTE `supabase.from('assets').insert(row)` vanuit de browser. Dat is
 * in strijd met de datapad-conventie (ADR 0058: muteren gaat via een API-route
 * met zod), maar het had bovendien twee concrete gevolgen:
 *
 *  - **Geen tweede validatielaag.** De enige controle op een negatief bedrag was
 *    een `if` in `handleSave()`. Wie de browser-console opende — of gewoon een
 *    PostgREST-call deed met zijn eigen anon-token — schreef wat hij wilde. De
 *    RLS-policy op `assets` is eigen-rij maar KOLOM-onafhankelijk en houdt de
 *    waarde van een kolom dus niet tegen.
 *  - **Geen enkele bovengrens.** `current_value` kende geen grens in de HTML
 *    (`type="number"` zonder `max`), niet in JS en niet in de database. Vandaar
 *    "TOTALE WAARDE €1.000.000.507.699" en "Afschrijving −€150.000.000.000/jr"
 *    uit de bevinding.
 *
 * ## Wat deze route WEL en NIET doet (fase 1)
 *
 * WEL: aanmaken. De insert is het enige pad zonder na-ijlende schrijfacties —
 * de `valuations`-upsert en de `balance_snapshots`-spiegel hangen uitsluitend
 * aan het BIJWERKEN van een bestaande waarde.
 *
 * NIET: bijwerken. Een `PATCH` moet die twee side-effects meenemen én de
 * bestaande "0 rijen geraakt = niet jouw bezitting"-detectie behouden; dat is
 * bewust fase 2 (zie het IMPLEMENTATIE-blok op kaart H9). Tot die tijd loopt de
 * edit-tak nog client-direct. Voeg hier dus geen half PATCH-pad aan toe.
 *
 * De vervolgacties die al een eigen route hadden — `POST /api/assets/account-number`
 * (het IBAN-drieluik met server-only sleutel) en `POST /api/assets/toggle-budget`
 * (asset-vlag → companion → gate) — blijven waar ze zijn. Ze horen niet in deze
 * route: allebei lezen ze de zojuist weggeschreven rij vers uit de database, en
 * die volgorde is dwingend.
 *
 * ## Sleutel en scoping zijn SERVER-bepaald
 *
 * `user_id` komt uit de geverifieerde sessie, nooit uit de body. `household_id`
 * evenmin: die wordt hier opgezocht in `household_members`. Zou de client 'm
 * mogen meesturen, dan kon iemand een bezitting in het huishouden van een ander
 * hangen — en de SELECT-policy op `assets` is huishoud-verbreed, dus die rij
 * verschijnt dan op andermans scherm.
 */

const ASSET_TYPES = Object.keys(ASSET_RETURN_BANDS) as [string, ...string[]]

/** `''` uit een leeg formulierveld leest als "niet ingevuld", niet als fout. */
const optionalText = z
  .string()
  .trim()
  .max(500)
  .nullish()
  .transform((v) => (v ? v : null))

const isoDate = z
  .union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum moet de vorm JJJJ-MM-DD hebben'),
    z.literal(''),
    z.null(),
  ])
  .optional()
  .transform((v) => (v ? v : null))

/** Bedragveld met de servergrens uit `lib/asset-parameter-bands.ts`. */
function amount(field: keyof typeof ASSET_AMOUNT_LIMITS) {
  const limit = ASSET_AMOUNT_LIMITS[field]
  return z
    .number()
    .finite()
    .min(limit.min, assetAmountLimitError(field))
    .max(limit.max, assetAmountLimitError(field))
}

const CreateAssetSchema = z.object({
  name: z.string().trim().min(1, 'Naam is verplicht').max(200),
  asset_type: z.enum(ASSET_TYPES),

  // Bedragen — grenzen bewust RUIM (besluit eigenaar: optie B). De client vraagt
  // vanaf €10 mln door met een vrijheidstijd-vertaling; de server vangt alleen
  // wat onmogelijk is, zodat een legitieme UHNW-gebruiker niet hard geblokkeerd
  // wordt.
  current_value: amount('current_value'),
  purchase_value: amount('purchase_value'),
  monthly_contribution: amount('monthly_contribution'),

  // Rendement in PROCENTEN p.j. De band is per asset-type en wordt hieronder
  // in een superRefine getoetst, omdat hij van `asset_type` afhangt.
  expected_return: z.number().finite(),

  purchase_date: isoDate,
  lock_end_date: isoDate,

  institution: optionalText,
  notes: optionalText,
  subtype: optionalText,
  ticker_symbol: optionalText,
  address_postcode: optionalText,
  address_house_number: optionalText,

  risk_profile: z.enum(['laag', 'middel', 'hoog']).nullish().transform((v) => v ?? null),
  retirement_provider_type: z
    .enum(['bedrijfspensioenfonds', 'verzekeraar', 'ppi'])
    .nullish()
    .transform((v) => v ?? null),

  tax_benefit: z.boolean().nullish().transform((v) => v ?? null),
  is_liquid: z.boolean().nullish().transform((v) => v ?? null),

  rental_income: z.number().finite().min(0).max(10_000_000).nullish().transform((v) => v ?? null),
  woz_value: z.number().finite().min(0).max(100_000_000_000).nullish().transform((v) => v ?? null),
  // Lineaire afschrijving in procenten per jaar; boven 100 zou het bezit binnen
  // een jaar door nul zakken.
  depreciation_rate: z.number().finite().min(0).max(100).nullish().transform((v) => v ?? null),

  // De verkoopstrategie is een JSONB-vorm met een eigen parser
  // (`lib/sale-config.ts`); die blijft de LEESautoriteit. Hier staat de
  // SCHRIJFvorm, veld voor veld — bewust geen `.passthrough()`: die zou
  // willekeurige extra sleutels ongefilterd de JSONB-kolom in laten lopen,
  // precies wat dit schema moet voorkomen. Groeit `SaleConfig`, groei dit mee.
  sale_config: z
    .object({
      stand: z.enum(['niet_verkopen', 'vast_moment', 'wanneer_nodig']),
      triggerAge: z.number().int().min(0).max(120).nullish(),
      triggerDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
      /** Fractie, niet procent — de client rekent % → fractie vóór verzending. */
      salesCostsPct: z.number().min(0).max(1).optional(),
      payoffDebtIds: z.array(z.uuid()).max(50).optional(),
    })
    .nullish()
    .transform((v) => v ?? null),

  // `household_id` staat hier BEWUST NIET: die bepaalt de server.
  ownership: z.enum(['personal', 'shared']).default('personal'),
  net_worth_inclusion_pct: z.number().int().min(0).max(100).default(100),

  has_budget_tracking: z.boolean().default(false),
  has_holdings_tracking: z.boolean().default(false),
  has_woonbalans_tracking: z.boolean().default(false),
  has_rental_tracking: z.boolean().default(false),
}).superRefine((data, ctx) => {
  // Rendementsband — per type, want 'vehicle' MOET negatief kunnen (afschrijving)
  // en 'savings' mag geen 50% beloven. Dit is de check die de gemelde 665,5%
  // (H1/H7) tegenhoudt.
  if (!isWithinAssetReturnBand(data.asset_type, data.expected_return)) {
    ctx.addIssue({
      code: 'custom',
      path: ['expected_return'],
      message: assetReturnBandError(data.asset_type),
    })
  }
  // Een aankoopdatum in de toekomst is onmogelijk en werkt door in de
  // afschrijvings- en rendementsberekening. Server-side, want een `max`-attribuut
  // op het datumveld is een suggestie, geen grens.
  if (data.purchase_date && isPurchaseDateInFuture(data.purchase_date)) {
    ctx.addIssue({ code: 'custom', path: ['purchase_date'], message: PURCHASE_DATE_FUTURE_ERROR })
  }
})

export async function POST(req: Request) {
  try {
    // Anon RLS-client mét de sessie van de aanroeper — nooit service-role.
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return unauthorized()

    const parsed = await parseBody(CreateAssetSchema, req)
    if (!parsed.ok) return parsed.response
    const body = parsed.data

    // Huishoud-scoping server-bepaald. Wie 'shared' vraagt zonder huishouden
    // krijgt geen stille degradatie naar 'personal': dat zou een bezitting
    // privé maken terwijl het scherm "gedeeld" toont.
    let householdId: string | null = null
    if (body.ownership === 'shared') {
      const { data: member, error: memberError } = await supabase
        .from('household_members')
        .select('household_id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (memberError) return serverError(memberError, 'assets:POST:household')
      householdId = member?.household_id ?? null
      if (!householdId) {
        return badRequest('Je hebt nog geen huishouden om deze bezitting mee te delen')
      }
    }

    const row = {
      user_id: user.id,
      name: body.name,
      asset_type: body.asset_type,
      current_value: body.current_value,
      purchase_value: body.purchase_value,
      purchase_date: body.purchase_date,
      expected_return: body.expected_return,
      monthly_contribution: body.monthly_contribution,
      institution: body.institution,
      notes: body.notes,
      subtype: body.subtype,
      risk_profile: body.risk_profile,
      tax_benefit: body.tax_benefit,
      is_liquid: body.is_liquid,
      lock_end_date: body.lock_end_date,
      ticker_symbol: body.ticker_symbol,
      rental_income: body.rental_income,
      woz_value: body.woz_value,
      retirement_provider_type: body.retirement_provider_type,
      depreciation_rate: body.depreciation_rate,
      address_postcode: body.address_postcode,
      address_house_number: body.address_house_number,
      sale_config: body.sale_config,
      ownership: body.ownership,
      household_id: householdId,
      net_worth_inclusion_pct: body.net_worth_inclusion_pct,
      has_budget_tracking: body.has_budget_tracking,
      has_holdings_tracking: body.has_holdings_tracking,
      has_woonbalans_tracking: body.has_woonbalans_tracking,
      has_rental_tracking: body.has_rental_tracking,
      is_active: true,
    }

    const { data: inserted, error } = await supabase
      .from('assets')
      .insert(row)
      .select('id')
      .single()

    // Een geschonden CHECK-constraint (23514) is invoer, geen serverfout: dat
    // hoort als 400 terug te komen, niet als "er ging iets mis". De tekst blijft
    // van ons — de rauwe Postgres-melding gaat nooit naar de client.
    if (error) {
      if ((error as { code?: string }).code === '23514') {
        console.error('[assets:POST] CHECK-constraint geweigerd:', error.message)
        return badRequest('Een van de ingevoerde waarden valt buiten het toegestane bereik')
      }
      return serverError(error, 'assets:POST')
    }

    return NextResponse.json({ id: inserted.id }, { status: 201 })
  } catch (err) {
    return serverError(err, 'assets:POST')
  }
}
