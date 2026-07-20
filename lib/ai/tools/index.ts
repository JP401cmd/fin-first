import type { SupabaseClient } from '@supabase/supabase-js'
import type { ToolSet } from 'ai'
import type { AIDomain, ChatContext } from '@/lib/ai/dna'
import { freedomCalcTool } from './freedom-calc'
import { createLookupTool } from './lookup'
import { suggestActionTool } from './suggest-action'
import { suggestLifeEventTool } from './suggest-life-event'
import { showVisualizationTool } from './show-visualization'
import { createSuggestRecommendationTool } from './suggest-recommendation'

/**
 * Get the tool set for a given domain.
 * Standaard tools krijgen alle domeinen — Fin is de enige assistent.
 *
 * Voor de whatif-context wisselen we suggestAction in voor suggestLifeEvent
 * en LATEN we suggestRecommendation weg: voorstellen horen in de hoofdchat,
 * niet in de what-if-sandbox waar de gebruiker scenario's bouwt.
 */
export function getTools(
  _domain: AIDomain,
  supabase: SupabaseClient,
  context?: ChatContext,
  userId?: string | null,
): ToolSet {
  const base: ToolSet = {
    freedomCalc: freedomCalcTool,
    lookup: createLookupTool(supabase),
    showVisualization: showVisualizationTool,
  }

  if (context === 'whatif') {
    return { ...base, suggestLifeEvent: suggestLifeEventTool, suggestAction: suggestActionTool }
  }

  const tools: ToolSet = { ...base, suggestAction: suggestActionTool }

  // suggestRecommendation alleen aanmelden als we een user-id hebben — de tool
  // schrijft naar de recommendations-tabel namens deze gebruiker (RLS).
  if (userId) {
    tools.suggestRecommendation = createSuggestRecommendationTool(supabase, userId)
  }

  return tools
}
