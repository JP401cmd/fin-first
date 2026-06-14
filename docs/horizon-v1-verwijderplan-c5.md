# Horizon v1-engine: verwijderplan (Fase C5)

**Datum audit:** 2026-06-14 · **Status:** ✅ AFGEROND via Optie B (volledige fysieke verwijdering). C5-pre/a/b/c uitgevoerd; v1-engine én parity-/compare-tooling verwijderd. Dit plan is daarmee historie.

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
| **Flag-escape-hatch** | `lib/horizon-engine/flag.ts`, `app/api/horizon-engine/route.ts`, `horizon-v2-toggle.tsx` | ✅ WEG (C5-a): toggle-UI + route verwijderd; `flag.ts` is een no-op (`isHorizonV2Enabled` → altijd `true`). |
| **Parity/compare-tooling** (draaide v1+v2 bewust) | `lib/horizon-engine/compare.ts`, `app/api/horizon-engine/ledger/route.ts`, v1↔v2-inspector `/beheer/horizon-tabellen`, parity-tests | ✅ WEG (C5-c, Optie B): volledig verwijderd. (`/beheer/horizon-tabellen-mij` + `/beheer/grafiek-werking` zijn geen parity en blijven.) |
| **FIRE-pad-lekken** (cutover miste deze; altijd v1) ⚠️ | `whatif-beslishulp.tsx`, `horizon-client.tsx` (AOW-stop), `event-pane-view.tsx`/`event-pane-edit.tsx`/`strategie-modal.tsx` (delta-previews) | **Migreren — correctheidsfix (C5-pre)** |
| **Dood** | `app/(app)/horizon/doorrekening-test/*` (redirect-only), `runSimulationUnified` (test-only) | **Nu weg (C5-pre)** |

Reeds correct gemigreerd naar `runSelectedProjection` (flag-gated): `use-horizon-fire-sim.ts`, `dashboard-data-loader.ts`, `fire-target-shared.ts`, `strategy-preview.ts`, `regel-sim.ts`, de hoofd-what-if (`whatif-page-client.tsx`).

## Gefaseerd plan

### C5-pre — ✅ UITGEVOERD (14 jun 2026)
> Historisch logboek van de C5-pre-stap; beschrijft de tussenstand toen v1 nog bestond. Eindstand = Optie B (v1 + parity volledig weg, strategie-modal op v2) — zie "Uitvoering — eindstand" onderaan.
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
3. **Cutover "definitief" verklaren** zodat de parity-tooling weg kan? (C5-c) → ~~Nog niet — parity-tooling behouden (D3).~~ **HERZIEN (Optie B, 14 jun 2026): JA, definitief — volledige fysieke verwijdering, parity-tooling weg.** De eerdere D3-keuze ("parity voorlopig behouden") is door de gebruiker omgezet naar **Optie B**: de v1-engine én de parity-/compare-tooling worden volledig verwijderd, niet bewaard.

**Gevolg — volledige verwijdering uitgevoerd (Optie B).** Volgorde: C5-pre (klaar) → **C5-b** (4 niet-FIRE-engines naar v2) → **C5-a** (toggle + v1-tak van de selector weg) → **C5-c** (engine-functies `runUnifiedProjection`/`runSimulation` + `runSimulationUnified` weg, plus de v1-arm van de selector, `compareEngines`, de ledger-API en de v1↔v2-vergelijk-inspector). De parity/compare-tooling is **niet** behouden — Optie B overrulede D3.

## Uitvoering — eindstand (14 jun 2026)
- **C5-pre — ✅ gepusht (8a186299c):** FIRE-lekken (whatif-beslishulp, AOW-stop, EventPane-previews) via de selector; dode doorrekening-test-tree + `components/app/doorrekening/*` weg.
- **C5-b — ✅ gepusht (d5187d886):** alle vier niet-FIRE-engines flag-bewust (housing-trigger-meetrun, household-projection, fee-analysis, hypotheek-vs-beleggen). Elk met `*-flag.test.ts`; v1↔v2 bewezen zinnig (reëel vs nominaal). **Belangrijke regel:** `runSimulation` (legacy) ≠ byte-identiek aan `runUnifiedProjection` → de flag-uit-arm houdt de létterlijke oude aanroep.
- **C5-a — ✅ gepusht (63d975d90):** `isHorizonV2Enabled` retourneert altijd true → v2 geforceerd in productie; toggle-UI + GET/PUT-route verwijderd.
- **C5-c (volledige verwijdering — Optie B) — ✅ AFGEROND:** `runUnifiedProjection`, `runSimulation` en `runSimulationUnified` zijn fysiek verwijderd. `lib/unified-projection.ts` en `lib/fire-simulation.ts` bestaan nog als houder van de gedeelde types/helpers (`UnifiedProjectionInput/Row/Result`, `AssetLiquidation`, `SimResult/Row/Cashflow`, `lifeEventsToCashflows`, `unifiedRowsToStackedRows`, `toSimResult`, `unifiedToBucketResult`). `runSelectedProjection` is **v2-only** — geen v1-arm meer; de `useV2`-parameter blijft staan maar wordt genegeerd. Scalar-bridge toegevoegd: `runScalarProjectionV2` (`lib/horizon-engine/scalar-bridge.ts`) is een drop-in voor de oude scalar-portfolio-signatuur en routeert die callers (strategie-modal, hypotheek-vs-beleggen, event-panes, scenario-overlays) naar v2. **De parity-/compare-tooling is VERWIJDERD (Optie B overrulede D3):** `compareEngines` (`lib/horizon-engine/compare.ts`), de ledger-API (`/api/horizon-engine/ledger`), de v1↔v2-vergelijk-inspector `/beheer/horizon-tabellen` (`horizon-inspector.tsx` + `page.tsx`) en de parity-tests zijn weg. Behouden in die dir (NIET parity): `ledger-views.tsx` + `persona.ts`, gebruikt door `/beheer/horizon-tabellen-mij` + `/beheer/grafiek-werking`. NB: `/beheer/horizon-strategie` is een aparte v2-pagina en blijft.
- **Geen openstaand v1-werkpakket meer:** `strategie-modal.tsx` is gemigreerd naar v2 via de scalar-bridge — niet langer uitgesteld.
- **Doc/curatie gesynced (architecture-docs-keeper):** eerste sync was op de D3-keuze; **gecorrigeerd naar Optie B** — ADR 0016 §8/scope (volledige verwijdering + parity weg), `calculations.ts`-noten (unified-projection / horizon-grootboek-v2 / huis-strategie-trigger), `horizon-engine-v2.md` (§1, §2, §4.6/§4.7, INV-2/INV-6, §8/§9), `lib/horizon-engine/flag.ts`- en `select.ts`-comments, en dit plan. (Geen openstaande v1/parity-concern in `archimate-concerns.ts`; geverifieerd schoon.)
