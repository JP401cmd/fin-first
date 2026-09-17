'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { ModalFooter } from '@/components/app/modal-footer'
import { BetaAddonChoice } from '@/components/app/beta-addon/beta-addon-choice'
import { postBetaAddon } from '@/lib/beta-addons-client'
import { BETA_ADDON_COPY, type BetaAddonSource, type BetaAddonTier } from '@/lib/beta-addons'

/**
 * BetaAddonDialog — de popup "straks een abonnement, nu een keuze" (ADR 0157).
 *
 * Opent op het moment dat iemand een AI-functie of de bankkoppeling wil
 * gebruiken zonder de add-on. De schakelaar start uit; "aanzetten" kan pas als
 * hij aan staat. Bij AI legt de route eerst de toestemming vast (ADR 0155) en
 * zet dan de add-on aan. Na succes ververst de popup de shell (`router.refresh`,
 * zodat elke `hasSubscription`-lezer de nieuwe stand ziet) en roept `onActivated`
 * — de bankwizard probeert daarmee meteen opnieuw te koppelen.
 */
export interface BetaAddonDialogProps {
  tier: BetaAddonTier
  open: boolean
  onClose: () => void
  onActivated?: () => void
  /** Bron van de keuze; bij AI ook de bron van de toestemming. */
  source?: BetaAddonSource
}

export function BetaAddonDialog({ tier, open, onClose, onActivated, source = 'interstitial' }: BetaAddonDialogProps) {
  const router = useRouter()
  const copy = BETA_ADDON_COPY[tier]
  const [on, setOn] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Elke opening begint opnieuw uit: een eerdere, niet bevestigde "aan" telt niet.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setOn(false)
      setError(null)
    }
  }

  async function bevestig() {
    if (!on || saving) return
    setSaving(true)
    setError(null)
    const result = await postBetaAddon(tier, true, source)
    setSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    router.refresh()
    onClose()
    onActivated?.()
  }

  return (
    <ShellOverlay
      kind="sheet"
      open={open}
      onClose={saving ? () => {} : onClose}
      title={copy.titel}
      footer={
        <div className="space-y-3">
          {error && (
            <p role="alert" className="border border-negative/30 bg-negative-bg px-3 py-2 text-sm text-negative">
              {error}
            </p>
          )}
          <ModalFooter
            align="end"
            primary={{ label: copy.bevestig, onClick: bevestig, disabled: !on, loading: saving }}
            secondary={{ label: 'Niet nu', onClick: onClose, disabled: saving }}
          />
        </div>
      }
    >
      <div className="px-5 py-4" data-testid={`beta-addon-dialog-${tier}`}>
        <BetaAddonChoice tier={tier} on={on} onChange={setOn} disabled={saving} headingLevel="h4" />
      </div>
    </ShellOverlay>
  )
}
