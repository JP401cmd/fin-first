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
export const ORDER_PRESET_COPY: Record<OrderPresetId, { title: string; description: string }> = {
  'liquide-eerst': {
    title: 'Liquide eerst',
    description:
      'Spaargeld en cash eerst — maximale liquiditeit; je rendement-potten blijven zo lang mogelijk staan.',
  },
  'rendement-beschermen': {
    title: 'Rendement beschermen',
    description:
      'Beleggingen als laatste — dempt je sequence-risk als de beurs juist tegenzit wanneer je onttrekt.',
  },
  'fiscaal-box3': {
    title: 'Fiscaal gunstig (Box 3 eerst)',
    description:
      'Beleggingen eerst — verkleint je Box 3-grondslag sneller, maar je verkoopt groei-vermogen als eerste.',
  },
  'pensioen-sparen': {
    title: 'Pensioen sparen',
    description:
      'Pensioen als laatste — laat je fiscaal-vriendelijke pot zo lang mogelijk doorgroeien.',
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
