'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Target, Pencil, ArrowUpRight, MoreHorizontal, ChevronDown } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import {
  formatGoalValue,
  goalReachedFromProgress,
  GOAL_TYPE_META,
  type GoalProgress,
  type GoalType,
} from '@/lib/goal-data'
import { getGoalSuggestions } from '@/lib/goal-suggestions'
import type { GoalWithBudget } from '@/lib/fin-data-loader'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'
import { DoelToevoegenSheet } from './doel-toevoegen-sheet'
import { DoelBewerkenSheet } from './doel-bewerken-sheet'
import { DoelLoslatenConfirm } from './doel-loslaten-confirm'
import { ProgressMilestones } from '@/components/editorial/progress-milestones'
import { MilestoneCelebration, hasCelebrated } from '@/components/app/milestone-celebration'

/**
 * DoelenView — content voor de Doelen-tab op /toekomst.
 *
 * Plan §6.3 + Wealthfolio-leerles (§2.13): doelen krijgen status-flags
 *  - on-track  (groen): pct ≥ doel-percentage op datum
 *  - at-risk   (oranje): bijna doel maar tijd loopt
 *  - off-track (rood): te ver achter op planning
 *
 * Ronde 4 (§G) — "verkennen wordt richten": lab-gegenereerde parameter-doelen
 * (metadata.bron === 'parameter': spaarquote/salaris/rendement/vrijheidsleeftijd)
 * staan als eigen groep "Jouw doelsituatie" bovenaan. Ze zijn read-only in deze
 * lijst — klik opent het /toekomst-lab i.p.v. GoalForm — en de hele groep is in
 * één keer los te laten via de server-route. Handmatige doelen behouden hun
 * bestaande edit-gedrag (regressie-eis).
 *
 * Weergavemodus "Eenvoudig" (audit TOE-2): die tweedeling verdwijnt en alles
 * staat onder één kop "Je doelen" — de technische herkomst (afgeleid uit je
 * doelsituatie vs. handmatig ingevoerd) zegt de gebruiker niets. Dat is puur
 * een PRESENTATIE-keuze: dezelfde doel-objecten uit dezelfde bron, dezelfde
 * voortgang, alleen anders gegroepeerd. In "Volledig" blijft de tweedeling
 * ongewijzigd.
 *
 * Status-codering is identiek aan vier-hefbomen-kompas (groen/oranje/rood)
 * zodat het visuele verhaal in de app consistent blijft.
 */
type GoalDisplay = {
  goal: GoalWithBudget
  /** Canoniek doel-voortgangscontract (`computeGoalProgress`) — niet lokaal overtikken. */
  progress: GoalProgress
}

/**
 * Mirror van lib/fin-data-loader#isParameterGoal — bewust LOKAAL gedefinieerd
 * zodat deze client-component de server-side loader (supabase/server-imports)
 * niet in de client-bundle trekt. Triviale tag-check (géén financiële
 * herberekening); houd identiek aan de canonieke bron.
 */
function isParameterGoal(goal: GoalWithBudget): boolean {
  const m = goal.metadata
  return typeof m === 'object' && m !== null && (m as Record<string, unknown>).bron === 'parameter'
}

/**
 * Mirror van lib/goals/vrijheidsgetal-goal#isVrijheidsgetalGoal — om dezelfde
 * reden lokaal als `isParameterGoal` hierboven (die canonieke module trekt de
 * horizon-loader mee). Triviale tag-check; houd identiek aan de bron.
 */
function isVrijheidsgetalGoal(goal: GoalWithBudget): boolean {
  const m = goal.metadata
  return (
    typeof m === 'object' && m !== null && (m as Record<string, unknown>).standaardDoel === 'vrijheidsgetal'
  )
}

/**
 * Mirror van lib/goal-current-value#isAutoSyncMetricGoal — om dezelfde reden
 * lokaal als de twee mirrors hierboven: die module trekt via `loadForecastSectionData`
 * de complete server-loader-graaf mee, en dit is een triviale tag-check
 * (`metadata.sync === 'auto'`), geen financiële herberekening. Houd identiek aan
 * de canonieke bron.
 */
function isAutoSyncMetricGoal(goal: GoalWithBudget): boolean {
  const m = goal.metadata
  return typeof m === 'object' && m !== null && (m as Record<string, unknown>).sync === 'auto'
}

/**
 * Houdt de app dit doel ZELF bij? Drie bronnen, allemaal "je kunt hier geen
 * waarde in typen":
 *  - `links` (tabel `goal_links`) — gekoppeld aan bezittingen/schulden;
 *  - de legacy-kolommen `linked_asset_id`/`linked_debt_id` (niet-gemigreerde rijen);
 *  - `metadata.sync === 'auto'` — een doel op een kengetal uit een canonieke motor.
 *
 * NB: `links` is `undefined` zolang een loader ze niet meelevert; dat is iets
 * anders dan `[]`. Daarom blijven de legacy-kolommen hier meedoen.
 */
