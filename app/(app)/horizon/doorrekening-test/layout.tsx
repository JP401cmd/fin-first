import { createClient } from '@/lib/supabase/server'
import { parseFireStrategy } from '@/lib/fire-strategy'
import { DoorrekeningLayoutClient } from './layout-client'
import type { DoorrekeningDefaults } from './settings-context'

/**
 * Server-layout voor /horizon/doorrekening-test.
 *
 * Resolveert profile-defaults (eindstrategie, eindleeftijd, legacy) server-side
 * en geeft ze aan de client-wrapper. De client-wrapper rendert de tabs en
 * wrapt children met DoorrekeningSettingsProvider zodat alle sub-pages
 * dezelfde instellingen delen gedurende navigatie binnen deze tree.
 */
export default async function DoorrekeningTestLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('fire_end_strategy, fire_end_age, fire_legacy_amount, feature_preferences')
    .single()

  const parsed = parseFireStrategy(profile ?? {})
  const defaults: DoorrekeningDefaults = {
    endStrategy: parsed.strategy,
    endAge: parsed.endAge,
    legacyAmount: parsed.legacyAmount,
  }

  return <DoorrekeningLayoutClient defaults={defaults}>{children}</DoorrekeningLayoutClient>
}
