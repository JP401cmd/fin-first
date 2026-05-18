'use client'

import { useMemo, useState } from 'react'
import {
  ASSET_TYPE_COLORS,
  ASSET_TYPE_ICONS,
  ASSET_TYPE_LABELS,
  type AssetType,
} from '@/lib/asset-data'
import {
  DEBT_TYPE_COLORS,
  DEBT_TYPE_ICONS,
  DEBT_TYPE_LABELS,
  type DebtType,
} from '@/lib/debt-data'
import type { CorePageData } from '@/lib/core-data-loader'
import { useFeatureAccess } from '@/components/app/feature-access-provider'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { QuickAddWizard } from '@/components/app/quick-add-wizard/quick-add-wizard'
import type { QuickAddIntent } from '@/lib/quick-add/types'
import { MaskedAmount } from '@/components/app/masked-amount'
import { computeHealthScoreFromInputs, type HealthScore, type HealthPillar } from '@/lib/financial-health'
import { GlossaryTerm, PageInfoButton } from '@/components/editorial'
import { PAGE_INFO } from '@/lib/page-info-content'
import { CoreHero } from './core-hero'
import { CashflowHeroTile } from './cashflow-hero-tile'
import { NetWorthProjectionChart } from './net-worth-projection-chart'
import { SectionHeader } from './section-header'
import { CategoryCard, type CategorySegment } from './category-card'
import { AddCategoryCard } from './add-category-card'
import {
  findDeepenings,
  countTrackedItems,
  getDeepeningSlug,
} from './category-deepening-registry'
import { buildKpiContext } from '@/lib/kpi-context'
import {
  computeAssetCategoryKpis,
  computeDebtCategoryKpis,
} from '@/lib/category-kpi'
import type { KpiPair } from '@/lib/asset-kpi'

// ── Types ────────────────────────────────────────────────────

interface CoreLandingProps {
  initialData: CorePageData
}

interface AssetCategoryGroup {
  type: AssetType
  total: number
  count: number
  segments: CategorySegment[]
}

interface DebtCategoryGroup {
  type: DebtType
  total: number
  count: number
  segments: CategorySegment[]
}

// ── FIRE snapshot — exact dezelfde formule als Horizon ───────
//
// Het doelbedrag wordt 1-op-1 berekend met `computeFireTarget` +
// `computeEffectiveExpenses`, dezelfde primitives die `horizon-client.tsx`
// (regel 663-667) en `dashboard-data-loader.ts` (regel 514-518) gebruiken.
// Hiermee tonen Kern, Horizon en Dashboard hetzelfde target — afronding
// op honderdtallen daargelaten.
//
// De projectie (jaren tot vrijheid + freedom year) blijft een eenvoudige
// real-return iteratie; voor de hero-strip volstaat dat. De volle
// `computeFireProjection` heeft `dateOfBirth` + `monthlyContributions` nodig
// en zou hier alleen extra coupling met de horizon-data-shape opleveren.

interface FireSnapshot {
  target: number
  yearsToFreedom: number | null
  freedomYear: number | null
}

function computeFireSnapshot(data: CorePageData): FireSnapshot {
  // Real return: zelfde formule als Horizon's hsRealReturn + de loader.
  const realReturn =
    (1 + data.fireParams.grossReturn) /
      (1 + data.fireParams.inflationRate) -
    1

  // ── Doelbedrag: één bron van waarheid ─────────────────────────
  // Horizon's `useHorizonFireSim` schrijft het volledig berekende
  // `requiredFirePortfolio` (uit de unified projection) naar
  // `net_worth_snapshots.fire_portfolio_required`. Dat is de canonieke
  // waarde die de gebruiker in Horizon ziet — Kern moet exact dezelfde
  // tonen, geen lokale benadering die ervan afwijkt.
  const target = data.fireTargetFromHorizon ?? 0

  if (target <= 0) {
    return { target: 0, yearsToFreedom: null, freedomYear: null }
  }

  const netWorth = data.rawFinancials.totalAssets - data.rawFinancials.totalDebts
  const monthlySavings = data.rawFinancials.monthlyIncome - data.rawFinancials.monthlyExpenses

  // Al voorbij de finish-lijn — direct vrij.
  if (netWorth >= target) {
    return { target, yearsToFreedom: 0, freedomYear: new Date().getFullYear() }
  }

  // Geen positieve spaarstroom én onder target = onbereikbaar.
  if (monthlySavings <= 0) {
    return { target, yearsToFreedom: null, freedomYear: null }
  }

  const monthlyReturn = realReturn / 12
  let projected = netWorth
  let months = 0
  while (projected < target && months < 600) {
    projected = projected * (1 + monthlyReturn) + monthlySavings
    months++
  }

  if (months >= 600) {
    return { target, yearsToFreedom: null, freedomYear: null }
  }

  const years = Math.max(0, Math.round(months / 12))
  const freedomYear = new Date().getFullYear() + years
  return { target, yearsToFreedom: years, freedomYear }
}

