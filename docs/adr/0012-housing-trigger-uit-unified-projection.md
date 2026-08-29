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
- Bekend en bewust buiten scope: de schaduw-schuld van de opeethypotheek blijft display-only (drukt niet op de simulatie) — **achterhaald, zie de correctie van 5 aug 2026 onderaan**; de engine is jaarlijks (geen maand-granulariteit) — de begin-jaar-injectie + buffer dekt het intra-jaar-risico.

## Correctie: kruisings-venster scant de volle horizon (14 jun 2026)

De v1-scan (`scanRows` / `resolveHousingTriggerFromProjection` in `lib/housing-trigger.ts`) begrensde het kruisings-venster op de fallback-leeftijd, waardoor de trigger te vroeg vuurde of een verkoop op die leeftijd forceerde. Gecorrigeerd: de scan loopt nu over de **volledige horizon**; de fallback-leeftijd is **uitsluitend het never-deplete-plafond**, geen cap. Raakt het liquide vermogen de verkoopkosten-buffer nergens binnen de horizon → **geen verkoop** (geen event; het huis blijft in de pot tot end-of-horizon). Dezelfde `SimulatedDepletionResult`-semantiek als v2: de reason is `'no_sale'` (voorheen `'fallback'`). Bewaakt door `test/housing-trigger.test.ts` + de regressie-suite `huis-strategie-trigger.ts`.

## Correctie: de opeethypotheek is een échte schuld in het grootboek (5 aug 2026)

Het gevolg hierboven — *"de schaduw-schuld van de opeethypotheek blijft display-only (drukt niet op de simulatie)"* — is **niet langer waar** en was op het kernel-pad bovendien de bron van een defect.

<!-- productiecijfer-ok: synthetische testconfiguratie (de regel noemt dat zelf), geen productieaccount -->
ADR 0029 maakte de opeethypotheek al een echte schuld in het toenmalige v2-grootboek. Bij de migratie naar de horizon-kernel bleef die aanname stilzwijgend hangen: het **fixture-/oracle-pad** (`input-from-fixture.ts`) vulde de gereserveerde schuld-slot 3 correct, maar het **app-pad** (`adapter/potten.ts#buildSchuldPotten`) sloeg die slot over ("gereserveerd, niet in deze snede gevuld"). Omdat `tables/s.ts` het opeet-saldo alleen evolueert bij een pot met rol `'opeethypotheek'`, groeide de schuld op het app-pad nooit — terwijl `bridge.ts` de maandopname wél als kasstroom bijtelde. Netto: uitkering zonder tegenpost, en de opname-cap (`MAX(0, BD/(1+r/12) − S!P(m−1))`) kon met een saldo dat permanent 0 was nooit knijpen. Gemeten op een testconfiguratie: €206 mln aan opnames tegen €749k leenruimte (275× de cap).

Gecorrigeerd: `buildSchuldPotten` maakt de pot op slot 3 aan zodra de woonstrategie `reverse_mortgage` is, met de vorm van bens rij 20 (`box3Type: 'Geen Box 3 schuld'`, categorie `Woning`, startwaarde 0, aflossingsvrij). Buiten `reverse_mortgage` is de `KernelInput` byte-identiek.

Twee eigenschappen die uit de correctie volgen en expliciet vastgelegd horen:
- **De opeetschuld is J-neutraal.** Met `J = I − (L − M)` en categorie `Woning` (niet-liquide zodra de woonstrategie ≠ meerekenen) geldt ΔI = −ΔM, dus ΔJ = 0 tot op de cent. Vrijheidsleeftijd en het doel *excl.* woning leven op J en bewegen daarom per constructie niet mee; het doel *incl.* woning en de nalatenschap wél. De enige gedragsknop van de fix is dus de opname-cap.
<!-- productiecijfer-ok: gemeten op dezelfde synthetische testconfiguratie -->
- **Bij de auto-opname knijpt die cap pas ná de eindleeftijd.** De auto-opname spreidt de cap-bij-start exact uit tot leeftijd 90; alleen de opgerolde rente duwt het saldo daarna over de meegegroeide cap (gemeten bindmoment: leeftijd 91,2). Bij een *vaste* maandopname bindt de cap wél binnen de horizon en verschuift de vrijheidsleeftijd navenant (gemeten: +5,4 jaar bij €2.500/mnd).

Bewaakt door `lib/horizon-kernel/adapter/opeethypotheek-pot.test.ts` en een discriminerende invariant in de horizon-strategie-matrix (`opeetSchuldEind`) — de bestaande goldens meten op de FIRE-maand en zijn structureel blind voor alles ná de opeet-startleeftijd.

<!-- productiecijfer-ok: bedragen uit de gemeten testconfiguratie, geen productieaccount -->
**Besluit over de opeetrente (eigenaar, 5 aug 2026): oracle-conform laten.** De opgerolde opeetrente is echte kosten (~€224k op €220k opnames in de gemeten configuratie), maar landt volledig in de niet-liquide emmer en verlaat daarmee de FIRE-beslissing. De vraag *moet opgerolde opeetrente als toekomstige verplichting meewegen in de vrijheidstoets, of pas bij verkoop/overlijden?* is expliciet voorgelegd en beantwoord met **pas bij verkoop/overlijden** — de rente wordt niet als toekomstige verplichting in de vrijheidstoets betrokken.

Gevolg dat je moet kennen bij het lezen van een opeethypotheek-projectie: een opeethypotheek verschuift de vrijheidsdatum per constructie niet (J-neutraal, zie hierboven), ook niet via de rente. Wat hij wél doet is de nalatenschap drukken — dat is waar de kosten zichtbaar worden. Wie dit ooit wil herzien, verandert daarmee de kern-semantiek én wijkt af van het Excel-oracle; dat is een aparte ADR, geen aanpassing hier.
