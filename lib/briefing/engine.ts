// ── Briefing Engine ──────────────────────────────────────────────────
//
// Server-only aggregator die ruwe data (recommendations, life-events,
// health-pillars, goal-progress, snapshots) omzet in `BriefingEntry[]`
// voor de BriefingPanel op /overzicht.
//
// Plan-context: A-4 "Briefing-engine als first-class server-component".
// Voorheen leefde deze logica inline in `app/(app)/overzicht/page.tsx`;
// extractie hierheen geeft:
//  1. testbaarheid (pure functie, geen Next-deps)
//  2. herbruikbaarheid (andere routes kunnen de zelfde briefing tonen)
//  3. fundament voor de AI-redactielaag (lib/briefing/redactie.ts): die
//     herschrijft alleen de teksten — alle cijfers komen uit deze engine
//
// Categorieën (matchend met BriefingPanel):
//  - observation  Fin-recommendations[0] + finance-observaties
//  - tip          Fin-recommendations[1] + finance-tips
//  - upcoming     eerstvolgend life-event ≤90 dagen, salaris, seizoen
//  - heads_up     laagst-scorende health-pillar < 50, budgetdruk, daling
//  - milestone    behaald doel OF +5 punten health-score t.o.v. vorige maand
//  - market       top-'direct'-item uit de nieuws-cache (news-market.ts)
//
// Entries worden op prioriteit geweven via `briefingRank` (zie aldaar);
// de doc-volgorde hieronder per generator is dus de bron-volgorde, niet
// per se de getoonde volgorde.

import { credibleDailyExpense, credibleMonthlyBasis, formatCurrency } from '@/lib/format'
import { formatGoalValue, isGoalReached, type GoalType } from '@/lib/goal-data'
import type { HealthScore } from '@/lib/financial-health'
import type { LifeEvent } from '@/lib/horizon-data'
import type { Recommendation } from '@/lib/recommendation-data'
import type { Aandachtspunt, AandachtspuntDomain } from '@/lib/aandachtspunten'
import type { BriefingEntry, HefboomTag } from '@/lib/types/briefing'

/**
 * Health-pillar id → hefboom-tag. Plan T-3: tips visueel gekoppeld aan
 * hefbomen. Wanneer geen 1-op-1 mapping (bv. fire_progress is cross-
 * hefboom) → undefined zodat de briefing-card geen onjuiste tag krijgt.
 */
function pillarToHefboom(pillarId: string): HefboomTag | undefined {
  switch (pillarId) {
    case 'asset_concentration':
      return 'bezittingen'
    case 'debt_ratio':
    case 'debt_service_ratio':
      return 'schulden'
    case 'savings_rate':
    case 'emergency_fund':
      return 'cashflow'
    case 'fire_progress':
    default:
      return undefined
  }
}

/** Recommendation-type → hefboom-tag. Voorlopig conservatief: alleen
 *  duidelijke 1-op-1 categorieën taggen. */
/** Impact-extractor — leest de freedom_days en EUR-effect uit een
 *  recommendation zodat de BriefingCard dezelfde dual-unit-badge toont
 *  als TipsLijst ("Geld is opgeslagen tijd"). Wanneer yearly ontbreekt
 *  rekenen we maandelijks × 12 om. */
function impactFromRecommendation(
  rec: BriefingEngineInput['recommendations'][number],
): { freedomDaysPerYear?: number | null; euroPerYear?: number | null } | undefined {
  const days = rec.freedom_days_per_year
  const yearly =
    rec.euro_impact_yearly ??
    (rec.euro_impact_monthly != null ? rec.euro_impact_monthly * 12 : null)
  const hasDays = days != null && days > 0
  const hasEuro = yearly != null && yearly > 0
  if (!hasDays && !hasEuro) return undefined
  return { freedomDaysPerYear: days, euroPerYear: yearly }
}

function recommendationToHefboom(recType: string | null | undefined): HefboomTag | undefined {
  if (!recType) return undefined
  if (recType.includes('savings') || recType.includes('budget') || recType.includes('cashflow')) {
    return 'cashflow'
  }
  if (recType.includes('debt') || recType.includes('mortgage') || recType.includes('loan')) {
    return 'schulden'
  }
  if (recType.includes('asset') || recType.includes('invest') || recType.includes('diversif')) {
    return 'bezittingen'
  }
  if (recType.includes('tax') || recType.includes('box')) {
    return 'belasting'
  }
  return undefined
}

/** LifeEvent-type → hefboom-tag. De meeste events raken meerdere
 *  hefbomen; we taggen alleen waar duidelijk één hefboom dominant is. */
function eventToHefboom(eventType: string): HefboomTag | undefined {
  const t = eventType.toLowerCase()
  if (t.includes('housing') || t.includes('huis') || t.includes('hypotheek')) return 'schulden'
  if (t.includes('inherit') || t.includes('erfenis')) return 'bezittingen'
  if (t.includes('income') || t.includes('inkomen') || t.includes('zzp') || t.includes('career')) {
    return 'cashflow'
  }
  return undefined
}

export interface GoalProgressInput {
  current: number
  target: number
  pct: number
  onTrack: boolean
  eta: string | null
}

/**
 * Financiële context voor de verrijkte briefing-bronnen. Volledig optioneel:
 * wanneer afwezig gedraagt `buildBriefingEntries` zich exact als voorheen
 * (alleen recommendations / health / goals / events / seasonal). Wanneer
 * aanwezig genereert de engine extra *echte* briefjes uit de financiële
 * cijfers zodat de meeste gebruikers 5-6 inhoudelijke kaartjes zien i.p.v.
 * 2-3 — zonder holle vulling: elke generator vuurt alleen bij voldoende data.
 */
