---
id: 0046-netto-vermogen-historie-uitsplitsing-en-backfill
title: 'Netto vermogen — verloop: bron-scheiding uitsplitsing vs. totaallijn, één gelabelde restband en twee onafhankelijke bewerkingsniveaus'
status: aanvaard
date: 2026-07-17
elements: [as-vermogen, fn-vermogensregistratie]
---

De "Netto vermogen — verloop"-grafiek splitst het historische netto vermogen uit in vermogens- en schuldgroepen. Bindend besluit: de per-entiteit/-groep-uitsplitsing komt UITSLUITEND uit `balance_snapshots`, de totaallijn blijft de canonieke `net_worth_snapshots`, en het verschil tussen beide wordt op precies één plek als één gelabelde **restband** getoond (identiteit `rest = net − (Σassets − Σdebts)`) — nooit stil uitgesmeerd over een groep. Bewerken kan op twee strikt gescheiden niveaus die elkaar nooit muteren: de totaal-editor schrijft naar `net_worth_snapshots`, de entiteit-backfill schrijft naar `valuations` + `balance_snapshots`. Schulden krijgen een eigen `DebtGroup`-taxonomie (`wonen`/`consumptief`/`overig`) parallel aan de asset-groepen. De historielaag is deze iteratie persoonlijk-only (perspectief-agnostisch gebouwd); `net_worth_history` (intraday, write-only) blijft bewust buiten dit verhaal.

## Context

Het netto vermogen wordt op twee onafhankelijke assen vastgelegd die tot nu toe niet in één grafiek samenkwamen:

- **`net_worth_snapshots`** — de canonieke, gewogen *totaalstand* per moment (dag-cadans + handmatige stand), single-sourced via `snapshot-math.ts`. Dit is de bestaande "netto vermogen"-lijn en blijft de waarheid over het totaal.
- **`balance_snapshots`** — per-entiteit saldi (asset/schuld) per snapshot-datum, geschreven door elke herwaardering (`upsertSingleBalanceSnapshot`). Dit is de enige bron waarmee je het totaal kunt *uitsplitsen* naar bezitting, subtype en groep.

De twee assen zijn niet identiek: `net_worth_snapshots` kan losse (niet als asset gemodelleerde) cash, afronding en inclusion-weging bevatten die de som van de per-entiteit-groepen niet exact reproduceert. Een uitsplitsingsgrafiek die de totaallijn wil tonen moet dat verschil eerlijk laten zien in plaats van het weg te poetsen. Tegelijk heeft niet elke gebruiker dagelijkse cron-historie in `balance_snapshots`, waardoor de groepsbanden leeg blijven — vandaar de behoefte aan een handmatige per-entiteit-backfill die exact hetzelfde schrijfpad volgt als een live herwaardering.

## Besluit

