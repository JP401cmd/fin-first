import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateModules, ALL_MODULES, type ModuleId } from '@/lib/module-registry'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('active_modules')
    .eq('id', user.id)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const activeModules = (profile?.active_modules as ModuleId[] | null) ?? []

  return NextResponse.json({ activeModules })
}

export async function PUT(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as { modules?: unknown }

  if (!Array.isArray(body.modules)) {
    return NextResponse.json({ error: 'Invalid payload: modules must be an array' }, { status: 400 })
  }

  // Strip unknown module IDs — only accept values present in the catalog
  const knownModules = new Set<string>(ALL_MODULES)
  const sanitized = body.modules.filter(
    (m): m is ModuleId => typeof m === 'string' && knownModules.has(m),
  )

  // Validate dependency rules (hard requires, requiresOneOf, foundational minimum)
  const { valid, errors } = validateModules(sanitized)
  if (!valid) {
    return NextResponse.json({ errors }, { status: 400 })
  }

  // Fetch current modules to detect budgetteren toggle
  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('active_modules')
    .eq('id', user.id)
    .single()

  const currentModules = (currentProfile?.active_modules as ModuleId[] | null) ?? []
  const hadBudgetteren = currentModules.includes('budgetteren')
  const hasBudgetteren = sanitized.includes('budgetteren')

  const { error } = await supabase
    .from('profiles')
    .update({ active_modules: sanitized })
    .eq('id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Sync budgeting data layer when budgetteren module is toggled
  if (hadBudgetteren && !hasBudgetteren) {
    // Budgetteren deactivated →
    // 1. Snapshot which accounts had tracking (for restore on reactivation)
    // 2. Disable tracking on all cash assets
    // 3. Set budgeting_active = false
    // Transactions and budgets are preserved — only the tracking flag changes.
    const { data: trackedAssets } = await supabase
      .from('assets')
      .select('id')
      .eq('user_id', user.id)
      .eq('asset_type', 'cash')
      .eq('has_budget_tracking', true)
      .eq('is_active', true)

    const trackedIds = (trackedAssets ?? []).map(a => a.id)

    // Store snapshot in feature_preferences for later restore
    const { data: fpProfile } = await supabase
      .from('profiles')
      .select('feature_preferences')
      .eq('id', user.id)
      .single()

    const fp = (fpProfile?.feature_preferences as Record<string, unknown> | null) ?? {}
    fp.budget_tracking_account_ids = trackedIds

    await Promise.all([
      supabase
        .from('assets')
        .update({ has_budget_tracking: false })
        .eq('user_id', user.id)
        .eq('asset_type', 'cash')
        .eq('is_active', true),
      supabase
        .from('profiles')
        .update({ budgeting_active: false, feature_preferences: fp })
        .eq('id', user.id),
    ])
  } else if (!hadBudgetteren && hasBudgetteren) {
    // Budgetteren activated →
    // 1. Restore tracking on previously tracked accounts (from snapshot)
    // 2. Set budgeting_active = true
    // 3. Clear the snapshot
    const { data: fpProfile } = await supabase
      .from('profiles')
      .select('feature_preferences')
      .eq('id', user.id)
      .single()

    const fp = (fpProfile?.feature_preferences as Record<string, unknown> | null) ?? {}
    const savedIds = (fp.budget_tracking_account_ids as string[] | undefined) ?? []

    if (savedIds.length > 0) {
      // Restore tracking on the exact same accounts
      await supabase
        .from('assets')
        .update({ has_budget_tracking: true })
        .eq('user_id', user.id)
        .eq('asset_type', 'cash')
        .eq('is_active', true)
        .in('id', savedIds)
    }

    // Clear snapshot and set budgeting_active
    delete fp.budget_tracking_account_ids
    await supabase
      .from('profiles')
      .update({ budgeting_active: true, feature_preferences: fp })
      .eq('id', user.id)
  }

  return NextResponse.json({ activeModules: sanitized })
}
