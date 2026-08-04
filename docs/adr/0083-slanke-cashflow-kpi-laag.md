---
id: 0083-slanke-cashflow-kpi-laag
title: 'Een slanke cashflow-KPI-laag ontstaat door extractie van de bestaande afleidingen, niet door herberekening'
status: aanvaard
date: 2026-08-03
elements: [as-budget, fn-budgetteren]
---

# 0083 — Slanke cashflow-KPI-laag: extraheren, niet herberekenen

## Context

`/overzicht/cashflow` heeft een TTFB-p75 van 8,8 s (desktop) en 22,3 s (mobiel).
De dominante oorzaak is niet de pagina zelf maar haar databron:
`buildCashflowCards` (`lib/cashflow-cards.ts`) krijgt de volledige
`DashboardData` binnen en gebruikt daaruit precies **zeven scalars**:

| Scalar | Grondslag |
|---|---|
| `budgetTotals.expense.limit` / `.spent` | budgetten + huidige-maand-transacties |
| `monthSummary.budgetScore` | afgeleid uit `budgetTotals` |
| `budgetingActive` | profiel |
| `currentMonthIncome` / `currentMonthExpenses` | 12-maands maandaggregaat |
| `monthlyIncome` / `monthlyExpenses` | effective (profiel + rauwe maand-tx) |

Om die zeven te krijgen draait de pagina de hele `loadDashboardData`: ~40
queries in 5-6 seriële golven, plus — en dat is de dure staart — een **koude
horizon-tak** (`computeHorizonFireSim` → `loadHorizonData`, nog eens ~17 queries
plus een bisectie-solve). Op `/overzicht` is die tak warm omdat de pagina hem
toch al laadt; op de cashflow-hub betaalt de gebruiker hem volledig, voor zeven
getallen die er niet van afhangen.

De zeven scalars hangen in werkelijkheid aan **vier fetches**, die alle vier al
`cache()`-gedeeld zijn: `getOwnProfile`, `getBudgets`, `getCurrentMonthTx`
(`lib/server-data/base.ts`) en `getTxAgg12m`
(`lib/server-data/tx-aggregates.ts`). De afleidingen zelf zijn pure JS.

## Besluit

**De bestaande afleidingscode wordt VERPLAATST naar pure helpers in
`lib/cashflow-kpis.ts`, en `lib/dashboard-data-loader.ts` consumeert diezelfde
helpers.** Daarbovenop staat één slanke, `cache()`-gewrapte `loadCashflowKpis`
die de vier gedeelde fetches doet en `CashflowCardScalars` teruggeeft.

Dat is de anti-drift-garantie van dit besluit: er is **één implementatie**, geen
tweede rekenweg. Een parity-belofte in een comment zou dat niet zijn — precies
de fout die de consistentie-audit (`docs/eenduidige-gegevens-audit.md`) op 10+
plekken vond en die in de spaarquote-keten al eens tot twee getallen voor één
definitie heeft geleid.

Verplaatst (gedragsneutraal, regel voor regel):

- `buildBudgetTypeMap` + `deriveBudgetTotals` — de budget-type-map, de
  kind-oprol van limieten en de interval→maand-normalisatie.
- `deriveBudgetScore` — het gemiddelde over álle vier de budget-types met
  `limit > 0`.
- `deriveRealMonthTotals` — de `isRealTx`-pass over de rauwe huidige-maand-tx.
- `resolveBudgetingActive` en `currentMonthKey` — de twee eenregelige
  afleidingen die anders per definitie op twee plekken zouden staan.

De `currentMonth*`- en effective-velden krijgen **geen** nieuwe code: ze lopen
via de bestaande `aggIncomeByMonth`/`aggExpenseByMonthAbs` respectievelijk
`resolveEffectiveIncomeExpenses`.

### `DashboardData` blijft structureel een superset van `CashflowCardScalars`

Het retourtype is opzettelijk *smaller* dan wat de bundel biedt
(`budgetTotals` met alleen `expense`, `monthSummary` met alleen `budgetScore`).
`DashboardData` is er daarmee structureel aan toewijsbaar, dus het versmallen van
de eerste parameter van `buildCashflowCards` laat **alle bestaande callsites
ongewijzigd compileren**. De omzetting van pagina en status-route naar
`loadCashflowKpis` is daardoor een eigen, los terug te draaien stap.

### De asymmetrie tussen de twee grondslagen blijft bewust bestaan

`currentMonthIncome`/`-Expenses` komen uit het **maandaggregaat**;
`monthlyIncome`/`-Expenses` uit de **rauwe** huidige-maand-rijen (mét
`isRealTx`, en dus mét de stille PostgREST-`max_rows`-cap van 1000) door
`resolveEffectiveIncomeExpenses` heen. Dat is bestaand gedrag en het **moet
blijven**: de Transacties-kaart hoort op de gerealiseerde maand (ADR 0073), de
Vaste-lasten-kaart juist op het stabiele effective inkomen. Gelijktrekken zou de
vaste-lasten-kaart op de cashflow-hub laten afwijken van `/overzicht`.

Om diezelfde reden wordt de 1000-rijen-cap op de rauwe pass hier **niet
gerepareerd**: `getCurrentMonthTx` draagt hem vandaag óók op `/overzicht`.
Repareren in alleen de KPI-laag zou nieuwe drift maken; dat is een eigen
wijziging, op beide paden tegelijk.

## Alternatieven

- **`loadDashboardData` in lagen opsplitsen.** ~2.600 regels en tientallen
  consumers: een eigen refactor-traject met een veel groter regressierisico, en
  voor dit doel overbodig. Bewust niet gekozen.
