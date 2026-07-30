/**
 * Acceptatiecriteria — domein Cashflow, transacties & bankimport (WF-CASH-01..32 /
 * UAT-CASH-01..32).
 *
 * Spiegelt exact de aanpak van `budget.ts`/`start.ts`/`will.ts`. Bron:
 * `docs/uat/uat-plan.md` Deel 1 (workflow-definities WF-CASH-01..31, met
 * WF-CASH-31 als latere dekkingscontrole-toevoeging) + Deel 2 §2.8
 * (UAT-CASH-01..31, testpersonen Daan Bakker — solo, 2 ING-rekeningen — en
 * Lisa de Groot voor huishoud-/gedeeld-eigendom-varianten). WF-CASH-32 is een
 * NÓG latere dekkingscontrole-toevoeging (feature #881, "Vraag Fin"-wizard).
 *
 * CASH is de grootste zone tot nu toe (32 scenario's) en combineert drie
 * toetsbaarheidsprofielen (zie ook de zone-specifieke notitie op de
 * Notion-kaart):
 *  (1) Persona-jitter: Daans 15-maands transactiehistorie wordt geseed met
 *      `Math.random()`-jitter (±15–30%) — maandtotalen/spaarquote/vaste-lasten-
 *      SOM zijn dus NIET hand-narekenbaar; die criteria zijn 'consistency'
 *      (A=B tussen twee oppervlakken, of vóór/na-DELTA exact) i.p.v. 'exact'.
 *  (2) Zelf-samengestelde testbestanden (bankimport MT940/OFX/CSV) EN pure
 *      rekenmotoren (statusdrempels, periodevensters, forecast, tegenpartij-
 *      analyse, recurring-totalen, split-validatie, eigen-rekening-detectie,
 *      sleepmodus-toewijzing, AI-groepsvolgorde) zijn WEL volledig 'exact'
 *      narekenbaar — 21 van de 32 criteria, de kern van deze acceptatieset.
 *  (3) AI-wizard-interactie (bulk-kaart/groepkeuzes/stoppen/resolver-fout,
 *      WF-CASH-19 en WF-CASH-32) en generieke/gebonden randgevallen (TrueLayer-
 *      sandbox, status-banner-verwijsregel naar UAT-OVZ-12, inflatie-slider
 *      verwezen naar UAT-REKEN-21) zijn 'ui-only'.
 *
 * TWEE MIRRORS met bronregel-verwijzing (client-inline formules zonder eigen
 * pure export — spiegelt de mirrors in `start-checks.ts`/`will-checks.ts`):
 *  - aandeel-% per rekening (components/app/cash-overview.tsx)
 *  - split-som-validatie (components/app/transaction-form.tsx)
 *  - sibling-matching op genormaliseerde tegenpartijnaam (lib/parsers/categorize.ts-conventie)
 *
 * WF-CASH-25 (AI-tegenpartijgroepen-volgorde) importeert sinds feature #881
 * de ÉCHTE `orderGroupsLargestFirst`/`buildCombinedGroups` (lib/auto-categorize.ts,
 * gedeeld door de motor en de "Vraag Fin"-wizard) — geen mirror meer van de
 * vervallen import-pagina-confidence-drempels 0,8/0,5.
 *
 * TWEE ECHTE MAAR NIET-INJECTEERBARE FUNCTIES (`getNextOccurrence`/
 * `getUpcomingTransactions` in lib/recurring-data.ts gebruiken intern
 * `new Date()`, geen `now`-parameter): voor WF-CASH-21 wordt daarom de
 * dag-van-de-maand-arithmetiek MET INJECTEERBARE `now` gemirrord (zelfde
 * eerstvolgende-datum-logica, bronregel-verwijzing) — `getExpectedMonthlyTotal`
 * (WF-CASH-31) is wél puur or datum-onafhankelijk en wordt rechtstreeks
 * geïmporteerd.
 */

import type { AcceptanceCriterion, AcceptanceSet } from './types'

