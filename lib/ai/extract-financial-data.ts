// ── Financial Data Extraction — AI-powered structured extraction from free text ──
//
// Extracts structured financial data (assets, debts, life events, income/expenses)
// from a short free-text description of someone's financial situation.
//
// Used by the "News Only" onboarding flow where users describe their finances
// in natural language (max 500 chars) instead of filling in forms.
//
// Designed to fail gracefully: on AI error it returns an empty result
// rather than throwing, so the onboarding flow can continue.

import { generateObject } from 'ai'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getModel } from '@/lib/ai/config'
import { DEFAULT_EXTRACTION_PROMPT } from '@/lib/ai/extraction-system-prompt'

// ── Zod Schema ──────────────────────────────────────────────────

const extractionSchema = z.object({
  assets: z.array(
    z.object({
      name: z.string().describe('Korte beschrijvende naam, bijv. "Koopwoning", "Spaarrekening", "ETF-portefeuille"'),
      asset_type: z
        .enum([
          'cash',
          'savings',
          'investment',
          'retirement',
          'eigen_huis',
          'real_estate',
          'crypto',
          'vehicle',
          'physical',
          'other',
        ])
        .describe('Type bezitting, kies de meest passende categorie'),
      estimated_value: z.number().describe('Geschatte waarde in euro'),
      expected_return: z.number().describe('Verwacht jaarlijks rendement in %, bijv. 7 voor aandelen, 2.5 voor sparen, 3.5 voor eigen huis'),
      monthly_contribution: z.number().describe('Maandelijkse inleg in euro, 0 als niet genoemd'),
      is_liquid: z.boolean().describe('Is de bezitting liquide (snel beschikbaar)?'),
      subtype: z.string().nullable().describe('Subtype als van toepassing, bijv. "checking" voor cash, "savings_account" voor spaarrekening'),
    }),
  ),
  debts: z.array(
    z.object({
      name: z.string().describe('Korte beschrijvende naam, bijv. "Hypotheek", "Studieschuld DUO"'),
      debt_type: z
        .enum([
          'mortgage',
          'personal_loan',
          'student_loan',
          'car_loan',
          'credit_card',
          'revolving_credit',
          'payment_plan',
          'belastingschuld',
          'familielening',
          'other',
        ])
        .describe('Type schuld, kies de meest passende categorie'),
      estimated_balance: z.number().describe('Geschat openstaand saldo in euro'),
      interest_rate: z.number().describe('Jaarlijkse rente in %, gebruik standaard marktrente als niet genoemd'),
      monthly_payment: z.number().describe('Geschatte maandelijkse aflossing in euro, gebruik standaard als niet genoemd'),
      is_tax_deductible: z.boolean().nullable().describe('Is de rente fiscaal aftrekbaar? true voor hypotheek, null als onbekend'),
      subtype: z.string().nullable().describe('Subtype als van toepassing, bijv. "annuiteit" voor hypotheek, "nieuw_stelsel" voor DUO'),
    }),
  ),
  life_events: z.array(
    z.object({
      name: z.string().describe('Naam van de gebeurtenis, bijv. "Kind krijgen", "Stoppen met werken"'),
      event_type: z.string().describe('Type-slug zoals huis_kopen, kind, pensioen, aow, sabbatical, emigratie'),
      target_age: z.number().nullable().describe('Leeftijd waarop dit gepland is, of null als onbekend'),
      description: z.string().describe('Korte beschrijving van het plan'),
      one_time_cost: z.number().describe('Geschatte eenmalige kosten in euro, 0 als niet van toepassing'),
      monthly_cost_change: z.number().describe('Geschatte maandelijkse kostenwijziging in euro (positief = hogere kosten)'),
      monthly_income_change: z.number().describe('Geschatte maandelijkse inkomenswijziging in euro (positief = meer inkomen, negatief = minder)'),
      duration_months: z.number().describe('Duur in maanden, 0 = permanent'),
      icon: z.string().describe('Lucide icon naam, bijv. Baby voor kind, Home voor huis, GraduationCap voor studie, Plane voor emigratie, Heart voor trouwen'),
    }),
  ),
  monthly_income_estimate: z
    .number()
    .nullable()
    .describe('Geschat netto maandinkomen in euro, null als niet genoemd'),
  monthly_expenses_estimate: z
    .number()
    .nullable()
    .describe('Geschatte maandelijkse uitgaven in euro, null als niet genoemd'),
  financial_context_remainder: z
    .string()
    .describe('Overige relevante context die niet in gestructureerde velden past, lege string als er niets overblijft'),
})

