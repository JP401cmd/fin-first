// lib/household/perspective-loader.ts
//
// Eén herbruikbare data-laag voor de drie perspectieven (eigen / huishouden /
// partner). Elk domein (bezittingen, schulden, cashflow, belasting, toekomst)
// roept ENKEL deze helper aan i.p.v. eigen ownership-/privacy-filtering te
// herimplementeren.
//
// DUAL-USE: deze functies krijgen de Supabase-client als parameter en gebruiken
// alleen `.from`/`.rpc`/`.auth.getUser`, die zowel met de server-client
// (@/lib/supabase/server) als de browser-client (@/lib/supabase/client) werken.
// Daarom bewust GEEN React `cache()` (server-only) — server-componenten doen de
// first paint, client-componenten her-laden op een perspectief-switch.
//
// Datatoegang (zie plan Onderdeel 1.1 — HYBRIDE):
//   • Eigen + ALLE gedeelde items van het huishouden komen uit een normale
//     query: de huishoud-bewuste SELECT-RLS (`ownership='shared' AND
//     household_id = user_household_id()`) levert ze nu mee.
//   • PERSOONLIJKE items van de partner komen uit de SECURITY DEFINER RPC
//     `household_partner_items(category)`, die de privacy van de partner
//     (full/totals/hidden) al server-side heeft toegepast.
//
// Elk teruggegeven item krijgt:
//   • `_provenance` — 'eigen' | 'partner' | 'gezamenlijk' (voor de UI-badge)
//   • `_myShareFraction` — het aandeel (0-1) dat in dit perspectief telt
//   • `_aggregated` — true voor een privacy-'totalen'-aggregaatrij (van de RPC)

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  computeSharePct,
  deriveProvenance,
  debtShareFraction,
  normalisePrivacySettings,
  type Perspective,
  type SplitMode,
  type OwnershipType,
  type PrivacySettings,
  type Provenance,
} from '@/lib/household-data'

// ── Types ──────────────────────────────────────────────────────

export interface PerspectiveContext {
  userId: string
  hasHousehold: boolean
  householdId: string | null
  partnerId: string | null
  partnerName: string | null
  splitMode: SplitMode
  customSplitPct: number | null
  primaryPayerId: string | null
  /** Aandeel (0-100) dat de huidige gebruiker draagt van gedeelde kosten. */
  mySharePct: number
  /** Privacy die de PARTNER hanteert t.o.v. de huidige gebruiker. */
  partnerPrivacy: PrivacySettings | null
}

export type PerspectiveItem = Record<string, unknown> & {
  ownership: OwnershipType
  user_id?: string
  _provenance: Provenance
  _myShareFraction: number
  _aggregated?: boolean
}

export interface PerspectiveData {
  perspective: Perspective
  context: PerspectiveContext
  assets: PerspectiveItem[]
  debts: PerspectiveItem[]
  budgets: PerspectiveItem[]
}

const SOLO_CONTEXT = (userId: string): PerspectiveContext => ({
  userId,
  hasHousehold: false,
  householdId: null,
  partnerId: null,
  partnerName: null,
  splitMode: 'equal',
  customSplitPct: null,
  primaryPayerId: null,
  mySharePct: 100,
  partnerPrivacy: null,
})

// ── Context loader ─────────────────────────────────────────────

/**
 * Resolve het huishoud-perspectief van de huidige gebruiker: partner,
 * split-modus, aandeel-% en de privacy-instellingen van de partner.
 * Solo-gebruikers krijgen een `hasHousehold:false`-context met 100% aandeel.
 */
