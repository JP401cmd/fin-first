---
id: 0021-sale-config-per-bezitting-en-in-loop-liquidatie
title: Verkoop/liquidatie per niet-liquide bezitting via sale_config + default-on + in-loop on-demand
status: aanvaard
date: 2026-06-16
elements: [as-planning, fn-toekomstplannen, as-vermogen]
---

De verkoopkeuze voor een niet-liquide bezitting is een **first-class veld op de bezitting zelf**
(`assets.sale_config`, JSONB). De engine besluit op grond van dit veld of en wanneer een asset
wordt geliquideerd. De SSoT voor het of/wanneer verschuift daarmee van een `life_event` met
`linked_asset_id` naar `sale_config`. Gevolg: bestaande prognoses van gebruikers met niet-liquide
bezit **wijzigen bewust** door de default-on-semantiek (default `wanneer_nodig` voor alle
niet-liquide types).

## Context

Tot nu toe werd een generieke asset-liquidatie gedreven door een `life_event` met `linked_asset_id`
(ADR 0015, "Generieke niet-liquide asset-liquidatie", jun 2026). Dat model had drie beperkingen:

1. **Verkoopkeuze lag buiten de bezitting.** Gebruikers moesten een apart life-event aanmaken om
   een verkoop in te plannen; het asset zelf had geen "ik wil dit verkopen"-semantiek.
2. **Default = nooit verkopen.** Wie geen life-event aanmaakte, had impliciet een niet-verkopen-
   keuze — de engine rekende de asset onbeperkt mee in het grootboek. Voor een voertuig of caravan
   is dat onrealistisch.
3. **Engine-0-diff-discipline (v1→v2-transitie)** beperkte in-loop liquidaties: de engine mocht
   geen assets on-demand verkopen omdat dat de parity met v1 zou verbreken. Die discipline
   was zinvol tijdens de transitie maar is na C5-c (ADR 0016, v1 FYSIEK VERWIJDERD) niet langer
   relevant.

## Besluit

### A — `sale_config` als first-class bezittingsveld

Nieuw JSONB-veld `assets.sale_config` (nullable; migratie `20260616020001_add_assets_sale_config.sql`,
op remote toegepast). De parser (`lib/sale-config.ts`) kent drie standen:

| Stand | Betekenis |
|---|---|
| `niet_verkopen` | Asset blijft voor altijd in het grootboek; gekoppeld life-event-opbrengst wordt onderdrukt via `skipEventIds` (geen geld uit het niets). |
| `vast_moment` | Verkoop op een vaste leeftijd of datum — target afgeleid uit het gekoppelde life-event (`linked_asset_id`) of uit `sale_config.target_age`. |
| `wanneer_nodig` | Verkoop zodra het liquide tekort dat asset als eerste in de onttrekkingsvolgorde aanspreekt (in-loop on-demand, zie besluit B). |

`sale_config` is de SSoT voor het of/wanneer. Het veld `life_events.linked_asset_id` blijft
bestaan als **prijs-kalibratie-kanaal**: `metadata.verkoopprijs` in een gekoppeld event
moduleert de `salePricePct` (engine-waarde × ratio, geclampt [0, 2]). De eenmalige
opbrengst-cashflow en de trigger worden echter door `sale_config` bepaald, niet door het event.
Dubbeltelling wordt onderdrukt via het bestaande `skipEventIds`-mechanisme.

### B — Default-on semantiek (geen backfill)

Alle niet-liquide asset-types (`vehicle`, `physical`, `other`, `deelneming`, `real_estate` ≠
`eigen_huis`) krijgen via **RESOLVE-DEFAULT** in de parser `wanneer_nodig` als default wanneer
`sale_config` ontbreekt of null is. Er is geen databasebackfill: de kolom blijft null, de default
wordt bij elke parse opgelost in `lib/sale-config.ts`. Eigen woning houdt zijn eigen downsize-pad
(ADR 0015); liquide types, `levensverzekering` en `vordering` zijn buiten scope (die komen als
geldstroom binnen).

