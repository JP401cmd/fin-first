import type { SupabaseClient } from '@supabase/supabase-js'
import type { AIDomain } from '@/lib/ai/dna'
import { freedomCalcTool } from './freedom-calc'
import { createLookupTool } from './lookup'
import { suggestActionTool } from './suggest-action'

/**
 * Get the tool set for a given domain.
 * All domains share the base tools; domain-specific tools can be added here.
 */
export function getTools(domain: AIDomain, supabase: SupabaseClient) {
  const base = {
    freedomCalc: freedomCalcTool,
    lookup: createLookupTool(supabase),
  }

  if (domain === 'wil') {
    return { ...base, suggestAction: suggestActionTool }
  }

  return base
}
