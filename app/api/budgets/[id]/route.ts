import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { badRequest, conflict, notFound, serverError, unauthorized } from '@/lib/api/respond'

/**
 * DELETE /api/budgets/[id] — Archive a budget category (soft-delete).
 *
 * Ondanks de HTTP-methode DELETE is dit een VEILIGE, niet-destructieve
 * archivering (WF-BUDGET-11): het budget en zijn subbudgetten worden op
 * `is_archived = true` gezet, niet uit de database verwijderd. Gekoppelde
 * transacties, subbudgetten, rollovers en budget_amounts blijven ONGEWIJZIGD
 * behouden — de transactiehistorie blijft dus intact. De budget-SELECT filtert
 * al op `is_archived = eq.false`, dus gearchiveerde budgetten verdwijnen vanzelf
 * uit de actieve lijst. Dit spiegelt het bestaande archiveer-patroon van de
 * huishoudbudget-merge-flow (migratie 20260611000002).
 *
 * Steps:
 * 1. Verify authenticated user owns the budget
 * 2. Guard: reeds gearchiveerd → 409 (geen dubbele actie)
 * 3. If parent budget: verzamel alle subbudget-ids
 * 4. UPDATE budgets SET is_archived = true voor budget + subbudgetten
 * 5. Return summary of what was archived
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(id)) {
    return badRequest('Ongeldig budget ID formaat')
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return unauthorized()
  }

  try {
    // Fetch the budget to verify ownership
    const { data: budget, error: fetchError } = await supabase
      .from('budgets')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !budget) {
      return notFound('Budget niet gevonden of geen toegang')
    }

    // Guard: al gearchiveerd → geen dubbele archiveer-actie
    if (budget.is_archived) {
      return conflict('Dit budget is al gearchiveerd.')
    }

    // Collect all budget IDs to archive (including children if this is a parent)
    const budgetIdsToArchive: string[] = [id]
    let childCount = 0

    // If this is a parent budget (no parent_id), find and include all children
    if (!budget.parent_id) {
      const { data: children } = await supabase
        .from('budgets')
        .select('id')
        .eq('parent_id', id)
        .eq('user_id', user.id)
        .eq('is_archived', false)

      if (children && children.length > 0) {
        const childIds = children.map((c: { id: string }) => c.id)
        budgetIdsToArchive.push(...childIds)
        childCount = children.length
      }
    }

    // Soft-delete: markeer budget + subbudgetten als gearchiveerd.
    // Transacties (budget_id), rollovers en budget_amounts blijven behouden.
    const { error: archiveError } = await supabase
      .from('budgets')
      .update({ is_archived: true, updated_at: new Date().toISOString() })
      .in('id', budgetIdsToArchive)
      .eq('user_id', user.id)

    if (archiveError) {
      return serverError(archiveError, 'budgets:DELETE')
    }

    return NextResponse.json({
      success: true,
      archived: {
        budget_id: id,
        budget_name: budget.name,
        is_parent: !budget.parent_id,
        children_archived: childCount,
      },
    })
  } catch (err) {
    return serverError(err, 'budgets:DELETE')
  }
}

/**
 * GET /api/budgets/[id] — Get a single budget by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)

  if (!claims) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { data: budget, error } = await supabase
    .from('budgets')
    .select('*')
    .eq('id', id)
    .eq('user_id', claims.sub)
    .single()

  if (error || !budget) {
    return NextResponse.json(
      { error: 'Budget niet gevonden' },
      { status: 404 }
    )
  }

  return NextResponse.json({ budget })
}
