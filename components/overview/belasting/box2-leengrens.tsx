import { Clock } from 'lucide-react'
import { TaxGauge } from './tax-gauge'
import { AandachtspuntActieButton } from './aandachtspunt-actie-button'
import { Kicker, ScenarioCallout, FiguresStrip } from '@/components/editorial'
import { formatCurrency } from '@/lib/format'
import { BOX2_TOOLTIPS, type Box2Result } from '@/lib/box2-data'

/**
 * Box2Leengrens — danger-gauge voor de Wet excessief lenen bij eigen
 * vennootschap. Toont hoeveel van de €500.000-leendrempel de DGA benut, en bij
 * overschrijding het bovenmatige deel + de extra Box 2-heffing daarover.
 *
 * Hergebruikt de gedeelde <TaxGauge variant="danger">: value = uitstaande
 * DGA-leningen, max = de drempel. De gauge kleurt rood en toont
 * "overschrijding" zodra value > max. De heffing-context (bovenmatig deel +
 * dgaExcessTax) staat eronder, inclusief de vrijheidsdagen die de extra
 * heffing kost.
 *
 * Wordt door de caller alléén gemount wanneer er DGA-leningen zijn
 * (result.dgaLeningenTotal > 0). Presentationeel — geen data-fetching, geen
 * hooks; alle waarden komen uit het reeds berekende Box2Result.
 */

export function Box2Leengrens({
  result,
  fc = formatCurrency,
}: {
  result: Box2Result
  /** Optionele (mask-aware) formatter; default nl-NL EUR. */
  fc?: (v: number) => string
}) {
  const { dgaLeningenTotal, dgaLeningenDrempel, dgaLeningenExcess, dgaExcessTax } = result
  if (dgaLeningenTotal <= 0) return null

  const isOver = dgaLeningenExcess > 0
  const ruimte = Math.max(0, dgaLeningenDrempel - dgaLeningenTotal)
  const freedomDays =
    result.dailyExpenses > 0 && dgaExcessTax > 0
      ? Math.round(dgaExcessTax / result.dailyExpenses)
      : 0

  return (
    <div className="border-t border-[var(--ink)] px-5 py-5 sm:px-6">
      <div className="mb-4 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <Kicker>Excessief lenen bij je BV</Kicker>
        <span
          className="font-mono text-[10px] tabular-nums text-[var(--ink-4)]"
          title={BOX2_TOOLTIPS.wetExcessiefLenen}
        >
          drempel {fc(dgaLeningenDrempel)}
        </span>
      </div>

      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
        <TaxGauge
          value={dgaLeningenTotal}
          max={dgaLeningenDrempel}
          variant="danger"
          label="van de leengrens benut"
          sublabel={fc(dgaLeningenTotal)}
          thresholdLabel={`grens ${fc(dgaLeningenDrempel)}`}
          colorVar="var(--module-active-500)"
        />

        <div className="min-w-0 flex-1 space-y-2.5">
          {isOver ? (
            <>
              <ScenarioCallout className="text-xs">
                <span className="inline-flex items-start gap-2 not-italic">
                  <span className="mt-px h-3.5 w-1 shrink-0 bg-[var(--negative)]" aria-hidden="true" />
                  <span>
                    Je leent{' '}
                    <span className="font-mono tabular-nums font-semibold text-[var(--ink)]">{fc(dgaLeningenExcess)}</span>{' '}
                    méér dan de drempel van {fc(dgaLeningenDrempel)}. Over dat
                    bovenmatige deel betaal je Box 2-heffing als fictief regulier
                    voordeel.
                  </span>
                </span>
              </ScenarioCallout>
              {/* Highlight-paar: bovenmatig deel + extra heffing als FiguresStrip */}
              <FiguresStrip
                cols={2}
                className="my-0"
                figures={[
                  { kicker: 'Bovenmatig deel', amount: fc(dgaLeningenExcess) },
                  { kicker: 'Extra Box 2-heffing', amount: fc(dgaExcessTax), variant: 'negative' },
                ]}
              />
              {freedomDays > 0 && (
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--ink-3)]">
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  Deze extra heffing kost {freedomDays} vrijheidsdagen
                </div>
              )}

              {/* "Voeg toe als actie" — aflossen vóór jaareinde voorkomt de
                  extra Box 2-heffing over het bovenmatige deel. */}
              {dgaExcessTax > 0 && (
                <div className="pt-1">
                  <AandachtspuntActieButton
                    id="tax:box2-leengrens"
                    domain="tax"
                    title="Los DGA-lening af vóór 31 december"
                    // H24: dode `description` verwijderd — nooit uitgelezen.
                    savings={Math.round(dgaExcessTax)}
                    freedomDays={freedomDays}
                    deadline="31 december"
                    href="/overzicht/belasting/box2"
                  />
                </div>
              )}
            </>
          ) : (
            <>
              <ScenarioCallout className="text-xs">
                <span className="not-italic">
                  Je blijft onder de drempel — geen extra Box 2-heffing voor
                  excessief lenen.
                </span>
              </ScenarioCallout>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="text-[var(--ink-2)]">Ruimte tot de grens</span>
                <span className="font-mono tabular-nums font-semibold text-[var(--ink)]">
                  {fc(ruimte)}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      <ScenarioCallout className="mt-4" title="Indicatie, geen advies.">
        Op basis van de Wet excessief lenen bij eigen vennootschap (drempel{' '}
        {fc(dgaLeningenDrempel)}). Eigenwoningschulden tellen onder voorwaarden
        niet mee.
      </ScenarioCallout>
    </div>
  )
}
