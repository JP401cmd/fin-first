'use client'

/**
 * Hypotheekplanner-tab — orchestreert de complete planner-ervaring voor één
 * hypotheek + (optioneel) gekoppeld eigen huis.
 *
 * Entry-points:
 *  - Onder `/core/debts/mortgage?tab=hypotheekplanner` (kind='debt') — de
 *    primaire entry. We zoeken de eerste actieve mortgage met
 *    `has_hypotheekplanner_tracking === true` en lezen `linked_asset_id`
 *    voor het gekoppelde huis.
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
 * `cash-budgetteren-tab.tsx` — de host-pagina levert geen mortgage-prop.
 */

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Building2, Landmark, Shield, Percent } from 'lucide-react'
import { ASSET_CLIENT_COLUMNS, type Asset } from '@/lib/asset-data'
import {
  type Debt,
  type DebtType,
  type RepaymentType as DebtRepaymentType,
  computeRenteAflossingsSplit,
} from '@/lib/debt-data'
import type { AssetType } from '@/lib/asset-data'
import type { RepaymentType as HvBRepaymentType } from '@/lib/hypotheek-vs-beleggen'
import { deriveMarginaalTarief } from '@/lib/box1-tax'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import type { DeepeningTabProps } from '../category-deepening-registry'
import { ModuleTipStrip } from '../module-tip-strip'
import { AppSetupGate } from '@/components/app/app-setup/app-setup-gate'
import { AppLinkGate } from '@/components/app/app-setup/app-link-gate'
import { useIsAppSetupCompleted } from '@/components/app/app-setup/use-is-setup-completed'
import { DebtPayoffStrategy } from './debt-payoff-strategy'
import { EquityBuildupBar } from './hypotheekplanner/equity-buildup-bar'
import { WaardestijgingSlider } from './hypotheekplanner/waardestijging-slider'
import { AmortisationChart } from './hypotheekplanner/amortisation-chart'
import { MilestonesList } from './hypotheekplanner/milestones-list'
import { HypotheekVsBeleggenSectie } from '@/components/app/core/debts/hypotheek-vs-beleggen-modal'
import { AannameHint } from '@/components/editorial/aanname-hint'
import {
  describeDebtTermBasis,
  resolveDebtTermBasis,
} from '@/lib/debt-term-basis'

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
 * Terugval-looptijd (maanden) wanneer een hypotheek geen `end_date` heeft —
 * sluit aan bij wat `debtProjection()` doet voor aflossingsvrij. Wordt óók
 * door de "waarop gebaseerd?"-hint uitgesproken, zodat het scherm dezelfde
 * aanname noemt als waar het mee rekent.
 */
const FALLBACK_TERM_MONTHS = 360

/**
 * Bereken resterende looptijd in maanden uit `end_date`. Fallback:
 * `FALLBACK_TERM_MONTHS` wanneer geen einddatum beschikbaar.
 */
function remainingMonths(debt: Debt): number {
  if (!debt.end_date) return FALLBACK_TERM_MONTHS
  const end = new Date(debt.end_date).getTime()
  const now = Date.now()
  return Math.max(1, Math.round((end - now) / (1000 * 60 * 60 * 24 * 30.44)))
}

// ── Component ────────────────────────────────────────────────

/**
 * Top-level entry. Splitst op `moduleActive` zodat de actieve tak (incl.
 * Supabase-fetch) nooit mount wanneer Toekomstplannen uit staat.
 */
export function HypotheekplannerTab({ type, moduleActive, currentUserId }: DeepeningTabProps) {
  if (!moduleActive) {
    return <HypotheekplannerTeaser />
  }
  return <HypotheekplannerGated type={type} currentUserId={currentUserId} />
}

// ── Gate-laag (setup-check) ──────────────────────────────────

function HypotheekplannerGated({
  type,
  currentUserId,
}: {
  type: AssetType | DebtType
  currentUserId?: string
}) {
  const setupCompleted = useIsAppSetupCompleted('hypotheekplanner')
  if (setupCompleted === null) return <SkeletonBox />
  if (setupCompleted === false) return <AppSetupGate appKey="hypotheekplanner" />
  return <HypotheekplannerActive type={type} currentUserId={currentUserId} />
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
  /**
   * Actieve hypotheken zónder planner-koppeling — voedt het koppelscherm
   * wanneer er geen enkele hypotheek (meer) getrackt is.
   */
  untrackedMortgages: Debt[]
  /** Foutmelding (overschrijft alle andere fields). */
  error: string | null
}

