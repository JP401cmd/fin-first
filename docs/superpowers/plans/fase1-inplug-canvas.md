# Fase 1 — inplug-map Canvas (stroom X2)

Bron: `git show c1b4849eb:components/app/horizon/horizon-client.tsx` (regelnummers hieronder zijn die van c1b4849eb, niet van de werkboom — A1 verschuift ze).
Doelmap: `components/toekomst/canvas/`. Kaart: `2026-09-26-toekomst-katernen-fase1-kaart.md` §1.5, §2.1, §4, §5.1, §8 stap 4 en 7.

**Werkwijze.** Elk blok is een pure kopie: de JSX-body staat byte-gelijk in het nieuwe bestand (gecontroleerd met een substring-vergelijking tegen de vastgepinde bron). Props dragen exact de namen van de parent-variabelen, dus elke aanroep hieronder is `naam={naam}`. Plak de aanroep op de plek van het bronbereik, voeg de import toe en verwijder daarna de parent-imports die alleen dat blok gebruikte (eslint `no-unused-vars` wijst ze aan).

Imports voor de host:

```tsx
import { CanvasTipsToggle } from '@/components/toekomst/canvas/canvas-tips-toggle'
import { CanvasLegeStaat } from '@/components/toekomst/canvas/canvas-lege-staat'
import { CanvasPills } from '@/components/toekomst/canvas/canvas-pills'
import { CanvasUitleg } from '@/components/toekomst/canvas/canvas-uitleg'
import { CanvasGrafiek } from '@/components/toekomst/canvas/canvas-grafiek'
import { CanvasLegenda } from '@/components/toekomst/canvas/canvas-legenda'
import {
  COLOR_LIFE_INCOME, COLOR_LIFE_EXPENSE, COLOR_NAT_ASSET, COLOR_NAT_DEBT, COLOR_NAT_SIM,
  COLOR_NAT_DANGER, COLOR_PARTNER_EVENT, COLOR_GOAL, COLOR_GOAL_OVERDUE,
} from '@/components/toekomst/canvas/marker-kleuren'
```

Nieuwe tests (alle in `components/toekomst/canvas/`, groen via PowerShell):

| Test | Pint |
|---|---|
| `canvas-grafiek.euro-view.test.ts` | geen `deflate*`/`inflationFactor`/`useEuroView`/`Math.pow` in de canvas-bladeren; SimChart-, WealthComposition-, IE- en readout-feeds als `view*`; dagtarief ongedeflateerd; `cashflows` nominaal mét exempt; euro-kopregel; `stopAnchorFixed={isFixedAnchorMode}` |
| `canvas-pills.fire-surface-consistency.test.ts` | Marktcheck-pil `data-pill-keep` (B-025), doellijn-pil `data-pill-keep` |
| `canvas.tips-close.test.ts` | toggle → `handleOverlayExit`/`persistOverlayVisible(true)`; ToekomstOverlay `onClose={handleOverlayExit}`; geen `ToekomstExitNotice`/`useTipsFirstCloseNavigation`; voetnoot-knop (M9) |
| `canvas-grafiek.zoom-render-prop.test.ts` | PhaseBar/EventsTimeline/IE-grafiek in de render-prop met het zoomvenster (V4/Q4); render-volgorde; IE-dynamic verhuisd (V3); HideInSimple-grenzen (V7) |
| `canvas-legenda.test.tsx` | render: scenario-% = `(grossReturn + SCENARIO_VARIANTS[i].delta) * 100`, voetnoot uit `STRATEGY_LABELS`, hint uit `ankerTitel`, knoppen raken de setters |
| `canvas-tips-toggle.test.tsx` | render: aan → exit-handler, uit → `persistOverlayVisible(true)`, `aria-pressed` |

---

## 0. `COLOR_*` → `marker-kleuren.ts`

