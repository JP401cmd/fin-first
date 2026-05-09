'use client'

import { memo } from 'react'
import { LineChart } from 'lucide-react'
import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { MaskedAmount } from '@/components/app/masked-amount'
import {
  SurplusGapChart,
  SurplusGapSummary,
  computeLifetimeTotals,
  type SurplusGapRow,
} from '@/components/app/horizon/surplus-gap-chart'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

const KICKER = 'Surplus / Gap'

export const SurplusGapWidget = memo(function SurplusGapWidget({ size, data, href }: Props) {
  const { simRows, fireAgeFractional, fireEndStrategy } = data

  if (size === 'mini') {
    return (
      <WidgetShell module="horizon" size="mini" kicker={KICKER} href={href}>
        <p className="text-[var(--ink)] leading-none truncate">
          {simRows && simRows.length > 1
            ? <SaldoMini rows={simRows} />
            : <span className="font-mono text-[15px] font-semibold tabular-nums text-[var(--ink-3)]">—</span>
          }
        </p>
      </WidgetShell>
    )
  }

  if (!simRows || simRows.length < 2) {
    return (
      <WidgetShell module="horizon" size={size} kicker={KICKER} href={href}>
        <WidgetEmpty
          variant="first-use"
          icon={LineChart}
          description="Niet genoeg data — vul je profiel verder aan om je vermogensstromen te zien."
          action={{ label: 'Profiel aanvullen', href: '/identity/profiel' }}
        />
      </WidgetShell>
    )
  }

  const planningMode: 'fire' | 'pensioen' = fireEndStrategy === 'pensioen' ? 'pensioen' : 'fire'
  const currentAge = simRows[0].age
  const endAge = simRows[simRows.length - 1].age
  const totals = computeLifetimeTotals(simRows)

  if (size === 'quarter') {
    return (
      <WidgetShell module="horizon" size={size} kicker={KICKER} href={href}>
        <div className="flex h-full flex-col justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-[var(--ink-4)] font-mono mb-1">Saldo over leven</p>
            <p className="leading-none">
              <MaskedAmount
                value={totals.saldo}
                tone={totals.saldo >= 0 ? 'horizon' : 'kern'}
                signPrefix={totals.saldo >= 0 ? '+' : '-'}
                className={`font-mono text-[22px] font-semibold tabular-nums ${
                  totals.saldo >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                }`}
              />
            </p>
          </div>
          <SaldoSparkline rows={simRows} />
        </div>
      </WidgetShell>
    )
  }

  if (size === 'half') {
    return (
      <WidgetShell module="horizon" size={size} kicker={KICKER} href={href}>
        <div className="flex h-full flex-col gap-2">
          <div className="flex-1 min-h-0">
            <SurplusGapChart
              rows={simRows as SurplusGapRow[]}
              currentAge={currentAge}
              endAge={endAge}
              fireAge={fireAgeFractional ?? null}
              planningMode={planningMode}
              height={120}
              showLegend={false}
            />
          </div>
          <SurplusGapSummary rows={simRows as SurplusGapRow[]} variant="inline" />
        </div>
      </WidgetShell>
    )
  }

  // ── Full ────────────────────────────────────────────
  const kantelpuntCopy = buildKantelpuntCopy(totals.kantelpuntAge, totals.opgebouwd, totals.ingeteerd)

  return (
    <WidgetShell module="horizon" size={size} kicker={KICKER} href={href}>
      <div className="flex h-full flex-col">
        <div className="flex items-baseline justify-between mb-1">
          <p className="text-[9px] uppercase tracking-[0.18em] text-[var(--ink-4)] font-mono">Vermogensstromen per jaar</p>
          <p className="text-[9px] uppercase tracking-[0.15em] text-[var(--ink-4)] font-mono">Bijgewerkt vandaag</p>
        </div>
        <div className="flex-1 min-h-0">
          <SurplusGapChart
            rows={simRows as SurplusGapRow[]}
            currentAge={currentAge}
            endAge={endAge}
            fireAge={fireAgeFractional ?? null}
            planningMode={planningMode}
          />
        </div>
        <SurplusGapSummary rows={simRows as SurplusGapRow[]} variant="strip" />
        <p className="font-serif italic text-[12px] leading-snug text-[var(--ink-3)] mt-1">
          {kantelpuntCopy}
        </p>
      </div>
    </WidgetShell>
  )
})

function SaldoMini({ rows }: { rows: SurplusGapRow[] }) {
  const totals = computeLifetimeTotals(rows)
  const tone = totals.saldo >= 0 ? 'horizon' : 'kern'
  return (
    <MaskedAmount
      value={totals.saldo}
      tone={tone}
      signPrefix={totals.saldo >= 0 ? '+' : '-'}
      className={`text-[15px] font-semibold ${
        totals.saldo >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
      }`}
    />
  )
}

function SaldoSparkline({ rows }: { rows: SurplusGapRow[] }) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 600 })
  const W = 120
  const H = 40
  const PAD = 1
  const innerW = W - PAD * 2
  const innerH = H - PAD * 2

  const nets = rows.map(r => r.flowIn - r.flowOut)
  if (nets.length === 0) return null

  const sorted = nets.map(n => Math.abs(n)).filter(v => v > 0).sort((a, b) => a - b)
  const maxAbs = Math.max(quantile(sorted, 0.95), 1)
  const yZero = PAD + innerH / 2
  const yScale = (val: number) => yZero - (Math.max(-maxAbs, Math.min(maxAbs, val)) / maxAbs) * (innerH / 2)
  const barW = Math.max(1, innerW / nets.length - 0.5)

  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[40px]" aria-hidden="true">
        <line x1={PAD} x2={PAD + innerW} y1={yZero} y2={yZero}
          stroke="var(--border-ed)" strokeWidth={0.5} />
        {nets.map((net, i) => {
          const isPos = net >= 0
          const yEnd = yScale(net)
          const barH = Math.abs(yEnd - yZero)
          const yTop = isPos ? yEnd : yZero
          const x = PAD + (i / nets.length) * innerW
          return (
            <rect key={i}
              x={x}
              y={hasEntered ? yTop : yZero}
              width={barW}
              height={hasEntered ? Math.max(barH, 0.5) : 0}
              fill={isPos ? 'var(--positive)' : 'var(--negative)'}
              opacity={0.85}
              style={{
                transition: hasEntered
                  ? `y 500ms cubic-bezier(.22,1,.36,1) ${Math.min(i * 5, 200)}ms, height 500ms cubic-bezier(.22,1,.36,1) ${Math.min(i * 5, 200)}ms`
                  : 'none',
              }}
            />
          )
        })}
      </svg>
    </div>
  )
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base])
  }
  return sorted[base]
}

function buildKantelpuntCopy(kantelpuntAge: number | null, opgebouwd: number, ingeteerd: number): string {
  if (kantelpuntAge != null) {
    return `Tot leeftijd ${kantelpuntAge} bouw je elk jaar op, daarna teer je in.`
  }
  if (opgebouwd > 0 && ingeteerd === 0) {
    return 'Je hele horizon is opbouw — je teert nooit in.'
  }
  if (ingeteerd > 0 && opgebouwd === 0) {
    return 'Je teert al in vanaf het begin van de horizon.'
  }
  return 'Wisselende jaren van opbouw en inteer over je horizon.'
}
