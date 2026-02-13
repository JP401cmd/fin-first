import { createClient } from '@/lib/supabase/server'
import { computeFeatureAccess } from '@/lib/compute-feature-access'

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

  if (profile?.last_known_phase !== null) {
    return Response.json({ error: 'Already activated' }, { status: 400 })
  }

  // Fetch financial data to compute current phase
  const threeMonthsAgo = new Date()
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
  const dateStr = threeMonthsAgo.toISOString().split('T')[0]

  const [assetsRes, debtsRes, txRes, matrixRes] = await Promise.all([
    supabase.from('assets').select('current_value').eq('is_active', true),
    supabase.from('debts').select('current_balance, debt_type').eq('is_active', true),
    supabase.from('transactions').select('amount, is_income').gte('date', dateStr),
    supabase.from('app_settings').select('value').eq('key', 'feature_phase_matrix').single(),
  ])

  const { phase } = computeFeatureAccess({
    assets: assetsRes.data ?? [],
    debts: debtsRes.data ?? [],
    transactions: txRes.data ?? [],
    matrixJson: matrixRes.data?.value ?? null,
  })

  const { error } = await supabase
    .from('profiles')
    .update({ last_known_phase: phase })
    .eq('id', user.id)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ success: true, phase })
}
