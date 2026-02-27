'use client'

import { useState, useEffect } from 'react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import type { SimRow, SimCashflow } from '@/lib/fire-simulation'
import type { FireEndStrategy } from '@/lib/fire-strategy'

// ── SimChart ────────────────────────────────────────────────────────────────

export function SimChart({
  rows,
  fireAge,
  fireAgeFractional,
  currentAge,
  endAge,
  cashflows,
  fireTarget,
  forModal,
  strategy,
  targetEndPortfolio,
}: {
  rows: SimRow[]
  fireAge: number | null
  fireAgeFractional: number | null
  currentAge: number
  endAge: number
  cashflows: SimCashflow[]
  fireTarget?: number
  forModal?: boolean
  strategy?: FireEndStrategy
  targetEndPortfolio?: number
}) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 1200, forModal })

  const [containerW, setContainerW] = useState(600)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w && w > 0) setContainerW(Math.round(w))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])

  const W = containerW
  const H = 220
  const PAD = { top: 16, right: 16, bottom: 28, left: 60 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  const minAge = currentAge
  const maxAge = endAge

  // Build all path points from rows
  const allPts: [number, number][] = []
  if (rows.length > 0) {
    allPts.push([rows[0].age, rows[0].startPortfolio])
    for (const r of rows) {
      allPts.push([r.age + 1, r.endPortfolio])
    }
  }

  const rawMax = allPts.length > 0
    ? Math.max(...allPts.map(([, v]) => v), fireTarget ?? 0)
    : 1
  const maxVal = Math.max(rawMax, 1) * 1.08

  const xScale = (age: number) =>
    maxAge > minAge ? ((age - minAge) / (maxAge - minAge)) * innerW : 0
  const yScale = (val: number) => innerH - (val / maxVal) * innerH

  function pointsToPath(pts: [number, number][]): string {
    return pts
      .map(([age, val], i) => {
        const x = PAD.left + xScale(age)
        const y = PAD.top + yScale(Math.max(val, 0))
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
      })
      .join(' ')
  }

  // Build fractional FIRE junction point (interpolated between integer year boundaries)
  let fireFractionalPt: [number, number] | null = null
  if (fireAge !== null && fireAgeFractional !== null) {
    if (fireAge > currentAge) {
      const t = fireAgeFractional - (fireAge - 1)  // 0..1
      const ptBefore = allPts.find(([a]) => a === fireAge - 1)?.[1] ?? 0
      const ptAfter  = allPts.find(([a]) => a === fireAge)?.[1] ?? 0
      fireFractionalPt = [fireAgeFractional, ptBefore + t * (ptAfter - ptBefore)]
    } else {
      // Already at FIRE at currentAge
      fireFractionalPt = [currentAge, allPts[0]?.[1] ?? 0]
    }
  }

  // Split at fractional FIRE point for two-colour rendering (green = acc, orange = dec)
  const accPts: [number, number][] = fireFractionalPt !== null && fireAge !== null
    ? [...allPts.filter(([age]) => age < fireAge), fireFractionalPt]
    : fireAge !== null
    ? allPts.filter(([age]) => age <= fireAge)
    : allPts
  const decPts: [number, number][] = fireFractionalPt !== null && fireAge !== null
    ? [fireFractionalPt, ...allPts.filter(([age]) => age > fireAge)]
    : fireAge !== null
    ? allPts.filter(([age]) => age >= fireAge)
    : []

  // Use fractional position for the FIRE vertical line
  const xFire = fireAgeFractional !== null ? PAD.left + xScale(fireAgeFractional) : null
  const yZero = PAD.top + yScale(0)

  // Vertical markers for all recurring cashflows — one line per unique fromAge
  const recurringMarkers = (() => {
    const seen = new Set<number>()
    return cashflows
      .filter(cf => cf.type === 'recurring' && cf.fromAge > minAge && cf.fromAge < maxAge)
      .reduce<{ fromAge: number; label: string; direction: 'income' | 'expense'; amount: number }[]>((acc, cf) => {
        if (seen.has(cf.fromAge)) {
          const entry = acc.find(m => m.fromAge === cf.fromAge)!
          entry.label = entry.label.includes('·') ? entry.label : `${entry.label} · ${cf.name.length > 6 ? cf.name.slice(0, 5) + '…' : cf.name}`
          entry.amount += cf.direction === 'income' ? cf.amount : -cf.amount
          return acc
        }
        seen.add(cf.fromAge)
        acc.push({
          fromAge: cf.fromAge,
          label: cf.name.length > 8 ? cf.name.slice(0, 7) + '…' : cf.name,
          direction: cf.direction,
          amount: cf.direction === 'income' ? cf.amount : -cf.amount,
        })
        return acc
      }, [])
  })()

  // Module-kleuren: Horizon goud voor opbouw/inkomen, Kern bruin voor afbouw/uitgaven
  const COLOR_OPBOUW = 'var(--hor-t, #8a6e42)'
  const COLOR_AFBOUW = 'var(--kern-t, #58362d)'

  const yTicks = [0, 0.33, 0.66, 1.0].map(f => ({
    val: maxVal * f,
    y: PAD.top + yScale(maxVal * f),
  }))

  const totalAgeSpan = maxAge - minAge
  const xStep = totalAgeSpan <= 40 ? 5 : 10
  const xTickAges: number[] = []
  for (let a = Math.ceil(minAge / xStep) * xStep; a <= maxAge; a += xStep) {
    xTickAges.push(a)
  }

  const yFireDot = fireFractionalPt !== null ? PAD.top + yScale(Math.max(fireFractionalPt[1], 0)) : null

  // One-time cashflow markers (only for |amount| > 5000)
  const oneTimeMarkers = cashflows
    .filter(cf => cf.type === 'one_time' && Math.abs(cf.amount) > 5000)
    .filter(cf => cf.fromAge > minAge && cf.fromAge < maxAge)
    .map(cf => {
      const pt = allPts.find(([age]) => age === cf.fromAge + 1) ?? null
      const y = pt ? PAD.top + yScale(Math.max(pt[1], 0)) : null
      return { cf, x: PAD.left + xScale(cf.fromAge), y }
    })

  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 220 }} aria-hidden="true">
        {/* Grid lines */}
        {yTicks.map(({ val, y }) => (
          <line key={val} x1={PAD.left} x2={PAD.left + innerW} y1={y} y2={y}
            stroke="var(--border-ed)" strokeWidth={1} strokeDasharray="4 4" />
        ))}

        {/* Y-axis labels */}
        {yTicks.map(({ val, y }) => (
          <text key={val} x={PAD.left - 5} y={y + 4} textAnchor="end" fontSize={9}
            fill="var(--ink-4)" fontFamily="var(--font-dm-mono, monospace)">
            {val >= 1_000_000
              ? `€${(val / 1_000_000).toFixed(1)}M`
              : val >= 1_000
              ? `€${Math.round(val / 1_000)}k`
              : val > 0 ? `€${Math.round(val)}` : '€0'}
          </text>
        ))}

        {/* X-axis labels */}
        {xTickAges.map(age => (
          <text key={age} x={PAD.left + xScale(age)} y={H - 4} textAnchor="middle" fontSize={9}
            fill="var(--ink-4)" fontFamily="var(--font-dm-mono, monospace)">{age}</text>
        ))}

        {/* FIRE doelbedrag — horizontale dashed lijn */}
        {fireTarget != null && fireTarget > 0 && (
          <>
            <line
              x1={PAD.left} x2={PAD.left + innerW}
              y1={PAD.top + yScale(fireTarget)} y2={PAD.top + yScale(fireTarget)}
              stroke="var(--hor-t, #8a6e42)" strokeWidth={1.5} strokeDasharray="6 3" opacity={0.6}
            />
            <text
              x={PAD.left + innerW - 2} y={PAD.top + yScale(fireTarget) - 9}
              fontSize={8} fill="var(--hor-t, #8a6e42)" textAnchor="end"
              fontFamily="var(--font-inter, sans-serif)" fontWeight={600}
            >
              doel
            </text>
            <text
              x={PAD.left + innerW - 2} y={PAD.top + yScale(fireTarget) - 1}
              fontSize={7.5} fill="var(--hor-t, #8a6e42)" textAnchor="end"
              fontFamily="var(--font-dm-mono, monospace)"
            >
              {fireTarget >= 1_000_000
                ? `€${(fireTarget / 1_000_000).toFixed(2)}M`
                : `€${Math.round(fireTarget / 1000)}k`}
            </text>
          </>
        )}

        {/* Legacy target — horizontal dashed line at target portfolio value */}
        {strategy === 'legacy' && targetEndPortfolio != null && targetEndPortfolio > 0 && (
          <>
            <line
              x1={PAD.left} x2={PAD.left + innerW}
              y1={PAD.top + yScale(targetEndPortfolio)} y2={PAD.top + yScale(targetEndPortfolio)}
              stroke="var(--kern-t, #58362d)" strokeWidth={1.5} strokeDasharray="6 3" opacity={0.6}
            />
            <text
              x={PAD.left + innerW - 2} y={PAD.top + yScale(targetEndPortfolio) - 4}
              fontSize={8} fill="var(--kern-t, #58362d)" textAnchor="end"
              fontFamily="var(--font-inter, sans-serif)" fontWeight={600}
            >
              erfenis {targetEndPortfolio >= 1_000_000
                ? `€${(targetEndPortfolio / 1_000_000).toFixed(1)}M`
                : `€${Math.round(targetEndPortfolio / 1000)}k`}
            </text>
          </>
        )}

        {/* Zero baseline */}
        <line x1={PAD.left} x2={PAD.left + innerW} y1={yZero} y2={yZero}
          stroke="var(--border-md)" strokeWidth={1.5} />

        {/* Recurring cashflow dashed verticals (one per unique fromAge) */}
        {recurringMarkers.map(({ fromAge, direction }) => {
          const x = PAD.left + xScale(fromAge)
          const lineColor = direction === 'income' ? COLOR_OPBOUW : COLOR_AFBOUW
          return (
            <line key={`rec-vline-${fromAge}`} x1={x} x2={x} y1={PAD.top} y2={PAD.top + innerH}
              stroke={lineColor} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.7} />
          )
        })}

        {/* FIRE dashed vertical */}
        {xFire !== null && fireAgeFractional !== null && fireAgeFractional > minAge && fireAgeFractional < maxAge && (
          <line x1={xFire} x2={xFire} y1={PAD.top} y2={PAD.top + innerH}
            stroke={COLOR_OPBOUW} strokeWidth={1.5} strokeDasharray="4 2" opacity={0.85} />
        )}

        {/* Accumulation path — horizon goud */}
        {accPts.length > 1 && (
          <path
            d={pointsToPath(accPts)}
            fill="none"
            stroke={COLOR_OPBOUW}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset={hasEntered ? 0 : 1}
            style={{ transition: hasEntered ? 'stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1)' : 'none' }}
          />
        )}

        {/* Decumulation path — kern bruin (or horizon goud for perpetual) */}
        {decPts.length > 1 && (
          <path
            d={pointsToPath(decPts)}
            fill="none"
            stroke={strategy === 'perpetual' ? COLOR_OPBOUW : COLOR_AFBOUW}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset={hasEntered ? 0 : 1}
            style={{ transition: hasEntered ? 'stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1) 0.15s' : 'none' }}
          />
        )}

        {/* Path when FIRE not reachable — grey single line */}
        {fireAge === null && allPts.length > 1 && (
          <path
            d={pointsToPath(allPts)}
            fill="none"
            stroke="var(--ink-3)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset={hasEntered ? 0 : 1}
            style={{ transition: hasEntered ? 'stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1)' : 'none' }}
          />
        )}

        {/* Dot at FIRE junction */}
        {xFire !== null && yFireDot !== null && fireAgeFractional !== null && fireAgeFractional > minAge && fireAgeFractional < maxAge && (
          <circle cx={xFire} cy={yFireDot} r={5}
            fill={COLOR_OPBOUW} stroke="var(--paper)" strokeWidth={1.5} />
        )}

        {/* One-time cashflow markers */}
        {oneTimeMarkers.map(({ cf, x, y }) => y !== null && (
          <g key={cf.id}>
            <circle cx={x} cy={y - 8} r={4}
              fill={cf.direction === 'income' ? COLOR_OPBOUW : COLOR_AFBOUW}
              stroke="var(--paper)" strokeWidth={1} opacity={0.9} />
            <text x={x} y={y - 14} textAnchor="middle" fontSize={7}
              fill={cf.direction === 'income' ? COLOR_OPBOUW : COLOR_AFBOUW}
              fontFamily="var(--font-inter, sans-serif)">
              {cf.name.length > 8 ? cf.name.slice(0, 7) + '…' : cf.name}
            </text>
          </g>
        ))}

        {/* Phase label: OPBOUW */}
        {fireAgeFractional !== null && fireAgeFractional > minAge + 3 && (
          <text x={PAD.left + xScale((minAge + fireAgeFractional) / 2)} y={PAD.top + 14}
            textAnchor="middle" fontSize={10} fill={COLOR_OPBOUW}
            fontFamily="var(--font-inter, sans-serif)" fontWeight={600}>
            OPBOUW
          </text>
        )}

        {/* Phase label: AFBOUW or BEHOUD (perpetual) */}
        {fireAgeFractional !== null && fireAgeFractional < maxAge - 3 && (
          <text x={PAD.left + xScale((fireAgeFractional + maxAge) / 2)} y={PAD.top + 14}
            textAnchor="middle" fontSize={10}
            fill={strategy === 'perpetual' ? COLOR_OPBOUW : COLOR_AFBOUW}
            fontFamily="var(--font-inter, sans-serif)" fontWeight={600}>
            {strategy === 'perpetual' ? 'BEHOUD' : 'AFBOUW'}
          </text>
        )}

        {/* FIRE age label */}
        {xFire !== null && fireAgeFractional !== null && fireAgeFractional > minAge && fireAgeFractional < maxAge && (
          <text x={xFire + 4} y={PAD.top + 24} fontSize={8}
            fill={COLOR_OPBOUW} fontFamily="var(--font-inter, sans-serif)" fontWeight={600}>
            FIRE {fireAgeFractional.toFixed(1)}
          </text>
        )}

        {/* Recurring cashflow labels with € amount near bottom of chart */}
        {recurringMarkers.map(({ fromAge, label, direction, amount }) => {
          const x = PAD.left + xScale(fromAge)
          const textColor = direction === 'income' ? COLOR_OPBOUW : COLOR_AFBOUW
          const absAmt = Math.abs(amount)
          const amtFmt = absAmt >= 1000 ? `€${(absAmt / 1000).toFixed(1)}k` : `€${Math.round(absAmt)}`
          const prefix = direction === 'income' ? '+' : '−'
          return (
            <g key={`rec-label-${fromAge}`}>
              <text x={x + 3} y={PAD.top + innerH - 14} fontSize={8}
                fill={textColor} fontFamily="var(--font-inter, sans-serif)" fontWeight={600}>
                {label}
              </text>
              <text x={x + 3} y={PAD.top + innerH - 4} fontSize={7.5}
                fill={textColor} fontFamily="var(--font-dm-mono, monospace)">
                {prefix}{amtFmt}/mnd
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
