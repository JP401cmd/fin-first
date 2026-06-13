---
status: aanvaard
date: 2026-06-13
elements: [as-planning, fn-toekomstplannen, as-vermogen]
---

# 0015 — Horizon v2: eigen-huis-downsize als asset-liquidatie in het grootboek

## Context

De downsize-strategie (verkoop eigen woning bij uitputting / op leeftijd) werd gemodelleerd op de v1-manier: `filterAssetsForFire` haalt het eigen huis + de gekoppelde hypotheek **uit de FIRE-pot**, en `resolveHousingEventsForSim` spuit de verkoop als een eenmalig **inkomen** in (plus bespaarde-hypotheek-inkomen en nieuwe-huur-uitgave). De horizon v2-grootboek-engine erfde dit model via `build-input.ts`.

Fase B-meting op een echt account legde drie problemen bloot (zie [[project-horizon-housing-downsize-model]]):

1. **Verkoopmoment** werd berekend door een v1-meetrun (`runUnifiedProjection`) terwijl de grafiek v2 is → het moment lag op een ander pad dan de getoonde lijn, en viel op de config-cap (`fallback`) i.p.v. echte uitputting.
2. **Netto vermogen sprong** bij verkoop (gemeten €117k → €660k), want de ~€580k overwaarde zat vóór verkoop niet in het getoonde nettovermogen (huis gefilterd) en "verscheen" als cash. Liquidatie van vastgoed hoort weinig effect op netto vermogen te hebben (alleen −verkoopkosten) en veel op liquiditeit.
3. **Woningwaarde-groei** was onzichtbaar: het huis stond niet in het grootboek, dus de 3,5%-groei was nergens te zien — de opbrengst dook als één brok op bij verkoop.

## Besluit

In v2 wordt de eigen-huis-**downsize** een **asset-liquidatie binnen het grootboek** i.p.v. filter + inkomen — het grootboek-per-asset is hier juist voor gebouwd (asset-level interventie, INV-4).

1. Het eigen huis blijft een **niet-liquide asset in het grootboek** (`NON_LIQUID`: telt in netto vermogen, groeit op `expected_return`, telt níét als besteedbaar/liquide). v2 filtert het huis dus **niet** meer; v1 blijft filteren (byte-identiek).
2. Nieuw veld `UnifiedProjectionInput.assetLiquidations?` (v1 negeert het). Op de trigger-leeftijd verkoopt de engine het asset: huiswaarde (na groei) verlaat het grootboek (uitstroom), de gekoppelde hypotheek wordt afgelost (saldo → 0, woonlast stopt vanaf dat jaar), en de **netto-opbrengst** (`waarde × salePricePct × (1 − salesCostsPct) − afgelost saldo`) stroomt naar het liquide vermogen (via dezelfde verdeel-doelen als surplus). Netto-vermogenseffect = **−verkoopkosten**; liquiditeit verspringt omhoog.
3. De **nieuwe huur** blijft een recurring uitgave vanaf de trigger; de verkoopopbrengst- en bespaarde-hypotheek-events vervallen in v2 (de liquidatie + het wegvallende hypotheeksaldo dekken dat al — anders dubbeltelling).
4. Het **verkoopmoment** wordt op v2's eigen liquide-pad bepaald (`resolveDownsizeTriggerV2` in `build-input.ts`: meetrun met het huis in de ledger, zónder liquidatie; eerste jaar waarin het liquide vermogen de verkoopkosten-buffer raakt; geen kruising vóór de cap → fallback op de config-`triggerAge`).

## Status & scope

- Geldt **alleen voor v2 + downsize** (flag-gated). v1-productie, `filterAssetsForFire` en `resolveHousingEventsForSim` zijn ongewijzigd; reverse_mortgage / include / exclude houden voorlopig het bestaande model.
- `build-input.ts` krijgt een `horizonEngineV2`-vlag (door de /toekomst-hook en de ledger-API doorgegeven) en kiest daarop het housing-model. De ledger-API (`/api/horizon-engine/ledger`) bouwt v1 en v2 met hun eigen housing-model voor een eerlijke vergelijking.
- Bewaakt door `test/horizon-housing-liquidation.test.ts` (huis blijft in input + liquidatie; v1 ongewijzigd; woningwaarde groeit zichtbaar tot verkoop; netto continu — geen sprong; liquide verspringt; verkoop verhoogt netto vermogen nooit).