function isLiveGoal(goal: GoalWithBudget): boolean {
  return (
    (goal.links?.length ?? 0) > 0 ||
    !!goal.linked_asset_id ||
    !!goal.linked_debt_id ||
    isAutoSyncMetricGoal(goal)
  )
}

function formatMarge(v: number): string {
  return v.toLocaleString('nl-NL', { maximumFractionDigits: 1 })
}

/**
 * "Behaald 31 aug 2026" — of kaal "Behaald" wanneer er (nog) geen
 * `completed_at` staat. Doelen die vóór de completed_at-fix werden voltooid
 * dragen die datum niet; die krijgen dus geen verzonnen datum, maar de kale
 * vaststelling.
 */
function behaaldLabel(completedAt: string | null | undefined): string {
  if (!completedAt) return 'Behaald'
  const d = new Date(completedAt)
  if (Number.isNaN(d.getTime())) return 'Behaald'
  return `Behaald ${d.toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}`
}

function statusFor(progress: GoalDisplay['progress'], goalType?: GoalType): {
  label: string
  color: string
  bg: string
} {
  // "Behaald" volgt de CANONIEKE toets, niet het percentage. Bij een omlaag-doel
  // (vrijheidsleeftijd, schuldenvrij-datum, belastingdruk) rekent de voortgang
  // `target / current`; bij jaartallen rond 2030 staat dat quotiënt afgerond op
  // 100% zodra je er ergens in de buurt zit, ook als je er jaren naast zit.
  // Zonder deze toets zou de kaart permanent "Behaald" tonen terwijl het doel
  // nooit afsluit — scherm en werkelijkheid die elkaar tegenspreken.
  const behaald = goalType
    ? goalReachedFromProgress(goalType, progress)
    : progress.pct >= 100
  if (behaald) {
    return { label: 'Behaald', color: 'text-positive', bg: 'bg-positive/10' }
  }
  // Bevinding M31: een zojuist gesteld doel waarop nog niets binnenkwam heeft
  // geen meetbaar tempo. Het eerste dat de app erover zegt mag dan geen oordeel
  // zijn. Neutrale toon (geen stoplichtkleur) — de motor bepaalt WANNEER dit
  // geldt (`progress.measured`), dit scherm leidt dat niet zelf af uit `pct`.
  if (!progress.measured) {
    return { label: 'Net begonnen', color: 'text-[var(--ink-3)]', bg: 'bg-[var(--subtle)]' }
  }
  // Bevinding UR2-17: bij een live-getrackt STAND-doel (vrijheidsgetal, doelbasis)
  // is er geen tempo gemeten — de motor zegt dat zelf via `paceSkipped`, dit
  // scherm leidt het niet af uit het doeltype. "Op koers" zou daar een oordeel
  // claimen dat niet bestaat: de stand is het hele vermogen, niet de inleg sinds
  // aanmaak, dus de toets zou zelfs bij €0 inleg groen staan. Neutrale duiding in
  // dezelfde familie als "Net begonnen" — geen stoplichtkleur.
  if (progress.paceSkipped) {
    return { label: 'Loopt mee', color: 'text-[var(--ink-3)]', bg: 'bg-[var(--subtle)]' }
  }
  if (progress.onTrack) {
    return { label: 'Op koers', color: 'text-positive', bg: 'bg-positive/10' }
  }
  // at-risk: progress > 50% but not on-track
  if (progress.pct >= 50) {
    return { label: 'Aandacht', color: 'text-amber-700', bg: 'bg-amber-50' }
  }
  return { label: 'Achter op planning', color: 'text-negative', bg: 'bg-negative/10' }
}

/**
 * Kaart voor een parameter-doel (doelsituatie uit het lab). Read-only: klik
 * opent het lab i.p.v. een bewerk-sheet. Bewust een los component zodat zowel
 * de gegroepeerde weergave (Volledig) als de samengevoegde lijst (Eenvoudig)
 * exact dezelfde kaart rendert.
 */
