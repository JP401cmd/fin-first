'use client'

/**
 * Subtotaal-regel — één subtieler subtotaal onder een figures-strip, bv. het
 * "excl. eigen woning"-subtotaal bij de dubbele grondslag op /core/assets
 * (bezittingen) en /core/debts (schulden). Eén gedeeld recept zodat plaatsing,
 * typografie én masking op beide pagina's identiek zijn — alleen `label` en de
 * `trailing`-inhoud verschillen (bezittingen: vrijheidstijd-equivalent;
 * schulden: beschrijvende noot).
 *
 * Kern-accent op het bedrag; de kleur loopt via de className, NIET via de
 * MaskedAmount-`tone` — anders zetten `TONE_CLASS['kern']` en `text-kern-700`
 * twee concurrerende, even-specifieke classes op dezelfde span. Daarom
 * `tone="inherit"` (levert `''`) + expliciete kleurclass.
 *
 * Leeft als apart bestand (niet in `editorial/index.tsx`) omdat het via
 * `MaskedAmount` de privacy-context raakt — net als GlossaryTerm/PageInfoButton.
 */

import type { ReactNode } from 'react'
import { MaskedAmount } from '@/components/app/masked-amount'

const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

export interface SubtotalLineProps {
  /** UPPERCASE mono kicker links, bv. "excl. eigen woning". */
  label: ReactNode
  /** Het subtotaal-bedrag. Privacy-aware via MaskedAmount, in kern-accent. */
  amount: number | null | undefined
  /** Optionele nabij-tekst: vrijheidstijd-equivalent (bezittingen) of een
   *  beschrijvende noot (schulden). Italic Source Serif, ink-3. */
  trailing?: ReactNode
  className?: string
}

export function SubtotalLine({ label, amount, trailing, className = '' }: SubtotalLineProps) {
  return (
    <div
      className={`-mt-3 mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px] text-[var(--ink-3)] ${className}`}
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
        {label}
      </span>
      <MaskedAmount
        value={amount}
        tone="inherit"
        className="text-[14px] font-semibold text-kern-700"
      />
      {trailing && (
        <span className="italic" style={{ fontFamily: SOURCE_SERIF }}>
          {trailing}
        </span>
      )}
    </div>
  )
}
