'use client'

/**
 * YearDetailsSheet — jaar-detail drilldown voor een enkele kolom van de
 * opbouw-/afbouw-samenstelling chart op `/horizon/doorrekening-test/overzicht`.
 *
 * Fase G5: deze sheet is **fase-aware**. Input is één `HybridYearRow` +
 * `assetMeta` + `debtMeta` uit `computeHybridProjection()` — alle getallen
 * die we tonen komen rechtstreeks uit die rij; er wordt geen math meer op
 * zakelijke bedragen gedaan behalve de display-deflatie voor "≈ vandaag".
 *
 * ── Verantwoordelijkheid ─────────────────────────────────────────────────
 * Puur presentatie. Voor elk veld:
 *   - Bezittingen → `row.perAssetValues[i]` + deltas uit
 *     `perAssetContribution[i]` / `perAssetGrowth[i]` / `perAssetWithdrawal[i]`.
 *   - Schulden → `row.perDebtValues[i]` + `perDebtInterest[i]` /
 *     `perDebtRepayment[i]`.
 *   - Kosten/inkomsten → `box3TaxThisYear`, `savingsInflowThisYear` (opbouw),
 *     `withdrawalThisYear` (afbouw), `portfolioGrowthThisYear`,
 *     `eventCashflowNetThisYear`.
 *   - Events → gefilterd uit de optionele `cashflows`/`lifeEvents` props
 *     puur voor per-event display. AOW-events komen uit
 *     `aowIncomeThisYear` en worden expliciet getoond.
 *
 * De virtuele savings-asset (`assetMeta[i].isVirtualSavings === true`) wordt
 * altijd als eerste rij in de Bezittingen-sectie getoond.
 *
 * ── Design language (TriFinity / Editorial Finance) ─────────────────────
 *  - Scherpe hoeken, geen `rounded-*` (behalve `rounded-full` voor
 *    icon-containers). Krant-esthetiek.
 *  - Sectie-kickers: UPPERCASE, 10-11px, letter-spacing 0.08em.
 *  - Alle bedragen `font-mono tabular-nums`, `formatCurrency` uit `@/lib/format`.
 *  - Fase-badge: opbouw = horizon-tint, afbouw = ink-2 neutraal.
 *  - Geen verticale borders — alleen horizontale `border-b`.
 *
 * ── Toegankelijkheid ────────────────────────────────────────────────────
 * `BottomSheet` levert het dialog-shell + focus-trap + ESC + backdrop-close.
 * Bedragen met +/− zijn zowel kleur als teken — nooit alleen kleur.
 *
 * ── Data-testids ────────────────────────────────────────────────────────
 *   year-details-sheet, year-details-assets, year-details-debts,
 *   year-details-costs, year-details-events, year-details-event-{idx},
 *   year-details-phase-badge, year-details-deflation-context
 */

import { memo, useMemo, useCallback } from 'react'
import * as Lucide from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'

/** Masked-aware EUR formatter hook used across this sheet. */
function useFc() {
  const { masked } = useMaskedAmounts()
  return useCallback((v: number) => formatMaskedCurrency(v, masked), [masked])
}
import { ASSET_TYPE_ICONS, ASSET_TYPE_LABELS } from '@/lib/asset-data'
import type { AssetType } from '@/lib/asset-data'
import { DEBT_TYPE_ICONS, DEBT_TYPE_LABELS } from '@/lib/debt-data'
import type { DebtType } from '@/lib/debt-data'
import type { LifeEvent } from '@/lib/horizon-data'
import type { SimCashflow } from '@/lib/fire-simulation'
import type {
  HybridAssetMeta,
  HybridDebtMeta,
  HybridYearRow,
} from '../calc/hybrid-projection'

// ── Props ──────────────────────────────────────────────────────────────

/**
 * Props-contract (Fase G5): de sheet leest uit de hybride rij zelf. Oude
 * props (`assets`, `debts`, `opbouw`, `isPostFire`, `yearlyRetirementExpenses`)
 * zijn vervallen — alle daarvan afgeleide waarden zitten nu in `row`.
 *
 * `lifeEvents` en `cashflows` zijn **display-only**: we doen er geen nieuwe
 * sommatie op — puur filtering naar het jaar-venster voor de event-lijst.
 * Het is in de praktijk de enige manier om per-event labels + iconen weer
 * te geven zonder die info in `HybridYearRow` op te nemen (zou een
 * G3-wijziging zijn die we nu niet doen).
 */
