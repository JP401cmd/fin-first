# Horizon FIRE-rekenmotor v2 — architectuur (`lib/horizon-engine/`)

> Status: **blijvend architectuurdocument.** Verankerd door ADR 0013, de Berekeningen-catalogus-entry `horizon-grootboek-v2` (`lib/architecture/calculations.ts`), het plan `docs/horizon-tabel-rekenmotor-plan.md` en de testsuites `test/horizon-engine*.test.ts`. Dit document beschrijft de **bedoelde architectuur en de invarianten** die ze beschermen — lees het vóór je iets aan de engine fixt of toevoegt. Wijzig je gedrag, werk dan ADR 0013, de catalogus én dit document mee bij.
>
> Laatste verificatie tegen de code: 13 jun 2026.

---

## 1. Doel & scope

`lib/horizon-engine/` is de **tweede, tabel-georiënteerde FIRE-rekenmotor** (v2) naast de productie-engine `lib/unified-projection.ts` (v1). Hij vervangt de imperatieve forward-loop-met-binary-search door een **grootboek-model**: één forward-pass die een volledig gedecomponeerde jaartabel bouwt, één backward-pass die het benodigd vermogen per jaar afleidt, en een **forward doel-zoektocht** voor het FIRE-moment. Elke weergave (lijn, bar, in/uit, beheer-tabellen A–G) en de front-end-adapter zijn **pure views** op dezelfde jaarrijen.

**In scope:** de achterkant — hoe het vermogenspad, V_nodig en de FIRE-leeftijd worden berekend, per individueel asset en per individuele schuld, intern in reële termen. De voorkant blijft ongewijzigd via een adapter naar `UnifiedProjectionResult`.

**Niet in scope (bewust):** de visuele componenten op `/toekomst`, de what-if-doorrekening, de fee-/hypotheek-/household-oppervlakken (die draaien nog op v1), en de onomkeerbare productie-flip. Zie §9.

**Waarom een tweede engine en niet een refactor van v1:** de modellen verschillen fundamenteel (reëel vs nominaal; backward V_nodig vs binary search). Parallel laten lopen achter een flag maakt vergelijking en een gecontroleerde, omkeerbare cutover mogelijk — zie §8 (de grens met v1).

---

## 2. Modulekaart (één verantwoordelijkheid per bestand)

| Bestand | Verantwoordelijkheid (één) | Hangt af van |
|---|---|---|
| `types.ts` | **Datacontracten.** `LedgerRow` (canonieke bron, per asset + per schuld), `AssetBeweging`, `SchuldBeweging`, `LedgerEvent`, `TypeRollup`, `HorizonLedgerResult`. Géén logica. | `@/lib/asset-data` (AssetType), `@/lib/fire-strategy` (FireEndStrategy) |
| `strategies.ts` | **Pure plug-ins** voor verdeling & onttrekkingsvolgorde: `allocateProRata`, `withdrawSequential`, `withdrawProRata`, plus `HorizonStrategyOptions` + defaults (`DEFAULT_STRATEGY_OPTIONS`, `DEFAULT_WITHDRAWAL_ORDER`, `INVESTABLE_TYPES`). Generiek over string-keys (asset-id). | `@/lib/asset-data` |
| `engine.ts` | **De rekenkern** `runHorizonLedger`: forward-pass (V_op, per asset/schuld), backward-pass (`backwardVnodig`), FIRE-doel-zoektocht (`meetsStrategyTarget`). Hergebruikt domein-resolvers. | `unified-projection` (input-type), `constants` (NL_AOW_AGE), `box3-data` (BOX3_PARAMS, classifyAsset), `fire-simulation` (SimCashflow), `withdrawal-strategy` (applyWithdrawalStrategy), `./strategies`, `./types` |
| `views.ts` | **Pure selectors** voor grafiek/tabel: `buildChartSeries`, `rollupByType` (per-asset → per-type), `keyAges` (mijlpaal-jaren). | `./types`, `@/lib/asset-data` |
| `adapter.ts` | **Het enige reëel→nominaal-punt.** `ledgerToUnifiedResult`: rollup per asset-type + × (1+inflatie)^jaar → `UnifiedProjectionResult` (drop-in voor de bestaande grafiek). | `unified-projection` (result-types), `./types` |
| `compare.ts` | **Parity-/diff-harness.** `compareEngines`: draait v1 én v2 op dezelfde input, rapporteert verschillen (geen gelijkheids-assertie). Beslisinstrument vóór de flip. | `unified-projection` (runUnifiedProjection), `./engine`, `./adapter` |
| `select.ts` | **Engine-selector.** `runSelectedProjection(input, useV2)`: kiest v1 of v2 op één boolean. Default = v1. De enige plek waar de keuze valt. | `unified-projection`, `./engine`, `./adapter` |
| `flag.ts` | **Feature-flag.** `isHorizonV2Enabled(profile)` leest `profiles.feature_preferences.horizon_engine_v2`; `HORIZON_V2_FLAG`. Default false. | — (puur) |
| `index.ts` | **Publieke API.** Re-export van de bovenstaande types/functies. | alle bovenstaande |

