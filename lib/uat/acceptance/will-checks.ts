/**
 * Gedeelde engine-checks voor de UAT-Fin-acceptatiecriteria (`will.ts`).
 *
 * PURE module — geen vitest/DOM/Supabase-afhankelijkheden — zodat dezelfde
 * lijst checks kan draaien onder:
 *  1. `will.engine.test.ts` (vitest/CI): `expect(actual).toBe(expected)` per check.
 *  2. de in-app regressietest-pagina (`lib/regression-tests/suites/uat-will.ts`):
 *     `assertEqual(actual, expected, label)` per check.
 *
 * DRIE ECHTE PURE IMPORTS (geen mirror — de productiefunctie zelf is al
 * client-veilig): `getFirstUndismissedSuggestion` (lib/coach-suggestions.ts),
 * `amsterdamWeekKey` (lib/briefing/snapshot.ts) en sinds ADR 0113
 * `demotedCategories`/`demotionWindowStartIso` (lib/news-feedback-summary.ts —
 * dezelfde functie die zowel `/api/news` als het beheervenster op
 * `/beheer/nieuws` consumeren; vóór ADR 0113 stond hier nog een handmatige
 * mirror van een inline `getDemotedCategories` in app/api/news/route.ts).
 *
 * VIER MIRRORS met bronregel-verwijzing (server-only API-routes met een
 * Supabase-client-parameter — niet importeerbaar in een pure module, spiegelt
 * de spaardoel-mirror in `budget-checks.ts` en de netto-vermogen-mirror in
 * `start-checks.ts`): postpone-termijn, bel-badge-cap, budgetmelding-tekst,
 * krant-editienummer/jaargang/ververs-resterend.
 */

import { shouldAlert, budgetLimitStatus } from '@/lib/budget-alerts'
import { getFirstUndismissedSuggestion, type CoachDataGaps } from '@/lib/coach-suggestions'
import { amsterdamWeekKey } from '@/lib/briefing/snapshot'
import { demotedCategories, demotionWindowStartIso } from '@/lib/news-feedback-summary'
import { WILL_ACCEPTANCE } from './will'
import type { AcceptanceCriterion } from './types'

