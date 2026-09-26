# Fase 1 — inplug-map stroom X3: Doelen-lab + overlay-host

Bron: `git show c1b4849eb:components/app/horizon/horizon-client.tsx` (regelnummers hieronder gelden voor die versie). Kaart: `2026-09-26-toekomst-katernen-fase1-kaart.md` §1.5, §2.1, §5.1, §8 stap 9 en 11. Plan-besluiten Q5 (map `components/toekomst/overlays/`) en Q9 (ShellOverlay i.p.v. directe BottomSheet).

**Pure kopie.** Elke JSX-body is byte-gelijk aan zijn bronbereik (geverifieerd met `diff` tegen de snapshot). Props dragen exact de namen van de parent-variabelen, dus elke aanroep hieronder is `naam={naam}`.

**Typecompatibiliteit bewezen.** Een kopie van de snapshot met de drie aanroepen hieronder ingeplugd (en de bronbereiken eruit) compileert met 0 fouten tegen de nieuwe componenten. Een bewust fout type (`heroVraag={123}`, `events={input}`) gaf wél TS2322, dus de controle is echt. Het ingeplugde bestand staat als referentie in de scratchpad van de X3-sessie (`hc-plugged.tsx`); het is geen bron.

## Blok M — Doelen-lab

- **Bronbereik:** r7562–7653 (commentaarkop ADR 0170 + `{verkenSectieZichtbaar && (<section id={VERKEN_SECTION_ID} ref={verkenSectionRef}>…)}`)
- **Doelbestand:** `components/toekomst/doelen/doelen-lab.tsx` → `export function DoelenLab`
- **Plek:** vervangt r7562–7653 in de grafiekkaart, binnen de `simResult ? (…)`-tak, direct na `</ZoomableChartContainer></div>` (r7559–7560). In stap 9 blijft horizon-client de host; in stap 16 verhuist het lab naar Doelen.
- **Props:** 32
- **Aanroep:**

```tsx
<DoelenLab
  verkenSectieZichtbaar={verkenSectieZichtbaar}
  verkenSectionRef={verkenSectionRef}
  firstDragHintVisible={firstDragHintVisible}
  dismissFirstDragHint={dismissFirstDragHint}
  heroVraag={heroVraag}
  labKnoppen={labKnoppen}
  planEindVorm={planEindVorm}
  labUitkomstRegel={labUitkomstRegel}
  labZone={labZone}
  labGrenzenPending={labGrenzenPending}
  knopWeergave={knopWeergave}
  setKnopWeergave={setKnopWeergave}
  labFormatters={labFormatters}
  planIsDezeStop={planIsDezeStop}
  setStopPlanError={setStopPlanError}
  setStopPlanConfirmOpen={setStopPlanConfirmOpen}
  stopPlanSaving={stopPlanSaving}
  effectiveStopAge={effectiveStopAge}
  setActiveModal={setActiveModal}
  whatIfBaseline={whatIfBaseline}
  categorieReturnGroups={categorieReturnGroups}
  scenarioReturnDeltas={scenarioReturnDeltas}
  setScenarioReturnDeltas={setScenarioReturnDeltas}
  labOpslaanToestand={labOpslaanToestand}
  doelBlok={doelBlok}
  doelSaving={doelSaving}
  doelVastleggenMogelijk={doelVastleggenMogelijk}
  doelBijwerkenMogelijk={doelBijwerkenMogelijk}
  setDoelSheetOpen={setDoelSheetOpen}
  handleDoelHerstellen={handleDoelHerstellen}
  setDoelLoslatenOpen={setDoelLoslatenOpen}
  handleScenarioReset={handleScenarioReset}
/>
```

- **Imports die in horizon-client vrijkomen** (alleen weghalen als er geen andere gebruiker meer is; grep eerst): `LabKnoppen`, `LabIndicatieRegel`, `LabOpslaanBalk`, `VERKEN_SECTION_ID`, `WhatIfMarketAssumptions`, `LAB_COPY`. `formatAge` wordt elders nog gebruikt. De types `LabKnopConfig`/`LabKnopFormatters`/`LabKnopWeergave`/`LabUitkomstRegel`/`LabOpslaanToestand` blijven nodig voor de memo's.
- **Nieuwe test:** `components/toekomst/doelen/doelen-lab.test.ts`
- **Afwijkingen:** geen.

## Blok P — vastleg-, loslaat- en stopplan-bevestiging

