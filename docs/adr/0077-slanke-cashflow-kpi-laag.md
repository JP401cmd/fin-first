---
id: 0077-slanke-cashflow-kpi-laag
title: 'Een slanke cashflow-KPI-laag ontstaat door extractie van de bestaande afleidingen, niet door herberekening'
status: aanvaard
date: 2026-08-03
elements: [as-budget, fn-budgetteren]
---

# 0077 — Slanke cashflow-KPI-laag: extraheren, niet herberekenen

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
- De omzetting van `app/(app)/overzicht/cashflow/page.tsx` en
  `app/api/overzicht/cashflow-status/route.ts` naar de slanke laag is bewust een
  **volgende** stap; dit besluit legt alleen de fundering.
