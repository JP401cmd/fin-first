'use client'

import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { healthScoreVerdict, type HealthScore, type HealthPillar, type PillarGroup } from '@/lib/financial-health'
import { GRONDSLAG_ONBEKEND_KOP } from '@/lib/grondslag-guard'
import { Button } from '@/components/editorial'

// ── Pillar-group subscores (compacte mini-bars op de kaart) ──
// De vier gedragspijlers (ADR 0010), in vaste volgorde, met kort label.

const GROUP_ORDER: PillarGroup[] = ['rondkomen', 'buffer', 'schuld', 'vrijheid']

const GROUP_LABELS: Record<PillarGroup, string> = {
  rondkomen: 'Rondkomen',
  buffer: 'Buffer',
  schuld: 'Schuld',
  vrijheid: 'Vrijheid',
}

/** Bar-vulkleur per subscore (module-neutrale score-tokens, drempels 80/60/40). */
function groupBarClass(score: number): string {
  if (score >= 80) return 'bg-score-good'
  if (score >= 60) return 'bg-score-ok'
  if (score >= 40) return 'bg-score-warn'
  return 'bg-score-bad'
}

/** Vul-kleur per subscore als CSS-var (voor SVG stroke), zelfde drempels. */
function groupStrokeVar(score: number): string {
  if (score >= 80) return 'var(--score-good)'
  if (score >= 60) return 'var(--score-ok)'
  if (score >= 40) return 'var(--score-warn)'
  return 'var(--score-bad)'
}

type GroupSubscore = {
  group: PillarGroup
  label: string
  subtotal: number
  /** Som van de (herverdeelde) gewichten van de actieve pillars in deze groep. */
  weight: number
}

/**
 * Gewogen subtotaal per gedragsgroep (Σ score×weight ÷ Σ weight). Alleen
 * groepen mét actieve indicatoren verschijnen — geen lege segmenten. `weight`
 * is de som van de pillar-gewichten in de groep (booglengte van het segment).
 */
function buildGroupSubscores(pillars: HealthPillar[]): GroupSubscore[] {
  const byGroup = new Map<PillarGroup, HealthPillar[]>()
  for (const p of pillars) {
    if (!p.pillarGroup) continue
    const list = byGroup.get(p.pillarGroup) ?? []
    list.push(p)
    byGroup.set(p.pillarGroup, list)
  }
  const out: GroupSubscore[] = []
  for (const group of GROUP_ORDER) {
    const list = byGroup.get(group)
    if (!list || list.length === 0) continue
    const weightSum = list.reduce((acc, p) => acc + p.weight, 0)
    const subtotal = weightSum > 0
      ? Math.round(list.reduce((acc, p) => acc + p.score * p.weight, 0) / weightSum)
      : Math.round(list.reduce((acc, p) => acc + p.score, 0) / list.length)
    out.push({ group, label: GROUP_LABELS[group], subtotal, weight: weightSum })
  }
  return out
}

/**
 * Geometrie per ring-segment: een boog per gedragsgroep, booglengte ∝ het
 * groepsgewicht (genormaliseerd over de actieve groepen), met een kleine vaste
 * gap ertussen. `track` is de hele boog (lichte rail), `fill` het deel dat de
 * groepssubscore weergeeft (0..1 van het segment). Fracties zijn van de hele
 * cirkel (pathLength = 1).
 */
type RingSegment = {
  group: PillarGroup
  start: number // fractie waar het segment begint (0..1)
  trackLen: number // booglengte van het segment (0..1)
  fillLen: number // gevulde booglengte (0..trackLen)
  stroke: string // CSS-var voor de vulkleur
}

const SEGMENT_GAP_DEG = 6 // vaste leesbaarheids-gap tussen segmenten

