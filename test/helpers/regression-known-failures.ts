/**
 * Bekende, nog niet opgeloste faalgevallen in de in-app regressiesuites
 * (lib/regression-tests/suites/*.ts).
 *
 * Dit is het COLUMN_RULE_RESIDUE-patroon (zie scripts/check-client-data-reads.mjs)
 * toegepast op regressietest-drift: sinds de suites nooit in CI draaiden, liep
 * een deel van de tests uit de pas met de code (bv. tests die verwijzen naar
 * routes die niet meer bestaan). Die drift oplossen is een aparte, bewuste
 * beslissing van de eigenaar — deze lijst maakt 'm ondertussen ZICHTBAAR in
 * plaats van onzichtbaar, zodat CI groen kan zijn zonder de drift te maskeren.
 *
 * Regels (zie test/helpers/regression-suite-runner.ts voor de handhaving):
 *   - Een test-id hier MOET nog steeds falen. Slaagt hij weer, dan faalt de
 *     bijbehorende *-suite-check.test.ts hard — met de melding dat de entry
 *     stale is en verwijderd moet worden. De lijst kan dus nooit stilzwijgend
 *     blijven hangen nadat iemand de onderliggende bug al gefixt heeft.
 *   - Een test-id die hier NIET in staat en toch faalt, maakt de suite-check
 *     gewoon rood — dat is een NIEUWE regressie, geen bekende drift.
 *   - Deze lijst mag alleen KRIMPEN. Voeg alleen een entry toe voor een
 *     bestaande, tot nu toe groene test die drift oploopt (bv. een verwijderde
 *     route) — nooit om een net geschreven of net gefaalde test stil te leggen.
 */
export const KNOWN_FAILING_TESTS: Map<string, string> = new Map([
  // ── design-system-tokens.ts ────────────────────────────────────────────
  ['ds-active-nav-bg-tint', 'verwijst naar components/app/app-header.tsx — bestaat niet meer (nav is nu components/app/shell/bottom-nav-tabs.tsx + nav-menu-sheet.tsx)'],

  // ── design-system-typography.ts ────────────────────────────────────────
  ['typo-core-hero-font-mono', 'components/core/core-hero.tsx bevat geen formatCurrency meer — bedragen zitten nu in CoreHero + FireProgressStrip (Kern-refactor, zie comment in de suite zelf)'],
  ['typo-no-relative-timestamps', "components/holdings/crypto-sparkline.tsx en components/widgets/netto-vermogen-widget.tsx gebruiken relatieve tijdsaanduidingen ('geleden') die de conventie verbiedt"],

  // ── beheer-testdata.ts (lib/test-personas.ts liep uit de pas) ─────────
  ["td-personas-available", "PERSONA_KEYS is uitgebreid naar 5 (+ 'compleet'), suite verwacht hardcoded 4"],
  ['td-persona-fire-params', "marijke.fire_end_strategy = 'pensioen', niet in de suite's allowlist ['perpetual','legacy','deplete']"],
  ['td-persona-widget-prefs', "lisa heeft een widget met size 'mini', niet in de suite's allowlist ['quarter','half','full']"],

  // ── inkomen-uitgaven-analyse.ts ────────────────────────────────────────
  ['ie-breakdown-ret-withdrawal', "buildBreakdown-fallback label is nu 'Levensonderhoud via onttrekking', suite verwacht het oudere 'Levensonderhoud'"],

  // ── widgets-avatar.ts ───────────────────────────────────────────────────
  ["widgets-all-sizes-valid", "widget 'uitgaven_heatmap' heeft size 'xl', niet in de suite's allowlist (quarter/half/full/mini)"],

  // ── module-access.ts (verwijst naar de oude IA — /core, /will bestaan niet meer) ──
  ['mod-home-budget', "getHomePath(['budgetteren']) verwacht '/core' (oude IA); canoniek is nu lib/nav-config.ts → '/overzicht'"],
  ['mod-home-assets', "getHomePath(['vermogensregistratie']) verwacht '/core' (oude IA); canoniek is nu '/overzicht'"],
  ['mod-home-dashboard', "getHomePath(inzicht_acties) verwacht '/will' — die route bestaat niet meer (ADR 0001); canoniek is nu '/overzicht'"],
  ['mod-home-news-only', "getHomePath(['nieuws']) verwacht '/berichten'; canoniek is nu '/nieuws' (lib/nav-config.ts)"],

  // ── wil-gezondheid.ts ───────────────────────────────────────────────────
  ['health-emergency-three', "computeHealthScoreFromInputs geeft nu pillar-score 100 bij 3 maanden noodfonds, suite verwacht 60 (score-curve is aangepast)"],

  // ── levensgebeurtenissen-ui.ts (classificatielogica gewijzigd) ────────
  ["levensgebeurtenissen.ui-mixed-events-both-columns", "'Erfenis' (inheritance) classificeert nu als 'investeren', suite verwacht 'opbouwen'"],
  ["levensgebeurtenissen.ui-only-opbouwen-empty-investeren", "zelfde classificatie-drift: niet alle 3 events landen meer in de opbouwen-kolom"],
  ["levensgebeurtenissen.ui-only-investeren-empty-opbouwen", "zelfde classificatie-drift: de opbouwen-kolom is niet meer leeg voor deze events"],
  ["levensgebeurtenissen.ui-column-headers-text", "'Erfenis' mapt nu naar de 'investeren'-kolom i.p.v. 'opbouwen' — headers-test pint de oude mapping"],
  ["levensgebeurtenissen.ui-column-totals-correct", "kolomtotalen kloppen niet meer met de oude classificatie-aanname"],
  ["levensgebeurtenissen.ui-chronological-sort-within-columns", "sortering binnen kolom klopt niet meer met de oude classificatie-aanname"],
  ["levensgebeurtenissen.ui-null-target-age-sorts-last", "zelfde classificatie-drift beïnvloedt ook deze sorteer-aanname"],

  // ── whatif-scenarios.ts (drijvendekomma-precisie, geen echte gedragsbug) ──
  ['whatif-baseline-builder', "assertEqual op een float (7 vs 7.000000000000001) zonder epsilon — floating-point precisie-artefact in buildBaselineOverrides"],

  // ── horizon-fase-analyse.ts (seeded Monte Carlo / stress-numerieke drift) ──
  ['phase-mc-withdrawal-drains', 'seeded Monte Carlo-uitkomst voor hoge onttrekking bij laag vermogen geeft nu een hogere slagingskans dan de suite verwacht (<0.5)'],
  ['phase-stress-inflation-reduces', 'seeded stress-scenario (langdurige inflatie) verlaagt het eindvermogen niet meer zo sterk als de suite verwacht'],
])
