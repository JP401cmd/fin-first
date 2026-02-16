import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Goals API - CRUD operations for financial goals.
 * GET /api/goals - list all goals for authenticated user
 * POST /api/goals - create a new goal
 * PATCH /api/goals - update goal by id (pass { id, ...fields })
 */

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const goalId = searchParams.get('id')

  if (goalId) {
    // Get single goal (scoped to current user)
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .eq('id', goalId)
      .eq('user_id', user.id)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    return NextResponse.json(data)
  }

  // Get all goals (scoped to current user)
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()

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
    icon: body.icon || 'Target',
    color: body.color || 'teal',
  }

  const { data, error } = await supabase
    .from('goals')
    .insert(row)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

  const { data, error } = await supabase
    .from('goals')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'Goal id is required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('goals')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
