# Vangnet fase 1 — /toekomst in drie katernen

Stroom T, 26 sep 2026. Geldt voor de refactor-stap van ADR 0179 (spec
`docs/superpowers/specs/2026-09-26-toekomst-drie-katernen-design.md` §9 fase 1 en §10).
Doel: `components/app/horizon/horizon-client.tsx` (11.029 regels) opknippen en /toekomst over
drie routes verdelen **zonder gedragswijziging**. Dit document zegt welke tests dat bewaken,
welk commando na elke stap draait, waar de gaten zaten en wat er visueel naast de baseline moet.

Baseline vóór stroom A: `tsc` 0 fouten; volledige vitest 1581 bestanden / 21.451 tests groen
(gemeten door de hoofdthread). Na toevoeging van dit vangnet: `npx tsc --noEmit` exit 0, en het
katern-commando (§2.2) 254 bestanden / 3509 tests groen.

---

## 1. Wat het gedrag van /toekomst vandaag dekt

### 1.1 De 17 bron-scans op `horizon-client.tsx`

Alle zeventien lezen `components/app/horizon/horizon-client.tsx` letterlijk in. Ze breken
**met opzet** bij de decompositie; de spec (§9, Tests) laat elk ervan meeverhuizen naar het
bestand waar zijn invariant na fase 1 woont.

| Test (`components/app/horizon/horizon-client.….test.ts`) | Invariant die hij pint |
|---|---|
| `chart-points` | Overlay-punten op de grafiek komen uit de gedeelde helper in de geometrie-module, niet uit rauwe `[age, endPortfolio]`-paren. |
| `diff-vlak` | Het verschilvlak komt uit `buildDiffVlakken` (ADR 0170), achter de lijnen en met semantische tokens; de nalatenschap-bol hangt aan de live wat-als-lijn. |
| `doel-loslaten-terugweg` | De zichtbaarheid van de doelsectie is één benoemde afleiding, los van doel en weergavemodus (B-031: na "Doel loslaten" blijft het lab bereikbaar). |
| `euro-view` | Precies één gemarkeerde euro-render-grens: elke deflatie en elke `inflationFactor` staat binnen de bakens (ADR 0093, T4). |
| `feed-keys` | De partnerlijn deflateert op jaar-offset, niet op leeftijd (K4); de besteedbaar-lijn met de factor van het bronjaar (K2). |
| `fire-doel-grondslag` | Eén beslisser voor de doelbedrag-grondslag (gedeelde resolver, één aanroep, beide serverwaarden). |
| `haalbare-uitgave` | De "haalbare uitgave"-regel via één helper, semantische tokens, niet in huishoudweergave; de knop staat als derde van vijf (ADR 0170). |
| `hero-fire-age` | Eén beslisser voor het kernantwoord (`resolveHeroFireAge`); geen tweede motor via `fire.fireAge`/`fire.fireTarget`. |
| `kpi-gegevensmelding` | Elke hero-KPI toetst zijn eigen brondata via de guards uit `outcome-guard.ts`; één meldingsvorm, verdringt geen geldig antwoord. |
| `lab-uitkomst` | Eén lab-uitkomst (`resolveLabUitkomst`, ADR 0145); opslaan-balk hangt aan de benoemde promotie-gates; geen eigen dekkingssom. |
| `na-pensioen-klik` | Klik op KPI "Na pensioen" in huishoudweergave vertakt alleen naar de huishoud-pane als die kan renderen (WF-REKEN-23). |
| `nu-stoppen` | Het plan-anker komt uit de kernel-echo `simResult.stopAnker` (ADR 0129); pensioen-/nu-vlaggen volgen het anker, de koppen `ankerVraag`. |
| `prognose-precisie` | Eén vorm voor doelbedrag (altijd "ca.") en vrijheidsleeftijd (geen decimalen buiten een kassabon); de kassabon noemt rendement én inflatie. |
| `tekort-lening` | De tekort-lening-melding haalt feiten, copy en vrijheidstijd uit één bron/run en volgt de meldingen-conventie. |
| `tips-close` | Tips-overlay sluiten is direct en persistent, zonder exit-modal (M38); de Details-knop staat één laag boven de tips-scrim (M9). |
| `vrij-mogelijk-vanaf` | De preset-batch onder een vast anker wacht niet op scrollen; draait op de geïnjecteerde profielrij (ADR 0103 × 0129 D7). |
| `vrijheids-pct-anker` | Het anker kiest de definitie van het vrijheids-%; alle consumenten (hero-gate, gezondheidsscore) lezen hetzelfde getal. |