- **Bronbereik:** r7786–7831 (DoelVastlegSheet, DoelLoslatenConfirm, StopPlanConfirm). De stale commentaarkop r7769–7785 (KATERN II-gate, kaart V7) is bewust niet meegekopieerd; schrap hem bij het inpluggen.
- **Doelbestand:** `components/toekomst/doelen/doelen-lab-sheets.tsx` → `export function DoelenLabSheets`
- **Plek:** vervangt r7769–7831, dus ná de SimChartModal en vóór KATERN III (r7833).
- **Props:** 22
- **Aanroep:**

```tsx
<DoelenLabSheets
  doelSheetOpen={doelSheetOpen}
  setDoelSheetOpen={setDoelSheetOpen}
  viewDoelPreviews={viewDoelPreviews}
  doelActief={doelActief}
  doelSaving={doelSaving}
  handleDoelVastleggen={handleDoelVastleggen}
  isFixedAnchorMode={isFixedAnchorMode}
  planAnchor={planAnchor}
  labPromotie={labPromotie}
  ankerStop={ankerStop}
  simResult={simResult}
  initialData={initialData}
  doelLoslatenOpen={doelLoslatenOpen}
  handleDoelLoslaten={handleDoelLoslaten}
  setDoelLoslatenOpen={setDoelLoslatenOpen}
  stopPlanConfirmOpen={stopPlanConfirmOpen}
  stopPlanSaving={stopPlanSaving}
  stopPlanError={stopPlanError}
  effectiveStopAge={effectiveStopAge}
  userAowAge={userAowAge}
  handleStopPlanBevestigen={handleStopPlanBevestigen}
  setStopPlanConfirmOpen={setStopPlanConfirmOpen}
/>
```

- **Imports die vrijkomen:** `DoelVastlegSheet` (de helpers `buildLiveStand` en `buildScenarioPersistPayload` en het type `DoelParameterPreview` blijven nodig), `DoelLoslatenConfirm`, `StopPlanConfirm`, `dekkingSheetToelichting`, `eindvermogenSheetToelichting`.
- **Nieuwe test:** `components/toekomst/doelen/doelen-lab.test.ts` (describe "doelen-lab-sheets")
- **Afwijkingen:** geen. De drie sheets zijn eigen componenten met hun eigen overlay-laag; hier staat geen directe BottomSheet.

## Blokken O, V, AA, AB, AC — gedeelde overlay-host

- **Bronbereik:**
  - O r7753–7767 — SimChartModal
  - V r10222–10314 — PhaseModalOpbouw/Overgang/Onttrekking
  - AA r10866–10914 — Scenarios-, Simulations-, Withdrawal- (dood, ongewijzigd) en Backtesting-modal, StrategieModal, UitgavenPane
  - AB r10916–10945 — HouseholdRetirementPane, EventPane
  - AC r10947–11025 — NaturalMilestoneSheet, EventClusterSheet, HorizonYearDetailsSheet
  - plus de `dynamic()`-declaraties r253–308 (12 stuks)
- **Doelbestand:** `components/toekomst/overlays/toekomst-overlays.tsx` → `export function ToekomstOverlays`. De lokale typen staan in `components/toekomst/overlays/types.ts` (`ActiveModal`, `ActiveFaseModal`, `StrategieInitialTab`, `HouseholdRetireInfo`, `EventPaneMode`, `ClusterSheetState`, `OvergangData`, `OnttrekkingData`, `Erfgenamen`), met het commentaar "integrator voegt samen in state/types.ts".
- **Plek:** één aanroep op de plek van AA (r10866), dus na de kassabons. O verschuift daarmee van r7753 naar het eind. Alle overlays zijn `fixed` of geportaleerd, dus de DOM-volgorde telt alleen als twee overlays tegelijk open staan. In de host staat O al als eerste, in dezelfde volgorde als de bron (O, V, AA, AB, AC).
- **Deeplink-effect E2 (r1054–1114) blijft in de parent.** De host leest geen searchParams.
- **Props:** 64
- **Aanroep:**

