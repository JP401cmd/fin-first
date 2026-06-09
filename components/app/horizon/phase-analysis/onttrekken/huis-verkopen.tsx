'use client'

import { memo, useMemo, useState, useDeferredValue } from 'react'
import { Home, ChevronRight, ChevronDown, AlertTriangle, Minus, Plus } from 'lucide-react'
import { formatCurrency, formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { AnalysisSection } from '../analysis-section'
import { InfoTooltip } from '@/components/overview/belasting/info-tooltip'
import {
  analyzeHuisVerkopen,
  type HuisVerkopenInput,
  type HuisVerkopenResult,
} from '@/lib/phase-analysis'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import { MaskedAmount } from '@/components/app/masked-amount'

// -- Types --------------------------------------------------------------------

interface HuisVerkopenProps {
  assets: Asset[]
  debts: Debt[]
  expectedReturn: number
  inflationRate: number
  /** Start of the drawdown phase (for deriving the analysis horizon). */
  startAge?: number
  /** End of the drawdown phase (for deriving the analysis horizon). */
  endAge?: number
}

/** Sensitivity scenario: growth rate + analysis result. */
interface SensitivityRow {
  groeiPct: number
  result: HuisVerkopenResult
}

// -- Smart-default heuristics --------------------------------------------------

/**
 * Derive a market rent estimate from the property value. Dutch residential
 * gross rental yields sit around 4–5% of the property value per year; we use
 * 4.5% and convert to a monthly figure, rounded to €25 and clamped to a sane
 * band. This replaces the previous flat €1.200 default.
 */
function deriveDefaultHuur(woningWaarde: number): number {
  const monthly = (woningWaarde * 0.045) / 12
  return clampStep(monthly, 500, 4000, HUUR_STAP)
}

/**
 * Derive recurring ownership costs (OZB + VvE + onderhoud) as ~1% of the
 * property value per year, monthly, rounded to €25. Replaces the flat €200.
 */
function deriveDefaultOverig(woningWaarde: number): number {
  const monthly = (woningWaarde * 0.01) / 12
  return clampStep(monthly, 50, 1500, OVERIG_STAP)
}

/** Round v to the nearest `step`, then clamp into [min, max]. */
function clampStep(v: number, min: number, max: number, step: number): number {
  const rounded = Math.round(v / step) * step
  return Math.max(min, Math.min(max, rounded))
}

// Slider granularity / bounds
const HUUR_STAP = 25
const OVERIG_STAP = 25
const GROEI_STAP = 0.005 // 0.5 pp
const GROEI_MIN = 0
const GROEI_MAX = 0.06
const DEFAULT_GROEI = 0.03

// -- Helpers ------------------------------------------------------------------

/** Map aanbeveling to a human-readable color-coded label. */
function aanbevelingLabel(a: HuisVerkopenResult['aanbeveling']): {
  text: string
  colorClass: string
} {
  switch (a) {
    case 'verkopen':
      return { text: 'Verkopen + huren', colorClass: 'text-[var(--positive)]' }
    case 'behouden':
      return { text: 'Huis behouden', colorClass: 'text-[var(--color-kern-500)]' }
    default:
      return { text: 'Praktisch gelijk', colorClass: 'text-[var(--ink-2)]' }
  }
}

/** Short aanbeveling label for sensitivity table. */
function aanbevelingKort(a: HuisVerkopenResult['aanbeveling']): {
  text: string
  colorClass: string
} {
  switch (a) {
    case 'verkopen':
      return { text: 'Verkopen', colorClass: 'text-[var(--positive)]' }
    case 'behouden':
      return { text: 'Behouden', colorClass: 'text-[var(--color-kern-500)]' }
    default:
      return { text: 'Gelijk', colorClass: 'text-[var(--ink-2)]' }
  }
}

/** Format a monthly cost value as a readable string. */
function formatMonthly(yearly: number, masked: boolean): string {
  return formatMaskedCurrency(Math.round(yearly / 12), masked) + '/mnd'
}

/** Growth rate scenarios for sensitivity analysis. */
const SENSITIVITY_RATES = [0.02, 0.03, 0.04]

// -- Component ----------------------------------------------------------------

/**
 * House selling analysis for the withdrawal phase.
 *
 * Compares keeping the house vs. selling and renting over a 20-year horizon.
 * Renders a side-by-side comparison table with a color-coded winner badge,
 * sensitivity analysis across 3 growth scenarios, opportunity cost block,
 * and a short conclusion from the calculation engine.
 *
 * Returns null when no eigen_huis asset is found in the user's portfolio,
 * keeping the parent layout clean.
 */
export const HuisVerkopen = memo(function HuisVerkopen({
  assets,
  debts,
  expectedReturn,
  inflationRate,
  startAge,
  endAge,
}: HuisVerkopenProps) {
  const { masked } = useMaskedAmounts()

  // Horizon = the actual drawdown period (endAge − startAge), not a fixed 20.
  // Fall back to 20 years when the phase ages are unavailable.
  const horizonJaren = useMemo(() => {
    if (startAge != null && endAge != null && endAge > startAge) {
      return Math.max(1, Math.round(endAge - startAge))
    }
    return 20
  }, [startAge, endAge])

  // ── House + mortgage facts (independent of the adjustable assumptions) ──
  const houseFacts = useMemo(() => {
    const house = assets.find((a) => a.asset_type === 'eigen_huis')
    if (!house) return null

    const mortgage = debts.find(
      (d) =>
        d.debt_type === 'mortgage' &&
        d.is_active &&
        d.linked_asset_id === house.id,
    ) ?? debts.find(
      (d) => d.debt_type === 'mortgage' && d.is_active && d.current_balance > 0,
    )

    const woningWaarde = house.woz_value ?? house.current_value
    return {
      woningWaarde,
      startWoningWaarde: house.current_value,
      hypotheekResterend: mortgage?.current_balance ?? 0,
      maandlastHypotheek: mortgage?.monthly_payment ?? 0,
    }
  }, [assets, debts])

  // ── Adjustable assumptions with smart, value-derived defaults ──
  const [huur, setHuur] = useState(() =>
    houseFacts ? deriveDefaultHuur(houseFacts.woningWaarde) : 1200,
  )
  const [groei, setGroei] = useState(DEFAULT_GROEI)
  const [overigeLasten, setOverigeLasten] = useState(() =>
    houseFacts ? deriveDefaultOverig(houseFacts.woningWaarde) : 200,
  )

  // Defer the adjustable inputs so the binary-search-heavy engine does not run
  // on every slider pixel (analyzeHuisVerkopen runs breakeven search + horizon loop).
  const deferredHuur = useDeferredValue(huur)
  const deferredGroei = useDeferredValue(groei)
  const deferredOverig = useDeferredValue(overigeLasten)

  // Assembled engine input — recomputes reactively from the deferred controls.
  const baseInput = useMemo<HuisVerkopenInput | null>(() => {
    if (!houseFacts) return null
    return {
      woningWaarde: houseFacts.woningWaarde,
      hypotheekResterend: houseFacts.hypotheekResterend,
      maandlastHypotheek: houseFacts.maandlastHypotheek,
      woningWaardeGroei: deferredGroei,
      maandlastOverig: deferredOverig,
      verwachteHuur: deferredHuur,
      verkoopkostenPct: 0.04,
      horizonJaren,
    }
  }, [houseFacts, deferredGroei, deferredOverig, deferredHuur, horizonJaren])

  const result = useMemo<HuisVerkopenResult | null>(() => {
    if (!baseInput) return null
    return analyzeHuisVerkopen(baseInput, expectedReturn, inflationRate)
  }, [baseInput, expectedReturn, inflationRate])

  // Sensitivity analysis: run 3 scenarios with different growth rates
  const sensitivityRows = useMemo<SensitivityRow[]>(() => {
    if (!baseInput) return []
    return SENSITIVITY_RATES.map((groeiPct) => ({
      groeiPct,
      result: analyzeHuisVerkopen(
        { ...baseInput, woningWaardeGroei: groeiPct },
        expectedReturn,
        inflationRate,
      ),
    }))
  }, [baseInput, expectedReturn, inflationRate])

  // Opportunity cost: what does keeping equity locked in the house cost?
  // = FV of net equity invested at expectedReturn over horizon − actual house value growth
  const opportunityData = useMemo(() => {
    if (!baseInput || !result) return null

    const netEquity = baseInput.woningWaarde - baseInput.hypotheekResterend
    if (netEquity <= 0) return null

    const horizon = baseInput.horizonJaren
    // What the equity would be worth if invested in the market
    const fvInvested = netEquity * Math.pow(1 + expectedReturn, horizon)
    // What the house equity actually grew to (house value − remaining mortgage)
    const houseEquityAtEnd =
      result.behouden.woningWaardeNaHorizon - result.behouden.hypotheekResterendNaHorizon
    // Opportunity cost = difference (positive means keeping house costs you money)
    const opportuniteitskosten = Math.round(fvInvested - houseEquityAtEnd)

    return {
      netEquity: Math.round(netEquity),
      fvInvested: Math.round(fvInvested),
      houseEquityAtEnd: Math.round(houseEquityAtEnd),
      opportuniteitskosten,
    }
  }, [baseInput, result, expectedReturn])

  // No eigen_huis in portfolio -- show relevance message
  const hasHouse = result != null && baseInput != null

  const winner = hasHouse ? aanbevelingLabel(result!.aanbeveling) : null

  return (
    <AnalysisSection
      title="Huis verkopen vs. behouden"
      icon={Home}
      willContext={
        hasHouse
          ? `Huis verkopen vs. behouden over ${horizonJaren} jaar (afbouwperiode): aanbeveling "${result.aanbeveling}". ` +
            `Verschil ${formatMaskedCurrency(result.verschil, masked)} (positief = verkopen voordeliger). ` +
            `Aannames: huur ${formatCurrency(huur)}/mnd, woningwaardegroei ${(groei * 100).toFixed(1)}%/jaar, overige lasten ${formatCurrency(overigeLasten)}/mnd. ` +
            `Breakeven-huur ${formatMaskedCurrency(result.breakevenHuur, masked)}/mnd — boven dit bedrag wordt behouden voordeliger.`
          : 'Huis verkopen analyse: niet beschikbaar — geen eigen woning in portefeuille.'
      }
    >
      {!hasHouse && (
        <div className="flex items-start gap-3 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)]/50 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-kern-500" />
          <div>
            <p className="text-sm font-medium text-[var(--ink-2)]">Je hebt geen eigen woning — deze analyse is niet relevant</p>
            <p className="mt-0.5 text-xs text-[var(--ink-3)]">
              De huis verkopen vs. behouden vergelijking is alleen beschikbaar als je een eigen woning
              (type &ldquo;eigen_huis&rdquo;) in je bezittingen hebt staan.
            </p>
          </div>
        </div>
      )}

      {hasHouse && (
      <div className="space-y-3">
        {/* -- Adjustable assumptions ------------------------------------- */}
        <div className="space-y-2.5 rounded-[var(--r)] border border-[var(--border-ed)] p-3">
          <p className="flex items-center text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
            Pas de aannames aan
            <InfoTooltip text="De aanbeveling hangt sterk af van deze aannames. De startwaarden zijn afgeleid van je woningwaarde (huur ≈ 4,5% per jaar, overige lasten ≈ 1% per jaar). De horizon is gelijk aan je afbouwperiode. Schuif om te zien hoe gevoelig de uitkomst is." />
          </p>
          <SliderControl
            label="Verwachte huur"
            value={huur}
            onChange={setHuur}
            min={500}
            max={4000}
            step={HUUR_STAP}
            format={(v) => `${formatCurrency(v)}/mnd`}
          />
          <SliderControl
            label="Woningwaardegroei"
            value={groei}
            onChange={setGroei}
            min={GROEI_MIN}
            max={GROEI_MAX}
            step={GROEI_STAP}
            format={(v) => `${(v * 100).toFixed(1)}%/jr`}
          />
          <SliderControl
            label="Overige woonlasten"
            value={overigeLasten}
            onChange={setOverigeLasten}
            min={50}
            max={1500}
            step={OVERIG_STAP}
            format={(v) => `${formatCurrency(v)}/mnd`}
          />
          <p className="text-[10px] leading-snug text-[var(--ink-4)]">
            Horizon: {horizonJaren} jaar (je afbouwperiode).
          </p>
        </div>

        {/* -- Comparison table -------------------------------------------- */}
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border-ed)] text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                <th className="px-1 pb-2" />
                <th className="px-1 pb-2 text-right">Huis behouden</th>
                <th className="px-1 pb-2 text-right">Verkopen + huren</th>
              </tr>
            </thead>
            <tbody>
              {/* Maandelijkse woonlasten */}
              <tr className="border-b border-dashed border-[var(--border-ed)]">
                <td className="px-1 py-1.5 text-[var(--ink-3)]">
                  Maandelijkse woonlasten
                </td>
                <td className="px-1 py-1.5 text-right font-mono tabular-nums text-[var(--ink-2)]">
                  {formatMonthly(result.behouden.totaleCumulatieveKosten / horizonJaren, masked)}
                </td>
                <td className="px-1 py-1.5 text-right font-mono tabular-nums text-[var(--ink-2)]">
                  {formatMonthly(result.verkopen.totaleCumulatieveHuur / horizonJaren, masked)}
                </td>
              </tr>

              {/* Vrijgekomen vermogen */}
              <tr className="border-b border-dashed border-[var(--border-ed)]">
                <td className="px-1 py-1.5 text-[var(--ink-3)]">
                  Vrijgekomen vermogen
                </td>
                <td className="px-1 py-1.5 text-right font-mono tabular-nums text-[var(--ink-4)]">
                  &ndash;
                </td>
                <td className="px-1 py-1.5 text-right font-mono tabular-nums text-[var(--positive)]">
                  {<MaskedAmount value={result.verkopen.nettoVerkoopopbrengst} tone="horizon" />}
                </td>
              </tr>

              {/* Vermogensgroei over de periode — bruto waardegroei van het
                  productieve vermogen (huis-appreciatie vs. beleggingsgroei
                  vóór huurbetalingen), zodat beide kolommen vergelijkbaar zijn. */}
              <tr className="border-b border-dashed border-[var(--border-ed)]">
                <td className="px-1 py-1.5 text-[var(--ink-3)]">
                  <span className="inline-flex items-center">
                    Vermogensgroei (bruto)
                    <InfoTooltip text="De bruto waardegroei van je productieve vermogen over de periode. Bij behouden: de waardestijging van het huis. Bij verkopen: het beleggingsrendement op de verkoopopbrengst (vóór de betaalde huur). Beide tonen wat je vermogen verdient, los van de woonkosten." />
                  </span>
                </td>
                <td className="px-1 py-1.5 text-right font-mono tabular-nums text-[var(--ink-2)]">
                  {<MaskedAmount value={Math.round(result.behouden.woningWaardeNaHorizon - (houseFacts?.startWoningWaarde ?? 0))} tone="horizon" />}
                </td>
                <td className="px-1 py-1.5 text-right font-mono tabular-nums text-[var(--ink-2)]">
                  {<MaskedAmount value={Math.round(result.verkopen.beleggingswaarde - result.verkopen.nettoVerkoopopbrengst + result.verkopen.totaleCumulatieveHuur)} tone="horizon" />}
                </td>
              </tr>

              {/* Netto effect */}
              <tr className="border-t-2 border-[var(--ink)]">
                <td className="px-1 py-1.5 font-semibold text-[var(--ink)]">
                  Netto positie na {horizonJaren} jaar
                </td>
                <td
                  className={`px-1 py-1.5 text-right font-mono tabular-nums font-semibold ${
                    result.aanbeveling === 'behouden'
                      ? 'text-[var(--positive)]'
                      : 'text-[var(--ink)]'
                  }`}
                >
                  {<MaskedAmount value={result.behouden.nettoPositie} tone="horizon" />}
                </td>
                <td
                  className={`px-1 py-1.5 text-right font-mono tabular-nums font-semibold ${
                    result.aanbeveling === 'verkopen'
                      ? 'text-[var(--positive)]'
                      : 'text-[var(--ink)]'
                  }`}
                >
                  {<MaskedAmount value={result.verkopen.nettoPositie} tone="horizon" />}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* -- Winner badge ------------------------------------------------ */}
        <div className="flex items-center justify-center">
          <span className={`rounded-full bg-[var(--subtle)] px-3 py-1 text-xs font-semibold ${winner!.colorClass}`}>
            {winner!.text}
          </span>
        </div>

        {/* -- Sensitivity analysis ---------------------------------------- */}
        {sensitivityRows.length > 0 && (
          <div className="rounded-[var(--r)] border border-[var(--border-ed)] p-2.5">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
              Gevoeligheidsanalyse — woningwaardegroei
            </p>
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-ed)] text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                    <th className="px-1 pb-1.5">Groei</th>
                    <th className="px-1 pb-1.5 text-right">Behouden</th>
                    <th className="px-1 pb-1.5 text-right">Verkopen</th>
                    <th className="px-1 pb-1.5 text-right">Verschil</th>
                    <th className="px-1 pb-1.5 text-right">Advies</th>
                  </tr>
                </thead>
                <tbody>
                  {sensitivityRows.map((row) => {
                    const label = aanbevelingKort(row.result.aanbeveling)
                    // Highlight the scenario nearest the user's chosen growth rate.
                    const isBase = Math.abs(row.groeiPct - deferredGroei) < 0.005
                    return (
                      <tr
                        key={row.groeiPct}
                        className={`border-b border-dashed border-[var(--border-ed)] ${
                          isBase ? 'bg-[var(--subtle)]/30' : ''
                        }`}
                      >
                        <td className="px-1 py-1.5 font-mono tabular-nums text-[var(--ink-2)]">
                          {(row.groeiPct * 100).toFixed(0)}%
                          {isBase && (
                            <span className="ml-1 text-[10px] text-[var(--ink-4)]">
                              (basis)
                            </span>
                          )}
                        </td>
                        <td className="px-1 py-1.5 text-right font-mono tabular-nums text-[var(--ink-2)]">
                          {<MaskedAmount value={row.result.behouden.nettoPositie} tone="horizon" />}
                        </td>
                        <td className="px-1 py-1.5 text-right font-mono tabular-nums text-[var(--ink-2)]">
                          {<MaskedAmount value={row.result.verkopen.nettoPositie} tone="horizon" />}
                        </td>
                        <td
                          className={`px-1 py-1.5 text-right font-mono tabular-nums ${
                            row.result.verschil > 0
                              ? 'text-[var(--positive)]'
                              : row.result.verschil < 0
                                ? 'text-[var(--negative)]'
                                : 'text-[var(--ink-3)]'
                          }`}
                        >
                          {row.result.verschil > 0 ? '+' : ''}
                          {<MaskedAmount value={row.result.verschil} tone="horizon" />}
                        </td>
                        <td className={`px-1 py-1.5 text-right text-[11px] font-semibold ${label.colorClass}`}>
                          {label.text}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-[var(--ink-4)]">
              Verschil = verkopen − behouden. Positief = verkopen is voordeliger.
            </p>
          </div>
        )}

        {/* -- Opportunity cost block -------------------------------------- */}
        {opportunityData && (
          <div className="rounded-[var(--r)] border border-[var(--border-ed)] p-2.5">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
              Opportuniteitskosten vastgoed
            </p>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-baseline justify-between">
                <span className="text-[var(--ink-3)]">Huidige overwaarde</span>
                <span className="font-mono tabular-nums text-[var(--ink-2)]">
                  {<MaskedAmount value={opportunityData.netEquity} tone="horizon" />}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-[var(--ink-3)]">
                  Belegd rendement ({(expectedReturn * 100).toFixed(1)}%, {baseInput.horizonJaren} jr)
                </span>
                <span className="font-mono tabular-nums text-[var(--ink-2)]">
                  {<MaskedAmount value={opportunityData.fvInvested} tone="horizon" />}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-[var(--ink-3)]">
                  Woningwaarde na {baseInput.horizonJaren} jr
                </span>
                <span className="font-mono tabular-nums text-[var(--ink-2)]">
                  {<MaskedAmount value={opportunityData.houseEquityAtEnd} tone="horizon" />}
                </span>
              </div>
              <div className="flex items-baseline justify-between border-t border-[var(--ink)] pt-1.5">
                <span className="font-semibold text-[var(--ink)]">
                  Opportuniteitskosten
                </span>
                <span
                  className={`font-mono tabular-nums font-semibold ${
                    opportunityData.opportuniteitskosten > 0
                      ? 'text-[var(--negative)]'
                      : opportunityData.opportuniteitskosten < 0
                        ? 'text-[var(--positive)]'
                        : 'text-[var(--ink-2)]'
                  }`}
                >
                  {opportunityData.opportuniteitskosten > 0 ? '+' : ''}
                  {<MaskedAmount value={opportunityData.opportuniteitskosten} tone="horizon" />}
                </span>
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-3)]">
              {opportunityData.opportuniteitskosten > 0 ? (
                <>
                  Door je overwaarde in het huis te laten zitten in plaats van te beleggen,
                  loop je over {baseInput.horizonJaren} jaar{' '}
                  <span className="font-mono tabular-nums text-[var(--negative)]">
                    {<MaskedAmount value={opportunityData.opportuniteitskosten} tone="horizon" />}
                  </span>{' '}
                  aan potentieel rendement mis.
                </>
              ) : (
                <>
                  De woningwaardestijging overtreft het verwachte beleggingsrendement.
                  Je overwaarde levert in het huis{' '}
                  <span className="font-mono tabular-nums text-[var(--positive)]">
                    {<MaskedAmount value={Math.abs(opportunityData.opportuniteitskosten)} tone="horizon" />}
                  </span>{' '}
                  meer op dan belegd vermogen.
                </>
              )}
            </p>
          </div>
        )}

        {/* -- Breakeven + conclusion -------------------------------------- */}
        <div className="rounded-[var(--r)] border border-dashed border-[var(--border-ed)] p-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-[var(--ink-3)]">Breakeven huur</span>
            <span className="font-mono text-xs tabular-nums text-[var(--ink-2)]">
              {<MaskedAmount value={result.breakevenHuur} tone="horizon" />}/mnd
            </span>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-3)]">
            {result.aanbeveling === 'verkopen' && (
              <>
                Bij de huidige uitgangspunten is verkopen en huren over {horizonJaren} jaar{' '}
                <span className="font-mono tabular-nums text-[var(--positive)]">
                  {<MaskedAmount value={Math.abs(result.verschil)} tone="horizon" />}
                </span>{' '}
                voordeliger.
              </>
            )}
            {result.aanbeveling === 'behouden' && (
              <>
                Bij de huidige uitgangspunten is het huis behouden over {horizonJaren} jaar{' '}
                <span className="font-mono tabular-nums text-[var(--color-kern-500)]">
                  {<MaskedAmount value={Math.abs(result.verschil)} tone="horizon" />}
                </span>{' '}
                voordeliger.
              </>
            )}
            {result.aanbeveling === 'gelijk' && (
              <>
                Beide scenario&apos;s leveren nagenoeg hetzelfde op over {horizonJaren} jaar.
                Kies op basis van woonwensen en risicoprofiel.
              </>
            )}
          </p>
        </div>

        {/* -- Aannames (collapsible) --------------------------------------- */}
        <AannameSectie
          woningWaardeGroei={baseInput.woningWaardeGroei}
          maandlastOverig={baseInput.maandlastOverig}
          verwachteHuur={baseInput.verwachteHuur}
          verkoopkostenPct={baseInput.verkoopkostenPct}
          horizonJaren={baseInput.horizonJaren}
          expectedReturn={expectedReturn}
          inflationRate={inflationRate}
        />

        {/* -- Disclaimer -------------------------------------------------- */}
        <p className="text-[10px] italic leading-relaxed text-[var(--ink-4)]">
          Dit is een indicatieve berekening op basis van bovenstaande aannames.
          Werkelijke uitkomsten kunnen afwijken. Raadpleeg een financieel adviseur
          voor persoonlijk advies.
        </p>
      </div>
      )}
    </AnalysisSection>
  )
})

