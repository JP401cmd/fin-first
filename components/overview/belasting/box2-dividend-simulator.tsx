'use client'

import { useState } from 'react'
import { Clock, AlertTriangle } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { Kicker, ScenarioCallout, FiguresStrip } from '@/components/editorial'
import { BOX2_PARAMS, calculateBox2, type TaxYear } from '@/lib/box2-data'
import { BOX2_SIMULATOR_SCHAAL_FACTOR } from '@/lib/constants'
import { RANGE_STEP_ANY, nextRangeValueForKey, snapToStep } from './range-slider-snap'

/**
 * Box2DividendSimulator — interactieve "hoeveel dividend in welke schijf"-tool.
 *
 * De gebruiker schuift het dividend dat dit jaar wordt uitgekeerd; de tool
 * splitst dat over de lage schijf (24,5%) en de hoge schijf (31%), toont de
 * resulterende Box 2-heffing, het netto restant en — in de geest van "geld is
 * opgeslagen tijd" — de vrijheidsdagen die de heffing kost.
 *
 * ÉÉN MOTOR (bevinding H26). Tot 26-08-2026 rekende dit component met een eigen
 * `splitDividend()`: een tweede staffel-implementatie náást `calculateBox2`, die
 * ongerond rekende (€16.866,535 vs. €16.866,54) en `dgaExcessTax` niet kende —
 * bij een DGA boven de leendrempel gaf de kop dus een ánder vrijheidsdagen-getal
 * dan de simulator eronder. Nu roept de simulator dezelfde motor aan als de kop,
 * met hetzelfde DGA-leentotaal en hetzelfde dagtarief.
 *
 * NEUTRALE DEFAULT (bevinding H26). De slider startte op exact de schijfgrens,
 * waardoor een DGA zónder dividend zonder één klik "€16.867 heffing" las onder
 * een kop van €0 — en een default op de grens is bovendien een impliciete
 * aanbeveling ("keer precies dít bedrag uit"). De schuif start nu op het
 * WERKELIJKE Box 2-inkomen, zodat kop en simulator bij eerste render per
 * constructie hetzelfde bedrag tonen.
 *
 * Schijfgrens: BOX2_PARAMS[year].grens (single) of grensPartner (fiscaal
 * partner; de eerste-schijfruimte verdubbelt). De schaal van de schuif is
 * FISCAAL, geen uitkeercapaciteit — zie BOX2_SIMULATOR_SCHAAL_FACTOR.
 *
 * Client-component: lokale slider-state + één aanroep van de pure motor. Geen
 * Supabase, geen netwerk. Indicatie, geen fiscaal advies.
 */

const PLAYFAIR = 'var(--font-display, var(--font-playfair, Georgia, serif))'
// Schijf-segmenten volgen de actieve module-kleur (violet op de Box 2-pagina):
// lage schijf = vol accent, hoge schijf = zachter accent.
const BOX2_COLOR = 'var(--module-active-600)'
const BOX2_HOOG_COLOR = 'var(--module-active-400)'

/** Slider-stap in euro's — puur een bedieningsdetail, geen fiscaal getal.
 *  Bewust NIET als native `step` op de input: de startstand is het WERKELIJKE
 *  dividend (zelden een 1000-voud) en de browser zou die anders stil naar een
 *  veelvoud saneren — dan wijkt de thumb af van de kop die hij hoort te spiegelen
 *  (zelfde mechanisme als WF-BELAST-10-bug1). Zie `range-slider-snap.ts`. */
const SLIDER_STEP = 1000

function pct(value: number): string {
  return (value * 100).toLocaleString('nl-NL', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }) + '%'
}

