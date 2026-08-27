'use client'

import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import {
  formatCurrency,
  formatCurrencyDecimals,
  roundToSignificant,
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
  /**
   * Prognose-weergave: afronden op significante cijfers mét "ca."-voorvoegsel
   * ("ca. €680.000") via `formatApproxCurrency`. Gebruik dit op KOPGETALLEN die
   * uit de projectiemotor komen — een projectie tot op de euro leest als
   * schijnzekerheid (M5). De onderbouwing in de kassabon blijft exact, dus zet
   * `approx` daar NIET aan. Wint van `decimals` (een benadering met centen is
   * een tegenspraak). Default false.
   */
  approx?: boolean
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
  approx = false,
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
  const formatted = approx
    ? formatCurrency(roundToSignificant(safe))
    : decimals
      ? formatCurrencyDecimals(safe)
      : formatCurrency(safe)
  const withSign = signPrefix ? `${signPrefix}${formatted}` : formatted

  const fontClass = monoWhenVisible ? 'font-mono tabular-nums' : 'tabular-nums'
  return (
    <span className={`${fontClass} ${className ?? ''}`.trim()}>
      {/* "ca." als eigen, lichtere prefix — niet ín de tekststring. Op een
          KPI-kopgetal staat het bedrag in Playfair black op 24-28px; het
          voorbehoud meelaten groeien zou de cel laten overlopen én het
          voorbehoud even luid maken als het antwoord. Kleiner, in ink-3, op
          dezelfde basislijn: leesbaar voorbehoud, ongewijzigde cijferkolom. */}
      {approx && (
        <span className="mr-[0.2em] align-baseline text-[0.58em] font-normal not-italic tracking-normal text-[var(--ink-3)]">
          ca.
        </span>
      )}
      {withSign}
    </span>
  )
}
