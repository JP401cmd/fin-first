'use client'

/**
 * HorizonYearDetailsSheet — kassabon-stijl drilldown voor één jaar in de
 * vermogensopbouw-chart op `/horizon`.
 *
 * Geïnspireerd op een vroege `YearDetailsSheet`-referentie (de doorrekening-test-
 * route is in C5-pre verwijderd), maar geconsumeerd op de bestaande
 * horizon-data-pipeline:
 *  - `unifiedRows: UnifiedProjectionRow[]` (uit `lib/unified-projection.ts`)
 *  - `simResult: SimResult` (voor fase-detectie via `runSimulation`)
 *  - `assets`, `debts`, `lifeEvents`, `cashflows`
 *
 * Geen aparte calc-pipeline; alle getallen komen kant-en-klaar uit
 * UnifiedProjectionRow.assetBuckets / debtBalances / kasstromen.
 *
 * ── Render-strategie ────────────────────────────────────────────
 *  - ShellOverlay kind="sheet" — single-context, terugkeer naar chart.
 *  - Editorial krant-stijl: Playfair headlines met italic-em, Source Serif
 *    body, DM Mono tabular-nums op bedragen, dotted borders tussen rijen,
 *    dubbele lijn als finale onder totaal-rij.
 *  - Geen "OK"-knop: standaard sluit-affordance via ShellOverlay (✕ rechts).
 *
 * ── Secties (top-down) ──────────────────────────────────────────
 *  1. Fase-badge + delta-context (deflatie-factor)
 *  2. Meta-strip: netto vermogen + PV
 *  3. Bezittingen (per asset-type, sortering op waarde)
 *  4. Schulden (per debt-rij, alleen actieve)
 *  5. Kosten en inkomsten (Box 3, sparen/onttrekken, rendement, overige cf)
 *  6. Gebeurtenissen (AOW + life events binnen [age, age+1))
 */

import { memo, useMemo, useCallback } from 'react'
import * as Lucide from 'lucide-react'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import {
  ASSET_TYPE_ICONS,
  ASSET_TYPE_LABELS,
  ASSET_TYPE_COLORS,
  type AssetType,
} from '@/lib/asset-data'
import {
  DEBT_TYPE_ICONS,
  DEBT_TYPE_LABELS,
  DEBT_TYPE_COLORS,
  type Debt,
  type DebtType,
} from '@/lib/debt-data'
import { syntheticDebtDescriptor } from '@/lib/horizon/synthetic-debts'
import type { LifeEvent } from '@/lib/horizon-data'
import type { SimCashflow, SimRow } from '@/lib/fire-simulation'
import type {
  UnifiedProjectionRow,
  AssetBucketDetail,
  WithdrawalNeedBreakdown,
} from '@/lib/unified-projection'
import { cashflowsForYear } from '@/lib/horizon/cashflows-for-year'
import { HorizonCashflowSankey } from '@/components/app/horizon/horizon-cashflow-sankey'

// ── Privacy-aware EUR-formatter (custom hook keeps the masked-toggle live) ──

function useFc() {
  const { masked } = useMaskedAmounts()
  return useCallback((v: number) => formatMaskedCurrency(v, masked), [masked])
}

// ── Helpers ───────────────────────────────────────────────────────

/** Deflateer een nominaal bedrag van toekomstige `age` terug naar `currentAge`. */
function presentValue(
  nominal: number,
  age: number,
  currentAge: number,
  inflation: number,
): number {
  const years = age - currentAge
  if (years <= 0 || inflation === 0) return nominal
  return nominal / Math.pow(1 + inflation, years)
}

function deflationFactor(years: number, inflation: number): number {
  if (years <= 0 || inflation === 0) return 1
  return 1 / Math.pow(1 + inflation, years)
}

// ── Onttrekkings-kassabon (behoefte-decompositie) ─────────────────

/** Eén kassabon-regel in de onttrekkings-behoefte-uitsplitsing. */
export interface WithdrawalReceiptLine {
  id: string
  label: string
  /** Optionele verduidelijking onder het label (bv. de dubbele-box3-duiding). */
  sublabel?: string
  /** Bijdrage aan de behoefte, mét teken (+ verhoogt, − verlaagt de behoefte). */
  signed: number
  kind: 'component' | 'total' | 'deficit'
}

/**
 * Bouwt de kassabon-regels voor de onttrekkings-behoefte-decompositie
 * (`WithdrawalNeedBreakdown`). De component-regels reconciliëren float-exact
 * naar `need.totaalNeed`; de sluitregel "Niet gedekt" (alleen in tekortjaren)
 * maakt de bon exact gelijk aan de werkelijk onttrokken `withdrawal` — het
 * getoonde bedrag op de hoofdregel:
 *   Σ component.signed === need.totaalNeed          (bridge-invariant)
 *   need.totaalNeed − need.nietGedekt === withdrawal (tekort-sluiting)
 *
 * Optionele termen (huur/hyplast/box3/partner/maandcorrectie) worden alleen
 * opgenomen wanneer ≠ 0; dat verandert de som niet (weggelaten termen zijn 0).
 */
