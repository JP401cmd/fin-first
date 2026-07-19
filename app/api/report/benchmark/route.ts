/**
 * GET /api/report/benchmark
 *
 * Levert de benchmark-rapportage: jouw canonieke kerngetallen (uit `loadDashboardData`)
 * afgezet tegen een vergelijkbare doelgroep (CBS/Nibud/DNB, cohort = leeftijd × huishoudtype)
 * + een wereld-reality-check. Herrekent géén kerngetallen — die komen 1-op-1 uit de bundel.
 *
 * Privacy: louter het eigen profiel + statische referentie. Geen cross-user reads.
 */

import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { dailyExpenseRate } from '@/lib/format'
import { loadDashboardData } from '@/lib/dashboard-data-loader'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import { getServerPerspective } from '@/lib/household/server-perspective'
import { deriveCohort } from '@/lib/benchmark/cohort'
import { buildBenchmarkReport, type BenchmarkUserMetrics } from '@/lib/benchmark/build-benchmark'

export async function GET() {
  try {
    const supabase = await createClient()
    const claims = await getAuthClaims(supabase)
    if (!claims) {
      return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
    }

    // Canonieke kerngetallen — consume, don't recompute. De gezondheidsscore komt
    // uit DEZELFDE bron als /overzicht (loadHorizonData, perspectief-correct) zodat
    // het getal exact overeenkomt met wat de gebruiker daar ziet; de dashboard-loader
    // levert de overige kerngetallen.
    const perspective = await getServerPerspective()
    const [{ dashboardData }, horizonData] = await Promise.all([
      loadDashboardData(supabase),
      loadHorizonData(supabase, perspective).catch(() => null),
    ])

    // Profiel voor cohort-afbakening + inkomensfallback.
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, date_of_birth, household_type, number_of_children, gross_annual_income, feature_preferences')
      .maybeSingle()

    // FASE 6 stap 5A — kernel-only: de gemodelleerde peer rekent onvoorwaardelijk op de
    // horizon-kernel (via de scalar-router). De doorvoer blijft bestaan maar is inert.
    const kernelScalarEnabled = true

    const cohort = deriveCohort({
      date_of_birth: profile?.date_of_birth ?? null,
      household_type: profile?.household_type ?? null,
      number_of_children: profile?.number_of_children ?? null,
    })

    // Geschat jaarinkomen ≈ besteedbaar (netto) inkomen — vergelijkbaar met de CBS-mediaan.
    // Canoniek: het effectieve maandinkomen uit de bundel (resolveEffectiveIncomeExpenses),
    // zodat handmatige/onboarding-inkomensbronnen net zo meetellen als op /overzicht; valt
    // alleen terug op het bruto jaarinkomen wanneer er geen effectief inkomen bekend is.
    const effectiveYear = dashboardData.monthlyIncome > 0 ? dashboardData.monthlyIncome * 12 : 0
    const yearlyIncome = effectiveYear > 0
      ? effectiveYear
      : (profile?.gross_annual_income ? Number(profile.gross_annual_income) : null)

    const userMetrics: BenchmarkUserMetrics = {
      // Gelijk aan /overzicht (horizonData); valt terug op de dashboard-loader.
      healthScoreTotal: horizonData?.healthScore?.total ?? dashboardData.healthScore?.total ?? null,
      fireAgeFractional: dashboardData.fireAgeFractional ?? null,
      savingsRate6m: dashboardData.savingsRate6m ?? null,
      netWorth: dashboardData.netWorth ?? null,
      yearlyIncome,
      dailyExpenseRate: dailyExpenseRate(dashboardData.monthlyExpenses),
    }

    const report = buildBenchmarkReport({
      user: userMetrics,
      cohort,
      displayName: profile?.full_name ?? null,
      generatedAt: new Date().toISOString(),
      kernelScalarEnabled,
    })

    return Response.json(report)
  } catch (error) {
    console.error('Benchmark generation error:', error)
    return Response.json(
      { error: 'Benchmark genereren mislukt. Probeer het later opnieuw.' },
      { status: 500 },
    )
  }
}