// ── Helpers: byType groupering ───────────────────────────────

/**
 * Groepeer actieve assets per `asset_type`. Per groep wordt een mini stacked
 * bar opgebouwd uit de 4 grootste items, met overige items in een "rest"
 * segment. Bedragen worden gewogen met `net_worth_inclusion_pct`.
 */
function groupAssetsByType(data: CorePageData): AssetCategoryGroup[] {
  const groups = new Map<
    AssetType,
    { type: AssetType; items: { id: string; value: number }[] }
  >()

  for (const asset of data.fullAssets) {
    if (!asset.is_active) continue
    const type = asset.asset_type
    const weight = (asset.net_worth_inclusion_pct ?? 100) / 100
    const value = Number(asset.current_value) * weight
    if (value <= 0) continue
    const bucket = groups.get(type) ?? { type, items: [] }
    bucket.items.push({ id: asset.id, value })
    groups.set(type, bucket)
  }

  // Cash van bankrekeningen (zonder linked_asset) — voeg toe aan de cash-groep
  // zodat onbevonden bank-saldi zichtbaar zijn op de Kern-landing.
  const unlinkedCashTotal = data.cashAccounts
    .filter((c) => c.source === 'bank')
    .reduce((sum, c) => sum + c.balance, 0)
  if (unlinkedCashTotal > 0) {
    const cashBucket = groups.get('cash') ?? { type: 'cash' as const, items: [] }
    cashBucket.items.push({ id: 'unlinked-bank-cash', value: unlinkedCashTotal })
    groups.set('cash', cashBucket)
  }

  return Array.from(groups.values()).map((bucket) => {
    const total = bucket.items.reduce((s, i) => s + i.value, 0)
    const segments = buildTopSegments(
      bucket.items,
      ASSET_TYPE_COLORS[bucket.type],
    )
    return {
      type: bucket.type,
      total,
      count: bucket.items.length,
      segments,
    }
  })
}

function groupDebtsByType(data: CorePageData): DebtCategoryGroup[] {
  const groups = new Map<
    DebtType,
    { type: DebtType; items: { id: string; value: number }[] }
  >()

  for (const debt of data.fullDebts) {
    if (!debt.is_active) continue
    const type = debt.debt_type
    const weight = (debt.net_worth_inclusion_pct ?? 100) / 100
    const value = Number(debt.current_balance) * weight
    if (value <= 0) continue
    const bucket = groups.get(type) ?? { type, items: [] }
    bucket.items.push({ id: debt.id, value })
    groups.set(type, bucket)
  }

  return Array.from(groups.values()).map((bucket) => {
    const total = bucket.items.reduce((s, i) => s + i.value, 0)
    const segments = buildTopSegments(
      bucket.items,
      DEBT_TYPE_COLORS[bucket.type],
    )
    return {
      type: bucket.type,
      total,
      count: bucket.items.length,
      segments,
    }
  })
}

/**
 * Bouw maximaal 4 segmenten + 1 rest-segment voor de mini stacked-bar.
 * Alle segmenten gebruiken dezelfde basis-kleur (uit `ASSET_TYPE_COLORS`)
 * met afnemende opacity, zodat de bar visueel rustig blijft.
 */
function buildTopSegments(
  items: { id: string; value: number }[],
  baseColor: string,
): CategorySegment[] {
  const sorted = [...items].sort((a, b) => b.value - a.value)
  const top = sorted.slice(0, 4)
  const rest = sorted.slice(4)
  const restValue = rest.reduce((s, i) => s + i.value, 0)

  const result: CategorySegment[] = top.map((item, idx) => ({
    key: item.id,
    value: item.value,
    color: applyAlpha(baseColor, 1 - idx * 0.18),
  }))
  if (restValue > 0) {
    result.push({
      key: '__rest__',
      value: restValue,
      color: applyAlpha(baseColor, 0.2),
    })
  }
  return result
}

/**
 * Voeg alpha toe aan een kleur-string voor de mini-bar gradient.
 *
 * Werkt voor zowel hex (`#rrggbb` / `#abc`) als modern OKLCH (`oklch(L C H)`)
 * en RGB-functioneel. Voor non-hex kleuren gebruiken we `color-mix()` —
 * goed ondersteund in alle moderne browsers en transparant zonder
 * channel-manipulatie. Onbekende formaten worden ongewijzigd teruggegeven
 * zodat we nooit een renderable kleur ongeldig maken.
 */
function applyAlpha(color: string, alpha: number): string {
  const clamped = Math.max(0, Math.min(1, alpha))

  // Hex-pad — directe channel-append, geen browser-helper nodig.
  if (color.startsWith('#') && (color.length === 7 || color.length === 4)) {
    const a = Math.round(clamped * 255)
      .toString(16)
      .padStart(2, '0')
    const hex =
      color.length === 4
        ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
        : color
    return `${hex}${a}`
  }

  // OKLCH/RGB/HSL functioneel — laat de browser de menging doen via
  // `color-mix()`. Werkt cross-format en respecteert OKLCH lightness.
  const pct = Math.round(clamped * 100)
  return `color-mix(in oklch, ${color} ${pct}%, transparent)`
}

