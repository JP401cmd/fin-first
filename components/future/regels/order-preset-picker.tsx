'use client'

import { useState } from 'react'
import type { WealthGroup } from '@/lib/wealth-composition'
import { detectOrderPreset, type OrderPreset, type OrderPresetId } from '@/lib/pot-rules'
import { SubsectionLabel } from '@/components/editorial'
import { RegelOptionCard } from './shared'
import { GroupOrderEditor } from './pot-flow-diagram'

/**
 * Presetkiezer boven de bestaande sleep-editor voor de twee orde-regels
 * (onttrekkingsvolgorde & onttrekking-bij-afname). Zelfde patroon als de
 * surplus-opties in VerdelingToenameBody: elke preset is een RegelOptionCard die
 * de hele WealthGroup-volgorde zet. De sleep-editor blijft als "Aangepast".
 *
 * Puur volgorde-herordening → geen datamodel-/kernelwijziging (zie pot-rules.ts).
 */
/**
 * Beschrijft de volgorde zoals de kern hem rekent (`prio-overgang.ts#orderedGroupsToPrio`:
 * plek → prio min(plek, 4), gewicht ½^(prio−1)): vooraan = het zwaarst aangesproken, de rest
 * loopt in afnemende mate mee. Geen oordeel ("gunstig", "beschermen"), geen belofte (Wft;
 * compliance-check TPR-15 14 sep 2026). Getoetst in `plan-review/wizard-kopij.test.ts`.
 */
export const ORDER_PRESET_COPY: Record<OrderPresetId, { title: string; description: string }> = {
  'liquide-eerst': {
    title: 'Spaargeld eerst',
    description:
      'Spaargeld staat vooraan en wordt het zwaarst aangesproken; beleggingen en overig lopen in afnemende mate mee, pensioen en vastgoed het minst.',
  },
  'rendement-beschermen': {
    title: 'Beleggingen achteraan',
    description: 'Spaargeld staat vooraan; beleggingen staan achteraan en worden het minst aangesproken.',
  },
  'fiscaal-box3': {
    title: 'Beleggingen eerst',
    description:
      'Beleggingen staan vooraan en worden het zwaarst aangesproken; spaargeld loopt in mindere mate mee.',
  },
  'pensioen-sparen': {
    title: 'Pensioen achteraan',
    description:
      'Je pensioenbezittingen staan achteraan en worden het minst aangesproken; spaargeld staat vooraan.',
  },
  aangepast: {
    title: 'Aangepast',
    description: 'Bepaal de volgorde zelf met de slepen-editor hieronder.',
  },
}

export function OrderPresetPicker({
  presets,
  order,
  balances,
  onChange,
  editorLabel = 'Sleep de volgorde zoals jij wilt',
}: {
  presets: OrderPreset[]
  /** Huidige (geordende) groep-volgorde. */
  order: WealthGroup[]
  balances: Record<WealthGroup, number>
  onChange: (next: WealthGroup[]) => void
  /** Label boven de sleep-editor wanneer "Aangepast" actief is. */
  editorLabel?: string
}) {
  const active = detectOrderPreset(order, presets)
  // customOpen = de gebruiker koos expliciet de sleep-editor. Ook actief zodra de
  // volgorde met geen preset meer overeenkomt (detect → 'aangepast').
  const [customOpen, setCustomOpen] = useState(active === 'aangepast')
  const showEditor = customOpen || active === 'aangepast'

  return (
    <div className="space-y-2">
      {presets.map((p) => (
        <RegelOptionCard
          key={p.id}
          active={!customOpen && active === p.id}
          title={ORDER_PRESET_COPY[p.id].title}
          description={ORDER_PRESET_COPY[p.id].description}
          onSelect={() => {
            onChange(p.order)
            setCustomOpen(false)
          }}
        />
      ))}
      <RegelOptionCard
        active={showEditor}
        title={ORDER_PRESET_COPY.aangepast.title}
        description={ORDER_PRESET_COPY.aangepast.description}
        onSelect={() => setCustomOpen(true)}
      />

      {showEditor && (
        <div className="pt-1">
          <SubsectionLabel>{editorLabel}</SubsectionLabel>
          <GroupOrderEditor groups={order} balances={balances} onChange={onChange} />
        </div>
      )}
    </div>
  )
}
