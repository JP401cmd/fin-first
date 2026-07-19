import { NextRequest, NextResponse } from 'next/server'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { loadPerspectiveContext } from '@/lib/household/perspective-loader'
import {
  detectMergeCandidates,
  type BudgetLike,
  type MergeCandidate,
  type MergePair,
} from '@/lib/budget-merge'
import { unauthorized, serverError } from '@/lib/api/respond'

/**
 * Budgetmodel van het huishouden: 'separate' (ieder een eigen budgetboom,
 * default) of 'household' (één gedeelde boom). De overstap (en het terugdraaien)
 * loopt via een TWEE-zijdig voorstel:
 *
 *   • GET   → huidig model, lopend voorstel (indien aanwezig) en — wanneer nog
 *             'separate' — de gedetecteerde merge-kandidaten (eigen vs partner).
 *   • POST  → start een voorstel via RPC `propose_budget_model`.
 *   • PATCH → keur een voorstel goed / af / trek het in via RPC
 *             `resolve_budget_model_proposal` (accept voert de merge of unmerge
 *             server-side in één transactie uit).
 *
 * Alle merge-/unmerge-mutaties gebeuren uitsluitend in de RPC's; deze route is
 * de dunne HTTP-laag eromheen plus de (read-only) kandidaat-detectie.
 */

// ── Foutvertaling RPC → Nederlands ─────────────────────────────────────
// Spiegelt de error-codes uit `propose_budget_model` /
// `resolve_budget_model_proposal`. Onbekende codes vallen terug op de ruwe code.

const PROPOSE_ERRORS: Record<string, string> = {
  not_a_member: 'Je maakt geen deel uit van een huishouden.',
  needs_two_members: 'Een gezamenlijk budgetmodel vereist twee huishoudleden.',
  invalid_target: 'Ongeldig budgetmodel.',
  pending_exists: 'Er staat al een voorstel open. Handel dat eerst af.',
  invalid_mapping: 'De voorgestelde koppeling is ongeldig.',
}

const RESOLVE_ERRORS: Record<string, string> = {
  not_found: 'Voorstel niet gevonden.',
  not_pending: 'Dit voorstel is al afgehandeld.',
  expired: 'Dit voorstel is verlopen.',
  only_proposer_cancels: 'Alleen de aanvrager kan een voorstel intrekken.',
  proposer_cannot_resolve: 'De aanvrager kan zijn eigen voorstel niet goed- of afkeuren.',
  invalid_action: 'Ongeldige actie.',
}

type RpcResult = {
  success?: boolean
  error?: string
  proposal_id?: string
  status?: string
  result?: unknown
}

// ── GET ─────────────────────────────────────────────────────────────────