function buildRingSegments(subscores: GroupSubscore[]): RingSegment[] {
  const n = subscores.length
  if (n === 0) return []
  const weightTotal = subscores.reduce((acc, s) => acc + s.weight, 0)
  if (weightTotal <= 0) return []

  const gap = SEGMENT_GAP_DEG / 360 // gap als fractie van de cirkel
  const totalGap = gap * n
  const available = Math.max(0, 1 - totalGap) // ruimte voor de bogen zelf

  const segments: RingSegment[] = []
  let cursor = 0
  for (const s of subscores) {
    const trackLen = (s.weight / weightTotal) * available
    const fillFrac = Math.max(0, Math.min(100, s.subtotal)) / 100
    segments.push({
      group: s.group,
      start: cursor,
      trackLen,
      fillLen: trackLen * fillFrac,
      stroke: groupStrokeVar(s.subtotal),
    })
    cursor += trackLen + gap
  }
  return segments
}

// Canonieke score-tokens (drempel-consistent met scoreColorClass in
// health-score-receipt.tsx en de score-tier tokens in globals.css): ≥80 good /
// ≥60 ok / ≥40 warn / <40 bad. De vijf bandlabels mappen daarop — kwetsbaar én
// kritiek vallen beide onder 'bad'. bgInner gebruikt de bestaande /10-opacity-
// conventie voor CSS-var-tinten (bv. bg-[var(--positive)]/10).
const BAND_STYLES: Record<
  string,
  { ring: string; label: string; text: string; bgInner: string }
