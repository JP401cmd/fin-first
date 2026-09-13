'use client'

import { useEffect, useRef, useState } from 'react'
import type { WealthGroup } from '@/lib/wealth-composition'
import { POT_RULES_DEFAULTS, type SurplusGroup } from '@/lib/pot-rules'
import { SubsectionLabel } from '@/components/editorial'
import { RegelIntro, RegelOptionCard, PrioUitlegBlok } from './shared'
import { PotFlowDiagram, usePotRulesSave } from './pot-flow-diagram'
import { CategoriePrioEditor, useCategoriePrioState } from './categorie-prio-editor'
import type { RegelBodyProps } from './types'

const EMPTY_BALANCES: Record<WealthGroup, number> = {
  spaargeld: 0, beleggingen: 0, pensioen: 0, vastgoed: 0, overig: 0,
}

export const SURPLUS_OPTIONS: { value: SurplusGroup; title: string; description: string }[] = [
  // Beschrijvend, zonder oordeel of belofte (Wft; compliance-check TPR-15 14 sep 2026 verving
  // o.a. "gegarandeerd rendement", "veilig" en "fiscaal vriendelijk").
  { value: 'beleggingen', title: 'Naar beleggingen', description: 'Het overschot gaat naar je beleggingen en groeit mee met hun rendement, dat van jaar tot jaar kan schommelen.' },
  { value: 'spaargeld', title: 'Naar spaargeld', description: 'Het overschot gaat naar je spaargeld: direct opneembaar, en het groeit mee met de spaarrente.' },
  { value: 'schuld_aflossen', title: 'Schulden aflossen', description: 'Het overschot lost eerst schulden af. Elke afgeloste euro scheelt de rente over die schuld.' },
  { value: 'pensioen', title: 'Naar pensioen', description: 'Het overschot gaat naar je pensioenpot, die pas vanaf de ingangsleeftijd uitkeert.' },
  { value: 'vastgoed', title: 'Naar vastgoed', description: 'Aflossen op of uitbreiden van vastgoed.' },
  { value: 'overig', title: 'Naar overig', description: 'Crypto, voertuigen en andere bezittingen.' },
]

/** Regel 4 — Verdeling bij toename (overschot / meevaller). Illustratief. */
export function VerdelingToenameBody({
  potRules,
  potBalances,
  onActionsChange,
  onClose,
  onSaved,
}: RegelBodyProps) {
  const rules = potRules ?? POT_RULES_DEFAULTS
  const balances = potBalances ?? EMPTY_BALANCES
  const [target, setTarget] = useState<SurplusGroup>(rules.surplusGroup)
  const prio = useCategoriePrioState(rules, 'toename')
  const { saving, error, save } = usePotRulesSave(onClose, onSaved)

  const changed = target !== rules.surplusGroup || prio.changed
  const canSave = !saving && changed

  const saveRef = useRef(() => {})
  useEffect(() => {
    saveRef.current = () =>
      save({
        ...rules,
        surplusGroup: target,
        categoriePrios: prio.mergeCategoriePrios(),
      })
  }, [save, rules, target, prio])
  useEffect(() => {
    // TPR-15 — `changed` voor de plan-review (zonder wijziging "Bevestigen").
    onActionsChange({ canSave, saving, save: () => saveRef.current(), changed })
  }, [onActionsChange, canSave, saving, changed])

  return (
    <div className="pb-6">
      <RegelIntro regelId="verdeling-toename" />

      {error && (
        <div role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {error}
        </div>
      )}

      <SubsectionLabel>Waar gaat extra geld heen?</SubsectionLabel>
      <div className="space-y-2">
        {SURPLUS_OPTIONS.map((opt) => (
          <RegelOptionCard
            key={opt.value}
            active={target === opt.value}
            title={opt.title}
            description={opt.description}
            onSelect={() => setTarget(opt.value)}
          />
        ))}
      </div>

      {target !== 'schuld_aflossen' && (
        <div className="mt-6">
          <SubsectionLabel>Naar welke pot</SubsectionLabel>
          <PotFlowDiagram balances={balances} mode="target" targetGroup={target} />
        </div>
      )}

      <PrioUitlegBlok variant="target" />

      <CategoriePrioEditor
        enabled={prio.enabled}
        prios={prio.prios}
        onToggle={prio.setEnabled}
        onChange={prio.setPrios}
      />

      <p className="mt-5 text-[11px] text-[var(--ink-3)] italic leading-snug">
        Naar beleggingen: het overschot groeit mee met een rendement dat schommelt. Naar spaargeld:
        het blijft direct opneembaar. Schulden aflossen: je betaalt minder rente. We leggen deze
        verdeel-voorkeur vast voor je vermogensopbouw.
      </p>
    </div>
  )
}
