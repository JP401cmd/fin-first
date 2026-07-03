'use client'

import { useEffect, useRef, useState } from 'react'
import type { WealthGroup } from '@/lib/wealth-composition'
import { POT_RULES_DEFAULTS } from '@/lib/pot-rules'
import { RegelIntro, RegelSectionLabel } from './shared'
import { GroupOrderEditor, PotFlowDiagram, usePotRulesSave } from './pot-flow-diagram'
import { CategoriePrioEditor, useCategoriePrioState } from './categorie-prio-editor'
import type { RegelBodyProps } from './types'

const EMPTY_BALANCES: Record<WealthGroup, number> = {
  spaargeld: 0, beleggingen: 0, pensioen: 0, vastgoed: 0, overig: 0,
}

/** Regel 3 — Onttrekkingsvolgorde tijdens de afbouw-fase (illustratief). */
export function OnttrekkingsvolgordeBody({
  simSnapshot,
  potRules,
  potBalances,
  onActionsChange,
  onClose,
  onSaved,
}: RegelBodyProps) {
  const rules = potRules ?? POT_RULES_DEFAULTS
  const balances = potBalances ?? EMPTY_BALANCES
  const [order, setOrder] = useState<WealthGroup[]>(rules.withdrawalOrderGroups)
  const prio = useCategoriePrioState(rules, 'onttrekking')
  const { saving, error, save } = usePotRulesSave(onClose, onSaved)
  const oneYearExpense = simSnapshot?.rawContext.yearlyExpenses

  const changed =
    order.join('|') !== rules.withdrawalOrderGroups.join('|') || prio.changed
  const canSave = !saving && changed

  const saveRef = useRef(() => {})
  useEffect(() => {
    saveRef.current = () =>
      save({
        ...rules,
        withdrawalOrderGroups: order,
        categoriePrios: prio.mergeCategoriePrios(),
      })
  }, [save, rules, order, prio])
  useEffect(() => {
    onActionsChange({ canSave, saving, save: () => saveRef.current() })
  }, [onActionsChange, canSave, saving])

  return (
    <div className="pb-6">
      <RegelIntro regelId="onttrekkingsvolgorde" />

      {error && (
        <div role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {error}
        </div>
      )}

      <RegelSectionLabel>Volgorde van leegtrekken</RegelSectionLabel>
      <GroupOrderEditor groups={order} balances={balances} onChange={setOrder} />

      <CategoriePrioEditor
        enabled={prio.enabled}
        prios={prio.prios}
        onToggle={prio.setEnabled}
        onChange={prio.setPrios}
      />

      <div className="mt-6">
        <RegelSectionLabel>Zo werkt het op je potten</RegelSectionLabel>
        <PotFlowDiagram balances={balances} mode="order" orderedGroups={order} oneYearExpense={oneYearExpense} />
      </div>

      <p className="mt-5 text-[11px] text-[var(--ink-3)] italic leading-snug">
        Cash eerst leegtrekken geeft maximale liquiditeit, maar je laat rendement liggen.
        Beleggingen eerst is fiscaal vaak gunstiger (Box 3) maar vergroot je sequence-risk in
        slechte beursjaren. Je keuze wordt opgeslagen en hierboven illustratief getoond op je
        huidige potten; de volledige doorrekening in de tijdas-grafiek volgt later.
      </p>
    </div>
  )
}
