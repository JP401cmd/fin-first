import { createClient } from '@/lib/supabase/server'
import { resolveFireParams } from '@/lib/fire-params'
import { InflatieKoopkrachtClient } from './inflatie-client'

export default async function InflatieKoopkrachtPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let inflationRate = 0.02
  let dailyExpenses = 100 // fallback: ~€3000/month

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('expected_return, inflation_rate, box3_method, marginaal_tarief, net_monthly_income, estimated_monthly_expenses')
      .eq('id', user.id)
      .single()

    if (profile) {
      const fireParams = resolveFireParams(profile)
      inflationRate = fireParams.inflationRate

      // Daily expenses from profile or transaction-based estimate
      const monthlyExpenses = Number(profile.estimated_monthly_expenses ?? 0)
      if (monthlyExpenses > 0) {
        dailyExpenses = monthlyExpenses / 30.44
      } else {
        // Fallback: try from recent transactions
        const monthStart = new Date()
        monthStart.setMonth(monthStart.getMonth() - 6)
        const { data: txs } = await supabase
          .from('transactions')
          .select('amount')
          .eq('user_id', user.id)
          .lt('amount', 0)
          .gte('date', monthStart.toISOString().split('T')[0])

        if (txs && txs.length > 0) {
          const totalExpenses = txs.reduce(
            (sum, t) => sum + Math.abs(Number(t.amount)),
            0,
          )
          const months = 6
          dailyExpenses = totalExpenses / months / 30.44
        }
      }
    }
  }

  return (
    <InflatieKoopkrachtClient
      defaultInflationRate={inflationRate}
      defaultDailyExpenses={Math.max(1, dailyExpenses)}
    />
  )
}