// ── Main component ───────────────────────────────────────────

/**
 * De nieuwe Kern-landing — pure registratie van bezittingen en schulden,
 * gegroepeerd per categorie. Vervangt de god component `core-client.tsx`
 * voor de `/core` route.
 *
 * Architectuur:
 * - Hero (`<CoreHero />`) toont netto vermogen + delta + bezittingen/schulden
 *   + FIRE-strip. Geen module-flags op het hero-niveau zelf — alleen de
 *   FIRE-strip reageert op `toekomstplannen` (intern, via tip-strip fallback).
 * - Twee secties (`<SectionHeader />` + grid met `<CategoryCard />`).
 * - `[+]` knop opent `<QuickAddWizard />` met de juiste initial intent.
 * - Klik op het hero-bedrag opent een bondige netto-vermogen-kassabon.
 */
export function CoreLanding({ initialData }: CoreLandingProps) {
  const { activeModules } = useFeatureAccess()
  const toekomstActive = activeModules.includes('toekomstplannen')

  const [showNetWorthReceipt, setShowNetWorthReceipt] = useState(false)
  const [showHealthReceipt, setShowHealthReceipt] = useState(false)
  const [quickAddIntent, setQuickAddIntent] = useState<QuickAddIntent | null>(null)

  const fireSnapshot = useMemo(() => computeFireSnapshot(initialData), [initialData])

  // ── Gezondheidsscore: zelfde 6-pilaren berekening als de dashboard-widget ──
  // Gebruikt `computeHealthScoreFromInputs` (lichtgewicht variant) met inputs
  // afgeleid uit CorePageData zodat de hero-score overeenkomt met de widget.
  const healthScore = useMemo((): HealthScore => {
    const { rawFinancials, fullAssets, savingsRate6m, fireTargetFromHorizon } = initialData
    const netWorth = rawFinancials.totalAssets - rawFinancials.totalDebts

    // Noodfonds-dekking: liquid assets (cash + savings) / maanduitgaven
    // Zelfde definitie als dashboard-data-loader: cash- en savings-type assets
    // plus ontkoppelde bankrekeningen.
    const liquidAssets = fullAssets
      .filter(a => a.is_active && (a.asset_type === 'cash' || a.asset_type === 'savings'))
      .reduce((s, a) => s + Number(a.current_value), 0)
      + initialData.cashAccounts.filter(c => c.source === 'bank').reduce((s, c) => s + c.balance, 0)
    const monthlyExp = rawFinancials.monthlyExpenses
    const emergencyFundMonths = monthlyExp > 0 ? liquidAssets / monthlyExp : 0

    // FIRE-voortgang percentage
    const fireTarget = fireTargetFromHorizon ?? 0
    const freedomPct = fireTarget > 0 ? (netWorth / fireTarget) * 100 : 0

    // Unieke asset-types voor diversificatie
    const assetTypeCount = new Set(
      fullAssets.filter(a => a.is_active && Number(a.current_value) > 0).map(a => a.asset_type),
    ).size

    // Budget-categorieën voor discipline
    // `overviewBudgetGroups` bevat alleen parents (BudgetWithChildren) —
    // children zitten in `b.children`, niet als losse entries.
    const budgetCategories = initialData.overviewBudgetGroups
      .filter(b => b.budget_type === 'expense')
      .map(b => {
        const kids = b.children ?? []
        const limit = kids.length > 0
          ? kids.reduce((s, c) => s + Number(c.default_limit), 0)
          : Number(b.default_limit)
        const spent = kids.length > 0
          ? kids.reduce((s, c) => s + (initialData.overviewSpending[c.id] ?? 0), 0)
          : (initialData.overviewSpending[b.id] ?? 0)
        return { limit, spent }
      })

    return computeHealthScoreFromInputs(
      {
        savingsRate6m,
        totalAssets: rawFinancials.totalAssets,
        totalDebts: rawFinancials.totalDebts,
        emergencyFundMonths: Math.round(emergencyFundMonths * 10) / 10,
        freedomPct,
        assetTypeCount,
        budgetCategories,
      },
      initialData.budgetingActive,
      activeModules,
    )
  }, [initialData, activeModules])

  const assetGroups = useMemo(() => groupAssetsByType(initialData), [initialData])
  const debtGroups = useMemo(() => groupDebtsByType(initialData), [initialData])

  // Asset-groepen worden op `/core` als één gecombineerde lijst gerenderd
  // (inclusief eigen_huis). De AssetGroup-typering in lib/asset-data.ts
  // blijft bestaan voor het vermogen-rapport en andere consumers die wél
  // op groep-niveau willen splitsen.

  // ── Samengestelde KPI's per categorie ───────────────────────
  // Eén context-build per render — de helper bouwt 3 Maps (holdings per
  // asset, linked-asset waarde per debt, linked-debt balans per asset) die
  // de aggregator-functies hergebruiken voor elke categorie.
  const kpiCtx = useMemo(
    () =>
      buildKpiContext({
        assets: initialData.fullAssets,
        debts: initialData.fullDebts,
        holdings: initialData.rawHoldings,
        cashStatsByAssetId: initialData.cashStatsByAssetId,
      }),
    [
      initialData.fullAssets,
      initialData.fullDebts,
      initialData.rawHoldings,
      initialData.cashStatsByAssetId,
    ],
  )

  const assetCategoryKpis = useMemo(() => {
    const map = new Map<string, KpiPair>()
    for (const group of assetGroups) {
      const items = initialData.fullAssets.filter(
        (a) => a.is_active && a.asset_type === group.type,
      )
      if (items.length === 0) continue
      map.set(group.type, computeAssetCategoryKpis(items, group.type, kpiCtx.asset))
    }
    return map
  }, [assetGroups, initialData.fullAssets, kpiCtx.asset])

  const debtCategoryKpis = useMemo(() => {
    const map = new Map<string, KpiPair>()
    for (const group of debtGroups) {
      const items = initialData.fullDebts.filter(
        (d) => d.is_active && d.debt_type === group.type,
      )
      if (items.length === 0) continue
      map.set(group.type, computeDebtCategoryKpis(items, group.type, kpiCtx.debt))
    }
    return map
  }, [debtGroups, initialData.fullDebts, kpiCtx.debt])

  const totalAssets = initialData.rawFinancials.totalAssets
  const totalDebts = initialData.rawFinancials.totalDebts
  const netWorth = totalAssets - totalDebts

  // Tellingen voor de drie kolommen onderaan de hero. We tellen actieve
  // assets/debts inclusief ontkoppelde bankrekeningen die als cash gelden.
  const assetCount = useMemo(() => {
    const fromAssets = initialData.fullAssets.filter((a) => a.is_active).length
    const fromBankAccounts = initialData.cashAccounts.filter(
      (c) => c.source === 'bank',
    ).length
    return fromAssets + fromBankAccounts
  }, [initialData.fullAssets, initialData.cashAccounts])

  const debtCount = useMemo(
    () => initialData.fullDebts.filter((d) => d.is_active).length,
    [initialData.fullDebts],
  )

  return (
    <div className="mx-auto max-w-6xl">
      {/* Editorial opening — blueprint Type 1 (Module-landing) zonder begroeting.
          Welkom-strip leeft op /will (de ingang); /core is een functionele
          registratie-pagina met een neutrale kicker. */}
      <header className="relative px-4 pt-5 sm:px-6 sm:pt-8 mb-6 space-y-2">
        <PageInfoButton
          description={PAGE_INFO['/core']}
          className="absolute right-4 top-5 sm:right-6 sm:top-8"
        />
        <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)]">
          <span
            aria-hidden
            className="inline-block h-px w-7 shrink-0"
            style={{ background: 'var(--module-active-500)' }}
          />
          Kern · vermogen &amp; schulden
        </div>
        <h1
          className="font-bold leading-tight tracking-[-0.02em] text-[28px] sm:text-[36px]"
          style={{ fontFamily: 'var(--font-playfair, serif)' }}
        >
          Hoe staat je{' '}
          <em
            className="font-normal italic"
            style={{ color: 'var(--module-active-700)' }}
          >
            vermogen
          </em>
          ?
        </h1>
      </header>

      {/* Hero — vol-bleed boven, dan inset content.
          De tijdslijn (NetWorthProjectionChart) is embedded in de hero naast
          de gezondheidsscore — de twee visuele ankers van Kern:
          score (hoe gezond) + tijdslijn (waar naartoe). */}
      <CoreHero
        netWorth={netWorth}
        totalAssets={totalAssets}
        totalDebts={totalDebts}
        assetCount={assetCount}
        debtCount={debtCount}
        yearlyMustExpenses={initialData.rawFinancials.yearlyMustExpenses}
        snapshots={initialData.snapshots}
        toekomstActive={toekomstActive}
        fireTarget={fireSnapshot.target}
        healthScore={healthScore}
        onShowNetWorthReceipt={() => setShowNetWorthReceipt(true)}
        onShowHealthReceipt={() => setShowHealthReceipt(true)}
        timelineSlot={
          <NetWorthProjectionChart
            currentAge={initialData.currentAge}
            aowAge={initialData.aowAge}
            netWorth={netWorth}
            monthlySavings={
              initialData.rawFinancials.monthlyIncome -
              initialData.rawFinancials.monthlyExpenses
            }
            grossReturn={initialData.fireParams.grossReturn}
            inflationRate={initialData.fireParams.inflationRate}
            fireTarget={fireSnapshot.target > 0 ? fireSnapshot.target : undefined}
            inline
          />
        }
      />

      {/* Cashflow hero-tegel — budgetstatus in het status-gebied */}
      <CashflowHeroTile
        budgetCount={initialData.budgetCount}
        overBudgetCount={initialData.overBudgetCount}
        totalBudgetLimit={initialData.totalBudgetLimit}
        totalBudgetSpent={initialData.totalBudgetSpent}
        budgetingActive={initialData.budgetingActive}
      />

      {/* === Bezittingen — full-bleed sectie, gelijk aan hero ====== */}
      {/*
        Alle asset-groepen (inclusief eigen_huis) staan in één gecombineerde
        lijst. De AssetGroup-typering blijft bestaan in de data-laag voor
        het vermogen-rapport, maar visueel op /core is er één eenduidige
        Bezittingen-sectie.
      */}
      <section className="border-b border-[var(--border-ed)] bg-[var(--paper)]">
        <div className="px-4 py-6 sm:px-6 sm:py-8">
          <SectionHeader
            kicker="Bezittingen"
            allHref="/core/assets"
            allLabel="Alle"
          />

          {assetGroups.length > 0 ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {assetGroups.map((group, idx) => {
                // Multi-app: een categorie kan meerdere registry-entries
                // hebben. Voor MVP tonen we precies één strip op de Kern-
                // landing — anders wordt de kaart visueel overladen. We
                // kiezen de eerste entry uit de registry-volgorde; toekomstige
                // iteraties kunnen eventueel een gestapelde strip overwegen.
                const deepenings = findDeepenings(group.type, 'asset')
                const primaryDeepening = deepenings[0]
                const moduleActive = primaryDeepening
                  ? activeModules.includes(primaryDeepening.moduleId)
                  : false
                const groupAssets = initialData.fullAssets.filter(
                  (a) => a.is_active && a.asset_type === group.type,
                )
                const tracked =
                  countTrackedItems(group.type, 'asset', groupAssets)?.tracked ??
                  0
                return (
                  <CategoryCard
                    key={group.type}
                    iconName={ASSET_TYPE_ICONS[group.type]}
                    label={ASSET_TYPE_LABELS[group.type]}
                    total={group.total}
                    count={group.count}
                    meta={`${group.count} item${group.count === 1 ? '' : 's'}`}
                    segments={group.segments}
                    categoryKpis={assetCategoryKpis.get(group.type)}
                    sparklineValues={initialData.categorySparklines[`asset:${group.type}`]}
                    href={`/core/assets/${group.type}`}
                    staggerIndex={idx}
                    variant="asset"
                    appStrip={
                      primaryDeepening
                        ? {
                            appLabel: primaryDeepening.label,
                            moduleActive,
                            trackedCount: tracked,
                            totalCount: groupAssets.length,
                            tabHref: `/core/assets/${group.type}?tab=${getDeepeningSlug(primaryDeepening)}`,
                          }
                        : undefined
                    }
                  />
                )
              })}
              <AddCategoryCard
                label="Bezitting toevoegen"
                onClick={() => setQuickAddIntent('asset')}
                variant="asset"
                staggerIndex={assetGroups.length}
                ariaLabel="Nieuwe bezitting toevoegen"
              />
            </div>
          ) : (
            <EmptyAssetsState onClick={() => setQuickAddIntent('asset')} />
          )}
        </div>
      </section>

      {/* === Schulden — full-bleed sectie, gelijk aan hero ========= */}
      <section className="border-b border-[var(--border-ed)] bg-[var(--paper)]">
        <div className="px-4 py-6 sm:px-6 sm:py-8">
          <SectionHeader
            kicker="Schulden"
            allHref="/core/debts"
            allLabel="Alle"
          />

          {debtGroups.length > 0 ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {debtGroups.map((group, idx) => (
                <CategoryCard
                  key={group.type}
                  iconName={DEBT_TYPE_ICONS[group.type]}
                  label={DEBT_TYPE_LABELS[group.type]}
                  total={group.total}
                  count={group.count}
                  meta={`${group.count} item${group.count === 1 ? '' : 's'}`}
                  segments={group.segments}
                  categoryKpis={debtCategoryKpis.get(group.type)}
                  sparklineValues={initialData.categorySparklines[`debt:${group.type}`]}
                  href={`/core/debts/${group.type}`}
                  staggerIndex={idx}
                  variant="debt"
                />
              ))}
              <AddCategoryCard
                label="Schuld toevoegen"
                onClick={() => setQuickAddIntent('debt')}
                variant="debt"
                staggerIndex={debtGroups.length}
                ariaLabel="Nieuwe schuld toevoegen"
              />
            </div>
          ) : (
            <EmptyDebtsState onClick={() => setQuickAddIntent('debt')} />
          )}
        </div>
      </section>

      {/* Quick-add wizard — opent vanuit beide [+]-knoppen. */}
      <QuickAddWizard
        open={quickAddIntent !== null}
        onClose={() => setQuickAddIntent(null)}
        initialIntent={quickAddIntent ?? undefined}
      />

      {/* Netto-vermogen kassabon */}
      <BottomSheet
        open={showNetWorthReceipt}
        onClose={() => setShowNetWorthReceipt(false)}
        title="Netto vermogen"
        size="md"
      >
        <NetWorthKassabon
          assetsList={initialData.assetsList}
          debtsList={initialData.debtsList}
          totalAssets={totalAssets}
          totalDebts={totalDebts}
          netWorth={netWorth}
        />
      </BottomSheet>

      {/* Gezondheidsscore drill-down kassabon */}
      <BottomSheet
        open={showHealthReceipt}
        onClose={() => setShowHealthReceipt(false)}
        title="Financiële Gezondheid"
        size="md"
      >
        <HealthScoreKassabon healthScore={healthScore} />
      </BottomSheet>
    </div>
  )
}

