/**
 * OpbrengstUitsplitsing — gedeelde presentatie van de "Totale opbrengst" van
 * één investment-positie, gebruikt door ZOWEL de detail-pane
 * (`investment-holding-pane.tsx`) als de full-page detail
 * (`app/(app)/core/assets/investment/[holdingId]/page.tsx`), zodat beide
 * schermen gegarandeerd identieke getallen én labels tonen.
 *
 * CONTRACT (hard): dit component REKENT NIETS zelf. Het ontvangt de uitkomsten
 * van de canonieke engine (`computePositionFromTransactions` + `valuePosition`
 * uit `lib/holdings-aggregation.ts`) en toont ze. De aanroeper levert:
 *   - totalPnL        = valued.totalPnL        (gerealiseerd + ongerealiseerd)
 *   - unrealizedPnL   = valued.unrealizedPnL   ("Koerswinst (huidig)")
 *   - realizedPnL     = valued.realizedPnL     (INCL. dividend, MIN kosten)
 *   - dividends       = agg.dividends
 *   - totalFees       = agg.totalFees
 *   - totalInvested   = agg.totalInvested      (basis voor het %)
 *
 * De engine bakt dividend en kosten al in `realizedPnL`. Om ze als losse
 * regels te kunnen tonen zónder dubbeltelling splitsen we hier de "pure"
 * gerealiseerde koers-component af:
 *
 *   pureRealized = realizedPnL − dividends + totalFees
 *
 * zodat:  Koerswinst (huidig) + Gerealiseerd + Dividend − Kosten === totalPnL.
 *
 * Werkt voor open posities (volledige som) én gesloten posities
 * (unrealizedPnL = 0, currentValue = 0, totalPnL === realizedPnL).
 *
 * Kleur: opbrengst-tekens zijn SEMANTISCH (`text-positive`/`text-negative`),
 * geen module-accent. Geld in `font-mono tabular-nums`, nl-NL.
 */

interface OpbrengstUitsplitsingProps {
  /** valued.totalPnL — hoofdwaarde. */
  totalPnL: number
  /** valued.unrealizedPnL — "Koerswinst (huidig)". */
  unrealizedPnL: number
  /** valued.realizedPnL — incl. dividend, min kosten (engine-conventie). */
  realizedPnL: number
  /** agg.dividends. */
  dividends: number
  /** agg.totalFees. */
  totalFees: number
  /** agg.totalInvested — noemer voor het percentage (t.o.v. inleg). */
  totalInvested: number
  /** Gesloten positie? Dan is er geen actuele koerswinst-regel. */
  isClosed: boolean
  /** Currency-aware formatter van de aanroeper (EUR → formatCurrency, anders suffix). */
  formatAmount: (value: number) => string
  /** Compacter (kleinere hoofdwaarde) voor de pane; full-page = default. */
  size?: 'default' | 'compact'
}

export function OpbrengstUitsplitsing({
  totalPnL,
  unrealizedPnL,
  realizedPnL,
  dividends,
  totalFees,
  totalInvested,
  isClosed,
  formatAmount,
  size = 'default',
}: OpbrengstUitsplitsingProps) {
  // Pure gerealiseerde koers-component (zonder dividend, zonder kosten) zodat
  // de losse regels optellen tot totalPnL. Zie module-docstring.
  const pureRealized = realizedPnL - dividends + totalFees
  const pct = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : null
  const totalTone = totalPnL >= 0 ? 'text-positive' : 'text-negative'

  const headValueClass =
    size === 'compact'
      ? 'font-mono text-[22px] leading-none tabular-nums sm:text-[26px] font-bold'
      : 'font-mono text-[26px] leading-none tabular-nums sm:text-[32px] font-bold'

  return (
    <div>
      {/* Hoofdwaarde — bedrag + % t.o.v. inleg. */}
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
          Totale opbrengst
        </span>
        {pct != null && (
          <span className={`font-mono text-sm tabular-nums font-semibold ${totalTone}`}>
            {pct >= 0 ? '+' : ''}
            {pct.toFixed(1)}%
          </span>
        )}
      </div>
      <div className={`mt-1 ${headValueClass} ${totalTone}`}>
        {totalPnL >= 0 ? '+' : ''}
        {formatAmount(totalPnL)}
      </div>

      {/* Uitsplitsing — vaste regels; kosten alleen wanneer > 0 (er is geen
          fee-kolom in het detail-payload, dus 0 = onbekend → weglaten). */}
      <dl className="mt-3 space-y-1.5 border-t border-[var(--rule-soft)] pt-3">
        {!isClosed && (
          <BreakdownRow label="Koerswinst (huidig)" amount={unrealizedPnL} formatAmount={formatAmount} />
        )}
        <BreakdownRow label="Gerealiseerd" amount={pureRealized} formatAmount={formatAmount} />
        {dividends > 0 && (
          <BreakdownRow label="Dividend" amount={dividends} formatAmount={formatAmount} />
        )}
        {totalFees > 0 && (
          <BreakdownRow label="Kosten" amount={-totalFees} formatAmount={formatAmount} />
        )}
      </dl>
    </div>
  )
}

interface BreakdownRowProps {
  label: string
  /** Signed bedrag — bepaalt teken (+/−) en kleur. */
  amount: number
  formatAmount: (value: number) => string
}

function BreakdownRow({ label, amount, formatAmount }: BreakdownRowProps) {
  const tone = amount >= 0 ? 'text-positive' : 'text-negative'
  // Toon altijd het absolute bedrag met expliciet teken ervoor, zodat
  // "− €31" leesbaar uitlijnt met "+ €910".
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[12px] text-[var(--ink-2)]">{label}</dt>
      <dd className={`font-mono text-[13px] tabular-nums ${tone}`}>
        {amount >= 0 ? '+ ' : '− '}
        {formatAmount(Math.abs(amount))}
      </dd>
    </div>
  )
}
