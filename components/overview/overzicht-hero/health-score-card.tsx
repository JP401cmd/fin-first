'use client'

import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import type { HealthScore } from '@/lib/financial-health'

const BAND_STYLES: Record<
  string,
  { ring: string; label: string; text: string; bgInner: string }
> = {
  uitstekend: { ring: 'stroke-emerald-600', label: 'Uitstekend', text: 'text-emerald-700', bgInner: 'bg-emerald-50' },
  sterk:      { ring: 'stroke-emerald-500', label: 'Sterk',      text: 'text-emerald-600', bgInner: 'bg-emerald-50' },
  redelijk:   { ring: 'stroke-amber-500',   label: 'Redelijk',   text: 'text-amber-700',   bgInner: 'bg-amber-50' },
  kwetsbaar:  { ring: 'stroke-orange-500',  label: 'Kwetsbaar',  text: 'text-orange-700',  bgInner: 'bg-orange-50' },
  kritiek:    { ring: 'stroke-red-600',     label: 'Kritiek',    text: 'text-red-700',     bgInner: 'bg-red-50' },
}

/**
 * Vertaal pillars naar een tijds-anker. Voorkeur: fire_progress (voortgang
 * naar vrijheid), fallback: emergency_fund (maanden buffer). Filtert "0..."-
 * waardes uit zodat we geen verwarrende "0% op weg" tonen.
 */
function getTimeAnchor(
  health: HealthScore,
): { kind: 'fire' | 'buffer'; value: string } | null {
  const firePillar = health.pillars.find((p) => p.id === 'fire_progress')
  if (firePillar?.rawValue && !firePillar.rawValue.startsWith('0')) {
    return { kind: 'fire', value: firePillar.rawValue }
  }
  const bufferPillar = health.pillars.find((p) => p.id === 'emergency_fund')
  if (bufferPillar?.rawValue && !bufferPillar.rawValue.startsWith('0')) {
    return { kind: 'buffer', value: bufferPillar.rawValue }
  }
  return null
}

export function HealthScoreCard({
  health,
  onOpenReceipt,
}: {
  health: HealthScore
  onOpenReceipt: () => void
}) {
  // Whitelist-cast: onbekende labels uit financial-health.ts vallen veilig
  // terug op 'redelijk' i.p.v. silent te crashen op undefined.
  const normalized = health.label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
  const band: keyof typeof BAND_STYLES = (normalized in BAND_STYLES
    ? normalized
    : 'redelijk') as keyof typeof BAND_STYLES
  const style = BAND_STYLES[band] ?? BAND_STYLES.redelijk!

  // SVG ring math
  const size = 96
  const stroke = 10
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const progress = Math.max(0, Math.min(100, health.total)) / 100
  const dashOffset = circumference * (1 - progress)

  // Animeer stroke-vulling bij eerste view (respecteert prefers-reduced-motion).
  const { ref, hasEntered } = useInViewAnimation({ duration: 700 })
  const timeAnchor = getTimeAnchor(health)

  const trend = health.trend
  const trendLabel =
    trend > 0
      ? `+${trend.toFixed(0)} punten t.o.v. vorige maand`
      : trend < 0
      ? `${trend.toFixed(0)} punten t.o.v. vorige maand`
      : 'gelijk aan vorige maand'

  return (
    <button
      type="button"
      onClick={onOpenReceipt}
      aria-label="Open detail van financiële gezondheidsscore"
      className={`flex flex-col items-center justify-center text-center rounded-2xl border border-[var(--border-ed)] ${style.bgInner} p-4 sm:p-5 hover:border-[var(--ink-3)] hover:shadow-sm transition-all w-full h-full`}
    >
      <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)] mb-3">
        Financiële gezondheid
      </div>
      <div ref={ref} className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            className="stroke-[var(--border-ed)]"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={hasEntered ? dashOffset : circumference}
            className={style.ring}
            style={{
              transition: hasEntered
                ? 'stroke-dashoffset 700ms cubic-bezier(.22,1,.36,1)'
                : 'none',
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-serif text-2xl font-bold text-[var(--ink)] leading-none">
            {Math.round(health.total)}
          </span>
          <span className="text-[9px] uppercase tracking-[0.1em] text-[var(--ink-3)] mt-0.5">
            van 100
          </span>
        </div>
      </div>

      <div className={`mt-3 text-sm sm:text-base font-semibold ${style.text}`}>
        {style.label}
      </div>
      {health.previousMonth !== null && (
        <div className="text-[11px] text-[var(--ink-3)] mt-1">{trendLabel}</div>
      )}
      {timeAnchor && (
        <div className="text-[11px] text-[var(--ink-3)] mt-0.5 italic">
          {timeAnchor.kind === 'fire'
            ? `${timeAnchor.value} op weg`
            : `${timeAnchor.value} buffer`}
        </div>
      )}
      <div className="text-[11px] text-[var(--ink-3)] mt-3 underline decoration-dotted underline-offset-2">
        Toon onderverdeling →
      </div>
    </button>
  )
}