// ── Assumption row helper ────────────────────────────────────────────────────

function AssumptionRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="font-sans text-xs text-[var(--ink-3)]">{label}</span>
      <span className="font-mono text-xs tabular-nums text-[var(--ink-2)]">{value}</span>
    </div>
  )
}

// ── Adjustable slider control ─────────────────────────────────────────────────

/**
 * Editorial-styled range slider flanked by −/+ stepper buttons, mirroring the
 * opbouw hypotheek control. Module colours (horizon) + ink tokens. The `format`
 * fn renders the live value (e.g. "€1.350/mnd" or "3,0%/jr").
 */
const SliderControl = memo(function SliderControl({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step: number
  format: (value: number) => string
}) {
  const clampValue = (v: number) => {
    const snapped = Math.round(v / step) * step
    return Math.max(min, Math.min(max, snapped))
  }

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-[var(--ink-3)]">{label}</span>
        <span className="font-mono text-sm font-semibold tabular-nums text-[var(--color-horizon-600)]">
          {format(value)}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <button
          type="button"
          aria-label={`Verlaag ${label.toLowerCase()}`}
          onClick={() => onChange(clampValue(value - step))}
          disabled={value <= min}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r)] border border-[var(--border-ed)] text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]/50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(clampValue(Number(e.target.value)))}
          aria-label={label}
          className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-[var(--border-ed)] accent-[var(--color-horizon-600)]"
        />
        <button
          type="button"
          aria-label={`Verhoog ${label.toLowerCase()}`}
          onClick={() => onChange(clampValue(value + step))}
          disabled={value >= max}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r)] border border-[var(--border-ed)] text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]/50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
})