Verwant, ook bron-scan op `horizon-client.tsx`: `lib/horizon/deeplink-cleanup.test.ts`
(tweede describe: opschonen via de gedeelde helper, nooit `router.replace('/horizon')`).

### 1.2 Component-tests van de blokken

Deze renderen losse componenten en overleven de verhuizing zolang de componenten zelf
niet veranderen.

- `components/app/horizon/*.test.tsx` (38 bestanden): `anker-drieslag`, `aow-notice-provider`,
  `chart-event-markers`, `deficit-notice-provider`, `dekkingsradar`, `doel-vastleg-sheet`,
  `eindsituatie-notice`, `event-chat-pane`, `event-pane-edit.age`,
  `health-score-receipt(.onbekend)`, `horizon-trend-grid`, `horizon-year-details-sheet`,
  `income-expense-chart`, `lab-harp`, `lab-knoppen`, `lab-opslaan-balk`, `lab-rad`, `lab-slider`,
  `lab-vijfhoek`, `lab-wijzer.greep`, `lifeline-readout`, `natural-milestone-sheet`,
  `pension-pdf-upload`, `phase-detail-table`, `phase-modal-kassabon.euro-view`,
  `phase-modal-vrijheidsdagen`, `projectie-laadlaag`, `scenario-chip`, `scenario-kaarten`,
  `sim-chart(-widget)(.canonieke-koers)`, `stop-plan-confirm`, `surplus-gap-chart`,
  `toekomst-overlay`, `uitgaven-keuze`, `wealth-composition-chart`.
  Daarnaast `.test.ts` in dezelfde map: `b053-scenario-floor.repro`, `strategie-modal.autosave`,
  `grafiek-uitleg/chapter-data`.
- `components/future/*.test.tsx` (10): `afbouw-overzicht-card`, `box3-methode-sheet`,
  `calculator-to-life-event-sheet`, `doel-bewerken-sheet`, `doel-toevoegen-sheet`, `doelen-view`,
  `gebeurtenissen-view`, `toekomst-nav-cards`, `voorkeur-bewerken-sheet`, `voorkeuren-view`;
  plus `doelen-verdict.test.ts` en `plan-review/{inkomsten-editor,plan-review-pane,uitgaven-editor}`.
- Nieuw van stroom B/C (in de werkboom, nog niet in HEAD): `components/toekomst/canvas/*`
  (`aannamesregel`, `lagen-menu`, `marktcheck-getallen`, `modus-switch`),
  `components/toekomst/instellingen/instellingen-katern`, `components/editorial/katern-koppen`.

### 1.3 Route, redirects, navigatie en UAT

- `app/(app)/toekomst/redirect-guard.test.ts`: `resolveTabRedirect` voor `?tab=` (importeert
  `./page`; verhuist met de redirect-guard naar de katern-layout).
- `app/(app)/toekomst/instellingen/page.titel.test.ts` (stroom B, hernoemd van gebeurtenissen).
- `next.config.test.ts`: legacy `/horizon/**`, `/toekomst/{whatif,strategie,uitgaven-na-pensioen}`
  en (stroom B) `/toekomst/{voorkeuren,gebeurtenissen}` → `/toekomst/instellingen`.
- `lib/horizon/deeplink-cleanup.test.ts`: de URL-opschoning blijft op de huidige route (UR2-11).
- `lib/nav-config.test.ts`, `lib/nav-config.route-coverage.test.ts`,
  `components/app/shell/tab-root-topbar-title.test.ts`, `lib/page-info-content.test.ts`,
  `lib/command-palette/navigation-index.apps.test.ts`, `lib/widget-catalog.test.ts`.
