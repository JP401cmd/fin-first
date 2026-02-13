/**
 * Multi-step Zod schemas and prompt builders for AI-generated onboarding data.
 *
 * The AI generates financial data in 4 sequential steps, each with its own
 * schema. Later steps receive compact summaries of earlier outputs as context.
 * This avoids exceeding structured output grammar limits (~77 fields single).
 *
 * Budget structure uses the fixed makeBudgets() function with AI-provided
 * amounts as overrides — eliminates slug mismatch risk.
 */

import { z } from 'zod'
import { BUDGET_SLUGS } from '@/lib/budget-data'

// ── Onboarding input (per-topic descriptions from user) ──────

export const onboardingInputSchema = z.object({
  descriptions: z.object({
    profile: z.string().min(20),
    assets: z.string().default(''),
    spending: z.string().default(''),
    goals: z.string().default(''),
  }),
})

export type OnboardingInput = z.infer<typeof onboardingInputSchema>

// ── Shared constants ─────────────────────────────────────────

const allBudgetSlugs = Object.values(BUDGET_SLUGS)

const SHARED_INSTRUCTIONS = `## Budget slugs (gebruik EXACT deze waarden)
${allBudgetSlugs.map(s => `- ${s}`).join('\n')}

## Asset types
savings, investment, retirement, eigen_huis, real_estate, crypto, vehicle, physical, other

## Debt types
mortgage, personal_loan, student_loan, car_loan, credit_card, revolving_credit, payment_plan, other

## Recommendation types
budget_optimization, asset_reallocation, debt_acceleration, income_increase, savings_boost

## Life event types
sabbatical, world_trip, children, renovation, study, career_change, part_time, early_retirement, move, wedding, custom, house_purchase, car_purchase, inheritance, side_hustle

## Lucide icon namen voor goals/events
Target, TrendingUp, ShieldCheck, GraduationCap, Home, Briefcase, Palmtree, Sunset, CreditCard, PiggyBank, Infinity, HeartCrack, LifeBuoy, PartyPopper`

// ── Step 1: Profiel & bankrekeningen ─────────────────────────

export const aiStep1Schema = z.object({
  profile: z.object({
    full_name: z.string(),
    date_of_birth: z.string().describe('ISO date YYYY-MM-DD'),
    household_type: z.enum(['solo', 'samen', 'gezin']),
    temporal_balance: z.number().describe('Integer 1-5: 1=hedonist, 3=balanced, 5=essentialist'),
    net_monthly_salary: z.number(),
    partner_income: z.number().describe('0 if no partner'),
  }),

  budget_amounts: z.array(z.object({
    slug: z.string(),
    amount: z.number(),
  })),

  bank_accounts: z.array(z.object({
    name: z.string(),
    iban: z.string(),
    bank_name: z.string(),
    account_type: z.enum(['checking', 'savings']),
    balance: z.number(),
    is_active: z.boolean(),
    sort_order: z.number(),
  })),
})

export type AIStep1Output = z.infer<typeof aiStep1Schema>

// ── Step 2: Bezittingen & schulden ───────────────────────────

export const aiStep2Schema = z.object({
  assets: z.array(z.object({
    name: z.string(),
    asset_type: z.enum(['savings', 'investment', 'retirement', 'eigen_huis', 'real_estate', 'crypto', 'vehicle', 'physical', 'other']),
    current_value: z.number(),
    purchase_value: z.number(),
    purchase_date: z.string(),
    expected_return: z.number(),
    monthly_contribution: z.number(),
    institution: z.string(),
  })),

  debts: z.array(z.object({
    name: z.string(),
    debt_type: z.enum(['mortgage', 'personal_loan', 'student_loan', 'car_loan', 'credit_card', 'revolving_credit', 'payment_plan', 'other']),
    original_amount: z.number(),
    current_balance: z.number(),
    interest_rate: z.number(),
    minimum_payment: z.number(),
    monthly_payment: z.number(),
    start_date: z.string(),
    creditor: z.string(),
  })),
})

export type AIStep2Output = z.infer<typeof aiStep2Schema>

// ── Step 3: Transacties ──────────────────────────────────────

export const aiStep3Schema = z.object({
  transactions: z.array(z.object({
    dayOffset: z.number().describe('Days ago from today'),
    amount: z.number().describe('Positive=income, negative=expense'),
    description: z.string(),
    counterparty_name: z.string(),
    counterparty_iban: z.string(),
    budgetSlug: z.string(),
    is_income: z.boolean(),
  })),
})

export type AIStep3Output = z.infer<typeof aiStep3Schema>

// ── Step 4: Doelen, levensgebeurtenissen & aanbevelingen ─────

