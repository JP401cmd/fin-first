'use client'

import { useCallback, useEffect, useState } from 'react'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { REGEL_META, type RegelId } from '@/lib/future/regel-registry'
import type { RegelSimSnapshot } from '@/lib/future/regel-sim'
import type { FirePlan, FireStrategyConfig } from '@/lib/fire-strategy'
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
  firePlan,
  withdrawalStrategy,
  potRules,
  potBalances,
  anker,
  title,
}: {
  open: boolean
  /** Welke regel wordt bewerkt; null tijdens de sluit-animatie. */
  regelId: RegelId | null
  onClose: () => void
  onSaved: () => void
  simSnapshot: RegelSimSnapshot | null
  fireStrategy: FireStrategyConfig
  /** ADR 0129 — het volledige plan (anker + eind-vorm); voedt de eindstrategie-body. */
  firePlan?: FirePlan | null
  withdrawalStrategy: WithdrawalStrategyConfig
  potRules: PotRulesConfig
  potBalances: Record<WealthGroup, number>
  /**
   * ADR 0179 fase 3 — element-id in de body waar de pane naartoe scrolt na openen (bv. vraag 2
   * of de tekort-lening-schakelaar van de eindstrategie-body): de rijen "Tot welke leeftijd"
   * en "Geen tekort-lening" openen dezelfde body als Stopmoment, op hun eigen plek.
   */
  anker?: string | null
  /**
   * Schermtitel. Weggelaten = de naam van de regel (`REGEL_META`); katern Instellingen geeft
   * het rijlabel mee ("Stopmoment", "Einde van je plan"): de titel is gelijk aan de rij.
   */
  title?: string
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

  // Na openen naar het anker scrollen (twee frames: de pane schuift eerst in beeld).
  useEffect(() => {
    if (!open || !anker) return
    let f2 = 0
    const f1 = window.requestAnimationFrame(() => {
      f2 = window.requestAnimationFrame(() => {
        document.getElementById(anker)?.scrollIntoView({ block: 'start' })
      })
    })
    return () => {
      window.cancelAnimationFrame(f1)
      window.cancelAnimationFrame(f2)
    }
  }, [open, anker, shownId])

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
      title={title ?? meta?.title}
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
          firePlan={firePlan}
          withdrawalStrategy={withdrawalStrategy}
          potRules={potRules}
          potBalances={potBalances}
        />
      )}
    </ShellOverlay>
  )
}