- Deeplink-gebruikers: `lib/welcome-guide.test.ts`, `components/app/fin/fin-home.test.tsx`,
  `components/overview/rondleiding/rondleiding-overlay.test.tsx`, `components/future/doelen-view.test.tsx`
  (`/toekomst#verken-je-aannames`).
- UAT-definities: `lib/uat/acceptance/toek.ts` + `toek-checks.ts` (getoetst door
  `toek.engine.test.ts`) en `lib/uat/flows/toek.ts` (`toek.test.ts`).
- Rekenkern onder /toekomst (niet geraakt door de refactor, wel meegedraaid): `lib/horizon/*.test.ts`
  (74 bestanden), `lib/plan-review/*.test.ts`, `lib/hooks/use-horizon-fire-sim.refining.test.ts`.

---

## 2. Vangnet-commando's

Vitest **alleen via de PowerShell-tool** (onder Git Bash faalt elke suite met
`Vitest failed to find the current suite`). Paden zijn vitest-filters (substring-match).

### 2.1 Na élke extractiestap (±9 s; gemeten 30 bestanden / 338 tests)

```powershell
npx vitest run components/app/horizon/horizon-client. lib/horizon/toekomst-deeplinks lib/horizon/toekomst-blokken lib/horizon/deeplink-cleanup "app/(app)/toekomst" next.config.test.ts lib/nav-config components/app/shell/tab-root-topbar-title lib/page-info-content lib/uat/acceptance/toek lib/uat/flows/toek
```

Plus de testbestanden van élk component dat je in die stap verplaatst of aanraakt
(bv. `components/app/horizon/lab-knoppen`). Verhuist een bron-scan mee (spec §9: één
invariant, één bestand), vervang dan `components/app/horizon/horizon-client.` door het nieuwe
pad, en tel na: het aantal `it(...)` uit de 17 bron-scans mag niet dalen.

### 2.2 Na elke katern (canvas → plan → doelen → instellingen) (±84 s; 254 bestanden / 3509 tests)

```powershell
npx vitest run components/app/horizon components/future components/toekomst components/editorial/katern-koppen components/editorial/page-verdict-opening "app/(app)/toekomst" lib/horizon lib/plan-review lib/nav-config next.config.test.ts lib/uat/acceptance/toek lib/uat/flows/toek lib/page-info-content components/app/shell/tab-root-topbar-title lib/command-palette/navigation-index lib/widget-catalog lib/welcome-guide lib/hooks/use-horizon-fire-sim components/overview/rondleiding/rondleiding-overlay components/app/fin/fin-home
npx tsc --noEmit
```

### 2.3 Gates (per katern en vóór de commit)

| Gate | Stand 26 sep (gemeten) | Wat er in fase 1 hoort te gebeuren |
|---|---|---|
| `npm run check:headings` | ✓ 29 bestanden op de afbouwlijst, 0 nieuwe | RESIDUE krimpt (de h1 in horizon-client verdwijnt); een opgeloste entry die blijft staan maakt de gate rood. |
| `npm run check:client-reads` | ✓ 39 bekende client-readers, 0 nieuwe | `loadData()` wordt `router.refresh()`; de horizon-client-entry verdwijnt uit de ALLOWLIST; nieuwe bestanden mogen niet op de lijst. |
| `npm run check:overlays` | ✓ 71 bekende afwijkingen, 0 nieuwe | Het legacy Event Form Modal verdwijnt; geen nieuwe hand-rolled overlays. |
| `npm run check:tap-targets` | ✓ 59 bekende afwijkingen, 0 nieuwe | Geen nieuwe afwijkingen (katern-koppen ≥ 44 px). |
| `npm run page-info:check` | ✓ geen wijziging nodig | Nieuwe sleutel `/toekomst/instellingen`, verouderde teksten (spec §2.5). |
| `npm run uat:stale -- --base=origin/master` | niet gedraaid (hangt aan de diff) | TOEK-17/24/25/26/28/30 via `uat-docs-keeper`. |

---

