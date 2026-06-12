---
id: 0009-vrijheidsvoortgang-unified-grondslag
title: Vrijheidsvoortgang single-sourced op de unified-projection-grondslag
status: aanvaard
date: 2026-06-12
elements: [as-planning, fn-toekomstplannen, as-vermogen]
---

Vrijheidsvoortgang (freedomPct) heeft één canonieke grondslag: FIRE-eligible netto vermogen ÷ benodigde portfolio uit de unified projection. 100% betekent per definitie dat het FIRE-doel is bereikt; het eigen huis telt alleen mee voor zover de housing-strategie het vrijspeelt. Eén canonieke helper `computeFreedomProgress({ fireEligibleNetWorth, requiredPortfolio })` in `lib/core-metrics.ts` voedt zowel het dashboard als de horizon.

## Context
Vrijheidsvoortgang werd berekend als totaal netto vermogen (inclusief de volledige overwaarde van het eigen huis) tegen een simpel FIRE-doel, en daarna geclampt op 100%. Daardoor toonde de voortgang 100% terwijl de "nog X jaar"-aftelling — die wél op de unified-projection-grondslag draait — nog jaren beweerde. De clamp verborg dat de teller stelselmatig te hoog was: het huis dat je nodig hebt om in te wonen werd als vrij-besteedbaar vermogen meegeteld, en de noemer was niet de werkelijk benodigde portfolio.

## Besluit
Eén grondslag, gedeeld tussen de surfaces. `lib/dashboard-data-loader.ts` en `lib/horizon-data-loader.ts` voeden `computeFreedomProgress` met (1) het FIRE-eligible vermogen — netto vermogen waarop de housing-strategie is toegepast, zodat het eigen huis alleen meetelt voor zover het wordt vrijgespeeld — en (2) de benodigde portfolio uit de unified projection (dashboard: `simRequiredPortfolio`, met als fallback een strategie-bewust `fireTarget` op dezelfde grondslag; horizon gebruikt diezelfde grondslag). Invariant: `100% ⇔ FIRE-doel bereikt`. De "nog X jaar"-aftelling en het percentage delen daarmee dezelfde teller en noemer en kunnen niet meer tegenspreken.

## Gevolgen
- De fire-pijler van het gezondheidsgetal erft dit percentage. Voor huiseigenaren valt de live health-score daardoor lager (correcter) uit dan voorheen — een huis waarin je woont speelt geen vrijheid vrij. Dat is een gewenste correctie, geen regressie.
- Milestone- en insight-triggers die op echte vrijheid hangen, vuren nu pas bij werkelijke FIRE-eligibility in plaats van bij een opgeblazen 100%.
- Bewust toegestane afwijkingen, intern consistent en gedocumenteerd in code:
  - **Snapshot-historie** (`app/api/snapshots/route.ts`) houdt een eigen per-rij-definitie op het volledige vermogen voor de trendlijn; oude gepersisteerde scores zijn dus hoger dan de huidige live score (zie ook ADR 0008 — `resilience_score` is historie, geen tweede waarheid voor het huidige getal).
  - **Household-projectie** (`lib/household-projection.ts`) draait op een eigen motor zonder huis-filter, intern consistent voor het huishoudperspectief.
  - **AI shared-context** (`lib/ai/context/shared-context.ts`) is inmiddels óók gemigreerd naar `computeFreedomProgress` op de FIRE-eligible grondslag (commit `b088ebb2b`, zelfde dag) — geen open follow-up meer.
- Nog openstaande gaten op deze grondslag (consistentie-audit 2026-06-12, zie `docs/eenduidige-gegevens-audit.md` R2.1): het sovereignty-niveau (`lib/dashboard-data-loader.ts` sovFreedomPct + `compute-feature-access`/`compute-module-access`), de widgets `vrijheidsvoortgang`/`vrijheidsmijlpalen` + horizon-hero (eigen herberekening op vol vermogen), en `app/api/report`, `share/freedom-card`, `next-steps` (eigen FIRE-formules).
