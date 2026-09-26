# /toekomst in drie katernen — fase 1 structuurkaart

Werkbasis voor de refactor-pijplijn fase 1 (spec `docs/superpowers/specs/2026-09-26-toekomst-drie-katernen-design.md` §9, ADR 0179 D1–D8).
Stand: werkboom 26 sep 2026, `components/app/horizon/horizon-client.tsx` = 11.029 regels. Alle regelnummers gelden voor die stand.
Read-only verkend; niets gewijzigd behalve dit bestand. "(H)" = hypothese, niet geverifieerd.

---

## 0. Kern in tien regels

- `horizon-client.tsx` = één component `HorizonPage` (r597–11028). Hooks + afleidingen r612–5808, JSX r5809–11027. Early return (r5621) staat ná alle hooks: geen voorwaardelijke hooks.
- Eén kaart (`<section data-testid="horizon-hero">`, r5874–7751) bevat Plan-KPI's, meldingen, het canvas én het lab. Die kaart moet in drieën: plan / canvas / doelen.
- Het canvas-deel draait volledig op state die ook buiten het canvas gelezen wordt (lab-zone, scenario-lijn, lifelineAge, tekort-lening-marker). Wat alleen het canvas leest, mag canvas-lokaal blijven: het canvas wordt nooit ontkoppeld.
- De euro-render-grens staat op r4977–5614 (bakens `EURO-WEERGAVE: DE RENDER-GRENS` / `EINDE EURO-WEERGAVE`).
- `loadData()` (r1434–1717) leest 15 Supabase-queries en 3 API-fetches. Elk gegeven dat hij zet zit al in `HorizonPageData`. Drie state-variabelen die hij zet, worden nergens gelezen.
- Een `router.refresh()` synchroniseert vandaag níets: de data-state is `useState(initialData.x)`. Vervanging vraagt dus eerst een prop→state-bron (zie §3).
- De 17 bron-scan-tests lezen allemaal (op één na) `horizon-client.tsx` letterlijk. 11 van hen pinnen invarianten die straks over ≥2 bestanden verspreid staan: splitsen.
- Grootste valkuilen: `useInViewOnce` haakt niet aan bij client-navigatie; de `?tab=`-guard kan niet in een layout (geen `searchParams`); `PhaseBar` hangt aan de zoom-render-prop; tweede `useHorizonFireSim` op Instellingen deelt rijstrook `main`; `check:overlays` blokkeert elk nieuw bestand met directe `BottomSheet`.

---

## 1. Structuurkaart `components/app/horizon/horizon-client.tsx`

### 1.1 Imports en exports

| Regels | Inhoud |
|---|---|
| 1 | `'use client'` |
| 3–5 | react-hooks (`useEffect, useState, useCallback, useRef, useMemo, useDeferredValue, useTransition`), `Link`, `useSearchParams/useRouter/usePathname` |
| 6–71 | lib-data/-rekenhulp: horizon-data-loader-typen, `useHorizonFireSim` (8), `createClient` (10, browser-client), format/box3/constants, core-metrics, aow, kernel-bridge, fire-params, withdrawal, budget-utils, retirement-expense-basis, effective-financials, natural-milestones, chart-event-overlay, goal-chart-markers |
| 72–128 | componenten: NaturalMilestoneSheet, ActionCard, `dynamic` (74), lucide (75–86), BottomSheet (87), housing-strategy, liquid-wealth-line, deficit-loan-*, notice-providers (103–108), KassabonShell, HideInSimple (111), HorizonTrendGrid, LifelineReadout, LevensinkomenStrook, perspective, horizon-helpers, editorial |
| 129–251 | lab/doel/anker: lab-grenzen-types, lab-knoppen (139–145), lab-opslaan-balk, scenario-chip (+`VERKEN_SECTION_ID`), dekkingsradar, scenario-kaarten, kernel-profile-basis, vrijheidsleeftijd-zin, doel-lijn-bron, hero-fire-age (155–162), fire-doel-weergave, anker-copy (168–199), lab-uitkomst, outcome-guard (210–216), toekomst-doel, doel-vastleg-sheet, WhatIfMarketAssumptions, DoelLoslatenConfirm, StopPlanConfirm, plan-draft, scenario-events (236–246), `resolveScenarioContext` (247), worker-runs `runLabGrenzenAsync/runMarktcheckAsync/runScenarioPresetsAsync` (249), `getPageInfo` (251) |
| 253–323 | 15× `next/dynamic` met `ssr:false`: ScenariosModal, SimulationsModal, WithdrawalModal, BacktestingModal, StrategieModal, UitgavenPane, EventPane, PhaseModalOpbouw/Overgang/Onttrekking, SimChartModal, HorizonYearDetailsSheet, HouseholdFireSection, IncomeExpenseChart, HealthScoreReceipt |
| 325–367 | PensionPdfUpload (legacy formulier), SimChart + `buildScenarioVariants`/`SCENARIO_VARIANTS`, ZoomableChartContainer, ProjectieLaadlaag, EventsTimeline, EventClusterSheet, PhaseBar, CHART_PAD, buildBreakdown, WealthCompositionChart, stacked rows, clipRowsToPlanEnd, simRowsToChartPoints, euro-display (339–347), `useEuroView` (348), PillRow, fire-strategy (350), buildHorizonInput, `buildDeeplinkCleanupUrl` (352), whatif-types, ChartOverlayExplainer, ChartTips, ToekomstOverlay + balloons, WidgetEmpty, unlinked-cash |
| 369 | `type ActiveModal` |
| 372–385 | `interface HouseholdHeroData` |
| 399–406 | `ReceiptCue` (puur, presentational) |
| 423–455 | `HeroKpiNotice` (puur, presentational) |
| 468–488 | `useInViewOnce` (custom hook) |
| 495–546 | `SIM_ROW_MONEY_FIELDS`, `SIM_ROW_NON_MONEY_FIELDS`, compile-gard `_SimRowDekking` |
| 553–567 | `STACKED_ROW_MONEY_FIELDS` |
| 585–595 | **export** `factorMapByPosition` |
| 597 | **export default** `HorizonPage({ initialData, embedded = false, goals })` |

Importeurs (grep op `lib app components`):
- `app/(app)/toekomst/page.tsx:7` (default).
- `app/(app)/toekomst/redirect-guard.test.ts:16` (`vi.mock` op het module-pad).
- `components/app/horizon/horizon-client.feed-keys.test.ts:14` (`factorMapByPosition`).
- Verder geen importeurs. `lib/architecture/calculations.ts` noemt het pad in `files[]` op r1351, 1716, 1752, 1796 en 2146; de gebeurtenissen-page staat op r1661.

### 1.2 Het `embedded`-prop

- Prop r599/610; de enige aanroeper geeft `embedded` = `true` (`toekomst/page.tsx:271`). De tak `embedded=false` is dus dood.
- r5833: `{!embedded && <PageInfoButton content={pageInfoText} />}` (dood). `pageInfoText` (r1053) wordt nergens anders gelezen.
- r5848–5865: `{!embedded && (<h1>…heroVraag…</h1>)}` (dood). Dit is de h1 waarvoor `scripts/check-heading-levels.mjs:114` een RESIDUE-entry heeft.
- Levend in de kop (r5812–5844), ook als `embedded`: de Tips-toggle (r5815–5829: `overlayVisible`, `handleOverlayExit`, `persistOverlayVisible`) en de kicker "Horizon · jouw vrijheidshorizon" + `PerspectiveContextLabel` (r5835–5844). Dit is de "dubbele kop" die in fase 1 vervalt. **De Tips-toggle moet dan een nieuwe plek krijgen** (zie §7, V11).

### 1.3 State per concern (`useState`/`useRef`)

**Sim en kernel.** Deze data-state wordt uitsluitend door `loadData`/`loadKernelContext` gezet, tenzij anders vermeld.
- r663 `fireParams`
- r664 `wsConfig` — dood, nooit gelezen
- r669 `withdrawalStrategyConfig`
- r691 `input`
- r697 `fire`, r700 `range` — gezet door het effect op r1913
- r703 `healthScore`, r704 `healthScoreInput` — effect r1913
- r705 `budgetingActive` — constant
- r707/708 `avgIncome6m`/`avgExpenses6m`
- r709 `resilienceSnapshots`
- r712 `events` — ook de drag-handlers r2552/2576 en r4921
- r713 `impacts` — alleen nog gelezen door dode code (§2.4)
- r714 `actions`
- r715 `debts`
- r717 `profileRaw` — dood
- r718 `estimatedYearlyIncome` — dood
- r719 `fireStrategy`
- r731 `userAowAge`
- r741 `kernelRawProfile`
- r748 `aowRows`
- r749 `loading` — constant `true`
- r760 `solvedRun`, r762 `haalbareUitgave`, r790 `scenarioPresets`, r791 `scenarioPresetsLoading` — preset-batch r2145
- r1050 `dataRefreshing`, r1051 `[refreshPending, startRefresh] = useTransition()`

**Scenario en lab.**
- r768 `scenarioUitgaveNaPensioen`, r974 `scenarioSliderEvents`, r975 `scenarioReturnDeltas`, r978 `scenarioStopAge`, r981 `showScenarioLine`, r989 `knopWeergave`, r1000 `scenarioNalatenschap`, r1009 `doelBlok` — alle geseed uit `initialData.toekomstScenarioPrefs`
- r992 `scenarioHydratedRef`, r1202 `hadScenarioRef`, r4345 `scenarioSaveSkipRef`, r4348 `scenarioPersistWarnedRef`
- r1013 `doelSheetOpen`, r1014 `doelSaving`, r1016 `doelLoslatenOpen`, r1019–1021 `stopPlanConfirmOpen/stopPlanSaving/stopPlanError`
- r1154 `firstDragHintVisible`, r1155 `firstDragHandledRef`
- r3794 `labGrenzen`, r3795 `labGrenzenPending`, r3803 `labGrenzenSeqRef`
- r966 `whatIfInlineOpen`, r1003 `verkenSectionRef`

**Lagen en pills.**
- r810 `showNaturalMilestones`, r813 `showLifeEvents`, r816 `showGoals`, r831 `showLiquidLine` — localStorage, gelezen in effect r844
- r773 `scenariosExpanded`, r774 `scenarioData`
- r782 `mcExpanded`, r783 `mcData`, r784 `mcPending`, r786 `mcFailed`, r788 `marktcheckGenRef`
- r1038 `overlayVisible`, r1040 `overlayEmphasis`, r843 `overlayPrefRestored`, r888 `exitNoticeDismissed`

**Chart-modus en zoom.**
- r794 `chartMode`, r792 `incomeExpenseExpanded`, r793 `ieViewMode`
- r802 `lifelineAge`, r803 `isPlaying`, r804 `playbackRafRef`
- De zoom zelf is intern aan `ZoomableChartContainer` (render-prop `(visibleMin, visibleMax, controls)`, r7240–7559).

**Perspectief en huishouden.** Gezet door effect r1751:
- r626 `householdHero`, r627 `partnerHero`, r628 `householdInput`, r629 `householdOverlays`, r632 `householdMainLine`, r643 `partnerLine`, r652 `partnerLifeEvents`, r938 `householdRetireInfo`
- r937 `householdRetireOpen`

