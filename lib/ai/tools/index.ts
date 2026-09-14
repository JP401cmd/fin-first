import type { SupabaseClient } from '@supabase/supabase-js'
import type { ToolSet } from 'ai'
import type { AIDomain, ChatContext } from '@/lib/ai/dna'
import { createFreedomCalcTool } from './freedom-calc'
import { createLookupTool } from './lookup'
import { suggestActionTool } from './suggest-action'
import { suggestLifeEventTool } from './suggest-life-event'
import { showVisualizationTool } from './show-visualization'
import { createSuggestRecommendationTool } from './suggest-recommendation'

/**
 * Get the tool set for a given domain.
 * Standaard tools krijgen alle domeinen — Fin is de enige assistent.
 *
 * Voor de gebeurtenis-context (de Fin-chat in de levensgebeurtenis-pane) voegen
 * we suggestLifeEvent toe en LATEN we suggestRecommendation weg: voorstellen horen
 * in de hoofdchat, niet in de pane waar de gebruiker een gebeurtenis uitwerkt.
 */
export function getTools(
  _domain: AIDomain,
  supabase: SupabaseClient,
  context?: ChatContext,
  userId?: string | null,
): ToolSet {
  const base: ToolSet = {
    // Per request: leest het canonieke dagtarief server-side (B-040).
    freedomCalc: createFreedomCalcTool(supabase),
    lookup: createLookupTool(supabase),
    showVisualization: showVisualizationTool,
  }

  if (context === 'gebeurtenis') {
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
