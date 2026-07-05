'use client'

import { useEffect, useRef, useState } from 'react'
import type { WealthGroup } from '@/lib/wealth-composition'
import { POT_RULES_DEFAULTS, type SurplusGroup } from '@/lib/pot-rules'
import { RegelIntro, RegelSectionLabel, RegelOptionCard, PrioUitlegBlok } from './shared'
import { PotFlowDiagram, usePotRulesSave } from './pot-flow-diagram'
import { CategoriePrioEditor, useCategoriePrioState } from './categorie-prio-editor'
import type { RegelBodyProps } from './types'

const EMPTY_BALANCES: Record<WealthGroup, number> = {
  spaargeld: 0, beleggingen: 0, pensioen: 0, vastgoed: 0, overig: 0,
}

const SURPLUS_OPTIONS: { value: SurplusGroup; title: string; description: string }[] = [
  { value: 'beleggingen', title: 'Naar beleggingen', description: 'Lange-termijn groei — meer rendement, hoger risico op korte termijn.' },
  { value: 'spaargeld', title: 'Naar spaargeld', description: 'Bouwt je liquide buffer op. Veilig en direct beschikbaar, maar laat rendement liggen.' },
  { value: 'schuld_aflossen', title: 'Schulden aflossen', description: 'Eerst je schulden verlagen — een gegarandeerd rendement gelijk aan je rente.' },
  { value: 'pensioen', title: 'Naar pensioen', description: 'Fiscaal vriendelijk opbouwen voor later.' },
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
    onActionsChange({ canSave, saving, save: () => saveRef.current() })
  }, [onActionsChange, canSave, saving])

  return (
    <div className="pb-6">
      <RegelIntro regelId="verdeling-toename" />

      {error && (
        <div role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {error}
        </div>
      )}

      <RegelSectionLabel>Waar gaat extra geld heen?</RegelSectionLabel>
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
          <RegelSectionLabel>Naar welke pot</RegelSectionLabel>
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
        Naar beleggingen maximaliseert je groei op lange termijn. Een cash-buffer geeft rust en
        flexibiliteit. Schulden aflossen levert een gegarandeerd rendement op. We leggen deze
        verdeel-voorkeur vast voor je vermogensopbouw.
      </p>
    </div>
  )
}
