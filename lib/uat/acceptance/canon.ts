/**
 * Acceptatiecriteria — domein CANON (canonieke getallen, UAT-CANON-01..15).
 *
 * CANON is de PER-KERNGETAL-tegenhanger van KRUIS (dat per gebruikers-workflow
 * toetst). Waar KRUIS bewijst dat een bron-mutatie overal doorwerkt, bewijst CANON
 * dat elk kerngetal precies ÉÉN canonieke bron heeft die elk oppervlak hoort te
 * consumeren ("consume, don't recompute" — CLAUDE.md). De bron-van-waarheid voor
 * WELKE getallen bestaan is het register `lib/uat/canonical-registry.ts`; dit
 * bestand legt per getal VAST wat "geslaagd" betekent (Given/When/Then).
 *
 * EXACT-toetsbaar (PURE canonieke functie → één getal, met engine-check in
 * `canon-checks.ts`, bewezen door `canon.engine.test.ts` + de in-app suite
 * `uat-canon.ts`):
 *   - WF-CANON-02 spaarquote  → `savingsRateFromAggregates` (lib/savings-source.ts)
 *   - WF-CANON-03 vrijheids-% → `computeFreedomProgress` (lib/core-metrics.ts)
 *   - WF-CANON-04 grondslag   → `getFireEligibleNetWorth` (lib/housing-strategy.ts)
 *   - WF-CANON-05 SWR         → `computeEffectiveSwr` (lib/fire-params.ts)
 *   - WF-CANON-06 dagtarief   → `dailyExpenseRate` + `calculateFreedomTime` (lib/format.ts)
 *   - WF-CANON-09 Box 3       → `calculateBox3` (lib/box3-data.ts)  ← CANON breidt de KRUIS-dekking uit
 *   - WF-CANON-10 jaarruimte  → `jaarruimteBesparing` (lib/jaarruimte.ts + lib/box1-tax.ts)  ← nieuw t.o.v. KRUIS
 *
 * BEWUSTE GRONDSLAG-VERSCHILLEN (géén inconsistentie — als 'verwacht verschil'
 * getoetst, niet als bug): netto vermogen (incl. huis/niet-liquide) ≠
 * FIRE-eligible/liquide vermogen (WF-CANON-04); Box 3 kent drie bewuste weergaven
 * (WF-CANON-09); de wekelijks bevroren vrijheidsbriefing ≠ live (documented in KRUIS-17).
 *
 * WF-CANON-15 is het afsluitende meta-scenario ("register compleet & uitputtend")
 * en heeft géén register-entry; het toetst dat elk kerngetal in het register één
 * bron heeft en nergens oppervlak-eigen wordt herberekend.
 */

import type { AcceptanceCriterion, AcceptanceSet } from './types'