export interface BriefingFinanceInput {
  /** Maandelijkse vermogenssnapshots (oplopend) — voor de delta deze maand. */
  netWorthHistory?: { month: string; value: number }[]
  /** Maanduitgaven — basis voor de déze-maand-observaties (surplus, budgetdruk).
   *  NIET de bron voor de vrijheidsdagen-omrekening: gebruik `dailyExpenseRate`. */
  monthlyExpenses?: number
  /** Canoniek dagtarief (€/dag, 12-maands rolling) uit `DashboardData` —
   *  registergetal 6 (WF-CANON-06). Dít is de bron voor élke euro→vrijheidsdagen-
   *  omrekening in de briefing, zodat de tekst hetzelfde aantal dagen noemt als
   *  de widgets, die `data.dailyExpenseRate` lezen (KRUIS-20). Consume, don't
   *  recompute. Ontbreekt het veld, dan valt de engine terug op de losse
   *  maanduitgaven — bewust alleen voor fixtures/callers zonder de bundel. */
  dailyExpenseRate?: number
  /** Maandinkomen — basis voor de maand-observatie (déze-maand-surplus). */
  monthlyIncome?: number
  /** DE spaarquote (%): het grondslag-geresolveerde `effectiveSavingsRatePct`
   *  uit de bundel (ADR 0103) — exact het getal onderaan /overzicht/cashflow, op
   *  de hefboomkaart en op de spaarquote-widget. Wanneer aanwezig is dít de bron
   *  voor elke spaarquote-presentatie; het 1-maands (inkomen−uitgaven)/inkomen-
   *  cijfer blijft alleen voor de "deze maand meer uitgegeven dan binnenkwam"-
   *  observatie. Was tot 31 aug 2026 `savingsRate6m` (de rauwe meting) — daarmee
   *  noemde de briefing een ander percentage dan de pagina waarnaar hij linkt.
   *  Naam bewust hernoemd zodat een call-site die nog de meting doorgeeft niet
   *  stilzwijgend compileert. Zie lib/savings-source.ts / dashboard-data-loader. */
  savingsRatePct?: number | null
  /** Uitgaven-budget deze maand — voor de budgetdruk-heads-up. */
  budgetExpense?: { spent: number; limit: number }
  /** Liquide cash die stilstaat — voor de cash-drag-tip. */
  liquidCash?: number
  /** Voortgang naar volledige vrijheid (0-100). */
  freedomPct?: number
  /** Huidige leeftijd (afgerond) — context voor FIRE-voortgang. */
  currentAge?: number | null
  /** Vrijheidsleeftijd — context voor FIRE-voortgang. */
  fireAge?: number | null
  /** Aantal openstaande acties — voor de acties-tip. */
  openActions?: number
  /** Som vrijheidsdagen te winnen uit open acties — voor de acties-tip. */
  totalFreedomDaysOpen?: number
  /** Backtest-slaagkans (0-100) over historische startjaren — voor de
   *  "Time Machine"-weerbaarheidskaart. Null = onvoldoende data (geen DOB/vermogen). */
  backtestSuccessRate?: number | null
  /** Per benoemde historische crash of het plan die doorstaat (pass/fail). */
  backtestNamedPaths?: { label: string; success: boolean }[] | null
  /** Top terugkerende lasten (gesorteerd op bedrag) — voor het vaste-lasten-briefje. */
  recurring?: { name: string; amount: number }[]
  /** Som van alle terugkerende lasten per maand. */
  totalRecurringAmount?: number
  /** Geschatte Box 3-heffing dit jaar (EUR) — voor het belasting-briefje. */
  box3Tax?: number | null
  /** Fondskosten-analyse: jaarlijkse fee + gewogen TER (decimaal). */
  feeAnalysis?: { totalAnnualFee: number; weightedTER: number } | null
  /** Noodfonds-dekking in maanden t.o.v. het doel. */
  emergencyFund?: { monthsCovered: number; targetMonths: number; isComplete: boolean } | null
  /** Hypotheek-vs-beleggen-uitkomst (null zonder hypotheek). */
  hvbSummary?: { rente: number; aanbeveling: 'aflossen' | 'beleggen' | 'gelijk' } | null
}

export interface BriefingEngineInput {
  /** Fin-recommendations gesorteerd op prioriteit (eerste = belangrijkste). */
  recommendations: Recommendation[]
  /** Levensgebeurtenissen uit horizonData. */
  events: LifeEvent[]
  /** Gezondheidsscore uit horizonData (inclusief pillars + trend). */
  health: HealthScore | null
  /** Doelen + bijbehorende voortgang. Indices moeten parallel zijn. */
  goalNames: string[]
  goalProgresses: GoalProgressInput[]
  /** Doel-types parallel aan `goalNames`/`goalProgresses` (optioneel, backward-
   *  compatible). Voedt de goal-heads-up: parameter-`fire_age`-doelen (marge-/
   *  live-only in het lab) worden uitgesloten, en de overige doelen worden met
   *  de juiste eenheid geformatteerd (%/jaar i.p.v. altijd EUR). Afwezig ⇒
   *  gedraag als voorheen (EUR-format, geen exclusie). */
  goalTypes?: GoalType[]
  /** Optionele financiële context — voedt de verrijkte briefing-bronnen.
   *  Wanneer afwezig blijft de engine-output identiek aan voorheen. */
  finance?: BriefingFinanceInput
  /** App-brede aandachtspunten-bus (lib/aandachtspunten), gesorteerd op
   *  besparing. De engine pakt het zwaarste punt als briefje. */
  aandachtspunten?: Aandachtspunt[]
  /** Meest recente maand-check-in met reflectie (loader bewaakt recency).
   *  Maakt de briefing persoonlijk: jouw eigen woorden komen terug. */
  checkin?: { monthKey: string; reflection: string }
  /** Optioneel vooraf-gebouwd 'market'-briefje (uit de nieuws-cache). Wordt
   *  op prioriteit tussen de overige entries geweven. */
  marketEntry?: BriefingEntry
  /** Datum-context — default new Date(). Injectable voor tests. */
  now?: Date
}

/**
 * Hoofd-functie: bouwt een BriefingEntry[] uit ruwe inputs. Max-cap
 * van BriefingPanel (= 6) is geen verantwoordelijkheid van de engine —
 * we leveren alle gevonden entries in prioriteit-volgorde; de panel
 * cap't zelf.
 *
 * Bron-volgorde van de kern-entries:
 *  1. observation (uit recommendations)
 *  2. tip         (uit recommendations)
 *  3. heads_up    (uit health-pillars + goals)
 *  4. milestone   (uit goals + score-trend)
 *  5. upcoming    (uit life-events)
 *  6. seasonal    (NL-fiscale kalender)
 *
 * Zodra er finance- of market-entries zijn, bepaalt `mergeRankedEntries`
 * (stabiele sort op `briefingRank`) de getoonde volgorde: urgentie eerst,
 * vooruitblik en acties later. Zonder finance/market blijft de output
 * byte-identiek aan de bron-volgorde hierboven.
 */
