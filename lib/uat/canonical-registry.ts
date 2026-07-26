/**
 * Canoniek register — de single source voor de UAT-zone CANON ("Canonieke
 * getallen"). Elk kerngetal in TriFinity heeft precies ÉÉN canonieke bron en moet
 * op elk oppervlak identiek zijn ("consume, don't recompute" — CLAUDE.md). Dit
 * register maakt die belofte EXPLICIET, UITPUTTEND en PER GETAL toetsbaar.
 *
 * Verhouding tot de KRUIS-zone (geen dubbeling — bewust complementair):
 *   - KRUIS bewijst de belofte PER GEBRUIKERS-WORKFLOW ("muteer X → alles beweegt
 *     mee"): 26 reisscenario's + doorwerking.
 *   - CANON bewijst dezelfde belofte PER KERNGETAL: een register (getal →
 *     bron-functie → volledige consumentenlijst → verboden-herberekening → exacte
 *     fixture) dat het single-source-register zichtbaar en per getal toetsbaar maakt.
 * Elke entry mapt naar zijn `kruisWorkflow` (of is expliciet `null` = nieuw in CANON),
 * zodat de twee zones niet stil kunnen divergeren (bewaakt door de meta-test).
 *
 * BRON van de rijen: de SSoT-tabel (`docs/uat/uat-plan.md` §2.8), de consistentie-
 * audit (`docs/eenduidige-gegevens-audit.md`) en de Berekeningen-catalogus
 * (`lib/architecture/calculations.ts`). Dit is een PURE data-module — geen React,
 * geen data-fetching, geen `server-only`-import in de graaf.
 *
 * `toetsbaar`:
 *   - 'exact'       — een PURE canonieke functie levert per constructie één getal
 *                     dat elk oppervlak hoort te consumeren; heeft een engine-check
 *                     in `acceptance/canon-checks.ts` op een vaste fixture.
 *   - 'consistency' — loader-/kernel-zwaar of categorisch; overal identiek, maar
 *                     geen met-de-hand-narekenbaar vast cijfer (geen engine-check).
 *   - 'oracle'      — exact cijfer uit een zware rekenmotor (horizon-kernel);
 *                     verifieerbaar via de oracle-UI, niet in een pure vitest.
 *   - 'guardrail'   — een fundament-invariant (bv. maandgrenzen) die als lint-/
 *                     conventie-vangrail geldt, geen headline-getal.
 */

import type { UatZone } from './catalog'

/** Een bewust grondslag-verschil dat GEEN inconsistentie is (niet als bug melden). */
export interface CanonicalExpectedDifference {
  /** Korte naam van het verschil. */
  label: string
  /** Waarom het verschil bewust is (welke grondslag/keuze het verklaart). */
  reason: string
}

export interface CanonicalEntry {
  /** Stabiele slug, bv. 'netto-vermogen'. Uniek. */
  id: string
  /** Volgnummer 1..N (spiegelt de SSoT-tabel-rij; fundament = 14). */
  nr: number
  /** Menselijk label van het kerngetal. */
  label: string
  /** De canonieke bron-functie (naam), bv. 'savingsRateFromAggregates'. */
  sourceFn: string
  /** Bronbestand(en) die de functie/constante bevatten (repo-relatief). */
  sourceFiles: string[]
  /** Belangrijkste consument-oppervlakken (≥1) die dit getal horen te consumeren. */
  consumers: string[]
  /** Hoe het getal toetsbaar is (zie module-JSDoc). */
  toetsbaar: 'exact' | 'consistency' | 'oracle' | 'guardrail'
  /** Bij 'exact': korte notatie van de fixture-waarde die de engine-check bewijst. */
  exactFixture?: string
  /** Bewuste grondslag-verschillen (netto ≠ FIRE-eligible; briefing-freeze; 3× Box 3). */
  expectedDifferences?: CanonicalExpectedDifference[]
  /** Het bijbehorende KRUIS-workflow-id, of null wanneer CANON dit getal nieuw dekt. */
  kruisWorkflow: string | null
  /** Het CANON-workflow-id (WF-CANON-NN) dat dit register-getal toetst. */
  canonWorkflow: string
}