export async function loadPerspectiveContext(
  supabase: SupabaseClient,
): Promise<PerspectiveContext> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: members } = await supabase
    .from('household_members')
    .select('user_id, role, privacy_settings, household_id')

  if (!members || members.length < 2) return SOLO_CONTEXT(user.id)

  const partner = members.find((m) => m.user_id !== user.id)
  const me = members.find((m) => m.user_id === user.id)
  if (!partner || !me) return SOLO_CONTEXT(user.id)

  const householdId = me.household_id as string

  const { data: household } = await supabase
    .from('households')
    .select('name, split_mode, custom_split_pct, primary_payer_id')
    .eq('id', householdId)
    .maybeSingle()

  const splitMode = (household?.split_mode ?? 'equal') as SplitMode
  const customSplitPct = household?.custom_split_pct ?? null
  const primaryPayerId = household?.primary_payer_id ?? null

  // Profiles RLS is own-only; lees de partnernaam via de huishoud-RPC
  // (anders blijft de naam leeg en valt de badge terug op "Partner").
  const { data: memberProfiles } = await supabase.rpc('household_member_profiles')
  const partnerProfile =
    (memberProfiles as Array<{ id: string; full_name: string | null }> | null)?.find(
      (m) => m.id === partner.user_id,
    ) ?? null

  // income_ratio heeft beide inkomens nodig. We lezen voorlopig de
  // income-budgetten (zoals /api/household/data). De cashflow-fase
  // standaardiseert dit later op transactie-inkomen.
  let myIncome = 0
  let partnerIncome = 0
  if (splitMode === 'income_ratio') {
    const { data: incomeBudgets } = await supabase
      .from('budgets')
      .select('user_id, default_limit')
      .eq('budget_type', 'income')
    for (const b of incomeBudgets ?? []) {
      const amt = Number(b.default_limit) || 0
      if (b.user_id === user.id) myIncome += amt
      else if (b.user_id === partner.user_id) partnerIncome += amt
    }
  }

  const mySharePct = computeSharePct(
    { splitMode, customSplitPct, primaryPayerId },
    user.id,
    myIncome,
    partnerIncome,
  )

  return {
    userId: user.id,
    hasHousehold: true,
    householdId,
    partnerId: partner.user_id,
    partnerName: (partnerProfile?.full_name as string | null) ?? null,
    splitMode,
    customSplitPct,
    primaryPayerId,
    mySharePct,
    partnerPrivacy: normalisePrivacySettings(
      partner.privacy_settings as Record<string, string> | null,
    ),
  }
}

// ── Item-stempeling ────────────────────────────────────────────

type Kind = 'asset' | 'debt' | 'budget' | 'transaction'

/** Het aandeel (0-1) van een item dat in dit perspectief meetelt. */
function attributedFraction(
  item: { ownership: OwnershipType; user_id?: string; partner_split_pct?: number | null },
  perspective: Perspective,
  ctx: PerspectiveContext,
  kind: Kind,
): number {
  if (item.ownership !== 'shared') return 1
  if (perspective === 'household') return 1
  const householdShare =
    perspective === 'personal' ? ctx.mySharePct / 100 : 1 - ctx.mySharePct / 100
  if (kind === 'debt') {
    const viewerId = perspective === 'personal' ? ctx.userId : ctx.partnerId ?? undefined
    return debtShareFraction(item, viewerId, householdShare)
  }
  return householdShare
}

function stamp(
  rows: Record<string, unknown>[],
  perspective: Perspective,
  ctx: PerspectiveContext,
  kind: Kind,
): PerspectiveItem[] {
  return rows.map((row) => {
    const ownership = ((row.ownership as OwnershipType) ?? 'personal') as OwnershipType
    const user_id = row.user_id as string | undefined
    return {
      ...row,
      ownership,
      user_id,
      _provenance: deriveProvenance({ ownership, user_id }, ctx.userId),
      _myShareFraction: attributedFraction(
        { ownership, user_id, partner_split_pct: row.partner_split_pct as number | null | undefined },
        perspective,
        ctx,
        kind,
      ),
    }
  })
}

