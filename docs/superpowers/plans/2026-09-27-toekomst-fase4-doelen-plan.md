# Fase 4 — katern Doelen samensmelten: bouwplan

Datum: 27 september 2026 · Skill-route: `extend-feature` · Hoort bij ADR 0179 (D3, D4, D7, D8) en spec `2026-09-26-toekomst-drie-katernen-design.md` (§4.2 regels 3, 4, 9, 10 · §4.3/§4.4 Doelen · §4.5 · §4.7 · §4.9 · §5 · §9 fase 4 · §11 #9, #10).

**Harde eis (eigenaar, §11 #10):** grafiek en doel-knoppen op één scherm. Desktop ≥ lg: canvas-rij in twee kolommen, grafiek links, harp rechts, kop + canvas-rij ≤ 480 px (1280×720). Mobiel < lg: grafiek `clamp(170px, 30vh, 230px)`, rad direct onder de klevende katern-koppen, opslaan-balk = action-bar van de shell; grafiek, rad en action-bar binnen 640 px onder de TopBar (360×800 én 390×844).

Dit plan wijzigt nog niets. Het wordt uitgevoerd na "go" van de orchestrator, als de parallelle agents klaar zijn met de overlappende bestanden.

---

## 1. Wat er nu staat (recon 27 sep)

| Onderdeel | Stand | Gevolg voor fase 4 |
|---|---|---|
| Route `app/(app)/toekomst/(katern)/doelen/page.tsx` | Rendert `DoelenKaternLab` en daaronder `DoelenView` met een `-mx-4 sm:-mx-6`-hack ("fase 4 ruimt dit op"). | Page wordt: mobiel lab → lab-details → doelenlijst → andere paden. |
| Layout `(katern)/layout.tsx` | Kop → `<ToekomstCanvas/>` → `<ToekomstKaternKoppen/>` → meldingenslot → `{children}` → overlay-host. Canvas blijft gemonteerd. | De rechterkolom van de canvas-rij kan niet uit de page komen (die staat ónder de koppen). Hij moet uit de layout-laag komen: een slot op het canvas. |
| `components/toekomst/canvas/canvas-stand.ts` | Pure stand per katern. Doelen: vaste lagen `doelscenario` + `doelen`, `toonPlanVolgtRegel` buiten Vermogen, `toonReadout: true`, `plotHoogte: null`. | Uitbreiden met Doelen-hoogtes, readout/tijdlijn uit, en de bron van Samenstelling/Geldstroom. |
| `toekomst-canvas.tsx` | Gebruikt `useActiefKatern()` + `canvasStand`. De terugvalregel `DOELEN_VOLGT_PLAN_REGEL` bestaat al (`data-testid="doelen-volgt-plan"`). | Krijgt een `zijkolom`-slot en kiest per stand de doel- of planfeed voor Samenstelling/Geldstroom. |
| Marktcheck in Doelen | Volgt de keuze van de gebruiker (`keuze.lagen.marktcheck`), standaard uit. | Blijft zo: D3 zegt dat een eigen keuze blijft staan bij een katernwissel; "standaard uit" is de beginstand zonder keuze. Een test pint het. |
| Katern-koppen (`components/editorial/katern-koppen.tsx`) | Mobiel `sticky top-0 z-20`, desktop statisch. | Niets te doen; het rad komt direct onder koppen + meldingenslot. |
| Katern-melding mobiel | Al één regel van 44 px (`katern-melding.tsx`). `LabPlanMelding` is in fase 2 opgegaan in het meldingenslot (`katern-meldingen.ts`, actie Bijwerken → lab). | "Versimpeld" is grotendeels af. Rest: de scenariodoelen-intro in `DoelenView` (zie S7). |
| Lab | `DoelenLab` (sectie `#verken-je-aannames`, ref `verkenSectionRef`) → `LabKnoppen` (kop = `ankerVraag`, weergave-schakelaar met vijf knoppen, zone-pill, uitkomstregel, schaal-legenda, vorm, stopSlot, marktbias) → `LabOpslaanBalk` → `LabIndicatieRegel`. `DoelenLabSheets` los. | Twee plekken, één keuze per breekpunt, compacte kolomvorm. |
| Opslaan-balk | Toont al één primaire knop per staat: `nieuw` → Vastleggen, `gewijzigd` → Bijwerken (plus Herstel/Loslaten/Reset als stil). | Mobiel gaan primair + secundair naar de action-bar. |
| `knopWeergave` | Eén veld in `profiles.toekomst_scenario_prefs` (**jsonb**, migratie `20260710120000`, geen CHECK-constraint). Enige schrijfpoort: `parseToekomstScenarioPrefs` (whitelist) via `PUT /api/toekomst-scenario` (volledige overwrite). Standaard `'wijzer'`; de state schrijft het veld in élke PUT mee. | **Geen migratie nodig**: twee nieuwe sleutels = parser + type + payloadbouwer. |
| Shell-action-bar | `BottomBarConfig kind:'action-bar'` + `LiveBottomBarContext` (`useLiveBottomBar`) bestaan; `MobileBottomBar` rendert de live-config in de tray. Er bestaat géén `MobileBottomBarLive`-component en geen enkele consumer (grep). De `FloatingNavButton` (`fixed bottom: safe-area + 12px`, `z-[60]`) zou over een action-bar vallen. | Kleine registratiehook + pill-regel nodig (S2). |
| `ScenarioKaarten` + preset-gate | In `components/toekomst/plan/plan-verdieping.tsx` met `useInViewOnce(ref,'600px', hasRun:displayMode)` en `onDuidingInView` → `markeerDuidingInView` (sim-state). Batch start onder `solved` pas als `displayMode==='full' && duidingInView`; onder een vast anker altijd. | Blok verhuist naar Doelen met zijn eigen observer; de gate blijft lazy. |
| Adaptervraag | `selectDoelLijnBron` levert alleen `SimRow[]`. Maar beide bronnen (`HorizonScenarioResult`, `ForcedStopPathResult`) dragen al `unifiedRows: UnifiedProjectionRow[]` en `kernelHousingSale` van dezelfde run. Samenstelling = `unifiedRowsToStackedRows(displayUnifiedRows)` + `applyHousingToComposition`; Geldstroom = `IncomeExpenseChart(rows=viewDisplaySimRows, breakdown=buildBreakdown(unifiedRows, simRows, debts))`. | **Keuze: leveren** (zie §2). |

## 2. Keuze adaptervraag: leveren

De doelscenario-run levert de grootboekrijen al. `DoelLijnSelectie` krijgt `unifiedRows` en `kernelHousingSale` van **dezelfde** run als `rows`. Daarmee tonen Samenstelling en Geldstroom in Doelen het doelscenario met exact dezelfde helpers als het plan (`unifiedRowsToStackedRows`, `applyHousingToComposition`, `buildBreakdown`). Er komt geen run, geen motor en geen eigen samenstelling bij (D3, spec §4.5).

Regels:

- **Wanneer doelscenario:** katern Doelen, modus Samenstelling of Geldstroom, `hasDoelLijn` (de lijn wijkt dan per constructie van het plan af) én perspectief solo (`verkenSectieZichtbaar`; het lab is solo, ADR 0170 B10). Label boven de grafiek: "Je doelscenario" (spec §4.5).
- **Terugvalregel** "Samenstelling en Geldstroom volgen je plan; je doelscenario zie je in Vermogen" alleen als er wél een doellijn is maar geen doelrijen (partner- of huishoudperspectief, of een run zonder `unifiedRows`).
- **Geen doellijn:** het plan, zonder regel. Plan en doelscenario zijn dan gelijk.
- **Euro-weergave:** de nieuwe feeds gaan door de ene render-grens (`use-euro-view-feeds.ts`), gedeflateerd met de `inflationFactor` van de doelrijen zelf, elk bedrag exact één keer. De bron-test `use-euro-view-feeds.euro-view.test.ts` en `euro-view-feeds.feed-keys.test.ts` bewaken dat.
- **Lui:** de afleiding draait alleen als de modus dat vraagt (zoals `wealthCompositionRows` nu), dus Vermogen kost niets extra.

## 3. Stappen

Elke stap eindigt groen (`npx tsc --noEmit` gefilterd op eigen bestanden + de genoemde vitest-paden via PowerShell) en wordt gecommit met `git add -- <paden>` + `git commit -- <paden>`, nooit `add -A`.

### S0 — Hervatcheck (geen commit)

`git status` + `git log -10`. Lees opnieuw wat parallelle agents intussen veranderden aan `(katern)/layout.tsx`, `toekomst-state-provider.tsx`, `plan-verdieping.tsx`, `lib/horizon/toekomst-scenario.ts` (die stond bij de recon gewijzigd in de werkboom) en `scenario-chip.tsx`. Zijn die nog niet gecommit, dan eerst melden en niet erdoorheen bouwen.

### S1 — `knopWeergave` per breekpunt (geen migratie)

- `lib/horizon/toekomst-scenario.ts`: `ToekomstScenarioPrefs` krijgt `knopWeergaveDesktop?` en `knopWeergaveMobiel?`. `KNOP_WEERGAVE_STANDAARD` wordt `{ desktop: 'harp', mobiel: 'rad' }` (ADR 0179 amendement op 0170 B7/B11/B12). De parser whitelist beide tegen `KNOP_WEERGAVEN`.
  - **Legacy `knopWeergave`:** tolerant gelezen en nooit meer geschreven (zelfde patroon als `sliders.income`). Hij telt alleen als desktopkeuze als hij níét `'wijzer'` is: de oude standaard werd in elke PUT meegeschreven, dus `'wijzer'` is niet van een bewuste keuze te onderscheiden. Een bewuste `balk`/`rad`/`harp`/`vijfhoek` blijft zo op desktop staan. Mobiel start iedereen op het rad.
- `components/app/horizon/doel-vastleg-sheet.tsx`: `buildScenarioPersistPayload` schrijft de twee sleutels.
- `components/toekomst/state/use-toekomst-scenario.ts`: twee states + setters; de persist-gate vergelijkt beide met de standaard. `knopWeergave`/`setKnopWeergave` verdwijnen uit de scenario-context (en uit `doelen-katern-lab.tsx`/`doelen-lab.tsx`-props).
- Tests: `lib/horizon/toekomst-scenario.test.ts` (roundtrip, whitelist, legacy-mapping, standaard), `components/app/horizon/doel-vastleg-sheet.test.tsx` (payload), `app/api/toekomst-scenario/route.test.ts` (400 op onbekende waarde, 200 met twee sleutels), `components/toekomst/doelen/doelen-lab.test.ts`.
- `/api/toekomst-scenario` staat niet op de schrijfroutelijst van de plan-review, dus `veld-register.ts` beweegt niet mee. Controle: `veld-register.test.ts` groen.

### S2 — Shell: live action-bar + pill

- Nieuw `components/app/shell/use-live-action-bar.ts`: registreert een `BottomBarConfig` van `kind:'action-bar'` in `LiveBottomBarContext` zolang de component gemount is en de config niet `null` is, en ruimt hem op bij unmount. De handlers lopen via een ref, zodat een nieuwe render geen register-lus geeft.
- `components/app/shell/floating-nav-button.tsx`: `hidden` wordt ook waar zolang de live-config een action-bar is. Precedent: de immersieve routes, die hun eigen sticky primaire actie hebben. Zonder deze regel valt de pill (vast, 12 px boven de onderrand) over de action-bar.
- `BottomBarAction` heeft geen `disabled`. Tijdens een PUT geeft de registratie `onClick: undefined` mee; `ActionButton` rendert dan al disabled.
- Tests: nieuw `use-live-action-bar.test.tsx` (registreert, wist bij unmount en bij `null`), `floating-nav-button.test.tsx` (verborgen bij een live action-bar, zichtbaar zonder).

### S3 — Adapter: Samenstelling en Geldstroom tonen het doelscenario

- `lib/horizon/doel-lijn-bron.ts`: `DoelLijnPad.result` blijft, het pad krijgt `unifiedRows` + `kernelHousingSale`. `DoelLijnSelectie` geeft ze door uit dezelfde run. Test: `doel-lijn-bron.test.ts` (rijen, stip en grootboek uit één run).
- `components/toekomst/state/use-toekomst-scenario.ts`: stelt `doelLijnBron` beschikbaar aan de lagen-hook, of alleen de afgeleide `doelGrootboek` (volgorde van de hooks in de provider nagaan).
- `components/toekomst/state/use-toekomst-lagen.ts`: `doelWealthCompositionRows` (alleen in modus Samenstelling), `doelDisplaySimRows` (geclipt op `displayEndAge`) en `doelIeBreakdownResult` (alleen bij Bronnen). Dezelfde helpers als het plan.
- `components/toekomst/state/use-euro-view-feeds.ts` + `euro-view-feeds.ts`: `viewDoelWealthCompositionRows`, `viewDoelDisplaySimRows`, `viewDoelIeBreakdownResult`, gedeflateerd met de factor van de doelrijen.
- `components/toekomst/canvas/canvas-stand.ts`: nieuw veld `grafiekBron: 'plan' | 'doelscenario' | 'plan-met-regel'` (beschikbaarheid krijgt `doelscenarioRijen: boolean`). `toonPlanVolgtRegel` wordt `grafiekBron === 'plan-met-regel'`.
- `components/toekomst/canvas/canvas-grafiek.tsx`: aparte props voor Samenstelling (rijen, `housingSaleAge`, FIRE-stip) en Geldstroom (rijen, breakdown), zodat Vermogen op `viewDisplaySimRows` blijft.
- `components/toekomst/canvas/toekomst-canvas.tsx`: kiest per `grafiekBron`. Het label "Je doelscenario" komt uit `lib/horizon/katern-copy.ts`.
- Tests: `canvas-stand.test.ts` (drie bronnen × perspectief × modus), `toekomst-canvas.test.tsx` (**runtime-assertie:** de gerenderde staven in Doelen/Samenstelling zijn gelijk aan `unifiedRowsToStackedRows(doelrijen)` voor dezelfde input, en in Plan aan de planrijen), `use-euro-view-feeds.euro-view.test.ts` (nieuwe feeds één keer gedeflateerd), `euro-view-feeds.feed-keys.test.ts`.

### S4 — Canvas-stand van Doelen: hoogtes en rust

- `canvas-stand.ts`, Doelen: `toonReadout: false` en nieuw `toonTijdlijn: false`. De gebeurtenis-markers staan al op de lijn; de tijdlijn eronder kost ±40 px die de één-scherm-eis niet heeft. Plan en Instellingen houden hun tijdlijn. Verder `plotHoogte` wordt `{ desktop: DOELEN_PLOTHOOGTE_DESKTOP, mobiel: 'viewport' }`.
  - `DOELEN_PLOTHOOGTE_DESKTOP` = 220; de definitieve waarde volgt uit de meting in §5.
  - Pure helper `doelenPlotHoogteMobiel(vh) = clamp(round(0,3·vh), 170, 230)`.
- Nieuw `lib/hooks/use-viewport-hoogte.ts`: `window.innerHeight` bij mount en bij `orientationchange`, bewust niet bij elke `resize`. iOS vuurt resize bij het in- en uitklappen van de werkbalk, en dat zou de grafiek tijdens het scrollen laten verspringen.
- `canvas-grafiek.tsx`: geeft `toonTijdlijn` door. Markers zonder label op mobiel: labels staan nu alleen in de tooltip (`chart-event-markers.tsx`); nagaan en pinnen, niets bouwen als dat al zo is.
- `canvas-legenda.tsx`: prop `eenRegel` → onder lg `whitespace-nowrap overflow-hidden text-ellipsis`.
- `toekomst-canvas.tsx`: in Doelen een kleinere bovenmarge en `lg:p-5` in plaats van `md:p-8` (de ruimte tussen ankerregel en canvas telt mee in de 480 px).
- Tests: `canvas-stand.test.ts` (helper op 500/600/700/800/900 → 170/180/210/230/230; readout en tijdlijn uit in Doelen, aan in Plan), `canvas-legenda.test.tsx`, `toekomst-canvas.test.tsx` (geen `canvas-readout`, geen tijdlijn in Doelen), en de marktcheck-pin (standaard uit in Doelen; een keuze uit Plan blijft staan).

### S5 — De canvas-rij in twee kolommen (desktop)

- `toekomst-canvas.tsx`: prop `zijkolom?: ReactNode`. Alleen in katern Doelen, alleen met simResult: de binnenkant wordt `lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,360px)] lg:gap-6`, links de bestaande inhoud (`min-w-0`), rechts `hidden lg:block lg:border-l lg:pl-6` met `data-testid="doelen-canvas-rij"` op de rij. Buiten Doelen verandert er niets aan de DOM.
- Nieuw `components/toekomst/layout/canvas-zijkolom.tsx` (layout-laag, D8: alleen de layout kent de route): rendert `<DoelenLab plek="kolom"/>` als `useActiefKatern() === 'doelen'`, anders `null`.
- `app/(app)/toekomst/(katern)/layout.tsx`: `<ToekomstCanvas zijkolom={<CanvasZijkolom/>}/>`.
- Waarom geen parallelle route (`@zij`) of portal: een parallel slot houdt bij soft navigation zijn vorige inhoud vast, en een portal verschijnt pas na mount (layoutverschuiving op desktop). Een slot uit de layout rendert server-side op zijn plek.
- Tests: `toekomst-canvas.test.tsx` (grid-klassen en kolom alleen in Doelen), `katern-layout.mount.test.ts` (canvas blijft gemonteerd; het slot wisselt mee).

### S6 — Eén lab, twee plekken, één knop per staat

- `components/toekomst/doelen/doelen-lab.tsx` + `doelen-katern-lab.tsx`: prop `plek: 'kolom' | 'onder-koppen'`.
  - **Kolom** (`hidden lg:block`): weergave `knopWeergaveDesktop`, standaard harp.
  - **Onder de koppen** (`lg:hidden`, eerste element van de Doelen-page, dus direct onder koppen en meldingenslot): weergave `knopWeergaveMobiel`, standaard rad.
  - Elke plek schrijft alleen zijn eigen sleutel. De zichtbaarheid regelt CSS, zodat er geen JS-breekpunt en geen hydratiesprong nodig is.
  - `id={VERKEN_SECTION_ID}` en `verkenSectionRef` gaan alleen naar de plek die volgens `useIsLgUp()` zichtbaar is. Die hook raakt alleen id en ref, niet de layout; de server rendert ze op de mobiele plek.
- `components/app/horizon/lab-knoppen.tsx`:
  - `weergaveKiezer: 'knoppen' | 'menu'`. `menu` is een native `<select>` "Weergave" met de vijf vormen: één regel in plaats van vijf knoppen. Beide plekken gebruiken `menu`.
  - `extraDetails: boolean`. Uit ⇒ geen marktbias-blok; dat blok gaat naar S6-details.
  - De uitkomstregel blijft precies één keer, boven de knoppen (spec §4.9).
- `components/app/horizon/lab-opslaan-balk.tsx`: prop `acties: 'inline' | 'shell'`.
  - `shell` (mobiel): de balk toont alleen de statusregel plus Loslaten als tekstlink. Primair (Vastleggen of Bijwerken) en secundair (Reset of Herstel) gaan via `useLiveActionBar` naar de shell.
  - Alleen de staten `nieuw` en `gewijzigd` hebben een action-bar. In `rust`, `opgeslagen` en `nu-anker` is er niets om op te slaan: geen bar, de pill blijft.
- **Kolom (desktop), van boven naar beneden:** kicker + vraag (`ankerVraag`, B10-voorwaarde) · uitkomstregel + zone · schaal-legenda op één regel · harp · opslaan-balk · voetregel (de stopmoment-actie "Maak X mijn stopmoment" · "Je plan-keuzes →" · weergave-menu).
- **Onder de koppen:**
  - Nieuw `components/toekomst/doelen/doelen-lab-details.tsx`: "Marktaannames voor dit scenario" ingeklapt en `HideInSimple` (§4.7), plus `LabIndicatieRegel` (de complianceregel blijft één keer per scherm).
  - `DoelenLabSheets` mount één keer, op de page.
- "Je plan-keuzes →" wordt een `Link` naar `KATERN_HREF.instellingen` in plaats van `setActiveModal('strategie')` (één ingang, D4). Heeft fase 3 dat al gedaan, dan vervalt deze regel.
- Koppen: de vraag blijft `h2` op beide plekken. De verborgen plek is `display:none` en staat dus niet in de a11y-boom; `check:headings` scant statisch en ziet geen h1.
- Tests:
  - `lab-knoppen.test.tsx`: `<select>`-kiezer; `extraDetails` uit.
  - `lab-opslaan-balk.test.tsx`: `acties="shell"` rendert geen primaire knop.
  - Nieuw `doelen-lab.plek.test.tsx`: klassen per plek, standaard harp/rad, schrijft de juiste sleutel, action-bar-config per staat (nieuw → Vastleggen + Reset, gewijzigd → Bijwerken + Herstel, rust → geen), busy → disabled.
  - `use-toekomst-overlay-state.whatif-scroll.test.tsx`: de ref wijst naar de zichtbare plek.

### S7 — Onder het lab: de doelenlijst

- `components/future/doelen-view.tsx`: prop `ingebed` laat de eigen `mx-auto max-w-6xl px-*` weg; de `-mx-4 sm:-mx-6`-hack in de page verdwijnt. Kop "Je doelen" als `SectionLabel num="II"` (§4.3).
- Scenariodoelen:
  - De uitkomstdoelen (`fire_age`, `plan_coverage`, `end_balance`) tonen naam en statuspunt, zonder de uitkomst te herhalen. Die staat in de uitkomstregel van het lab (§4.9).
  - Knop-doelen (spaarquote, extra inleg, uitgave na pensioen, nalatenschap) houden hun waarde: dat is een instelling, geen uitkomst.
  - De intro "Doelen uit je scenario in het lab. Klik een kaart om ze live te verkennen op de tijdas." vervalt: het lab staat er direct boven.
  - Het doelsituatie-menu (Loslaten) blijft.
- Blijft zoals het is: vrije doelen, het Bereikt-archief (ingeklapt) en de viering (`MilestoneCelebration`).
- Tests: de bestaande `doelen-view`-suites plus een nieuwe case "uitkomstdoel toont geen doelwaarde; knop-doel wel".

### S8 — Andere paden naast je doelscenario

- Nieuw `components/toekomst/doelen/andere-paden.tsx` (`HideInSimple`, §4.7): `SectionLabel num="III"` "Andere paden naast je doelscenario" + `ScenarioKaarten`.
  - Eigen `useInViewOnce(ref, '600px', `${hasRun}:${displayMode}`)` naast de sectie die hij observeert. `markeerDuidingInView` uit de sim-context volgt als hij in beeld is.
  - Dezelfde gate als nu (ADR 0145 D7a): de batch onder `solved` start pas als dit paneel in beeld komt.
  - Omdat Doelen geen inklap op mobiel heeft, is de voorwaarde alleen "in beeld".
- `components/toekomst/plan/plan-verdieping.tsx`: het ScenarioKaarten-blok eruit; alleen `HouseholdFireSection` blijft (die moet op Plan gemount blijven, ADR 0168). `plan-paneel.tsx` geeft geen preset-props meer door.
- `app/(app)/toekomst/(katern)/doelen/page.tsx`: eindvolgorde `DoelenLab plek="onder-koppen"` → `DoelenLabDetails` → `DoelenView ingebed` → `AnderePaden` → `DoelenLabSheets`.
- Tests: `plan-verdieping.bron.test.ts` → de gate-invariant verhuist naar nieuw `andere-paden.bron.test.ts` (één invariant, één bestand). Nieuw `andere-paden.test.tsx`: niet in beeld → geen `markeerDuidingInView`; wel in beeld → één keer; Eenvoudig → niet gemount.

### S9 — Doc, ADR, info-knop, UAT-delta

- `docs/adr/0179-toekomst-in-drie-katernen.md`, addendum "Fase 4": (1) de D7-toets: geen migratie, want de kolom is jsonb met parser-whitelist, twee sleutels, legacy tolerant; (2) de adaptervraag: geleverd uit dezelfde run, met de terugvalregel alleen bij niet-solo; (3) de pill wijkt voor een live action-bar; (4) Doelen zonder readout en tijdlijn onder het canvas.
- `lib/page-info-content.ts`: sleutel `/toekomst/doelen` bijwerken (grafiek en knoppen naast elkaar, andere paden); daarna de `info-knoppen-actueel`-controle.
- `lib/architecture/hld-model.ts`: alleen als de capability-tekst over het doelscenario de plek noemt. Controle bij de uitvoering, anders niets.
- UAT (alleen de definities; ik lever de delta, de orchestrator dispatcht `uat-docs-keeper`):
  - TOEK-10, 43, 46, 58: het lab naast de grafiek op desktop en onder de koppen op mobiel; standaard harp/rad per breekpunt; de weergave-keuze per breekpunt; de action-bar op mobiel.
  - TOEK-22, 23, 35, 39, 40: de doelenlijst onder het lab, `ingebed`; een uitkomstdoel zonder herhaalde uitkomst.
  - TOEK-49 en 57: de uitkomstregel één keer.
  - TOEK-50: Loslaten blijft in het doelsituatie-menu; de melding is ongewijzigd.
  - TOEK-11: "Stop op AOW boven de grafiek" beschrijft nog een pill van vóór fase 2. Nagaan of het criterium nog klopt; zo niet, dan hoort de delta bij de keeper.
- Kopij: de nieuwe strings gaan langs `merkstem` + `compliance-check` als aanvulling §11 op het kopij-document, dat "het samengevoegde Doelen" al als nog te toetsen noemt. Het gaat om het label "Je doelscenario" boven Samenstelling en Geldstroom, "Weergave" (het menu), "Andere paden naast je doelscenario" en "Je doelen".

### S10 — Verificatie (allerlaatste handeling)

- `npx tsc --noEmit`, gefilterd op de eigen bestanden.
- Vitest via PowerShell op `components/toekomst`, `components/app/horizon/lab-*`, `components/app/horizon/doel-vastleg-sheet.test.tsx`, `components/future`, `components/app/shell/floating-nav-button.test.tsx`, `components/app/shell/use-live-action-bar.test.tsx`, `lib/horizon/toekomst-scenario.test.ts`, `lib/horizon/doel-lijn-bron.test.ts`, `app/api/toekomst-scenario`, `app/(app)/toekomst`, `lib/plan-review/veld-register.test.ts`, `lib/uat/**toek*`.
- Gates: `npm run check:headings`, `check:client-reads` (geen nieuwe reads), `check:overlays`, `check:tap-targets`, `merkstem:scan`, `npm run uat:stale -- --base=origin/master`.

## 4. Bewijs van de één-scherm-eis

**Bewijs 1: tests op klassen en hoogtes.** Die dwingen de structuur af; de meting in bewijs 2 bewijst pas de pixels.

| Invariant | Test |
|---|---|
| Doelen-canvas is op lg twee kolommen, het lab zit in de rechterkolom; buiten Doelen geen grid | `toekomst-canvas.test.tsx` |
| Mobiel lab is `lg:hidden` en het éérste element van de Doelen-page; de kolom is `hidden lg:block` | `doelen-lab.plek.test.tsx` + een page-render-test |
| `doelenPlotHoogteMobiel(vh)` = clamp(0,3·vh, 170, 230); desktop-plothoogte = `DOELEN_PLOTHOOGTE_DESKTOP` | `canvas-stand.test.ts` |
| Doelen: geen readout, geen tijdlijn, geen aannamesregel; legenda op één regel onder lg | `canvas-stand.test.ts`, `toekomst-canvas.test.tsx`, `canvas-legenda.test.tsx` |
| Standaardweergave harp (kolom) / rad (onder de koppen); de keuze per sleutel | `toekomst-scenario.test.ts`, `doelen-lab.plek.test.tsx` |
| Opslaan-balk mobiel = shell-action-bar (nieuw/gewijzigd), pill verborgen | `doelen-lab.plek.test.tsx`, `floating-nav-button.test.tsx` |

**Bewijs 2: de meting (door de orchestrator).** Eerst `scrollTop = 0`, dan in DevTools `evaluate_script`:

```js
const r = (s) => document.querySelector(s)?.getBoundingClientRect()
// Desktop 1280×720 en 1440×900:
const rij = r('[data-testid="doelen-canvas-rij"]'), kopTop = r('main')?.top ?? 0
;({ kopPlusRij: rij.bottom - kopTop, rijBottom: rij.bottom, viewport: innerHeight })
// eis: kopPlusRij ≤ 480 en rijBottom ≤ innerHeight; de laatste harp-strook en de opslaan-balk volledig in beeld

// Mobiel 360×800 en 390×844:
const top = r('header')?.bottom /* TopBar */, rad = r('[data-testid="lab-rad-rij"]'), bar = r('[data-mobile-bottom-nav], .border-t-2.border-\\[var\\(--ink\\)\\]')
;({ radBottomOnderTopBar: rad.bottom - top, radBovenBar: rad.bottom <= (bar?.top ?? innerHeight) })
// eis: radBottomOnderTopBar + hoogte action-bar ≤ 640, radBovenBar === true
```

De selectors worden bij S6 vastgezet met `data-testid`s ("doelen-canvas-rij", "lab-rad-rij" bestaat al, en de action-bar-wrapper krijgt `data-testid="shell-action-bar"`), zodat de meting niet op klassen leunt.

**Visuele toestanden om na te lopen** (op de vier viewports):

- solved met een verkend scenario;
- een vast anker met een tekort (uitkomstregel met drie cellen, de langste);
- `nu`-anker (geen stop-knop, geen action-bar);
- Eenvoudig;
- de Doelen-melding uitgeklapt tegenover geminimaliseerd;
- modus Samenstelling en Geldstroom in Doelen, met en zonder doelscenario, en in huishoudperspectief (terugvalregel);
- elk van de vijf weergaven op desktop en op mobiel;
- een knopwijziging verandert de stippellijn in beeld zonder te scrollen.

## 5. Risico's

1. **Het desktopbudget van 480 px is krap.** Kop ±120 px, kolom: vraag 36 + uitkomst 20 + legenda 16 + harp 5×44 = 220 + opslaan-balk 44 + voetregel 32 ≈ 370, plus kaartpadding. Hefbomen in volgorde: kaartpadding (`lg:p-5`), bovenmarge canvas, de legenda naar de lab-details, het weergave-menu in de kopregel naast de zone-pill. Niet inleveren: de harpstroken (44 px = minimaal raakvlak) en de vraag (B10). Blijft het na die hefbomen boven 480, dan meld ik dat met de meting.
2. **De uitkomstregel onder een vast anker** (reikt · gedekt · eindvermogen) kan op 360 px naar twee regels breken en het mobiele budget (±24 px) overschrijden. Eerst meten, niet vooraf versimpelen.
3. **Het lab staat twee keer gemount** (verborgen plek `display:none`). Dat is goedkoop (presentational, state in de provider), maar tests moeten met `within(...)` op één plek zoeken, er zijn twee sr-only live-regio's (de verborgen is stil) en de `id`/ref-toewijzing hangt aan `useIsLgUp`. Het alternatief, één mount die van plek wisselt, gaf een hydratiesprong op desktop.
4. **Parallelle sessies** in `layout.tsx`, `toekomst-state-provider.tsx`, `plan-verdieping.tsx`, `lib/horizon/toekomst-scenario.ts`. Daarom S0, en per stap alleen de eigen paden stagen.
5. **Dubbele deflatie** bij de nieuwe doelfeeds. Die gaan alleen door de ene grens, met de bron-test.
6. **iOS-viewport:** `30vh` volgt de werkbalk. Daarom meet ik alleen bij mount en bij een oriëntatiewissel.
7. **De preset-batch op Doelen:** met Doelen als vaste bestemming kan de batch vaker starten dan toen hij onder de vouw van Plan stond. Het blijft lazy (onder de doelenlijst, `600px`-marge), maar het is een reëel kostenverschil. Na S8 even meten.

## 6. Open punten (alleen wat §11 niet besliste)

1. **De pill wijkt voor de action-bar (S2).** Ik kies verbergen zolang er iets op te slaan is (`nieuw`/`gewijzigd`), naar het precedent van de immersieve routes. In rust blijft de pill. Het alternatief is de pill boven de action-bar optillen, maar dan valt hij over het rad en breekt hij de 640 px. Gevolg om te bevestigen: op mobiel in Doelen is navigeren tijdens een onopgeslagen verkenning alleen via de TopBar-terugknop mogelijk.
2. **Gedempte hoofdlijn in Doelen (spec §4.5, "ja, als referentie in gedempte inkt").** Die staat in de spec-tabel maar niet in de fase-4-opdracht, en raakt `SimChart` (gedeeld). Hij zit niet in dit plan. Hoort hij erbij, dan komt er een kleine S5b bij (prop op `SimChart` + test), zonder invloed op de rest.

## 7. Bestanden die ik aanraak

**Nieuw**
- `components/app/shell/use-live-action-bar.ts` + `use-live-action-bar.test.tsx`
- `lib/hooks/use-viewport-hoogte.ts` (+ test)
- `components/toekomst/layout/canvas-zijkolom.tsx`
- `components/toekomst/doelen/doelen-lab-details.tsx`
- `components/toekomst/doelen/andere-paden.tsx` + `andere-paden.test.tsx` + `andere-paden.bron.test.ts`
- `components/toekomst/doelen/doelen-lab.plek.test.tsx`

**Gewijzigd**
- `app/(app)/toekomst/(katern)/doelen/page.tsx`
- `app/(app)/toekomst/(katern)/layout.tsx` (alleen de `zijkolom`-prop)
- `app/api/toekomst-scenario/route.test.ts`
- `components/app/shell/floating-nav-button.tsx` + `floating-nav-button.test.tsx`
- `components/app/shell/mobile-bottom-bar.tsx` (alleen `data-testid="shell-action-bar"`)
- `components/app/horizon/lab-knoppen.tsx` + `lab-knoppen.test.tsx`
- `components/app/horizon/lab-opslaan-balk.tsx` + `lab-opslaan-balk.test.tsx`
- `components/app/horizon/doel-vastleg-sheet.tsx` + `doel-vastleg-sheet.test.tsx`
- `components/future/doelen-view.tsx` (+ bestaande tests)
- `components/toekomst/doelen/doelen-katern-lab.tsx`, `doelen-lab.tsx`, `doelen-lab.test.ts`
- `components/toekomst/canvas/canvas-stand.ts` + `canvas-stand.test.ts`
- `components/toekomst/canvas/toekomst-canvas.tsx` + `toekomst-canvas.test.tsx`
- `components/toekomst/canvas/canvas-grafiek.tsx` (+ `canvas-grafiek.modi.test.tsx`)
- `components/toekomst/canvas/canvas-legenda.tsx` + `canvas-legenda.test.tsx`
- `components/toekomst/plan/plan-verdieping.tsx`, `plan-verdieping.bron.test.ts`, `plan-paneel.tsx`
- `components/toekomst/state/use-toekomst-scenario.ts`, `use-toekomst-lagen.ts`, `use-euro-view-feeds.ts`, `euro-view-feeds.ts`, `use-euro-view-feeds.euro-view.test.ts`, `euro-view-feeds.feed-keys.test.ts`, `use-toekomst-overlay-state.whatif-scroll.test.tsx`; en `toekomst-state-provider.tsx` alleen als de hookvolgorde het doorgeven van `doelLijnBron` vraagt
- `lib/horizon/toekomst-scenario.ts` + `toekomst-scenario.test.ts`
- `lib/horizon/doel-lijn-bron.ts` + `doel-lijn-bron.test.ts`
- `lib/horizon/katern-copy.ts` (label "Je doelscenario", "Weergave")
- `lib/page-info-content.ts` (sleutel `/toekomst/doelen`)
- `docs/adr/0179-toekomst-in-drie-katernen.md` (addendum fase 4)
- `docs/superpowers/specs/2026-09-26-toekomst-drie-katernen-kopij.md` (§11, na de merkstem- en compliance-toets)

**Niet door mij (delta geleverd):** `lib/uat/acceptance/toek.ts` en de bijbehorende catalogus en flows, via `uat-docs-keeper`.

**Bewust niet aangeraakt:** geen migratie, geen rekenmotor, geen `lib/architecture/calculations.ts` (geen nieuwe of gewijzigde motor), geen `veld-register.ts` (de route staat niet op de plan-review-lijst).