export function buildWithdrawalReceiptLines(
  need: WithdrawalNeedBreakdown,
  withdrawal: number,
): WithdrawalReceiptLine[] {
  const lines: WithdrawalReceiptLine[] = [
    {
      id: 'uitgave',
      label: 'Basisuitgaven (geïndexeerd)',
      signed: need.uitgaveTerm,
      kind: 'component',
    },
  ]
  if (need.huurNaVerkoop !== 0) {
    lines.push({ id: 'huur', label: 'Huur na verkoop woning', signed: need.huurNaVerkoop, kind: 'component' })
  }
  if (need.vervallenHypotheeklast !== 0) {
    lines.push({
      id: 'hyplast',
      label: 'Vrijgevallen hypotheeklast',
      signed: -need.vervallenHypotheeklast,
      kind: 'component',
    })
  }
  if (need.box3 !== 0) {
    lines.push({
      id: 'box3',
      label: 'Box 3-belasting',
      sublabel: 'zelfde heffing als hierboven — hier als deel van de onttrekkingsbehoefte',
      signed: need.box3,
      kind: 'component',
    })
  }
  if (need.partnerBijdrage !== 0) {
    lines.push({ id: 'partner', label: 'Bijdrage partner', signed: -need.partnerBijdrage, kind: 'component' })
  }
  if (need.restMaandClamp !== 0) {
    lines.push({ id: 'maandcorrectie', label: 'Maandcorrectie', signed: need.restMaandClamp, kind: 'component' })
  }
  lines.push({ id: 'totaal', label: 'Behoefte-totaal', signed: need.totaalNeed, kind: 'total' })
  if (need.nietGedekt > 0.5) {
    lines.push({ id: 'niet-gedekt', label: 'Niet gedekt (tekort)', signed: -need.nietGedekt, kind: 'deficit' })
  }
  return lines
}

/** Dynamische Lucide-icon-resolver met fallback. */
function renderLucideIcon(
  name: string | undefined,
  props: { size?: number; className?: string },
) {
  if (!name) return null
  const icons = Lucide as unknown as Record<
    string,
    React.ComponentType<React.SVGProps<SVGSVGElement> & { size?: number }> | undefined
  >
  const IconComp = icons[name]
  return IconComp ? <IconComp {...props} /> : null
}

// `cashflowsForYear` is verhuisd naar `@/lib/horizon/cashflows-for-year` (puur +
// getest); het respecteert nu de `indexed`-vlag via de kernel-inflatiefactor.

// ── Sub-components ────────────────────────────────────────────────

