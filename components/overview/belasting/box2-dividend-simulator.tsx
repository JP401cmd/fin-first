'use client'

import { useState } from 'react'
import { Clock } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { Kicker, ScenarioCallout } from '@/components/editorial'
import { BOX2_PARAMS, type Box2Params, type TaxYear } from '@/lib/box2-data'

/**
 * Box2DividendSimulator — interactieve "hoeveel dividend in welke schijf"-tool.
 *
 * De gebruiker schuift het dividend dat dit jaar wordt uitgekeerd; de tool
 * splitst dat over de lage schijf (24,5%) en de hoge schijf (31%), toont de
 * resulterende Box 2-heffing, het netto restant en — in de geest van "geld is
 * opgeslagen tijd" — de vrijheidsdagen die de heffing kost.
 *
 * Schijfgrens: BOX2_PARAMS[year].grens (single) of grensPartner (fiscaal
 * partner; de eerste-schijfruimte verdubbelt). De slider loopt door tot iets
 * voorbij de partner-grens zodat zowel single als partner de overgang zien.
 *
 * Client-component: lokale slider-state + één afgeleide berekening. Geen
 * Supabase, geen netwerk — puur op de wettelijke parameters. Indicatie, geen
 * fiscaal advies.
 */

const PLAYFAIR = 'var(--font-display, var(--font-playfair, Georgia, serif))'
const BOX2_COLOR = 'var(--color-violet-600, #7c3aed)'
const BOX2_HOOG_COLOR = 'color-mix(in srgb, var(--color-violet-600, #7c3aed) 55%, var(--paper))'

interface SplitResult {
  inLow: number
  inHigh: number
  taxLow: number
  taxHigh: number
  totalTax: number
  netto: number
  effectiveRate: number
  inHighBracket: boolean
}