export async function GET() {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)
  if (!claims) return unauthorized()

  const ctx = await loadPerspectiveContext(supabase)

  // Lopend voorstel (RLS scope = eigen huishouden). Hoogstens één 'pending'.
  let pendingProposal: {
    id: string
    target_model: string
    merge_mapping: MergePair[]
    proposed_by: string
    proposedByMe: boolean
    created_at: string
    expires_at: string
  } | null = null

  if (ctx.hasHousehold) {
    const { data: proposalRow } = await supabase
      .from('household_budget_model_proposals')
      .select('id, target_model, merge_mapping, proposed_by, status, created_at, expires_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (proposalRow) {
      pendingProposal = {
        id: proposalRow.id as string,
        target_model: proposalRow.target_model as string,
        merge_mapping: (proposalRow.merge_mapping as MergePair[] | null) ?? [],
        proposed_by: proposalRow.proposed_by as string,
        proposedByMe: proposalRow.proposed_by === claims.sub,
        created_at: proposalRow.created_at as string,
        expires_at: proposalRow.expires_at as string,
      }
    }
  }

  // Kandidaten alleen relevant wanneer we nog 'separate' zijn én een partner is.
  let candidates: MergeCandidate[] | null = null
  let partnerPrivacyBlocksMerge = false

  if (ctx.hasHousehold && ctx.budgetModel === 'separate') {
    // Eigen budgetten via normale query (niet-gearchiveerd).
    const { data: ownRows } = await supabase
      .from('budgets')
      .select('id, user_id, parent_id, name, slug, budget_type, ownership, is_archived, merged_into, default_limit, icon')
      .eq('user_id', claims.sub)
      .eq('is_archived', false)

    const ownBudgets = (ownRows ?? []) as BudgetLike[]

    // Partnerbudgetten via privacy-gated RPC. Bij 'totals'/'hidden' levert de
    // RPC een aggregaatrij (`_aggregated`) of niets terug → merge is dan niet
    // mogelijk (we hebben de individuele rijen nodig).
    const { data: partnerRows } = await supabase.rpc('household_partner_items', {
      p_category: 'budgets',
    })
    const partnerRaw = (partnerRows ?? []) as Array<Record<string, unknown>>
    const partnerIsAggregated =
      partnerRaw.length > 0 && partnerRaw.some((r) => r._aggregated === true)
    // Partner aanwezig maar geen itemizeerbare rijen (totals of hidden) → blokkeer.
    const partnerHasItems = partnerRaw.length > 0 && !partnerIsAggregated

    if (ctx.partnerId && (partnerIsAggregated || !partnerHasItems)) {
      partnerPrivacyBlocksMerge = true
      candidates = []
    } else {
      const partnerBudgets = partnerRaw as unknown as BudgetLike[]
      const detected = detectMergeCandidates(ownBudgets, partnerBudgets)

      // Transactie-aantallen per eigen budget (één gegroepeerde query). Het
      // partner-transactieaantal is niet toegankelijk (privacy) → undefined,
      // waardoor de canonical-default bij gelijkspel naar de eigen kant valt.
      const ownTxCounts = new Map<string, number>()
      const ownBudgetIds = detected.map((c) => c.canonical.id)
      if (ownBudgetIds.length > 0) {
        const { data: txRows } = await supabase
          .from('transactions')
          .select('budget_id')
          .eq('user_id', claims.sub)
          .in('budget_id', ownBudgetIds)
        for (const row of (txRows ?? []) as Array<{ budget_id: string | null }>) {
          if (!row.budget_id) continue
          ownTxCounts.set(row.budget_id, (ownTxCounts.get(row.budget_id) ?? 0) + 1)
        }
      }

      candidates = detected.map((c) => ({
        ...c,
        txCountCanonical: ownTxCounts.get(c.canonical.id) ?? 0,
        txCountDuplicate: undefined, // partner tx-aantal onbereikbaar → tie → own
      }))
    }
  }

  return NextResponse.json({
    budgetModel: ctx.budgetModel,
    hasHousehold: ctx.hasHousehold,
    partnerName: ctx.partnerName,
    pendingProposal,
    candidates,
    partnerPrivacyBlocksMerge,
  })
}

// ── POST — start een voorstel ──────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const body = await request.json().catch(() => ({}))
  const targetModel = body.targetModel as string | undefined
  if (targetModel !== 'household' && targetModel !== 'separate') {
    return NextResponse.json({ error: 'Ongeldig budgetmodel' }, { status: 400 })
  }

  const mergeMapping = body.mergeMapping as unknown
  if (mergeMapping !== undefined) {
    if (
      !Array.isArray(mergeMapping) ||
      !mergeMapping.every(
        (p) =>
          p &&
          typeof p === 'object' &&
          typeof (p as MergePair).canonical_budget_id === 'string' &&
          typeof (p as MergePair).duplicate_budget_id === 'string',
      )
    ) {
      return NextResponse.json({ error: 'Ongeldige koppeling' }, { status: 400 })
    }
  }

  const { data, error } = await supabase.rpc('propose_budget_model', {
    p_target_model: targetModel,
    p_merge_mapping: (mergeMapping ?? []) as MergePair[],
  })
  if (error) return serverError(error, 'budget-model:POST')

  const result = data as RpcResult | null
  if (!result?.success) {
    const code = result?.error ?? 'unknown'
    return NextResponse.json(
      { error: PROPOSE_ERRORS[code] ?? `Voorstel mislukt (${code}).` },
      { status: 400 },
    )
  }

  return NextResponse.json({ success: true, proposalId: result.proposal_id })
}

// ── PATCH — los een voorstel op (accept/decline/cancel) ────────────────

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const body = await request.json().catch(() => ({}))
  const proposalId = body.proposalId as string | undefined
  const action = body.action as string | undefined
  if (!proposalId || typeof proposalId !== 'string') {
    return NextResponse.json({ error: 'Voorstel-id ontbreekt' }, { status: 400 })
  }
  if (action !== 'accept' && action !== 'decline' && action !== 'cancel') {
    return NextResponse.json({ error: 'Ongeldige actie' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('resolve_budget_model_proposal', {
    p_proposal_id: proposalId,
    p_action: action,
  })
  if (error) return serverError(error, 'budget-model:PATCH')

  const result = data as RpcResult | null
  if (!result?.success) {
    const code = result?.error ?? 'unknown'
    return NextResponse.json(
      { error: RESOLVE_ERRORS[code] ?? `Afhandelen mislukt (${code}).` },
      { status: 400 },
    )
  }

  return NextResponse.json({
    success: true,
    status: result.status,
    result: result.result ?? null,
  })
}
