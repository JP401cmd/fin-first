/**
 * Gedeelde engine-checks voor de UAT-Fin-acceptatiecriteria (`will.ts`).
 *
 * PURE module — geen vitest/DOM/Supabase-afhankelijkheden — zodat dezelfde
 * lijst checks kan draaien onder:
 *  1. `will.engine.test.ts` (vitest/CI): `expect(actual).toBe(expected)` per check.
 *  2. de in-app regressietest-pagina (`lib/regression-tests/suites/uat-will.ts`):
 *     `assertEqual(actual, expected, label)` per check.
 *
 * VIER ECHTE PURE IMPORTS (geen mirror — de productiefunctie zelf is al
 * client-veilig): `getFirstUndismissedSuggestion` (lib/coach-suggestions.ts),
 * `amsterdamWeekKey` (lib/briefing/snapshot.ts) en sinds ADR 0113
 * `demotedCategories`/`demotionWindowStartIso` (lib/news-feedback-summary.ts —
 * dezelfde functie die zowel `/api/news` als het beheervenster op
 * `/beheer/nieuws` consumeren; vóór ADR 0113 stond hier nog een handmatige
 * mirror van een inline `getDemotedCategories` in app/api/news/route.ts) en
 * sinds sep 2026 `buildTipTerugNotifications` (lib/notifications/tip-terug.ts —
 * de producent die `/api/notifications` gebruikt; verving de bel-badge-mirror).
 * SINDS KRANT 1C FASE 2 (B40, ADR 0183) VIER EXTRA ECHTE PURE IMPORTS —
 * stuk voor stuk zonder Supabase-parameter, dus rechtstreeks importeerbaar:
 * `bepaalKrantBron` (lib/krant/tijdlijn-bron.ts — de bronkeuze zelf),
 * `VERNIEUW_INTERVAL_MS` (lib/krant/tijdlijn-vernieuwen.ts — de rem van 10
 * minuten), en `TIJDLIJN_PAGINA`/`KATERN_ONDER`/`codeerCursor`/`decodeerCursor`/
 * `WEEK_KEY` (lib/krant/tijdlijn-lezen.ts — paginagrootte, katerndrempel en de
 * cursor-(de)codering). SINDS MATCHER v5 (29-09-2026) OOK `voldoetAanLeescontract`/
 * `NIEUWS_MAX_OUDERDOM_DAGEN`/`MATCHER_VERSIE` (lib/krant/matcher.ts), gedraaid
 * op de gedeelde, pure fixture lib/krant/editie.fixture.ts (WF-WILL-40).
 *
 * DRIE MIRRORS met bronregel-verwijzing (server-only API-routes met een
 * Supabase-client-parameter — niet importeerbaar in een pure module, spiegelt
 * de spaardoel-mirror in `budget-checks.ts` en de netto-vermogen-mirror in
 * `start-checks.ts`): postpone-termijn, budgetmelding-tekst,
 * krant-editienummer/jaargang/ververs-resterend. SINDS KRANT 1C FASE 2 ÉÉN
 * EXTRA MIRROR: de "te snel"-tijdsvergelijking van `verversEigenTijdlijn`
 * (lib/krant/tijdlijn-vernieuwen.ts r67-69) — die functie zelf vraagt een
 * Supabase-client, maar de tijdsrekenkunde erin is puur.
 */

import { shouldAlert, budgetLimitStatus } from '@/lib/budget-alerts'
import { chatTitelUitVraag } from '@/lib/chat/history-copy'
import { resolveBackend } from '@/lib/chat/history/resolve'
import { LEGE_DATA_GAPS, selectSuggesties, suggestiePoolGrootte } from '@/lib/chat/suggesties'
import { getFirstUndismissedSuggestion, type CoachDataGaps } from '@/lib/coach-suggestions'
import { amsterdamWeekKey } from '@/lib/briefing/snapshot'
import { demotedCategories, demotionWindowStartIso } from '@/lib/news-feedback-summary'
import { buildTipTerugNotifications } from '@/lib/notifications/tip-terug'
import { bepaalKrantBron } from '@/lib/krant/tijdlijn-bron'
import { VERNIEUW_INTERVAL_MS } from '@/lib/krant/tijdlijn-vernieuwen'
import { TIJDLIJN_PAGINA, KATERN_ONDER, WEEK_KEY, codeerCursor, decodeerCursor } from '@/lib/krant/tijdlijn-lezen'
import {
  BRON_MAX_PER_BLOK,
  MATCHER_VERSIE,
  uitgeverVan,
  NIEUWS_MAX_OUDERDOM_DAGEN,
  voldoetAanLeescontract,
  type KandidaatArtikel,
  type MatchContext,
} from '@/lib/krant/matcher'
import { standaardImpactContext } from '@/lib/krant/impact'
import { matchEditie } from '@/lib/krant/matcher'
import { LEEG_PROFIEL, type NieuwsprofielV1 } from '@/lib/krant/profiel'
import { AOW_RIJEN, ARTIKELEN as KRANT_ARTIKELEN, NU as KRANT_NU, PROFIEL_TESSA } from '@/lib/krant/editie.fixture'
import {
  AI_LAAG_MAX_KANDIDATEN,
  AI_LAAG_MAX_PER_WEEK,
  AI_LAAG_MAX_TOEVOEGINGEN,
  bouwAiLaagInvoer,
  quotumOp,
  toetsAiTekst,
  verwerkAiUitvoer,
  type AiKandidaat,
} from '@/lib/krant/ai-laag'
import type { EditieItem } from '@/lib/krant/matcher'
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