/** UPPERCASE sectie-kicker met optioneel rechts-uitgelijnd totaalbedrag. */
function SectionHead({
  label,
  total,
  totalTone,
  totalPv,
}: {
  label: string
  total?: string
  totalTone?: 'neutral' | 'positive' | 'negative'
  totalPv?: string | null
}) {
  const toneClass =
    totalTone === 'positive'
      ? 'text-[var(--positive,#0f766e)]'
      : totalTone === 'negative'
        ? 'text-[var(--negative,#b91c1c)]'
        : 'text-[var(--ink)]'
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--border-ed)] pb-1.5">
      <h4 className="text-[10px] font-mono font-bold uppercase tracking-[0.12em] text-[var(--ink)]">
        {label}
      </h4>
      {total && (
        <div className="text-right">
          <span className={`font-mono text-sm font-semibold tabular-nums ${toneClass}`}>
            {total}
          </span>
          {totalPv && (
            <p className="mt-0.5 font-mono text-[10px] tabular-nums text-[var(--ink-3)]">
              {totalPv}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** Secundaire regel onder een bedrag: "≈ €X vandaag" deflatie-tip. */
function PvLine({
  nominal,
  age,
  currentAge,
  inflation,
}: {
  nominal: number
  age: number
  currentAge: number
  inflation: number
}) {
  const fc = useFc()
  if (age <= currentAge || inflation === 0) return null
  const pv = presentValue(nominal, age, currentAge, inflation)
  const sign = pv < 0 ? '−' : ''
  return (
    <p className="mt-0.5 text-right font-mono text-[10px] tabular-nums text-[var(--ink-3)]">
      <span aria-hidden="true">≈ </span>
      {sign}
      {fc(Math.abs(pv))}
      <span className="ml-1 text-[var(--ink-4)]">vandaag</span>
    </p>
  )
}

/**
 * Subtiele kassabon-sub-regel onder een hoofdregel — indented, dotted-left.
 * Hergebruikt voor de onttrekkings-behoefte-uitsplitsing én de per-asset-type
 * rendement-/Box 3-toerekeningen. Toont label + getekend bedrag (mono/tabular,
 * − als U+2212) + optionele "≈ vandaag"-deflatie (zelfde grondslag als PvLine).
 */
function ReceiptSubRow({
  label,
  sublabel,
  signed,
  age,
  currentAge,
  inflation,
  variant = 'component',
}: {
  label: string
  sublabel?: string
  signed: number
  age: number
  currentAge: number
  inflation: number
  variant?: 'component' | 'total' | 'deficit'
}) {
  const fc = useFc()
  const sign = signed < 0 ? '−' : '+'
  const isTotal = variant === 'total'
  const amountTone =
    variant === 'deficit'
      ? 'text-[var(--negative,#b91c1c)]'
      : isTotal
        ? 'text-[var(--ink)]'
        : 'text-[var(--ink-2)]'
  return (
    <li
      className={`flex items-start justify-between gap-3 py-1 ${
        isTotal ? 'mt-0.5 border-t border-dotted border-[var(--border-ed)]/70 pt-1.5' : ''
      }`}
    >
      <span className="min-w-0 flex-1">
        <span
          className={`block text-[11px] leading-snug ${
            isTotal ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink-3)]'
          }`}
        >
          {label}
        </span>
        {sublabel && (
          <span className="mt-0.5 block text-[10px] italic leading-snug text-[var(--ink-4)]">
            {sublabel}
          </span>
        )}
      </span>
      <div className="shrink-0 text-right">
        <span
          className={`font-mono text-[11px] tabular-nums ${isTotal ? 'font-semibold' : ''} ${amountTone}`}
        >
          <span aria-hidden="true">{sign}</span>
          {fc(Math.abs(signed))}
        </span>
        <PvLine nominal={signed} age={age} currentAge={currentAge} inflation={inflation} />
      </div>
    </li>
  )
}

/** Eén bezittings-rij: icoon + label + waarde + sub-regel met groei/bijdrage. */
function AssetTypeRow({
  type,
  endValue,
  growth,
  contributions,
  box3Drag,
  phase,
  age,
  currentAge,
  inflation,
}: {
  type: AssetType
  endValue: number
  growth: number
  contributions: number
  box3Drag: number
  phase: 'opbouw' | 'afbouw' | 'overgang'
  age: number
  currentAge: number
  inflation: number
}) {
  const fc = useFc()
  const showContribution = phase !== 'afbouw' && contributions > 0
  return (
    <li className="flex items-start justify-between gap-3 border-b border-dotted border-[var(--border-ed)]/70 py-2.5 last:border-b-0">
      <div className="flex min-w-0 items-start gap-2.5">
        <span
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `color-mix(in oklch, ${ASSET_TYPE_COLORS[type]} 18%, transparent)` }}
          aria-hidden="true"
        >
          <span style={{ color: ASSET_TYPE_COLORS[type] }}>
            {renderLucideIcon(ASSET_TYPE_ICONS[type], { size: 12 })}
          </span>
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-[var(--ink)]">
            {ASSET_TYPE_LABELS[type]}
          </p>
          {(growth !== 0 || contributions !== 0 || box3Drag !== 0) && (
            <p className="mt-1 text-[10px] text-[var(--ink-3)]">
              {showContribution && (
                <>
                  <span>+ Bijdrage </span>
                  <span className="font-mono tabular-nums">{fc(contributions)}</span>
                  {(growth !== 0 || box3Drag !== 0) && <span className="mx-1.5">·</span>}
                </>
              )}
              {growth !== 0 && (
                <>
                  <span>{growth >= 0 ? '+ Rendement ' : '− Verlies '}</span>
                  <span className="font-mono tabular-nums">{fc(Math.abs(growth))}</span>
                  {box3Drag !== 0 && <span className="mx-1.5">·</span>}
                </>
              )}
              {box3Drag !== 0 && (
                <>
                  <span>− Box 3 </span>
                  <span className="font-mono tabular-nums">{fc(Math.abs(box3Drag))}</span>
                </>
              )}
            </p>
          )}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
          {fc(endValue)}
        </p>
        <PvLine nominal={endValue} age={age} currentAge={currentAge} inflation={inflation} />
      </div>
    </li>
  )
}

/** Eén schuld-rij — toont eindsaldo + rente/aflossing dat jaar. */
/**
 * Presentatie-vorm van één schuldregel. Bewust NIET `Debt`: de rij kan ook een
 * synthetische modelpot zijn (tekort-lening/opeethypotheek) zonder databaserij.
 * `debtType` dient hier uitsluitend voor icoon + kleur.
 */
export interface DebtRowPresentation {
  name: string
  typeLabel: string
  debtType: DebtType
}

function DebtRow({
  presentation,
  endBalance,
  interestPaid,
  principalPaid,
  age,
  currentAge,
  inflation,
}: {
  presentation: DebtRowPresentation
  endBalance: number
  interestPaid: number
  principalPaid: number
  age: number
  currentAge: number
  inflation: number
}) {
  const fc = useFc()
  return (
    <li className="flex items-start justify-between gap-3 border-b border-dotted border-[var(--border-ed)]/70 py-2.5 last:border-b-0">
      <div className="flex min-w-0 items-start gap-2.5">
        <span
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `color-mix(in oklch, ${DEBT_TYPE_COLORS[presentation.debtType]} 18%, transparent)` }}
          aria-hidden="true"
        >
          <span style={{ color: DEBT_TYPE_COLORS[presentation.debtType] }}>
            {renderLucideIcon(DEBT_TYPE_ICONS[presentation.debtType], { size: 12 })}
          </span>
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-[var(--ink)]">
            {presentation.name}
          </p>
          <p className="mt-0.5 text-[10px] uppercase tracking-wider text-[var(--ink-4)]">
            {presentation.typeLabel}
          </p>
          {(principalPaid > 0 || interestPaid > 0) && (
            <p className="mt-1 text-[10px] text-[var(--ink-3)]">
              {principalPaid > 0 && (
                <>
                  <span>− Aflossing </span>
                  <span className="font-mono tabular-nums">{fc(principalPaid)}</span>
                  {interestPaid > 0 && <span className="mx-1.5">·</span>}
                </>
              )}
              {interestPaid > 0 && (
                <>
                  <span>− Rente </span>
                  <span className="font-mono tabular-nums">{fc(interestPaid)}</span>
                </>
              )}
            </p>
          )}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
          {fc(endBalance)}
        </p>
        <PvLine nominal={endBalance} age={age} currentAge={currentAge} inflation={inflation} />
      </div>
    </li>
  )
}

/** Eén kosten/inkomsten-regel — teken+kleur communiceert richting. */
function CostsRow({
  label,
  sublabel,
  amount,
  tone,
  age,
  currentAge,
  inflation,
  children,
}: {
  label: string
  sublabel?: string
  amount: number
  tone: 'expense' | 'income' | 'neutral'
  age: number
  currentAge: number
  inflation: number
  /** Optionele kassabon-uitsplitsing onder de hoofdregel (ReceiptSubRow-lijst). */
  children?: React.ReactNode
}) {
  const fc = useFc()
  const sign = amount < 0 ? '−' : amount > 0 ? '+' : ''
  const toneClass =
    tone === 'expense'
      ? 'text-[var(--negative,#b91c1c)]'
      : tone === 'income'
        ? 'text-[var(--positive,#0f766e)]'
        : 'text-[var(--ink)]'
  return (
    <li className="border-b border-dotted border-[var(--border-ed)]/70 py-2 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-[var(--ink)]">{label}</p>
          {sublabel && (
            <p className="mt-0.5 text-[10px] italic text-[var(--ink-4)]">{sublabel}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className={`font-mono text-sm font-semibold tabular-nums ${toneClass}`}>
            {sign}
            {fc(Math.abs(amount))}
          </p>
          <PvLine nominal={amount} age={age} currentAge={currentAge} inflation={inflation} />
        </div>
      </div>
      {children && (
        <ul className="mt-1.5 border-l border-[var(--border-ed)]/60 pl-3">{children}</ul>
      )}
    </li>
  )
}

/** Fase-badge in horizon-tint (opbouw) of ink-2 neutraal (afbouw/overgang). */
function PhaseBadge({ phase }: { phase: 'opbouw' | 'overgang' | 'afbouw' }) {
  const tint =
    phase === 'opbouw'
      ? 'bg-horizon-50 text-horizon-700 border-horizon-200'
      : phase === 'overgang'
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : 'bg-[var(--subtle)] text-[var(--ink-2)] border-[var(--border-ed)]'
  const dot =
    phase === 'opbouw'
      ? 'bg-horizon-500'
      : phase === 'overgang'
        ? 'bg-amber-500'
        : 'bg-[var(--ink-3)]'
  const label =
    phase === 'opbouw' ? 'Opbouw-fase' : phase === 'overgang' ? 'Overgangs-fase' : 'Afbouw-fase'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${tint}`}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`}
        aria-hidden="true"
      />
      {label}
    </span>
  )
}