// ── Exported Type ───────────────────────────────────────────────

export type ExtractionResult = z.infer<typeof extractionSchema>

// ── Empty Result ────────────────────────────────────────────────

/** Fallback result returned when extraction fails or input is empty */
const EMPTY_RESULT: ExtractionResult = {
  assets: [],
  debts: [],
  life_events: [],
  monthly_income_estimate: null,
  monthly_expenses_estimate: null,
  financial_context_remainder: '',
}

// ── Main Extraction Function ────────────────────────────────────

/**
 * Extracts structured financial data from a free-text description.
 *
 * Uses AI (via the project's configured model) to parse natural language
 * into assets, debts, life events, and income/expense estimates.
 *
 * The system prompt can be overridden via app_settings key
 * 'extraction_system_prompt'; otherwise the hardcoded default is used.
 *
 * @param supabase  Authenticated Supabase client (for model resolution + prompt override)
 * @param text      Free-text financial description (max ~500 chars)
 * @param profileContext  Optional known profile data to help the AI resolve relative dates
 * @returns Structured extraction result, or empty result on failure
 */
export async function extractFinancialData(
  supabase: SupabaseClient,
  text: string,
  profileContext: {
    age?: number
    householdType?: string
    monthlyIncome?: number
    monthlyExpenses?: number
  } = {},
): Promise<ExtractionResult> {
  // Skip extraction for empty or too-short input
  if (!text || text.trim().length < 10) {
    console.log('[extract-financial-data] Input too short, returning empty result')
    return EMPTY_RESULT
  }

  try {
    // Resolve the AI model from project settings
    const model = await getModel(supabase)

    // Check for admin-configured prompt override, fall back to hardcoded default
    const { data: overrideRow } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'extraction_system_prompt')
      .single()
    const systemPrompt = overrideRow?.value || DEFAULT_EXTRACTION_PROMPT

    // Build the user prompt with profile context for age-relative calculations
    const contextParts: string[] = []
    if (profileContext.age != null) {
      contextParts.push(`Leeftijd: ${profileContext.age} jaar`)
    }
    if (profileContext.householdType) {
      contextParts.push(`Huishoudtype: ${profileContext.householdType}`)
    }
    if (profileContext.monthlyIncome != null) {
      contextParts.push(`Bekend maandinkomen: ${profileContext.monthlyIncome}`)
    }
    if (profileContext.monthlyExpenses != null) {
      contextParts.push(`Bekende maanduitgaven: ${profileContext.monthlyExpenses}`)
    }

    const contextBlock =
      contextParts.length > 0
        ? `Profielcontext:\n${contextParts.join('\n')}\n\n`
        : ''

    const userPrompt = `${contextBlock}Beschrijving van de financiële situatie:\n${text.trim()}`

    console.log('[extract-financial-data] Starting extraction, text length:', text.trim().length)

    const { object } = await generateObject({
      model,
      schema: extractionSchema,
      system: systemPrompt,
      prompt: userPrompt,
    })

    console.log(
      '[extract-financial-data] Extraction complete:',
      `${object.assets.length} assets,`,
      `${object.debts.length} debts,`,
      `${object.life_events.length} life events`,
    )

    return object
  } catch (err) {
    console.error(
      '[extract-financial-data] Extraction failed:',
      err instanceof Error ? err.message : err,
    )
    return EMPTY_RESULT
  }
}
