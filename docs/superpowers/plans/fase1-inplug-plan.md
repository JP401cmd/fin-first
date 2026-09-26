# Fase 1 — inplug-map Plan-bladeren (stroom X1)

Bron: `components/app/horizon/horizon-client.tsx` @ `c1b4849eb` (regelnummers gelden voor die versie). Doelmap: `components/toekomst/plan/`. Werkplan: `2026-09-26-toekomst-katernen-fase1-plan.md`, structuurkaart §1.5/§2.1/§8 stap 4–6, 8, 10.

## Hoe deze map te gebruiken

- Elke JSX-body is **regel-voor-regel** overgenomen, inclusief inspringing (daarom staat de body in de component "te diep"; dat is bewust: `diff` tegen het bronbereik is leeg). Enige uitzondering: de kassabons, zie *Afwijkingen*.
- Props dragen exact de namen van de ouder-variabelen. Elke prop-regel in de interface noemt met `// horizon-client r…` de declaratieregel in de ouder.
- Prop-typen zijn de **gedeclareerde** typen in de ouder, met drie bewuste vernauwingen: `PlanMeldingen.simResult: SimResult` (staat binnen de `simResult ? …`-tak) en `fire`/`range`/`healthScore` niet-null (na de foutstaat-return r5621). Kale tekstlabel-unies (`"Pensioen" | "Vrijheid"`) zijn `string`.
- **Inplug-proef (gedraaid):** een virtuele horizon-client @ c1b4849eb met álle blokken hieronder vervangen door hun aanroep, de helpers/dynamics weg en de V1-latch erin, typecheckt met **0 fouten** tegen de bladeren op schijf (baseline ongewijzigde bron: ook 0). Script: scratchpad `x1/proef.cjs`.
- **Oude assertions (gemeten):** dezelfde ingeplugde versie gedraaid tegen de 17 `horizon-client.*.test.ts` + `bridge.status-compat.test.ts` geeft precies de rode it-blokken die per blok onder *schrappen* staan (30 stuks; de 3 rode in `horizon-client.deeplink-life-events.test.ts` zijn van A1 stap 2 en al rood op de vastgepinde bron). Elk ervan is gedekt door een nieuwe test in `components/toekomst/plan/*.bron.test.ts`.

## Imports in de ouder

```tsx
import { PlanHeroKop } from '@/components/toekomst/plan/plan-hero-kop'
import { PlanKerngetalMobiel, PlanKpiStripDesktop, PlanKpiStripMobiel } from '@/components/toekomst/plan/plan-kpi-strip'
import { PlanHeroDuiding } from '@/components/toekomst/plan/plan-hero-duiding'
import { PlanGegevensmelding } from '@/components/toekomst/plan/plan-gegevensmelding'
import { PlanMeldingen } from '@/components/toekomst/plan/plan-meldingen'
import { PlanVerdieping } from '@/components/toekomst/plan/plan-verdieping'
import {
  PlanKassabonVrijheidsleeftijd,
  PlanKassabonDoelbedrag,
  PlanKassabonOpnamerate,
  PlanKassabonGezondheid,
} from '@/components/toekomst/plan/plan-kassabons'
```

