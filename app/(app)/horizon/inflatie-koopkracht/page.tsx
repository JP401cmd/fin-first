import { createClient } from '@/lib/supabase/server'
import { resolveFireParams } from '@/lib/fire-params'
import { getRecentDailyExpenseRate } from '@/lib/expense-rate'
import { InflatieKoopkrachtClient } from './inflatie-client'

/**
 * /toekomst/inflatie-koopkracht (backing-route /horizon/inflatie-koopkracht) —
 * calculator-tool.
 *
 * DAGTARIEF = DE CANONIEKE BRON (M22). Deze pagina rekende zélf een dagtarief
 * uit, en deed dat op twee manieren tegelijk fout: een eigen 6-maands venster
 * (het canonieke venster is 12 maanden) én een deling door 30,44 — een VIERDE
 * noemer naast de ×12/365 van `lib/expense-rate.ts`, de ÷30 van de oude
 * Box 3-keten en de gekozen-grondslag van het cashflow-blok. Plus een verzonnen
 * terugval van €100/dag, precies het patroon dat KRUIS-20 al had opgeruimd.
 *
 * Nu: `getRecentDailyExpenseRate` (12-mnd rolling gerealiseerde uitgaven ×12/365,
 * met de profielschatting als terugval zodra er geen transacties zijn). Levert
 * die 0 op — geen transacties én geen schatting — dan geven we 0 dóór in plaats
 * van een verzonnen bedrag; `computeInflationErosion` guard't daarop en laat de
 * vrijheidsdagen-regel dan weg. De euro-kant van de calculator blijft werken.
 */
export default async function InflatieKoopkrachtPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let inflationRate = 0.02
  let dailyExpenses = 0

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('expected_return, inflation_rate, box3_method, marginaal_tarief, net_monthly_income, estimated_monthly_expenses')
      .eq('id', user.id)
      .single()

    if (profile) {
      const fireParams = resolveFireParams(profile)
      inflationRate = fireParams.inflationRate

      const { dailyRate } = await getRecentDailyExpenseRate(
        supabase,
        new Date(),
        Math.max(Number(profile.estimated_monthly_expenses ?? 0) || 0, 0),
      )
      dailyExpenses = dailyRate
    }
  }

  return (
    <InflatieKoopkrachtClient
      defaultInflationRate={inflationRate}
      defaultDailyExpenses={dailyExpenses}
    />
  )
}
