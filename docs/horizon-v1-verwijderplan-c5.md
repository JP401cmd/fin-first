# Horizon v1-engine: verwijderplan (Fase C5)

**Datum audit:** 2026-06-14 · **Status:** C5-pre in uitvoering; C5-a/b/c gated op productbeslissingen.

Dit plan beschrijft hoe we de **legacy v1-rekenengines** volledig kunnen uitfaseren nu v2 (de grootboek-engine, `lib/horizon-engine/`) de productie-FIRE-default is. Gebaseerd op de architect-audit van 14 jun 2026.

## Scope — wat is "v1"

"v1" = de legacy **engine-functies**, NIET de bestanden of de gedeelde types:

- `runUnifiedProjection` (`lib/unified-projection.ts`) — de v1-grootboek-voorganger.
- `runSimulation` (`lib/fire-simulation.ts`) — de oudere legacy-engine. (`runSimulationUnified` is test-only en leeft in `unified-projection.ts`; er is feitelijk één legacy-engine-functie.)
- De **v1-tak** in `runSelectedProjection(input, false)` (`lib/horizon-engine/select.ts`).

**Blijven (geen onderdeel van verwijdering):** de gedeelde types/helpers die v2 óók gebruikt — `UnifiedProjectionInput/Result/Row`, `AssetLiquidation`, `SimResult`, `SimCashflow`, `toSimResult`, `lifeEventsToCashflows`, `unifiedRowsToStackedRows`. 100+ bestanden importeren deze; dat is geen blokkade.

## Waar v1 nog leeft (consumentenkaart)

| Categorie | Bestanden | Kan weg? |
|---|---|---|
| **Niet-FIRE rekenbibliotheken** (geen v2-equivalent) | `lib/fee-analysis.ts`, `lib/hypotheek-vs-beleggen.ts`, `lib/household-projection.ts` (gebruikt béíde v1-engines), `lib/housing-trigger.ts` (v1-meetrun) | Pas na migratie of bewust schrappen — **blokkade** |
| **Flag-escape-hatch** | `lib/horizon-engine/flag.ts`, `app/api/horizon-engine/route.ts`, `horizon-v2-toggle.tsx` | Productbeslissing: terugrol-hatch laten vallen? |
| **Parity/compare-tooling** (draait v1+v2 bewust) | `lib/horizon-engine/compare.ts`, `app/api/horizon-engine/ledger/route.ts`, `/beheer/horizon-tabellen*`, `unified-projection-parity.test.ts`, `bucket-projection-parity.test.ts` | Pas weg als cutover "definitief" — gated |
| **FIRE-pad-lekken** (cutover miste deze; altijd v1) ⚠️ | `whatif-beslishulp.tsx`, `horizon-client.tsx` (AOW-stop), `event-pane-view.tsx`/`event-pane-edit.tsx`/`strategie-modal.tsx` (delta-previews) | **Migreren — correctheidsfix (C5-pre)** |
| **Dood** | `app/(app)/horizon/doorrekening-test/*` (redirect-only), `runSimulationUnified` (test-only) | **Nu weg (C5-pre)** |

Reeds correct gemigreerd naar `runSelectedProjection` (flag-gated): `use-horizon-fire-sim.ts`, `dashboard-data-loader.ts`, `fire-target-shared.ts`, `strategy-preview.ts`, `regel-sim.ts`, de hoofd-what-if (`whatif-page-client.tsx`).

## Gefaseerd plan

