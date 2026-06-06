'use client'

import { usePerspective } from '@/components/app/perspective-provider'
import { Users, UserCheck } from 'lucide-react'

/**
 * PerspectiveContextLabel — vaste in-context chip die op élke surface duidelijk
 * maakt dat de getoonde getallen van het HUISHOUDEN of de PARTNER zijn, niet van
 * jou. Rendert NIETS in de eigen weergave (personal) — eigen blijft de schone
 * basis; de chip verschijnt alleen wanneer die weergave is aangezet.
 *
 * Tint consistent met OwnershipBadge + PerspectiveSwitcher:
 *   huishouden = kern, partner = horizon.
 *
 * Plaats 'm naast de hoofd-/hero-getallen van een pagina zodat altijd helder is
 * welk perspectief je ziet (niet alleen de globale badge in de shell).
 */
export function PerspectiveContextLabel({ className = '' }: { className?: string }) {
  const { perspective, isHousehold, partnerName, loading } = usePerspective()

  // Self-gating: niets in eigen weergave, voor solo-gebruikers, of tijdens laden.
  if (loading || !isHousehold || perspective === 'personal') return null

  const isPartner = perspective === 'partner'
  const Icon = isPartner ? UserCheck : Users
  const label = isPartner ? (partnerName ?? 'Partner') : 'Huishouden'
  const tint = isPartner
    ? 'bg-horizon-50 border-horizon-300 text-horizon-800'
    : 'bg-kern-50 border-kern-300 text-kern-800'

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${tint} ${className}`}
      data-testid="perspective-context-label"
      data-perspective={perspective}
      title={isPartner ? `Je ziet de cijfers van ${label}` : 'Je ziet de cijfers van het huishouden'}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </span>
  )
}