export const aiStep4Schema = z.object({
  goals: z.array(z.object({
    name: z.string(),
    description: z.string(),
    goal_type: z.string(),
    target_value: z.number(),
    current_value: z.number(),
    target_date: z.string(),
    icon: z.string(),
    color: z.string(),
    is_completed: z.boolean(),
  })),

  life_events: z.array(z.object({
    name: z.string(),
    event_type: z.enum(['sabbatical', 'world_trip', 'children', 'renovation', 'study', 'career_change', 'part_time', 'early_retirement', 'move', 'wedding', 'custom', 'house_purchase', 'car_purchase', 'inheritance', 'side_hustle']),
    target_age: z.number().describe('0 if unknown'),
    target_date: z.string().describe('empty string if unknown'),
    one_time_cost: z.number(),
    monthly_cost_change: z.number(),
    monthly_income_change: z.number(),
    duration_months: z.number(),
    icon: z.string(),
    is_active: z.boolean(),
    sort_order: z.number(),
  })),

  recommendations: z.array(z.object({
    title: z.string(),
    description: z.string(),
    recommendation_type: z.enum(['budget_optimization', 'asset_reallocation', 'debt_acceleration', 'income_increase', 'savings_boost']),
    euro_impact_monthly: z.number(),
    euro_impact_yearly: z.number(),
    freedom_days_per_year: z.number(),
    related_budget_slug: z.string().describe('Empty string if none'),
    priority_score: z.number().describe('Integer 1-5'),
    status: z.enum(['pending', 'accepted', 'rejected', 'postponed', 'expired']),
    actions: z.array(z.object({
      title: z.string(),
      description: z.string(),
      freedom_days_impact: z.number(),
      euro_impact_monthly: z.number(),
      priority_score: z.number().describe('Integer 1-5'),
    })),
  })),

  net_worth_snapshots: z.array(z.object({
    monthsAgo: z.number(),
    total_assets: z.number(),
    total_debts: z.number(),
    net_worth: z.number(),
  })),
})

export type AIStep4Output = z.infer<typeof aiStep4Schema>

// ── Merged type (used by convertAIOutputToPersona) ───────────

export type AIPersonaOutput = AIStep1Output & AIStep2Output & AIStep3Output & AIStep4Output

// ── Prompt builders ──────────────────────────────────────────

const EMPTY_FALLBACK = 'Geen specifieke input gegeven. Genereer realistische aannames passend bij het profiel uit eerdere stappen.'

function descriptionOrFallback(description: string): string {
  return description.trim() || EMPTY_FALLBACK
}

const BASE_PERSONA = `Je bent een Nederlandse financieel data-generator voor de app TriFinity.
De gebruiker beantwoordt gerichte vragen over zijn/haar financiele situatie. Jij interpreteert dit en genereert realistische financiele data.

## Algemene regels
- Gebruik Nederlandse banknamen (ING, ABN AMRO, Rabobank, etc.)
- IBAN formaat: NL + 2 cijfers + 4 letters (bankcode) + 10 cijfers
- Alle datums in YYYY-MM-DD formaat
- partner_income = 0 als er geen partner is
- Maak bedragen consistent (inkomen - uitgaven = spaarratio)
- Houd rekening met temporal_balance: 1-2 = meer lifestyle, 4-5 = meer sparen`

export function buildStep1Prompt(description: string): string {
  return `${BASE_PERSONA}

## Taak: Stap 1 — Profiel, budgetten & bankrekeningen
Genereer het profiel (naam, geboortedatum, huishoudtype, temporal_balance, inkomen), budget-bedragen voor alle budget slugs, en bankrekeningen.

## Gebruikersbeschrijving over profiel & inkomen
${description}

## Instructies
1. Interpreteer de beschrijving en leid profiel af (naam, leeftijd, huishoudtype, inkomen)
2. Schat temporal_balance in (1=hedonist, 3=balanced, 5=essentialist)
3. Verdeel het inkomen over alle budget slugs — zorg dat uitgaven + sparen ≈ inkomen
4. Genereer 2-4 bankrekeningen (checking + savings) met realistische saldo's

${SHARED_INSTRUCTIONS}`
}