/** Partner-persoonlijke items uit de RPC (privacy reeds toegepast). */
function stampPartner(rows: Record<string, unknown>[] | null): PerspectiveItem[] {
  return (rows ?? []).map((row) => ({
    ...row,
    ownership: 'personal' as OwnershipType,
    user_id: row.user_id as string | undefined,
    _provenance: 'partner' as Provenance,
    _myShareFraction: 1,
    _aggregated: row._aggregated === true,
  }))
}

// ── Hoofdloader ────────────────────────────────────────────────

/**
 * Lever de bezittingen/schulden/budgetten voor het gevraagde perspectief,
 * met provenance + aandeel reeds gestempeld. Privacy van de partner is door
 * de RPC al afgedwongen. Dit is de enige plek waar perspectief-data wordt
 * samengesteld; domeinen consumeren het resultaat.
 */
export async function loadPerspectiveData(
  supabase: SupabaseClient,
  perspective: Perspective,
): Promise<PerspectiveData> {
  const context = await loadPerspectiveContext(supabase)

  // Basisquery: RLS levert eigen-persoonlijk + ALLE gedeelde items van het
  // huishouden (dankzij de huishoud-bewuste SELECT-policy).
  const [aRes, dRes, bRes] = await Promise.all([
    supabase.from('assets').select('*').eq('is_active', true),
    supabase.from('debts').select('*').eq('is_active', true),
    supabase.from('budgets').select('*'),
  ])
  const baseAssets = (aRes.data ?? []) as Record<string, unknown>[]
  const baseDebts = (dRes.data ?? []) as Record<string, unknown>[]
  const baseBudgets = (bRes.data ?? []) as Record<string, unknown>[]

  // Solo of eigen-perspectief: basisset is exact wat we willen
  // (eigen-persoonlijk + gedeeld op eigen aandeel).
  if (!context.hasHousehold || perspective === 'personal') {
    return {
      perspective,
      context,
      assets: stamp(baseAssets, 'personal', context, 'asset'),
      debts: stamp(baseDebts, 'personal', context, 'debt'),
      budgets: stamp(baseBudgets, 'personal', context, 'budget'),
    }
  }

  // Huishouden + partner hebben de partner-persoonlijke items nodig (RPC).
  const [paRes, pdRes, pbRes] = await Promise.all([
    supabase.rpc('household_partner_items', { p_category: 'assets' }),
    supabase.rpc('household_partner_items', { p_category: 'debts' }),
    supabase.rpc('household_partner_items', { p_category: 'budgets' }),
  ])
  const partnerAssets = stampPartner(paRes.data as Record<string, unknown>[] | null)
  const partnerDebts = stampPartner(pdRes.data as Record<string, unknown>[] | null)
  const partnerBudgets = stampPartner(pbRes.data as Record<string, unknown>[] | null)

  if (perspective === 'household') {
    // eigen-persoonlijk + alle gedeeld (vol) + partner-persoonlijk (gated)
    return {
      perspective,
      context,
      assets: [...stamp(baseAssets, 'household', context, 'asset'), ...partnerAssets],
      debts: [...stamp(baseDebts, 'household', context, 'debt'), ...partnerDebts],
      budgets: [...stamp(baseBudgets, 'household', context, 'budget'), ...partnerBudgets],
    }
  }

  // perspective === 'partner': partner-persoonlijk + gedeeld op partner-aandeel
  const sharedOnly = (rows: Record<string, unknown>[]) =>
    rows.filter((r) => r.ownership === 'shared')
  return {
    perspective,
    context,
    assets: [...partnerAssets, ...stamp(sharedOnly(baseAssets), 'partner', context, 'asset')],
    debts: [...partnerDebts, ...stamp(sharedOnly(baseDebts), 'partner', context, 'debt')],
    budgets: [...partnerBudgets, ...stamp(sharedOnly(baseBudgets), 'partner', context, 'budget')],
  }
}

// ── Cashflow-loader (transacties + partner-inkomen) ────────────────────────

