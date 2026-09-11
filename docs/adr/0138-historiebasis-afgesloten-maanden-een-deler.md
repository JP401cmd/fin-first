---
id: 0138-historiebasis-afgesloten-maanden-een-deler
title: 'De historiebasis: alleen afgesloten maanden, en één deler per gebruiker voor budgetsom en transactie-jaarinkomen'
status: aanvaard
date: 2026-09-11
elements: [as-budget, as-transacties, as-planning, as-belasting, fn-budgetteren]
---

De budgetgrondslag (ADR 0103) en het transactie-jaarinkomen meten sinds dit
besluit over twaalf **afgesloten** kalendermaanden — de lopende maand telt pas
mee zodra hij voorbij is — en delen door **één** deler per gebruiker: het aantal
afgesloten maanden met transactiehistorie in dat venster, geklemd op 1..12
(`lib/history-basis.ts`). De leeftijd van een budget (`budgets.created_at`)
speelt geen rol meer. Aanvulling op ADR 0103 en ADR 0121.

# 0138 — De historiebasis

## Context

Twee meldingen van testgebruikers op 11 september 2026, één oorzaak.

**B-041 (`/overzicht`)** — "Baseer de spaarquote op de gegevens tot en met
afgelopen maand. Nu verschuift de spaarquote gedurende de maand." De effectieve
spaarquote (`effectiveSavingsRatePct`, ADR 0121) volgt de gekozen grondslag. Op
de transactiegrondslag was hij al stabiel (zes afgesloten maanden, bevinding C6).
Op de budget- of gemengde grondslag — de standaard zodra er budgetten zijn — kwam
de uitgavenkant uit de budgetsom, en die telde het rollende 12-maandsvenster
**inclusief de lopende maand**. Het transactie-jaarinkomen deed hetzelfde: een
som tot en met de lopende maand (`getTxAgg12m`) boven een deler die alleen
afgesloten maanden telde. Een halfvolle, asymmetrisch gevulde maand (vaste lasten
rond de 1e, salaris rond de 25e) schoof zo dagelijks door de quote.

**B-045 (`/overzicht/budget/instellingen`)** — een testtransactie van €1.200 op
het budget "dieren" gaf "€300 per maand, berekend over 4 maanden". De deler was
**per budget** de leeftijd sinds `created_at` (clamp op de spanwijdte van de
boekingen als ondergrens, 1..12). Een budget van drie maanden oud kreeg deler 4;
een ouder budget met dezelfde boeking deler 12. Dezelfde boeking, twee
antwoorden — en geen enkele die iets zei over hoeveel historie de gebruiker
werkelijk heeft.

Daarbij bestond de telling "afgesloten maanden sinds de vroegste boeking" al
drie keer: `savingsRateDataMonths` (6-maands spaarquote), `extrapolateAnnualIncome`
(12-maands inkomen, all-time vroegste *inkomsten*datum) en een inline-kopie in
`lib/core-data-loader.ts`.

## Besluit (eigenaar, 11 sep 2026)

1. **Alleen afgesloten maanden.** Het realisatievenster van de budgetgrondslag
   én de som voor het transactie-jaarinkomen lopen van twaalf maanden terug tot
   en met de vorige maand. De lopende maand telt niet mee — niet in de sommen,
   niet in de deler. Een boeking van vandaag telt pas zodra de maand is
   afgesloten.
2. **Eén deler per gebruiker.** `historyMonths` = het aantal afgesloten
   kalendermaanden sinds de vroegste transactie van welke soort dan ook in het
   venster, geklemd op 1..12, voor **alle** budgetten (inkomsten- én
   uitgavenkant) én voor het transactie-jaarinkomen. Heeft iemand transacties
   tot elf maanden terug, dan geldt 11 voor alles; meer dan een jaar → 12.

Daaruit volgend, in de code:

- `lib/history-basis.ts` is de **ene home** van het venster (`historyMonthKeys`),
  de deler (`historyMonthsFromRows`, `clampHistoryMonths`, `closedMonthsSince`) en
  de schaalformule (`annualizeHistorySum`). `HISTORY_WINDOW_MONTHS = 12` in
  `lib/constants.ts`.
- `fetchRealizedBudgetAmounts` (`lib/budget-realized.ts`) bevraagt het
  afgesloten venster (drie chunks van vier maanden die eindigen op de 1e van de
  lopende maand) en levert op het venster `historyMonths`, `windowIncome`
  (Σ positief over het hele venster, transfer-gefilterd én transfer-inclusief)
  en `byMonth` (in-/uitstroom per maand, transfer-gefilterd, ongeacht budget).
  `transactionAnnualIncome(realized, { includeTransfers })` schaalt die som met
  dezelfde deler.
- **Reeks op afgesloten maanden** (eigenaarsbesluit 11 sep 2026, na de
  golf-2-review): `CorePageData.monthlyIncomeExpenseSeries` en
  `CorePageData.incomeByMonth` komen uit `realized.byMonth` — twaalf afgesloten
  slots. Daarmee toont de inkomen-kassabon op de cash-pagina rijen, subtotaal,
  deler en "Geschat jaarinkomen" uit één venster (rijen ÷ N × 12 = het totaal),
  en toont de transactie-kassabon in het instellingenblok met `.slice(-6)`
  exact de zes afgesloten maanden waarop `savingsRate6m` rekent (C6) en met
  "Totaal (12 afgesloten mnd)" de twaalf maanden waarop het jaarinkomen staat.
  De lopende maand is een "tot nu toe"-grootheid (`currentMonth*`, ADR 0073),
  geen reeks-slot.
- **Snapshots** — de drie schrijvers naar `net_worth_snapshots` (POST
  `/api/snapshots`, GET `/api/snapshots/auto`, de cron) voeden het
  transactie-jaarinkomen van `resolveSavingsSource` met
  `transactionAnnualIncome(realized)` in plaats van `monthlyIncome × 12` (een
  6-maands gemiddelde), zodat een nachtelijke snapshot vroeg in de maand geen
  andere `savings_rate` wegschrijft dan het dashboard toont.
- **Huishoudprojectie** (`lib/household-projection.ts`) consumeert dezelfde
  `transactionAnnualIncome(realized, { includeTransfers: true })` als de
  /toekomst-hero in plaats van een eigen dag-venster met eigen deler-klem — één
  FIRE-leeftijd per persoon op dezelfde pagina.
- `computeBudgetBasis` deelt elke gerealiseerde post door `realized.historyMonths`;
  `resolveDenominatorMonths` op `created_at`/spanwijdte is weg, net als
  `BudgetRealizedEntry.coveredMonths`.
- `loadBudgetBasis` geeft naast beide kanten ook `realized` terug. De vijf
  server-oppervlakken die het transactie-jaarinkomen samenstellen (dashboard-,
  core-, horizon-, lever-scores-loader en `loadForecastSectionData`) én
  `/api/uitgaven-na-pensioen/context` consumeren `transactionAnnualIncome` uit
  dat venster. De inline-kopie in `core-data-loader` is verdwenen;
  `CorePageData.incomeMonths` ís nu `historyMonths`.
- `deriveRetirementExpenseBasis` neemt het transactie-jaarinkomen kant-en-klaar
  aan (`transactionAnnualIncome`) en rekent er niet meer zelf aan.
  `extrapolateAnnualIncome` blijft bestaan als **client-terugval**
  (`horizon-client` zonder bundel): dezelfde schaalformule, met de all-time
  vroegste inkomstendatum als anker omdat de client het venster niet heeft; zijn
  rauwe query loopt nu ook tot de 1e van de lopende maand.

