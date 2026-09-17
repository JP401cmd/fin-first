'use client'

import { AbonnementSection } from './abonnement-section'
import { AiCreditsSection } from './ai-credits-section'
import { AccountBasisSection } from './account-basis-section'
import { DangerZone } from './danger-zone'
import type { AddonPlan } from '@/lib/subscription-catalog'

/**
 * AccountClient — orchestreert de account-pagina: abonnement, inloggegevens
 * en de danger zone, elk als eigen rustige sectie onder elkaar. Alle data
 * komt server-side binnen via props; deze laag bevat alleen de interactie.
 */
export function AccountClient({
  email,
  activeSubscriptions,
  initialAddon = null,
}: {
  email: string
  activeSubscriptions: string[]
  /** Deeplink `?addon=` — opent dat upgrade-sheet direct. */
  initialAddon?: AddonPlan['tier'] | null
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 pb-16 space-y-10">
      <AbonnementSection
        activeSubscriptions={activeSubscriptions}
        initialAddon={initialAddon}
      />
      <hr className="border-[var(--border-ed)]" />
      <AiCreditsSection />
      <hr className="border-[var(--border-ed)]" />
      <AccountBasisSection currentEmail={email} />
      <hr className="border-[var(--border-ed)]" />
      <DangerZone currentEmail={email} />
    </div>
  )
}
