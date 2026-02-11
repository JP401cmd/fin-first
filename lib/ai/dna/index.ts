import type { SupabaseClient } from '@supabase/supabase-js'
import type { AIDomain } from './types'
import { BASE_SYSTEM_PROMPT } from './base'
import { KERN_PROMPT } from './kern'
import { WIL_PROMPT } from './wil'
import { HORIZON_PROMPT } from './horizon'

export { type AIDomain, type DomainPersonality } from './types'
export { KERN_PERSONALITY } from './kern'
export { WIL_PERSONALITY } from './wil'
export { HORIZON_PERSONALITY } from './horizon'

const DOMAIN_PROMPTS: Record<AIDomain, string> = {
  kern: KERN_PROMPT,
  wil: WIL_PROMPT,
  horizon: HORIZON_PROMPT,
}

export async function buildSystemPrompt(domain: AIDomain, supabase?: SupabaseClient): Promise<string> {
  let basePrompt = BASE_SYSTEM_PROMPT

  if (supabase) {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'ai_system_prompt_override')
      .single()

    if (data?.value) {
      basePrompt = data.value
    }
  }

  return basePrompt + '\n' + DOMAIN_PROMPTS[domain]
}