- **Bron:** r2293–2313 (inclusief de kopcommentaarregels 2293–2296).
- **Doel:** `components/toekomst/canvas/marker-kleuren.ts` (module-constanten, `export const`).
- **Inpluggen:** verwijder r2293–2313 uit de component-body en importeer de constanten (zie importblok). Gebruik in de parent na de move: `COLOR_LIFE_INCOME/EXPENSE` r2353, `COLOR_NAT_DANGER` r2372/2454, `COLOR_NAT_DEBT` r2374, `COLOR_NAT_ASSET` r2376/2466, `COLOR_NAT_SIM` r2377, `COLOR_PARTNER_EVENT` r2415/2437 (en r7353 → nu in `canvas-grafiek`), `COLOR_GOAL(_OVERDUE)` r2324/2325. Kaart §8 stap 4 wees deze move aan de integrator toe; X2 levert het bestand al.
- **Tests:** geen oude assertion op deze namen.
- **Afwijking:** consts verhuizen van render-scope naar module-scope (waarden identiek, geen gedragsverschil; ze hingen van niets af). `COLOR_PARTNER_EVENT = '#0d9488'` is een losse hex voor partner-identiteit — bestaand, bewust niet "verbeterd" (pure move). Kandidaat voor een token-kaart na fase 1.

## 1. Blok A — Tips-toggle → `canvas-tips-toggle.tsx` (3 props)

- **Bron:** r5814–5829 (het `STEP 3b`-commentaar + de `<button>`). Kicker, dode i (`PageInfoButton`) en dode h1 vervallen via A1.
- **Plek:** de canvas-kopregel (V11). Zolang die er niet is: op de plek van r5814–5829 in de `absolute right-4 top-0`-wrapper.

```tsx
<CanvasTipsToggle
  overlayVisible={overlayVisible}
  handleOverlayExit={handleOverlayExit}
  persistOverlayVisible={persistOverlayVisible}
/>
```

- **Oude assertions schrappen:** geen (de exit-handler-test in `horizon-client.tips-close.test.ts` r26–32 blijft bij de host tot de provider hem overneemt).
- **Afwijking:** component rendert een fragment (commentaar + knop).

## 2. Blok I (lege staat) → `canvas-lege-staat.tsx` (2 props)

- **Bron:** r6544–6562 (de `<div className="py-8" …>` binnen de ternary). De ternary `{!simResult && !loading ? ( … ) : simResult ? (` op r6543/r6563 blijft in de host.
- **Plek:** tussen `!simResult && !loading ? (` en `) : simResult ? (`.

```tsx
<CanvasLegeStaat
  simError={simError}
  loadData={loadData}
/>
```

- **Oude assertions schrappen:** geen.
- **Afwijking:** prop-type `loadData: () => void | Promise<void>` (breder dan de huidige `() => Promise<void>`) zodat A1's stap 3 (`loadData` → `router.refresh()`) hier niets breekt. Na stap 3 kan de integrator de host-callback onder dezelfde propnaam doorgeven, of prop + body hernoemen in één commit.

## 3. Blok J — pills + ChartTips → `canvas-pills.tsx` (39 props)

- **Bron:** r6834–7155 (commentaar `Overlay toggles` t/m `</PillRow>`).

```tsx
<CanvasPills
  chartMode={chartMode}
  scenariosExpanded={scenariosExpanded}
  setScenariosExpanded={setScenariosExpanded}
  scenarioData={scenarioData}
  mcExpanded={mcExpanded}
  setMcExpanded={setMcExpanded}
  mcMarge={mcMarge}
  mcFailed={mcFailed}
  mcPending={mcPending}
  hasDoelLijn={hasDoelLijn}
  showScenarioLine={showScenarioLine}
  setShowScenarioLine={setShowScenarioLine}
  doelLijnLabel={doelLijnLabel}
  hasScenario={hasScenario}
  scenarioFireDeltaLabel={scenarioFireDeltaLabel}
  scenarioPending={scenarioPending}
  stopPadPending={stopPadPending}
  dualBasisAvailable={dualBasisAvailable}
  effectiveChartPrimaryBasis={effectiveChartPrimaryBasis}
  showLiquidLine={showLiquidLine}
  persistLiquidLine={persistLiquidLine}
  showLifeEvents={showLifeEvents}
  persistLifeEvents={persistLifeEvents}
  events={events}
  goalChartMarkers={goalChartMarkers}
  showGoals={showGoals}
  persistGoals={persistGoals}
  showNaturalMilestones={showNaturalMilestones}
  persistNaturalMilestones={persistNaturalMilestones}
  naturalMilestones={naturalMilestones}
  isPlaying={isPlaying}
  setIsPlaying={setIsPlaying}
  setChartMode={setChartMode}
  simResult={simResult}
  userAowAge={userAowAge}
  currentAge={currentAge}
  monteCarloOverlay={monteCarloOverlay}
  planningMode={planningMode}
  isFixedAnchorMode={isFixedAnchorMode}
/>
```