**Bewust ongewijzigd.** De transactiegrondslag van de spaarquote
(`savingsRate6m`, zes afgesloten maanden, `savingsRateDataMonths`) — een andere
grootheid met een eigen venster (C6). De "deze maand"-weergaven (`currentMonth*`,
ADR 0073) en het rollende dagtarief (`EXPENSE_RATE_ROLLING_MONTHS`, inclusief de
lopende maand). Het gedeelde 12-maands aggregaat `getTxAgg12m` (t/m de lopende
maand): dat voedt tien consumers die de lopende maand wél horen te zien; het
afgesloten venster is een eigen fetch, geen verschoven gedeeld venster.

**Interpretatie "sinds de vroegste transactie".** De deler wordt afgeleid uit
dezelfde aggregaat-rijen die de realisatie al ophaalt: de vroegste maand mét een
boeking *in het venster*. Geen extra query, en op het service-role-pad
(snapshot-cron) automatisch dezelfde scope als de rijen zelf. Voor iedereen
zonder gat aan de vensterrand is dit identiek aan de all-time vroegste
transactie; bij meer dan een jaar historie klemt de bovengrens beide op 12. Het
enige verschil is een gat dat de vensterrand overspant — dan telt de
historiebasis de maanden mét data, wat voor een maandgemiddelde het eerlijker
antwoord is.

## Gevolgen

- **Spaarquote (`effectiveSavingsRatePct`)** — op de budget- en gemengde
  grondslag stabiel binnen de maand: teller en noemer komen uit hetzelfde
  afgesloten venster en delen dezelfde deler, dus (I − E)/I is onafhankelijk van
  de deler en van de dag van de maand. Verspringt alleen op de maandwissel.
- **Budget-maandgemiddelden** — "€1.200 op dieren" is €1.200/N per maand, met N
  de historie van de gebruiker, voor élk budget hetzelfde. De kassabon zegt dat
  één keer onder het totaal ("Gemeten over N maanden en doorgerekend naar een
  heel jaar"); de per-post-regel "gemeten over N maanden" is vervallen (die zou
  twaalf keer hetzelfde feit herhalen). Radio-hints en de kassabon-koppen
  benoemen "afgesloten maanden"; rijen, totaal en "≈ €X/mnd" beschrijven
  hetzelfde venster.
- **FIRE-uitgaven (`yearlyExpenses`)**, **runway (`monthsCovered`)** en het
  **bruto Box 1-inkomen** consumeren de effectieve bedragen en volgen dus
  automatisch; er is geen tweede som. Bij `retirement_expense_method =
  'current_income'` verschuift het FIRE-doel mee met het jaarinkomen.
- **Eenmalige getalsverschuiving**: iedereen op een budget- of gemengde
  grondslag ziet de budgetsom en het transactie-jaarinkomen één keer verspringen
  (de lopende maand valt eruit, de deler wordt gebruiker-breed). Nieuwe snapshots
  schrijven de nieuwe waarde; historische rijen blijven staan (zelfde regel als
  ADR 0103, geen backfill).
- **Terugvalgedrag** — een gebruiker zonder afgesloten maand met transacties
  houdt de bestaande terugval: elke post op de geplande limiet, het
  transactie-jaarinkomen 0 en dus de profielschatting (met zichtbare grondslag).
  Geen deling door nul, geen quote van een halve maand. Faalt een
  aggregaat-chunk, dan valt het hele venster terug op leeg — nu ook het
  transactie-jaarinkomen (0 → profiel), consistent met "geen halve waarheid".
- **Parity** — de forecast-parity- en spaarquote-parity-suites blijven de twee
  loaderpaden tegen dezelfde fixtures houden; gouden waarden die op het oude
  venster stonden zijn bewust herijkt, met uitleg in de suite.
- **Trend-achtergrond hefboomkaarten** — leest dezelfde reeks en verliest dus
  het (halve) slot van de lopende maand; dat is dezelfde correctie, geen tweede
  (besloten door de eigenaar op 11 sep 2026, was eerst een open punt).