Daarna in de ouder schrappen: `ReceiptCue` + `HeroKpiNotice` (r387–455, nu `plan-helpers.tsx`), `useInViewOnce` (r457–488, nu `use-in-view-once.ts`), de `dynamic()`-declaraties van `HouseholdFireSection` (r309–312) en `HealthScoreReceipt` (r317–324), en de imports die daardoor ongebruikt raken. Gemeten (noUnusedLocals op de ingeplugde proef, min wat op c1b4849eb al ongebruikt was): `AOW_ONTBREEKT_COPY`, `ActionCard`, `AnkerDrieslag`, `Compass`, `Dekkingsradar`, `EindsituatieNotice`, `FreedomTimeBadge`, `HORIZON_MISSENDE_GEGEVENS_LABEL`, `Home`, `HorizonOutcomeGuard`, `HorizonTrendGrid`, `KassabonShell`, `Kicker`, `LevensinkomenStrook`, `Link`, `Minus`, `Percent`, `Receipt`, `RefObject`, `ScenarioChip`, `ScenarioKaarten`, `TableProperties`, `Zap`, `ankerZin`, `buildVrijheidsleeftijdZin`, `formatMaskedApproxCurrency`, `heroFireAgeCaption`, `heroFireAgeYear`, `isKernelReachedNowDisplay`, `radarSubtitel` (niet door A1/X2/X3 gecorrigeerd — hun blokken kunnen er nog meer vrijmaken). Let op: `HORIZON_MISSENDE_GEGEVENS_LABEL` wordt dan in `horizon-client.kpi-gegevensmelding.test.ts` › *haalt de woorden uit outcome-guard* niet meer gevonden: dat it-blok wijzen naar `plan-kassabons.tsx` of schrappen (gedekt door `plan-kassabons.bron.test.ts`).

## Typen

`components/toekomst/plan/types.ts` bevat kopieën van `ActiveModal` (r369) en `HouseholdHeroData` (r371–386). Stap 4 voegt ze samen in `components/toekomst/state/types.ts` en laat horizon-client + de bladeren daaruit importeren (ook X2/X3 hebben mogelijk kopieën).

## Afwijkingen van een pure kopie

| Blok | Afwijking | Waarom |
|---|---|---|
| W, X, Y, Z | `<BottomSheet open onClose title>` → `<ShellOverlay kind="sheet" open onClose title>`, `</BottomSheet>` → `</ShellOverlay>`; verder byte-gelijk | Besluit Q9 / ADR 0039, `check:overlays` staat geen nieuwe directe BottomSheet toe. Zelfde `size` (md) en history-gedrag; ShellOverlay voegt alleen `ModalFooterToneProvider` toe (geen footer, dus zonder zichtbaar effect). Bewijs op 390 px boven de nav-pill hoort bij stap 6 (stroom T). |
| Q–T | `duidingSectionRef` + `useInViewOnce` in het blad; nieuwe prop `onDuidingInView` | Kaart V1: de hook moet bij de sectie wonen die hij observeert. |
| B | alleen de kopregel, niet de `<section>`-opening | Een component kan geen half-open JSX dragen; de wrapper omsluit ook canvas en lab. |
| — | `export` vóór `ReceiptCue`, `HeroKpiNotice`, `useInViewOnce` | Nodig om ze te delen. |

## Blokken

### B — kopregel hero-kaart

- **Bron:** r5879–5922
- **Doel:** `components/toekomst/plan/plan-hero-kop.tsx` → `PlanHeroKop` (5 props)
- **Nieuwe test:** `components/toekomst/plan/plan-hero-kop.bron.test.ts`
- **Oude assertion(s) schrappen:**
  - `horizon-client.tips-close.test.ts` › "Details-knop boven de tips-scrim (M9)" › *staat precies één stap boven de tips-scrim* en *schermt de pointerdown van de Details-knop af* (de rest van die test — exit-handler, voetnoot — blijft/gaat naar canvas).
- **Noot:** Alleen de `relative z-[46]`-rij (r5879–5922). `<section data-testid="horizon-hero">`, de accentstreep en `<div className="p-4 sm:p-6 md:p-8">` (r5873–5878) blijven bij de ouder: ze omsluiten ook canvas, meldingen en lab en sluiten pas op r7749–7750.

```tsx
<PlanHeroKop
  hasPerspectiveHero={hasPerspectiveHero}
  isPartnerView={isPartnerView}
  perspectiveHero={perspectiveHero}
  simResult={simResult}
  setSimModalOpen={setSimModalOpen}
/>
```

### C — mobiel kerngetal

- **Bron:** r5924–5952
- **Doel:** `components/toekomst/plan/plan-kpi-strip.tsx` → `PlanKerngetalMobiel` (10 props)
- **Nieuwe test:** `components/toekomst/plan/plan-kpi-strip.bron.test.ts`
- **Oude assertion(s) schrappen:**
  - zie D (één testbestand voor C, D en G).

