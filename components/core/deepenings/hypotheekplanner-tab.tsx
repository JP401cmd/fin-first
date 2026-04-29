'use client'

/**
 * Hypotheekplanner-tab — orchestreert de complete planner-ervaring voor één
 * hypotheek + (optioneel) gekoppeld eigen huis.
 *
 * Entry-points:
 *  - Onder `/core/debts/mortgage?tab=hypotheekplanner` (kind='debt') — de
 *    primaire entry. We zoeken de eerste actieve mortgage met
 *    `has_strategy_tracking === true` en lezen `linked_asset_id` voor het
 *    gekoppelde huis.
 *  - Onder `/core/assets/eigen_huis?tab=hypotheekplanner` (kind='asset') —
 *    secundaire entry. We zoeken het eerste actieve eigen_huis met
 *    `has_woonbalans_tracking === true` en lookuppen de mortgage via
 *    `debts.linked_asset_id === asset.id`.
 *
 * Beide paden leiden tot dezelfde rendering (`<HypotheekplannerActive>`).
 *
 * Graceful degradation:
 *  - Geen gekoppeld huis → `<EquityBuildupBar>` + `<WaardestijgingSlider>`
 *    + LTV-mijlpalen worden verborgen. `<DebtPayoffStrategy>`,
 *    `<AmortisationChart>`, `<HypotheekVsBeleggenSectie>`, schuldvrij-datum
 *    blijven werken.
 *  - Geen mortgage (alleen huis getrackt) → tab toont noot dat planner
 *    pas inhoud krijgt zodra gebruiker een hypotheek koppelt.
 *
 * Data-loading: client-side bij tab-mount. Symmetrisch met
 * `aflosstrategie-tab.tsx` en `cash-budgetteren-tab.tsx` — de host-pagina
 * levert geen mortgage-prop.
 */

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Building2, Shield, Percent } from 'lucide-react'
import type { Asset } from '@/lib/asset-data'
import {
  type Debt,
  type DebtType,
  type RepaymentType as DebtRepaymentType,
  computeRenteAflossingsSplit,
} from '@/lib/debt-data'
import type { AssetType } from '@/lib/asset-data'
import type { RepaymentType as HvBRepaymentType } from '@/lib/hypotheek-vs-beleggen'
import { formatCurrency } from '@/lib/format'
import type { DeepeningTabProps } from '../category-deepening-registry'
import { ModuleTipStrip } from '../module-tip-strip'
import { DebtPayoffStrategy } from './debt-payoff-strategy'
import { EquityBuildupBar } from './hypotheekplanner/equity-buildup-bar'
import { WaardestijgingSlider } from './hypotheekplanner/waardestijging-slider'
import { AmortisationChart } from './hypotheekplanner/amortisation-chart'
import { MilestonesList } from './hypotheekplanner/milestones-list'
import { HypotheekVsBeleggenSectie } from '@/components/app/core/debts/hypotheek-vs-beleggen-modal'

// ── Helpers ──────────────────────────────────────────────────

/**
 * Map de Dutch debt-data RepaymentType naar de HvB-engine taal-keuze.
 * Identiek aan de mapping in `debt-detail-modal.tsx` — bewust gedupliceerd
 * om geen circulaire dependency te creëren tussen deepenings en debt-modal.
 */
function toHvBRepaymentType(rt: DebtRepaymentType | null): HvBRepaymentType {
  if (rt === 'lineair') return 'linear'
  if (rt === 'aflossingsvrij') return 'interest_only'
  return 'annuity'
}

/**
 * Bereken resterende looptijd in maanden uit `end_date`. Fallback: 360 (30
 * jaar) wanneer geen einddatum beschikbaar — sluit aan bij wat
 * `debtProjection()` doet voor aflossingsvrij.
 */
function remainingMonths(debt: Debt): number {
  if (!debt.end_date) return 360
  const end = new Date(debt.end_date).getTime()
  const now = Date.now()
  return Math.max(1, Math.round((end - now) / (1000 * 60 * 60 * 24 * 30.44)))
}

