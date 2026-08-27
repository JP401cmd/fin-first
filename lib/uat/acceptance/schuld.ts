/**
 * Acceptatiecriteria — domein Schuld (WF-SCHULD-01..18, 20, 21, 22 /
 * UAT-SCHULD-01..18, 20, 21, 22).
 *
 * Bron: `docs/uat/uat-plan.md` Deel 1 (workflow-definities) + de gedetailleerde
 * UAT-SCHULD-scenario's (persona-preconditie + uitgeschreven berekening). Cijfers
 * zijn ONAFHANKELIJK narekend uit `lib/test-personas.ts` — nooit overgenomen uit
 * wat de app toont (zie `schuld.engine.test.ts` voor de daadwerkelijke toets tegen
 * de échte rekenfuncties).
 *
 * WF-SCHULD-19 (eenvoudige weergave) is een VERWIJSREGEL naar UAT-NAV-10 en staat
 * bewust NIET in deze set — het bestaat niet als los SCHULD-scenario in
 * `lib/uat/catalog.ts`.
 *
 * PERSONA-STRATEGIE voor de live-run (zie ook `persona`/`then` per criterium):
 * - Lisa   — hoofdpersona (11 schulden, alle 11 debt-types, exact narekenbaar).
 * - Tessa  — 'compleet' (2 hypotheken, hypotheekplanner + Box 1-doorwerking).
 * - Willem — lege staat (`debts: []`).
 * - Daan   — "bijna-lege" basis. ⚠ Daan's seed FAALT op de
 *            retirement_provider_type-constraint (lib/test-personas.ts r741,
 *            'premiepensioeninstelling') → de LIVE-run van Daan-afhankelijke
 *            scenario's moet als BLOCKED worden behandeld. De ENGINE-check draait
 *            wél (pure in-memory persona-data, geen DB-seed).
 *
 * GEVONDEN DISCREPANTIES tussen de UAT-scenariotekst en de code (inline
 * gedocumenteerd, headline-cijfers onaangetast):
 * - WF-SCHULD-05: detail-pane rente-aandeel — de scenariotekst noteert "3,4%",
 *   maar `computeRenteAflossingsSplit` geeft `rentePercentage = 3,41` (display
 *   rondt op 1 decimaal). De "resterende rente ≈€38,78" uit de tekst is via
 *   `amortizationSchedule` in werkelijkheid €38,77 (per-rij-afronding) — een
 *   hand-slip van €0,01, buiten de exact-assertie gehouden.
 * - WF-SCHULD-13: jaar-1 amortisatie — de tekst noteert rente €9.212,88 /
 *   aflossing €6.147,12; de échte `amortizationSchedule` (per-rij afgerond) geeft
 *   €9.213,16 / €6.146,84 (som blijft 12×€1.280 = €15.360). Headline "≈€9.213"
 *   klopt; het precieze tekst-cijfer was een continue-vs-per-rij-afrondingsslip.
 * - WF-SCHULD-21: Wet Hillen-tekengedrag GEVERIFIEERD correct — bij ontkoppelde
 *   hypotheek (rente 0) flipt het eigenwoning-saldo naar +€532,98 (bijtelling),
 *   `hillenAftrek = (forfait−rente)×0,718` alleen wanneer forfait > rente.
 * - WF-SCHULD-22: de DSTI-teller (Σ maandlasten = €2.135) is exact, maar het
 *   DSTI-PERCENTAGE leunt op een 6-maands transactiegemiddelde met seed-jitter →
 *   'direction'. Het AANTAL "versneld aflossen"-aandachtspunten (6, op vaste
 *   rentedrempel ≥4%) is wél exact via `debtsToAandachtspunten`.
 */

import type { AcceptanceCriterion, AcceptanceSet } from './types'