```tsx
<PlanKerngetalMobiel
  setShowFireAgeReceipt={setShowFireAgeReceipt}
  showFreeHero={showFreeHero}
  freeHeroPhrase={freeHeroPhrase}
  hasPerspectiveHero={hasPerspectiveHero}
  heroFireAgePending={heroFireAgePending}
  perspectiveHero={perspectiveHero}
  heroFireAgeTextMobile={heroFireAgeTextMobile}
  isPensioenMode={isPensioenMode}
  heroFireAge={heroFireAge}
  heroAgeLabel={heroAgeLabel}
/>
```

### D — desktop-figures-strip

- **Bron:** r5954–6184
- **Doel:** `components/toekomst/plan/plan-kpi-strip.tsx` → `PlanKpiStripDesktop` (37 props)
- **Nieuwe test:** `components/toekomst/plan/plan-kpi-strip.bron.test.ts`
- **Oude assertion(s) schrappen:**
  - `horizon-client.kpi-gegevensmelding.test.ts` › *rendert de melding op elke tegel in beide layouts* en *kent precies één vorm* (de `.hint`-tellingen verhuizen naar de kassabons).
  - `horizon-client.haalbare-uitgave.test.ts` › *rendert de regel in beide KPI-layouts via één helper*: alléén de `data-testid`-telling schrappen; `haalbaarBijUitgaveRegel(` ×1 blijft in de ouder. *kleurt met de semantische tokens*: het `blokken`-deel schrappen, de `const haalbareUitgaveToon =`-regex blijft. *toont niets in huishoud-/partnerweergave*: schrappen.
  - `horizon-client.na-pensioen-klik.test.ts` › *wordt door beide KPI-varianten geconsumeerd*.
  - `horizon-client.fire-doel-grondslag.test.ts` › *kleurt geen van beide doelregels met een module-accent*.
  - `horizon-client.nu-stoppen.test.ts` › *KPI 2 heet onder een vast anker "Vermogen op je stopmoment" en KPI 3 (opnamerate) verdwijnt*.
  - `horizon-client.hero-fire-age.test.ts` › *gebruikt de hero-tekst uit de resolver op de KPI-oppervlakken*: de `heroFireAgeCaption(`-regel schrappen (`heroFireAgeText`/`heroFireAgeReceiptText` staan als prop-doorgifte nog in de ouder).
  - `horizon-client.prognose-precisie.test.ts` › *vindt de doelbedrag-sites daadwerkelijk*: vervang in `PROGNOSE_OPPERVLAKKEN` het pad van horizon-client door `components/toekomst/plan/plan-kpi-strip.tsx` en `…/plan-kassabons.tsx` (dan blijven de oppervlak-brede regels werken).
  - `horizon-client.euro-view.test.ts` › *zet het balk-label in de actieve euro-weergave*: dit it-blok toetst kpi-strip én balk; schrappen (gedekt door `plan-kpi-strip.bron.test.ts` en `plan-hero-duiding.bron.test.ts`).

