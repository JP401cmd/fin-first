import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { serverError, unauthorized } from '@/lib/api/respond'
import { computeHorizonFireSim } from '@/lib/fire-target-shared'
import { buildClientRegelSimSnapshot } from '@/lib/future/regel-sim-snapshot'
import { buildPotBalances } from '@/lib/future/pot-balances'
import { loadHorizonRaw } from '@/lib/horizon/raw-data-loader'
import { resolvePotRules } from '@/lib/pot-rules'
import { SALE_CONFIG_ASSET_TYPES, type AssetType } from '@/lib/asset-data'
import { resolveFireParams } from '@/lib/fire-params'
import { getHouseholdIdForUser, selectAflosbareSchulden } from '@/lib/sale-config-debts'
import { loadEigenStrategieEvents } from '@/lib/plan-review/eigen-strategie-events'
import { AOW_LEEFTIJD_KOLOMMEN, strategieEditorBasis } from '@/lib/horizon/strategie-editor-basis'
import type { AowLeeftijdRow } from '@/lib/aow-leeftijd'
import type {
  PlanReviewEditorContext,
  PlanReviewInkomstenContext,
  PlanReviewLaag2Context,
  PlanReviewVastBezit,
  PlanReviewWoningContext,
} from '@/lib/plan-review/editor-context'

/**
 * GET /api/plan-review/editor-context — wat de inline editors van de plan-review nodig
 * hebben (TPR-15, ADR 0142).
 *
 * Lui gelezen (ADR 0058: on-demand client-read via een API-route): pas wanneer de gebruiker
 * in de wizard op "Aanpassen" drukt. /toekomst laadt de snapshot bewust niet in zijn eigen
 * render; die zware data leeft op de subpagina's.
 *
 * De snapshot is DEZELFDE die de Voorkeuren-pagina als prop krijgt, via dezelfde bouwer
 * (`buildClientRegelSimSnapshot`): de canonieke Tijdas-run (personal perspectief), zonder
 * partnerblok en zonder `*_encrypted`/`*_hash`. De editor-baseline is zo per constructie de
 * getoonde curve (consume, don't recompute).
 *
 * Stap 4 leest het vaste bezit met een EXPLICIETE kolomlijst en een expliciete
 * `.eq('user_id', …)`: de SELECT-policy op `assets` is huishoud-gedeeld, en de schrijfroute
 * (`PATCH /api/assets/[id]/sale-config`) wijzigt alleen eigen rijen. Een rij van de partner
 * hier tonen zou een instelling aanbieden die niet op te slaan is. De schulden voor
 * "Aflossen bij verkoop" volgen de regel van het formulier (eigen + gedeeld in het
 * huishouden), met de scope expliciet in de query (`lib/sale-config-debts.ts`).
 *
 * `snapshot: null` = er is geen run (geen geboortedatum of vermogen) — de editors tonen dan
 * geen live effect, opslaan blijft mogelijk.
 */

const VAST_BEZIT_KOLOMMEN = 'id, name, asset_type, current_value, sale_config'

async function loadWoning(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  raw: Awaited<ReturnType<typeof loadHorizonRaw>>,
): Promise<PlanReviewWoningContext> {
  // Zonder leesbaar huishouden: alleen eigen schulden in de lijst (fail-closed). Eerder
  // opgeslagen gedeelde id's blijven in het concept staan; de schrijfroute toetst ze zelf.
  const householdId = await getHouseholdIdForUser(supabase, userId).catch((err: unknown) => {
    console.error('[plan-review:editor-context:household]', err)
    return null
  })
  const [bezit, schulden] = await Promise.all([
    supabase
      .from('assets')
      .select(VAST_BEZIT_KOLOMMEN)
      .eq('user_id', userId)
      .eq('is_active', true)
      .in('asset_type', [...SALE_CONFIG_ASSET_TYPES])
      .order('name', { ascending: true }),
    // Dezelfde set als het formulier en de schrijfroute: eigen + gedeeld in het huishouden.
    selectAflosbareSchulden(supabase, userId, householdId).eq('is_active', true).order('name', { ascending: true }),
  ])
  if (bezit.error) throw bezit.error
  if (schulden.error) throw schulden.error
  const housing = (raw.rawProfile as { housing_strategy_config?: unknown } | null)?.housing_strategy_config
  return {
    // Hetzelfde feit als `derivePlanReviewFacts` (progress.ts): een actieve eigen woning.
    heeftEigenHuis: raw.assets.some((a) => a.asset_type === 'eigen_huis' && a.is_active !== false),
    woonstrategieIngesteld: housing != null && typeof housing === 'object',
    vastBezit: ((bezit.data ?? []) as PlanReviewVastBezit[]).map((a) => ({
      ...a,
      current_value: Number(a.current_value) || 0,
    })),
    schulden: (schulden.data ?? []) as { id: string; name: string }[],
  }
}