**Bewuste wijziging van bestaande prognoses:** gebruikers met niet-liquide bezit (voertuig,
inboedel, 2e woning, deelneming) zien hun prognose veranderen doordat die assets nu default
on-demand verkocht worden zodra liquide tekortschiet. Ze worden niet langer "rauw" leeggetrokken
in de onttrekkingsfase maar verlaten het grootboek alleen via een echte verkoop (mét
verkoopkosten, mét schuldaflossing).

### C — Optie A: in-loop on-demand-liquidatie in de engine

De engine (`lib/horizon-engine/engine.ts`) verkoopt een `wanneer_nodig`-asset zodra het liquide
vermogen in een jaar een tekort niet meer kan dekken en de asset de eerstvolgende in de
onttrekkingsvolgorde is. Trigger: `AssetLiquidation.trigger = 'on_demand'` (nieuw, naast het
bestaande `'fixed_age'`). Verkoopvolgorde = de bestaande onttrekkingsvolgorde (minst-liquide
eerst, `eigen_huis` allerlaatst), met `sort_order` als tie-break.

De "engine 0-diff"-regel — tijdens de v1→v2-transitie ingevoerd om bytegelijke parity te
bewaken — is met de voltooiing van C5-c (ADR 0016) losgelaten. Er is geen v1 meer om
0-diff tegen te garanderen.

### D — Verkoopvolgorde

De verkoopvolgorde voor on-demand-liquidaties volgt de bestaande onttrekkingsvolgorde (dezelfde
`withdrawalOrder` als de pot-waterfall). Dat houdt de engine één consistente volgorde —
meest-liquide activa eerste, minst-liquide (eigen woning) allerlaatst. `sort_order` is
tie-break binnen een liquiditeitsklasse.

## Bestanden

- `lib/sale-config.ts` — parser + RESOLVE-DEFAULT + drie standen
- `lib/horizon-engine/engine.ts` — in-loop `sellNextOnDemand` + `withdrawWithOnDemand`
- `lib/horizon-engine/build-input.ts` — `buildGenericAssetLiquidations` uitgebreid met
  `sale_config`-routering; `buildHorizonInput` past `skipEventIds` aan voor `niet_verkopen`

## Gerelateerde besluiten

- **ADR 0015** — Basis voor `assetLiquidations`-array en engine-block 6b (eigenhuisdownsize +
  generieke liquidatie). Dit ADR voegt de `sale_config`-SSoT en in-loop trigger bovenop dat
  mechanisme.
- **ADR 0019** — Surplus-doel = exclusieve bestemming via `expandSingleGroupToAssetTypes`.
  On-demand-liquidatie-opbrengst volgt dezelfde `surplusTargets`-routing.
- **ADR 0016** — C5-c: v1-engines FYSIEK VERWIJDERD. Maakt de loslating van de engine-0-diff-
  discipline mogelijk.

## Gevolgen

- **Blast radius (L2/L3):** bestaande prognoses van gebruikers met niet-liquide bezit wijzigen.
  Voertuig/inboedel/2e woning/deelneming worden nu default on-demand verkocht zodra liquide
  tekortschiet; ze verlaten het grootboek alleen via een echte verkoop (mét verkoopkosten,
  mét schuldaflossing van gekoppelde schulden). Gebruikers zonder niet-liquide bezit zien
  geen wijziging.
- **Prijs-kalibratie via life-event blijft:** `metadata.verkoopprijs` in een gekoppeld event
  moduleert de salePricePct (backwards-compat). De `monthly_cost_change` (bv. wegvallend
  onderhoud) blijft een losse cashflow — geen dubbeltelling.
- **`niet_verkopen`-hardening:** ook als een gebruiker expliciet `niet_verkopen` kiest maar een
  gekoppeld verkoop-event heeft, wordt de opbrengst van dat event via `skipEventIds` onderdrukt.
  Het asset blijft in het grootboek staan.
- **Geen UI-blokkering:** de drie standen worden instelbaar op de bezitting zelf in de
  bezittingen-UI. Eigen woning heeft zijn eigen downsize-instelling (ADR 0012/0015) en valt
  buiten dit veld.