// ── Empty states ─────────────────────────────────────────────

/**
 * First-use empty state voor bezittingen. Naast de standaard kicker en CTA
 * geven we een korte how-to: wat tel je mee, en hoe je het toevoegt. Dit
 * is bewust een uitgebreidere body dan een gewone empty state — het
 * eerste-gebruik-moment is meteen de onboarding.
 */
function EmptyAssetsState({ onClick }: { onClick: () => void }) {
  return (
    <div className="mx-auto mt-6 max-w-2xl border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/40 px-6 py-10 text-center sm:px-10">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-3)]">
        Begin bij wat je bezit
      </p>
      <p className="mt-3 font-serif text-xl italic text-[var(--ink)] sm:text-2xl">
        Voeg je eerste bezitting toe.
      </p>
      <p className="mx-auto mt-4 max-w-lg font-serif text-base leading-relaxed text-[var(--ink-2)]">
        Een bankrekening, je woning, beleggingen, een voertuig of een
        levensverzekering — alles wat waarde voor je heeft. Klik op{' '}
        <span className="font-semibold text-[var(--ink)]">Voeg bezitting toe</span>{' '}
        en de wizard helpt je stap voor stap. Je kunt het altijd later bewerken
        of meer toevoegen.
      </p>
      <button
        type="button"
        onClick={onClick}
        className="mt-6 inline-flex h-11 items-center gap-2 border border-kern-300 bg-kern-50 px-5 text-sm font-medium text-kern-700 transition-colors hover:bg-kern-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
      >
        Voeg bezitting toe
      </button>
    </div>
  )
}