/**
 * Mirror van `MAX_VERZONDEN_BERICHTEN = 20` + `verzendVenster` in
 * components/app/chat/chat-panel.tsx (ADR 0137, M3).
 *
 * Niet importeerbaar: het staat in een `'use client'`-component naast `useChat`
 * en is niet geëxporteerd. Twee dingen die deze mirror moet vasthouden: het
 * venster is 20 berichten (10 beurten) EN het schuift altijd door tot een
 * user-bericht — de eerste beurt die de provider ziet moet van de gebruiker
 * zijn, anders weigert hij het verzoek.
 */
function verzendVensterMirror(rollen: Array<'user' | 'assistant'>): Array<'user' | 'assistant'> {
  const MAX_VERZONDEN_BERICHTEN = 20
  if (rollen.length <= MAX_VERZONDEN_BERICHTEN) return rollen
  let start = rollen.length - MAX_VERZONDEN_BERICHTEN
  while (start < rollen.length && rollen[start] !== 'user') start++
  const venster = rollen.slice(start)
  return venster.length > 0 ? venster : rollen.slice(-1)
}

/** Mirror van de tijdsvergelijking in lib/krant/tijdlijn-vernieuwen.ts
 *  (r67-69, `verschil = now - vorige; verschil < VERNIEUW_INTERVAL_MS`) —
 *  de functie zelf vraagt een Supabase-client, deze rekenkunde is puur. */