## 3. Gaten en de characterization-tests die ze dichten

### 3.1 Wat door géén test gedekt werd

1. **Het deeplink-contract van /toekomst.** `deeplink-cleanup.test.ts` toetst alleen de
   opschoning; zijn "dekt precies de params die het mount-effect leest" vergelijkt een
   hardgecodeerde lijst met zichzelf. Niets toetste dat `?modal=`, `?event=`, `?whatif=open`,
   `?uitgaven=open`, `?strategie=open` of `?planreview=open` door de route wordt gelezen, of dat
   elke link die de app zelf uitstuurt een sleutel gebruikt die de route kent.
2. **De aanwezigheid en volgorde van de blokken.** Geen test pinde dát de grafiek, het lab, de
   levensinkomenstrook enz. nog op /toekomst staan, of in welke volgorde.
3. **Openen en sluiten van modals op de pagina zelf.** De sheets hebben eigen tests
   (`horizon-year-details-sheet`, `doel-vastleg-sheet`, `stop-plan-confirm` …), maar de koppeling
   knop → state → sheet in horizon-client heeft geen test. Niet gedicht: renderen van het hele
   component is te zwaar; het contract (gap 1) dekt de deeplink-ingangen en de inventaris
   (gap 2) dat de sheets nog gerenderd worden. Blijft een visueel punt (§4).
4. **`#verken-je-aannames`** (het anker uit `doelen-view.tsx`): alleen de href is getest, niet
   dat er op /toekomst een element met dat id staat. Gedeeltelijk gedekt: de inventaris eist
   `<LabKnoppen>`, niet het id. Visueel punt (§4).
5. **Scroll-landing van `?whatif=open`.** Er is geen test voor, en hij werkt vandaag ook niet
   (zie §3.3).

### 3.2 Nieuwe tests (groen op de huidige code, en ze bijten)

Beide toetsen op de **route**, niet op een bestand: `lib/test-utils/route-import-graph.ts`
berekent welke modules de `page.tsx`/`layout.tsx` onder `app/(app)/toekomst` laden
(`import`, `export … from`, `import()`; alleen `app/` en `components/`, geen tests).

**`lib/horizon/toekomst-deeplinks.contract.test.ts`** (13 tests)
- Contracttabel voor de root-route: `whatif=open`, `strategie=open`, `uitgaven=open`,
  `event=new|<id>` (+ `edit=true`), `modal=scenarios|simulations|withdrawal|backtesting|strategie|life_events`,
  `planreview=open`, `tab=doelen|gebeurtenissen|voorkeuren|rekenhulp`.
- Per sleutel: een module van de exacte /toekomst-route (page/layout en route-groepen
  `(…)`) leest hem met `.get('…')` en kent elke waarde, **of** `next.config.ts` heeft een
  redirect `source: '/toekomst'` met een `has`-query op die sleutel. Stroom B mag dus
  doorsturen (`?whatif=open` → `/toekomst/doelen`); een dode link wordt rood.
- `edit` wordt door dezelfde module gelezen als `event` (tenzij event doorgestuurd wordt).
- Alle client-sleutels behalve `tab`/`planreview` staan in `CONSUMED_DEEPLINK_PARAMS`.
- Elke letterlijke `/toekomst?…` of `/horizon?…` in `app/`, `components/`, `lib/` en
  `next.config.ts` (geen tests, geen UAT, niet de fase-0-mockup) valt binnen het contract.
