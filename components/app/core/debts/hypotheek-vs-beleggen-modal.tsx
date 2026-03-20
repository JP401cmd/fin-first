'use client'

import { useState, useMemo } from 'react'
import { ChevronDown, ChevronUp, Scale, ShieldCheck, TrendingUp, AlertTriangle, Info } from 'lucide-react'
import { FinTable } from '@/components/app/fin-table'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { compareMortgageVsInvest, type HvBParams, type HvBResult, type RepaymentType } from '@/lib/hypotheek-vs-beleggen'
import { formatCurrency } from '@/lib/format'

// ── Types ────────────────────────────────────────────────────────────────────

interface HypotheekVsBeleggenModalProps {
  open: boolean
  onClose: () => void
  /** Hypotheek gegevens (vanuit debt detail) */
  hypotheekBalance: number
  rente: number
  repaymentType: RepaymentType
  restLooptijd: number
  isTaxDeductible: boolean
  marginaalTarief: number
  inflatie: number
  hasPartner: boolean
  /** Optioneel: FIRE-impact parameters */
  currentAge?: number
  currentPortfolio?: number
  yearlyExpenses?: number
  annualSavings?: number
  cashflows?: HvBParams['cashflows']
}

// ── Slider Row ───────────────────────────────────────────────────────────────

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  formatValue,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  formatValue: (v: number) => string
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-widest text-[var(--ink-3)]">
          {label}
        </span>
        <span className="font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
          {formatValue(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-kern-600"
      />
      <div className="flex justify-between text-[10px] text-[var(--ink-4)]">
        <span>{formatValue(min)}</span>
        <span>{formatValue(max)}</span>
      </div>
    </div>
  )
}

// ── Scenario Card ────────────────────────────────────────────────────────────

function ScenarioCard({
  title,
  icon,
  nettoVoordeel,
  eindwaarde,
  isWinner,
  variant,
  children,
}: {
  title: string
  icon: React.ReactNode
  nettoVoordeel: number
  eindwaarde: number
  isWinner: boolean
  variant: 'aflossen' | 'beleggen'
  children?: React.ReactNode
}) {
  const winnerBorder = variant === 'aflossen' ? 'border-blue-600' : 'border-emerald-600'
  const winnerBg = variant === 'aflossen' ? 'bg-blue-50' : 'bg-emerald-50'
  const badgeBg = variant === 'aflossen' ? 'bg-blue-100' : 'bg-emerald-100'
  const badgeText = variant === 'aflossen' ? 'text-blue-700' : 'text-emerald-700'

  return (
    <div
      className={`rounded-[var(--r)] border p-4 ${
        isWinner
          ? `${winnerBorder} ${winnerBg}`
          : 'border-[var(--border-ed)] bg-[var(--subtle)]'
      }`}
    >
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h4 className="text-sm font-semibold text-[var(--ink)]">{title}</h4>
        {isWinner && (
          <span className={`ml-auto rounded-full ${badgeBg} px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${badgeText}`}>
            Voordeel
          </span>
        )}
      </div>
      <div className="space-y-2">
        <div>
          <p className="text-xs text-[var(--ink-3)]">Netto voordeel</p>
          <p className={`font-mono text-xl font-bold tabular-nums ${
            nettoVoordeel >= 0 ? 'text-emerald-600' : 'text-red-500'
          }`}>
            {nettoVoordeel >= 0 ? '+' : ''}{formatCurrency(nettoVoordeel)}
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--ink-3)]">Eindwaarde</p>
          <p className="font-mono text-sm font-medium tabular-nums text-[var(--ink)]">
            {formatCurrency(eindwaarde)}
          </p>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── Yearly Comparison Table ──────────────────────────────────────────────────

