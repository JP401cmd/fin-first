import type { SupabaseClient } from '@supabase/supabase-js'
import { computeCoreData, computeFreedomProgressWithBasis, inclHomeTargetFromScalar, type FinancialInput } from '@/lib/core-metrics'
import { loadCoreData } from '@/lib/core-data-loader'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import {
  deriveHousingContext,
  getFireEligibleNetWorth,
  parseHousingStrategy,
  isHomeExcludedFromFire,
} from '@/lib/housing-strategy'
import { isFinanciallyFree } from '@/lib/fire-strategy'
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
      .select('temporal_balance, household_type, financial_context, housing_strategy_config')
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

  // Vrijheids-% op de canonieke grondslag (ADR 0009): FIRE-eligible vermogen
  // (eigen woning gefilterd via de housing-strategie) ÷ benodigde portfolio uit
  // de unified projection. Dit is exact dezelfde teller/noemer als de "nog X
  // jaar"-aftelling op /overzicht en /toekomst, zodat Will nooit "100% op weg"
  // beweert terwijl de UI <100% en "nog jaren" toont. `computeCoreData`'s eigen
  // `freedomPercentage` (vol netto vermogen incl. huis ÷ simpel fireTarget) is
  // bewust NIET de bron — alleen een laatste fallback voor het FIRE-doelbedrag.
  const housingStrategy = parseHousingStrategy(profile?.housing_strategy_config)
  const housingContext = deriveHousingContext(
    (coreData.fullAssets ?? []) as Asset[],
    (coreData.fullDebts ?? []) as Debt[],
  )
  const fireEligibleNetWorth = getFireEligibleNetWorth(core.netWorth, housingContext, housingStrategy)
  // Noemer: benodigde portfolio uit de unified projection (zelfde getal als de
  // loaders gebruiken). Valt terug op het strategie-loze fireTarget wanneer de
  // projectie niet kon draaien (geen geboortedatum / geen jaaruitgaven).
  const requiredPortfolio = coreData.fireTargetFromHorizon ?? (core.fireTarget > 0 ? core.fireTarget : null)
  // Grondslag-keuze (ADR 0009 herzien): standaard telt de eigen woning mee →
  // INCL.-woning grondslag (teller = volledig netto vermogen, noemer = incl.-doel
  // via scalar-fallback). Alleen bij exclude_from_fire → EXCL. (liquide).
  const homeExcludedFromFire = housingContext.hasEigenHuis && isHomeExcludedFromFire(housingStrategy)
  const requiredNetWorthInclHome = inclHomeTargetFromScalar(requiredPortfolio, core.netWorth, fireEligibleNetWorth)
  const freedomPercentage = computeFreedomProgressWithBasis({
    homeExcludedFromFire,
    netWorthInclHome: core.netWorth,
    fireEligibleNetWorth,
    requiredNetWorthInclHome,
    requiredPortfolioExclHome: requiredPortfolio,
  })
  // FIRE-doel op DEZELFDE grondslag als het Vrijheids-% (incl. woning tenzij
  // uitgesloten), met fallback op het simpele fireTarget.
  const displayFireGoal = homeExcludedFromFire
    ? requiredPortfolio
    : (requiredNetWorthInclHome ?? requiredPortfolio)

  const lines = [
    `Netto vermogen: ${formatCurrency(core.netWorth)}`,
    `Vrijgekochte tijd: ${formatFreedomTime(core.freedomYears, core.freedomMonths)}`,
    `Vrijheids-%: ${formatPercentage(freedomPercentage)}`,
    // Toon het FIRE-doel op dezelfde grondslag als het Vrijheids-% — zo zijn
    // teller, noemer en doelbedrag onderling consistent.
    `FIRE-doel: ${formatCurrency(displayFireGoal ?? core.fireTarget)}`,
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
    // Levensfase-signaal (consume-only, ADR 0009): wanneer de gebruiker AL
    // financieel vrij is (vrijheids-% ≥ 100 of leeftijd voorbij vrijheidsleeftijd)
    // moet Will coachen op behoud/onttrekking i.p.v. "eerder vrij worden". Afgeleid
    // via de canonieke `isFinanciallyFree`-vlag uit reeds-in-context getallen
    // (freedomPercentage + currentAge); geen nieuwe data naar het model.
    isFinanciallyFree({ freedomPct: freedomPercentage, currentAge: coreData.currentAge ?? null, fireAge: null })
      ? 'Levensfase: gebruiker is AL financieel vrij / met pensioen — coach op behoud en onttrekking (hoe lang gaat het vermogen mee, kosten laag houden), NIET op "eerder vrij worden" of sneller sparen. De FIRE-datum en het vrijheids-% zijn bereikt.'
      : null,
  ]

  // Add supplementary context from free-text financial description (news-only onboarding)
  const contextSection = profile?.financial_context
    ? '\n' + section('AANVULLENDE CONTEXT', profile.financial_context)
    : ''

  return identitySection + section('FINANCIEEL OVERZICHT', (lines.filter(Boolean) as string[]).join('\n')) + contextSection
}