/**
 * Empty state voor schulden — dubbele framing.
 *
 * Schuldenvrij is een sterke financiële positie en mag gevierd worden, maar
 * de afwezigheid van schulden kan ook gewoon "nog niet geregistreerd"
 * betekenen. We geven beide lezingen ruimte: eerst de bevestiging dat
 * schuldenvrij waardevol is, dan een asterisk-divider in krant-stijl, dan
 * de uitnodiging om alsnog een schuld toe te voegen als die er is. Zo
 * voelt geen van beide gebruikersgroepen genegeerd.
 */
function EmptyDebtsState({ onClick }: { onClick: () => void }) {
  return (
    <div className="mx-auto mt-6 max-w-2xl border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/40 px-6 py-10 text-center sm:px-10">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-3)]">
        Schuldenvrij
      </p>
      <p className="mt-3 font-serif text-xl italic text-[var(--ink)] sm:text-2xl">
        Geen schulden geregistreerd — een ijzersterke positie.
      </p>
      <p className="mx-auto mt-4 max-w-lg font-serif text-base leading-relaxed text-[var(--ink-2)]">
        Schuldenvrij zijn betekent dat al je vermogen voor jou werkt, niet
        voor de bank. Houd dat zo: het is één van de belangrijkste fundamenten
        onder je financiële vrijheid.
      </p>

      <p
        aria-hidden="true"
        className="mx-auto mt-6 text-[var(--ink-4)] tracking-[0.4em]"
      >
        * * *
      </p>

      <p className="mx-auto mt-6 max-w-lg font-serif text-base leading-relaxed text-[var(--ink-2)]">
        Heb je toch een hypotheek, studielening of andere schuld? Registreer
        hem dan hier zodat je netto vermogen, schuldgraad en FIRE-projectie
        volledig kloppen.
      </p>
      <button
        type="button"
        onClick={onClick}
        className="mt-6 inline-flex h-11 items-center gap-2 border border-kern-300 bg-kern-50 px-5 text-sm font-medium text-kern-700 transition-colors hover:bg-kern-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
      >
        Voeg schuld toe
      </button>
    </div>
  )
}