```tsx
<PlanKpiStripDesktop
  isFixedAnchorMode={isFixedAnchorMode}
  hasPerspectiveHero={hasPerspectiveHero}
  setShowFireAgeReceipt={setShowFireAgeReceipt}
  heroFireAge={heroFireAge}
  heroFireAgePending={heroFireAgePending}
  isPartnerView={isPartnerView}
  perspectiveHero={perspectiveHero}
  showFireAgeNotice={showFireAgeNotice}
  showFreeHero={showFreeHero}
  freeHeroLabel={freeHeroLabel}
  heroAgeLabel={heroAgeLabel}
  fireAgeNoticeGuard={fireAgeNoticeGuard}
  freeHeroPhrase={freeHeroPhrase}
  heroFireAgeText={heroFireAgeText}
  heroAgeCaptionBase={heroAgeCaptionBase}
  setShowFireTargetReceipt={setShowFireTargetReceipt}
  showFireTargetNotice={showFireTargetNotice}
  fireTargetGuard={fireTargetGuard}
  isNuStoppenMode={isNuStoppenMode}
  dualDoelRegels={dualDoelRegels}
  viewPerspectiveHeroFireTarget={viewPerspectiveHeroFireTarget}
  viewVermogenOpAnker={viewVermogenOpAnker}
  viewBalkVrijheidDoel={viewBalkVrijheidDoel}
  fireTargetCaption={fireTargetCaption}
  setShowSwrReceipt={setShowSwrReceipt}
  isPensioenMode={isPensioenMode}
  isKernelDepleteRate={isKernelDepleteRate}
  viewMonthlyWithdrawalAtAow={viewMonthlyWithdrawalAtAow}
  simResult={simResult}
  fireSwr={fireSwr}
  openRetirementExpensePane={openRetirementExpensePane}
  retirementMethod={retirementMethod}
  showRetirementExpenseNotice={showRetirementExpenseNotice}
  retirementExpenseGuard={retirementExpenseGuard}
  input={input}
  haalbareUitgaveRegel={haalbareUitgaveRegel}
  haalbareUitgaveToon={haalbareUitgaveToon}
/>
```

### E + F — drieslag, duidingszin, voortgangsbalk

- **Bron:** r6186–6305
- **Doel:** `components/toekomst/plan/plan-hero-duiding.tsx` → `PlanHeroDuiding` (17 props)
- **Nieuwe test:** `components/toekomst/plan/plan-hero-duiding.bron.test.ts`
- **Oude assertion(s) schrappen:**
  - `horizon-client.kpi-gegevensmelding.test.ts` › *houdt de duidingszin stil zodra de tegel een melding draagt*.
  - `horizon-client.nu-stoppen.test.ts` › *de drieslag (D7) rendert uit heroFireAge.anker — consume-only*.
  - `horizon-client.vrij-mogelijk-vanaf.test.ts` › *de hero-drieslag krijgt de rekenstand*.
  - `horizon-client.vrijheids-pct-anker.test.ts` › *de vulling van de voortgangsbalk*.
- **Noot:** Het S15-commentaar (r6186–6207) gaat mee; het staat in de bron tussen D en E.

```tsx
<PlanHeroDuiding
  hasPerspectiveHero={hasPerspectiveHero}
  heroFireAge={heroFireAge}
  currentAge={currentAge}
  solvedRun={solvedRun}
  simResult={simResult}
  isFixedAnchorMode={isFixedAnchorMode}
  perspectiveHero={perspectiveHero}
  heroFreedomFraming={heroFreedomFraming}
  planAnchor={planAnchor}
  ankerReach={ankerReach}
  ankerStop={ankerStop}
  showFireAgeNotice={showFireAgeNotice}
  effectiveFreedomPct={effectiveFreedomPct}
  viewPerspectiveHeroFireTarget={viewPerspectiveHeroFireTarget}
  masked={masked}
  isPartnerView={isPartnerView}
  viewBalkVrijheidDoel={viewBalkVrijheidDoel}
/>
```

### G — mobiele 2×2-strip

- **Bron:** r6307–6506
- **Doel:** `components/toekomst/plan/plan-kpi-strip.tsx` → `PlanKpiStripMobiel` (33 props)
- **Nieuwe test:** `components/toekomst/plan/plan-kpi-strip.bron.test.ts`
- **Oude assertion(s) schrappen:**
  - zie D.