const criteria: AcceptanceCriterion[] = [
  {
    workflow: 'WF-CANON-01',
    scenarioId: 'UAT-CANON-01',
    titel: 'Netto vermogen: één inclusie-gewogen bron, overal identiek',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Persona Tessa (compleet) geladen; het register-getal "netto vermogen" (nr 1) genoteerd.',
    when: 'De gebruiker leest netto vermogen op hero, sidebar, Σbezittingen−Σschulden, de netto-vermogen-widget en /rapportages/balans+vermogen.',
    then: 'Alle oppervlakken tonen op de euro hetzelfde bedrag uit één inclusie-gewogen som (dashboard-/horizon-data-loader + lib/dashboard-wealth-weighting.ts); geen oppervlak herberekent lokaal. Bewust verschil: netto vermogen ≠ FIRE-eligible (nr 4) — nooit op één as gemengd.',
    assertion: {
      kind: 'consistency',
      source: 'consistentie-eis: register-getal 1 (netto vermogen) uit lib/dashboard-data-loader.ts + lib/dashboard-wealth-weighting.ts; identiek op alle consumenten, geen lokale herberekening.',
    },
  },
  {
    workflow: 'WF-CANON-02',
    scenarioId: 'UAT-CANON-02',
    titel: 'Spaarquote (6m): savingsRateFromAggregates is de enige bron',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Vaste 6-maands-aggregaten (inkomen/uitgaven/aflossing) — géén persona-seed; de bron is een formule-identiteit.',
    when: 'De gebruiker leest de spaarquote op elk consument-oppervlak (cashflow-tegel, instellingenblok, spaarquote-widget, spaarquote-doel, gezondheidspijler, forecast-kaart, briefing, deel-kaart, benchmark, snapshots, Fin).',
    then: 'Overal exact hetzelfde percentage uit `savingsRateFromAggregates`. EXACT: (36.000 / 27.000 / 1.800) → 30,0%; inkomen ≤ 0 → 0 (guard). Geen consument doet een eigen spaarquote-som. SINDS ADR 0103 (11 aug 2026) is de formule nog steeds de enige bron, maar WÉLKE aggregaten erin gaan volgt de gekozen grondslag: `resolveSavingsSource` heeft een grondslag-tak die alleen bij inkomen én uitgaven op `transaction` de 6-maands-meting mét spaarbudget-/aflossingscorrectie doorgeeft; op elke andere grondslag geldt dezelfde functie met de effectieve maandbedragen en aflossing 0 — de correctie mag daar niet, want een budget-uitgavensom bevat spaarstortingen en aflossing per constructie niet. Dat is één formule met een expliciete grondslag, geen tweede bron; welke grondslag geldt staat op elke kaart. SINDS 31 AUG 2026 (eigenaar-besluit "één spaarquote, app-breed") is de GETOONDE waarde op élk oppervlak de uitkomst van die grondslag-tak (`effectiveSavingsRatePct`); een quote die als METING wordt getoond is nog uitsluitend zichtbaar waar de tekst zijn venster draagt, op DRIE gedocumenteerde plekken: (1) de transactie-kassabon in het instellingenblok, (2) de check-in-gespreksstarters, en (3) de geldstroom-gauge op /overzicht/transacties — een PERIODE-quote uit `summarizeFlow` (ADR 0020-carve-out, zonder aflossingscorrectie) die zijn `windowLabel` op de kaart draagt. Twee kopieën zijn daarbij verdwenen: `computeParameterSavingsRatePct` (het spaarquote-doel, dat de loader-formule spiegelde in plaats van consumeerde) en de inline huishoud-quote in de dashboardbundel. De keuze-precedentie zelf is gedekt door WF-CASH-60, de budgetsom door WF-BUDGET-26.',
    assertion: {
      kind: 'exact',
      expected: 'spaarquote=30; nulInkomen=0',
      source: 'lib/savings-source.ts#savingsRateFromAggregates(36000, 27000, 1800) = 30; (0, …) = 0. Register-getal 2, canonieke bron voor elke spaarquote-weergave.',
    },
  },
  {
    workflow: 'WF-CANON-03',
    scenarioId: 'UAT-CANON-03',
    titel: 'Vrijheids-%: computeFreedomProgress is de enige bron',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Vaste teller/noemer (FIRE-eligible vermogen, benodigde portfolio) — géén persona-seed; de bron is de formule + clamp.',
    when: 'De gebruiker vergelijkt het vrijheids-% op hero, vrijheidsvoortgang-/mijlpalen-widgets, Jouw Pad, deel-kaart en /api/report.',
    then: 'Overal hetzelfde percentage uit `computeFreedomProgress`. EXACT: 300.000/500.000 → 60; ≥ doel → 100 (cap); negatief vermogen → 0; geen doel (null) → 0. Teller = FIRE-eligible (nr 4), nooit stiekem het volle vermogen (ADR 0009).',
    assertion: {
      kind: 'exact',
      expected: 'pct60=60; cap100=100; negatief=0; geenDoel=0',
      source: 'lib/core-metrics.ts#computeFreedomProgress: {300000,500000}=60; {600000,500000}=100; {-5000,500000}=0; {…,null}=0. Register-getal 3.',
    },
  },
  {
    workflow: 'WF-CANON-04',
    scenarioId: 'UAT-CANON-04',
    titel: 'FIRE-eligible grondslag: getFireEligibleNetWorth (netto ≠ FIRE-eligible)',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Vaste HousingContext (eigenHuisValue €650.000, mortgageBalance €400.000 → overwaarde €250.000) op netto vermogen €800.000 — géén persona-seed.',
    when: 'De gebruiker vergelijkt netto vermogen met de vrijheids-teller bij housing-strategie "volledig meetellen" resp. "uitsluiten".',
    then: 'Bewust verschillende grootheden: "volledig meetellen" → FIRE-eligible = netto vermogen (Δ0); "uitsluiten" → FIRE-eligible = netto vermogen − overwaarde, verschil = EXACT de overwaarde (€250.000). Verwacht verschil (`getFireEligibleNetWorth`), géén inconsistentie.',
    assertion: {
      kind: 'exact',
      expected: 'nettoVermogen=800000; volledig=800000; deltaVolledig=0; uitsluiten=550000; deltaUitsluiten=250000; equity=250000',
      source: 'lib/housing-strategy.ts#getFireEligibleNetWorth(800000, {eigenHuisValue:650000,mortgageBalance:400000}, mode). Register-getal 4; bewust verschil netto ≠ FIRE-eligible.',
    },
  },
  {
    workflow: 'WF-CANON-05',
    scenarioId: 'UAT-CANON-05',
    titel: 'Effectieve SWR: computeEffectiveSwr is de enige bron',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Vaste rendement/inflatie-paren — géén persona-seed; de bron is de SWR-formule + vloer.',
    when: 'De gebruiker leest de effectieve SWR (badge "Afgeleid") en volgt hem door naar FIRE-doel en beide projecties.',
    then: 'Eén SWR-getal uit `computeEffectiveSwr` (= rendement − Box 3-drag − inflatie, vloer 0,1%) voedt SWR-widget, FIRE-doel en projecties. EXACT: (7% ; 2%) → 2,840% (BOX3_DRAG 0,0216); (1% ; 5%) → vloer 0,100%. DE INVOER heeft sinds 11 aug 2026 een expliciete precedentieketen die élk FIRE-tonend oppervlak hoort te gebruiken: (1) de gebruikerskeuze `profiles.expected_return`/`inflation_rate` wint altijd, (2) de jaargelaagde markt-default uit `fire_assumptions` (beheer op /beheer/fiscale-kerngetallen) vult alléén waar de gebruiker niets zette, (3) de TS-constanten `DEFAULT_RETURN`/`INFLATION` zijn de terugval. Die keten woont in `resolveFireParamsWithAssumptions`, dat de rij shadowt op een KOPIE (de profielrij blijft `null` waar de gebruiker niets koos — elders leest dat als "niet ingesteld"). Laat een oppervlak stap 2 weg, dan rekent het met een ándere onttrekkingsvoet zodra beheer een jaarlaag zet; de formule hieronder verandert daar niet door.',
    assertion: {
      kind: 'exact',
      expected: 'swrDefault=0.02840; swrVloer=0.00100',
      source: 'lib/fire-params.ts#computeEffectiveSwr(0.07,0.02) = 0.02840; (0.01,0.05) = 0.001 (vloer). Register-getal 5. De invoer-precedentie eromheen: lib/fire-params.ts#resolveFireParamsWithAssumptions + lib/fire-assumptions.ts#resolveFireAssumptions (gebruikerskeuze > jaarlaag `fire_assumptions` > lib/constants.ts) — geen tweede SWR-som, alleen een expliciete grondslag voor rendement en inflatie.',
    },
  },
  {
    workflow: 'WF-CANON-06',
    scenarioId: 'UAT-CANON-06',
    titel: 'Dagtarief €→tijd: dailyExpenseRate + calculateFreedomTime, één tarief',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Vaste maanduitgaven (€3.000) — géén persona-seed; het dagtarief is de identiteit.',
    when: 'De gebruiker vergelijkt elke euro→tijd-omrekening: hero-vrijheidstijd, FreedomTimeBadges, belasting-hub, rapporten, briefing.',
    then: 'Elke omrekening gebruikt hetzelfde dagtarief op jaarbasis: dagtarief = jaaruitgaven ÷ 365 (`dailyExpenseRate`, NIET maand ÷ 30). EXACT: maand €3.000 → €98,6301/dag; €36.000 → 365 vrijheidsdagen via `calculateFreedomTime` op ditzelfde tarief.',
    assertion: {
      kind: 'exact',
      expected: 'dagtarief=98.6301; vrijheidsdagenBij36000=365',
      source: 'lib/format.ts#dailyExpenseRate(3000) = 98,6301; calculateFreedomTime(36000, dagtarief).totalDays = 365. Register-getal 6.',
    },
  },
  {
    workflow: 'WF-CANON-07',
    scenarioId: 'UAT-CANON-07',
    titel: 'Gezondheidsgetal: buildHealthScoreInput is de enige bron',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Persona Tessa geladen; gezondheidsscore + pijler-uitsplitsing genoteerd op /overzicht.',
    when: 'De gebruiker vergelijkt de score + pijlers op /overzicht, /toekomst, de gezondheid-widget en legacy /core.',
    then: 'Alle oppervlakken tonen exact dezelfde totaalscore én per-pijler-waarde uit één server-berekening (`buildHealthScoreInput` + `computeHealthScoreFromInputs`, ADR 0008), via dezelfde loader geconsumeerd. Geen consument herberekent een pijler.',
    assertion: {
      kind: 'consistency',
      source: 'consistentie-eis: register-getal 7 (gezondheidsgetal) uit lib/health-score-input.ts + lib/financial-health.ts; identiek op alle consumenten.',
    },
  },
  {
    workflow: 'WF-CANON-08',
    scenarioId: 'UAT-CANON-08',
    titel: 'FIRE-datum/-leeftijd: horizon-kernel is de enige bron (oracle)',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Persona Tessa (geboortedatum + positief vermogen) geladen.',
    when: 'De gebruiker vergelijkt FIRE-leeftijd + benodigd vermogen op /toekomst-tijdas, /overzicht-countdown, FIRE-widget, snapshots en deel-kaart.',
    then: 'FIRE-leeftijd (fractioneel), doelbedrag en benodigde-portfolio-marker zijn per constructie identiek — één gedeelde input-assemblage (`buildHorizonInput`) in de kernel (`convergentie-router`), door elk oppervlak geconsumeerd. Het exacte cijfer is een kernel-uitkomst (oracle-UI), de gelijkheid is per constructie.',
    assertion: {
      kind: 'oracle',
      source: 'lib/horizon-kernel/convergentie-router.ts + lib/horizon/build-input.ts; register-getal 8. Exacte FIRE-leeftijd verifieerbaar via /beheer/horizon-kernel (oracle), gelijkheid per constructie.',
    },
  },
  {
    workflow: 'WF-CANON-09',
    scenarioId: 'UAT-CANON-09',
    titel: 'Box 3-heffing: calculateBox3 is de enige bron (3 bewuste weergaven)',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Vaste fixture: spaargeld €100.000 + beleggingen €100.000, alleenstaand, jaar 2026 — géén persona-seed.',
    when: 'De gebruiker vergelijkt de Box 3-heffing op box3-pagina, hub-KPI, box3-widget en de schulden-belastingsectie.',
    then: 'Elk bedrag komt uit `calculateBox3` op zijn gedocumenteerde grondslag; verschillen tussen de oppervlakken zijn BEWUST (volledig vs. schatting; jaar 2026 vs. 2025-widget) — géén inconsistentie. EXACT op de fixture: rendementsgrondslag €200.000, grondslag sparen €140.643, heffing €1.843 (afgerond). CANON breidt hiermee de KRUIS-dekking (consistency) uit met een exacte engine-check.',
    assertion: {
      kind: 'exact',
      expected: 'rendementsgrondslag=200000; grondslagSparen=140643; heffing=1843',
      source: 'lib/box3-data.ts#calculateBox3 (spaargeld 100000 + beleggingen 100000, single, 2026). Register-getal 9; drie bewuste weergaven.',
    },
  },
  {
    workflow: 'WF-CANON-10',
    scenarioId: 'UAT-CANON-10',
    titel: 'Jaarruimte-besparing: jaarruimteBesparing (marginaal-correct via Box 1)',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Vaste fixture: bruto jaarinkomen €60.000, inleg €10.000, jaar 2026 — géén persona-seed.',
    when: 'De gebruiker leest de jaarruimte-belastingbesparing op de box1-jaarruimtekaart, belasting-hub C4, de aandachtspunten-loader en de AI-tax-context.',
    then: 'Elk oppervlak consumeert `jaarruimteBesparing` (nieuw t.o.v. KRUIS). EXACT-identiteit: de besparing == `computeBox1Tax(gross).tax − computeBox1Tax(gross − inleg).tax` (marginaal-correct, vangt schijfovergangen én heffingskorting-afbouw; ADR 0040/0041) — géén vlakke `inleg × marginaal`. Guards: inleg 0 → 0; inkomen 0 → 0.',
    assertion: {
      kind: 'exact',
      expected: 'marginaalIdentiek=true; nulInleg=0; nulInkomen=0',
      source: 'lib/jaarruimte.ts#jaarruimteBesparing == marginaal-delta van lib/box1-tax.ts#computeBox1Tax; register-getal 10 (nieuw in CANON).',
    },
  },
  {
    workflow: 'WF-CANON-11',
    scenarioId: 'UAT-CANON-11',
    titel: 'Noodfonds (maanden gedekt): resolveEmergencyFund is de enige bron',
    kriticiteit: 'BELANGRIJK',
    persona: 'compleet',
    given: 'Persona Tessa geladen; noodfonds-dekking (maanden) genoteerd.',
    when: 'De gebruiker vergelijkt de noodfonds-dekking op de noodfonds-widget, de gezondheid-buffer-pijler, snapshots en /check.',
    then: 'Alle oppervlakken tonen dezelfde dekking uit één bron (`resolveEmergencyFund` + `computeLiquidPot`); geen consument herberekent de liquide pot. Register-getal 11 (nieuw t.o.v. KRUIS).',
    assertion: {
      kind: 'consistency',
      source: 'consistentie-eis: register-getal 11 (noodfonds) uit lib/emergency-fund.ts; identiek op alle consumenten (pariteitstest bestaat).',
    },
  },
  {
    workflow: 'WF-CANON-12',
    scenarioId: 'UAT-CANON-12',
    titel: 'Hefboom-status: leverage-status is de enige stoplicht-bron',
    kriticiteit: 'BELANGRIJK',
    persona: 'compleet',
    given: 'Persona Tessa geladen; sidebar open, hefboomkaarten zichtbaar.',
    when: 'De gebruiker vergelijkt per domein de stoplichtstatus op sidebar-dot, hefboomkaart, status-banner en box1/2/3-kaart.',
    then: 'Per domein exact dezelfde categorische status uit één scoringsbron (`loadLeverScores`/`computeLeverScores`/`pillarStatus`, `lib/leverage-status.ts`). Stoplichtkleuren volgen NIET het module-accent (semantiek blijft semantisch). Register-getal 12. TWEE GRONDSLAG-GATEN GESLOTEN (11 aug 2026), allebei in de loader die op ÉLKE route in het shell-pad hangt: (1) het Box 1-inkomen achter de belasting-dot leest sinds ADR 0103 dezelfde budgetgrondslag als /overzicht/cashflow (`loadBudgetBasis` → `resolveEffectiveIncomeExpenses` mét budget-argument) in plaats van stil op de transactiegrondslag te blijven; (2) de losse-rekening-optelling voor de sidebar-netWorth-metric gebruikt de canonieke, huishoud-gewogen `unlinkedCashTotal`/`resolveUnlinkedCashShare` in plaats van een eigen `reduce` over de saldi. Beide waren drift-bronnen tussen de dot en de pagina, niet tussen de vier oppervlakken onderling — de gelijkheidseis hierboven verandert er niet door, ze wordt er waar door.',
    assertion: {
      kind: 'consistency',
      source: 'consistentie-eis: register-getal 12 (hefboom-status) uit lib/leverage-status.ts + lib/lever-scores-loader.ts (dat sindsdien `loadBudgetBasis` en `unlinkedCashTotal` consumeert i.p.v. een eigen inkomens-/saldo-som); categorisch identiek op vier oppervlakken.',
    },
  },
  {
    workflow: 'WF-CANON-13',
    scenarioId: 'UAT-CANON-13',
    titel: 'Fiscale constanten per jaar: BOX1/2/3/VPB_PARAMS is de enige bron',
    kriticiteit: 'BELANGRIJK',
    persona: 'compleet',
    given: 'Het actuele belastingjaar (2026) en de vorige laag (2025) beschikbaar.',
    when: 'De gebruiker raadpleegt de fiscale kerngetallen op /beheer/fiscale-kerngetallen en volgt ze door naar de belastingmotoren.',
    then: 'Elke belastingmotor leest zijn forfaits/tarieven/drempels per jaar uit één constantenbron (`BOX1_PARAMS`/`BOX3_PARAMS`/`BOX2_PARAMS`/`VPB_PARAMS`); geen motor hardcodeert een forfait lokaal. De matrix per jaar/bron/verificatiedatum spiegelt exact die constanten. Register-getal 13.',
    assertion: {
      kind: 'consistency',
      source: 'consistentie-eis: register-getal 13 (fiscale constanten) uit lib/constants.ts + lib/box3-data.ts + lib/box1-tax.ts; identiek per jaar over alle motoren en de beheer-matrix.',
    },
  },
  {
    workflow: 'WF-CANON-14',
    scenarioId: 'UAT-CANON-14',
    titel: 'Fundament: localMonthBounds voor elk maand-query-venster (vangrail)',
    kriticiteit: 'BELANGRIJK',
    persona: 'compleet',
    given: 'Een maand-gebonden query (spaarquote/cashflow/budget) die een maandvenster nodig heeft.',
    when: 'Een ontwikkelaar/lint-gate controleert hoe het maandvenster wordt bepaald voor de getallen nr 1–13.',
    then: 'Elk maandvenster gebruikt `localMonthBounds` (lib/month-range.ts) — nooit `toISOString()` (dat schuift de grens door de UTC-conversie). Dit is de fundament-vangrail onder de canonieke getallen; de S9-lint bewaakt de overtreding. Register-getal 14 (fundament).',
    assertion: {
      kind: 'consistency',
      source: 'vangrail: register-getal 14 (maandgrenzen) uit lib/month-range.ts#localMonthBounds; elk maand-query-venster onder nr 1–13 gebruikt deze bron (S9-lint).',
    },
  },
  {
    workflow: 'WF-CANON-15',
    scenarioId: 'UAT-CANON-15',
    titel: 'Register compleet & uitputtend: elk kerngetal één bron',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Het canonieke register (`lib/uat/canonical-registry.ts`) met alle kerngetallen (nr 1–14).',
    when: 'De tester loopt het register langs: per getal de bron-functie, de volledige consumentenlijst en (waar puur) de exacte fixture.',
    then: 'Het register is uitputtend (elk kerngetal uit de SSoT-tabel §2.8 staat erin met ≥1 consument), elk exact-getal heeft een engine-check, elke entry mapt naar zijn `kruisWorkflow` (of is expliciet nieuw), en geen consument herberekent een getal lokaal. Bewaakt door `canonical-registry.test.ts` + de dekkings-meta-test.',
    assertion: {
      // Bewust GEEN lib/-pad naar het register hier: de register-volledigheid wordt
      // door de vitest `canonical-registry.test.ts` bewaakt, niet door de uat:stale-
      // scan (die op productie-bronwijzigingen triageert — spiegelt de KRUIS-conventie).
      kind: 'consistency',
      source: 'consistentie-eis: het volledige canonieke register is uitputtend en per getal single-source (narratieve bron: docs/uat/uat-plan.md §2.8); de register-vitest faalt als een canoniek getal of engine-check ontbreekt.',
    },
  },
]

export const CANON_ACCEPTANCE: AcceptanceSet = {
  zone: 'CANON',
  criteria,
}

/**
 * De CANON-scenario-nummers die een acceptatiecriterium HOREN te hebben:
 * 01..14 (één per register-entry) + 15 (afsluitend "register compleet"-meta-scenario).
 * Gebruikt door de dekkings-meta-test.
 */
export const CANON_EXPECTED_WORKFLOW_NUMBERS: number[] = Array.from({ length: 15 }, (_, i) => i + 1)