- **Let op:** de aanroep staat binnen de `simResult ? (…)`-tak; `simResult` is daar vernauwd tot `SimResult` en de prop is non-null getypt.
- **Oude assertions schrappen:** `lib/fire-surface-consistency.test.ts` r240–254 ("de Marktcheck-pil houdt haar label…") — nu in `canvas-pills.fire-surface-consistency.test.ts`.
- **Afwijking:** geen. `monteCarloOverlay` (nominaal) gaat mee alleen voor `hasMonteCarlo: !!monteCarloOverlay` in de ChartTips, zoals in de bron.

## 4. Blok K — explainers + LifelineReadout → `canvas-uitleg.tsx` (12 props)

- **Bron:** r7157–7237 (commentaar `Editorial quote-explainers` t/m de `</HideInSimple>` rond de readout).

```tsx
<CanvasUitleg
  scenariosExpanded={scenariosExpanded}
  scenarioData={scenarioData}
  mcExpanded={mcExpanded}
  mcData={mcData}
  mcMarge={mcMarge}
  mcFailed={mcFailed}
  liquidWealthPoints={liquidWealthPoints}
  chartMode={chartMode}
  secondaryLineVisible={secondaryLineVisible}
  effectiveChartPrimaryBasis={effectiveChartPrimaryBasis}
  viewReadoutData={viewReadoutData}
  lifelineAge={lifelineAge}
/>
```

- **Euro:** `viewReadoutData` komt van de render-grens (r5510); `liquidWealthPoints` is de nominale feed en wordt alleen op `!= null` getoetst (zoals in de bron).
- **Oude assertions schrappen:** geen specifieke (de readout-bron `readoutNetWorth = row.startNetWorth` in `fire-surface-consistency.test.ts` r234–238 zit in de host-memo en blijft).
- **Afwijking:** fragment als wrapper.

## 5. Blok L — de grafiek → `canvas-grafiek.tsx` (76 props)

- **Bron:** r7239–7560: de wrapper `<div className="-mx-4 sm:-mx-6 md:-mx-8 overflow-hidden">` (r7239) t/m zijn `</div>` (r7560). De kaart noemt 7240–7560; de wrapper-div hoort erbij, anders sluit de tag in de host.
- **Inhoud:** ZoomableChartContainer → render-prop `(visibleMin, visibleMax, controls)` met ProjectieLaadlaag, ToekomstOverlay (SimChart + WealthCompositionChart), IE-uitklap + IncomeExpenseChart, EventsTimeline, PhaseBar (Q4: blijft hier in fase 1).