**Meldingen.**
- Geen eigen state: de notice-hooks r3371 (`useDeficitNotice`), r3382 (`useAowNotice`) en r3413 (`useEindsituatieNotice`) registreren in de providers uit `toekomst/page.tsx`.

**Modals en panes.**
- r750 `activeModal`, r753 `strategieInitialTab`, r754 `simModalOpen`, r755 `activeFaseModal`
- r933 `retirementMethod` (door de KPI 4-tekst gelezen), r934 `uitgavenPaneOpen`
- r955–957 `eventPaneOpen/eventPaneEditingId/eventPaneMode`, r958 `clusterSheet`
- r959–962 `showFireAgeReceipt/showFireTargetReceipt/showResilienceReceipt/showSwrReceipt`
- r710 `healthChartOpen`, r711 `fireAgeChartOpen`
- r2476 `selectedNaturalMilestone`, r2483 `selectedYearAge`

**Legacy gebeurtenisformulier** (heel het blok vervalt): r1117–1132 form-state, r1135–1143 pensioen-PDF (`pensionParseResult`, `autoFilledFields`, `selectedRegelingIndex`, `pendingPensionFileRef`), r1146–1149 (`selectedEventId`, `viewModalMode`, `formCashflows`, `editingCashflowId`).

**Plan-review.** Geen state in horizon-client: `PlanReviewProvider` staat in `toekomst/page.tsx:207`. Het bestand is `components/future/plan-review/plan-review-provider.tsx`, niet `components/app/horizon/`.

**Euro-weergave.** r4998 `const { view: euroView } = useEuroView()`; alleen memo's, geen eigen state.

**Deeplinks.** r1043–1045 `searchParams/router/pathname`; effect r1054–1114.

**Context-hooks.**
- r621 `useMaskedAmounts`, r622 `useToast`, r623 `usePerspective` (`perspective, partnerName, perspectiveVersion, refreshData`), r798 `useDisplayMode`.
- r1028 `duidingInView = useInViewOnce(duidingSectionRef)` met `duidingSectionRef` r1027.

### 1.4 Custom hooks, effects en belangrijkste memo's/callbacks

`useHorizonFireSim` (r1253–1289). Het levert:
- `simResult, simCashflows, simError, unifiedRows, effectiveLifeEvents`
- `kernelStatus, kernelMaandHint, kernelHousingSale, aowOntbreekt`
- `scenario, stopPad, scenarioPending, stopPadPending, mainPending, kernelIsRefining`
- `firstPaintFireAge/FreedomPct/RequiredPortfolio/RequiredNetWorth`

De invoer: `input, events, fireStrategy, withdrawalStrategyConfig, fireParams, userAowAge, initialData.*, debts, kernelRawProfile, aowRows, scenarioOverrides, stopPadAge: scenarioStopAge`. De worker-rijstroken zijn `main`, `scenario` en `stoppad` (`lib/hooks/use-horizon-fire-sim.ts:680/709/736`).

| Effect | Regels | Deps | Doet |
|---|---|---|---|
| E1 | 844–870 | `[secondaryLinePrefKey]` | laag-prefs uit localStorage, zet `overlayPrefRestored` |
| E2 | 1054–1114 | `[searchParams, router, pathname]` | deeplinks `?modal/strategie/uitgaven/event/edit/whatif` + cleanup |
| E3 | 1176–1180 | `[firstDragHintVisible]` | hint na 7 s dicht |
| E4 | 1203–1207 | `[hasScenario]` | lijn aan bij eerste verkenning |
| E5 | 1384–1431 | `[initialData]` | `loadKernelContext` — **client-read** profiles/budgets/aow_leeftijd, alleen als de server-context onvolledig is |
| E6 | 1751–1907 | `[isHouseholdView, isPartnerView, partnerName, perspectiveVersion]` | `buildHouseholdProjectionInput(createClient())` → huishoud/partner-state; schrijft via die lib ook `set_household_combined_summary` |
| E7 | 1913–2004 | `[input, fireSwr, fireParams, avgIncome6m, avgExpenses6m, fireStrategy, simResult, firstPaintFreedomPct]` | `fire`, `range`, `healthScoreInput`, `healthScore`, `impacts` |
| E8 | 2012–2015 | `[input, displayEvents]` | `impacts` |
| E9 | 2018–2022 | `[scenariosExpanded, simResult, grossReturn]` | `scenarioData` |
| E10 | 2043–2078 | `[mcExpanded, deferredMarktcheckContext, deferredMarktcheckStopAge]` | marktcheck-worker, debounce + generatie-guard |
| E11 | 2093–2114 | `[whatIfBaseline, currentAge, toekomstScenarioPrefs]` | slider-hydratie, één keer |
| E12 | 2145–2206 | `[displayMode, duidingInView, isFixedAnchorMode, kernelRawProfile, …, initialData]` | preset-batch → `scenarioPresets`, `solvedRun`, `haalbareUitgave`. Gate `presetBatchNodig` r2150 |
| E13 | 2210–2217 | `[whatIfInlineOpen]` | scroll naar `verkenSectionRef` |
| E14 | 3191–3213 | `[isPlaying, displayUnifiedRows]` | afspelen |
| E15 | 3804–3897 | `[kernelRawProfile, effectiveInput, currentAge, whatIfBaseline, labKnopBereik, scenario*, effectiveStopAge, isFixedAnchorMode, planAnchor.kind, planStopAgeDefault, planEindVorm, debts, events, aowRows]` | lab-grenzen, lane `grenzen` |
| E16 | 4349–4406 | `[scenario*, showScenarioLine, knopWeergave, whatIfBaseline, currentAge, hasScenario, doelBlok, prefs, addToast]` | autosave `PUT /api/toekomst-scenario` (600 ms) |

Afgeleide feeds (nominaal, vóór de grens):
- Scenario en lab: `hasScenario` r1186, `scenarioOverrides` r1217, `whatIfBaseline` r2085, `scenarioVerwachtFireAge` r2125, `labUitkomst` r3037, `labPromotie`/`doelVastleggenMogelijk`/`doelBijwerkenMogelijk`/`labDekking` r3051–3069, `doelLijnBron` r3625, `scenarioLineOverlay` r3645, `combinedScenarioOverlays` r3666, `labKnopBereik` r3739, `labZone` r3900, `effectiveStopAge` r3691, `conceptGewijzigd` r4011, `labOpslaanToestand` r4024, `doelPreviews` r4053.
- Events en markers: `displayEvents` r1301, `eventPanePreviewBaseline` r1313, `marktcheckContext` r1356, `naturalMilestones` r2223, `eventsForTimeline` r2253, `deficitLoanNotice` r2278, `goalChartMarkers` r2319, `chartEventOverlay` r2337.
- Plan-anker en hero: `planAnchor`/`isFixedAnchorMode` r2141–2144, `effectiveFreedomPct` r2697, `ankerReach` r2723, `ankerStop` r2736, `heroVraag` r2748, `fireDoel` r2773, `heroFireAge` r2852, `overgangData` r2918, `onttrekkingData` r2957.
- Rijen en grafiek: `displayUnifiedRows` r2987, `duidingUnifiedRows` r3007, `coverageNodes` r3014, `radarAssen` r3079, `readoutData` r3125, `targetInflationFactors` r3236, `liquidWealthPoints` r3246, `housingHeldNotice` r3258, `displaySimRows` r3304, `wealthCompositionRows` r3577, `ieBreakdownResult` r3612.
- Perspectief: `usePartnerMainLine/useHouseholdMainLine` r3318/3320, `verkenSectieZichtbaar` r3340.
- Meldingen: `eindsituatieDuiding` r3398, `deficitLoanCopy` r3425.

Callbacks die schrijven:
- `handleChartEventDragMove` r2552 (lokaal).
- `handleChartEventDragEnd` r2576 — **client-mutatie** `life_events.update`.
- `handleEventDragEnd` r4921 — **client-mutatie** + undo, roept `loadData`.
- `handleDoelVastleggen` r4138, `handleDoelLoslaten` r4222 — `PUT /api/toekomst-doel` + `router.refresh`.
- `handleStopPlanBevestigen` r4259 — `/api/fire-settings` + `loadData` + `router.refresh`.
- `handleActionStatusChange` r4408 — `loadData`.

Hero-afleidingen na de grens (Plan-only): r5632–5807 (`perspectiveHero`, `fireTargetCaption`, `dualDoelRegels`, `heroFreedomState/Framing`, `showFreeHero`, `heroAgeLabel*`, `fireAgeNoticeGuard`, `showFireAgeNotice`, `retirementExpenseGuard`, `haalbareUitgaveRegel/Toon`).

### 1.5 JSX-blokken

"leest/roept" is automatisch gescand over de blokregels, met commentaar uitgefilterd. Kleine ruis is mogelijk (prop-namen die gelijk zijn aan een state-naam).