function tijdlijnTeSnelMirror(nowMs: number, vorigeMs: number): boolean {
  return nowMs - vorigeMs < VERNIEUW_INTERVAL_MS
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
    label: 'Tip terug: alleen een verlopen termijn binnen 30 dagen geeft een bericht',
    run: () => {
      criterion('WF-WILL-06')
      const berichten = buildTipTerugNotifications(
        [
          { id: 'A', title: 'Tip A', status: 'postponed', postponed_until: '2026-09-12' },
          { id: 'B', title: 'Tip B', status: 'postponed', postponed_until: '2026-09-14' },
          { id: 'C', title: 'Tip C', status: 'postponed', postponed_until: '2026-08-01' },
        ],
        '2026-09-13',
      )
      return {
        expected: 'berichten=postponed_tip_A_2026-09-12; url=/overzicht/tips',
        actual: `berichten=${berichten.map((b) => b.id).join(',')}; url=${berichten.map((b) => b.actionUrl).join(',')}`,
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
  {
    workflow: 'WF-WILL-27',
    scenarioId: 'UAT-WILL-27',
    label: 'Gesprekstitel uit de eerste vraag (echte chatTitelUitVraag) + het verzendvenster van 20 berichten start altijd op een user-beurt',
    run: () => {
      criterion('WF-WILL-27')
      const lang = chatTitelUitVraag(
        'Hoeveel vrijheidstijd levert het op als ik mijn hypotheek extra aflos?',
      )
      // Korter dan 60 tekens: onveranderd, alleen witruimte genormaliseerd.
      const kort = chatTitelUitVraag('  Wat kost mijn   auto? ')
      // 25 beurten, om en om beginnend bij de gebruiker. Kaal afkappen op 20
      // zou op index 5 beginnen — een assistent-bericht — dus schuift het
      // venster één op naar de user-beurt op index 6: 19 berichten.
      const rollen = Array.from({ length: 25 }, (_, i) =>
        i % 2 === 0 ? ('user' as const) : ('assistant' as const),
      )
      const venster = verzendVensterMirror(rollen)
      return {
        expected:
          'titel=Hoeveel vrijheidstijd levert het op als ik mijn hypotheek…; kortOngewijzigd=Wat kost mijn auto?; venster25=19; vensterStartRol=user',
        actual: `titel=${lang}; kortOngewijzigd=${kort}; venster25=${venster.length}; vensterStartRol=${venster[0]}`,
      }
    },
  },
  {
    workflow: 'WF-WILL-30',
    scenarioId: 'UAT-WILL-30',
    label: 'Privacyvloer (echte resolveBackend): account+lokaal landt op het apparaat, nooit op de server',
    run: () => {
      criterion('WF-WILL-30')
      const r = (m: 'account' | 'apparaat' | 'uit', o: 'cloud' | 'lokaal') => resolveBackend(m, o)
      return {
        expected:
          'uit+cloud=geen; uit+lokaal=geen; apparaat+cloud=apparaat; apparaat+lokaal=apparaat; account+cloud=server; account+lokaal=apparaat',
        actual:
          `uit+cloud=${r('uit', 'cloud')}; uit+lokaal=${r('uit', 'lokaal')}; ` +
          `apparaat+cloud=${r('apparaat', 'cloud')}; apparaat+lokaal=${r('apparaat', 'lokaal')}; ` +
          `account+cloud=${r('account', 'cloud')}; account+lokaal=${r('account', 'lokaal')}`,
      }
    },
  },
  {
    workflow: 'WF-WILL-31',
    scenarioId: 'UAT-WILL-31',
    label: 'Suggestieselectie (echte selectSuggesties/suggestiePoolGrootte): deterministisch, roterend, en op een leeg account alleen vragen zonder datavereiste',
    run: () => {
      criterion('WF-WILL-31')
      const pathname = '/overzicht'
      const leeg = { pathname, data: LEGE_DATA_GAPS, aantal: 3 }
      const gevuld = {
        pathname,
        data: Object.fromEntries(
          Object.keys(LEGE_DATA_GAPS).map((k) => [k, true]),
        ) as CoachDataGaps,
        aantal: 3,
      }
      const seed0 = selectSuggesties({ ...leeg, seed: 0 })
      const seed0Opnieuw = selectSuggesties({ ...leeg, seed: 0 })
      const seed1 = selectSuggesties({ ...leeg, seed: 1 })
      const ids = (lijst: ReadonlyArray<{ id: string }>) => lijst.map((s) => s.id).join(',')
      return {
        expected:
          'aantalLeegAccount=3; alleZonderVereist=true; zelfdeSeedGelijk=true; andereSeedAnders=true; poolGroeitMetData=true',
        actual:
          `aantalLeegAccount=${seed0.length}; ` +
          `alleZonderVereist=${seed0.every((s) => (s.vereist ?? []).length === 0)}; ` +
          `zelfdeSeedGelijk=${ids(seed0) === ids(seed0Opnieuw)}; ` +
          `andereSeedAnders=${ids(seed0) !== ids(seed1)}; ` +
          `poolGroeitMetData=${suggestiePoolGrootte(gevuld) > suggestiePoolGrootte(leeg)}`,
      }
    },
  },
  {
    workflow: 'WF-WILL-33',
    scenarioId: 'UAT-WILL-33',
    label: 'Bronkeuze /nieuws (echte bepaalKrantBron): Krant-account nooit AI, bewuste keuze wint, standaard volgt de bèta',
    run: () => {
      criterion('WF-WILL-33')
      const krantBuitenBeta = bepaalKrantBron({ krantAccount: true, variant: null, inBeta: false, aiToegestaan: true })
      const krantBinnenBeta = bepaalKrantBron({ krantAccount: true, variant: null, inBeta: true, aiToegestaan: true })
      const geheelGeenVariantBuitenBeta = bepaalKrantBron({ krantAccount: false, variant: null, inBeta: false, aiToegestaan: true })
      const geheelGeenVariantBinnenBeta = bepaalKrantBron({ krantAccount: false, variant: null, inBeta: true, aiToegestaan: true })
      const geheelVariantAiBuitenBeta = bepaalKrantBron({ krantAccount: false, variant: 'ai', inBeta: false, aiToegestaan: true })
      const geheelVariantAiBinnenBeta = bepaalKrantBron({ krantAccount: false, variant: 'ai', inBeta: true, aiToegestaan: true })
      // aiToegestaan false (kill-switch uit of geen AI-abonnement): de bewuste
      // keuze 'ai' wint niet meer — anders eindigt de lezer bij een AI-Krant
      // die hem weigert (eindreview Y2, 29-09). Binnen de bèta valt hij terug
      // op de nieuwe standaard 'tijdlijn'.
      const geheelVariantAiZonderAiBinnenBeta = bepaalKrantBron({ krantAccount: false, variant: 'ai', inBeta: true, aiToegestaan: false })
      return {
        expected:
          'krantBuitenBeta=wacht; krantBinnenBeta=tijdlijn; geheelGeenVariantBuitenBeta=oud; geheelGeenVariantBinnenBeta=tijdlijn; geheelVariantAiBuitenBeta=oud; geheelVariantAiBinnenBeta=ai; geheelVariantAiZonderAiBinnenBeta=tijdlijn',
        actual:
          `krantBuitenBeta=${krantBuitenBeta}; krantBinnenBeta=${krantBinnenBeta}; ` +
          `geheelGeenVariantBuitenBeta=${geheelGeenVariantBuitenBeta}; geheelGeenVariantBinnenBeta=${geheelGeenVariantBinnenBeta}; ` +
          `geheelVariantAiBuitenBeta=${geheelVariantAiBuitenBeta}; geheelVariantAiBinnenBeta=${geheelVariantAiBinnenBeta}; ` +
          `geheelVariantAiZonderAiBinnenBeta=${geheelVariantAiZonderAiBinnenBeta}`,
      }
    },
  },
  {
    workflow: 'WF-WILL-34',
    scenarioId: 'UAT-WILL-34',
    label: 'Tijdlijn-rem van 10 minuten (echte VERNIEUW_INTERVAL_MS + gemirrorde tijdsvergelijking)',
    run: () => {
      criterion('WF-WILL-34')
      const vorige = Date.UTC(2026, 8, 29, 12, 0, 0)
      const binnenRem = tijdlijnTeSnelMirror(vorige + 5 * 60 * 1000, vorige)
      const naRem = !tijdlijnTeSnelMirror(vorige + 10 * 60 * 1000 + 1, vorige)
      return {
        expected: 'VERNIEUW_INTERVAL_MS=600000; teSnelBinnenRem=true; magVerversenNaRem=true',
        actual: `VERNIEUW_INTERVAL_MS=${VERNIEUW_INTERVAL_MS}; teSnelBinnenRem=${binnenRem}; magVerversenNaRem=${naRem}`,
      }
    },
  },
  {
    workflow: 'WF-WILL-35',
    scenarioId: 'UAT-WILL-35',
    label: 'Tijdlijn-paginagrootte + cursor-(de)codering (echte TIJDLIJN_PAGINA/codeerCursor/decodeerCursor/WEEK_KEY)',
    run: () => {
      criterion('WF-WILL-35')
      const cursor = { createdAt: '2026-09-29T06:30:00.000Z', positie: 2, id: '3f6b6b8a-8a3e-4e3e-9c3e-1a2b3c4d5e6f' }
      const gecodeerd = codeerCursor(cursor)
      const gedecodeerd = decodeerCursor(gecodeerd)
      const roundtrip =
        gedecodeerd !== null &&
        gedecodeerd.createdAt === cursor.createdAt &&
        gedecodeerd.positie === cursor.positie &&
        gedecodeerd.id === cursor.id
      const ongeldigeCursorGeeftNull = decodeerCursor('niet-base64url-!!!') === null
      const ongeldigeWeekGeeftNull = !WEEK_KEY.test('2026-40')
      return {
        expected: 'TIJDLIJN_PAGINA=20; cursorRoundtrip=true; ongeldigeCursorGeeftNull=true; ongeldigeWeekGeeftNull=true',
        actual: `TIJDLIJN_PAGINA=${TIJDLIJN_PAGINA}; cursorRoundtrip=${roundtrip}; ongeldigeCursorGeeftNull=${ongeldigeCursorGeeftNull}; ongeldigeWeekGeeftNull=${ongeldigeWeekGeeftNull}`,
      }
    },
  },
  {
    workflow: 'WF-WILL-36',
    scenarioId: 'UAT-WILL-36',
    label: 'Katerndrempel (echte KATERN_ONDER + de gemirrorde afleiding totaal<KATERN_ONDER)',
    run: () => {
      criterion('WF-WILL-36')
      const toonKatern = (totaal: number) => totaal < KATERN_ONDER // mirror van tijdlijn-lezen.ts r283
      return {
        expected: 'KATERN_ONDER=5; toonKatern4=true; toonKatern5=false',
        actual: `KATERN_ONDER=${KATERN_ONDER}; toonKatern4=${toonKatern(4)}; toonKatern5=${toonKatern(5)}`,
      }
    },
  },
  {
    workflow: 'WF-WILL-40',
    scenarioId: 'UAT-WILL-40',
    label: 'Oud nieuws telt niet als nieuw (echte voldoetAanLeescontract, NIEUWS_MAX_OUDERDOM_DAGEN, matcher v5; v6: alleen een echte datum)',
    run: () => {
      criterion('WF-WILL-40')
      const ctx: MatchContext = {
        now: KRANT_NU,
        gezienArtikelIds: new Set(),
        gedemptRubrieken: new Set(),
        impact: standaardImpactContext(AOW_RIJEN, KRANT_NU.getUTCFullYear()),
      }
      const artikel = (id: string): KandidaatArtikel => {
        const a = KRANT_ARTIKELEN.find((x) => x.id === id)
        if (!a) throw new Error(`fixture ${id} ontbreekt`)
        return a
      }
      const dagenTerug = (d: number) => new Date(KRANT_NU.getTime() - d * 24 * 60 * 60 * 1000).toISOString()
      const vers = artikel('a02-box1-schijf1') // binnen het ophaalvenster, geen deadline
      const metDeadline = artikel('a08-kinderopvangtoeslag') // deadline in de toekomst
      return {
        expected:
          'NIEUWS_MAX_OUDERDOM_DAGEN=45; MATCHER_VERSIE=7; gepubliceerd46=false; gepubliceerd44=true; zonderPublicatiedatum=true; oudZonderEchteDatum=true; oudMetDeadline=true',
        actual:
          `NIEUWS_MAX_OUDERDOM_DAGEN=${NIEUWS_MAX_OUDERDOM_DAGEN}; MATCHER_VERSIE=${MATCHER_VERSIE}; ` +
          `gepubliceerd46=${voldoetAanLeescontract({ ...vers, published_at: dagenTerug(46) }, ctx)}; ` +
          `gepubliceerd44=${voldoetAanLeescontract({ ...vers, published_at: dagenTerug(44) }, ctx)}; ` +
          `zonderPublicatiedatum=${voldoetAanLeescontract({ ...vers, published_at: null }, ctx)}; ` +
          `oudZonderEchteDatum=${voldoetAanLeescontract({ ...vers, published_at: dagenTerug(200), published_bron: 'eerste_gezien' }, ctx)}; ` +
          `oudMetDeadline=${voldoetAanLeescontract({ ...metDeadline, published_at: dagenTerug(200) }, ctx)}`,
      }
    },
  },
  {
    workflow: 'WF-WILL-41',
    scenarioId: 'UAT-WILL-41',
    label: 'De Krant met AI (echte verwerkAiUitvoer): toelichting onder de regel, hoogstens 3 toevoegingen in kandidaatvolgorde',
    run: () => {
      criterion('WF-WILL-41')
      const a = KRANT_ARTIKELEN[0]
      const item: EditieItem = {
        artikelId: a.id, titel: a.title, rubriek: a.category, bron: a.source_name, url: a.source_url, gepubliceerd: a.published_at, gezienOp: null,
        vorm: 'direct', score: 5, mechanisme: null, impact: null, sjabloonId: 'editie-leeg', variant: 0, slots: {},
        tekst: 'Voor jou scheelt dit tussen € 120 en € 240 per jaar.', deadline: null, watMist: [], waarom: [], samenvatting: a.duiding!.samenvatting,
      }
      const kandidaten = ['k1', 'k2', 'k3', 'k4'].map((id) => ({ ...(KRANT_ARTIKELEN[0] as AiKandidaat), id, title: `Kop ${id}` }))
      const invoer = bouwAiLaagInvoer([item], kandidaten, PROFIEL_TESSA, 2026, {}, () => 'besloten')
      const uit = verwerkAiUitvoer({
        ruw: {
          toelichtingen: [{ artikelId: a.id, tekst: 'In 2027 gaat de grens naar 60.000 euro.' }],
          toevoegingen: ['k4', 'k3', 'k2', 'k1'].map((id) => ({ artikelId: id, tekst: 'Dit raakt je situatie.' })),
        },
        items: [item],
        kandidaten,
        invoer,
        duidingVan: (id) => (id === a.id ? a.duiding : null),
      })
      const toegevoegd = uit.items.filter((i) => i.aiToegevoegd).map((i) => i.artikelId).join(',')
      return {
        expected: 'maxKandidaten=12; maxToevoegingen=3; toegevoegd=k1,k2,k3; matcherregelBlijft=true; aiLabelOpToelichting=true',
        actual:
          `maxKandidaten=${AI_LAAG_MAX_KANDIDATEN}; maxToevoegingen=${AI_LAAG_MAX_TOEVOEGINGEN}; toegevoegd=${toegevoegd}; ` +
          `matcherregelBlijft=${uit.items[0].tekst === item.tekst}; aiLabelOpToelichting=${typeof uit.items[0].aiTekst === 'string'}`,
      }
    },
  },
  {
    workflow: 'WF-WILL-42',
    scenarioId: 'UAT-WILL-42',
    label: 'Terugval per tekst (echte toetsAiTekst/verwerkAiUitvoer): verzonnen getal, aansporing, metafoor; onbruikbaar antwoord = hele laag',
    run: () => {
      criterion('WF-WILL-42')
      const grond = 'Het heffingsvrij vermogen gaat naar 60.000 euro. Voor jou € 120 tot € 240 per jaar.'
      const reden = (t: string) => {
        const r = toetsAiTekst(t, grond)
        return r.ok ? 'ok' : r.reden
      }
      const a = KRANT_ARTIKELEN[0]
      const item: EditieItem = {
        artikelId: a.id, titel: a.title, rubriek: a.category, bron: a.source_name, url: a.source_url, gepubliceerd: a.published_at, gezienOp: null,
        vorm: 'direct', score: 5, mechanisme: null, impact: null, sjabloonId: 'editie-leeg', variant: 0, slots: {},
        tekst: 'De regel voor jou.', deadline: null, watMist: [], waarom: [], samenvatting: null,
      }
      const invoer = bouwAiLaagInvoer([item], [], PROFIEL_TESSA, 2026, {}, () => 'besloten')
      const verzonnen = verwerkAiUitvoer({ ruw: { toelichtingen: [{ artikelId: a.id, tekst: 'Dit scheelt je € 999.' }] }, items: [item], kandidaten: [], invoer, duidingVan: () => a.duiding })
      const onbruikbaar = verwerkAiUitvoer({ ruw: 'geen object', items: [item], kandidaten: [], invoer, duidingVan: () => a.duiding })
      return {
        expected: 'verzonnenGetal=getal; aansporing=wft; metafoor=metafoor; gegrond=ok; regelBlijftBijVerzonnenGetal=true; onbruikbaarAntwoord=terugvalLaag',
        actual:
          `verzonnenGetal=${reden('Dat scheelt € 180.')}; aansporing=${reden('Vraag de toeslag aan.')}; metafoor=${reden('Zo kun je jezelf vrijkopen.')}; ` +
          `gegrond=${reden('De grens gaat naar 60.000 euro.')}; ` +
          `regelBlijftBijVerzonnenGetal=${verzonnen.items[0].tekst === item.tekst && verzonnen.items[0].aiTekst === undefined}; ` +
          `onbruikbaarAntwoord=${onbruikbaar.tellers.terugvalLaag === 1 ? 'terugvalLaag' : 'anders'}`,
      }
    },
  },
  {
    workflow: 'WF-WILL-43',
    scenarioId: 'UAT-WILL-43',
    label: 'Quotum van de Krant met AI (echte AI_LAAG_MAX_PER_WEEK + quotumOp)',
    run: () => {
      criterion('WF-WILL-43')
      return {
        expected: 'AI_LAAG_MAX_PER_WEEK=5; quotumBij4=false; quotumBij5=true',
        actual: `AI_LAAG_MAX_PER_WEEK=${AI_LAAG_MAX_PER_WEEK}; quotumBij4=${quotumOp(4)}; quotumBij5=${quotumOp(5)}`,
      }
    },
  },
  {
    workflow: 'WF-WILL-44',
    scenarioId: 'UAT-WILL-44',
    label: 'De redactieregels van de tijdlijn (echte matchEditie v6 + lib/krant/redactie.ts, ADR 0191)',
    run: () => {
      criterion('WF-WILL-44')
      const ctx: MatchContext = {
        now: KRANT_NU,
        gezienArtikelIds: new Set(),
        gedemptRubrieken: new Set(),
        impact: standaardImpactContext(AOW_RIJEN, KRANT_NU.getUTCFullYear()),
        modus: 'tijdlijn',
      }
      const RECENT = '2026-09-19T05:10:00Z'
      const basis = KRANT_ARTIKELEN.find((x) => x.id === 'a15-oud')
      if (!basis?.duiding) throw new Error('fixture a15-oud ontbreekt')
      const art = (id: string, d: Partial<NonNullable<KandidaatArtikel['duiding']>>, o: Partial<KandidaatArtikel> = {}): KandidaatArtikel => ({
        ...basis,
        id,
        category: 'wonen',
        fetched_at: RECENT,
        published_at: RECENT,
        published_bron: 'feed',
        bron_soort: 'rss',
        bron_wijziging: null,
        bron_fragment: null,
        ...o,
        duiding: { ...basis.duiding!, ...d },
      })
      const huur = [{ thema: 'huur' as const, citaat: 'De maximale huurverhoging wordt 4 procent' }]
      const sparen = [{ thema: 'sparen-rente' as const, citaat: 'een spaarbuffer voor onverwachte uitgaven' }]
      const huurder: NieuwsprofielV1 = { ...LEEG_PROFIEL, wonen: 'huur-sociaal', rubrieken: ['wonen'] }
      const koper: NieuwsprofielV1 = { ...LEEG_PROFIEL, wonen: 'koop-met-hypotheek' }

      const basisSectie = art('w44-basis', { themas: huur }, { bron_soort: 'web_pagina', bron_wijziging: 'basis' })
      const gewijzigd = art('w44-gewijzigd', { themas: huur }, { bron_soort: 'web_pagina', bron_wijziging: 'gewijzigd' })
      const t1 = matchEditie(huurder, [basisSectie], ctx)
      const t1b = matchEditie(huurder, [gewijzigd], ctx)
      const naslag = art('w44-naslag', { themas: huur }, { bron_soort: 'web_lijst', bron_pagina_url: 'https://www.belastingdienst.nl/wps/wcm/connect/nl/box-3/box-3', published_bron: 'eerste_gezien' })
      const caribisch = art('w44-cn', { themas: [{ thema: 'eigen-woning', citaat: 'hypotheekadviseurs bij het geven van passend advies' }] }, { title: 'Caribisch Nederland: leidraad voor hypotheekadvisering' })
      const t2a = matchEditie(koper, [caribisch], ctx)
      const terloops = art('w44-terloops', { themas: huur }, { title: 'Huurtoeslag verandert', bron_fragment: 'De huurtoeslag verandert per 1 januari. Ook op Bonaire gelden nieuwe bedragen.' })
      const blog = art('w44-buffer', { themas: sparen }, { title: 'Blog: betaal jezelf eerst: spaarbuffer' })
      const weinig = matchEditie({ ...LEEG_PROFIEL, spaargeld: 'tot-5k' }, [blog], ctx)
      const veel = matchEditie({ ...LEEG_PROFIEL, spaargeld: '50k-100k' }, [blog], ctx)
      const cijfer = matchEditie(huurder, [art('w44-cijfer', { soort: 'cijfer', themas: huur, mechanisme: null })], ctx)
      const gezien = matchEditie(huurder, [art('w44-gezien', { themas: huur }, { published_bron: 'eerste_gezien' })], ctx)
      return {
        expected:
          'MATCHER_VERSIE=7; basisInTijdlijn=0; gewijzigdInTijdlijn=1; basisInAchtergrond=1; naslagInTijdlijn=0; caribischOveral=0; terloopsInTijdlijn=1; bufferWeinigSpaargeld=raakt; bufferVeelSpaargeld=0; cijferZonderRekenregel=0; gezienOp=true; gepubliceerd=null',
        actual:
          `MATCHER_VERSIE=${MATCHER_VERSIE}; basisInTijdlijn=${t1.items.length}; gewijzigdInTijdlijn=${t1b.items.length}; ` +
          `basisInAchtergrond=${t1.algemeen.achtergrond?.items.length ?? 0}; ` +
          `naslagInTijdlijn=${matchEditie(huurder, [naslag], ctx).items.length}; ` +
          `caribischOveral=${t2a.items.length + (t2a.algemeen.achtergrond?.items.length ?? 0) + t2a.algemeen.items.length}; ` +
          `terloopsInTijdlijn=${matchEditie(huurder, [terloops], ctx).items.length}; ` +
          `bufferWeinigSpaargeld=${weinig.items[0]?.vorm ?? 'geen'}; bufferVeelSpaargeld=${veel.items.length}; ` +
          `cijferZonderRekenregel=${cijfer.items.length + (cijfer.algemeen.achtergrond?.items.length ?? 0)}; ` +
          `gezienOp=${gezien.items[0]?.gezienOp === RECENT}; gepubliceerd=${gezien.items[0]?.gepubliceerd ?? 'null'}`,
      }
    },
  },
  {
    workflow: 'WF-WILL-45',
    scenarioId: 'UAT-WILL-45',
    label: '"Gaat over" = hoofdthema en twee per uitgever in Achtergrond + katern (echte matchEditie v7)',
    run: () => {
      criterion('WF-WILL-45')
      const ctx: MatchContext = {
        now: KRANT_NU,
        gezienArtikelIds: new Set(),
        gedemptRubrieken: new Set(),
        impact: standaardImpactContext(AOW_RIJEN, KRANT_NU.getUTCFullYear()),
        modus: 'tijdlijn',
      }
      const RECENT = '2026-09-19T05:10:00Z'
      const basis = KRANT_ARTIKELEN.find((x) => x.id === 'a15-oud')
      if (!basis?.duiding) throw new Error('fixture a15-oud ontbreekt')
      const art = (id: string, d: Partial<NonNullable<KandidaatArtikel['duiding']>>, o: Partial<KandidaatArtikel> = {}): KandidaatArtikel => ({
        ...basis,
        id,
        category: 'fiscaal',
        fetched_at: RECENT,
        published_at: RECENT,
        published_bron: 'feed',
        bron_soort: 'rss',
        bron_wijziging: null,
        bron_fragment: null,
        ...o,
        duiding: { ...basis.duiding!, ...d },
      })
      const ib = { thema: 'inkomstenbelasting' as const, citaat: 'In box 1 kunnen aftrekposten worden opgevoerd' }
      const ew = { thema: 'eigen-woning' as const, citaat: 'aftrekbare kosten van de eigen woning' }
      const koper: NieuwsprofielV1 = { ...LEEG_PROFIEL, wonen: 'koop-met-hypotheek' }
      const bijthema = matchEditie(koper, [art('w45-ib', { soort: 'achtergrond', themas: [ib, ew] }, { title: 'Aftrekposten box 1' })], ctx).items[0]
      const hoofd = matchEditie(koper, [art('w45-ew', { soort: 'achtergrond', themas: [ew, ib] }, { title: 'Aftrekposten box 1' })], ctx).items[0]

      const van = (id: string, bron: string, uur: number) =>
        art(id, { soort: 'achtergrond', themas: [] }, { source_name: bron, published_at: `2026-09-19T${String(uur).padStart(2, '0')}:00:00Z` })
      const blokken = matchEditie(
        LEEG_PROFIEL,
        [
          ...[1, 2, 3, 4, 5, 6].map((n) => van(`w45-tk-${n}`, n % 2 === 1 ? 'Tweede Kamer — Kamerbrieven SZW' : 'Tweede Kamer — Kamerbrieven Financiën', 20 - n)),
          van('w45-cbs-1', 'CBS — Prijzen (CPI / inflatie)', 8),
          van('w45-cbs-2', 'CBS — Inkomen en bestedingen', 7),
          van('w45-rijk', 'Rijksoverheid — Ministerie van Financiën', 6),
        ],
        ctx,
      ).algemeen
      const achtergrond = blokken.achtergrond?.items ?? []
      const tweedeKamer = [...achtergrond, ...blokken.items].filter((i) => uitgeverVan(i.bron) === 'Tweede Kamer').length
      return {
        expected:
          'MATCHER_VERSIE=7; BRON_MAX_PER_BLOK=2; onderwerpHoofdthema=true; redenBijthemaZichtbaar=false; redenBijthemaInWaarom=true; redenHoofdthemaZichtbaar=true; tweedeKamerSamen=2; andereUitgeverInAchtergrond=true',
        actual:
          `MATCHER_VERSIE=${MATCHER_VERSIE}; BRON_MAX_PER_BLOK=${BRON_MAX_PER_BLOK}; ` +
          `onderwerpHoofdthema=${bijthema?.tekst.includes('gaat over de inkomstenbelasting (box 1).') ?? false}; ` +
          `redenBijthemaZichtbaar=${bijthema?.tekst.includes('koopwoning') ?? false}; ` +
          `redenBijthemaInWaarom=${bijthema?.waarom.includes('reden:reden-koopwoning') ?? false}; ` +
          `redenHoofdthemaZichtbaar=${hoofd?.tekst.startsWith('Volgens je profiel heb je een koopwoning.') ?? false}; ` +
          `tweedeKamerSamen=${tweedeKamer}; andereUitgeverInAchtergrond=${achtergrond.some((i) => uitgeverVan(i.bron) !== 'Tweede Kamer')}`,
      }
    },
  },
]
