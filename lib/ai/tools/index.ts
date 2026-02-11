import type { AIDomain } from '@/lib/ai/dna'
import { freedomCalcTool } from './freedom-calc'
import { lookupTool } from './lookup'

/**
 * Get the tool set for a given domain.
 * All domains share the base tools; domain-specific tools can be added here.
 */
export function getTools(_domain: AIDomain) {
  return {
    freedomCalc: freedomCalcTool,
    lookup: lookupTool,
  }
}