```tsx
<CanvasGrafiek
  currentAge={currentAge}
  chartEndAge={chartEndAge}
  projectiePending={projectiePending}
  overlayVisible={overlayVisible}
  chartMode={chartMode}
  overlayPrefRestored={overlayPrefRestored}
  setOverlayEmphasis={setOverlayEmphasis}
  toekomstOverlayBalloons={toekomstOverlayBalloons}
  useHouseholdMainLine={useHouseholdMainLine}
  householdMainLine={householdMainLine}
  usePartnerMainLine={usePartnerMainLine}
  partnerLine={partnerLine}
  simResult={simResult}
  effectiveNetWorth={effectiveNetWorth}
  hasPerspectiveHero={hasPerspectiveHero}
  perspectiveHero={perspectiveHero}
  heroFireAge={heroFireAge}
  masked={masked}
  planAnchor={planAnchor}
  ankerReach={ankerReach}
  ankerStop={ankerStop}
  handleOverlayExit={handleOverlayExit}
  overlayEmphasis={overlayEmphasis}
  lifelineAge={lifelineAge}
  setLifelineAge={setLifelineAge}
  displayMode={displayMode}
  viewHouseholdMainLineRows={viewHouseholdMainLineRows}
  viewPartnerLineRows={viewPartnerLineRows}
  viewDisplaySimRows={viewDisplaySimRows}
  simCashflows={simCashflows}
  viewFireTarget={viewFireTarget}
  showDualFireTarget={showDualFireTarget}
  viewFireTargetInclHome={viewFireTargetInclHome}
  viewTargetEndPortfolio={viewTargetEndPortfolio}
  viewTargetInflationFactors={viewTargetInflationFactors}
  dualBasisAvailable={dualBasisAvailable}
  viewLiquidWealthPoints={viewLiquidWealthPoints}
  effectiveChartPrimaryBasis={effectiveChartPrimaryBasis}
  secondaryLineVisible={secondaryLineVisible}
  partnerName={partnerName}
  viewCombinedScenarioOverlays={viewCombinedScenarioOverlays}
  labZone={labZone}
  nalatenschapMarker={nalatenschapMarker}
  scenarioPending={scenarioPending}
  stopPadPending={stopPadPending}
  viewMonteCarloOverlay={viewMonteCarloOverlay}
  canonicalDailyRate={canonicalDailyRate}
  viewHouseholdOverlays={viewHouseholdOverlays}
  userAowAge={userAowAge}
  planningMode={planningMode}
  isFixedAnchorMode={isFixedAnchorMode}
  chartEventOverlay={chartEventOverlay}
  handleChartEventClick={handleChartEventClick}
  handleChartEventDragEnd={handleChartEventDragEnd}
  handleChartEventDragMove={handleChartEventDragMove}
  handleChartClusterOpen={handleChartClusterOpen}
  viewWealthCompositionRows={viewWealthCompositionRows}
  kernelHousingSale={kernelHousingSale}
  homeExcludedFromProgress={homeExcludedFromProgress}
  setSelectedYearAge={setSelectedYearAge}
  incomeExpenseExpanded={incomeExpenseExpanded}
  setIncomeExpenseExpanded={setIncomeExpenseExpanded}
  ieViewMode={ieViewMode}
  setIeViewMode={setIeViewMode}
  viewIeBreakdownResult={viewIeBreakdownResult}
  eventsForTimeline={eventsForTimeline}
  setClusterSheet={setClusterSheet}
  naturalMilestones={naturalMilestones}
  router={router}
  setEventPaneEditingId={setEventPaneEditingId}
  setEventPaneMode={setEventPaneMode}
  setEventPaneOpen={setEventPaneOpen}
  handleEventDragEnd={handleEventDragEnd}
  eventStopAge={eventStopAge}
  isPensioenMode={isPensioenMode}
  setActiveFaseModal={setActiveFaseModal}
/>
```

- **Euro-grens:** alle bedragfeeds zijn `view*` (r4977–5614 blijft in de host). Nominaal, zoals in de bron: `simCashflows` (exempt-commentaar staat mee op de callsite), `canonicalDailyRate` (D15), `effectiveNetWorth` (summary van de tips-laag), `householdMainLine`/`partnerLine`/`simResult` (alleen leeftijden). Het bestand deflateert niets en importeert `useEuroView` niet (gepind).
- **Mee verhuisd:** `const IncomeExpenseChart = dynamic(…)` (bron r313–316). Na inpluggen de declaratie in de host **verwijderen** (V3: nooit dubbel declareren; de host heeft geen andere consument).
- **Oude assertions schrappen:**
  - `horizon-client.euro-view.test.ts` r128–136 (naamconventie SimChart-feeds) → `canvas-grafiek.euro-view.test.ts`;
  - idem r294–309 (dagtarief `dailyExpenseRate={canonicalDailyRate}`) → idem;
  - idem r320 alleen de regel `expect(src).toMatch(/stackedRows=\{viewWealthCompositionRows\}/)`; het `STACKED_ROW_MONEY_FIELDS`-deel blijft bij de provider/`euro-view-feeds.ts`;
  - `horizon-client.nu-stoppen.test.ts` r103–105 (`stopAnchorFixed={isFixedAnchorMode}`) → `canvas-grafiek.euro-view.test.ts` ("de grafiek krijgt het anker…").