| # | Blok | Regels | Leest | Roept |
|---|---|---|---|---|
| A | kop (Tips-toggle, kicker, dode i + h1) | 5811–5866 | overlayVisible, embedded, heroVraag, pageInfoText | handleOverlayExit, persistOverlayVisible |
| A2 | `SectionLabel num="I"` | 5868–5871 | — | — |
| B | hero-kaart open + kaartkop + Details-pill (`relative z-[46]`) | 5873–5922 | chartMode, overlayVisible (class `no-hover-lift`), hasPerspectiveHero, perspectiveHero, isPartnerView, simResult | setSimModalOpen |
| C | mobiel kerngetal | 5924–5952 | heroFireAge*, showFreeHero, freeHeroPhrase, perspectiveHero, isPensioenMode | setShowFireAgeReceipt |
| D | desktop KPI-strip (4 cellen) | 5954–6185 | heroFireAge*, fireTargetGuard, fireAgeNoticeGuard, dualDoelRegels, fireTargetCaption, viewBalkVrijheidDoel, viewVermogenOpAnker, viewMonthlyWithdrawalAtAow, viewPerspectiveHeroFireTarget, retirementMethod, input, haalbareUitgaveRegel/Toon, isFixedAnchorMode, isNuStoppenMode, isKernelDepleteRate | setShowFireAgeReceipt, setShowFireTargetReceipt, setShowSwrReceipt, openRetirementExpensePane |
| E | ankerdrieslag + duidingszin | 6208–6256 | heroFireAge.anker, currentAge, solvedRun, simResult, isFixedAnchorMode, heroFreedomFraming, planAnchor, ankerReach, ankerStop, showFireAgeNotice | — |
| F | voortgangsbalk | 6258–6306 | effectiveFreedomPct, viewBalkVrijheidDoel, viewVermogenOpAnker, viewPerspectiveHeroFireTarget, masked | — |
| G | mobiele 2×2 KPI-strip | 6307–6507 | als D (+heroAgeLabelKort) | als D |
| H | gegevensmelding-link `/mijn/profiel` + profielfout + simError | 6508–6539 | showFire*Notice, showRetirementExpenseNotice, simError | — |
| I | lege staat (6543–6562: WidgetEmpty met `loadData`) **+ opening van de `simResult ? (…)`-tak die tot r7749 doorloopt** + meldingen: niet-haalbaar 6567, anker-tekort 6592, reached_now 6607, tekort-lening 6645–6718, AOW 6728–6771, eindsituatie 6777, huis-nooit-verkocht 6792–6832 | 6540–6833 | kernelStatus, kernelMaandHint, ankerReach/Stop, deficitLoanCopy/Notice, deficitDisplay…, aowDisplay…, eindsituatie…, housingHeldNotice, canonicalDailyRate, masked | loadData, router.push(`/toekomst/voorkeuren?regel=eindstrategie`) 6695, setStrategieInitialTab+setActiveModal('strategie') 6705/6822 |
| J | pills + ChartTips | 6834–7156 | chartMode, scenariosExpanded, scenarioData, mcExpanded/Pending/Failed/Marge, hasDoelLijn, showScenarioLine, scenarioFireDeltaLabel, scenarioPending, stopPadPending, dualBasisAvailable, showLiquidLine, showLifeEvents/Goals/NaturalMilestones, goalChartMarkers, naturalMilestones, isPlaying, simResult, userAowAge | setScenariosExpanded, setMcExpanded, setShowScenarioLine, persistLiquidLine/LifeEvents/Goals/NaturalMilestones, setIsPlaying, setChartMode |
| K | ChartOverlayExplainer ×5 + LifelineReadout | 7157–7239 | scenariosExpanded, mcData/Marge/Failed, liquidWealthPoints, secondaryLineVisible, effectiveChartPrimaryBasis, chartMode, viewReadoutData, lifelineAge | — |
| L | canvas: ZoomableChartContainer (7240) → ProjectieLaadlaag, ToekomstOverlay, SimChart (7307), WealthCompositionChart (7406), IE-uitklap + IncomeExpenseChart (7429–7498), EventsTimeline (7505), **PhaseBar (7539–7556, binnen de zoom-render-prop)** | 7240–7560 | alle `view*`-feeds, chartEventOverlay, eventsForTimeline, labZone, nalatenschapMarker, planAnchor, heroFireAge, householdMainLine, partnerLine, overlayVisible/Emphasis/PrefRestored, projectiePending, displayMode, lifelineAge | handleChartEvent*, handleChartClusterOpen, handleEventDragEnd, handleOverlayExit, setLifelineAge, setOverlayEmphasis, setSelectedYearAge, setClusterSheet, setEventPane*, setIncomeExpenseExpanded, setIeViewMode, setActiveFaseModal, router.push('/core/debts'/'/core/assets') |
| M | lab: `<section id={VERKEN_SECTION_ID} ref={verkenSectionRef}>` met eerste-sleep-hint, `LabKnoppen` (vraag=heroVraag, stopSlot, marktbias), `LabOpslaanBalk`, `LabIndicatieRegel` | 7562–7653 | verkenSectieZichtbaar, labKnoppen, labUitkomstRegel, labZone, labGrenzenPending, knopWeergave, labFormatters, planEindVorm, planIsDezeStop, effectiveStopAge, stopPlanSaving, whatIfBaseline, categorieReturnGroups, scenarioReturnDeltas, labOpslaanToestand, doelBlok, doelSaving, doelVastleggen/BijwerkenMogelijk | setKnopWeergave, setStopPlanError, setStopPlanConfirmOpen, setActiveModal('strategie'), setScenarioReturnDeltas, setDoelSheetOpen, handleDoelHerstellen, setDoelLoslatenOpen, handleScenarioReset, dismissFirstDragHint |
| N | legenda Scenario's/Marktcheck + voetnoot ("Open de jaar-op-jaar-tabel") + strategie-hint | 7655–7751 | scenarioData, mcData, mcMarge, liquidWealthPoints, fireParams, simResult, isFixedAnchorMode, ankerStop | setActiveModal('scenarios'/'simulations'/'strategie'), setSimModalOpen |
| O | SimChartModal | 7753–7767 | simModalOpen, simResult, simCashflows, currentAge, effectiveInput, fireParams, canonicalDailyRate, unifiedRows | setSimModalOpen |
| P | DoelVastlegSheet, DoelLoslatenConfirm, StopPlanConfirm | 7786–7831 | doelSheetOpen, viewDoelPreviews, doelActief, doelSaving, isFixedAnchorMode, labPromotie, ankerStop, planAnchor, simResult, doelLoslatenOpen, stopPlan*, effectiveStopAge, userAowAge | handleDoelVastleggen, handleDoelLoslaten, handleStopPlanBevestigen, setDoelSheetOpen, setDoelLoslatenOpen, setStopPlanConfirmOpen |
| Q | katern III: `<section ref={duidingSectionRef}>` binnen HideInSimple; levensinkomen 7858, radar 7902, ScenarioKaarten 7930; ScenarioChip 7864/7908 | 7833–7947 | coverageNodes, radarAssen, scenarioPresets(+Loading), viewScenarioPresets, lifelineAge, stopPad, duidingStopAge, scenarioVerwachtFireAge, hasScenario, hasStopKeuze, doelActief | — |
| R | HouseholdFireSection (HideInSimple) | 7949–7952 | personalHeroProjection | — |
| S | HorizonTrendGrid (HideInSimple) | 7956–7967 | resilienceSnapshots, healthScore, healthChartOpen, fireAgeChartOpen | setHealthChartOpen, setFireAgeChartOpen, setShowResilienceReceipt |
| T | Geplande acties (HideInSimple, `<h2>`) | 7970–7989 | actions | handleActionStatusChange |
| U | **legacy Event Form Modal** (BottomSheet) | 7992–10220 | form-state, impacts, pensionParseResult, fire, … | form-setters, saveEvent (4500 → client insert/update `life_events`, `refreshEvents`) |
| V | PhaseModalOpbouw/Overgang/Onttrekking | 10222–10314 | activeFaseModal, simResult, unifiedRows (nominaal), overgangData, onttrekkingData, fire, erfgenamen, nabestaandenPensioenBedrag (altijd `undefined` zonder legacy-form) | setActiveFaseModal |
| W | kassabon vrijheidsleeftijd | 10316–10472 | heroFireAge*, range, fire, aowOntbreekt, ankerReach/Stop, … | setShowFireAgeReceipt |
| X | kassabon doelbedrag | 10474–10582 | viewEffectiveFireTarget, fireTargetGuard, … | setShowFireTargetReceipt |
| Y | kassabon SWR | 10584–10833 | effectiveFireTarget, simCashflows, simResult, fireSwr | setShowSwrReceipt |
| Z | kassabon gezondheid → HealthScoreReceipt (dynamic) | 10835–10864 | healthScore | setActiveModal('backtesting') |
| AA | Scenarios-, Simulations-, Withdrawal- (dood), Backtesting-modal; StrategieModal; UitgavenPane | 10866–10914 | activeModal, effectiveInput, householdInput, strategieInitialTab, kernelRawProfile, aowRows, displayEvents | loadData, router.refresh, setActiveModal, setUitgavenPaneOpen |
| AB | HouseholdRetirementPane, EventPane | 10916–10945 | householdRetireInfo/Open, eventPane*, eventPanePreviewBaseline, fire | refreshData, loadData |
| AC | NaturalMilestoneSheet, EventClusterSheet, HorizonYearDetailsSheet | 10947–11025 | selectedNaturalMilestone, clusterSheet, selectedYearAge, displayUnifiedRows/SimRows (nominaal), … | router.push('/core/*'), setEventPane* |

---

## 2. Naden en bestemming

### 2.1 Bestemming per blok (fase 1, pure moves)

| Blok | Doelmap | Opmerking |
|---|---|---|
| A (Tips-toggle) | `canvas/` | Kicker, dode i en dode h1 vervallen. Toggle naar de canvas-kopregel (V11). |
| A2, B, C, D, E, F, G, H | `plan/` (bv. `plan-hero.tsx`, `plan-kpi-strip.tsx`) | B heeft z-[46] boven de tips-scrim (tips-close-test). |
| I-lege-staat (6543–6562) | `canvas/` | Zonder simResult geen grafiek op álle katernen. |
| I-meldingen (6567–6832) | `plan/plan-meldingen.tsx` | Fase 2 herverdeelt per katern. |
| J, K, L, N | `canvas/` (`toekomst-canvas.tsx`, `canvas-pills.tsx`, `canvas-legenda.tsx`) | **PhaseBar (L 7539) blijft in fase 1 in het canvas**: hij leest de zoom-render-prop (V4). |
| M, P | `doelen/doelen-lab.tsx` | `vraag={heroVraag}` blijft (ADR 0179 toets B10). |
| Q | `plan/plan-verdieping.tsx` | ScenarioKaarten pas in fase 4 naar Doelen. |
| R, S, T, Z | `plan/` | R moet op Plan gemount blijven (ADR 0168); S+Z verhuizen in fase 5. |
| W, X, Y | `plan/plan-kassabons.tsx` | Directe `BottomSheet` → `check:overlays` (V9). |
| O, V, AA, AB, AC + effect E2 | **gedeelde overlay-host** (voorstel `components/toekomst/state/toekomst-overlays.tsx`, of een nieuwe map `overlays/`, open vraag Q5) | Geopend vanuit canvas, deeplinks, en Plan én Doelen (StrategieModal). |
| U | verwijderen | `?modal=life_events` → EventPane catalog (`?event=new`). |

### 2.2 State die in de provider moet (gedeeld door ≥ 2 katernen, of door canvas plus een katern)

- **Sim/kernel:**
  - `input, events, debts, fireParams, fireStrategy, withdrawalStrategyConfig, kernelRawProfile, aowRows, userAowAge`
  - de hele `useHorizonFireSim`-uitvoer, `displayEvents`, `eventPanePreviewBaseline`, `currentAge`, `planAnchor/isFixedAnchorMode`
  - `fire/range/healthScore/healthScoreInput` (E7; Plan, EventPane, fase-modals)
  - `solvedRun/haalbareUitgave/scenarioPresets` (E12: hero-drieslag in Plan, lab-basis in Doelen, kaarten in Plan)
  - de `duidingInView`-grendel (zie V1)
  - `effectiveFreedomPct`, `heroFireAge` (Plan-KPI én canvas `ToekomstOverlay.summary` r7285)
- **Scenario/lab:**
  - alle `scenario*`, `showScenarioLine`, `knopWeergave`, `doelBlok`
  - `labGrenzen/labZone` (canvas `planZone` r7357 + lab), `labUitkomst`, `labKnoppen` (lab + `nalatenschapMarker` in canvas), `doelLijnBron`, `scenarioLineOverlay`
  - `duidingUnifiedRows/coverageNodes/radarAssen` (Plan-verdieping volgt het lab)
  - E11, E15, E16
  - de handlers `handleDoelVastleggen/Loslaten/StopPlanBevestigen/DoelHerstellen/ScenarioReset/ScenarioSliderValue`
- **Lagen** (D3: de keuze blijft staan):
  - `showNaturalMilestones/LifeEvents/Goals` — markers ook op het canvas; `chartEventOverlay` is in de provider nodig voor de cluster-sheet
  - `chartEventOverlay`, `naturalMilestones`, `eventsForTimeline`
  - `overlayVisible` (canvas én de `no-hover-lift`-class van de Plan-kaart B)
  - Canvas-lokaal mogen: `showLiquidLine`, `scenariosExpanded/scenarioData`, `mc*`, `overlayEmphasis`, `overlayPrefRestored`, `exitNoticeDismissed`
