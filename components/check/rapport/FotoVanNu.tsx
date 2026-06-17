'use client'

import type {
  ReportSnapshot,
  ReportDualBar,
  ReportMonthBalance,
} from '@/lib/check/types'
import { formatCurrency } from '@/lib/format'
import { useInViewOnce, useReducedMotion } from './hooks'
import { bucketColor } from './bucket-color'

interface FotoVanNuProps {
  snapshot: ReportSnapshot
  dualBars: ReportDualBar[]
  monthBalance: ReportMonthBalance
}

function nlNum(value: number, decimals = 0): string {
  return value
    .toFixed(decimals)
    .replace('.', ',')
}

/** Sectie 1 — Foto van nu: snapshot-cellen + dual-bars + maandbalans. */
export function FotoVanNu({ snapshot, dualBars, monthBalance }: FotoVanNuProps) {
  const reduce = useReducedMotion()
  const { ref: dualRef, inView } = useInViewOnce<HTMLDivElement>(0.3)

  // FIRE-inzetbaar totaal (alles dat meetelt) — voor de toelichting onder de bars.
  const fireBuckets = dualBars.filter((b) => b.countsForFire)
  const fireEur = fireBuckets.reduce((s, b) => s + b.eur, 0)

  return (
    <section id="s1">
      <div className="wrap">
        <div className="eyebrow">
          <span className="num">1</span> Je foto van nu{' '}
          <span className="swatch" style={{ background: 'var(--kern)' }} />
        </div>
        <h2>Dit is je startpunt</h2>
        <p className="lede">
          Niet om over te oordelen — om vanaf te vertrekken. Vier cijfers vatten
          samen waar je staat, en wat ze waard zijn in <span className="vt">tijd</span>.
        </p>

        {/* snapshot */}
        <div className="snapshot">
          <div className="snap-cell hero-cell">
            <div className="snap-label">
              <span>Netto vermogen</span>
            </div>
            <div className="snap-value">{formatCurrency(snapshot.netWorth)}</div>
            <div className="snap-sub">
              Genoeg om{' '}
              <span className="vt gold">{snapshot.netWorthFreedomLabel}</span> van
              te leven op je huidige uitgaven, zonder één euro bij te verdienen.
            </div>
          </div>
          <div className="snap-cell">
            <div className="snap-label">
              <span>Spaarquote</span>
            </div>
            <div className="snap-value" style={{ color: 'var(--green)' }}>
              {snapshot.savingsRatePct}%
            </div>
            <div className="snap-sub">
              {formatCurrency(snapshot.savingsMonthly)}/mnd opzij — sparen is
              vrijheid opbouwen.
            </div>
          </div>
          <div className="snap-cell">
            <div className="snap-label">
              <span>Buffer</span>
            </div>
            <div className="snap-value">{nlNum(snapshot.bufferMonths, 1)} mnd</div>
            <div className="snap-sub">
              {formatCurrency(snapshot.emergencyFund)} noodfonds,{' '}
              {snapshot.bufferMonths >= 3
                ? 'boven de richtlijn van 3.'
                : 'onder de richtlijn van 3.'}
            </div>
          </div>
          <div className="snap-cell">
            <div className="snap-label">
              <span>Netto inkomen</span>
            </div>
            <div className="snap-value">{formatCurrency(snapshot.netMonthlyIncome)}</div>
            <div className="snap-sub">Per maand, na belasting.</div>
          </div>
          <div className="snap-cell">
            <div className="snap-label">
              <span>Maandlasten</span>
            </div>
            <div className="snap-value">{formatCurrency(snapshot.monthlyExpenses)}</div>
            <div className="snap-sub">
              {snapshot.expenseToIncomePct}% van je inkomen gaat eruit.
            </div>
          </div>
        </div>

        {/* dual bars */}
        <h3 className="sub">Waar je vermogen in zit — en wat het kost in tijd</h3>
        <div className="chart-card">
          <div className="chart-head">
            <div>
              <div className="chart-title">Elke pot, twee keer gemeten</div>
              <div className="chart-sub">
                links in euro&apos;s · rechts in maanden vrijheid die het koopt
              </div>
            </div>
          </div>
          <div className="dual" ref={dualRef}>
            {dualBars.map((bar, i) => {
              const col = bucketColor(bar.bucket)
              const active = reduce || inView
              return (
                <div className="dual-row" key={bar.name}>
                  <div className="dual-top">
                    <div className="dual-name">
                      <span className="dot" style={{ background: col }} />
                      {bar.name}
                    </div>
                    <div className="dual-val">
                      <b>{formatCurrency(bar.eur)}</b> · {bar.freedomLabel}
                    </div>
                  </div>
                  <div className="dual-track">
                    <div
                      className={`dual-fill${active ? ' show' : ''}`}
                      style={{
                        background: col,
                        width: active ? `${bar.pctOfTotal}%` : 0,
                        // Bij reduced-motion de animatie volledig uit: zónder dit
                        // omzeilt de inline transitionDelay de CSS-media-query.
                        ...(reduce
                          ? { transition: 'none', transitionDelay: '0s' }
                          : { transitionDelay: `${i * 0.14}s` }),
                      }}
                    >
                      <span className="vt-in">{bar.freedomLabel}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <p
            style={{
              fontSize: 14,
              color: 'var(--ink-soft)',
              marginTop: 16,
            }}
          >
            De netto huiswaarde telt niet mee voor je FIRE — dat is je dak, niet
            je rendement. De inzetbare potten ({formatCurrency(fireEur)}) vormen
            samen je vrijgekochte tijd.
          </p>
        </div>

        {/* maandbalans */}
        <h3 className="sub">Je maandbalans</h3>
        <table className="data">
          <thead>
            <tr>
              <th>Post</th>
              <th className="r">Per maand</th>
              <th className="r">Per jaar</th>
              <th className="r">= vrijheid/jr</th>
            </tr>
          </thead>
          <tbody>
            {monthBalance.rows.map((row) => {
              const isTotal = row.kind === 'total'
              return (
                <tr key={row.label} className={isTotal ? 'total' : undefined}>
                  <td>{row.label}</td>
                  <td
                    className="num r"
                    style={isTotal ? { color: 'var(--green)' } : undefined}
                  >
                    {formatCurrency(row.perMonth)}
                  </td>
                  <td
                    className="num r"
                    style={isTotal ? { color: 'var(--green)' } : undefined}
                  >
                    {formatCurrency(row.perYear)}
                  </td>
                  {row.kind === 'income' ? (
                    <td className="r">
                      <span className="tag g">bron</span>
                    </td>
                  ) : isTotal ? (
                    <td className="r">
                      <span className="tag g">{monthBalance.savingsRatePct}% quote</span>
                    </td>
                  ) : row.freedomPerYearLabel ? (
                    <td className="num r">{row.freedomPerYearLabel}</td>
                  ) : (
                    <td className="r">—</td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
        <p
          className="mono"
          style={{ fontSize: 13.5, color: 'var(--ink-soft)', marginTop: 10 }}
        >
          ↳ Je vrij besteedbare ruimte stuur je naar sparen — bewust. Will kijkt
          verderop of dat houdbaar is.
        </p>
      </div>
    </section>
  )
}
