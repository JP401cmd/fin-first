'use client'

import { useCallback, useState, type ReactNode } from 'react'
import { ArrowUp, ArrowDown, Trash2 } from 'lucide-react'
import { InlineEdit } from './inline-edit'
import type { ModuleGuideStep } from '@/lib/briefing/module-guide-steps'

interface StepRowProps {
  step: ModuleGuideStep
  index: number
  total: number
  onMove: (idx: number, direction: 'up' | 'down') => void
  onUpdate: (idx: number, field: 'label' | 'href', value: string) => void
  onDelete: (idx: number) => void
  /**
   * Slot voor extra cellen rechts (vóór de delete-knop). Gebruikt door
   * de uitleg-badge die HelpContentPane opent.
   */
  trailing?: ReactNode
}

/**
 * Eén bewerkbare stap-rij. Hergebruikt door alle drie de beheer-tabs:
 * - Algemene stappen (4 stappen, platte lijst)
 * - Doel-stappen (per goal-collapsible)
 * - Module-stappen (per module-collapsible)
 *
 * Onveranderd behavior t.o.v. de oorspronkelijke ModuleSection-tabel:
 * Move up/down met arrow-knoppen, inline-edit van label/href, twee-staps
 * delete-confirm.
 */
export function StepRow({
  step,
  index,
  total,
  onMove,
  onUpdate,
  onDelete,
  trailing,
}: StepRowProps) {
  const validateLabel = useCallback((v: string) => {
    if (!v.trim()) return 'Label mag niet leeg zijn'
    return null
  }, [])

  const [confirmDelete, setConfirmDelete] = useState(false)
  const isLast = index === total - 1

  return (
    <tr className={isLast ? '' : 'border-b border-[var(--border-ed)]'}>
      <td className="py-1.5 pr-2">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => onMove(index, 'up')}
            className="rounded p-1 transition-colors hover:bg-[var(--subtle)] disabled:opacity-20 disabled:cursor-not-allowed"
            title="Omhoog"
          >
            <ArrowUp className="h-3.5 w-3.5 text-[var(--ink-2)]" />
          </button>
          <button
            type="button"
            disabled={isLast}
            onClick={() => onMove(index, 'down')}
            className="rounded p-1 transition-colors hover:bg-[var(--subtle)] disabled:opacity-20 disabled:cursor-not-allowed"
            title="Omlaag"
          >
            <ArrowDown className="h-3.5 w-3.5 text-[var(--ink-2)]" />
          </button>
        </div>
      </td>
      <td className="py-2.5 pr-4 font-mono text-xs text-[var(--ink-3)]">{step.key}</td>
      <td className="py-1.5 pr-4">
        <InlineEdit
          value={step.label}
          onChange={(v) => onUpdate(index, 'label', v)}
          validate={validateLabel}
          autoEdit={!step.label}
        />
      </td>
      <td className="py-1.5 pr-2">
        <InlineEdit
          value={step.href ?? ''}
          onChange={(v) => onUpdate(index, 'href', v)}
          placeholder="geen link"
          mono
        />
      </td>
      {trailing !== undefined && <td className="py-1.5 pr-2">{trailing}</td>}
      <td className="py-1.5 text-center">
        {confirmDelete ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                onDelete(index)
                setConfirmDelete(false)
              }}
              className="rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-red-600"
              title="Bevestig verwijderen"
            >
              Ja
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="rounded bg-[var(--subtle)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--ink-3)] hover:bg-[var(--border-ed)]"
              title="Annuleer"
            >
              Nee
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="rounded p-1 text-[var(--ink-4)] transition-colors hover:bg-red-50 hover:text-red-500"
            title="Verwijder stap"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </td>
    </tr>
  )
}

interface StepTableProps {
  steps: ModuleGuideStep[]
  onMove: (idx: number, direction: 'up' | 'down') => void
  onUpdate: (idx: number, field: 'label' | 'href', value: string) => void
  onDelete: (idx: number) => void
  onAdd: () => void
  /** Render-prop voor de trailing-cel (uitleg-badge). */
  renderTrailing?: (step: ModuleGuideStep) => ReactNode
  hasTrailingColumn?: boolean
}

/**
 * Tabel met alle stappen + "Stap toevoegen" knop. Trailing-kolom optioneel.
 */
export function StepTable({
  steps,
  onMove,
  onUpdate,
  onDelete,
  onAdd,
  renderTrailing,
  hasTrailingColumn,
}: StepTableProps) {
  if (steps.length === 0) {
    return (
      <p className="py-3 text-center text-sm text-[var(--ink-3)]">
        Nog geen stappen geconfigureerd.
      </p>
    )
  }

  return (
    <>
      <table className="w-full">
        <thead>
          <tr className="text-left text-xs font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
            <th className="w-16 py-2 pr-2">Volgorde</th>
            <th className="py-2 pr-4">Key</th>
            <th className="py-2 pr-4">Label</th>
            <th className="py-2 pr-2">Href</th>
            {hasTrailingColumn && <th className="py-2 pr-2 w-32">Uitleg</th>}
            <th className="w-10 py-2" />
          </tr>
        </thead>
        <tbody>
          {steps.map((step, idx) => (
            <StepRow
              key={step.key}
              step={step}
              index={idx}
              total={steps.length}
              onMove={onMove}
              onUpdate={onUpdate}
              onDelete={onDelete}
              trailing={renderTrailing ? renderTrailing(step) : undefined}
            />
          ))}
        </tbody>
      </table>
      <button
        type="button"
        onClick={onAdd}
        className="mt-2 inline-flex items-center gap-1.5 rounded-[var(--r)] border border-dashed border-[var(--border-md)] px-3 py-1.5 text-xs font-medium text-[var(--ink-3)] transition-colors hover:border-[var(--ink-3)] hover:text-[var(--ink-2)]"
      >
        + Stap toevoegen
      </button>
    </>
  )
}