- **Chart-modus:**
  - `chartMode` (canvas + class in B + `wealthCompositionRows`-memo)
  - `lifelineAge` (canvas-readout + `LevensinkomenStrook activeAge` in Plan-Q r7896)
  - Canvas-lokaal mogen: `isPlaying`, `incomeExpenseExpanded`, `ieViewMode`, zoom
- **Perspectief:**
  - alle `household*`/`partner*`-state, E6
  - `usePartnerMainLine/useHouseholdMainLine`, `verkenSectieZichtbaar` (gate van het lab in Doelen), `perspectiveHero`
- **Meldingen:**
  - de drie notice-hook-aanroepen (r3371/3382/3413): die registreren piek/vlag bij de providers, en de punten staan in de layout-kop
  - `deficitLoanNotice` (ook de canvas-marker in `chartEventOverlay` r2337)
  - Plan rendert alleen de bodies
- **Modals/panes:**
  - `activeModal, strategieInitialTab, simModalOpen, activeFaseModal, uitgavenPaneOpen, eventPane*, clusterSheet, selectedNaturalMilestone, selectedYearAge, householdRetire*`
  - openers `openRetirementExpensePane`, `setSimModalOpen`, `setActiveModal`
  - dit alles in de host
- **Euro-grens:** het hele blok r4977–5614 + `euroView`.
- **Deeplinks:** E2 (host of provider in de layout; mag de route lezen, D8).
- **100 % lokaal per katern:**
  - Plan: `show*Receipt`, `healthChartOpen`, `fireAgeChartOpen`, en de hero-afleidingen r5632–5807 (alleen Plan leest ze; de kassabons W–Y lezen ze ook)
  - Doelen: `doelSheetOpen`, `doelLoslatenOpen`, `stopPlanConfirmOpen/Saving/Error`, `doelSaving`, `firstDragHintVisible` (`markFirstSliderDrag` wordt door de provider-handler r3928 aangeroepen → via callback-prop of een provider-veld)

### 2.3 Mount-grens en reset-semantiek

Nu:
- `/toekomst` (`page.tsx` → `HorizonPage`) en `/toekomst/doelen` zijn twee pagina's.
- Elke wissel ontkoppelt alles. Terug op /toekomst: verse server-bundel en al die state opnieuw geseed (scenario uit de pref, lagen uit localStorage, `chartMode` = pad, `mcExpanded` = uit, zoom = standaard).

Straks:
- Provider, canvas en overlay-host hangen onder `(katern)/layout.tsx` en blijven gemonteerd.
- Alleen `{children}` (Plan-, Doelen- en Instellingen-paneel) wisselt.
- Een layout draait bij client-navigatie tussen katernen **niet** opnieuw op de server; alleen de page-segment-RSC komt binnen.

Gedragswijzigingen:
- **GW1 — blijft staan wat vroeger resette.** Het gaat om `chartMode`, `mcExpanded` (de band en een al gedraaide marktcheck blijven), `scenariosExpanded`, zoom, `lifelineAge`, `isPlaying`, `incomeExpenseExpanded`, `overlayVisible` en een open canvas-overlay. Dat is bedoeld (D3), maar het is een wijziging; test het met een mount-teller of een ref-identiteit over een katernwissel.
- **GW2 — data wordt niet meer ververst bij een katernwissel.** Vandaag herlaadt /toekomst → /doelen → /toekomst de bundel. Straks alleen via `router.refresh()`. Mutaties in Doelen (DoelenView) en Instellingen (VoorkeurenView/GebeurtenissenView) moeten `router.refresh()` doen, anders loopt het canvas achter; bij elk mutatiepad in die views nagaan. En de provider moet nieuwe props dan ook overnemen (§3).
- **GW3 — nieuwe ontkoppeling van state die gedeeld gelezen wordt.** Markeer bij elke move:
  - (a) Komt `duidingSectionRef`/`useInViewOnce` in Plan, dan valt `duidingInView` terug bij het verlaten van Plan. E12 zet dan `scenarioPresets/haalbareUitgave` op null (r2151). De lab-basis `uitgaveNaPensioenBasis` (r3727) springt in Doelen dan naar de `input`-terugval. Oplossing: een grendel in de provider die Plan zet (V1).
  - (b) Notice-hooks in Plan: `register(null)` bij unmount (`deficit-notice-provider.tsx:110`), dus de statuspunten in de layout-kop verdwijnen op Doelen/Instellingen. Staan ze in de provider, dan blijven de punten op elk katern, maar dan heropent een klik een melding die daar niet rendert (open vraag Q6).
  - (c) `ScenarioChip` (Plan-Q) scrolt met `getElementById('verken-je-aannames')` (`scenario-chip.tsx:43`). Het lab staat niet meer op Plan, dus de klik doet niets. Minimale fix: een link naar `/toekomst/doelen` (dat is een gedragswijziging).
  - (d) E13 (`whatIfInlineOpen` → scroll): vervalt als `?whatif=open` naar `/toekomst/doelen` redirect.
- **GW4 — DOM-volgorde door de layout.** Kop → meldingenslot → canvas → katern-koppen → `{children}`. De Plan-KPI's (C–G) komen daardoor **onder** het canvas; vandaag staan ze erboven in dezelfde kaart. In fase 1 is dat onvermijdelijk; spec fase 2 wil het zo. Het strijdt wel met "zonder zichtbare herontwerp-stappen" (open vraag Q1).
- **GW5 — het lab verhuist van /toekomst naar /toekomst/doelen.** Deeplinks: `?whatif=open`, `/horizon/whatif`, `/toekomst/whatif`, `#verken-je-aannames` (`doelen-view.tsx:260`) en de ScenarioChip.
- **GW6 — de navkaarten en de dubbele kop vallen weg.** Daarmee ook de Tips-toggle, tenzij die verhuist.
- **GW7 — Instellingen stapelt twee views, elk met een eigen `EventPane`.** Die van gebeurtenissen-view en die van de host. Daarnaast een tweede `useHorizonFireSim` (`gebeurtenissen-view.tsx:231`) naast die van de provider (V8).
- **GW8 — de early return r5621** (`!fire || !range || !healthScore` → foutkaart) blanket vandaag de hele pagina. In de provider blankt hij canvas plus alle katernen: gelijkwaardig.

---

## 3. `loadData()` (r1434–1717)

Wat hij leest (één `Promise.all`, r1463–1525), 15 Supabase-queries via `createClient()`:

1. `transactions` (amount, huidige maand)
2. `assets` (current_value, monthly_contribution, net_worth_inclusion_pct)
3. `debts` (current_balance, net_worth_inclusion_pct)
4. `profiles` (`FIRE_PLAN_COLUMNS` + ±20 kolommen)
5. `budgets` (essentieel, top-level)
6. `life_events` (*)
7. `actions` (+ recommendation)
8. `budgets` (children)
9. `debts` (*, limit 200)
10. `net_worth_snapshots` (order asc, limit 60 — de defecte query uit spec §7.1)
11. `transactions` (12 afgesloten maanden, inkomen)
12. `transactions` (vroegste inkomen)
13. `transactions` (6-mnd `savingsRateWindow`)
14. `bank_accounts` (+ `resolveUnlinkedCashShare` → nog een read in lib)
15. `aow_leeftijd`

Plus 3 fetches: `/api/overzicht/cashflow-settings`, `/api/fire-settings`, `/api/withdrawal-strategy`.

Wat hij zet (commit-blok r1675–1712):
- `avgIncome6m`, `avgExpenses6m`, `retirementMethod`
- `profileRaw` (**dood**), `estimatedYearlyIncome` (**dood**)
- `kernelRawProfile`, `fireStrategy`, `fireParams`
- `userAowAge` + `aowRows`
- `wsConfig` (**dood**) + `withdrawalStrategyConfig`
- `resilienceSnapshots`, `input`, `events` (+ virtuele housing-events uit `initialData`), `actions`, `debts`, `impacts`

Aanroepers:
- r4294 `handleStopPlanBevestigen`
- r4415 `handleActionStatusChange`
- r4967/r4974 `handleEventDragEnd` (legacy tijdlijn-drag; `EventsTimeline onEventDragEnd` r7532, dus **levend**)
- r6551 WidgetEmpty "Opnieuw berekenen"
- r10900/10904 StrategieModal onClose/onSaved
- r10914 UitgavenPane onClose
- r10943 EventPane onChanged

Verwant:
- `refreshEvents` r1722 (`life_events`-read), alleen door `saveEvent` (legacy formulier).
- `loadKernelContext` r1384–1431 (profiles/budgets/aow_leeftijd; alleen bij een onvolledige server-context).
- E6 via `buildHouseholdProjectionInput(createClient())`. Dat is een lib-read en wordt niet door de gate gezien.

Levert de server-loader dit al? Ja, voor elk levend veld van `HorizonPageData`/`HorizonRawData` (`lib/horizon/raw-data-loader.ts:151–351`, `lib/horizon-data-loader.ts:66–118`): `effectiveInput`, `events` (incl. housing), `impacts`, `actions`, `debts`, `resilienceSnapshots`, `avgIncome6m/avgExpenses6m`, `fireStrategy`, `fireParams`, `withdrawalStrategy`, `rawProfile` (incl. `yearly_essential_expenses`), `aowRows`, `retirementExpenseMethod`. De loaders zijn React-`cache()`'d (`horizon-data-loader.ts:120`).

Wat de vervanging door `router.refresh()` + loader vraagt:
1. **Props-als-bron.** `input, debts, fireParams, fireStrategy, withdrawalStrategyConfig, kernelRawProfile, aowRows, userAowAge, actions, resilienceSnapshots, avgIncome6m/avgExpenses6m, retirementMethod` worden direct afgeleid van `initialData`, in plaats van `useState(initialData.x)`. Anders pakt een refresh niets op.
   - (H) Dat is vandaag al een latent defect: `PlanReviewPane onChanged={() => router.refresh()}` (`plan-review-provider.tsx:106`) en `handleDoelVastleggen` (r4199) verversen alleen de `initialData.*`-velden die direct gelezen worden (`housingStrategy`, `assets`, `firePlan`, prefs). De grafiekinvoer blijft oud tot de volgende `loadData`. Eerst verifiëren (UAT: wizard-stap opslaan → grafiek).
2. **`events`** blijft state (optimistische drag). Een resync-effect op `initialData.events` is nodig, met behoud van een drag in vlucht.
3. **Alle `loadData()`-aanroepen** → `startRefresh(() => router.refresh())`. `projectiePending` (r1292) leest `refreshPending` al. `dataRefreshing` vervalt.
4. **E5 `loadKernelContext`:** verwijderen. Dat is een gedragswijziging in een gedegradeerd pad (profiel-query faalt server-side); alternatief: `router.refresh()`.
5. **Parity.** `loadData` bouwt `effectiveInput` zelf (r1537–1614, "spiegelt de SSR-loader"). Na de vervanging geldt alleen nog de server. Kleine getalverschillen na een event-CRUD zijn mogelijk waar de spiegel afweek; dat is een correctie, geen pure refactor.
6. **Kosten.** `router.refresh()` rendert de layout opnieuw → `loadHorizonData` + `computeHorizonFireSim` server-side. Meten tegen `docs/superpowers/plans/2026-09-26-ttfb-oorzaak-en-plan.md`.
7. **Gates en tests die meebewegen:**
   - `scripts/check-client-data-reads.mjs:126` (ALLOWLIST, stale = alleen info)
   - `lib/savings-rate-window.consumers.test.ts:48` (eist `savingsRateWindow(` in het bestand → entry schrappen)
   - `lib/retirement-expense-basis.grondslag.test.ts:31` (entry nakijken)
   - `lib/architecture/calculations.ts` r1796 (`retirement-expenses`, `functions` zoals `deriveRetirementExpenseBasis`/`extrapolateAnnualIncome` moeten in een van de `files` blijven staan)