function ParameterGoalCard({ goal, progress }: GoalDisplay) {
  const isFire = goal.goal_type === 'fire_age'
  const current = progress.current
  // "Nog geen meting": de consume-only bron kon (nog) geen actuele
  // stand leveren (0/null op dag 0). Toon dat eerlijk i.p.v. een
  // misleidende rood-status/0%.
  const measured = Number.isFinite(current) && current > 0
  const marge =
    typeof goal.metadata?.margeDoelJaren === 'number'
      ? (goal.metadata.margeDoelJaren as number)
      : null
  // Marge-status blijft bewust BUITEN deze lijst (live op /toekomst);
  // FIRE-kaart toont dus geen stoplicht-pill. Overige parameter-doelen
  // hergebruiken de bestaande statusweergave zodra er een meting is.
  const status = !isFire && measured ? statusFor(progress) : null
  const pct = Math.min(100, Math.max(0, Math.round(progress.pct)))
  return (
    <Link
      href="/toekomst#verken-je-aannames"
      aria-label={`Bekijk ${goal.name} in het lab`}
      className="block rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5 hover:border-[var(--ink-3)] hover:shadow-sm transition-all"
    >
      <header className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold text-[var(--ink)] leading-tight flex-1 min-w-0 truncate inline-flex items-center gap-1.5">
          {goal.name}
          <ArrowUpRight
            className="w-3 h-3 text-[var(--ink-4)] shrink-0"
            aria-hidden="true"
          />
        </h3>
        {status && (
          <span
            className={`text-[10px] uppercase tracking-[0.08em] font-semibold px-2 py-0.5 rounded-full ${status.bg} ${status.color} shrink-0`}
          >
            {status.label}
          </span>
        )}
      </header>

      {isFire && goal.notApplicableReason ? (
        /* ADR 0129 (bijlage "Doelen") — onder een VAST stopmoment heeft een
           vrijheidsleeftijd-doel geen uitkomst; de notitie komt uit
           `fireAgeGoalNotApplicableReason` via de goal-loader (consume-only). */
        <>
          <div className="flex items-baseline gap-1.5 mb-1">
            <span className="font-serif text-lg font-semibold text-[var(--ink)] tabular-nums">
              {`Doel: ${formatGoalValue(progress.target, 'fire_age')}`}
            </span>
          </div>
          <p data-testid="fire-age-doel-nvt" className="text-[11px] italic text-[var(--ink-3)] leading-snug">
            {goal.notApplicableReason}
          </p>
        </>
      ) : isFire ? (
        <>
          <div className="flex items-baseline gap-1.5 mb-1">
            <span className="font-serif text-lg font-semibold text-[var(--ink)] tabular-nums">
              {measured
                ? `nu ${formatGoalValue(current, 'fire_age')} → doel ${formatGoalValue(progress.target, 'fire_age')}`
                : `Doel: ${formatGoalValue(progress.target, 'fire_age')}`}
            </span>
          </div>
          <p className="text-[11px] italic text-[var(--ink-3)]">
            {measured
              ? marge != null
                ? `≥ ${formatMarge(marge)} jr marge — bekijk live in het lab`
                : 'bekijk live in het lab'
              : 'nog geen meting — bekijk live in het lab'}
          </p>
        </>
      ) : !measured ? (
        <>
          <div className="flex items-baseline gap-1.5 mb-1">
            <span className="font-serif text-lg font-semibold text-[var(--ink)] tabular-nums">
              {formatGoalValue(progress.target, goal.goal_type)}
            </span>
            <span className="text-xs text-[var(--ink-3)]">doel</span>
          </div>
          <p className="text-[11px] italic text-[var(--ink-3)]">
            nog geen meting — bekijk live in het lab
          </p>
        </>
      ) : (
        <>
          <div className="flex items-baseline gap-1.5 mb-2">
            <span className="font-serif text-lg font-semibold text-[var(--ink)] tabular-nums">
              {formatGoalValue(current, goal.goal_type)}
            </span>
            <span className="text-xs text-[var(--ink-3)]">
              van {formatGoalValue(progress.target, goal.goal_type)}
            </span>
          </div>
          <div
            className="relative h-1.5 rounded-full bg-[var(--subtle)] overflow-hidden mb-1"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Voortgang ${goal.name}: ${pct}%`}
          >
            <div
              className={`h-full ${
                pct >= 100
                  ? 'bg-positive'
                  : progress.onTrack
                    ? 'bg-positive'
                    : pct >= 50
                      ? 'bg-amber-500'
                      : 'bg-negative'
              } transition-all duration-700`}
              style={{ width: `${pct}%` }}
            />
            <ProgressMilestones className="bg-[var(--paper)]/70" />
          </div>
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-[var(--ink-3)] tabular-nums">{pct}%</span>
          </div>
        </>
      )}
    </Link>
  )
}

/**
 * Kaart voor een handmatig doel — klik opent de bewerk-sheet. Zelfde kaart in
 * beide weergavemodi (zie ParameterGoalCard).
 */
function ManualGoalCard({
  goal,
  progress,
  onEdit,
  live = false,
  linked = false,
  homeExcluded = null,
}: GoalDisplay & {
  onEdit: () => void
  live?: boolean
  linked?: boolean
  /**
   * Grondslag van het live vrijheidsgetal-doel: `true` = het doelbedrag telt de
   * eigen woning NIET mee (liquide portefeuille), `false` = wél. `null` =
   * onbekend (geen snapshot/geen live doel) ⇒ geen kwalificatie tonen, want een
   * verkeerd label is erger dan geen label. Zie UR2-17.
   */
  homeExcluded?: boolean | null
}) {
  // Houdt de app dit doel zelf bij? Dan is er geen waarde om in te typen — dat
  // hoort op de kaart te staan, in dezelfde ingetogen meta-regel-familie als de
  // parameter-doelen ("bekijk live in het lab"). `linked` komt van de loader
  // (`FinPageData.linkedGoalIds`); `isLiveGoal` dekt de gevallen waarin het doel
  // zijn koppeling/marker zélf draagt.
  const autoTracked = linked || isLiveGoal(goal)
  // Defensief: een niet-gemigreerde legacy-rij kan een type dragen dat niet in
  // GOAL_TYPE_META staat. `formatGoalValue` leest daar `meta.unit` op — zonder
  // deze guard zou zo'n rij de hele doelenlijst laten crashen i.p.v. terug te
  // vallen op de euro-weergave van vóór deze wijziging.
  const fmtValue = (v: number) =>
    GOAL_TYPE_META[goal.goal_type]
      ? formatGoalValue(v, goal.goal_type, goal.custom_unit)
      : formatCurrency(v)
  const status = statusFor(progress, goal.goal_type)
  const behaald = goalReachedFromProgress(goal.goal_type, progress)
  const pct = Math.min(100, Math.max(0, Math.round(progress.pct)))
  // Bevinding M32: het stoplicht rust voortaan op het benodigde maandbedrag tot
  // de streefdatum — toon dat bedrag erbij, anders is het oordeel niet
  // navolgbaar (en merk je niet dat een zwaarder doel de lat verhoogt).
  // Alleen bij doelen die in euro's lopen: "0,4% per maand nodig" op een
  // spaarquote-doel is een tempo van een tempo, geen behulpzaam getal.
  const requiredMonthly =
    progress.requiredMonthly != null &&
    progress.pct < 100 &&
    GOAL_TYPE_META[goal.goal_type]?.unit === 'EUR'
      ? progress.requiredMonthly
      : null
  // Kaart is een button die de edit-sheet opent. Geen genest-Link.
  return (
    <button
      type="button"
      onClick={onEdit}
      aria-label={`Bewerk doel ${goal.name}`}
      className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5 text-left w-full hover:border-[var(--ink-3)] hover:shadow-sm transition-all"
    >
      <header className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold text-[var(--ink)] leading-tight flex-1 min-w-0 truncate inline-flex items-center gap-1.5">
          {goal.name}
          <Pencil className="w-3 h-3 text-[var(--ink-4)] shrink-0" aria-hidden="true" />
        </h3>
        <span
          className={`text-[10px] uppercase tracking-[0.08em] font-semibold px-2 py-0.5 rounded-full ${status.bg} ${status.color} shrink-0`}
        >
          {status.label}
        </span>
      </header>
      {/* Eenheid-bewust formatteren: `formatCurrency` maakte van een
          schuldenvrij-datum "€ 2.035 van € 2.031" en van een vrijheidsleeftijd
          "€ 46 van € 55". `formatGoalValue` kent de eenheid van het type
          (euro's, procenten, maanden, jaren, datum) — zelfde bron als
          ParameterGoalCard. */}
      <div className="flex items-baseline gap-1.5 mb-2">
        <span className="font-serif text-lg font-semibold text-[var(--ink)] tabular-nums">
          {fmtValue(progress.current)}
        </span>
        <span className="text-xs text-[var(--ink-3)]">
          van {fmtValue(progress.target)}
        </span>
      </div>
      <div
        className="relative h-1.5 rounded-full bg-[var(--subtle)] overflow-hidden mb-1"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Voortgang ${goal.name}: ${pct}%`}
      >
        <div
          className={`h-full ${
            behaald
              ? 'bg-positive'
              : progress.onTrack
                ? 'bg-positive'
                : pct >= 50
                  ? 'bg-amber-500'
                  : 'bg-negative'
          } transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
        <ProgressMilestones className="bg-[var(--paper)]/70" />
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-[var(--ink-3)] tabular-nums">{pct}%</span>
        {progress.eta && (
          <span className="text-[var(--ink-3)]">{progress.eta}</span>
        )}
      </div>
      {requiredMonthly != null && (
        <p className="mt-1 text-[10px] text-[var(--ink-4)] tabular-nums">
          {formatCurrency(Math.round(requiredMonthly))} per maand nodig
        </p>
      )}
      {/* Bevinding C10: dit doel toont niet je ingevoerde bedragen maar een
          canonieke stand. Zonder dit regeltje lijkt de kaart handmatig bij te
          werken terwijl invoer genegeerd wordt. Eén regel, meest specifieke
          eerst — het vrijheidsgetal noemt zijn bron bij naam. */}
      {live ? (
        /* UR2-17: dit doelbedrag en het doelbedrag op /toekomst kunnen honderd-
           duizenden euro's schelen zonder dat er iets fout is — het ene telt de
           eigen woning mee, het andere niet. Zonder die kwalificatie leest het
           als een tegenspraak. Zelfde woordkeuze als de KPI op /toekomst
           ("met je huis" / "zonder je huis"), zodat de twee schermen elkaars
           taal spreken. Onbekend (null) ⇒ geen kwalificatie. */
        <p className="mt-1.5 text-[11px] italic text-[var(--ink-3)]">
          Volgt automatisch je vrijheidsgetal
          {homeExcluded === true
            ? ' — zonder je huis'
            : homeExcluded === false
              ? ' — met je huis'
              : ''}
        </p>
      ) : autoTracked ? (
        <p data-testid="doel-loopt-mee" className="mt-1.5 text-[11px] italic text-[var(--ink-3)]">
          Loopt automatisch mee — de app houdt deze stand bij
        </p>
      ) : null}
    </button>
  )
}

/**
 * BereiktArchief — behaalde handmatige doelen, onderaan de pagina en standaard
 * ingeklapt. Voorstel 3a: een behaald doel verdwijnt uit de actieve lijst (die
 * moet gaan over wat nog loopt) maar wordt niet weggegooid — het archief is het
 * bewijs dat er iets stáát. Native `<details>`-disclosure zoals elders in de
 * app: dicht by default, toetsenbord-bedienbaar zonder JS-state.
 *
 * Bewust géén voortgangsbalken of status-pills: die vertellen hier niets meer.
 * Naam, doelbedrag en de datum waarop het rond was — meer is het niet. Klikken
 * opent dezelfde bewerken-sheet als in de actieve lijst; daar zit de knop "Doel
 * weer openen" waarmee een doel het archief verlaat. (Verlagen van de waarde
 * doet dat ook, maar dat werkt alleen bij een doel dat je zelf bijhoudt — een
 * meelopend doel heeft geen invoerveld.)
 */
function BereiktArchief({
  items,
  onEdit,
}: {
  /** Behaalde doelen — kale rijen, geen voortgang (die zegt hier niets meer). */
  items: GoalWithBudget[]
  onEdit: (goal: GoalWithBudget) => void
}) {
  if (items.length === 0) return null
  return (
    <details
      data-testid="bereikt-archief"
      className="group mt-10 border-t border-[var(--border-ed)] pt-4"
    >
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <h2 className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)] transition-colors group-hover:text-[var(--ink-2)]">
          <ChevronDown
            className="h-3 w-3 shrink-0 transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
          Bereikt ({items.length})
        </h2>
      </summary>

      <p className="mt-2 text-[11px] italic text-[var(--ink-3)]">
        Wat je al hebt gehaald. Vrijheid die vaststaat.
      </p>

      <ul className="mt-3 border-t border-[var(--border-ed)]">
        {items.map((goal) => (
          <li key={goal.id} className="border-b border-[var(--border-ed)]">
            <button
              type="button"
              onClick={() => onEdit(goal)}
              aria-label={`Bewerk doel ${goal.name}`}
              className="flex w-full flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-1 py-2.5 text-left transition-colors hover:bg-[var(--subtle)]"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-[var(--ink)]">
                {goal.name}
              </span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--ink-2)]">
                {formatGoalValue(
                  Number(goal.target_value),
                  goal.goal_type,
                  goal.custom_unit,
                )}
              </span>
              <span className="shrink-0 text-[11px] italic text-[var(--ink-3)]">
                {behaaldLabel(goal.completed_at)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </details>
  )
}

export function DoelenView({
  goals,
  goalProgresses,
  completedGoals = [],
  monthlyIncome = 0,
  monthlyExpenses = 0,
  vrijheidsgetalLive = false,
  vrijheidsgetalHomeExcluded = null,
  linkedGoalIds,
  autoCompletedGoals,
}: {
  goals: GoalWithBudget[]
  goalProgresses: GoalDisplay['progress'][]
  /**
   * Behaalde doelen, APART aangeleverd (`FinPageData.completedGoals`): de
   * actieve `goals`-lijst is door `splitActiveGoals` al op `!is_completed`
   * gefilterd, dus behaald-uit-`goals`-afleiden levert per definitie niets
   * (review-🔴 31 aug 2026). Bron van het Bereikt-archief.
   */
  completedGoals?: GoalWithBudget[]
  /** Canonieke effectieve maand-cijfers uit de loader — voeden de gepersonaliseerde
   *  standaard-doelen-kiezer in DoelToevoegenSheet (consume, don't recompute). */
  monthlyIncome?: number
  monthlyExpenses?: number
  /** Draait het vrijheidsgetal-doel live op de FIRE-motor? (`FinPageData.vrijheidsgetalLive`) */
  vrijheidsgetalLive?: boolean
  /**
   * Grondslag van dat live doelbedrag (`FinPageData.vrijheidsgetalHomeExcluded`):
   * `true` = eigen woning telt NIET mee, `false` = wél, `null` = onbekend. Voedt
   * de kwalificatie "met/zonder je huis" op de doelkaart — zonder die regel
   * leest het verschil met /toekomst als een rekenfout (UR2-17).
   */
  vrijheidsgetalHomeExcluded?: boolean | null
  /**
   * Doelen met ≥1 koppeling in `goal_links` (`FinPageData.linkedGoalIds`). De
   * doel-rijen zelf dragen die koppelingen niet — ze leven in een aparte tabel —
   * dus zonder deze lijst kan de kaart niet zien dat de waarde meeloopt.
   * Optioneel: zonder de prop valt de kaart terug op wat het doel zélf draagt
   * (`links`, de legacy-kolommen, de auto-sync-marker).
   */
  linkedGoalIds?: string[]
  /**
   * Doelen die de SERVER afsloot omdat ze hun doelwaarde bereikten
   * (`FinPageData.autoCompletedGoals`) — meelopende doelen, waar geen
   * gebruikersactie aan te pas komt. Nieuwste eerst.
   *
   * Nodig omdat de viering hieronder van oudsher aan de bewerk-sheet hangt: die
   * roept `onCompleted` aan wanneer JIJ een waarde opslaat die het doel haalt.
   * Een doel dat meeloopt met je vermogen of je spaarquote passeert zijn doel
   * zonder dat je iets doet, en zou dus geruisloos in het archief belanden.
   * `MilestoneCelebration` bewaakt met dezelfde `celebrationKey` dat er per doel
   * maar één keer gevierd wordt, ook als beide paden hetzelfde doel aandragen.
   */
  autoCompletedGoals?: { id: string; name: string; goalType: string | null }[]
}) {
  const router = useRouter()
  const linkedIds = new Set(linkedGoalIds ?? [])
  // Weergavemodus: single source of truth (geen prop-drilling van de modus).
  const { mode } = useDisplayMode()
  const simple = mode === 'simple'

  // DoelToevoegenSheet = scenario-tool → alleen in Plannen-modus (plan A-5).
  // Edit-sheet state: het volledige Goal-object wordt doorgegeven zodat
  // de bewerken-sheet een GoalForm (volledig edit met asset/debt-link)
  // kan openen zonder extra DB-fetch.
  const [editingGoal, setEditingGoal] = useState<GoalWithBudget | null>(null)

  // Mijlpaal "doel behaald" — gezet zodra een doel bij het bijwerken de
  // 100%-overgang maakt. De viering zelf (once-guard per doel-id) zit in
  // MilestoneCelebration.
  //
  // De beginwaarde komt uit `autoCompletedGoals`: een meelopend doel dat zijn
  // doelwaarde haalde is server-side al afgesloten, dus er komt hier nooit een
  // `onCompleted` voor binnen. Eén tegelijk — een rij vieringen achter elkaar
  // devalueert ze alle drie.
  //
  // We nemen bewust het eerste doel dat op dit apparaat NOG NIET gevierd is, niet
  // simpelweg het nieuwste: sluiten er twee doelen kort na elkaar automatisch af,
  // dan zou het nieuwste zijn once-guard zetten en daarna bij elk bezoek de kop
  // van de lijst blijven — het tweede doel viel dan uit het venster zonder ooit
  // gevierd te zijn.
  const [reachedGoal, setReachedGoal] = useState<{
    id: string
    name: string
    goalType: string | null
  } | null>(() => autoCompletedGoals?.find((g) => !hasCelebrated(`goal-reached:${g.id}`)) ?? null)

  // Brug naar het volgende doel (voorstel 3b): een teller die DoelToevoegenSheet
  // van buitenaf opent. Elke verhoging = één open-verzoek; zie de prop-uitleg
  // daar waarom dit een teller is en geen boolean.
  const [toevoegenRequest, setToevoegenRequest] = useState(0)

  // Doelsituatie-groep: overflow-menu + loslaten-bevestiging.
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [releasing, setReleasing] = useState(false)
  const [releaseError, setReleaseError] = useState('')

  async function handleLoslaten() {
    setReleasing(true)
    setReleaseError('')
    try {
      const res = await fetch('/api/toekomst-doel', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'loslaten' }),
      })
      if (!res.ok) throw new Error('loslaten mislukt')
      setConfirmOpen(false)
      router.refresh()
    } catch {
      setReleaseError('Loslaten mislukt. Probeer het opnieuw.')
    } finally {
      setReleasing(false)
    }
  }

  // Koppel goals + progresses op index (loader garandeert parallel arrays;
  // parameter-doelen staan vooraan, buiten de max-5-slice).
  const all: GoalDisplay[] = goals
    .map((g, i) => ({ goal: g, progress: goalProgresses[i] }))
    .filter((d): d is GoalDisplay => d.progress != null)

  const parameterDisplay = all.filter((d) => isParameterGoal(d.goal))

  /**
   * Behaald-archief (voorstel 3a): behaalde handmatige doelen verlaten de
   * actieve lijst en verhuizen naar de ingeklapte sectie onderaan. Criterium is
   * bewust de OPGESLAGEN vlag `is_completed` — niet `progress.pct >= 100`. Die
   * twee kunnen uiteenlopen (een doel waarvan het doelbedrag ná voltooiing
   * verhoogd is staat op 100%+ noch voltooid, of andersom), en de vlag is wat de
   * gebruiker zelf heeft afgetekend. Parameter-doelen (doelsituatie) blijven
   * buiten deze splitsing: die zijn read-only en horen bij het lab.
   * Nieuwste eerst; doelen zonder `completed_at` sluiten achteraan aan.
   */
  const bereiktGoals = completedGoals
    .filter((g) => !isParameterGoal(g))
    .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))

  // Handmatige doelen — sorteer op status: off-track eerst zodat aandacht-
  // vereisende doelen bovenaan staan. Behaalde doelen zitten hier niet meer in.
  const manualDisplay = all
    .filter((d) => !isParameterGoal(d.goal) && !d.goal.is_completed)
    .sort((a, b) => {
      const aOff = !a.progress.onTrack && a.progress.pct < 100
      const bOff = !b.progress.onTrack && b.progress.pct < 100
      return Number(bOff) - Number(aOff)
    })

  /**
   * Eenvoudig (TOE-2) — één lijst "Je doelen".
   *
   * SORTEERKEUZE (bewust, niet toevallig): doelsituatie-doelen eerst, daarna de
   * handmatige doelen in hun bestaande volgorde (off-track bovenaan). Reden: je
   * doelsituatie is het anker waar alle andere doelen onder hangen — die hoort
   * bovenaan te blijven, ook als hij "op koers" staat. Binnen de handmatige
   * doelen blijft aandacht-eerst gelden, precies zoals in Volledig. Er wordt
   * hier NIETS herberekend of hersorteerd op waarde: dezelfde objecten,
   * dezelfde voortgang, alleen zonder de herkomst-scheiding.
   */
  const mergedDisplay = [...parameterDisplay, ...manualDisplay]

  // Volledig leeg = géén actieve doelen ÉN niets bereikt. Wie alles al haalde
  // krijgt niet de starters-lege-staat maar de gewone lay-out mét het
  // Bereikt-archief (de lege-actieve-lijst-tekst verwijst er dan naar).
  if (all.length === 0 && bereiktGoals.length === 0) {
    return (
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-8">
        <article className="rounded-2xl border border-dashed border-[var(--border-md)] bg-[var(--paper)] p-6 sm:p-8 text-center">
          <span className="inline-flex w-10 h-10 rounded-xl bg-horizon-50 items-center justify-center mb-3">
            <Target className="w-5 h-5 text-horizon-700" aria-hidden="true" />
          </span>
          <h2 className="font-serif text-xl text-[var(--ink)] mb-2">
            Nog geen doelen
          </h2>
          <p className="text-sm text-[var(--ink-2)] leading-relaxed mb-4">
            Formuleer je eerste financiële doel — sparen voor de eerste
            woningfondsbijdrage, schuldvrij worden, of je FIRE-getal
            bereiken. Doelen worden hier zichtbaar met status-flags zodat
            je weet hoe je ervoor staat.
          </p>
          <DoelToevoegenSheet monthlyIncome={monthlyIncome} monthlyExpenses={monthlyExpenses} />
        </article>
      </section>
    )
  }

  const manualCount = manualDisplay.length
  const manualHeading =
    manualCount === 0
      ? 'Eigen doelen'
      : `${manualCount} ${manualCount === 1 ? 'actief doel' : 'actieve doelen'}`

  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-8">
      {/* ── Groep: Jouw doelsituatie (lab-parameter-doelen) — alleen Volledig ── */}
      {!simple && parameterDisplay.length > 0 && (
        <div className="mb-8">
          <header className="mb-2 flex items-end justify-between gap-3 flex-wrap">
            <div>
              <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
                Toekomst — doelsituatie
              </div>
              <h2 className="font-serif text-xl text-[var(--ink)] mt-1">
                Jouw doelsituatie
              </h2>
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="Doelsituatie-opties"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:text-[var(--ink)] hover:border-[var(--ink-3)] transition-colors"
              >
                <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
              </button>
              {menuOpen && (
                <>
                  {/* Klik-buiten-vanger */}
                  <button
                    type="button"
                    aria-hidden="true"
                    tabIndex={-1}
                    onClick={() => setMenuOpen(false)}
                    className="fixed inset-0 z-0 cursor-default"
                  />
                  <div
                    role="menu"
                    className="absolute right-0 top-9 z-10 w-56 rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] shadow-lg py-1"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false)
                        setConfirmOpen(true)
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-negative hover:bg-negative/10"
                    >
                      Doelsituatie loslaten
                    </button>
                  </div>
                </>
              )}
            </div>
          </header>
          <p className="mb-4 text-[11px] italic text-[var(--ink-3)]">
            Je vastgelegde aannames uit het lab. Klik een kaart om ze live te
            verkennen op de tijdas.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {parameterDisplay.map((d) => (
              <ParameterGoalCard key={d.goal.id} goal={d.goal} progress={d.progress} />
            ))}
          </div>
        </div>
      )}

      {/* ── Doelen — Eenvoudig: één lijst; Volledig: alleen de handmatige ── */}
      <header className="mb-4 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            Toekomst — doelen
          </div>
          <h2 className="font-serif text-xl text-[var(--ink)] mt-1">
            {simple ? 'Je doelen' : manualHeading}
          </h2>
        </div>
        <DoelToevoegenSheet
          monthlyIncome={monthlyIncome}
          monthlyExpenses={monthlyExpenses}
          openRequest={toevoegenRequest}
        />
      </header>

      {simple && mergedDisplay.length === 0 ? (
        <p className="text-sm text-[var(--ink-2)] leading-relaxed">
          Je hebt op dit moment geen lopend doel. Wat je al haalde staat onderaan
          bij Bereikt — kies hierboven je volgende.
        </p>
      ) : simple ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {mergedDisplay.map((d) =>
            isParameterGoal(d.goal) ? (
              <ParameterGoalCard key={d.goal.id} goal={d.goal} progress={d.progress} />
            ) : (
              <ManualGoalCard
                key={d.goal.id}
                goal={d.goal}
                progress={d.progress}
                onEdit={() => setEditingGoal(d.goal)}
                live={vrijheidsgetalLive && isVrijheidsgetalGoal(d.goal)}
                homeExcluded={vrijheidsgetalHomeExcluded}
                linked={linkedIds.has(d.goal.id)}
              />
            ),
          )}
        </div>
      ) : manualCount === 0 ? (
        <p className="text-sm text-[var(--ink-2)] leading-relaxed">
          Je hebt nog geen eigen doelen naast je doelsituatie. Formuleer een
          spaardoel, aflossingsdoel of vermogensgroeidoel om je voortgang hier
          te volgen.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {manualDisplay.map((d) => (
            <ManualGoalCard
              key={d.goal.id}
              goal={d.goal}
              progress={d.progress}
              onEdit={() => setEditingGoal(d.goal)}
              live={vrijheidsgetalLive && isVrijheidsgetalGoal(d.goal)}
              homeExcluded={vrijheidsgetalHomeExcluded}
              linked={linkedIds.has(d.goal.id)}
            />
          ))}
        </div>
      )}

      <p className="mt-6 text-[11px] italic text-[var(--ink-3)]">
        {simple
          ? 'Klik op een doel om je voortgang bij te werken.'
          : 'Klik op een doel om voortgang bij te werken of het te verwijderen. Naam, bedrag, datum en koppelingen wijzig je daar via "Volledig bewerken".'}
      </p>

      {/* ── Bereikt — behaalde doelen, ingeklapt onderaan (voorstel 3a) ── */}
      <BereiktArchief items={bereiktGoals} onEdit={(g) => setEditingGoal(g)} />

      {editingGoal && (
        <DoelBewerkenSheet
          goal={editingGoal}
          onClose={() => setEditingGoal(null)}
          onCompleted={(g) => setReachedGoal(g)}
        />
      )}

      {reachedGoal && (
        <MilestoneCelebration
          celebrationKey={`goal-reached:${reachedGoal.id}`}
          title={
            <>
              Doel behaald: <em>{reachedGoal.name}</em>.
            </>
          }
          meaning="Je hebt gehaald wat je jezelf voornam — een stuk vrijheid dat nu vaststaat."
          /* Voorstel 3b — de brug. Zonder een volgend doel zakt de motivatie na
             een behaald doel in; de knop is het punt, de suggestieregel de kers.
             Suggestietekst komt ongewijzigd uit lib/goal-suggestions (geen
             nieuw geformuleerd advies); is er geen suggestie voor dit type,
             dan staat de knop er alleen. */
          action={
            <div className="flex flex-col items-center gap-2.5">
              {(() => {
                const suggestie = getGoalSuggestions(reachedGoal.goalType, 1)[0]
                return suggestie ? (
                  <p
                    data-testid="volgend-doel-suggestie"
                    className="max-w-[34ch] font-serif text-[13px] italic leading-snug text-[var(--ink-3)]"
                  >
                    {suggestie.text}
                  </p>
                ) : null
              })()}
              <button
                type="button"
                onClick={() => {
                  setReachedGoal(null)
                  setToevoegenRequest((n) => n + 1)
                }}
                className="inline-flex items-center gap-1.5 border border-[var(--module-active-500)] px-3 py-1.5 text-xs font-semibold text-[var(--module-active-700)] transition-colors hover:bg-[var(--subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--module-active-500)]"
              >
                Kies je volgende doel
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          }
          onDismiss={() => setReachedGoal(null)}
        />
      )}

      <DoelLoslatenConfirm
        open={confirmOpen}
        busy={releasing}
        error={releaseError}
        onConfirm={handleLoslaten}
        onClose={() => setConfirmOpen(false)}
      />
    </section>
  )
}
