import { Clock } from 'lucide-react'
import { TaxGauge } from './tax-gauge'
import { Box3SectionHeader } from './box3-section-header'
import { calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import type { Box3Result } from '@/lib/box3-data'

const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

/**
 * box3-heffingsvrij (3.3) — Heffingsvrij-vermogen-gauge.
 *
 * Toont hoeveel van het heffingsvrije vermogen (de onbelaste voet) je benut.
 * value = min(rendementsgrondslag, heffingsvrijVermogen) — dat deel van je
 * vermogen dat ONDER de drempel valt en dus onbelast is. max = de volledige
 * heffingsvrije voet.
 *
 * Onder de gauge: de resterende onbelaste ruimte (heffingsvrij − grondslag,
 * indien positief) én — als je de voet al volledig benut — de "kost van de
 * eerste belaste euro": het effectieve tarief × het forfait dat over de
 * eerste euro boven de voet wordt geheven, uitgedrukt in vrijheidstijd.
 *
 * Presentational: caller geeft het perspectief-correcte `result`. Box 3-kleur
 * (teal) via colorVar.
 */

const TEAL = 'var(--color-teal-500)'

export function Box3Heffingsvrij({
  result,
  fc,
}: {
  result: Box3Result
  fc: (v: number) => string
}) {
  const heffingsvrij = result.heffingsvrijVermogen
  if (heffingsvrij <= 0) return null

  const benut = Math.min(Math.max(result.rendementsgrondslag, 0), heffingsvrij)
  const resterend = Math.max(0, heffingsvrij - result.rendementsgrondslag)
  const voetVolBenut = resterend <= 0

  // "Kost van de eerste belaste euro": elke euro boven de voet levert
  // effectiefRendement × tarief aan belasting op. Uitgedrukt per €1.000 zodat
  // het tastbaar is, plus de vrijheidstijd-equivalent.
  const taxPerThousandAbove = 1000 * result.effectiefRendement * result.params.tarief
  const freedomDaysPerThousand =
    result.dailyExpenses > 0 ? taxPerThousandAbove / result.dailyExpenses : 0

  return (
    <div className="border-t border-[var(--ink)] px-4 py-5 sm:px-7">
      <Box3SectionHeader num="3.3">Heffingsvrij vermogen</Box3SectionHeader>

      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-7">
        <TaxGauge
          value={benut}
          max={heffingsvrij}
          label="voet benut"
          sublabel={`${fc(benut)} / ${fc(heffingsvrij)}`}
          colorVar={TEAL}
          thresholdLabel={result.hasPartner ? 'voet (partner)' : 'voet (single)'}
        />

        <div
          className="min-w-0 flex-1 space-y-2 text-sm italic leading-snug text-[var(--ink-2)]"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          {voetVolBenut ? (
            <>
              <p>
                Je benut de hele onbelaste voet van{' '}
                <span className="not-italic font-mono tabular-nums">{fc(heffingsvrij)}</span>. Alles
                daarboven is belast.
              </p>
              <p className="text-[var(--ink-3)]">
                Elke <span className="not-italic font-mono tabular-nums">{fc(1000)}</span> extra Box 3-vermogen
                kost zo&apos;n{' '}
                <span className="not-italic font-mono tabular-nums text-[var(--ink)]">
                  {fc(Math.round(taxPerThousandAbove))}
                </span>{' '}
                belasting per jaar
                {freedomDaysPerThousand >= 0.5 && (
                  <span className="inline-flex items-center gap-1 not-italic text-[var(--ink-3)]">
                    {' '}
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    {formatFreedomTimeString(
                      calculateFreedomTime(taxPerThousandAbove, result.dailyExpenses),
                      'short',
                    )}
                  </span>
                )}
                .
              </p>
            </>
          ) : (
            <>
              <p>
                Je hebt nog{' '}
                <span className="not-italic font-mono tabular-nums font-semibold text-[var(--ink)]">
                  {fc(resterend)}
                </span>{' '}
                onbelaste ruimte tot de voet van{' '}
                <span className="not-italic font-mono tabular-nums">{fc(heffingsvrij)}</span>.
              </p>
              <p className="text-[var(--ink-3)]">
                Tot dit bedrag betaal je geen Box 3-belasting — het is je belastingvrije
                stuk opgeslagen tijd.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