const criteria: AcceptanceCriterion[] = [
  {
    workflow: 'WF-SCHULD-01',
    scenarioId: 'UAT-SCHULD-01',
    titel: 'Schuldenoverzicht bekijken: totalen, categorieën en kaarten',
    kriticiteit: 'KERN',
    persona: 'lisa',
    given: 'Persona Lisa de Groot geladen (11 schulden, elk debt-type precies 1×), solo-perspectief. WEERGAVEMODUS (BEZ-3/APP-7): de vier onderstaande cijfers zijn zelf mode-onafhankelijk (dezelfde `totalBalance`/`weightedAvgInterest`-sommen). Wat ZICHTBAAR is op de figures-strip verschilt: in **Volledig** staan alle vier de cellen; in **Eenvoudig** kapt `FiguresStrip` af tot de eerste 2 — Totale schuld + Maandlasten — en blijven "Rente (gewogen)" en "Categorieën" (beheer-diepte) buiten beeld. De LTV-KPI op de Hypotheek-kaart staat los van de strip en is in beide modi ongewijzigd zichtbaar.',
    when: 'De gebruiker opent /overzicht/schulden en leest de figures-strip + categorie-groepen + de LTV-KPI op de Hypotheek-kaart (Volledig: alle 4 strip-cellen; Eenvoudig: alleen Totale schuld + Maandlasten).',
    then: 'Totale schuld €368.270 (Σ current_balance), Maandlasten €2.135 (Σ monthly_payment), Rente (gewogen) 2,88% → "2,9%", Categorieën 11 (distinct debt_type); LTV hypotheek 350.000/385.000×100 = 90,9% → "91%" (tone neutral, 80–100%). De laatste twee cijfers (Rente gewogen, Categorieën) zijn in Eenvoudig niet op de strip te lezen, maar blijven exact en narekenbaar — puur presentatie-reductie, geen tweede rekenpad.',
    assertion: {
      kind: 'exact',
      expected: 'totaleSchuld=368270; maandlasten=2135; gewogenRente=2.88; categorieen=11; ltvPct=91; ltvTone=neutral',
      source: 'som current_balance/monthly_payment + Σ(rate×balance)/Σbalance over PERSONAS.lisa.debts (spiegelt totalBalance/weightedAvgInterest in app/(app)/core/debts/page.tsx r362-382; solo-perspectief → shareOf reduceert tot de waarde zelf); LTV via lib/debt-kpi.ts#computeDebtKpi (kpiMortgage) met linkedAssetValueByDebtId=385000',
    },
  },
  {
    workflow: 'WF-SCHULD-02',
    scenarioId: 'UAT-SCHULD-02',
    titel: 'Filteren op schuldtype',
    kriticiteit: 'BELANGRIJK',
    persona: 'lisa',
    given: 'Persona Lisa geladen op /overzicht/schulden.',
    when: 'De gebruiker kiest "Hypotheek" in de type-dropdown, daarna "Alle schulden".',
    then: 'Alleen de Hypotheek-groep (1 kaart, €350.000) blijft zichtbaar; geen page-navigatie (URL blijft /overzicht/schulden); de figures-strip blijft ongewijzigd op €368.270 (filter-onafhankelijk); "Alle schulden" herstelt alle 11 groepen. Randgeval (c) draait op persona `daan` → filter "Hypotheek" geeft lege lijst (BLOCKED live: Daan-seed faalt).',
    assertion: {
      kind: 'ui-only',
      source: 'client-side filter zonder cijfermatige uitkomst; het filter raakt de figures-strip niet',
    },
  },
  {
    workflow: 'WF-SCHULD-03',
    scenarioId: 'UAT-SCHULD-03',
    titel: 'Schuld toevoegen via de QuickAdd-wizard',
    kriticiteit: 'KERN',
    persona: 'daan',
    given: 'Persona Daan Bakker geladen (1 schuld: Studielening DUO €13.900 @ 0,46%, €100/mnd). ⚠ LIVE = BLOCKED: Daan-seed faalt op de retirement_provider_type-constraint (r741) — de engine-check draait wel in-memory.',
    when: 'De gebruiker voegt "Verbouwingslening" (Persoonlijke lening, saldo €5.000, rente 7%) toe.',
    then: 'Default maandbedrag = computeDefaultMonthlyPayment(5000, 7, 5, "annuiteit") = €99,01 (looptijd DEFAULT_TERM_YEARS_PER_TYPE.personal_loan=5, type DEBT_DEFAULT_REPAYMENT_TYPE.personal_loan="annuiteit"). Nieuwe Totale schuld €18.900, Maandlasten €199,01 (≈€199), gewogen rente (13.900×0,46+5.000×7)/18.900 = 2,19% → "2,2%", Categorieën 2.',
    assertion: {
      kind: 'exact',
      expected: 'defaultMaandbedrag=99.01; totaleSchuld=18900; maandlasten=199.01; gewogenRente=2.19; categorieen=2',
      source: 'lib/debt-data.ts#computeDefaultMonthlyPayment + DEFAULT_TERM_YEARS_PER_TYPE.personal_loan (5) + DEBT_DEFAULT_REPAYMENT_TYPE.personal_loan ("annuiteit"); totalen/gewogen rente direct op PERSONAS.daan.debts + de nieuwe lening',
    },
  },
  {
    workflow: 'WF-SCHULD-04',
    scenarioId: 'UAT-SCHULD-04',
    titel: 'Eerste gebruik: lege staat en eerste schuld',
    kriticiteit: 'BELANGRIJK',
    persona: 'willem',
    given: 'Persona Willem Jansen geladen (`debts: []`, hypotheekvrij).',
    when: 'De gebruiker opent /overzicht/schulden op de lege staat en voegt via de CTA een eerste schuld toe.',
    then: 'Precondtie-fact: Willem heeft 0 actieve schulden en Totale schuld €0 (empty-state + verborgen Aflosroute-kaart). Na toevoegen van een creditcard €300 wordt Totale schuld €300 (directe optelling op een lege basis). De exact-assertie borgt de lege-staat-preconditie (0 schulden, €0).',
    assertion: {
      kind: 'exact',
      expected: 'willemDebtsCount=0; willemTotaleSchuld=0',
      source: 'PERSONAS.willem.debts (lege array) — als iemand een schuld aan Willems seed toevoegt breekt het lege-staat-scenario; de +€300-toevoeging is triviale optelling en blijft in de proza',
    },
  },
  {
    workflow: 'WF-SCHULD-05',
    scenarioId: 'UAT-SCHULD-05',
    titel: 'Schuld-detail bekijken (slide-in pane)',
    kriticiteit: 'KERN',
    persona: 'lisa',
    given: 'Persona Lisa geladen; kaart "Restant autolening Toyota" (saldo €2.000, origineel €15.000, rente 4,5%, €220/mnd, annuïteit, geen end_date).',
    when: 'De gebruiker opent de detail-pane en leest %-afgelost, rente/aflossing-split en aflostijd.',
    then: '% afgelost = (15.000−2.000)/15.000 = 86,67%; maandrente €7,50; aflossing €212,50; rente-aandeel 3,41% (tekst noteert display-afronding "3,4%"); resterende looptijd 10 maanden. (Resterende totale rente ≈€38,77 via amortizationSchedule — tekst zei €38,78, €0,01 hand-slip, buiten de assertie.)',
    assertion: {
      kind: 'exact',
      expected: 'pctAfgelost=86.67; maandRente=7.50; aflossing=212.50; rentePct=3.41; remMonths=10',
      source: 'lib/debt-data.ts#computeRenteAflossingsSplit op de autolening (annuïteit-fallback zonder end_date → PMT=monthly_payment); pctAfgelost = (original−balance)/original×100',
    },
  },
  {
    workflow: 'WF-SCHULD-06',
    scenarioId: 'UAT-SCHULD-06',
    titel: 'Schuld bewerken (volledig formulier)',
    kriticiteit: 'KERN',
    persona: 'lisa',
    given: 'Persona Lisa geladen; Hypotheek (€350.000, rente 2,9%, €1.100/mnd).',
    when: 'De gebruiker wijzigt de hypotheekrente van 2,9% naar 3,5% (maandbedrag blijft €1.100).',
    then: 'Nieuwe gewogen rente = (1.060.690 − 350.000×2,9 + 350.000×3,5)/368.270 = 1.270.690/368.270 = 3,45% → "3,5%". Nieuwe maandrente hypotheek €1.020,83, aflossing €79,17 — géén "dekt de rente niet"-waarschuwing (1.100 > 1.020,83).',
    assertion: {
      kind: 'exact',
      expected: 'nieuweGewogenRente=3.5; maandRente=1020.83; aflossing=79.17',
      source: 'gewogen rente Σ(rate×balance)/Σbalance met hypotheekrente=3,5 (page.tsx-mirror); maandrente/aflossing via lib/debt-data.ts#computeRenteAflossingsSplit op de aangepaste hypotheek',
    },
  },
  {
    workflow: 'WF-SCHULD-07',
    scenarioId: 'UAT-SCHULD-07',
    titel: 'Saldo bijwerken (herwaardering)',
    kriticiteit: 'KERN',
    persona: 'lisa',
    given: 'Persona Lisa geladen; "ICS doorlopend krediet" (saldo €800).',
    when: 'De gebruiker werkt het saldo bij naar €750 (herwaardering, datum vandaag).',
    then: 'Totale schuld €368.220 (368.270 − (800−750)); Maandlasten ongewijzigd €2.135 (herwaardering raakt monthly_payment niet).',
    assertion: {
      kind: 'exact',
      expected: 'totaleSchuld=368220; maandlasten=2135',
      source: 'directe optelling: PERSONAS.lisa Σcurrent_balance − delta (upsertSingleBalanceSnapshot wijzigt alleen het saldo, niet monthly_payment)',
    },
  },
  {
    workflow: 'WF-SCHULD-08',
    scenarioId: 'UAT-SCHULD-08',
    titel: 'Schuld volledig aflossen (saldo naar 0)',
    kriticiteit: 'KERN',
    persona: 'lisa',
    given: 'Persona Lisa geladen; "Visa creditcard saldo" (€250, €25/mnd, enige creditcard).',
    when: 'De gebruiker werkt het saldo bij naar €0 (schuld wordt inactief).',
    then: 'Totale schuld €368.020 (368.270−250); Maandlasten €2.110 (2.135−25); Categorieën 10 (Creditcard-groep verdwijnt). Netto vermogen stijgt €250 (schuld valt uit de som zodra is_active=false).',
    assertion: {
      kind: 'exact',
      expected: 'totaleSchuld=368020; maandlasten=2110; categorieen=10',
      source: 'directe aftrek van saldo + monthly_payment uit de sommen (page.tsx); is_active=false verwijdert het debt_type uit de distinct-set',
    },
  },
  {
    workflow: 'WF-SCHULD-09',
    scenarioId: 'UAT-SCHULD-09',
    titel: 'Schuld verwijderen',
    kriticiteit: 'KERN',
    persona: 'lisa',
    given: 'Persona Lisa geladen.',
    when: 'De gebruiker verwijdert (a) "Achterstallige factuur klusbedrijf" (€200, enige "Overig") of (b) de Hypotheek (€350.000).',
    then: '(a) Totale schuld €368.070 (368.270−200), Categorieën 10 (Overig-groep weg). (b) Totale schuld €18.270 (368.270−350.000), LTV- en Box 1-doorwerking vallen weg (cross-module).',
    assertion: {
      kind: 'exact',
      expected: 'happyPath=368070; categorieen=10; hypotheekVerwijderd=18270',
      source: 'PERSONAS.lisa Σcurrent_balance minus de verwijderde schuld (HARD delete via DELETE /api/debts/[id] — niet te verwarren met WF-SCHULD-08, waar aflossen is_active=false zet; de route ruimt ook valuations + balance_snapshots op, zodat de bevestigingstekst klopt)',
    },
  },
  {
    workflow: 'WF-SCHULD-10',
    scenarioId: 'UAT-SCHULD-10',
    titel: 'Aflosroute verkennen: strategie kiezen en extra aflossen simuleren',
    kriticiteit: 'KERN',
    persona: 'lisa',
    given: 'Persona Lisa geladen; kaart "Schuldenprofiel & Aflosroute".',
    when: 'De gebruiker kiest Avalanche resp. Sneeuwbal en schuift "Extra aflossen".',
    then: 'Eerste doelwit Avalanche = "Persoonlijke lening keukenrenovatie" (6,5%, hoogste rente onder de niet-aflossingsvrije schulden); eerste doelwit Sneeuwbal = "Achterstallige factuur klusbedrijf" (€200, laagste saldo). De Visa-creditcard, het ICS-doorlopend-krediet en de DGA-schuld zijn `aflossingsvrij` en dus uitgesloten van targeting. Schuldvrij-datums lopen via `simulatePayoff` (maand-op-maand over honderden maanden) → NIET met de hand herleidbaar; alleen de deterministische doelwit-keuze/richting is toetsbaar.',
    assertion: {
      kind: 'direction',
      source: 'lib/debt-data.ts#simulatePayoff — de targeting-sort (avalanche desc op rate, snowball asc op balance, aflossingsvrij uitgesloten) zit ingebed in de maand-loop; geen los-exporteerbare pure "target-order"-functie, dus richting i.p.v. exact cijfer',
    },
  },
  {
    workflow: 'WF-SCHULD-11',
    scenarioId: 'UAT-SCHULD-11',
    titel: 'Categoriepagina per schuldtype bekijken',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Persona Tessa Compleet geladen; twee hypotheken ("Hypotheek eigen woning" €300.000, "Beleggingshypotheek appartement" €110.000).',
    when: 'De gebruiker opent de categoriepagina "Hypotheek".',
    then: 'Mini-hero toont "2 hypotheken", categorie-totaal €410.000 (300.000+110.000).',
    assertion: {
      kind: 'exact',
      expected: 410000,
      source: 'som current_balance van PERSONAS.compleet.debts gefilterd op debt_type==="mortgage" (components/core/debt-category-page.tsx hero-totaal, solo → aandeel 100%)',
    },
  },
  {
    workflow: 'WF-SCHULD-12',
    scenarioId: 'UAT-SCHULD-12',
    titel: 'Hypotheekplanner activeren (tracking-vlag + eenmalige setup)',
    kriticiteit: 'BELANGRIJK',
    persona: 'lisa',
    given: 'Persona Lisa geladen (hypotheek-vlag has_hypotheekplanner_tracking staat UIT).',
    when: 'De gebruiker vinkt "Hypotheekplanner" aan en doorloopt de eenmalige setup: alléén de hypotheek-keuze (versimpeld aug 2026 — de eerdere strategie- en bevestigings-stappen zijn vervallen; onder de selector staat een "Voeg hypotheek toe"-knop).',
    then: 'De planner-tab verschijnt en de Voltooien-knop blokkeert tot een hypotheek is geselecteerd. Pure UI-/flag-workflow zonder cijfermatige uitkomst.',
    assertion: {
      kind: 'ui-only',
      source: 'flag-toggle + setup-gate (components/app/app-setup/configs/hypotheekplanner.config.tsx, één sectie); geen persona-cijfer te herleiden',
    },
  },
  {
    workflow: 'WF-SCHULD-13',
    scenarioId: 'UAT-SCHULD-13',
    titel: 'Hypotheekplanner gebruiken: equity, waardestijging, amortisatie en mijlpalen',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Persona Tessa Compleet geladen; "Hypotheek eigen woning" (€300.000 @ 3,1%, €1.280/mnd) gekoppeld aan "Eigen woning Amersfoort" (marktwaarde €560.000), planner al opgezet.',
    when: 'De gebruiker bekijkt de KPI-band, equity-balk, de 10-jaars waardestijging (2,5%) en de jaar-1 amortisatie.',
    then: 'Eigen vermogen €260.000 (560.000−300.000); equity-groei €505,00/mnd (aflossingsdeel via split: 1.280 − 300.000×0,031/12); 10-jaars woningwaarde 560.000×(1,025)^10 = €716.847; jaar-1 amortisatie rente €9.213,16 / aflossing €6.146,84 (som 12×€1.280 = €15.360). LTV-mijlpalen (schuld+marktwaarde-iteratie) zijn richting/benadering, niet exact.',
    assertion: {
      kind: 'exact',
      expected: 'eigenVermogen=260000; equityPerMaand=505.00; waardestijging10jr=716847; amortJaar1Rente=9213.16; amortJaar1Aflossing=6146.84',
      source: 'equity = marktwaarde−saldo; equity/mnd via lib/debt-data.ts#computeRenteAflossingsSplit; 10-jr = marktwaarde×(1+r)^10 (waardestijging-slider); jaar-1 amortisatie = Σ12 rijen lib/debt-data.ts#amortizationSchedule(300000, 3.1, 1280)',
    },
  },
  {
    workflow: 'WF-SCHULD-14',
    scenarioId: 'UAT-SCHULD-14',
    titel: 'Hypotheek vs. beleggen vergelijken',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Persona Tessa Compleet geladen (marginaal tarief 49,5%); "Hypotheek eigen woning" (3,1%).',
    when: 'De gebruiker vergelijkt extra aflossen (€300/mnd) vs. beleggen (rendement 7%) en verschuift het rendement onder/boven breakeven.',
    then: 'Breakeven-rendement ligt in de buurt van de netto-hypotheekrente na aftrek: 3,1%×(1−0,495) ≈ 1,56% (orde 1–2,5%, niet 0% of 6%); rendement ver onder breakeven → "Voordeel: Aflossen", ver boven → "Voordeel: Beleggen". `compareMortgageVsInvest` combineert een maand-op-maand amortisatie met jaarlijkse compounding → niet met de hand tot op de cent; alleen richting/sanity.',
    assertion: {
      kind: 'direction',
      source: 'lib/hypotheek-vs-beleggen.ts#compareMortgageVsInvest — meerjarige simulatie; breakeven-sanity ≈ netto-rente na aftrek, winnaar-flip bij rendement onder/boven breakeven',
    },
  },
  {
    workflow: 'WF-SCHULD-15',
    scenarioId: 'UAT-SCHULD-15',
    titel: 'Woning aan hypotheek koppelen en LTV zien',
    kriticiteit: 'KERN',
    persona: 'lisa',
    given: 'Persona Lisa geladen; Hypotheek €350.000 gekoppeld aan "Woning Utrecht" (€385.000).',
    when: 'De gebruiker ont- en herkoppelt de woning en bekijkt (randgeval) een saldo boven de woningwaarde.',
    then: 'Gekoppeld: LTV = 350.000/385.000×100 = 90,9% → "91%" (tone neutral, 80–100%). Randgeval onderwater: saldo €400.000 → LTV 103,9% → "104%" (tone neg, >100%). Ontkoppeld: geen LTV-KPI.',
    assertion: {
      kind: 'exact',
      expected: 'ltvNormaal=91; toneNormaal=neutral; ltvOnderwater=104; toneOnderwater=neg',
      source: 'lib/debt-kpi.ts#computeDebtKpi (kpiMortgage) met linkedAssetValueByDebtId=385000 — formatPercent decimals 0, tone-grenzen <80 pos / >100 neg / anders neutral',
    },
  },
  {
    workflow: 'WF-SCHULD-16',
    scenarioId: 'UAT-SCHULD-16',
    titel: 'Aflossing meetellen in spaarquote',
    kriticiteit: 'KERN',
    persona: 'lisa',
    given: 'Persona Lisa geladen; Hypotheek (€350.000, 2,9%, €1.100/mnd).',
    when: 'De gebruiker vinkt "Aflossing meetellen in spaarquote" aan met optie "Berekend" en zet daarna de inclusie op 50%.',
    then: 'Berekend aflossingsdeel = 1.100 − 350.000×0,029/12 = 1.100 − 845,83 = €254,17/mnd (100% inclusie). Bij 50% inclusie: 254,17×0,5 = €127,09/mnd. (Randgeval maandbedrag €800 < maandrente €845,83 → aflossingsdeel €0.)',
    assertion: {
      kind: 'exact',
      expected: 'aflossingsdeel=254.17; aflossingsdeel50pct=127.09',
      source: 'lib/debt-data.ts#computeRenteAflossingsSplit.currentAflossing op de hypotheek (aflossing = maandbedrag − saldo×rente/12); 50%-weging = aflossingsdeel×0,5',
    },
  },
  {
    workflow: 'WF-SCHULD-17',
    scenarioId: 'UAT-SCHULD-17',
    titel: 'Netto-vermogen-inclusiepercentage instellen',
    kriticiteit: 'KERN',
    persona: 'lisa',
    given: 'Persona Lisa geladen; "Lening van ouders" (saldo €6.000).',
    when: 'De gebruiker schuift de netto-vermogen-inclusie-slider naar 50%.',
    then: 'Effectief saldo = 6.000×50/100 = €3.000; netto-vermogen-delta = 6.000−3.000 = €3.000 stijging. (Randgeval: invoer 150 → geklemd 100, −10 → 0; 0% → effectief €0 maar schuld blijft zichtbaar op de kaart met €6.000.)',
    assertion: {
      kind: 'exact',
      expected: 'effectiefSaldo=3000; nettoVermogenDelta=3000',
      source: 'current_balance × pct/100 (lib/dashboard-data-loader.ts r606, inclusion-gewogen debt-som — regelnummer bijgewerkt na de R2/R3-bundel van 27 aug; de formule zelf is ongewijzigd); delta = volle saldo − effectief saldo',
    },
  },
  {
    workflow: 'WF-SCHULD-18',
    scenarioId: 'UAT-SCHULD-18',
    titel: 'Gedeelde schuld in een huishouden beheren',
    kriticiteit: 'KERN',
    persona: 'lisa',
    given: 'Persona Lisa geladen (household_type gezin). ⚠ LIVE vereist een ÉCHT tweede account (partner) + geaccepteerd huishouden — de persona-seed zet alle schulden op ownership "personal", dus de "Gedeeld"-optie verschijnt pas na een echt huishoudlid. De engine-check bewijst alleen de reken-split.',
    when: 'De gebruiker zet "Lening van ouders" (€6.000, €100/mnd) op Gedeeld met eigen verdeling 60% (gebruiker = primary payer).',
    then: 'Jouw aandeel 6.000×0,60 = €3.600; partner 6.000×0,40 = €2.400; maandlast-split €60 / €40. Headline eigen-perspectief daalt van €368.270 naar €365.870 (368.270 − 6.000 + 3.600).',
    assertion: {
      kind: 'exact',
      expected: 'sharePct=60; jouwAandeel=3600; partnerAandeel=2400; maandlastJij=60; maandlastPartner=40; headline=365870',
      source: 'lib/household-data.ts#computeSharePct({splitMode:"custom", customSplitPct:60, primaryPayerId:userId}, userId) → 60; shareOf toegepast op saldo/maandlast; headline = Σsaldo − volle lening + jouw aandeel',
    },
  },
  {
    workflow: 'WF-SCHULD-20',
    scenarioId: 'UAT-SCHULD-20',
    titel: 'DGA-schuld registreren met Wet excessief lenen-bewaking',
    kriticiteit: 'KERN',
    persona: 'lisa',
    given: 'Persona Lisa geladen; deelneming-asset "Belang familie BV (5%)" + DGA-schuld "Rekening-courant familie BV" (€200).',
    when: 'De gebruiker koppelt de deelneming en verhoogt (randgeval) het DGA-saldo richting/over de drempel.',
    then: 'Drempel = DGA_LENING_DREMPEL = €500.000. Bij totaal €200: geen bovenmatig deel (excess €0). Bij totaal €550.000: bovenmatig deel = 550.000 − 500.000 = €50.000 (rode waarschuwing). (Nadering-grens €400.000 is hardcoded in debt-form.tsx.)',
    assertion: {
      kind: 'exact',
      expected: 'drempel=500000; excessOnder=0; excessBoven=50000',
      source: 'lib/box2-data.ts#calculateBox2 → dgaLeningenDrempel (DGA_LENING_DREMPEL) + dgaLeningenExcess = max(0, totaal − drempel)',
    },
  },
  {
    workflow: 'WF-SCHULD-21',
    scenarioId: 'UAT-SCHULD-21',
    titel: 'Doorwerking naar Box 1: hypotheekrenteaftrek zien',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Persona Tessa Compleet geladen; "Eigen woning Amersfoort" (WOZ €540.000) met gekoppelde hypotheek (€300.000 @ 3,1%). Alleen de aan het eigen_huis gekoppelde hypotheek telt mee (de aflossingsvrije beleggingshypotheek hangt aan een real_estate-asset).',
    when: 'De gebruiker opent /overzicht/belasting/box1; randgevallen: rente naar 6% en hypotheek ontkoppeld.',
    then: 'Basis: eigenwoningforfait = 540.000×0,0035 = €1.890; renteaftrek = 300.000×0,031 = €9.300; saldo vóór Hillen −7.410 (<0 → geen Hillen), eigenwoning-saldo −€7.410 (aftrekpost). Rente 6% → renteaftrek €18.000, saldo −€16.110. Ontkoppeld (rente 0): renteaftrek €0, Hillen 1.890×0,718 = €1.357,02, eigenwoning-saldo +€532,98 (teken FLIPT naar bijtelling).',
    assertion: {
      kind: 'exact',
      expected: 'forfait=1890; renteaftrek=9300; saldo=-7410; saldo6pct=-16110; hillenAftrekOntkoppeld=1357.02; saldoOntkoppeld=532.98',
      source: 'lib/box1-tax.ts#computeBox1Tax (2026, wozValue=540000, hypotheekRente=9300/18000/0) — eigenwoningforfaitRate 0,0035, hillenPct 0,718; Hillen-aftrek alleen wanneer forfait > rente',
    },
  },
  {
    workflow: 'WF-SCHULD-22',
    scenarioId: 'UAT-SCHULD-22',
    titel: 'Doorwerking naar gezondheidsscore (DSTI) en Fin-acties',
    kriticiteit: 'BELANGRIJK',
    persona: 'lisa',
    given: 'Persona Lisa geladen.',
    when: 'De gebruiker bekijkt de pijler "Schuldenlast" (DSTI) en de "Versneld aflossen"-aandachtspunten.',
    then: 'DSTI-teller = Σ maandlasten actieve schulden = €2.135 (exact); het DSTI-PERCENTAGE leunt op een 6-maands transactiegemiddelde (jitter) → richting-only. AANTAL aandachtspunten (rente ≥ DEBT_INTEREST_THRESHOLD=4%) = 6: Persoonlijke lening (6,5% → €182/jr), Autolening (4,5% → €90/jr), Visa (14% → €35/jr), ICS doorlopend (8,9% → €71,20/jr), Belastingaanslag (4,0% → €48/jr, exact op de grens telt mee want `>=`), DGA-schuld (5,0% → €10/jr).',
    assertion: {
      kind: 'exact',
      expected: 'aantalAandachtspunten=6; besparingSom=436.20',
      source: 'lib/aandachtspunten.ts#debtsToAandachtspunten op PERSONAS.lisa.debts (filter interest_rate >= DEBT_INTEREST_THRESHOLD=4; savings = balance×rate/100); DSTI-teller €2.135 exact, DSTI-percentage bewust direction-only (jitter-noemer)',
    },
  },
  {
    workflow: 'WF-SCHULD-23',
    scenarioId: 'UAT-SCHULD-23',
    titel: 'Koppelscherm bij nul gekoppelde hypotheken (hypotheekplanner)',
    kriticiteit: 'BELANGRIJK',
    given: 'Hypotheekplanner-setup ooit voltooid (useIsAppSetupCompleted(\'hypotheekplanner\') = true), maar geen enkele actieve hypotheek heeft `has_hypotheekplanner_tracking` aan — de mortgage-entry vindt dus geen gekoppelde hypotheek (`data.mortgage === null`).',
    when: 'De gebruiker opent de hypotheek-entry van de planner (/overzicht/schulden/mortgage?tab=hypotheekplanner).',
    then: '`AppLinkGate` toont een hero-band "Hypotheek koppelen" + checkbox-lijst met de niet-gekoppelde hypotheken (naam + saldo) i.p.v. de oude "Nog niets getrackt"-doodlopende staat. Opslaan POST\'t per selectie `{id, enabled:true}` naar `/api/debts/toggle-hypotheekplanner` en verhoogt de tab-eigen `reloadKey`, waarna de planner met de zojuist gekoppelde hypotheek rendert (client-fetch, geen server-bundel-refresh nodig). Zonder kandidaten (geen enkele hypotheek geregistreerd) toont het scherm een voeg-eerst-toe-CTA naar de schulden-items-tab. De eigen_huis-entry (asset-pagina, `type==="eigen_huis"`) is ongewijzigd en behoudt zijn bestaande "Nog niets getrackt"/"Geen gekoppelde hypotheek"-paden — alleen de mortgage-entry kreeg het koppelscherm.',
    assertion: {
      kind: 'ui-only',
      source: 'components/core/deepenings/hypotheekplanner-tab.tsx (HypotheekplannerActive, Pad 0: type===\'mortgage\' && !data.mortgage) + components/app/app-setup/app-link-gate.tsx; endpoint app/api/debts/toggle-hypotheekplanner/route.ts',
    },
  },
]

export const SCHULD_ACCEPTANCE: AcceptanceSet = {
  zone: 'SCHULD',
  criteria,
}