/** Map unified-projection `phase` naar onze 3-stappen UI-phase. */
function unifiedToUiPhase(
  p: UnifiedProjectionRow['phase'],
): 'opbouw' | 'overgang' | 'afbouw' {
  if (p === 'accumulation') return 'opbouw'
  if (p === 'transition') return 'overgang'
  return 'afbouw'
}

// ── Main component ────────────────────────────────────────────────

export interface HorizonYearDetailsSheetProps {
  open: boolean
  onClose: () => void
  /** De geselecteerde leeftijd — `null` als geen jaar geselecteerd is. */
  age: number | null
  unifiedRows: UnifiedProjectionRow[]
  /**
   * Simulatie-rijen — vereist voor de geldstroom-Sankey-sectie. Bevatten
   * de jaarlijkse income/expense-totalen uit `runSimulation`. Wanneer leeg
   * wordt de Sankey-sectie verborgen (geen breakdown mogelijk).
   */
  simRows: SimRow[]
  currentAge: number
  inflationRate: number
  debts: Debt[]
  lifeEvents: LifeEvent[]
  cashflows: SimCashflow[]
  /** Optionele AOW-leeftijd om AOW-inkomen apart te tonen. */
  aowAge?: number
  /** Optionele FIRE-leeftijd voor Sankey-context (toont 'fire' label). */
  fireAge?: number | null
  /**
   * Callback om naar een andere leeftijd te springen. Wanneer gezet worden
   * pijl-knoppen (vorige/volgende jaar) in de sticky title-bar getoond. Bij
   * de eerste/laatste leeftijd in `simRows` wordt de relevante pijl gedimd.
   */
  onChangeAge?: (newAge: number) => void
}