// ── Net-worth kassabon ───────────────────────────────────────

interface KassabonItem {
  id: string
  name: string
  current_value?: number
  current_balance?: number
  net_worth_inclusion_pct: number
}

function NetWorthKassabon({
  assetsList,
  debtsList,
  totalAssets,
  totalDebts,
  netWorth,
}: {
  assetsList: { id: string; name: string; current_value: number; net_worth_inclusion_pct: number }[]
  debtsList: { id: string; name: string; current_balance: number; net_worth_inclusion_pct: number }[]
  totalAssets: number
  totalDebts: number
  netWorth: number
}) {
  return (
    <KassabonShell>
      <div className="mb-3 text-center">
        <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
          Netto vermogen
        </p>
        <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
          Bezittingen minus schulden — gewogen naar inclusiepercentage
        </p>
      </div>

      {assetsList.length > 0 && (
        <KassabonGroup
          label="Bezittingen"
          items={assetsList.map((a) => ({
            id: a.id,
            name: a.name,
            amount: a.current_value * (a.net_worth_inclusion_pct / 100),
            pct: a.net_worth_inclusion_pct,
            tone: 'asset' as const,
          }))}
          subtotal={totalAssets}
        />
      )}

      {debtsList.length > 0 && (
        <KassabonGroup
          label="Schulden"
          items={debtsList.map((d) => ({
            id: d.id,
            name: d.name,
            amount: d.current_balance * (d.net_worth_inclusion_pct / 100),
            pct: d.net_worth_inclusion_pct,
            tone: 'debt' as const,
          }))}
          subtotal={totalDebts}
        />
      )}

      <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
        <span className="font-sans text-[var(--ink)]">Netto vermogen</span>
        <span className={netWorth >= 0 ? 'text-[var(--ink)]' : 'text-negative'}>
          <MaskedAmount value={netWorth} tone="kern" />
        </span>
      </div>

      <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">
        Berekend op basis van actieve bezittingen en schulden, gewogen naar het ingestelde inclusiepercentage.
      </p>
    </KassabonShell>
  )
}

