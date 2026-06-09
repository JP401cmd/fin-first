'use client'

import { AbonnementSection } from './abonnement-section'
import { AccountBasisSection } from './account-basis-section'
import { DangerZone } from './danger-zone'

/**
 * AccountClient — orchestreert de account-pagina: abonnement, inloggegevens
 * en de danger zone, elk als eigen rustige sectie onder elkaar. Alle data
 * komt server-side binnen via props; deze laag bevat alleen de interactie.
 */
export function AccountClient({
  email,
  activeSubscriptions,
}: {
  email: string
  activeSubscriptions: string[]
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 pb-16 space-y-10">
      <AbonnementSection activeSubscriptions={activeSubscriptions} />
      <hr className="border-[var(--border-ed)]" />
      <AccountBasisSection currentEmail={email} />
      <hr className="border-[var(--border-ed)]" />
      <DangerZone currentEmail={email} />
    </div>
  )
}
