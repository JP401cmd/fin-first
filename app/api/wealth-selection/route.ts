import { NextResponse } from 'next/server'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { parseBody } from '@/lib/api/parse-body'
import { serverError, unauthorized } from '@/lib/api/respond'
import {
  WEALTH_SELECTION_PREF_KEY,
  WealthSelectionBodySchema,
  parseWealthSelection,
  weightedAssetValue,
  weightedDebtValue,
  type WealthSelection,
} from '@/lib/wealth-selection'

/**
 * /api/wealth-selection — de selectie achter de vermogens-widget (ADR 0120).
 *
 * GET  → de opgeslagen selectie + de keuzelijst voor de bewerk-sheet.
 * PUT  → schrijft een nieuwe selectie (read-modify-write op één pref-sleutel).
 *
 * ── PERSOONLIJK PERSPECTIEF, EXPLICIET (ADR 0120 besluit 4) ────────────────
 * De SELECT-policy op `assets` is HUISHOUD-GEDEELD: een `.select()` zonder
 * eigen filter levert óók de bezittingen van de partner. Deze widget is
 * persoonlijk (de historie uit `balance_snapshots` kent geen huishoud-model),
 * dus beide queries filteren HARD op `user_id = claims.sub`. Dat filter is
 * geen dubbelop van RLS maar de enige scoping die er hier is — haal 'm nooit
 * weg "omdat RLS het al doet".
 *
 * ── KOLOMMEN ──────────────────────────────────────────────────────────────
 * Expliciete kolomlijsten, geen `select('*')`: `assets` draagt `*_encrypted`
 * (ciphertext) en `*_hash` (blind index onder een server-only sleutel = een
 * stabiele correlatiesleutel). Die horen nooit in een response die alleen een
 * keuzelijst hoeft te vullen.
 */

/** Alleen wat de keuzelijst en de gewogen waarde nodig hebben. */
const ASSET_COLUMNS = 'id, name, asset_type, current_value, net_worth_inclusion_pct'
const DEBT_COLUMNS = 'id, name, debt_type, current_balance, net_worth_inclusion_pct'

interface AssetRow {
  id: string
  name: string | null
  asset_type: string | null
  current_value: number | string | null
  net_worth_inclusion_pct: number | string | null
}

interface DebtRow {
  id: string
  name: string | null
  debt_type: string | null
  current_balance: number | string | null
  net_worth_inclusion_pct: number | string | null
}

/** Eén regel in de keuzelijst: `value` is de GEWOGEN huidige waarde. */
interface AvailableItem {
  id: string
  name: string
  type: string
  value: number
}

function toAvailableAsset(row: AssetRow): AvailableItem {
  return {
    id: row.id,
    name: row.name ?? '',
    type: row.asset_type ?? '',
    value: weightedAssetValue(row),
  }
}

function toAvailableDebt(row: DebtRow): AvailableItem {
  return {
    id: row.id,
    name: row.name ?? '',
    type: row.debt_type ?? '',
    value: weightedDebtValue(row),
  }
}

export async function GET() {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)
  if (!claims) return unauthorized()

  try {
    const [profileRes, assetsRes, debtsRes] = await Promise.all([
      supabase.from('profiles').select('feature_preferences').eq('id', claims.sub).single(),
      supabase
        .from('assets')
        .select(ASSET_COLUMNS)
        .eq('user_id', claims.sub)
        .eq('is_active', true)
        .order('name', { ascending: true }),
      supabase
        .from('debts')
        .select(DEBT_COLUMNS)
        .eq('user_id', claims.sub)
        .eq('is_active', true)
        .order('name', { ascending: true }),
    ])

    if (assetsRes.error) return serverError(assetsRes.error, 'wealth-selection:GET')
    if (debtsRes.error) return serverError(debtsRes.error, 'wealth-selection:GET')
    // Ook de profiel-lezing hard bewaken: een stil genegeerde fout zou hier
    // `selection: null` opleveren — de sheet toont dan alles uitgevinkt en één
    // klik op Opslaan wist de echte selectie (security-review 🔵).
    if (profileRes.error) return serverError(profileRes.error, 'wealth-selection:GET')

    const assets = (assetsRes.data ?? []) as unknown as AssetRow[]
    const debts = (debtsRes.data ?? []) as unknown as DebtRow[]

    // Stale id's verdwijnen ook hier stil: de sheet krijgt nooit een vinkje op
    // een rij die niet meer bestaat (ADR 0120 besluit 5).
    const stored = parseWealthSelection(profileRes.data?.feature_preferences)
    const assetIdSet = new Set(assets.map(a => a.id))
    const debtIdSet = new Set(debts.map(d => d.id))
    const selection: WealthSelection | null = stored
      ? {
          assetIds: stored.assetIds.filter(id => assetIdSet.has(id)),
          debtIds: stored.debtIds.filter(id => debtIdSet.has(id)),
        }
      : null

    return NextResponse.json({
      selection,
      available: {
        assets: assets.map(toAvailableAsset),
        debts: debts.map(toAvailableDebt),
      },
    })
  } catch (err) {
    return serverError(err, 'wealth-selection:GET')
  }
}

