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
2. **Netto vermogen sprong** bij verkoop met ruim een factor vijf (bedragen bewust relatief, zie ADR 0111), want de overwaarde zat vóór verkoop niet in het getoonde nettovermogen (huis gefilterd) en "verscheen" als cash. Liquidatie van vastgoed hoort weinig effect op netto vermogen te hebben (alleen −verkoopkosten) en veel op liquiditeit.
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

## on_depletion verkoopmoment scant de volle horizon — `triggerAge` is geen cap (14 jun 2026)

**Bug (fideliteit):** de on_depletion-trigger (`resolveDownsizeTriggerV2` in `build-input.ts`) begrensde zijn uitputtings-scan op `config.triggerAge`. Daardoor verkocht hij (of startte de opeethypotheek) **te vroeg** wanneer het liquide vermogen langer meeging dan die leeftijd, of forceerde hij een verkoop **op de cap** terwijl er geen uitputting was. Dat wijkt af van de eigen definitie van deze ADR (verkopen op het eerste jaar waarop het liquide vermogen de verkoopkosten-buffer raakt).

**Herstel (geen nieuw beleid):**

- De uitputtings-scan dekt nu de **volledige horizon** (tot end-of-horizon), niet tot `triggerAge`. `config.triggerAge` is **uitsluitend** het **never-deplete-plafond** (fallback-leeftijd), nooit een vroege cap.
- Raakt het liquide vermogen de verkoopkosten-buffer **nergens binnen de horizon** → **geen verkoop**: geen `assetLiquidations`, geen huur-event. Het huis blijft tot het einde van de horizon in het grootboek staan, groeit door op `expected_return` en vergroot zo de **nalatenschap** — dit is dus géén "verkoop op de cap".
- `SimulatedDepletionResult.reason` heeft hiervoor de waarde `'no_sale'` (voorheen `'fallback'`): de scan vond binnen de horizon geen uitputtings-kruising.
- Een **reverse_mortgage** on_depletion-`no_sale` emit geen event ⇒ de vermogenssamenstelling-grafiek (`applyHousingToComposition`, leest de trigger-leeftijd uitsluitend uit `housingEvent?.target_age`) injecteert niets → **geen fantoom-schaduwschuld** meer.

Herstelt de fideliteit aan de definities van deze ADR (en ADR 0012): verkopen op het eerste jaar dat liquide de buffer raakt, anders niet. Bewaakt door `test/horizon-housing-liquidation.test.ts` / `test/housing-trigger.test.ts`.

## Generieke niet-liquide asset-liquidatie (16 jun 2026)

**Status & scope (bijgewerkt):** dit ADR dekte aanvankelijk uitsluitend het eigen-huis-downsize-pad. Vanaf 16 jun 2026 voedt ook `buildGenericAssetLiquidations` (`lib/horizon-engine/build-input.ts`) dezelfde `assetLiquidations`-array en hetzelfde engine-block 6b. De "status & scope"-beperking "alleen voor v2 + downsize" geldt nog steeds voor het eigen-huis-downsize-pad; het generieke pad is een toevoeging bovenop dat mechanisme.

**Wat is uitgebreid:** elk `life_event` met een `linked_asset_id` dat verwijst naar een **niet-liquide, niet-`eigen_huis`** asset (`vehicle`, `physical`, `other`, `deelneming`, `real_estate` ≠ `eigen_huis`) wordt door `buildGenericAssetLiquidations` omgezet naar een `AssetLiquidation` op `target_age`. De leeftijd wordt afgeleid uit `target_age` als dat veld aanwezig is; anders via `ageAtDate(geboortedatum, target_date)` (M2: leeftijd-inferentie uit datum). Verkoopkosten via `SALES_COSTS_BY_TYPE` (override: `metadata.verkoopkostenPct`); verkoopprijs via `metadata.verkoopprijs` (kalibreert `salePricePct`; ontbrekend → 1.0). Opbrengst belandt in de pot die de `pot_rules.surplus_group` aanwijst via `expandSingleGroupToAssetTypes` (zie ADR 0019).

**Buiten scope (bewust):** `eigen_huis` (eigen downsize-pad via `buildV2DownsizeHousing`), liquide asset-typen, `levensverzekering` en `vordering` (komen als geldstroom binnen).

**Nieuwe FK:** `life_events.linked_asset_id` → `assets(id)` (migratie `20260616020000_add_life_events_linked_asset_id.sql`, al op remote toegepast). `lifeEventsToCashflows` onderdrukt via `skipEventIds` uitsluitend de opbrengst-portie van een als liquidatie afgehandeld event; de `monthly_cost_change` (bv. wegvallend onderhoud) blijft een losse cashflow — geen dubbeltelling.

**What-if-consolidatie (M3/B):** `whatif-page-client.tsx` roept nu `buildHorizonInput` aan via een gedeelde `buildInputForEvents`-factory, zodat de what-if-baseline dezelfde `assetLiquidations` en `skipEventIds` erft als de hoofdgrafiek (SSoT).

**M1:** de huis-downsize-trigger-meetrun (`baseSimInput` in `build-input.ts`) krijgt de generieke liquidaties mee zodat de meetrun hetzelfde liquide beeld heeft als de grafiek.

