import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { unauthorized, notFound, serverError } from '@/lib/api/respond'

/**
 * Goals API - CRUD operations for financial goals.
 * GET /api/goals - list all goals for authenticated user (including shared household goals)
 * POST /api/goals - create a new goal (personal or shared)
 * PATCH /api/goals - update goal by id (pass { id, ...fields })
 */

/** Get the household_id for the current user, or null */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getUserHouseholdId(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', userId)
    .maybeSingle()
  return data?.household_id ?? null
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)

  if (!claims) {
    return unauthorized()
  }

  const { searchParams } = new URL(request.url)
  const goalId = searchParams.get('id')

  // Get user's household for shared goal access
  const householdId = await getUserHouseholdId(supabase, claims.sub)

  if (goalId) {
    // Get single goal (user's own OR shared from same household)
    let query = supabase
      .from('goals')
      .select('*')
      .eq('id', goalId)

    if (householdId) {
      query = query.or(`user_id.eq.${claims.sub},and(ownership.eq.shared,household_id.eq.${householdId})`)
    } else {
      query = query.eq('user_id', claims.sub)
    }

    const { data, error } = await query.single()

    if (error) {
      return notFound()
    }
    return NextResponse.json(data)
  }

  // Get all goals: user's own + shared household goals from partner
  let query = supabase
    .from('goals')
    .select('*')

  if (householdId) {
    query = query.or(`user_id.eq.${claims.sub},and(ownership.eq.shared,household_id.eq.${householdId})`)
  } else {
    query = query.eq('user_id', claims.sub)
  }

  const { data, error } = await query.order('sort_order', { ascending: true })

  if (error) {
    return serverError(error, 'goals:GET')
  }

  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return unauthorized()
  }

  const body = await request.json()

  // Validate shared goal: must have household membership
  const ownership = body.ownership === 'shared' ? 'shared' : 'personal'
  let goalHouseholdId: string | null = null

  if (ownership === 'shared') {
    const userHouseholdId = await getUserHouseholdId(supabase, user.id)
    if (!userHouseholdId) {
      return NextResponse.json({ error: 'Je hebt geen huishouden — maak eerst een koppeling met je partner.' }, { status: 400 })
    }
    goalHouseholdId = body.household_id || userHouseholdId
  }

  const row = {
    user_id: user.id,
    name: body.name,
    description: body.description || null,
    goal_type: body.goal_type || 'savings',
    target_value: Number(body.target_value) || 0,
    current_value: Number(body.current_value) || 0,
    target_date: body.target_date || null,
    linked_asset_id: body.linked_asset_id || null,
    linked_debt_id: body.linked_debt_id || null,
    budget_id: body.budget_id || null,
    icon: body.icon || 'Target',
    color: body.color || 'teal',
    custom_unit: body.custom_unit || null,
    ownership,
    household_id: goalHouseholdId,
  }

  const { data, error } = await supabase
    .from('goals')
    .insert(row)
    .select()
    .single()

  if (error) {
    return serverError(error, 'goals:POST')
  }

  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return unauthorized()
  }

  const body = await request.json()
  const { id, ...updates } = body

  if (!id) {
    return NextResponse.json({ error: 'Goal id is required' }, { status: 400 })
  }

  // Add updated_at timestamp
  const updateData = {
    ...updates,
    updated_at: new Date().toISOString(),
  }

  // Try user's own goal first
  const { data, error } = await supabase
    .from('goals')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .maybeSingle()

  if (data) return NextResponse.json(data)

  // If not found, check if it's a shared household goal the user can update
  const householdId = await getUserHouseholdId(supabase, user.id)
  if (householdId) {
    const { data: sharedData, error: sharedError } = await supabase
      .from('goals')
      .update(updateData)
      .eq('id', id)
      .eq('ownership', 'shared')
      .eq('household_id', householdId)
      .select()
      .maybeSingle()

    if (sharedData) return NextResponse.json(sharedData)
    if (sharedError) return serverError(sharedError, 'goals:PATCH')
  }

  if (error) {
    return serverError(error, 'goals:PATCH')
  }

  return NextResponse.json({ error: 'Goal not found or access denied' }, { status: 404 })
}

export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return unauthorized()
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'Goal id is required' }, { status: 400 })
  }

  // Try deleting user's own goal
  const { data: ownGoal } = await supabase
    .from('goals')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle()

  if (ownGoal) return NextResponse.json({ success: true })

  // If not found, try shared household goal
  const householdId = await getUserHouseholdId(supabase, user.id)
  if (householdId) {
    const { error: sharedError } = await supabase
      .from('goals')
      .delete()
      .eq('id', id)
      .eq('ownership', 'shared')
      .eq('household_id', householdId)

    if (sharedError) {
      return serverError(sharedError, 'goals:DELETE')
    }
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
}