## Gevolgen / open

- **Transitiejaar-overlap (klein):** in het verkoopjaar lopen het oude onderhoud (op de pre-sale-waarde) en de nieuwe huur één jaar samen (~enkele duizenden euro's). Bewust geaccepteerd; te verfijnen indien gewenst.
- **Trigger-FIRE-koppeling (tweede orde):** de liquidatie-opbrengst kan FIRE iets vervroegen; de trigger draait op één meetpass (geen vaste-punt-iteratie zoals het v1-pad). Bewust bounded.
- **Cutover:** bij het globaal flippen van v2 (ADR 0013, gated) wordt dit hét downsize-model en kan het v1-filter+inkomen-pad voor downsize vervallen.
- Catalogus-note `horizon-grootboek-v2` (`lib/architecture/calculations.ts`) + invariantendocument `docs/architecture/horizon-engine-v2.md` bijgewerkt.

## Follow-ups (code-review, 13 jun 2026)

- **M1 — trigger-uitleg.** `resolveDownsizeTriggerV2` retourneert nu náást de trigger-leeftijd een `SimulatedDepletionResult`-vormig uitleg-object (op v2's eigen liquide-pad, géén v1-meetrun); dit wordt via `extraMetadata` op het v2-huur-event gezet zodat de "Waarom dit moment?"-panel ook voor v2-downsize rendert.
- **M2 — preview == grafiek.** De Huis-strategie-modal-preview kiest nu v1↔v2 op de profielvlag `horizonEngineV2` (via de loader → page → `HousingPreviewData`); v2 draait `runHousingScenarioProjectionV2` (gedeeld liquidatiemodel + v2-engine) zodat de modal-copy "zelfde engine als de grafiek" klopt.
- **M4 — één valuatie-basis.** Verkoopopbrengst én verkoopkosten-buffer worden op **dezelfde** engine-asset-waarde (`current_value × inclusion`, reëel gegroeid) gemeten — de trigger leest die uit de meetrun-rij i.p.v. `projectEigenHuisValuesAt(...).wozValue` (nominaal + woz-fallback). De veiligheidsmarge in v2 is daarom vlak-reëel (geen nominale indexering). Voorheen vuurde de trigger op een licht verkeerd liquiditeitsniveau wanneer `woz_value ≠ current_value`.

## include_full: woning is besteedbaar (Optie A, 14 jun 2026)

**Bug (na de cutover, brede groep):** bij `deplete` + housing-mode `include_full` met een groot huis liep het getoonde netto vermogen NIET naar ~€0 en lag de vrijheidsleeftijd veel te hoog (gemeten owner: FIRE 63 i.p.v. v1's 45.6). Oorzaak: v2 behandelt `eigen_huis` als **niet-liquide** (`NON_LIQUID`), dus de deplete-onttrekking dronk alleen de liquide pot leeg terwijl de woning (3,5%) ongemoeid doorgroeide → netto vermogen stéég i.p.v. te dalen, en de liquide pot alléén moest het pensioen dragen → FIRE veel later. v1 telde de hele pot (incl. woning) als afbouwbaar.

**Besluit (Optie A — herstel v1-gedrag):** bij `include_full` telt de woning **volledig mee als besteedbaar FIRE-vermogen**. Nieuw veld `UnifiedProjectionInput.spendableAssetIds` (v1 negeert het): `build-input` zet daarin de `eigen_huis`-ids wanneer de housing-mode `include_full` is; de engine-helper `isNonLiquid(a)` retourneert dan `false` voor die assets, zodat ze in `liquidValue`/`liquidRealReturn`/`liquidSumStart` + de onttrekkingsvolgorde (eigen_huis staat dáár al laatst) meetellen. Gevolg: deplete bouwt ook de woning af (laatst), de lijn loopt naar ~€0 en FIRE matcht v1 (gemeten 43 ≈ 45.6). `exclude_from_fire` blijft uitsluiten; `downsize`/`reverse_mortgage` houden het liquidatie-/event-model. Bewaakt door `test/horizon-housing-liquidation.test.ts` ("include_full = woning besteedbaar").
