'use client'

import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import {
  formatCurrency,
  formatCurrencyDecimals,
  roundToSignificant,
  MASKED_AMOUNT_PLACEHOLDER,
  MASKED_PERCENT_PLACEHOLDER,
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

/* ────────────────────────────────────────────────────────────────────────────
 * Richting-maskering (WF-NAV-11)
 *
 * `MaskedAmount` verbergt het bedrag én zijn `signPrefix`, maar een delta-tegel
 * zet de richting doorgaans nóg twee keer op het scherm: als percentage
 * ("-4.2%"), als driehoekje (▲/▼) en als kleur (text-positive/text-negative).
 * Alle drie zijn evenveel een lek als het bedrag zelf — wie meekijkt leest
 * "het gaat omlaag, en ongeveer hoeveel" zonder één euro te zien.
 *
 * Daarom staan de drie hier als gedeelde bouwstenen naast `MaskedAmount`, en
 * niet los per widget: de bug is twee keer onafhankelijk gemaakt (netto-vermogen
 * en holdings) juist omdát elke tegel het zelf moest onthouden. Bouw je een
 * nieuwe delta-tegel, gebruik dan dit drietal in plaats van een eigen
 * `useMaskedAmounts()`-tak.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Neutrale kleur bij maskering — dezelfde tint als tone 'ink', dus kleurloos. */
const NEUTRAL_DIRECTION_CLASS = 'text-[var(--ink-3)]'

/**
 * Kleurklasse die richting draagt, met maskering meegenomen.
 *
 * Geeft de positieve/negatieve klasse terug zolang bedragen zichtbaar zijn, en
 * een neutrale ink-tint zodra de gebruiker maskeert.
 *
 * @param isPositive - richting van de waarde (>= 0)
 * @param positive - klasse bij een positieve waarde (default `text-positive`)
 * @param negative - klasse bij een negatieve waarde (default `text-negative`)
 */
export function useDirectionClass(
  isPositive: boolean,
  positive = 'text-positive',
  negative = 'text-negative',
): string {
  const { masked } = useMaskedAmounts()
  if (masked) return NEUTRAL_DIRECTION_CLASS
  return isPositive ? positive : negative
}

interface PercentProps {
  /** Percentage-waarde (al in procenten, dus 4.2 → "4.2%"). */
  value: number | null | undefined
  /** Aantal decimalen; spiegelt de bestaande `toFixed(n)`-call-sites. Default 1. */
  decimals?: number
  /** Zet '+' vóór een positieve waarde (een negatieve draagt zijn eigen '-'). Default true. */
  withSign?: boolean
  /** Kleur van de bullets bij maskering. Default 'module'. */
  tone?: MaskTone
  /** Extra classes op de wrapper-span. */
  className?: string
}

/**
 * Percentage-tegenhanger van `MaskedAmount`: toont `••••` zodra bedragen
 * gemaskeerd zijn, zodat noch de richting (+/-) noch de orde van grootte
 * afleesbaar blijft naast een verborgen bedrag.
 */
export function MaskedPercent({
  value,
  decimals = 1,
  withSign = true,
  tone = 'module',
  className,
}: PercentProps) {
  const { masked } = useMaskedAmounts()
  const base = `font-mono tabular-nums ${className ?? ''}`.trim()

  if (masked) {
    return <span className={`${base} ${TONE_CLASS[tone]}`.trim()}>{MASKED_PERCENT_PLACEHOLDER}</span>
  }

  const safe = value ?? 0
  const sign = withSign && safe >= 0 ? '+' : ''
  return <span className={base}>{`${sign}${safe.toFixed(decimals)}%`}</span>
}

/**
 * Richtingsdriehoek (▲/▼) die volledig verdwijnt zodra bedragen gemaskeerd zijn.
 *
 * Puur visueel (`aria-hidden`): de richting staat voor screenreaders al in het
 * teken van het bedrag ernaast, en dat teken verbergt `MaskedAmount` zelf.
 */
export function MaskedDirection({
  isPositive,
  className,
}: {
  isPositive: boolean
  className?: string
}) {
  const { masked } = useMaskedAmounts()
  if (masked) return null
  return (
    <span className={`font-mono ${className ?? ''}`.trim()} aria-hidden="true">
      {isPositive ? '▲' : '▼'}
    </span>
  )
}