- **De zeven scalars zelfstandig herberekenen in een nieuwe loader.** Sneller te
  schrijven, maar dan bestaan er twee implementaties van dezelfde formules die
  bij de eerste wijziging uiteenlopen zonder dat er iets rood wordt — de
  overtreding die de "consume, don't recompute"-regel juist verbiedt.
- **Alleen de horizon-tak lui maken in `loadDashboardData`.** Adresseert de
  duurste staart, maar laat de resterende ~40 queries staan voor zeven getallen,
  en maakt het gedrag van de bundel afhankelijk van wie 'm aanroept.

## Gevolgen

- `lib/cashflow-kpis.ts` is de enige plek waar de budget-oprol, de
  dekkings-score en de maand-passes leven; `lib/dashboard-data-loader.ts`
  consumeert ze. Wie er één wijzigt, wijzigt per definitie beide paden.
- `lib/cashflow-kpis.parity.test.ts` draait `loadDashboardData` en
  `loadCashflowKpis` op dezelfde fixtures en vergelijkt alle zeven velden —
  inclusief een `income_source = 'manual'`-fixture (de ADR-0073-bug), een
  >1000-rijen-getuige en een maandgrens-fixture.
- `loadCashflowKpis` is RLS-client-only, net als de fetchers eronder: nooit met
  `getServiceClient()` aanroepen.
- **Alle vier de cashflow-oppervlakken draaien inmiddels op de slanke laag.** Dit
  besluit legde de fundering; de omzetting volgde in dezelfde reeks. De hub gaat
  via `components/overview/cashflow-cards-loader.tsx` (T2.2), de sidebar-dots via
  `app/api/overzicht/cashflow-status/route.ts` (T2.3), de vaste-lasten-pagina via
  `app/(app)/overzicht/cashflow/vaste-lasten/vaste-lasten-loader.tsx` (T2.4) en de
  forecast-pagina via `loadForecastSectionData` (T2.5, zie de uitbreiding
  hieronder). Geen van deze vier raakt `loadDashboardData` nog aan.

## Uitbreiding — de forecast-pagina (T2.5, 4 aug 2026)

`/overzicht/cashflow/forecast` (TTFB-p75 8,8 s, LCP 10,9 s desktop) was de
laatste pagina op de volle bundel. `CashflowSection` leest daaruit **vijf ándere
velden**: `monthlyIncome`, `monthlyExpenses`, `savingsRate6m`, `savingsHistory`
en `expenseHistory`.

Dat is een aparte loader geworden — `loadForecastSectionData`, met een eigen
retourtype `CashflowSectionScalars` — en **geen** uitbreiding van
`CashflowCardScalars`. Reden: de vier extra fetches die alleen `savingsRate6m` en
`savingsHistory` nodig hebben (schulden, bezittingen, vroegste-inkomsten-datum,
`net_worth_snapshots`) zouden anders de hub en de vaste-lasten-pagina — die
uitsluitend de zeven kaart-scalars lezen — vier queries duurder maken voor niets.
Acht gedeelde `cache()`-fetches in één golf, dus op een request waar beide
loaders draaien overlappen ze volledig.

`net_worth_snapshots` is daarvoor een gedeelde fetcher geworden
(`getNetWorthSnapshots12m`, `lib/server-data/base.ts`), zodat de dashboard-bundel
en deze laag binnen één request dezelfde rijen delen. De ondergrens komt daarbij
uit `localMonthStartMonthsAgo` in plaats van uit het TZ-onveilige
`Date.UTC(...).toISOString()` dat de loader er had — zelfde `YYYY-MM-01`.

### Het gevaarlijke veld: `savingsRate6m` heeft twee fallbacks

`savingsRate6m` is een **kerngetal** dat óók op `/overzicht` en in het
instellingenblok staat; een tweede rekenweg zou daar direct twee spaarquotes
opleveren. De keten bestaat uit drie lagen, en alle drie zijn verplaatst naar
`resolveSavingsRate6m` (`lib/cashflow-kpis.ts`), dat `loadDashboardData`
consumeert:

1. de transactie-formule met extrapolatie <6 mnd, spaarbudget-correctie en
   schuldaflossing (`computeSavingsRate6m`, `lib/savings-source.ts`);
2. de **profiel-fallback** wanneer die formule 0 geeft;
3. de **net-vermogen-delta-tak** — is (2) van toepassing én zijn er ≥2 snapshots
   én is het effectieve maandinkomen > 0, dan wint de gemeten vermogensgroei
   minus de verwachte koerswinst (`computeSavingsRateFromNetWorthDelta`,
   `lib/core-metrics.ts`).

Die derde tak is op dit pad écht bereikbaar (een gebruiker zonder
transactie-inkomen mét snapshots is een gewoon account), sleept precies één extra
fetch mee die niet al nodig was — de bezittingen, voor de koerswinst — en leunt
zelf nergens op de bundel. `isEstimate` blijft bewust de uitspraak van de
*aggregaat*-formule, óók als de delta-tak een getal levert.

### De twee historieën hebben verschillende bronnen

`expenseHistory` komt uit het 12-maands **maandaggregaat** (sleutel `YYYY-MM`);
`savingsHistory` uit **`net_worth_snapshots.savings_rate`** (sleutel = de volle
`snapshot_date`). Dat lijken twee vormen van hetzelfde en is het niet — ze op
elkaar "gelijktrekken" zou de spaarquote-sparkline stil van bron laten wisselen.

`lib/cashflow-kpis.forecast-parity.test.ts` draait beide paden end-to-end over
vijf fixtures: aggregaat-pad, **delta-fallback actief**, `income_source =
'manual'`, maandgrens, en een lege maand midden in de reeks met door-elkaar
staande rijen. Omdat beide paden dezelfde helpers consumeren bewijst die
pariteit alleen de bedrading; de semantiek staat eronder vastgepind in
waarde-getuigen met harde literals.
