import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/onboarding-steps
 * Returns the current user's completed onboarding steps.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('completed_onboarding_steps')
    .eq('id', user.id)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const steps = (profile?.completed_onboarding_steps as string[] | null) ?? []

  return NextResponse.json({ steps })
}

/**
 * PUT /api/onboarding-steps
 * Merges new onboarding steps into the user's completed list.
 * Accepts { steps: string[] } — new steps to add (duplicates are ignored).
 */
export async function PUT(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as { steps?: unknown }

  if (!Array.isArray(body.steps) || body.steps.some((s) => typeof s !== 'string')) {
    return NextResponse.json({ error: 'Invalid payload: steps must be a string array' }, { status: 400 })
  }

  const newSteps = body.steps as string[]

  // Fetch current steps to merge (avoids overwriting steps from other sources)
  const { data: profile, error: fetchError } = await supabase
    .from('profiles')
    .select('completed_onboarding_steps')
    .eq('id', user.id)
    .single()

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  const existing = (profile?.completed_onboarding_steps as string[] | null) ?? []
  const merged = [...new Set([...existing, ...newSteps])]

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ completed_onboarding_steps: merged })
    .eq('id', user.id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ steps: merged })
}
