import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadDashboardData } from '@/lib/dashboard-data-loader'
import { withCanonicalOverviewFigures } from '@/lib/overview/canonical-health'
import { loadFinData } from '@/lib/fin-data-loader'
import { computeHorizonRunway } from '@/lib/fire-target-shared'
import type { HorizonPageData } from '@/lib/horizon-data-loader'
import type { Perspective } from '@/lib/household-data'
import {
  composeOverviewBriefing,
  summarizeRunway,
  hasRunwayMoved,
  buildBriefingHeadline,
  loadLatestCheckinForBriefing,
} from '@/lib/briefing/overview-briefing'
import { getOrCreateWeeklySnapshot, canRefreshToday, refreshStateToday } from '@/lib/briefing/snapshot'
import { BRIEFING_ROTATION_COOKIE, parseRotationOffset } from '@/lib/briefing/rotation'
import { loadTopMarketBriefing } from '@/lib/briefing/news-market'
import { collectAandachtspunten } from '@/lib/aandachtspunten-loader'
import type { Aandachtspunt } from '@/lib/aandachtspunten'
import { resolveFreedomAgeView, fireAgeForDisplay, isAtOrPastAow, isFixedAnchor, type FreedomFraming } from '@/lib/fire-strategy'
import { ankerReachFromRunway, ankerStopFromSim, type AnkerReach, type AnkerStop } from '@/lib/horizon/anker-copy'
import { computeHorizonSolvedFireAge } from '@/lib/fire-target-shared'
import { PageStatusSeed } from '@/components/app/page-status-provider'
import { computePageStatusInfo, readMinimizedLevel } from '@/lib/page-status/compute'
import type { BriefingWeekHistoryItem } from '@/components/overview/briefing-panel'
import type { BriefingRefreshState } from '@/lib/types/briefing'
import type { HefbomenHousingSplit } from './overzicht-hero/hefbomen-nav'
import { MiniNetWorthChart } from './mini-networth-chart'
import { dailyExpenseRate } from '@/lib/format'
import { runMilestoneDetection } from '@/lib/milestones/run'
import { isFarHorizonGoal } from '@/lib/milestones/detect'
import { isParameterGoal } from '@/lib/goal-current-value'
import { reconcileAutoCompletedGoals } from '@/lib/goals/auto-complete'
import { GOAL_TYPE_META } from '@/lib/goal-data'
import type { AchievedMilestoneRow } from '@/lib/milestones/types'
import { buildMilestoneCopy } from '@/lib/milestones/copy'
import { withFreshMilestone } from '@/lib/briefing/milestone-entry'
import { hasInvestedAssets } from '@/lib/dashboard-wealth-weighting'
import { OverzichtSecondary } from './overzicht-secondary'

// Stabiele lege-array-referentie voor de mini-vermogen-grafiek — voorkomt dat
// een verse `[]` de memo op MiniNetWorthChart breekt.
const EMPTY_NET_WORTH_HISTORY: { month: string; value: number }[] = []

/**
 * Doelnaam voor een `doel`-mijlpaal (behaald of checkpoint). De log-rij draagt
 * bewust geen naam; de sleutelvormen zijn `doel-behaald:<id>` en
 * `doel-checkpoint:<id>:<pct>`. Onbekend doel (verwijderd, ander type) → null,
 * de copy blijft dan generiek.
 */
function resolveFreshGoalName(
  row: { milestone_key: string } | null,
  goals: { id: string; name: string; user_id: string }[],
  userId: string | null,
): string | null {
  if (!row || !userId) return null
  const match = row.milestone_key.match(/^doel-(?:behaald|checkpoint):([^:]+)/)
  if (!match) return null
  // Eigenaarscheck als defence-in-depth: de goals-lijst is huishoud-gescoopt
  // (own-or-shared) en de log is append-only — een naam van een partner-doel
  // mag hier nooit aan een eigen mijlpaal-rij hangen, ook niet bij een
  // toekomstige regressie in de sleutel-productie.
  return goals.find((g) => g.id === match[1] && g.user_id === userId)?.name ?? null
}