Bewaakt door `test/horizon-generic-liquidation.test.ts`, `test/horizon-housing-liquidation.test.ts` (M1), `test/whatif-baseline-consistency.test.ts` (B/M3).

## /overzicht-netto-vermogensgrafiek: netto-vermogen-grondslag via `simNetWorthRows` (jun 2026)

**Aanleiding:** de mini-netto-vermogensgrafiek op `/overzicht` toonde de FIRE-portefeuille (`endPortfolio`) als projectielijn. Dat veroorzaakte een sprong bij het begin: de FIRE-pot is gefilterd (eigen huis eruit bij `exclude_from_fire` / v1-downsize), waardoor de lijn lager startte dan het Vandaag-punt (volledig netto vermogen incl. huis). Oorzaak is het omgekeerde van de downsize-sprong die dit ADR beschrijft: niet de verkoop die netto vermogen laat springen, maar de beginwaarde die de huis-overwaarde mist.

**Besluit:** nieuw afgeleide reeks `simNetWorthRows` via `buildSimNetWorthRows` (`lib/horizon-engine/networth-projection.ts`). Per jaar:

```
netWorth = endPortfolio + houseEquity(age) + reconcileOffset
```

- `houseEquity(age)` = `max(0, projectEigenHuisValuesAt(...).currentValue − projectMortgageStateAt(...).balance)` — uitsluitend actief bij `exclude_from_fire` of v1-downsize mét een eigen huis; 0 bij `include_full` / `reverse_mortgage` / v2-downsize (huis zit al in `endPortfolio`). Bij v1-downsize: 0 vanaf de verkoopleeftijd (opbrengst zit dan al in `endPortfolio`).
- `reconcileOffset` = `currentNetWorth − (endPortfolio[0] + houseEquity[0])`: verankert jaar 0 op de Vandaag-grondslag (volledig netto vermogen incl. huis), zodat de lijn naadloos aansluit op de historiegrafiek.

**FIRE-grootheden ongewijzigd:** `requiredFirePortfolio`, `fireAge` en `freedomPct` blijven op de FIRE-eligible (liquide) grondslag — dit ADR of de nieuwe reeks raken die berekeningen niet.

**Marker op de grafiek:** de eindmarker (`age = fireAge`) geeft de hoogte van het geprojecteerd netto vermogen op de vrijheidsleeftijd. Het liquide vrijheidsdoel (`simRequiredPortfolio`) wordt apart gelabeld als referentielijn — niet als hoogte op de netto-vermogen-as.

**Geen tweede engine-run, geen tweede WOZ-formule:** `endPortfolio` komt 1:1 uit de engine, huiswaarde-groei uit de canonieke `projectEigenHuisValuesAt`, hypotheek-afbouw uit `projectMortgageStateAt` — dezelfde helpers die ook `huis-strategie-trigger` gebruikt. Geen nieuwe aannames.

**Bestanden:** `lib/horizon-engine/networth-projection.ts` (nieuw), `lib/dashboard-data-loader.ts` (levert `simNetWorthRows` in de `DashboardData`-bundel), `components/overview/mini-networth-chart.tsx` (consumeert). Bewaakt door de berekeningen-catalogus (`lib/architecture/calculations.ts`, calc-id `sim-netto-vermogen-projectie`) en de `calculations.test.ts`-suite.

## Addendum (2026-07-03) — geërfd door de horizon-kernel, ander mechanisme

De v2-engine die dit besluit implementeerde is fysiek verwijderd (FASE 6 stap 5A, commit
`95bafeb53`). Het PRINCIPE — het huis blijft een niet-liquide asset in het grootboek en
verlaat het pas via een échte verkoop-liquidatie binnen dezelfde loop, i.p.v. gefilterd +
de opbrengst als los inkomen ingespoten — ERFT over naar de horizon-kernel (ADR 0032), maar
het MECHANISME is herbouwd: waar v2 een generiek `UnifiedProjectionInput.assetLiquidations`-
zijkanaal had (gevoed door zowel het downsize-pad als generieke asset-liquidaties), is het
woningblok in de kernel een **kernel-NATIVE Excel-tabel-port** (`Bez!AY:BE`,
`lib/horizon-kernel/tables/bez.ts`) die verkoop/opeethypotheek intern in de maandloop
afhandelt — geen los liquidatie-array, geen generieke asset-liquidatie-mechaniek voor
overige niet-liquide bezittingen (die bestond in v2, niet in de kernel; huis is de enige
verkoop-/opeet-rol die de kernel kent). `lib/horizon.ts`-brede storting van `endPortfolio`
+ meegroeiende overwaarde (`buildSimNetWorthRows`, verhuisd naar `lib/horizon/networth-rows.ts`)
blijft hetzelfde SSoT-principe volgen, nu via de `houseInLedger`-vlag i.p.v. per-housing-
modus-switch. Zie de ADR 0028-addendum voor het materiële verschil (geen spendable-vóór-
verkoop meer). Catalogus-entries: `horizon-kernel` en `sim-netto-vermogen-projectie` in
`lib/architecture/calculations.ts`.
