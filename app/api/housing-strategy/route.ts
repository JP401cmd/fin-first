import { z } from 'zod'
import { NextRequest, NextResponse } from 'next/server'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { badRequest, serverError, unauthorized } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import {
  parseHousingStrategy,
  deriveHousingContext,
  DEFAULT_HOUSING_STRATEGY,
  type HousingStrategyConfig,
} from '@/lib/housing-strategy'
import {
  housingChoiceFromConfig,
  housingChoiceToConfig,
  type HousingChoice,
} from '@/lib/housing-choice'
import { ASSET_CLIENT_COLUMNS, type Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'

/**
 * De eigen-woning-strategie: lezen + schrijven van `profiles.housing_strategy_config`.
 *
 * Twee fronten op dezelfde route (ADR 0131):
 *   - EXPERT  — de strategie-modal op /toekomst stuurt/ontvangt een volledige
 *               `HousingStrategyConfig` (vier modi, met parameters).
 *   - BEGINNER— de quick-add-wizard bij een `eigen_huis` en de onboarding sturen
 *               alleen `choice: 'sell' | 'exclude'`; `lib/housing-choice.ts` is de
 *               ENIGE plek waar die keuze een config wordt.
 *
 * ── Scoping-semantiek (bewuste keuze, lees dit vóór je hier iets wijzigt) ─────
 *
 * `housing_strategy_config` staat PER PROFIEL (`profiles`, eigen rij, RLS
 * `auth.uid() = id`). De woning zelf staat in `assets`, en de SELECT-policy daar
 * is HUISHOUD-GEDEELD:
 *
 *     (auth.uid() = user_id)
 *     OR (ownership = 'shared' AND household_id = user_household_id())
 *
 * (live geverifieerd in `pg_policies`, 5 sep 2026; `debts` heeft exact dezelfde
 * vorm). RLS scopet hier dus NIET op de gebruiker — een `select()` zonder
 * expliciete `user_id`-filter levert óók de gedeelde rijen van de partner.
 *
 * Deze route scopet daarom ZELF op `user_id = <eigen id>`. Twee redenen:
 *
 *   1. Correctheid. De vraag die dit oppervlak stelt is "telt JOUW woning mee
 *      voor JOUW vrijheid", en het antwoord landt op JOUW profielrij. Een
 *      huishoudrij van de partner zou die per-profiel-instelling laten
 *      aanslaan op andermans bezit: de wizard zou de vraag stellen aan iemand
 *      zonder woning, en de "heb ik een woning"-vlag zou omslaan zodra de
 *      partner er één toevoegt.
 *   2. Privacy. De context-velden hieronder zijn BEDRAGEN (marktwaarde, WOZ,
 *      hypotheeksaldo, maandlast, overwaarde). Deze route is geen
 *      perspectief-loader en raadpleegt `privacy_settings` niet; zonder eigen
 *      scoping is dit een tweede pad langs de privacy-bewuste loaders — precies
 *      het patroon dat het S5-incident opleverde. Alle bedragen in de response
 *      zijn nu per constructie van de vragende gebruiker zelf.
 *
 * Gevolg dat je moet KENNEN: heeft alleen de partner een (gedeelde) woning, dan
 * zegt deze route `has_eigen_huis: false` voor deze gebruiker, terwijl de
 * horizon-loader die woning via de gedeelde fetcher (`getActiveAssets`, géén
 * user-filter) wél in zijn eigen housing-context meeneemt. Dat is een bestaand
 * verschil in die loader, geen nieuwe divergentie hier — en op de
 * productiestand (5 sep 2026: 0 huishoud-gedeelde woningen, 0 gebruikers met
 * meer dan één woning) is het latent. De keuze blijft: dit oppervlak liegt niet
 * over andermans bezit.
 *
 * Kolomregel (CLAUDE.md): `assets` draagt `account_number_encrypted` (ciphertext)
 * en `account_number_hash` (blind index onder een server-only sleutel = stabiele
 * correlatiesleutel). Nooit `select('*')` hier; `ASSET_CLIENT_COLUMNS` is de
 * canonieke, test-bewaakte lijst. `debts` heeft geen crypto-kolommen maar wel
 * vrije tekst (`creditor`, `notes`) die dit oppervlak niet nodig heeft — vandaar
 * ook daar een expliciete kolomlijst.
 */

/**
 * De debt-kolommen die `deriveHousingContext` daadwerkelijk leest
 * (hypotheek-herkenning + saldo/maandlast-aggregatie). Bewust één literal en
 * geen `join()`: de PostgREST-typings van supabase-js parsen het
 * `select()`-argument op TYPE-niveau; een `string` valt terug op
 * `GenericStringError`.
 */
const HOUSING_DEBT_COLUMNS =
  'id, user_id, name, debt_type, current_balance, monthly_payment, interest_rate, end_date, is_active, linked_asset_id, net_worth_inclusion_pct, ownership, household_id'

// ── GET — Lees housing strategy uit profiles ─────────────────────────

export async function GET() {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)

  if (!claims) return unauthorized()

  const userId = claims.sub

  // Parallel: profile-config + EIGEN assets + EIGEN debts (voor context-aware UI
  // hints). De `.eq('user_id', userId)` is hier de scoping — niet RLS; zie de
  // module-toelichting hierboven.
  const [{ data: profileData, error: profileErr }, assetsRes, debtsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('housing_strategy_config, housing_strategy_dismissed_at')
      .eq('id', userId)
      .single(),
    supabase
      .from('assets')
      .select(ASSET_CLIENT_COLUMNS)
      .eq('user_id', userId)
      .eq('is_active', true),
    supabase
      .from('debts')
      .select(HOUSING_DEBT_COLUMNS)
      .eq('user_id', userId)
      .eq('is_active', true),
  ])

  // Een profielfout is GEEN harde fout: een verse gebruiker heeft nog geen rij
  // en hoort de default-strategie te zien. Assets/debts wél — een leeslek daar
  // zou stil `has_eigen_huis: false` opleveren, waarmee de wizard de vraag
  // onterecht overslaat ("geslaagd" antwoord op een niet-uitgevoerde lezing).
  if (assetsRes.error) return serverError(assetsRes.error, 'housing-strategy:GET')
  if (debtsRes.error) return serverError(debtsRes.error, 'housing-strategy:GET')

  let config: HousingStrategyConfig = DEFAULT_HOUSING_STRATEGY
  let dismissedAt: string | null = null
  if (!profileErr && profileData) {
    config = parseHousingStrategy(
      (profileData as Record<string, unknown>).housing_strategy_config,
    )
    dismissedAt =
      ((profileData as Record<string, unknown>).housing_strategy_dismissed_at as string | null) ??
      null
  }

  const context = deriveHousingContext(
    (assetsRes.data ?? []) as unknown as Asset[],
    (debtsRes.data ?? []) as unknown as Debt[],
  )
  const estimatedEquity = Math.max(0, context.eigenHuisValue - context.mortgageBalance)

  return NextResponse.json({
    config,
    // De beginners-lezing van dezelfde config. `null` = de vraag is nog niet
    // beantwoord (`include_full` is de DB-default, niet te onderscheiden van
    // een keuze die nooit gemaakt is) — zie `housingChoiceFromConfig`.
    choice: housingChoiceFromConfig(config),
    // Top-level relevantie-vlag voor de quick-add-wizard: is deze vraag voor
    // DEZE gebruiker überhaupt van toepassing? Spiegelt `context.has_eigen_huis`;
    // de wizard hoeft de bedrag-context daarmee niet te lezen.
    has_eigen_huis: context.hasEigenHuis,
    dismissed_at: dismissedAt,
    // Bedragen: uitsluitend eigen rijen (zie scoping-toelichting). Bewust geen
    // asset-id's, namen, adressen of rekeningnummers — de expert-modal toont
    // alleen WOZ en overwaarde, de wizard leest hier niets van.
    context: {
      has_eigen_huis: context.hasEigenHuis,
      eigen_huis_value: context.eigenHuisValue,
      woz_value: context.wozValue,
      mortgage_balance: context.mortgageBalance,
      mortgage_monthly_payment: context.mortgageMonthlyPayment,
      estimated_equity: estimatedEquity,
    },
  })
}

