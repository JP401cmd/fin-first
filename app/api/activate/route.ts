import { createClient } from '@/lib/supabase/server'
import { computeFeatureAccess } from '@/lib/compute-feature-access'
import { PERSONAS, type PersonaKey } from '@/lib/test-personas'
import { deleteAllUserData, seedPersonaData } from '@/lib/seed-persona'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify last_known_phase is NULL (prevent double activation)
  const { data: profile } = await supabase
    .from('profiles')
    .select('last_known_phase')
    .eq('id', user.id)
    .single()

  if (profile && profile.last_known_phase !== null) {
    return Response.json({ error: 'Already activated' }, { status: 400 })
  }

  // Check if this is a test user with a linked persona seed
  const personaKey = user.user_metadata?.test_persona_key as string | undefined
  if (personaKey && PERSONAS[personaKey as PersonaKey]) {
    const persona = PERSONAS[personaKey as PersonaKey]

    // Seed persona data (replaces any onboarding data)
    const noop = () => {}
    await deleteAllUserData(supabase, user.id, noop)
    await seedPersonaData(supabase, user.id, persona, noop)
    await supabase.from('profiles').update({ is_demo_user: true }).eq('id', user.id)
  }

  // Fetch financial data to compute current phase (after potential seeding)
  const threeMonthsAgo = new Date()
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
  const dateStr = threeMonthsAgo.toISOString().split('T')[0]

  const [assetsRes, debtsRes, txRes, matrixRes] = await Promise.all([
    supabase.from('assets').select('current_value').eq('user_id', user.id).eq('is_active', true),
    supabase.from('debts').select('current_balance, debt_type').eq('user_id', user.id).eq('is_active', true),
    supabase.from('transactions').select('amount, is_income').eq('user_id', user.id).gte('date', dateStr),
    supabase.from('app_settings').select('value').eq('key', 'feature_phase_matrix').maybeSingle(),
  ])

  const { phase } = computeFeatureAccess({
    assets: assetsRes.data ?? [],
    debts: debtsRes.data ?? [],
    transactions: txRes.data ?? [],
    activeSubscriptions: [],
    userFeaturePrefs: null,
    matrixJson: matrixRes.data?.value ?? null,
  })

  const { error } = await supabase
    .from('profiles')
    .update({ last_known_phase: phase })
    .eq('id', user.id)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ success: true, phase, seeded: !!personaKey })
}