---

## 4. Euro-render-grens (ADR 0090/0093)

**Waar:** r4977 (`// ── EURO-WEERGAVE: DE RENDER-GRENS`) t/m r5614 (`// ── EINDE EURO-WEERGAVE`).
- Factorbron: `factorByAge`/`factorByOffset` (r5006–5007) op `displayUnifiedRows`.
- `view*`-feeds: `viewDisplaySimRows`, `viewDisplayEffectiveSimRows`, `viewWealthCompositionRows`, `viewPartnerLineRows`, `viewHouseholdMainLineRows`, `viewLiquidWealthPoints`, `viewCombinedScenarioOverlays`, `viewHouseholdOverlays`, `viewMonteCarloOverlay`, `viewFireTarget`, `viewFireTargetInclHome/ExclHome`, `viewTargetEndPortfolio`, `viewTargetInflationFactors`, `viewBalkVrijheidDoel`, `viewEffectiveFireTarget`, `viewVermogenOpAnker`, `viewMonthlyWithdrawalAtAow`, `viewBasis/ScenarioEindvermogen`, `labUitkomstRegel`, `labKnoppen`/`labFormatters`/`nalatenschapMarker` (staan binnen de bakens), `viewDoelPreviews`, `viewReadoutData`, `viewIeBreakdownResult`, `viewScenarioPresets`, `viewHouseholdHeroFireTarget`, `viewPartnerHeroFireTarget`.
- Exempt-markeringen buiten de grens: r3237, 3284, 3286, 7318, 7365, 10793, 10817, 10879.
- Kruis-regime nominaal (lezen zelf `useEuroView`): fase-modals, `PhaseDetailTable`, `HorizonYearDetailsSheet`, `WealthCompositionChart`, `EindsituatieNotice`.

**Wat `horizon-client.euro-view.test.ts` pint** (352 r, leest alleen `horizon-client.tsx`):
1. exact één start- en één eindbaken
2. elke `deflate|deflateRowsByAge|deflatePoints|deflateSeriesByOffset(`-aanroep binnen de bakens of met `// euro-view: exempt`
3. idem voor elke `inflationFactor`-verwijzing
4. naamconventie: SimChart krijgt `view*`
5. hero-puntbedragen als `view*` (FR-B5)
6. balk-label = Doelbedrag-KPI (r160)
7. balk-doelbedrag via de canonieke route (r194)
8. FIRE-moment-factor uit één genormaliseerde leeftijd (KRUIS-27)
9. K2/K4-sleutelkeuzes expliciet op de callsite
10. overlay-punten op bronjaar (K2b)
11. dagtarief ongemoeid
12. `viewWealthCompositionRows`
13. `SimRow`-veldclassificatie
14. fase-modals nominaal

**Verhuizing naar de provider:**
- Het blok gaat als één aaneengesloten stuk naar de provider, of naar `components/toekomst/state/euro-view-feeds.ts` als hook `useEuroViewFeeds(nominaal)` met dezelfde bakens.
- De provider deelt uitsluitend `view*`-feeds uit (context-type `InEuroView<T>` op de chart-feeds) plus de nominale rekenrijen voor het kruis-regime.
- Testdeling: tests 1–3, 8–13 → het providerbestand. Tests 4, 10 → het canvasbestand (SimChart-props). Tests 5–7 → het Plan-KPI/balk-bestand. Test 14 → de overlay-host.
- Regel voor alle nieuwe bestanden: geen enkele `deflate*`-aanroep en geen `inflationFactor` buiten de provider. Een eigen grens kan alleen met een eigen bron-test (ADR 0179 Gevolgen).
- `factorMapByPosition` + `SIM_ROW_*`/`STACKED_ROW_MONEY_FIELDS` + de compile-gard gaan mee naar dat module. Dat raakt de import in `horizon-client.feed-keys.test.ts:14`.

---

## 5. Bron-scan-tests

### 5.1 De 17 `components/app/horizon/horizon-client.*.test.ts`

| # | Test | Invariant | Letterlijke ankers | Bestemming |
|---|---|---|---|---|
| 1 | chart-points (68 r) | overlays via `simRowsToChartPoints`, geen rauwe `[x.age, x.endPortfolio]` | regex `\[\s*\w+\.age\s*,\s*\w+\.endPortfolio\s*\]`; elke `points:`-regel bevat `simRowsToChartPoints\|deflatePoints`; import `'@/lib/horizon/sim-chart-geometry'` | provider (scenario-feeds + euro-blok) |
| 2 | diff-vlak (135 r) | verschilvlak/nalatenschap-bol uit pure functie | leest ook `chart-static-layers.tsx`, `lib/horizon/scenario-diff-vlakken.ts`, `sim-chart-geometry.ts`; in horizon-client: `const nalatenschapMarker` + `labKnoppen.nalatenschap`, `zoneVanWaarde(knop.value, knop.grenzen, HEFBOOM_RICHTING.nalatenschap)`, `if (!knop) return undefined` | provider |
| 3 | doel-loslaten-terugweg (106 r) | KATERN II blijft bereikbaar; één afleiding | `const verkenSectieZichtbaar =` (niet `doelActief`/`displayMode`, wél `usePartnerMainLine`), geen `doelLosgelatenDezeSessie`, `vastleggenMogelijk={doelVastleggenMogelijk}`, `bijwerkenMogelijk={doelBijwerkenMogelijk}`, `const labOpslaanToestand` + `hasScenario \|\| hasStopKeuze` binnen 600 tekens | **splitsen**: provider (afleidingen) + `doelen/doelen-lab.tsx` (props) |
| 4 | euro-view (352 r) | één render-grens | zie §4 | **splitsen** provider / canvas / plan / host |
| 5 | feed-keys (78 r) | partnerlijn op jaar-offset | import `factorMapByPosition from './horizon-client'` (geen bron-read) | naast `euro-view-feeds.ts` (importpad) |
| 6 | fire-doel-grondslag (151 r) | één beslisser doelbedrag-grondslag | `resolveFireDoelWeergave(` ×1, `serverRequired…: firstPaint…`, `kernelRequired…: simResult?.…`, `const balkVrijheidDoel = fireDoel.bedrag`, `const fireTargetInclHome/ExclHome = fireDoel.*`, `FIRE_DOEL_ONDERSCHRIFT[fireDoel.grondslag]`, `fireDoelPaarInLeesvolgorde(fireDoel.grondslag`, geen `MaskedAmount value={viewFireTarget(Incl\|Excl)Home`, geen `module-active-` rond doelregels; leest ook `lib/horizon-data-loader.ts`, `lib/hooks/use-horizon-fire-sim.ts` | **splitsen**: provider (resolver-aanroep) + plan-KPI (onderschrift/paar/JSX) |
| 7 | haalbare-uitgave (183 r) | één regel, beide layouts, batch-opruiming | `data-testid="haalbaar-bij-uitgave"` ×2, `haalbaarBijUitgaveRegel(` ×1, `!hasPerspectiveHero && haalbareUitgaveRegel` ×2, `setHaalbareUitgave(batch.haalbareUitgave ?? null)`, `setHaalbareUitgave(null)` **exact 3×**, `uitgaveNaPensioenPerJaar: scenarioUitgaveNaPensioen`, blok `const labKnoppen = useMemo`…`const labFormatters`, `const handleDoelHerstellen = useCallback`…`}, [doelBlok`, `const conceptGewijzigd = useMemo`…`}, [doelActief`, `const buildLiveStandNow = useCallback` | **splitsen**: plan-KPI (testid, regel) + provider (batch, knoppen, herstel) |
| 8 | hero-fire-age (107 r) | één beslisser kernantwoord; geen `fire.fireAge`/`fire.fireTarget` | `'@/lib/horizon/hero-fire-age'`, `resolveHeroFireAge(` ×1, `heroFireAgeText`, `heroFireAgeReceiptText`, `heroFireAgeCaption(` | **splitsen**: provider (resolver) + plan (teksten); het `fire.*`-verbod over alle nieuwe bestanden |
| 9 | kpi-gegevensmelding (92 r) | elke KPI toetst eigen brondata | import `'@/lib/horizon/outcome-guard'`, guards + flags, `HeroKpiNotice`-aantallen `3 * LAYOUTS` / compact 3, `fireAgeNoticeGuard.hint` ×1, `fireTargetGuard.hint` ×1, `retirementExpenseGuard.hint` ×0, `HORIZON_MISSENDE_GEGEVENS_LABEL`, `showFireAgeNotice =`…`heroFireAge.status !== 'berekenen'`, `pending:`…`showFireAgeNotice` | plan (KPI + kassabons: `fireAgeNoticeGuard.hint` staat in kassabon W r10325 → dezelfde map) |
| 10 | lab-uitkomst (260 r) | één lab-uitkomst, één grenzen-batch, eindvermogen nominaal vastgelegd | `resolveLabUitkomst`, promotie-gates, `runLabGrenzenAsync` + lane, debounce, `buildLiveStand`, `startRefresh(() => router.refresh())` na vastleggen/loslaten, `stripStopKeuze` | provider (± 1 it naar doelen-lab) |
| 11 | na-pensioen-klik (72 r) | huishoud-vertakking alleen met info | body `openRetirementExpensePane`, beide KPI-tegels gebruiken die handler, `{householdRetireInfo && (<HouseholdRetirementPane`, `<UitgavenPane open={uitgavenPaneOpen}` | **splitsen**: provider/host (handler + panes) + plan-KPI (tegels) |
| 12 | nu-stoppen (212 r) | anker uit kernel-echo; anker-afgeleide vlaggen | describes: anker (provider), resolveHeroFireAge-args (provider), drieslag (plan), planningMode + SimChart `stopAnchorFixed` (canvas), stop-knop/strategie-modal-link/plan-draft (provider + doelen-lab), statusblokken `anchor_shortfall` (plan-meldingen), doelbedrag-guard + KPI-labels + bon zonder "Benodigd" (plan) | **splitsen** naar 4 bestanden |
| 13 | prognose-precisie (170 r) | één vorm FIRE-doelbedrag/-leeftijd | leest ook `fire-prognose-widget.tsx`, `household-fire-section.tsx`, `mini-networth-chart.tsx`; horizon-client-deel: approx-bedragen buiten de kassabon, leeftijd zonder decimalen, kassabon noemt rendement + inflatie | plan (KPI + kassabons) |
| 14 | tekort-lening (121 r) | één bron, meldingen-conventie | `import { detectDeficitLoanFromRows }`, `detectDeficitLoanFromRows(unifiedRows, { endAge: simResult?.displayEndAge })`, memo tussen `const deficitLoanCopy = useMemo(` en **`homeExcludedFromProgress])`** (volgorde-afhankelijk einde; spec: volgorde-onafhankelijk maken), `import { useDeficitNotice }`, `} = useDeficitNotice(deficitNoticeVisible ? deficitLoanNotice!.peak : null)`, `deficitLoanNotice && deficitDisplay === 'expanded'`, aria-live | **splitsen**: provider (detector, hook, copy-memo) + plan-meldingen (JSX) |
| 15 | tips-close (99 r) | sluiten sluit direct; Details boven scrim | `persistOverlayVisible(false)` als eerste statement van `handleOverlayExit`, geen `ToekomstExitNotice`/`useTipsFirstCloseNavigation`, `label: 'Niet meer melden'`, `dismissExitNoticeForever`, `className="relative z-[46]` met `setSimModalOpen(true)` + `TableProperties` + `onPointerDown={(e) => e.stopPropagation()}`, `Open de jaar-op-jaar-tabel`; leest ook `toekomst-overlay.tsx` (`z-[45]`) | **splitsen**: canvas (exit-handler, voetnoot) + plan-hero (Details-rij) |
| 16 | vrij-mogelijk-vanaf (71 r) | preset-batch wacht niet op scroll onder een vast anker | `const presetBatchNodig = isFixedAnchorMode \|\| (displayMode === 'full' && duidingInView)`, `if (!presetBatchNodig) { setScenarioPresets(null); setScenarioPresetsLoading(false); setHaalbareUitgave(null); return }`, deps bevat `isFixedAnchorMode`, `const isFixedAnchorMode` vóór `const presetBatchNodig`, catch → `setSolvedRun({ fireAge: null, endAge: null })`, `solvedPending={isFixedAnchorMode && solvedRun === null}`, `profile: withResolvedKernelBedragen(kernelRawProfile, {` | **splitsen**: provider (effect) + plan (drieslag-prop); spec: gate hangt aan de zichtbaarheid van het Plan-paneel → de grendel uit V1 |
| 17 | vrijheids-pct-anker (279 r) | anker kiest de definitie van het vrijheids-% | `dekkingVanRun(`, split op `isFixedAnchorMode`, precies 2 kapitaalratio-plekken, health-effect + deps, `heroFreedomState`, voortgangsbalk-vulling, `personalHeroProjection`, onderschrift uit anker-copy, Prognose!J-bedrag, `ankerFactor` | **splitsen**: provider (pct, health, projectie, ankerFactor) + plan (heroFreedomState, balk, onderschrift) |

