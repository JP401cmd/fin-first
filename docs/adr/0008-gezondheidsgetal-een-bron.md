---
id: 0008-gezondheidsgetal-een-bron
title: Het gezondheidsgetal kent één canonieke berekening
status: aanvaard
date: 2026-06-12
elements: [as-planning]
---

De financiële gezondheidsscore (0–100, 7-pijler) heeft één canonieke berekening: `computeHealthScoreFromInputs` (lib/financial-health.ts) op een input die door één gedeeld pad wordt gebouwd (`buildHealthScoreInput` in lib/health-score-input.ts). Het "huidige" getal is overal live berekend; `net_worth_snapshots.resilience_score` is uitsluitend historie voor de trendlijn op /toekomst — geen tweede waarheid voor het huidige getal.

## Context
Het gezondheidsgetal kende twee bronnen. De live berekening (loader + client-recompute op /overzicht) en de opgeslagen `net_worth_snapshots.resilience_score`, die door drie snapshot-routes (`app/api/snapshots`, `…/cron`, `…/auto`) werd weggeschreven met *proxy-inputs*: noodfonds als assets×0,3, lege budgetcategorieën, geen Box 3-context, en een freedomPct uit een tweede berekenpad. Daardoor kon de opgeslagen score divergeren van de live score die de gebruiker op /overzicht en in de kassabon-receipts ziet.

## Besluit
Eén canonieke berekening. De gedeelde, pure module `lib/health-score-input.ts` (`buildHealthScoreInput` + `computeEmergencyFundMonths` / `buildTaxData` / `buildBudgetCategories`) bouwt de canonieke `HealthScoreInput`, en wordt nu gebruikt door `lib/horizon-data-loader.ts`, de client-recompute in `horizon-client.tsx` én alle drie snapshot-schrijfpaden — `app/api/snapshots` (POST), `…/auto` en `…/cron`. Loader en routes delen daarmee letterlijk hetzelfde pad. `resilience_score` is gedegradeerd tot zuivere historie voor de trendlijn.

De fire-pijler van de health-score krijgt als `freedomPct`-input de **per-rij snapshot-`freedom_percentage`** (vol vermogen ÷ essentiële jaarlasten/SWR, huis meegerekend, géén housing-/FIRE-strategie-filter en géén unified-projection). Dat is bewust de vol-vermogen-grondslag van ADR 0009's uitzonderingenlijst — de snapshot-historie houdt per rij `net_worth` ↔ `freedom_percentage` ↔ fire-pijler intern consistent — en kan dáárdoor afwijken van de live fire-pijler, die wél de strategy-adjusted FIRE-eligible grondslag (`computeFreedomProgress`) gebruikt. Het opgeslagen `net_worth` zelf is over de drie routes identiek en canoniek: inclusion-gewogen assets + losse cash − inclusion-gewogen debts (gedeelde helpers in `app/api/snapshots/snapshot-math.ts`, spiegelt `lib/dashboard-data-loader.ts`).

## Gevolgen
Het huidige gezondheidsgetal is per definitie overal hetzelfde, ongeacht of het live (user-context) of in een snapshot (service-role/cron) wordt berekend. Nieuwe pijlers of aannames veranderen op één plek (financial-health.ts + health-score-input.ts) en slaan automatisch door naar de snapshots. `resilience_score` mag nooit meer als bron voor het *huidige* getal worden gelezen — alleen voor de trend; en omdat de fire-pijler-input van de snapshot bewust op de vol-vermogen-grondslag draait, kan een opgeslagen historische score licht afwijken van de live score bij gebruikers met een housing-strategie — dat is gedocumenteerde historie, geen drift.
