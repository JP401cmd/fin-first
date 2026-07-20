/**
 * Acceptatiecriteria — domein Budgetteren (WF-BUDGET-01..24 / UAT-BUDGET-01..24).
 *
 * Spiegelt exact de aanpak van `schuld.ts`/`toek.ts`/`bezit.ts`. Bron: `docs/uat/uat-plan.md`
 * Deel 1 (workflow-definities) + Deel 2 §2.8 (BUDGET-scenario's), en de budget-rekenmotoren
 * (`lib/budget-rollover.ts`, `lib/budget-period.ts`, `lib/budget-forecast.ts`,
 * `lib/budget-alerts.ts`, `lib/budget-perspective.ts`, `lib/budget-plan-diff.ts`,
 * `lib/budget-templates/onboarding-presets.ts`, `lib/nibud/reference-data.ts`, `lib/format.ts`).
 *
 * KERN-BEVINDING (bepaalt exact vs. consistency/direction): persona **Lisa** draagt zowel
 * `budgets` (statische limieten via `makeBudgets` — deterministisch) als `transactions`
 * (gegenereerd met `Math.random()`-jitter + relatieve datums — NIET hand-narekenbaar). Daarom
 * zijn 'exact'-criteria altijd op de pure rekenmotoren met statische/synthetische input
 * gebaseerd (net als TOEK dat met parameter-echo's doet); de maand-REALISATIE (besteed-bedrag
 * uit transacties) is 'consistency' (A moet overal gelijk zijn) of 'direction'.
 *
 * Twee "inline client-calc"-workflows (WF-BUDGET-05 drempels, WF-BUDGET-18 spaardoel-voortgang)
 * hebben geen los-exporteerbare pure functie in `components/app/budgets-client.tsx` — daar wordt
 * de exacte formule MET bronregel-verwijzing gemirrord in `budget-checks.ts`, niet
 * herïmplementeerd met eigen aannames (spiegelt de figures-strip-mirror in `schuld-checks.ts`).
 *
 * PERSONA-STRATEGIE voor de live-run: Lisa is de budgetpersona (11 schulden, huishouden
 * 'gezin', budgetten met statische limieten). Gedeeld budgetteren (WF-BUDGET-20) vereist een
 * ÉCHT tweede account — de engine-check bewijst alleen de reken-split (`buildSpendingSums`/
 * `combineSpending`/`shareFractionFor`), niet de live UI met een echte partner.
 *
 * BUG-KANDIDAAT (zie ook budget-checks.ts en de Notion-zonekaart): WF-BUDGET-11 — de
 * bevestigingstekst bij "Budget archiveren?" belooft dat budgetten met gekoppelde transacties
 * niet kunnen worden gearchiveerd, maar `DELETE /api/budgets/[id]` voert een HARDE delete uit
 * (budget + subbudgetten weg, `transactions.budget_id` → NULL) zonder die blokkade — de
 * `is_archived`-kolom bestaat, maar geen UI-pad zet 'm. Karakteriseren als bug, niet hier fixen.
 */

import type { AcceptanceCriterion, AcceptanceSet } from './types'

