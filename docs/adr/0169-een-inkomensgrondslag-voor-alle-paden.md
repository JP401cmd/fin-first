---
id: 0169-een-inkomensgrondslag-voor-alle-paden
title: 'Eén inkomensgrondslag voor alle paden: de horizon-FIRE-som filtert transfers net als de rest'
status: aanvaard
date: 2026-09-19
elements: [as-planning, fn-toekomstplannen]
---

# 0169 — Eén inkomensgrondslag voor alle paden

## Context

Het transactie-jaarinkomen (`transactionAnnualIncome`, lib/budget-realized.ts) voedt bij
`retirement_expense_method = 'current_income'` de pensioenuitgave en daarmee het
FIRE-doel. Tot 19 sep 2026 kende die helper een `includeTransfers`-optie: de
horizon-FIRE-som (SSR-loader van /toekomst, de uitgaven-na-pensioen-sheet, de
huishoud-sectie) telde eigen-rekening-overboekingen **bewust mee**, terwijl de
dashboard-/core-loader (`cashflowSettings.effectiveAnnualIncome`), de spaarquote en de
gezondheidsscore ze filterden. Dat verschil stond gedocumenteerd als "per-module-keuze"
in lib/server-data/tx-aggregates.ts.

Sinds de ADR-0103-koppeling leest `horizon-client#loadData()` de transfer-exclusieve
bundel, en valt alleen zonder bundel terug op een eigen som. Daardoor kon de "Na
pensioen"-KPI op /toekomst na het sluiten van de sheet een ánder bedrag tonen dan de sheet
zelf en dan de eerste SSR-render — de derde divergentie op de kaart WF-TOEK-02-bug2
(retest 6 sep 2026), zodra `income_source ≠ manual`, er geen bruikbare budgetgrondslag was
én er inkomsten-transfers in de historie stonden.

## Besluit (eigenaar, 6 sep 2026)

1. **De per-module grondslag-splitsing wordt opgeheven: één inkomensbron voor alle
   paden.** Een gedocumenteerde tweede waarheid blijft een tweede waarheid; ze heropent
   het repro-patroon zodra de drie condities samenkomen. Dit volgt de eigen
   "consume, don't recompute"-norm.
2. **De transfer-exclusieve som is de grondslag** — de som die de inkomenskaart op
   /overzicht/budget, de spaarquote en de gezondheidsscore al droegen. Eigen-rekening-
   overboekingen zijn geen inkomen; ze tellen nergens meer mee in een som die een cijfer
   voedt. `realOnly: false` blijft alleen voor "bestaat er een boeking?"-vragen.
3. **De optie verdwijnt uit de helper**, niet naar een default: `transactionAnnualIncome`
   heeft één argument. Een toekomstige caller kan de splitsing niet stil heropenen.
4. **Ook de client-terugval** in `horizon-client#loadData()` (pad zonder cashflow-settings-
   bundel) filtert transfers, zodat de terugval niet van semantiek wisselt.
5. **Vastgepind** in `lib/retirement-expense-basis.grondslag.test.ts`: de helper rekent op
   `windowIncome.real`, heeft geen opties-parameter, en een bron-scan van de vijf
   call-sites (SSR-loader, sheet-route, huishoud-sectie, core-loader, horizon-client)
   valt om bij een nieuwe `includeTransfers`-vlag.

## Gevolgen

- Gebruikers met inkomsten-transfers en methode *behoud van inkomen* zien een lager
  jaarinkomen → lagere pensioenuitgave → lager FIRE-doel en een eerder stopmoment.
  Dat is de correctie, geen regressie: de overboekingen waren geen inkomen.
- De FIRE-spaarbron `baseAnnualSavingsFromCashflow` (inkomen × spaarquote) staat nu op
  hetzelfde jaarinkomen als de spaarquote-rate zelf — multiplier en rate op één
  grondslag.
- Geraakt: lib/budget-realized.ts, lib/horizon/raw-data-loader.ts,
  app/api/uitgaven-na-pensioen/context/route.ts, lib/household-projection.ts,
  components/app/horizon/horizon-client.tsx, lib/retirement-expense-basis.ts,
  lib/server-data/tx-aggregates.ts; catalogus `grondslag-inkomen-uitgaven` en
  `retirement-expenses` in lib/architecture/calculations.ts.
- Oracle-parity ongemoeid: de kernel krijgt alleen een andere invoerwaarde.