- **Afwijkingen:**
  - `router` is getypt als `Pick<ReturnType<typeof useRouter>, 'push'>`: de body gebruikt alleen `router.push('/core/debts'|'/core/assets')`. De host geeft zijn eigen `router` door.
  - `controls` uit de render-prop is ongebruikt (eslint-warning, ook zo in de bron). Laten staan voor de pure-move-diff.
  - `toekomstOverlayBalloons` (r5807, const uit `TOEKOMST_OVERLAY_BALLOONS`) blijft in de host en gaat als prop mee.

## 6. Blok N — legenda + voetnoot + strategie-hint → `canvas-legenda.tsx` (12 props)

- **Bron:** r7655–7744 (commentaar `Legenda + detail-links` t/m de strategie-hint-`</button>`). Het commentaar r7746–7747 en het einde van de `simResult`-tak blijven in de host.

```tsx
<CanvasLegenda
  scenariosExpanded={scenariosExpanded}
  scenarioData={scenarioData}
  fireParams={fireParams}
  setActiveModal={setActiveModal}
  mcExpanded={mcExpanded}
  mcData={mcData}
  mcMarge={mcMarge}
  liquidWealthPoints={liquidWealthPoints}
  simResult={simResult}
  setSimModalOpen={setSimModalOpen}
  isFixedAnchorMode={isFixedAnchorMode}
  ankerStop={ankerStop}
/>
```

- **Oude assertions schrappen:** `horizon-client.tips-close.test.ts` r94–98 ("maakt de voetnoot onder de grafiek zelf een knop…") → `canvas.tips-close.test.ts`.
- **Afwijking:** fragment als wrapper. De scenario-% (`(fireParams.grossReturn + SCENARIO_VARIANTS[i].delta) * 100`) is een bestaande weergave-som in de bron; ongemoeid gelaten en nu door een render-test gepind.

---

## Open punten voor de integrator

1. **Zoom-render-prop.** Alles wat `visibleMin`/`visibleMax` leest zit in één component (`CanvasGrafiek`). Wil fase 2 PhaseBar per katern tonen of verplaatsen, dan moet de zoomstaat eerst uit `ZoomableChartContainer` naar de provider (V4); tot die tijd niet opknippen.
2. **Euro-grens.** De canvas-bladeren consumeren alleen; de grens (r4977–5614) blijft in de host of gaat als geheel naar `state/euro-view-feeds.ts`. `canvas-grafiek.euro-view.test.ts` bewaakt dat er in `components/toekomst/canvas/` geen tweede grens ontstaat — de oude grens-tests (1–3, 8–13) blijven op het providerbestand.
3. **Typen.** `components/toekomst/canvas/types.ts` bevat kopieën van horizon-client-typen (`ActiveModal`, `HouseholdHeroData`, `HouseholdMainLine`, `PartnerLine`, `ChartMode`, `IeViewMode`, `ActiveFaseModal`, `EventPaneMode`, `ClusterSheet`, `OverlayEmphasis`, `ReadoutData`). Samenvoegen in `state/types.ts` (kaart stap 4) en de host-`useState`-generieken daarop laten wijzen, anders lopen de twee stil uiteen. X1/X3 kunnen dezelfde typen gekopieerd hebben.
4. **`loadData`** in de lege staat: zie blok I-afwijking.
5. **Inventaris-test** (`lib/horizon/toekomst-blokken.inventaris.test.ts`): blijft groen zodra de host de bladeren importeert. `LifelineReadout` (uitleg) en `SimChart` (grafiek) staan in verschillende bestanden en leggen elkaar dus geen volgorde meer op; binnen `canvas-grafiek` pint de nieuwe zoom-test de volgorde.
6. **`HideInSimple`** reist mee in elk blok (pills, readout, PhaseBar); niets als ternary.
