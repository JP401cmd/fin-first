/**
 * Acceptatiecriteria — domein Budgetteren (WF-BUDGET-01..25 / UAT-BUDGET-01..25).
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
 * WF-BUDGET-11 (GEFIXT, 2026-07-20): "Budget archiveren?" voert nu een echte, niet-destructieve
 * archivering uit — `DELETE /api/budgets/[id]` zet `is_archived = true` op het budget + zijn
 * subbudgetten i.p.v. een harde delete. Gekoppelde transacties, rollovers en budget_amounts
 * blijven behouden; de budget-SELECT filtert `is_archived = false`, dus het budget verdwijnt
 * vanzelf uit de actieve lijst. Zie `app/api/budgets/[id]/route.ts`.
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
    given: 'Persona Lisa geladen, lopende maand met transacties op meerdere budgetten. WEERGAVEMODUS: in **Eenvoudig** toont de KPI-strip alleen Inkomen + Uitgaven (APP-7-reductie, `alwaysFull`/`simpleFigures` op de overige cellen) en staat de weergave hard op de pil-modus; in **Volledig** blijft de volledige KPI-strip + de vrije keuze uit Boom/Ring/Heatmap/Pillen (WF-BUDGET-04) staan. De A=B-consistentie hieronder geldt op de cellen die ZICHTBAAR zijn — minder cellen in Eenvoudig verandert niets aan de gelijkheid tussen wat wél getoond wordt.',
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
    given: '"Nu" vastgezet op 15 juli 2026; gebruiker op de budgetpagina. WEERGAVEMODUS (BUD-1): de periode-toggle (Maand/YTD/12 mnd) is alleen zichtbaar in **Volledig** — `BudgetPeriodToggle` rendert `null` in **Eenvoudig**, waar de periode hard op "Maand" staat (`effectivePeriodMode`) en de afkorting "YTD" dus niet in beeld komt (APP-5, jargonregel). Dit criterium (YTD/12-maanden kiezen) is dus alleen uitvoerbaar in Volledig; `computeBudgetPeriod` zelf is in beide modi identiek — Eenvoudig roept hem alleen nooit met een andere waarde dan "maand" aan.',
    when: 'De gebruiker navigeert naar maart 2026 (maand-modus), en schakelt daarna naar YTD en 12-maanden — beide alleen bereikbaar in Volledig.',
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
    given: 'Persona Lisa geladen (Inkomen €5.200; Vaste lasten €1.455, Dagelijkse uitgaven €900, Vervoer €265, Leuke dingen €300, Sparen&schulden €600, Schulden&aflossingen €50 — statische hoofdbudget-limieten). WEERGAVEMODUS (BUD-3): de dekkingsgraad/alerts hieronder zijn de VOLLEDIGE hub-inhoud, ongewijzigd achter de disclosure-klik in beide modi. Alleen de INGEKLAPTE preview-regel bovenaan verschilt: in **Volledig** toont die tot 3 fragmenten (bv. "1 overschreden — 1 bijna vol — € 2.540 te verdelen"), in **Eenvoudig** wordt dat teruggeknepen tot 2 fragmenten (`HUB_PREVIEW_MAX_SIMPLE`) op één niet-afbrekende regel. Geen cijfermatig verschil, puur hoeveel van dezelfde snippets zichtbaar zijn vóór het uitklappen.',
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
    when: 'De gebruiker klikt "Archiveren" en bevestigt de dialoog "Budget archiveren?".',
    then: 'Het budget + zijn subbudgetten krijgen `is_archived = true` (niet-destructieve soft-delete); `DELETE /api/budgets/[id]` zet de vlag i.p.v. te verwijderen. Gekoppelde transacties (`budget_id` ongewijzigd), rollovers en budget_amounts blijven behouden; het budget verdwijnt uit de actieve lijst omdat de SELECT op `is_archived = false` filtert. Reeds gearchiveerd → 409. Dialoogtekst belooft geen (valse) transactie-blokkade meer.',
    assertion: {
      kind: 'ui-only',
      source: 'app/api/budgets/[id]/route.ts (DELETE → UPDATE is_archived=true) + components/app/budgets-client.tsx archiveer-dialoog; niet-destructief, live te bevestigen via Chrome DevTools-run',
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
    given: 'Persona Lisa geladen, vorige maand heeft afwijkende limieten t.o.v. de huidige. WEERGAVEMODUS (BUD-2): de knoppen "Kopieer vorige maand" én "Rapport" (in dezelfde actiebalk, `BudgetReportActions`) zijn beheer-diepte en staan alleen in **Volledig**; in **Eenvoudig** zijn ze hard verborgen (`HideInSimple`) — de route /rapportages/budget blijft rechtstreeks bereikbaar, alleen de knop niet. Dit criterium (klikken op "Kopieer vorige maand") is dus alleen uitvoerbaar in Volledig.',
    when: 'De gebruiker klikt "Kopieer vorige maand" in de planeditor (Volledig).',
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
      source: 'components/app/budgets-client.tsx r3397-3403 (inline, GEEN pure export; regelnummer bijgewerkt na de "Eenvoudige weergave" fase-2-toevoegingen, formule ongewijzigd) — getrouw gemirrord in budget-checks.ts met bronregel-verwijzing (geen eigen herimplementatie-aanname)',
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
    when: 'De gebruiker opent de verborgen-categorieën-sectie, en beheert via het tandwiel op de Eigen rekening-sectie welke tegenrekeningen eigen rekeningen zijn (rekening kiezen → tegenpartijen aanvinken → opslaan zet de historie om).',
    then: 'Het getoonde "verschoven bedrag" == de som van de Eigen-rekening-archiefpost deze maand — een A=B-toets (het bedrag zelf hangt af van welke transacties als eigen-rekening-transfer zijn herkend, niet hand-narekenbaar door de IBAN+naam-detectie). Na het aanvinken van een tegenpartij verschuift dat bedrag mee met het aantal omgezette transacties dat de sheet terugmeldt.',
    assertion: {
      kind: 'consistency',
      source: 'lib/own-accounts.ts#buildOwnAccountIdentifiers + lib/parsers/categorize.ts#isOwnAccountTransfer (IBAN+naam-detectie) voedt zowel de figures-strip-uitsluiting als de Eigen-rekening-archiefpost; dezelfde twee functies bepalen de aangevinkt-stand in components/app/own-accounts-sheet.tsx en de omzetting in lib/own-accounts-reclassify.ts. Consistentie tussen die paden, geen vast cijfer',
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
  {
    workflow: 'WF-BUDGET-25',
    scenarioId: 'UAT-BUDGET-25',
    titel: 'Nieuw budget aanmaken vanuit de sleepmodus (in-veld-kaart via de +-knop)',
    kriticiteit: 'BELANGRIJK',
    given: 'In de sleepmodus (bereikbaar vanuit de Budget Hub, /core/cash en de import-flow) staat tussen de pills "Eigen rekening" en "Overslaan" een +-knop (aria-label "Nieuw budget toevoegen"); een transactie wacht in de ring.',
    when: 'Klikken op de knop of de transactie erop slepen opent de in-veld-kaart (role="dialog", aria-label "Nieuw budget": naam, hoofd-/deelbudget + parent-select bij deelbudget, bedrag per maand). "Aanmaken en toewijzen" bouwt de diff met `buildCreateBudgetDiff` en POST\'t die naar `/api/budgets/plan`.',
    then: 'Slepen op de knop wijst niets toe — de bol veert terug, de wachtrij blijft intact, alleen de kaart opent. Een lege (getrimde) naam, een ontbrekende parent bij een deelbudget, of een bedrag ≤ 0 wordt geweigerd — `buildCreateBudgetDiff` gooit voor elk van deze drie een fout, wat de client-validatie in de kaart spiegelt; `budgetType: \'archive\'` wordt eveneens geweigerd (een nieuw budget kan geen Eigen-rekening-archief zijn). Bij geldige invoer levert de diff één insert op met `budget_type=\'expense\'` (nieuwe hoofdbudgetten uit deze kaart vragen geen type) en `is_essential=false`; na de succesvolle POST wordt het budget lokaal toegevoegd met `ownership=\'personal\'` (de kaart biedt geen gezamenlijk-optie) en de wachtende transactie er direct aan toegewezen. Annuleren of Escape sluit alléén de kaart — sleepmodus en wachtrij blijven ongewijzigd. Mislukt de aanmaak (API-fout), dan blijft de kaart open met de ingevulde waarden en de foutmelding uit de API. Bij 9+ hoofdbudgetten kan het nieuwe budget achter de "Meer"-bol belanden; de toewijzing van de wachtende transactie slaagt dan nog steeds, programmatisch — aanvaard gedrag, geen bug.',
    assertion: {
      kind: 'exact',
      expected: 'leegNaamGooit=true; nulBedragGooit=true; archiveTypeGooit=true; validInsertBudgetType=expense; validIsEssential=false',
      source: 'lib/budget-plan-diff.ts#buildCreateBudgetDiff — echte productiefunctie, geen mirror (aangeroepen door components/app/sleepmodus/sleepmodus-overlay.tsx#handleCreateBudget); de client-validatie in components/app/sleepmodus/nieuw-budget-kaart.tsx#handleSubmit spiegelt dezelfde drie regels vóór de fetch',
    },
  },
  {
    workflow: 'WF-BUDGET-26',
    scenarioId: 'UAT-BUDGET-26',
    titel: 'Je budgetten als grondslag voor inkomen en uitgaven: welke posten meetellen, realisatie vóór plan (ADR 0103)',
    kriticiteit: 'KERN',
    given:
      'De pure motor `computeBudgetBasis` (lib/budget-basis.ts) op een synthetische budgetboom — géén persona-transacties, dus volledig narekenbaar. Uitgavenkant: "Wonen" (hoofdbudget ZONDER kinderen, €1.000/mnd), "Boodschappen" (hoofdbudget MÉT kinderen, eigen limiet €9.999/mnd) met de kinderen "Supermarkt" (€400/mnd) en "Markt" (€1.200/jaar), plus een gearchiveerd budget (€500/mnd) en een `budget_type=\'savings\'`-pot (€300/mnd). Inkomstenkant: "Salaris" (€3.000/mnd). De aanvinklijst en de uitsluitingen leven op `profiles.cashflow_basis_prefs`.',
    when:
      '`computeBudgetBasis(budgets, \'expense\' | \'income\', excludedIds, { realized })` bepaalt de selecteerbare posten en hun jaarbedrag — eerst zonder realisatie-venster (alles op plan), daarna met een venster dat eindigt op 2026-08 waarin "Supermarkt" €2.400 uitgaven over 12 maanden draagt en een in maart 2026 aangemaakt budget €600 over 6 maanden.',
    then:
      'SELECTIENIVEAU — de lijst staat op het niveau waar het BEDRAG ONTSTAAT: hoofdbudgetten zonder kinderen plus de kinderen van hoofdbudgetten die kinderen hebben. "Boodschappen" is dus zelf géén post (zijn €9.999 is een kop boven zijn kinderen en zou dubbel tellen), "Wonen"/"Supermarkt"/"Markt" wél → 3 posten. DRAGENDE INVARIANT: de uitgavengrondslag bestaat uitsluitend uit `budget_type=\'expense\'` — de savings-pot valt er per constructie buiten, en precies dáárop steunt de spaarquote-regel in WF-CASH-60 (op de budgetgrondslag mag de spaarbudget-/aflossingscorrectie NIET worden toegepast, want het geld is er nooit afgehaald). Gearchiveerde/weggemergde rijen tellen nergens mee. KIND-OPROL met het EIGEN interval van het kind (terugval: dat van de ouder) — dus 1.000×12 + 400×12 + 1.200×1 = €18.000/jaar, €1.500/mnd; dit spiegelt `computeYearlyMustExpenses` en NADRUKKELIJK niet `deriveBudgetTotals`, dat kinderlimieten rauw optelt en met het parent-interval normaliseert (een maandkind onder een jaarouder telt daar 12× te laag). Sluit de gebruiker "Markt" uit, dan zakt het totaal met exact €1.200 naar €16.800 terwijl de post ZICHTBAAR blijft staan (`excluded: true`) — uitsluiten is geen verbergen. Inkomstenkant: €36.000/jaar. REALISATIE VÓÓR PLAN (correctie 11 aug 2026): heeft een post boekingen in het rollende 12-maandsvenster, dan telt de GEMETEN som en draagt de post `source: \'realized\'`; heeft hij er geen, dan valt hij terug op zijn geplande limiet (`source: \'planned\'`), zodat een net aangemaakt budget bruikbaar blijft. Plan en meting worden nooit gemengd binnen één post, en welke van de twee geldt is zichtbaar. DE DELER IS DE LEEFTIJD VAN HET BUDGET, niet de spanwijdte van zijn boekingen: clamp(max(maanden sinds `created_at`, spanwijdte), 1, 12) — een 6 maanden oud budget met €600 realisatie extrapoleert naar €1.200/jaar, een budget ouder dan het venster deelt door 12 en dus telt €2.400 gewoon als €2.400. Ankeren op de spanwijdte zou een jaarlijkse gemeentebelasting die deze maand is afgeschreven als €9.600 doortellen, maandelijks golvend.',
    assertion: {
      kind: 'exact',
      expected:
        'postenExpense=3; jaartotaalPlan=18000; maandtotaalPlan=1500; jaartotaalNaUitsluiting=16800; postenBlijvenZichtbaar=3; jaartotaalIncome=36000; oudBudgetRealisatie=2400/realized; jongBudgetGeextrapoleerd=1200/realized; zonderBoekingenPlan=12000/planned',
      source:
        'lib/budget-basis.ts#computeBudgetBasis (+ de gedeelde `annualAmount`/`buildBudgetTypeMap` uit lib/budget-utils.ts en `BASIS_BUDGET_TYPE`/`resolveDenominatorMonths`) — echte productiefuncties, geen mirror; de huishoud-deelfractie komt via `opts.shareFractionById` binnen en woont bewust buiten deze pure module (lib/household/budget-share.ts) — zie budget-checks.ts',
    },
  },
  {
    workflow: 'WF-BUDGET-27',
    scenarioId: 'UAT-BUDGET-27',
    titel: 'Een mislukte her-fetch verbergt de al geladen budgetpagina niet meer (degraded rendering, bevinding C7)',
    kriticiteit: 'BELANGRIJK',
    persona: 'lisa',
    given:
      'Persona Lisa geladen; de budgetpagina hydrateert altijd server-side met `initialData`, maar `loadBudgets()` draait daarna alsnog client-side zodra een dependency wijzigt (bv. `PerspectiveProvider` die ná mount van "personal" naar de opgeslagen huishoud-/partnervoorkeur wisselt). VOORHEEN zette elke falende her-fetch onvoorwaardelijk `error`, en een onvoorwaardelijke `if (error) return <foutscherm/>` verving de complete, al correcte pagina (NIBUD-kaart, doelen, rollovers incluis) door één rode foutbox.',
    when:
      'De her-fetch faalt (a) vóórdat er ooit goede data stond (bv. de eerste client-side load zelf mislukt) en (b) nádat de pagina al één keer succesvol content toonde.',
    then:
      '(a) Zonder ooit succesvolle data blijft het gedrag ongewijzigd: het blokkerende foutscherm ("Kon budgetten niet laden. Probeer het opnieuw.") vervangt de pagina — er is dan ook niets om te bewaren. (b) Zodra `hasGoodBudgetData` ooit waar werd (elke succesvolle `loadBudgets()`, óók een geldige lege set), overschrijft een latere fout de render NIET meer: hij landt in een niet-blokkerende `refreshError`-balk boven de behouden cijfers ("Kon de budgetten niet verversen — je ziet de laatst geladen cijfers.") met een eigen "Opnieuw proberen"-knop die `loading` bewust niet op true zet (anders verdwijnt de data alsnog achter een skeleton). De render-grens berekent dit met `blockingError = hasGoodBudgetData ? null : error` / `degradedError = hasGoodBudgetData ? (refreshError ?? error) : refreshError` — zodat ook een toekomstig codepad dat per ongeluk nog `error` zet, degradeert i.p.v. blokkeert.',
    assertion: {
      kind: 'ui-only',
      source:
        'components/app/budgets-client.tsx (hasGoodBudgetData-ref, refreshError-state, blockingError/degradedError op de render-grens, loadBudgets-catch-tak) — resilience-gedrag, geen cijfermatige uitkomst',
    },
  },
]

export const BUDGET_ACCEPTANCE: AcceptanceSet = {
  zone: 'BUDGET',
  criteria,
}