**Afhankelijkheidsrichting (mag nooit cyclisch):**
`types` ← `strategies` ← `engine` ← {`adapter`, `compare`, `select`} ; `views`/`adapter` lezen `types`; `flag` staat los. Niets in `lib/horizon-engine/` importeert Supabase of een React-component. De afhankelijkheid op `unified-projection` is **alleen voor types** (`UnifiedProjectionInput`/`Result`) — behalve `compare.ts`/`select.ts` die v1 bewust óók aanroepen.

---

## 3. Datacontracten

### 3.1 Input — `UnifiedProjectionInput` (drop-in, niet heruitgevonden)

`runHorizonLedger(input, optsOverride?)` accepteert **exact dezelfde** `UnifiedProjectionInput` als v1 (`lib/unified-projection.ts:140`). Dat is de drop-in-invariant: dezelfde caller, dezelfde resolvers ervoor (`resolveFireParams`, `resolveSavingsSource`, `resolveWithdrawalStrategy`, `resolveFireStrategyWithOverride`, `lifeEventsToCashflows`, `filterAssetsForFire`). De engine bouwt **niets** zelf wat al een domein-resolver heeft.

Relevante velden die de engine consumeert: `assets`/`debts` (per stuk), `currentAge`/`endAge`, `yearlyExpenses`, `annualSavings`, `monthlyIncome`, `grossReturn`/`inflationRate`, `returnDelta`/`returnDeltaByAssetType`, `box3Method`, `cashflows`, `strategyConfig` (FireEndStrategy + endAge + legacyAmount), `withdrawalStrategy`, `forcedFireAge` (pensioen-modus), `hasPartner`, `bankAccountCash`.

De tweede parameter `optsOverride?: Partial<HorizonStrategyOptions>` stuurt de verdeling-/onttrekkingsvolgorde-plug-ins (default: `DEFAULT_STRATEGY_OPTIONS`).

### 3.2 Canonieke bron — `LedgerRow[]` (`types.ts`)

**Eén rij per projectiejaar, met `assets: AssetBeweging[]` en `schulden: SchuldBeweging[]` — per individueel stuk, niet per type.** Dit ís de single source of truth; alle weergaves en de adapter lezen hieruit. Per rij: fase/werkt, inkomen (netto), belasting (Box 1/Box 3/HRA), wonen & uitgaven, per-asset (begin→rendement→instroom→uitstroom→box3→eind), per-schuld (begin→rente→aflossing→extraAflossing→hra→eind), totalen + bracketing (`liquideVermogen`, `vNodig`, `dekking`), en events.

`AssetBeweging`/`SchuldBeweging` zijn de auditrijen (tabellen C/C2). De per-type rollup voor de compositie-bar gebeurt pas in `views.rollupByType` / `adapter`.

### 3.3 Output — `HorizonLedgerResult` (intern) → `UnifiedProjectionResult` (extern)

`runHorizonLedger` levert `HorizonLedgerResult`: `rows` (reëel), `vNodig[]`, `fireAge`/`fireAgeFractional`/`fireReachable`, `requiredFirePortfolioAtFire`, `liquideAtFire`, `displayEndAge`, `strategy`, en cruciaal `inflationRate` (nodig om de adapter reëel→nominaal te laten rekenen). De adapter (`ledgerToUnifiedResult`) zet dit om naar het bestaande `UnifiedProjectionResult` zodat de front-end onveranderd blijft.

---

## 4. Rekenarchitectuur

### 4.1 ASCII-flow