```tsx
<PlanKpiStripMobiel
  setShowFireAgeReceipt={setShowFireAgeReceipt}
  showFireAgeNotice={showFireAgeNotice}
  showFreeHero={showFreeHero}
  freeHeroLabel={freeHeroLabel}
  heroAgeLabelKort={heroAgeLabelKort}
  fireAgeNoticeGuard={fireAgeNoticeGuard}
  freeHeroPhrase={freeHeroPhrase}
  hasPerspectiveHero={hasPerspectiveHero}
  perspectiveHero={perspectiveHero}
  heroFireAgeText={heroFireAgeText}
  heroFireAge={heroFireAge}
  setShowFireTargetReceipt={setShowFireTargetReceipt}
  isFixedAnchorMode={isFixedAnchorMode}
  showFireTargetNotice={showFireTargetNotice}
  fireTargetGuard={fireTargetGuard}
  isNuStoppenMode={isNuStoppenMode}
  dualDoelRegels={dualDoelRegels}
  viewPerspectiveHeroFireTarget={viewPerspectiveHeroFireTarget}
  viewVermogenOpAnker={viewVermogenOpAnker}
  viewBalkVrijheidDoel={viewBalkVrijheidDoel}
  fireTargetCaption={fireTargetCaption}
  setShowSwrReceipt={setShowSwrReceipt}
  isPensioenMode={isPensioenMode}
  isKernelDepleteRate={isKernelDepleteRate}
  viewMonthlyWithdrawalAtAow={viewMonthlyWithdrawalAtAow}
  simResult={simResult}
  fireSwr={fireSwr}
  openRetirementExpensePane={openRetirementExpensePane}
  showRetirementExpenseNotice={showRetirementExpenseNotice}
  retirementExpenseGuard={retirementExpenseGuard}
  input={input}
  haalbareUitgaveRegel={haalbareUitgaveRegel}
  haalbareUitgaveToon={haalbareUitgaveToon}
/>
```

### H — "Vul profiel aan" + profielfout

- **Bron:** r6508–6538
- **Doel:** `components/toekomst/plan/plan-gegevensmelding.tsx` → `PlanGegevensmelding` (4 props)
- **Nieuwe test:** (geen eigen invariant in §5.1; map-brede grendels in `plan.bron.test.ts`)
- **Oude assertion(s) schrappen:**
  - geen.

```tsx
<PlanGegevensmelding
  showFireAgeNotice={showFireAgeNotice}
  showFireTargetNotice={showFireTargetNotice}
  showRetirementExpenseNotice={showRetirementExpenseNotice}
  simError={simError}
/>
```

### I — meldingen boven de grafiek (zonder lege staat)

- **Bron:** r6567–6832
- **Doel:** `components/toekomst/plan/plan-meldingen.tsx` → `PlanMeldingen` (30 props)
- **Nieuwe test:** `components/toekomst/plan/plan-meldingen.bron.test.ts`
- **Oude assertion(s) schrappen:**
  - `horizon-client.tekort-lening.test.ts` › *gated de zichtbare melding op display === 'expanded'*, *houdt de aria-live-regio altijd gemount…* en *toont de minimaliseer-knop alleen waar de keuze onthouden wordt*. (Detector, copy-memo en `useDeficitNotice` blijven in de ouder, dus die it-blokken blijven.)
  - `horizon-client.nu-stoppen.test.ts` › describe *statusblokken* (drie it-blokken).
  - `lib/horizon-kernel/bridge.status-compat.test.ts` › *bron-grendel — elke TEKORT-status…*: laat de grendel staan maar wijs `readFileSync` naar `components/toekomst/plan/plan-meldingen.tsx` (nu leest hij horizon-client; zonder aanpassing worden alle vier de ankers rood).
- **Noot:** Bronbereik r6567–6832 ligt binnen de `simResult ? (<>…</>)`-tak; de aanroep hoort op dezelfde plek, direct ná `<div className="my-2 border-b border-dashed …" />` (r6565), dus `simResult` is daar niet-null (prop-type `SimResult`). De lege staat r6543–6562 is van X2.

