import type { SupabaseClient } from '@supabase/supabase-js'
import type { AIDomain } from '@/lib/ai/dna'
import { freedomCalcTool } from './freedom-calc'
import { createLookupTool } from './lookup'

/**
 * Get the tool set for a given domain.
 * All domains share the base tools; domain-specific tools can be added here.
 */
export function getTools(_domain: AIDomain, supabase: SupabaseClient) {
  return {
    freedomCalc: freedomCalcTool,
    lookup: createLookupTool(supabase),
  }
}