**(a) Bron-scheiding uitsplitsing vs. totaallijn + één gelabelde restband.**
De gewogen groepsbanden (asset- en schuldgroepen) komen uit `loadWealthGroupHistory` (`lib/load-category-history.ts`) over `balance_snapshots` — laatste-snapshot-per-entiteit-per-maand, gewogen met `net_worth_inclusion_pct`, LOCF forward-fill, met `measured|locf`-provenance per groep-maand. De **totaallijn** blijft `net_worth_snapshots` (per-maand ge-dedupe'd met exact het idioom van `/api/snapshots/history`, gedeelde helper `dedupeNetWorthByMonth`). Het verschil tussen beide is de **restband**, op precies één plek berekend (`app/api/snapshots/group-history/route.ts`) via de identiteit `rest[m] = net[m] − (Σ assetGroups[m] − Σ debtGroups[m])`. De restband kan positief én negatief zijn (inclusion-weging, losse cash, afronding) en wordt altijd expliciet als eigen band getoond — nooit stil in een groep verstopt. Consume, don't recompute: de route herberekent noch de groepen noch de netto-stand.

**(b) Twee onafhankelijke bewerkingsniveaus die elkaar nooit muteren.**
- *Totaal-editor* (`/api/snapshots/history`) bewerkt de aggregaat-totaalhistorie in `net_worth_snapshots`.
- *Entiteit-backfill* (`app/api/snapshots/entity-backfill/route.ts`) bewerkt per-entiteit maandsaldi via `valuations`-upsert + `upsertSingleBalanceSnapshot`-mirror op `<month>-01` — bit-voor-bit hetzelfde schrijfpad als de live herwaardering, alleen op een historische datum. Dit pad raakt `net_worth_snapshots` NOOIT; de totaal-editor raakt `balance_snapshots`/`valuations` nooit. De restband is juist de plek waar een eventuele divergentie tussen de twee niveaus zichtbaar wordt in plaats van dat het ene niveau het andere stilletjes bijtrekt. De backfill-POST interpoleert/genereert zelf geen waardes (LOCF is client-side, expliciete entries) en is dry-run-preview-baar.

**(c) DebtGroup-taxonomie in `lib/debt-data.ts`.**
Schulden groeperen langs een looptijd/aard-as parallel aan de asset-groepen: `wonen` (hypotheek), `consumptief` (persoonlijk/kort krediet: lening, studie, auto, creditcard, doorlopend krediet, afbetalingsregeling) en `overig` (fiscaal, DGA, familie, rest). `DEBT_GROUP_FOR_TYPE` / `getDebtGroup` / `DEBT_GROUP_LABELS`. Bewust géén kopie van de kleurklassen — `DEBT_TYPE_COLORS` blijft de bron voor de per-type tint; dit is puur de groep-indeling. `wonen` spiegelt de asset-groep `vastgoed` zodat het woning-netto (huis boven de nullijn, hypotheek eronder) in de butterfly-chart leesbaar tegenover elkaar staat.

**(d) Historielaag persoonlijk-only deze iteratie.**
De verloop-laag draait op de eigen (own-row RLS) `balance_snapshots` + `net_worth_snapshots`; `balance_snapshots` heeft nog geen household-model terwijl assets/debts dat wel hebben. `loadWealthGroupHistory` is perspectief-agnostisch gebouwd (een `ownership: 'personal' | 'all'`-parameter bestaat al in de handtekening zodat een latere huishouden-variant kan worden toegevoegd zonder breuk), maar er wordt nu niet op vertakt — deze iteratie is uitsluitend persoonlijk. `net_worth_history` (intraday, write-only per sync) blijft bewust buiten dit verhaal: het is geen bron voor de maand-uitsplitsing.

## Gevolgen

- **Geen nieuwe rekenmotor.** Dit is een decompositie van het bestaande `netto-vermogen`-kerngetal, geen nieuwe motor. De Berekeningen-view-entry `netto-vermogen` is uitgebreid met de groep-aggregatie (`loadWealthGroupHistory`) + de restband-identiteit; er komt geen aparte calc-entry.
- **Andere dekking dan de live breakdown.** De historische uitsplitsing (`balance_snapshots`) heeft een andere dekking dan de live per-type-breakdown (`computeAssetsByType` op de actuele `assets`/`debts`): historie bestaat alleen voor entiteiten met snapshots in het venster (of via backfill aangevuld), en zwerf-snapshots van verwijderde entiteiten worden bewust genegeerd. De som van de groepsbanden is daarom niet per definitie gelijk aan de headline — dat gat ís de restband.
- **ERD** — de nieuwe own-row `UPDATE`-policy op `balance_snapshots` (dicht het gat waar `INSERT..ON CONFLICT DO UPDATE` op her-edities faalde) verschijnt automatisch na `npm run arch:diagram`; geen curatie.
- **Nieuw aandachtspunt**: `vermogenshistorie-laag is persoonlijk-only` — `balance_snapshots` heeft geen household-model terwijl assets/debts dat wel hebben; verwijderen zodra de household-variant (`ownership: 'all'`) is uitgerold.
- **Bewaakt door** de architectuur-vitest-suite (`calculations.test.ts` via `validateCalculations` op de bijgewerkte `netto-vermogen`-entry, `archimate-curation.test.ts` via `validateConcerns` op het nieuwe punt) en `db-model.test.ts` voor de ERD.
