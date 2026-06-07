import { VerdelingStaaf } from './verdeling-staaf'
import { Box3SectionHeader } from './box3-section-header'
import type { Box3Result } from '@/lib/box3-data'

const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

/**
 * box3-mix (3.4) — Vermogensmix spaargeld vs. beleggingen.
 *
 * Toont hoe het Box 3-vermogen verdeeld is tussen spaargeld en beleggingen,
 * met een korte uitleg van het forfait-effect: spaargeld krijgt een laag
 * forfait, beleggingen een veel hoger. De mix bepaalt dus mede je
 * effectieve heffing — niet alleen het totale vermogen.
 *
 * Presentational: caller geeft het perspectief-correcte `result`. Box 3-kleur
 * (teal) via colorVar.
 */

const SPAARGELD = 'var(--color-teal-500)'
const BELEGGINGEN = 'color-mix(in srgb, var(--color-teal-500) 50%, transparent)'

function formatPct(value: number): string {
  return (value * 100).toFixed(2) + '%'
}

export function Box3Mix({ result }: { result: Box3Result }) {
  const { totaalSpaargeld, totaalBeleggingen } = result
  if (totaalSpaargeld <= 0 && totaalBeleggingen <= 0) return null

  const segments = [
    { label: 'Spaargeld', value: totaalSpaargeld, colorVar: SPAARGELD },
    { label: 'Beleggingen', value: totaalBeleggingen, colorVar: BELEGGINGEN },
  ]

  return (
    <div className="border-t border-[var(--ink)] px-4 py-5 sm:px-7">
      <Box3SectionHeader num="3.4">Vermogensmix</Box3SectionHeader>

      <VerdelingStaaf segments={segments} />

      <p
        className="mt-4 text-sm italic leading-snug text-[var(--ink-2)]"
        style={{ fontFamily: SOURCE_SERIF }}
      >
        De Belastingdienst rekent voor spaargeld met een laag forfait
        (<span className="not-italic font-mono tabular-nums">{formatPct(result.params.forfaitSpaargeld)}</span>)
        en voor beleggingen met een hoog forfait
        (<span className="not-italic font-mono tabular-nums">{formatPct(result.params.forfaitBeleggingen)}</span>).
        Hoe groter je belegde deel, hoe hoger het fictieve rendement waarover je
        belast wordt — los van wat je werkelijk verdiende.
      </p>
    </div>
  )
}
