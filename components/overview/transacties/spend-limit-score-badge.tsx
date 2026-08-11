'use client'

/**
 * DE REEKS-SCORE als compacte badge — gedeeld door de pane en de kaart.
 *
 * ── WAT HET WEL EN NIET ZEGT ────────────────────────────────────────────────
 * Het cijfer gaat over je HISTORIE (afgesloten periodes), niet over de lopende
 * periode waar het naast staat. Daarom draagt de badge het woord "score" en niet
 * alleen een getal: zonder dat woord leest een 82 naast "€ 0 van € 5" als een
 * oordeel over vandaag.
 *
 * ── CONSUME, DON'T RECOMPUTE ────────────────────────────────────────────────
 * Alles komt uit `report.score` (lib/spend-limits/engine.ts). Hier wordt geen
 * drempel toegepast en geen gemiddelde genomen — ook het label komt kant-en-klaar
 * uit de motor, zodat de tegel en dit oppervlak nooit een ander woord bij
 * hetzelfde cijfer kunnen zetten.
 *
 * Zonder meetellende historie (`score === null`) rendert de badge NIETS. Een "—"
 * of een 0 zou een oordeel suggereren over een pot die nog niets heeft kunnen
 * bewijzen.
 *
 * ── "JE LAATSTE N PERIODES", NIET "SINDS JE DE POT MAAKTE" ──────────────────
 * `basisPeriodCount` is begrensd door het VENSTER van de motor (12 afgesloten
 * maanden, 13 weken, 30 dagen, 8 kwartalen, 3 jaren) en daarna nog eens door de
 * aanmaak-ondergrens. Bij een pot van drie jaar oud rust het cijfer dus op de
 * laatste twaalf maanden, niet op alle zesendertig — en schuift een oude
 * overschrijding er vanzelf uit. De copy zegt daarom "je laatste N"; "sinds je
 * deze pot maakte" stond er eerst en was onwaar voor elke pot ouder dan zijn
 * venster.
 */

import { SPEND_LIMIT_SCORE_MIN_PERIODS } from '@/lib/spend-limits/engine'
import type { SpendLimitScore } from '@/lib/spend-limits/engine'
import { SPEND_LIMIT_SCORE_TEXT_CLASS } from '@/lib/spend-limits/status-display'

export function SpendLimitScoreBadge({
  score,
  className = '',
}: {
  score: SpendLimitScore
  className?: string
}) {
  // Nog geen cijfer? Dan de reden, niet de stilte. Op de kaart stond hier eerst
  // NIETS, waardoor een verse pot naast een oudere leek alsof de score kapot was
  // in plaats van nog niet verdiend — terwijl de motor volkomen terecht zweeg.
  if (score.score === null || score.label === null) {
    const togo = Math.max(0, SPEND_LIMIT_SCORE_MIN_PERIODS - score.basisPeriodCount)
    return (
      <span className={`inline-flex items-baseline gap-1 text-xs text-[var(--ink-3)] ${className}`}>
        <span>Score</span>
        <span className="font-mono tabular-nums">—</span>
        <span>
          · na nog {togo} {togo === 1 ? 'periode' : 'periodes'}
        </span>
      </span>
    )
  }

  return (
    <span
      className={`inline-flex items-baseline gap-1 text-xs ${className}`}
      title={`Gebaseerd op ${score.basisPeriodCount} afgesloten periode${score.basisPeriodCount === 1 ? '' : 's'}`}
    >
      <span className="text-[var(--ink-3)]">Score</span>
      <span
        className={`font-mono font-semibold tabular-nums ${SPEND_LIMIT_SCORE_TEXT_CLASS[score.label]}`}
      >
        {score.score}
      </span>
      <span className={SPEND_LIMIT_SCORE_TEXT_CLASS[score.label]}>· {score.label}</span>
    </span>
  )
}

/**
 * De uitleg onder de reeks-getallen: waaruit het cijfer is opgebouwd en waarop
 * het rust. Bewust een APARTE component van de badge — de badge staat bij de
 * lopende periode (waar ruimte schaars is), deze regel staat bij de reeks (waar
 * de onderliggende getallen al staan en de uitleg dus thuishoort).
 */
export function SpendLimitScoreExplainer({ score }: { score: SpendLimitScore }) {
  if (score.score === null || score.hitRatePct === null) {
    const togo = SPEND_LIMIT_SCORE_MIN_PERIODS - score.basisPeriodCount
    return (
      <p className="text-[11px] text-[var(--ink-3)]">
        Nog geen score. Die verschijnt na {SPEND_LIMIT_SCORE_MIN_PERIODS} afgesloten periodes sinds
        je deze pot maakte — nog {togo} te gaan. Eerder zou één goede periode al een 100 opleveren,
        en dat zegt niets.
      </p>
    )
  }

  return (
    <p className="text-[11px] text-[var(--ink-3)]">
      Je score van {score.score} rust op je laatste {score.basisPeriodCount} afgesloten periodes:{' '}
      {score.hitRatePct}% daarvan bleef binnen je grens, plus je lopende reeks en de richting die je
      op gaat.
    </p>
  )
}