### 5.2 Overige tests die `horizon-client.tsx` of de toekomst-routebestanden letterlijk lezen

**Leest `horizon-client.tsx`:**
- `lib/fire-surface-consistency.test.ts:227/235/241`
  - pint: geen `computeFireTarget(`; `serverFireAge = initialData.fireAgeFractional`; `readoutNetWorth = row.startNetWorth`; het Marktcheck-pill-label
  - bestemming: provider + canvas
- `lib/freedom-pct-plan-source.test.ts:47` — geen `computeRunwayCoveragePct(`/`requiredFireIsStartPortfolio`; bestemming: provider
- `lib/horizon/deeplink-cleanup.test.ts:89`
  - pint: `from '@/lib/horizon/deeplink-cleanup'` en `router.replace(buildDeeplinkCleanupUrl(pathname, searchParams)`, geen legacy /horizon-navigatie
  - bestemming: host/provider (E2)
- `lib/horizon-kernel/bridge.status-compat.test.ts:134` — `kernelStatus === '…'`-matches; bestemming: plan-meldingen
- `lib/retirement-expense-basis.grondslag.test.ts:31` + `lib/savings-rate-window.consumers.test.ts:48` — producent-lijst; entry schrappen bij de `loadData`-stap
- `app/(app)/beheer/architectuur/architectuur-client.test.tsx:214` — alleen fixture-data, raakt niets

**Leest of raakt de toekomst-routes:**
- `components/app/shell/tab-root-topbar-title.test.ts:22` — leest `app/(app)/<segment>/page.tsx` → pad wordt `toekomst/(katern)/page.tsx`
- `next.config.test.ts:116–121` — `existsSync` op `app/(app)/toekomst/page.tsx` + `gebeurtenissen/page.tsx`; redirect-doelen r55–92
- `app/(app)/toekomst/redirect-guard.test.ts` — `resolveTabRedirect` uit `page.tsx` + mock van horizon-client
- `app/(app)/toekomst/gebeurtenissen/page.titel.test.ts:23` — leest `page.tsx` naast zich
- `components/future/toekomst-nav-cards.test.tsx` — vervalt met de navkaarten
- `lib/nav-config.route-coverage.test.ts:54–56` en `scripts/page-info/check-coverage.mjs:230` — strippen `(groep)`-segmenten al: route-groep veilig
- Niet-test: `lib/uat/acceptance/nav-checks.ts:13,75` en `nav.ts:241` noemen `app/(app)/toekomst/page.tsx#resolveTabRedirect` (uat-docs-keeper)

---

## 6. Routes en deeplinks

### 6.1 Query-params en hashes