```tsx
<ToekomstOverlays
  simResult={simResult}
  simModalOpen={simModalOpen}
  setSimModalOpen={setSimModalOpen}
  simCashflows={simCashflows}
  currentAge={currentAge}
  effectiveInput={effectiveInput}
  fireParams={fireParams}
  canonicalDailyRate={canonicalDailyRate}
  unifiedRows={unifiedRows}
  activeFaseModal={activeFaseModal}
  setActiveFaseModal={setActiveFaseModal}
  fire={fire}
  initialData={initialData}
  debts={debts}
  displayEvents={displayEvents}
  healthScoreInput={healthScoreInput}
  kernelRawProfile={kernelRawProfile}
  overgangData={overgangData}
  fireStrategy={fireStrategy}
  onttrekkingData={onttrekkingData}
  erfgenamen={erfgenamen}
  partnerAowBedrag={partnerAowBedrag}
  nabestaandenPensioenBedrag={nabestaandenPensioenBedrag}
  activeModal={activeModal}
  setActiveModal={setActiveModal}
  effectiveFireTarget={effectiveFireTarget}
  isHouseholdView={isHouseholdView}
  householdInput={householdInput}
  fireSwr={fireSwr}
  setStrategieInitialTab={setStrategieInitialTab}
  loadData={loadData}
  startRefresh={startRefresh}
  router={router}
  strategieInitialTab={strategieInitialTab}
  aowRows={aowRows}
  uitgavenPaneOpen={uitgavenPaneOpen}
  setUitgavenPaneOpen={setUitgavenPaneOpen}
  householdRetireInfo={householdRetireInfo}
  householdRetireOpen={householdRetireOpen}
  setHouseholdRetireOpen={setHouseholdRetireOpen}
  refreshData={refreshData}
  input={input}
  withdrawalStrategyConfig={withdrawalStrategyConfig}
  eventPaneOpen={eventPaneOpen}
  setEventPaneOpen={setEventPaneOpen}
  eventPaneEditingId={eventPaneEditingId}
  eventPaneMode={eventPaneMode}
  eventPanePreviewBaseline={eventPanePreviewBaseline}
  selectedNaturalMilestone={selectedNaturalMilestone}
  setSelectedNaturalMilestone={setSelectedNaturalMilestone}
  clusterSheet={clusterSheet}
  setClusterSheet={setClusterSheet}
  eventStopAge={eventStopAge}
  naturalMilestones={naturalMilestones}
  setEventPaneEditingId={setEventPaneEditingId}
  setEventPaneMode={setEventPaneMode}
  selectedYearAge={selectedYearAge}
  setSelectedYearAge={setSelectedYearAge}
  displayUnifiedRows={displayUnifiedRows}
  displaySimRows={displaySimRows}
  events={events}
  userAowAge={userAowAge}
  effectiveChartPrimaryBasis={effectiveChartPrimaryBasis}
  eigenHuisMortgageIds={eigenHuisMortgageIds}
/>
```

- **Dynamic-imports:** haal r253–308 (ScenariosModal … HorizonYearDetailsSheet) **in dezelfde commit** uit horizon-client (kaart V3: geen twee instanties). `HouseholdFireSection`, `IncomeExpenseChart` en `HealthScoreReceipt` (r309–324) blijven staan.
- **Statische imports die vrijkomen:** `NaturalMilestoneSheet`, `EventClusterSheet`, `HouseholdRetirementPane`.
- **Nieuwe test:** `components/toekomst/overlays/toekomst-overlays.test.ts`
- **Afwijkingen (Q9): geen.** Geen van de blokken O/V/AA/AB/AC gebruikt in horizon-client een directe `BottomSheet`. De directe `BottomSheet`s van horizon-client zitten in de kassabons W–Z (Plan, stroom X1) en in het legacy-formulier U (A1, vervalt). Per overlay:

| Overlay | Laag in de bron | In de host |
|---|---|---|
| SimChartModal | eigen component | ongewijzigd |
| PhaseModalOpbouw/Overgang/Onttrekking | eigen component | ongewijzigd |
| ScenariosModal, SimulationsModal, WithdrawalModal, BacktestingModal | eigen component | ongewijzigd |
| StrategieModal, UitgavenPane, EventPane, HouseholdRetirementPane | eigen pane-component | ongewijzigd |
| NaturalMilestoneSheet, EventClusterSheet, HorizonYearDetailsSheet | eigen sheet-component | ongewijzigd |

## Euro-weergave (ADR 0090/0093)

- `doelen-lab.tsx`: `labKnoppen`, `labFormatters` en `labUitkomstRegel` komen gedeflateerd binnen (binnen de bakens gebouwd).
- `doelen-lab-sheets.tsx`: `viewDoelPreviews` komt gedeflateerd binnen.
- `toekomst-overlays.tsx`: alles komt nominaal binnen, in het kruis-regime.
  - `unifiedRows` gaat naar SimChartModal en naar de drie fase-modals (`rows`/`allRows`).
  - `displayUnifiedRows` en `displaySimRows` gaan naar HorizonYearDetailsSheet.
  - `effectiveFireTarget` gaat als invoer naar SimulationsModal en houdt zijn `// euro-view: exempt`.
