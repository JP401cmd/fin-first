import type { SupabaseClient } from '@supabase/supabase-js'
import { computeCoreData, type FinancialInput } from '@/lib/core-metrics'
import { loadCoreData } from '@/lib/core-data-loader'
import { section, formatCurrency, formatFreedomTime, formatPercentage } from './formatter'

const TEMPORAL_LABELS: Record<number, string> = {
  1: 'De Levensgenieter (level 1) — Comfort > Snelheid',
  2: 'De Reiziger (level 2) — Spaart wat overblijft, ervaringen eerst',
  3: 'De Architect (level 3) — Optimaliseert bewust, gulden middenweg',
  4: 'De Stoïcijn (level 4) — Snelheid > Comfort, streng en doelgericht',
  5: 'De Essentialist (level 5) — Minimalistisch voor maximale snelheid',
}

/**
 * Shared context available to all domains:
 * profile overview, net worth, freedom calculation.
 *
 * Egress-reductie (jun 2026): alle financiële kerngetallen komen uit
 * `loadCoreData` (React-cached, dezelfde bron als de app-pagina's) in
 * plaats van zes eigen queries die functioneel overlapten. Dat scheelt
 * per chatbericht ~6 PostgREST-calls én garandeert dat Will exact
 * dezelfde getallen ziet als de gebruiker op /core en /overzicht
 * (single-source-of-truth). Alleen de drie profielvelden die niet in
 * `CorePageData` zitten (temporal_balance, household_type,
 * financial_context) worden nog los opgehaald — RLS scopet naar de
 * eigen rij.
 */
export async function buildSharedContext(supabase: SupabaseClient): Promise<string> {
  const [coreData, profileResult] = await Promise.all([
    loadCoreData(supabase),
    supabase
      .from('profiles')
      .select('temporal_balance, household_type, financial_context')
      .maybeSingle(),
  ])

  const profile = profileResult.data
  const { rawFinancials } = coreData
  const totalAssets = rawFinancials.totalAssets
  const totalDebts = rawFinancials.totalDebts

  const monthlyMustExpenses = rawFinancials.yearlyMustExpenses > 0
    ? Math.round(rawFinancials.yearlyMustExpenses / 12)
    : 0
  const yearlyRetirementExpenses = rawFinancials.yearlyRetirementExpenses ?? 0
  const monthlyRetirementExpenses = yearlyRetirementExpenses > 0
    ? Math.round(yearlyRetirementExpenses / 12)
    : 0

  // If no financial data at all, return minimal context
  if (totalAssets === 0 && totalDebts === 0 && !coreData.hasTransactions) {
    return section('FINANCIEEL OVERZICHT', 'Nog geen financiële data beschikbaar. Vraag de gebruiker om assets, schulden of transacties toe te voegen.')
  }

  // Build identity section from profile + core data
  const temporal = TEMPORAL_LABELS[profile?.temporal_balance ?? 3] ?? TEMPORAL_LABELS[3]
  const identityLines = [
    coreData.userName ? `Naam: ${coreData.userName}` : null,
    coreData.currentAge ? `Leeftijd: ${coreData.currentAge} jaar` : null,
    `Huishoudtype: ${profile?.household_type ?? 'solo'}`,
    `Temporal Balance: ${temporal}`,
  ].filter(Boolean) as string[]
  const identitySection = section('GEBRUIKERSPROFIEL', identityLines.join('\n')) + '\n'

  const coreInput: FinancialInput = {
    totalAssets,
    totalDebts,
    monthlyIncome: rawFinancials.monthlyIncome,
    monthlyExpenses: rawFinancials.monthlyExpenses,
    yearlyMustExpenses: yearlyRetirementExpenses,
    monthlyContributions: 0,
    dateOfBirth: null,
  }
  const core = computeCoreData(coreInput, coreData.fireParams.effectiveSwr)

  const lines = [
    `Netto vermogen: ${formatCurrency(core.netWorth)}`,
    `Vrijgekochte tijd: ${formatFreedomTime(core.freedomYears, core.freedomMonths)}`,
    `Vrijheids-%: ${formatPercentage(core.freedomPercentage)}`,
    `FIRE-doel: ${formatCurrency(core.fireTarget)}`,
    `Verwachte FIRE-datum: ${core.expectedFireDate || 'onbekend'}`,
    `Maandinkomen: ${formatCurrency(rawFinancials.monthlyIncome)} | Maanduitgaven: ${formatCurrency(rawFinancials.monthlyExpenses)}`,
    monthlyMustExpenses > 0 ? `Must-uitgaven (essentieel): ${formatCurrency(monthlyMustExpenses)}/mnd` : null,
    monthlyRetirementExpenses > 0 ? `Jaarlijkse uitgave na retirement: ${formatCurrency(monthlyRetirementExpenses)}/mnd (methode: ${coreData.retirementMethodUsed}) — basis voor FIRE & vrijheidsdagen` : null,
    `Spaarquote: ${formatPercentage(coreData.savingsRate6m)} — canonieke 6-maands spaarquote incl. sparen in budgetten + schuldaflossing (exact hetzelfde getal als onderaan de cashflow-pagina). Gebruik dit getal letterlijk; herbereken het NIET uit inkomen/uitgaven.`,
    `Dagen vrijheid verdiend per maand: ${core.daysWonPerMonth}`,
    `Vrije dagen per jaar (passief inkomen): ${core.freeDaysPerYear}`,
    `Autonomiescore: ${core.autonomyScore}`,
    `Dagelijkse uitgaven: ${formatCurrency(Math.round(core.yearlyExpenses / 365))}`,
    `Budgettering: ${coreData.budgetingActive !== false ? 'actief' : 'NIET actief — gebruiker budgetteert niet. Doe GEEN budget-gerelateerde voorstellen.'}`,
  ]

  // Add supplementary context from free-text financial description (news-only onboarding)
  const contextSection = profile?.financial_context
    ? '\n' + section('AANVULLENDE CONTEXT', profile.financial_context)
    : ''

  return identitySection + section('FINANCIEEL OVERZICHT', (lines.filter(Boolean) as string[]).join('\n')) + contextSection
}