### C5-pre — ✅ UITGEVOERD (14 jun 2026)
1. **Dode code weg:** `doorrekening-test`-tree + `use-doorrekening-sim.tsx` + `components/app/doorrekening/*` + `doorrekening-inline-section.tsx` verwijderd (geverifieerd: nergens live gemount); command-palette-fallback omgezet naar de canonieke route. ⚠️ **`runSimulationUnified` NIET verwijderd** — de plan-claim "test-only" was onjuist: live consumenten (`horizon-client.tsx` scenario-overlays + 4 regressie-suites + parity-test). Verschoven naar C5-c (na migratie van die consumenten).
2. **FIRE-lekken gedicht (correctheidsfix):** `whatif-beslishulp.tsx`, de AOW-stop-helper (`horizon-client.tsx`) en de EventPane-previews (`event-pane-view.tsx` + `event-pane-edit.tsx`, via `previewBaseline`) lopen nu via `runSelectedProjection` met de gebruikersflag → v2-gebruikers zien v2-consistente cijfers; `null`-baseline = byte-identieke v1-fallback. **Uitgesteld: `strategie-modal.tsx`** — laadt eigen aggregaat-data zonder flag/per-asset-arrays; migratie = `buildHorizonInput` repliceren, disproportioneel; eigen werkpakket. Regressie: `test/horizon-engine-flag-honouring.test.ts` (6 tests). tsc schoon, suite 3420 groen.
3. **Concern bijwerken:** `horizon-engine-v2-duaal` — na C5-pre lopen what-if-baseline, AOW-stop én EventPane-previews via de selector; alleen `strategie-modal.tsx` blijft v1. (Door `architecture-docs-keeper`.)

### C5-a — productbeslissing: v2-toggle laten vallen?
De flag `horizon_engine_v2` is de bewuste **terugrol-hatch** (ADR 0016). Verwijderen ⇒ v2 forceren voor iedereen: flag + `/api/horizon-engine` GET/PUT + `horizon-v2-toggle.tsx` weg, `runSelectedProjection` inklappen tot "altijd v2". Dit maakt de v1-tak onbereikbaar. **Besluit:** durven we de hatch te laten vallen, of houden we 'm tot er meer veldvertrouwen is?

### C5-b — productbeslissing: niet-FIRE-features migreren of schrappen?
De vier niet-FIRE-engines hebben geen v2-versie. Per feature beslissen:
- **`housing-trigger` v1-meetrun** → meest migreerbaar; v2 heeft al `resolveDownsizeTriggerV2`. Kandidaat om de v1-meetrun te vervangen.
- **`household-projection`** → naar v2-ledger migreren of behouden?
- **`fee-analysis` + `hypotheek-vs-beleggen`** → twee-scenario-vergelijkingen; naar v2 herbouwen of bewust op v1 laten/retireren?

### C5-c — opruimen (zelfde migratie, na C5-a en C5-b)
Zodra niets de engine-functies meer importeert: `runUnifiedProjection` + `runSimulation` verwijderen (gedeelde types behouden — desnoods her-huisvesten), `compareEngines` + de v1-arm van de ledger-API + `/beheer/horizon-tabellen*` + de parity-tests weg. ADR 0016 op "C5 done", concern verwijderen, Berekeningen/ArchiMate-platen resyncen.

## Volgorde-inzicht
`runSimulation` zit dichter bij dood dan `runUnifiedProjection`: na C5-pre + migratie van `fee-analysis`/`hypotheek-vs-beleggen`/`household-projection` is `runSimulation` test-only en weg. `runUnifiedProjection` is de laatste — die hangt onder de v1-tak van de selector (dus pas na C5-a) plus `household-projection` en `housing-trigger`.

## Drie expliciete productbeslissingen — BESLOTEN (14 jun 2026)
1. **v2-toggle/terugrol-hatch laten vallen?** (C5-a) → **JA, laten vallen.** v2 wordt voor iedereen geforceerd; flag + toggle-UI + `/api/horizon-engine` weg, `runSelectedProjection` klapt in tot v2-only.
2. **household-projection / fee-analysis / hypotheek-vs-beleggen → migreren of retireren?** (C5-b) → **Alle vier naar v2 migreren** (incl. de huis-trigger-meetrun). Niets schrappen.
3. **Cutover "definitief" verklaren** zodat de parity-tooling weg kan? (C5-c) → **Nog niet — parity-tooling behouden** tot v1 daadwerkelijk weg is.

**Gevolg — koers naar volledige verwijdering.** Volgorde: C5-pre (klaar) → **C5-b** (4 niet-FIRE-engines naar v2) → **C5-a** (toggle + v1-tak van de selector weg) → **C5-c-deel** (engine-functies `runUnifiedProjection`/`runSimulation` + `runSimulationUnified` weg). De **parity/compare-tooling blijft voorlopig** (op uitdrukkelijk verzoek), dus die deletie-stap van C5-c slaan we nu over.