- Geen van de drie bestanden roept `deflate*` aan of leest `inflationFactor`.

## Oude assertions die de integrator schrapt

Gesimuleerd door de bronbereiken uit de snapshot te knippen. Deze letterlijke ankers vallen dan naar 0 treffers en worden rood:

| Test | Regel | Anker | Nu gepind in |
|---|---|---|---|
| `horizon-client.doel-loslaten-terugweg.test.ts` | 81–82 | `vastleggenMogelijk={doelVastleggenMogelijk}`, `bijwerkenMogelijk={doelBijwerkenMogelijk}` | `doelen-lab.test.ts`; de delen over `const labOpslaanToestand` en `resolveLabUitkomst` blijven in de oude test |
| `horizon-client.lab-uitkomst.test.ts` | 56–57, 61–62 | `<LabOpslaanBalk`, `toestand={labOpslaanToestand}`, `vastleggenMogelijk=…`, `bijwerkenMogelijk=…` | `doelen-lab.test.ts`; de blok-assertion r64–70 op `const labOpslaanToestand` blijft |
| `horizon-client.lab-uitkomst.test.ts` | 149 | `pending={labGrenzenPending}` | `doelen-lab.test.ts` |
| `horizon-client.lab-uitkomst.test.ts` | 199 | `previews={viewDoelPreviews}` | `doelen-lab.test.ts` (sheets) |
| `horizon-client.nu-stoppen.test.ts` | 136 | `Je plan-keuzes` | `doelen-lab.test.ts`; r135 `setActiveModal('strategie')` blijft groen via blok N |
| `horizon-client.na-pensioen-klik.test.ts` | 65 | `/\{householdRetireInfo && \(\s*<HouseholdRetirementPane/` | `toekomst-overlays.test.ts` |
| `horizon-client.na-pensioen-klik.test.ts` | 70 | `/<UitgavenPane open=\{uitgavenPaneOpen\}/` | `toekomst-overlays.test.ts` |

Deze blijven groen, maar met minder treffers:
- `labPromotie.kind === 'eindvermogen'` (2→1)
- `startRefresh(() => router.refresh())` (4→3)
- `fireParams.inflationRate` (11→7; de kassabon blijft)

De negatieve fase-modal-assertions in `horizon-client.euro-view.test.ts` r343–350 blijven groen, maar zeggen op horizon-client niets meer; hun tegenhanger staat in `toekomst-overlays.test.ts`. De deeplink-bron-grendel (`lib/horizon/deeplink-cleanup.test.ts` r89) blijft op horizon-client zolang E2 daar staat.

## Open punten voor de integrator

1. **`loadData` (stap 3, A1).** De host krijgt `loadData` op vier plekken: StrategieModal onClose/onSaved, UitgavenPane onClose en EventPane onChanged. Vervangt stap 3 `loadData` door `router.refresh()`, pas dan de host-body aan in díe stap, niet hier. Dat is geen pure move meer; noteer het als S.
2. **`nabestaandenPensioenBedrag`** hangt aan `pensionParseResult` uit het legacy-formulier, dat stap 2 weghaalt. Na stap 2 is hij altijd `undefined`. Maak de prop dan een constante `undefined`, of haal hem weg met een aanpassing in de host (S).
3. **E2 blijft in de parent.** Verhuist E2 naar de provider (stap 11/13), dan gaat de bron-grendel `lib/horizon/deeplink-cleanup.test.ts` r89 mee naar dat bestand. De host-test pint alleen dat de host zelf géén deeplinks leest.
4. **`types.ts`** samenvoegen met `components/toekomst/state/types.ts` (stap 4). `ActiveModal` staat nu ook nog lokaal in horizon-client r369.
5. **WithdrawalModal** is dood: `?modal=withdrawal` wordt in stap 18 een redirect naar Instellingen. Verwijder hem zodra die redirect staat, samen met zijn `dynamic()` en de `withdrawal`-tak van `ActiveModal`.
6. **Eerste-sleep-hint "Begrepen"** in het Doelen-lab heeft geen `min-h-[44px]`. `check:tap-targets` laat hem door (hij is bron-identiek); fase 2 kan dat als bijvangst oppakken.