> = {
  uitstekend: { ring: 'stroke-[var(--score-good)]', label: 'Uitstekend', text: 'text-[var(--score-good)]', bgInner: 'bg-[var(--score-good)]/10' },
  sterk:      { ring: 'stroke-[var(--score-ok)]',   label: 'Sterk',      text: 'text-[var(--score-ok)]',   bgInner: 'bg-[var(--score-ok)]/10' },
  redelijk:   { ring: 'stroke-[var(--score-warn)]', label: 'Redelijk',   text: 'text-[var(--score-warn)]', bgInner: 'bg-[var(--score-warn)]/10' },
  kwetsbaar:  { ring: 'stroke-[var(--score-bad)]',  label: 'Kwetsbaar',  text: 'text-[var(--score-bad)]',  bgInner: 'bg-[var(--score-bad)]/10' },
  kritiek:    { ring: 'stroke-[var(--score-bad)]',  label: 'Kritiek',    text: 'text-[var(--score-bad)]',  bgInner: 'bg-[var(--score-bad)]/10' },
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
  simple = false,
}: {
  health: HealthScore
  onOpenReceipt: () => void
  /**
   * Eenvoudige weergave (display_mode === 'simple'): toon alleen het getal +
   * de cirkel (enkelvoudige ring op de totaalscore), GEEN per-categorie
   * (pijler) scores — dus geen gesegmenteerde ring en geen mini-bar-lijst.
   * Default false → ongewijzigde, volledige weergave.
   */
  simple?: boolean
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
  const subscores = buildGroupSubscores(health.pillars)
  const segments = buildRingSegments(subscores)

  // Gesegmenteerde ring alleen wanneer er groepen zijn (pillars mét pillarGroup);
  // anders (legacy/test-data zonder groep) de bestaande enkelvoudige ring. In
  // Eenvoudig forceren we de enkelvoudige ring: die toont alléén de totaalscore
  // (getal + cirkel), zonder de per-categorie subscore-bogen.
  const useSegmentedRing = !simple && segments.length > 0
  const ringAriaLabel = useSegmentedRing
    ? subscores.map((s) => `${s.label} ${s.subtotal}`).join(', ') + ' van 100'
    : `Gezondheidsscore ${Math.round(health.total)} van 100`

  const trend = health.trend
  const trendLabel =
    trend > 0
      ? `+${trend.toFixed(0)} punten t.o.v. vorige maand`
      : trend < 0
      ? `${trend.toFixed(0)} punten t.o.v. vorige maand`
      : 'gelijk aan vorige maand'

  // Onbekend is geen nul (ADR 0131): zonder inkomen/uitgaven geen cijfer en
  // geen oordeel — één zin en één knop. Géén <button>-wrapper hier: een link
  // in een knop is ongeldige HTML, en de kassabon heeft zonder score niets
  // te tonen dat de knop niet al zegt.
  const verdict = healthScoreVerdict(health)
  if (verdict.kind === 'onbekend') {
    const { hint, actie } = verdict.onbekend
    return (
      <div
        data-testid="health-score-onbekend"
        className="flex flex-col items-center justify-center text-center rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5 w-full h-full"
      >
        <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)] mb-3">
          Financiële gezondheid
        </div>
        <div className="font-serif text-lg font-bold text-[var(--ink)] leading-tight">
          {GRONDSLAG_ONBEKEND_KOP}
        </div>
        <p className="mt-2 max-w-[240px] font-serif italic text-[13px] leading-relaxed text-[var(--ink-3)]">
          {hint}
        </p>
        <Button href={actie.href} size="sm" className="mt-4">
          {actie.label}
        </Button>
      </div>
    )
  }

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
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
          role="img"
          aria-label={ringAriaLabel}
        >
          {useSegmentedRing ? (
            // Gesegmenteerde ring: één boog per gedragsgroep, gevuld naar subscore.
            segments.map((seg) => (
              <g key={seg.group}>
                {/* Track-boog (lichte rail over het hele segment) */}
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  strokeWidth={stroke}
                  pathLength={1}
                  strokeDasharray={`${seg.trackLen} ${1 - seg.trackLen}`}
                  strokeDashoffset={-seg.start}
                  className="stroke-[var(--border-ed)]"
                />
                {/* Vul-boog (subscore-bandkleur), groeit mee bij in-view-animatie */}
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  strokeWidth={stroke}
                  strokeLinecap="round"
                  pathLength={1}
                  stroke={seg.stroke}
                  strokeDasharray={`${hasEntered ? seg.fillLen : 0} ${
                    1 - (hasEntered ? seg.fillLen : 0)
                  }`}
                  strokeDashoffset={-seg.start}
                  style={{
                    transition: hasEntered
                      ? 'stroke-dasharray 700ms cubic-bezier(.22,1,.36,1)'
                      : 'none',
                  }}
                />
              </g>
            ))
          ) : (
            // Fallback: enkelvoudige ring (legacy/test-data zonder pillarGroup).
            <>
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
            </>
          )}
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

      {/* Vier gedragspijler-subscores — ondergeschikt aan de samengestelde score.
          In Eenvoudig verborgen: dan toont de kaart enkel getal + cirkel. */}
      {!simple && subscores.length >= 2 && (
        <ul
          className="mt-3 w-full max-w-[220px] space-y-1.5"
          aria-label="Subscores per pijler"
          // De SVG-ring draagt al een samenvattend aria-label met dezelfde
          // subscores; de mini-bars zijn een visuele dubbeling en worden voor
          // screenreaders verborgen om herhaling te voorkomen.
          aria-hidden="true"
        >
          {subscores.map(({ group, label, subtotal }) => (
            <li key={group} className="flex items-center gap-2">
              <span className="w-[58px] shrink-0 text-left text-[10px] text-[var(--ink-3)] truncate">
                {label}
              </span>
              <span className="flex-1 h-1.5 rounded-full bg-[var(--subtle)] overflow-hidden">
                <span
                  className={`block h-full rounded-full ${groupBarClass(subtotal)}`}
                  style={{ width: `${Math.max(0, Math.min(100, subtotal))}%` }}
                />
              </span>
              <span className="w-[20px] shrink-0 text-right font-mono text-[10px] tabular-nums text-[var(--ink-2)]">
                {subtotal}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="text-[11px] text-[var(--ink-3)] mt-3 underline decoration-dotted underline-offset-2">
        Toon onderverdeling →
      </div>
    </button>
  )
}
