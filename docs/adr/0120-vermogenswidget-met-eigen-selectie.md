---
id: 0120-vermogenswidget-met-eigen-selectie
title: 'Vermogens-widget met eigen selectie: weergave-pref, gewogen som, persoonlijk perspectief'
status: aanvaard
date: 2026-08-29
elements: [as-vermogen, do-bezitting]
---

# 0120 — Vermogens-widget met eigen selectie

## Context

De eigenaar vroeg (29-08-2026) om een widget die het totale vermogen toont van
een **zélf gekozen** deelverzameling bezittingen en schulden — bijvoorbeeld wél
aandelen en bankrekening, níét crypto en eigen huis — met een bewerk-knop op de
widget en een historisch verloop. Zo'n gebruikersgekozen groep bestaat nergens:
`net_worth_inclusion_pct` weegt één item, de woonstrategie is één hardgecodeerde
uitsluiting, en de `DashboardData`-bundel draagt bewust geen per-bezit-rijen.

## Besluit

1. **De selectie is een weergave-voorkeur, geen domein-data.** Eén selectie per
   gebruiker, opgeslagen onder `profiles.feature_preferences.wealth_widget_selection`
   (`{ assetIds: [], debtIds: [] }`). Géén nieuwe tabel of kolom: de selectie
   bepaalt alleen wat één widget toont. Meerdere benoemde selecties (à la
   `spend_limit:`-prefix met eigen entiteit) zijn een bewuste latere stap; de
   pref-vorm leeft in één module (`lib/wealth-selection.ts`) zodat die migratie
   later één plek raakt.

   *Verzoening met ADR 0103 (security-review 30-08-2026):* ADR 0103 gaf zijn
   selectie een eigen kolom omdat `PUT /api/feature-preferences` de JSONB
   volledig overschreef — elke feature-toggle wiste niet-feature-sleutels
   (concern `feature-preferences-volledige-overwrite`). Die keuze hier herhalen
   zou het defect laten staan; in plaats daarvan is de **bron gerepareerd**: de
   route behoudt sinds deze snede alle niet-feature-sleutels onvoorwaardelijk
   (feature-vlaggen houden vervang-semantiek zodat "reset naar standaard"
   blijft werken). Daarmee is het concern ingetrokken en zijn óók
   `_welcome_seen`, `retirement_aspirations` en `deferred_onboarding_fields`
   niet langer wisbaar via een toggle.
2. **Lezen via de bundel, muteren via de route** (ADR 0058): de dashboard-loader
   vult een gated bundelveld `wealthSelectionWidget` (alleen wanneer de widget
   enabled is én er een selectie staat); de bewerk-sheet leest zijn keuzelijst
   lazy en schrijft via `PUT /api/wealth-selection` (zod, error-envelope,
   eigen-rij read-modify-write op alléén de eigen pref-sleutel).
3. **Weging is overal `net_worth_inclusion_pct`.** De historie
   (`balance_snapshots` → `loadEntitySparklines`) is al met dat percentage
   gewogen; de actuele som weegt daarom identiek (`current_value ×
   pct/100`, schulden negatief). Eén andere grondslag zou een knik op de naad
   actueel↔historie leggen — precies de fout die de euro-weergave-ADR's (0090/0093)
   elders uitbanden.
4. **Persoonlijk perspectief, expliciet.** `balance_snapshots` kent geen
   huishoud-model (bestaande concern in `archimate-concerns.ts`); de widget
   toont dus altijd de eigen selectie op eigen data en labelt dat wanneer een
   ander perspectief actief is. De keuzelijst in de bewerk-sheet toont alleen
   eigen rijen (`user_id`-filter), ook al is de assets-SELECT-policy
   huishoud-gedeeld.
5. **Stale ids verdwijnen stil.** Verwijderde bezittingen/schulden worden bij
   het lezen gefilterd; de som liegt nooit door een dode referentie.

## Gevolgen

- Nieuwe route met datatoegang → security-ship-gate verplicht vóór ship.
- Historie heeft maand-cadans (snapshot-cron + herwaarderingen): een nieuwe
  bezitting heeft pas na de eerstvolgende snapshot een reeks; de widget toont
  dan eerlijk "nog geen verloop" in plaats van een verzonnen lijn.
- De on-widget bewerk-knop is de eerste per-widget-config-affordance; hij werkt
  búiten de globale edit-modus (dnd-listeners zijn daar niet actief) en de
  selectie-sheet volgt de ShellOverlay-driewegregel.
- HLD-capability en widget-registraties (catalog, renderer, module-map, audit,
  auto-builder) bewegen mee; geen ERD- of rekenmotor-impact.
