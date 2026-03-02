import type { SupabaseClient } from '@supabase/supabase-js'
import type { AIDomain } from './types'
import { BASE_SYSTEM_PROMPT } from './base'
import { KERN_PROMPT } from './kern'
import { WIL_PROMPT } from './wil'
import { HORIZON_PROMPT } from './horizon'

export { type AIDomain, type ChatContext, type DomainPersonality } from './types'
export { KERN_PERSONALITY } from './kern'
export { WIL_PERSONALITY } from './wil'
export { HORIZON_PERSONALITY } from './horizon'

const DOMAIN_PROMPTS: Record<AIDomain, string> = {
  kern: KERN_PROMPT,
  wil: WIL_PROMPT,
  horizon: HORIZON_PROMPT,
}

/**
 * Build the system prompt for a domain.
 * If an override exists in app_settings, it replaces the FULL prompt (base + domain).
 */
export async function buildSystemPrompt(domain: AIDomain, supabase?: SupabaseClient): Promise<string> {
  if (supabase) {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'ai_system_prompt_override')
      .single()

    if (data?.value) {
      return data.value // Override = volledig prompt
    }
  }

  return BASE_SYSTEM_PROMPT + '\n' + DOMAIN_PROMPTS[domain]
}

/**
 * Get the default full prompt for a domain (base + domain-specific).
 * Used by the admin UI to show what the default looks like.
 */
export function getDefaultFullPrompt(domain: AIDomain): string {
  return BASE_SYSTEM_PROMPT + '\n' + DOMAIN_PROMPTS[domain]
}