export function buildStep2Prompt(description: string, step1: AIStep1Output): string {
  const { profile, budget_amounts, bank_accounts } = step1
  const totalIncome = profile.net_monthly_salary + profile.partner_income
  const topBudgets = budget_amounts
    .filter(b => b.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8)
    .map(b => `${b.slug}: €${b.amount}`)
    .join(', ')
  const accounts = bank_accounts.map(a => `${a.name} (${a.bank_name}): €${a.balance}`).join(', ')

  return `${BASE_PERSONA}

## Taak: Stap 2 — Bezittingen & schulden
Genereer assets en debts passend bij het profiel.

## Gebruikersbeschrijving over vermogen & schulden
${descriptionOrFallback(description)}

## Context uit stap 1
- Naam: ${profile.full_name}, geboren: ${profile.date_of_birth}, huishouden: ${profile.household_type}
- Netto inkomen: €${totalIncome}/mnd (salaris: €${profile.net_monthly_salary}, partner: €${profile.partner_income})
- Temporal balance: ${profile.temporal_balance}/5
- Budget top-8: ${topBudgets}
- Bankrekeningen: ${accounts}

## Instructies
1. Genereer realistische bezittingen passend bij levensfase en inkomen
2. Genereer schulden die passen bij het profiel (hypotheek, studielening, etc.)
3. Datums in YYYY-MM-DD formaat
4. Gebruik realistische Nederlandse instituties

${SHARED_INSTRUCTIONS}`
}

export function buildStep3Prompt(description: string, step1: AIStep1Output, step2: AIStep2Output): string {
  const { profile, budget_amounts, bank_accounts } = step1
  const { assets, debts } = step2
  const totalIncome = profile.net_monthly_salary + profile.partner_income
  const budgetSlugs = budget_amounts.map(b => b.slug).join(', ')
  const ibans = bank_accounts.map(a => `${a.name}: ${a.iban}`).join(', ')
  const assetSummary = assets.map(a => `${a.name}: €${a.current_value}`).join(', ')
  const debtSummary = debts.map(d => `${d.name}: €${d.monthly_payment}/mnd`).join(', ')

  return `${BASE_PERSONA}

## Taak: Stap 3 — Transactiehistorie
Genereer 6 maanden transactiehistorie (dayOffset 0-180). ~15-25 transacties per maand.

## Gebruikersbeschrijving over uitgaven & leefstijl
${descriptionOrFallback(description)}

## Context uit eerdere stappen
- ${profile.full_name}, inkomen €${totalIncome}/mnd, temporal_balance: ${profile.temporal_balance}/5
- IBANs: ${ibans}
- Assets: ${assetSummary || 'geen'}
- Schulden: ${debtSummary || 'geen'}
- Beschikbare budget slugs: ${budgetSlugs}

## Instructies
1. Genereer ~15-25 transacties per maand (mix van vast en variabel)
2. Transaction amounts: positief voor inkomen, negatief voor uitgaven
3. Gebruik realistische Nederlandse tegenpartijen (Albert Heijn, Jumbo, NS, Bol.com, etc.)
4. counterparty_iban mag "UNKNOWN" zijn als niet relevant
5. budgetSlug moet EXACT een van de budget slugs zijn
6. Bedragen moeten consistent zijn met de budget amounts
7. Vaste lasten (huur, energie, verzekeringen) elke maand op vergelijkbare dagen

${SHARED_INSTRUCTIONS}`
}

export function buildStep4Prompt(description: string, step1: AIStep1Output): string {
  const { profile, budget_amounts, bank_accounts } = step1
  const totalIncome = profile.net_monthly_salary + profile.partner_income
  const totalSavings = bank_accounts
    .filter(a => a.account_type === 'savings')
    .reduce((s, a) => s + a.balance, 0)
  const savingsAmount = budget_amounts
    .filter(b => ['sparen-noodbuffer', 'investeren-fire'].includes(b.slug))
    .reduce((s, b) => s + b.amount, 0)
  const housingBudget = budget_amounts.find(b => b.slug === 'woonlasten')?.amount ?? 0

  return `${BASE_PERSONA}

## Taak: Stap 4 — Doelen, levensgebeurtenissen & aanbevelingen
Genereer goals, life_events, recommendations (met actions), en net_worth_snapshots.

## Gebruikersbeschrijving over doelen & toekomst
${descriptionOrFallback(description)}

## Context uit stap 1 (profiel & budgetten)
- ${profile.full_name}, geboren: ${profile.date_of_birth}, huishouden: ${profile.household_type}
- Netto inkomen: €${totalIncome}/mnd, temporal_balance: ${profile.temporal_balance}/5
- Maandelijks sparen/beleggen: €${savingsAmount}
- Woonlasten budget: €${housingBudget}/mnd
- Spaarsaldo op bankrekeningen: €${totalSavings}

## Instructies
1. Genereer 2-3 doelen passend bij de levensfase
2. Genereer 2 relevante levensgebeurtenissen
3. Genereer 2-3 aanbevelingen met concrete acties (elk 1-3 actions)
4. Genereer 6 net_worth_snapshots (monthsAgo 5 t/m 0) — schat totaal vermogen en schulden in op basis van het profiel, inkomen, leeftijd en woonlasten. Maak realistische aannames.
5. target_age = 0 en target_date = "" als onbekend bij life_events
6. related_budget_slug = "" als niet van toepassing bij recommendations
7. priority_score is een integer 1-5

${SHARED_INSTRUCTIONS}`
}
