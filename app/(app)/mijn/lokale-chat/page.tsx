import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { createClient } from '@/lib/supabase/server'
import { hasSubscription } from '@/lib/feature-registry'
import { AiSubscriptionUpsell } from '@/components/app/ai-subscription-upsell'
import { LocalChatPanel } from '@/components/mijn/local-chat-panel'
import { buildLocalChatOverview } from '@/lib/ai/local/local-chat-context'

export const metadata: Metadata = {
  title: 'Lokale chat (experimenteel) — TriFinity',
  description: 'Praat met Will volledig op je eigen apparaat — je financiële data verlaat je toestel niet.',
}

/**
 * /mijn/lokale-chat — de ON-DEVICE Will-chat (fase C1b, experimenteel).
 *
 * SERVER-SIDE GATE (drie lagen, dezelfde als de rest van de AI-functies):
 *  1. ingelogd — anders naar /login;
 *  2. AI-kill-switch (`ai_enabled`) — anders een nette uitleg, geen chat;
 *  3. 'ai'-abonnement — anders de gedeelde `AiSubscriptionUpsell`, geen chat.
 *
 * Pas als alle drie kloppen bouwt de server het compacte financiële overzicht
 * (consume-only, canonieke bronnen) en geeft het door aan de client-chat. De
 * device-gebonden checks (WebGPU-capability + of het model op DÍT toestel staat)
 * doet de client — de chat is per-toestel, dus daar is bewust géén profielkolom
 * voor (spiegelt de lokale categorisatie: het model staat lokaal, niet in je
 * account).
 *
 * GEEN CLOUD-AI: deze pagina raakt geen /api/ai/*-route. De generatie gebeurt
 * volledig on-device in de client (WebGPU/Gemma). Cloud-guardrails (sanitize/
 * PII-mask/token-logging) zijn N.V.T. (geen egress, geen kosten — ADR 0043 §5).
 */
export default async function LokaleChatPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('ai_enabled, active_subscriptions')
    .eq('id', user.id)
    .single()

  const aiEnabled = profile?.ai_enabled !== false
  const subs = (profile?.active_subscriptions as string[]) ?? []
  const hasAiTier = hasSubscription(subs, 'ai')

  return (
    <>
      <NavStackMeta title="Lokale chat" bottomBar={{ kind: 'tabs' }} />
      <div className="mx-auto max-w-3xl px-4 pt-4 sm:px-6">
        {!aiEnabled ? (
          <AiDisabledNotice />
        ) : !hasAiTier ? (
          <div className="border border-[var(--border-ed)] bg-[var(--paper)] p-4">
            <AiSubscriptionUpsell variant="panel" />
          </div>
        ) : (
          <LocalChatPanel overview={await buildLocalChatOverview(supabase)} />
        )}
      </div>
    </>
  )
}

/** Nette uitleg wanneer de AI-kill-switch (ai_enabled) uit staat — geen chat. */
function AiDisabledNotice() {
  return (
    <div className="flex items-start gap-3 border border-[var(--border-ed)] bg-[var(--subtle)] p-4">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-3)]" aria-hidden="true" />
      <p className="text-sm leading-relaxed text-[var(--ink-2)]">
        Schakel eerst <strong>AI-features</strong> in via{' '}
        <Link href="/mijn/privacy" className="font-medium text-wil-700 underline">
          Mijn → Privacy
        </Link>
        . De lokale chat is een AI-functie die volledig op je eigen apparaat draait.
      </p>
    </div>
  )
}