```tsx
<PlanMeldingen
  simResult={simResult}
  isFixedAnchorMode={isFixedAnchorMode}
  fireStrategy={fireStrategy}
  masked={masked}
  kernelStatus={kernelStatus}
  kernelMaandHint={kernelMaandHint}
  ankerReach={ankerReach}
  ankerStop={ankerStop}
  currentAge={currentAge}
  deficitLoanCopy={deficitLoanCopy}
  deficitDisplay={deficitDisplay}
  deficitLoanNotice={deficitLoanNotice}
  canMinimizeDeficit={canMinimizeDeficit}
  minimizeDeficitNotice={minimizeDeficitNotice}
  router={router}
  setStrategieInitialTab={setStrategieInitialTab}
  setActiveModal={setActiveModal}
  aowDisplay={aowDisplay}
  canMinimizeAow={canMinimizeAow}
  minimizeAowNotice={minimizeAowNotice}
  eindsituatiePlan={eindsituatiePlan}
  eindsituatieDuiding={eindsituatieDuiding}
  eindsituatieDisplay={eindsituatieDisplay}
  canMinimizeEindsituatie={canMinimizeEindsituatie}
  minimizeEindsituatieNotice={minimizeEindsituatieNotice}
  canonicalDailyRate={canonicalDailyRate}
  initialData={initialData}
  kernelRawProfile={kernelRawProfile}
  housingHeldNotice={housingHeldNotice}
  isPensioenMode={isPensioenMode}
/>
```

### Q–T — verdieping (katern III, Huishoud-FIRE, trendgrid, acties)

- **Bron:** r7833–7989
- **Doel:** `components/toekomst/plan/plan-verdieping.tsx` → `PlanVerdieping` (29 props)
- **Nieuwe test:** `components/toekomst/plan/plan-verdieping.bron.test.ts`
- **Oude assertion(s) schrappen:**
  - geen oude assertion wordt rood; wel ouder-aanpassing V1 (zie hieronder). `horizon-client.vrij-mogelijk-vanaf.test.ts` blijft op de ouder (de gate `presetBatchNodig` blijft daar).
- **Noot:** Ouder-aanpassing (V1) — vervang r1027–1028
```tsx
  const duidingSectionRef = useRef<HTMLElement | null>(null)
  const duidingInView = useInViewOnce(duidingSectionRef)
```
door
```tsx
  const [duidingInView, setDuidingInView] = useState(false)
  const markeerDuidingInView = useCallback(() => setDuidingInView(true), [])
```
`useInViewOnce` (r457–488) staat nu in `components/toekomst/plan/use-in-view-once.ts`; kaart §8 stap 4 noemt `components/toekomst/state/` — verplaatsen mag, de import in `plan-verdieping.tsx` volgt. Bij stap 13 wordt `duidingInView` provider-state met dezelfde setter (latchen, nooit terugzetten). De `dynamic()` van `HouseholdFireSection` (r309–312) is meeverhuisd — schrappen in de ouder.

```tsx
<PlanVerdieping
  coverageNodes={coverageNodes}
  radarAssen={radarAssen}
  scenarioPresets={scenarioPresets}
  scenarioPresetsLoading={scenarioPresetsLoading}
  hasScenario={hasScenario}
  hasStopKeuze={hasStopKeuze}
  usePartnerMainLine={usePartnerMainLine}
  useHouseholdMainLine={useHouseholdMainLine}
  doelActief={doelActief}
  stopPad={stopPad}
  duidingStopAge={duidingStopAge}
  simResult={simResult}
  userAowAge={userAowAge}
  lifelineAge={lifelineAge}
  isFixedAnchorMode={isFixedAnchorMode}
  ankerStop={ankerStop}
  scenarioVerwachtFireAge={scenarioVerwachtFireAge}
  viewScenarioPresets={viewScenarioPresets}
  personalHeroProjection={personalHeroProjection}
  resilienceSnapshots={resilienceSnapshots}
  healthScore={healthScore}
  healthChartOpen={healthChartOpen}
  setHealthChartOpen={setHealthChartOpen}
  fireAgeChartOpen={fireAgeChartOpen}
  setFireAgeChartOpen={setFireAgeChartOpen}
  setShowResilienceReceipt={setShowResilienceReceipt}
  actions={actions}
  handleActionStatusChange={handleActionStatusChange}
  onDuidingInView={markeerDuidingInView}
/>
```

### W — kassabon vrijheidsleeftijd

