---
id: 0142-plan-review-toekomst-registerplicht
title: 'Plan-review Toekomst: afgeleide voortgang op een eigen markering, en registerplicht voor elke kern-instelling'
status: aanvaard
date: 2026-09-13
elements: [as-planning]
---

# 0142 — Plan-review Toekomst: afgeleide voortgang en registerplicht

## Context

De Toekomst-grafiek rekent, naast bezittingen, schulden en spaarquote, met zo'n veertig
keuzes die verspreid staan over acht schermen. Negen daarvan hebben een stille default
met groot effect (AOW €0 zonder gebeurtenis, eindleeftijd 90, onttrekkingsprofiel,
verdeling bij toename, woning 100% liquide voor oude accounts, …). Onderzoek 13 sep 2026
(TPR-01) wees weg van een verplichte wizard en naar "defaults zichtbaar maken en laten
bevestigen", met het effect per keuze erbij.

Twee ontwerpvragen moesten beslist:

1. **Wanneer telt een stap als bevestigd?** Uit de keuzevelden zelf is dat niet af te
   lezen: sinds TPR-05 schrijft de onboarding het onttrekkingsprofiel en de verdeling
   bij toename niet meer weg, maar `pot_rules.surplus_group` op de DB-default is niet te
   onderscheiden van een bewuste keuze.
2. **Hoe voorkom je dat de review veroudert?** Een nieuwe instelling die de kern raakt,
   zou stil buiten de review kunnen blijven — precies het probleem dat de review oplost.

## Besluit

**D1 — Eigen markering, afgeleide voortgang.** `profiles.plan_review_state` (jsonb, own-row)
draagt per stap `{ bevestigd_op, bron: 'review' }`. De voortgang wordt AFGELEID uit
markering én profielstaat (`lib/plan-review/progress.ts`): een markering geldt alleen
zolang de staat haar niet inhaalt. Verouderingsregels (A10): zonder actief AOW-event staat
"Wat er binnenkomt" open; een eigen huis zonder woonstrategie opent "Je huis"; zonder
niet-liquide bezit is die stap n.v.t. Bewust niet in `feature_preferences` (gedeelde
jsonb, lost-update-risico) en geen afvinklijst (`lib/welcome-guide.ts` is het verkeerde
model).

**D2 — Bevestigen schrijft via de bestaande routes.** De review voegt geen schrijfpad voor
keuzes toe. Bevestigen schrijft de huidige (of in de stap gekozen) waarde expliciet via
`/api/fire-settings`, `/api/withdrawal-strategy`, `/api/pot-rules` of
`/api/housing-strategy`, en zet daarna alleen de markering via `PUT /api/plan-review`
(zod, read-modify-write op de eigen rij, anon-RLS-client). Zo wordt een stille default
een expliciete keuze.

**D3 — Effect uit de kern, per stap op aanvraag.** `GET /api/plan-review?stap=` bouwt de
stap op de canonieke run (`computeHorizonFireSim`, dezelfde als de Tijdas) en vergelijkt
via `runRegelProjection` met één kandidaat-kolom (eindleeftijd +5, 10% lagere uitgaven na
stoppen, de vier woonstrategieën, een ander onttrekkingsprofiel). Er wordt niets zelf
gerekend. De route levert alleen afgeleide weergave en de bevestig-bodies met de eigen
keuzes; geen rauwe rijen, en alleen de eigen bezittingen tellen (de assets-policy is
huishoud-gedeeld). Per stap, zodat vier woonstrategie-runs alleen draaien wanneer die stap
opent.

**D4 — Registerplicht.** `KERNEL_INPUT_REVIEW_REGISTER` (`lib/plan-review/register.ts`) is een
`Record<keyof KernelInput, …>`: elk veld van `KernelInput` is toegewezen aan een stap, aan
laag 2 ("Voor wie wil"), aan brondata of aan kern-intern. Een nieuw kernel-veld compileert
pas als het daar een plek heeft; `register.test.ts` bewaakt de inhoud (elke stap dekt iets,
de vijf gevoeligste blokken zitten in een stap). **Regel: wie `KernelInput` uitbreidt,
beslist in dezelfde PR waar die instelling in de review landt.**

**D5 — Ingang en toon.** De ingang is de bestaande Voorkeuren-kaart op /toekomst: zolang niet
voltooid "Je voorkeuren voor je plan instellen · N van M" met status aandacht, daarna weer de
gewone kaart. Niet direct na de onboarding. Heropenen via de knop met dezelfde naam op
/toekomst/voorkeuren en ⌘K. De naam staat op één plek (`PLAN_REVIEW_NAAM` in
`lib/plan-review/types.ts`, besluit eigenaar 13 sep 2026).
Laag 2 verwijst alleen door. Alle teksten beschrijven wat de app rekent en wat een andere
keuze doet; nooit "aanbevolen" of "past bij jou" (Wft). De woonstrategieën staan in een
vaste volgorde zonder rangorde, met eigen neutrale kopij (niet
`HOUSING_STRATEGY_DESCRIPTIONS`, die oordeelt).

## Gevolgen

- Migratie `20260913160000_add_profiles_plan_review_state.sql` (puur additief). Tot die
  live staat leest `/toekomst` de kolom als "niet beschikbaar" (42703) en blijft de kaart
  de gewone Voorkeuren-kaart.
- `RegelSimOverride` kreeg twee kandidaat-kolommen erbij (`housingStrategyConfig`,
  `retirementExpense`); beide plakken alleen profielkolommen die de adapter al leest.
- Bekende grenzen (vervolgfase): stap 1–5 bewerken in de pane zelf (nu: "Aanpassen" opent
  het bestaande scherm); een vergelijking bij "Wat er binnenkomt"; deeplinks naar de
  afzonderlijke markt-aanname-kaarten; bereik (optimistisch/pessimistisch) voor laag 2.
