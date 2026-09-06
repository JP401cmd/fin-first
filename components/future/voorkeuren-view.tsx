'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import Link from 'next/link'
import { SlidersHorizontal, ArrowRight, TrendingUp, Wallet, Pencil } from 'lucide-react'
import type { FireParams } from '@/lib/fire-params'
import type { FirePlan, FireStrategyConfig } from '@/lib/fire-strategy'
import type { WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import { STRATEGY_LABELS } from '@/lib/fire-strategy'
import { STOP_ANCHOR_OPTIONS, formatPlanAge } from '@/lib/horizon/plan-draft'
import { GlossaryTerm } from '@/components/editorial/glossary-term'
import { HideInSimple } from '@/components/app/hide-in-simple'
import { DepthSection } from '@/components/app/depth-section'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'
import { VoorkeurBewerkenSheet } from './voorkeur-bewerken-sheet'
import { AfbouwOverzichtCard } from './afbouw-overzicht-card'
import { RegelBewerkenPane } from './regel-bewerken-pane'
import { REGEL_ORDER, type RegelId } from '@/lib/future/regel-registry'
import type { RegelSimSnapshot } from '@/lib/future/regel-sim'
import type { PotRulesConfig, SurplusGroup } from '@/lib/pot-rules'
import { WEALTH_GROUP_LABELS, type WealthGroup } from '@/lib/wealth-composition'

/**
 * VoorkeurenView — content voor Voorkeuren-tab op /toekomst.
 *
 * Sectie "Regels op de hele tijdas": vijf regels die elk een rijk bewerkscherm
 * (RegelBewerkenPane) openen met uitleg, instellingen en impact. Regel 1 & 2
 * (eindstrategie/onttrekking) tonen een échte live impact-grafiek; regel 3/4/5
 * (pot-volgorde/verdeling/afname) tonen een illustratieve pot-flow-weergave.
 *
 * Daaronder: "Markt-aannames" (inflatie + bruto rendement) via VoorkeurBewerkenSheet.
 *
 * Weergavemodus "Eenvoudig" (S7, herziet audit TOE-3): regel 1 & 2 staan open —
 * de twee keuzes die bepalen hóé lang je vermogen meegaat. De drie pot-regels
 * (onttrekkingsvolgorde, verdeling bij toename, onttrekking bij afname) en de
 * markt-aannames staan dáár achter een `DepthSection`, ingeklapt, met een
 * leesregel die de huidige waarde draagt.
 *
 * Waarom `DepthSection` en niet langer `HideInSimple`: dit zijn bedienings-
 * vlakken (elke kaart heeft `onEdit`) en /toekomst/voorkeuren is de enige
 * ingang — niets deep-linkt naar ?regel=onttrekkingsvolgorde|verdeling-toename|
 * onttrekking-afname. ADR 0026 (aanvulling fase 3-5) reserveert `HideInSimple`
 * voor diepte "waar de gebruiker geen ingang verliest" en wijst voor bedienings-
 * vlakken juist `DepthSection` aan: hard verbergen zet daar de enige ingang
 * dicht, terwijl de kernel er onverminderd mee rekent (horizon-data-loader →
 * adapter/prio-overgang). Vijf verwijzers (coach-suggestie 'Rendement
 * instellen', module-guide, ⌘K-sublabel, de widgets swr_monitor/inflatie_impact
 * en de pagina-`i`) liepen in Eenvoudig dood. Precedent: CF-4 in
 * cashflow-instellingen-lazy.tsx.
 *
 * De leesregels consumeren de bestaande props/formatters (regelVoorkeuren,
 * fireParams → formatGroupOrder/surplusLabel/formatPct) — geen tweede afleiding.
 *
 * `DepthSection` wordt alléén in Eenvoudig gemónt: in Volledig rendert exact de
 * bestaande boom (één grid met vijf kaarten, markt-aannames-blok zoals het was),
 * anders zou Volledig er kop-knoppen en kaartranden bij krijgen.
 *
 * De AfbouwOverzichtCard blijft `HideInSimple` — dat is uitkomst-analyse, geen
 * bedieningsvlak, en valt daarmee aan de goede kant van diezelfde norm.
 */

const WITHDRAWAL_LABELS: Record<
  string,
  { name: string; subtitle: React.ReactNode }
> = {
  static: {
    name: 'Vast (4%)',
    subtitle: (
      <>
        Klassiek <GlossaryTerm term="swr">SWR</GlossaryTerm> — inflatie-
        geïndexeerd, geen reactie op markt
      </>
    ),
  },
  guardrails: {
    name: 'Guardrails',
    subtitle: (
      <>
        <GlossaryTerm term="guardrails">Dynamisch</GlossaryTerm> — verlaagt bij
        slechte returns, verhoogt bij goede
      </>
    ),
  },
  vpw: {
    name: 'VPW',
    subtitle: (
      <>
        <GlossaryTerm term="vpw">Variable Percentage Withdrawal</GlossaryTerm>
        {' '}— leeftijd-afhankelijk
      </>
    ),
  },
  bucket: {
    name: 'Bucket',
    subtitle: (
      <>
        <GlossaryTerm term="bucket">Cash-buffer</GlossaryTerm> + lange-termijn
        portfolio gescheiden
      </>
    ),
  },
}

function formatPct(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`
}

/** "Spaargeld → Beleggingen → Overig → …" — compacte weergave van een groep-volgorde. */
function formatGroupOrder(groups: WealthGroup[], max = 3): string {
  const labels = groups.map((g) => WEALTH_GROUP_LABELS[g])
  if (labels.length <= max) return labels.join(' → ')
  return `${labels.slice(0, max).join(' → ')} → …`
}

function surplusLabel(s: SurplusGroup): string {
  if (s === 'schuld_aflossen') return 'Schulden aflossen'
  return `Naar ${WEALTH_GROUP_LABELS[s].toLowerCase()}`
}

export function VoorkeurenView({
  fireParams,
  fireStrategy,
  firePlan = null,
  withdrawalStrategy,
  fireAge,
  simRows,
  simSnapshot,
  regelVoorkeuren,
  potBalances,
}: {
  fireParams: FireParams
  fireStrategy: FireStrategyConfig
  /** ADR 0129 — het volledige plan (stop-anker + eind-vorm); voedt de plan-regel. */
  firePlan?: FirePlan | null
  withdrawalStrategy: WithdrawalStrategyConfig
  /** Vrijheidsleeftijd (gerond) voor AfbouwOverzichtCard. */
  fireAge?: number | null
  /** Per-jaar projectie uit runUnifiedProjection — voor eindsaldo-berekening. */
  simRows?: { age: number; endPortfolio: number }[] | null
  /** Simulatie-snapshot voor de live-sim bewerkschermen (regel 1 & 2). */
  simSnapshot: RegelSimSnapshot | null
  /** Pot-regels (regel 3/4/5). */
  regelVoorkeuren: PotRulesConfig
  /** Huidige saldo per WealthGroup voor de illustratieve pot-flow-weergave. */
  potBalances: Record<WealthGroup, number>
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // Weergavemodus: single source of truth — zelfde bron als HideInSimple.
  const { mode } = useDisplayMode()
  const simple = mode === 'simple'
  // Inline-editor state voor de markt-aannames (inflatie/rendement).
  const [editing, setEditing] = useState<
    | null
    | {
        title: string
        column: 'inflation_rate' | 'expected_return'
        currentValuePct: number
        helperText: string
      }
  >(null)
  // Welke "Regel op de hele tijdas" wordt bewerkt (null = gesloten).
  const [editingRegel, setEditingRegel] = useState<RegelId | null>(null)

  // Deep-link: ?regel=eindstrategie|onttrekkingsstrategie|… opent het
  // bijbehorende regel-bewerkscherm (spiegelt het ?strategie=-patroon van
  // gebeurtenissen-view). Valideert tegen de geldige RegelId-set.
  useEffect(() => {
    const r = searchParams.get('regel')
    if (r && (REGEL_ORDER as string[]).includes(r)) {
      setEditingRegel(r as RegelId)
    }
  }, [searchParams])

  // Sluit het regel-bewerkscherm én ruim de ?regel-param op (spiegelt closeStrategy).
  function closeRegel() {
    setEditingRegel(null)
    if (searchParams.get('regel')) {
      const p = new URLSearchParams(searchParams)
      p.delete('regel')
      router.replace(`${pathname}${p.toString() ? `?${p}` : ''}`, { scroll: false })
    }
  }

  // ADR 0129 — de plan-kaart toont de EIND-VORM als naam en het STOP-ANKER als
  // ondertitel: twee assen, twee regels. Zonder plan (oude bundel) de legacy-label.
  const endStrategy = firePlan ? STRATEGY_LABELS[firePlan.endForm] : STRATEGY_LABELS[fireStrategy.strategy]
  const ankerLabel = (() => {
    if (!firePlan) return null
    const a = firePlan.anchor
    if (a.kind === 'age') return `Stopmoment: op ${formatPlanAge(a.age)}`
    const opt = STOP_ANCHOR_OPTIONS.find((o) => o.kind === a.kind)
    return opt ? `Stopmoment: ${opt.name.charAt(0).toLowerCase()}${opt.name.slice(1)}` : null
  })()
  const wsLabel = WITHDRAWAL_LABELS[withdrawalStrategy.strategy] ?? {
    name: withdrawalStrategy.strategy,
    subtitle: 'Onbekende strategie',
  }

  const openRegel = (id: RegelId) => () => setEditingRegel(id)

  // ── Gedeelde kaartsets ────────────────────────────────────────────────────
  // Eén definitie, twee montages (Volledig = grid-kind, Eenvoudig = in een
  // DepthSection). Fragment, zodat de kaarten in Volledig dírecte grid-kinderen
  // blijven — exact zoals HideInSimple ze eerder doorliet.
  const potRegelCards = (
    <>
      <VoorkeurCard
        label="Onttrekkingsvolgorde"
        value={formatGroupOrder(regelVoorkeuren.withdrawalOrderGroups)}
        subtitle="Welke pot eerst leegtrekken bij afbouw"
        Icon={SlidersHorizontal}
        badge="Potten"
        onEdit={openRegel('onttrekkingsvolgorde')}
      />
      <VoorkeurCard
        label="Verdeling bij toename"
        value={surplusLabel(regelVoorkeuren.surplusGroup)}
        subtitle="Waar gaat extra geld heen bij een positief event"
        Icon={SlidersHorizontal}
        badge="Potten"
        onEdit={openRegel('verdeling-toename')}
      />
      <VoorkeurCard
        label="Onttrekking bij afname"
        value={formatGroupOrder(regelVoorkeuren.deficitOrderGroups)}
        subtitle="Waar wordt geld vandaan gehaald bij een negatief event"
        Icon={SlidersHorizontal}
        badge="Potten"
        onEdit={openRegel('onttrekking-afname')}
      />
    </>
  )

  const marktAannameCards = (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
      <VoorkeurCard
        label="Inflatie"
        value={formatPct(fireParams.inflationRate)}
        subtitle="Jaarlijkse prijsstijging — index alle bedragen"
        Icon={TrendingUp}
        badge="Per jaar"
        onEdit={() =>
          setEditing({
            title: 'Inflatie',
            column: 'inflation_rate',
            currentValuePct: fireParams.inflationRate * 100,
            helperText: 'NL-default 2.5% per jaar. Past op alle euro-bedragen in de projectie.',
          })
        }
      />
      <VoorkeurCard
        label="Bruto rendement"
        value={formatPct(fireParams.grossReturn)}
        subtitle="Verwacht jaarrendement op het belegbaar vermogen"
        Icon={TrendingUp}
        badge="Per jaar"
        onEdit={() =>
          setEditing({
            title: 'Bruto rendement',
            column: 'expected_return',
            currentValuePct: fireParams.grossReturn * 100,
            helperText: 'Wereldwijde aandelen-historie: ~6-8%. Conservatief: 4-5%. Voorkeur per asset-groep op /overzicht/bezittingen.',
          })
        }
      />
      <VoorkeurCard
        label={
          <>
            Effectief <GlossaryTerm term="swr">SWR</GlossaryTerm>
          </>
        }
        value={formatPct(fireParams.effectiveSwr)}
        subtitle={
          <>
            <GlossaryTerm term="box_3">Box 3</GlossaryTerm>-gecorrigeerd
            reëel rendement (NL-specifiek)
          </>
        }
        Icon={Wallet}
        badge="Afgeleid"
        hint="Niet handmatig"
      />
    </div>
  )

  const marktAannamesIntro = (
    <p className="text-xs text-[var(--ink-3)]">
      Inflatie geldt op alle bedragen. Rendement per bezittingen-groep stel je in
      op{' '}
      <Link
        href="/overzicht/bezittingen"
        className="underline hover:text-[var(--ink-2)]"
      >
        /overzicht/bezittingen
      </Link>{' '}
      (cash, beleggen, huis, pensioen).
    </p>
  )

  // Leesregels bij ingeklapt: draag de hùidige waarde, zodat wegvouwen niet
  // opnieuw verbergt waar de motor mee rekent. Alles uit de bestaande props via
  // de bestaande formatters — geen tweede afleiding (consume, don't recompute).
  const eersteAfbouwPot = regelVoorkeuren.withdrawalOrderGroups[0]
  const overschotZin = `bij overschot ${surplusLabel(regelVoorkeuren.surplusGroup).toLowerCase()}`
  const potRegelsSummary = eersteAfbouwPot
    ? `Bij afbouw eerst ${WEALTH_GROUP_LABELS[eersteAfbouwPot].toLowerCase()} · ${overschotZin}`
    : `Bij overschot ${surplusLabel(regelVoorkeuren.surplusGroup).toLowerCase()}`

  const marktAannamesSummary = `Inflatie ${formatPct(
    fireParams.inflationRate,
  )} · rendement ${formatPct(fireParams.grossReturn)} · SWR ${formatPct(
    fireParams.effectiveSwr,
  )}`

  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-8 space-y-8">
      {/* Toekomst-regels */}
      <div>
        <header className="mb-4">
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            Toekomst — regels
          </div>
          <h2 className="font-serif text-xl text-[var(--ink)] mt-1">
            Regels op de hele tijdas
          </h2>
          <p className="mt-1 text-xs text-[var(--ink-3)]">
            Bepalen hoe je projectie zich gedraagt bij events en in de
            afbouw-fase. Klik een regel om uitleg, instellingen en impact te zien.
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <VoorkeurCard
            label="Eindstrategie"
            value={endStrategy?.name ?? fireStrategy.strategy}
            subtitle={
              ankerLabel ??
              endStrategy?.subtitle ??
              `Eindleeftijd ${fireStrategy.endAge}, doel ${
                fireStrategy.legacyAmount > 0 ? `€${fireStrategy.legacyAmount}` : '€0'
              }`
            }
            Icon={SlidersHorizontal}
            badge={`Tot ${fireStrategy.endAge} jaar`}
            onEdit={openRegel('eindstrategie')}
          />
          <VoorkeurCard
            label="Onttrekkingsstrategie"
            value={wsLabel.name}
            subtitle={wsLabel.subtitle}
            Icon={SlidersHorizontal}
            badge={
              withdrawalStrategy.strategy === 'guardrails'
                ? `Floor ${formatPct(withdrawalStrategy.guardrailFloor)} · Ceiling ${formatPct(withdrawalStrategy.guardrailCeiling)}`
                : undefined
            }
            onEdit={openRegel('onttrekkingsstrategie')}
          />
          {/* Pot-regels (3/4/5) — in Volledig directe grid-kinderen; in
              Eenvoudig achter de disclosure hieronder. */}
          {!simple && potRegelCards}
        </div>

        {simple && (
          <div className="mt-3 sm:mt-4">
            <DepthSection title="Pot-regels" summary={potRegelsSummary}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {potRegelCards}
              </div>
            </DepthSection>
          </div>
        )}
      </div>

      {/* Markt-aannames — in Eenvoudig ingeklapt mét leesregel, in Volledig
          exact de bestaande boom. */}
      {simple ? (
        <DepthSection title="Markt-aannames" summary={marktAannamesSummary}>
          {marktAannamesIntro}
          <div className="mt-4">{marktAannameCards}</div>
        </DepthSection>
      ) : (
        <div>
          <header className="mb-4">
            <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
              Toekomst — markt-aannames
            </div>
            <h2 className="font-serif text-xl text-[var(--ink)] mt-1">
              Algemene parameters
            </h2>
            <div className="mt-1">{marktAannamesIntro}</div>
          </header>

          {marktAannameCards}
        </div>
      )}

      <p className="text-[11px] italic text-[var(--ink-3)]">
        Klik op een regel of markt-aanname om uitleg, instellingen en impact te
        zien en bij te werken.
      </p>

      {/* Afbouw-overzicht — eindsaldo bij fireAge vs endAge. */}
      {fireAge != null && simRows && simRows.length > 0 && (
        <HideInSimple>
          {(() => {
            const fireRow = simRows.find((r) => r.age === fireAge) ?? simRows[0]
            const endRow = simRows.find((r) => r.age === fireStrategy.endAge) ?? simRows[simRows.length - 1]
            return (
              <AfbouwOverzichtCard
                fireAge={fireAge}
                endAge={fireStrategy.endAge}
                fireAgeBalance={fireRow?.endPortfolio ?? null}
                endBalance={endRow?.endPortfolio ?? null}
                strategy={fireStrategy.strategy}
              />
            )
          })()}
        </HideInSimple>
      )}

      {/* Markt-aanname-editor (inflatie/rendement). */}
      {editing && (
        <VoorkeurBewerkenSheet
          title={editing.title}
          column={editing.column}
          currentValuePct={editing.currentValuePct}
          helperText={editing.helperText}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Gedeeld bewerkscherm voor de 5 regels op de hele tijdas. */}
      <RegelBewerkenPane
        open={editingRegel !== null}
        regelId={editingRegel}
        onClose={closeRegel}
        onSaved={() => router.refresh()}
        simSnapshot={simSnapshot}
        fireStrategy={fireStrategy}
        firePlan={firePlan}
        withdrawalStrategy={withdrawalStrategy}
        potRules={regelVoorkeuren}
        potBalances={potBalances}
      />
    </section>
  )
}

function VoorkeurCard({
  label,
  value,
  subtitle,
  Icon,
  badge,
  onEdit,
  hint,
}: {
  label: React.ReactNode
  value: string
  subtitle: React.ReactNode
  Icon: typeof SlidersHorizontal
  badge?: string
  /** Wanneer aanwezig: card wordt button met inline-edit. Anders static. */
  onEdit?: () => void
  /** Footer-hint voor static cards (bv. 'Alleen in Plannen-modus'). */
  hint?: string
}) {
  const interactive = Boolean(onEdit)
  const cardClass =
    'rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5 flex flex-col text-left w-full' +
    (interactive ? ' cursor-pointer hover:border-[var(--ink-3)] hover:shadow-sm transition-all' : '')
  const cardInner = (
    <>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
          {label}
        </div>
        {onEdit ? (
          <Pencil className="w-3.5 h-3.5 text-[var(--ink-4)]" aria-hidden="true" />
        ) : (
          <Icon className="w-3.5 h-3.5 text-[var(--ink-4)]" aria-hidden="true" />
        )}
      </div>
      <div className="font-serif text-base sm:text-lg font-semibold text-[var(--ink)] tabular-nums">
        {value}
      </div>
      <p className="mt-1 text-xs text-[var(--ink-2)] leading-snug flex-1">
        {subtitle}
      </p>
      <div className="mt-3 flex items-center justify-between gap-2">
        {badge ? (
          <span className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--ink-3)] bg-[var(--subtle)] rounded-full px-2 py-0.5">
            {badge}
          </span>
        ) : (
          <span />
        )}
        {onEdit ? (
          <span className="text-[11px] font-semibold text-horizon-700 inline-flex items-center gap-1">
            Bijwerken
            <ArrowRight className="w-3 h-3" aria-hidden="true" />
          </span>
        ) : hint ? (
          <span className="text-[11px] italic text-[var(--ink-3)]">{hint}</span>
        ) : (
          <span />
        )}
      </div>
    </>
  )
  if (onEdit) {
    // role="button" i.p.v. <button>: de subtitle/label kan een interactieve
    // GlossaryTerm (<button>) bevatten — een button-in-button is ongeldige
    // HTML en veroorzaakt een hydration-mismatch.
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onEdit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onEdit()
          }
        }}
        className={cardClass}
      >
        {cardInner}
      </div>
    )
  }
  return <div className={cardClass}>{cardInner}</div>
}