| Param | Lezer | Opruiming | Fase-1-bestemming |
|---|---|---|---|
| `?tab=doelen\|gebeurtenissen\|voorkeuren\|rekenhulp` | server `toekomst/page.tsx:55–82` `resolveTabRedirect` (+`strategie`-uitzondering) | `redirect()` | **Een layout krijgt geen `searchParams`.** Dus in de Plan-page houden, of beter naar `next.config` `has`-regels (React #310-les, next.config r220–242). gebeurtenissen/voorkeuren → `/toekomst/instellingen` |
| `?modal=scenarios\|simulations\|backtesting\|strategie\|withdrawal` | E2 r1055–1061 | `buildDeeplinkCleanupUrl` r1111 | host (alle katernen). `withdrawal` is een dode modal → redirect `/toekomst/instellingen?regel=onttrekkingsstrategie` (bestaande key, `voorkeuren-view.tsx:238`). `strategie` blijft StrategieModal tot fase 3 |
| `?modal=life_events` | E2 r1062–1064 → legacy form | idem | EventPane catalog (`?event=new`) |
| `?strategie=open` | E2 r1068–1071 → StrategieModal | idem | host; spec: straks `/toekomst/instellingen?rij=…` (pas fase 3) |
| `?strategie=aow\|pensioen\|huis\|werk` | `voorkeuren-view.tsx:210–232` (editor) + `gebeurtenissen/page.tsx:26` `resolveStrategieRedirect` → `/toekomst/voorkeuren` | `closeStrategy` (usePathname) | Instellingen; `lib/horizon/strategie-route.ts` `STRATEGIE_PAGINA` → `/toekomst/instellingen` |
| `?regel=<RegelId>` | `voorkeuren-view.tsx:237–252` | `closeRegel` (usePathname) | Instellingen |
| `?nieuw=1\|true` | `gebeurtenissen-view.tsx:364–378` | `closeEventPane` (usePathname) | Instellingen |
| `?uitgaven=open` | E2 r1074–1078 | cleanup | host (UitgavenPane) |
| `?event=new\|<id>` (+`&edit=true`) | E2 r1081–1095 | cleanup | host (EventPane); `app/api/command-palette/search/route.ts` maakt `/toekomst/gebeurtenissen?event=<id>` — gebeurtenissen-view leest `?event` **niet** → daar vandaag een dode deeplink (H: na de redirect vangt de host hem wél) |
| `?whatif=open` (+`via=dreamgate`) | E2 r1098–1102 → `whatIfInlineOpen` → scroll E13 | cleanup (`via` in `CONSUMED_DEEPLINK_PARAMS`) | redirect → `/toekomst/doelen` (`has`-regel op `/toekomst`) |
| `?planreview=open&stap=` | `plan-review-provider.tsx:77–91` | `history.replaceState` | PlanReviewProvider in de layout; `PLAN_REVIEW_HREF` (`lib/plan-review/types.ts:42`) evt. → `/toekomst/instellingen?planreview=open` |
| `#verken-je-aannames` | geen lezer; DOM-anker `id` r7572 | — | **Een hash bereikt de server niet** → geen next.config-redirect mogelijk. Bron `doelen-view.tsx:260` omzetten naar `/toekomst/doelen` + evt. client-hashhandler op Plan |
| `#doelen`, `#vermogensstromen` | nergens | — | dode ankers (`core/checkin/page.tsx`, `widget-catalog.ts:532`) |
| `?focus=` | `doelen-view`? (`/toekomst/doelen?focus=g1` in comment page.tsx) | — | ongewijzigd |
| `horizonSetup` | geen | — | `lib/navigation.ts:84,103` dood → opruimen |

Minimaliseer-sleutels `/toekomst/tekort-lening`, `/toekomst/aow-ontbreekt` en `/toekomst/eindsituatie` zijn pref-keys, geen routes, en blijven ongewijzigd.

### 6.2 Bestaande redirects `next.config.ts` (Next 16.2.6)

- r150 `/horizon` → `/toekomst`
- r161 `/horizon/inflatie-koopkracht` → `/toekomst/inflatie-koopkracht`
- r174/175 `samengestelde-interest` → `/toekomst/rekenhulp`
- r244/245 `/horizon/whatif`, `/toekomst/whatif` → `/toekomst?whatif=open` → wordt `/toekomst/doelen`
- r252 `/horizon/strategie` → `/toekomst?strategie=open`
- r253–262 `/horizon|/toekomst/uitgaven-na-pensioen` → `/toekomst?uitgaven=open`
- r272–282 `/toekomst/strategie` (+`has focus`) → `/toekomst/voorkeuren?strategie=…` → wordt `/toekomst/instellingen?strategie=…` (geen dubbele hop)
- r289 `/identity/parameters` → `/toekomst/voorkeuren` → `/toekomst/instellingen`

Nieuw: `/toekomst/gebeurtenissen` → `/toekomst/instellingen#gebeurtenissen`, `/toekomst/voorkeuren` → `/toekomst/instellingen`.

Next voegt de oorspronkelijke query samen en houdt de hash apart (`node_modules/next/dist/shared/lib/router/utils/prepare-destination.js:258–283`). `?x#hash` volgt dus waarschijnlijk correct. Bevestig dat met een case in `next.config.test.ts`.

### 6.3 Nav, palette, widgets, page-info, titels, loading

- `lib/nav-config.ts:128–131` sub-items: Doelen · Gebeurtenissen · Voorkeuren · Rekenhulp → Doelen · Instellingen · Rekenhulp.
  - `EXTRA_ROUTE_TITLES` r360–362 (instellingen krijgt zijn titel via het nav-item)
  - `SIMPLE_HIDDEN_NAV_HREFS` r150–152
  - `MERKTAAL_VERANTWOORDING['/toekomst']` r464
- `lib/command-palette/navigation-index.ts:133–140`: Toekomst, Doelen, Gebeurtenissen, Voorkeuren, wizard (`/toekomst?planreview=open`, letterlijk gelezen door de route-dekkingstest), Rekenhulp.
- `lib/widget-catalog.ts:518–541`:
  - `/toekomst/doelen`, `/toekomst`
  - `?modal=simulations` ×2, `?modal=scenarios`, `?modal=backtesting`
  - `/toekomst/gebeurtenissen`
  - `#vermogensstromen` (dood)
  - `/toekomst/voorkeuren` ×3
- `lib/page-info-content.ts`:
  - keys r497 `/toekomst`, r534 `/toekomst/inflatie-koopkracht`, r544 `/toekomst/doelen`, r573 `/toekomst/gebeurtenissen`, r578 `/toekomst/voorkeuren`, r598 bibliotheek, r603 rekenhulp, r633 `/horizon`, r640–671 fase-sub-keys
  - links op r89, 123, 170, 194, 522–524, 569, 627–628
  - nieuw: `/toekomst/instellingen`; gebeurtenissen/voorkeuren-keys worden wees (`info-knoppen-actueel`)
- `NavStackMeta`:
  - `toekomst/page.tsx:189` `title="Toekomst" topBar rich bottomBar tabs` (`bottomBar: tabs` is effectloos, spec §2.5)
  - subpagina's via `ToekomstSubpageShell` (geen NavStackMeta; titel via `resolveRouteTitle(route)`)
  - `bibliotheek/[id]/page.tsx:169`
- `loading.tsx`:
  - `toekomst/loading.tsx` (PageSkeletonDetail) omspant straks ook de `(katern)`-layout: volle skeleton alleen bij binnenkomst van buiten
  - voor katernwissels zonder dat het canvas verdwijnt: `(katern)/loading.tsx` of per-katern `loading.tsx` die alleen het paneel skeletoniseert
  - `horizon/loading.tsx` (63 r) + `horizon/layout.tsx` (26 r) zijn dood, want `/horizon` en `/horizon/inflatie-koopkracht` redirecten
  - **niet** dood: `horizon/inflatie-koopkracht/page.tsx` + `inflatie-client.tsx` (re-export door `toekomst/inflatie-koopkracht/page.tsx:8`) en `horizon/uitgaven-na-pensioen/uitgaven-client.tsx` (geïmporteerd door `components/app/horizon/uitgaven-pane.tsx:7`, `uitgaven-keuze.test.tsx:20`)
- Overige href-bronnen (sweep na de redirects; 58 hits in 50 bestanden, lijst via grep `/toekomst/voorkeuren\|/toekomst/gebeurtenissen` op `lib app components`):
  - `?tab=`-producenten: `off-track-doelen-lijst.tsx`, `mijn/privacy-overview.tsx`, `future/calculator-to-life-event-sheet.tsx`, `toekomst/bibliotheek/page.tsx` + `[id]/detail-actions.tsx`, `strategie-modal.tsx`
  - `lib/briefing/validate-hrefs.ts` (toegestane briefing-routes: instellingen toevoegen)
  - `lib/plan-review/overzicht.ts`, `lib/welcome-guide.ts`, `lib/next-steps/engine.ts`, `lib/chat/suggesties.ts`, `lib/coach-suggestions.ts`
  - `app/(app)/core/debts/debts-client.tsx` (`?strategie=open`)

---

## 7. Valkuilen

- **V1 `useInViewOnce` + client-navigatie.** Het effect (r468–487) observeert `ref.current` bij mount en re-runt alleen op `[ref, rootMargin, inView, remountKey]`.
  - Staat de hook in de provider en de ref op de Plan-sectie, dan haakt de observer nooit aan wanneer Plan ná de provider mount (navigatie Doelen → Plan): `duidingInView` blijft false en E12 draait onder `solved` nooit.
  - Oplossing: de hook in het Plan-paneel en `true` via een provider-setter latchen (niet terugzetten bij unmount).
  - Let op: de sectie staat binnen `HideInSimple` en de `heeftKaternIII`-IIFE (r7838). In Eenvoudig mount hij nooit; dat is het huidige gedrag.
- **V2 Hookvolgorde.** Er zijn geen voorwaardelijke hooks; de early return r5621 staat ná alle hooks.
  - TDZ-afhankelijkheden: `planAnchor/isFixedAnchorMode` staan bewust vóór E12 (r2141–2144) en worden in E7's body gelezen, zonder deps (r1997–2003). Bewaakt door vrij-mogelijk-vanaf.
  - Bij het splitsen in hooks per concern moet deze declaratievolgorde blijven; E7 leest `isFixedAnchorMode` uit een later gedeclareerde const (werkt alleen omdat het in de effect-body staat).
- **V3 `next/dynamic` (r253–323, alle `ssr:false`).**
  - Verhuis elke `dynamic()` mee met zijn enige consument; laat ze niet dubbel declareren (twee chunks zijn geen probleem, twee instanties van dezelfde modal wel).
  - Workers (`run-in-worker.ts`): één singleton-Worker (r73), rijstroken via `kernel-lanes.ts`: een nieuwere job op dezelfde lane verdringt de nog niet geposte oudere (`KERNEL_SUPERSEDED`).
- **V4 `PhaseBar`, `EventsTimeline` en `IncomeExpenseChart` staan ín de render-prop van `ZoomableChartContainer`** (visibleMin/Max). Ze kunnen alleen uit het canvas verhuizen als de zoomstaat naar de provider gaat; dat is een structurele stap. Fase 1: PhaseBar blijft in het canvas (afwijking van spec §9: "plan/* … PhaseBar").
- **V5 Modals met exit-animatie.**
  - `BottomSheet` sluit met `setTimeout(cleanup, 300)` (`bottom-sheet.tsx:222`) en geeft `acquireOverlay()` vrij in de effect-cleanup (r392). Unmount tijdens open (browser-terug naar een ander katern) laat de nav-pill dus correct terug.
  - Een host die in de layout blijft, voorkomt dat bij canvas-geopende overlays.
  - Katern-lokale overlays (Plan-kassabons, Doelen-sheets) ontkoppelen abrupt bij een katernwissel; controleren met een open kassabon + terug-knop.
- **V6 Zichtbaarheidsgates die met hun blok meegaan:**
  - `duidingInView` (V1)
  - `presetBatchNodig` (r2150)
  - `verkenSectieZichtbaar` (r3340, gate van het lab → Doelen)
  - `mcExpanded` als gate van de marktcheck (E10)
  - `scenariosExpanded` (E9)
  - `chartMode` voor `wealthCompositionRows` (r3578) en `ieViewMode` voor `ieBreakdownResult` (r3613)
  - ADR 0145 D7a (radar op plan/verkend stopmoment, r7914–7923)
- **V7 `HideInSimple`-grenzen** (geen `DepthSection` in horizon-client; wél 10× in `voorkeuren-view.tsx`):
  - r5869 SectionLabel, KPI 3 r6099/r6434
  - pills Scenario's/Marktcheck r6854, tweede lijn r6982, Speel af r7086
  - LifelineReadout r7220, PhaseBar r7540
  - katern III r7851–7944, Household r7950, TrendGrid r7957, acties r7972
  - Elk blok neemt zijn eigen `HideInSimple` mee; nooit als ternary (ADR 0026).
  - Het lab heeft sinds 20 sep **geen** Eenvoudig-gate meer (r3322–3340). De commentaarkop r7769–7785 is achterhaald: niet meeverhuizen als waarheid.
- **V8 Instellingen = twee kernel-hooks.**
  - `gebeurtenissen-view.tsx:231` draait een eigen `useHorizonFireSim`. Met de provider erbij lopen er twee instanties op rijstrook `main` (`use-horizon-fire-sim.ts:680`); ze kunnen elkaars wachtende run verdringen (H: `mapMainOutcome` op `superseded` controleren).
  - Plus `loadDashboardData` (zwaar) uit `voorkeuren/page.tsx:34` op de Instellingen-route.
  - Mitigatie: gebeurtenissen-view de provider-sim laten consumeren (dan geen pure move meer), of de verdringing eerst bewijzen.
- **V9 Gates die blokkeren bij extractie:**
  - `check:overlays` (`scripts/check-overlay-standard.mjs`): elk **nieuw** bestand met directe `BottomSheet`-import faalt (horizon-client r100 staat op de ALLOWLIST; een stale entry geeft alleen info). Kassabons W–Z en de host gebruiken `BottomSheet` direct → ombouwen naar `<ShellOverlay kind="sheet">`. Dat is geen pure move; ALLOWLIST uitbreiden mag niet zonder motivering.
  - `check:client-reads`: een nieuw bestand met `createClient` + `.from().select(` faalt → `loadData`, `loadKernelContext` en `refreshEvents` moeten weg vóór extractie. Mutaties (`.update`) worden niet geflagd.
  - `check:headings`: de RESIDUE-entry `horizon-client.tsx` (r114) moet weg in dezelfde commit als de h1 (stale = hard rood).
  - De twee nieuwe `<h2>`-/`<h3>`-niveaus in de layout volgen ADR 0110 (`PageVerdictOpening` is h2).
- **V10 De Huishoud-FIRE-sectie** (`household-fire-section.tsx:71` `buildHouseholdProjectionInput` → `lib/household-projection.ts:1244–1260` RPC `set_household_combined_summary`) moet op Plan gemount blijven, binnen `HideInSimple` (dus alleen Volledig, zoals nu).
  - E6 roept dezelfde builder aan in huishoud/partner-perspectief, dus die schrijft ook. Beide paden blijven.
- **V11 De Tips-toggle zit in de dubbele kop (A).** Weg met de kop is weg met de toggle, terwijl de exit-toast zegt "zet ze terug aan met de Tips-knop boven de grafiek" (r908). Verhuizen naar de canvaskop in dezelfde stap.
- **V12 PlanReview-provider:**
  - staat in `components/future/plan-review/plan-review-provider.tsx` (niet in horizon/)
  - leest `usePathname` + `useSearchParams` en ruimt `?planreview` op met `history.replaceState`
  - rendert de `PlanReviewPane` als kind
  - `onChanged={() => router.refresh()}` → met de provider-resync (§3.1) ververst de grafiek daarna wél
  - opener-consumenten: alleen `toekomst-nav-cards.tsx:442` (vervalt) → de wizard-ingang op Instellingen moet `usePlanReviewOpener` of `PLAN_REVIEW_HREF` gebruiken
  - `voorkeuren/page.tsx:107–115` linkt nu naar `PLAN_REVIEW_HREF&stap=plan` (= `/toekomst`)
- **V13 D8 ("katern-componenten lezen nooit de route")** botst met bestaande views: `voorkeuren-view.tsx:186`, `gebeurtenissen-view.tsx:220` en `plan-review-provider.tsx:60` lezen `usePathname` voor URL-opruiming. Beslissen of opruiming via een gedeelde layout-helper moet (open vraag Q7).
- **V14 Server-pagina's met `redirect()` tijdens render** (`?tab=`-guard, `resolveStrategieRedirect`) zijn precies het React #310-patroon dat next.config r220–242 beschrijft. Een nieuwe `redirect()` in de (katern)-pages vermijden; `has`-regels gebruiken.
- **V15 `/toekomst/page.tsx` en `(katern)/page.tsx` kunnen niet naast elkaar bestaan** (dezelfde URL). Verplaatsen en layout aanmaken moet in één commit; idem voor `doelen/page.tsx` ↔ `(katern)/doelen/page.tsx`.
- **V16 Layout-data en navigatie.** Een layout krijgt bij client-navigatie geen nieuwe server-render; `loadFinData` (doel-markers, `goals`-prop, M36) moet dus in de layout, anders ontbreken de markers op Doelen/Instellingen of zijn ze verouderd. `(katern)/doelen/page.tsx` laadt `loadFinData` nogmaals (React-cache dedupliceert binnen één request).

---

## 8. Extractievolgorde (van puur naar stateful, één commit per stap)

"P" = pure move / dood-code-verwijdering zonder gedragsverschil. "S" = structureel (minimale gedragsverandering + bewijs erbij). Elke stap eindigt groen: `npx tsc --noEmit`, vitest (PowerShell) op `components/app/horizon`, `components/toekomst`, `components/future`, `app/(app)/toekomst`, `lib/horizon`, `lib/nav-config*`, en `check:headings`/`check:client-reads`/`check:overlays`.

1. **P — Dood weg in horizon-client.**
   - `embedded=false`-takken (r5833, 5848–5865) + prop, `pageInfoText`/`getPageInfo`-import
   - `profileRaw`, `estimatedYearlyIncome`, `wsConfig`, `loading`-const, `baseFire`/`totalDelayMonths`/`adjustedFireAge` (r2625–2628)
   - RESIDUE-entry `check-heading-levels.mjs:114`
   - Bewijs: tsc + bestaande 17 tests (nu-stoppen pint alleen `const heroVraag = ankerVraag(…)`, dat blijft: LabKnoppen leest het)
2. **S — Legacy Event Form Modal weg.**
   - r7992–10220, state r1117–1149, handlers r4420–4919, `refreshEvents` r1722, `impacts` + E8 + het `setImpacts`-deel van E7, PensionPdfUpload-import
   - `?modal=life_events` opent EventPane catalog
   - Gedragsverandering: alleen die dode deeplink. Bewijs: deeplink-test (render met `?modal=life_events` → EventPane open)
   - `calculations.ts` r1716 (kosten-koper `files`) bijwerken naar de EventPane-/catalogusbestanden die `computeKostenKoper` echt aanroepen (grep)
3. **S — `loadData` → `router.refresh()` + props-als-bron** (§3).
   - E5 weg; ALLOWLIST-, savings-window- en retirement-basis-entries weg
   - Gedragsverandering: grondslag na CRUD = server (parity); refresh werkt voortaan ook na wizard/doel
   - Bewijs: rerender-test (nieuwe `initialData` → `useHorizonFireSim` krijgt nieuwe input), TTFB-meting
4. **P — Pure helpers en typen eruit:**
   - `ReceiptCue`, `HeroKpiNotice` → `components/toekomst/plan/`
   - `useInViewOnce` → `components/toekomst/state/use-in-view-once.ts`
   - `SIM_ROW_*`, `STACKED_ROW_MONEY_FIELDS`, compile-gard, `factorMapByPosition` → `components/toekomst/state/euro-view-feeds.ts` (feed-keys-test mee, import-pad)
   - `COLOR_*` (r2297–2313) → `components/toekomst/canvas/marker-kleuren.ts`
   - `HouseholdHeroData`, `ActiveModal` → `components/toekomst/state/types.ts`
5. **P — Plan-bladeren:**
   - C/D/G → `plan/plan-kpi-strip.tsx`, E/F → `plan/plan-hero-duiding.tsx`, B → `plan/plan-hero-kop.tsx`, H → `plan/`
   - props-in, horizon-client rendert ze
   - Tests: kpi-gegevensmelding, prognose-precisie (deel), haalbare-uitgave (JSX-deel), na-pensioen-klik (tegels), fire-doel-grondslag (JSX-deel), tips-close (Details-rij), vrijheids-pct-anker (balk/onderschrift) splitsen
6. **S-klein — Kassabons W–Z** → `plan/plan-kassabons.tsx` via `<ShellOverlay kind="sheet">` (V9).
   - Gedragsverandering: overlay-chroom van ShellOverlay i.p.v. kale BottomSheet
   - Bewijs: kassabon-rendertest + mobiele check boven de nav-pill
7. **P — Canvas-bladeren:**
   - J → `canvas/canvas-pills.tsx`, K → `canvas/canvas-uitleg.tsx`, N → `canvas/canvas-legenda.tsx`, L → `canvas/canvas-grafiek.tsx` (incl. PhaseBar, EventsTimeline, IE-uitklap), I-lege-staat → canvas
   - Tests: euro-view (SimChart-props), fire-surface-consistency (pill-label), tips-close (voetnoot/exit)
8. **P — Plan-meldingen** I-meldingen → `plan/plan-meldingen.tsx`. Tests: tekort-lening (JSX-deel), bridge.status-compat, nu-stoppen (statusblokken).
9. **P — Doelen-lab** M + P → `doelen/doelen-lab.tsx` (host vooralsnog horizon-client). Tests: doel-loslaten-terugweg (props-deel), lab-uitkomst (JSX-deel).
10. **P — Plan-verdieping** Q/R/S/T → `plan/plan-verdieping.tsx`; `useInViewOnce` in dit bestand met callback `onDuidingInView` (V1). Tests: vrij-mogelijk-vanaf (gate-deel).
11. **S-klein — Overlay-host** O/V/AA/AB/AC + E2 → `components/toekomst/state/toekomst-overlays.tsx`, via ShellOverlay waar het directe BottomSheet was.
    - Tests: deeplink-cleanup (SOURCE-pad), na-pensioen-klik (panes), euro-view (fase-modals nominaal)
    - Na stap 11 is horizon-client alleen nog state + afleidingen + compositie
12. **S — Provider (a): euro-grens** → `useEuroViewFeeds` in `state/`, met bakens. euro-view-test (bakendeel) mee. Bewijs: dezelfde render-output (rendertest van /toekomst-hero in real en nominal).
13. **S — Provider (b): sim/kernel + perspectief + meldingen-hooks** → `state/toekomst-state-provider.tsx` (+ `use-toekomst-sim.ts`, `use-toekomst-perspectief.ts`). HorizonPage wordt `<ToekomstStateProvider><Compositie/></…>`. Tests: hero-fire-age, vrijheids-pct-anker, nu-stoppen (anker), fire-doel-grondslag (resolver), freedom-pct-plan-source, fire-surface-consistency.
14. **S — Provider (c): scenario/lab + lagen** → `use-toekomst-scenario.ts`, `use-toekomst-lagen.ts`. Tests: lab-uitkomst, haalbare-uitgave, diff-vlak, chart-points, doel-loslaten-terugweg (afleidingen).
15. **S — Route-groep met Plan.**
    - `app/(app)/toekomst/(katern)/layout.tsx` (server: `loadHorizonData`, `loadFinData`, `loadPlanVerdictSentence`, minimized-map, plan-review-state, eigen strategie-events; rendert kop + punten + i + notice-providers + PlanReviewProvider + ToekomstStateProvider + ToekomstCanvas + KaternKoppen + overlay-host + `{children}`)
    - `page.tsx` → `(katern)/page.tsx` (NavStackMeta + Plan-paneel); navkaarten en dubbele kop weg; Tips-toggle naar de canvaskop
    - `components/editorial/katern-koppen.tsx` (mockup `components/beheer/toekomst-katernen-mockup/katern-koppen.tsx` als referentie)
    - Doelen blijft nog `toekomst/doelen/page.tsx` buiten de groep
    - Gedragsverandering: GW4, GW6
    - Bewijs: tab-root-topbar-title (pad), next.config.test (existsSync), visuele check 390/1280
16. **S — Doelen in de groep.**
    - `doelen/page.tsx` → `(katern)/doelen/page.tsx` met doelen-lab boven DoelenView
    - lab weg uit Plan; ScenarioChip → link; `doelen-view.tsx:260` → `/toekomst/doelen`
    - Gedragsverandering: GW1, GW3c, GW5
    - Bewijs: mount-teller-test (canvas-instantie blijft bij Plan↔Doelen), deeplink `?whatif=open`
17. **S — Instellingen-route.** `(katern)/instellingen/page.tsx` (VoorkeurenView + GebeurtenissenView + wizard-ingang); datalading uit `voorkeuren/page.tsx` + `gebeurtenissen/page.tsx`. Bewijs: V8 (twee hooks) aantonen of mitigeren; UAT TOEK-17/24/25/26.
18. **S — Redirects.**
    - gebeurtenissen/voorkeuren → instellingen (hash/query)
    - `has`-regels voor `?tab=`, `?whatif=open`, `?modal=withdrawal|life_events`
    - bestaande regels r244–289 rechtstreeks naar het katern
    - oude routemappen en `resolveTabRedirect` weg (redirect-guard-test → next.config.test)
    - `strategie-route.ts` `STRATEGIE_PAGINA`
    - Bewijs: next.config.test-cases per bron
19. **P — Nav en config:** nav-config, palette, widget-catalog, page-info (nieuwe key, wees-keys), `PLAN_REVIEW_HREF`, briefing `validate-hrefs`, href-sweep (~50 bestanden), `lib/navigation.ts` `horizonSetup`.
20. **P — Architectuurplaten fase 1:**
    - `calculations.ts` (5+1 `files[]`, routenamen)
    - `archimate-model.ts` (`sp-plannen.items`, lead `as-planning`)
    - `archimate-concerns.ts` (`horizon-god-component` herformuleren of dicht)
    - `hld-model.ts`
    - UAT via uat-docs-keeper (TOEK-17/24/25/26/28/30)
21. **P — Opruimen:**
    - `horizon-client.tsx` (als stap 15 hem nog niet leegtrok)
    - `toekomst-nav-cards.tsx` + test
    - `horizon/layout.tsx` + `horizon/loading.tsx`
    - stale ALLOWLIST-entries in `check-client-data-reads.mjs:126` en `check-overlay-standard.mjs:100`
    - `gebeurtenissen/page.titel.test.ts` (verhuist of vervalt)

**Schatting: 21 commits** (bandbreedte 19–25). Stappen 5, 7 en 13/14 splitsen waarschijnlijk nog per sub-bestand. Stap 3 (props-als-bron) en 15–17 (route-groep) zijn de risicostappen; die krijgen elk een eigen review en de `security-specialist`-run (redirects met query-passthrough, verwijderde client-reads).

---

## 9. Open vragen

- **Q1** KPI-strip onder het canvas vanaf stap 15 (GW4): accepteert de eigenaar dat in fase 1?
- **Q2** `?tab=`-guard: kan niet in de layout. `has`-regels in next.config (voorkeur, #310-les) of in de Plan-page houden?
- **Q3** Hash-deeplinks (`#verken-je-aannames`, `#gebeurtenissen`): hrefs omzetten volstaat, of komt er een client-hashhandler?
- **Q4** PhaseBar blijft in fase 1 in het canvas (V4): akkoord, of wordt de zoomstaat nu al naar de provider getild?
- **Q5** Map voor de gedeelde overlay-host: `components/toekomst/state/` of een nieuwe `components/toekomst/overlays/`?
- **Q6** Statuspunten van de meldingen op Doelen/Instellingen in fase 1: tonen (hooks in de provider) of alleen op Plan?
- **Q7** Geldt D8 ook voor URL-opruiming met `usePathname` in voorkeuren-view, gebeurtenissen-view en plan-review-provider?
- **Q8** Twee `useHorizonFireSim`-instanties op Instellingen: eerst meten, of gebeurtenissen-view de provider laten consumeren (dan geen pure move)?
- **Q9** Kassabons en host via ShellOverlay (kleine gedragswijziging) versus allowlist-verschuiving: welke route?
- **Q10** (H) Verversen wizard en doel-vastleggen vandaag de grafiek wel? Bevestigen vóór stap 3; zo niet, dan is het een bijvangst-defect dat stap 3 oplost.