function HypotheekplannerActive({
  type,
  currentUserId,
}: {
  type: AssetType | DebtType
  currentUserId?: string
}) {
  const [data, setData] = useState<LoadedData | null>(null)
  // Bump = opnieuw laden. Het koppelscherm verhoogt deze na een succesvolle
  // koppeling zodat de planner direct met de zojuist gekoppelde hypotheek
  // rendert (de data leeft in deze client-fetch, niet in de server-bundel).
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let aborted = false
    setData(null)
    void (async () => {
      try {
        const supabase = createClient()
        // We laden in één keer alle relevante rijen — de Hypotheekplanner
        // heeft beide entiteiten nodig en multi-app andere getrackte
        // schulden voor de DebtPayoffStrategy. Bewust álle actieve
        // hypotheken (ook zonder planner-vlag): de niet-getrackte voeden
        // het koppelscherm.
        const [mortgageRes, debtsRes, assetsRes] = await Promise.all([
          supabase
            .from('debts')
            .select('*')
            .eq('debt_type', 'mortgage')
            .eq('is_active', true)
            .order('current_balance', { ascending: false }),
          // Aflosstrategie is sinds de v2-refactor globaal: alle actieve
          // schulden tellen mee als "andere getrackte schulden" in de
          // payoff-projectie (geen per-debt tracking-vlag-filter meer).
          supabase
            .from('debts')
            .select('*')
            .eq('is_active', true)
            .neq('debt_type', 'mortgage'),
          // Expliciete kolomlijst i.p.v. `select('*')`: `assets` heeft een
          // huishoud-gedeelde SELECT-policy, dus `*` levert bij een gedeelde
          // bezitting óók `account_number_hash`/`account_number_encrypted` van
          // de PARTNER in deze bundel. Zie ASSET_CLIENT_COLUMNS.
          supabase
            .from('assets')
            .select(ASSET_CLIENT_COLUMNS)
            .eq('is_active', true)
            .eq('has_woonbalans_tracking', true)
            .eq('asset_type', 'eigen_huis'),
        ])
        if (aborted) return

        if (mortgageRes.error) throw mortgageRes.error
        if (debtsRes.error) throw debtsRes.error
        if (assetsRes.error) throw assetsRes.error

        const allMortgageRows = (mortgageRes.data ?? []) as Debt[]
        // De planner zelf werkt uitsluitend op gekóppelde hypotheken —
        // zelfde semantiek als vóór de koppelscherm-uitbreiding.
        const allMortgages = allMortgageRows.filter(
          (m) => m.has_hypotheekplanner_tracking,
        )
        // Alleen éígen hypotheken als koppel-kandidaat: lezen is huishoud-
        // verbreed, maar `/api/debts/toggle-hypotheekplanner` schrijft strikt
        // eigen-rij — een partner-hypotheek zou altijd op een 500 stuklopen.
        const untrackedMortgages = allMortgageRows.filter(
          (m) =>
            !m.has_hypotheekplanner_tracking &&
            (!currentUserId || m.user_id === currentUserId),
        )
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
          untrackedMortgages,
          error: null,
        })
      } catch (err) {
        if (aborted) return
        setData({
          mortgage: null,
          house: null,
          otherTrackedDebts: [],
          untrackedMortgages: [],
          error: err instanceof Error ? err.message : 'Onbekende fout',
        })
      }
    })()
    return () => {
      aborted = true
    }
  }, [type, reloadKey, currentUserId])

  if (data === null) return <SkeletonBox />
  if (data.error !== null) return <ErrorBox detail={data.error} />

  // Pad 0 — hypotheek-entry zonder gekoppelde hypotheek: koppelscherm.
  // Zelfde vlag als de instelling op de hypotheek zelf
  // (has_hypotheekplanner_tracking, via /api/debts/toggle-hypotheekplanner);
  // na koppelen herlaadt de tab zijn eigen fetch. Zonder kandidaten toont
  // de gate een voeg-eerst-toe-CTA naar de items-tab. De eigen_huis-entry
  // houdt zijn bestaande woonbalans-paden (Pad 1/2 hieronder).
  if (type === 'mortgage' && !data.mortgage) {
    return (
      <AppLinkGate
        kicker="Hypotheek koppelen"
        title="Koppel je hypotheek aan de planner"
        intro="De Hypotheekplanner werkt alleen met de hypotheek die je koppelt. Kies hieronder welke hypotheek je in de planner wilt volgen."
        itemNoun="hypotheek"
        icon={Landmark}
        candidates={data.untrackedMortgages.map((m) => ({
          id: m.id,
          name: m.name,
          value: Number(m.current_balance),
        }))}
        endpoint="/api/debts/toggle-hypotheekplanner"
        emptyCopy="Je hebt nog geen hypotheek geregistreerd. Voeg er eerst één toe bij je schulden — daarna kun je 'm hier aan de planner koppelen."
        emptyCtaLabel="Voeg hypotheek toe"
        onLinked={() => setReloadKey((k) => k + 1)}
      />
    )
  }

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
  const { masked } = useMaskedAmounts()
  const fc = (v: number) => formatMaskedCurrency(v, masked)
  // Berekeningsbasis: rente/aflossing-split om de equity-buildup-bar te
  // voeden met "maandelijkse aflossing = maandelijkse equity-groei".
  const split = useMemo(() => computeRenteAflossingsSplit(mortgage), [mortgage])
  const monthlyPrincipal = split?.currentAflossing ?? 0

  const balance = Number(mortgage.current_balance)
  const interestRate = Number(mortgage.interest_rate)
  const months = useMemo(() => remainingMonths(mortgage), [mortgage])
  const repaymentType: DebtRepaymentType = mortgage.repayment_type ?? 'annuiteit'
  // Grondslag van `end_date` — bepaalt of de getoonde looptijd (en alles wat
  // erop rust: mijlpalen, aflosgrafiek, schuldvrij-datum) een gegeven is of
  // een stille aanname. `null` ⇒ door de gebruiker gezet, geen hint nodig.
  const termBasisText = useMemo(
    () =>
      describeDebtTermBasis(
        resolveDebtTermBasis(mortgage),
        FALLBACK_TERM_MONTHS / 12,
      ),
    [mortgage],
  )

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
      {/* ── KPI-hero-band — paper-blok met harde ink-borders rond
          kicker + titel + stat-grid + status-strip. Volgt de
          Categorie-app-tab hero-band-blueprint (zie ui-ux skill,
          patroon-kaart KPI-paper-blok); zelfde discipline als
          crypto-holdings-page.tsx en budgets-client.tsx. ─────── */}
      <section className="border-t border-b border-[var(--ink)] bg-[var(--paper)] px-4 py-5 sm:px-6 sm:py-7">
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
                  value={fc(marketValue!)}
                />
                <Stat
                  label="Schuld"
                  value={fc(balance)}
                  tone="negative"
                />
                <Stat
                  label="Eigen vermogen"
                  value={fc(Math.max(0, marketValue! - balance))}
                  tone="primary"
                />
              </>
            ) : (
              <>
                <Stat label="Schuld" value={fc(balance)} tone="negative" />
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
          {/* Waarop gebaseerd? — de resterende looptijd voedt de stat
              hierboven én de mijlpalen/aflosgrafiek verderop. Staat die op
              een stille default (30 jaar) of ontbreekt de einddatum, dan mag
              dat niet als hard feit blijven staan. */}
          {termBasisText && (
            <AannameHint subject="de looptijd" className="mt-3">
              {termBasisText}
            </AannameHint>
          )}
        </header>
      </section>

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
            // Marginaal IB-tarief: schijf-1-tarief per belastingjaar afgeleid uit
            // BOX1_PARAMS (canonieke helper), zodat de planner zonder profile-fetch
            // werkt. Het advies blijft valide; gebruikers met hoger inkomen krijgen
            // een lichte onderschatting van de aftrek-besparing.
            marginaalTarief={deriveMarginaalTarief()}
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
