'use client'

import { useDeferredValue, useMemo, type ReactNode } from 'react'
import { runRegelProjection, type RegelSimSnapshot } from '@/lib/future/regel-sim'
import { potRulesToRaw, type PotRulesConfig } from '@/lib/pot-rules'
import { FireDeltaFooter, fireFooterSleutel } from './shared'

/**
 * Verschilregel van de drie pot-regels (ADR 0179 §7.7, fase 3): dezelfde kern-run als de
 * Tijdas, met alleen `profiles.pot_rules` vervangen door het concept (`RegelSimOverride.potRules`,
 * dezelfde vorm als `potRulesToRaw` en de PUT van `/api/pot-rules`). De kern rekent; hier
 * wordt niets zelf berekend.
 *
 * Kernel-runs pas zodra er iets gewijzigd is, en uitgesteld bij typen: zonder wijziging
 * toont de footer geen effect (patroon `VoorkeurBewerkenBody`). Zonder snapshot geen regel.
 */
export function usePotRegelVerschil(
  snapshot: RegelSimSnapshot | null | undefined,
  concept: PotRulesConfig,
  changed: boolean,
): { footerInfo?: ReactNode; footerKey: string | null } {
  const conceptRaw = JSON.stringify(potRulesToRaw(concept))
  const deferredRaw = useDeferredValue(conceptRaw)
  const deferredChanged = useDeferredValue(changed)
  const baseline = useMemo(
    () => (snapshot && deferredChanged ? runRegelProjection(snapshot) : null),
    [snapshot, deferredChanged],
  )
  const draft = useMemo(
    () =>
      snapshot && deferredChanged
        ? runRegelProjection(snapshot, { potRules: JSON.parse(deferredRaw) as Record<string, unknown> })
        : null,
    [snapshot, deferredChanged, deferredRaw],
  )
  if (!changed || !baseline || !draft) return { footerKey: null }
  return {
    footerInfo: <FireDeltaFooter baseline={baseline} draft={draft} />,
    footerKey: fireFooterSleutel(baseline, draft),
  }
}
