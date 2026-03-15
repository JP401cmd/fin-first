'use client'

import { useState, useCallback } from 'react'
import { AlertTriangle, TrendingUp, TableProperties, ChevronDown, ChevronUp } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { SimChart } from '@/components/app/horizon/sim-chart'
import { ZoomableChartContainer } from '@/components/app/horizon/zoomable-chart-container'
import { formatCurrency } from '@/lib/format'
import { formatFireAge } from '@/lib/horizon-data'
import type { SimResult, SimCashflow } from '@/lib/fire-simulation'
import { type FireEndStrategy, STRATEGY_LABELS } from '@/lib/fire-strategy'
import { DEFAULT_RETURN } from '@/lib/constants'

// ── Constants ────────────────────────────────────────────────────────────────

const GROSS_RETURN = DEFAULT_RETURN

// ── Helpers ──────────────────────────────────────────────────────────────────

function methodLabel(method: string | null): string {
  switch (method) {
    case 'essential_budgets': return 'Essentiële budgetten'
    case 'custom_amount': return 'Vast bedrag (handmatig)'
    case 'current_income': return 'Huidig inkomen'
    default: return 'Automatisch bepaald'
  }
}

function cashflowLabel(cf: SimCashflow): string {
  return cf.id === 'aow-prefill' ? 'AOW (staatspension)' : cf.name
}

// Compact currency without decimals
function fmt(n: number): string {
  return formatCurrency(Math.round(n))
}

// ── SimChartModal ─────────────────────────────────────────────────────────────
// Alleen de BottomSheet — geen card-wrapper. Gebruik dit in de merged hero.

export interface SimChartModalProps {
  open: boolean
  onClose: () => void
  simResult: SimResult | null
  cashflows: SimCashflow[]
  currentAge: number | null
  retirementExpenseMethod: string | null
  yearlyExpenses: number
}

