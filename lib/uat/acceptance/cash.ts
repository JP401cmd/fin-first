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
    titel: 'Bank koppelen via open banking en de eerste synchronisatie draaien',
    kriticiteit: 'KERN',
    given: 'TrueLayer-koppeling; het toetsbare deel stopt bij de doorverwijzing naar de bank-autorisatiepagina.',
    when: 'De gebruiker kiest een bank en klikt "Verbind met <bank>".',
    then: 'BLOCKED voor het volledige sync-resultaat (X nieuw/Y dup) — vereist een echte of sandbox TrueLayer-koppeling, expliciet buiten bereik van deze UAT-ronde. Bekende, geaccepteerde bevinding: de koppel-banner elders noemt "GoCardless", de connect-pagina "TrueLayer" (copy-inconsistentie, geen nieuwe bug).',
    assertion: {
      kind: 'ui-only',
      source: 'app/(app)/core/cash/connect — vereist sandbox-koppeling, niet pure-testbaar; zie ook de GoCardless/TrueLayer-copy-bevinding',
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
]

export const CASH_ACCEPTANCE: AcceptanceSet = {
  zone: 'CASH',
  criteria,
}