// ── Component ────────────────────────────────────────────────

/**
 * Top-level entry. Splitst op `moduleActive` zodat de actieve tak (incl.
 * Supabase-fetch) nooit mount wanneer Toekomstplannen uit staat.
 */
export function HypotheekplannerTab({ type, moduleActive }: DeepeningTabProps) {
  if (!moduleActive) {
    return <HypotheekplannerTeaser />
  }
  return <HypotheekplannerActive type={type} />
}

// ── Teaser-tak (module uit) ──────────────────────────────────

function HypotheekplannerTeaser() {
  return (
    <div className="space-y-6">
      <div className="border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/40 px-6 py-8">
        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
          Module uit
        </p>
        <h3 className="mt-2 font-serif text-xl font-semibold text-[var(--ink)]">
          Toekomstplannen is niet ingeschakeld
        </h3>
        <p className="mt-2 font-serif italic text-sm leading-relaxed text-[var(--ink-2)]">
          Met Toekomstplannen zie je hoe je equity opbouwt, je optimale
          aflosroute, en hoe extra aflossen zich verhoudt tot extra beleggen.
          Schakel het in via Instellingen om hier inzicht te krijgen.
        </p>
      </div>
      <ModuleTipStrip
        copy="Activeer Toekomstplannen om je equity, oversluit-scenario's en hypotheek-vs-beleggen vergelijking te zien."
        className="border-t-0"
      />
    </div>
  )
}

// ── Actieve tak (module aan) ─────────────────────────────────

interface LoadedData {
  /** Hoofd-hypotheek voor deze planner-instance. */
  mortgage: Debt | null
  /** Gekoppeld eigen_huis (kan ontbreken — graceful degradation). */
  house: Asset | null
  /** Andere getrackte schulden — voor de DebtPayoffStrategy lookup. */
  otherTrackedDebts: Debt[]
  /** Foutmelding (overschrijft alle andere fields). */
  error: string | null
}

function HypotheekplannerActive({ type }: { type: AssetType | DebtType }) {
  const [data, setData] = useState<LoadedData | null>(null)

  useEffect(() => {
    let aborted = false
    void (async () => {
      try {
        const supabase = createClient()
        // We laden in één keer alle relevante rijen — de Hypotheekplanner
        // heeft beide entiteiten nodig en multi-app andere getrackte
        // schulden voor de DebtPayoffStrategy.
        const [mortgageRes, debtsRes, assetsRes] = await Promise.all([
          supabase
            .from('debts')
            .select('*')
            .eq('debt_type', 'mortgage')
            .eq('is_active', true)
            .eq('has_strategy_tracking', true)
            .order('current_balance', { ascending: false }),
          supabase
            .from('debts')
            .select('*')
            .eq('is_active', true)
            .eq('has_strategy_tracking', true)
            .neq('debt_type', 'mortgage'),
          supabase
            .from('assets')
            .select('*')
            .eq('is_active', true)
            .eq('has_woonbalans_tracking', true)
            .eq('asset_type', 'eigen_huis'),
        ])
        if (aborted) return

        if (mortgageRes.error) throw mortgageRes.error
        if (debtsRes.error) throw debtsRes.error
        if (assetsRes.error) throw assetsRes.error

        const allMortgages = (mortgageRes.data ?? []) as Debt[]
        const allHouses = (assetsRes.data ?? []) as Asset[]

        // Entry-routing: vanuit asset-pagina starten we vanaf het huis,
        // vanuit debt-pagina vanaf de hypotheek. Beide paden zoeken het
        // andere zijdje via koppeling.
        let mortgage: Debt | null = null
        let house: Asset | null = null

        if (type === 'eigen_huis') {
          house = allHouses[0] ?? null
          if (house) {
            mortgage =
              allMortgages.find((m) => m.linked_asset_id === house!.id) ??
              null
          }
        } else {
          // type === 'mortgage' — primaire entry
          mortgage = allMortgages[0] ?? null
          if (mortgage?.linked_asset_id) {
            house =
              allHouses.find((h) => h.id === mortgage!.linked_asset_id) ??
              null
          }
        }

        setData({
          mortgage,
          house,
          otherTrackedDebts: (debtsRes.data ?? []) as Debt[],
          error: null,
        })
      } catch (err) {
        if (aborted) return
        setData({
          mortgage: null,
          house: null,
          otherTrackedDebts: [],
          error: err instanceof Error ? err.message : 'Onbekende fout',
        })
      }
    })()
    return () => {
      aborted = true
    }
  }, [type])

  if (data === null) return <SkeletonBox />
  if (data.error !== null) return <ErrorBox detail={data.error} />

  // Pad 1: gebruiker landde op asset-pagina maar er is geen hypotheek
  // gekoppeld → toon noot met instructie. We tonen GEEN equity-bar omdat
  // die zonder schuld niets toevoegt boven de WidgetEmpty-state.
  if (!data.mortgage && data.house) {
    return <NoMortgageState />
  }

  // Pad 2: noch hypotheek noch huis getrackt — algemene empty state.
  if (!data.mortgage && !data.house) {
    return <NoTrackedItemsState type={type} />
  }

  if (!data.mortgage) {
    // TypeScript-narrowing — onbereikbaar door bovenstaande returns, maar
    // expliciet zodat de rest van de tree zonder optional chaining werkt.
    return <NoTrackedItemsState type={type} />
  }

  return (
    <ActivePlanner
      mortgage={data.mortgage}
      house={data.house}
      otherTrackedDebts={data.otherTrackedDebts}
    />
  )
}

