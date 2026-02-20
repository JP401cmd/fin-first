'use client'

import { useMemo } from 'react'
import { type Goal, computeGoalProgress, getGoalColorClasses } from '@/lib/goal-data'
import { formatCurrency } from '@/components/app/budget-shared'
import { TrendingUp, TrendingDown, Minus, Flag, AlertTriangle, Clock } from 'lucide-react'

type HistoryPoint = {
  date: string       // ISO date string
  value: number      // goal current_value at that point
  source?: string    // 'initial' | 'contribution' | 'linked' | 'update'
}

type GoalProgressTimelineProps = {
  goal: Goal
  history: HistoryPoint[]
}

/**
 * GoalProgressTimeline: Line chart showing goal progress over time.
 *
 * Features:
 * - Line chart of current_value changes
 * - Target value overlay line (dashed)
 * - Deadline marker with on-track indicator
 * - Pace message: "Op dit tempo bereik je je doel X maanden eerder/later"
 * - Handles goals without deadlines gracefully
 */
export function GoalProgressTimeline({ goal, history }: GoalProgressTimelineProps) {
  const colors = getGoalColorClasses(goal.color)
  const { pct, onTrack } = computeGoalProgress(goal)
  const isFreedm = goal.goal_type === 'freedom_days'
  const target = Number(goal.target_value)

  // Sort history chronologically
  const sorted = useMemo(
    () => [...history].sort((a, b) => a.date.localeCompare(b.date)),
    [history],
  )

  // Compute pace message
  const paceMessage = useMemo(() => {
    return computePaceMessage(goal, sorted)
  }, [goal, sorted])

  // --- Chart dimensions ---
  const W = 420
  const H = 170
  const PAD = { top: 15, right: 15, bottom: 30, left: 60 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  if (sorted.length < 2) {
    return (
      <div data-testid="goal-timeline-insufficient">
        <p className="mb-2 text-xs font-semibold text-[var(--ink-3)] uppercase">
          Voortgang over tijd
        </p>
        <div className="rounded-lg bg-[var(--subtle)] p-4 text-center">
          {sorted.length === 1 ? (
            <>
              <p className="text-xs text-[var(--ink-3)]">
                {isFreedm
                  ? `${Math.round(Number(sorted[0].value))} dagen`
                  : formatCurrency(Number(sorted[0].value))}
                {' op '}
                {new Date(sorted[0].date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              <p className="mt-1 text-[10px] text-[var(--ink-3)]">
                Voeg bijdragen of updates toe voor een trendgrafiek.
              </p>
            </>
          ) : (
            <p className="text-xs text-[var(--ink-3)]">
              Nog geen voortgangshistorie beschikbaar.
            </p>
          )}
        </div>
        {/* Still show pace message if we have a deadline */}
        {goal.target_date && (
          <PaceMessageBanner goal={goal} paceMessage={paceMessage} onTrack={onTrack} colors={colors} />
        )}
      </div>
    )
  }

  // --- Data for chart ---
  const values = sorted.map(p => p.value)
  const allValues = [...values, target]
  const minVal = Math.min(...allValues) * 0.95
  const maxVal = Math.max(...allValues) * 1.05
  const range = maxVal - minVal || 1

  // Date range
  const dateStart = new Date(sorted[0].date).getTime()
  const dateEnd = new Date(sorted[sorted.length - 1].date).getTime()

  // If there's a deadline, extend the date range to include it
  const hasDeadline = !!goal.target_date
  const deadlineTime = hasDeadline ? new Date(goal.target_date!).getTime() : dateEnd
  const chartDateEnd = hasDeadline ? Math.max(dateEnd, deadlineTime) : dateEnd
  const dateRange = chartDateEnd - dateStart || 1

  function xPos(dateStr: string) {
    const t = new Date(dateStr).getTime()
    return PAD.left + ((t - dateStart) / dateRange) * chartW
  }
  function yPos(val: number) {
    return PAD.top + chartH - ((val - minVal) / range) * chartH
  }

  // Build the line path
  const linePath = sorted.map((p, i) =>
    `${i === 0 ? 'M' : 'L'} ${xPos(p.date).toFixed(1)} ${yPos(p.value).toFixed(1)}`
  ).join(' ')

  // Area fill below line
  const areaPath = `${linePath} L ${xPos(sorted[sorted.length - 1].date).toFixed(1)} ${(PAD.top + chartH).toFixed(1)} L ${xPos(sorted[0].date).toFixed(1)} ${(PAD.top + chartH).toFixed(1)} Z`

  // Y-axis ticks (5 ticks)
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => minVal + t * range)

  // X-axis date labels (max 5)
  const labelStep = Math.max(1, Math.floor(sorted.length / 4))

  // Target line y position
  const targetY = yPos(target)

  // Deadline x position
  const deadlineX = hasDeadline ? xPos(goal.target_date!) : null

  // Projection line: from last point to target at deadline
  const lastPoint = sorted[sorted.length - 1]
  const projectionPath = hasDeadline && deadlineX !== null
    ? `M ${xPos(lastPoint.date).toFixed(1)} ${yPos(lastPoint.value).toFixed(1)} L ${deadlineX.toFixed(1)} ${targetY.toFixed(1)}`
    : null

  // Color for the main line
  const lineColor = goal.color === 'teal' ? '#0d9488' :
    goal.color === 'amber' ? '#d97706' :
    goal.color === 'purple' ? '#9333ea' :
    goal.color === 'emerald' ? '#059669' :
    goal.color === 'red' ? '#dc2626' :
    goal.color === 'blue' ? '#2563eb' : '#0d9488'

  const fillOpacity = 0.08

  return (
    <div data-testid="goal-timeline">
      <p className="mb-2 text-xs font-semibold text-[var(--ink-3)] uppercase">
        Voortgang over tijd
      </p>

      {/* SVG Chart */}
      <div className="rounded-lg bg-[var(--subtle)] p-3" data-testid="goal-timeline-chart">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full" preserveAspectRatio="xMidYMid meet">
          {/* Grid lines and Y labels */}
          {yTicks.map((val, i) => (
            <g key={i}>
              <line
                x1={PAD.left}
                y1={yPos(val)}
                x2={W - PAD.right}
                y2={yPos(val)}
                stroke="#e4e4e7"
                strokeWidth="0.5"
              />
              <text x={PAD.left - 6} y={yPos(val) + 3} textAnchor="end" fontSize="7" fill="#a1a1aa">
                {isFreedm
                  ? `${Math.round(val)}d`
                  : val >= 1000
                    ? `€${(val / 1000).toFixed(0)}k`
                    : `€${val.toFixed(0)}`}
              </text>
            </g>
          ))}

          {/* Target line (dashed horizontal) */}
          <line
            x1={PAD.left}
            y1={targetY}
            x2={W - PAD.right}
            y2={targetY}
            stroke="#a855f7"
            strokeWidth="1"
            strokeDasharray="4 3"
            opacity={0.6}
          />
          <text
            x={W - PAD.right}
            y={targetY - 4}
            textAnchor="end"
            fontSize="7"
            fill="#a855f7"
            fontWeight="600"
          >
            Doel: {isFreedm ? `${Math.round(target)}d` : formatCurrency(target)}
          </text>

          {/* Deadline marker (vertical dashed line) */}
          {hasDeadline && deadlineX !== null && deadlineX >= PAD.left && deadlineX <= W - PAD.right && (
            <>
              <line
                x1={deadlineX}
                y1={PAD.top}
                x2={deadlineX}
                y2={PAD.top + chartH}
                stroke="#f59e0b"
                strokeWidth="1"
                strokeDasharray="3 3"
                opacity={0.7}
              />
              {/* Flag icon at top of deadline */}
              <text
                x={deadlineX}
                y={PAD.top - 2}
                textAnchor="middle"
                fontSize="8"
                fill="#f59e0b"
              >
                🏁
              </text>
              <text
                x={deadlineX}
                y={PAD.top + chartH + 12}
                textAnchor="middle"
                fontSize="6.5"
                fill="#f59e0b"
                fontWeight="600"
              >
                {new Date(goal.target_date!).toLocaleDateString('nl-NL', { month: 'short', year: '2-digit' })}
              </text>
            </>
          )}

          {/* Projection line (dashed, from last point toward target at deadline) */}
          {projectionPath && (
            <path
              d={projectionPath}
              fill="none"
              stroke={lineColor}
              strokeWidth="1.5"
              strokeDasharray="4 3"
              opacity={0.4}
            />
          )}

          {/* Area fill */}
          <path d={areaPath} fill={lineColor} fillOpacity={fillOpacity} />

          {/* Main line */}
          <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

          {/* Data points */}
          {sorted.map((p, i) => (
            <circle
              key={`${p.date}-${i}`}
              cx={xPos(p.date)}
              cy={yPos(p.value)}
              r={sorted.length <= 20 ? 3 : 2}
              fill={i === sorted.length - 1 ? lineColor : '#a1a1aa'}
              stroke="white"
              strokeWidth="1"
            />
          ))}

          {/* X-axis date labels */}
          {sorted.filter((_, i) => i % labelStep === 0 || i === sorted.length - 1).map((p, _, arr) => {
            const idx = sorted.indexOf(p)
            return (
              <text
                key={`x-${p.date}-${idx}`}
                x={xPos(p.date)}
                y={H - 4}
                textAnchor="middle"
                fontSize="7"
                fill="#a1a1aa"
              >
                {new Date(p.date).toLocaleDateString('nl-NL', { month: 'short', year: '2-digit' })}
              </text>
            )
          })}
        </svg>

        {/* Legend */}
        <div className="mt-1 flex flex-wrap items-center gap-4 text-[10px] text-[var(--ink-3)]">
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-3 rounded" style={{ backgroundColor: lineColor }} />
            Werkelijke voortgang
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-3 rounded border-b border-dashed" style={{ borderColor: '#a855f7' }} />
            Doelwaarde
          </span>
          {hasDeadline && (
            <span className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-3 rounded border-b border-dashed" style={{ borderColor: '#f59e0b' }} />
              Deadline
            </span>
          )}
          {projectionPath && (
            <span className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-3 rounded border-b border-dashed" style={{ borderColor: lineColor, opacity: 0.4 }} />
              Projectielijn
            </span>
          )}
        </div>
      </div>

      {/* On-track / pace message */}
      <PaceMessageBanner goal={goal} paceMessage={paceMessage} onTrack={onTrack} colors={colors} />
    </div>
  )
}

function PaceMessageBanner({
  goal,
  paceMessage,
  onTrack,
  colors,
}: {
  goal: Goal
  paceMessage: PaceResult | null
  onTrack: boolean
  colors: ReturnType<typeof getGoalColorClasses>
}) {
  if (!paceMessage) return null

  const { message, status } = paceMessage

  const bgClass = status === 'ahead' ? 'bg-emerald-50 border-emerald-200'
    : status === 'behind' ? 'bg-red-50 border-red-200'
    : status === 'on_track' ? 'bg-wil-50 border-wil-200'
    : 'bg-[var(--subtle)] border-[var(--border-ed)]'

  const textClass = status === 'ahead' ? 'text-emerald-700'
    : status === 'behind' ? 'text-red-700'
    : status === 'on_track' ? 'text-wil-700'
    : 'text-[var(--ink-2)]'

  const Icon = status === 'ahead' ? TrendingUp
    : status === 'behind' ? AlertTriangle
    : status === 'on_track' ? TrendingUp
    : Clock

  return (
    <div className={`mt-3 flex items-start gap-2 rounded-lg border p-3 ${bgClass}`} data-testid="goal-pace-message">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${textClass}`} />
      <p className={`text-xs font-medium ${textClass}`}>
        {message}
      </p>
    </div>
  )
}

type PaceResult = {
  message: string
  status: 'ahead' | 'behind' | 'on_track' | 'no_deadline' | 'no_progress'
}

/**
 * Compute pace message for a goal.
 * "Op dit tempo bereik je je doel X maanden eerder/later"
 */
function computePaceMessage(goal: Goal, sortedHistory: HistoryPoint[]): PaceResult | null {
  const current = Number(goal.current_value)
  const target = Number(goal.target_value)

  if (target <= 0) return null

  // If already completed
  if (current >= target) {
    return {
      message: 'Gefeliciteerd! Je hebt je doel bereikt! 🎉',
      status: 'ahead',
    }
  }

  // Need at least 2 data points to calculate pace
  if (sortedHistory.length < 2) {
    if (!goal.target_date) {
      return {
        message: 'Voeg meer datapunten toe om je voortgangstempo te berekenen.',
        status: 'no_progress',
      }
    }
    // With deadline but no pace data
    const daysLeft = Math.max(0, (new Date(goal.target_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    const remaining = target - current
    if (daysLeft <= 0) {
      return {
        message: `Je deadline is verstreken. Nog ${formatValue(remaining, goal)} te gaan.`,
        status: 'behind',
      }
    }
    return {
      message: `Nog ${Math.ceil(daysLeft)} dagen tot je deadline. Voeg bijdragen toe om je tempo te berekenen.`,
      status: 'no_progress',
    }
  }

  // Calculate rate of change (value per day)
  const first = sortedHistory[0]
  const last = sortedHistory[sortedHistory.length - 1]
  const daysBetween = Math.max(1, (new Date(last.date).getTime() - new Date(first.date).getTime()) / (1000 * 60 * 60 * 24))
  const valueChange = last.value - first.value

  if (valueChange <= 0) {
    if (!goal.target_date) {
      return {
        message: 'Je voortgang is stilgevallen. Voeg bijdragen toe om richting je doel te bewegen.',
        status: 'no_progress',
      }
    }
    return {
      message: 'Je voortgang is stilgevallen. Verhoog je bijdragen om je deadline te halen.',
      status: 'behind',
    }
  }

  const ratePerDay = valueChange / daysBetween
  const remaining = target - current
  const daysToTarget = remaining / ratePerDay

  if (!goal.target_date) {
    // No deadline — just show estimated completion date
    const etaDate = new Date(Date.now() + daysToTarget * 24 * 60 * 60 * 1000)
    const months = Math.round(daysToTarget / 30)
    return {
      message: months <= 1
        ? `Op dit tempo bereik je je doel binnen een maand (${etaDate.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })}).`
        : `Op dit tempo bereik je je doel over ${months} maanden (${etaDate.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })}).`,
      status: 'on_track',
    }
  }

  // With deadline
  const deadlineTime = new Date(goal.target_date).getTime()
  const nowTime = Date.now()
  const daysUntilDeadline = (deadlineTime - nowTime) / (1000 * 60 * 60 * 24)

  if (daysUntilDeadline <= 0) {
    return {
      message: `Je deadline is verstreken. Nog ${formatValue(remaining, goal)} te gaan.`,
      status: 'behind',
    }
  }

  const etaTime = nowTime + daysToTarget * 24 * 60 * 60 * 1000
  const diffMs = deadlineTime - etaTime
  const diffMonths = Math.round(Math.abs(diffMs) / (1000 * 60 * 60 * 24 * 30))

  if (Math.abs(diffMonths) < 1) {
    // Within 1 month of target
    return {
      message: 'Op dit tempo bereik je je doel precies rond de deadline.',
      status: 'on_track',
    }
  }

  if (diffMs > 0) {
    // Ahead of schedule
    return {
      message: `Op dit tempo bereik je je doel ${diffMonths} ${diffMonths === 1 ? 'maand' : 'maanden'} eerder dan de deadline.`,
      status: 'ahead',
    }
  } else {
    // Behind schedule
    return {
      message: `Op dit tempo bereik je je doel ${diffMonths} ${diffMonths === 1 ? 'maand' : 'maanden'} later dan de deadline.`,
      status: 'behind',
    }
  }
}

function formatValue(value: number, goal: Goal): string {
  if (goal.goal_type === 'freedom_days') {
    return `${Math.round(value)} dagen`
  }
  return formatCurrency(value)
}

/**
 * Build history points for a goal from contributions and current state.
 * This constructs a timeline from:
 * 1. Goal created_at with initial value (if we can deduce it)
 * 2. Goal contributions (cumulative)
 * 3. Current state
 */
export function buildGoalHistory(
  goal: Goal,
  contributions: { date: string; amount: number }[],
): HistoryPoint[] {
  const points: HistoryPoint[] = []

  if (contributions.length === 0) {
    // Only 2 points: created_at and now
    const createdDate = goal.created_at.split('T')[0]
    const todayDate = new Date().toISOString().split('T')[0]

    // If the goal was just created today, we only have 1 point
    if (createdDate === todayDate) {
      points.push({
        date: todayDate,
        value: Number(goal.current_value),
        source: 'initial',
      })
    } else {
      // We assume the initial value was 0 at creation (unless same-day)
      points.push({
        date: createdDate,
        value: 0,
        source: 'initial',
      })
      points.push({
        date: todayDate,
        value: Number(goal.current_value),
        source: 'update',
      })
    }
    return points
  }

  // Sort contributions chronologically
  const sortedContribs = [...contributions].sort((a, b) => a.date.localeCompare(b.date))

  // Starting point: goal created_at with value 0 (before contributions)
  const createdDate = goal.created_at.split('T')[0]
  const firstContribDate = sortedContribs[0].date

  // Determine initial value (current minus sum of all contributions)
  const totalContributed = sortedContribs.reduce((sum, c) => sum + Number(c.amount), 0)
  const initialValue = Math.max(0, Number(goal.current_value) - totalContributed)

  // Add starting point
  if (createdDate < firstContribDate) {
    points.push({
      date: createdDate,
      value: initialValue,
      source: 'initial',
    })
  }

  // Build cumulative values from contributions
  let cumulative = initialValue
  for (const contrib of sortedContribs) {
    cumulative += Number(contrib.amount)
    points.push({
      date: contrib.date,
      value: cumulative,
      source: 'contribution',
    })
  }

  // Add current value as final point if different from last
  const todayDate = new Date().toISOString().split('T')[0]
  const lastPoint = points[points.length - 1]
  const currentVal = Number(goal.current_value)

  if (lastPoint && (lastPoint.date !== todayDate || Math.abs(lastPoint.value - currentVal) > 0.01)) {
    points.push({
      date: todayDate,
      value: currentVal,
      source: 'update',
    })
  }

  return points
}