```
UnifiedProjectionInput
        │
        ▼  buildAssets()/buildDebts()  → per asset eigen realRet + box3Cat; per schuld eigen rate/schema
   ┌────────────────────────────────────────────────────────────┐
   │ PASS 1: runForward(stopWork = null  → werk tot AOW)         │
   │   per jaar (reëel):                                          │
   │     marktschok → rendement/asset → Box 3-drag/asset →        │
   │     schuldschema → cashflows → inkomen+Box1(placeholder) →   │
   │     surplus  → allocatie-plug-in  (aflossen-eerst / pro-rata │
   │                / vast / alles-beleggen)                      │
   │     tekort   → onttrekking-plug-in (sequentieel / pro-rata)  │
   │   → LedgerRow[]  (= V_op, liquideVermogen-lijn)              │
   │   → netNeed[]    (retire-now netto behoefte/jaar)            │
   └────────────────────────────────────────────────────────────┘
        │                                   │
        │ netNeed[]                         │ rows (referentie V_op)
        ▼                                   │
   backwardVnodig(): V_nodig[i] =           │
     (V_nodig[i+1] + netNeed[i])/(1+rOnttrek)│   rOnttrek = 0.6 × reëel gem. rendement
     V_nodig[D] = 0 (deplete) / initieel    │   (vpw: annuïteitsfactor i.p.v. recursie)
       liquide (perpetual) / legacy (legacy)│
        │  = DALENDE referentielijn         │
        ▼                                   ▼
   ┌────────────────────────────────────────────────────────────┐
   │ FIRE = forward doel-zoektocht (zelf-consistent)             │
   │   for f = startAge..endAge:                                 │
   │     run = runForward(stopWork = f)   // stop werken op f     │
   │     if meetsStrategyTarget(run, f, …) → fireAge = f; break   │
   │   forcedFireAge gezet (pensioen) → run = runForward(forced)  │
   │   De GETOONDE lijn ÍS die run → grafiek & FIRE kloppen       │
   │   per constructie (geen aparte decumulatie-aanname).         │
   └────────────────────────────────────────────────────────────┘
        │
        ▼  hang vNodig/dekking + fase ('opbouw'/'overbrugging'/'onttrekking') aan de rijen
   HorizonLedgerResult  (reëel)
        │
        ▼  adapter.ledgerToUnifiedResult()  ──► × (1+inflatie)^jaar  (HET ENIGE nominale punt)
   UnifiedProjectionResult  (nominaal, drop-in voor de bestaande grafiek)
```

### 4.2 De twee rollen van de forward-pass

`runForward(stopWorkAtAge)` wordt voor twee doelen gedraaid:

1. **Referentie (pass 1, `stopWork = null` ⇒ werk tot AOW)** levert de `netNeed[]` (retire-now netto behoefte per jaar) die de backward-pass voedt, plus een eerste V_op.
2. **De getoonde run (`stopWork = fireAge`)** is de daadwerkelijke kandidaat-run waarin op de geteste FIRE-leeftijd wordt gestopt met werken en volgens de strategie wordt onttrokken. Bij de gevonden FIRE-leeftijd is dit de lijn die de gebruiker ziet.

### 4.3 Backward V_nodig (`backwardVnodig`)

Recursie vanaf de eindleeftijd terug: `V_nodig[i] = (V_nodig[i+1] + netNeed[i]) / (1 + rOnttrek)`, met `rOnttrek = 0.6 × reëel gemiddeld rendement` (conservatieve onttrekkingsvoet). `V_nodig[laatste]` = einddoel per strategie (deplete → 0, perpetual → initieel liquide, legacy → nalatenschapsbedrag). VPW-variant gebruikt een annuïteitsfactor i.p.v. de recursie. **Per constructie dalend** — dit is de inspecteerbare V_nodig-curve (tabel E) die de scalar-binary-search van v1 vervangt.

### 4.4 FIRE = forward doel-zoektocht (`meetsStrategyTarget`) — GEEN crossing

