import { createClient } from '@/lib/supabase/server'
import { resolveFireParams } from '@/lib/fire-params'
import { CompoundInterestPage } from './compound-interest-client'

export default async function SamengesteldeInterestPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let monthlyDeposit = 500
  let annualReturn = 0.07

  if (user) {
    // Fetch profile for savings data + expected return
    const { data: profile } = await supabase
      .from('profiles')
      .select('expected_return, inflation_rate, box3_method, marginaal_tarief, net_monthly_income, estimated_monthly_expenses, monthly_savings_override')
      .eq('id', user.id)
      .single()

    if (profile) {
      const fireParams = resolveFireParams(profile)
      annualReturn = fireParams.grossReturn

      // Priority: monthly_savings_override > computed from income-expenses > 500 fallback
      if (profile.monthly_savings_override != null && profile.monthly_savings_override > 0) {
        monthlyDeposit = profile.monthly_savings_override
      } else {
        const income = Number(profile.net_monthly_income ?? 0)
        const expenses = Number(profile.estimated_monthly_expenses ?? 0)
        if (income > 0 && expenses > 0 && income > expenses) {
          monthlyDeposit = Math.round(income - expenses)
        }
      }

      // Also try to get monthly contributions from assets
      const { data: assets } = await supabase
        .from('assets')
        .select('monthly_contribution')
        .eq('user_id', user.id)

      if (assets && assets.length > 0) {
        const totalContributions = assets.reduce(
          (sum, a) => sum + Number(a.monthly_contribution ?? 0),
          0,
        )
        // Use asset contributions if higher than profile-based savings
        if (totalContributions > monthlyDeposit) {
          monthlyDeposit = Math.round(totalContributions)
        }
      }
    }
  }

  return (
    <CompoundInterestPage
      defaultMonthlyDeposit={monthlyDeposit}
      defaultAnnualReturn={annualReturn}
    />
  )
}
