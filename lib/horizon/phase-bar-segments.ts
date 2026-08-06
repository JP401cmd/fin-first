// ── Fase-balk segment-bouwer ───────────────────────────
// Pure logica die de fase-segmenten (Opbouw/Overgang/Onttrekking) van de
// Toekomst-fasebalk berekent. Verhuisd uit components/app/horizon/phase-bar.tsx
// zodat lib (regression/uat) 'm kan importeren zonder terug naar components te
// reiken (import-richting UI→lib).

import { TrendingUp, ArrowRightLeft, Wallet } from 'lucide-react'

export type FaseId = 'opbouw' | 'overgang' | 'onttrekking'

export interface PhaseSegment {
  id: FaseId
  label: string
  startAge: number
  endAge: number
  color: string        // background CSS value
  textColor: string    // text CSS color
  icon: typeof TrendingUp
}

export interface PhaseBarProps {
  currentAge: number
  fireAge: number | null       // null when FIRE unreachable
  fireAgeFractional?: number | null  // fractional FIRE age for precise phase boundaries
  aowAge: number               // usually 67
  endAge: number
  fireReachable: boolean
  isPensioenMode: boolean
  onSegmentClick?: (fase: FaseId) => void
  visibleMinAge?: number       // zoom viewport start (clip segments to this)
  visibleMaxAge?: number       // zoom viewport end (clip segments to this)
}

/**
 * Fase op een gegeven leeftijd, afgeleid uit dezélfde segmenten als de
 * fasebalk (single source: buildSegments). De kernel-rijen kennen geen
 * 'transition' (zie lib/horizon-kernel/bridge.ts "fase & fireAge"), dus
 * consumenten zoals de cijferbar (LifelineReadout) mogen de Overgang-fase
 * niet uit row.phase afleiden — die komt hiervandaan.
 *
 * Grens-conventie: een leeftijd hoort bij het segment waar
 * startAge <= age < endAge; op/voorbij het einde van het laatste segment
 * geldt het laatste, vóór het eerste segment het eerste.
 */
export function faseAtAge(
  params: Omit<PhaseBarProps, 'onSegmentClick' | 'visibleMinAge' | 'visibleMaxAge'>,
  age: number,
): PhaseSegment | null {
  const segments = buildSegments(params)
  if (segments.length === 0) return null
  for (const seg of segments) {
    if (age >= seg.startAge && age < seg.endAge) return seg
  }
  return age >= segments[segments.length - 1].endAge
    ? segments[segments.length - 1]
    : segments[0]
}

export function buildSegments({
  currentAge,
  fireAge,
  fireAgeFractional,
  aowAge,
  endAge,
  fireReachable,
  isPensioenMode,
}: Omit<PhaseBarProps, 'onSegmentClick' | 'visibleMinAge' | 'visibleMaxAge'>): PhaseSegment[] {
  const segments: PhaseSegment[] = []

  // Use fractional FIRE age for proportionally correct phase widths.
  // The phase bar splits at the exact fractional boundary (e.g. 60.5) so it
  // aligns with the FIRE marker on the chart. Labels are rounded for readability.
  const effectiveFireAge = fireReachable && (fireAgeFractional ?? fireAge) != null
    ? (fireAgeFractional ?? fireAge!)
    : null
  const effectiveAowAge = Math.round(aowAge)

  // Edge case: FIRE unreachable → only Opbouw, full width
  if (!fireReachable || effectiveFireAge == null) {
    segments.push({
      id: 'opbouw',
      label: 'Opbouw',
      startAge: currentAge,
      endAge: endAge,
      color: 'var(--color-horizon-600)',
      textColor: '#fff',
      icon: TrendingUp,
    })
    return segments
  }

  // Edge case: already FIRE'd (fireAge <= currentAge) → Opbouw collapses
  const alreadyFired = effectiveFireAge <= currentAge

  // Edge case: FIRE = AOW or pensioen-modus → Overgang collapses
  const overgangCollapses = isPensioenMode || effectiveFireAge >= effectiveAowAge

  if (alreadyFired) {
    // No opbouw phase — already past FIRE
    if (!overgangCollapses && effectiveAowAge > currentAge && effectiveAowAge < endAge) {
      // Overgang: currentAge → AOW
      segments.push({
        id: 'overgang',
        label: 'Overgang',
        startAge: currentAge,
        endAge: effectiveAowAge,
        color: 'var(--color-horizon-200)',
        textColor: 'var(--color-horizon-800)',
        icon: ArrowRightLeft,
      })
      // Onttrekking: AOW → endAge
      segments.push({
        id: 'onttrekking',
        label: 'Onttrekking',
        startAge: effectiveAowAge,
        endAge: endAge,
        color: 'var(--color-kern-500)',
        textColor: '#fff',
        icon: Wallet,
      })
    } else {
      // Only onttrekking
      segments.push({
        id: 'onttrekking',
        label: 'Onttrekking',
        startAge: currentAge,
        endAge: endAge,
        color: 'var(--color-kern-500)',
        textColor: '#fff',
        icon: Wallet,
      })
    }
    return segments
  }

  // Normal case: Opbouw phase
  const opbouwEnd = effectiveFireAge
  segments.push({
    id: 'opbouw',
    label: 'Opbouw',
    startAge: currentAge,
    endAge: opbouwEnd,
    color: 'var(--color-horizon-600)',
    textColor: '#fff',
    icon: TrendingUp,
  })

  // Overgang phase (between FIRE and AOW, only if not collapsed)
  if (!overgangCollapses && effectiveFireAge < effectiveAowAge) {
    segments.push({
      id: 'overgang',
      label: 'Overgang',
      startAge: effectiveFireAge,
      endAge: Math.min(effectiveAowAge, endAge),
      color: 'var(--color-horizon-200)',
      textColor: 'var(--color-horizon-800)',
      icon: ArrowRightLeft,
    })
  }

  // Onttrekking phase
  const onttrekkingStart = overgangCollapses
    ? effectiveFireAge
    : Math.min(effectiveAowAge, endAge)
  if (onttrekkingStart < endAge) {
    segments.push({
      id: 'onttrekking',
      label: 'Onttrekking',
      startAge: onttrekkingStart,
      endAge: endAge,
      color: 'var(--color-kern-500)',
      textColor: '#fff',
      icon: Wallet,
    })
  }

  return segments
}
