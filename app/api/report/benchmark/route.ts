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
      // HET spaarquote-getal (effectief, grondslag-geresolveerd) — hetzelfde
      // percentage dat de gebruiker op /overzicht en in het instellingenblok
      // ziet. Het benchmark-rapport zet 'm naast een peer-mediaan; op de rauwe
      // 6-maands meting zou hij met een ander getal vergeleken worden dan de app
      // toont. Veldnaam volgt het `BenchmarkUserMetrics`-contract.
      savingsRate6m: dashboardData.effectiveSavingsRatePct ?? null,
      netWorth: dashboardData.netWorth ?? null,
      yearlyIncome,
      // CONSUMEER het canonieke bundelveld (12-mnd rolling, lib/expense-rate.ts).
      // Was `dailyExpenseRate(dashboardData.monthlyExpenses)` — precies wat het
      // veldcommentaar op `DashboardData.dailyExpenseRate` (lib/types/dashboard.ts)
      // letterlijk verbiedt: `monthlyExpenses` is de EFFECTIVE grondslag (losse
      // kalendermaand / profielschatting), dus het benchmark-rapport duidde
      // hetzelfde bedrag in andere jaren vrijheid dan de widgets ernaast.
      // `?? …` alleen voor mock-/empty-bundels zonder het additieve veld.
      dailyExpenseRate: dashboardData.dailyExpenseRate ?? dailyExpenseRate(dashboardData.monthlyExpenses),
    }

    const report = buildBenchmarkReport({
      user: userMetrics,
      cohort,
      displayName: profile?.full_name ?? null,
      generatedAt: new Date().toISOString(),
      kernelScalarEnabled,
    })

    // Korte privé-cache óver requests heen. De onderliggende loaders draaien ~40-48
    // DB-queries + de rekenmotor-pipeline, terwijl profiel/vermogen/CBS-referentie
    // binnen een dag amper wijzigen. `private` = per-browser, nooit in een gedeelde/
    // CDN-cache (de response bevat eigen financiële data). Binnen de TTL serveert de
    // browser herhaalde GET's uit zijn HTTP-cache → 0 loader-queries op de server.
    // TTL = 15 min: staleness begrensd tot dat venster na een profiel-/vermogensmutatie.
    // BEWUST geen unstable_cache: de Supabase-client is cookie-/RLS-gebonden (zie
    // lib/reference-cache.ts). Spiegelt /api/local-knowledge + /api/local-chat-overview.
    return Response.json(report, {
      headers: { 'Cache-Control': 'private, max-age=900' },
    })
  } catch (error) {
    console.error('Benchmark generation error:', error)
    return Response.json(
      { error: 'Benchmark genereren mislukt. Probeer het later opnieuw.' },
      { status: 500 },
    )
  }
}
