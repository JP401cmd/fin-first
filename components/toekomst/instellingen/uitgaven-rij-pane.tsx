'use client'

import { useCallback, useEffect, useState } from 'react'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { UitgavenBody } from '@/components/future/plan-review/uitgaven-editor'
import type { RegelEditActionsState } from '@/components/future/regels/types'
import type { RegelSimSnapshot } from '@/lib/future/regel-sim'

/**
 * UitgavenRijPane — host van de rij "Uitgave na pensioen" in katern Instellingen
 * (ADR 0179 fase 3). Dezelfde body als de wizardstap "Leven na stoppen" (`UitgavenBody`):
 * een methode-klik is een concept, Opslaan in de footer schrijft via dezelfde routes, en de
 * verschilregel (`runRegelProjection` met de uitgaven-override) staat naast de knoppen.
 * Vervangt de oude `UitgavenPane` op Plan, die bij een methode-klik meteen opsloeg.
 */
export function UitgavenRijPane({
  open,
  onClose,
  snapshot,
}: {
  open: boolean
  onClose: () => void
  snapshot: RegelSimSnapshot | null
}) {
  const [actions, setActions] = useState<RegelEditActionsState | null>(null)
  useEffect(() => {
    if (!open) setActions(null)
  }, [open])
  const handleActionsChange = useCallback((next: RegelEditActionsState) => setActions(next), [])
  // De body ververst zelf (`router.refresh()` in `useUitgavenKeuze`); hier alleen sluiten.
  const handleSaved = useCallback(() => onClose(), [onClose])

  return (
    <ShellOverlay
      open={open}
      onClose={actions?.saving ? () => {} : onClose}
      kind="pane"
      mobileBackCloses
      title="Uitgave na pensioen"
      primaryAction={
        actions
          ? { label: 'Opslaan', onClick: actions.save, disabled: !actions.canSave, loading: actions.saving }
          : undefined
      }
      secondaryAction={{ label: 'Annuleren', onClick: onClose }}
      footerInfo={actions?.footerInfo}
    >
      {open && <UitgavenBody snapshot={snapshot} onActionsChange={handleActionsChange} onSaved={handleSaved} metKop />}
    </ShellOverlay>
  )
}