/**
 * OverzichtSecondaryLoader — async server-child achter de `<Suspense>` op
 * /overzicht (perf Task 2.4). Dit blok bevat de ZWARE laadstap
 * (`loadDashboardData` — kernel/backtest/aandachtspunten — plus will, markt-/
 * check-in-briefing, page-status-seed en de wekelijkse snapshot). Het eerste
 * blok (`OverzichtHeroPrimary`) rendert al zónder hierop te wachten; deze data
 * komt er gestroomd achteraan.
 *
 * DEDUP: `horizonData` (+ de daaruit afgeleide kerngetallen) komt kant-en-klaar
 * uit blok 1 mee als prop — hier draait GEEN tweede horizon-/lever-load. De
 * enige overlap is `loadDashboardData`, dat óók door `computePageStatusInfo`
 * (familie 'freedom') wordt aangeroepen: beide delen dezelfde React-`cache()`-
 * wrapper, dus er draait één query-set per request.
 *
 * CONSUME, DON'T RECOMPUTE: alle kerngetallen (freedomPct, vrijheidstijd,
 * spaarritme, framing) worden hier alleen SAMENGESTELD uit de loaders — niet
 * herberekend. Byte-identiek aan de vroegere in-page-render, alleen gefaseerd.
 */
export async function OverzichtSecondaryLoader({
  supabase,
  perspective,
  userId,
  horizonData,
  freedomPct,
  currentAge,
  currentNetWorth,
  liquidCash,
}: {
  supabase: SupabaseClient
  perspective: Perspective
  userId: string | null
  /**
   * De volledige canonieke Horizon-bundel uit blok 1. Levert niet alleen de
   * briefing-context maar óók de drie kerngetallen die de widget-bundel
   * overschrijven (`withCanonicalOverviewFigures`): gezondheidsscore,
   * vrijheids-% en noodfonds. Vandaar dat er geen losse `health`-prop meer is.
   */
  horizonData: HorizonPageData | null
  freedomPct: number | null
  currentAge: number | null
  /** Netto vermogen (perspectief-correct, blok 1) — basis voor de vrijheidstijd-briefing. */
  currentNetWorth: number
  liquidCash: number
}) {
  const [
    dashboardResult,
    finData,
    aandachtspunten,
    marketEntry,
    checkinForBriefing,
    pageStatusInfo,
    pageStatusMinimized,
    cookieStore,
    runway,
  ] = await Promise.all([
    loadDashboardData(supabase),
    loadFinData(supabase),
    // Aandachtspunten-bus voedt de briefing (zwaarste punt als briefje).
    collectAandachtspunten(supabase).catch(() => [] as Aandachtspunt[]),
    // Markt-briefje + laatste check-in-reflectie (read-only; hangen van user-id af).
    userId ? loadTopMarketBriefing(supabase, userId) : Promise.resolve(null),
    userId ? loadLatestCheckinForBriefing(supabase, userId) : Promise.resolve(undefined),
    // Status-duiding-banner-seed: consumeert dezelfde loadDashboardData (React-
    // cache() → gratis binnen deze batch) en hangt verder van de route/user-id af.
    computePageStatusInfo(supabase, '/overzicht'),
    userId ? readMinimizedLevel(supabase, userId, '/overzicht') : Promise.resolve(null),
    // Rotatiecursor van de briefing in Eenvoudig — een cookie, zodat de server
    // meteen het juiste venster rendert (zie lib/briefing/rotation.ts).
    cookies(),
    // De "stop nu"-runway voor de kop-zin (ADR 0126, PR B): één extra kernel-run op
    // FIRE-maand 0 op de PERSPECTIEF-CORRECTE rauwe context van de gedeelde FIRE-run
    // (`computeHorizonFireSim`, React-cache() → die basisrun kost hier niets extra).
    // LIVE, elk request opnieuw (UR2-09) — nooit uit de week-snapshot.
    computeHorizonRunway(supabase, perspective),
  ])

  const { dashboardData: rawDashboardData, activeWidgets, allWidgetPrefs } = dashboardResult

  const briefingRotation = parseRotationOffset(
    cookieStore.get(BRIEFING_ROTATION_COOKIE)?.value,
  )

  // Kerngetallen — consume, don't recompute (zie lib/overview/canonical-
  // health.ts). De widget-bundel leidt gezondheidsscore, vrijheids-% én
  // noodfonds onafhankelijk af en altijd persoonlijk → afwijking van de hero en
  // de kassabon (bevinding H4). Laat de widgets en de briefing de canonieke,
  // perspectief-correcte waarden uit horizonData (blok 1) tonen.
  const dashboardData = withCanonicalOverviewFigures(rawDashboardData, horizonData)

  // Perspectief-override voor de getallen die uit dashboardData komen (freedom-
  // time-uitgaven + briefing). Vermogen/vrijheid% komen al perspectief-correct
  // uit horizonData. Null in eigen weergave → alles byte-identiek aan voorheen.
  const perspectiveOverride =
    perspective === 'household' ? dashboardData.householdOverrides
    : perspective === 'partner' ? dashboardData.partnerOverrides
    : null

  // Wekelijkse briefing — verrijkte engine (finance-bronnen) + snapshot.
  // In huishoud-/partnerweergave compose't de briefing met de perspectief-
  // inkomsten/-uitgaven.
  const briefingDashboardData = perspectiveOverride
    ? {
        ...dashboardData,
        monthlyIncome: perspectiveOverride.monthlyIncome,
        monthlyExpenses: perspectiveOverride.monthlyExpenses,
      }
    : dashboardData
  const composedBriefing = composeOverviewBriefing(
    briefingDashboardData,
    finData,
    horizonData,
    new Date(),
    marketEntry ?? undefined,
    aandachtspunten,
    checkinForBriefing,
    // ADR 0129 F3b — onder een vast anker noemt de FIRE-observatie het bereik.
    runway,
  )
  // Het week-MEETPUNT is sinds ADR 0126 PR C de RUNWAY, niet meer de platte
  // deling (netto vermogen ÷ dagtarief). Eén duiding van de live kernel-run van
  // dit request, gedeeld door drie dingen:
  //   1. de kop-zin naast de masthead (`buildBriefingHeadline`, hieronder),
  //   2. het bevroren meetpunt in de weeksnapshot (voedt de briefing-e-mail),
  //   3. het versheidssignaal onder de "Bijgewerkt …"-stempel.
  // Dat (1) en (3) nu dezelfde grootheid meten is de kern van PR C: vóórdien
  // vergeleek het signaal de platte deling terwijl de kop de runway toonde, dus
  // meldde het "je cijfers zijn veranderd" terwijl de zin gelijk bleef — en
  // omgekeerd.
  //
  // `null` = geen claim (tekort, geen geboortedatum, geen geloofwaardige
  // uitgavenbasis, of een D7-inconsistentie in de kernel-run). Dan wordt er ook
  // geen meetpunt bevroren en toont de e-mail geen vrijheidsblok.
  const runwayPoint = summarizeRunway(runway)
  let briefingEntries = composedBriefing
  let briefingRefreshedAt: string | null = null
  let briefingCanRefresh = false
  // L9: default 'available' — in huishoud-/partnerweergave bestaat er geen
  // persoonlijke snapshot, dus dan hoort de knop helemaal niet te verschijnen
  // (canRefresh blijft false EN de staat is niet 'used_today'). Alleen in eigen
  // weergave dragen we de echte reden mee.
  let briefingRefreshState: BriefingRefreshState = 'available'
  let briefingDataChanged = false
  let briefingWeekHistory: BriefingWeekHistoryItem[] | undefined
  // Kop-zin uit de LIVE "stop nu"-runway van dit request (UR2-09, ADR 0126): een
  // echte onttrekkingsprojectie uit dezelfde kernel-familie als de vrijheids-
  // leeftijd op dit scherm — geen platte deling meer. Een AI-kop uit de
  // week-snapshot mag 'm overschrijven — die is expliciet gedateerd met de
  // "Bijgewerkt …"-stempel; de deterministische zin was dat niet en claimde
  // daarom stilzwijgend een bevroren getal.
  let briefingHeadline: string | null = buildBriefingHeadline(runway)
  // Weekly snapshot + briefing-freeze blijven PERSOONLIJK. In huishoud-/partner-
  // weergave geen snapshot-write.
  let freshMilestoneRow: AchievedMilestoneRow | null = null
  if (userId && perspective === 'personal') {
    // NB: bij het eerste bezoek van een nieuwe ISO-week (en bij een gepasseerde
    // mijlpaal) schrijft dit blok data weg tíjdens de RSC-render. Dat is bewust
    // en veilig, en de invariant is: uitsluitend PURE, idempotente data-writes
    // zonder sessie-/cookie-effect (ADR 0123) — nooit met een sessie-refresh
    // combineren. Twee writes leven hier: (1) de mijlpaal-detectie (log-append,
    // idempotent via UNIQUE-sleutel), (2) de weeksnapshot (idempotent per week).
    // In het streamende blok verandert dat niet — beide gebeuren server-side
    // vóór dit blok naar de client wordt gestroomd.
    //
    // Write (3): doelen die hun doelwaarde LIVE hebben gehaald daadwerkelijk
    // afsluiten (lib/goals/auto-complete.ts). Dit is de ENIGE plek waar dat
    // gebeurt, en bewust niet in `loadFinData`: die leesloader heeft vijf
    // aanroepsites — waaronder de briefing-refresh-POST — en de datapad-
    // conventie (ADR 0058) houdt lezen en muteren gescheiden. Hier staat de al
    // bestaande, ADR-0123-gesanctioneerde in-render-schrijfnaad: own-row,
    // idempotent, nooit fataal, persoonlijk perspectief.
    //
    // VÓÓR de detectie, en awaited: de functie markeert de doelrijen ook
    // in-memory, zodat de checkpoint-filter hieronder (`!goal.is_completed`) een
    // zojuist afgesloten doel niet alsnog een 75%-checkpoint geeft. Zonder te
    // sluiten doelen draait er geen enkele query.
    const autoCompletedGoals = await reconcileAutoCompletedGoals(
      supabase,
      userId,
      finData.goals,
      new Set(finData.linkedGoalIds),
    )

    // Mijlpaal-detectie (ADR 0123): consume-don't-recompute — vijf canonieke
    // waarden in, sleutels uit. Gooit nooit; faalt naar null. ALLEEN wanneer
    // horizonData er is: zonder horizon geeft `withCanonicalOverviewFigures` de
    // rauwe bundel terug (de niet-canonieke freedomPct/noodfonds-afleiding), en
    // een op die tweede grondslag gedetecteerde mijlpaal is nooit meer uit de
    // DELETE-loze log te krijgen. Dan liever een load géén detectie.
    const detectionPromise = horizonData
      ? runMilestoneDetection(
          supabase,
          userId,
          {
            // BEWUST currentNetWorth (blok 1, persoonlijk/hero-grondslag) en NIET
            // dashboardData.netWorth: die bundelsom is RLS-breed en telt gedeelde
            // partner-bezittingen voor 100% mee, terwijl de seed-datering uit
            // net_worth_snapshots op eigen rijen staat. Eén grondslag voor toets én
            // datering — en het gevierde getal is het getal dat de hero toont.
            netWorth: currentNetWorth,
            freedomPct: dashboardData.freedomPct ?? null,
            // BEWUST dashboardData.totalDebts (RLS-breed, huishoud-som) en NIET
            // een persoonlijke schuldsom naast currentNetWorth hierboven — anders
            // dan bij netWorth is dit hier een defensieve keuze, geen pariteits-
            // fout: een "schuldenvrij"-mijlpaal viert pas wanneer het HELE
            // huishouden op € 0 schuld staat, niet zodra het eigen aandeel dat
            // doet terwijl een partner nog schuld draagt (restpunt B3,
            // release-review 31 aug).
            totalDebts: dashboardData.totalDebts,
            emergencyFundMonthsCovered: dashboardData.emergencyFund?.monthsCovered ?? null,
            emergencyFundTargetMonths: dashboardData.emergencyFund?.targetMonths ?? null,
          },
          // BRON = completedGoals, NIET finData.goals: de actieve lijst is door
          // splitActiveGoals al op !is_completed gefilterd, dus daar behaalde
          // doelen uit vissen levert per definitie niets (review-rood 31 aug).
          // Expliciet op eigen doelen filteren: de lijst is huishoud-gescoopt
          // (own-or-shared), en een partner-doel-id zou hier anders permanent
          // als eigen mijlpaal gelogd worden (review H1).
          // De doelen die deze render zojuist automatisch zijn afgesloten gaan
          // er expliciet bij: ze zaten bij het laden nog in de ACTIEVE lijst en
          // staan dus niet in `finData.completedGoals`. Zonder deze samenvoeging
          // zou een auto-behaald doel pas bij het vólgende bezoek een
          // mijlpaal-rij krijgen. `reconcileAutoCompletedGoals` scoopt zelf al
          // op `user_id`, dus de H1-filter is daar niet nogmaals nodig.
          [
            ...finData.completedGoals
              .filter((g) => g.user_id === userId)
              .map((g) => ({ id: g.id, completedAt: g.completed_at ?? null })),
            ...autoCompletedGoals.map((g) => ({ id: g.id, completedAt: g.completedAt })),
          ],
          // Checkpoint-doelen (plan 3c): actieve, EIGEN, verre doelen met hun
          // canonieke voortgang (goalProgresses is index-gekoppeld aan goals —
          // lib/fin-data-loader.ts r270). Zelfde H1-scoping als hierboven.
          finData.goals
            .map((g, i) => ({ goal: g, progress: finData.goalProgresses[i] }))
            .filter(
              ({ goal, progress }) =>
                progress != null &&
                !goal.is_completed &&
                goal.user_id === userId &&
                // Parameterdoelen (lab-doelsituatie) EXPLICIET uitsluiten — niet
                // leunen op het toeval dat ze geen target_date dragen: een
                // checkpoint op een direction:'down'-doel als vrijheidsleeftijd
                // is semantisch onzin en de log is append-only (review-M3/3c).
                !isParameterGoal(goal) &&
                // ÉN de richting zelf uitsluiten, niet alleen de herkomst (ADR
                // 0125). `!isParameterGoal` dekte 'down' vroeger per toeval: het
                // enige down-type was `fire_age`, en dat was lab-exclusief. Nu
                // kan een gebruiker zelf een down-doel maken (vrijheidsleeftijd,
                // schuldenvrij-datum, belastingdruk) mét streefdatum, en dan
                // klopt de checkpoint-rekensom niet: `pct = target/current` staat
                // bij zo'n doel al hoog wanneer je er nog ver vanaf zit (doel
                // 2031 vs. huidig 2035 = 99,8%), zodat 25/50/75% in één run
                // tegelijk zouden vuren — permanent, want de log is append-only.
                GOAL_TYPE_META[goal.goal_type]?.direction !== 'down' &&
                isFarHorizonGoal(goal.target_date, goal.created_at ?? null, new Date()),
            )
            .map(({ goal, progress }) => ({
              id: goal.id,
              name: goal.name,
              progressPct: progress.pct,
            })),
        )
      : Promise.resolve({ fresh: null })
    // Parallel met de weeksnapshot: de twee writes raken verschillende tabellen
    // en zijn onafhankelijk — alleen de brieifing-injectie moet ná de snapshot.
    const [milestoneRun, { snapshot }] = await Promise.all([
      detectionPromise,
      getOrCreateWeeklySnapshot(supabase, userId, composedBriefing, {
        freedom: runwayPoint
          ? { ...runwayPoint, capturedAt: new Date().toISOString() }
          : undefined,
      }),
    ])
    freshMilestoneRow = milestoneRun.fresh
    // Verse mijlpaal ná de week-freeze injecteren (ADR 0123 §6): de snapshot
    // bevriest de briefing per ISO-week — zonder injectie zou een mijlpaal van
    // dinsdag pas de week erop zichtbaar worden.
    briefingEntries = withFreshMilestone(
      snapshot.entries,
      freshMilestoneRow,
      dashboardData.dailyExpenseRate ?? null,
      new Date(),
      { goalName: resolveFreshGoalName(freshMilestoneRow, [...finData.goals, ...finData.completedGoals], userId) },
    )
    briefingRefreshedAt = snapshot.refreshedAt
    briefingCanRefresh = canRefreshToday(snapshot)
    briefingRefreshState = refreshStateToday(snapshot)
    briefingWeekHistory = snapshot.history
    // Versheidssignaal onder de "Bijgewerkt …"-stempel: is de runway sinds het
    // bevriezen van deze week méér dan een hele maand verschoven (of van soort
    // veranderd)? Zelfde grootheid als de zichtbare kop-zin, zodat het signaal
    // en de zin niet meer uit elkaar kunnen lopen (ADR 0126 PR C). Een snapshot
    // in de pre-PR-C-vorm levert `freedomSnapshot: undefined`: dan is de bevroren
    // stand onbekend en meldt het signaal bewust NIETS — een "je cijfers zijn
    // veranderd" zonder vergelijkbare basis is een vals alarm. Zelfherstellend bij
    // de eerstvolgende week-freeze.
    briefingDataChanged = snapshot.freedomSnapshot
      ? hasRunwayMoved(runwayPoint, snapshot.freedomSnapshot)
      : false
    if (snapshot.headline) briefingHeadline = snapshot.headline
  }

  // Vrijheidsleeftijd voor de Vrijheid-strip (de mini-vermogen-grafiek zelf
  // laadt los, zie OverzichtNetWorthChartLoader) én de afgeleide vrijheids-/
  // pensioenframing. Consume-only (ADR 0009): geen herberekening — freedomPct/
  // currentAge komen uit blok 1, de leeftijd uit de bundel.
  //
  // Beide komen uit ÉÉN seam (`resolveFreedomAgeView`): die neemt alleen de
  // FRACTIONELE leeftijd aan, toetst daarmee de drempel (`currentAge >= fireAge`)
  // en rondt alleen de weergave af. Rond hier dus niets zelf af en geef
  // `fireAgeDisplay` nooit door aan een drempel — dat was WF-CANON-03, waarbij
  // een afgeronde 45,3 "financieel vrij" tot 6 maanden te vroeg liet omslaan.
  //
  // M6: `dataIssue` is waar zodra de motor een leeftijd gaf die niet kán kloppen
  // (op/voorbij het horizonplafond). Dan toont de strip een gegevensmelding i.p.v.
  // een aftelling — het probleem verdwijnt niet stilletjes uit beeld.
  // ADR 0129 D8 — het plan-ANKER is de sleutel voor de gate (anker bereikt ∧ dekking
  // ≥ 100); `strategy` blijft alleen als legacy-terugval voor een bundel zonder plan.
  const freedomState = {
    fireAgeFractional: dashboardData.fireAgeFractional ?? null,
    freedomPct,
    currentAge,
    strategy: horizonData?.fireStrategy?.strategy,
    anchor: horizonData?.firePlan?.anchor ?? null,
  }
  const { fireAgeDisplay, framing: freedomFraming, dataIssue: freedomDataIssue } =
    resolveFreedomAgeView(freedomState)
  // Woordkeuze onder 'free': "met pensioen" op/voorbij de AOW (het vroegere
  // framing-label 'pensioen'), anders "vrij". Zelfde helper als de /toekomst-hero.
  const freedomFreeAsPensioen =
    freedomFraming === 'free' &&
    isAtOrPastAow({ ...freedomState, fireAge: freedomState.fireAgeFractional })

  // ADR 0129 F3b — onder ÉLK vast anker (aow/now/age) toont de strip geen "% op weg"
  // maar het BEREIK, geconsumeerd uit de `runway` die dit request toch al draait
  // (dezelfde plan-runway die de kop-zin voedt) — geen tweede kernel-run, geen eigen
  // maand→leeftijd-som in de component. Sleutel: het plan-anker, niet de label.
  const planAnchor = horizonData?.firePlan?.anchor ?? null
  const ankerVast = planAnchor != null && isFixedAnchor({ anchor: planAnchor })
  const ankerReach: AnkerReach | null = ankerVast ? ankerReachFromRunway(runway) : null
  const ankerStop: AnkerStop | null = ankerVast
    ? runway.kind !== 'unavailable'
      ? ankerStopFromSim({ stopAnker: runway.planAnker ?? null, vastStopLeeftijd: runway.stopAge ?? null })
      : planAnchor.kind === 'now'
        ? { kind: 'now' }
        : null
    : null
  // "Vrij mogelijk vanaf" (D7) — de React-cache()'de tweede run, alléén onder een vast
  // anker dat nog niet 'free' is; onder `solved` ís de hoofdrun de opgeloste run.
  const solvedFireAge: number | null =
    ankerVast && freedomFraming !== 'free'
      ? await computeHorizonSolvedFireAge(supabase, perspective).catch(() => null)
      : null
  const planEndAge = horizonData?.firePlan?.endAge ?? null
  // Compat voor de legacy `nuStoppenReach`-prop (ADR 0127): alleen het nu-anker.
  const nuStoppenReach: AnkerReach | null = planAnchor?.kind === 'now' ? ankerReach : null

  // Vieringsprop voor de client-host: kant-en-klare strings (plat/serialiseerbaar),
  // zodat de host geen lib/milestones hoeft te bundelen. De once-guard is
  // server-side (`acknowledged_at`), dus de prop is alleen gevuld bij een échte
  // verse mijlpaal.
  const freshMilestone = freshMilestoneRow
    ? {
        key: freshMilestoneRow.milestone_key,
        ...buildMilestoneCopy(freshMilestoneRow, dashboardData.dailyExpenseRate ?? null, {
          goalName: resolveFreshGoalName(freshMilestoneRow, [...finData.goals, ...finData.completedGoals], userId),
        }),
      }
    : null

  return (
    <>
      {/* Seedt de status-duiding-banner met de reeds server-berekende status.
          Rendert niets. In het gestreamde blok mount dit ná de eerste paint;
          de PageStatusProvider valt tot dan terug op de client-fetch. */}
      <PageStatusSeed
        route="/overzicht"
        info={pageStatusInfo}
        minimized={pageStatusMinimized}
      />
      <OverzichtSecondary
        goals={finData.goals}
        goalProgresses={finData.goalProgresses}
        freedomPct={freedomPct}
        currentAge={currentAge}
        fireAge={fireAgeDisplay}
        freedomFraming={freedomFraming}
        freedomFreeAsPensioen={freedomFreeAsPensioen}
        freedomDataIssue={freedomDataIssue}
        ankerReach={ankerReach}
        ankerStop={ankerStop}
        solvedFireAge={solvedFireAge}
        planEndAge={planEndAge}
        briefingEntries={briefingEntries}
        freshMilestone={freshMilestone}
        briefingRefreshedAt={briefingRefreshedAt}
        briefingDataChanged={briefingDataChanged}
        briefingWeekHistory={briefingWeekHistory}
        briefingRotation={briefingRotation}
        briefingCanRefresh={briefingCanRefresh}
        briefingRefreshState={briefingRefreshState}
        briefingHeadline={briefingHeadline}
        dashboardData={dashboardData}
        activeWidgets={activeWidgets}
        allWidgetPrefs={allWidgetPrefs}
        liquidCash={liquidCash}
        // H15: de compound-CTA conditioneert op "belegt al", niet alleen op
        // cash. Hier afgeleid uit de al geladen `horizonData` — geen extra
        // query en geen tweede lezing (hasInvestedAssets is de ene bron).
        hasInvestments={hasInvestedAssets(horizonData?.assets ?? [])}
      />
    </>
  )
}

