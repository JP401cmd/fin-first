'use client'

/**
 * BulkImpact — "wat heb je nou eigenlijk vast?" in één regel: aantal, som van de
 * bedragen en de vrijheidstijd-equivalent (F13/AC5).
 *
 * ── Consume, don't recompute ────────────────────────────────────────────────
 * Het dagtarief (€/dag) komt uit `useDailyExpenseRate()` — de gedeelde
 * client-bron die `GET /api/daily-expense-rate` leest, en dus hetzelfde
 * canonieke `dailyExpenseRate` als de rapporten, de widgets en de grenzenpotten.
 * Hier wordt géén dagtarief afgeleid uit maanduitgaven, uit de geladen rijen of
 * uit een gekozen periode; de omrekening zelf loopt via `calculateFreedomTime` +
 * `formatFreedomTimeString` uit `lib/format.ts`.
 *
 * ── Maskering ───────────────────────────────────────────────────────────────
 * De vrijheidstijd is een lineaire functie van het bedrag: wie de tijd ziet,
 * ziet het bedrag. Onder bedragmaskering (ADR 0091) maskeert die regel dus mee —
 * anders is de privacy-schakelaar een gordijn met een gat erin.
 *
 * Om dezelfde reden vervalt gemaskeerd de tekenkleur. Rood of groen naast een
 * bolletjesrij vertelt of de selectie per saldo geld kost of oplevert; dat is de
 * richting die `MaskedAmount` bij `signPrefix` bewust verbergt. Gemaskeerd
 * valt het bedrag terug op de module-tint (Kern), zoals overal in de app.
 *
 * ── Framing ─────────────────────────────────────────────────────────────────
 * Bewust de MAGNITUDE van de netto som, niet de tekortlezing van
 * `formatWithFreedom` ("… achter"). Een selectie uitgaven van € 1.240 is
 * "≈ 17 dagen vrijheid" — de tijd die eraan hangt, niet een schuld.
 */

import { useDailyExpenseRate } from '@/components/app/freedom-time-label'
import { MaskedAmount } from '@/components/app/masked-amount'
import { Kicker } from '@/components/editorial'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import {
  calculateFreedomTime,
  formatFreedomTimeString,
  MASKED_AMOUNT_PLACEHOLDER,
} from '@/lib/format'

const nlNumber = new Intl.NumberFormat('nl-NL')

export interface BulkImpactProps {
  count: number
  /** Som van de positieve bedragen (≥ 0) — spiegelt het selectiemanifest. */
  sumPositief: number
  /** Som van de negatieve bedragen (≤ 0) — spiegelt het selectiemanifest. */
  sumNegatief: number
  /** `inline` voor de actiebalk-footer, `block` voor een bevestiging. */
  variant?: 'inline' | 'block'
}

/** De vrijheidstijd-regel; `null` zolang er geen dagtarief bekend is. */
function useFreedomLabel(amount: number): string | null {
  const { dailyExpenseRate, loading, source } = useDailyExpenseRate()
  if (loading || source === 'none' || dailyExpenseRate <= 0) return null
  const magnitude = Math.abs(amount)
  if (magnitude < 1) return null
  return formatFreedomTimeString(calculateFreedomTime(magnitude, dailyExpenseRate), 'long')
}

export function BulkImpact({
  count,
  sumPositief,
  sumNegatief,
  variant = 'inline',
}: BulkImpactProps) {
  const { masked } = useMaskedAmounts()
  const net = sumPositief + sumNegatief
  const freedom = useFreedomLabel(net)
  const bothDirections = sumPositief > 0 && sumNegatief < 0

  const teller = `${nlNumber.format(count)} ${count === 1 ? 'transactie' : 'transacties'}`

  if (variant === 'inline') {
    return (
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12px]">
        <span className="font-mono tabular-nums text-[var(--ink)]">{teller}</span>
        <span aria-hidden className="text-[var(--ink-4)]">
          ·
        </span>
        <MaskedAmount
          value={net}
          tone={masked ? 'module' : 'inherit'}
          className={`text-[13px] font-semibold ${
            masked ? '' : net < 0 ? 'text-negative' : 'text-positive'
          }`}
        />
        {freedom && (
          <span className="font-serif text-[12px] italic text-[var(--ink-3)]">
            ≈ {masked ? MASKED_AMOUNT_PLACEHOLDER : freedom} vrijheid
          </span>
        )}
      </span>
    )
  }

  return (
    <div className="border-y border-[var(--ink)] py-3">
      <Kicker size="small">Wat je vast hebt</Kicker>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className="font-mono text-[20px] font-bold tabular-nums text-[var(--ink)]">
          {teller}
        </span>
        <MaskedAmount
          value={net}
          tone={masked ? 'module' : 'inherit'}
          className={`text-[20px] font-bold ${
            masked ? '' : net < 0 ? 'text-negative' : 'text-positive'
          }`}
        />
      </p>
      {bothDirections && (
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[12px] text-[var(--ink-3)]">
          <span>
            Uit: <MaskedAmount value={sumNegatief} tone="inherit" />
          </span>
          <span>
            In: <MaskedAmount value={sumPositief} tone="inherit" />
          </span>
        </p>
      )}
      {freedom && (
        <p className="mt-1 font-serif text-[13px] italic text-[var(--ink-2)]">
          ≈ {masked ? MASKED_AMOUNT_PLACEHOLDER : freedom} vrijheid
        </p>
      )}
    </div>
  )
}