/** De domeinen die de canonieke getallen raken (voor de CANON-flow cross-knopen). */
export const CANON_CROSS_ZONES: UatZone[] = ['OVZ', 'BEZIT', 'SCHULD', 'CASH', 'BELAST', 'TOEK', 'RAPP', 'WILL']

export const CANONICAL_REGISTRY: CanonicalEntry[] = [
  {
    id: 'netto-vermogen',
    nr: 1,
    label: 'Netto vermogen (inclusie-gewogen)',
    sourceFn: 'dashboard-/horizon-data-loader + weegfunctie',
    sourceFiles: ['lib/dashboard-data-loader.ts', 'lib/dashboard-wealth-weighting.ts'],
    consumers: [
      'hero /overzicht',
      'sidebar',
      '/overzicht/bezittingen−schulden',
      'netto-vermogen-widget',
      '/rapportages/balans + /rapportages/vermogen',
      'deel-kaart',
      'maandsnapshots',
      'Fin (AI-context)',
    ],
    toetsbaar: 'consistency',
    expectedDifferences: [
      {
        label: 'netto vermogen ≠ FIRE-eligible vermogen',
        reason: 'netto vermogen bevat huis/niet-liquide assets; FIRE-eligible filtert die via de housing-strategie (zie nr 4). Nooit mengen op één Y-as.',
      },
    ],
    kruisWorkflow: 'WF-KRUIS-01',
    canonWorkflow: 'WF-CANON-01',
  },
  {
    id: 'spaarquote-6m',
    nr: 2,
    label: 'Spaarquote (6 maanden)',
    sourceFn: 'savingsRateFromAggregates',
    sourceFiles: ['lib/savings-source.ts'],
    consumers: [
      'cashflow-tegel',
      'cashflow-instellingenblok + kassabon',
      'forecast',
      'gezondheidspijler',
      'FIRE-spaarbron',
      'maand-check-in',
      'deel-kaart',
      'maandsnapshots',
      'Fin (AI-context)',
    ],
    toetsbaar: 'exact',
    exactFixture: 'savingsRateFromAggregates(36000, 27000, 1800) = 30; (0, …) = 0 (income>0-guard)',
    kruisWorkflow: 'WF-KRUIS-06',
    canonWorkflow: 'WF-CANON-02',
  },
  {
    id: 'vrijheids-pct',
    nr: 3,
    label: 'Vrijheids-% (voortgang naar vrijheid)',
    sourceFn: 'computeFreedomProgress',
    sourceFiles: ['lib/core-metrics.ts'],
    consumers: [
      'hero /overzicht',
      'vrijheidsvoortgang- + mijlpalen-widgets',
      'Jouw Pad',
      'deel-kaart',
      'snapshot-trend',
      'gezondheidspijler',
      '/api/report',
    ],
    toetsbaar: 'exact',
    exactFixture: '{300000,500000}=60; {600000,500000}=100 (cap); {-5000,500000}=0; {…,null}=0',
    kruisWorkflow: 'WF-KRUIS-08',
    canonWorkflow: 'WF-CANON-03',
  },
  {
    id: 'fire-eligible-grondslag',
    nr: 4,
    label: 'FIRE-eligible grondslag',
    sourceFn: 'getFireEligibleNetWorth',
    sourceFiles: ['lib/housing-strategy.ts'],
    consumers: ['teller van vrijheids-% (nr 3)', 'FIRE-doel (nr 8)'],
    toetsbaar: 'exact',
    exactFixture: 'include_full=800000 (Δ0); exclude_from_fire=550000 (Δ=overwaarde 250000)',
    expectedDifferences: [
      {
        label: 'Δ = overwaarde eigen woning',
        reason: 'Bij "uitsluiten" is FIRE-eligible = netto vermogen − overwaarde. Dat verschil is bewust, geen inconsistentie.',
      },
    ],
    kruisWorkflow: 'WF-KRUIS-09',
    canonWorkflow: 'WF-CANON-04',
  },
  {
    id: 'effectieve-swr',
    nr: 5,
    label: 'Effectieve SWR (veilig onttrekkingspercentage)',
    sourceFn: 'computeEffectiveSwr',
    sourceFiles: ['lib/fire-params.ts'],
    consumers: ['SWR-widget', 'pensioen/AOW-widget', 'fase-analyse', 'FIRE-doel (uitgaven ÷ SWR)'],
    toetsbaar: 'exact',
    exactFixture: 'computeEffectiveSwr(0.07,0.02)=0.02840 (BOX3_DRAG 0,0216); (0.01,0.05)=0.00100 (vloer)',
    kruisWorkflow: 'WF-KRUIS-14',
    canonWorkflow: 'WF-CANON-05',
  },
  {
    id: 'dagtarief-euro-naar-tijd',
    nr: 6,
    label: 'Dagtarief €→vrijheidstijd',
    sourceFn: 'dailyExpenseRate + calculateFreedomTime',
    sourceFiles: ['lib/format.ts', 'lib/expense-rate.ts'],
    consumers: ['hero-vrijheidstijd', 'FreedomTimeBadge bij bedragen', 'belasting-hub', 'rapporten', 'briefing'],
    toetsbaar: 'exact',
    exactFixture: 'dailyExpenseRate(3000)=98,6301; calculateFreedomTime(36000, tarief).totalDays=365',
    kruisWorkflow: 'WF-KRUIS-20',
    canonWorkflow: 'WF-CANON-06',
  },
  {
    id: 'gezondheidsgetal',
    nr: 7,
    label: 'Gezondheidsgetal (financiële gezondheidsscore)',
    sourceFn: 'buildHealthScoreInput + computeHealthScoreFromInputs',
    sourceFiles: ['lib/health-score-input.ts', 'lib/financial-health.ts'],
    consumers: ['/overzicht', '/toekomst', 'gezondheid-widget', 'legacy /core', 'maandsnapshots'],
    toetsbaar: 'consistency',
    kruisWorkflow: 'WF-KRUIS-11',
    canonWorkflow: 'WF-CANON-07',
  },
  {
    id: 'fire-datum-leeftijd',
    nr: 8,
    label: 'FIRE-datum/-leeftijd + benodigd vermogen',
    sourceFn: 'horizon-kernel via buildHorizonInput',
    sourceFiles: ['lib/horizon-kernel/convergentie-router.ts', 'lib/horizon/build-input.ts'],
    consumers: ['/toekomst-tijdas', '/overzicht-countdown', 'FIRE-widget', 'maandsnapshots', 'deel-kaart', 'persoonlijk plan'],
    toetsbaar: 'oracle',
    kruisWorkflow: 'WF-KRUIS-13',
    canonWorkflow: 'WF-CANON-08',
  },
  {
    id: 'box3-heffing',
    nr: 9,
    label: 'Box 3-forfait / heffing',
    sourceFn: 'calculateBox3',
    sourceFiles: ['lib/box3-data.ts'],
    consumers: ['box3-pagina', 'belasting-hub-KPI', 'box3-widget', 'schulden-belastingsectie', 'FIRE-intern (Box 3-drag)'],
    toetsbaar: 'exact',
    exactFixture: 'spaargeld 100k + beleggingen 100k, single, 2026 → grondslag 140643; heffing €1843',
    expectedDifferences: [
      {
        label: 'drie bewuste weergaven',
        reason: 'volledige berekening (calculateBox3, 2026) vs. vereenvoudigde schatting (buildTaxData) vs. widget op jaar 2025 — verschillen zijn documented, geen inconsistentie.',
      },
    ],
    kruisWorkflow: 'WF-KRUIS-12',
    canonWorkflow: 'WF-CANON-09',
  },
  {
    id: 'jaarruimte-besparing',
    nr: 10,
    label: 'Jaarruimte-besparing (lijfrente-belastingvoordeel)',
    sourceFn: 'jaarruimteBesparing',
    sourceFiles: ['lib/jaarruimte.ts', 'lib/box1-tax.ts'],
    consumers: [
      'box1-jaarruimtekaart',
      'belasting-hub C4',
      'aandachtspunten-loader',
      'AI-tax-context',
      'belast-oracle',
      'fiscale-optimizer (ADR 0041)',
    ],
    toetsbaar: 'exact',
    exactFixture: 'jaarruimteBesparing(gross,inleg) == computeBox1Tax(gross).tax − computeBox1Tax(gross−inleg).tax (marginaal-identiek); nulInleg=0; nulInkomen=0',
    kruisWorkflow: null,
    canonWorkflow: 'WF-CANON-10',
  },
  {
    id: 'noodfonds-maanden',
    nr: 11,
    label: 'Noodfonds (maanden gedekt)',
    sourceFn: 'resolveEmergencyFund + computeLiquidPot',
    sourceFiles: ['lib/emergency-fund.ts'],
    consumers: ['noodfonds-widget', 'gezondheid-buffer-pijler', 'maandsnapshots', '/check'],
    toetsbaar: 'consistency',
    kruisWorkflow: null,
    canonWorkflow: 'WF-CANON-11',
  },
  {
    id: 'hefboom-status',
    nr: 12,
    label: 'Hefboom-status (stoplicht)',
    sourceFn: 'computeLeverScores / loadLeverScores / pillarStatus',
    sourceFiles: ['lib/leverage-status.ts', 'lib/lever-scores-loader.ts'],
    consumers: ['sidebar-dots', 'hefboomkaarten', 'status-banner', 'box1/2/3-kaarten'],
    toetsbaar: 'consistency',
    kruisWorkflow: 'WF-KRUIS-18',
    canonWorkflow: 'WF-CANON-12',
  },
  {
    id: 'fiscale-constanten-jaar',
    nr: 13,
    label: 'Fiscale constanten per jaar',
    sourceFn: 'BOX1_PARAMS / BOX3_PARAMS / BOX2_PARAMS / VPB_PARAMS',
    sourceFiles: ['lib/constants.ts', 'lib/box1-tax.ts', 'lib/box3-data.ts'],
    consumers: ['alle belastingmotoren', '/beheer/fiscale-kerngetallen (matrix per jaar/bron/verificatiedatum)'],
    toetsbaar: 'consistency',
    kruisWorkflow: 'WF-KRUIS-12',
    canonWorkflow: 'WF-CANON-13',
  },
  {
    id: 'maandgrenzen',
    nr: 14,
    label: 'Fundament: maandgrenzen (query-venster)',
    sourceFn: 'localMonthBounds',
    sourceFiles: ['lib/month-range.ts'],
    consumers: ['elk maand-query-venster onder nr 1–13 (S9-lint-vangrail: nooit toISOString() voor maandgrenzen)'],
    toetsbaar: 'guardrail',
    kruisWorkflow: null,
    canonWorkflow: 'WF-CANON-14',
  },
]

/** Alle CANON-workflow-nummers die het register/de acceptance HOREN te dekken:
 *  01..14 (één per register-entry) + 15 = het afsluitende "register compleet &
 *  uitputtend"-meta-scenario (heeft géén register-entry). Gebruikt door de meta-tests. */
export const CANON_EXPECTED_WORKFLOW_NUMBERS: number[] = Array.from({ length: 15 }, (_, i) => i + 1)

/** De workflow-id's van de register-entries die EXACT-toetsbaar zijn (engine-check-dekking). */
export const CANON_EXACT_WORKFLOWS: string[] = CANONICAL_REGISTRY.filter((e) => e.toetsbaar === 'exact').map(
  (e) => e.canonWorkflow,
)