export interface YearDetailsSheetProps {
  open: boolean
  onClose: () => void
  /**
   * De hybride rij voor dit jaar. `null` wanneer `open=false` of de chart
   * nog geen rij heeft geresolvd — in dat geval rendert de sheet een lege
   * placeholder en blijft de rest van de UI functioneel.
   */
  row: HybridYearRow | null
  /** Asset-metadata met stabiele index-volgorde die matcht met `row.perAssetValues`. */
  assetMeta: HybridAssetMeta[]
  /** Debt-metadata met stabiele index-volgorde die matcht met `row.perDebtValues`. */
  debtMeta: HybridDebtMeta[]
  /** Huidige leeftijd van de gebruiker (bron voor deflatie-berekening). */
  currentAge: number
  /** Jaarlijkse inflatiefactor — bv. `0.025` voor 2.5%. */
  inflationRate: number
  /** Kalenderjaar van `row.age`, door de caller berekend. */
  calendarYear: number
  /**
   * Optionele cashflows voor event-display. Wanneer afwezig of leeg
   * verbergt de events-sectie (tenzij er AOW-inkomen is — die wordt altijd
   * getoond op basis van `row.aowIncomeThisYear`).
   */
  cashflows?: SimCashflow[]
  /** Optionele life-events — voor naam/icoon-lookup in de event-rijen. */
  lifeEvents?: LifeEvent[]
}

// ── Hulptypes + helpers ────────────────────────────────────────────────

/**
 * Deflateer een nominaal bedrag van een toekomstig `age` terug naar
 * `currentAge` (vandaag) via een vaste jaarlijkse inflatie.
 *
 * Dit is de ENIGE plek in de sheet waar we rekenen — en alleen voor
 * display (present value). Alle zakelijke getallen komen kant-en-klaar
 * uit `HybridYearRow` binnen.
 *
 * Edge-cases die GEEN deflatie doen:
 *  - `age <= currentAge` (jaar is nu of verleden → nominaal = PV).
 *  - `inflation === 0` (geen waarde-erosie → nominaal = PV).
 */
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

/**
 * Deflatie-factor zelf — `1 / (1 + inflation)^years`. Los exposed zodat de
 * header-context-regel een "×0.54"-label kan tonen naast de PV-som.
 */
function deflationFactor(years: number, inflation: number): number {
  if (years <= 0 || inflation === 0) return 1
  return 1 / Math.pow(1 + inflation, years)
}

/**
 * PresentValueLine — subtiele secundaire regel onder een nominaal bedrag,
 * bijvoorbeeld "≈ € 53.939 vandaag". Rendert niets wanneer er geen zinvolle
 * deflatie is (years = 0 of inflation = 0).
 */
function PresentValueLine({
  nominal,
  age,
  currentAge,
  inflation,
  align = 'right',
  className = '',
}: {
  nominal: number
  age: number
  currentAge: number
  inflation: number
  align?: 'left' | 'right'
  className?: string
}) {
  const fc = useFc()
  if (age <= currentAge || inflation === 0) return null
  const pv = presentValue(nominal, age, currentAge, inflation)
  const sign = pv < 0 ? '−' : ''
  return (
    <p
      className={`mt-0.5 font-mono text-[10px] tabular-nums text-[var(--ink-3)] ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${className}`.trim()}
    >
      <span aria-hidden="true">≈ </span>
      {sign}
      {fc(Math.abs(pv))}
      <span className="ml-1 text-[var(--ink-4)]">vandaag</span>
    </p>
  )
}

/**
 * Lucide icon-lookup + render in één helper. Render inline i.p.v. een
 * component-referentie teruggeven zodat we geen "component created during
 * render" lint-flag oplopen.
 */
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

/**
 * Resolve icon-naam uit asset-meta. Virtueel savings-asset krijgt
 * `PiggyBank` — matcht de savings-asset-type-icon en onderscheidt zich
 * visueel van regular cash-assets.
 */
function iconForAssetMeta(meta: HybridAssetMeta): string {
  if (meta.isVirtualSavings) return 'PiggyBank'
  const type = meta.asset_type as AssetType
  return ASSET_TYPE_ICONS[type] ?? 'Briefcase'
}

/**
 * Label voor het asset-type (gelokaliseerd). Virtueel savings-asset toont
 * "Spaarquote" in plaats van de letterlijke asset_type.
 */