FIRE is de **vroegste leeftijd** waarop "stop met werken + onttrek volgens de strategie" het einddoel haalt:
- **deplete/pensioen:** niet vroegtijdig leeg vóór de terminale 2 jaar (de annuïteit trekt het laatste jaar het restant in één keer leeg, eindigt ~€0);
- **perpetual:** mag tussendoor niet leeglopen én eindvermogen ≥ ~99% van het vermogen op FIRE (koopkracht behouden);
- **legacy:** onttrekt **need-only** (alleen de leefbehoefte; géén spend-down-annuïteit) zodat het residu naar de nalatenschap groeit — mag tussendoor niet leeglopen én eindvermogen ≥ nalatenschapsbedrag (−2% marge). Zie §4.6 + ADR 0014.

De getoonde lijn ÍS die geslaagde run. Daarom kloppen grafiek en FIRE-leeftijd per constructie. **De oude crossing-gebaseerde FIRE (snijpunt V_op × V_nodig op een afwijkende decumulatie-aanname) mag NIET worden geherintroduceerd** — V_nodig is hier louter een dalende *referentielijn* (tabel E), niet de FIRE-bepaler. (NB: het plan/ADR spreken her en der nog van "snijpunt"; de geïmplementeerde en canonieke definitie is de forward doel-zoektocht — zie §10 over die woordkeuze-schuld.)

### 4.5 Reëel intern; de adapter is het enige nominale punt

De engine rekent volledig **reëel** (koopkracht heden): `realReturn = (1+nominaal)/(1+inflatie)−1` per asset; uitgaven/sparen vlak reëel; de annuïteit krijgt `inflation: 0`. **De adapter `ledgerToUnifiedResult` is de ENIGE plek waar reëel→nominaal gebeurt** (Route 2: elk bedrag × `(1+inflatie)^jaar`, met `inflationFactor` bewaard voor optionele reële weergave). Nergens anders mag nominale logica staan.

### 4.6 Per asset / per schuld

`buildAssets()` geeft elk asset een eigen `realRet` (uit `expected_return`, of negatief bij `depreciation_rate`, plus de scenario-delta) en een eigen `box3Cat` (via `classifyAsset` uit `box3-data`). Losse bankrekening-cash wordt als pseudo-asset toegevoegd. `buildDebts()` geeft elke schuld eigen rente/aflossingsschema/HRA-aftrekbaarheid. Box 3-drag wordt **per asset** berekend (forfait × tarief, na het heffingsvrij vermogen pro-rata over de box 3-assets). De deplete-annuïteit gebruikt het **werkelijke gewogen reële rendement van de LIQUIDE portefeuille** (`liquidRealReturn`), niet `grossReturn` — zodat cash/crypto de onttrekking drukken en de lijn correct op ~€0 eindigt i.p.v. vroegtijdig leeg.

**Legacy onttrekt daarentegen need-only** (via `ctx.legacyPreserveOnly`, gezet door `engine.ts`, afgehandeld in `lib/withdrawal-strategy.ts`): in het grootboek wordt het surplus bóven de leefbehoefte **niet geconsumeerd/herbelegd**, dus de spend-down-annuïteit (die het surplus opspendt) zou het laten verdampen en de nalatenschap onhaalbaar maken. Door alleen de behoefte te onttrekken groeit het residu vanzelf naar het nalatenschapsbedrag. Default in de gedeelde functie blijft de annuïteit (v1 ongewijzigd). Zie ADR 0014.

### 4.7 Eigen-huis-downsize = asset-liquidatie in het grootboek (ADR 0015)

De v1-aanpak filtert het eigen huis + hypotheek uit de pot en spuit de verkoop als eenmalig inkomen in → het netto vermogen **springt** bij verkoop (de overwaarde zat er niet in en "verschijnt" als cash) en de woningwaarde-groei is onzichtbaar. v2 lost dit op met een **asset-liquidatie**:

- Het huis blijft een **niet-liquide asset in het grootboek** (`NON_LIQUID`: in netto vermogen, groeit op `expected_return`, niet besteedbaar). v2 filtert het huis dus niet; v1 wel (byte-identiek).
- Op de trigger-leeftijd (`UnifiedProjectionInput.assetLiquidations`, gevuld door `build-input.ts`; v1 negeert het veld) verkoopt de engine het asset: huiswaarde verlaat het grootboek, de gekoppelde hypotheek wordt afgelost (saldo → 0, woonlast stopt), de **netto-opbrengst** stroomt naar liquide. Netto-vermogenseffect = **−verkoopkosten**; alleen de liquiditeit verspringt.
- Het verkoopmoment ligt op **v2's eigen liquide-pad** (`resolveDownsizeTriggerV2` in `build-input.ts`), niet op een v1-meetrun.
- **Eén valuatie-basis (code-review M4).** Zowel de daadwerkelijke verkoopopbrengst (`engine.ts`) als de verkoopkosten-buffer die het trigger-moment bepaalt (`resolveDownsizeTriggerV2`) worden op **dezelfde** grondslag gemeten: de **engine-asset-waarde** van het huis in het grootboek (= `current_value × inclusion`, jaarlijks gegroeid op het *reële* `expected_return`). De trigger leest die waarde rechtstreeks uit de meetrun-rij (`row.assets[eigen_huis].eind`) — **niet** `projectEigenHuisValuesAt(...).wozValue` (dat groeit nominaal en valt terug op `woz_value`, dat van `current_value` kan afwijken). Daarmee zijn buffer en opbrengst per constructie consistent én beide reëel; de veiligheidsmarge krijgt daarom géén nominale `(1+inflatie)^jaar`-indexering (de engine is volledig reëel).
- **Trigger-uitleg op v2's eigen pad (code-review M1).** `resolveDownsizeTriggerV2` levert náást de trigger-leeftijd een `SimulatedDepletionResult`-vormig uitleg-object (zelfde shape als `lib/housing-trigger.ts`), berekend op het v2-liquide-pad. Dat wordt via `extraMetadata` (`depletion` + `triggerMode`) op het v2-huur-event gezet zodat het "Waarom dit moment?"-panel (`event-pane-view.tsx` → `DepletionReasoning`) ook voor v2-downsize-gebruikers rendert — net als v1, maar zonder de v1-meetrun te herintroduceren.

Dit respecteert INV-4 (asset-level interventie als data op de input + verwerking in de pure jaar-loop, geen bespoke som buiten het grootboek). Scope = downsize; reverse_mortgage/include/exclude houden voorlopig het v1-model. De modal-preview (`runHousingScenarioProjectionV2` in `build-input.ts`, gekozen door de component op de profielvlag `horizonEngineV2`) draait hetzelfde model + dezelfde engine als de grafiek, zodat de copy "zelfde engine als de grafiek" klopt (code-review M2). *Bewaakt door* `test/horizon-housing-liquidation.test.ts`.

**include_full = woning besteedbaar (Optie A, ADR 0015).** Bij housing-mode `include_full` telt de woning volledig mee als **besteedbaar** FIRE-vermogen i.p.v. niet-liquide: `build-input` zet de `eigen_huis`-ids in `UnifiedProjectionInput.spendableAssetIds`, en de engine-helper `isNonLiquid(a)` (= `NON_LIQUID.has(type) && !spendable`) retourneert dan `false`. Zo bouwt een deplete/spend-down de woning óók af (eigen_huis staat al laatst in de onttrekkingsvolgorde), loopt de lijn naar ~€0 en matcht FIRE v1 — i.p.v. dat de niet-liquide woning ongemoeid bleef groeien (waardoor het netto vermogen nooit naar 0 liep en FIRE veel te laat viel). `exclude_from_fire` blijft uitsluiten; v1 negeert `spendableAssetIds`. *Bewaakt door* `test/horizon-housing-liquidation.test.ts` ("include_full = woning besteedbaar").

### 4.8 Recurring-eenheid: `amount` is een MAANDbedrag (× 12)

`SimCashflow.amount` is voor **recurring** kasstromen een **maandbedrag** — de conventie van `lifeEventsToCashflows`/`computeAowMonthly`, en v1 annualiseert via `recurringYearly = maand × maanden`. `activeRecurring` in de engine **moet dus × 12** (een eerdere versie telde het maandbedrag als jaarbedrag → AOW/pensioen/huur ~12× te laag, FIRE structureel te pessimistisch). In reële termen: geïndexeerd = vlak reëel (× 12); niet-geïndexeerd = nominaal vlak → erodeert met inflatie t.o.v. nu. One-time kasstromen zijn lump sums (géén × 12). *Bewaakt door* `test/horizon-engine.test.ts` ("recurring geïndexeerd … ×12"; "niet-geïndexeerd erodeert reëel"). Let op bij persona/handgebouwde cashflows: voer maandbedragen in (zie `persona.ts`).

---

## 5. De invarianten (genummerd, elk met de bewakende test)