export const HorizonYearDetailsSheet = memo(function HorizonYearDetailsSheet({
  open,
  onClose,
  age,
  unifiedRows,
  simRows,
  currentAge,
  inflationRate,
  debts,
  lifeEvents,
  cashflows,
  aowAge,
  fireAge,
  onChangeAge,
}: HorizonYearDetailsSheetProps) {
  const fc = useFc()

  const row = useMemo(
    () => (age != null ? unifiedRows.find(r => r.age === age) : null),
    [age, unifiedRows],
  )

  // Kalenderjaar berekenen op basis van delta. Werkt zonder dob: huidige
  // kalenderjaar + (age − currentAge) is voldoende voor de header-meta.
  const calendarYear = useMemo(() => {
    if (age == null) return null
    return new Date().getFullYear() + (age - currentAge)
  }, [age, currentAge])

  const yearsFromNow = age != null ? age - currentAge : 0
  const factor = deflationFactor(yearsFromNow, inflationRate)
  const showPv = yearsFromNow > 0 && inflationRate > 0

  // ── Asset-rijen: sorteer op eindwaarde DESC, filter <€0,50 ruis ─
  const assetRows = useMemo(() => {
    if (!row) return []
    const entries = Object.entries(row.assetBuckets) as Array<[AssetType, NonNullable<UnifiedProjectionRow['assetBuckets'][AssetType]>]>
    return entries
      .filter(([, b]) => Math.abs(b.endValue) >= 0.5)
      .sort((a, b) => b[1].endValue - a[1].endValue)
  }, [row])

  // ── Rendement per asset-type (RAUW), |bedrag| ≥ €0,50, aflopend ─────
  //
  // GRONDSLAG-SPLITSING (kassabon blijft sommeren). `totalGrowth` telt het rendement
  // van ÁLLE potten, dus ook de waardestijging van de eigen woning. Bij een
  // niet-meetellen-woonstrategie is die waardestijging géén besteedbaar inkomen (ze
  // zit niet in Prognose!J en is niet onttrekbaar) — als "Rendement portfolio" tonen
  // zou hem als bestedingsruimte laten lezen. De kernel-bridge levert daarom
  // `totalGrowthLiquide`; het verschil krijgt hier een eigen, NEUTRALE regel zodat de
  // kassabon nog steeds op `totalGrowth` sluit. Bij 'Meerekenen' (of een rij zonder
  // het veld) is het verschil 0 en is de weergave identiek aan voorheen.
  const growthLiquide = row ? row.totalGrowthLiquide ?? row.totalGrowth : 0
  const growthNietLiquide = row ? row.totalGrowth - growthLiquide : 0
  const splitGrowth = Math.abs(growthNietLiquide) >= 0.5

  const allRendementRows = useMemo(() => {
    if (!row) return []
    return (Object.entries(row.assetBuckets) as Array<[AssetType, AssetBucketDetail]>)
      .map(([type, b]) => ({ type, amount: b.growth }))
      .filter(x => Math.abs(x.amount) >= 0.5)
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
  }, [row])

  // Sub-rijen van de LIQUIDE hoofdregel: zodra we splitsen valt de eigen-woningrij
  // onder de neutrale regel hieronder — anders zou hetzelfde rendement twee keer in
  // de uitsplitsing verschijnen.
  const rendementRows = useMemo(
    () => (splitGrowth ? allRendementRows.filter(x => x.type !== 'eigen_huis') : allRendementRows),
    [allRendementRows, splitGrowth],
  )
  const woningRendementRows = useMemo(
    () => (splitGrowth ? allRendementRows.filter(x => x.type === 'eigen_huis') : []),
    [allRendementRows, splitGrowth],
  )

  // Sluitregel voor het niet-besteedbare deel — spiegelt `debtRest` hieronder.
  // De neutrale regel toont `growthNietLiquide` (= totalGrowth − totalGrowthLiquide,
  // afgeleid uit de nietLiquide-VLAG in de kernel), terwijl de sub-rijen op
  // app-`AssetType` gesleuteld zijn. Vandaag dekt `eigen_huis` dat verschil volledig
  // (de enige nietLiquide-categorie is 'Eigen huis'), maar zodra er ooit een tweede
  // niet-liquide categorie bij komt, of een sub-rij onder de €0,50-ruisfilter valt,
  // zou het restant stil tussen kop en regels verdwijnen. Bewust gerekend uit het
  // VERSCHIL kop − Σ regels, niet uit een tweede afleiding van de vlag.
  const woningRest = useMemo(
    () =>
      splitGrowth
        ? growthNietLiquide - woningRendementRows.reduce((s, x) => s + x.amount, 0)
        : 0,
    [splitGrowth, growthNietLiquide, woningRendementRows],
  )
  const showWoningRest = Math.abs(woningRest) >= 0.5

  // ── Box 3-toerekening per asset-type, |bedrag| ≥ €0,50, aflopend ────
  const box3Rows = useMemo(() => {
    if (!row) return []
    return (Object.entries(row.assetBuckets) as Array<[AssetType, AssetBucketDetail]>)
      .map(([type, b]) => ({ type, amount: b.box3Drag }))
      .filter(x => Math.abs(x.amount) >= 0.5)
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
  }, [row])

  // ── Onttrekkings-behoefte-kassabon (alleen post-FIRE behoefte-jaren) ─
  const withdrawalReceipt = useMemo(() => {
    if (!row?.withdrawalNeed || row.withdrawal <= 0) return null
    return buildWithdrawalReceiptLines(row.withdrawalNeed, row.withdrawal)
  }, [row])

  // ── Debt-rijen: alleen actief in dit jaar (saldo of aflossing/rente > 0) ─
  //
  // Dit is een KASSABON: de sectiekop toont `row.totalDebts` en de regels eronder
  // moeten daarmee reconciliëren. `debtBalances` bevat naast echte `Debt`-ids ook
  // SYNTHETISCHE modelpotten ('tekort-lening', 'opeethypotheek') die geen
  // databaserij hebben. Die eruit filteren gaf een kop van €1,12 mln boven een
  // lijst waarin dat bedrag nergens voorkwam — dus renderen we ze mee, met het
  // label uit de gedeelde map (`lib/horizon/synthetic-debts.ts`).
  const debtsById = useMemo(() => new Map(debts.map(d => [d.id, d])), [debts])
  const debtRows = useMemo(() => {
    if (!row) return []
    return Object.entries(row.debtBalances)
      .map(([id, detail]) => {
        const debt = debtsById.get(id)
        const synthetic = syntheticDebtDescriptor(id)
        const presentation: DebtRowPresentation | null = debt
          ? {
              name: debt.name || DEBT_TYPE_LABELS[debt.debt_type],
              typeLabel: DEBT_TYPE_LABELS[debt.debt_type],
              debtType: debt.debt_type,
            }
          : synthetic
            ? { name: synthetic.name, typeLabel: synthetic.typeLabel, debtType: synthetic.debtType }
            : null
        return { id, detail, presentation }
      })
      .filter(({ detail, presentation }) =>
        presentation != null &&
        (Math.abs(detail.endBalance) >= 0.5 ||
          Math.abs(detail.principalPaid) >= 0.5 ||
          Math.abs(detail.interestPaid) >= 0.5),
      ) as Array<{
        id: string
        detail: UnifiedProjectionRow['debtBalances'][string]
        presentation: DebtRowPresentation
      }>
  }, [row, debtsById])

  // Sluitregel voor sleutels die we NIET thuis kunnen brengen: geen `Debt`-rij én
  // geen bekende modelpot. Vandaag hoort dat €0 te zijn, maar een derde
  // synthetische pot die aan `SYNTHETIC_DEBT_LABELS` wordt vergeten mag nooit meer
  // stil uit de lijst verdwijnen — dan verschijnt hij als benoemde restregel in
  // plaats van als gat tussen kop en regels. Bewust gerekend uit de ONBEKENDE
  // entries, niet uit `totalDebts − Σ getoond`: dat laatste zou ook afgaan op een
  // verschil tussen kop-totaal en potten, en dat is een rekenmotor-eigenschap —
  // niet iets wat deze weergave hoort te maskeren met een restpost.
  // Drempel gelijk aan de ruisfilter hierboven, zodat afrondingscenten niets doen.
  const debtRest = useMemo(() => {
    if (!row) return 0
    let unresolved = 0
    for (const [id, detail] of Object.entries(row.debtBalances)) {
      if (debtsById.has(id) || syntheticDebtDescriptor(id) != null) continue
      unresolved += detail.endBalance
    }
    return Math.abs(unresolved) >= 0.5 ? unresolved : 0
  }, [row, debtsById])

  // ── Gebeurtenissen voor dit jaar (life events + AOW apart) ──────
  const eventBreakdown = useMemo(() => {
    if (age == null) return { aowAmount: 0, others: [] as { id: string; name: string; icon: string; amount: number }[] }
    // Geïndexeerde stromen (AOW) groeien mee met inflatie: consume de
    // kernel-inflatiefactor van dit jaar (row.inflationFactor, V14) i.p.v. een
    // eigen (1+inflatie)^t. Zo hanteert de Gebeurtenissen-sectie dezelfde
    // grondslag als de "Kosten en inkomsten"-sectie hierboven.
    const cfs = cashflowsForYear(cashflows, age, row?.inflationFactor ?? 1)
    let aowAmount = 0
    const aggregated = new Map<string, { name: string; icon: string; amount: number }>()
    for (const cf of cfs) {
      if (cf.isAow) {
        aowAmount += cf.amount
        continue
      }
      // Match cashflow back to its life-event. `lifeEventsToCashflows` genereert
      // ids in formaat `le-{type}-{ev.id}` of `le-{type}-{ev.id}-{custom}` —
      // het event-id zit ergens IN de cashflow-id, niet als prefix. Gebruik
      // includes() en match op het langste event-id eerst zodat we geen
      // sub-string-collisions krijgen tussen verschillende events.
      const sortedEvents = [...lifeEvents].sort((a, b) => b.id.length - a.id.length)
      const evt = sortedEvents.find(le => cf.id.includes(le.id))
      const key = evt?.id ?? `_unmatched:${cf.id}`
      const name = evt?.name ?? 'Overig'
      const icon = evt?.icon ?? 'Calendar'
      const prev = aggregated.get(key) ?? { name, icon, amount: 0 }
      prev.amount += cf.amount
      aggregated.set(key, prev)
    }
    const others = Array.from(aggregated.entries())
      .map(([id, val]) => ({ id, ...val }))
      .filter(e => Math.abs(e.amount) >= 0.5)
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))

    // AOW-leeftijd: als geconfigureerd én bereikt, toon vaste AOW-rij ook
    // als de cashflows-engine die niet expliciet als 'aow' tag heeft.
    if (aowAge != null && age >= Math.floor(aowAge) && aowAmount === 0) {
      // Geen extra inschatting hier — alleen zichtbaarheid als de engine
      // het toevoegt. Geen heuristische "fake" AOW-bedragen.
    }
    return { aowAmount, others }
  }, [age, cashflows, lifeEvents, aowAge, row])

  // ── Titel + delta-context ───────────────────────────────────────
  const title = useMemo(() => {
    if (age == null) return 'Jaardetail'
    const yearLabel = calendarYear ? `Jaar ${calendarYear}` : `Leeftijd ${age}`
    const delta = yearsFromNow === 0 ? 'nu' : `+${yearsFromNow}j`
    return `${yearLabel} — ${age}j (${delta})`
  }, [age, calendarYear, yearsFromNow])

  const deflationContext = showPv
    ? `Inflatie ${(inflationRate * 100).toFixed(1)}% · deflatie-factor ×${factor.toFixed(2)}`
    : yearsFromNow === 0
      ? 'Huidige waarde'
      : `${yearsFromNow} jaar van nu`

  // ── Totalen + fase
  const phase = row ? unifiedToUiPhase(row.phase) : 'opbouw'
  const netWorth = row?.netWorth ?? 0
  const totalAssets = row?.totalAssets ?? 0
  const totalDebts = row?.totalDebts ?? 0

  // ── Pijl-navigatie: vorige / volgende leeftijd binnen simRows-bereik ──
  const minNavAge = simRows[0]?.age ?? null
  const maxNavAge = simRows[simRows.length - 1]?.age ?? null
  const canPrev = onChangeAge != null && age != null && minNavAge != null && age > minNavAge
  const canNext = onChangeAge != null && age != null && maxNavAge != null && age < maxNavAge
  const headerActions = onChangeAge != null && age != null ? (
    <div className="flex items-center gap-0.5" role="group" aria-label="Navigeer tussen jaren">
      <button
        type="button"
        onClick={() => canPrev && onChangeAge(age - 1)}
        disabled={!canPrev}
        aria-label="Vorig jaar"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <Lucide.ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => canNext && onChangeAge(age + 1)}
        disabled={!canNext}
        aria-label="Volgend jaar"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <Lucide.ChevronRight className="h-4 w-4" />
      </button>
    </div>
  ) : undefined

  return (
    <ShellOverlay open={open} onClose={onClose} kind="sheet" size="md" title={title} actions={headerActions}>
      <article className="px-5 pb-6 pt-2 sm:px-7">
        {/* ── Editorial kicker met streep + fase-badge ────────────── */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--ink-3)]">
            <span
              aria-hidden
              className="inline-block h-px w-7 shrink-0"
              style={{ background: 'var(--color-horizon-500)' }}
            />
            Kassabon · {age != null ? `${age} jaar` : '—'}
          </div>
          {row && <PhaseBadge phase={phase} />}
        </div>

        <p className="mb-4 text-[11px] italic text-[var(--ink-3)]">
          {deflationContext}
        </p>

        {/* ── Meta-strip: netto vermogen (hoofdcijfer + PV) ─────── */}
        <div className="mb-5 flex items-baseline justify-between gap-3 border-t border-b border-[var(--ink)] py-3">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--ink-3)]">
              Netto vermogen
            </p>
            <p className="mt-0.5 font-mono text-[10px] tabular-nums text-[var(--ink-3)]">
              <span aria-hidden="true">+ </span>
              {fc(totalAssets)}
              <span className="text-[var(--ink-4)]"> bezittingen</span>
              <span className="mx-1" aria-hidden="true">·</span>
              <span aria-hidden="true">− </span>
              {fc(totalDebts)}
              <span className="text-[var(--ink-4)]"> schulden</span>
            </p>
          </div>
          <div className="text-right">
            <p
              className="font-mono text-xl font-bold tabular-nums tracking-[-0.01em] text-[var(--ink)]"
              style={{
                background:
                  'linear-gradient(transparent 60%, var(--color-horizon-200) 60%)',
                display: 'inline-block',
                paddingLeft: '0.15em',
                paddingRight: '0.15em',
              }}
            >
              {fc(netWorth)}
            </p>
            <PvLine
              nominal={netWorth}
              age={age ?? currentAge}
              currentAge={currentAge}
              inflation={inflationRate}
            />
          </div>
        </div>

        {row == null ? (
          <p className="text-sm italic text-[var(--ink-3)]">
            Geen data voor dit jaar.
          </p>
        ) : (
          <div className="space-y-6">
            {/* ── Sectie 1: Bezittingen ─────────────────────────── */}
            <section>
              <SectionHead
                label="Opbouw — bezittingen"
                total={fc(totalAssets)}
                totalPv={
                  showPv
                    ? `≈ ${fc(presentValue(totalAssets, age!, currentAge, inflationRate))} vandaag`
                    : null
                }
              />
              {assetRows.length === 0 ? (
                <p className="mt-3 text-sm italic text-[var(--ink-3)]">
                  Geen bezittingen op deze leeftijd.
                </p>
              ) : (
                <ul className="mt-1">
                  {assetRows.map(([type, bucket]) => (
                    <AssetTypeRow
                      key={type}
                      type={type}
                      endValue={bucket.endValue}
                      growth={bucket.growth}
                      contributions={bucket.contributions}
                      box3Drag={bucket.box3Drag}
                      phase={phase}
                      age={age!}
                      currentAge={currentAge}
                      inflation={inflationRate}
                    />
                  ))}
                </ul>
              )}
            </section>

            {/* ── Sectie 2: Schulden ───────────────────────────── */}
            {(debtRows.length > 0 || debtRest !== 0) && (
              <section>
                <SectionHead
                  label="Schulden"
                  total={fc(totalDebts)}
                  totalTone="negative"
                  totalPv={
                    showPv
                      ? `≈ ${fc(presentValue(totalDebts, age!, currentAge, inflationRate))} vandaag`
                      : null
                  }
                />
                <ul className="mt-1">
                  {debtRows.map(({ id, detail, presentation }) => (
                    <DebtRow
                      key={id}
                      presentation={presentation}
                      endBalance={detail.endBalance}
                      interestPaid={detail.interestPaid}
                      principalPaid={detail.principalPaid}
                      age={age!}
                      currentAge={currentAge}
                      inflation={inflationRate}
                    />
                  ))}
                  {debtRest !== 0 && (
                    <DebtRow
                      presentation={{ name: 'Overige schulden', typeLabel: 'Overig', debtType: 'other' }}
                      endBalance={debtRest}
                      interestPaid={0}
                      principalPaid={0}
                      age={age!}
                      currentAge={currentAge}
                      inflation={inflationRate}
                    />
                  )}
                </ul>
              </section>
            )}

            {/* ── Sectie 3: Kosten en inkomsten ─────────────────── */}
            <section>
              <SectionHead label="Kosten en inkomsten" />
              <ul className="mt-1">
                {row.totalBox3 > 0 && (
                  <CostsRow
                    label="Box 3-belasting"
                    sublabel="fictief rendement × tarief · toerekening per bezitting"
                    amount={-row.totalBox3}
                    tone="expense"
                    age={age!}
                    currentAge={currentAge}
                    inflation={inflationRate}
                  >
                    {box3Rows.length > 0
                      ? box3Rows.map(({ type, amount }) => (
                          <ReceiptSubRow
                            key={type}
                            label={ASSET_TYPE_LABELS[type]}
                            signed={-amount}
                            age={age!}
                            currentAge={currentAge}
                            inflation={inflationRate}
                          />
                        ))
                      : undefined}
                  </CostsRow>
                )}
                {(phase === 'opbouw' || phase === 'overgang') && row.savings > 0 && (
                  <CostsRow
                    label="Spaarquote-bijdrage"
                    sublabel="vanuit inkomen naar bezittingen"
                    amount={row.savings}
                    tone="income"
                    age={age!}
                    currentAge={currentAge}
                    inflation={inflationRate}
                  />
                )}
                {row.withdrawal > 0 && (
                  <CostsRow
                    label="Onttrekking uit portfolio"
                    sublabel="dekt jaarlijkse uitgaven na FIRE"
                    amount={-row.withdrawal}
                    tone="expense"
                    age={age!}
                    currentAge={currentAge}
                    inflation={inflationRate}
                  >
                    {withdrawalReceipt?.map(line => (
                      <ReceiptSubRow
                        key={line.id}
                        label={line.label}
                        sublabel={line.sublabel}
                        signed={line.signed}
                        variant={line.kind}
                        age={age!}
                        currentAge={currentAge}
                        inflation={inflationRate}
                      />
                    ))}
                  </CostsRow>
                )}
                {Math.abs(growthLiquide) >= 0.5 && (
                  <CostsRow
                    label={growthLiquide >= 0 ? 'Rendement portfolio' : 'Verlies portfolio'}
                    sublabel={
                      splitGrowth
                        ? 'rauw rendement per vermogenstype (besteedbaar deel)'
                        : 'rauw rendement per vermogenstype'
                    }
                    amount={growthLiquide}
                    tone={growthLiquide >= 0 ? 'income' : 'expense'}
                    age={age!}
                    currentAge={currentAge}
                    inflation={inflationRate}
                  >
                    {rendementRows.length > 0
                      ? rendementRows.map(({ type, amount }) => (
                          <ReceiptSubRow
                            key={type}
                            label={ASSET_TYPE_LABELS[type]}
                            signed={amount}
                            age={age!}
                            currentAge={currentAge}
                            inflation={inflationRate}
                          />
                        ))
                      : undefined}
                  </CostsRow>
                )}
                {splitGrowth && (
                  <CostsRow
                    label={
                      growthNietLiquide >= 0
                        ? 'Waardestijging eigen woning (niet besteedbaar)'
                        : 'Waardedaling eigen woning (niet besteedbaar)'
                    }
                    sublabel={
                      growthNietLiquide >= 0
                        ? 'verhoogt je vermogen, niet je bestedingsruimte'
                        : 'verlaagt je vermogen, niet je bestedingsruimte'
                    }
                    amount={growthNietLiquide}
                    tone="neutral"
                    age={age!}
                    currentAge={currentAge}
                    inflation={inflationRate}
                  >
                    {woningRendementRows.length > 0 || showWoningRest ? (
                      <>
                        {woningRendementRows.map(({ type, amount }) => (
                          <ReceiptSubRow
                            key={type}
                            label={ASSET_TYPE_LABELS[type]}
                            signed={amount}
                            age={age!}
                            currentAge={currentAge}
                            inflation={inflationRate}
                          />
                        ))}
                        {showWoningRest && (
                          <ReceiptSubRow
                            label="Overig niet-besteedbaar"
                            signed={woningRest}
                            age={age!}
                            currentAge={currentAge}
                            inflation={inflationRate}
                          />
                        )}
                      </>
                    ) : undefined}
                  </CostsRow>
                )}
                {row.cashflowNet !== 0 && (
                  <CostsRow
                    label="Overige cashflows"
                    sublabel="recurring life-events (excl. AOW)"
                    amount={row.cashflowNet}
                    tone={row.cashflowNet >= 0 ? 'income' : 'expense'}
                    age={age!}
                    currentAge={currentAge}
                    inflation={inflationRate}
                  />
                )}
                {row.oneTimeNet !== 0 && (
                  <CostsRow
                    label="Eenmalige cashflows"
                    sublabel="erfenis, verkoop, eenmalige uitgave"
                    amount={row.oneTimeNet}
                    tone={row.oneTimeNet >= 0 ? 'income' : 'expense'}
                    age={age!}
                    currentAge={currentAge}
                    inflation={inflationRate}
                  />
                )}
              </ul>
            </section>

            {/* ── Sectie 4: Gebeurtenissen ──────────────────────── */}
            {(eventBreakdown.aowAmount > 0 || eventBreakdown.others.length > 0) && (
              <section>
                <SectionHead label="Gebeurtenissen" />
                <ul className="mt-1">
                  {eventBreakdown.aowAmount > 0 && (
                    <li className="flex items-start justify-between gap-3 border-b border-dotted border-[var(--border-ed)]/70 py-2 last:border-b-0">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-horizon-50 text-horizon-700"
                          aria-hidden="true"
                        >
                          {renderLucideIcon('Shield', { size: 12 })}
                        </span>
                        <p className="truncate text-[13px] font-medium text-[var(--ink)]">
                          AOW-uitkering
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-mono text-sm font-semibold tabular-nums text-[var(--positive,#0f766e)]">
                          +{fc(eventBreakdown.aowAmount)}
                        </p>
                        <PvLine
                          nominal={eventBreakdown.aowAmount}
                          age={age!}
                          currentAge={currentAge}
                          inflation={inflationRate}
                        />
                      </div>
                    </li>
                  )}
                  {eventBreakdown.others.map(evt => (
                    <li
                      key={evt.id}
                      className="flex items-start justify-between gap-3 border-b border-dotted border-[var(--border-ed)]/70 py-2 last:border-b-0"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--subtle)] text-[var(--ink-2)]"
                          aria-hidden="true"
                        >
                          {renderLucideIcon(evt.icon, { size: 12 })}
                        </span>
                        <p className="truncate text-[13px] font-medium text-[var(--ink)]">
                          {evt.name}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p
                          className={`font-mono text-sm font-semibold tabular-nums ${
                            evt.amount > 0
                              ? 'text-[var(--positive,#0f766e)]'
                              : 'text-[var(--negative,#b91c1c)]'
                          }`}
                        >
                          {evt.amount > 0 ? '+' : '−'}
                          {fc(Math.abs(evt.amount))}
                        </p>
                        <PvLine
                          nominal={evt.amount}
                          age={age!}
                          currentAge={currentAge}
                          inflation={inflationRate}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* ── Sectie 5: Geldstroom-Sankey ──────────────────────
                Visualisatie van inkomsten- en uitgaven-bronnen voor dit
                specifieke jaar. `embedded`-modus verbergt de slider — de
                drilldown context (jaar/leeftijd) wordt al elders in de
                sheet duidelijk gecommuniceerd. */}
            {simRows.length > 0 && age != null && (
              <section className="pt-1">
                <SectionHead label="Geldstroom" />
                <div className="mt-2">
                  <HorizonCashflowSankey
                    simRows={simRows}
                    unifiedRows={unifiedRows}
                    debts={debts}
                    currentAge={currentAge}
                    fireAge={fireAge}
                    year={age}
                    embedded
                  />
                </div>
              </section>
            )}

            {/* ── Finale: dubbele lijn als kassabon-sluiting ───── */}
            <div className="flex items-baseline justify-between gap-3 border-b-4 border-double border-[var(--ink)] pb-1.5 pt-2">
              <p className="text-[10px] font-mono font-bold uppercase tracking-[0.12em] text-[var(--ink)]">
                Eind netto
              </p>
              <p className="font-mono text-base font-bold tabular-nums text-[var(--ink)]">
                {fc(netWorth)}
              </p>
            </div>

            {/* Ornament-colophon */}
            <p className="pt-2 text-center text-[10px] italic text-[var(--ink-4)]">
              Trifinity ✦ Horizon ✦ Jaar {calendarYear}
            </p>
          </div>
        )}
      </article>
    </ShellOverlay>
  )
})