function typeLabelForAssetMeta(meta: HybridAssetMeta): string {
  if (meta.isVirtualSavings) return 'Spaarquote'
  const type = meta.asset_type as AssetType
  return ASSET_TYPE_LABELS[type] ?? String(meta.asset_type ?? 'Overig')
}

function iconForDebtMeta(meta: HybridDebtMeta): string {
  const type = meta.debt_type as DebtType
  return DEBT_TYPE_ICONS[type] ?? 'CircleDot'
}

function typeLabelForDebtMeta(meta: HybridDebtMeta): string {
  const type = meta.debt_type as DebtType
  return DEBT_TYPE_LABELS[type] ?? String(meta.debt_type ?? 'Overig')
}

/**
 * Filter cashflows op het één-jaar-venster `[yearStartAge, yearStartAge+1)`.
 * Geen inflatie-indexering, geen sommatie naar totalen: de sheet gebruikt
 * dit alleen om per-event labels en bedragen te tonen.
 */
function cashflowsForYear(
  cashflows: SimCashflow[],
  yearStartAge: number,
  yearEndAge: number,
): Map<string, number> {
  const result = new Map<string, number>()
  for (const cf of cashflows) {
    let delta = 0
    if (cf.type === 'one_time') {
      if (cf.fromAge >= yearStartAge && cf.fromAge < yearEndAge) {
        delta = cf.amount * (cf.direction === 'income' ? 1 : -1)
      }
    } else {
      const cfEnd = cf.toAge ?? Number.POSITIVE_INFINITY
      const overlapStart = Math.max(cf.fromAge, yearStartAge)
      const overlapEnd = Math.min(cfEnd, yearEndAge)
      if (overlapStart < overlapEnd) {
        const months = Math.round((overlapEnd - overlapStart) * 12)
        const monthly = cf.amount
        const total = monthly * months * (cf.direction === 'income' ? 1 : -1)
        delta = total
      }
    }
    if (delta !== 0) {
      const existing = result.get(cf.id) ?? 0
      result.set(cf.id, existing + delta)
    }
  }
  return result
}

/**
 * Detecteer of een cashflow-id een AOW-cashflow is. Matcht op de stabiele
 * prefix `le-aow-` uit `lifeEventsToCashflows`, op `__aow` uit
 * `ensureAowCashflow`, of op expliciete event-ids uit AOW life-events.
 *
 * We filteren AOW uit de event-sectie omdat die al als aparte rij getoond
 * wordt op basis van `row.aowIncomeThisYear` — zo voorkomen we
 * dubbele rendering van hetzelfde bedrag.
 */
function isAowCashflowId(cfId: string, aowEventIds: string[]): boolean {
  if (cfId.startsWith('le-aow-')) return true
  if (cfId === '__aow') return true
  for (const aowId of aowEventIds) {
    if (cfId.includes(aowId)) return true
  }
  return false
}

// ── Compact sub-components ─────────────────────────────────────────────

/**
 * SectieKicker — uniforme kop voor elke sectie binnen de sheet.
 */
function SectieKicker({
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
      <h4 className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ink)]">
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

/**
 * Eén bezittings-rij in de Bezittingen-sectie. Fase-afhankelijk: in opbouw
 * tonen we contribution + growth, in afbouw withdrawal + growth. Een kleur-
 * swatch naast het icoon matcht met de legend van de compositie-chart.
 */
