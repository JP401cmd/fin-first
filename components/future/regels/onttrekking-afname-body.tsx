'use client'

import { useEffect, useRef, useState } from 'react'
import type { WealthGroup } from '@/lib/wealth-composition'
import { POT_RULES_DEFAULTS, DEFICIT_ORDER_PRESETS } from '@/lib/pot-rules'
import { RegelIntro, RegelSectionLabel, PrioUitlegBlok } from './shared'
import { PotFlowDiagram, usePotRulesSave } from './pot-flow-diagram'
import { OrderPresetPicker } from './order-preset-picker'
import { CategoriePrioEditor, useCategoriePrioState } from './categorie-prio-editor'
import type { RegelBodyProps } from './types'

const EMPTY_BALANCES: Record<WealthGroup, number> = {
  spaargeld: 0, beleggingen: 0, pensioen: 0, vastgoed: 0, overig: 0,
}

/** Regel 5 — Onttrekking bij afname (negatieve gebeurtenis / tegenvaller). Illustratief. */
export function OnttrekkingAfnameBody({
  simSnapshot,
  potRules,
  potBalances,
  onActionsChange,
  onClose,
  onSaved,
}: RegelBodyProps) {
  const rules = potRules ?? POT_RULES_DEFAULTS
  const balances = potBalances ?? EMPTY_BALANCES
  const [order, setOrder] = useState<WealthGroup[]>(rules.deficitOrderGroups)
  const prio = useCategoriePrioState(rules, 'afname')
  const { saving, error, save } = usePotRulesSave(onClose, onSaved)
  // Illustreer met een typische eenmalige tegenvaller (~3 maanden uitgaven).
  const yearly = simSnapshot?.rawContext.yearlyExpenses
  const shockAmount = yearly ? Math.round(yearly / 4) : undefined

  const changed =
    order.join('|') !== rules.deficitOrderGroups.join('|') || prio.changed
  const canSave = !saving && changed

  const saveRef = useRef(() => {})
  useEffect(() => {
    saveRef.current = () =>
      save({
        ...rules,
        deficitOrderGroups: order,
        categoriePrios: prio.mergeCategoriePrios(),
      })
  }, [save, rules, order, prio])
  useEffect(() => {
    onActionsChange({ canSave, saving, save: () => saveRef.current() })
  }, [onActionsChange, canSave, saving])

  return (
    <div className="pb-6">
      <RegelIntro regelId="onttrekking-afname" />

      {error && (
        <div role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {error}
        </div>
      )}

      <RegelSectionLabel>Volgorde bij een tegenvaller</RegelSectionLabel>
      <OrderPresetPicker
        presets={DEFICIT_ORDER_PRESETS}
        order={order}
        balances={balances}
        onChange={setOrder}
        editorLabel="Sleep de volgorde bij een tegenvaller"
      />

      <PrioUitlegBlok />

      <CategoriePrioEditor
        enabled={prio.enabled}
        prios={prio.prios}
        onToggle={prio.setEnabled}
        onChange={prio.setPrios}
      />

      <div className="mt-6">
        <RegelSectionLabel>Zo werkt het bij een eenmalige uitgave</RegelSectionLabel>
        <PotFlowDiagram balances={balances} mode="order" orderedGroups={order} oneYearExpense={shockAmount} />
      </div>

      <p className="mt-5 text-[11px] text-[var(--ink-3)] italic leading-snug">
        Eerst uit de liquide pot halen beschermt je beleggingen tegen verkopen op een dieptepunt.
        We leggen je keuze vast en tonen hem hierboven op je huidige potten; de volledige
        doorrekening volgt later.
      </p>
    </div>
  )
}