export interface PerspectiveTransactions {
  perspective: Perspective
  context: PerspectiveContext
  transactions: PerspectiveItem[]
  /**
   * Maandelijks partner-inkomen uit de privacy-gated 'income'-RPC, of `null`
   * (solo / eigen-perspectief / partner deelt inkomen niet). Gebruik dit voor
   * income_ratio en gecombineerde cashflow i.p.v. opnieuw af te leiden.
   */
  partnerMonthlyIncome: number | null
}

/**
 * Lever de transacties voor het gevraagde perspectief, met provenance + aandeel
 * gestempeld. Spiegelt loadPerspectiveData maar voor de cashflow-as:
 *   • personal  → mijn transacties (+ mijn aandeel van gedeelde transacties)
 *   • household → beide partners (gedeeld één keer; partner-persoonlijk via RPC)
 *   • partner   → partner-persoonlijk (privacy-gated) + partner-aandeel van gedeeld
 *
 * `opts.since` / `opts.until` (ISO-datum 'yyyy-mm-dd', beide inclusief) windowen de
 * query — geef bv. 13 maanden terug mee. De partner-RPC is NIET datum-begrensd, dus
 * dezelfde window wordt na samenstellen ook op de partnerrijen toegepast.
 * Partner-persoonlijke transacties komen privacy-gated uit de RPC: bij 'totals'
 * is dat één aggregaatrij met `total_income`/`total_expense` (`_aggregated:true`).
 */
export async function loadPerspectiveTransactions(
  supabase: SupabaseClient,
  perspective: Perspective,
  opts?: { since?: string; until?: string },
): Promise<PerspectiveTransactions> {
  const context = await loadPerspectiveContext(supabase)

  let query = supabase.from('transactions').select('*')
  if (opts?.since) query = query.gte('date', opts.since)
  if (opts?.until) query = query.lte('date', opts.until)
  const { data } = await query
  const base = (data ?? []) as Record<string, unknown>[]

  // De partner-RPC (`household_partner_items('transactions')`) is niet datum-
  // begrensd. Pas dezelfde [since, until]-window toe op de SAMENGESTELDE lijst
  // zodat partnerrijen het venster respecteren. Privacy-'totalen'-aggregaten
  // (`_aggregated`) dragen geen `date` en passeren altijd.
  const inWindow = (rows: PerspectiveItem[]): PerspectiveItem[] => {
    if (!opts?.since && !opts?.until) return rows
    return rows.filter((r) => {
      if (r._aggregated) return true
      const date = r.date as string | undefined
      if (!date) return true
      if (opts.since && date < opts.since) return false
      if (opts.until && date > opts.until) return false
      return true
    })
  }

  if (!context.hasHousehold || perspective === 'personal') {
    return {
      perspective,
      context,
      transactions: inWindow(stamp(base, 'personal', context, 'transaction')),
      partnerMonthlyIncome: null,
    }
  }

  const [ptRes, incRes] = await Promise.all([
    supabase.rpc('household_partner_items', { p_category: 'transactions' }),
    supabase.rpc('household_partner_items', { p_category: 'income' }),
  ])
  const partnerTxns = stampPartner(ptRes.data as Record<string, unknown>[] | null)
  const incomeRows = (incRes.data ?? []) as Array<Record<string, unknown>>
  const partnerMonthlyIncome =
    incomeRows.length > 0 ? Number(incomeRows[0].monthly_income) || 0 : null

  if (perspective === 'household') {
    return {
      perspective,
      context,
      transactions: inWindow([...stamp(base, 'household', context, 'transaction'), ...partnerTxns]),
      partnerMonthlyIncome,
    }
  }

  // perspective === 'partner'
  const sharedOnly = base.filter((r) => r.ownership === 'shared')
  return {
    perspective,
    context,
    transactions: inWindow([...partnerTxns, ...stamp(sharedOnly, 'partner', context, 'transaction')]),
    partnerMonthlyIncome,
  }
}
