'use client'

import { Link2, Trash2 } from 'lucide-react'
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
import type { AssetQuickInput, DebtQuickInput } from '@/lib/quick-add/types'
import { TypeIcon } from '@/components/app/quick-add-wizard/icon-map'
import { formatCurrency } from '@/lib/format'

/**
 * Gedeelde presentatie-bouwstenen voor de begeleide bezittingen- en
 * schulden-enumeratie (`onboarding-bezittingen.tsx` + `onboarding-schulden.tsx`).
 *
 * Bevat de rij-weergave van toegevoegde posten (asset/debt/gekoppelde schuld)
 * en de "andere bezitting / schuld"-type-keuzelijsten voor de catch-all. Eén
 * bron zodat beide secties identiek ogen en de unlink-/verwijder-semantiek niet
 * divergeert.
 */

// ── Toegevoegde-post-rijen ────────────────────────────────────────────────

export function AssetRow({
  item,
  onRemove,
}: {
  item: AssetQuickInput
  onRemove: () => void
}) {
  const iconName = ASSET_TYPE_ICONS[item.asset_type as AssetType] ?? 'CircleDot'
  const typeLabel = ASSET_QUICK_ADD_LABELS[item.asset_type as AssetType] ?? 'Overig'
  return (
    <div className="flex items-center gap-3 border border-[var(--border-ed)] bg-[var(--subtle)]/50 px-3 py-2.5">
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center bg-[var(--paper)] text-[var(--module-active-700)]"
      >
        <TypeIcon name={iconName} className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--ink)]">{item.name}</p>
        <p
          className="text-[11px] italic text-[var(--ink-3)]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          {typeLabel}
        </p>
      </div>
      <span className="shrink-0 font-mono text-sm tabular-nums text-[var(--ink-2)]">
        {formatCurrency(item.current_value)}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="ml-1 flex h-9 w-9 items-center justify-center text-[var(--ink-4)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink-2)]"
        aria-label={`Verwijder ${item.name}`}
      >
        <Trash2 className="h-4 w-4" strokeWidth={1.5} />
      </button>
    </div>
  )
}

export function DebtRow({
  item,
  onRemove,
}: {
  item: DebtQuickInput
  onRemove: () => void
}) {
  const iconName = DEBT_TYPE_ICONS[item.debt_type as DebtType] ?? 'CircleDot'
  const typeLabel = DEBT_QUICK_ADD_LABELS[item.debt_type as DebtType] ?? 'Overig'
  return (
    <div className="flex items-center gap-3 border border-[var(--border-ed)] bg-[var(--subtle)]/50 px-3 py-2.5">
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center bg-[var(--paper)] text-[var(--ink-2)]"
      >
        <TypeIcon name={iconName} className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--ink)]">{item.name}</p>
        <p
          className="text-[11px] italic text-[var(--ink-3)]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          {typeLabel}
        </p>
      </div>
      <span className="shrink-0 font-mono text-sm tabular-nums text-[var(--ink-2)]">
        &minus;{formatCurrency(item.current_balance)}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="ml-1 flex h-9 w-9 items-center justify-center text-[var(--ink-4)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink-2)]"
        aria-label={`Verwijder ${item.name}`}
      >
        <Trash2 className="h-4 w-4" strokeWidth={1.5} />
      </button>
    </div>
  )
}

/**
 * Gekoppelde-schuld-subrij — ingesprongen ónder de bezitting waaraan de schuld
 * hangt. Visueel ondergeschikt (insprong + Link2-affordance) zodat de groepering
 * "bezitting met schuld eronder" direct leesbaar is.
 *
 * Twee gebruikswijzen:
 *  - Bezittingen-stap: mét `onRemove` (verwijder-knop) — de schuld hangt aan de
 *    bezitting die je hier beheert.
 *  - Schulden-stap: zónder `onRemove` (read-only) — de schuld is elders (bij de
 *    bezitting) toegevoegd en wordt hier alleen tér herkenning getoond, zodat
 *    "dit zijn je schulden" óók de hypotheek/RC/autolening laat zien. Verwijderen
 *    hoort dan bij de bezitting, niet hier (voorkomt desync + dubbel opvoeren).
 * `origin` overschrijft het standaard "· gekoppeld"-label met de herkomst,
 * bv. "via je woning" / "via je BV".
 */
