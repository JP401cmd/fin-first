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
import type { SupabaseClient } from '@supabase/supabase-js'
import { getModel } from '@/lib/ai/config'
import { sanitizeForAI } from '@/lib/ai/sanitize'
import { DEFAULT_EXTRACTION_PROMPT } from '@/lib/ai/extraction-system-prompt'
// Het schema woont sinds de on-device-variant in een eigen, zod-only bestand:
// het lokale pad valideert dezelfde vorm PER ITEM (geen constrained decoding)
// en mag deze servermodule — met getModel en de provider-SDK's erachter — niet
// de browserbundel in trekken. Zie lib/ai/extraction-schema.ts.
import {
  extractionSchema,
  EMPTY_EXTRACTION_RESULT,
  type ExtractionResult,
} from '@/lib/ai/extraction-schema'

// Her-export zodat bestaande consumenten hun import niet hoeven te wijzigen.
export type { ExtractionResult }

/** Fallback result returned when extraction fails or input is empty */
const EMPTY_RESULT = EMPTY_EXTRACTION_RESULT

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
    const model = await getModel(supabase, 'document_extractie')

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

    // Strip generic PII (IBAN/e-mail/phone/address/BSN) from the free-text
    // description before it reaches the AI provider. Amounts and asset/debt
    // wording stay intact so the extraction still works.
    const safeText = sanitizeForAI(text.trim())
    const userPrompt = `${contextBlock}Beschrijving van de financiële situatie:\n${safeText}`

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