/**
 * OverzichtNetWorthChartLoader — de rechter cel (3/4) van de hero-row op
 * /overzicht: de mini-vermogen-grafiek. STROOMT los achter een eigen
 * `<Suspense>` (perf-kaart "gezondheid & netto vermogen los laden van widgets").
 *
 * De per-jaar-PROJECTIE (`simNetWorthRows`/`simRequiredPortfolio`) én de
 * historie komen uit de kernel-zware `loadDashboardData` — die kan niet naar
 * blok 1 zonder blok 1 even zwaar te maken. Daarom rendert de Health-card links
 * (1/4) wél direct in blok 1 (`OverzichtHeroPrimary`) uit de lichte blok-1-
 * `health`, en stroomt alléén de grafiek hier binnen. Het HUIDIGE netto vermogen
 * (`currentNetWorth`, blok 1, perspectief-correct) is er meteen; de projectielijn
 * vult later aan.
 *
 * DEDUP: deelt `loadDashboardData`'s React-`cache()` met OverzichtSecondaryLoader
 * en de page-status-seed → één query-set per request. CONSUME, DON'T RECOMPUTE:
 * dezelfde afgeleiden als voorheen, alleen nu in een eigen streaming-cel.
 */
export async function OverzichtNetWorthChartLoader({
  supabase,
  currentNetWorth,
  currentAge,
  endAge,
  isPensioenMode,
  stopAnchorFixed = false,
  stopAge = null,
  framing,
  netWorthExclHome,
  housingSplit,
}: {
  supabase: SupabaseClient
  currentNetWorth: number
  currentAge: number | null
  endAge: number | null
  isPensioenMode: boolean
  /** ADR 0129 — vast stopmoment: de minigrafiek knipt op het stopmoment ("Vermogen bij stop"). */
  stopAnchorFixed?: boolean
  stopAge?: number | null
  /** `resolveFreedomAgeView(...).framing` — "bereikt" alleen bij 'free'. */
  framing?: FreedomFraming
  netWorthExclHome: number | null
  housingSplit: HefbomenHousingSplit | null
}) {
  const { dashboardData } = await loadDashboardData(supabase)

  // WEERGAVE-only: de grafiekmarker. Via dezelfde seam als de Vrijheid-strip,
  // zodat afronden op één plek gebeurt en nooit een drempel voedt.
  const fireAge = fireAgeForDisplay(dashboardData.fireAgeFractional)
  // Canoniek dagtarief (EUR/dag) uit de bundel — consume-don't-recompute
  // (KRUIS-20); alleen bij ontbreken vertaalt de helper de maanduitgaven.
  const dailyExpense = dashboardData.dailyExpenseRate ?? dailyExpenseRate(dashboardData.monthlyExpenses)
  // Geschat maandelijks spaarritme voor de back-cast van ontbrekende historie.
  const monthlySavings =
    dashboardData.monthlyContributions > 0
      ? dashboardData.monthlyContributions
      : (dashboardData.monthlyIncome ?? 0) - (dashboardData.monthlyExpenses ?? 0)

  return (
    <MiniNetWorthChart
      netWorthHistory={dashboardData.netWorthHistory ?? EMPTY_NET_WORTH_HISTORY}
      currentNetWorth={currentNetWorth}
      currentAge={currentAge}
      fireAge={fireAge}
      endAge={endAge}
      isPensioenMode={isPensioenMode}
      stopAnchorFixed={stopAnchorFixed}
      stopAge={stopAge}
      framing={framing}
      simNetWorthRows={dashboardData.simNetWorthRows ?? null}
      simRequiredPortfolio={dashboardData.simRequiredPortfolio ?? null}
      monthlySavings={monthlySavings}
      netWorthExclHome={netWorthExclHome}
      showExclHome={housingSplit != null}
      dailyExpense={dailyExpense}
    />
  )
}
