'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { PencilLine, Check, RotateCcw } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { formatCurrency } from '@/lib/format'

interface Props {
  /** Bruto-jaarinkomen dat de pagina nu gebruikt (handmatig of schatting). */
  grossYearly: number
  /** Automatische bruto-schatting (cashflow-netto → bruto). */
  estimateGross: number
  /** Het netto geschatte jaarinkomen uit de cashflow-pagina (de bron). */
  estimateNetYearly: number
  /** True wanneer het huidige bruto handmatig is opgeslagen. */
  isManual: boolean
}

/**
 * Inline-editor voor het geschatte bruto-jaarinkomen op de Box 1-pagina.
 *
 * Rendert als de "Geschat bruto"-waarde in de hero-FiguresStrip (erft de
 * Playfair-typografie van de cel via `font: inherit`). Tikken opent een
 * BottomSheet waarin je de cashflow-schatting kunt overnemen of een eigen
 * bruto kunt invoeren. Opslaan → `/api/belasting/box1-income` → `router.refresh()`
 * zodat de hele server-pagina (druk, curve, jaarruimte) herrekent met het
 * nieuwe bruto. De aanpassing geldt alleen voor de belasting/Box 1-pagina.
 */
export function Box1GrossIncomeEditor({
  grossYearly,
  estimateGross,
  estimateNetYearly,
  isManual,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(String(Math.round(grossYearly)))
  const [saving, setSaving] = useState(false)

  const persist = useCallback(
    async (grossIncome: number | null) => {
      setSaving(true)
      try {
        await fetch('/api/belasting/box1-income', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ grossIncome }),
        })
        setOpen(false)
        router.refresh()
      } finally {
        setSaving(false)
      }
    },
    [router],
  )

  const onOpen = () => {
    setDraft(String(Math.round(grossYearly)))
    setOpen(true)
  }

  const saveManual = () => {
    const n = Number(draft)
    if (Number.isFinite(n) && n > 0) void persist(Math.round(n))
  }

  const taxOnNet = Math.max(0, estimateGross - estimateNetYearly)

  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        aria-label="Bruto-jaarinkomen aanpassen"
        className="inline-flex items-baseline gap-1.5 hover:opacity-80 transition-opacity cursor-pointer"
        style={{ font: 'inherit', color: 'inherit', letterSpacing: 'inherit', lineHeight: 'inherit' }}
      >
        <span>{formatCurrency(Math.round(grossYearly))}</span>
        <PencilLine className="h-3.5 w-3.5 shrink-0 self-center" style={{ color: 'var(--ink-4)' }} aria-hidden="true" />
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Geschat bruto-jaarinkomen">
        <div className="space-y-4 p-4">
          <p className="text-[12px] leading-snug text-[var(--ink-3)]">
            Standaard schatten we je bruto-inkomen uit het{' '}
            <span className="font-medium text-[var(--ink-2)]">geschatte netto-jaarinkomen</span>{' '}
            op je cashflow-pagina, omgerekend met de Box 1-schijven en heffingskortingen.
            Klopt het niet? Vul hieronder je eigen bruto in — dit geldt alleen voor de belastingpagina.
          </p>

          {estimateNetYearly > 0 && (
            <KassabonShell>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--ink-2)]">Netto (cashflow-schatting)</span>
                  <span className="tabular-nums">{formatCurrency(estimateNetYearly)}</span>
                </div>
                <div className="flex items-center justify-between text-[var(--ink-3)]">
                  <span>+ geschatte Box 1-belasting</span>
                  <span className="tabular-nums">{formatCurrency(taxOnNet)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-dashed border-[var(--border-md)] pt-2 font-bold">
                  <span>= Geschat bruto</span>
                  <span className="tabular-nums">{formatCurrency(estimateGross)}</span>
                </div>
              </div>
            </KassabonShell>
          )}

          {/* Keuze: schatting overnemen vs eigen bruto */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => (isManual ? void persist(null) : setOpen(false))}
              disabled={saving}
              className={`flex w-full items-center gap-2 rounded-[var(--r)] border px-3 py-2 text-sm disabled:opacity-50 ${
                !isManual
                  ? 'border-kern-400 bg-kern-50 text-[var(--ink)]'
                  : 'border-[var(--border-md)] text-[var(--ink-2)] hover:bg-[var(--subtle)]'
              }`}
            >
              {!isManual ? (
                <Check className="h-4 w-4 shrink-0 text-kern-600" aria-hidden="true" />
              ) : (
                <RotateCcw className="h-4 w-4 shrink-0 text-[var(--ink-3)]" aria-hidden="true" />
              )}
              {isManual
                ? `Terug naar schatting (${formatCurrency(estimateGross)})`
                : `Schatting gebruikt (${formatCurrency(estimateGross)})`}
            </button>

            <div
              className={`flex items-center gap-2 rounded-[var(--r)] border px-3 py-2 ${
                isManual ? 'border-kern-400 bg-kern-50' : 'border-[var(--border-md)]'
              }`}
            >
              <span className="text-sm text-[var(--ink-2)]">Eigen bruto</span>
              <span className="ml-auto text-sm text-[var(--ink-3)]">€</span>
              <input
                type="number"
                inputMode="numeric"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveManual()
                }}
                className="w-32 border-b border-kern-400 bg-transparent text-right font-mono tabular-nums outline-none"
                aria-label="Eigen bruto-jaarinkomen"
              />
              <span className="text-xs text-[var(--ink-3)]">/jr</span>
            </div>
          </div>

          <button
            type="button"
            onClick={saveManual}
            disabled={saving || !(Number(draft) > 0)}
            className="w-full rounded-[var(--r)] bg-[var(--ink)] px-3 py-2.5 text-sm font-semibold text-[var(--paper)] transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {saving ? 'Opslaan…' : 'Eigen bruto opslaan'}
          </button>
        </div>
      </BottomSheet>
    </>
  )
}