function KassabonGroup({
  label,
  items,
  subtotal,
}: {
  label: string
  items: { id: string; name: string; amount: number; pct: number; tone: 'asset' | 'debt' }[]
  subtotal: number
}) {
  return (
    <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2">
      <p className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-3)]">
        {label}
      </p>
      {items.map((item) => (
        <div key={item.id} className="flex justify-between py-0.5">
          <span className="font-sans text-sm text-[var(--ink-2)]">
            {item.name}
            {item.pct < 100 && (
              <span className="ml-1 text-[10px] text-[var(--ink-4)]">({item.pct}%)</span>
            )}
          </span>
          <span className={item.tone === 'debt' ? 'text-negative' : 'text-[var(--ink)]'}>
            <MaskedAmount value={item.amount} tone="kern" signPrefix={item.tone === 'debt' ? '-' : ''} />
          </span>
        </div>
      ))}
      <div className="mt-1 flex justify-between border-t border-dashed border-[var(--border-ed)] pt-1 font-semibold">
        <span className="font-sans text-sm text-[var(--ink-2)]">Subtotaal</span>
        <span className={label === 'Schulden' ? 'text-negative' : 'text-[var(--ink)]'}>
          <MaskedAmount
            value={subtotal}
            tone="kern"
            signPrefix={label === 'Schulden' && subtotal > 0 ? '-' : ''}
          />
        </span>
      </div>
    </div>
  )
}

// ── Health-score drill-down kassabon ─────────────────────────

/** Kleur-class op basis van pilaar-score. */
function pillarScoreColorClass(score: number): string {
  if (score >= 80) return 'text-score-good'
  if (score >= 60) return 'text-score-ok'
  if (score >= 40) return 'text-score-warn'
  return 'text-score-bad'
}

function pillarBarColorClass(score: number): string {
  if (score >= 80) return 'bg-score-good'
  if (score >= 60) return 'bg-score-ok'
  if (score >= 40) return 'bg-score-warn'
  return 'bg-score-bad'
}

/**
 * Gedetailleerde kassabon voor de financiële gezondheidsscore.
 *
 * Toont:
 * 1. Totaalscore met label en trend
 * 2. Per pilaar: score-bar, waarde, uitleg, verbetertip
 * 3. Berekeningsnota
 *
 * Volgt het kassabon-patroon (krant-stijl bon) uit de design language.
 */