// ── Collapsible Aannames section ─────────────────────────────────────────────

function AannameSectie({
  woningWaardeGroei,
  maandlastOverig,
  verwachteHuur,
  verkoopkostenPct,
  horizonJaren,
  expectedReturn,
  inflationRate,
}: {
  woningWaardeGroei: number
  maandlastOverig: number
  verwachteHuur: number
  verkoopkostenPct: number
  horizonJaren: number
  expectedReturn: number
  inflationRate: number
}) {
  const { masked } = useMaskedAmounts()
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-[var(--r)] border border-dashed border-[var(--border-ed)]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex min-h-[44px] w-full items-center gap-1.5 px-3 py-2 text-xs font-medium text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)]"
        aria-expanded={open}
      >
        {open
          ? <ChevronDown className="h-3.5 w-3.5 transition-transform duration-150" />
          : <ChevronRight className="h-3.5 w-3.5 transition-transform duration-150" />
        }
        Aannames
      </button>

      {open && (
        <div className="border-t border-dashed border-[var(--border-ed)] px-3 pb-3 pt-2">
          <div className="space-y-1">
            <AssumptionRow
              label="Woningwaardestijging"
              value={`${(woningWaardeGroei * 100).toFixed(0)}% per jaar`}
            />
            <AssumptionRow
              label="Woonlasten (OZB/VvE/onderhoud)"
              value={formatMaskedCurrency(maandlastOverig, masked) + '/mnd'}
            />
            <AssumptionRow
              label="Verwachte huur"
              value={formatMaskedCurrency(verwachteHuur, masked) + '/mnd'}
            />
            <AssumptionRow
              label="Verkoopkosten"
              value={`${(verkoopkostenPct * 100).toFixed(0)}% van woningwaarde`}
            />
            <AssumptionRow
              label="Horizon"
              value={`${horizonJaren} jaar`}
            />
            <AssumptionRow
              label="Verwacht beleggingsrendement"
              value={`${(expectedReturn * 100).toFixed(1)}% per jaar`}
            />
            <AssumptionRow
              label="Inflatie"
              value={`${(inflationRate * 100).toFixed(1)}% per jaar`}
            />
          </div>
        </div>
      )}
    </div>
  )
}
