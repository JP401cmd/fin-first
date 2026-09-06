---
id: 0073-grondslag-in-de-veldnaam
title: 'Elk inkomsten-/uitgavenveld op DashboardData draagt zijn venster in de naam — de ongemarkeerde naam is de effective grondslag'
status: aanvaard
date: 2026-07-30
elements: [as-budget]
---

# 0073 — Grondslag in de veldnaam

## Context

`DashboardData` draagt meerdere maand-inkomsten/uitgaven-grootheden die er
identiek uitzien maar verschillende dingen betekenen:

- `monthlyIncome` / `monthlyExpenses` — het resultaat van
  `resolveEffectiveIncomeExpenses`. Bij `profiles.income_source = 'manual'` wint
  de handmatig ingevulde profielinschatting van de transactiesom. Dat is
  **bedoeld**: Horizon/FIRE en de spaarquote hebben een stabiele, door de
  gebruiker bevestigde maandaanname nodig.
- `recentMonthlyExpenses` — 12-maands rolling gemiddelde.
- `prevMonthIncome` / `prevMonthExpenses` — de gerealiseerde vórige
  kalendermaand.

De ongemarkeerde naam `monthlyIncome` dekte daarmee stilzwijgend één specifieke
grondslag, zonder dat de naam dat verraadt. Dat is tweemaal gematerialiseerd als
defect: de Transacties-kaart op `/overzicht/budget` toonde `+€ 2.000`
(profiel 5000−3000) terwijl de maand werkelijk €25.227 in en €92.437 uit was, en
`components/widgets/cash-flow-widget.tsx` zet de effective waarden nog in één
vergelijking naast de gerealiseerde `prevMonth*`-velden.

## Besluit

**Elk nieuw inkomsten-/uitgavenveld op de bundel draagt zijn venster in de naam.
De ongemarkeerde naam (`monthlyIncome` / `monthlyExpenses`) is en blijft de
effective grondslag.**

Concreet toegepast: de gerealiseerde huidige kalendermaand heet
`currentMonthIncome` / `currentMonthExpenses` — zuster van de bestaande
`prevMonthIncome` / `prevMonthExpenses`, zelfde venster-familie.

Twee gevolgen die bij het besluit horen:

1. **Verplicht, niet optioneel.** Een `?`-veld nodigt uit tot
   `?? data.monthlyExpenses`, en dát is de bug opnieuw. Verplicht sluit die deur;
   `tsc` wijst de constructiesites aan.
2. **Gevoed uit het canonieke aggregaat**, niet uit een eigen rij-loop:
   `aggIncomeByMonth` / `aggExpenseByMonthAbs` over `tx_month_aggregate` met
   `realOnly: true` (die vlag *is* de `transfer`/`joint_transfer`-filter). Een
   aggregaat kan niet stil op `max_rows` afkappen — een rij-loop wel, en dat is
   in de spaarquote-keten al eens fout gegaan.

## Alternatieven

- **Een gedeeld `grondslag`-suffix op álle velden** — zou een hernoeming van
  `monthlyIncome`/`monthlyExpenses`/`recentMonthlyExpenses` impliceren: een
  repo-breed refactor, en de conventie bestond al (venster-prefix).
- **`realizedMonthlyIncome`** — introduceert een derde naamgevingsas (provenance
  náást venster) en is in financiële context dubbelzinnig (*realized* vs.
  *unrealized* rendement).
- **De effective-resolutie laten vallen voor "deze maand"-surfaces** — nee: de
  manual-override is correct gedrag voor Horizon/FIRE, alleen niet voor een kaart
  die "deze maand" belooft.

## Gevolgen

- Drie uitgaven-grootheden op één bundel is acceptabel, mits elk veld het venster
  in de naam draagt én een docstring heeft die de afbakening benoemt.
- Niet elke kaart hoort op de gerealiseerde maand: de Vaste-lasten-kaart blijft
  bewust op het effective inkomen, want een structureel aandeel meet je tegen een
  stabiel maandinkomen, niet tegen een half-afgelopen maand.
- Twee oppervlakken lezen nog de verkeerde grondslag als "deze maand" —
  vastgelegd als aandachtspunt `maand-cashflow-grondslag-duplicaten`.
