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
import { formatCurrency } from '@/lib/format'
import { CoreHero } from './core-hero'
import { SectionHeader } from './section-header'
import { CategoryCard, type CategorySegment } from './category-card'
import {
  findDeepenings,
  countTrackedItems,
  getDeepeningSlug,
} from './category-deepening-registry'

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
  const [quickAddIntent, setQuickAddIntent] = useState<QuickAddIntent | null>(null)

  const fireSnapshot = useMemo(() => computeFireSnapshot(initialData), [initialData])
  const assetGroups = useMemo(() => groupAssetsByType(initialData), [initialData])
  const debtGroups = useMemo(() => groupDebtsByType(initialData), [initialData])

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
      {/* Hero — vol-bleed boven, dan inset content. */}
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
        onShowNetWorthReceipt={() => setShowNetWorthReceipt(true)}
      />

      {/* === Bezittingen — full-bleed sectie, gelijk aan hero ====== */}
      <section className="border-b border-[var(--border-ed)] bg-[var(--paper)]">
        <div className="px-4 py-6 sm:px-6 sm:py-8">
          <SectionHeader
            kicker="Bezittingen"
            allHref="/core/assets"
            allLabel="Alle"
            onAddClick={() => setQuickAddIntent('asset')}
            addAriaLabel="Nieuwe bezitting toevoegen"
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
            onAddClick={() => setQuickAddIntent('debt')}
            addAriaLabel="Nieuwe schuld toevoegen"
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
                  href={`/core/debts/${group.type}`}
                  staggerIndex={idx}
                  variant="debt"
                />
              ))}
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
        <span
          className={`tabular-nums ${netWorth >= 0 ? 'text-[var(--ink)]' : 'text-negative'}`}
        >
          {formatCurrency(netWorth)}
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
          <span
            className={`tabular-nums ${item.tone === 'debt' ? 'text-negative' : 'text-[var(--ink)]'}`}
          >
            {item.tone === 'debt' ? '−' : ''}
            {formatCurrency(item.amount)}
          </span>
        </div>
      ))}
      <div className="mt-1 flex justify-between border-t border-dashed border-[var(--border-ed)] pt-1 font-semibold">
        <span className="font-sans text-sm text-[var(--ink-2)]">Subtotaal</span>
        <span
          className={`tabular-nums ${
            label === 'Schulden' ? 'text-negative' : 'text-[var(--ink)]'
          }`}
        >
          {label === 'Schulden' && subtotal > 0 ? '−' : ''}
          {formatCurrency(subtotal)}
        </span>
      </div>
    </div>
  )
}

// Voorkom unused-type warnings: KassabonItem is een referentie-type voor toekomstig hergebruik.
export type { KassabonItem }