// ── Active planner (data klaar) ──────────────────────────────

interface ActivePlannerProps {
  mortgage: Debt
  house: Asset | null
  otherTrackedDebts: Debt[]
}

function ActivePlanner({ mortgage, house, otherTrackedDebts }: ActivePlannerProps) {
  // Berekeningsbasis: rente/aflossing-split om de equity-buildup-bar te
  // voeden met "maandelijkse aflossing = maandelijkse equity-groei".
  const split = useMemo(() => computeRenteAflossingsSplit(mortgage), [mortgage])
  const monthlyPrincipal = split?.currentAflossing ?? 0

  const balance = Number(mortgage.current_balance)
  const interestRate = Number(mortgage.interest_rate)
  const months = useMemo(() => remainingMonths(mortgage), [mortgage])
  const repaymentType: DebtRepaymentType = mortgage.repayment_type ?? 'annuiteit'

  // Voor `<DebtPayoffStrategy>` voegen we de hypotheek samen met andere
  // getrackte schulden, met de hypotheek als focus-debt.
  const allTrackedDebts = useMemo(
    () => [mortgage, ...otherTrackedDebts],
    [mortgage, otherTrackedDebts],
  )

  const marketValue = house ? Number(house.current_value) : null
  const hasLinkedHouse = marketValue != null && marketValue > 0

  return (
    <div className="space-y-8">
      {/* ── Header — hypotheek-detail strip ───────────────────────── */}
      <header>
        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
          Hypotheekplanner
        </p>
        <h2
          className="mt-1 font-serif text-xl font-semibold text-[var(--ink)]"
          style={{ fontFamily: 'var(--font-playfair, serif)' }}
        >
          {mortgage.name}
        </h2>
        {/* Drie-kolom meta-strip: marktwaarde / restschuld / equity (alleen
            bij gekoppeld huis) of slechts schuld + type bij ontbrekend huis. */}
        <div className="mt-3 grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-4">
          {hasLinkedHouse ? (
            <>
              <Stat
                label="Marktwaarde"
                value={formatCurrency(marketValue!)}
              />
              <Stat
                label="Schuld"
                value={formatCurrency(balance)}
                tone="negative"
              />
              <Stat
                label="Eigen vermogen"
                value={formatCurrency(Math.max(0, marketValue! - balance))}
                tone="primary"
              />
            </>
          ) : (
            <>
              <Stat label="Schuld" value={formatCurrency(balance)} tone="negative" />
              <Stat label="Looptijd" value={formatYearSpan(months)} />
            </>
          )}
          <Stat
            label="Type"
            value={mortgage.subtype ?? repaymentType}
          />
          <Stat
            label="Rente"
            value={`${interestRate.toFixed(2)}%`}
          />
        </div>
        {/* Status-strip: NHG, fiscaal aftrekbaar, fixe-eind-datum.
            Alleen tonen wanneer relevant — anders zou de strip 90% van
            de hypotheken een lege lijn geven. */}
        {(mortgage.nhg || mortgage.is_tax_deductible || mortgage.fixed_rate_end_date) && (
          <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--ink-3)]">
            {mortgage.nhg && (
              <li className="inline-flex items-center gap-1">
                <Shield className="h-3 w-3" aria-hidden="true" />
                NHG
              </li>
            )}
            {mortgage.is_tax_deductible && (
              <li className="inline-flex items-center gap-1">
                <Percent className="h-3 w-3" aria-hidden="true" />
                Hypotheekrenteaftrek
              </li>
            )}
            {mortgage.fixed_rate_end_date && (
              <li className="inline-flex items-center gap-1">
                <Building2 className="h-3 w-3" aria-hidden="true" />
                Rente vast tot{' '}
                <span className="font-mono tabular-nums">
                  {new Date(mortgage.fixed_rate_end_date).toLocaleDateString(
                    'nl-NL',
                    { month: 'short', year: 'numeric' },
                  )}
                </span>
              </li>
            )}
          </ul>
        )}
      </header>

      {/* ── Hero (alleen bij gekoppeld huis) ──────────────────── */}
      {hasLinkedHouse && (
        <EquityBuildupBar
          marketValue={marketValue!}
          debtBalance={balance}
          monthlyPrincipal={monthlyPrincipal}
        />
      )}

      {/* ── Waardestijging-slider (alleen bij gekoppeld huis) ── */}
      {hasLinkedHouse && (
        <WaardestijgingSlider marketValue={marketValue!} />
      )}

      {/* ── Aflospan — DebtPayoffStrategy met hypotheek als focus ─ */}
      <DebtPayoffStrategy
        debts={allTrackedDebts}
        focusDebtId={mortgage.id}
        kicker="Aflosplan"
      />

      {/* ── Amortisatie-chart ────────────────────────────────── */}
      <AmortisationChart
        balance={balance}
        interestRate={interestRate}
        remainingMonths={months}
        repaymentType={repaymentType}
      />

      {/* ── Hypotheek vs Beleggen — inline sectie ────────────── */}
      <section className="space-y-3">
        <header>
          <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Hypotheek vs beleggen
          </p>
          <p className="mt-1 font-serif italic text-[12px] leading-snug text-[var(--ink-3)]">
            Wat levert een extra euro per maand het meest op?
          </p>
        </header>
        <div className="border border-[var(--border-ed)] bg-[var(--paper)] p-4">
          <HypotheekVsBeleggenSectie
            hypotheekBalance={balance}
            rente={interestRate}
            repaymentType={toHvBRepaymentType(repaymentType)}
            restLooptijd={months}
            isTaxDeductible={mortgage.is_tax_deductible ?? false}
            // Marginaal IB-tarief: hardcoded conservatief (37%) zodat we
            // de planner zonder profile-fetch werken. Het advies blijft
            // valide; gebruikers met hoger inkomen krijgen een lichte
            // onderschatting van de aftrek-besparing.
            marginaalTarief={0.3697}
            // Inflatie als decimaal — 2% conservatief.
            inflatie={0.02}
            hasPartner={mortgage.ownership === 'shared'}
          />
        </div>
      </section>

      {/* ── Mijlpalen ─────────────────────────────────────────── */}
      <MilestonesList
        balance={balance}
        marketValue={marketValue}
        interestRate={interestRate}
        remainingMonths={months}
        repaymentType={repaymentType}
      />
    </div>
  )
}