export function buildBriefingEntries(input: BriefingEngineInput): BriefingEntry[] {
  const now = input.now ?? new Date()
  const entries: BriefingEntry[] = []

  // 1. Observation — eerste Fin-recommendation
  const firstRec = input.recommendations[0]
  if (firstRec) {
    entries.push({
      id: 'observation:' + firstRec.id,
      category: 'observation',
      text: firstRec.title,
      // Toptips zijn zichtbaar op /overzicht/tips — daar beslist de
      // gebruiker met Doe nu / Later / Negeren.
      href: '/overzicht/tips',
      hefboom: recommendationToHefboom(firstRec.recommendation_type),
      impact: impactFromRecommendation(firstRec),
    })
  }

  // 2. Tip — tweede Fin-recommendation
  const secondRec = input.recommendations[1]
  if (secondRec) {
    entries.push({
      id: 'tip:' + secondRec.id,
      category: 'tip',
      text: secondRec.title,
      href: '/overzicht/tips',
      impact: impactFromRecommendation(secondRec),
      hefboom: recommendationToHefboom(secondRec.recommendation_type),
    })
  }

  // 3. Heads-up — laagst-scorende health-pillar onder 50
  if (input.health) {
    const weakest = input.health.pillars
      .filter((p) => p.score != null && p.score < 50)
      .sort((a, b) => (a.score ?? 100) - (b.score ?? 100))[0]
    if (weakest) {
      entries.push({
        id: 'heads_up:' + weakest.id,
        category: 'heads_up',
        text: `${weakest.name} vraagt aandacht — ${weakest.improvementTip}`,
        href: weakest.actionHref ?? '/overzicht',
        hefboom: pillarToHefboom(weakest.id),
      })
    }
  }

  // 3b. Goal heads-up — meest off-track-doel (pct < 50 én niet onTrack).
  //     Vult de health-pillar-heads_up aan: een gebruiker met groene
  //     pillars maar achterblijvende doelen ziet hier toch een nudge.
  //     CR-M1: fire_age-doelen (parameter-/marge-doelen, live-only in het lab)
  //     worden uitgesloten — hun "off-track" is een marge-status die alleen op
  //     /toekomst zin heeft (spiegelt DoelenView + toekomst-nav-cards).
  const worstGoalIdx = input.goalProgresses
    .map((p, i) => ({ p, i }))
    .filter(({ p, i }) => {
      if (input.goalTypes?.[i] === 'fire_age') return false
      return !p.onTrack && p.pct < 50 && p.pct > 0
    })
    .sort((a, b) => a.p.pct - b.p.pct)[0]?.i
  if (worstGoalIdx != null) {
    const goalName = input.goalNames[worstGoalIdx]
    const progress = input.goalProgresses[worstGoalIdx]
    const goalType = input.goalTypes?.[worstGoalIdx]
    if (goalName && progress) {
      // Parameter-doelen zijn %/jaar/EUR — format met de doel-eenheid i.p.v.
      // altijd EUR (m1). Ontbrekend goalType (oude callers) → EUR-fallback.
      const fmt = (v: number) =>
        goalType ? formatGoalValue(v, goalType) : formatCurrency(v)
      entries.push({
        id: `heads_up:goal:${worstGoalIdx}`,
        category: 'heads_up',
        text: `${goalName} ligt achter op planning: ${fmt(progress.current)} van ${fmt(progress.target)} (${Math.round(progress.pct)}%) — extra inleg deze maand?`,
        href: '/toekomst/doelen',
      })
    }
  }

  // 4. Milestone — twee triggers, één entry per briefing:
  //    (a) doel dat 100% raakt (= behaald)
  //    (b) health-score-trend >= +5 punten t.o.v. vorige maand
  //    Voorkeur: (a) eerst, want concreter dan een score-stijging.
  // De CANONIEKE toets, niet het percentage. Bij een omlaag-doel rekent de
  // voortgang `target / current`; op jaartallen (schuldenvrij-datum) zit daar
  // ruim tien jaar speling in vóór het quotiënt onder de 100% zakt, dus zo'n
  // doel zou hier structureel als "behaald" gevierd worden terwijl het jaren
  // achterloopt. Zonder `goalTypes` (oude callers) blijft het oude gedrag staan.
  const completedGoalIdx = input.goalProgresses.findIndex((p, i) => {
    const goalType = input.goalTypes?.[i]
    return goalType ? isGoalReached(goalType, p.current, p.target) : p.pct >= 100
  })
  if (completedGoalIdx !== -1) {
    const goalName = input.goalNames[completedGoalIdx]
    if (goalName) {
      entries.push({
        id: 'milestone:goal:' + completedGoalIdx,
        category: 'milestone',
        text: `Mijlpaal: doel "${goalName}" behaald.`,
        href: '/toekomst/doelen',
      })
    }
  } else if (input.health && input.health.trend >= 5) {
    entries.push({
      id: 'milestone:score-trend',
      category: 'milestone',
      text: `Je gezondheidsscore steeg met ${Math.round(input.health.trend)} punten deze maand.`,
      href: '/overzicht',
    })
  }

  // 5. Upcoming — eerstvolgend life-event binnen 90 dagen
  const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
  const upcomingEvent = input.events
    .filter((e) => e.target_date)
    .map((e) => ({ event: e, date: new Date(e.target_date as string) }))
    .filter(({ date }) => date > now && date < ninetyDaysFromNow)
    .sort((a, b) => a.date.getTime() - b.date.getTime())[0]
  if (upcomingEvent) {
    entries.push({
      id: 'upcoming:' + upcomingEvent.event.id,
      category: 'upcoming',
      text: `${upcomingEvent.event.name} — ${upcomingEvent.date.toLocaleDateString(
        'nl-NL',
        { day: 'numeric', month: 'long' },
      )}`,
      href: '/toekomst',
      hefboom: eventToHefboom(upcomingEvent.event.event_type),
    })
  }

  // 5. Seizoens-entry — fiscale + NL-kalender events. Plan T-1 uitbreiding:
  //    geef de gebruiker contextuele tijdsbesef (Box 3-peildatum, aangifte-
  //    deadline, jaareinde-pensioenruimte, etc.) als losse heads-up of
  //    upcoming-card. Eén entry per briefing-cyclus, max-cap respect.
  const seasonal = buildSeasonalEntry(now)
  if (seasonal) entries.push(seasonal)

  // Verrijking: voeg financiële + markt-briefjes toe wanneer beschikbaar, en
  // weef ze met de kern-entries samen op prioriteit (rank). Zonder finance én
  // zonder marketEntry blijft de output byte-identiek aan voorheen — bestaande
  // tests (die geen van beide meegeven) zijn dus ongewijzigd.
  const extra: BriefingEntry[] = []
  if (input.finance) extra.push(...buildFinanceEntries(input.finance, now))
  if (input.aandachtspunten && input.aandachtspunten.length > 0) {
    const punt = buildAandachtspuntEntry(input.aandachtspunten)
    if (punt) extra.push(punt)
  }
  if (input.checkin) {
    const reflectie = buildCheckinEntry(input.checkin)
    if (reflectie) extra.push(reflectie)
  }
  if (input.marketEntry) extra.push(input.marketEntry)
  if (extra.length > 0) {
    return mergeRankedEntries(entries, extra)
  }

  return entries
}

