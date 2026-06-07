import { Clock } from 'lucide-react'
import { TaxGauge } from './tax-gauge'
import { AandachtspuntActieButton } from './aandachtspunt-actie-button'
import { Kicker, ScenarioCallout } from '@/components/editorial'
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

const PLAYFAIR = 'var(--font-display, var(--font-playfair, Georgia, serif))'

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
          colorVar="var(--color-violet-600, #7c3aed)"
        />

        <div className="min-w-0 flex-1 space-y-2.5">
          {isOver ? (
            <>
              <div className="border border-red-300 bg-red-50 px-3 py-2.5 text-xs leading-snug text-red-900">
                Je leent{' '}
                <span className="font-mono tabular-nums font-semibold">{fc(dgaLeningenExcess)}</span>{' '}
                méér dan de drempel van {fc(dgaLeningenDrempel)}. Over dat
                bovenmatige deel betaal je Box 2-heffing als fictief regulier
                voordeel.
              </div>
              {/* Highlight-paar: bovenmatig deel + extra heffing als hero-cijfers */}
              <div className="grid grid-cols-2 gap-2">
                <div className="border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2.5">
                  <div className="text-[10px] font-mono uppercase tracking-[0.1em] text-[var(--ink-4)]">
                    Bovenmatig deel
                  </div>
                  <div
                    className="mt-1 text-[19px] font-black leading-none tracking-[-0.02em] tabular-nums text-[var(--ink)]"
                    style={{ fontFamily: PLAYFAIR }}
                  >
                    {fc(dgaLeningenExcess)}
                  </div>
                </div>
                <div className="border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2.5">
                  <div className="text-[10px] font-mono uppercase tracking-[0.1em] text-[var(--ink-4)]">
                    Extra Box 2-heffing
                  </div>
                  <div
                    className="mt-1 text-[19px] font-black leading-none tracking-[-0.02em] tabular-nums text-[var(--color-red-600,#dc2626)]"
                    style={{ fontFamily: PLAYFAIR }}
                  >
                    {fc(dgaExcessTax)}
                  </div>
                </div>
              </div>
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
                    description={`Breng je BV-lening onder de drempel van ${fc(dgaLeningenDrempel)} om de extra Box 2-heffing te voorkomen.`}
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
              <div className="border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2.5 text-xs leading-snug text-[var(--ink-2)]">
                Je blijft onder de drempel — geen extra Box 2-heffing voor
                excessief lenen.
              </div>
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
