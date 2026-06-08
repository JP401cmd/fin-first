import { VerdelingStaaf, type VerdelingSegment } from '@/components/overview/belasting/verdeling-staaf'
import type { TaxOverviewResult } from '@/lib/tax-overview'
import { Kicker } from '@/components/editorial'

/**
 * HubVerdeling (C2) — verdeling van de belastingdruk over de drie boxen.
 *
 * Hergebruikt de gedeelde `VerdelingStaaf` (100%-gestapelde balk + legenda met
 * bedragen). Box-kleuren volgen de per-box coderingstriade (Box 1 amber, Box 2
 * violet, Box 3 teal) via de --color-box{n}-700 tokens — de hub heeft een
 * neutraal-ink context, dus de box-kleuren worden hier direct doorgegeven aan
 * de gedeelde balk via zijn `colorVar`-prop. Box 2 verschijnt alleen als
 * segment wanneer er een bedrag is (anders zou een 0-segment de legenda
 * vervuilen).
 *
 * De legenda toont het euro-bedrag per box (VerdelingStaaf rekent zelf de
 * percentages uit naar rato van de bedragen), zodat de lezer ineens ziet welke
 * box het zwaarst weegt.
 */

const BOX1_COLOR = 'var(--color-box1-700)' // amber
const BOX2_COLOR = 'var(--color-box2-700)' // violet
const BOX3_COLOR = 'var(--color-box3-700)' // teal

export function HubVerdeling({ overview }: { overview: TaxOverviewResult }) {
  const { box1Tax, box2Tax, box3Tax, total } = overview

  // Geen druk → niets te verdelen.
  if (total <= 0) return null

  const segments: VerdelingSegment[] = [
    { label: 'Box 1 — werk + woning', value: box1Tax, colorVar: BOX1_COLOR },
  ]
  // Box 2 alleen wanneer er een bedrag is (DGA met aanmerkelijk belang).
  if (box2Tax > 0) {
    segments.push({ label: 'Box 2 — aanmerkelijk belang', value: box2Tax, colorVar: BOX2_COLOR })
  }
  segments.push({ label: 'Box 3 — sparen + beleggen', value: box3Tax, colorVar: BOX3_COLOR })

  return (
    <article className="bg-[var(--paper)] p-5 sm:p-6">
      <Kicker>Verdeling over de boxen</Kicker>
      <div className="mt-4">
        <VerdelingStaaf segments={segments} />
      </div>
    </article>
  )
}