> Dit zijn de architecturale invarianten. Een wijziging die er één breekt, verwatert de architectuur — herzie de invariant expliciet (ADR + dit document) of doe de wijziging niet.

**INV-1 — Single source of truth = `LedgerRow[]`, per individueel asset en per schuld.**
Alle views (A–G, grafiek) en de adapter zijn pure functies van `LedgerRow[]`; geen tweede rij-representatie, geen parallelle som.
*Bewaakt door:* `test/horizon-engine.test.ts` ("één rij per projectiejaar"; "chart-series consistent qua lengte"; "adapter levert één rij per jaar"), `views.rollupByType`/`buildChartSeries` (pure op `rows`). Structureel: `types.ts` keyt `assets`/`schulden` per individueel stuk.

**INV-2 — Intern reëel; de adapter is het ENIGE reëel→nominaal-punt.**
`realReturn`/`liquidRealReturn` in de engine; `× (1+inflatie)^jaar` uitsluitend in `adapter.rowToUnified`. Geen `inflationFactor`-vermenigvuldiging in `engine.ts`/`views.ts`.
*Bewaakt door:* `test/horizon-engine-compare.test.ts` (de bewuste −4…−14% nominale schaal-diff bevestigt dat de adapter terugrekent), code-review tegen deze invariant. **Borgvoorstel (§11):** een grep-/unit-guard dat `engine.ts` en `views.ts` geen `Math.pow(1 + inflation` bevatten.

**INV-3 — FIRE = forward doel-zoektocht (`meetsStrategyTarget`), geen crossing.**
De getoonde lijn is de geslaagde retire-at-f run; V_nodig is referentie.
*Bewaakt door:* `test/horizon-engine.test.ts` ("deplete: de getoonde lijn eindigt op ~€0"; "perpetual: eindigt NIET op 0"; legacy: "bereikbaar voor een gezonde spaarder", "eindvermogen haalt het nalatenschapsbedrag", "hoger bedrag → niet vroegere FIRE"), `test/horizon-persona.test.ts` ("bereikbaar FIRE-snijpunt op de voorbeelddata").

**INV-4 — Strategieën zijn pure plug-ins; nieuwe impact via plug-in of LedgerRow-kolom, nooit als special-case in de loop.**
Verdeling/volgorde via `strategies.ts`; onttrekkingsbedrag via het hergebruikte `lib/withdrawal-strategy.ts` (`applyWithdrawalStrategy`).
*Bewaakt door:* `strategies.ts` is generiek over string-keys + de plug-ins worden door de loop gecomponeerd (`allocateSurplus`/`withdrawFrom`); de withdrawal-suite in `lib/withdrawal-strategy` (static byte-identiek). Geen aparte test dwingt "geen special-case" af — dit is een **review-invariant** (§7).

**INV-5 — Engine is puur (geen Supabase); input = `UnifiedProjectionInput` (drop-in); hergebruikt bestaande domein-resolvers.**
*Bewaakt door:* `test/horizon-engine.test.ts` (construeert pure input, geen mocks); de imports in `engine.ts` (`classifyAsset`, `BOX3_PARAMS`, `applyWithdrawalStrategy`, `FireEndStrategy`, `NL_AOW_AGE`) — geen `@/lib/supabase`. **Borgvoorstel (§11):** grep-guard dat `lib/horizon-engine/**` geen `supabase` importeert.

**INV-6 — Flag-gated, default uit; selectie alleen in `runSelectedProjection`; legacy ongemoeid.**
`flag.isHorizonV2Enabled` (default false) → `loadHorizonData` → `/toekomst` → `useHorizonFireSim` → `runSelectedProjection`. v1 (`runUnifiedProjection`/`runSimulation`) blijft intact.
*Bewaakt door:* `select.ts` (één keuzepunt), de loader-keten (geverifieerd), en de plan-claim "default uit = byte-identiek aan v1, 16 integratietests groen".

**INV-7 — Box 3-drag per asset; deplete-annuïteit op het werkelijke gewogen reële rendement van de LIQUIDE portefeuille.**
`box3ById` per asset (forfait via `BOX3_PARAMS`); `liquidRealReturn(assets)` voedt `ctx.yearReturn`.
*Bewaakt door:* code (engine.ts §2b + de WithdrawalContext-opbouw), impliciet door de deplete-eindigt-op-~€0-test (INV-3).

---