const criteria: AcceptanceCriterion[] = [
  {
    workflow: 'WF-BUDGET-01',
    scenarioId: 'UAT-BUDGET-01',
    titel: 'Budgetteren voor het eerst instellen',
    kriticiteit: 'KERN',
    persona: 'lisa',
    given: 'Nieuwe gebruiker doorloopt de Budgetteren-setup-gate (module nog niet actief), netto-maandinkomen ingevuld.',
    when: 'De gebruiker kiest het Nibud-template en rondt de setup af.',
    then: 'De hiërarchische seed uit `buildTemplateSeed(\'nibud\', inkomen)` behoudt het inkomen (som van de inkomen-children = ingevoerd netto-inkomen) en elk hoofdbudget-met-children heeft `default_limit` = som van zijn children; 8 canonieke hoofdbudgetten (incl. Eigen rekening-archief).',
    assertion: {
      kind: 'exact',
      expected: 'inkomenSom=3400; parentSomKlopt=true; aantalHoofdbudgetten=8',
      source: 'lib/budget-templates/onboarding-presets.ts#buildTemplateSeed(\'nibud\', 3400) — inkomen-conservatie- en parent=Σchildren-invariant over de volledige seed',
    },
  },
  {
    workflow: 'WF-BUDGET-02',
    scenarioId: 'UAT-BUDGET-02',
    titel: 'Budget-vs-realisatie van de maand bekijken',
    kriticiteit: 'KERN',
    persona: 'lisa',
    given: 'Persona Lisa geladen, lopende maand met transacties op meerdere budgetten.',
    when: 'De gebruiker opent de budgetpagina en leest de KPI-strip, de boomweergave en het per-budget "besteed/limiet".',
    then: 'Volgens-plan/Werkelijk in de KPI-strip == de som van de boomweergave-realisatie == de per-budget realisatie op het detailpaneel — één gedeelde `loadSpending`-bron, geen tweede berekening per surface. De onderliggende bedragen zijn NIET hand-narekenbaar (transactie-generator gebruikt `Math.random()`-jitter).',
    assertion: {
      kind: 'consistency',
      source: 'app/(app)/core/budgets/page.tsx + components/app/budgets-client.tsx delen één spending-map (buildSpendingSums/combineSpending); A=B-toets tussen KPI-strip, boom en detailpaneel i.p.v. een hard cijfer',
    },
  },
  {
    workflow: 'WF-BUDGET-03',
    scenarioId: 'UAT-BUDGET-03',
    titel: 'Maand navigeren en periodemodus wisselen',
    kriticiteit: 'KERN',
    persona: 'lisa',
    given: '"Nu" vastgezet op 15 juli 2026; gebruiker op de budgetpagina.',
    when: 'De gebruiker navigeert naar maart 2026 (maand-modus), en schakelt daarna naar YTD en 12-maanden.',
    then: 'Maand-modus: bereik 2026-03-01 t/m 2026-04-01 (exclusief), 1 maand. YTD: bereik 2026-01-01 t/m 2026-08-01, 7 maanden (jan t/m lopende maand juli). 12-maanden: bereik 2025-08-01 t/m 2026-08-01, 12 maanden. Limieten schalen met `periodMonthCount`.',
    assertion: {
      kind: 'exact',
      expected: 'maandStart=2026-03-01; maandEnd=2026-04-01; maandCount=1; ytdStart=2026-01-01; ytdEnd=2026-08-01; ytdCount=7; m12Start=2025-08-01; m12End=2026-08-01; m12Count=12',
      source: 'lib/budget-period.ts#computeBudgetPeriod(mode, monthDate=2026-03-01, now=2026-07-15) — lokale datumcomponenten, nooit toISOString (maandgrenzen-TZ-conventie)',
    },
  },
  {
    workflow: 'WF-BUDGET-04',
    scenarioId: 'UAT-BUDGET-04',
    titel: 'Weergavemodus wisselen (Boom/Ring/Heatmap/Pillen)',
    kriticiteit: 'BELANGRIJK',
    persona: 'lisa',
    given: 'Persona Lisa geladen op de budgetpagina, Boomweergave actief.',
    when: 'De gebruiker schakelt naar Ring, Heatmap en Pillen-weergave.',
    then: 'Dezelfde onderliggende cijfers (limiet/besteed per budget) worden enkel anders gepresenteerd; geen nieuwe berekening per weergave.',
    assertion: {
      kind: 'ui-only',
      source: 'presentatiewissel zonder cijfermatige uitkomst; de cijfers zelf worden gedekt door WF-BUDGET-02',
    },
  },
  {
    workflow: 'WF-BUDGET-05',
    scenarioId: 'UAT-BUDGET-05',
    titel: 'Budgetanalyse-hub raadplegen en doorklikken',
    kriticiteit: 'BELANGRIJK',
    persona: 'lisa',
    given: 'Persona Lisa geladen (Inkomen €5.200; Vaste lasten €1.455, Dagelijkse uitgaven €900, Vervoer €265, Leuke dingen €300, Sparen&schulden €600, Schulden&aflossingen €50 — statische hoofdbudget-limieten).',
    when: 'De gebruiker opent de analyse-hub en leest de dekkingsgraad en de alert-badges (80%/100%-drempels).',
    then: 'Dekkingsgraad = toegewezen/inkomen×100 = (1.455+900+265+300+600+50)/5.200×100 = 3.570/5.200×100 = 68,65%. Alert-drempels: expense-budget op 85% van limiet met drempel 80% → alert; op 75% → geen alert. Savings-budget op 50% van doel met drempel 100% → alert (te weinig gespaard); op 150% → geen alert.',
    assertion: {
      kind: 'exact',
      expected: 'dekkingPct=68.65; alertExpenseOver=true; alertExpenseUnder=false; alertSavingsUnder=true; alertSavingsOver=false',
      source: 'dekking = Σ(hoofdbudget default_limit, expense/savings/debt-type) / inkomen × 100 op PERSONAS.lisa.budgets; lib/budget-alerts.ts#shouldAlert voor de 4 drempel-varianten',
    },
  },
  {
    workflow: 'WF-BUDGET-06',
    scenarioId: 'UAT-BUDGET-06',
    titel: 'Budgetplan bewerken in de planeditor',
    kriticiteit: 'KERN',
    persona: 'lisa',
    given: 'Synthetische boom: hoofdbudget "Vaste lasten" (children c1 €750 sinds 2026-01-01, c2 €200) — spiegelt de structuur, geen persona-afhankelijkheid nodig.',
    when: 'De gebruiker hernoemt het hoofdbudget, verhoogt c1 naar €800 (ingangsmaand 2026-07-01), verwijdert c2 en voegt een nieuw budget "Abonnementen" (€50) toe, en klikt Opslaan.',
    then: 'De diff bevat: 1 update (naamswijziging hoofdbudget), 1 insert (nieuw budget), 1 delete (c2), 2 amount-upserts (c1 nieuwe limiet + het nieuwe budget) — totaal 5 mutaties.',
    assertion: {
      kind: 'exact',
      expected: 'toInsert=1; toUpdate=1; toDelete=1; amounts=2; countDiff=5',
      source: 'lib/budget-plan-diff.ts#computeBudgetPlanDiff + countDiff op een synthetische originalTree/draft/originalAmounts-fixture',
    },
  },
  {
    workflow: 'WF-BUDGET-07',
    scenarioId: 'UAT-BUDGET-07',
    titel: 'Budget-template toepassen (VERVANG-flow)',
    kriticiteit: 'KERN',
    persona: 'lisa',
    given: 'Persona Lisa geladen (netto-inkomen €5.200), bestaande budgetstructuur.',
    when: 'De gebruiker kiest "Vervang door template" → Uitgebreid-template.',
    then: 'De nieuwe seed uit `buildTemplateSeed(\'uitgebreid\', 5200)` behoudt dezelfde invarianten: inkomen-som = €5.200, elk hoofdbudget-met-children = Σchildren, 8 hoofdbudgetten.',
    assertion: {
      kind: 'exact',
      expected: 'inkomenSom=5200; parentSomKlopt=true; aantalHoofdbudgetten=8',
      source: 'lib/budget-templates/onboarding-presets.ts#buildTemplateSeed(\'uitgebreid\', 5200) — zelfde invariant-toets als WF-BUDGET-01, ander template + inkomen',
    },
  },
  {
    workflow: 'WF-BUDGET-08',
    scenarioId: 'UAT-BUDGET-08',
    titel: 'Nieuw budget aanmaken via het uitgebreide formulier',
    kriticiteit: 'KERN',
    persona: 'lisa',
    given: 'Persona Lisa geladen op de budgetpagina.',
    when: 'De gebruiker vult het formulier in (naam, icoon, limiet, type, ouder) en slaat op.',
    then: 'Pure invoer-workflow; het cijfermatige effect (nieuwe limiet meetellen in totalen) wordt gedekt door WF-BUDGET-02/05.',
    assertion: {
      kind: 'ui-only',
      source: 'formulier-invoer zonder eigen berekening; doorwerking via de gedeelde spending/limiet-som',
    },
  },
  {
    workflow: 'WF-BUDGET-09',
    scenarioId: 'UAT-BUDGET-09',
    titel: 'Budgetdetail bekijken (donut, historie, transacties, vrijheidstijd)',
    kriticiteit: 'KERN',
    persona: 'lisa',
    given: 'Synthetisch budget "Boodschappen": limiet €400, besteed €340 deze maand; algemene maanduitgaven €3.000 (voor de vrijheidstijd-conversie).',
    when: 'De gebruiker opent het budgetdetail en leest de donut (%-besteed, resterend) en de vrijheidstijd-omrekening van het resterende bedrag.',
    then: '%-besteed (gekapt op 100) = 340/400×100 = 85%; resterend = €60. Vrijheidstijd van €1.000 op dagbasis `dailyExpenseRate(3000)` = €98,63/dag → 0 jaar, 0 maanden, 10 dagen (totalDays 10,1).',
    assertion: {
      kind: 'exact',
      expected: 'pctBesteed=85; resterend=60; freedomYears=0; freedomMonths=0; freedomDays=10; freedomTotalDays=10.1',
      source: 'lib/format.ts#dailyExpenseRate(3000) + calculateFreedomTime(1000, dailyExpenseRate(3000)); pctBesteed/resterend = directe donut-formule op synthetisch besteed/limiet',
    },
  },
  {
    workflow: 'WF-BUDGET-10',
    scenarioId: 'UAT-BUDGET-10',
    titel: 'Budget bewerken via het bewerk-paneel (ingangsmaand)',
    kriticiteit: 'KERN',
    persona: 'lisa',
    given: 'Budget "b1" met een `budget_amounts`-tijdlijn: €100 sinds 2026-01-01, €150 sinds 2026-06-01 (ingangsmaand-wijziging).',
    when: 'De gebruiker bekijkt de effectieve limiet in maart 2026 (vóór de wijziging) en in juli 2026 (ná de ingangsmaand).',
    then: 'Maart 2026: effectieve limiet = de meest recente rij ≤ maart = €100 (oude limiet). Juli 2026: effectieve limiet = de meest recente rij ≤ juli = €150 (nieuwe limiet, geldig vanaf de ingangsmaand).',
    assertion: {
      kind: 'exact',
      expected: 'oudeLimiet=100; nieuweLimiet=150',
      source: 'lib/budget-plan-diff.ts#resolveActiveAmount(\'b1\', datum, amounts) — meest-recente-rij-≤-datum-selectie, gedeeld met de planeditor',
    },
  },
  {
    workflow: 'WF-BUDGET-11',
    scenarioId: 'UAT-BUDGET-11',
    titel: 'Budget archiveren/verwijderen vanuit het detailpaneel',
    kriticiteit: 'KERN',
    persona: 'lisa',
    given: 'Persona Lisa geladen; budget met gekoppelde transacties.',
    when: 'De gebruiker klikt "Verwijderen" en bevestigt de dialoog "Budget archiveren?".',
    then: '⚠ BUG-KANDIDAAT (zie budget-checks.ts-commentaar en de zonekaart): de dialoogtekst belooft dat budgetten met gekoppelde transacties niet kunnen worden gearchiveerd, maar `DELETE /api/budgets/[id]` voert altijd een harde delete uit (budget + subbudgetten weg, transacties ontkoppeld naar budget_id=NULL) — geen blokkade, geen `is_archived`-pad. LIVE VERIFIËREN wélk gedrag daadwerkelijk optreedt en als bug vastleggen.',
    assertion: {
      kind: 'ui-only',
      source: 'tekst-vs-gedrag-conflict, geen cijfermatige uitkomst — bevestigen via de live Chrome DevTools-run, niet via de engine-suite',
    },
  },
  {
    workflow: 'WF-BUDGET-12',
    scenarioId: 'UAT-BUDGET-12',
    titel: 'Budgetvolgorde aanpassen',
    kriticiteit: 'OVERIG',
    persona: 'lisa',
    given: 'Persona Lisa geladen, budgetlijst met `sort_order`.',
    when: 'De gebruiker sleept twee budgetten om van volgorde.',
    then: 'De `sort_order`-waarden wisselen; geen cijfermatige uitkomst.',
    assertion: {
      kind: 'ui-only',
      source: 'sort_order-swap zonder rekenkundig effect',
    },
  },
  {
    workflow: 'WF-BUDGET-13',
    scenarioId: 'UAT-BUDGET-13',
    titel: 'Doorwerkingstoets: categorisering → budgetrealisatie',
    kriticiteit: 'KERN',
    persona: 'lisa',
    given: 'Persona Lisa geladen; ongecategoriseerde transactie(s) op de betaalrekening.',
    when: 'De gebruiker (of de AI-suggestie) categoriseert een transactie naar een budget.',
    then: 'Het aantal ongecategoriseerde transacties daalt met 1 en "besteed" op dat budget stijgt met het transactiebedrag — richting is toetsbaar, het exacte bedrag niet (AI-categorisatie en de transactiebedragen zelf zijn niet-deterministisch/gejitterd).',
    assertion: {
      kind: 'direction',
      source: 'buildSpendingSums (lib/budget-perspective.ts) herberekent na elke categorisatie-mutatie; richting van de teller/besteed-delta is toetsbaar, geen vast cijfer',
    },
  },
  {
    workflow: 'WF-BUDGET-14',
    scenarioId: 'UAT-BUDGET-14',
    titel: 'Overschot doorschuiven (rollover) bekijken en overschrijven',
    kriticiteit: 'KERN',
    persona: 'lisa',
    given: 'Budget met limiet €100, besteed €60, vorige carry €20 (effectieve limiet €120, resterend €60).',
    when: 'De gebruiker bekijkt de drie rollover-types (reset/carry-over/invest-sweep) en de vorige-periode-navigatie.',
    then: 'carry-over: carry €60, swept €0. invest-sweep: carry €0, swept €60. reset: carry €0, swept €0 (ongeacht resterend). Effectieve limiet in periode 2026-07 met een carry-rij van €60 = €160 (basis €100 + carry). Vorige periode van "2026-07" = "2026-06"; van "2026-01" = "2025-12" (jaargrens).',
    assertion: {
      kind: 'exact',
      expected: 'carryOverCarry=60; investSweepSwept=60; resetCarry=0; effectiveLimit=160; prevPeriod=2026-06; prevPeriodJan=2025-12',
      source: 'lib/budget-rollover.ts#computeRollover + getEffectiveLimit + getPreviousPeriod op synthetische invoer',
    },
  },
  {
    workflow: 'WF-BUDGET-15',
    scenarioId: 'UAT-BUDGET-15',
    titel: 'Voorspelling volgende maand raadplegen ("Hoe berekend?")',
    kriticiteit: 'BELANGRIJK',
    persona: 'lisa',
    given: 'Budget "Boodschappen" (limiet €400), 6 maanden uitgavenhistorie: €380, €400, €420, €410, €430, €440.',
    when: 'De gebruiker opent de voorspelling en de "Hoe berekend?"-toelichting.',
    then: 'Voorspelde uitgave (gewogen voortschrijdend gemiddelde, gewichten 1..6) = €422; betrouwbaarheid "hoog" (CV ≈ 4,8% < 15%) → 85%; 6 maanden gebruikt; overschrijdt de limiet van €400 met €22.',
    assertion: {
      kind: 'exact',
      expected: 'predicted=422; confidence=high; confidencePercent=85; monthsUsed=6; exceedsLimit=true; exceedAmount=22; stdDev=19.72; mean=413.33',
      source: 'lib/budget-forecast.ts#computeBudgetForecast([380,400,420,410,430,440], 400, \'Boodschappen\')',
    },
  },
  {
    workflow: 'WF-BUDGET-16',
    scenarioId: 'UAT-BUDGET-16',
    titel: 'Budgetbedragen van vorige maand kopiëren',
    kriticiteit: 'KERN',
    persona: 'lisa',
    given: 'Persona Lisa geladen, vorige maand heeft afwijkende limieten t.o.v. de huidige.',
    when: 'De gebruiker klikt "Kopieer vorige maand" in de planeditor.',
    then: 'Na de kopie zijn de limieten van de huidige maand gelijk aan die van de vorige maand — een A=B-consistentietoets, geen los cijfer (de vorige-maand-limieten zelf zijn testdata-afhankelijk).',
    assertion: {
      kind: 'consistency',
      source: 'planeditor kopieert `resolveActiveAmount`-waarden 1-op-1 naar de huidige ingangsmaand; toetsbaar als gelijkheid, niet als vast cijfer',
    },
  },
  {
    workflow: 'WF-BUDGET-17',
    scenarioId: 'UAT-BUDGET-17',
    titel: 'Transactie openen en bewerken vanuit het budgetdetail',
    kriticiteit: 'KERN',
    persona: 'lisa',
    given: 'Persona Lisa geladen; budgetdetail met een gekoppelde transactie.',
    when: 'De gebruiker klikt de transactie en bewerkt bedrag/omschrijving/categorie in het cash-formulier.',
    then: 'Pure formulier-workflow; het doorwerkings-effect op "besteed" wordt gedekt door WF-BUDGET-02/13.',
    assertion: {
      kind: 'ui-only',
      source: 'hergebruikt het cash-transactieformulier; geen eigen berekening',
    },
  },
  {
    workflow: 'WF-BUDGET-18',
    scenarioId: 'UAT-BUDGET-18',
    titel: 'Spaardoel koppelen aan een spaarbudget',
    kriticiteit: 'KERN',
    persona: 'lisa',
    given: 'Budget-native spaardoel: doelbedrag €6.000, al opgebouwd (carry) €2.000, einddatum exact 300 dagen na "nu" (10 maanden à 30 dagen).',
    when: 'De gebruiker bekijkt de voortgangsbalk en het "benodigd per maand".',
    then: 'Resterende maanden = 300/30 = 10; benodigd per maand = (6.000−2.000)/10 = €400; voortgang = 2.000/6.000×100 = 33,33%.',
    assertion: {
      kind: 'exact',
      expected: 'maandenResterend=10; benodigdPerMaand=400; spaarProgress=33.33',
      source: 'components/app/budgets-client.tsx r3327-3334 (inline, GEEN pure export) — getrouw gemirrord in budget-checks.ts met bronregel-verwijzing (geen eigen herimplementatie-aanname)',
    },
  },
  {
    workflow: 'WF-BUDGET-19',
    scenarioId: 'UAT-BUDGET-19',
    titel: 'Fin om budgetadvies vragen',
    kriticiteit: 'OVERIG',
    persona: 'lisa',
    given: 'Persona Lisa geladen op een budgetdetail met een overschrijding.',
    when: 'De gebruiker klikt "Vraag Fin om advies".',
    then: 'De chat opent met een voorgevuld bericht over dit budget; het AI-antwoord zelf is niet-deterministisch.',
    assertion: {
      kind: 'ui-only',
      source: 'chat-deeplink met voorgevulde context; geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-BUDGET-20',
    scenarioId: 'UAT-BUDGET-20',
    titel: 'Gedeeld budgetteren: huishoud-perspectief en partner-potjes',
    kriticiteit: 'KERN',
    persona: 'lisa',
    given: 'Gedeeld budget "b1": personal-transacties €50, shared-transacties €80 (eigen blik); apart budget "b2": alleen personal €30. Eigen aandeel (mySharePct) 60%. ⚠ LIVE vereist een ÉCHT tweede account — persona-seed alleen toont de reken-split.',
    when: 'De gebruiker schakelt tussen eigen blik, huishoud-blik en partner-blik.',
    then: 'Uitgaven-map: b1 personalSum=€50, sharedSum=€80; b2 personalSum=€30, sharedSum=€0. Aandeel-fractie voor gedeeld: eigen blik 0,6; partner-blik 0,4; huishoud-blik 1. Gecombineerd bedrag op b1: eigen blik 50+80×0,6=€98; partner-blik 50+80×0,4=€82; huishoud-blik 50+80×1=€130.',
    assertion: {
      kind: 'exact',
      expected: 'b1Personal=50; b1Shared=80; b2Personal=30; b2Shared=0; sharePersonal=0.6; sharePartner=0.4; shareHousehold=1; combinedPersonal=98; combinedPartner=82; combinedHousehold=130',
      source: 'lib/budget-perspective.ts#buildSpendingSums + shareFractionFor + combineSpending op synthetische transactierijen (mySharePct=60)',
    },
  },
  {
    workflow: 'WF-BUDGET-21',
    scenarioId: 'UAT-BUDGET-21',
    titel: 'Verborgen categorieën en "Eigen rekening" bekijken',
    kriticiteit: 'BELANGRIJK',
    persona: 'lisa',
    given: 'Persona Lisa geladen; interne overboekingen tussen eigen rekeningen geboekt op het Eigen-rekening-archief.',
    when: 'De gebruiker opent de verborgen-categorieën-sectie.',
    then: 'Het getoonde "verschoven bedrag" == de som van de Eigen-rekening-archiefpost deze maand — een A=B-toets (het bedrag zelf hangt af van welke transacties als eigen-rekening-transfer zijn herkend, niet hand-narekenbaar door de IBAN+naam-detectie).',
    assertion: {
      kind: 'consistency',
      source: 'lib/eigen-rekening-transfers.ts (IBAN+naam-detectie) voedt zowel de figures-strip-uitsluiting als de Eigen-rekening-archiefpost; consistentie tussen die twee, geen vast cijfer',
    },
  },
  {
    workflow: 'WF-BUDGET-22',
    scenarioId: 'UAT-BUDGET-22',
    titel: 'NIBUD-benchmark raadplegen',
    kriticiteit: 'BELANGRIJK',
    persona: 'lisa',
    given: 'Profieltypes gezin (2 kinderen, leeftijden 8 en 10), solo, samen zonder kinderen, gezin met tiener (14); NIBUD-referentie "Voeding" (basis €300, voorbeeld €350) op slug "boodschappen"; gebruiker geeft €500/mnd uit; dagbudget €100.',
    when: 'De gebruiker opent de NIBUD-benchmark-kaart.',
    then: 'Huishoudtype-mapping: gezin/2 kinderen (8,10) → "gezin_jong"; solo → "alleenstaand"; samen/0 kinderen → "paar"; gezin/1 kind (14) → "gezin_tiener". Delta t.o.v. voorbeeld-referentie = 500−350 = €150/mnd; vrijheidsdagen-potentieel = round(150×12/100) = 18 dagen.',
    assertion: {
      kind: 'exact',
      expected: 'householdTypeGezinJong=gezin_jong; householdTypeAlleenstaand=alleenstaand; householdTypePaar=paar; householdTypeGezinTiener=gezin_tiener; delta=150; freedomDaysPotential=18',
      source: 'lib/nibud/reference-data.ts#getNibudHouseholdType + calculateBenchmarks op een synthetische referentie/uitgaven-fixture',
    },
  },
  {
    workflow: 'WF-BUDGET-23',
    scenarioId: 'UAT-BUDGET-23',
    titel: 'Deeplinks en legacy-routes gebruiken',
    kriticiteit: 'BELANGRIJK',
    persona: 'lisa',
    given: 'Persona Lisa geladen.',
    when: 'De gebruiker bezoekt een legacy-route (bv. `/core/budgets`) of een `?maand=YYYY-MM`-deeplink.',
    then: 'De route redirect naar de canonieke locatie resp. de deeplink opent de juiste maand — navigatie zonder cijfermatige uitkomst.',
    assertion: {
      kind: 'ui-only',
      source: 'redirect-mapping (lib/nav-config.ts-achtig) + querystring-parsing; geen rekenkundig effect',
    },
  },
  {
    workflow: 'WF-BUDGET-24',
    scenarioId: 'UAT-BUDGET-24',
    titel: 'Maandelijks budgetrapport openen',
    kriticiteit: 'OVERIG',
    persona: 'lisa',
    given: 'Persona Lisa geladen op de budgetpagina.',
    when: 'De gebruiker klikt door naar het maandrapport (RAPP-domein).',
    then: 'Navigatie naar het rapport-domein; de cijfers daar zijn RAPP-scope, niet BUDGET.',
    assertion: {
      kind: 'ui-only',
      source: 'kruis-navigatie naar RAPP; geen eigen berekening binnen BUDGET',
    },
  },
]

export const BUDGET_ACCEPTANCE: AcceptanceSet = {
  zone: 'BUDGET',
  criteria,
}
