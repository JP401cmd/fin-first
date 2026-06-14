---
id: 0012-housing-trigger-uit-unified-projection
title: Huis-strategie "wanneer nodig"-trigger uit de unified projection (vaste-punt-iteratie)
status: aanvaard
date: 2026-06-13
elements: [as-planning, fn-toekomstplannen, as-vermogen]
---

Het trigger-moment van de eigen-huis-strategie (downsize / opeethypotheek × "wanneer nodig") wordt afgeleid uit **dezelfde unified-projection-engine als de grafiek**, via een capped vaste-punt-iteratie in `lib/housing-trigger.ts`. De event-marker, de verkoop-cashflow, de vastgoed-bar in de vermogensopbouw-barchart en de uitleg in de event-pane vallen daardoor per constructie samen met het moment waarop het liquide vermogen in de grafiek opraakt.

## Context
Het "wanneer nodig"-moment werd berekend door een apart 1D-jaarmodel (`resolveDownsizeTriggerOnDepletion`; de opeethypotheek gebruikte zelfs het nog oudere lineaire `resolveTriggerAge`). Dat model negeerde AOW/pensioen-inkomen, overige levensgebeurtenissen, schuld-aflossing, geïndexeerde uitgaven, box 3 en per-asset-rendementen — terwijl de grafiek op /toekomst door `runUnifiedProjection` wordt getekend. Gevolg (gemelde bug): het verkoop-event stond op een andere leeftijd dan waar de grafieklijn werkelijk opdroogt. De barchart-injectie in `horizon-client.tsx` had bovendien een eigen (derde) trigger-berekening.

## Besluit
1. **Definitie**: verkoop/uitkering is nodig op de eerste leeftijd waarin het liquide (niet-huis) vermogen in de volledige projectie daalt tot `verkoopkosten-buffer + veiligheidsmarge`. De buffer (`WOZ-bij-trigger × verkoopprijs% × verkoopkosten%`) legt het moment bewust iets vóór het echte nulpunt; `depletionThresholdYears` is geherdefinieerd van (dood) drempel-veld naar veiligheidsmarge in jaren uitgaven (geïndexeerd), default 2 → 0.
2. **Rondrekening**: het event beïnvloedt de FIRE-leeftijd (de binary search is forward-looking) en daarmee het pad vóór de trigger. Oplossing: capped vaste-punt-iteratie (max 3) waarbij de meetrun wordt gepind op de fireAge van de run-mét-event via `forcedFireAge` — geverifieerd zonder rekenkundige bijwerkingen (alleen fase-label). Bij convergentie is het pad vóór de trigger identiek aan de echte grafiekrun → exact gelijk moment. Pensioen-modus (exogene fireAge) convergeert per definitie in 1 iteratie. Tie-break bij niet-convergentie: `min()` — te vroeg verkopen is veilig, te laat betekent een tekort.
3. **Eén bron op alle oppervlakken**: `resolveHousingEventsForSim` is dé ingang voor beide server-loaders, de client-hook (`use-horizon-fire-sim` stript server-events en regenereert met actuele client-parameters — lost de stale `target_age` op), de barchart-injectie (leest `target_age`/`monthlyPayout` van het event) en de live preview in de Huis-strategie-modal (`runHousingScenarioProjection`).
4. **Beide strategieën gelijkgetrokken**: downsize én reverse_mortgage gebruiken hetzelfde mechanisme; bij reverse blijft het huis in de pot en wordt liquide per rij afgeleid uit `assetBuckets`/`debtBalances`.

## Gevolgen
- `getHousingLifeEvents`, `resolveDownsizeTriggerOnDepletion` en `resolveTriggerAge` zijn `@deprecated` (alleen nog legacy `applyHousingStrategy` + bestaande tests); verwijdering in een vervolg-PR.
- Bestaande JSONB-configs parsen ongewijzigd door; opgeslagen `depletionThresholdYears: 2` werkt nu als marge en triggert ~2 jaar uitgaven eerder dan kale uitputting (conservatief).
- on_depletion-triggers verschuiven voor bestaande gebruikers (meestal later: AOW/pensioen/rendement tellen nu mee). De event-pane-uitleg ("Waarom op deze leeftijd?") is herschreven op het nieuwe `SimulatedDepletionResult`-shape; de reason `still_accumulating` verviel (wie opbouwt kruist simpelweg niet → `fallback`).
- Kosten: worst case 7 extra engine-runs per resolutie (≈ tientallen ms); bewaakt met een bench-test in `test/housing-trigger.test.ts` en de regressie-suite `lib/regression-tests/suites/huis-strategie-trigger.ts`.
- Bekend en bewust buiten scope: de schaduw-schuld van de opeethypotheek blijft display-only (drukt niet op de simulatie); de engine is jaarlijks (geen maand-granulariteit) — de begin-jaar-injectie + buffer dekt het intra-jaar-risico.

## Correctie: kruisings-venster scant de volle horizon (14 jun 2026)

De v1-scan (`scanRows` / `resolveHousingTriggerFromProjection` in `lib/housing-trigger.ts`) begrensde het kruisings-venster op de fallback-leeftijd, waardoor de trigger te vroeg vuurde of een verkoop op die leeftijd forceerde. Gecorrigeerd: de scan loopt nu over de **volledige horizon**; de fallback-leeftijd is **uitsluitend het never-deplete-plafond**, geen cap. Raakt het liquide vermogen de verkoopkosten-buffer nergens binnen de horizon → **geen verkoop** (geen event; het huis blijft in de pot tot end-of-horizon). Dezelfde `SimulatedDepletionResult`-semantiek als v2: de reason is `'no_sale'` (voorheen `'fallback'`). Bewaakt door `test/housing-trigger.test.ts` + de regressie-suite `huis-strategie-trigger.ts`.