function AssetPhaseRow({
  meta,
  endValue,
  growth,
  contribution,
  withdrawal,
  phase,
  age,
  currentAge,
  inflation,
}: {
  meta: HybridAssetMeta
  endValue: number
  growth: number
  contribution: number
  withdrawal: number
  phase: 'opbouw' | 'afbouw'
  age: number
  currentAge: number
  inflation: number
}) {
  const fc = useFc()
  const iconName = iconForAssetMeta(meta)
  const typeLabel = typeLabelForAssetMeta(meta)
  return (
    <li className="flex items-start justify-between gap-3 border-b border-[var(--border-ed)]/60 py-2.5 last:border-b-0">
      <div className="flex min-w-0 items-start gap-2.5">
        <span
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--ink-3)]"
          style={{ backgroundColor: `${meta.color}1a` }}
          aria-hidden="true"
        >
          {renderLucideIcon(iconName, { size: 12 })}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--ink)]">
            {meta.label}
          </p>
          <p className="mt-0.5 text-[10px] uppercase tracking-wider text-[var(--ink-4)]">
            {typeLabel}
          </p>
          {phase === 'opbouw' ? (
            <p className="mt-1 text-[10px] text-[var(--ink-3)]">
              <span>+ Bijdrage </span>
              <span className="font-mono tabular-nums">{fc(contribution)}</span>
              <span className="mx-1.5">·</span>
              <span>+ Rendement </span>
              <span className="font-mono tabular-nums">{fc(growth)}</span>
            </p>
          ) : (
            <p className="mt-1 text-[10px] text-[var(--ink-3)]">
              <span>− Onttrekking </span>
              <span className="font-mono tabular-nums">{fc(withdrawal)}</span>
              <span className="mx-1.5">·</span>
              <span>+ Rendement </span>
              <span className="font-mono tabular-nums">{fc(growth)}</span>
            </p>
          )}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
          {fc(endValue)}
        </p>
        <PresentValueLine
          nominal={endValue}
          age={age}
          currentAge={currentAge}
          inflation={inflation}
        />
      </div>
    </li>
  )
}

/**
 * Eén schuld-rij in de Schulden-sectie. Toont eind-saldo + rente/aflossing
 * in de delta-regel. Volledig afgeloste schulden worden door de parent
 * gefilterd (de rij wordt dus niet aangeroepen voor een 0-saldo).
 */
function DebtPhaseRow({
  meta,
  endBalance,
  interest,
  repayment,
  age,
  currentAge,
  inflation,
}: {
  meta: HybridDebtMeta
  endBalance: number
  interest: number
  repayment: number
  age: number
  currentAge: number
  inflation: number
}) {
  const fc = useFc()
  const iconName = iconForDebtMeta(meta)
  const typeLabel = typeLabelForDebtMeta(meta)
  return (
    <li className="flex items-start justify-between gap-3 border-b border-[var(--border-ed)]/60 py-2.5 last:border-b-0">
      <div className="flex min-w-0 items-start gap-2.5">
        <span
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--negative,#b91c1c)]"
          style={{ backgroundColor: `${meta.color}1a` }}
          aria-hidden="true"
        >
          {renderLucideIcon(iconName, { size: 12 })}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--ink)]">
            {meta.label}
          </p>
          <p className="mt-0.5 text-[10px] uppercase tracking-wider text-[var(--ink-4)]">
            {typeLabel}
          </p>
          <p className="mt-1 text-[10px] text-[var(--ink-3)]">
            <span>− Aflossing </span>
            <span className="font-mono tabular-nums">{fc(repayment)}</span>
            <span className="mx-1.5">·</span>
            <span>+ Rente </span>
            <span className="font-mono tabular-nums">{fc(interest)}</span>
          </p>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
          {fc(endBalance)}
        </p>
        <PresentValueLine
          nominal={endBalance}
          age={age}
          currentAge={currentAge}
          inflation={inflation}
        />
      </div>
    </li>
  )
}

/**
 * CostsRow — één regel in de Kosten-en-inkomsten sectie. Gebruikt voor
 * Box 3, spaarquote-inleg, onttrekking, rendement en overige cashflows.
 *
 * `amount` is het nominale bedrag (incl. teken); we tonen `|amount|` met
 * een expliciet `+`/`−` prefix zodat kleur en symbool samen de richting
 * communiceren (a11y: nooit alleen kleur).
 */
