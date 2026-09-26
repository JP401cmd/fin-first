'use client'

/**
 * InstellingRij — één regel in katern Instellingen (ADR 0179 D4, spec §4.3): label,
 * stippellijn, de huidige waarde en een ✎. De hele rij is één knop (raakvlak ≥ 44 px); de
 * toegankelijke naam is label + waarde + "aanpassen", zodat een schermlezer de waarde hoort.
 * Zonder `onEdit` is het een leesrij.
 *
 * Summary-list-patroon (GOV.UK check-answers, spec §3.1 regel 7): de waarde staat op de
 * rij, bewerken opent de bestaande body in een overlay. Bedragen via `MaskedAmount`.
 */

import { Pencil } from 'lucide-react'
import type { ReactNode } from 'react'
import { MaskedAmount } from '@/components/app/masked-amount'
import type { RijDeel } from '@/lib/toekomst/instellingen-rijwaarden'

export function RijWaarde({ delen }: { delen: readonly RijDeel[] }) {
  return (
    <>
      {delen.map((d, i) => (
        <span key={i}>
          {i > 0 && <span aria-hidden="true"> · </span>}
          {i > 0 && <span className="sr-only">, </span>}
          {typeof d === 'string' ? (
            d
          ) : (
            <>
              <MaskedAmount value={d.bedrag} tone="horizon" monoWhenVisible={false} />
              {d.achter ? ` ${d.achter}` : ''}
            </>
          )}
        </span>
      ))}
    </>
  )
}

export function InstellingRij({
  label,
  waarde,
  onEdit,
  hint,
  rij,
}: {
  label: string
  waarde: ReactNode
  /** Zonder = leesrij (bv. een afgeleide waarde). */
  onEdit?: () => void
  /** Kleine toelichting onder de waarde (leesrij). */
  hint?: string
  /** Rij-sleutel als test-/UAT-haak. */
  rij?: string
}) {
  const inhoud = (
    <>
      <span className="min-w-0 font-serif text-[15px] text-[var(--ink)]">{label}</span>
      <span aria-hidden="true" className="hidden min-w-4 flex-1 translate-y-[-3px] border-b border-dotted border-[var(--border-ed)] sm:block" />
      <span className="min-w-0 text-right font-mono text-[13px] tabular-nums text-[var(--ink-2)] sm:max-w-[60%]">
        {waarde}
        {hint && <span className="mt-0.5 block text-[11px] italic text-[var(--ink-3)]">{hint}</span>}
      </span>
      {onEdit ? (
        <>
          <Pencil className="h-3.5 w-3.5 shrink-0 text-[var(--ink-3)] group-hover:text-[var(--module-active-700)]" aria-hidden="true" />
          <span className="sr-only">aanpassen</span>
        </>
      ) : (
        <span className="w-3.5 shrink-0" aria-hidden="true" />
      )}
    </>
  )
  const cls =
    'flex min-h-[48px] w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-[var(--border-ed)] py-2.5 text-left sm:flex-nowrap'
  if (!onEdit) {
    return (
      <div className={cls} data-rij={rij}>
        {inhoud}
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={onEdit}
      data-rij={rij}
      className={`group ${cls} transition-colors hover:bg-[var(--subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--module-active-500)]`}
    >
      {inhoud}
    </button>
  )
}