// ── PUT — Sla housing strategy op in profiles ────────────────────────

/**
 * Buitenste vorm van de request-body (ADR 0044: zod op mutatie-routes).
 * `config` blijft bewust `unknown`: de discriminated union met vier modi en hun
 * parameters wordt daarna door `validateConfig` gecontroleerd, die per veld een
 * begrijpelijke Nederlandse foutmelding geeft. `z.object` STRIPT onbekende
 * sleutels — een meegestuurde `id` of `user_id` kan dus nooit het schrijfpad in.
 */
const PutSchema = z.object({
  config: z.unknown().optional(),
  choice: z.enum(['sell', 'exclude']).optional(),
  mark_dismissed: z.boolean().optional(),
})

/**
 * Validate en normaliseer ingaande config. Wijst onbekende velden af door
 * via parseHousingStrategy te lopen — dat retourneert altijd een geldige
 * config of de default. Onbekende modes vallen daardoor terug op include_full.
 */
function validateConfig(raw: unknown): HousingStrategyConfig | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'config moet een object zijn' }
  const obj = raw as Record<string, unknown>
  if (typeof obj.mode !== 'string') return { error: 'config.mode is verplicht' }

  // Range-checks voordat we parseren — voorkomt dat onzin-waardes silently
  // gefixed worden naar defaults zonder dat de gebruiker het weet.
  if (obj.mode === 'downsize' || obj.mode === 'reverse_mortgage') {
    if (obj.trigger !== 'fixed_age' && obj.trigger !== 'on_depletion') {
      return { error: 'trigger moet "fixed_age" of "on_depletion" zijn' }
    }
    const triggerAge = Number(obj.triggerAge)
    if (!Number.isFinite(triggerAge) || triggerAge < 18 || triggerAge > 110) {
      return { error: 'triggerAge moet tussen 18 en 110 liggen' }
    }
    const dt = Number(obj.depletionThresholdYears)
    if (!Number.isFinite(dt) || dt < 0 || dt > 20) {
      return { error: 'depletionThresholdYears moet tussen 0 en 20 liggen' }
    }
    // V8: optionele fallbackAge (camelCase; snake tolerant) — uiterste leeftijd voor
    // de "wanneer nodig"-trigger. Alleen valideren wanneer aanwezig.
    const rawFallback = obj.fallbackAge ?? obj.fallback_age
    if (rawFallback != null) {
      const fa = Number(rawFallback)
      if (!Number.isFinite(fa) || fa < 18 || fa > 110) {
        return { error: 'fallbackAge moet tussen 18 en 110 liggen' }
      }
    }
  }

  if (obj.mode === 'downsize') {
    const sp = Number(obj.salePricePct)
    if (!Number.isFinite(sp) || sp < 0.5 || sp > 1.5) {
      return { error: 'salePricePct moet tussen 0.5 en 1.5 liggen' }
    }
    const sc = Number(obj.salesCostsPct)
    if (!Number.isFinite(sc) || sc < 0 || sc > 0.2) {
      return { error: 'salesCostsPct moet tussen 0 en 0.2 liggen' }
    }
    if (obj.newMonthlyHousingCost != null) {
      const nmh = Number(obj.newMonthlyHousingCost)
      if (!Number.isFinite(nmh) || nmh < 0 || nmh > 20_000) {
        return { error: 'newMonthlyHousingCost moet tussen 0 en 20.000 liggen' }
      }
    }
  }

  if (obj.mode === 'reverse_mortgage') {
    const ml = Number(obj.maxLoanPct)
    if (!Number.isFinite(ml) || ml < 0.1 || ml > 0.8) {
      return { error: 'maxLoanPct moet tussen 0.10 en 0.80 liggen' }
    }
    const ir = Number(obj.interestRate)
    if (!Number.isFinite(ir) || ir < 0 || ir > 0.15) {
      return { error: 'interestRate moet tussen 0 en 0.15 liggen' }
    }
    if (obj.monthlyPayout != null) {
      const mp = Number(obj.monthlyPayout)
      if (!Number.isFinite(mp) || mp < 0 || mp > 20_000) {
        return { error: 'monthlyPayout moet tussen 0 en 20.000 liggen' }
      }
    }
  }

  return parseHousingStrategy(raw)
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  // Schrijfpad → `getUser()` (verse, geverifieerde identiteit), niet getClaims.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return unauthorized()

  const parsed = await parseBody(PutSchema, request)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  // Twee fronten op één veld: nooit allebei tegelijk, anders is niet te zeggen
  // welke van de twee de gebruiker bedoelde en welke een stale client-state is.
  if (body.config !== undefined && body.choice !== undefined) {
    return badRequest('Stuur óf config óf choice, niet beide')
  }

  const updateData: Record<string, unknown> = {
    id: user.id,
    updated_at: new Date().toISOString(),
  }
  let nextConfig: HousingStrategyConfig | null = null

  if (body.config !== undefined) {
    const validated = validateConfig(body.config)
    if ('error' in validated) return badRequest(validated.error)
    nextConfig = validated
  } else if (body.choice !== undefined) {
    // `housingChoiceToConfig` is de enige plek waar de beginnerskeuze een
    // config wordt (ADR 0131) — hier dus geen eigen literal.
    nextConfig = housingChoiceToConfig(body.choice as HousingChoice)
  }

  if (nextConfig) updateData.housing_strategy_config = nextConfig

  let dismissedAt: string | null = null
  if (body.mark_dismissed === true) {
    dismissedAt = new Date().toISOString()
    updateData.housing_strategy_dismissed_at = dismissedAt
  }

  if (nextConfig === null && dismissedAt === null) {
    return badRequest('Niets om op te slaan')
  }

  // Eigen-rij upsert via de anon RLS-client (nooit service-role). De ALL-policy
  // op `profiles` is `auth.uid() = id` zonder aparte WITH CHECK; Postgres
  // gebruikt USING dan óók als post-write check, dus de rij kan niet op een
  // andere eigenaar gezet worden. `id` komt uit `user.id`, nooit uit de body.
  const { error } = await supabase.from('profiles').upsert(updateData)
  if (error) return serverError(error, 'housing-strategy:PUT')

  // Bewust NIET `...updateData` terugspiegelen: dat echode de user-id en
  // interne kolomnamen terug. De client krijgt wat hij nodig heeft.
  return NextResponse.json({
    success: true,
    config: nextConfig,
    choice: nextConfig ? housingChoiceFromConfig(nextConfig) : null,
    dismissed_at: dismissedAt,
  })
}