function CostsRow({
  label,
  sublabel,
  amount,
  tone,
  age,
  currentAge,
  inflation,
}: {
  label: string
  sublabel?: string
  amount: number
  tone: 'expense' | 'income' | 'neutral'
  age: number
  currentAge: number
  inflation: number
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
    <li className="flex items-start justify-between gap-3 border-b border-[var(--border-ed)]/60 py-2 last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--ink)]">{label}</p>
        {sublabel && (
          <p className="mt-0.5 text-[10px] text-[var(--ink-4)]">{sublabel}</p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className={`font-mono text-sm font-semibold tabular-nums ${toneClass}`}>
          {sign}
          {fc(Math.abs(amount))}
        </p>
        <PresentValueLine
          nominal={amount}
          age={age}
          currentAge={currentAge}
          inflation={inflation}
        />
      </div>
    </li>
  )
}

/**
 * Fase-badge onder de titel. Twee varianten:
 *  - Opbouw → horizon-goud tint, signaleert groeiende fase
 *  - Afbouw → ink-2 neutraal, signaleert onttrekkende fase
 */
function PhaseBadge({ phase }: { phase: 'opbouw' | 'afbouw' }) {
  const isOpbouw = phase === 'opbouw'
  return (
    <span
      data-testid="year-details-phase-badge"
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${
        isOpbouw
          ? 'bg-horizon-50 text-horizon-700'
          : 'bg-[var(--subtle)] text-[var(--ink-2)]'
      }`}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          isOpbouw ? 'bg-horizon-500' : 'bg-[var(--ink-3)]'
        }`}
        aria-hidden="true"
      />
      {isOpbouw ? 'Opbouw-fase' : 'Afbouw-fase'}
    </span>
  )
}

// ── Main component ─────────────────────────────────────────────────────

export const YearDetailsSheet = memo(function YearDetailsSheet({
  open,
  onClose,
  row,
  assetMeta,
  debtMeta,
  currentAge,
  inflationRate,
  calendarYear,
  cashflows = [],
  lifeEvents = [],
}: YearDetailsSheetProps) {
  const fc = useFc()
  // Leeftijd voor deflatie-context; valt terug op currentAge als row null is
  // zodat de "Huidige waarde"-regel altijd zinvol is.
  const age = row?.age ?? currentAge
  const years = age - currentAge
  const factor = deflationFactor(years, inflationRate)
  const showPv = years > 0 && inflationRate > 0

  // AOW-event-ids verzamelen om deze uit de event-sectie te filteren
  // (AOW-inkomen wordt apart getoond op basis van `row.aowIncomeThisYear`).
  const aowEventIds = useMemo(
    () =>
      lifeEvents
        .filter((ev) => ev.event_type === 'aow' && ev.is_active !== false)
        .map((ev) => ev.id),
    [lifeEvents],
  )

  // ── Sorteer asset-meta: virtuele savings eerst, daarna echte assets ──
  // Behoudt stabiele indexing voor perAssetValues-lookup via `origIdx`.
  const sortedAssetEntries = useMemo(
    () =>
      assetMeta
        .map((meta, origIdx) => ({ meta, origIdx }))
        .sort((a, b) => {
          if (a.meta.isVirtualSavings && !b.meta.isVirtualSavings) return -1
          if (!a.meta.isVirtualSavings && b.meta.isVirtualSavings) return 1
          return a.origIdx - b.origIdx
        }),
    [assetMeta],
  )

  // Asset-rijen met amount > 0.5 (filter ruis bij afgeloste/lege assets).
  const visibleAssetEntries = useMemo(() => {
    if (!row) return []
    return sortedAssetEntries.filter(({ origIdx }) => {
      const v = row.perAssetValues[origIdx] ?? 0
      return Math.abs(v) >= 0.5
    })
  }, [sortedAssetEntries, row])

  const assetTotal = row?.assets ?? 0

  // ── Debt-rijen: filter volledig afgeloste + geen activiteit ──
  const visibleDebtEntries = useMemo(() => {
    if (!row) return []
    return debtMeta
      .map((meta, origIdx) => ({ meta, origIdx }))
      .filter(({ origIdx }) => {
        const value = row.perDebtValues[origIdx] ?? 0
        const interest = row.perDebtInterest[origIdx] ?? 0
        const repayment = row.perDebtRepayment[origIdx] ?? 0
        return (
          Math.abs(value) >= 0.5 ||
          Math.abs(interest) >= 0.5 ||
          Math.abs(repayment) >= 0.5
        )
      })
  }, [debtMeta, row])

  const debtTotal = row?.debts ?? 0

  // ── Event-rijen: gefilterd op jaar, AOW uitgefilterd ──
  const eventRows = useMemo(() => {
    if (!row) return []
    const byId = cashflowsForYear(cashflows, row.age, row.age + 1)
    if (byId.size === 0) return []
    const aggregated = new Map<string, { amount: number; event: LifeEvent | null }>()
    for (const [cfId, amount] of byId.entries()) {
      // AOW filter — getoond als aparte rij op basis van row.aowIncomeThisYear.
      if (isAowCashflowId(cfId, aowEventIds)) continue
      const matched = lifeEvents.find((ev) => cfId.startsWith(ev.id))
      const key = matched ? matched.id : `_unmatched:${cfId}`
      const prev = aggregated.get(key) ?? { amount: 0, event: matched ?? null }
      prev.amount += amount
      aggregated.set(key, prev)
    }
    return Array.from(aggregated.entries())
      .map(([key, val]) => ({
        eventId: key,
        eventName: val.event?.name ?? 'Overig',
        icon: val.event?.icon ?? 'Calendar',
        amount: val.amount,
      }))
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
  }, [row, cashflows, lifeEvents, aowEventIds])

  // ── Deflatie-context-regel ─────────────────────────────────────────
  const deflationContextLabel = showPv
    ? `Inflatie ${(inflationRate * 100).toFixed(1)}% · ${years} jaar van nu · deflatie-factor ×${factor.toFixed(2)}`
    : years === 0
      ? 'Huidige waarde'
      : `${years} jaar van nu · deflatie niet actief`

  // ── Samenvattingswaarden voor de meta-strip ─────────────────────────
  const netWorth = row?.netWorth ?? 0
  const phase = row?.phase ?? 'opbouw'

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={`Jaar ${calendarYear} — ${age}j`}
      size="lg"
    >
      <div data-testid="year-details-sheet" className="px-5 pb-6 pt-3">
        {/* ── Fase-badge + deflatie-context ─────────────────────── */}
        <div className="mb-4 flex items-center gap-2">
          {row && <PhaseBadge phase={phase} />}
          <p
            data-testid="year-details-deflation-context"
            className="text-[11px] tracking-wide text-[var(--ink-3)]"
          >
            {deflationContextLabel}
          </p>
        </div>

        {/* ── Meta-strip: netto vermogen dit jaar ────────────────── */}
        <div className="mb-4 flex items-baseline justify-between gap-3 border-b border-[var(--border-ed)] pb-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-4)]">
              Netto vermogen
            </p>
            <p className="mt-0.5 text-[10px] italic text-[var(--ink-3)]">
              na cumulatieve Box 3
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
              {fc(netWorth)}
            </p>
            <PresentValueLine
              nominal={netWorth}
              age={age}
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
            <section data-testid="year-details-assets">
              <SectieKicker
                label="Bezittingen"
                total={fc(assetTotal)}
                totalPv={
                  showPv
                    ? `≈ ${fc(presentValue(assetTotal, age, currentAge, inflationRate))} vandaag`
                    : null
                }
              />
              {visibleAssetEntries.length === 0 ? (
                <p className="mt-3 text-sm italic text-[var(--ink-3)]">
                  Geen bezittingen vastgelegd.
                </p>
              ) : (
                <ul className="mt-1">
                  {visibleAssetEntries.map(({ meta, origIdx }) => (
                    <AssetPhaseRow
                      key={meta.id}
                      meta={meta}
                      endValue={row.perAssetValues[origIdx] ?? 0}
                      growth={row.perAssetGrowth[origIdx] ?? 0}
                      contribution={row.perAssetContribution[origIdx] ?? 0}
                      withdrawal={row.perAssetWithdrawal[origIdx] ?? 0}
                      phase={row.phase}
                      age={row.age}
                      currentAge={currentAge}
                      inflation={inflationRate}
                    />
                  ))}
                </ul>
              )}
            </section>

            {/* ── Sectie 2: Schulden ───────────────────────────── */}
            {visibleDebtEntries.length > 0 && (
              <section data-testid="year-details-debts">
                <SectieKicker
                  label="Schulden"
                  total={fc(debtTotal)}
                  totalTone="negative"
                  totalPv={
                    showPv
                      ? `≈ ${fc(presentValue(debtTotal, age, currentAge, inflationRate))} vandaag`
                      : null
                  }
                />
                <ul className="mt-1">
                  {visibleDebtEntries.map(({ meta, origIdx }) => (
                    <DebtPhaseRow
                      key={meta.id}
                      meta={meta}
                      endBalance={row.perDebtValues[origIdx] ?? 0}
                      interest={row.perDebtInterest[origIdx] ?? 0}
                      repayment={row.perDebtRepayment[origIdx] ?? 0}
                      age={row.age}
                      currentAge={currentAge}
                      inflation={inflationRate}
                    />
                  ))}
                </ul>
              </section>
            )}

            {/* ── Sectie 3: Kosten en inkomsten ────────────────── */}
            <section data-testid="year-details-costs">
              <SectieKicker label="Kosten en inkomsten" />
              <ul className="mt-1">
                {/* Box 3 — uitgave, filter 0 */}
                {row.box3TaxThisYear > 0 && (
                  <CostsRow
                    label="Box 3 belasting"
                    sublabel="fictief rendement × tarief"
                    amount={-row.box3TaxThisYear}
                    tone="expense"
                    age={row.age}
                    currentAge={currentAge}
                    inflation={inflationRate}
                  />
                )}
                {/* Spaarquote-bijdrage — alleen in opbouw, > 0 */}
                {row.phase === 'opbouw' && row.savingsInflowThisYear > 0 && (
                  <CostsRow
                    label="Jaarlijkse bijdrage uit spaarquote"
                    sublabel="uit inkomen naar bezittingen"
                    amount={row.savingsInflowThisYear}
                    tone="income"
                    age={row.age}
                    currentAge={currentAge}
                    inflation={inflationRate}
                  />
                )}
                {/* Onttrekking — alleen in afbouw, > 0 */}
                {row.phase === 'afbouw' && row.withdrawalThisYear > 0 && (
                  <CostsRow
                    label="Onttrekking uit portfolio"
                    sublabel="dekt jaarlijkse uitgaven na FIRE"
                    amount={-row.withdrawalThisYear}
                    tone="expense"
                    age={row.age}
                    currentAge={currentAge}
                    inflation={inflationRate}
                  />
                )}
                {/* Rendement over portfolio — positief, filter 0 */}
                {row.portfolioGrowthThisYear > 0 && (
                  <CostsRow
                    label="Rendement over portfolio"
                    sublabel="gewogen groei over alle assets"
                    amount={row.portfolioGrowthThisYear}
                    tone="income"
                    age={row.age}
                    currentAge={currentAge}
                    inflation={inflationRate}
                  />
                )}
                {/* Overige cashflow-events (excl. AOW) — teken gevolgd */}
                {row.eventCashflowNetThisYear !== 0 && (
                  <CostsRow
                    label="Overige cashflows"
                    sublabel="som van events (excl. AOW)"
                    amount={row.eventCashflowNetThisYear}
                    tone={row.eventCashflowNetThisYear > 0 ? 'income' : 'expense'}
                    age={row.age}
                    currentAge={currentAge}
                    inflation={inflationRate}
                  />
                )}
              </ul>
            </section>

            {/* ── Sectie 4: Gebeurtenissen ─────────────────────── */}
            {(row.aowIncomeThisYear > 0 || eventRows.length > 0) && (
              <section data-testid="year-details-events">
                <SectieKicker label="Gebeurtenissen" />
                <ul className="mt-1">
                  {/* AOW-rij: altijd zichtbaar wanneer AOW-inkomen > 0 */}
                  {row.aowIncomeThisYear > 0 && (
                    <li
                      data-testid="year-details-event-aow"
                      className="flex items-start justify-between gap-3 border-b border-[var(--border-ed)]/60 py-2 last:border-b-0"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-horizon-50 text-horizon-700"
                          aria-hidden="true"
                        >
                          {renderLucideIcon('Shield', { size: 12 })}
                        </span>
                        <p className="truncate text-sm font-medium text-[var(--ink)]">
                          AOW-uitkering
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-mono text-sm font-semibold tabular-nums text-[var(--positive,#0f766e)]">
                          +{fc(row.aowIncomeThisYear)}
                        </p>
                        <PresentValueLine
                          nominal={row.aowIncomeThisYear}
                          age={row.age}
                          currentAge={currentAge}
                          inflation={inflationRate}
                        />
                      </div>
                    </li>
                  )}
                  {/* Overige life-events — gefilterd op dit jaar, AOW uitgesloten */}
                  {eventRows.map((evt, idx) => (
                    <li
                      key={evt.eventId}
                      data-testid={`year-details-event-${idx}`}
                      className="flex items-start justify-between gap-3 border-b border-[var(--border-ed)]/60 py-2 last:border-b-0"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--subtle)] text-sm"
                          aria-hidden="true"
                        >
                          {evt.icon}
                        </span>
                        <p className="truncate text-sm font-medium text-[var(--ink)]">
                          {evt.eventName}
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
                        <PresentValueLine
                          nominal={evt.amount}
                          age={row.age}
                          currentAge={currentAge}
                          inflation={inflationRate}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </BottomSheet>
  )
})