const criteria: AcceptanceCriterion[] = [
  {
    workflow: 'WF-CASH-01',
    scenarioId: 'UAT-CASH-01',
    titel: 'Cashflow-onderdelen verkennen via de vier hefboom-kaarten',
    kriticiteit: 'KERN',
    given: 'Synthetische kaartinvoer: Transacties-kaart met inkomen/uitgaven-paren op de statusgrenzen; Vaste-lasten-kaart met aandeel-ratio\'s op de statusgrenzen; Forecast-kaart met netto/mnd op de statusgrenzen.',
    when: 'De statusfuncties worden aangeroepen op elk grensgeval.',
    then: 'Transacties: spaarquote ≥20% → good, ≥0% → warn, <0% → bad. Vaste lasten: aandeel <50% → good, ≤70% → warn, >70% → bad. Forecast: netto/mnd >0 → good, <0 → bad, =0 → warn.',
    assertion: {
      kind: 'exact',
      expected: 'transGood=good; transWarn=warn; transBad=bad; vlGood=good; vlWarn=warn; vlBad=bad; fcGood=good; fcBad=bad; fcWarn=warn',
      source: 'lib/cashflow-cards.ts#transactiesCardStatus/vasteLastenCardStatus/forecastCardStatus — zie cash-checks.ts',
    },
  },
  {
    workflow: 'WF-CASH-02',
    scenarioId: 'UAT-CASH-02',
    titel: 'Maand-geldstroom bekijken en door maanden bladeren',
    kriticiteit: 'KERN',
    given: 'Een transactie op 30 juni 2026 23:00 lokale tijd en één op 1 juli 2026 00:30 lokale tijd.',
    when: 'De maandgrenzen voor juni en juli 2026 worden berekend met `localMonthBounds`.',
    then: 'De 30-juni-transactie valt binnen het juni-venster ([2026-06-01, 2026-07-01)); de 1-juli-transactie valt binnen het juli-venster ([2026-07-01, 2026-08-01)) — géén dag-shift door UTC-conversie.',
    assertion: {
      kind: 'exact',
      expected: 'juniStart=2026-06-01; juniEnd=2026-07-01; juliStart=2026-07-01; juliEnd=2026-08-01',
      source: 'lib/month-range.ts#localMonthBounds — echte productiefunctie, geen mirror (de al-gedocumenteerde "NOOIT toISOString"-conventie)',
    },
  },
  {
    workflow: 'WF-CASH-03',
    scenarioId: 'UAT-CASH-03',
    titel: 'Kassabon: inkomsten of uitgaven van de maand uitsplitsen',
    kriticiteit: 'BELANGRIJK',
    given: 'Persona Daan Bakker, maand juni 2026; de figures-strip-totalen Inkomen/Uitgaven leunen op gejitterde seed-transacties.',
    when: 'De gebruiker opent de inkomsten- en uitgaven-kassabon.',
    then: 'De som van de per-rekening-regels (inkomsten) resp. per-budget-regels (uitgaven, incl. "Ongecategoriseerd" voor budget=NULL) is exact gelijk aan het strip-totaal — een A=B-consistentietoets, geen vast cijfer (de onderliggende bedragen zijn jitter-afhankelijk).',
    assertion: {
      kind: 'consistency',
      source: 'components/app/cash-overview.tsx (incomeByAccount/expensesByBudget/totalIncome/totalExpenses) — som-regels moet gelijk zijn aan het strip-totaal',
    },
  },
  {
    workflow: 'WF-CASH-04',
    scenarioId: 'UAT-CASH-04',
    titel: 'Rekeningen bekijken en een rekeningdetail openen',
    kriticiteit: 'KERN',
    given: 'Twee synthetische rekeningen: Betaalrekening €850, Spaarrekening €2.000 (totaal €2.850).',
    when: 'Het aandeel-% per rekening wordt berekend.',
    then: 'Betaalrekening = 850/2.850×100 ≈ 29,82%; Spaarrekening = 2.000/2.850×100 ≈ 70,18%; beide percentages tellen (afgerond) op tot 100%.',
    assertion: {
      kind: 'exact',
      expected: 'betaalPct=29.82; spaarPct=70.18',
      source: 'components/app/cash-overview.tsx (accountPillItems/totalBalance-aandeelformule, gemirrord) — zie cash-checks.ts',
    },
  },
  {
    workflow: 'WF-CASH-05',
    scenarioId: 'UAT-CASH-05',
    titel: 'Cashflow-instellingen aanpassen (inkomen, spaarquote, uitgaven)',
    kriticiteit: 'KERN',
    given: 'Triple {inkomen €3.600, uitgaven €2.808, spaarquote wordt niet gebruikt}, laatst-bewerkt="expenses".',
    when: 'De gebruiker zet de spaarquote handmatig op 25% (edited="savingsRate").',
    then: 'Geschatte uitgaven herrekent naar inkomen × (1 − 0,25) = 3.600 × 0,75 = €2.700; inkomen blijft ongewijzigd op €3.600.',
    assertion: {
      kind: 'exact',
      expected: 'nieuweUitgaven=2700; inkomenOngewijzigd=3600',
      source: 'lib/cashflow-overrides.ts#recomputeTriple — echte productiefunctie, geen mirror',
    },
  },
  {
    workflow: 'WF-CASH-06',
    scenarioId: 'UAT-CASH-06',
    titel: 'Inflatie-impact verkennen en het inzicht wegklikken/terughalen',
    kriticiteit: 'OVERIG',
    given: 'Kaart "Inflatie & koopkracht" (alleen bij ≥€500/mnd baseline-uitgaven), inflatie-aanname 1–5%.',
    when: 'De gebruiker verandert de slider en minimaliseert/herstelt de kaart via de inzicht-toggle.',
    then: 'De tegels herrekenen live; de kaart is minimaliseerbaar/herstelbaar (localStorage, per apparaat). De onderliggende samengestelde-groeiformule (`projectCompound`) wordt VOLLEDIG narekenbaar getoetst in UAT-REKEN-21 — hier alleen een oogtoets (30-jaars-tegel > 10-jaars-tegel bij positieve inflatie).',
    assertion: {
      kind: 'ui-only',
      source: 'components/overview/inflation-impact-card.tsx + lib/hooks/use-insight-visibility.ts — rekenkern gedekt door UAT-REKEN-21, hier geen dubbele exacte toets',
    },
  },
  {
    workflow: 'WF-CASH-07',
    scenarioId: 'UAT-CASH-07',
    titel: 'Status-melding minimaliseren en heropenen via het statuspunt',
    kriticiteit: 'OVERIG',
    given: 'De PageStatusBanner/-dot-mechaniek is generiek over alle /overzicht-routes.',
    when: 'De gebruiker minimaliseert/heropent de status-banner op een cashflow-route.',
    then: 'Verwijsregel: dit generieke patroon wordt grondig getoetst door UAT-OVZ-12 (steekproef-oppervlak) — hier geen aparte uitwerking om duplicatie te voorkomen.',
    assertion: {
      kind: 'ui-only',
      source: 'app/(app)/overzicht/layout.tsx (PageStatusProvider) — verwijsregel naar UAT-OVZ-12, geen eigen cijfermatige uitkomst hier',
    },
  },
  {
    workflow: 'WF-CASH-08',
    scenarioId: 'UAT-CASH-08',
    titel: 'Analyse-periode kiezen en door de historie bladeren',
    kriticiteit: 'BELANGRIJK',
    given: '"Nu" vastgezet op 15 juli 2026; periode-modus "maand", offset 0 en offset −1.',
    when: 'De gebruiker kiest de maand-tab en bladert één maand terug.',
    then: 'Offset 0 (juli): since=2026-07-01, until=2026-07-31, label="juli 2026", vorige periode 2026-06-01..2026-06-30. Offset −1 (juni): since=2026-06-01, until=2026-06-30, label="juni 2026" — even lang als het huidige venster.',
    assertion: {
      kind: 'exact',
      expected: 'juliSince=2026-07-01; juliUntil=2026-07-31; juliLabel=juli 2026; juniSince=2026-06-01; juniUntil=2026-06-30',
      source: 'lib/transaction-insights.ts#resolvePeriodWindow — echte productiefunctie, geen mirror',
    },
  },
  {
    workflow: 'WF-CASH-09',
    scenarioId: 'UAT-CASH-09',
    titel: 'Geldstroom-inzichten bekijken en inzoomen op een dag of weekdag',
    kriticiteit: 'BELANGRIJK',
    given: '"Nu" vastgezet op 15 juli 2026; synthetische transacties: inkomen €3.000, uitgaven €1.800, netto €1.200 (transfers uitgesloten).',
    when: 'De geldstroom-gauge en het heatmap-venster worden berekend.',
    then: 'Spaarquote = (1.200/3.000)×100 = 40%. Heatmap-venster bestrijkt exact 12 volledige kalendermaanden t/m de laatste dag van de vórige maand: start=2025-07-01, end=2026-06-30 — de huidige (lopende) maand juli verschijnt NIET.',
    assertion: {
      kind: 'exact',
      expected: 'spaarquote=40; heatmapStart=2025-07-01; heatmapEnd=2026-06-30',
      source: 'lib/transaction-insights.ts#summarizeFlow + resolveHeatmapWindow — echte productiefuncties, geen mirror',
    },
  },
  {
    workflow: 'WF-CASH-10',
    scenarioId: 'UAT-CASH-10',
    titel: 'Transacties zoeken en filteren in de verrijkte tijdlijn',
    kriticiteit: 'BELANGRIJK',
    given: 'Synthetisch venster van 10 dagen met €1.000 totale uitgaven (transfers uitgesloten); dagtransactie van €50.',
    when: 'Het vrijheidsdagen-label voor die dagtransactie wordt berekend.',
    then: 'Gemiddelde daguitgave = 1.000/10 = €100/dag; vrijheidsdagen = 50/100 = 0,5 dag (`calculateFreedomTime.totalDays`, al afgerond op 1 decimaal).',
    assertion: {
      kind: 'exact',
      expected: 'avgDailyExpense=100; freedomDays=0.5',
      source: 'lib/transaction-display.ts#avgDailyExpense + freedomDays — echte productiefuncties, geen mirror',
    },
  },
  {
    workflow: 'WF-CASH-11',
    scenarioId: 'UAT-CASH-11',
    titel: 'Handmatig een transactie toevoegen (eventueel terugkerend)',
    kriticiteit: 'KERN',
    given: 'Genoteerd maandtotaal Uitgaven vóór toevoeging (jitter-afhankelijke basis); nieuwe transactie Uitgave €42,50.',
    when: 'De gebruiker slaat de transactie op.',
    then: 'Het nieuwe maandtotaal Uitgaven = genoteerd begintotaal + €42,50 exact — een vóór/na-DELTA-toets (de absolute basis is jitter-afhankelijk, de DELTA niet).',
    assertion: {
      kind: 'consistency',
      source: 'components/app/transaction-form.tsx (handleSubmit) — nieuwTotaal − oudTotaal moet exact +42,50 zijn',
    },
  },
  {
    workflow: 'WF-CASH-12',
    scenarioId: 'UAT-CASH-12',
    titel: 'Transactie bewerken en hercategoriseren met reikwijdte-keuze',
    kriticiteit: 'KERN',
    given: 'Persona Daan Bakker, meerdere "Uber Eats"-transacties over meerdere maanden.',
    when: 'De gebruiker wijzigt het budget en kiest reikwijdte "Alle transacties van deze tegenpartij".',
    then: 'Alle transacties van die tegenpartij (over alle maanden) krijgen het nieuwe budget + `category_source=\'rule\'`; een correctieregel wordt opgeslagen in `category_corrections`. Het exacte aantal bijgewerkte transacties hangt af van de seedhistorie (niet hand-narekenbaar), het GEDRAG (bulk-match op tegenpartijnaam) is wel deterministisch.',
    assertion: {
      kind: 'ui-only',
      source: 'components/app/transaction-form.tsx (handleSaveWithScope) — bulk-DB-update, geen pure functie zonder Supabase',
    },
  },
  {
    workflow: 'WF-CASH-13',
    scenarioId: 'UAT-CASH-13',
    titel: 'Transactie verdelen over meerdere budgetten (splitsen)',
    kriticiteit: 'KERN',
    given: 'Transactie €95,00; split-regels [€70,00, restant] resp. [€70,00, €25,00, €10,00] (3 regels, som €105,00).',
    when: 'De validatie op de splitregels draait.',
    then: 'Bij 2 regels vult de 2e automatisch het restant (95 − 70 = €25) en de som klopt exact. Bij 3 regels (70+25+10=105 ≠ 95) faalt de validatie met de som-mismatch-fout (beide bedragen genoemd); binnen €0,01-marge is de mismatch-detectie het omslagpunt.',
    assertion: {
      kind: 'exact',
      expected: 'restant2Regels=25; somKlopt2Regels=true; som3Regels=105; somKlopt3Regels=false',
      source: 'components/app/transaction-form.tsx (splitRows-validatie, gemirrord: som binnen €0,01 van totaal, auto-restant bij 2 regels) — zie cash-checks.ts',
    },
  },
  {
    workflow: 'WF-CASH-14',
    scenarioId: 'UAT-CASH-14',
    titel: 'Transactie verwijderen',
    kriticiteit: 'KERN',
    given: 'Genoteerd maandtotaal Uitgaven vóór verwijdering (jitter-afhankelijke basis); testtransactie €42,50.',
    when: 'De gebruiker verwijdert de testtransactie (twee-staps bevestiging).',
    then: 'Het nieuwe maandtotaal Uitgaven = genoteerd totaal − €42,50 exact — vóór/na-DELTA-toets.',
    assertion: {
      kind: 'consistency',
      source: 'components/app/transaction-form.tsx (handleDelete) — oudTotaal − nieuwTotaal moet exact 42,50 zijn',
    },
  },
  {
    workflow: 'WF-CASH-15',
    scenarioId: 'UAT-CASH-15',
    titel: 'Tegenpartij analyseren (historie per winkel/leverancier)',
    kriticiteit: 'BELANGRIJK',
    given: 'Synthetische Albert Heijn-transacties: 3× uitgave (−€40, −€55, −€35) over 3 maanden.',
    when: '`computeCounterpartyStats` draait over deze rijen.',
    then: 'totalSpent = −130 (uitgaven blijven negatief in de som); transactionCount = 3; averageAmount = −130/3 ≈ −43,33.',
    assertion: {
      kind: 'exact',
      expected: 'totalSpent=-130; transactionCount=3; averageAmount=-43.33',
      source: 'lib/counterparty-analysis.ts#computeCounterpartyStats — echte productiefunctie, geen mirror',
    },
  },
  {
    workflow: 'WF-CASH-16',
    scenarioId: 'UAT-CASH-16',
    titel: 'Vaste lasten bekijken: totaal, aandeel van inkomen en vrijheidstijd',
    kriticiteit: 'KERN',
    given: 'Synthetische recurrings: monthly €100, weekly €25, quarterly €90, yearly €1.200; maandinkomen €3.400, maanduitgaven €2.200.',
    when: 'Elke recurring wordt naar een maandbedrag omgerekend en opgeteld; het aandeel en de vrijheidstijd worden berekend.',
    then: 'Maandequivalenten: monthly=100, weekly=25×52/12≈108,33, quarterly=90/3=30, yearly=1.200/12=100 → totaal ≈338,33/mnd. Aandeel = 338,33/3.400×100 ≈9,95% (< 50% → groen). Vrijheidsdagen/mnd = `calculateFreedomTime(338.33, dailyExpenseRate(2200)).totalDays` ≈ 4,7 dagen (al afgerond op 1 decimaal door de canonieke engine).',
    assertion: {
      kind: 'exact',
      expected: 'totaalMaand=338.33; aandeelPct=9.95; vrijheidsdagen=4.7',
      source: 'lib/cashflow-forecast-math.ts#recurringPerMonth (het toMonthly-equivalent, echte productiefunctie) + lib/format.ts#dailyExpenseRate — zie cash-checks.ts',
    },
  },
  {
    workflow: 'WF-CASH-17',
    scenarioId: 'UAT-CASH-17',
    titel: 'Terugkerend item classificeren of bevestigen',
    kriticiteit: 'KERN',
    given: 'Een auto-gedetecteerd item "Basic-Fit" €44,90/mnd.',
    when: 'De gebruiker kiest "Abonnement", "Vaste kosten" of "Niet opnemen".',
    then: 'Bevestigen maakt een `recurring_transactions`-rij (amount=−44,90, frequency=\'monthly\'); "Niet opnemen" verwijdert het item uit alle vaste-lasten-cijfers; zonder gekoppelde `accountId` doet opslaan zichtbaar niets (bekend randgeval).',
    assertion: {
      kind: 'ui-only',
      source: 'components/app/recurring-classify-sheet.tsx (handleSave) — DB-insert/update workflow, geen pure functie',
    },
  },
  {
    workflow: 'WF-CASH-18',
    scenarioId: 'UAT-CASH-18',
    titel: 'Abonnement opzeggen via een opzegbrief',
    kriticiteit: 'KERN',
    given: 'Bevestigd abonnement "Netflix" €15,99/mnd.',
    when: 'De gebruiker maakt en bewaart een opzegbrief.',
    then: 'De aangemaakte actie krijgt `euro_impact_monthly` = −15,99 exact (het maandbedrag van het abonnement, geen afronding).',
    assertion: {
      kind: 'exact',
      expected: 'euroImpactMonthly=-15.99',
      source: 'components/app/opzeg-modal.tsx#handleSaveToDraft (euro_impact_monthly = −maandbedrag, gemirrord) — zie cash-checks.ts',
    },
  },
  {
    workflow: 'WF-CASH-19',
    scenarioId: 'UAT-CASH-19',
    titel: 'Vaste kosten laten analyseren door Fin (AI)',
    kriticiteit: 'BELANGRIJK',
    given: 'AI-add-on actief resp. uit/kill-switch aan.',
    when: 'De gebruiker klikt "Laat Fin analyseren".',
    then: 'Mét AI: voorstellen per rij met classificatie + reden; opslaan toont een toast met het aantal en ververst de vaste-lasten-cijfers. Zonder AI: melding "AI is niet geconfigureerd…" (422), handmatige weg blijft beschikbaar.',
    assertion: {
      kind: 'ui-only',
      source: 'components/app/ai-vaste-kosten-sheet.tsx (POST /api/subscriptions/analyse-ai) — AI-output, niet deterministisch toetsbaar',
    },
  },
  {
    workflow: 'WF-CASH-20',
    scenarioId: 'UAT-CASH-20',
    titel: '"Wat als ik opzeg"-schuif: besparing omrekenen naar vrijheid',
    kriticiteit: 'OVERIG',
    given: 'Slider op €44,90 (Basic-Fit); maanduitgaven €2.200.',
    when: '`cancelEffect` berekent het jaarbedrag en de vrijheidstijd.',
    then: 'Jaarbedrag = 44,90×12 = €538,80 exact; vrijheidsdagen = `calculateFreedomTime(538.80, dailyExpenseRate(2200)).totalDays` ≈ 7,4 dagen (al afgerond op 1 decimaal).',
    assertion: {
      kind: 'exact',
      expected: 'jaarbedrag=538.8; vrijheidsdagen=7.4',
      source: 'lib/vaste-lasten-insights.ts#cancelEffect — echte productiefunctie, geen mirror',
    },
  },
  {
    workflow: 'WF-CASH-21',
    scenarioId: 'UAT-CASH-21',
    titel: 'Cashflow-kalender: komende 5 weken vooruitkijken',
    kriticiteit: 'BELANGRIJK',
    given: '"Nu" vastgezet op 5 juli 2026; een monthly recurring met `day_of_month=7`.',
    when: 'De eerstvolgende voorkomst wordt bepaald.',
    then: 'Aangezien 5 juli vóór dag 7 valt, is de eerstvolgende datum 7 juli 2026 (dezelfde maand, niet de volgende).',
    assertion: {
      kind: 'exact',
      expected: 'eerstvolgendeDatum=2026-07-07',
      source: 'lib/recurring-data.ts#getNextOccurrence-logica (dag-van-de-maand-arithmetiek, gemirrord met injecteerbare `now` omdat de productiefunctie intern `new Date()` gebruikt) — zie cash-checks.ts',
    },
  },
  {
    workflow: 'WF-CASH-22',
    scenarioId: 'UAT-CASH-22',
    titel: 'Zes maanden vooruitkijken met de cashflow-forecast',
    kriticiteit: 'KERN',
    given: 'Baseline-inkomen €3.000/mnd, baseline-uitgaven €2.200/mnd, geen recurrings, startsaldo €2.850, "fromDate" = 1 juli 2026.',
    when: '`buildForecast` bouwt de 6 maandregels.',
    then: 'Elke van de 6 maanden heeft netto = 3.000 − 2.200 = €800; saldo loopt cumulatief op: €3.650, €4.450, €5.250, €6.050, €6.850, €7.650 (laatste = "Saldo na 6m").',
    assertion: {
      kind: 'exact',
      expected: 'netto=800; saldoNa6m=7650',
      source: 'lib/cashflow-forecast-math.ts#buildForecast — echte productiefunctie, geen mirror',
    },
  },
  {
    workflow: 'WF-CASH-23',
    scenarioId: 'UAT-CASH-23',
    titel: 'Bankbestand importeren (MT940/OFX): van upload tot geslaagde import',
    kriticiteit: 'KERN',
    given: 'Het letterlijke MT940-testbestand uit het UAT-plan (3 transacties: −€45, +€2.500, −€850) en de equivalente OFX-variant.',
    when: 'Beide bestanden worden geparsed.',
    then: 'Beide leveren exact 3 transacties op met Totaal bij = €2.500,00 en Totaal af = €895,00 (45+850) — identiek resultaat ongeacht bestandsformaat.',
    assertion: {
      kind: 'exact',
      expected: 'mt940Count=3; mt940Bij=2500; mt940Af=895; ofxCount=3; ofxBij=2500; ofxAf=895',
      source: 'lib/parsers/mt940.ts#parseMT940 + lib/parsers/ofx.ts#parseOFX — echte productiefuncties, geen mirror',
    },
  },
  {
    workflow: 'WF-CASH-24',
    scenarioId: 'UAT-CASH-24',
    titel: 'CSV importeren met bank-preset en kolom-toewijzing',
    kriticiteit: 'KERN',
    given: 'Het letterlijke ING-CSV-testbestand uit het UAT-plan (4 rijen: −€45, +€2.500, −€850, +€25) met het "ing"-preset uit `CSV_PRESETS`.',
    when: '`parseCSV` parsed het bestand met het ING-preset.',
    then: 'Totaal bij = 2.500+25 = €2.525,00; Totaal af = 45+850 = €895,00; netto effect = +€1.630,00 exact.',
    assertion: {
      kind: 'exact',
      expected: 'csvCount=4; csvBij=2525; csvAf=895; netto=1630',
      source: 'lib/parsers/csv.ts#parseCSV + lib/parsers/index.ts#CSV_PRESETS (ing) — echte productiefuncties, geen mirror',
    },
  },
  {
    workflow: 'WF-CASH-25',
    scenarioId: 'UAT-CASH-25',
    titel: '"Vraag Fin"-wizard: AI-tegenpartijgroepen grootste-eerst met recentste-datum-tiebreak',
    kriticiteit: 'KERN',
    given: 'Drie onbekende-tegenpartijgroepen na stage-1 (regels/overboekingen/spiegelpaar): "Albert Heijn" (3 leden, meest recente datum 2026-06-20), "Bol.com" (3 leden, meest recente datum 2026-06-25), "Uniek Winkeltje" (1 lid, 2026-06-10).',
    when: 'De wizard (component/app/categorize-wizard.tsx) berekent de presentatievolgorde met dezelfde `buildCombinedGroups` + `orderGroupsLargestFirst` die de AI-motor zelf gebruikt (`groupOrder: \'largest-first\'`) — geen eigen sortering.',
    then: 'Groepen met gelijk ledental (Albert Heijn/Bol.com, elk 3) worden getoond op recentste-datum-tiebreak: Bol.com (2026-06-25) vóór Albert Heijn (2026-06-20); de kleinere groep "Uniek Winkeltje" (1 lid) komt als laatste — één AI-groepkaart tegelijk, grootste/meest-actuele eerst.',
    assertion: {
      kind: 'exact',
      expected: 'volgorde=Bol.com,Albert Heijn,Uniek Winkeltje',
      source: 'lib/auto-categorize.ts#orderGroupsLargestFirst — echte productiefunctie, gedeeld door runCombinedCategorization (motor) én CategorizeWizard (presentatie, feature #881) — zie cash-checks.ts',
    },
  },
  {
    workflow: 'WF-CASH-26',
    scenarioId: 'UAT-CASH-26',
    titel: 'Handmatig categoriseren bij import: bulk-toepassen en regels onthouden',
    kriticiteit: 'KERN',
    given: 'Vier synthetische import-regels: 3× tegenpartij "Koffiehuis De Kade", 1× tegenpartij "Uniek Winkeltje".',
    when: 'De sibling-matching (zelfde genormaliseerde tegenpartijnaam) draait voor elke rij.',
    then: 'Voor een "Koffiehuis De Kade"-rij zijn er 2 soortgenoten (de bulk-vraag toont "2"); voor "Uniek Winkeltje" zijn er 0 soortgenoten (geen bulk-vraag, budget wordt stil toegepast op alleen die rij).',
    assertion: {
      kind: 'exact',
      expected: 'siblingsKoffiehuis=2; siblingsUniek=0',
      source: 'lib/parsers/categorize.ts-conventie (sibling-matching op genormaliseerde tegenpartijnaam, gemirrord) — zie cash-checks.ts',
    },
  },
  {
    workflow: 'WF-CASH-27',
    scenarioId: 'UAT-CASH-27',
    titel: 'Eigen-overboekingen herkennen en markeren bij import',
    kriticiteit: 'KERN',
    given: 'Eigen-IBAN-set {NL11INGB0001234568}; een rij met tegenpartij-IBAN NL11INGB0001234568 en een rij met een onbekende IBAN.',
    when: '`isOwnAccountTransfer` evalueert beide rijen.',
    then: 'De rij naar de eigen spaarrekening wordt herkend als eigen overboeking (true); de rij naar de onbekende IBAN niet (false).',
    assertion: {
      kind: 'exact',
      expected: 'eigenRekeningHerkend=true; onbekendNietHerkend=false',
      source: 'lib/parsers/categorize.ts#isOwnAccountTransfer — echte productiefunctie, geen mirror',
    },
  },
  {
    workflow: 'WF-CASH-28',
    scenarioId: 'UAT-CASH-28',
    titel: 'Sleepmodus: import-regels categoriseren met drag-and-drop',
    kriticiteit: 'BELANGRIJK',
    given: 'Twee synthetische import-rijen; een sleep-toewijzing naar budget "Boodschappen" voor rij 1 (isTransfer=false).',
    when: '`applyAssignmentToImportRows` past de toewijzing toe.',
    then: 'Rij 1 krijgt `budget_id`/`budgetName` van de toewijzing, `confidence=1.0`, `category_source=\'manual\'`; rij 2 (niet in de keys-set) blijft ongewijzigd.',
    assertion: {
      kind: 'exact',
      expected: 'rij1BudgetId=budget-boodschappen; rij1Confidence=1; rij1Source=manual; rij2Ongewijzigd=true',
      source: 'lib/sleepmodus/import-assign.ts#applyAssignmentToImportRows — echte productiefunctie, geen mirror',
    },
  },
  {
    workflow: 'WF-CASH-29',
    scenarioId: 'UAT-CASH-29',
    titel: 'Import-foutherstel: netwerkfout, mislukte batches en sessie-herstel',
    kriticiteit: 'KERN',
    given: 'Een import van meerdere batches (batchgrootte 100); een netwerkonderbreking halverwege of een pagina-ververs vóór voltooiing.',
    when: 'De gebruiker klikt "Opnieuw proberen" resp. hervat na een refresh.',
    then: 'Import hervat vanaf de laatst voltooide batch; dedupe (hash+volgnummer) voorkomt her-import van al geslaagde rijen; een sessie ouder dan 24 uur vervalt automatisch; na 2 mislukte pogingen per batch verschijnt "Max pogingen bereikt".',
    assertion: {
      kind: 'ui-only',
      source: 'app/(app)/core/cash/import/page.tsx (saveImportSession/loadImportSession, retryFailedBatches) — sessie-/netwerktoestand, geen pure functie zonder Supabase',
    },
  },
  {
    workflow: 'WF-CASH-30',
    scenarioId: 'UAT-CASH-30',
    titel: 'Bank koppelen via open banking: doelrekening kiezen en de eerste synchronisatie draaien',
    kriticiteit: 'KERN',
    given: 'TrueLayer-koppeling; wizardstap 2 heet sinds specs/bank-connect-doelrekening/plan.md fase 4 "Rekening & bevestigen" (de stap-**ids** `select`/`confirm`/`redirect` zijn ongewijzigd — R3). `GET /api/bank-connect/accounts` levert per **eigen** rekening (nooit huishoud-gedeelde partnerrekeningen) naam, banknaam, gemaskeerde IBAN, transactieaantal, oudste/nieuwste transactiedatum, `budget_tracking`, een eventuele bestaande koppeling (`linked_provider_name`, informatief) en `fetch_plan` (`planInitialFetch`). Er is ten minste één bestaande rekening zonder `budget_tracking` beschikbaar om te kiezen.',
    when: 'De gebruiker kiest een bank, doorloopt stap 2 van de wizard — kiest een bestaande rekening óf de gelijkwaardige optie "Nieuwe rekening aanmaken" — en klikt daarna "Verbind met <bank>".',
    then: 'Zolang er iets te kiezen valt staat er GÉÉN voorselectie en blijft de knop uitgeschakeld met de hint "Kies eerst waar de data terechtkomt" tot een keuze is gemaakt. Kiest de gebruiker een bestaande rekening ZONDER budget-tracking, dan verschijnt één VOORGEVINKTE, uitzetbare optie "Neem deze rekening mee in mijn budgetten" (B2); een bestaande rekening MET tracking krijgt geen vraag; een nieuwe rekening krijgt budgetteren altijd aan. Een rekening met een reeds bestaande koppeling is in deze fase gewoon kiesbaar (informatief getoond) — de blokkade op een dubbele actieve koppeling is fase 6 en géén tekortkoming hier. `POST /api/bank-connect/auth-link` accepteert optioneel `target_bank_account_id` + `enable_budget_tracking`, valideert eigenaarschap en schrijft de keuze op de pending `bank_connections`-rij (`target_bank_account_id`, `link_intent = \'nieuw\'`); een andermans/onbekende/ongeschikte `target_bank_account_id` levert 400 zonder pending-rij. Een body zónder keuze blijft geldig. Vanaf hier BLOCKED voor de daadwerkelijke doorverwijzing/callback/sync-resultaat (X nieuw/Y dup) — vereist een echte of sandbox TrueLayer-koppeling, expliciet buiten bereik van deze UAT-ronde. Bekende, geaccepteerde bevinding: de koppel-banner elders noemt "GoCardless", de connect-pagina "TrueLayer" (copy-inconsistentie, geen nieuwe bug).',
    assertion: {
      kind: 'ui-only',
      source: 'app/(app)/core/cash/connect/page.tsx (stap 2 "Rekening & bevestigen") + components/app/bank-connect/target-account-choice.tsx + app/api/bank-connect/accounts/route.ts (GET, kandidatenlijst) + app/api/bank-connect/auth-link/route.ts (POST, eigenaarschapscheck + pending-rij) — vereist sandbox-koppeling voor het vervolg, niet pure-testbaar; zie ook de GoCardless/TrueLayer-copy-bevinding',
    },
  },
  {
    workflow: 'WF-CASH-31',
    scenarioId: 'UAT-CASH-31',
    titel: 'Terugkerende transactieregels beheren, stopzetten en verwijderen',
    kriticiteit: 'KERN',
    given: 'Eén actieve monthly-regel van −€975 (huurverhoging na bewerken); dezelfde regel met `is_active=false`; twee actieve regels −€975 en −€150.',
    when: '`getExpectedMonthlyTotal` sommeert de actieve regels.',
    then: 'Met 1 actieve regel van −€975: totaal = −€975,00. Met die regel gedeactiveerd: totaal = €0,00. Met 2 actieve regels (−975 en −150): totaal = −€1.125,00. Een verlopen-maar-actieve regel (end_date in het verleden, is_active=true) telt WEL nog mee (bekende bevinding: `getExpectedMonthlyTotal` checkt alleen `is_active`, niet de einddatum).',
    assertion: {
      kind: 'exact',
      expected: 'totaalEenRegel=-975; totaalGedeactiveerd=0; totaalTweeRegels=-1125',
      source: 'lib/recurring-data.ts#getExpectedMonthlyTotal — echte productiefunctie, geen mirror',
    },
  },
  {
    workflow: 'WF-CASH-32',
    scenarioId: 'UAT-CASH-32',
    titel: '"Vraag Fin"-wizard: stage-1 bulk-kaart, groepskeuzes en verliesvrij stoppen (feature #881, latere dekkingscontrole-toevoeging)',
    kriticiteit: 'BELANGRIJK',
    given: 'Stage-1-rijen (bron rule/transfer/mirror) landen in één bulk-kaart ("Fin herkende X transacties via je regels en overboekingen"); daarna toont de wizard de onbekende tegenpartijen één AI-groepkaart tegelijk met vier keuzes: "Akkoord & verder", "Andere categorie" (+ optioneel regel maken), "Alleen deze ene" (alleen bij >1 lid) en "Zelf indelen" (sleepmodus), plus "Stoppen en tot hier bewaren". Eén groep krijgt een resolver-fout (AI-call faalt).',
    when: 'De gebruiker klikt achtereenvolgens "Akkoord, allemaal" op de bulk-kaart, "Alleen deze ene" op een groep van 3, en tot slot "Stoppen en tot hier bewaren" vóórdat alle groepen zijn afgehandeld.',
    then: '"Alleen deze ene" verwerkt alleen het representant-lid; de overige 2 leden van diezelfde tegenpartij keren terug als een kleinere groepkaart (pendingGroups wordt herberekend uit de nog-onbeoordeelde rijen — nooit uit de oorspronkelijke groep). "Stoppen" bewaart uitsluitend de al-geaccepteerde rijen; de rest blijft onbeoordeeld en het afsluitscherm meldt hoeveel er nog openstaan. De groep met een resolver-fout blokkeert de wizard niet: die kaart valt terug op "Fin wist het niet zeker — kies zelf een categorie" (handmatige groep-fallback), de overige groepkaarten blijven bruikbaar. De afrondtekst ("N transacties gecategoriseerd") toont sinds deze release ook het aantal nog-openstaande rijen ("· M nog open voor Fin of handmatig") wanneer aangeboden minus opgeslagen > 0 — puur weergave van rows.length − savedCount, geen nieuwe berekening.',
    assertion: {
      kind: 'ui-only',
      source: 'components/app/categorize-wizard.tsx (CategorizeWizard/AiGroupCard — pendingGroups-herberekening, stop-/foutafhandeling) + components/app/ai-categorize-sheet.tsx (accept/stop-handlers) — interactie-/foutafhandelingstoestand, geen pure functie zonder React-state',
    },
  },
  {
    workflow: 'WF-CASH-33',
    scenarioId: 'UAT-CASH-33',
    titel: 'Bankkoppeling verbreken: zachte ontkoppeling, rekening en transacties blijven bestaan',
    kriticiteit: 'KERN',
    given: 'Een actief gekoppelde rekening met transactiehistorie.',
    when: 'De gebruiker klikt "Verbreken" op de rekening.',
    then: '`POST /api/bank-connect/disconnect` zet uitsluitend `bank_connection_accounts.is_active = false` op de aangeroepen `connection_account_id` — `bank_accounts`, de gekoppelde `assets`-rij en alle al geïmporteerde transacties blijven onaangetast. Het bijbehorende `bank_connections`-token blijft intact (alleen de account-koppeling wordt inactief), dus een andere nog-actieve rekening op dezelfde bank blijft bruikbaar. TrueLayer zelf krijgt geen revoke-signaal — bekend, apart vervolgpunt.',
    assertion: {
      kind: 'ui-only',
      source: 'app/api/bank-connect/disconnect/route.ts (regel 25-30: single-field update, geen delete op bank_accounts/assets/transactions) — DB-mutatie, geen pure functie',
    },
  },
  {
    workflow: 'WF-CASH-34',
    scenarioId: 'UAT-CASH-34',
    titel: 'Budget-toewijzingen blijven staan bij hergebruik van een rekening met CSV-historie',
    kriticiteit: 'KERN',
    given: 'Een bestaande transactie met een handmatig gezette `budget_id`/`category_source` op een rekening die daarna aan de bank wordt gekoppeld.',
    when: 'De sync haalt dezelfde boeking op (herkend via `import_hash`).',
    then: 'De dedup-check in de sync-route filtert alléén welke rijen worden GEÏNSERTEERD (`parsed.filter(p => !existingHashSet.has(p.import_hash))`) — er wordt nergens een `.update()` of `.delete()` op `transactions` uitgevoerd. De bestaande rij (met `budget_id`/`category_source`) blijft dus ongewijzigd; de nieuwe (bank-)variant wordt simpelweg niet ingevoegd. `category_corrections` zijn gebruiker-gescoped, niet rekening-gescoped — een correctieregel blijft dus ook na een reconnect op een andere rekening gelden.',
    assertion: {
      kind: 'ui-only',
      source: 'app/api/bank-connect/sync/route.ts (regel 177-231: filter vóór insert, geen enkel update/delete-pad op transactions) — DB-mutatie, geen pure functie',
    },
  },
  {
    workflow: 'WF-CASH-35',
    scenarioId: 'UAT-CASH-35',
    titel: 'Sync met dagelijkse rate-limit bereikt (10 verzoeken per rekening per dag)',
    kriticiteit: 'BELANGRIJK',
    given: 'Rekening met `daily_requests=10` en `rate_limit_reset_date=vandaag`; en apart een rekening met `daily_requests=9`.',
    when: 'De gebruiker synchroniseert nogmaals.',
    then: 'Bij 10 verzoeken vandaag: `429` met exact "Daglimiet bereikt (10 verzoeken per dag per account)", plus een `rate_limited`-rij in `bank_sync_log`. Bij 9 verzoeken vandaag: de sync gaat door (elfde verzoek toegestaan). Breekt de kalenderdag om (`rate_limit_reset_date !== today`), dan reset de teller naar 0 ongeacht de vorige stand.',
    assertion: {
      kind: 'exact',
      expected: 'geblokkeerdBij10=true; toegestaanBij9=true; resetBijNieuweDag=0',
      source: 'app/api/bank-connect/sync/route.ts regel 55-76 (dailyRequests>=10-drempel + dagreset, gemirrord) — zie cash-checks.ts',
    },
  },
  {
    workflow: 'WF-CASH-36',
    scenarioId: 'UAT-CASH-36',
    titel: 'Synchroniseren in een periode waarin de bank niets teruggeeft',
    kriticiteit: 'BELANGRIJK',
    given: 'Een rekening waarvoor `getAccountTransactions` een lege lijst teruggeeft.',
    when: 'De gebruiker klikt "Synchroniseer nu".',
    then: '`insertedCount = 0`, `duplicateCount = 0` en `sync_cursor` blijft exact gelijk aan de vorige waarde (er is geen transactie om een nieuwere datum uit te halen). Het saldo synchroniseert onafhankelijk hiervan gewoon door (SC-24-pad) — "niets nieuws aan transacties" zegt niets over het saldo.',
    assertion: {
      kind: 'exact',
      expected: 'insertedCount=0; duplicateCount=0; cursorOngewijzigd=true',
      source: 'app/api/bank-connect/sync/route.ts regel 177-178 (filter op lege parsed-array) + regel 260-266 (latestDate-lus over tlTransactions, gemirrord) — zie cash-checks.ts',
    },
  },
  {
    workflow: 'WF-CASH-37',
    scenarioId: 'UAT-CASH-37',
    titel: 'Herautorisatie na 90 dagen: hergebruik via external_account_id, geen tweede rekening',
    kriticiteit: 'KERN',
    given: 'Een verlopen koppeling (`bank_connections.status = expired` na een mislukte token-refresh); dezelfde bank wordt opnieuw geautoriseerd.',
    when: 'De callback verwerkt de herautorisatie.',
    then: 'Stap 1 van de callback zoekt eerst op `external_account_id` (bewust zonder `is_active`-filter) vóórdat de IBAN-fallback of de aanmaak-tak aan de beurt komt — de bestaande `bank_account_id` wordt hergebruikt, er ontstaat geen tweede rekening of cash-asset. Er wordt geen nieuwe doelrekening-keuze gevraagd: die is bij een reconnect al bekend via de identiteitsketen.',
    assertion: {
      kind: 'ui-only',
      source: 'app/api/bank-connect/callback/route.ts regel 92-107 (stap 1: external_account_id-lookup, precedeert IBAN-fallback en aanmaak) — DB-mutatie/precedentieketen, geen pure functie',
    },
  },
  {
    workflow: 'WF-CASH-38',
    scenarioId: 'UAT-CASH-38',
    titel: 'Tegenpartij uit meta.counter_party_* lezen wanneer merchant_name ontbreekt (Rabobank/xs2a)',
    kriticiteit: 'KERN',
    given: 'Een TrueLayer-transactie zonder `merchant_name` (leeg/whitespace) maar met `meta.counter_party_preferred_name` en `meta.counter_party_iban` gevuld — het xs2a-patroon van Rabobank.',
    when: '`mapTransaction` zet de TrueLayer-rij om naar een `ParsedTransaction`.',
    then: '`counterparty_name` valt terug op `meta.counter_party_preferred_name` en `counterparty_iban` op `meta.counter_party_iban`; is `merchant_name` wél gevuld, dan wint die (het gestandaardiseerde veld gaat voor de meta-fallback). De dedup-sleutel (`import_hash`) blijft in beide gevallen uitsluitend datum+bedrag+omschrijving — de tegenpartij verrijkt de rij maar verschuift de hash niet.',
    assertion: {
      kind: 'exact',
      expected: 'metaFallbackNaam=Jumbo Supermarkten; metaFallbackIban=NL91ABNA0417164300; merchantNameWintBoven=Albert Heijn',
      source: 'lib/truelayer/mapper.ts#mapTransaction — echte productiefunctie, geen mirror',
    },
  },
  {
    workflow: 'WF-CASH-39',
    scenarioId: 'UAT-CASH-39',
    titel: 'Saldo wordt ook bij de eerste koppeling opgehaald (niet pas bij de eerste "Synchroniseer")',
    kriticiteit: 'BELANGRIJK',
    given: 'Een verse koppeling; vóór vandaag bleef `bank_accounts.balance` op 0 tot de gebruiker zelf synchroniseerde — op het onboarding-pad bestaat die knop niet eens.',
    when: 'De callback verwerkt de nieuw gekoppelde rekening(en).',
    then: 'Stap 5 van de callback roept `syncAccountBalance` direct aan voor élke verwerkte rekening, niet-fataal (een falende call laat de koppeling zelf slagen; het saldo volgt dan bij de eerstvolgende sync). Dit telt bewust niet mee in de dagelijkse rate-limit-teller van de sync-route — dat quotum hoort bij de sync-route, niet bij de callback.',
    assertion: {
      kind: 'ui-only',
      source: 'app/api/bank-connect/callback/route.ts regel 282-314 (stap 5: syncAccountBalance per rekening, niet-fataal) — DB-mutatie + externe call, geen pure functie',
    },
  },
  {
    workflow: 'WF-CASH-40',
    scenarioId: 'UAT-CASH-40',
    titel: 'Duplicaatcontrole is rekening-gescoped: dezelfde boeking op twee rekeningen blijft twee keer bestaan',
    kriticiteit: 'KERN',
    given: 'Twee identieke boekingen (zelfde datum/bedrag/omschrijving, dus zelfde `import_hash`) op twee verschillende TriFinity-rekeningen; en twee identieke boekingen op dezelfde rekening.',
    when: 'De dedup-vergelijking draait (unieke index + de gepagineerde leesronde, beide op `(user_id, account_id, import_hash, ...)`).',
    then: 'De twee boekingen op verschillende rekeningen worden allebei als "nieuw" gezien en blijven allebei bestaan (géén cross-account dedup — dat zou een echt andere boeking stil laten verdwijnen). Binnen dezelfde rekening wordt de tweede wél als duplicaat herkend en overgeslagen.',
    assertion: {
      kind: 'exact',
      expected: 'verschillendeRekeningBeideNieuw=true; zelfdeRekeningTweedeIsDuplicaat=true',
      source: 'lib/truelayer/existing-hashes.ts#loadExistingImportHashes (accountId verplicht in de scope, gemirrord met de query-voorwaarde) — zie cash-checks.ts',
    },
  },
  {
    workflow: 'WF-CASH-41',
    scenarioId: 'UAT-CASH-41',
    titel: '"Budgetteren uitschakelen" verwijdert nooit een rekening en nult nooit linked_asset_id',
    kriticiteit: 'KERN',
    given: 'Een gekoppelde cash-asset met `has_budget_tracking = true`.',
    when: 'De gebruiker schakelt budgetteren uit via de detail-sheet of het rekeningscherm.',
    then: '`POST /api/assets/toggle-budget` update uitsluitend `assets.has_budget_tracking`; de companion-sync (`syncBankAccountCompanion`) en de globale gate (`syncBudgetingActive`) lopen mee, maar geen van beide verwijdert de `bank_accounts`-rij of nult `linked_asset_id`. De bankkoppeling zelf (indien aanwezig) blijft dus intact — alleen de budget-zichtbaarheid verandert.',
    assertion: {
      kind: 'ui-only',
      source: 'app/api/assets/toggle-budget/route.ts regel 50-59 (single-field update op has_budget_tracking, geen delete/null-write op linked_asset_id) — DB-mutatie, geen pure functie',
    },
  },
  {
    workflow: 'WF-CASH-42',
    scenarioId: 'UAT-CASH-42',
    titel: 'Eerste ophaal (B8/B9): maximale historie in blokken op een lege rekening, D−3-startpunt op een rekening met historie',
    kriticiteit: 'KERN',
    given: 'Twee doelrekeningen: (1) leeg — géén `newestExistingDate` — en (2) met bestaande historie tot 2026-07-20; vandaag = 2026-07-29.',
    when: '`planInitialFetch` bepaalt het startpunt en de ophaalblokken voor beide rekeningen.',
    then: 'Lege rekening (B8): `mode=historical`, vier blokken van 6 maanden terug tot maximaal 24 maanden (`startDate=2024-07-29`), **nieuwste blok eerst** — samen aantoonbaar meer dan de TrueLayer-standaard van ~88 dagen. Rekening met historie tot 2026-07-20 (B9): `mode=incremental`, één venster vanaf `2026-07-17` (D−3, besluit 4), geen blok-lus. Grensgeval "historie van vandaag" (`newestExistingDate=2026-07-29`): venster `2026-07-26`–`2026-07-29`, nooit een blok in de toekomst.',
    assertion: {
      kind: 'exact',
      expected: 'legeRekeningMode=historical; legeRekeningBlokken=4; legeRekeningStartDate=2024-07-29; nieuwsteBlokEerst=true; historieRekeningMode=incremental; historieRekeningStart=2026-07-17; vandaagGrensStart=2026-07-26',
      source: 'lib/truelayer/initial-fetch.ts#planInitialFetch — echte productiefunctie, geen mirror',
    },
  },
  {
    workflow: 'WF-CASH-43',
    scenarioId: 'UAT-CASH-43',
    titel: 'Bank-eigen verzoeklimiet halverwege de eerste ophaal: afgekapt maar niet weggegooid',
    kriticiteit: 'BELANGRIJK',
    given: 'Een eerste ophaal op een lege rekening waarbij het derde blok van de bank een `429` met `provider_request_limit_exceeded` terugkrijgt.',
    when: 'De blok-lus in `sync/route.ts` verwerkt de provider-fout.',
    then: 'De lus stopt na blok 3, de transacties uit blok 1 en 2 staan al in de database en blijven staan (geen rollback), de route levert géén 500. `bank_sync_log.status = \'partial\'` met een toelichting die het aantal verzoeken en het bereikte startpunt noemt; `provider_requests` bevat het werkelijke aantal HTTP-verzoeken (3), niet 1. De success-pagina toont "Historie opgehaald vanaf …" plus een verwijsregel naar de bestandsimport voor oudere historie. De eerste ophaal telt, ongeacht het aantal blokken, als ÉÉN synchronisatie tegen de 10/dag-rem (bewuste eigenaarskeuze 29 juli 2026) — `daily_requests` gaat met exact 1 omhoog, niet met `providerRequests`.',
    assertion: {
      kind: 'ui-only',
      source: 'app/api/bank-connect/sync/route.ts regel 172-203 (blok-lus + isProviderLimitError-afvang) en regel 363-407 (partial-status, provider_requests, daily_requests+1) + app/(app)/core/cash/connect/success/page.tsx regel 171-192 (fetched_from/truncated-weergave) — DB-mutatie + HTTP-route, geen pure functie',
    },
  },
  {
    workflow: 'WF-CASH-44',
    scenarioId: 'UAT-CASH-44',
    titel: 'Doelrekening kiezen tijdens onboarding: nul kandidaten, "nieuwe rekening" ligt vast',
    kriticiteit: 'BELANGRIJK',
    given: 'De gebruiker koppelt zijn bank tijdens onboarding, vóórdat `profile.onboarding_completed = true` staat (SC-25). De onboarding-flow maakt tot dit punt cash-*bezittingen* aan maar géén `bank_accounts`-rijen — geverifieerd firsthand — dus `GET /api/bank-connect/accounts` levert hier nul kandidaten. Hetzelfde geldt als de kandidatenlijst niet geladen kon worden (netwerkfout).',
    when: 'De gebruiker doorloopt wizardstap 2 ("Rekening & bevestigen") tijdens de onboarding-koppeling.',
    then: 'Bij nul kandidaten wordt de rekeningenlijst WEGGELATEN — niet leeg getoond — en staat "Nieuwe rekening aanmaken" voorgeselecteerd, dus de knop "Verbind met <bank>" is direct bruikbaar zonder dat de gebruiker eerst een keuze uit een lege lijst moet maken. Kon de lijst niet geladen worden, dan geldt hetzelfde voorgeselecteerde gedrag, mét een zichtbare waarschuwing. Na een geslaagde callback stuurt de app terug naar `/onboarding?bank_connected=1`, niet naar de reguliere success-pagina (bestaand gedrag, buiten deze fase). Dit is verwacht gedrag, geen tekortkoming van fase 4 — de wizard loopt op onboarding niet dood.',
    assertion: {
      kind: 'ui-only',
      source: 'components/app/bank-connect/target-account-choice.tsx (nul kandidaten → lijst weggelaten, "nieuw" voorgeselecteerd) + app/api/bank-connect/accounts/route.ts (levert nul rijen op een verse gebruiker) — vereist een verse/onboarding-testaccount, niet pure-testbaar',
    },
  },
  {
    workflow: 'WF-CASH-45',
    scenarioId: 'UAT-CASH-45',
    titel: 'Callback-precedentieketen: identiteit wint altijd, de expliciete keuze bindt hooguit één rekening, N rekeningen blijven gekoppeld',
    kriticiteit: 'KERN',
    given: 'specs/bank-connect-doelrekening/plan.md fase 5. Eén TrueLayer-consent levert 3 rekeningen (N=3) terug. Rekening 1 was al eerder (via `external_account_id`) gekoppeld aan TriFinity-rekening Y. In de wizard koos de gebruiker rekening X als doelrekening (`target_bank_account_id`, `link_intent=\'nieuw\'`) — X is op het moment van de callback nog geschikt (`loadTargetAccount`). Rekening 2 en 3 zijn nieuw voor TriFinity.',
    when: 'De callback verwerkt alle 3 rekeningen in de volgorde die TrueLayer teruggeeft.',
    then: 'Rekening 1 landt op Y — identiteit (`external_account_id`) wint ALTIJD, óók van de expliciete keuze X. Dit is CORRECT gedrag en GEEN defect: een herautorisatie mag een bestaande koppeling niet verhangen; WF-CASH-47 (het correctiemoment) is de uitweg als de gebruiker toch X bedoelde. De EERSTE onbediende rekening (2) bindt de voorkeur X. Rekening 3 heeft geen identiteit- of voorkeurmatch en volgt de IBAN-fallback, of — zonder match — wordt een nieuwe rekening + cash-asset aangemaakt. Alle 3 rekeningen blijven gekoppeld (`bank_connection_accounts`); geen enkele valt stilzwijgend weg. Ná de lus gaat `target_bank_account_id` op `null` — óók wanneer de voorkeur nooit is toegepast (bv. omdat identiteit rekening 2 vóór was, of `link_intent=\'herautoriseren\'`) — zodat een volgende herautorisatie (90 dagen later) de voorkeur niet stilletjes herhaalt; `link_intent` blijft staan als feit over de koppelpoging. Bij `link_intent=\'herautoriseren\'` claimt identiteit sowieso, dus de voorkeur wordt daar helemaal niet in overweging genomen. Wordt dezelfde doelrekening achtereenvolgens aan twee verschillende providers gekoppeld (SC-14), dan ontstaat evenmin een tweede rekening of cash-asset.',
    assertion: {
      kind: 'ui-only',
      source: 'app/api/bank-connect/callback/route.ts (het precedentieketen-commentaarblok + schakel 1 t/m 3 + stap 5a consume-once) — DB-mutatie/precedentieketen over meerdere Supabase-rondes, geen pure functie zonder Supabase',
    },
  },
  {
    workflow: 'WF-CASH-46',
    scenarioId: 'UAT-CASH-46',
    titel: 'Rekeningtype van de bank overnemen: spaarrekening/creditcard krijgen niet langer het betaalrekening-label (B3)',
    kriticiteit: 'KERN',
    given: 'TrueLayer-accounttypes uit dezelfde consent: `TRANSACTION`, `SAVINGS`, `BUSINESS_TRANSACTION`, `BUSINESS_SAVINGS`, `CREDIT_CARD`, en een onbekend/leeg type.',
    when: '`mapAccountType` vertaalt elk providertype naar `bank_accounts.account_type` + `assets.subtype` + `assets.is_liquid`.',
    then: '`TRANSACTION` → checking/checking/liquide=true (het gedrag van vóór B3, nu expliciet). `SAVINGS` → savings/savings_account/liquide=true. `BUSINESS_TRANSACTION` en `BUSINESS_SAVINGS` → business/business/liquide=true (één slot voor "zakelijk", niet uit te drukken in checking/savings). `CREDIT_CARD` → other/other_cash/liquide=FALSE — de enige tak die het liquide vermogen niet mag opblazen. Een onbekend of leeg type valt terug op checking/checking/liquide=true zonder te crashen (de callback mag nooit stranden op een onbekend providertype).',
    assertion: {
      kind: 'exact',
      expected: 'transaction=checking,checking,true; savings=savings,savings_account,true; business=business,business,true; creditCard=other,other_cash,false; onbekend=checking,checking,true',
      source: 'lib/truelayer/mapper.ts#mapAccountType — echte productiefunctie, geen mirror',
    },
  },
  {
    workflow: 'WF-CASH-47',
    scenarioId: 'UAT-CASH-47',
    titel: 'Het correctiemoment: op de success-pagina de dragende rekening zien en verhangen vóór de eerste sync (SC-07)',
    kriticiteit: 'KERN',
    given: 'specs/bank-connect-doelrekening/plan.md fase 5, ADR 0069 (de callback haalt nooit transacties op, alleen saldo — daardoor is een verkeerde koppeling gratis te corrigeren tot de eerste sync). De success-pagina (`GET /api/bank-connect/linked-accounts`) toont voor ÉLKE gekoppelde rekening — niet alleen de expliciet gekozene — welke TriFinity-rekening (`carrier`) hem draagt.',
    when: 'De gebruiker klikt "Wijzigen" onder een gekoppelde rekening, kiest in `CarrierCorrection` een andere TriFinity-rekening en bevestigt (`POST /api/bank-connect/relink`).',
    then: 'Vóór de eerste sync verhangt `relink` alleen de koppeling (`bank_connection_accounts.bank_account_id` + `sync_cursor=null`, zodat `planInitialFetch` het startpunt op de nieuwe rekening herbepaalt) — al geïmporteerde transacties verhuizen NIET mee (die zijn er op dit punt nog niet, want de callback importeert nooit transacties). Ná de eerste sync (`last_synced_at` of `sync_cursor` gezet) is de actie server-side vergrendeld: `relink` geeft `409`, en de UI leest datzelfde serverfeit (`isSynced`) om de "Wijzigen"-knop te verbergen — géén client-only gate. Kiest de gebruiker een rekening die al een andere bank draagt, dan `409`\'t met de banknaam. Is `bank_account_id = null` (de aanmaak van de dragende rekening mislukte), dan toont de kaart dat als fout (`role="alert"`) met een "probeer opnieuw"-link naar `/core/cash/connect`, en staat de sync-knop uit in plaats van stil niets te doen.',
    assertion: {
      kind: 'ui-only',
      source: 'app/(app)/core/cash/connect/success/page.tsx (isSynced/hasCarrier-gates) + components/app/bank-connect/carrier-correction.tsx + app/api/bank-connect/relink/route.ts (409 op last_synced_at/sync_cursor, 409 op bezette rekening) + app/api/bank-connect/linked-accounts/route.ts (GET, de dragende rekening per koppeling) — DB-mutatie/UI-gate-samenspel, geen pure functie',
    },
  },
  {
    workflow: 'WF-CASH-48',
    scenarioId: 'UAT-CASH-48',
    titel: 'Eén actieve bankkoppeling per rekening (FR5): bezet is zichtbaar-maar-uitgeschakeld, de routes geven 409',
    kriticiteit: 'KERN',
    given: 'specs/bank-connect-doelrekening/plan.md fase 6 (FR5). Rekening R draagt al een ACTIEVE koppeling aan "ING" (`linked_provider_name=\'ING\'`); rekening R2 is vrij (`linked_provider_name=null`) — ook wanneer R2 ooit gekoppeld was maar zacht ontkoppeld is (`is_active=false`, dus buiten `loadOccupyingLinks`, dat expliciet op `is_active=true` filtert). In het correctiemoment draagt de te verhangen koppeling zelf op dit moment rekening R (`currentCarrierId=R`).',
    when: 'Wizardstap 2 en het correctiemoment roepen `isSelectableTargetOption` aan per kandidaat-rekening om te bepalen of de radio kiesbaar of uitgeschakeld is; `POST /api/bank-connect/auth-link` en `POST /api/bank-connect/relink` roepen `resolveTargetAccount` aan, die bij een bezette rekening `occupiedTargetAccountMessage` teruggeeft.',
    then: 'Zonder `currentCarrierId` (gewone wizard) is R NIET kiesbaar — zichtbaar maar uitgeschakeld (`disabled` radio, gedempt vlak), met de reden in het label ("Al gekoppeld aan ING.") en een echte link naar `/core/assets/cash/{R}` als uitweg; R2 is gewoon kiesbaar. In het correctiemoment (`currentCarrierId=R`) blijft R zélf kiesbaar zodat "opslaan zonder wijziging" mogelijk blijft, terwijl een ándere bezette rekening daar nog steeds uitgeschakeld is. `occupiedTargetAccountMessage(\'ING\')` levert dezelfde tekst op de 409 van `auth-link`/`relink` én onder de uitgeschakelde wizard-optie — één bron voor de melding. Dit is de UI-/route-kant van FR5; de DB-laag (partiële unieke index `bank_connection_accounts_one_active_per_bank_account` op `(bank_account_id) where is_active and bank_account_id is not null`) staat los toegepast en laat een INACTIEVE tweede rij wél toe — dat is precies de zachte-ontkoppeling die hierboven "R2 ooit gekoppeld, nu vrij" test, en het reconnect-pad dat de callback hergebruikt. De 400 op een niet-bestaande/niet-eigen/ongeschikte rekening gaat in `resolveTargetAccount` altijd vóór de 409-check, dus een 409 beschrijft altijd een eigen rekening. Staan álle bestaande rekeningen op bezet, dan zegt de wizard dat expliciet en blijft "Nieuwe rekening aanmaken" de werkende uitkomst (bekend, geen nieuw gedrag hier).',
    assertion: {
      kind: 'exact',
      expected: 'bezetNietKiesbaar=false; vrijKiesbaar=true; huidigeDragerBlijftKiesbaar=true; melding=Deze rekening is al gekoppeld aan ING. Verbreek die koppeling eerst bij de rekening; daarna kun je hem aan een andere bank koppelen.',
      source: 'lib/truelayer/target-account.ts#isSelectableTargetOption + #occupiedTargetAccountMessage — echte productiefuncties, geen mirror',
    },
  },
  {
    workflow: 'WF-CASH-49',
    scenarioId: 'UAT-CASH-49',
    titel: 'Bankkoppeling-gezondheid: derde icoon-toestand + herstelpad vanaf de rekening + SC-13-reactivatie (B6)',
    kriticiteit: 'KERN',
    given: 'specs/bank-connect-doelrekening/plan.md fase 7 (B6, SC-12/SC-13). Vier signalen bepalen de koppelgezondheid van één rekening: `bank_connection_accounts.is_active`, `bank_connections.status`, `token_expires_at` en `last_synced_at` (dat laatste is bewust GÉÉN onderdeel van het verdict). Drie oppervlakken consumeren dezelfde afleiding: het herkomst-icoon op de rekeningkaart, `SyncStatusBadge` en `ConnectedAccountCard` — vóór fase 7 leidde elk het zelf af. Vijf testcases: (1) geen koppelrij, (2) zacht ontkoppeld (`is_active=false`) waarbij de autorisatie ná het ontkoppelen alsnog is verlopen, (3) status `expired` met een nog geldig token, (4) status `active` met een verstreken `token_expires_at`, (5) status `active` met een geldig token.',
    when: '`deriveBankLinkHealth`/`deriveBankLinkState` (`lib/bank-connection-status.ts`) beoordeelt elk van de vijf combinaties, in de vaste regelvolgorde: 1) geen koppelrij → manual, 2) zacht ontkoppeld → manual, 3) status kapot (`expired`/`revoked`) → linked-broken, 4) token verstreken → linked-broken, 5) anders → linked.',
    then: 'De regelvolgorde IS het contract: case 2 bewijst dat gebruikersintentie wint van storing — een bewust verbroken koppeling die daarna verliep vraagt geen aandacht meer en blijft `manual`, nooit `linked-broken`. Case 3 en 4 bewijzen dat status ÉN datum allebei tot `linked-broken` leiden (de status springt pas op `expired` bij een mislukte token-refresh, die alleen draait als iemand synchroniseert — de datum is tot dat moment het enige eerlijke signaal). `linked-broken` ≠ `manual` in de UI: het icoon krijgt het `Unlink`-glyph op `--warning` (aandacht, geen verlies) in plaats van de kleurloze herkomst-tint, met tooltip "verbinding kwijt" — `expired` en `revoked` zijn daarbij één copy, want geen enkel codepad schrijft ooit `revoked`. Het herstelpad start vanaf de rekeningkaart: de client post alleen `relink_connection_account_id` naar `auth-link`; de server leidt de doelrekening, `link_intent=\'herautoriseren\'` én de bank af uit de koppeling zelf (`lib/truelayer/start-relink.ts`) — geen extra wizardstap, rechtstreeks naar de bank. `exceptConnectionAccountId` voorkomt dat de eigen koppeling zichzelf op een 409 laat lopen; draagt een ándere actieve koppeling dezelfde rekening, dan blijft de 409 met `occupiedTargetAccountMessage` bestaan. Wordt bij dat herstel een rekening hergebruikt waarvan het cash-bezit gedeactiveerd was (SC-13), dan reactiveert de callback dat bezit (`assets.is_active=true`) pas ná de geslaagde koppelwrite (stap 4b) — een mislukte poging (bezet-botsing) laat dus geen stille vermogenswijziging achter. `has_budget_tracking` en `bank_accounts.is_active` worden bewust NIET meegereactiveerd; die blijven hun eigen, zichtbare as.',
    assertion: {
      kind: 'exact',
      expected: 'geenKoppelrij=manual; zachtOntkoppeldMaarVerlopen=manual; statusKapot=linked-broken; tokenVerstreken=linked-broken; gezond=linked',
      source: 'lib/bank-connection-status.ts#deriveBankLinkHealth (de regelvolgorde-contract) — echte productiefunctie, geen mirror; het herstelpad (relink_connection_account_id, server-afgeleide doelrekening/intentie/bank) en de SC-13-reactivatie (lib/truelayer/cash-asset-backfill.ts#ensureCashAssetForBankAccount, aangeroepen ná de koppelwrite in app/api/bank-connect/callback/route.ts) zijn DB-mutatie over meerdere Supabase-rondes en staan hier narratief vastgelegd, niet los getoetst.',
    },
  },
  {
    workflow: 'WF-CASH-50',
    scenarioId: 'UAT-CASH-50',
    titel: 'Saldo via het herwaarderingspad: valuations-rij + snapshot-mirror alleen bij een échte wijziging, compenserende waardering bij een relink (fase 8)',
    kriticiteit: 'KERN',
    given: 'specs/bank-connect-doelrekening/plan.md fase 8 (FR8). `syncAccountBalance` schrijft `bank_accounts.balance` en `assets.current_value`; sinds deze fase hangt daar via `lib/truelayer/balance-valuation.ts` een `valuations`-rij + `balance_snapshots`-mirror aan (`recordBankBalanceRevaluation`) — hetzelfde pad als een handmatige herwaardering, geen variant erop. Testcases: (1) het saldo verandert, (2) het saldo blijft op de cent gelijk (óók bij een double-precisieverschil zoals 2543,6700000000001 vs. 2543,67), (3) de vorige waarde moet uit de notitie terug te lezen zijn voor de compensatie, (4) een compensatie-notitie mag zichzelf niet als banksync-waardering laten lezen (anders compenseert de compensatie zichzelf, oneindig vaak).',
    when: '`isSameBalance` bepaalt of een sync een waardering schrijft; `formatBankSyncNote`/`parseBankSyncPrevious` doen de rondtrip die `revertBankBalanceRevaluation` nodig heeft; `parseBankSyncPrevious` leest ook een compensatie-notitie (`formatBankSyncCorrectionNote`), die met een ándere, geankerde marker begint.',
    then: 'Een ongewijzigd saldo — óók binnen de dubbele-precisietolerantie — schrijft GEEN waardering: anders vervuilt elke sync de herwaarderingshistorie; alleen een échte wijziging passeert de poort. De notitie-rondtrip is wat de compensatie gebruikt om de waarde terug te zetten die de banksync verving — mogelijk zolang die notitie de LAATSTE waardering op de bezitting is; overschrijft een latere hándmatige herwaardering die rij, dan doet de compensatie niets, want de gebruiker heeft de waarde dan zelf vastgesteld. De compensatie-notitie leest bewust NIET terug als een banksync-waarde (`correctieNietAlsBanksyncGelezen=null`) — zonder die scheiding zou een compensatie zichzelf als banksync lezen en zichzelf oneindig vaak compenseren (precies de bijt-proef die dit brak, fase 8 besluit 3). De melding op de success-pagina ("saldo overgenomen: €a → €b") komt server-afgeleid uit `loadBankSyncBalanceChanges` (de banksync-waardering van vandaag), nooit uit een client-aangeleverd bedrag. Append-only: de compensatie schrijft altijd een NIEUWE waarderingsrij, nooit een `delete`; twee syncs op één dag leveren één snapshotrij (laatste van de dag wint, de bestaande dag-upsert-semantiek, hier niet opnieuw bedacht).',
    assertion: {
      kind: 'exact',
      expected: 'ongewijzigd=true; centTolerantie=true; gewijzigd=false; rondtrip=2543.67; correctieNietAlsBanksyncGelezen=null',
      source: 'lib/truelayer/balance-valuation.ts#isSameBalance + #formatBankSyncNote + #parseBankSyncPrevious + #formatBankSyncCorrectionNote — echte productiefuncties, geen mirror; de DB-schrijfvolgorde (recordBankBalanceRevaluation/revertBankBalanceRevaluation: bezitting eerst, markering laatst) en de success-pagina-melding zijn DB-mutatie over meerdere Supabase-rondes en staan hier narratief vastgelegd, niet los getoetst.',
    },
  },
]

export const CASH_ACCEPTANCE: AcceptanceSet = {
  zone: 'CASH',
  criteria,
}
