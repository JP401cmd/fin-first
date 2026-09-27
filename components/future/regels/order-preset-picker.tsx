'use client'

import { useState } from 'react'
import type { WealthGroup } from '@/lib/wealth-composition'
import { detectOrderPreset, type OrderPreset } from '@/lib/pot-rules'
import { SubsectionLabel } from '@/components/editorial'
import { ORDER_PRESET_COPY } from '@/lib/future/order-preset-copy'
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
// De presetnamen wonen in een pure module (één bron met de rijwaarde in Instellingen);
// hier her-geëxporteerd voor bestaande imports.
export { ORDER_PRESET_COPY }

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
