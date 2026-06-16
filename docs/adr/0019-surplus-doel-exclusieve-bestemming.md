---
id: 0019-surplus-doel-exclusieve-bestemming
title: Surplus-doel = exclusieve bestemming (niet de volledige waterfall)
status: aanvaard
date: 2026-06-16
elements: [as-planning, fn-toekomstplannen]
---

Wanneer de gebruiker een pot-voorkeur ("verdeling bij toename") instelt, moet een surplus of liquidatie-opbrengst uitsluitend naar de gekozen pot gaan — niet pro-rata over alle asset-types worden verdeeld. De onttrekkings-volgorde (waterfall) houdt de brede, geordende verdeling.

## Context

`potRulesToStrategyOptions` (in `lib/pot-rules.ts`) vertaalde de `surplus_group`-voorkeur naar `surplusTargets` via `expandGroupsToAssetTypes([surplusGroup])`. Die helper is bedoeld voor de **onttrekkings-volgorde**: hij geeft de volledige 10-type-waterfall terug, met de gekozen groep vooraan maar de rest er achteraan — zodat de engine altijd een volgorde heeft voor alle asset-types.

Gebruikt als **doel** voor surplus/opbrengst levert dat het verkeerde resultaat: de engine matcht `surplusTargets` op álle aanwezige assets, verdeelt de opbrengst pro-rata over alle potten (cash, spaargeld, beleggingen, …) en negeert daarmee de voorkeur van de gebruiker. Bij een koppeling van een verkoop-event aan een `cash`-voorkeur belandde de liquidatie-opbrengst slechts als kleine fractie bij cash; de rest verspreidde zich over alle overige potten.

Dit is een **latente bug**: het default-gedrag (geen voorkeur ingesteld) is byte-identiek — dan wijst `surplus_group` op de standaardgroep beleggingen en zijn `surplusTargets` altijd de beleggings-types. Alleen niet-default voorkeuren worden geraakt.

## Besluit

Twee aparte helpers voor twee aparte rollen:

- **Onttrekkings-volgorde** (bestaand): `expandGroupsToAssetTypes([group])` — blijft ongewijzigd. Levert de volledige geordende waterfall; nodig zodat de engine alle asset-types kan vinden bij onttrekking, ook als de voorkeursgroep leeg is.
- **Surplus-/opbrengst-doel** (nieuw): `expandSingleGroupToAssetTypes(group)` in `lib/pot-rules.ts` — levert **uitsluitend** de asset-types die bij díe groep horen (bv. `spaargeld` → `[cash, savings]`; `beleggingen` → `[investment, crypto, pension]`). Opbrengst belandt nu correct bij de gekozen pot.

`potRulesToStrategyOptions` geeft nu:
- `surplusTargets` via `expandSingleGroupToAssetTypes(surplusGroup)` (exclusief doel)
- `withdrawalOrder` via `expandGroupsToAssetTypes([surplusGroup])` (volledige waterfall, ongewijzigd)

Verwijzingen: `lib/pot-rules.ts`, `lib/horizon-engine/build-input.ts` (zie ook `buildGenericAssetLiquidations`, dat de `surplusTargets` erft voor de opbrengst-bestemming van generieke asset-liquidaties).

## Gevolgen

- **Default ongewijzigd:** gebruikers zonder afwijkende pot-voorkeur zien exact hetzelfde gedrag.
- **Niet-default voorkeuren:** surplus en liquidatie-opbrengst concentreren nu correct in de gekozen pot. De vrijheidsleeftijd kan daardoor iets vroeger of later uitvallen, afhankelijk van hoe efficiënt de gekozen pot bijdraagt aan het liquide vermogen.
- **Onttrekkings-volgorde ongewijzigd:** de waterfall voor onttrekking (welke pot wordt als eerste aangesproken) verandert niet.
- **Samenloop met ADR 0015:** `buildGenericAssetLiquidations` gebruikt voor de opbrengst-bestemming van verkoop-events diezelfde `expandSingleGroupToAssetTypes`; de liquidatie-opbrengst van bv. een stalling-verkoop belandt nu in de door de gebruiker gekozen pot i.p.v. pro-rata over alles.