export function Box2DividendSimulator({
  year = 2026,
  hasPartner = false,
  dailyExpenses = 0,
  defaultDividend = 0,
  dgaLeningenTotal = 0,
  dividendOnbekend = false,
}: {
  year?: TaxYear
  hasPartner?: boolean
  dailyExpenses?: number
  /** Het WERKELIJKE Box 2-inkomen (kop). Startstand van de schuif. */
  defaultDividend?: number
  /** DGA-leentotaal uit hetzelfde resultaat, zodat de motor identiek rekent. */
  dgaLeningenTotal?: number
  /** true = het dividend is niet ingevuld; de kop toont dan geen bedrag. */
  dividendOnbekend?: boolean
}) {
  const params = BOX2_PARAMS[year]
  const grens = hasPartner ? params.grensPartner : params.grens
  // Fiscale schaal: tot ruim voorbij de PARTNER-grens zodat de omslag naar 31%
  // altijd bereikbaar is, ook in single-modus. Nooit korter dan het werkelijke
  // inkomen — anders zou de schuif zijn eigen startstand niet kunnen weergeven.
  const fiscaleSchaalMax =
    Math.round((params.grensPartner * BOX2_SIMULATOR_SCHAAL_FACTOR) / SLIDER_STEP) * SLIDER_STEP
  const sliderMax = Math.max(
    fiscaleSchaalMax,
    Math.ceil(Math.max(0, defaultDividend) / SLIDER_STEP) * SLIDER_STEP,
  )
  const [dividend, setDividend] = useState(Math.max(0, defaultDividend))
  // Stapraster voor slepen/toetsen; de startstand blijft er bewust buiten.
  const dividendBounds = { step: SLIDER_STEP, min: 0, max: sliderMax }
  // Entree-reveal — de gestapelde schijf-balk tekent in via width-transition.
  const { ref: revealRef, hasEntered } = useInViewAnimation({ duration: 600 })

  // ÉÉN motor — dezelfde die de kop voedt, met hetzelfde DGA-leentotaal en
  // hetzelfde dagtarief. Schijfverdeling, afronding, effectief tarief én
  // vrijheidsdagen komen dus uit lib/box2-data.ts, niet uit dit bestand.
  const sim = calculateBox2({
    deelnemingen: [{ name: 'simulatie', annual_dividend: dividend, disposal_gain: 0 }],
    year,
    hasPartner,
    dailyExpenses,
    dgaLeningenTotal,
  })
  // Netto = wat er van het DIVIDEND overblijft. De excessief-lenen-heffing zit
  // bewust niet in dit getal: die is verschuldigd over een fictief voordeel, niet
  // over de uitkering. Ze staat als eigen regel in de uitsplitsing.
  const netto = dividend - sim.totalTax
  const lowWidthPct = dividend > 0 ? (sim.incomeLow / dividend) * 100 : 0
  const highWidthPct = dividend > 0 ? (sim.incomeHigh / dividend) * 100 : 0
  const inHighBracket = sim.incomeHigh > 0
  const isDefault = dividend === Math.max(0, defaultDividend)

  const watAlsZin = isDefault
    ? dividendOnbekend
      ? 'Je jaarlijks dividend is nog niet ingevuld, dus de schuif start op € 0 — gelijk aan de kop hierboven. Schuif om te zien wat een uitkering zou kosten.'
      : `De schuif staat op je werkelijke Box 2-inkomen (${formatCurrency(defaultDividend)}), dus deze uitkomst is gelijk aan de kop hierboven. Schuif om een ander uitkeerbedrag door te rekenen.`
    : `Deze uitkomst hoort bij een uitkering van ${formatCurrency(dividend)} — niet bij je huidige situatie (${dividendOnbekend ? 'nog niet ingevuld' : formatCurrency(defaultDividend)}).`

  return (
    <div ref={revealRef} className="border-t border-[var(--ink)] px-5 py-5 sm:px-6">
      <Kicker className="mb-3">Dividend-schijf simulator</Kicker>

      <p className="mb-4 max-w-[62ch] text-sm leading-snug text-[var(--ink-2)]">
        Schuif het dividend dat je dit jaar uitkeert en zie hoeveel in de lage
        schijf ({pct(params.tariefLaag)}) blijft en wat in de hoge schijf ({pct(params.tariefHoog)}) valt
        {hasPartner ? ' — met fiscaal partner verdubbelt de lage-schijfruimte.' : '.'}
      </p>

      {/* Bedrag + slider */}
      <div className="mb-4">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <label htmlFor="box2-dividend-slider" className="text-[10px] font-mono uppercase tracking-[0.12em] text-[var(--ink-3)]">
            Dividend dit jaar
          </label>
          <span
            className="text-[26px] font-black leading-none tracking-[-0.02em] tabular-nums text-[var(--ink)]"
            style={{ fontFamily: PLAYFAIR }}
          >
            {formatCurrency(dividend)}
          </span>
        </div>
        <input
          id="box2-dividend-slider"
          type="range"
          min={0}
          max={sliderMax}
          step={RANGE_STEP_ANY}
          value={dividend}
          onChange={(e) => setDividend(snapToStep(Number(e.target.value), dividendBounds))}
          onKeyDown={(e) => {
            const next = nextRangeValueForKey(e.key, dividend, dividendBounds)
            if (next == null) return
            e.preventDefault()
            setDividend(next)
          }}
          className="h-11 w-full cursor-pointer accent-[var(--module-active-500)]"
          aria-valuetext={formatCurrency(dividend)}
        />
        <div className="mt-0.5 flex justify-between text-[10px] font-mono tabular-nums text-[var(--ink-4)]">
          <span>{formatCurrency(0)}</span>
          <span>grens {formatCurrency(grens)}</span>
          <span>{formatCurrency(sliderMax)}</span>
        </div>
        {/* Expliciet bijschrift bij de schaal — de bovengrens is fiscaal gekozen
            (zodat de omslag naar 31% zichtbaar is) en zegt niets over wat je BV
            daadwerkelijk kán uitkeren. */}
        <p className="mt-1.5 max-w-[62ch] text-[11px] leading-snug text-[var(--ink-3)]">
          De schaal loopt tot {formatCurrency(sliderMax)} — ruim voorbij de
          partner-grens van {formatCurrency(params.grensPartner)}, zodat je de
          omslag naar {pct(params.tariefHoog)} ziet. Dat is een rekenschaal, geen
          uitkeercapaciteit van je BV: wat je werkelijk kunt uitkeren volgt uit
          je vrije reserves.
        </p>
      </div>

      {/* Gestapelde schijf-balk — scherp kader, breedte-draw-in op entree */}
      <div
        className="mb-2 flex h-4 w-full overflow-hidden border border-[var(--ink)] bg-[var(--subtle)]"
        role="img"
        aria-label={`Verdeling dividend: ${formatCurrency(sim.incomeLow)} in de lage schijf, ${formatCurrency(sim.incomeHigh)} in de hoge schijf`}
      >
        {sim.incomeLow > 0 && (
          <div
            className="h-full transition-[width] duration-300 ease-out"
            style={{ width: `${hasEntered ? lowWidthPct : 0}%`, backgroundColor: BOX2_COLOR }}
            title={`Lage schijf (${pct(params.tariefLaag)}): ${formatCurrency(sim.incomeLow)}`}
          />
        )}
        {sim.incomeHigh > 0 && (
          <div
            className="h-full transition-[width] duration-300 ease-out"
            style={{ width: `${hasEntered ? highWidthPct : 0}%`, backgroundColor: BOX2_HOOG_COLOR }}
            title={`Hoge schijf (${pct(params.tariefHoog)}): ${formatCurrency(sim.incomeHigh)}`}
          />
        )}
      </div>

      {/* Schijf-uitsplitsing */}
      <div className="mb-4 space-y-1.5">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-[var(--ink-2)]">
            <span className="block h-2.5 w-2.5" style={{ backgroundColor: BOX2_COLOR }} aria-hidden="true" />
            Lage schijf ({pct(params.tariefLaag)}) · {formatCurrency(sim.incomeLow)}
          </span>
          <span className="font-mono tabular-nums text-[var(--ink-2)]">{formatCurrency(sim.taxLow)}</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-[var(--ink-2)]">
            <span className="block h-2.5 w-2.5" style={{ backgroundColor: BOX2_HOOG_COLOR }} aria-hidden="true" />
            Hoge schijf ({pct(params.tariefHoog)}) · {formatCurrency(sim.incomeHigh)}
          </span>
          <span className="font-mono tabular-nums text-[var(--ink-2)]">{formatCurrency(sim.taxHigh)}</span>
        </div>
        {/* Excessief lenen — zichtbaar zodra de motor er iets van maakt, zodat de
            simulator-uitkomst optelbaar blijft met de kop. */}
        {sim.dgaExcessTax > 0 && (
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-[var(--ink-2)]">
              <AlertTriangle className="h-3 w-3 shrink-0 text-[var(--negative)]" aria-hidden="true" />
              Extra heffing excessief lenen
            </span>
            <span className="font-mono tabular-nums text-[var(--ink-2)]">{formatCurrency(sim.dgaExcessTax)}</span>
          </div>
        )}
      </div>

      {/* Verdict-regel — uniform ScenarioCallout; hoge schijf = negatief (icoon + tekst).
          Bij een uitkering van nul is "je blijft in de lage schijf" een uitspraak
          over niets: dan nodigt de regel uit tot schuiven i.p.v. te oordelen. */}
      <ScenarioCallout className="mt-1 text-xs">
        <span className="inline-flex items-start gap-2 not-italic">
          {inHighBracket && (
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-[var(--negative)]" aria-hidden="true" />
          )}
          <span>
            {dividend === 0 ? (
              <>
                Nog geen uitkering ingevuld. Schuif om te zien hoe een dividend
                zich over de schijven verdeelt — je lage-schijfruimte is{' '}
                <span className="font-mono tabular-nums font-semibold text-[var(--ink)]">{formatCurrency(grens)}</span>.
              </>
            ) : inHighBracket ? (
              <>
                Je dividend valt voor{' '}
                <span className="font-mono tabular-nums font-semibold text-[var(--ink)]">{formatCurrency(sim.incomeHigh)}</span>{' '}
                in de hoge schijf ({pct(params.tariefHoog)}). Onder {formatCurrency(grens)} blijf je
                volledig in de lage schijf — uitsmeren over meerdere jaren of de
                partner-ruimte benutten kan schelen.
              </>
            ) : (
              <>
                Je blijft volledig in de lage schijf ({pct(params.tariefLaag)}). Er is nog{' '}
                <span className="font-mono tabular-nums font-semibold text-[var(--ink)]">{formatCurrency(grens - dividend)}</span>{' '}
                ruimte tot de grens van {formatCurrency(grens)}.
              </>
            )}
          </span>
        </span>
      </ScenarioCallout>

      {/* Wat-als-markering — BOVEN de bedragen, zodat een vluchtige lezer de
          uitkomst niet als "wat ik betaal" meeneemt (bevinding H26). */}
      <div className="mt-4 border-t border-[var(--rule-soft)] pt-3">
        <Kicker size="small" className="mb-1">Wat-als · niet je huidige aangifte</Kicker>
        <p className="max-w-[62ch] text-[11px] leading-snug text-[var(--ink-2)]">{watAlsZin}</p>
      </div>

      {/* Totalen — via FiguresStrip (top/bottom-rule), Box 2-heffing als hoofduitkomst */}
      <FiguresStrip
        cols={3}
        figures={[
          { kicker: 'Box 2-heffing bij dit scenario', amount: formatCurrency(sim.totalTaxInclDga), variant: 'winner' },
          { kicker: 'Netto dividend', amount: formatCurrency(netto) },
          { kicker: 'Effectief tarief', amount: pct(sim.effectiveRate) },
        ]}
      />

      {sim.freedomDays > 0 && (
        <div className="-mt-1 flex items-center gap-1.5 text-[11px] text-[var(--ink-3)]">
          <Clock className="h-3 w-3" aria-hidden="true" />
          Bij dit scenario kost de heffing {sim.freedomDays} vrijheidsdagen
        </div>
      )}

      <ScenarioCallout className="mt-4" title="Indicatie, geen advies.">
        Op basis van de Box 2-staffel {year}. De schuif verandert je werkelijke
        aangifte niet.
      </ScenarioCallout>
    </div>
  )
}
