'use client'

'use client'

import {
  ASSET_QUICK_ADD_LABELS,
  ASSET_TYPE_ICONS,
  QUICK_ADD_ASSET_ORDER,
  type AssetType,
} from '@/lib/asset-data'
import {
  DEBT_QUICK_ADD_LABELS,
  DEBT_TYPE_ICONS,
  QUICK_ADD_DEBT_ORDER,
  type DebtType,
} from '@/lib/debt-data'
import type { QuickAddIntent } from '@/lib/quick-add/types'
import { TypeIcon } from '../icon-map'

/**
 * Stap 2 — type-grid. Toont alle asset- of debt-types in een 2- of 3-kolom
 * grid. Tegels houden zich aan de neutrale krant-palette: rustige paper-
 * achtergrond, accent-streep links in module-kleur (kern-bruin voor assets,
 * --negative voor schulden), iconen monochroom — geen kleurchips per type.
 *
 * Volgorde is intentioneel (`QUICK_ADD_*_ORDER`): meest-gekozen types
 * eerst zodat <30 seconden quick-add haalbaar blijft.
 */

export interface StepTypeProps {
  intent: QuickAddIntent
  onSelect: (type: AssetType | DebtType) => void
}

export function StepType({ intent, onSelect }: StepTypeProps) {
  const rows =
    intent === 'asset'
      ? QUICK_ADD_ASSET_ORDER.map((type) => ({
          type,
          label: ASSET_QUICK_ADD_LABELS[type],
          iconName: ASSET_TYPE_ICONS[type],
        }))
      : QUICK_ADD_DEBT_ORDER.map((type) => ({
          type,
          label: DEBT_QUICK_ADD_LABELS[type],
          iconName: DEBT_TYPE_ICONS[type],
        }))

  const accentClass = intent === 'asset' ? 'bg-kern-500' : 'bg-[var(--negative)]'
  const iconClass =
    intent === 'asset' ? 'text-kern-700' : 'text-[var(--negative)]'

  return (
    <>
      <div
        className="grid grid-cols-2 gap-2.5 sm:grid-cols-3"
        role="list"
        aria-label={
          intent === 'asset' ? 'Kies een type bezitting' : 'Kies een type schuld'
        }
      >
        {rows.map((row) => (
          <button
            key={row.type}
            type="button"
            role="listitem"
            onClick={() => onSelect(row.type)}
            className="group relative flex min-h-[88px] flex-col items-start gap-2 border border-[var(--border-ed)] bg-[var(--paper)] p-3.5 pl-4 text-left transition-all hover:-translate-y-px hover:border-[var(--ink-3)] hover:shadow-[var(--s1)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
          >
            {/* Accent-streep links — module-kleur per intent, niet per type. */}
            <span
              className={`absolute inset-y-0 left-0 w-[3px] ${accentClass}`}
              aria-hidden="true"
            />
            <span
              className={`flex h-9 w-9 items-center justify-center bg-[var(--subtle)] ${iconClass}`}
              aria-hidden="true"
            >
              <TypeIcon
                name={row.iconName}
                className="h-4 w-4"
                strokeWidth={1.75}
              />
            </span>
            <span className="text-sm font-medium leading-tight text-[var(--ink)]">
              {row.label}
            </span>
          </button>
        ))}
      </div>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-[var(--ink-3)]">
        Past geen? Kies Overig — je kunt later meer details toevoegen.
      </p>
    </>
  )
}