// ── Aandachtspunten-bus ─────────────────────────────────────────────
//
// De app-brede aandachtspunten (belasting-kansen, budgetoverschrijdingen,
// dure schulden, stilstaand vermogen) voeden ook de Fin-chat-context. Hier
// pakt de briefing het zwaarste punt (hoogste besparing) als briefje, zodat
// de belangrijkste kans van het moment niet alleen in de chat leeft.

const AANDACHTSPUNT_HEFBOOM: Record<AandachtspuntDomain, HefboomTag> = {
  tax: 'belasting',
  budget: 'cashflow',
  debt: 'schulden',
  asset: 'bezittingen',
}

const NL_MONTHS = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
]

/** Max. lengte van de geciteerde reflectie in het check-in-briefje. */
const CHECKIN_QUOTE_MAX = 110

/**
 * Check-in-reflectie als briefje: de eigen woorden van de gebruiker komen
 * terug in de weekbriefing ("bij je check-in van juni schreef je …").
 * Recency bewaakt de loader; hier alleen de tekstvorm.
 */
function buildCheckinEntry(checkin: { monthKey: string; reflection: string }): BriefingEntry | null {
  const reflection = checkin.reflection.replace(/\s+/g, ' ').trim()
  if (!reflection) return null
  const quote =
    reflection.length > CHECKIN_QUOTE_MAX
      ? `${reflection.slice(0, CHECKIN_QUOTE_MAX).trimEnd()}…`
      : reflection
  const monthIdx = Number(checkin.monthKey.slice(5, 7)) - 1
  const monthLabel = monthIdx >= 0 && monthIdx < 12 ? NL_MONTHS[monthIdx] : checkin.monthKey
  return {
    id: `checkin:${checkin.monthKey}`,
    category: 'observation',
    text: `Bij je check-in van ${monthLabel} schreef je: "${quote}"`,
    href: '/mijn/checkins',
  }
}

function buildAandachtspuntEntry(punten: Aandachtspunt[]): BriefingEntry | null {
  const top = punten[0]
  if (!top) return null
  const parts: string[] = []
  if (top.savings > 0) parts.push(`${formatCurrency(top.savings)} per jaar`)
  if (top.freedomDays > 0) {
    parts.push(`${Math.round(top.freedomDays)} ${Math.round(top.freedomDays) === 1 ? 'dag' : 'dagen'} vrijheid`)
  }
  const impact = parts.length > 0 ? ` — ${parts.join(', ')}` : ''
  const deadline = top.deadline ? ` (vóór ${top.deadline})` : ''
  return {
    id: `aandachtspunt:${top.id}`,
    // Met deadline is het urgent (heads_up); anders een kans (tip).
    category: top.deadline ? 'heads_up' : 'tip',
    text: `${top.title}${impact}${deadline}.`,
    href: top.href,
    hefboom: AANDACHTSPUNT_HEFBOOM[top.domain],
  }
}

// ── Verrijkte financiële briefjes ───────────────────────────────────
//
// Plan-context: "engine verrijken" (gebruikersbeslissing mei 2026). De kern-
// generators (recommendations / health / goals / events / seasonal) leveren
// voor veel gebruikers maar 2-3 entries. Deze financiële generators putten
// uit de cijfers die /overzicht toch al laadt (vermogensverloop, budget,
// inkomen, cash, FIRE-voortgang) zodat de briefing natuurlijk 5-6 *echte*
// kaartjes haalt. Filosofie "Geld is opgeslagen tijd": elke euro-impact wordt
// óók in vrijheidsdagen uitgedrukt. Geen holle vulling — elke generator vuurt
// alleen boven een betekenisvolle drempel.

/** Minimaal vermogensverschil (EUR) voor een groei/daling-briefje. */
const NETWORTH_DELTA_MIN = 250
/** Drempel (EUR) waarboven stilstaande cash een cash-drag-tip oplevert. */
const CASH_DRAG_MIN = 10_000
/** Aandeel van het maandbudget besteed dat een budgetdruk-heads-up triggert. */
const BUDGET_PRESSURE_RATIO = 0.9
/** Aangenomen salarisdag van de maand (NL-conventie: 25e). */
const SALARY_DAY = 25

/** Resterende kalenderdagen in de maand van `now` (vandaag niet meegeteld). */
function daysLeftInMonth(now: Date): number {
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  return Math.max(0, daysInMonth - now.getDate())
}

