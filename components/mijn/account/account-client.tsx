'use client'

import { AbonnementSection } from './abonnement-section'
import { AiCreditsSection } from './ai-credits-section'
import { AccountBasisSection } from './account-basis-section'
import { DangerZone } from './danger-zone'
import type { AddonPlan } from '@/lib/subscription-catalog'
import { useNavSurface } from '@/lib/hooks/use-nav-surface'

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
  // Krant 2B: een Krant-account zet geen add-on aan (de add-on-route weigert
  // hem, B12) en heeft geen AI-tegoed (B11). Die twee secties tonen we hem dus
  // niet; inloggegevens en de danger zone blijven. Wat de Krant hier wél laat
  // zien ("Meer TriFinity") is 2C/2D.
  const { isKrant } = useNavSurface()
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 pb-16 space-y-10">
      {!isKrant && (
        <>
          <AbonnementSection
            activeSubscriptions={activeSubscriptions}
            initialAddon={initialAddon}
          />
          <hr className="border-[var(--border-ed)]" />
          <AiCreditsSection />
          <hr className="border-[var(--border-ed)]" />
        </>
      )}
      <AccountBasisSection currentEmail={email} />
      <hr className="border-[var(--border-ed)]" />
      <DangerZone currentEmail={email} />
    </div>
  )
}