- **Bron:** r10316–10472
- **Doel:** `components/toekomst/plan/plan-kassabons.tsx` → `PlanKassabonVrijheidsleeftijd` (23 props)
- **Nieuwe test:** `components/toekomst/plan/plan-kassabons.bron.test.ts`
- **Oude assertion(s) schrappen:**
  - `horizon-client.prognose-precisie.test.ts` › *noemt zowel rendement als inflatie* en *toont de inflatie-aanname in beide kassabons* (of: laat ze staan en wijs ze naar `plan-kassabons.tsx`).
  - `horizon-client.kpi-gegevensmelding.test.ts` › *kent precies één vorm*: de `.hint`-tellingen (zie D).
- **Afwijking:** `BottomSheet` → `<ShellOverlay kind="sheet">` (Q9).

```tsx
<PlanKassabonVrijheidsleeftijd
  showFireAgeReceipt={showFireAgeReceipt}
  setShowFireAgeReceipt={setShowFireAgeReceipt}
  heroAgeLabel={heroAgeLabel}
  showFireAgeNotice={showFireAgeNotice}
  fireAgeNoticeGuard={fireAgeNoticeGuard}
  isFixedAnchorMode={isFixedAnchorMode}
  simResult={simResult}
  ankerReach={ankerReach}
  ankerStop={ankerStop}
  effectiveInput={effectiveInput}
  showLiquidWealthLine={showLiquidWealthLine}
  initialData={initialData}
  fire={fire}
  fireParams={fireParams}
  aowOntbreekt={aowOntbreekt}
  heroFireAge={heroFireAge}
  isPensioenMode={isPensioenMode}
  aowAgeFormatted={aowAgeFormatted}
  viewVermogenOpAnker={viewVermogenOpAnker}
  viewMonthlyWithdrawalAtAow={viewMonthlyWithdrawalAtAow}
  fireSwr={fireSwr}
  heroFireAgeReceiptText={heroFireAgeReceiptText}
  range={range}
/>
```

### X — kassabon doelbedrag

- **Bron:** r10474–10582
- **Doel:** `components/toekomst/plan/plan-kassabons.tsx` → `PlanKassabonDoelbedrag` (16 props)
- **Nieuwe test:** `components/toekomst/plan/plan-kassabons.bron.test.ts`
- **Oude assertion(s) schrappen:**
  - `horizon-client.nu-stoppen.test.ts` › *de doelbedrag-bon heeft onder een vast anker geen "Benodigd"-totaalregel*.
- **Afwijking:** `BottomSheet` → `<ShellOverlay kind="sheet">` (Q9).

```tsx
<PlanKassabonDoelbedrag
  showFireTargetReceipt={showFireTargetReceipt}
  setShowFireTargetReceipt={setShowFireTargetReceipt}
  isFixedAnchorMode={isFixedAnchorMode}
  showFireTargetNotice={showFireTargetNotice}
  fireTargetGuard={fireTargetGuard}
  simResult={simResult}
  fireSwr={fireSwr}
  effectiveInput={effectiveInput}
  isPensioenMode={isPensioenMode}
  aowAgeFormatted={aowAgeFormatted}
  fireParams={fireParams}
  viewMonthlyWithdrawalAtAow={viewMonthlyWithdrawalAtAow}
  viewVermogenOpAnker={viewVermogenOpAnker}
  viewEffectiveFireTarget={viewEffectiveFireTarget}
  fireStrategy={fireStrategy}
  masked={masked}
/>
```

### Y — kassabon opnamepercentage

- **Bron:** r10584–10833
- **Doel:** `components/toekomst/plan/plan-kassabons.tsx` → `PlanKassabonOpnamerate` (8 props)
- **Nieuwe test:** `components/toekomst/plan/plan-kassabons.bron.test.ts`
- **Oude assertion(s) schrappen:**
  - geen.
- **Afwijking:** `BottomSheet` → `<ShellOverlay kind="sheet">` (Q9).
- **Noot:** De twee `euro-view: exempt`-markeringen (r10793, r10817) gaan mee en blijven gelden; `horizon-client.euro-view.test.ts` telt ze niet per bestand.

