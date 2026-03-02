import type { SupabaseClient } from '@supabase/supabase-js'
import type { AIDomain, ChatContext } from '@/lib/ai/dna'
import { freedomCalcTool } from './freedom-calc'
import { createLookupTool } from './lookup'
import { suggestActionTool } from './suggest-action'
import { suggestLifeEventTool } from './suggest-life-event'

/**
 * Get the tool set for a given domain.
 * All domains get all tools including suggestAction (Will is the sole assistant).
 * When context is 'whatif', replace suggestAction with suggestLifeEvent
 * (actions are handled elsewhere on the what-if page).
 */
export function getTools(_domain: AIDomain, supabase: SupabaseClient, context?: ChatContext) {
  const base = {
    freedomCalc: freedomCalcTool,
    lookup: createLookupTool(supabase),
  }

  if (context === 'whatif') {
    return { ...base, suggestLifeEvent: suggestLifeEventTool }
  }

  return { ...base, suggestAction: suggestActionTool }
}