// ── Stat ─────────────────────────────────────────────────────

function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'primary' | 'negative'
}) {
  const valueClass =
    tone === 'primary'
      ? 'text-[var(--ink)]'
      : tone === 'negative'
        ? 'text-negative'
        : 'text-[var(--ink-2)]'
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
        {label}
      </p>
      <p
        className={`mt-0.5 font-mono tabular-nums text-sm font-semibold ${valueClass}`}
      >
        {value}
      </p>
    </div>
  )
}

// ── Empty / loading / error states ───────────────────────────

function NoTrackedItemsState({ type }: { type: AssetType | DebtType }) {
  const isAsset = type === 'eigen_huis'
  return (
    <div className="border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/40 px-6 py-8 text-center">
      <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
        Nog niets getrackt
      </p>
      <p className="mt-2 font-serif italic text-sm leading-relaxed text-[var(--ink-2)]">
        {isAsset
          ? 'Activeer woonbalans-tracking op je woning om hier de planner-inhoud te zien.'
          : 'Activeer aflossings-tracking op je hypotheek om hier de planner-inhoud te zien.'}
      </p>
    </div>
  )
}

function NoMortgageState() {
  return (
    <div className="border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/40 px-6 py-8 text-center">
      <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
        Geen gekoppelde hypotheek
      </p>
      <p className="mt-2 font-serif italic text-sm leading-relaxed text-[var(--ink-2)]">
        Koppel een hypotheek aan deze woning om equity-opbouw, aflosplan en
        scenario&apos;s te zien. Voeg de hypotheek toe of stel het veld
        &quot;Gekoppelde woning&quot; in via de hypotheek-detail.
      </p>
    </div>
  )
}