```tsx
<PlanKassabonOpnamerate
  showSwrReceipt={showSwrReceipt}
  setShowSwrReceipt={setShowSwrReceipt}
  simResult={simResult}
  effectiveInput={effectiveInput}
  fireSwr={fireSwr}
  simCashflows={simCashflows}
  userAowAge={userAowAge}
  effectiveFireTarget={effectiveFireTarget}
/>
```

### Z — kassabon financiële gezondheid

- **Bron:** r10835–10864
- **Doel:** `components/toekomst/plan/plan-kassabons.tsx` → `PlanKassabonGezondheid` (4 props)
- **Nieuwe test:** `components/toekomst/plan/plan-kassabons.bron.test.ts`
- **Oude assertion(s) schrappen:**
  - geen.
- **Afwijking:** `BottomSheet` → `<ShellOverlay kind="sheet">` (Q9).
- **Noot:** De `dynamic()` van `HealthScoreReceipt` (r317–324) is meeverhuisd — schrappen in de ouder. Fase 5 verplaatst Z verder (kaart §2.1).

```tsx
<PlanKassabonGezondheid
  showResilienceReceipt={showResilienceReceipt}
  setShowResilienceReceipt={setShowResilienceReceipt}
  healthScore={healthScore}
  setActiveModal={setActiveModal}
/>
```

## Volgorde in de ouder (ongewijzigd)

```
<section data-testid="horizon-hero" …>          ← blijft in de ouder
  <div className="h-1.5" …/>
  <div className="p-4 sm:p-6 md:p-8">
    <PlanHeroKop …/>                            (B)
    <PlanKerngetalMobiel …/>                    (C)
    <PlanKpiStripDesktop …/>                    (D)
    <PlanHeroDuiding …/>                        (E+F)
    <PlanKpiStripMobiel …/>                     (G)
    <PlanGegevensmelding …/>                    (H)
    {!simResult && !loading ? (<lege staat, X2/>) : simResult ? (<>
      <div className="my-2 border-b …" />
      <PlanMeldingen …/>                        (I)
      … canvas (X2) …
    </>) : null}
  </div>
</section>
… SimChartModal, lab, sheets (X3) …
<PlanVerdieping … onDuidingInView={markeerDuidingInView} />   (Q–T)
… Event Form (weg in stap 2), fase-modals …
<PlanKassabonVrijheidsleeftijd …/>            (W)
<PlanKassabonDoelbedrag …/>                   (X)
<PlanKassabonOpnamerate …/>                   (Y)
<PlanKassabonGezondheid …/>                   (Z)
```

## Open punten voor de integrator

1. **Ouderdrift sinds c1b4849eb.** A1 bewerkt horizon-client (stap 1–3). De aanroepen hierboven verwijzen naar variabelen van c1b4849eb; controleer na stap 3 of er een prop-naam verdween of van type veranderde (bv. `loadData` komt in deze bladeren niet voor, dus stap 3 raakt ze niet; `router` wel in `PlanMeldingen`).
2. **`duidingInView`-latch** (Q–T): zie de ouder-aanpassing; de `useEffect` in het blad roept `onDuidingInView` bij elke render met `duidingInView === true` en gewijzigde callback — geef dus een stabiele `useCallback` mee.
3. **`fire`/`range`/`healthScore` niet-null**: de kassabons en de verdieping moeten ná de foutstaat-return (r5621) gerenderd blijven, anders klopt het prop-type niet.
4. **Lint-waarschuwingen die meeverhuizen** (bestonden al in de bron): ongebruikte `yearlyIncomeAtFire`/`yearlyIncomeAtAow` in kassabon Y en `react-hooks/set-state-in-effect` in `useInViewOnce`. Bewust niet opgeschoond (pure kopie).
5. **Kassabon-rendertest + mobiele check boven de nav-pill** (kaart §8 stap 6) is niet gedaan: geen browser in deze stroom (stroom T).
6. **`formatWithFreedom` in de huis-melding** (`PlanMeldingen`, r6797): meeverhuisd zoals het was; of dat onder de regel "nooit `formatWithFreedom(nominaalBedrag, dagtarief)` op een kernelwaarde" valt, is een aparte vraag buiten deze pure move.
