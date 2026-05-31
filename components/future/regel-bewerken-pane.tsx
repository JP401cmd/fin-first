'use client'

import { useCallback, useEffect, useState } from 'react'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { REGEL_META, type RegelId } from '@/lib/future/regel-registry'
import type { RegelSimSnapshot } from '@/lib/future/regel-sim'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import type { WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import type { PotRulesConfig } from '@/lib/pot-rules'
import type { WealthGroup } from '@/lib/wealth-composition'
import { REGEL_BODIES } from './regels'
import type { RegelEditActionsState } from './regels/types'

/**
 * RegelBewerkenPane — gedeelde wrapper voor alle 5 "Regels op de hele tijdas".
 *
 * Mirror van EventPane (components/app/horizon/event-pane.tsx): één ShellOverlay
 * kind="pane" (SlideInPane desktop / BottomSheet mobiel), de body publiceert zijn
 * save-state via onActionsChange, de wrapper bouwt de sticky footer-knoppen.
 */
export function RegelBewerkenPane({
  open,
  regelId,
  onClose,
  onSaved,
  simSnapshot,
  fireStrategy,
  withdrawalStrategy,
  potRules,
  potBalances,
}: {
  open: boolean
  /** Welke regel wordt bewerkt; null tijdens de sluit-animatie. */
  regelId: RegelId | null
  onClose: () => void
  onSaved: () => void
  simSnapshot: RegelSimSnapshot | null
  fireStrategy: FireStrategyConfig
  withdrawalStrategy: WithdrawalStrategyConfig
  potRules: PotRulesConfig
  potBalances: Record<WealthGroup, number>
}) {
  const [actions, setActions] = useState<RegelEditActionsState | null>(null)
  // Behoud de laatste niet-null regelId tijdens de sluit-animatie zodat de
  // header/body niet flikkeren naar leeg.
  const [shownId, setShownId] = useState<RegelId | null>(regelId)

  useEffect(() => {
    if (regelId) setShownId(regelId)
  }, [regelId])

  // Reset gepubliceerde save-state bij sluiten of regel-wissel.
  useEffect(() => {
    if (!open) setActions(null)
  }, [open])
  useEffect(() => {
    setActions(null)
  }, [shownId])

  // Stabiele identity — anders herevalueert de publish-effect in de body elke render.
  const handleActionsChange = useCallback((next: RegelEditActionsState) => {
    setActions(next)
  }, [])

  const meta = shownId ? REGEL_META[shownId] : null
  const Body = shownId ? REGEL_BODIES[shownId] : null

  const primaryAction = actions
    ? {
        label: 'Opslaan',
        onClick: actions.save,
        disabled: !actions.canSave,
        loading: actions.saving,
      }
    : undefined
  const secondaryAction = { label: 'Annuleren', onClick: onClose }

  return (
    <ShellOverlay
      open={open}
      onClose={onClose}
      kind="pane"
      title={meta?.title}
      primaryAction={primaryAction}
      secondaryAction={secondaryAction}
      footerInfo={actions?.footerInfo}
    >
      {Body && shownId && (
        <Body
          key={shownId}
          onActionsChange={handleActionsChange}
          onClose={onClose}
          onSaved={onSaved}
          simSnapshot={simSnapshot}
          fireStrategy={fireStrategy}
          withdrawalStrategy={withdrawalStrategy}
          potRules={potRules}
          potBalances={potBalances}
        />
      )}
    </ShellOverlay>
  )
}
