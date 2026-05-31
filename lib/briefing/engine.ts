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
//  3. fundament voor toekomstige uitbreiding — natural-language layer
//     (Cleo-stijl) of LLM-templating kan hier inhaken zonder page-rewrite
//
// Categorieën (matchend met BriefingPanel):
//  - observation  Will-recommendations[0]              (analyse-output)
//  - tip          Will-recommendations[1]              (actie-suggestie)
//  - upcoming     eerstvolgend life-event ≤90 dagen
//  - heads_up     laagst-scorende health-pillar < 50
//  - milestone    behaald doel OF +5 punten health-score t.o.v. vorige maand
//  - market       (toekomst) externe feed — voorlopig niet gepowered

import { formatCurrency } from '@/lib/format'
import type { HealthScore } from '@/lib/financial-health'
import type { LifeEvent } from '@/lib/horizon-data'
import type { Recommendation } from '@/lib/recommendation-data'
import type { BriefingEntry, HefboomTag } from '@/components/overview/briefing-panel'

/**
 * Health-pillar id → hefboom-tag. Plan T-3: tips visueel gekoppeld aan
 * hefbomen. Wanneer geen 1-op-1 mapping (bv. fire_progress is cross-
 * hefboom) → undefined zodat de briefing-card geen onjuiste tag krijgt.
 */