function SkeletonBox() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <div className="h-2.5 w-32 animate-pulse bg-[var(--subtle)]" />
        <div className="h-5 w-48 animate-pulse bg-[var(--subtle)]" />
        <div className="h-3 w-full max-w-md animate-pulse bg-[var(--subtle)]" />
      </div>
      <div className="h-[80px] animate-pulse bg-[var(--paper)] border border-[var(--border-ed)]" />
      <div className="h-[140px] animate-pulse bg-[var(--paper)] border border-[var(--border-ed)]" />
      <div className="h-[260px] animate-pulse bg-[var(--paper)] border border-[var(--border-ed)]" />
      <span className="sr-only">Hypotheekplanner wordt geladen…</span>
    </div>
  )
}

function ErrorBox({ detail }: { detail: string }) {
  return (
    <div
      role="alert"
      className="border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/40 px-6 py-8"
    >
      <p className="text-[10px] uppercase tracking-[0.08em] text-negative">
        Hypotheek niet geladen
      </p>
      <p className="mt-2 font-serif italic text-sm leading-relaxed text-[var(--ink-2)]">
        We konden de hypotheek-gegevens niet ophalen. Probeer de pagina te
        verversen — als het probleem blijft, controleer je internetverbinding.
      </p>
      <p className="mt-3 font-mono text-[11px] leading-snug text-[var(--ink-4)]">
        {detail}
      </p>
      <button
        type="button"
        onClick={() => {
          if (typeof window !== 'undefined') window.location.reload()
        }}
        className="mt-4 inline-flex h-11 items-center gap-2 border border-kern-300 bg-kern-50 px-4 text-sm font-medium text-kern-700 transition-colors hover:bg-kern-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
      >
        Opnieuw proberen
      </button>
    </div>
  )
}

// ── Local helpers ────────────────────────────────────────────

/** "30 jr 6 mnd" — sluit aan bij format in `milestones-list.tsx`. */
function formatYearSpan(months: number): string {
  if (months <= 0) return '—'
  const y = Math.floor(months / 12)
  const m = months % 12
  if (y === 0) return `${m} mnd`
  if (m === 0) return `${y} jr`
  return `${y} jr ${m} mnd`
}
