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
    titel: 'Cashflow-onderdelen verkennen via de hefboom-kaarten',
    kriticiteit: 'KERN',
    given: 'Synthetische kaartinvoer: Transacties-kaart met inkomen/uitgaven-paren op de statusgrenzen; Vaste-lasten-kaart met aandeel-ratio\'s op de statusgrenzen; Forecast-kaart met netto/mnd op de statusgrenzen. De statusfuncties zelf zijn mode-onafhankelijk — `buildCashflowCards` berekent voor alle vier de kaarten (incl. Forecast) altijd, ongeacht weergavemodus (de weergavemodus raakt alleen de PRESENTATIE op de landing, nooit de berekening). WEERGAVEMODUS op de LANDING (/overzicht/budget, CF-1/CF-2): in **Volledig** staan alle vier de kaarten met KPI/venster/substext/chevron zichtbaar. In **Eenvoudig** rendert `CashflowLandingCards` de `verdict`-variant (oordeel primair + kerngetal mét venster + status-dot, géén chevron) — óók voor de vierde kaart. HERZIEN 28-08-2026 (S4 + S5): CF-1 (compacte one-liner zonder cijfer) en CF-2 (Forecast-kaart weg, 4→3) zijn allebei teruggedraaid onder het R5-richtingsbesluit "duiding boven reductie"; CF-2 verborg op mobiel de enige contextuele ingang naar /overzicht/budget/forecast. De landing toont dus in béide modi alle vier de kaarten, de route was en blijft bereikbaar, en de sidebar-statusdot leest nog steeds alle vier de statussen. HALVE-MAAND-UITZONDERING (bevinding C6, 26-08-2026): dit grensgeval-toetsblok roept `transactiesCardStatus` aan ZONDER `expectedMonthlyIncome`/`forecastNetPerMonth` (beide optioneel, default 0/null) — daarmee blijft `isCurrentMonthIncomeIncomplete` per constructie `false` en de grens <0%→bad ongewijzigd. De uitzondering zelf (zie WF-CASH-51) is dus geen sluipende wijziging van DIT grensgeval, maar een derde, optionele voorwaarde die alleen intreedt als de caller ze meegeeft.',
    when: 'De statusfuncties worden aangeroepen op elk grensgeval.',
    then: 'Transacties: spaarquote ≥20% → good, ≥0% → warn, <0% → bad (zonder de optionele halve-maand-parameters). Vaste lasten: aandeel <50% → good, ≤70% → warn, >70% → bad. Forecast: netto/mnd >0 → good, <0 → bad, =0 → warn.',
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
    given: '"Nu" vastgezet op 15 juli 2026; periode-modus "maand", offset 0 en offset −1. WEERGAVEMODUS (TXN-2, herzien 10 aug 2026): de "maand"-tab bestaat in **beide** modi — `PeriodeSelector` toont in **Volledig** alle vier de periodetabs (30 dagen/maand/kwartaal/jaar) en in **Eenvoudig** drie ("30 dagen"/"Maand"/"Jaar"). Alleen "kwartaal" is Volledig-only; een bewaarde kwartaal-keuze valt in Eenvoudig via `resolvePeriodForMode` terug op "30 dagen" met offset 0. De `?maand=`-deeplink werkt in beide modi. `resolvePeriodWindow` zelf — de berekening die dit criterium toetst — is in beide modi identiek; alleen de tab-toegankelijkheid verschilt.',
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
    then: 'Spaarquote = (1.200/3.000)×100 = 40%. Heatmap-venster bestrijkt exact 12 volledige kalendermaanden t/m de laatste dag van de vórige maand: start=2025-07-01, end=2026-06-30 — de huidige (lopende) maand juli verschijnt NIET. WEERGAVEMODUS (S3, 28-08-2026): het GETAL is mode-onafhankelijk — `summarizeFlow` rekent altijd hetzelfde. Wat ermee getoond wordt verschilt. In **Volledig** staat de `GeldstroomGauge` (naald op een −100…+100-schaal, spaarquote als leeswaarde, kwalitatief etiket) nu mét een venster-onderschrift ("augustus tot nu toe" / "juli 2026"), zodat hij niet meer stilzwijgend een ánder venster leest dan de status-melding erboven. In **Eenvoudig** vervangt `GeldstroomZin` de meter: dezelfde Inkomen/Uitgaven/Saldo-strip, maar de duiding staat in woorden. Die zin toont bewust GÉÉN spaarquote zolang het venster loopt (een quote over een halve maand is het valse oordeel uit bevinding C6) en doet géén voorspelling — "er is nog niets binnengekomen" is een waarneming, geen belofte dat er salaris komt. De takken zitten in `describeFlow` (`lib/transaction-insights.ts`), een tweede LEZING naast `summarizeFlow`; die laatste is bewust ongewijzigd gelaten omdat het ongeclampte leescijfer en de 0%-bij-geen-inkomen eigendom van C6 zijn en in Volledig reproduceerbaar moeten blijven.',
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
    given: 'Twaalf maanden transactiehistorie van €1.000 uitgaven per maand; dagkop met €50 netto uitgegeven. Het dagtarief van de tijdlijn is sinds M22 het CANONIEKE 12-mnd rolling €/dag (`useDailyExpenseRate` → /api/daily-expense-rate → lib/expense-rate.ts) — hetzelfde tarief als de check-in, de badges en de bulk-actiebalk. Vóór M22 deelde de tijdlijn de uitgaven van het ZICHTBARE filtervenster door de vensterlengte, waardoor de wisselkoers "€ → tijd" met elke periodekeuze en elk filter meekantelde (live gemeten: €2.500 = 6000,0 vrijheidsdagen op de lijst vs. 6083 op de check-in). UI-nevendetail (TXN-4, beide modi): een lange rekeningnaam in de account-filterchips (bv. "Betaalrekening gezamenlijk ABN AMRO") wordt VISUEEL afgekapt met CSS-ellipsis (`max-w-[9rem] sm:max-w-[13rem] truncate`) en een `title`-tooltip met de volledige naam; de DOM-tekst en dus de accessible name blijven compleet — geen toetsbaar cijfer, alleen genoteerd zodat een chip die er "afgekapt" uitziet niet als bug wordt gelogd.',
    when: 'Het vrijheidsdagen-label voor die dagkop wordt berekend.',
    then: 'Canoniek dagtarief = €1.000/mnd × 12 / 365 = €32,88/dag (nooit ÷30); vrijheidsdagen = 50/32,8767 = 1,5 dag (`calculateFreedomTime.totalDays`, al afgerond op 1 decimaal). Wisselen van periode of filter verandert dit getal NIET. Zolang het tarief nog niet bekend is (fetch loopt, of geen transactiebasis) vervalt de vrijheidsregel en blijft alleen het euro-bedrag staan.',
    assertion: {
      kind: 'exact',
      expected: 'dagtarief=32.88; freedomDays=1.5',
      source: 'lib/expense-rate.ts#recentDailyExpenseRateFromRows + lib/transaction-display.ts#freedomDays — echte productiefuncties, geen mirror',
    },
  },
  {
    workflow: 'WF-CASH-11',
    scenarioId: 'UAT-CASH-11',
    titel: 'Handmatig een transactie toevoegen (eventueel terugkerend)',
    kriticiteit: 'KERN',
    given: 'Genoteerd maandtotaal Uitgaven vóór toevoeging (jitter-afhankelijke basis); nieuwe transactie Uitgave €42,50. WEERGAVEMODUS (TXN-1, herzien 28 aug 2026 via M40) op de actie-rij van /overzicht/budget/transacties: "Nieuwe transactie", "Importeer transacties" en "Bank koppelen" staan in BEIDE modi direct zichtbaar in de rij — dit criterium is dus mode-onafhankelijk. Alleen "Zoeken en bulkbewerken" verhuist in **Eenvoudig** naar het "…"-menu (ShellOverlay-sheet); in **Volledig** staat het ongewijzigd als eigen knop in de rij.',
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
    then: 'Alle transacties van die tegenpartij (over alle maanden) krijgen het nieuwe budget + `category_source=\'rule\'`; een correctieregel wordt opgeslagen in `category_corrections`. Het exacte aantal bijgewerkte transacties hangt af van de seedhistorie (niet hand-narekenbaar), het GEDRAG (bulk-match op tegenpartijnaam) is wel deterministisch. TWEE EIGENSCHAPPEN ERBIJ sinds de bulkbewerk-oplevering (ADR 0104): (1) boekt de gebruiker op "Eigen rekening", dan schrijft het formulier het CANONIEKE TRIO — `budget_id` + `category_source` + `transaction_type=\'transfer\'` — via dezelfde gedeelde `transferMarkingFor` (lib/transactions/transfer-marking.ts) die `PATCH /api/transactions/bulk-budget` gebruikt; alléén `budget_id` schrijven zou de transactie zichtbaar op "Eigen rekening" zetten terwijl hij nog gewoon meetelt in inkomsten, uitgaven, spaarquote en grenzenpotten (`isRealAggRow` kijkt uitsluitend naar `transaction_type`). Krijgt een voorheen-verschuivende rij een gewoon budget, dan wordt de markering `null`; had de rij geen markering, dan blijft de sleutel weg — importherkomst als \'DEBIT\' sneuvelt nooit op een budgetwijziging. (2) De reikwijdte-match escapet `%`/`_` in de vrije gebruikerstekst (`escapeLikePattern`): een omschrijving met een `%` erin liet de update anders over ÉLKE transactie van de gebruiker lopen. Beide eigenschappen zijn hier gedragsmatig; hun exacte toets woont in WF-CASH-56 (paritytest transfer-marking.test.ts).',
    assertion: {
      kind: 'ui-only',
      source: 'components/app/transaction-form.tsx (handleSaveWithScope → bulkUpdate met lib/transactions/transfer-marking.ts#transferMarkingFor + lib/transactions/search-query.ts#escapeLikePattern) — bulk-DB-update, geen pure functie zonder Supabase; de gedeelde markeringsregel zelf is exact gedekt door WF-CASH-56',
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
    given: 'Baseline-inkomen €3.000/mnd, baseline-uitgaven €2.200/mnd, geen recurrings, startsaldo €2.850, "fromDate" = 1 juli 2026. WEERGAVEMODUS (FC-1): beide modi lezen dezelfde `buildForecast`-rijen, dus dit exacte cijfer geldt ongewijzigd in beide. In **Volledig** staat het als kop-statistiek "Saldo na 6m" boven de zes-rijen-tabel. In **Eenvoudig** vervangt één eindregel ("Over {FORECAST_MONTHS} maanden" + het cumulatieve saldo + een sparkline over `rows.map(r => r.cumulative)`) de tabel — géén tweede rekenpad, puur minder ervan getoond.',
    when: '`buildForecast` bouwt de 6 maandregels.',
    then: 'Elke van de 6 maanden heeft netto = 3.000 − 2.200 = €800; saldo loopt cumulatief op: €3.650, €4.450, €5.250, €6.050, €6.850, €7.650 (laatste = "Saldo na 6m" in Volledig, "Over 6 maanden" in Eenvoudig — zelfde €7.650).',
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
    then: 'Beide leveren exact 3 transacties op met Totaal bij = €2.500,00 en Totaal af = €895,00 (45+850) — identiek resultaat ongeacht bestandsformaat. Elke geparste rij houdt `transaction_type` op `null` (die kolom draagt een DB-CHECK op een vaste enum) en legt de rauwe bank-typecode (MT940 "NTRF", OFX "DEBIT"/"CREDIT") in `bank_code` — zo faalt de import-insert nooit meer op de CHECK-constraint (WF-CASH-23-bug1).',
    assertion: {
      kind: 'exact',
      expected:
        'mt940Count=3; mt940Bij=2500; mt940Af=895; ofxCount=3; ofxBij=2500; ofxAf=895; transactionTypeAlwaysNull=true; mt940BankCodeOk=true; ofxBankCodeOk=true',
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
    then: 'Zolang er iets te kiezen valt staat er GÉÉN voorselectie en blijft de knop uitgeschakeld met de hint "Kies eerst waar de data terechtkomt" tot een keuze is gemaakt. Kiest de gebruiker een bestaande rekening ZONDER budget-tracking, dan verschijnt één VOORGEVINKTE, uitzetbare optie "Neem deze rekening mee in mijn budgetten" (B2); een bestaande rekening MET tracking krijgt geen vraag; een nieuwe rekening krijgt budgetteren altijd aan. Een rekening met een reeds bestaande koppeling is in deze fase gewoon kiesbaar (informatief getoond) — de blokkade op een dubbele actieve koppeling is fase 6 en géén tekortkoming hier. `POST /api/bank-connect/auth-link` accepteert optioneel `target_bank_account_id` + `enable_budget_tracking`, valideert eigenaarschap en schrijft de keuze op de pending `bank_connections`-rij (`target_bank_account_id`, `link_intent = \'nieuw\'`); een andermans/onbekende/ongeschikte `target_bank_account_id` levert 400 zonder pending-rij. Een body zónder keuze blijft geldig. Vanaf hier BLOCKED voor de daadwerkelijke doorverwijzing/callback/sync-resultaat (X nieuw/Y dup) — vereist een echte of sandbox TrueLayer-koppeling, expliciet buiten bereik van deze UAT-ronde. VERVALLEN bevinding: de vroegere copy-inconsistentie ("GoCardless" in de koppel-banner vs. "TrueLayer" hier) bestaat niet meer — `koppel-rekening-banner.tsx` is sinds fase 2 (TXN-1) herschreven en noemt alleen nog "TrueLayer". WEERGAVEMODUS (TXN-1, herzien 28 aug 2026 via M40): "Bank koppelen" staat in BEIDE modi als eigen knop in de actie-rij van /overzicht/budget/transacties — de vul-routes zijn niet langer mode-afhankelijk. De wizard zelf (deze pagina) is in beide modi ongewijzigd.',
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
    titel: 'Bankkoppeling-gezondheid: derde icoon-toestand + herstelpad vanaf de rekening + SC-13-herstel (beide assen) (B6)',
    kriticiteit: 'KERN',
    given: 'specs/bank-connect-doelrekening/plan.md fase 7 (B6, SC-12/SC-13). Vier signalen bepalen de koppelgezondheid van één rekening: `bank_connection_accounts.is_active`, `bank_connections.status`, `token_expires_at` en `last_synced_at` (dat laatste is bewust GÉÉN onderdeel van het verdict). Drie oppervlakken consumeren dezelfde afleiding: het herkomst-icoon op de rekeningkaart, `SyncStatusBadge` en `ConnectedAccountCard` — vóór fase 7 leidde elk het zelf af. Vijf testcases: (1) geen koppelrij, (2) zacht ontkoppeld (`is_active=false`) waarbij de autorisatie ná het ontkoppelen alsnog is verlopen, (3) status `expired` met een nog geldig token, (4) status `active` met een verstreken `token_expires_at`, (5) status `active` met een geldig token.',
    when: '`deriveBankLinkHealth`/`deriveBankLinkState` (`lib/bank-connection-status.ts`) beoordeelt elk van de vijf combinaties, in de vaste regelvolgorde: 1) geen koppelrij → manual, 2) zacht ontkoppeld → manual, 3) status kapot (`expired`/`revoked`) → linked-broken, 4) token verstreken → linked-broken, 5) anders → linked.',
    then: 'De regelvolgorde IS het contract: case 2 bewijst dat gebruikersintentie wint van storing — een bewust verbroken koppeling die daarna verliep vraagt geen aandacht meer en blijft `manual`, nooit `linked-broken`. Case 3 en 4 bewijzen dat status ÉN datum allebei tot `linked-broken` leiden (de status springt pas op `expired` bij een mislukte token-refresh, die alleen draait als iemand synchroniseert — de datum is tot dat moment het enige eerlijke signaal). `linked-broken` ≠ `manual` in de UI: het icoon krijgt het `Unlink`-glyph op `--warning` (aandacht, geen verlies) in plaats van de kleurloze herkomst-tint, met tooltip "verbinding kwijt" — `expired` en `revoked` zijn daarbij één copy, want geen enkel codepad schrijft ooit `revoked`. Het herstelpad start vanaf de rekeningkaart: de client post alleen `relink_connection_account_id` naar `auth-link`; de server leidt de doelrekening, `link_intent=\'herautoriseren\'` én de bank af uit de koppeling zelf (`lib/truelayer/start-relink.ts`) — geen extra wizardstap, rechtstreeks naar de bank. `exceptConnectionAccountId` voorkomt dat de eigen koppeling zichzelf op een 409 laat lopen; draagt een ándere actieve koppeling dezelfde rekening, dan blijft de 409 met `occupiedTargetAccountMessage` bestaan. Wordt bij dat herstel een rekening hergebruikt waarvan het cash-bezit gedeactiveerd was (SC-13), dan herstelt de callback dat bezit pas ná de geslaagde koppelwrite (stap 4b) — een mislukte poging (bezet-botsing) laat dus geen stille vermogenswijziging achter. Sinds het eigenaarsbesluit van 30 juli omvat dat herstel BEIDE assen: eerst de zichtbaarheid (`assets.is_active=true`), daarna de budgettracking via `setBudgetTracking` (de ene schrijver van `has_budget_tracking` + companion-rij + de module-gate `profiles.budgeting_active`; `bank_accounts.is_active` beweegt daardoor mee, want dát is hoe de companion "budgetteren staat aan" uitdrukt). Herstel dat de rekening zichtbaar maakt maar buiten de budgetten laat, las als half hersteld. De volgorde is het contract: faalt de budget-write, dan blijft het bezit hersteld (`reactivated: true`) en is de rest zichtbaar en zelf-herstelbaar via de bestaande toggle; faalt de zichtbaarheids-write, dan wordt de budget-as niet aangeraakt. Een bezit dat al ACTIEF is krijgt geen budget-write: herstel is een reparatie, geen "zet altijd maar aan".',
    assertion: {
      kind: 'exact',
      expected: 'geenKoppelrij=manual; zachtOntkoppeldMaarVerlopen=manual; statusKapot=linked-broken; tokenVerstreken=linked-broken; gezond=linked',
      source: 'lib/bank-connection-status.ts#deriveBankLinkHealth (de regelvolgorde-contract) — echte productiefunctie, geen mirror; het herstelpad (relink_connection_account_id, server-afgeleide doelrekening/intentie/bank) en het SC-13-herstel van beide assen (lib/truelayer/cash-asset-backfill.ts#ensureCashAssetForBankAccount → lib/budget-tracking.ts#setBudgetTracking, aangeroepen ná de koppelwrite in app/api/bank-connect/callback/route.ts) zijn DB-mutatie over meerdere Supabase-rondes en staan hier narratief vastgelegd, niet los getoetst — de vitest-dekking zit in lib/truelayer/cash-asset-backfill.test.ts.',
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
  {
    workflow: 'WF-CASH-51',
    scenarioId: 'UAT-CASH-51',
    titel: 'Cashflow-landingskaarten: Budget toont het resterende bedrag, Transacties de gerealiseerde huidige maand (dekt app/(app)/overzicht/budget/page.tsx)',
    kriticiteit: 'KERN',
    given: 'De pagina /overzicht/budget rendert de vier hefboom-kaarten via `buildCashflowCards` (`lib/dashboard-data-loader.ts` + `lib/cashflow-data-loader.ts` + `lib/vaste-lasten-summary.ts` als invoer). ADR 0073 ("grondslag in de veldnaam") legt vast dat elk inkomsten-/uitgavenveld op de bundel zijn venster in de naam draagt. WEERGAVEMODUS — HERZIEN 28-08-2026 (S4): de hieronder getoetste `budgetKpi`/`transKpi`-WAARDEN zijn mode-onafhankelijk (`buildCashflowCards` rekent ze altijd uit, server-side) en zijn sinds S4 in BEIDE modi ZICHTBAAR op de landing. In **Volledig** staat de KPI-tekst als hoofdcijfer op de kaart, met het venster-label (`kpiWindow`) eronder waar dat bestaat — voor Budget draagt `kpiWindow` sinds de budgetpagina-pariteit de Volledig-grondslag ("van € X uitgavenbudget"), zodat kaart en budgetpagina-hero herkenbaar hetzelfde getal tonen. In **Eenvoudig** staat het oordeel bovenaan en het kerngetal daaronder, ALTIJD mét venster: de Transacties-kaart gebruikt het canonieke `kpiWindow` ("in {maand} tot nu toe"), de Budget-kaart wint met de vaste call-site-copy "nog te besteden deze maand" — `meterLine()` (components/overview/cashflow-landing-cards.tsx) laat die vaste tekst bewust over de gevulde `card.kpiWindow` heen winnen, want het cijfer is een restant, geen som-over-venster — en de Vaste-lasten-kaart de quote ("{n}% van inkomen") als meetlat. Dit vervangt CF-1 en de CF-3-herziening van 10-08-2026 ("venster alleen in Volledig"): die hing het venster aan het cijfer, en het cijfer is terug. De "Budgetdekking"-tip in het uitklap-detail noemt hetzelfde vensterlabel in plaats van het vaste "deze maand". PRIVACY (S4): alle bedragen op dit pad lopen sindsdien door `maskCurrencyInText` — met de privacy-toggle aan tonen KPI, meetlat en drill-down het bullet-placeholder; percentages, aantallen en venster-labels blijven leesbaar.',
    when: 'De gebruiker leest de Budget-kaart en de Transacties-kaart op de landingspagina (Volledig — in Eenvoudig staan de KPI-cijfers zelf niet op de landing, zie hierboven).',
    then: 'De Budget-KPI toont wat er van het maandbudget OVER is (plafond − besteed), niet het plafond zelf, en zonder "/mnd"-suffix — bij overschrijding een negatief bedrag, geduid door `subText` ("Boven budget"); `budgetCardStatus` blijft ongewijzigd op `monthSummary.budgetScore`. De Transacties-KPI, de spaarquote in het uitklap-detail, de tip en de kaartstatus draaien allemaal op de GEREALISEERDE huidige kalendermaand (`DashboardData.currentMonthIncome`/`currentMonthExpenses`, transfer-gefilterd via `aggIncomeByMonth`/`aggExpenseByMonthAbs` met `realOnly: true`) — NIET op het effective `monthlyIncome`/`monthlyExpenses`, dat bij `profiles.income_source = \'manual\'` een profielinschatting is in plaats van wat deze maand werkelijk gebeurde. De Vaste-lasten-kaart is bewust de UITZONDERING: die blijft het effective maandinkomen als noemer gebruiken voor het aandeel, omdat een structureel aandeel tegen een stabiel inkomen hoort te worden gemeten, niet tegen een half-afgelopen kalendermaand. HALVE-MAAND-UITZONDERING (bevinding C6, 26-08-2026) — in DIT literaire voorbeeld ONGEWIJZIGD: `buildCashflowCards` geeft de Transacties-kaart wél het effective maandinkomen (€6.000) als meetlat mee, maar `recurrings: []`/`baselineIncome: 0`/`baselineExpenses: 0` maakt `hasForecast` hier `false`, dus `forecastNetPerMonth` is `null` en de nieuwe voorwaarde (compleetheid ÉN een niet-negatieve prognose) kan niet intreden — de KPI (€ -500) en de status blijven zoals hierboven beschreven. Zie WF-CASH-01 voor de kale statusgrenzen en de nieuwe uitzondering zelf.',
    assertion: {
      kind: 'exact',
      expected: 'budgetKpi=€ -250 (plafond 3.950, besteed 4.200); transKpi=€ -500 (gerealiseerd 3.000/3.500, effective 6.000/2.000 genegeerd)',
      source: 'app/(app)/overzicht/budget/page.tsx + lib/cashflow-cards.ts#buildCashflowCards — echte productiefunctie, aangeroepen op literaire invoer; zie cash-checks.ts',
    },
  },
  {
    workflow: 'WF-CASH-52',
    scenarioId: 'UAT-CASH-52',
    titel: 'Betaalrekening verwijderen: "Bewaren" archiveert de historie, "Verwijderen" wist ze, ontkoppeling/opschoning is atomair (ADR 0082)',
    kriticiteit: 'KERN',
    given: 'Een actief gekoppelde betaalrekening met transactiehistorie, terugkerende regels en een gekoppeld cash-bezit (`linked_asset_id`, `has_budget_tracking=true`). De gebruiker opent het ⋮-menu op de rekeningweergave en kiest "Verwijderen"; de bevestiging (`ShellOverlay kind="confirm" destructive`) toont de impact-preview uit `GET /api/bank-accounts/[id]` (transactionCount/recurringCount/hasBankLink) en de radiokeuze "Transacties bewaren" (voorgeselecteerd) vs. "Transacties verwijderen".',
    when: 'De gebruiker bevestigt met `DELETE /api/bank-accounts/[id]`, body `{ transactions: \'keep\' }` resp. `{ transactions: \'delete\' }`; de route roept in beide gevallen uitsluitend `public.delete_bank_account` aan (één RPC, alles-of-niets, geen losse `.update()`/`.delete()` in de handler zelf).',
    then: 'Bij "Bewaren" verhuizen de boekingen naar de per-gebruiker archief-rekening (`bank_accounts.is_archive_bucket`, lazy aangemaakt, `is_active=false`, `balance=0`, geen eigen UI) — ze blijven meetellen in historie en budgetten en de geldstroomcijfers van eerdere maanden veranderen NIET. Bij "Verwijderen" worden de boekingen definitief gewist, waardoor uitgaven-/spaarcijfers van eerdere maanden wél veranderen. In beide gevallen: een actieve bankkoppeling verliest `bank_account_id`/`is_active=false` op de koppelrij (de rij zelf blijft bestaan, wordt niet verwijderd), openstaande terugkerende regels van die rekening worden stopgezet, en het gekoppelde cash-bezit wordt gedeactiveerd (`assets.is_active=false`, `has_budget_tracking=false`) zodat het saldo niet meer meetelt in netto vermogen, horizon en FIRE. Weigeringen: de archief-rekening zelf kan niet verwijderd worden (`TF409` → 409 "De archiefrekening kan niet verwijderd worden."); een rekening waarop boekingen ÓF terugkerende regels van een andere gebruiker staan wordt geweigerd (`TF410` → 409, exacte tekst "Er staan boekingen of terugkerende regels van je partner op deze rekening. Laat die eerst verplaatsen of verwijderen; daarna kun je de rekening opruimen."). Die weigering hangt bewust NIET aan `ownership=\'shared\'` maar aan het werkelijk bestaan van vreemde rijen, geteld door `public.count_foreign_rows_on_bank_account` (SECURITY DEFINER, buiten RLS): beide FK\'s naar `bank_accounts` staan op ON DELETE CASCADE, een RI-cascade omzeilt RLS, en een `ownership=\'personal\'`-boeking van de partner is via de SELECT-policy onzichtbaar maar wordt wél vernietigd. De rekening op persoonlijk zetten is daarom géén uitweg meer (en wordt niet meer geadviseerd). Faalt de RPC halverwege, dan is er dankzij de transactie niets gewijzigd — geen half opgeruimde rekening.',
    assertion: {
      kind: 'ui-only',
      source: 'app/api/bank-accounts/[id]/route.ts (DELETE — RPC-call naar public.delete_bank_account, géén eigen update/delete) + de RPC-migratie zelf (bank_account_id/is_active op bank_connection_accounts, recurring_transactions stopzetten, assets.is_active/has_budget_tracking, archief-rekening bij keep) — DB-transactie over meerdere tabellen, geen pure functie zonder Supabase; docs/adr/0082-bankrekening-verwijderen-alleen-op-gebruikersopdracht.md',
    },
  },
  {
    workflow: 'WF-CASH-53',
    scenarioId: 'UAT-CASH-53',
    titel: 'Grenzenpot: berekenen en reeks — dag/week/kwartaal/jaar-periodes, bucket-containment, isNearLimit, streaks, trend (ADR 0089/0092/0097)',
    kriticiteit: 'KERN',
    given: 'De rekenmotor `lib/spend-limits/engine.ts` op synthetische, on-the-fly invoer (géén opgeslagen periode-uitkomsten — elke weergave rekent opnieuw uit de transacties). Subscenario a: een dagpot en een weekpot rond zaterdag 8 augustus 2026, een kwartaalpot (limiet €900) met aggregaat-rijen in de drie maanden van Q3 2026 én in de aangrenzende maand (juni) erbuiten, plus een jaarpot (limiet €5.000) met de 12 kalendermaanden van 2026 én een rij in december 2025 erbuiten. Subscenario b: `isNearLimit`-grensgevallen — een grens van €0 en een reeds overschreden periode op 200% van de grens. Subscenario c: zes afgesloten periodes met precies één overschrijding ertussenin (streaks), en vijf trend-randgevallen (2, 4 en 6 afgesloten periodes, met prior=0 en met een verschil onder de 5%-drempel). Subscenario d: dezelfde periode vóór en ná een refund (retroactief herstel) en de tegenpartij-sleutel-parityhelpers.',
    when: '`resolveSpendLimitPeriods`, `computePeriodOutcome`, `computeStreaks`, `computeSpendLimitTrend`, `spendLimitCounterpartyKey` en `counterpartyMatchesKey` worden rechtstreeks aangeroepen op de synthetische invoer — geen mirror, de échte productiefuncties.',
    then: '(a) De containment-match (`sliceContainsBucket`) telt voor het kwartaal alleen de drie maanden ván het kwartaal op (€750, buurmaand juni genegeerd) en voor het jaar precies de 12 kalendermaanden (€1.200, december 2025 genegeerd) — de periodeKey/label-contracten kloppen (`2026-Q3`/`Q3 2026`, `2026`/`2026`, en sinds ADR 0097 ook `2026-08-10`/`10 augustus 2026` en `2026-W33`/`week 33, 2026` — waarbij de weeksleutel het ISO-JAAR draagt, dus de week van 29 december 2025 heet `2026-W01`). Een dagperiode telt uitsluitend de transacties van díé dag en een weekperiode loopt van maandag t/m zondag; een bucket ligt per constructie nooit over een periodegrens, omdat `SPEND_LIMIT_GRAIN_BY_PERIOD` per soort een korrel kiest die binnen die grenzen valt (dag→dag, week→week, maand/kwartaal/jaar→maand). (b) Een grens van €0 meldt nooit "bijna over je grens" (guard `limitAmount > 0`); een periode op 200% van de grens die al `exceeded` is, is per definitie nooit ook `isNearLimit` (near en exceeded sluiten elkaar uit). (c) Eén overschrijding breekt de reeks en de telling begint daarna opnieuw bij nul (`currentStreak`/`longestStreak`/`exceededPeriodCount`/`closedPeriodCount`); de trend levert nooit NaN of "Infinity%": bij < 3 afgesloten periodes is het recente gemiddelde `null` en de richting `unknown`, bij < 6 (maar ≥ 3) blijft alleen het vorige gemiddelde `null`, een overgang van 0 naar een positief bedrag heet `worsening` met een `null`-percentage (delen door nul vermeden), en een verschil onder de 5%-drempel heet `stable` ondanks een niet-nul verschil. (d) Een refund op dezelfde periode verandert de uitkomst retroactief van `exceeded` naar `within` zonder dat er iets is opgeslagen — puur herrekend uit de rijen. De tegenpartij-sleutel-helpers zijn de TypeScript-helft van het SQL-parity-paar: dezelfde normalisatie (alfanumeriek, hoofdletters) en een lege sleutel matcht nooit iets.',
    assertion: {
      kind: 'exact',
      expected:
        'quarterMatched=750 (buurmaand genegeerd); yearMatched=1200 (buurjaar genegeerd); zeroLimitNear=false; exceededNear=false; currentStreak=3; longestStreak=3; closedPeriodCount=6; trend <3→recentAvg=null/unknown; trend <6→priorAvg=null/unknown; trend 0→0=stable/0%; trend 0→positief=worsening/pct=null; trend <5%-verschil=stable; refund exceeded→within; tegenpartij-sleutel case-insensitieve deelstring-match, lege sleutel matcht nooit',
      source: 'lib/spend-limits/engine.ts#resolveSpendLimitPeriods + computePeriodOutcome + computeStreaks + computeSpendLimitTrend + sliceContainsMonth + lib/spend-limits/counterparty-key.ts#spendLimitCounterpartyKey + counterpartyMatchesKey — echte productiefuncties op synthetische invoer, geen mirror; zie cash-checks.ts',
    },
  },
  {
    workflow: 'WF-CASH-54',
    scenarioId: 'UAT-CASH-54',
    titel: 'Grenzenpot: beheren met MEERDERE REGELS, prestatieweergave en meldingen — widget, prestatiepane, match-preview per regel, alias en één in-app melding (ADR 0089/0092/0097)',
    kriticiteit: 'BELANGRIJK',
    given: 'Persona Daan Bakker met zijn 15-maands transactiehistorie (`Math.random()`-jitter, dus geen hand-narekenbare bedragen — vandaar `ui-only`/`consistency` in plaats van `exact`, zie de zone-notitie bovenaan dit bestand) en minstens één grenzenpot met een tegenpartij-regel. Subscenario a: de sectie op de transactiepagina (`spend-limits-section.tsx`, ~1215 regels — aanmaken/bewerken/archiveren/pauzeren via `useSpendLimitCopy()`), de prestatiepane gemount vanuit de sectie zelf via de "Bekijk verloop"-knop (`spend-limit-performance-pane.tsx` + `spend-limit-period-chart.tsx` + `spend-limit-heatmap.tsx`, props-contract open/limit/dailyExpenseRate), de deeplink `?limit=<uuid>&periode=<periodKey>` die de server-page opent en die bij sluiten met `router.replace` wordt opgeruimd, de periodekiezer met retroactief-waarschuwing ("Een wijziging geldt ook voor je afgesloten periodes"), de widget op het dashboard (`spend-limit-widget.tsx`, geregistreerd in `lib/widget-catalog.ts`/`lib/dashboard-data-loader.ts`, minstens de formaten quarter en half) en de match-preview-route (`POST /api/spend-limits/preview`, server-side match-autoriteit via `spendLimitCounterpartyKey`, met `excludeLimitId` zodat de eigen pot niet als overlap meetelt). REGEL-EDITOR (ADR 0097): het formulier toont een LIJST regels met "Regel toevoegen" en, vanaf twee regels, een verwijderknop per regel; elke regel draagt een aanvinklijst met budgetten (meerdere mogelijk, ingesprongen als boom) én een tegenpartij-veld met chips (meerdere mogelijk). Er is GEEN tak-keuze "Een budget / Een tegenpartij" meer — beide dimensies staan altijd naast elkaar, want een regel mag ze combineren. Onder elke regel staat de zin die de combinatie uitlegt (`describeRule`: "Uitgaven in A of B (inclusief subbudgetten) bij C") plus een eigen match-preview. Het tegenpartij-veld is INVOER en geen waarde: typen verandert de regel niet, pas Enter/de +-knop/een keuze uit de suggestielijst voegt de zoekterm toe, waarna het veld leegt; ontdubbeling gaat op de genormaliseerde sleutel, dus "Shell" en "s.h.e.l.l." leveren één chip. WEERGAVEMODUS (TXN-3) op de periodekiezer: in **Eenvoudig** zijn dag, week en maand kiesbaar — BEHALVE wanneer de bewerkte pot al op kwartaal of jaar staat, dan blijft precies díé tab óók zichtbaar en actief (een stilzwijgende overschrijving zou bij opslaan de eenheid van de pot wijzigen, een gegevenswijziging in plaats van een weergave-reductie). In **Volledig** staan alle vijf de periodetabs. Subscenario c: de alias-toggle op `/mijn/uiterlijk` (`SpendLimitAliasPicker` + `useSpendLimitAlias`/`useSpendLimitCopy`, optimistisch met rollback bij een falende PUT) en één `spend_limit`-meldingevent zichtbaar via `app/api/notifications/route.ts` (`decideSpendLimitEvents`) in `/berichten`.',
    when: 'De gebruiker beheert een pot in de sectie, opent de prestatiepane via "Bekijk verloop" of via de deeplink `?limit=&periode=`, wisselt de periodesoort in de periodekiezer, ziet de widget op het dashboard, typt een tegenpartijlabel dat de preview-route aanroept, zet de alias-toggle om op `/mijn/uiterlijk`, en ontvangt een `near`/`exceeded`/`recovered`/`streak_milestone`-melding zodra de bijbehorende voorwaarde geldt.',
    then: 'De sectie blijft functioneel identiek aan fase 1 (aanmaken/bewerken/archiveren/pauzeren), nu via `useSpendLimitCopy()` in plaats van de statische `SPEND_LIMIT_COPY`-constante, zodat de alias-flip direct doorwerkt zonder herladen. De "Bekijk verloop"-knop mount de prestatiepane vanuit de sectie; de deeplink `?limit=<uuid>&periode=<periodKey>` opent diezelfde pane server-side en de parameters worden bij sluiten via `router.replace` uit de URL verwijderd (geen stale query-state). De prestatiepane doet nul extra fetches voor de standaardweergave (alles uit de `SpendLimitWithReport`-prop), maskeert elk euro-label (geen numerieke Y-ticks, limietlijn toont "je grens") en toont de lopende periode als "voorlopig" buiten de trend. De periodekiezer laat de gebruiker de periodesoort wisselen en waarschuwt expliciet dat dit ook afgesloten periodes en dus de reeks raakt. De widget rendert zonder eigen fetch, met precies één `href` naar `/overzicht/budget/transacties?limit=<id>` en zonder module-/budgetteren-gate. De preview-route matcht via de échte tegenpartij-sleutels (ook namen buiten de top-40-suggestielijst), sluit de eigen pot uit via `excludeLimitId` en toont een regel-observatie bij overlap met een andere pot, zonder een tweede bedrag te tonen — hoogstens één treffer per pot, ook als meerdere regels van die pot raken. De prestatieweergave toont de per-(kind)budget-uitsplitsing alleen waar die bestaat (maandkorrel, regels zonder tegenpartij-dimensie), de per-naam-uitsplitsing alleen bij een ZUIVERE tegenpartij-pot, en valt anders terug op de per-REGEL-uitsplitsing — waarvan de som per constructie gelijk is aan het periodebedrag, want een transactie die twee regels raakt telt maar één keer (toegerekend aan de eerste regel). De alias-toggle wisselt kop/intro/knop/foutmelding op alle drie de oppervlakken (sectie, pane, widget) naar "Schaamtepot"/"schaamtepot" en rolt terug bij een falende PUT. Eén melding (near/exceeded/recovered/streak_milestone) verschijnt in `/berichten` met de alias van het generatiemoment in de tekst, nooit prescriptief. SINDS ADR 0119 (29-08-2026) toont de sectie en de widget bij maand-/kwartaal-/jaarpotten óók de tempo-regel van de lopende periode ("x% van de periode voorbij · y% van je grens gebruikt", plus vanaf 3 afgesloten periodes een prognosebedrag) — puur informatief, zie WF-CASH-64 voor de rekenregel zelf; dag- en weekpotten tonen die regel niet.',
    assertion: {
      kind: 'ui-only',
      source: 'app/(app)/overzicht/budget/transacties/page.tsx + components/overview/transacties/spend-limits-section.tsx + spend-limit-performance-pane.tsx + spend-limit-period-chart.tsx + spend-limit-heatmap.tsx + components/widgets/spend-limit-widget.tsx + lib/widget-catalog.ts + lib/dashboard-data-loader.ts + app/api/spend-limits/route.ts (GET/POST — lijst + aanmaken) + app/api/spend-limits/[id]/route.ts (PUT/PATCH/DELETE — bewerken/pauzeren/archiveren) + app/api/spend-limits/counterparties/route.ts (top-40-suggestielijst) + app/api/spend-limits/preview/route.ts + app/api/spend-limits/[id]/breakdown/route.ts + app/(app)/mijn/uiterlijk/page.tsx + components/mijn/spend-limit-alias-picker.tsx + lib/hooks/use-spend-limit-alias.tsx + app/api/spend-limit-alias/route.ts + lib/notifications/spend-limit.ts + app/api/notifications/route.ts#decideSpendLimitEvents — UI-/route-gedrag op persona-seeddata met Math.random()-jitter, geen hard cijfer',
    },
  },
  {
    workflow: 'WF-CASH-55',
    scenarioId: 'UAT-CASH-55',
    titel: 'Transactie-bulkbewerken: zoeken over de volledige historie, pagina/alle-N selecteren, impact tonen (ADR 0104, AC1–AC5)',
    kriticiteit: 'KERN',
    persona: 'daan',
    given: 'De bulkbewerk-overlay (docs/requirements-transactie-bulkbewerken.md) is open op een zoekopdracht met 340 treffers en een paginagrootte van 50.',
    when: 'De gebruiker zoekt zonder datumvenster (AC1), leest het treffertotaal op de eerste pagina (AC2), vinkt de kopcheckbox aan (AC3), verandert daarna de zoekterm (AC4) en leest de impactregel van een selectie van 12 transacties met som −€1.240 (AC5).',
    then: 'AC1: `applyTransactionSearchCriteria` zet op een leeg criterium geen enkel datumfilter (geen `gte`/`lte` op `date`) — anders dan het oude venster van ~12–13 maanden (resolveFetchWindow) reikt de zoekopdracht dus over de hele historie. AC2/AC3: de kopcheckbox pakt exact de 50 zichtbare rijen (headerState=full, niet 340) en de "Selecteer alle 340 gevonden transacties"-affordance verschijnt alleen dan. AC4: het criterium krijgt een andere identiteitssleutel zodra de zoekterm wijzigt — de stabiele haak waarop de overlay de selectie leegt en dat meldt. AC5: de impactregel toont 12 transacties en het netto bedrag −€1.240 (som van sumPositief + sumNegatief).',
    assertion: {
      kind: 'exact',
      expected: 'geenDatumfilterOpLeegCriterium=true; headerStateVolledigePagina=full; selectAllAffordance=true; selectionCountExpliciet=50; selectionCountAlleN=340; criteriaKeyVerandertBijZoekterm=true; impactNetBedrag=-1240',
      source: 'lib/transactions/search-query.ts#applyTransactionSearchCriteria (echte functie, fake filterbuilder) + components/overview/transacties/bulk/selection-model.ts#headerState/shouldOfferSelectAll/selectionCount + criteria.ts#criteriaKey (echte functies) + bulk-impact.tsx (net = sumPositief + sumNegatief, mirror — inline in BulkImpact, geen eigen export) — zie cash-checks.ts',
    },
  },
  {
    workflow: 'WF-CASH-56',
    scenarioId: 'UAT-CASH-56',
    titel: 'Transactie-bulkbewerken: hercategoriseren — canoniek trio en split-uitsluiting (ADR 0104, AC6–AC8)',
    kriticiteit: 'KERN',
    persona: 'daan',
    given: '1.500 geselecteerde transacties, waarvan 3 nu `transaction_type=\'transfer\'` dragen en 7 gewone import-herkomst (bv. \'DEBIT\'); geen enkele is gesplitst in dit scenario.',
    when: 'De gebruiker koppelt de selectie aan "Eigen rekening" (AC7), koppelt in een tweede ronde alle 10 aan "Boodschappen" (AC8), en `planBulkBudgetUpdate` verdeelt de 1.500 kandidaten in schrijfgroepen (AC6).',
    then: 'AC7: naar "Eigen rekening" schrijft elke rij het canonieke trio `budget_id` + `category_source=\'transfer\'` + `transaction_type=\'transfer\'`. AC8: naar "Boodschappen" verliezen de 3 voorheen-verschuivende rijen hun `transaction_type` (wordt `null`); bij de overige 7 ontbreekt de sleutel `transaction_type` in de patch volledig — hun importherkomst blijft ongemoeid, geen blanket-null. AC6: alle 1.500 niet-gesplitste kandidaten belanden in een schrijfgroep (0 skips) — het uiteindelijk gerapporteerde "1.500 van 1.500" komt in productie nog steeds uit `.select(\'id\')` op de mutatie (R-NF4), maar de groepering zelf raakt aantoonbaar alle 1.500. Een split in de selectie wordt uitgesloten met reden `is_split`, nooit stil meegenomen.',
    assertion: {
      kind: 'exact',
      expected: 'eigenRekeningTrio=budget_id+transfer+transfer; wasVerschuivingNaarGewoon=manual+transactionTypeNull; wasGeenVerschuivingNaarGewoon=manual+geenTransactionTypeSleutel; planTotaalCandidates1500=1500; planSkipped1500=0; splitWordtGeskiptMetReden=is_split',
      source: 'lib/transactions/transfer-marking.ts#transferMarkingFor + lib/transactions/bulk-mutate.ts#planBulkBudgetUpdate — echte productiefuncties, geen mirror (gedeeld met components/app/transaction-form.tsx, paritytest transfer-marking.test.ts) — zie cash-checks.ts',
    },
  },
  {
    workflow: 'WF-CASH-57',
    scenarioId: 'UAT-CASH-57',
    titel: 'Transactie-bulkbewerken: verwijderen — zware bevestiging, type-to-confirm en herimport-waarschuwing (ADR 0104, AC9–AC10)',
    kriticiteit: 'KERN',
    persona: 'daan',
    given: 'Een selectie van 43 transacties, waarvan 5 afkomstig van een gekoppelde bankrekening.',
    when: 'De gebruiker klikt op Verwijderen; de bevestiging toont het aantal/totaalbedrag/actieve filters, staat erop dat het definitief is, en vraagt — boven de drempel van 25 (`TYPE_TO_CONFIRM_THRESHOLD`) — het aantal over te typen.',
    then: 'AC9: bij 43 (>25) is `needsTyping=true`, de knoptekst luidt "Verwijder 43 transacties" (niet "OK"), en de knop blijft geblokkeerd tot het overgetypte aantal exact 43 is (`typedOk`). Rood is niet het enige signaal: de bevestiging draagt ook een icoon en een expliciete kop ("Dit is definitief"). AC10: met 5 bankgekoppelde rijen (bankLinkedCount>0) toont de bevestiging de herimport-waarschuwing; bij 0 verschijnt ze niet — de app waarschuwt, voorkomt niets (R-NF7).',
    assertion: {
      kind: 'exact',
      expected: 'needsTypingBij43=true; labelBij43=Verwijder 43 transacties; typedOkLeeg=false; typedOkJuisteGetal=true; typedOkVerkeerdGetal=false; waarschuwingBij5BankLinked=true; geenWaarschuwingBij0=false',
      source: 'components/overview/transacties/bulk/bulk-bevestigingen.tsx (BulkDeleteConfirm: totaal/needsTyping/typedOk/label-berekening, inline — mirror, geen eigen export) + lib/transactions/bulk-contract.ts#TYPE_TO_CONFIRM_THRESHOLD (echte constante) — zie cash-checks.ts',
    },
  },
  {
    workflow: 'WF-CASH-58',
    scenarioId: 'UAT-CASH-58',
    titel: 'Transactie-bulkbewerken: huishoud-scoping en de 5.000-grens (ADR 0104, AC11–AC12) — HANDMATIGE CONTROLE',
    kriticiteit: 'KERN',
    persona: 'lisa',
    given: 'Een huishouden waarin de partner transacties heeft op een gedeelde rekening (Lisa de Groot, "gezin"); een gebruiker met 4.000 transacties die aan een filter voldoen.',
    when: 'De gebruiker selecteert "alle N" en voert een bulkactie uit.',
    then: 'AC11/AC12 zijn structureel geborgd in de code (`lib/transactions/bulk-mutate.ts` zet `.eq(\'user_id\', userId)` op zowel de leesronde als de schrijfronde — RLS op UPDATE/DELETE is toch al strikt eigen-rij, dit is de tweede, expliciete slot; `SELECTION_MAX=5000` in `bulk-contract.ts` laat de manifest-route boven de grens weigeren met 400 `selection_too_large` in plaats van stil af te kappen), maar een live UAT-run kan dit NIET automatisch aantonen: de standaard testpersona\'s dragen geen gedeelde rekening met partnertransacties in de juiste vorm, en geen enkele persona heeft 4.000 transacties die aan één filter voldoen. Dit scenario is daarom een HANDMATIGE controle — een tester zet zelf een huishouden met een gedeelde rekening en ≥4.000 filtermatchende transacties op (of leest de code/tests) en bevestigt met de hand dat (a) geen enkele partnerrij wijzigt/verdwijnt en (b) alle 4.000 geraakt worden, niet 1.000. Groen kleuren zonder deze stap bewijst niets.',
    assertion: {
      kind: 'ui-only',
      source: 'lib/transactions/bulk-mutate.ts (readBulkCandidates/bulkUpdateTransactions/bulkDeleteTransactions — .eq(\'user_id\') op leesronde én schrijfronde) + lib/transactions/bulk-contract.ts#SELECTION_MAX + de manifest-route (app/api/transactions/search/manifest/route.ts, 400 selection_too_large) — DB-mutatie/RLS-gedrag over een datatoestand die geen persona seedt; niet los toetsbaar in een pure vitest, en in een live UAT-run alleen bewijsbaar met een handmatig opgezet huishouden + 4.000-rijen-account.',
    },
  },
  {
    workflow: 'WF-CASH-59',
    scenarioId: 'UAT-CASH-59',
    titel: 'Transactie-bulkbewerken: regelaanbod op bevestiging en eerlijke terugkoppeling bij gedeeltelijke mislukking (ADR 0104, AC13–AC14)',
    kriticiteit: 'BELANGRIJK',
    persona: 'daan',
    given: 'Een geslaagde hercategorisatie; een bulkactie waarbij één batch van ≤200 id\'s faalt terwijl de overige batches doorgaan (R-NF5).',
    when: 'De app biedt na de hercategorisatie aan er een regel van te maken en de gebruiker klikt weg (AC13); de bulkmutatie rondt af met één mislukte batch (AC14).',
    then: 'AC13: wegklikken van het regelaanbod roept `createBulkRule` niet aan — er ontstaat geen `category_corrections`-rij; alleen een expliciete bevestiging doet dat. AC14: het eindresultaat volgt het vaste contract `{ requested, updated/deleted, skipped[{id,reason}], failedIds[] }` — de gefaalde batch levert `failedIds` op terwijl `updated`/`deleted` (uit `.select(\'id\')` op de geslaagde batches) het werkelijke aantal blijft; de app meldt dus expliciet hoeveel wél en hoeveel niet gelukt zijn, nooit stilzwijgend "klaar".',
    assertion: {
      kind: 'consistency',
      source: 'components/overview/transacties/bulk/bulk-api.ts#createBulkRule (alleen op expliciete aanroep) + lib/transactions/bulk-mutate.ts#bulkUpdateTransactions/bulkDeleteTransactions (BulkWriteResult { touched, failedIds } — per-batch falen isoleert de rest, getest in bulk-mutate.test.ts) + lib/transactions/bulk-contract.ts#BulkBudgetResponse/BulkDeleteResponse-vorm — DB-mutatie over meerdere Supabase-rondes, geen pure functie zonder Supabase; de contractvorm zelf is wel het toetsbare deel.',
    },
  },
  {
    workflow: 'WF-CASH-60',
    scenarioId: 'UAT-CASH-60',
    titel: 'Grondslag van inkomen en uitgaven kiezen: budgetten, transacties of een eigen bedrag (ADR 0103)',
    kriticiteit: 'KERN',
    given:
      'Het cashflow-instellingenblok op /overzicht/budget (`components/overview/cashflow-instellingen-blok.tsx`, lazy ingeladen via `cashflow-below-fold.tsx` — óók in Eenvoudig, daar achter een disclosure). Eén synthetische situatie waarin de drie bronnen bewust UITEENLOPEN: profielschatting €2.000/mnd, gemeten transacties €3.000/mnd, budgetsom €3.600/mnd. De keuze staat per kant op `profiles.income_source` / `profiles.expenses_source`; de uitsluitlijst op de eigen, exclusieve kolom `profiles.cashflow_basis_prefs` (NADRUKKELIJK niet `feature_preferences`, die kolom wordt als volledige overwrite geschreven).',
    when:
      'De gebruiker zet de grondslag achtereenvolgens op "kies voor mij" (`auto`), "uit je transacties" (`transaction`), "eigen bedrag" (`manual`) en op `auto` zonder bruikbare budget- of transactiesom; `resolveAmountWithBasis` neemt telkens de precedentiebeslissing en `resolveSavingsSource` leidt de spaarquote van diezelfde grondslag af.',
    then:
      'Precedentie (één functie, schaalvrij — de caller kiest maand- of jaarbedragen): `manual` wint altijd en levert basis `manual` (€2.000); `auto` met een bruikbare budgetsom levert die som en basis `budget` (€3.600); `transaction` slaat de budgetsom BEWUST over en levert de gemeten €3.000 met basis `transaction` (wie expliciet op de werkelijkheid stuurt, mag daar niet stil door zijn budgetten van worden afgeduwd); zonder bruikbare budget- én transactiesom valt `auto` terug op de profielschatting met basis `profile`. DE SPAARQUOTE VOLGT DE GRONDSLAG en is geen aparte instelbare bron: staan inkomen én uitgaven op `transaction`, dan blijft `savingsRate6m` ongewijzigd de uitkomst (mét de spaarbudget-/aflossingscorrectie die in `computeSavingsRate6m` zit); staat één van beide daar NIET op, dan geldt één uniforme (I − E) / I op de effectieve bedragen ZONDER die correctie — de correctie bestaat alleen omdat een RÚWE transactiesom spaarstortingen en aflossing ten onrechte meetelt, en een budget-uitgavensom bevat die per constructie niet (`BASIS_BUDGET_TYPE` telt uitsluitend `budget_type=\'expense\'`). Bewuste, aanvaarde gedragswijziging: ook de GEMENGDE combinatie (handmatig/budget-inkomen × transactie-uitgaven) valt nu onder de uniforme formule — voor gebruikers met `income_source=\'manual\'` en `expenses_source=\'auto\'` verschuift de spaarquote (en daarmee de FIRE-datum en de pijler Rondkomen) eenmalig. Elke kaart in het blok BENOEMT zijn eigen grondslag; dat is de harde voorwaarde waaronder een schuivend getal is toegestaan. Bronwaarde én uitsluitlijst landen in ÉÉN `PUT /api/parameters` — twee aanroepen zouden een waarneembare tussentoestand geven.',
    assertion: {
      kind: 'exact',
      expected:
        'autoBudget=3600/budget; transactieSlaatBudgetOver=3000/transaction; manualWint=2000/manual; terugvalProfiel=2000/profile; quoteBudgetgrondslag=25; quoteBeideTransactie=31',
      source:
        'lib/effective-financials.ts#resolveAmountWithBasis + lib/savings-source.ts#resolveSavingsSource (grondslag-tak) — echte productiefuncties, geen mirror; de opslag-invarianten (één PUT, eigen kolom) zijn vergrendeld in app/api/parameters/route.test.ts en app/api/feature-preferences/route.test.ts — zie cash-checks.ts',
    },
  },
  {
    workflow: 'WF-CASH-61',
    scenarioId: 'UAT-CASH-61',
    titel: 'Grenzenpot: reeksscore en prestatiebadge over afgesloten periodes (ADR 0089/0092)',
    kriticiteit: 'BELANGRIJK',
    given:
      'De pure motor `computeSpendLimitScore` (lib/spend-limits/engine.ts) op synthetische afgesloten periodes — géén persona-jitter, dus wél volledig narekenbaar. Drie situaties: (a) zes afgesloten maandperiodes met grens €500 en uitgaven 400/400/400/300/300/300 (alle binnen, dalend), (b) zes afgesloten periodes van €900 tegen diezelfde grens (alle overschreden, vlak), (c) slechts twee afgesloten periodes.',
    when:
      '`computeSpendLimitTrend` levert de richting en `computeSpendLimitScore(closedPeriods, trend, createdAt)` het cijfer; de badge leest `label` uit `SPEND_LIMIT_SCORE_THRESHOLDS` en de opbouwgrafiek de drie `components`.',
    then:
      'Het cijfer is 70% trefpercentage + 30% huidige reeks (geklemd op `SPEND_LIMIT_SCORE_MIN_PERIODS` = 3 periodes) ± 10 trendbonus, geklemd op [0, 100]. (a) alles binnen + dalende trend → 100, label "strak", trefpercentage 100%, basis 6 periodes. (b) alles boven de grens, reeks 0, vlakke trend → 0, label "los". (c) ONDER de ondergrens van 3 meetellende afgesloten periodes geeft de motor `score: null` en `label: null` met `basisPeriodCount: 2` — de badge toont dan géén cijfer in plaats van een verzonnen laag getal. De `components` zijn precies de drie waarden waarop het cijfer rust, zodat de opbouwgrafiek niet van het cijfer kan wegdrijven.',
    assertion: {
      kind: 'exact',
      expected:
        'scoreGoed=100; labelGoed=strak; hitRateGoed=100; basisGoed=6; scoreSlecht=0; labelSlecht=los; scoreTeWeinig=null; labelTeWeinig=null; basisTeWeinig=2',
      source:
        'lib/spend-limits/engine.ts#computeSpendLimitScore + computeSpendLimitTrend + SPEND_LIMIT_SCORE_THRESHOLDS/SPEND_LIMIT_SCORE_MIN_PERIODS — echte productiefuncties, geen mirror — zie cash-checks.ts',
    },
  },
  {
    workflow: 'WF-CASH-62',
    scenarioId: 'UAT-CASH-62',
    titel: 'Widget en cashflow-strip tonen hetzelfde saldo voor hetzelfde venster (bevinding H6)',
    kriticiteit: 'KERN',
    persona: 'daan',
    given:
      'Eén kalendermaand transactierijen die alle vier de assen raakt waarop de figures-strip op /overzicht/budget vroeger afweek van de canonieke maandmotor: (a) een POSITIEF bedrag met `is_income = false` (de kolom draagt geen CHECK tegen `sign(amount)` — 20260215000000_create_base_tables.sql r.229), (b) een `joint_transfer`-rij (de strip filterde alleen op `transfer`), (c) een rij zónder `account_id` (de strip scoopte op `.in(\'account_id\', accountIds)`), en (d) gewone in- en uitgaven. Daarnaast een profiel waarin de EFFECTIVE grondslag bewust ANDERE bedragen geeft dan de gerealiseerde maand — precies de situatie uit de bevinding (+€3.606 op /overzicht tegenover −€3.618 op /overzicht/budget).',
    when:
      'Het cashflow-widget op /overzicht leidt zijn netto af uit `DashboardData.currentMonthIncome/currentMonthExpenses` (het maandaggregaat) en de figures-strip uit `deriveRealMonthTotals` over dezelfde rijen; beide oppervlakken vragen daarna hun spaarquote op bij `currentMonthSavingsRate`.',
    then:
      'De twee oppervlakken leveren HETZELFDE saldo en DEZELFDE spaarquote, omdat ze één classificatie (het teken van `amount`), één transfer-definitie (`isRealAggRow`: transfer én joint_transfer) en één quote-formule (`savingsRateFromAggregates`) delen — en géén van beide op rekening scoopt. Het effective maandcijfer (`monthlyIncome − monthlyExpenses`) is bewust een ANDER getal en mag dat blijven: dat is een structurele maandwaarde, geen "deze maand". Voorwaarde waaronder dat verschil is toegestaan: elk oppervlak BENOEMT zijn venster — de widget-kicker draagt `currentMonthWindowLabel` ("Cashflow — augustus tot nu toe") en de strip draagt "gerealiseerd in … tot nu toe / … volledige maand". Huishouden- en partnerperspectief houden de effective grondslag (de overrides dragen geen `currentMonth*`) en zeggen dat in hun eigen label ("Cashflow per maand — Huishouden").',
    assertion: {
      kind: 'exact',
      expected:
        'stripSaldo=-2446.45; widgetSaldo=-2446.45; gelijk=true; stripQuote=-222.4; widgetQuote=-222.4; effectiefSaldo=1111; effectiefWijktAf=true',
      source:
        'lib/cashflow-month-totals.ts#deriveRealMonthTotals + lib/cashflow-cards.ts#currentMonthSavingsRate — échte productiefuncties, geen mirror; de venster-labels zijn vergrendeld in components/widgets/cash-flow-widget.test.tsx en de vier assen in lib/cashflow-month-totals.test.ts — zie cash-checks.ts',
    },
  },
]

const cardR7Criteria: AcceptanceCriterion[] = [
  {
    workflow: 'WF-CASH-63',
    scenarioId: 'UAT-CASH-63',
    titel: 'Rekening-zichtbaarheid voor de partner instellen: none/balance/full (ADR 0118)',
    kriticiteit: 'KERN',
    persona: 'daan',
    given:
      'Een huishouden met twee testaccounts. Vóór ADR 0118 (29-08-2026) was een gedeelde rekening voor de partner altijd volledig zichtbaar (transacties incluis, "Honeydue-model" ontbrak). Sinds ADR 0118 draagt `bank_accounts` een derde stand naast eigendom: `partner_visibility` (none/balance/full), met de DB-CHECK-constraint `bank_accounts_visibility_matches_ownership` (`none` hoort bij `personal`, `balance`/`full` bij `shared`) als harde vangrail onder een halve toestand.',
    when:
      'De gebruiker deelt een persoonlijke rekening (drieweg-toggle in `AccountFormModal`/`AccountVisibilityToggle`) en kiest daarna tussen "Alleen saldo" en "Ook boekingen"; de partner opent vervolgens het rekeningscherm en probeert op die rekening een bankbestand te importeren.',
    then:
      'Delen zet privacy-by-default op "Alleen saldo" (`balance`), NIET automatisch "Ook boekingen" (`full`) — wie ook de boekingen wil delen zet dat als tweede, expliciete stap. Een latere, ongerelateerde wijziging (bv. de naam) op een `full`-rekening zet de zichtbaarheid niet stil terug naar `balance`. Terugzetten naar "Alleen ik" forceert altijd `none`. `ownership` en `partner_visibility` gaan ALTIJD als één PATCH-blok (`PUT /api/bank-accounts/[id]` met alléén het zichtbaarheidsveld — de server leidt `ownership` af); een rij van vóór de migratie (kolom ontbreekt) volgt gewoon zijn bestaande `ownership`. De poort ligt op LEES-tijd (RLS + `household_partner_items()`), niet op schrijf-tijd: een terugschakeling `full → balance` werkt met terugwerkende kracht. IMPORT-GATE (dedup-laag 1b breekt anders stil): op een rekening die niet op `full` staat ziet de partner de bestaande boekingen niet via RLS, dus een import door de partner zou dubbele rijen wegschrijven — de server weigert dat expliciet (403, `POST /api/transactions/import`) en de import-pagina laat zo\'n rekening al niet in de keuzelijst staan; de rekeninghouder zelf mag altijd importeren, ongeacht de gekozen zichtbaarheid.',
    assertion: {
      kind: 'exact',
      expected:
        'ownershipNone=personal; ownershipBalance=shared; ownershipFull=shared; visibilityBijDelen=balance; defaultIsBalance=true; visibilityBlijftFull=full; visibilityBijPersoonlijk=none; kolommenVoorFull=shared/full; oudeRijPersonal=none; oudeRijShared=balance; eigenaarOpBalance=true; partnerGeblokkeerdOpBalance=true; partnerToegestaanOpFull=true; rijOpBalance=personal; rijOpFull=shared',
      source:
        'lib/bank-account-visibility.ts#ownershipForVisibility/visibilityForOwnership/ownershipWriteColumns/normalizePartnerVisibility/rowOwnershipForImport (échte productiefuncties) + de importgate in app/api/transactions/import/route.ts (POST, gespiegeld) — zie cash-checks.ts',
    },
  },
  {
    workflow: 'WF-CASH-64',
    scenarioId: 'UAT-CASH-64',
    titel: 'Grenzenpot-tempo: "x% van de maand voorbij · y% gebruikt" en het prognosebedrag vanaf 3 afgesloten periodes (ADR 0119)',
    kriticiteit: 'BELANGRIJK',
    persona: 'daan',
    given:
      'Een maandpot (limiet €500) op zaterdag 8 augustus 2026 (dezelfde ankerdatum als WF-CASH-53), met drie afgesloten 30-dagen-basisperiodes van €300/€600/€900 (basistempo (300+600+900)/(30+30+30) = €20/dag) en €200 al gerealiseerd deze lopende maand (31 dagen). VOORHEEN bestond er geen tijd-as voor de lopende periode — alleen het gerealiseerde bedrag t.o.v. de grens, zonder te tonen hoe ver de periode zelf al was.',
    when:
      'De gebruiker leest de pot in de sectie, de prestatiepane en de widget; deze regel is puur informatief en stuurt bewust GEEN status, melding, reeks of score aan (die blijven op gerealiseerde bedragen).',
    then:
      'De tempo-regel toont "26% van augustus 2026 voorbij · 40% van je grens gebruikt" (elapsedFraction = 8/31 dagen, usedFraction = 200/500) — géén bedrag in deze zin, dus zichtbaar onder bedragmaskering (ADR 0091). Het prognosebedrag ernaast (WEL een bedrag, maskeert dus mee) = gerealiseerd + resterende dagen(23) × basistempo(€20) = €660, en dat ligt boven de grens (`projectedExceeds=true`). Het prognosebedrag draagt dezelfde aanmaak-ondergrens als de trend/score (`SPEND_LIMIT_PACE_MIN_PERIODS`=3 meetellende afgesloten periodes): met slechts 2 basisperiodes blijft `projectedAmount` `null` en toont het oppervlak alléén de tempo-markering. Dag- en weekpotten krijgen BEWUST geen tempo (`SPEND_LIMIT_PACE_PERIODS` = maand/kwartaal/jaar) — bij een dagpot ís de korrel de periode, en zeven punten bij een week zijn te ruisgevoelig (productkeuze, geen technische beperking).',
    assertion: {
      kind: 'exact',
      expected:
        'periodDays=31; elapsedDays=8; remainingDays=23; elapsedFractionPct=26; usedFractionPct=40; baselineDailyAmount=20; basisPeriodCount=3; projectedAmount=660; projectedExceeds=true; zin=26% van augustus 2026 voorbij · 40% van je grens gebruikt; teWeinigProjected=null; teWeinigBasis=2; dagPotHeeftGeenPace=null',
      source:
        'lib/spend-limits/engine.ts#computeSpendLimitPace + lib/spend-limits/status-display.ts#describeSpendLimitPace (échte productiefuncties, synthetische invoer, geen mirror) — zie cash-checks.ts',
    },
  },
  {
    workflow: 'WF-CASH-65',
    scenarioId: 'UAT-CASH-65',
    titel: 'Gedeelde boeking markeren als "Te bespreken" met je partner (ADR 0128, partner-samenwerkingslaag fase 1)',
    kriticiteit: 'BELANGRIJK',
    persona: 'daan',
    given:
      'Een huishouden met twee testaccounts (daan + partner): een gedeelde rekening op `partner_visibility=\'full\'` met een gedeelde boeking, en een tweede gedeelde rekening op `\'balance\'`. Tabel `transaction_flags` (migratie 20260903120000) herhaalt de zichtbaarheidsregel NIET — elke policy vraagt via de SECURITY INVOKER-helper `transaction_flag_transaction_visible()` of de aanroeper de boeking zélf mag zien (dezelfde SELECT-policy als `transactions`, incl. `partner_visibility`); schrijven is strenger (`transaction_flaggable()`: gedeeld + eigen huishouden + rekening op `full`).',
    when:
      'De gebruiker opent op /overzicht/budget/transacties een gedeelde boeking (bewerkformulier) en kiest "Bespreken met {partner}", optioneel met een notitie (max 500 tekens) → `POST /api/transaction-flags`. Later: "Besproken" (`PATCH` status=resolved), "Intrekken" (`DELETE`), opnieuw markeren van een afgeronde boeking, en de rekeninghouder zet `full` terug naar `balance`.',
    then:
      'De boeking verschijnt bij BEIDE partners in de server-geladen sectie "Te bespreken met {partner}" (`loadTransactionFlags`, ADR 0058) met melder ("jij"/partnernaam via `flaggedByLabel`) en notitie; de teller in het sectielabel = aantal open vlaggen. "Besproken" haalt hem uit de open-lijst en telt mee in `resolvedCount` ("n eerder besproken"). "Intrekken" (DELETE) staat alleen op de eigen vlag (`eq(flagged_by, user.id)`, 404 bij andermans vlag). Opnieuw markeren van een afgeronde boeking heropent dezelfde rij (unique constraint op `transaction_id` → 23505 → server zet `status=\'open\'` terug op dezelfde rij, geen nieuwe). Op de \'balance\'-rekening (of een persoonlijke boeking) weigert de INSERT-policy (42501/23503) en de route antwoordt 403 met de leesbare tekst "Deze boeking kun je niet met je partner bespreken: alleen gedeelde boekingen op een rekening waarvan ook de boekingen zichtbaar zijn." Zet de rekeninghouder \'full\' terug naar \'balance\', dan verdwijnt de vlag voor de partner op hetzelfde leesmoment als de boeking zelf (RLS erft van transactions, geen backfill) — de melder blijft zijn eigen vlag zien (eigen data, geen lek). Solo-gebruiker (`ctx.hasHousehold=false`): `loadTransactionFlags` geeft `null`, sectie en knop verschijnen niet. Vlaggen/notities worden door geen enkele context-builder geconsumeerd en bereiken dus nooit briefing/chat (K3).',
    assertion: {
      kind: 'ui-only',
      source:
        'DB-mutatiegedrag over meerdere Supabase-rondes zonder eigen pure rekenfunctie (RLS-geërfde zichtbaarheid + route-foutvertaling), zoals WF-CASH-45/47/58: lib/household/transaction-flags.ts#loadTransactionFlags/composeFlagItems/flaggedByLabel (server-loader) + app/api/transaction-flags/route.ts (POST/PATCH/DELETE) + supabase/migrations/20260903120000_transaction_flags.sql (transaction_flag_transaction_visible/transaction_flaggable, transaction_flags_guard, RLS-policies) + docs/adr/0128-partner-review-vlag-volgt-de-zichtbaarheid-van-de-boeking.md',
    },
  },
  {
    workflow: 'WF-CASH-66',
    scenarioId: 'UAT-CASH-66',
    titel: 'TrueLayer-sync stempelt ownership van de dragende rekening en ontdubbelt tegen de partner op een en/of-rekening',
    kriticiteit: 'KERN',
    persona: 'daan',
    given:
      'Een en/of-rekening (`bank_accounts.ownership=\'shared\'`), gekoppeld door beide partners: dat levert TWEE dragende `bank_accounts`-rijen op (één per koppelende partner) met hetzelfde `iban_hash`. `transactions.ownership` heeft kolomdefault `\'personal\'`; de SELECT-policy toont een partnerrij alléén bij `ownership=\'shared\'`.',
    when:
      'De gebruiker synchroniseert een en/of-rekening waarop de partner dezelfde boekingen al eerder zelf heeft gesynchroniseerd of geïmporteerd op zijn EIGEN dragende rij (ander `account_id`, zelfde `iban_hash`).',
    then:
      'Elke nieuw ingevoegde rij draagt `ownership: \'shared\'` wanneer de dragende rekening `bank_accounts.ownership=\'shared\'` is (conservatieve terugval op `\'personal\'` als die rij niet leesbaar is — nooit geraden gedeeld). Vóór het invoegen zoekt de sync via `loadHouseholdSiblingAccountIds` (zelfde `iban_hash`, andere `user_id`, actief) de en/of-broertjes van de dragende rekening op, en haalt via `loadHouseholdSharedHashes` de `import_hash`-set van de partner op die rekeningen op (`ownership=\'shared\'`, `neq user_id`, binnen het datumvenster van deze sync). Een boeking die daarin voorkomt wordt NIET nogmaals ingevoegd en telt apart mee als `duplicates_household_partner` (niet in de generieke `duplicates`-teller, zodat "niets nieuws" en "de partner had het al" onderscheidbaar blijven). Op een persoonlijke rekening (`ownership=\'personal\'`) is dit pad een no-op: de siblings-lookup levert een lege set en niets verandert.',
    assertion: {
      kind: 'ui-only',
      source:
        'app/api/bank-connect/sync/route.ts (accountOwnership-afleiding uit de dragende `bank_accounts`-rij + `ownership` op elke insert + laag-1b-filter met `duplicates_household_partner`) + lib/truelayer/existing-hashes.ts#loadHouseholdSiblingAccountIds/loadHouseholdSharedHashes — DB-mutatie + RLS-afhankelijke zichtbaarheid, geen pure functie; spiegelt dezelfde laag-1b-aanpak als `/api/transactions/import` (WF-CASH-63).',
    },
  },
]

criteria.push(...cardR7Criteria)

export const CASH_ACCEPTANCE: AcceptanceSet = {
  zone: 'CASH',
  criteria,
}