/** Dagen tot de eerstvolgende salarisdag (25e), incl. maandovergang. */
function daysUntilSalary(now: Date): number {
  const day = now.getDate()
  if (day <= SALARY_DAY) return SALARY_DAY - day
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  return daysInMonth - day + SALARY_DAY
}

/** Vrijheidsdagen-suffix uit een EUR-bedrag + dagbasis ("— 12 dagen vrijheid"). */
function freedomDaysLabel(amount: number, dailyExpense: number): string {
  if (dailyExpense <= 0) return ''
  const days = Math.round(Math.abs(amount) / dailyExpense)
  if (days <= 0) return ''
  return `${days} ${days === 1 ? 'dag' : 'dagen'} vrijheid`
}

/**
 * Genereer financiële briefjes uit de finance-context. Returnt een lijst in
 * losse volgorde; `mergeRankedEntries` weeft ze daarna op prioriteit met de
 * kern-entries. Budgetdruk en spaarquote sluiten elkaar uit (beide cashflow)
 * zodat de briefing niet twee bijna-identieke cashflow-kaartjes toont.
 */
function buildFinanceEntries(finance: BriefingFinanceInput, now: Date): BriefingEntry[] {
  const out: BriefingEntry[] = []
  // Canonieke dagbasis: CONSUMEER het rolling `dailyExpenseRate` uit de bundel
  // (registergetal 6, WF-CANON-06) — exact wat de widgets lezen, zodat hetzelfde
  // bedrag overal evenveel vrijheidsdagen oplevert. De lokale som op de LOSSE
  // huidige maand is nog slechts fallback voor callers/fixtures zonder bundel;
  // als hoofdroute liet ze de briefing een ander dagtarief noemen dan de
  // CASHFLOW-widget op dezelfde pagina. Formule van de fallback blijft
  // jaaruitgaven/365 (= maand×12/365), zoals calculateFreedomTime in
  // lib/format.ts — niet maand/30 (= jaar/360), wat ~1,4% afweek.
  //
  // GELOOFWAARDIGHEIDSVLOER (UR2-03): elke kandidaat moet door
  // `credibleDailyExpense`/`credibleMonthlyBasis`. Bij een (bijna) leeg account
  // wordt het rollende dagtarief niet nul maar centen-per-dag (één transactie
  // van €1 ⇒ €0,03/dag), terwijl de guard hierboven alleen `> 0` toetste —
  // daardoor stond er "2677 dagen vrijheid per maand" in de briefing. Zakt het
  // rollende tarief door de vloer, dan valt de engine terug op de effectieve
  // maandbasis: dat is óók de grondslag van de BEDRAGEN in deze briefjes
  // (monthSavings = inkomen − uitgaven), dus de dagen zijn dan per constructie
  // consistent met het percentage dat in dezelfde zin staat. Haalt geen van
  // beide de vloer, dan is er geen dagbasis en vervalt de dagen-toevoeging —
  // de zin blijft staan, de onmogelijke claim verdwijnt.
  const dailyExp =
    credibleDailyExpense(finance.dailyExpenseRate) ||
    (credibleMonthlyBasis(finance.monthlyExpenses) * 12) / 365

  // Maandgrondslagen waarop de briefjes hun percentages en bedragen baseren —
  // gefloord op dezelfde vloer, zodat een restwaarde van een paar euro geen
  // spaarquote, salarisverwachting of vaste-lasten-percentage kan dragen.
  const monthlyIncome = credibleMonthlyBasis(finance.monthlyIncome)
  const monthlyExpenses = credibleMonthlyBasis(finance.monthlyExpenses)

  // 1. Vermogensgroei/-daling deze maand (uit de laatste twee snapshots).
  const hist = finance.netWorthHistory ?? []
  if (hist.length >= 2) {
    const delta = hist[hist.length - 1].value - hist[hist.length - 2].value
    if (Math.abs(delta) >= NETWORTH_DELTA_MIN) {
      const days = freedomDaysLabel(delta, dailyExp)
      // Bewust "sinds je vorige meetpunt" i.p.v. "deze maand": de laatste twee
      // snapshots hoeven niet per se de huidige maand te zijn (er is mogelijk
      // nog geen meetpunt deze maand), dus deze framing klopt altijd.
      if (delta > 0) {
        out.push({
          id: 'finance:networth',
          category: 'observation',
          text: `Je vermogen groeide met ${formatCurrency(delta)} sinds je vorige meetpunt${days ? ` — ${days} erbij` : ''}.`,
          href: '/overzicht/bezittingen',
          hefboom: 'bezittingen',
        })
      } else {
        out.push({
          id: 'finance:networth',
          category: 'heads_up',
          text: `Je vermogen daalde met ${formatCurrency(Math.abs(delta))} sinds je vorige meetpunt${days ? ` — ${days} minder` : ''}.`,
          href: '/overzicht/bezittingen',
          hefboom: 'bezittingen',
        })
      }
    }
  }

  // 2. Budgetdruk — >90% van het maandbudget besteed (sluit spaarquote uit).
  let budgetShown = false
  const be = finance.budgetExpense
  if (be && be.limit > 0) {
    const ratio = be.spent / be.limit
    if (ratio >= BUDGET_PRESSURE_RATIO) {
      budgetShown = true
      const pct = Math.round(ratio * 100)
      const left = daysLeftInMonth(now)
      const leftLabel = `${left} ${left === 1 ? 'dag' : 'dagen'}`
      out.push({
        id: 'finance:budget',
        category: 'heads_up',
        text:
          ratio > 1
            ? `Je zit op ${pct}% van je maandbudget — over je limiet, met nog ${leftLabel} te gaan.`
            : `Je hebt ${pct}% van je maandbudget besteed, met nog ${leftLabel} deze maand.`,
        href: '/overzicht/cashflow',
        hefboom: 'cashflow',
      })
    }
  }

  // 3. Spaarquote — alleen tonen als budgetdruk niet al de cashflow-kaart vult
  //    én er échte inkomens- én uitgaven-data is. Niet "> 0" maar de
  //    geloofwaardigheidsvloer (UR2-03): met €0 rekende de engine 100%
  //    spaarquote, en met een restwaarde van een paar euro presenteerde ze een
  //    ontbrekende-data-staat als becijferde spaarquote ("Je spaart 34% van je
  //    inkomen" op een account zonder ingevuld inkomen).
  if (!budgetShown && monthlyIncome > 0 && monthlyExpenses > 0) {
    const income = monthlyIncome
    // Deze-maand-surplus blijft de bron voor de "meer uitgegeven dan
    // binnenkwam"-observatie (expliciet een déze-maand-signaal).
    const monthSavings = income - monthlyExpenses
    const days = freedomDaysLabel(monthSavings, dailyExp)
    // Spaarquote-PRESENTATIE op de EFFECTIEVE, grondslag-geresolveerde quote —
    // exact wat de cashflow-pagina toont. Valt terug op het 1-maands-percentage
    // wanneer die ontbreekt (no-finance-pad blijft byte-identiek; geen verzonnen
    // getallen).
    const ratePct =
      finance.savingsRatePct != null
        ? Math.round(finance.savingsRatePct)
        : Math.round((monthSavings / income) * 100)
    if (monthSavings < 0) {
      out.push({
        id: 'finance:savings',
        category: 'heads_up',
        text: `Je gaf deze maand meer uit dan er binnenkwam${days ? ` — ${days} ingeleverd` : ''}.`,
        href: '/overzicht/cashflow',
        hefboom: 'cashflow',
      })
    } else if (ratePct >= 10) {
      out.push({
        id: 'finance:savings',
        category: 'observation',
        text: `Je spaart ${ratePct}% van je inkomen${days ? ` — ${days} per maand` : ''}.`,
        href: '/overzicht/cashflow',
        hefboom: 'cashflow',
      })
    } else {
      out.push({
        id: 'finance:savings',
        category: 'observation',
        text: `Je spaarquote is ${ratePct}% — elke procent extra koopt vrijheid terug.`,
        href: '/overzicht/cashflow',
        hefboom: 'cashflow',
      })
    }
  }

  // 4. FIRE-voortgang — percentage naar volledige vrijheid (cross-hefboom).
  //    Met huidige + vrijheidsleeftijd wordt het een tijd-frame ("van je Xe
  //    nu naar vrijheid rond je Ye") — past bij "Geld is opgeslagen tijd".
  if (finance.freedomPct != null && finance.freedomPct > 0) {
    const pct = Math.round(finance.freedomPct)
    const ageSuffix =
      finance.currentAge && finance.fireAge
        ? ` — van je ${finance.currentAge}e nu naar vrijheid rond je ${finance.fireAge}e`
        : finance.fireAge
          ? `, op koers rond je ${finance.fireAge}e`
          : ''
    out.push({
      id: 'finance:fire',
      category: 'observation',
      text: `Je bent ${pct}% onderweg naar volledige vrijheid${ageSuffix}.`,
      href: '/toekomst',
    })
  }

  // 5. Salaris-countdown — binnen 10 dagen, alleen met een geloofwaardig
  //    bekend inkomen (een restwaarde van een paar euro is geen salaris).
  if (monthlyIncome > 0) {
    const dts = daysUntilSalary(now)
    if (dts >= 0 && dts <= 10) {
      out.push({
        id: 'finance:salary',
        category: 'upcoming',
        text:
          dts === 0
            ? 'Salaris komt vandaag binnen — meteen doorzetten naar je doel levert het meeste vrijheid.'
            : `Salaris komt over ${dts} ${dts === 1 ? 'dag' : 'dagen'} (25e).`,
        href: '/overzicht/cashflow',
        hefboom: 'cashflow',
      })
    }
  }

  // 6. Cash-drag — substantiële stilstaande cash.
  if (finance.liquidCash != null && finance.liquidCash >= CASH_DRAG_MIN) {
    out.push({
      id: 'finance:cashdrag',
      category: 'tip',
      text: `${formatCurrency(finance.liquidCash)} staat stil op je spaarrekening — beleggen koopt meer vrijheid terug.`,
      href: '/overzicht/bezittingen',
      hefboom: 'bezittingen',
    })
  }

  // 7. Openstaande acties — concrete vrijheidsdagen te winnen.
  if (
    finance.openActions != null &&
    finance.openActions > 0 &&
    finance.totalFreedomDaysOpen != null &&
    finance.totalFreedomDaysOpen > 0
  ) {
    const n = finance.openActions
    out.push({
      id: 'finance:actions',
      category: 'tip',
      text: `${n} openstaande ${n === 1 ? 'actie' : 'acties'} — ${Math.round(finance.totalFreedomDaysOpen)} vrijheidsdagen te winnen.`,
      href: '/overzicht/tips',
    })
  }

  // 8. Time Machine — crashbestendigheid uit de backtest tegen 55 jaar echte
  //    marktdata. Reframet sequence-of-returns-risico als beschermde vrijheid:
  //    "je plan doorstaat een crash zoals 1973". Per-crash success is binair;
  //    de slaagkans is het aggregaat over alle startjaren.
  const resilience = buildResilienceEntry(finance)
  if (resilience) out.push(resilience)

  // 9. Noodfonds — onvolledig noodfonds gaat vóór beleggen/optimaliseren.
  const ef = finance.emergencyFund
  if (ef && !ef.isComplete && ef.targetMonths > 0 && ef.monthsCovered < ef.targetMonths) {
    const covered = nlDecimal(ef.monthsCovered, 1)
    out.push({
      id: 'finance:emergency',
      category: 'heads_up',
      text: `Je noodfonds dekt ${covered} van de ${ef.targetMonths} maanden — buffer eerst, die koopt rust én vrijheid.`,
      href: '/overzicht/cashflow',
      hefboom: 'cashflow',
    })
  }

  // 10. Vaste lasten — som van terugkerende lasten, met de grootste benoemd.
  //     Alleen met een geloofwaardig bekend inkomen: op een restwaarde deelt het
  //     percentage door bijna niets en schiet het naar honderden procenten.
  if (
    finance.totalRecurringAmount != null &&
    finance.totalRecurringAmount > 0 &&
    monthlyIncome > 0
  ) {
    const pct = Math.round((finance.totalRecurringAmount / monthlyIncome) * 100)
    const top = finance.recurring?.[0]
    const topLabel = top ? ` — grootste: ${top.name} (${formatCurrency(top.amount)})` : ''
    out.push({
      id: 'finance:recurring',
      category: 'observation',
      text: `Je vaste lasten zijn ${formatCurrency(finance.totalRecurringAmount)} per maand, ${pct}% van je inkomen${topLabel}.`,
      href: '/overzicht/cashflow',
      hefboom: 'cashflow',
    })
  }

  // 11. Box 3-druk — concreet jaarbedrag i.p.v. alleen de kalenderzin, met
  //     vrijheidsdagen-equivalent en de tegenbewijs-route als handeling.
  if (finance.box3Tax != null && finance.box3Tax > 0) {
    const days = freedomDaysLabel(finance.box3Tax, dailyExp)
    out.push({
      id: 'finance:box3',
      category: 'tip',
      text: `Je geschatte Box 3-heffing is ${formatCurrency(finance.box3Tax)} dit jaar${days ? ` — ${days}` : ''}. Check of tegenbewijs (werkelijk rendement) voordeliger is.`,
      href: '/overzicht/belasting/box3',
      hefboom: 'belasting',
    })
  }

  // 12. Fee-erosie — jaarlijkse fondskosten boven de drempel. Kosten zijn
  //     "stille" vrijheidsdagen die elk jaar terugkomen.
  const fees = finance.feeAnalysis
  if (fees && fees.totalAnnualFee >= FEE_EROSION_MIN) {
    const days = freedomDaysLabel(fees.totalAnnualFee, dailyExp)
    const ter = nlDecimal(fees.weightedTER * 100, 2)
    out.push({
      id: 'finance:fees',
      category: 'tip',
      text: `Je fondskosten zijn ${formatCurrency(fees.totalAnnualFee)} per jaar (${ter}% TER)${days ? ` — ${days}, elk jaar opnieuw` : ''}.`,
      href: '/overzicht/bezittingen',
      hefboom: 'bezittingen',
    })
  }

  // 13. Hypotheek vs beleggen — alleen bij een duidelijke winnaar.
  const hvb = finance.hvbSummary
  if (hvb && hvb.aanbeveling !== 'gelijk') {
    const actie = hvb.aanbeveling === 'aflossen' ? 'extra aflossen' : 'beleggen'
    out.push({
      id: 'finance:hvb',
      category: 'tip',
      text: `Met ${nlDecimal(hvb.rente, 1)}% hypotheekrente is ${actie} nu rekenkundig voordeliger.`,
      href: '/overzicht/schulden',
      hefboom: 'schulden',
    })
  }

  return out
}

