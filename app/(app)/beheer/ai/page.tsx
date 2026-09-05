import { createClient } from '@/lib/supabase/server'
import { loadAiHealth } from '@/lib/ai/ai-health-loader'
import { AiStatusCard } from '@/components/app/beheer/ai-status-card'
import { AiSettingsClient } from '@/components/app/beheer/ai-settings-client'

/**
 * Server-wrapper (ADR 0058: lezen via loader). De statuskaart (UR3-09 / ADR
 * 0132) toont ALTIJD de huidige AI-gezondheid, ook bij 'Werkt' — de client-form
 * eronder (provider/model/keys/systeemprompt) is ongewijzigd verhuisd naar
 * `AiSettingsClient`.
 */
export default async function BeheerAIPage() {
  const supabase = await createClient()
  const health = await loadAiHealth(supabase)

  return (
    <div>
      <AiStatusCard health={health} />
      <AiSettingsClient />
    </div>
  )
}