function JaarVergelijkingTabel({ result }: { result: HvBResult }) {
  const [open, setOpen] = useState(false)

  if (result.jaarlijkseVergelijking.length === 0) return null

  return (
    <div className="rounded-[var(--r)] border border-[var(--border-ed)]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-medium text-[var(--ink)]">
          Jaarlijkse vergelijking
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-[var(--ink-3)]" />
        ) : (
          <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" />
        )}
      </button>
      {open && (
        <div className="border-t border-[var(--border-ed)]">
          <FinTable>
            <FinTable.Header>
              <FinTable.Row className="bg-[var(--subtle)]">
                <FinTable.Th>Jaar</FinTable.Th>
                <FinTable.Th align="right">Aflossen</FinTable.Th>
                <FinTable.Th align="right">Beleggen</FinTable.Th>
                <FinTable.Th align="right">Verschil</FinTable.Th>
              </FinTable.Row>
            </FinTable.Header>
            <FinTable.Body zebra>
              {result.jaarlijkseVergelijking.map((row) => (
                <FinTable.Row key={row.jaar}>
                  <FinTable.Td numeric>{row.jaar}</FinTable.Td>
                  <FinTable.Td numeric>{formatCurrency(row.aflossen)}</FinTable.Td>
                  <FinTable.Td numeric>{formatCurrency(row.beleggen)}</FinTable.Td>
                  <FinTable.Td numeric bold color={
                    row.verschil > 0 ? 'text-emerald-600' : row.verschil < 0 ? 'text-red-500' : 'text-[var(--ink-3)]'
                  }>
                    {row.verschil > 0 ? '+' : ''}{formatCurrency(row.verschil)}
                  </FinTable.Td>
                </FinTable.Row>
              ))}
            </FinTable.Body>
          </FinTable>
        </div>
      )}
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function HypotheekVsBeleggenModal({
  open,
  onClose,
  hypotheekBalance,
  rente,
  repaymentType,
  restLooptijd,
  isTaxDeductible,
  marginaalTarief,
  inflatie,
  hasPartner,
  currentAge,
  currentPortfolio,
  yearlyExpenses,
  annualSavings,
  cashflows,
}: HypotheekVsBeleggenModalProps) {
  // ── Slider state ───────────────────────────────────────────────────────────
  const [extraBedrag, setExtraBedrag] = useState(300)
  const [verwachtRendement, setVerwachtRendement] = useState(7) // in %
  const [horizonJaren, setHorizonJaren] = useState(
    Math.min(Math.round(restLooptijd / 12), 30),
  )

  // ── Disclaimer state ───────────────────────────────────────────────────────
  const [disclaimerOpen, setDisclaimerOpen] = useState(true)

  // ── Compute result ─────────────────────────────────────────────────────────
  const result = useMemo<HvBResult>(() => {
    const params: HvBParams = {
      extraBedrag,
      hypotheekBalance,
      rente,
      repaymentType,
      restLooptijd,
      isTaxDeductible,
      marginaalTarief,
      verwachtRendement: verwachtRendement / 100, // convert % to decimal
      inflatie,
      hasPartner,
      horizonJaren,
      currentAge,
      currentPortfolio,
      yearlyExpenses,
      annualSavings,
      cashflows,
    }
    return compareMortgageVsInvest(params)
  }, [
    extraBedrag, verwachtRendement, horizonJaren,
    hypotheekBalance, rente, repaymentType, restLooptijd,
    isTaxDeductible, marginaalTarief, inflatie, hasPartner,
    currentAge, currentPortfolio, yearlyExpenses, annualSavings, cashflows,
  ])

  const breakevenPct = (result.breakevenRendement * 100).toFixed(1)
  const isGelijk = result.aanbeveling === 'gelijk'

  return (
    <BottomSheet open={open} onClose={onClose} title="Hypotheek vs. Beleggen" size="xl">
      <div className="space-y-5 px-6 pb-6 pt-2">
        {/* ── Disclaimer ──────────────────────────────────────────────────── */}
        <div className="rounded-[var(--r)] border border-amber-200 bg-amber-50/60">
          <button
            onClick={() => setDisclaimerOpen(!disclaimerOpen)}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
          >
            <Info className="h-4 w-4 shrink-0 text-amber-600" />
            <span className="text-xs font-medium text-amber-800">
              Disclaimer — lees voor gebruik
            </span>
            {disclaimerOpen ? (
              <ChevronUp className="ml-auto h-3.5 w-3.5 text-amber-600" />
            ) : (
              <ChevronDown className="ml-auto h-3.5 w-3.5 text-amber-600" />
            )}
          </button>
          {disclaimerOpen && (
            <div className="border-t border-amber-200 px-4 py-3 text-xs leading-relaxed text-amber-800">
              Deze vergelijking is een <strong>vereenvoudigd model</strong> en geen financieel advies.
              De werkelijke resultaten hangen af van marktomstandigheden, belastingwijzigingen en
              persoonlijke situatie. Beleggingsrendementen zijn <strong>niet gegarandeerd</strong> en
              kunnen sterk fluctueren. Raadpleeg een financieel adviseur voor persoonlijk advies.
            </div>
          )}
        </div>

        {/* ── Sliders ─────────────────────────────────────────────────────── */}
        <div className="space-y-4 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)] p-4">
          <SliderRow
            label="Extra bedrag per maand"
            value={extraBedrag}
            min={100}
            max={2000}
            step={50}
            onChange={setExtraBedrag}
            formatValue={(v) => formatCurrency(v)}
          />
          <SliderRow
            label="Verwacht rendement"
            value={verwachtRendement}
            min={3}
            max={10}
            step={0.5}
            onChange={setVerwachtRendement}
            formatValue={(v) => `${v.toFixed(1)}%`}
          />
          <SliderRow
            label="Vergelijkingshorizon"
            value={horizonJaren}
            min={5}
            max={30}
            step={1}
            onChange={setHorizonJaren}
            formatValue={(v) => `${v} jaar`}
          />
        </div>

        {/* ── Scenario Cards ──────────────────────────────────────────────── */}
        <div className="grid gap-4 md:grid-cols-2">
          <ScenarioCard
            title="Extra aflossen"
            icon={<ShieldCheck className="h-5 w-5 text-blue-600" />}
            nettoVoordeel={result.aflossing.nettoVoordeel}
            eindwaarde={result.aflossing.eindwaarde}
            isWinner={result.aanbeveling === 'aflossen'}
            variant="aflossen"
          >
            <p className="text-[11px] leading-relaxed text-[var(--ink-3)]">
              Gegarandeerde rentebesparing
              {isTaxDeductible && <>, minus verloren hypotheekrenteaftrek</>}
            </p>
          </ScenarioCard>

          <ScenarioCard
            title="Extra beleggen"
            icon={<TrendingUp className="h-5 w-5 text-emerald-600" />}
            nettoVoordeel={result.beleggen.nettoVoordeel}
            eindwaarde={result.beleggen.eindwaarde}
            isWinner={result.aanbeveling === 'beleggen'}
            variant="beleggen"
          >
            <p className="text-[11px] leading-relaxed text-[var(--ink-3)]">
              Verwacht rendement na Box 3 belasting (onzeker)
            </p>
          </ScenarioCard>
        </div>

        {/* ── Summary metrics ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          {/* Breakeven rendement */}
          <div className="rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)] p-3">
            <div className="flex items-center gap-1.5">
              <Scale className="h-3.5 w-3.5 text-[var(--ink-3)]" />
              <p className="text-xs text-[var(--ink-3)]">Breakeven rendement</p>
            </div>
            <p className="mt-1 font-mono text-lg font-bold tabular-nums text-[var(--ink)]">
              {breakevenPct}%
            </p>
            <p className="text-[10px] leading-snug text-[var(--ink-4)]">
              Boven dit rendement wint beleggen
            </p>
          </div>

          {/* FIRE impact */}
          <div className="rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)] p-3">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-[var(--ink-3)]" />
              <p className="text-xs text-[var(--ink-3)]">FIRE-impact</p>
            </div>
            {result.fireImpactMaanden != null ? (
              <>
                <p className={`mt-1 font-mono text-lg font-bold tabular-nums ${
                  result.fireImpactMaanden > 0 ? 'text-emerald-600' : result.fireImpactMaanden < 0 ? 'text-red-500' : 'text-[var(--ink)]'
                }`}>
                  {result.fireImpactMaanden > 0 ? '+' : ''}{result.fireImpactMaanden} mnd
                </p>
                <p className="text-[10px] leading-snug text-[var(--ink-4)]">
                  {result.fireImpactMaanden > 0
                    ? 'Beleggen brengt FIRE eerder'
                    : result.fireImpactMaanden < 0
                      ? 'Aflossen brengt FIRE eerder'
                      : 'Geen verschil voor FIRE-datum'}
                </p>
              </>
            ) : (
              <>
                <p className="mt-1 text-sm text-[var(--ink-3)]">—</p>
                <p className="text-[10px] leading-snug text-[var(--ink-4)]">
                  Onvoldoende gegevens voor berekening
                </p>
              </>
            )}
          </div>
        </div>

        {/* ── Netto verschil banner ───────────────────────────────────────── */}
        {!isGelijk && (
          <div className={`rounded-[var(--r)] px-4 py-3 text-center ${
            result.verschil > 0
              ? 'bg-emerald-50 text-emerald-800'
              : 'bg-blue-50 text-blue-800'
          }`}>
            <p className="text-xs font-medium uppercase tracking-wider">
              {result.aanbeveling === 'beleggen' ? 'Beleggen wint' : 'Aflossen wint'}
            </p>
            <p className="mt-0.5 font-mono text-lg font-bold tabular-nums">
              {result.verschil > 0 ? '+' : ''}{formatCurrency(Math.abs(result.verschil))}
            </p>
            <p className="text-[11px]">netto verschil over {horizonJaren} jaar</p>
          </div>
        )}
        {isGelijk && (
          <div className="rounded-[var(--r)] bg-[var(--subtle)] px-4 py-3 text-center text-[var(--ink-2)]">
            <p className="text-xs font-medium uppercase tracking-wider">Praktisch gelijk</p>
            <p className="mt-0.5 text-sm">
              Het verschil is minder dan € 100 — kies op basis van voorkeur.
            </p>
          </div>
        )}

        {/* ── Risk warning ────────────────────────────────────────────────── */}
        <div className="flex gap-3 rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div className="text-xs leading-relaxed text-[var(--ink-3)]">
            <strong className="text-[var(--ink-2)]">Risicowaarschuwing:</strong>{' '}
            Extra aflossen levert een <strong>gegarandeerde</strong> rentebesparing op.
            Beleggen biedt een <strong>hoger verwacht rendement</strong>, maar de uitkomst
            is onzeker en kan ook negatief zijn. In het verleden behaalde resultaten
            bieden geen garantie voor de toekomst.
          </div>
        </div>

        {/* ── Yearly comparison table ─────────────────────────────────────── */}
        <JaarVergelijkingTabel result={result} />
      </div>
    </BottomSheet>
  )
}