function HealthScoreKassabon({ healthScore }: { healthScore: HealthScore }) {
  // Sorteer pilaren: zwakste bovenaan (meeste aandacht nodig)
  const sortedPillars = [...healthScore.pillars].sort((a, b) => a.score - b.score)
  const weakest = sortedPillars.filter(p => p.score < 60)

  return (
    <div className="space-y-4 p-5">
      {/* Header: totaalscore + label */}
      <KassabonShell>
        <div className="flex items-center justify-between border-b border-dashed border-[var(--border-md)] pb-2 mb-2">
          <span className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
            Financiële gezondheid
          </span>
          <span className={`font-mono text-lg font-bold tabular-nums ${pillarScoreColorClass(healthScore.total)}`}>
            {healthScore.total}/100
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="font-sans text-[var(--ink-3)]">Beoordeling</span>
          <span className={`font-medium ${pillarScoreColorClass(healthScore.total)}`}>
            {healthScore.label}
          </span>
        </div>
        {healthScore.previousMonth !== null && (
          <div className="flex items-center justify-between text-xs mt-1">
            <span className="font-sans text-[var(--ink-3)]">Vorige maand</span>
            <span className="font-mono tabular-nums text-[var(--ink-2)]">{healthScore.previousMonth}/100</span>
          </div>
        )}
        {healthScore.trend !== 0 && (
          <div className="flex items-center justify-between text-xs mt-1">
            <span className="font-sans text-[var(--ink-3)]">Verandering</span>
            <span className={`font-mono tabular-nums font-medium ${healthScore.trend > 0 ? 'text-positive' : 'text-negative'}`}>
              {healthScore.trend > 0 ? '+' : ''}{healthScore.trend}
            </span>
          </div>
        )}
        <div className="border-t border-dashed border-[var(--border-md)] mt-2 pt-2 text-[10px] text-[var(--ink-3)]">
          Score = gewogen gemiddelde van {healthScore.activePillarCount} pilaren
        </div>
      </KassabonShell>

      {/* Per-pilaar breakdown — zwakste bovenaan */}
      <div className="space-y-3">
        <h3 className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
          Pilaren (zwakste eerst)
        </h3>
        {sortedPillars.map(pillar => (
          <HealthPillarCard key={pillar.id} pillar={pillar} />
        ))}
      </div>

      {/* Verbeterpunten — alleen als er zwakke pilaren zijn */}
      {weakest.length > 0 && (
        <div className="rounded-[var(--r-sm)] border border-amber-200 bg-amber-50/50 p-3">
          <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-amber-700 mb-2">
            Aandachtspunten
          </p>
          <ul className="space-y-1.5">
            {weakest.slice(0, 3).map(p => (
              <li key={p.id} className="text-xs text-[var(--ink-2)] leading-snug">
                <span className="font-semibold text-[var(--ink)]">{p.name}:</span>{' '}
                {p.improvementTip}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Footer-nota */}
      <p className="text-center font-sans text-[10px] text-[var(--ink-4)] leading-relaxed">
        Score gebaseerd op{' '}
        <GlossaryTerm term="spaarquote">spaarquote</GlossaryTerm>,{' '}
        <GlossaryTerm term="schuldgraad">schuldratio</GlossaryTerm>,{' '}
        noodfonds,{' '}
        <GlossaryTerm term="FIRE">FIRE</GlossaryTerm>-voortgang,{' '}
        <GlossaryTerm term="diversificatie">diversificatie</GlossaryTerm>{healthScore.budgetingActive ? ' en budgetdiscipline' : ''}.
        Herberekend bij elke paginaweergave.
      </p>
    </div>
  )
}

/**
 * Individuele pilaar-kaart in de drill-down kassabon.
 * Toont: naam + gewicht, score-bar, huidige waarde, uitleg en verbettertip.
 */
function HealthPillarCard({ pillar }: { pillar: HealthPillar }) {
  const clamp = Math.max(0, Math.min(pillar.score, 100))
  const weightPct = Math.round(pillar.weight * 100)

  return (
    <div className="rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--paper)] p-3">
      {/* Pilaar naam + score */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-baseline gap-1.5">
          <span className="font-sans text-sm font-semibold text-[var(--ink)]">{pillar.name}</span>
          <span className="font-sans text-[10px] text-[var(--ink-4)]">{weightPct}%</span>
        </div>
        <span className={`font-mono text-sm font-bold tabular-nums ${pillarScoreColorClass(pillar.score)}`}>
          {pillar.score}
        </span>
      </div>

      {/* Score bar */}
      <div className="h-[5px] w-full overflow-hidden bg-[var(--subtle)] mb-2">
        <div
          className={`h-full ${pillarBarColorClass(clamp)}`}
          style={{ width: `${clamp}%` }}
        />
      </div>

      {/* Huidige waarde */}
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="font-sans text-[var(--ink-3)]">Huidige waarde</span>
        <span className="font-mono tabular-nums text-[var(--ink-2)]">{pillar.rawValue}</span>
      </div>

      {/* Uitleg */}
      <p className="font-sans text-[11px] text-[var(--ink-2)] leading-snug">
        {pillar.explanation}
      </p>

      {/* Verbetettip — alleen tonen bij score < 80 */}
      {pillar.score < 80 && (
        <p className="mt-1.5 font-serif text-[11px] italic text-[var(--ink-3)] leading-snug">
          Tip: {pillar.improvementTip}
        </p>
      )}
    </div>
  )
}

// Voorkom unused-type warnings: KassabonItem is een referentie-type voor toekomstig hergebruik.
export type { KassabonItem }
