import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { CheckCircle2, Circle } from 'lucide-react'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

const MILESTONES = [
  { pct: 25, label: 'Eerste kwartaal', desc: '1 dag op 4 gedekt' },
  { pct: 50, label: 'Halverwege', desc: 'Helft vrijheid bereikt' },
  { pct: 75, label: 'Finishstraight', desc: '3 van 4 dagen gedekt' },
  { pct: 100, label: 'Volledige vrijheid', desc: 'FIRE bereikt' },
]

function yearsToDate(years: number): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() + Math.floor(years))
  d.setMonth(d.getMonth() + Math.round((years % 1) * 12))
  return d.toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' })
}

export function VrijheidsMijlpalenWidget({ size, data, href }: Props) {
  const { freedomPct, fireTarget, netWorth, fireProjResult } = data

  // Monthly savings approximation using countdown
  const countdownYears = fireProjResult.countdownYears + fireProjResult.countdownMonths / 12
  const monthlySavingsApprox = countdownYears > 0 && fireTarget > 0
    ? (fireTarget - netWorth) / (countdownYears * 12)
    : 0

  const getMilestoneDate = (targetPct: number): string | null => {
    const targetAmount = fireTarget * (targetPct / 100)
    if (netWorth >= targetAmount) return null // Already reached
    if (monthlySavingsApprox <= 0) return null
    const monthsNeeded = (targetAmount - netWorth) / monthlySavingsApprox
    return yearsToDate(monthsNeeded / 12)
  }

  const activeMilestoneIdx = MILESTONES.findIndex(m => freedomPct < m.pct)

  return (
    <WidgetShell module="horizon" size={size} kicker="Vrijheidsmijlpalen" href={href}>
      <div className="mt-1 space-y-2">
        {MILESTONES.map((m, i) => {
          const reached = freedomPct >= m.pct
          const isActive = i === activeMilestoneIdx
          const date = reached ? null : getMilestoneDate(m.pct)

          return (
            <div
              key={m.pct}
              className={`flex items-center gap-2.5 ${isActive ? 'opacity-100' : reached ? 'opacity-60' : 'opacity-40'}`}
            >
              {/* Icon */}
              <div className="shrink-0">
                {reached ? (
                  <CheckCircle2 className="h-4 w-4 text-horizon-600" />
                ) : (
                  <Circle className={`h-4 w-4 ${isActive ? 'text-horizon-500' : 'text-[var(--border-md)]'}`} />
                )}
              </div>

              {/* Label + date */}
              <div className="min-w-0 flex-1">
                <p className={`text-xs font-medium leading-tight ${isActive ? 'text-[var(--ink)]' : 'text-[var(--ink-3)]'}`}>
                  {m.label}
                </p>
                {size === 'full' && (
                  <p className="text-[10px] text-[var(--ink-4)] leading-tight">{m.desc}</p>
                )}
              </div>

              {/* Right: percentage or date */}
              <div className="shrink-0 text-right">
                {reached ? (
                  <span className="text-[10px] font-semibold text-horizon-600 uppercase tracking-wide">Bereikt</span>
                ) : date ? (
                  <span className="font-mono text-[10px] text-[var(--ink-3)]">{date}</span>
                ) : (
                  <span className="font-mono text-[10px] text-[var(--ink-4)]">{m.pct}%</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </WidgetShell>
  )
}