/**
 * Stap 3 — de eigen AOW/werk/pensioen-rijen (expliciete `user_id`-lezing: de policy is
 * huishoud-gedeeld) en de formulierbasis van /toekomst/voorkeuren (`strategieEditorBasis`),
 * zodat het formulier in de wizard dezelfde prefill en leeftijd toont.
 */
async function loadInkomsten(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  raw: Awaited<ReturnType<typeof loadHorizonRaw>>,
): Promise<PlanReviewInkomstenContext> {
  const [events, aowRes] = await Promise.all([
    loadEigenStrategieEvents(supabase, userId),
    supabase.from('aow_leeftijd').select(AOW_LEEFTIJD_KOLOMMEN).order('birth_date_from', { ascending: true }),
  ])
  if (aowRes.error) throw aowRes.error
  return {
    aow: events.find((e) => e.event_type === 'aow') ?? null,
    werk: events.find((e) => e.event_type === 'werk') ?? null,
    pensioenen: events.filter((e) => e.event_type === 'pension'),
    aowRows: (aowRes.data ?? []) as AowLeeftijdRow[],
    basis: strategieEditorBasis(raw),
  }
}

/**
 * Laag 2 — de aannames zoals de kern er nu mee rekent (`resolveFireParams` op de al
 * geshadowde profielrij, dezelfde resolver als de adapter en de Voorkeuren-kaarten) en de
 * EIGEN actieve bezittingen met hun rendement. Expliciete kolomlijst en `.eq('user_id', …)`:
 * de SELECT-policy op `assets` is huishoud-gedeeld, en `PATCH /api/assets/[id]/expected-return`
 * wijzigt alleen eigen rijen.
 */
const LAAG2_BEZIT_KOLOMMEN = 'id, name, asset_type, expected_return, depreciation_rate'

async function loadLaag2(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  raw: Awaited<ReturnType<typeof loadHorizonRaw>>,
): Promise<PlanReviewLaag2Context> {
  const { data, error } = await supabase
    .from('assets')
    .select(LAAG2_BEZIT_KOLOMMEN)
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('name', { ascending: true })
  if (error) throw error
  const profiel = raw.rawProfile ?? {}
  const params = resolveFireParams(profiel)
  const rijen = (data ?? []) as {
    id: string
    name: string
    asset_type: AssetType
    expected_return: number | string | null
    depreciation_rate: number | string | null
  }[]
  return {
    inflationRate: params.inflationRate,
    terugvalRendement: params.grossReturn,
    box3Method: params.box3Method,
    box3HeffingvrijInkomen: (profiel as { box3_heffingvrij_inkomen?: number | null }).box3_heffingvrij_inkomen ?? null,
    bezittingen: rijen.map((a) => ({
      id: a.id,
      name: a.name,
      asset_type: a.asset_type,
      expected_return: Number(a.expected_return) || 0,
      afschrijvend: Number(a.depreciation_rate) > 0,
    })),
    // Over de eigen-rij-lezing, niet over `raw.assets` (huishoud-gedeelde SELECT): lijst en zin
    // delen zo één grondslag, en er telt nooit een partnerrij mee (security-gate 13 sep 2026).
    zonderEigenRendement: rijen.filter((a) => a.expected_return == null).length,
  }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const user = await getCachedUser(supabase)
    if (!user) return unauthorized()

    const [shared, raw] = await Promise.all([computeHorizonFireSim(supabase), loadHorizonRaw(supabase)])
    const body: PlanReviewEditorContext = {
      snapshot: shared ? buildClientRegelSimSnapshot(shared) : null,
      firePlan: shared?.firePlan ?? null,
      // Stap 5 — dezelfde lezingen als /toekomst/voorkeuren (resolvePotRules op de profielrij,
      // buildPotBalances op de bundelrijen): één bron voor Voorkeuren en wizard.
      potRules: resolvePotRules((raw.rawProfile ?? {}) as { pot_rules?: unknown }),
      potBalances: buildPotBalances(raw.assets, raw.unlinkedCash),
      // Een fout in stap 4 mag de editors van de andere stappen niet meenemen: `woning: null`
      // en de woning-editor zegt dat zijn gegevens niet geladen konden worden.
      woning: await loadWoning(supabase, user.id, raw).catch((err: unknown) => {
        console.error('[plan-review:editor-context:woning]', err)
        return null
      }),
      inkomsten: await loadInkomsten(supabase, user.id, raw).catch((err: unknown) => {
        console.error('[plan-review:editor-context:inkomsten]', err)
        return null
      }),
      laag2: await loadLaag2(supabase, user.id, raw).catch((err: unknown) => {
        console.error('[plan-review:editor-context:laag2]', err)
        return null
      }),
    }
    return NextResponse.json(body)
  } catch (err) {
    return serverError(err, 'plan-review:editor-context:GET')
  }
}