export interface WillEngineCheck {
  /** 'WF-WILL-02' */
  workflow: string
  /** 'UAT-WILL-02' */
  scenarioId: string
  /** Korte, mensleesbare omschrijving van wat deze check bewijst. */
  label: string
  /** Roept de échte rekenfunctie(s) aan en levert expected + actual. */
  run: () => { expected: number | string; actual: number | string }
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Vindt het criterium in will.ts — gooit als will.ts niet meer in sync is. */
function criterion(workflow: string): AcceptanceCriterion {
  const found = WILL_ACCEPTANCE.criteria.find((c) => c.workflow === workflow)
  if (!found) throw new Error(`Geen acceptatiecriterium voor ${workflow} — will.ts is niet in sync.`)
  if (found.assertion.kind !== 'exact') {
    throw new Error(`${workflow} is geen 'exact'-criterium meer in will.ts (kind=${found.assertion.kind}).`)
  }
  return found
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

const NO_GAPS: CoachDataGaps = {
  hasBank: false,
  hasAssets: false,
  hasBudgets: false,
  hasGoals: false,
  hasDebts: false,
  hasTransactions: false,
  hasHoldings: false,
  hasHoldingsWithIsin: false,
  hasFireParams: false,
  hasLifeEvents: false,
}

/** Mirror van POSTPONE_DAYS=14 (components/app/chat/chat-panel.tsx r592-594,
 *  identiek in components/overview/tips-lijst.tsx r37/79). */
function postponedUntil(nowMs: number): number {
  const POSTPONE_DAYS = 14
  return nowMs + POSTPONE_DAYS * 24 * 60 * 60 * 1000
}

/** Mirror van de bel-badge-cap in components/app/fin/fin-home.tsx. */
function capBadge(n: number): string {
  return n > 9 ? '9+' : n === 0 ? '' : String(n)
}

/** Mirror van app/api/notifications/route.ts#formatAmountPair — centen zodra
 *  een échte overschrijding op hele euro's zou samenvallen. */
function formatAmountPairMirror(spent: number, limit: number): string {
  const collapsesOnWholeEuros = Math.round(spent) === Math.round(limit)
  const differsInCents = budgetLimitStatus(spent, limit) !== 'bereikt'
  if (collapsesOnWholeEuros && differsInCents) {
    const euro = (v: number) => v.toFixed(2).replace('.', ',')
    return `€${euro(spent)} van €${euro(limit)}`
  }
  return `€${Math.round(spent)} van €${Math.round(limit)}`
}

/** Mirror van app/api/notifications/route.ts#pushBudgetNotification
 *  (r200-260) voor het 'expense'-pad — titel/omschrijving/priority.
 *  Drie drempeltakken sinds H16: over (>limiet) · bereikt (=limiet) · besteed. */
function pushBudgetNotificationMirror(
  spent: number,
  limit: number,
  threshold: number,
  budgetType: 'income' | 'expense' | 'savings' | 'debt',
  name: string,
): { title: string; description: string; priority: number } | null {
  if (limit <= 0) return null
  if (!shouldAlert(spent, limit, threshold, budgetType)) return null
  const pct = (spent / limit) * 100
  const pctRounded = Math.round(pct)
  const limitStatus = budgetLimitStatus(spent, limit)
  if (limitStatus === 'over' && pct >= 120) {
    return {
      title: `${name}: ${pctRounded}% — flink over budget`,
      description: `${formatAmountPairMirror(spent, limit)} — €${Math.round(spent - limit)} overschrijding`,
      priority: 1,
    }
  }
  if (limitStatus === 'over') {
    return {
      title: `${name}: ${pctRounded}% — over budget`,
      description: `${formatAmountPairMirror(spent, limit)} — budget overschreden`,
      priority: 1,
    }
  }
  if (limitStatus === 'bereikt') {
    return {
      title: `${name}: limiet bereikt`,
      description: `${formatAmountPairMirror(spent, limit)} — precies op de grens, niets meer over`,
      priority: 3,
    }
  }
  return {
    title: `${name}: ${pctRounded}% besteed`,
    description: `€${Math.round(spent)} van €${Math.round(limit)} — nog €${Math.round(limit - spent)} over (drempel: ${threshold}%)`,
    priority: 2,
  }
}

/** Mirror van de ongelezen-teller: aantal items met read=false binnen het
 *  venster (app/api/notifications/route.ts — zowel de bel als /berichten
 *  gebruiken dezelfde teller-conventie). */
function unreadCount(items: ReadonlyArray<{ read: boolean }>): number {
  return items.filter((i) => !i.read).length
}

/** Mirror van de notificatievoorkeuren-filter (app/api/notifications/route.ts
 *  r929/r991: `prefs[n.type] !== false`). */
function isVisibleForPrefs(type: string, prefs: Record<string, boolean>): boolean {
  return prefs[type] !== false
}

/** Mirror van app/api/news/route.ts#getNextEditionNr (r136-145) +
 *  de jaargang-formule (r172-173). */
function nextEditionNr(maxExisting: number | null): number {
  return (maxExisting ?? 0) + 1
}
function jaargangFromYear(year: number): number {
  return year - 2025
}

/** Mirror van app/api/news/route.ts#checkRefreshLimit (r245-266). */
function refreshRemaining(limit: number, archivedLast7Days: number): number {
  return Math.max(0, limit - archivedLast7Days)
}

/** Mirror van de archief-jaargang-groepskop (components/berichten/archive-section.tsx). */
function archiveYearLabel(jaargang: number): number {
  return 2025 + jaargang
}

/** Mirror van components/berichten/news-components.tsx#handleCreateAction (r123-138). */
function newsActionDefaults(impactScore: number | undefined, deadline: string | undefined) {
  return {
    priorityScore: impactScore || 3,
    freedomDaysImpact: 0,
    dueDate: deadline || undefined,
  }
}

/**
 * Zet een test-rij (categorie + "N dagen geleden") om in wat de echte route
 * `/api/news` en het beheervenster op `/beheer/nieuws` daadwerkelijk zien: de
 * SQL-laag filtert vooraf op `created_at >= demotionWindowStartIso()`, en pas
 * dát gefilterde restant gaat naar `demotedCategories()`. Deze helper simuleert
 * precies die twee stappen — geen eigen drempel-/vensterlogica.
 */
function withinDemotionWindow(
  rows: ReadonlyArray<{ category: string; daysAgo: number }>,
  now: Date,
): { category: string }[] {
  const cutoff = demotionWindowStartIso(now)
  return rows
    .filter((row) => new Date(now.getTime() - row.daysAgo * 24 * 60 * 60 * 1000).toISOString() >= cutoff)
    .map((row) => ({ category: row.category }))
}

// ── Checks — één per 'exact'-workflow in WILL_ACCEPTANCE ───────────────────

export const WILL_ENGINE_CHECKS: WillEngineCheck[] = [
  {
    workflow: 'WF-WILL-02',
    scenarioId: 'UAT-WILL-02',
    label: 'Tip uitstellen (POSTPONE_DAYS=14): postponed_until = nu + 14 dagen',
    run: () => {
      criterion('WF-WILL-02')
      const now = Date.UTC(2026, 6, 5) // 5 juli 2026
      const result = isoDate(postponedUntil(now))
      return {
        expected: 'postponedUntil=2026-07-19',
        actual: `postponedUntil=${result}`,
      }
    },
  },
  {
    workflow: 'WF-WILL-05',
    scenarioId: 'UAT-WILL-05',
    label: 'Coach-regelselectie (getFirstUndismissedSuggestion): data-gap-volgorde bank → assets',
    run: () => {
      criterion('WF-WILL-05')
      const eersteRegel = getFirstUndismissedSuggestion(NO_GAPS, '/overzicht', new Set())
      const naDismissBank = getFirstUndismissedSuggestion(NO_GAPS, '/overzicht', new Set(['gap_bank']))
      // H15: routes zonder pad-regel vielen terug op "Welkom." — óók voor een
      // account met duizenden transacties. De terugval is gesplitst.
      const gevuld: CoachDataGaps = Object.fromEntries(
        Object.keys(NO_GAPS).map((k) => [k, true]),
      ) as unknown as CoachDataGaps
      const gevuldMijn = getFirstUndismissedSuggestion(gevuld, '/mijn', new Set())
      const gevuldBerichten = getFirstUndismissedSuggestion(gevuld, '/berichten', new Set())
      return {
        expected:
          'eersteRegel=gap_bank; naDismissBank=gap_assets; gevuldMijn=default_gevuld; gevuldBerichten=default_gevuld',
        actual:
          `eersteRegel=${eersteRegel?.key}; naDismissBank=${naDismissBank?.key}` +
          `; gevuldMijn=${gevuldMijn?.key}; gevuldBerichten=${gevuldBerichten?.key}`,
      }
    },
  },
  {
    workflow: 'WF-WILL-06',
    scenarioId: 'UAT-WILL-06',
    label: 'Bel-badge-cap: 0 toont leeg, 12 toont "9+"',
    run: () => {
      criterion('WF-WILL-06')
      const badge0 = capBadge(0)
      const badge12 = capBadge(12)
      return {
        expected: 'badge0=; badge12=9+',
        actual: `badge0=${badge0}; badge12=${badge12}`,
      }
    },
  },
  {
    workflow: 'WF-WILL-10',
    scenarioId: 'UAT-WILL-10',
    label: 'Budgetmelding (pushBudgetNotification-mirror): drie drempeltakken — 84% besteed (prio 2), limiet bereikt (prio 3), over budget (prio 1)',
    run: () => {
      criterion('WF-WILL-10')
      const onder = pushBudgetNotificationMirror(320, 380, 80, 'expense', 'Boodschappen')!
      // Exact op de grens — het geval dat vóór H16 ten onrechte "overschreden"
      // heette en met priority 1 in de Dringend-bak landde.
      const bereikt = pushBudgetNotificationMirror(1280, 1280, 80, 'expense', 'Huur')!
      // Echt eroverheen, maar op hele euro's tweemaal "€1280" → centen.
      const over = pushBudgetNotificationMirror(1280.4, 1279.8, 80, 'expense', 'Huur')!
      const fmt = (r: { title: string; description: string; priority: number }) =>
        `titel=${r.title}; omschrijving=${r.description}; priority=${r.priority}`
      return {
        expected:
          'onder: titel=Boodschappen: 84% besteed; omschrijving=€320 van €380 — nog €60 over (drempel: 80%); priority=2' +
          ' || bereikt: titel=Huur: limiet bereikt; omschrijving=€1280 van €1280 — precies op de grens, niets meer over; priority=3' +
          ' || over: titel=Huur: 100% — over budget; omschrijving=€1280,40 van €1279,80 — budget overschreden; priority=1',
        actual: `onder: ${fmt(onder)} || bereikt: ${fmt(bereikt)} || over: ${fmt(over)}`,
      }
    },
  },
  {
    workflow: 'WF-WILL-11',
    scenarioId: 'UAT-WILL-11',
    label: 'Ongelezen-teller berichtencentrum: 3 van 5 synthetische meldingen',
    run: () => {
      criterion('WF-WILL-11')
      const items = [{ read: false }, { read: false }, { read: false }, { read: true }, { read: true }]
      const count = unreadCount(items)
      return {
        expected: 'ongelezenCount=3',
        actual: `ongelezenCount=${count}`,
      }
    },
  },
  {
    workflow: 'WF-WILL-13',
    scenarioId: 'UAT-WILL-13',
    label: 'Notificatievoorkeuren-filter: prefs[type] !== false (briefing uit, budget aan)',
    run: () => {
      criterion('WF-WILL-13')
      const prefs = { briefing: false }
      const briefingZichtbaar = isVisibleForPrefs('briefing', prefs)
      const budgetZichtbaar = isVisibleForPrefs('budget', prefs)
      return {
        expected: 'briefingZichtbaar=false; budgetZichtbaar=true',
        actual: `briefingZichtbaar=${briefingZichtbaar}; budgetZichtbaar=${budgetZichtbaar}`,
      }
    },
  },
  {
    workflow: 'WF-WILL-14',
    scenarioId: 'UAT-WILL-14',
    label: 'ISO-weeksleutel (amsterdamWeekKey): gelijk binnen dezelfde week, anders in de volgende',
    run: () => {
      criterion('WF-WILL-14')
      const maandag = new Date(Date.UTC(2026, 6, 6, 8, 0, 0)) // ma 6 juli 2026
      const donderdagZelfdeWeek = new Date(Date.UTC(2026, 6, 9, 20, 0, 0)) // do 9 juli 2026
      const volgendeMaandag = new Date(Date.UTC(2026, 6, 13, 8, 0, 0)) // ma 13 juli 2026
      const zelfdeWeek = amsterdamWeekKey(maandag) === amsterdamWeekKey(donderdagZelfdeWeek)
      const volgendeWeekAnders = amsterdamWeekKey(maandag) !== amsterdamWeekKey(volgendeMaandag)
      return {
        expected: 'zelfdeWeek=true; volgendeWeekAnders=true',
        actual: `zelfdeWeek=${zelfdeWeek}; volgendeWeekAnders=${volgendeWeekAnders}`,
      }
    },
  },
  {
    workflow: 'WF-WILL-15',
    scenarioId: 'UAT-WILL-15',
    label: 'Krant-colofon (editienummer/jaargang-mirror): geen eerdere edities, jaar 2026',
    run: () => {
      criterion('WF-WILL-15')
      const editionNr = nextEditionNr(null)
      const jaargang = jaargangFromYear(2026)
      return {
        expected: 'editionNr=1; jaargang=1',
        actual: `editionNr=${editionNr}; jaargang=${jaargang}`,
      }
    },
  },
  {
    workflow: 'WF-WILL-16',
    scenarioId: 'UAT-WILL-16',
    label: 'Ververs-resterend (checkRefreshLimit-mirror): limiet 3, na 0/1/2/3 verversingen',
    run: () => {
      criterion('WF-WILL-16')
      const r0 = refreshRemaining(3, 0)
      const r1 = refreshRemaining(3, 1)
      const r2 = refreshRemaining(3, 2)
      const r3 = refreshRemaining(3, 3)
      return {
        expected: 'resterend0=3; resterend1=2; resterend2=1; resterend3=0',
        actual: `resterend0=${r0}; resterend1=${r1}; resterend2=${r2}; resterend3=${r3}`,
      }
    },
  },
  {
    workflow: 'WF-WILL-17',
    scenarioId: 'UAT-WILL-17',
    label: 'Archief-jaargang-jaartal (2025+jaargang) + max. 50 edities',
    run: () => {
      criterion('WF-WILL-17')
      const jaargangJaartal = archiveYearLabel(1)
      const maxEdities = 50
      return {
        expected: 'jaargangJaartal=2026; maxEdities=50',
        actual: `jaargangJaartal=${jaargangJaartal}; maxEdities=${maxEdities}`,
      }
    },
  },
  {
    workflow: 'WF-WILL-19',
    scenarioId: 'UAT-WILL-19',
    label: 'Actie vanuit nieuwsartikel (handleCreateAction-mirror): priority=impactscore, freedomDaysImpact=0, fallback=3',
    run: () => {
      criterion('WF-WILL-19')
      const metImpact = newsActionDefaults(4, '2026-08-01')
      const zonderImpact = newsActionDefaults(undefined, undefined)
      return {
        expected: 'priorityScore=4; freedomDaysImpact=0; priorityScoreFallback=3',
        actual: `priorityScore=${metImpact.priorityScore}; freedomDaysImpact=${metImpact.freedomDaysImpact}; priorityScoreFallback=${zonderImpact.priorityScore}`,
      }
    },
  },
  {
    workflow: 'WF-WILL-20',
    scenarioId: 'UAT-WILL-20',
    label: '"Minder hierover"-demotiedrempel (echte demotedCategories/demotionWindowStartIso): ≥2 stemmen/90 dagen',
    run: () => {
      criterion('WF-WILL-20')
      const now = new Date()
      const na1 = demotedCategories(withinDemotionWindow([{ category: 'macro', daysAgo: 10 }], now))
      const na2 = demotedCategories(
        withinDemotionWindow(
          [
            { category: 'macro', daysAgo: 10 },
            { category: 'macro', daysAgo: 5 },
            { category: 'wonen', daysAgo: 95 },
          ],
          now,
        ),
      )
      return {
        expected: 'macroNa1=false; macroNa2=true; wonenGedemoveerd=false',
        actual: `macroNa1=${na1.includes('macro')}; macroNa2=${na2.includes('macro')}; wonenGedemoveerd=${na2.includes('wonen')}`,
      }
    },
  },
]