function pillarToHefboom(pillarId: string): HefboomTag | undefined {
  switch (pillarId) {
    case 'diversification':
      return 'bezittingen'
    case 'debt_ratio':
      return 'schulden'
    case 'savings_rate':
    case 'emergency_fund':
      return 'cashflow'
    case 'tax_optimization':
      return 'belasting'
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
  /** Maanduitgaven — basis voor vrijheidsdagen-omrekening (/30 = dagbasis). */
  monthlyExpenses?: number
  /** Maandinkomen — basis voor de spaarquote. */
  monthlyIncome?: number
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
}

export interface BriefingEngineInput {
  /** Will-recommendations gesorteerd op prioriteit (eerste = belangrijkste). */
  recommendations: Recommendation[]
  /** Levensgebeurtenissen uit horizonData. */
  events: LifeEvent[]
  /** Gezondheidsscore uit horizonData (inclusief pillars + trend). */
  health: HealthScore | null
  /** Doelen + bijbehorende voortgang. Indices moeten parallel zijn. */
  goalNames: string[]
  goalProgresses: GoalProgressInput[]
  /** Optionele financiële context — voedt de verrijkte briefing-bronnen.
   *  Wanneer afwezig blijft de engine-output identiek aan voorheen. */
  finance?: BriefingFinanceInput
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
 * Volgorde van entries:
 *  1. observation (uit recommendations)
 *  2. tip         (uit recommendations)
 *  3. heads_up    (uit health-pillars)
 *  4. milestone   (uit goals + score-trend)
 *  5. upcoming    (uit life-events)
 *
 * Deze volgorde reflecteert urgentie: feiten over je situatie eerst,
 * dan acties, dan zorgwekkende items, dan positieve hoogtepunten, dan
 * vooruitblik. Markt-content (categorie 'market') volgt zodra dat
 * gepowered wordt.
 */
export function buildBriefingEntries(input: BriefingEngineInput): BriefingEntry[] {
  const now = input.now ?? new Date()
  const entries: BriefingEntry[] = []

  // 1. Observation — eerste Will-recommendation
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

  // 2. Tip — tweede Will-recommendation
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
  const worstGoalIdx = input.goalProgresses
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => !p.onTrack && p.pct < 50 && p.pct > 0)
    .sort((a, b) => a.p.pct - b.p.pct)[0]?.i
  if (worstGoalIdx != null) {
    const goalName = input.goalNames[worstGoalIdx]
    const progress = input.goalProgresses[worstGoalIdx]
    if (goalName && progress) {
      entries.push({
        id: `heads_up:goal:${worstGoalIdx}`,
        category: 'heads_up',
        text: `${goalName} ligt achter op planning (${Math.round(progress.pct)}%) — extra inleg deze maand?`,
        href: '/toekomst?tab=doelen',
      })
    }
  }

  // 4. Milestone — twee triggers, één entry per briefing:
  //    (a) doel dat 100% raakt (= behaald)
  //    (b) health-score-trend >= +5 punten t.o.v. vorige maand
  //    Voorkeur: (a) eerst, want concreter dan een score-stijging.
  const completedGoalIdx = input.goalProgresses.findIndex(
    (p) => p.pct >= 100,
  )
  if (completedGoalIdx !== -1) {
    const goalName = input.goalNames[completedGoalIdx]
    if (goalName) {
      entries.push({
        id: 'milestone:goal:' + completedGoalIdx,
        category: 'milestone',
        text: `Mijlpaal: doel "${goalName}" behaald.`,
        href: '/toekomst?tab=doelen',
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
  if (input.marketEntry) extra.push(input.marketEntry)
  if (extra.length > 0) {
    return mergeRankedEntries(entries, extra)
  }

  return entries
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
  const dailyExp =
    finance.monthlyExpenses && finance.monthlyExpenses > 0
      ? finance.monthlyExpenses / 30
      : 0

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
  //    én er échte uitgaven-data is (anders rekent income-0 = 100% spaarquote,
  //    wat een ontbrekende-data-staat als perfecte spaarquote zou tonen).
  if (
    !budgetShown &&
    finance.monthlyIncome &&
    finance.monthlyIncome > 0 &&
    finance.monthlyExpenses != null &&
    finance.monthlyExpenses > 0
  ) {
    const income = finance.monthlyIncome
    const savings = income - finance.monthlyExpenses
    const ratePct = Math.round((savings / income) * 100)
    const days = freedomDaysLabel(savings, dailyExp)
    if (savings < 0) {
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

  // 5. Salaris-countdown — binnen 10 dagen, alleen met bekend inkomen.
  if (finance.monthlyIncome && finance.monthlyIncome > 0) {
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

  return out
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
  if (id.startsWith('heads_up:goal')) return 83
  if (id.startsWith('heads_up:')) return 85
  if (id.startsWith('finance:savings')) return 80
  if (id.startsWith('finance:fire')) return 78
  if (id.startsWith('milestone:')) return 75
  if (id.startsWith('finance:resilience')) return 73
  if (id.startsWith('upcoming:')) return 70
  if (id.startsWith('finance:salary')) return 68
  if (id.startsWith('market:')) return 65
  if (id.startsWith('finance:cashdrag')) return 60
  if (id.startsWith('seasonal:')) return 55
  if (id.startsWith('finance:actions')) return 40
  return 50
}

/**
 * Weef kern- en finance-entries samen op prioriteit (stabiele sort op rank,
 * aflopend). Toegepast op alleen de kern-entries reproduceert dit exact de
 * bestaande volgorde, dus deze merge is veilig voor de niet-finance-tests.
 */
function mergeRankedEntries(
  core: BriefingEntry[],
  finance: BriefingEntry[],
): BriefingEntry[] {
  return [...core, ...finance].sort((a, b) => briefingRank(b) - briefingRank(a))
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

// ── Natural-language narrative ─────────────────────────────────────
//
// Plan-context: T-1 (Tier-3 #16) "Wekelijkse briefing in natuurlijke taal,
// gerendered server-side, gecached per gebruiker. 4-zinnen samenvatting
// + 1 concrete actie."
//
// Voorlopig template-based (geen LLM-call). Eén zin per actieve categorie,
// verbonden met natuurlijke connectoren. Tone: rustig en informatief,
// niet casual — past bij TriFinity editorial-stijl. Bij weinig data
// blijft de output beknopt (1-2 zinnen) i.p.v. holle vulling.

interface NarrativeFragment {
  /** Inleidende connector — undefined voor eerste fragment. */
  connector?: string
  /** Body-tekst zonder eindpunt; engine voegt punctuatie toe. */
  body: string
}

const CATEGORY_CONNECTORS: Record<string, string[]> = {
  observation: [], // eerste fragment, geen connector
  tip:         ['Tegelijkertijd', 'Daarnaast', 'Verder'],
  heads_up:    ['Let op', 'Aandacht', 'Wel'],
  milestone:   ['Mooi nieuws', 'Plus', 'En'],
  upcoming:    ['Op de horizon', 'Komende periode', 'Vooruitkijkend'],
  market:      ['Markt', 'Buitenwereld'],
}

function fragmentForEntry(
  entry: BriefingEntry,
  index: number,
): NarrativeFragment {
  // Eerste entry: geen connector (begin van alinea).
  // Daarna: roteer door beschikbare connectoren zodat herhaling
  // beperkt blijft over meerdere weken.
  const options = CATEGORY_CONNECTORS[entry.category] ?? []
  const connector =
    index === 0 || options.length === 0
      ? undefined
      : options[index % options.length]
  // Cap-titel-eerst-woord op één char lowercased zodat de zin
  // grammaticaal vloeit ná een connector ("Tegelijkertijd verschuif...")
  let body = entry.text
  if (connector && body.length > 0) {
    body = body.charAt(0).toLowerCase() + body.slice(1)
  }
  return { connector, body }
}

/**
 * Bouw een natuurlijke-taal samenvatting uit BriefingEntry[]. Returnt
 * `null` wanneer er onvoldoende inhoud is om een zinvolle alinea te
 * vormen (< 1 entry). Anders: 1-5 zinnen aan elkaar geregen.
 *
 * Will-persona: de output is "stem van Will" (plan §6.5). Het is aan
 * de display-component of er een "Will:" prefix wordt getoond.
 *
 * Cap op MAX_NARRATIVE_FRAGMENTS (= 4) zodat de alinea kort en scanbaar
 * blijft — de visuele cards in BriefingPanel kunnen tot 6 entries
 * tonen voor wie meer detail wil.
 */
export const MAX_NARRATIVE_FRAGMENTS = 4

export function buildBriefingNarrative(entries: BriefingEntry[]): string | null {
  if (entries.length === 0) return null
  const capped = entries.slice(0, MAX_NARRATIVE_FRAGMENTS)
  const fragments = capped.map((entry, i) => fragmentForEntry(entry, i))
  const sentences = fragments.map((f) => {
    const text = f.connector ? `${f.connector} ${f.body}` : f.body
    // Eind-punt veiligstellen.
    return text.replace(/[.!?]\s*$/, '') + '.'
  })
  return sentences.join(' ')
}