function splitDividend(amount: number, grens: number, params: Box2Params): SplitResult {
  const inLow = Math.min(amount, grens)
  const inHigh = Math.max(0, amount - grens)
  const taxLow = inLow * params.tariefLaag
  const taxHigh = inHigh * params.tariefHoog
  const totalTax = taxLow + taxHigh
  return {
    inLow,
    inHigh,
    taxLow,
    taxHigh,
    totalTax,
    netto: amount - totalTax,
    effectiveRate: amount > 0 ? totalTax / amount : 0,
    inHighBracket: inHigh > 0,
  }
}

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
}: {
  year?: TaxYear
  hasPartner?: boolean
  dailyExpenses?: number
}) {
  const params = BOX2_PARAMS[year]
  const grens = hasPartner ? params.grensPartner : params.grens
  // Slider tot ~30% voorbij de partner-grens zodat de hoge schijf altijd
  // bereikbaar is, ook in single-modus.
  const sliderMax = Math.round((params.grensPartner * 1.3) / 1000) * 1000
  const [dividend, setDividend] = useState(grens)
  // Entree-reveal — de gestapelde schijf-balk tekent in via width-transition.
  const { ref: revealRef, hasEntered } = useInViewAnimation({ duration: 600 })

  const r = splitDividend(dividend, grens, params)
  const lowWidthPct = dividend > 0 ? (r.inLow / dividend) * 100 : 0
  const highWidthPct = dividend > 0 ? (r.inHigh / dividend) * 100 : 0
  const freedomDays =
    dailyExpenses > 0 ? Math.round(r.totalTax / dailyExpenses) : 0

  return (
    <div ref={revealRef} className="border-t border-[var(--ink)] px-5 py-5 sm:px-6">
      <Kicker className="mb-3">Dividend-schijf simulator</Kicker>

      <p className="mb-4 max-w-[62ch] text-sm leading-snug text-[var(--ink-2)]">
        Schuif het dividend dat je dit jaar uitkeert en zie hoeveel in de lage
        schijf (24,5%) blijft en wat in de hoge schijf (31%) valt
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
          step={1000}
          value={dividend}
          onChange={(e) => setDividend(Number(e.target.value))}
          className="h-11 w-full cursor-pointer accent-violet-600"
          aria-valuetext={formatCurrency(dividend)}
        />
        <div className="mt-0.5 flex justify-between text-[10px] font-mono tabular-nums text-[var(--ink-4)]">
          <span>{formatCurrency(0)}</span>
          <span>grens {formatCurrency(grens)}</span>
          <span>{formatCurrency(sliderMax)}</span>
        </div>
      </div>

      {/* Gestapelde schijf-balk — scherp kader, breedte-draw-in op entree */}
      <div
        className="mb-2 flex h-4 w-full overflow-hidden border border-[var(--ink)] bg-[var(--subtle)]"
        role="img"
        aria-label={`Verdeling dividend: ${formatCurrency(r.inLow)} in de lage schijf, ${formatCurrency(r.inHigh)} in de hoge schijf`}
      >
        {r.inLow > 0 && (
          <div
            className="h-full transition-[width] duration-300 ease-out"
            style={{ width: `${hasEntered ? lowWidthPct : 0}%`, backgroundColor: BOX2_COLOR }}
            title={`Lage schijf (24,5%): ${formatCurrency(r.inLow)}`}
          />
        )}
        {r.inHigh > 0 && (
          <div
            className="h-full transition-[width] duration-300 ease-out"
            style={{ width: `${hasEntered ? highWidthPct : 0}%`, backgroundColor: BOX2_HOOG_COLOR }}
            title={`Hoge schijf (31%): ${formatCurrency(r.inHigh)}`}
          />
        )}
      </div>

      {/* Schijf-uitsplitsing */}
      <div className="mb-4 space-y-1.5">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-[var(--ink-2)]">
            <span className="block h-2.5 w-2.5" style={{ backgroundColor: BOX2_COLOR }} aria-hidden="true" />
            Lage schijf (24,5%) · {formatCurrency(r.inLow)}
          </span>
          <span className="font-mono tabular-nums text-[var(--ink-2)]">{formatCurrency(r.taxLow)}</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-[var(--ink-2)]">
            <span className="block h-2.5 w-2.5" style={{ backgroundColor: BOX2_HOOG_COLOR }} aria-hidden="true" />
            Hoge schijf (31%) · {formatCurrency(r.inHigh)}
          </span>
          <span className="font-mono tabular-nums text-[var(--ink-2)]">{formatCurrency(r.taxHigh)}</span>
        </div>
      </div>

      {/* Verdict-regel — scherp kader, status amber bij hoge schijf */}
      <div
        className={`flex items-start gap-2 border px-3 py-2.5 text-xs leading-snug ${
          r.inHighBracket
            ? 'border-amber-300 bg-amber-50 text-amber-900'
            : 'border-[var(--border-ed)] bg-[var(--subtle)] text-[var(--ink-2)]'
        }`}
      >
        <span>
          {r.inHighBracket ? (
            <>
              Je dividend valt voor{' '}
              <span className="font-mono tabular-nums font-semibold">{formatCurrency(r.inHigh)}</span>{' '}
              in de hoge schijf (31%). Onder {formatCurrency(grens)} blijf je
              volledig in de lage schijf — uitsmeren over meerdere jaren of de
              partner-ruimte benutten kan schelen.
            </>
          ) : (
            <>
              Je blijft volledig in de lage schijf (24,5%). Er is nog{' '}
              <span className="font-mono tabular-nums font-semibold">{formatCurrency(grens - dividend)}</span>{' '}
              ruimte tot de grens van {formatCurrency(grens)}.
            </>
          )}
        </span>
      </div>

      {/* Totalen — scherpe haarlijn-kaders, Playfair-cijfers */}
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-2.5">
          <div className="text-[10px] font-mono uppercase tracking-[0.1em] text-[var(--ink-4)]">Box 2-heffing</div>
          <div
            className="mt-1 text-[19px] font-black leading-none tracking-[-0.02em] tabular-nums text-[var(--ink)]"
            style={{ fontFamily: PLAYFAIR }}
          >
            {formatCurrency(r.totalTax)}
          </div>
        </div>
        <div className="border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-2.5">
          <div className="text-[10px] font-mono uppercase tracking-[0.1em] text-[var(--ink-4)]">Netto</div>
          <div
            className="mt-1 text-[19px] font-black leading-none tracking-[-0.02em] tabular-nums text-[var(--ink)]"
            style={{ fontFamily: PLAYFAIR }}
          >
            {formatCurrency(r.netto)}
          </div>
        </div>
        <div className="border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-2.5">
          <div className="text-[10px] font-mono uppercase tracking-[0.1em] text-[var(--ink-4)]">Effectief</div>
          <div
            className="mt-1 text-[19px] font-black leading-none tracking-[-0.02em] tabular-nums text-[var(--ink)]"
            style={{ fontFamily: PLAYFAIR }}
          >
            {pct(r.effectiveRate)}
          </div>
        </div>
      </div>

      {freedomDays > 0 && (
        <div className="mt-2.5 flex items-center justify-center gap-1.5 text-[11px] text-[var(--ink-3)]">
          <Clock className="h-3 w-3" aria-hidden="true" />
          De heffing kost {freedomDays} vrijheidsdagen
        </div>
      )}

      <ScenarioCallout className="mt-4" title="Indicatie, geen advies.">
        Op basis van de Box 2-staffel {year}. De slider verandert je werkelijke
        aangifte niet.
      </ScenarioCallout>
    </div>
  )
}