export async function PUT(req: Request) {
  const supabase = await createClient()
  // Schrijfpad → `getUser()` (verse serverside verificatie), niet `getClaims()`.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const parsed = await parseBody(WealthSelectionBodySchema, req)
  if (!parsed.ok) return parsed.response

  try {
    // Filter tegen de EIGEN rijen: alleen id's die van deze gebruiker zijn en
    // nog bestaan worden opgeslagen. Een id van de partner (assets is
    // huishoud-gedeeld op SELECT) of een verzonnen uuid valt hier stil af, dus
    // de pref kan nooit een vreemde of dode referentie gaan dragen.
    const [assetsRes, debtsRes] = await Promise.all([
      parsed.data.assetIds.length > 0
        ? supabase
            .from('assets')
            .select('id')
            .eq('user_id', user.id)
            .in('id', parsed.data.assetIds)
        : Promise.resolve({ data: [] as { id: string }[], error: null }),
      parsed.data.debtIds.length > 0
        ? supabase
            .from('debts')
            .select('id')
            .eq('user_id', user.id)
            .in('id', parsed.data.debtIds)
        : Promise.resolve({ data: [] as { id: string }[], error: null }),
    ])

    if (assetsRes.error) return serverError(assetsRes.error, 'wealth-selection:PUT')
    if (debtsRes.error) return serverError(debtsRes.error, 'wealth-selection:PUT')

    const ownAssetIds = new Set(((assetsRes.data ?? []) as { id: string }[]).map(r => r.id))
    const ownDebtIds = new Set(((debtsRes.data ?? []) as { id: string }[]).map(r => r.id))
    const selection: WealthSelection = {
      assetIds: parsed.data.assetIds.filter(id => ownAssetIds.has(id)),
      debtIds: parsed.data.debtIds.filter(id => ownDebtIds.has(id)),
    }

    // Read-modify-write op ÉÉN sleutel binnen de JSONB. Twee dingen bewust:
    //  · de UPDATE is kolom-gescoopt (`feature_preferences` en niets anders),
    //    zodat een gelijktijdige schrijver op een andere profielkolom niet
    //    wordt overschreven;
    //  · binnen de kolom blijft élke andere sleutel staan — hier woont o.a.
    //    `fire_strategy_override` en de uitgestelde onboarding-velden.
    const { data: profile, error: readError } = await supabase
      .from('profiles')
      .select('feature_preferences')
      .eq('id', user.id)
      .single()

    if (readError) return serverError(readError, 'wealth-selection:PUT')

    const current = profile?.feature_preferences
    const next: Record<string, unknown> =
      current && typeof current === 'object' && !Array.isArray(current)
        ? { ...(current as Record<string, unknown>) }
        : {}

    if (selection.assetIds.length === 0 && selection.debtIds.length === 0) {
      // Lege selectie = de widget heeft niets te tonen. De sleutel weghalen is
      // hetzelfde als een lege selectie (`parseWealthSelection` geeft in beide
      // gevallen null) maar laat geen dode pref achter.
      delete next[WEALTH_SELECTION_PREF_KEY]
    } else {
      next[WEALTH_SELECTION_PREF_KEY] = selection
    }

    const { error: writeError } = await supabase
      .from('profiles')
      .update({ feature_preferences: next })
      .eq('id', user.id)

    if (writeError) return serverError(writeError, 'wealth-selection:PUT')

    const isEmpty = selection.assetIds.length === 0 && selection.debtIds.length === 0
    return NextResponse.json({ selection: isEmpty ? null : selection })
  } catch (err) {
    return serverError(err, 'wealth-selection:PUT')
  }
}