## 6. Uitbreidingsregels / guardrails — "zo voeg je iets toe ZONDER de architectuur te verwateren"

Wanneer je hierna troubleshoot of een impact toevoegt, kies **altijd** één van deze drie sjablonen. Alles daarbuiten verwatert de architectuur.

1. **Nieuwe verdeling-/onttrekkings-regel → een plug-in in `strategies.ts`.** Voeg een pure functie + een veld op `HorizonStrategyOptions` toe; laat de loop 'm componeren via `allocateSurplus`/`withdrawFrom`. Niet in de jaar-loop inbakken.
2. **Nieuw onttrekkingsbedrag-gedrag → in `lib/withdrawal-strategy.ts`** (gedeeld met v1), niet in `engine.ts`. De engine roept alleen `applyWithdrawalStrategy`.
3. **Nieuwe per-jaar grootheid (belasting, kostenpost, herkomst) → een KOLOM op `LedgerRow`** + vullen in de forward-pass + tonen via een view/adapter-veld. Niet als losse parallelle berekening buiten het grootboek.

**Anti-patterns (verboden):**
- ❌ Een crossing/snijpunt-FIRE herintroduceren naast `meetsStrategyTarget` (breekt INV-3).
- ❌ Een nominale `× (1+inflatie)^jaar` ergens anders dan in `adapter.ts` (breekt INV-2).
- ❌ Een `if (event.type === 'X') …`-special-case in de jaar-loop i.p.v. een plug-in/kolom (breekt INV-4).
- ❌ Een nieuwe hardgecodeerde financiële constante in `engine.ts` (zie §10 — er staat al schuld; niet vergroten). Tarieven horen in `lib/constants.ts`/`lib/box3-data.ts` of (Box 1) in `lib/box1-tax.ts`.
- ❌ Een Supabase-call of React-import in `lib/horizon-engine/**` (breekt INV-5).
- ❌ Een tweede rij-representatie of een view die *niet* uit `LedgerRow[]` leest (breekt INV-1).
- ❌ De flag-keuze ergens anders dan in `runSelectedProjection` (breekt INV-6) — geen "even hier v2 aanroepen".

**Verplicht bij elke wijziging:** een testcase die de richting vastlegt (regressie), en — bij gedragswijziging — ADR 0013 + de catalogus-entry `horizon-grootboek-v2` + dit document meebijwerken.

---

## 7. Review-invarianten (niet automatisch getest — handmatig bewaken)

INV-4 ("geen special-case in de loop") en de "consume, don't recompute"-regel zijn niet door een test af te dwingen; bewaak ze in code-review. Concreet: bij een PR op `lib/horizon-engine/**` controleer je dat (a) nieuwe verdeling/onttrekking via `strategies.ts` of `withdrawal-strategy.ts` loopt, (b) er geen nieuwe financiële constante in `engine.ts` bijkomt, (c) de adapter het enige nominale punt blijft.

---

## 8. De grens met v1 + de flag

| | v1 — `lib/unified-projection.ts` | v2 — `lib/horizon-engine/` |
|---|---|---|
| Model | forward-loop + per-leeftijd binary search (`requiredAt`) | grootboek: forward V_op + backward V_nodig + forward doel-zoektocht |
| Eenheid | nominaal | reëel intern, nominaal via adapter (Route 2) |
| Granulariteit | per asset-type | per individueel asset + per schuld |
| FIRE | binary-search-scalar | vroegste leeftijd waarop `meetsStrategyTarget` |
| Pot-regels | opgeslagen, genegeerd | aangesloten via plug-ins (default-opties) |
| Status | productie-default voor iedereen | per-user flag, default uit |

**De flag.** `profiles.feature_preferences.horizon_engine_v2` (`isHorizonV2Enabled`). De keuze valt op exact één plek: `runSelectedProjection(input, useV2)` in `use-horizon-fire-sim.ts`. Toggle per gebruiker via `GET/PUT /api/horizon-engine` + `app/(app)/beheer/horizon-tabellen/horizon-v2-toggle.tsx` (schrijft alleen de eigen profielrij — RLS-correct, raakt geen andere gebruiker). Default uit = byte-identiek aan v1.