/** Drempel (EUR/jaar) waarboven fondskosten een eigen briefje krijgen. */
const FEE_EROSION_MIN = 100

/** NL-decimaalnotatie (komma) met vast aantal decimalen. */
function nlDecimal(value: number, decimals: number): string {
  return value.toFixed(decimals).replace('.', ',')
}

/**
 * Bouw het "Time Machine"-weerbaarheidsbriefje uit de backtest-uitkomst.
 * Vuurt alleen met data (rate + ≥1 benoemde crash). Noemt bij een gefaalde
 * crash eerlijk die crash (heads_up); anders een doorstane crash als
 * hoogtepunt (milestone). Het percentage is de aggregaat-slaagkans.
 */
function buildResilienceEntry(finance: BriefingFinanceInput): BriefingEntry | null {
  const rate = finance.backtestSuccessRate
  const paths = finance.backtestNamedPaths
  if (rate == null || !paths || paths.length === 0) return null
  const ratePct = Math.round(rate)
  const failed = paths.find((p) => !p.success)
  if (failed) {
    return {
      id: 'finance:resilience',
      category: 'heads_up',
      text: `Je plan struikelt over een crash zoals ${failed.label} — historisch houdt het ${ratePct}% van de startjaren stand. Een grotere buffer koopt die vrijheid terug.`,
      href: '/toekomst',
      hefboom: 'bezittingen',
    }
  }
  const survived = paths[0]
  return {
    id: 'finance:resilience',
    category: 'milestone',
    text: `Je plan doorstaat de grote historische crashes — ook ${survived.label}. In ${ratePct}% van de startjaren hou je het vol: dat is je vrijheid die overeind blijft, ook als de markt instort.`,
    href: '/toekomst',
    hefboom: 'bezittingen',
  }
}