export function SimChartModal({
  open,
  onClose,
  simResult,
  cashflows,
  currentAge,
  retirementExpenseMethod,
  yearlyExpenses,
}: SimChartModalProps) {
  // Derive strategy from simResult
  const strategy: FireEndStrategy = simResult?.strategy ?? 'deplete'
  const displayEndAge = simResult?.displayEndAge ?? 90
  const targetEndPortfolio = simResult?.targetEndPortfolio ?? 0
  const [tableExpanded, setTableExpanded] = useState(false)

  if (!simResult) return null

  const {
    fireAgeFractional, fireAge, fireReachable, rows,
    requiredFirePortfolio, classic25xTarget, implicitWithdrawalRate,
    firePortfolioAtFire,
  } = simResult

  const resolvedCurrentAge = currentAge ?? 30
  const startPortfolio = rows[0]?.startPortfolio ?? 0
  const annualSavingsFromRows = rows.find(r => r.phase === 'accumulation')?.savings ?? 0
  const accumulationRows = rows.filter(r => r.phase === 'accumulation')
  const retirementRows = rows.filter(r => r.phase === 'retirement')

  return (
    <BottomSheet open={open} onClose={onClose} title="Simulatie Prognose">
      <div className="p-4 sm:p-6 space-y-6">

        {/* 1. Kassabon — onderbouwing berekening */}
        <KassabonShell>
          {/* Header */}
          <div className="mb-3 text-center">
            <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
              FIRE SIMULATIE — ONDERBOUWING
            </p>
            <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
              jaar-op-jaar simulatie &middot; {strategy === 'perpetual'
                ? 'behoud van vermogen'
                : strategy === 'legacy'
                ? `erfenis ${fmt(targetEndPortfolio)} op leeftijd ${displayEndAge}`
                : `einddatum leeftijd ${displayEndAge}`}
            </p>
          </div>

          {/* Uitleg */}
          <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
            De simulatie berekent voor elk jaar of je vermogen groot genoeg is om de rest van je leven van te leven.
            Zodra je vermogen de opnamedrempel bereikt, is FIRE haalbaar — de exacte maand wordt via interpolatie bepaald.
          </div>

          {/* Invoerparameters */}
          <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
            <p className="mb-1 font-sans text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--ink-4)]">
              Invoerparameters
            </p>
            <div className="flex justify-between py-0.5">
              <span className="font-sans text-sm text-[var(--ink-2)]">Huidig netto vermogen</span>
              <span className="tabular-nums text-[var(--ink)]">{fmt(startPortfolio)}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="font-sans text-sm text-[var(--ink-2)]">Jaarlijkse uitgaven (pensioen)</span>
              <span className="tabular-nums text-[var(--ink)]">{fmt(yearlyExpenses)}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="font-sans text-sm text-[var(--ink-2)]">Dagelijkse uitgaven</span>
              <span className="tabular-nums text-[var(--ink)]">{fmt(yearlyExpenses / 365)}/dag</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="font-sans text-sm text-[var(--ink-2)]">Jaarlijkse inleg (assets)</span>
              <span className="tabular-nums text-[var(--ink)]">{fmt(annualSavingsFromRows * 12)}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="font-sans text-sm text-[var(--ink-2)]">Bruto rendement</span>
              <span className="tabular-nums text-[var(--ink)]">{(GROSS_RETURN * 100).toFixed(0)}% per jaar</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="font-sans text-sm text-[var(--ink-2)]">Inflatie</span>
              <span className="tabular-nums text-[var(--ink)]">2% per jaar</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="font-sans text-sm text-[var(--ink-2)]">Uitgavenmethode</span>
              <span className="tabular-nums text-[var(--ink)]">{methodLabel(retirementExpenseMethod)}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="font-sans text-sm text-[var(--ink-2)]">Eindstrategie</span>
              <span className="tabular-nums text-[var(--ink)]">{STRATEGY_LABELS[strategy].name}</span>
            </div>
          </div>

          {/* FIRE-vermogen berekening */}
          <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
            <p className="mb-1 font-sans text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--ink-4)]">
              Benodigde FIRE-vermogen
            </p>
            <div className="flex justify-between py-0.5">
              <span className="font-sans text-sm text-[var(--ink-2)]">Simulatie-berekend vereist bedrag</span>
              <span className="tabular-nums font-semibold text-[var(--ink)]">{fmt(requiredFirePortfolio)}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="font-sans text-sm text-[var(--ink-2)]">Klassiek 25× doel (4%-regel)</span>
              <span className="tabular-nums text-[var(--ink-3)]">{fmt(classic25xTarget)}</span>
            </div>
            {fireReachable && (
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Vermogen op FIRE-moment</span>
                <span className="tabular-nums text-[var(--ink-3)]">{fmt(firePortfolioAtFire)}</span>
              </div>
            )}
            <div className="flex justify-between py-0.5">
              <span className="font-sans text-sm text-[var(--ink-2)]">Impliciete opnamerate</span>
              <span className="tabular-nums text-[var(--ink)]">{(implicitWithdrawalRate * 100).toFixed(2)}%</span>
            </div>
          </div>

          {/* Kasstromen */}
          {cashflows.length > 0 && (
            <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
              <p className="mb-1 font-sans text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--ink-4)]">
                Meegenomen kasstromen
              </p>
              {cashflows.map(cf => (
                <div key={cf.id} className="flex justify-between py-0.5">
                  <span className="font-sans text-[11px] text-[var(--ink-2)]">
                    {cashflowLabel(cf)}{' '}
                    <span className="text-[var(--ink-4)] text-[10px]">
                      ({cf.type === 'one_time' ? `eenmalig leeftijd ${cf.fromAge}` : `leeftijd ${cf.fromAge}${cf.toAge ? `–${cf.toAge}` : '+'}`})
                    </span>
                  </span>
                  <span className={`tabular-nums text-[11px] font-medium ${cf.direction === 'income' ? 'text-horizon-700' : 'text-kern-700'}`}>
                    {cf.direction === 'income' ? '+' : '−'}{fmt(cf.amount)}{cf.type === 'recurring' ? '/mnd' : ''}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Totaalregel */}
          <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
            <span className="text-[var(--ink)]">Vrijheidsleeftijd</span>
            <span className="tabular-nums text-[var(--ink)]">
              {fireAgeFractional !== null
                ? `${fireAgeFractional.toFixed(1)} jaar`
                : 'Niet bereikbaar'}
            </span>
          </div>
          {fireAgeFractional !== null && (
            <p className="mt-1 text-center font-sans text-[11px] text-[var(--ink-3)]">
              {formatFireAge(fireAgeFractional)}
            </p>
          )}

          {/* Formule */}
          <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
            <p>
              <strong className="font-semibold text-[var(--ink-3)]">Formule opbouw:</strong>{' '}
              Portfolio<sub>n+1</sub> = Portfolio<sub>n</sub> × (1 + rendement) + inleg + kasstromen
            </p>
            <p className="mt-1">
              <strong className="font-semibold text-[var(--ink-3)]">Formule afbouw:</strong>{' '}
              Opname = max(0, uitgaven − periodieke kasstromen). {strategy === 'perpetual'
                ? 'Portfolio behoudt koopkracht — netto reëel rendement dekt opnames.'
                : strategy === 'legacy'
                ? `Portfolio sluit op ${fmt(targetEndPortfolio)} (geïndexeerd) op leeftijd ${displayEndAge}.`
                : `Portfolio sluit op €0 op leeftijd ${displayEndAge}.`}
            </p>
            <p className="mt-1">
              <strong className="font-semibold text-[var(--ink-3)]">FIRE-moment:</strong>{' '}
              Binaire zoekmethode bepaalt het exacte minimale vermogen per leeftijd. Fractionele leeftijd via lineaire interpolatie.
            </p>
          </div>

          {/* Footer */}
          <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">
            Simulatie-engine &middot; {methodLabel(retirementExpenseMethod)} &middot; {new Date().toLocaleDateString('nl-NL')}
          </p>
        </KassabonShell>

        {/* 2. Grafiek */}
        <div>
          <p className="label-editorial text-[var(--ink-3)] mb-2">VERMOGENSGRAFIEK</p>
          <div className="overflow-hidden rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] p-3">
            <ZoomableChartContainer currentAge={resolvedCurrentAge} endAge={displayEndAge}>
              {(visibleMin, visibleMax) => (
                <SimChart
                  rows={rows}
                  fireAge={fireAge}
                  fireAgeFractional={fireAgeFractional}
                  currentAge={resolvedCurrentAge}
                  endAge={displayEndAge}
                  cashflows={cashflows}
                  forModal
                  strategy={strategy}
                  targetEndPortfolio={targetEndPortfolio}
                  visibleMinAge={visibleMin}
                  visibleMaxAge={visibleMax}
                />
              )}
            </ZoomableChartContainer>
            <div className="mt-2 flex flex-wrap gap-3 text-[10px] font-sans text-[var(--ink-4)]">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-4 rounded-sm bg-horizon-600/70" /> Opbouwfase
              </span>
              <span className="flex items-center gap-1">
                <span className={`inline-block h-2 w-4 rounded-sm ${strategy === 'perpetual' ? 'bg-horizon-600/70' : 'bg-kern-600/70'}`} /> {strategy === 'perpetual' ? 'Behoudfase' : 'Afbouwfase'}
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-horizon-600" /> Inkomen (AOW/pensioen)
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-kern-600" /> Uitgave (levensgebeurtenis)
              </span>
            </div>
          </div>
        </div>

        {/* 3. Jaar-op-jaar tabel */}
        <div>
          <button
            type="button"
            onClick={() => setTableExpanded(v => !v)}
            className="flex w-full items-center justify-between gap-2 text-left"
            aria-expanded={tableExpanded}
          >
            <p className="label-editorial text-[var(--ink-3)]">
              JAAR-OP-JAAR VERLOOP
              <span className="ml-2 font-mono text-[10px] normal-case text-[var(--ink-4)]">
                ({rows.length} jaar)
              </span>
            </p>
            {tableExpanded
              ? <ChevronUp className="h-4 w-4 text-[var(--ink-4)]" />
              : <ChevronDown className="h-4 w-4 text-[var(--ink-4)]" />
            }
          </button>

          {tableExpanded && (
            <div className="mt-3 overflow-x-auto rounded-[var(--r)] border border-[var(--border-ed)]">
              <table className="w-full min-w-[780px] text-[11px] font-mono">
                <thead>
                  <tr className="border-b border-[var(--border-ed)] bg-[var(--subtle)]">
                    <th className="px-3 py-2 text-left font-sans text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--ink-3)]">Leeftijd</th>
                    <th className="px-3 py-2 text-left font-sans text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--ink-3)]">Fase</th>
                    <th className="px-3 py-2 text-right font-sans text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--ink-3)]">Begin</th>
                    <th className="px-3 py-2 text-right font-sans text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--ink-3)]">Rendement</th>
                    <th className="px-3 py-2 text-right font-sans text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--ink-3)]">Inleg/Opname</th>
                    <th className="px-3 py-2 text-right font-sans text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--ink-3)]">Levensgebeur&shy;tenissen</th>
                    <th className="px-3 py-2 text-right font-sans text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--ink-3)]">Cumulatief LE</th>
                    <th className="px-3 py-2 text-right font-sans text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--ink-3)]">Eind</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    let cumLifeEvent = 0
                    return rows.map((row, i) => {
                      cumLifeEvent += row.cashflowNet
                      const isFireRow = fireAge !== null && row.age === fireAge && row.phase === 'retirement'
                      const isAccumulation = row.phase === 'accumulation'
                      return (
                        <tr
                          key={i}
                          className={`border-b border-[var(--border-ed)] ${
                            isFireRow
                              ? 'bg-horizon-50/80 font-bold'
                              : isAccumulation
                              ? 'bg-[var(--paper)]'
                              : 'bg-kern-50/30'
                          }`}
                        >
                          <td className="px-3 py-1.5 text-[var(--ink)]">
                            {row.age}
                            {isFireRow && (
                              <span className="ml-1.5 font-sans text-[9px] font-bold uppercase tracking-wide text-horizon-600">
                                FIRE
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-1.5">
                            <span className={`font-sans text-[10px] font-medium ${isAccumulation ? 'text-horizon-700' : strategy === 'perpetual' ? 'text-horizon-700' : 'text-kern-700'}`}>
                              {isAccumulation ? 'Opbouw' : strategy === 'perpetual' ? 'Behoud' : 'Afbouw'}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 tabular-nums text-right text-[var(--ink-2)]">
                            {fmt(row.startPortfolio)}
                          </td>
                          <td className="px-3 py-1.5 tabular-nums text-right text-horizon-700">
                            +{fmt(row.growth)}
                          </td>
                          <td className="px-3 py-1.5 tabular-nums text-right">
                            {isAccumulation ? (
                              <span className="text-horizon-700">+{fmt(row.savings)}</span>
                            ) : (
                              <span className="text-kern-700">−{fmt(row.withdrawal)}</span>
                            )}
                          </td>
                          <td className={`px-3 py-1.5 tabular-nums text-right ${
                            row.cashflowNet > 0 ? 'text-horizon-700'
                            : row.cashflowNet < 0 ? 'text-kern-700'
                            : 'text-[var(--ink-4)]'
                          }`}>
                            {row.cashflowNet !== 0
                              ? <>{row.cashflowNet > 0 ? '+' : ''}{fmt(row.cashflowNet)}</>
                              : <span className="text-[var(--ink-4)]">—</span>
                            }
                          </td>
                          <td className={`px-3 py-1.5 tabular-nums text-right font-medium ${
                            cumLifeEvent > 0 ? 'text-horizon-800'
                            : cumLifeEvent < 0 ? 'text-kern-800'
                            : 'text-[var(--ink-4)]'
                          }`}>
                            {cumLifeEvent !== 0
                              ? <>{cumLifeEvent > 0 ? '+' : ''}{fmt(cumLifeEvent)}</>
                              : <span className="text-[var(--ink-4)]">—</span>
                            }
                          </td>
                          <td className="px-3 py-1.5 tabular-nums text-right font-semibold text-[var(--ink)]">
                            {fmt(row.endPortfolio)}
                          </td>
                        </tr>
                      )
                    })
                  })()}
                </tbody>
              </table>

              {/* Tabel legenda */}
              <div className="border-t border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2 font-sans text-[10px] text-[var(--ink-4)]">
                <strong className="text-[var(--ink-3)]">Levensgebeurtenissen</strong> = netto jaarlijks bedrag van actieve kasstromen (AOW, pensioen, etc.) in dat jaar.{' '}
                <strong className="text-[var(--ink-3)]">Cumulatief LE</strong> = oplopend totaal van alle levensgebeurtenis-kasstromen t/m dat jaar.
                Bedragen zijn nominaal (inclusief 2% inflatie per jaar).
                {fireAgeFractional !== null && (
                  <span className="ml-1">
                    FIRE-moment op leeftijd <strong className="text-horizon-600">{fireAgeFractional.toFixed(1)}</strong> via fractionele interpolatie.
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Samenvattingsregel als tabel ingeklapt */}
          {!tableExpanded && (
            <div className="mt-2 grid grid-cols-3 gap-3">
              <div className="rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--subtle)]/60 p-2.5 text-center">
                <p className="font-sans text-[10px] text-[var(--ink-4)]">Opbouwjaren</p>
                <p className="font-mono text-base font-semibold text-horizon-700">{accumulationRows.length}</p>
              </div>
              <div className="rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--subtle)]/60 p-2.5 text-center">
                <p className="font-sans text-[10px] text-[var(--ink-4)]">{strategy === 'perpetual' ? 'Behoudjaren' : 'Afbouwjaren'}</p>
                <p className={`font-mono text-base font-semibold ${strategy === 'perpetual' ? 'text-horizon-700' : 'text-kern-700'}`}>{retirementRows.length}</p>
              </div>
              <div className="rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--subtle)]/60 p-2.5 text-center">
                <p className="font-sans text-[10px] text-[var(--ink-4)]">Totaal AOW</p>
                <p className="font-mono text-base font-semibold text-[var(--ink)]">
                  {retirementRows.filter(r => r.age >= 67).length} jaar
                </p>
              </div>
            </div>
          )}
        </div>

      </div>
    </BottomSheet>
  )
}

// ── SimChartWidget ────────────────────────────────────────────────────────────
// Volledige card-wrapper versie (voor standalone gebruik buiten de hero).

export interface SimChartWidgetProps {
  simResult: SimResult | null
  cashflows: SimCashflow[]
  currentAge: number | null
  retirementExpenseMethod: string | null
  yearlyExpenses: number
  className?: string
}

export function SimChartWidget({
  simResult,
  cashflows,
  currentAge,
  retirementExpenseMethod,
  yearlyExpenses,
  className,
}: SimChartWidgetProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const handleClose = useCallback(() => setModalOpen(false), [])

  // ── Edge case: no simResult ──────────────────────────────────────────────
  if (simResult === null) {
    return (
      <div className="card-editorial overflow-hidden">
        <div className="h-1 bg-horizon-400" />
        <div className="p-4 sm:p-6">
          <p className="label-editorial text-horizon-600 mb-3">SIMULATIE-PROGNOSE</p>
          <div className="flex items-center gap-3 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)] p-4">
            <TrendingUp className="h-5 w-5 shrink-0 text-[var(--ink-4)]" />
            <p className="font-sans text-sm text-[var(--ink-3)]">
              Zorg dat je geboortedatum en essentiële budgetten zijn ingesteld om de simulatie te activeren.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const {
    fireAgeFractional, fireAge, fireReachable, rows,
    requiredFirePortfolio, implicitWithdrawalRate,
  } = simResult

  const resolvedCurrentAge = currentAge ?? 30

  return (
    <>
      {/* Klikbare widget card */}
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className={`card-editorial overflow-hidden w-full text-left transition-all hover:shadow-[var(--s1)] hover:-translate-y-px${className ? ` ${className}` : ''}`}
        aria-label="Bekijk simulatie prognose details"
      >
        <div className="h-1 bg-horizon-400" />
        <div className="p-4 sm:p-6">
          {/* Header rij */}
          <div className="mb-4 flex items-start justify-between gap-3">
            <p className="label-editorial text-horizon-600">SIMULATIE-PROGNOSE</p>
            <span className="flex items-center gap-1 rounded-[var(--r-sm)] border border-horizon-200 bg-horizon-50 px-2 py-0.5 font-sans text-[10px] text-horizon-600">
              <TableProperties className="h-3 w-3" />
              Details
            </span>
          </div>

          {/* FIRE niet bereikbaar waarschuwing */}
          {!fireReachable && (
            <div className="mb-4 flex items-start gap-2.5 rounded-[var(--r)] border border-dashed border-orange-300 bg-orange-50/60 px-3 py-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
              <p className="font-sans text-[12px] text-orange-700">
                FIRE niet bereikbaar voor leeftijd {simResult.displayEndAge} — verhoog je spaarquote of verlaag je uitgaven.
              </p>
            </div>
          )}

          {/* Primaire metriek */}
          <div className="mb-5 flex items-end gap-6">
            <div>
              <span className="font-sans text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                Vrijheidsleeftijd
              </span>
              <div className="font-display text-[40px] sm:text-[48px] font-bold leading-none tracking-tight text-[var(--ink)]">
                {fireAgeFractional !== null ? fireAgeFractional.toFixed(1) : '—'}
              </div>
              <span className="font-sans text-[11px] text-[var(--ink-3)]">
                {fireAgeFractional !== null
                  ? formatFireAge(fireAgeFractional) + ' oud'
                  : `niet bereikbaar voor leeftijd ${simResult.displayEndAge}`}
              </span>
            </div>

            {fireReachable && (
              <div className="mb-1 flex flex-col gap-1 text-right">
                <div>
                  <span className="font-sans text-[10px] text-[var(--ink-4)]">Benodigd vermogen</span>
                  <div className="font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                    {fmt(requiredFirePortfolio)}
                  </div>
                </div>
                <div>
                  <span className="font-sans text-[10px] text-[var(--ink-4)]">Opnamepercentage</span>
                  <div className="font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                    {(implicitWithdrawalRate * 100).toFixed(2)}%
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Chart (verkleinde preview) */}
          <div className="overflow-hidden rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] p-2">
            <SimChart
              rows={rows}
              fireAge={fireAge}
              fireAgeFractional={fireAgeFractional}
              currentAge={resolvedCurrentAge}
              endAge={simResult.displayEndAge}
              cashflows={cashflows}
              strategy={simResult.strategy}
              targetEndPortfolio={simResult.targetEndPortfolio}
            />
          </div>

          {/* Kasstromen pills */}
          {cashflows.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {cashflows.map(cf => (
                <span
                  key={cf.id}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-sans text-[10px] font-medium ${
                    cf.direction === 'income'
                      ? 'border-horizon-200 bg-horizon-50 text-horizon-700'
                      : 'border-kern-200 bg-kern-50/60 text-kern-700'
                  }`}
                >
                  {cf.direction === 'income' ? '↑' : '↓'} {cashflowLabel(cf)} (leeftijd {cf.fromAge})
                </span>
              ))}
            </div>
          )}

          {/* Footer */}
          <p className="mt-3 font-sans text-[10px] text-[var(--ink-4)]">
            {STRATEGY_LABELS[simResult.strategy].name} &middot; Simulatie tot leeftijd {simResult.displayEndAge} &middot; Klik voor jaar-op-jaar tabel
          </p>
        </div>
      </button>

      <SimChartModal
        open={modalOpen}
        onClose={handleClose}
        simResult={simResult}
        cashflows={cashflows}
        currentAge={currentAge}
        retirementExpenseMethod={retirementExpenseMethod}
        yearlyExpenses={yearlyExpenses}
      />
    </>
  )
}
