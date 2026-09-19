import type { AIDomain } from './types'
import { leesBeheerInstelling } from '@/lib/app-settings/beheer-instelling'
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
 *
 * Met `overrideUitBeheer` vervangt een beheerder-override in `app_settings`
 * (`ai_system_prompt_override`) het VOLLEDIGE prompt (base + domein). Die
 * override is beheer-content en wordt server-side via de service-role gelezen
 * (`lib/app-settings/beheer-instelling.ts`, ADR 0163) — niet via de
 * sessie-client, want de allowlist-policy laat gebruikers die sleutel bewust
 * niet lezen. Zonder de vlag (tests, tooling) altijd het in-code prompt.
 */
export async function buildSystemPrompt(
  domain: AIDomain,
  opts: { overrideUitBeheer?: boolean } = {},
): Promise<string> {
  if (opts.overrideUitBeheer) {
    const override = await leesBeheerInstelling('ai_system_prompt_override')
    if (override) return override // Override = volledig prompt
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
