# Horizon-kernel — maandbasis-rekenkern (Excel-oracle)

Pure-TypeScript rekenkern die de Horizon/Toekomst-projectie berekent **exact
zoals het eigen Excel-model** `Core calc v5.xlsm` (ADR 0032,
`docs/horizon-excel-oracle-plan.md`). Maandbasis (index 0..1199, tot leeftijd
100), forward-recursie, **nominaal** (reële invoer vooraf geïndexeerd met
`(1+inflatie)^(m/12)`), structurele één-maand-lag. Het Excel is de **oracle**:
elke tabel wordt cel-voor-cel tegen 19 fixtures bewezen, tolerantie **€0,01**.

> Status: **FASE 6 — de canonieke en enige Horizon/FIRE-rekenmotor** (ADR 0032).
> De rekenlaag is compleet en euro-exact tegen de oracle bewezen: **alle 14
> tabellen geport** (teacher-forced parity, ~10,6 mln cellen, 0 mismatches),
> **integrale engine ✔** (`engine.ts`: forward-recursie voedt DepViews uit eigen
> toestand; integrale parity over alle tabellen × 19 fixtures, 0 mismatches —
> geen foutophoping over 1200 maanden), **solver ✔** (`solver.ts`: VBA-getrouwe
> `BepaalFIRE`-bisectie + statusblok P!B93-B100; 19/19 fixtures exact vanuit
> alleen de input, incl. parkeerstand, AOW-kortsluiting, doel=0-quirk en
> pensioengat) en **wrappers ✔** (band zonder pensioen-kortsluiting; MC sin-hash
> exact; hist inert). Let op: kernel-floats dragen sub-cent-ruis — messcherpe
> drempel-condities op afgeleide euro-waarden (zoals B99 > 0) clampen ruis onder
> een halve cent naar 0 (zie solver.ts).
>
> Bovenop de rekenlaag draaien **adapter/** (domein → `KernelInput`), de
> **bridge** (`bridge.ts` / `run-unified.ts`), de **wrappers/** en de vier
> **routers** (`convergentie-`, `household-`, `scalar-`, `whatif-router.ts`)
> plus de **worker/**-offload — allemaal live en door de app geconsumeerd via
> `lib/unified-projection`. De vroegere FASE 3 (adapter) is dus lang geleden
> geland. De pariteit-/testtelling is bewust **niet** in dit blok hardgecodeerd
> (zulke getallen verouderen snel): de parity-stand onderaan is de bron en CI
> draait de volledige suite via
> `npx vitest run lib/horizon-kernel test/horizon-oracle`.

## Architectuur

```
lib/horizon-kernel/
├─ types.ts               Domein-vrije kern-typen: MonthIndex, KernelInput,
│                         AssetPot/DebtPot (generieke potten), Box3Params.
├─ scaffold.ts            Gedeelde A/B/C-scaffold: leeftijd, maand-in-jaar,
│                         horizon-guard (>100 → lege cel), inflatie-index.
├─ input-from-fixture.ts  Bouwt KernelInput uit een OracleFixture (P + bens);
│                         elke celverwijzing gedocumenteerd (test/oracle-only).
├─ tables/                De 14 geporte Excel-tabellen (pure per-maand-functies):
│                         bel, cf, ont, af, toename-afname, verdeling/, bez, s,
│                         prognose, es, auto-gebeurtenissen, geb, pt,
│                         werk-strategie.
├─ engine.ts              Integrale forward-recursie: voedt de DepViews uit
│                         eigen toestand (vervangt de teacher-forcing).
├─ solver.ts / gap.ts     VBA-getrouwe BepaalFIRE-bisectie + P!B93-B100-statusblok
│                         en pensioengat-/tekort-detectie; `evaluateFireAt` (geforceerd
│                         FIRE-moment; bij FIRE-maand 0 ankert de engine guardrails op T0).
├─ runway.ts              Runway-lezer (ADR 0126): eerste AANHOUDENDE maand met
│                         Prognose!J ≤ 0 (bruggetjes ≤ MAX_TRANSIENT_SPAN_MONTHS tellen niet).
├─ wrappers/              band.ts (RunScenarioBand), mc.ts (Monte-Carlo, sin-hash),
│                         hist.ts (backtest, inert), noise.ts.
├─ adapter/               Domein → KernelInput: events, household, params, potten,
│                         defaults, guard, whatif-varianten.
├─ bridge.ts /            Kernel-uitvoer → SimRow/SimResult voor de app,
│  run-unified.ts         geconsumeerd via lib/unified-projection.
├─ *-router.ts            De vier routers (convergentie, household, scalar, whatif)
│                         die de kernel per gebruiksgeval aanroepen.
├─ worker/                Off-main-thread-offload (kernel.worker.ts + protocol).
├─ parity/                Herbruikbare teacher-forced-runner (TableParitySpec).
└─ oracle/                (FASE 1) fixture-loader + comparator + typen.
```

**Regels voor de kern-modules** (`types`, `scaffold`, `tables/*`): pure TS —
geen `fs`, geen Supabase, geen `Date.now`/`Math.random`, geen domeinbegrippen
(AOW/pensioen/assets komen later als generieke potten/kasstromen binnen).
`input-from-fixture` en `parity/teacher` zijn **node/test/server-only** (ze lezen
fixtures via de oracle-loader).

## Teacher-forced parity — het patroon

Elke tabel-module is een **pure functie die maand `m` berekent** uit:
1. **`KernelInput`** — de statische parameters + potten (één keer per projectie).
2. **een `DepView`** — de upstream-waarden die de tabel op maand `m` consumeert
   (grondslagen, per-pot rendement/rente, en later m−1-waarden van andere tabellen).

In de **parity-test** komen die DepView-waarden uit de **fixture** (het oracle),
niet uit een eigen berekening. Zo wordt elke tabel *geïsoleerd* formule-getrouw
bewezen over **alle 1200 maanden × alle 19 fixtures**: een fout in tabel X kan
tabel Y niet besmetten, en de tabellen zijn daardoor **parallel te porten**. De
integrale forward-recursie (die de DepViews echt uit andere tabellen voedt)
volgt als aparte stap ná de tabel-ports.

De gedeelde runner (`parity/teacher.ts`) bouwt twee parallelle grids —
*verwacht* (uit de fixture-sheet) en *actueel* (uit `compute`) — en vergelijkt
ze met `compareGrid` (€0,01). Mismatches worden vertaald naar leesbare regels
(kolomletter · Excel-rij · maand · verwacht/actueel/Δ).

### Geb-postconventie (handmatige rijen 4-13) — einddatum

Een **Periodiek**-post zónder einddatum loopt tot de horizon (`eIdx = 1199`);
alleen **Eenmalig**-posten krijgen `eIdx = sIdx`. `geb.ts#helpersFromEvent`
codeert de Eenmalig-conventie voor de auto-rijen; de engine-builder voor de
handmatige rijen gebruikt de horizon-conventie — tijdens de engine-integratie
euro-exact bewezen (een open-einde "Pensionering"-post lekte anders vanaf
maand 349). Verwar de twee niet.

### Belangrijk formule-detail uit de Bel-port (één-maand-lag)

De grondslagen `Bel!D/E/F` zijn de Bez/S-saldi van **dezelfde maand `m`** —
empirisch geverifieerd (`Bel!D(0)=Bez!AH(0)=40333,33`, `Bel!D(1)=Bez!AH(1)`).
De structurele lag *"belasting over saldi m−1"* ontstaat pas doordat de cashflow
de canonieke heffing van de vórige maand leest: `CF!K(m)=Bel!N(m−1)`. Bel zelf
heeft dus géén m−1-afhankelijkheid. (De ADR/opdracht formuleert de lag als
"saldi m−1"; dat klopt op consumptie-niveau in CF, niet binnen Bel.)

## Zo port je de volgende tabel

1. **Lees de formule-bron**: `docs/horizon-oracle/structuur.md` (kolomkoppen +
   representatieve formules per tab) en `rekenflow.md` (dataflow + de exacte
   één-maand-lag-plekken). Bij twijfel: toets tegen de fixture-celwaarden zelf
   (de fixture bevat álle cellen) — niet gokken, niet "verbeteren". Neem níet
   aan dat elke tab de A/B/C-maandscaffold + horizon-guard volgt: sommige tabs
   (bv. Werk-strategie) hebben hun maandtabel in andere kolommen (N:S) en
   rekenen bewust voorbij leeftijd 100 door; ook de guard op reken-kolommen is
   tabel-specifiek (Bel leegt, Ont zet neutrale waarden) — bevestig kolom-
   thuisbasis én horizon-gedrag altijd eerst tegen de fixture.
2. **Raak `types.ts` en `input-from-fixture.ts` NIET aan** — het input-model is
   sinds FASE 2-stap 2 compleet (alle P/TS/bens/Geb/Auto-gebeurtenissen/PT/
   Werk/onzekerheid-blokken zitten in `KernelInput`). Porters draaien parallel;
   gedeelde bestanden wijzigen geeft conflicten. Mis je écht een input-veld,
   meld het als open punt aan de orchestrator i.p.v. zelf uit te breiden.
3. **Parameters uit `KernelInput`, tabelwaarden uit de DepView**: wat uit een
   andere tabel komt (ook m−1-waarden zoals het guardrails-anker P!B82) lees je
   teacher-forced uit de fixture via `buildDep`, nooit uit input.
   **Uitzondering — statische, afgeleide waarden op volle precisie:** grootheden
   die een pure functie zijn van statische invoer maar in de fixture afgerond
   staan (bv. de ½^(prio−1)-verdeelgewichten in `Toename en afname`/TS, op
   6 decimalen), MOET je uit `KernelInput` **herberekenen**, niet uit de fixture
   lezen — de 6-decimalen-afronding breekt de €0,01-parity op grote budgetten
   (Verdeling-port-vondst).
4. **Schrijf `tables/<tabel>.ts`**: definieer `<Tabel>Dep` (upstream die de tabel
   consumeert) + `<Tabel>Row` + de pure `compute<Tabel>(input, dep, m)`. Modelleer
   de horizon-guard via `scaffold.ts` (leeftijd > 100 → lege reken-cellen).
5. **Schrijf `test/horizon-oracle/parity-<tabel>.test.ts`**: definieer een
   `TableParitySpec` (sheet, headerRows, kolommen A–…, `prepare` om de upstream-
   sheet-grids te cachen, `buildDep` die de DepView uit de fixture leest) en roep
   `runTableParityAllFixtures(FIXTURE_DIR, spec)` aan. Assert per fixture
   `mismatchCount === 0`.
   **Voor rij-blok/expander-tabellen (Auto-gebeurtenissen, Geb-auto-rijen): geen
   maandloop.** De `teacher.ts`-runner past daar niet. Bouw i.p.v. een
   `TableParitySpec` een expliciete lijst `{ ref, actual }`-cel-specs, lees
   `getCell(fx, 'Sheet!A1')` als verwacht, en vergelijk met dezelfde semantiek
   (`DEFAULT_TOLERANCE` uit `oracle/compare`; strings/leeg exact). Zie
   `parity-auto-gebeurtenissen.test.ts` als voorbeeld-port.
6. **Verifieer**: `npx tsc --noEmit` (bij parallel porten: beoordeel je eigen
   bestanden; fouten in andermans tables/tests melden, niet fixen) én
   `npx vitest run test/horizon-oracle/parity-<jouw-tabel>.test.ts
   lib/horizon-kernel/oracle` — draai bij parallelle ports NIET de hele
   `test/horizon-oracle`-map (half-geschreven tests van mede-porters geven vals
   rood; de orchestrator draait de volledige suite na de golf). Geen verlaagde
   tolerantie, geen uitgesloten kolommen/maanden zonder expliciete motivatie.

### Bewust buiten de kolom-vergelijking
- **Kolom A (maandindex)**: wél vergeleken (blijft numeriek, óók voorbij de
  horizon) — bewaakt de rij-uitlijning.
- **Spacer-/toelichtingskolommen** (bv. Bel!O leeg, Bel!P toelichtingstekst):
  buiten de vergelijking — statische documentatie/opmaak, geen per-maand-
  berekening. Motiveer zulke uitsluitingen altijd in het testcommentaar.

## Parity-stand (teacher-forced, alle 19 fixtures, tolerantie €0,01)

| Tabel | Kolommen | Cellen | Max \|Δ\| |
|---|---|---|---|
| **Bel** (Box 3) | A–N | 319.200 | ~2·10⁻⁶ € |
| **CF** (cashflow) | A–K | 250.800 | 0 (exact) |
| **Ont** (behoefte+profiel) | A–D, F–I | 182.400 | ~1,7·10⁻⁶ € |
| **Af** (gebeurtenis-kosten) | A–D, F, G | 136.800 | ~3,2·10⁻⁷ € |
| **Toename en afname** | 88 kol. | 2.006.400 | ≪ €0,01 |
| **Verdeling** (waterval) | 218 kol. | 4.970.400 | ~2·10⁻⁶ € |
| **Bez** (potten + woningblok) | 53 kol. incl. AY:BE | 1.208.400 | ~2·10⁻⁶ € |
| **S** (schulden) | 42 kol. | 957.600 | ~1,4·10⁻⁶ € |
| **Prognose** | A–M | 296.400 | ~5·10⁻⁵ € |
| **ES** (eindstrategie-spiegel) | 15 cellen | 285 | 0 (exact) |
| **Auto-gebeurtenissen** | 255 cellen/fixture | 4.845 | 0 (exact) |
| **Geb** (auto-rijen + W:AE) | 161 cellen/fixture | 3.059 | ~4,8·10⁻⁷ € |
| **PT** (partner) | G–K + B10-B12 | 114.057 | ~5·10⁻⁷ € |
| **Werk-strategie** | N–S | 136.800 | ~5·10⁻⁷ € |
| **Totaal (teacher-forced)** | | **≈ 10,59 mln** | **0 mismatches** |
| **Integrale engine** | alle tabellen, eigen-toestand-recursie | 19 fixtures × 11 grids | 0 mismatches |
| **Solver** (BepaalFIRE + B93-B100) | fireAge/B35-B38/status/hint/B99 | 19/19 | exact (leeftijd 6-dec; € ≤ 0,01) |
| **Band** (RunScenarioBand) | Sim!B6:D8 (géén pensioen-kortsluiting!) | 19/19 | exact; #N/A-semantiek gedekt |
| **MC** (RunMonteCarlo, sin-hash) | MC!B14…-reeks (n=10) + slaagkans B4 | 19/19 | cel-exact; kans 1e-6 |

In fixture-ronde 3 geactiveerd (waren daarvóór 0/leeg in alle fixtures): pensioen-
multipot-annuïtisering (Auto-gebeurtenissen), de kinderen- en erfenis-takken, de
AOW-993/"Samen"-tak, schuld-toename + S-extra-aflossing, het HC:HH-overloopblok
en de tekort-aflossing (Verdeling). Partner-pensioen (PT!B6/B8/B12) en de
reserve-passes bleken al groen vóórdat een ronde-3-fixture ze raakte. Nog slapend
(in alle 19 fixtures 0/leeg — geïmplementeerd conform bron of bewust conservatief
gelaten): de scenarioshift-kern P!B43≠0 (de band-wrapper dekt de gebruikte
variant), de Bez!BB-aflossingscomponent en Hist (backtest blijft app-zijdig,
gap-besluit V11).