/**
 * Prioriteit (hoog → laag) van een briefje op basis van zijn id-prefix. De
 * kern-entries houden exact hun bestaande onderlinge volgorde aan
 * (observation > tip > heads_up-pillar > heads_up-goal > milestone > upcoming
 * > seasonal); de financiële entries worden ertussen geweven op relevantie.
 * Een grote vermogensdaling krijgt bewust een hoge rang.
 */
function briefingRank(entry: BriefingEntry): number {
  const id = entry.id
  if (id.startsWith('observation:')) return 100
  if (id.startsWith('finance:networth')) return 95
  if (id.startsWith('tip:')) return 90
  if (id.startsWith('finance:budget')) return 88
  if (id.startsWith('aandachtspunt:')) return 87
  if (id.startsWith('finance:emergency')) return 84
  if (id.startsWith('heads_up:goal')) return 83
  if (id.startsWith('heads_up:')) return 85
  if (id.startsWith('finance:savings')) return 80
  if (id.startsWith('finance:fire')) return 78
  if (id.startsWith('milestone:')) return 75
  if (id.startsWith('finance:resilience')) return 73
  if (id.startsWith('upcoming:')) return 70
  if (id.startsWith('finance:salary')) return 68
  if (id.startsWith('market:')) return 65
  if (id.startsWith('finance:recurring')) return 62
  if (id.startsWith('finance:cashdrag')) return 60
  if (id.startsWith('finance:box3')) return 58
  if (id.startsWith('finance:fees')) return 57
  if (id.startsWith('finance:hvb')) return 56
  if (id.startsWith('seasonal:')) return 55
  if (id.startsWith('checkin:')) return 52
  if (id.startsWith('finance:actions')) return 40
  return 50
}