- Bijt-proef (tijdelijke kopieën, daarna verwijderd): waarde `whatif=dicht` toegevoegd → 1 rood
  ("de lezer kent deze waarde niet"); route-graaf naar `/toekomst/rekenhulp` → 9 rood ("dode
  deeplink"); `simulations` uit het contract → 1 rood met de twee uitstuurplekken in
  `lib/widget-catalog.ts`.

**`lib/horizon/toekomst-blokken.inventaris.test.ts`** (26 tests)
- Inventaris: `AnkerDrieslag`, `LifelineReadout`, `SimChart`, `WealthCompositionChart`,
  `IncomeExpenseChart`, `EventsTimeline`, `PhaseBar`, `LabKnoppen`, `WhatIfMarketAssumptions`,
  `LabOpslaanBalk`, `LevensinkomenStrook`, `Dekkingsradar`, `ScenarioKaarten`,
  `HouseholdFireSection`, `HorizonTrendGrid`, de sheets `DoelVastlegSheet`,
  `HorizonYearDetailsSheet`, `EventPane`, `PlanReviewProvider` en de views `DoelenView`,
  `VoorkeurenView`, `GebeurtenissenView`, `AfbouwOverzichtCard` worden elk gerenderd door een
  module van de /toekomst-routes. `<SimChart>` telt niet via de dashboard-widget of de
  grafiek-uitleg.
- Volgorde: staan twee blokken in hetzelfde bestand, dan in de render-volgorde van vandaag
  (lijst hierboven). Blokken die uit elkaar gaan, leggen elkaar niets op.
- Bijt-proef: `SimChart` en `PhaseBar` in de lijst verwisseld → rood met de twee
  omgekeerde paren; een niet-bestaand blok → rood; horizon-client uitgesloten als
  SimChart-host → rood ("staat nergens meer op /toekomst").
- Bewuste latere wijzigingen: fase 4 verhuist `ScenarioKaarten` naar Doelen, fase 5
  `HorizonTrendGrid` naar /overzicht (dan uit de inventaris halen).

Uitvoer (PowerShell, 26 sep):

```
npx vitest run lib/horizon/toekomst-deeplinks.contract.test.ts
 Test Files  1 passed (1)
      Tests  13 passed (13)
npx vitest run lib/horizon/toekomst-blokken.inventaris.test.ts
 Test Files  1 passed (1)
      Tests  26 passed (26)
```

### 3.3 Waarnemingen tijdens de baseline (niet opgelost; geen productiecode geraakt)

- **`?whatif=open` scrollt niet naar het doelscenario.** Op 390 en 1280 px: de URL wordt
  opgeschoond, maar de pagina blijft bovenaan (`main.scrollTop` 0, acht keer gemeten over
  5,6 s). Het effect op r. 2210 scrollt `verkenSectionRef` na 120 ms; de sectie staat er dan
  mogelijk nog niet, of een latere render zet de scroll terug. Dit is het gedrag dat de
  redirect naar `/toekomst/doelen` in fase 1 vervangt; wie het wil bewaren, moet het eerst als
  defect behandelen (`bug-fix`).
- De kop zegt "Je toekomstplan is *haalbaar*." terwijl de KPI "We missen gegevens" toont en
  de Marktcheck zegt "Stop je op je 94e, dan houdt je plan het niet". Het testaccount heeft
  geen geboortedatum/inkomen ingevuld; de baseline toont dus een onvolledig profiel.
- Next-dev toont "1 Issue" linksonder (dev-overlay).

---

## 4. Visuele checklist na de routeswitch

Baseline-schermen staan in de scratchpad van stroom T
(`…/scratchpad/baseline-fase1/`, niet in git). Account "Regressie Tester" (superadmin), weergave
niet omgezet, browserzoom op 90 % gecompenseerd zodat het CSS-venster exact 1280×720 resp.
390×844 is. De "Tip van Fin"-kaart is op de eerste schermen zichtbaar en daarna met een
DOM-stijl verborgen (niet weggeklikt: dat is een accountvoorkeur). De dev-server herlaadde
tijdens de opnames een paar keer door schrijfwerk van stroom B; de desktop-opnames van /toekomst
tonen daarom al de nieuwe zijbalk (Doelen · Instellingen · Rekenhulp), die van
Voorkeuren/Gebeurtenissen nog de oude.

Baseline-tellingen:
- **Interactieve elementen boven de grafiek** (in `main`, zichtbaar, geen geneste): **25** op
  1280 px, **26** op 390 px (extra: de "we missen gegevens"-knop in de mobiele hero). Het zijn:
  pagina-i; 4 navkaarten × (link + "Toon detail") = 8; Tips; Details; 3–4 KPI-knoppen
  (Vrijheidsleeftijd, Doelbedrag, Opnamerate, Na pensioen); "Vul profiel aan"; 6 laag-pills
  (Scenario's, Marktcheck, Wat-als, Levensgebeurtenissen, Natuurlijke mijlpalen, Afspelen);
  Pad/Opbouw; "Hoe lees je deze grafiek?". De spec noemde ±28; doel na fase 2 is ≤ 6.
- **Meldingen zichtbaar op /toekomst**: statuspunten in de TopBar; oranje stip op de navkaart
  "Je voorkeuren voor je plan instellen" ("5 stappen nog niet bevestigd"); de profielmelding
  "Vul je geboortedatum, inkomen en bestedingen aan"; het lab-woord "reikt niet" en
  "Nog niet opgeslagen"; de Fin-tip ("Ontdek wanneer je vrij kunt zijn"). Geen
  pagina-statusbanner. Op Voorkeuren, Gebeurtenissen en Doelen alleen de Fin-tip en de
  meldingsbadge.
- **Sectievolgorde op /toekomst**: kop "Je toekomstplan is haalbaar." → 4 navkaarten → Horizon-
  eyebrow + Tips → I "Waar je staat" (Details, KPI-strip, voortgangsbalk, profielmelding,
  laag-pills, levenslijn-uitlezing, grafiek, "Inkomen & Uitgaven" ingeklapt, fasebalk) →
  doelscenario "Wanneer kun je stoppen?" (weergave-schakelaar, vijf knoppen, "Rendement per
  categorie" ingeklapt, opslaan-balk, voetnoot) → III "Wat het betekent" (levensinkomenstrook,
  dekkingsradar) → Gezondheidsverloop · FIRE-verloop (ingeklapt) → voet. Het lab staat sinds
  ADR 0170 altijd open; er is geen aparte "uitgeklapte" stand.

Na de routeswitch naast de baseline leggen (390 en 1280 px):

- [ ] `/toekomst` (Plan): kop, meldingenslot, canvas, katern-koppen; de navkaarten en de dubbele
      kop zijn weg, verder dezelfde blokken als in `toekomst-*-02/03/04/06/07`.
- [ ] Tel de interactieve elementen boven de grafiek opnieuw (baseline 25/26).
- [ ] `/toekomst/doelen`: het lab (`toekomst-1280-03`, `toekomst-390-05`) staat nu hier, met
      daaronder de bestaande Doelen-inhoud (`doelen-*-01`).
- [ ] `/toekomst/instellingen`: Voorkeuren (`voorkeuren-*`) en Gebeurtenissen
      (`gebeurtenissen-*`) gestapeld, wizard-ingang erboven; niets van beide verdwenen.
- [ ] Marktcheck-pill aan: de uitlegtekst en de band verschijnen zoals in `*-marktcheck`.
- [ ] Details-knop opent "Simulatie Prognose / Zo werkt jouw grafiek" (`*-modal-details`);
      Escape sluit, de pagina blijft staan.
- [ ] `?event=new` opent "Levensgebeurtenis toevoegen" (`toekomst-1280-08`) en de URL wordt
      opgeschoond.
- [ ] `?whatif=open` en `/toekomst#verken-je-aannames` landen op `/toekomst/doelen`.
- [ ] `?modal=strategie|withdrawal|life_events`, `?strategie=open`, `?uitgaven=open`,
      `?planreview=open`, `?tab=doelen|voorkeuren|gebeurtenissen|rekenhulp`: elk opent het
      paneel of de route uit de contracttabel in §3.2.
- [ ] `/toekomst/voorkeuren` en `/toekomst/gebeurtenissen` redirecten, query en hash mee.
- [ ] Katern wisselen: de grafiek blijft gemonteerd (geen herlaad, geen sprong).
- [ ] Eenvoudig en Volledig; euro-weergave aan en uit (bedragen één keer gedeeld).
- [ ] Tel per scherm de vrijheidsleeftijd (baseline: de KPI-tegel; de kop draagt vandaag het
      oordeel, niet de leeftijd).
- [ ] Opslaan-balk in Doelen staat boven de nav-pill (390 px).