export function LinkedDebtRow({
  item,
  onRemove,
  origin,
}: {
  item: DebtQuickInput
  onRemove?: () => void
  origin?: string
}) {
  const iconName = DEBT_TYPE_ICONS[item.debt_type as DebtType] ?? 'CircleDot'
  const typeLabel = DEBT_QUICK_ADD_LABELS[item.debt_type as DebtType] ?? 'Overig'
  return (
    <div className="ml-5 flex items-center gap-3 border-l-2 border-[var(--border-ed)] bg-[var(--subtle)]/30 py-2 pl-3 pr-3">
      <span
        aria-hidden
        className="flex h-7 w-7 shrink-0 items-center justify-center bg-[var(--paper)] text-[var(--ink-2)]"
      >
        <TypeIcon name={iconName} className="h-3.5 w-3.5" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-medium text-[var(--ink)]">
          <Link2 className="h-3 w-3 shrink-0 text-[var(--ink-3)]" aria-hidden />
          {item.name}
        </p>
        <p
          className="text-[11px] italic text-[var(--ink-3)]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          {typeLabel} · {origin ?? 'gekoppeld'}
        </p>
      </div>
      <span className="shrink-0 font-mono text-sm tabular-nums text-[var(--ink-2)]">
        &minus;{formatCurrency(item.current_balance)}
      </span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="ml-1 flex h-9 w-9 items-center justify-center text-[var(--ink-4)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink-2)]"
          aria-label={`Verwijder ${item.name}`}
        >
          <Trash2 className="h-4 w-4" strokeWidth={1.5} />
        </button>
      ) : null}
    </div>
  )
}

// ── Type-keuzelijsten (catch-all "andere bezitting / schuld") ──────────────

/**
 * Compacte keuzelijst van resterende asset-types voor de "andere bezittingen?"-
 * stap. `exclude` filtert de types die al via gerichte ja/nee-vragen aan bod
 * kwamen (betaalrekening/spaar/huis/beleggingen). Volgt `QUICK_ADD_ASSET_ORDER`.
 *
 * `onCancel` is optioneel: laat 'm weg bij *inline* gebruik (de picker staat
 * dan direct op de "andere bezittingen?"-vraag met een eigen sectie-footer),
 * geef 'm mee op een eigen picker-scherm om een "Annuleren"-uitgang te tonen.
 */
export function AssetTypePicker({
  exclude,
  onPick,
  onCancel,
}: {
  exclude: AssetType[]
  onPick: (type: AssetType) => void
  onCancel?: () => void
}) {
  const types = QUICK_ADD_ASSET_ORDER.filter((t) => !exclude.includes(t))
  return (
    <TypePickerGrid onCancel={onCancel}>
      {types.map((type) => (
        <TypePickerTile
          key={type}
          iconName={ASSET_TYPE_ICONS[type] ?? 'CircleDot'}
          label={ASSET_QUICK_ADD_LABELS[type]}
          onClick={() => onPick(type)}
        />
      ))}
    </TypePickerGrid>
  )
}

/**
 * Compacte keuzelijst van resterende debt-types voor de "andere schuld?"-stap.
 * `exclude` filtert de types die al via gerichte ja/nee-vragen aan bod kwamen.
 * Volgt `QUICK_ADD_DEBT_ORDER`.
 */
export function DebtTypePicker({
  exclude,
  onPick,
  onCancel,
}: {
  exclude: DebtType[]
  onPick: (type: DebtType) => void
  onCancel?: () => void
}) {
  const types = QUICK_ADD_DEBT_ORDER.filter((t) => !exclude.includes(t))
  return (
    <TypePickerGrid onCancel={onCancel}>
      {types.map((type) => (
        <TypePickerTile
          key={type}
          iconName={DEBT_TYPE_ICONS[type] ?? 'CircleDot'}
          label={DEBT_QUICK_ADD_LABELS[type]}
          onClick={() => onPick(type)}
        />
      ))}
    </TypePickerGrid>
  )
}

function TypePickerGrid({
  children,
  onCancel,
}: {
  children: React.ReactNode
  onCancel?: () => void
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{children}</div>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-[var(--ink-3)] underline-offset-4 transition-colors hover:text-[var(--ink)] hover:underline"
        >
          Annuleren
        </button>
      )}
    </div>
  )
}

function TypePickerTile({
  iconName,
  label,
  onClick,
}: {
  iconName: string
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 border border-[var(--border-ed)] bg-[var(--paper)] p-3 text-center text-xs font-medium text-[var(--ink-2)] transition-colors hover:border-[var(--module-active-500)] hover:bg-[var(--module-active-50)]/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
    >
      <span
        aria-hidden
        className="flex h-7 w-7 items-center justify-center text-[var(--module-active-700)]"
      >
        <TypeIcon name={iconName} className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <span className="truncate w-full">{label}</span>
    </button>
  )
}