/** Max. aantal briefjes per hefboom-domein — dwingt spreiding af zodat de
 *  zichtbare 6 niet door één domein (bv. drie cashflow-kaartjes) worden
 *  gedomineerd. Entries zonder hefboom-tag (cross-domein) tellen niet mee. */
const MAX_PER_HEFBOOM = 2

/**
 * Weef kern- en finance-entries samen op prioriteit (stabiele sort op rank,
 * aflopend), met domein-spreiding: max MAX_PER_HEFBOOM per hefboom-tag.
 * Toegepast op alleen de kern-entries reproduceert dit exact de bestaande
 * volgorde, dus deze merge is veilig voor de niet-finance-tests.
 */
function mergeRankedEntries(
  core: BriefingEntry[],
  finance: BriefingEntry[],
): BriefingEntry[] {
  const ranked = [...core, ...finance].sort((a, b) => briefingRank(b) - briefingRank(a))
  const perHefboom = new Map<HefboomTag, number>()
  return ranked.filter((entry) => {
    if (!entry.hefboom) return true
    const seen = perHefboom.get(entry.hefboom) ?? 0
    if (seen >= MAX_PER_HEFBOOM) return false
    perHefboom.set(entry.hefboom, seen + 1)
    return true
  })
}

// ── Seizoens-entries ────────────────────────────────────────────────
//
// Plan T-1 (Tier-3 #16) uitbreiding: contextuele kalender-zinnen die de
// briefing relevant maken voor het NL-fiscale jaar. Reageert op:
//   - Box 3-peildatum (1 januari)
//   - IB-aangifte-deadline (1 mei, met 7-dagen-prewarning)
//   - Jaareinde pensioen-jaarruimte (november-december)
//   - Vakantieperiode (juli-augustus)
//   - Vakantiegeld (mei, eind-week 3)
//
// Returnt 1 entry of null. Picks per categorie zijn date-window-gebonden.

interface SeasonalRule {
  /** Match-functie op de huidige datum (timezone-onafhankelijk). */
  match: (now: Date) => boolean
  /** Bouw het entry-object zodra match is gevallen. */
  build: (now: Date) => BriefingEntry
}

function daysUntil(now: Date, targetMonth: number, targetDay: number): number {
  const year = now.getFullYear()
  let target = new Date(year, targetMonth - 1, targetDay)
  if (target.getTime() < now.getTime()) {
    target = new Date(year + 1, targetMonth - 1, targetDay)
  }
  const msPerDay = 1000 * 60 * 60 * 24
  return Math.ceil((target.getTime() - now.getTime()) / msPerDay)
}

const SEASONAL_RULES: SeasonalRule[] = [
  // Box 3-peildatum (1 januari) — geldig hele januari + eerste week februari.
  {
    match: (now) => {
      const m = now.getMonth() + 1
      const d = now.getDate()
      return m === 1 || (m === 2 && d <= 7)
    },
    build: () => ({
      id: 'seasonal:box3-peildatum',
      category: 'heads_up',
      text: 'Box 3-peildatum was 1 januari. Check je vermogen voor de IB-aangifte.',
      href: '/overzicht/belasting',
      hefboom: 'belasting',
    }),
  },
  // Aangifte-deadline 1 mei — geldig vanaf 1 april tot en met 30 april.
  {
    match: (now) => {
      const m = now.getMonth() + 1
      return m === 4
    },
    build: (now) => {
      const days = daysUntil(now, 5, 1)
      return {
        id: 'seasonal:aangifte-deadline',
        category: 'heads_up',
        text:
          days <= 7
            ? `Aangifte-deadline ${days === 1 ? 'morgen' : `over ${days} dagen`}. Heb je je IB-aangifte ingediend?`
            : 'IB-aangifte-deadline 1 mei nadert. Plan deze week even tijd in.',
        href: '/overzicht/belasting',
        hefboom: 'belasting',
      }
    },
  },
  // Vakantiegeld komt eraan — mei (rond 25e bij de meeste werkgevers).
  {
    match: (now) => now.getMonth() + 1 === 5 && now.getDate() >= 15 && now.getDate() <= 31,
    build: () => ({
      id: 'seasonal:vakantiegeld',
      category: 'upcoming',
      text: 'Vakantiegeld komt eind deze maand. Direct doorstorten naar je doel of beleggen levert het meeste vrijheid.',
      href: '/overzicht/cashflow',
      hefboom: 'cashflow',
    }),
  },
  // Vakantieperiode — juli + augustus.
  {
    match: (now) => {
      const m = now.getMonth() + 1
      return m === 7 || m === 8
    },
    build: () => ({
      id: 'seasonal:zomer-uitgaven',
      category: 'heads_up',
      text: 'Zomer-uitgaven liggen typisch 15-25% boven gemiddeld. Vergelijk straks je augustus met vorig jaar.',
      href: '/overzicht/cashflow',
      hefboom: 'cashflow',
    }),
  },
  // Jaareinde pensioen-jaarruimte — november (vroege heads-up) +
  // december (last-call). Veel gebruikers laten de aftrekruimte
  // ongebruikt liggen.
  {
    match: (now) => {
      const m = now.getMonth() + 1
      return m === 11 || m === 12
    },
    build: (now) => {
      const m = now.getMonth() + 1
      return {
        id: 'seasonal:jaarruimte',
        category: m === 12 ? 'heads_up' : 'upcoming',
        text:
          m === 12
            ? 'Pensioen-jaarruimte vervalt 31 december. Laatste kans voor extra lijfrente-inleg met IB-aftrek.'
            : 'Jaareinde nadert: check je pensioen-jaarruimte voor 2026. Een lijfrente-storting bespaart Box 1-belasting.',
        href: '/overzicht/belasting',
        hefboom: 'belasting',
      }
    },
  },
]

export function buildSeasonalEntry(now: Date): BriefingEntry | null {
  for (const rule of SEASONAL_RULES) {
    if (rule.match(now)) return rule.build(now)
  }
  return null
}

// De vroegere template-based natural-language-laag (`buildBriefingNarrative`)
// is verwijderd: die werd nergens live aangeroepen en is vervangen door de
// AI-redactielaag in lib/briefing/redactie.ts (kop-zin + tekst-redactie met
// nummer-guard, deterministische terugval).
