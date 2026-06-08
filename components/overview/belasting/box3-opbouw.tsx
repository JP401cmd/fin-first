import { VerdelingStaaf } from './verdeling-staaf'
import { Box3SectionHeader } from './box3-section-header'
import type { Box3Result } from '@/lib/box3-data'

const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

/**
 * box3-opbouw (3.1) — Forfaitaire opbouw als gestapelde staaf.
 *
 * Visualiseert hoe het "voordeel uit sparen en beleggen" (de forfaitaire
 * rendement-bijdrage) is opgebouwd uit drie componenten:
 *   • spaargeld   (laag forfait)
 *   • beleggingen (hoog forfait)
 *   • (−) schulden (renteforfait, drukt het rendement)
 *
 * De schulden-bijdrage is in werkelijkheid negatief (het verlaagt het
 * voordeel). VerdelingStaaf rekent alleen met positieve aandelen, dus tonen
 * we de drie positieve forfait-bedragen als verhouding en lichten de
 * schuld-correctie + het effectieve rendement toe in een onderschrift.
 *
 * Presentational: caller geeft het reeds-berekende perspectief-correcte
 * `result` door. Box-kleur via de actieve module-context (`--module-active-*`).
 */

// Spaargeld krijgt de vollere accent-stop, beleggingen de lichtere — schulden
// blijven semantisch negatief (nooit box-kleur).
const SPAARGELD = 'var(--module-active-600)'
const BELEGGINGEN = 'var(--module-active-400)'
const SCHULD = 'var(--negative)'

function formatPct(value: number): string {
  return (value * 100).toFixed(2) + '%'
}

export function Box3Opbouw({
  result,
  fc,
}: {
  result: Box3Result
  /** Geld-formatter (perspectief/privacy-bewust) uit de host-component. */
  fc: (v: number) => string
}) {
  const { forfaitairSpaargeld, forfaitairBeleggingen, forfaitairSchulden, voordeelUitSparen } =
    result

  // Niets te tonen wanneer er geen forfaitair rendement is opgebouwd.
  if (forfaitairSpaargeld <= 0 && forfaitairBeleggingen <= 0) return null

  const segments = [
    { label: 'Forfait spaargeld', value: forfaitairSpaargeld, colorVar: SPAARGELD },
    { label: 'Forfait beleggingen', value: forfaitairBeleggingen, colorVar: BELEGGINGEN },
  ]

  return (
    <div className="border-t border-[var(--ink)] px-4 py-5 sm:px-7">
      <Box3SectionHeader num="3.1">Forfaitaire opbouw</Box3SectionHeader>

      <VerdelingStaaf segments={segments} />

      {/* Schuld-correctie (apart, want negatief) */}
      {forfaitairSchulden > 0 && (
        <div className="mt-2.5 flex items-center justify-between gap-3 text-xs">
          <span className="flex items-center gap-2 text-[var(--ink-2)]">
            <span
              className="block h-2.5 w-2.5 shrink-0"
              style={{ backgroundColor: SCHULD }}
              aria-hidden="true"
            />
            Renteforfait schulden (aftrek)
          </span>
          <span className="font-mono tabular-nums text-[var(--ink)]">
            −{fc(forfaitairSchulden)}
          </span>
        </div>
      )}

      <div className="mt-4 h-px bg-[var(--ink)]" />

      <div className="mt-4 flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-[var(--ink)]">
          Voordeel uit sparen en beleggen
        </span>
        <span
          className="font-mono tabular-nums text-2xl font-black leading-none tracking-[-0.02em] text-[var(--ink)]"
          style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
        >
          {fc(voordeelUitSparen)}
        </span>
      </div>

      <p
        className="mt-3 text-sm italic leading-snug text-[var(--ink-2)]"
        style={{ fontFamily: SOURCE_SERIF }}
      >
        De Belastingdienst rekent met een{' '}
        <span className="not-italic font-semibold text-[var(--ink)]">effectief rendement</span> van{' '}
        <span className="not-italic font-mono tabular-nums">{formatPct(result.effectiefRendement)}</span>{' '}
        over je grondslag. Beleggingen wegen zwaarder dan spaargeld: het forfait
        op beleggingen ({formatPct(result.params.forfaitBeleggingen)}) ligt fors
        hoger dan op spaargeld ({formatPct(result.params.forfaitSpaargeld)}).
      </p>
    </div>
  )
}
