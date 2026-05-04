'use client'

import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import {
  formatCurrency,
  formatCurrencyDecimals,
  MASKED_AMOUNT_PLACEHOLDER,
} from '@/lib/format'

export type MaskTone = 'module' | 'kern' | 'wil' | 'horizon' | 'ink' | 'inherit'

const TONE_CLASS: Record<MaskTone, string> = {
  module: 'text-[var(--module-active-500)]',
  kern: 'text-[var(--color-kern-500)]',
  wil: 'text-[var(--color-wil-500)]',
  horizon: 'text-[var(--color-horizon-500)]',
  ink: 'text-[var(--ink-3)]',
  inherit: '',
}

interface Props {
  value: number | null | undefined
  /** Color the bullet placeholder takes when masked. Default 'module' follows the active route layout. */
  tone?: MaskTone
  /** Use 2-decimal formatting (e.g. €1.234,56). Default false (rounded to whole euros). */
  decimals?: boolean
  /** Optional sign prefix that survives masking (e.g. '+' for deltas). Hidden when masked to avoid leaking direction. */
  signPrefix?: '+' | '-' | ''
  /** Extra classes applied to the wrapper span (size, weight, font-family, etc). */
  className?: string
  /**
   * When unmasked, force `font-mono tabular-nums` on the span. Default true.
   * Set to false on call sites where the parent already supplies a different
   * font (e.g. Playfair for editorial heroes) — masked bullets always switch
   * to mono regardless, since `••••••` reads cleanest in mono.
   */
  monoWhenVisible?: boolean
}

export function MaskedAmount({
  value,
  tone = 'module',
  decimals = false,
  signPrefix,
  className,
  monoWhenVisible = true,
}: Props) {
  const { masked } = useMaskedAmounts()

  if (masked) {
    // Bullets always render in font-mono tabular-nums + accent color.
    return (
      <span className={`font-mono tabular-nums ${TONE_CLASS[tone]} ${className ?? ''}`.trim()}>
        {MASKED_AMOUNT_PLACEHOLDER}
      </span>
    )
  }

  const safe = value ?? 0
  const formatted = decimals ? formatCurrencyDecimals(safe) : formatCurrency(safe)
  const withSign = signPrefix ? `${signPrefix}${formatted}` : formatted

  const fontClass = monoWhenVisible ? 'font-mono tabular-nums' : 'tabular-nums'
  return (
    <span className={`${fontClass} ${className ?? ''}`.trim()}>
      {withSign}
    </span>
  )
}