**Meta-oppervlakken (bewust NIET in de ArchiMate-topologie/HLD).** `/beheer/horizon-tabellen` (inspector, tabellen A–G + "Vergelijk v1↔v2") en de tijdelijke `/beheer/grafiek-werking` (functionele referentie) zijn ontwikkel-/inzicht-tooling. Ze horen niet op de plaat — ze beschrijven de plaat.

---

## 9. Open punten (en hoe ze de invarianten respecteren)

1. **Box 1 / HRA placeholder-constanten (Fase-2-schuld).** `engine.ts` bevat hardgecodeerde `SIMPLE_HRA_RATE = 0.37`, `SIMPLE_BOX1_WORK = 0.37`, `SIMPLE_BOX1_RETIRED = 0.2` (en `ONDERHOUD_PCT = 0.01`, `BOX3_YEAR = 2026`). Dit **botst met de CLAUDE.md-regel "geen financiële constanten buiten `lib/constants.ts`/`lib/box3-data.ts`"** (Box 3 komt al wél uit `box3-data`). *Op te ruimen:* Box 1/HRA per jaar via `lib/box1-tax.ts` (tabel D), als parameter per belastingjaar. **Respecteert de invarianten** mits het een `LedgerRow`-kolom blijft (INV-1/INV-4) en geen nieuwe nominale logica introduceert (INV-2). Tot dan: deze constanten zijn de enige bekende afwijking en mogen NIET worden uitgebreid.
2. **Pot-regels nog niet doorgedraad.** `profiles.pot_rules` (onttrekkingsvolgorde / verdeling-bij-toename / onttrekking-bij-afname) is niet aangesloten; v2 gebruikt `DEFAULT_STRATEGY_OPTIONS`. *Op te ruimen:* map `pot_rules` → `HorizonStrategyOptions` in de loader, doorgeven via `optsOverride`. De plug-in-architectuur (INV-4) ondersteunt dit al — het is louter de wiring.
3. **Income-growth = 0.** `incomeGrowthRate` wordt door de loader op 0 gezet en de engine modelleert (nog) geen carrièregroei. *Op te ruimen:* een reële inkomensdrift-kolom; INV-2 (reëel) blijft.
4. **Werkelijke tabellen voor de eigen gebruiker.** De inspector draait nu op persona-data; de echte-gebruiker-tabellen (transparantie) zijn nog te ontsluiten. Pure view op `LedgerRow[]` — raakt geen invariant.
5. **Cutover (onomkeerbaar, gated).** v2 als globale default + verwijderen van `runUnifiedProjection`/`runSimulation` raakt fee-analyse, hypotheek-vs-beleggen en household. Blijft gated tot de parity-diffs (`compareEngines`) akkoord zijn. **Vóór de flip:** adapter dekt álle huidige features (fase-kleuring, fractionele FIRE, scenario/MC/household-overlays, bronnen-breakdown, kassabon), what-if op dezelfde engine, en de Berekeningen-catalogus + ADR's bijgewerkt.

---

## 10. Bekende documentatie-afwijking (woordkeuze-schuld)

Het plan (`docs/horizon-tabel-rekenmotor-plan.md`) en ADR 0013 noemen op meerdere plaatsen het "**snijpunt**" van V_op × V_nodig als FIRE-bepaler. De **geïmplementeerde** en canonieke definitie is de **forward doel-zoektocht** (`meetsStrategyTarget`) — V_nodig is een referentielijn, niet de FIRE-bron. De code-comments in `engine.ts` zeggen dit al correct. *Op te ruimen:* het woord "snijpunt/crossing" in plan + ADR vervangen door "forward doel-zoektocht", zodat niemand bij het troubleshooten per ongeluk een crossing-FIRE herintroduceert (zou INV-3 breken).

---

## 11. Borgvoorstellen (versterkt de invarianten; nog niet geïmplementeerd)

Niet-bindende suggesties om de zwakst-bewaakte invarianten hard te maken (geen gedragswijziging):
- **INV-2/INV-5 grep-guard:** een unit-test die faalt als `lib/horizon-engine/engine.ts`/`views.ts` `Math.pow(1 + inflation` bevat, of als enig bestand in `lib/horizon-engine/**` (m.u.v. compare/select) `from '@/lib/supabase` importeert.
- **INV-1 view-purity:** een test die `rollupByType`/`buildChartSeries` op een gefabriceerde `LedgerRow[]` draait zonder de engine, om af te dwingen dat views echt puur op de rijen werken.
