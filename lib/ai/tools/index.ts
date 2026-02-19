import type { SupabaseClient } from '@supabase/supabase-js'
import type { AIDomain } from '@/lib/ai/dna'
import { freedomCalcTool } from './freedom-calc'
import { createLookupTool } from './lookup'
import { suggestActionTool } from './suggest-action'

/**
 * Get the tool set for a given domain.
 * All domains get all tools including suggestAction (Will is the sole assistant).
 */
export function getTools(_domain: AIDomain, supabase: SupabaseClient) {
  return {
    freedomCalc: freedomCalcTool,
    lookup: createLookupTool(supabase),
    suggestAction: suggestActionTool,
  }
}
