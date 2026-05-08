# Backlog-features uit Boldin-review (2026-05-08)

**Bron**: `docs/reviews/external-boldin-2026-05-08.md`
**Categorie voor allen**: `Inspiratie - Boldin`
**Status**: Lijst klaar voor handmatige import — `feature_create` MCP-tool niet beschikbaar in review-sessie.

Format conform CLAUDE.md: `{ category, name, description, steps[] }`. Tier 1 = hoog-impact direct overneembaar, Tier 2 = aanpassing nodig, Tier 3 = lange-termijn inspiratie. Per feature is een **Implementatie in TriFinity**-blok toegevoegd dat in gewone bewoording uitlegt waar het past, welke data we hebben, wat het oplevert voor de gebruiker, hoe het er visueel uitziet, en of het overlapt met bestaande functionaliteit.

---

## Tier 1 — Hoog-impact, direct overneembaar

### 1. Sankey income/outflow visualisatie met year-slider

- **category**: Inspiratie - Boldin
- **name**: Sankey-visualisatie van income → outflow per jaar (scrubbable)
- **description**: Voeg een Sankey-diagram toe dat geld-stromen visualiseert: inkomsten-categorieën links (loon, dividend, pensioen) → uitgaven-categorieën rechts (wonen, gezondheidszorg, belasting, sparen). Met year-slider om door de levensloop te scrubben. Boldin's "First Aha Moment" — hét visualisatie-momentum-moment.
- **steps**:
  1. Onderzoek Sankey-libraries (D3-sankey, recharts-extension, of custom SVG)
  2. Definieer node-categorieën: income-sources uit `lifeEventsToCashflows` + uitgaven-buckets uit `computeRetirementExpenses`
  3. Bouw `<SankeyDiagram>` component met `year` prop
  4. Year-slider die `runSimulation` results per jaar feed
  5. Animatie tussen jaren (transitie tussen flow-widths)
  6. Hover op flow → highlight van die source/destination
  7. Plaats als hero in `/horizon/uitgaven-na-pensioen` of nieuwe widget

**Implementatie in TriFinity**

*Waar*: nieuw component `<SankeyDiagram>` in `components/app/horizon/`. Past als hero op `/horizon/uitgaven-na-pensioen` (route bestaat al), of als grote widget op `/horizon`. Voor desktop full-width, voor mobile single column zonder verlies van leesbaarheid.

*Welke data*: per-jaar resultaten uit `runSimulation`, met inkomsten uit `lifeEventsToCashflows` (loon, AOW, pensioen, dividend) en uitgaven uit `computeRetirementExpenses` (woon, zorg, belasting, sparen, overig). Geen nieuwe database-velden nodig — alles ligt al in de simulatie-output.

*Waarde voor de gebruiker*: één blik laat zien waar geld vandaan komt en waar het heen gaat. Door het schuiven van de slider zie je hoe de "Werk"-balk verdwijnt en de "Pensioen + Drawdown"-balk eronder opdoemt. Dit is het soort moment dat een abstracte FIRE-projectie tastbaar maakt.

*Hoe visueel*: Sankey met dikke gradiënt-flows in `--horizon-300` voor income-zijde en neutrale `--ink-3`-tinten voor expenses. Year-slider in `--horizon-500` onder het diagram. Hover op een flow toont een tooltip met categorie + bedrag + percentage. Kop in serif: "Hoe stroomt jouw geld?"

*Dubbeling met bestaande functie*: substantieel met `cash-flow-widget.tsx` (toont nu kale categorie-bars met percentages) en `wealth-composition-chart.tsx` (stacked area). Maar het zijn andere lenzen op dezelfde data — een Sankey toont **flows** terwijl de bestaande widgets **balansen** of **totalen** tonen. Niet vervangen, maar toevoegen als nieuwe lens. Geen overlap met `income-expense-chart.tsx` want die toont aggregaten over tijd, niet één-jaar-flows.

---

### 2. Two-line "What you have" vs "What you need" met area-fill

- **category**: Inspiratie - Boldin
- **name**: Have-vs-Need FIRE projectie als hero-chart
- **description**: Twee-lijn chart op `/horizon`: groene "Wat je hebt" (vermogenspad uit `runSimulation`) vs rode "Wat je nodig hebt" (FIRE-doel volgens `computeFireProjection`). Area-fill in groen waar have > need (overschot). Direct visuele "ben ik op koers?".
- **steps**:
  1. Hergebruik bestaande `computeFireProjection` voor "need"-lijn
  2. Hergebruik `runSimulation` portfolio-projectie voor "have"-lijn
  3. Bouw `<HaveVsNeedChart>` component met area-fill via gradient
  4. Y-axis tot max(have, need) * 1.1
  5. Toon dot-markers per jaar voor interactie
  6. Plaats als hero op `/horizon` direct onder titel
  7. Bij FireEndStrategy `deplete` dipt "need"-lijn naar 0 op longevity-leeftijd

**Implementatie in TriFinity**

*Waar*: hero-chart op `/horizon` direct onder de titel, vóór de bestaande widget-grid (of als prominente widget in een widget-catalog-entry). Past ook op `/horizon/strategie` als visualisatie van de gekozen FIRE-strategie.

*Welke data*: alle data is er al. De "have"-lijn komt uit `runSimulation` portfolio-pad, de "need"-lijn uit `computeFireProjection` of `computeFireRange`. Beide functies bestaan in `lib/horizon-data.ts` en `lib/fire-simulation.ts`. Geen schema-wijziging.

*Waarde voor de gebruiker*: deze grafiek beantwoordt in één blik de hoofdvraag van iedere FIRE-zoeker: "Ben ik op koers?". Wanneer "have" boven "need" loopt en de groene zone groeit, weet je: ja. Loopt "have" eronder, dan zie je meteen waar de pijn-jaren zitten. Cijfers zijn secundair — de visuele afstand tussen de lijnen is het verhaal.

*Hoe visueel*: twee lijnen met dots per jaar, area-fill via SVG-gradient — groen tussen de lijnen waar have > need, lichte rode tint waar need > have. Gebruik `--positive` en `--negative` van fintwo's design-tokens. Y-axis met fintwo's `formatCurrency`. Bij FIRE-strategie "deplete" dipt de need-lijn naar nul op longevity-leeftijd — dat is een visueel sterk eindbeeld.

*Dubbeling met bestaande functie*: `fire-prognose-widget.tsx` toont een FIRE-leeftijd, `vrijheidsvoortgang-widget.tsx` een percentage, `sim-vermogenspad-widget.tsx` het pure vermogenspad. Geen huidige widget toont **need-lijn naast have-lijn met area-fill**. Dit is dus echt nieuw als visualisatie. Het kan bestaande widgets vervangen óf naast hen leven als hero-versie. Aanbeveling: vervang `vrijheidsvoortgang-widget` als hero op /horizon — het percentage is minder rijk dan deze visualisatie.

---

### 3. "Wat als ik..." pre-built scenario-toggles

- **category**: Inspiratie - Boldin
- **name**: Pre-built what-if explorer met radio-toggles
- **description**: Nieuwe pagina (of tab op `/horizon/whatif`) met 6 voorgebakken what-ifs als radio's: "Stop 3 jaar eerder met werken", "Spaar 5% meer", "Leef 5 jaar langer", "Onverwachte uitgave €25k", "Erfenis van €50k". Toggle update een chart die baseline + scenario side-by-side toont. Plus "Maak hier een echt scenario van"-CTA.
- **steps**:
  1. Definieer 6 what-if archetypes met parametrische definities
  2. Bouw `<WhatIfToggle>` radio-component
  3. Compute baseline + scenario via `runSimulation` met aangepaste cashflows
  4. Side-by-side bar chart met `<DualBarChart>` of stacked
  5. Voor elke toggle: actionable "next step" tekst
  6. CTA-knop "Maak hier een vol scenario van" → leidt naar `/horizon/vrijheidsscenarios` met pre-filled state
  7. Plaats als nieuwe pagina `/horizon/wat-als` met segment-control voor toggles

**Implementatie in TriFinity**

*Waar*: redesign van de bestaande `/horizon/whatif`-pagina. Boldin's pattern is "toggle-first, slider-later" — dus het entry-scherm wordt 6 grote radio-cards bovenaan; de huidige sliders verhuizen naar een "Verfijn"-tabblad of accordion-sectie eronder.

*Welke data*: alles is er al. `whatif-overrides.ts`, `lifeEventsToCashflows`, `runSimulation`, en `WhatIfPresets`-component bestaan. We mappen de 6 Boldin-archetypes naar bestaande `WhatIfOverrides`. Geen nieuwe library of berekeningen.

*Waarde voor de gebruiker*: vandaag landt de gebruiker op /horizon/whatif en ziet meteen sliders — dat is technisch maar drempelhoog. Met toggle-first kies je een vraag ("Ik wil eerder stoppen") en ziet meteen impact. Sliders zijn er voor wie verder wil verfijnen, niet om mee te beginnen.

*Hoe visueel*: 6 cards in 2x3 grid bovenaan met icoon + titel + één-zin uitleg. Geselecteerde card heeft groene `--horizon-500` border. Onder de cards: side-by-side dual-bar chart die baseline (donker `--horizon-700`) en scenario (licht `--horizon-300`) tegelijk toont. Onder de chart: actionable "next step"-zin met CTA naar scenario-aanmaak.

*Dubbeling met bestaande functie*: zeer groot. fintwo heeft al `WhatIfPresets` (`components/app/horizon/whatif-presets.tsx`) met 6+ presets (part-time, raise, frugal, fire-sprinter, sabbatical, etc.) — dezelfde categorieën die Boldin gebruikt. Plus `WhatIfSliders`, `WhatIfChat`, `WhatIfScenarios`, `WhatIfActions`, `WhatIfEvents`. **Dit is geen nieuwe feature maar een redesign-ticket**: "Herorder de what-if-pagina zodat presets de hero zijn, sliders het verfijn-niveau, en de scenario-aanmaak-CTA explicieter".

---

### 4. Insights Library als vraag-gedreven entry

- **category**: Inspiratie - Boldin
- **name**: Horizon herinrichten als Insights Library
- **description**: Vervang de huidige `/horizon` landing met een gallery van vraag-gedreven cards. Elk card heeft een vraag als titel ("Wanneer ben ik FIRE?", "Hoe stevig is mijn portefeuille?", "Wat als de markt crasht?") en een mini-thumbnail van de echte chart van die gebruiker. Categorisering: "Net Vermogen", "Vrijheidstijd", "Risico", "Belasting".
- **steps**:
  1. Inventariseer alle bestaande Horizon-widgets en mappen naar vragen
  2. Bouw `<InsightCard>` met live mini-chart (gerenderd via dezelfde data als full-chart)
  3. Categorisering: maak `INSIGHTS_CATEGORIES` constant
  4. Pagina-layout: top "Featured" insight + categorie-sections met grid
  5. Overweeg: behoud van bestaande Horizon-routes voor deeplinks
  6. Vervang huidige `/horizon/page.tsx` content met `<InsightsLibrary>`
  7. Migration-strategie: feature-flag `horizon_v2_library`

**Implementatie in TriFinity**

*Waar*: vervangt de huidige `/horizon/page.tsx` (server-component die `loadHorizonData` aanroept en `<HorizonClient>` rendert). De widget-grid in `<HorizonClient>` wordt vervangen door een vraag-gedreven gallery. Alle bestaande routes (`/horizon/whatif`, `/horizon/strategie`, `/horizon/uitgaven-na-pensioen`, `/horizon/doorrekening-test/*`) blijven als deeplink-targets.

*Welke data*: hergebruik van bestaande `loadHorizonData` en `DashboardData`-bundle. Voor mini-thumbnails: render compacte versies van bestaande widgets (ze ondersteunen al `size: 'mini' | 'quarter' | 'half' | 'full'`). Mapping van vragen naar bestaande Horizon-widgets in een `INSIGHTS_CATALOG` constant.

*Waarde voor de gebruiker*: vandaag toont /horizon een widget-grid met technische namen — "Vrijheidsmijlpalen", "Sim Vermogenspad", "Backtesting Score". Voor nieuwe gebruikers is dat ondoorzichtig. Met vraag-cards ("Wanneer ben ik vrij?", "Wat als de beurs crasht?") kiest een gebruiker op basis van *intentie*. Discoverability springt omhoog.

*Hoe visueel*: vragen in `font-serif` als titel-kop. Live mini-chart-thumbnail (de daadwerkelijke widget in mini-modus, niet een statische afbeelding). Kleine caption met module-link ("→ Vermogenspad"). Categorie-headers in subtiele paragraph-stijl ("Wanneer", "Hoeveel", "Wat als", "Risico"). Featured-block bovenaan met grotere preview en korte uitleg. Gebruik `--horizon-50` als achtergrond voor categorie-secties, witte kaarten met fintwo's standaard border-styling.

*Dubbeling met bestaande functie*: vervangt huidig `/horizon` landing — maar gebruikt alle bestaande widgets als bouwstenen. Niet écht dubbeling, eerder herstructurering. Wel risico: als auto-dashboard (`auto-dashboard-builder.ts`) en Horizon allebei widget-gridded zijn, krijg je twee gelijksoortige overzichten. Aanbeveling: laat dashboard de "alles op één plek"-modus zijn, en Horizon de "vraag-gedreven verdieping".

---

### 5. Persoonlijke milestones-tijdlijn in 2e persoon

- **category**: Inspiratie - Boldin
- **name**: Milestones-tijdlijn met editorial copy in 2e persoon
- **description**: Tijdlijn-component die life-events toont als persoonlijke verhalen: "Vandaag — 45 jaar — Je bouwt aan je vermogen", "2034 — 53 jaar — Je hypotheek is afbetaald 🎉", "2046 — 65 jaar — Je gaat AOW ontvangen — €1.450/maand", "2068 — 87 jaar — Je hebt je geplande levenseinde bereikt".
- **steps**:
  1. Map levensgebeurtenissen uit `lib/horizon-data.ts` naar persoonlijke event-types
  2. Schrijf editorial copy templates per event-type ("Je hypotheek is afbetaald", "Je gaat AOW ontvangen")
  3. Bouw `<PersonalMilestonesTimeline>` component
  4. Layout: links datum + leeftijd, rechts kop + paragraaf
  5. Iconografie subtiel (geen decoratieve emoji-overload — passend bij editorial-finance)
  6. Plaats op `/horizon/levensgebeurtenissen` of `/identity` overzicht
  7. Test met edge cases: geen events, zeer veel events (50+)

**Implementatie in TriFinity**

*Waar*: nieuw component `<PersonalMilestonesTimeline>` in `components/app/horizon/`. Plaatsbaar als hero of sectie op een nieuwe `/horizon/levensloop`-pagina, of binnen `/identity` als langere narrative-sectie. Zou ook deel kunnen worden van het toekomstige Identity-overzicht.

*Welke data*: combineer drie bronnen die er al zijn — `LifeEvent[]` uit Supabase (`is_active = true`), AOW-leeftijd via `lookupAowAge` uit `lib/aow-leeftijd.ts`, en de afgeleide mijlpalen uit `lib/freedom-milestones.ts` (FIRE 25%, 50%, 75%, 100%). Voeg ook hypotheek-einddatum toe (uit debt-data) en pensioen-leeftijd (uit profile). Sorteer chronologisch.

*Waarde voor de gebruiker*: vandaag staat dit alles als losse data-records — een hypotheek-eind in /core/debts, een life-event in /horizon, een AOW-leeftijd in /identity. De gebruiker zelf moet deze verbanden mentaal leggen. Een editorial timeline in tweede persoon ("Je hypotheek is afbetaald", "Je gaat AOW ontvangen") maakt het *jouw verhaal*, niet een lijst data-punten.

*Hoe visueel*: vertical timeline met links datum + leeftijd in `font-mono tabular-nums text-[var(--ink-3)]`, rechts kop in `font-serif text-[var(--ink)]` + paragraaf in `text-[var(--ink-2)]`. Subtiele icoontjes per event-type (huis voor hypotheek-einde, document voor AOW, bergtop voor FIRE 100%) — geen decoratieve emoji-overload. Past bij fintwo's editorial-finance design.

*Dubbeling met bestaande functie*: deels overlap met `levensgebeurtenissen-widget.tsx` (toont life-events als kale event-cards op dashboard) en `vrijheidsmijlpalen-widget.tsx` (FIRE %25/50/75/100). Niet vervangen — die widgets zijn dashboard-friendly mini-vormen. De timeline is een **full-page narrative**-vorm met meer copy en meer events. Beide kunnen naast elkaar leven: dashboard-widget als signpost, full timeline als verhaal-pagina.

---

### 6. Plan Completion gamification

- **category**: Inspiratie - Boldin
- **name**: Plan Completion overzicht met sectie-progress
- **description**: Hero-card op `/identity` overzicht: "Je profiel is X van Y secties compleet". Onder een grid met 7 secties (Gegevens, Bezittingen, Schulden, Inkomsten, Uitgaven, Doelen, Koppelingen) waarvan elk laat zien hoeveel velden gevuld zijn.
- **steps**:
  1. Definieer 7 plan-secties en de "complete"-criteria per sectie
  2. Bouw `<PlanCompletionHero>` met percentage + grote teal card
  3. Bouw `<SectionProgressCard>` met X-of-Y indicator + chevron-link
  4. Computation server-side in `loadIdentityOverviewData`
  5. Plaats op `/identity` overzicht boven de huidige content
  6. Edge case: 100% complete → toon viering ipv card

**Implementatie in TriFinity**

*Waar*: hero-card op `/identity/page.tsx` overzicht, boven de bestaande temporal balance + chronologische schaal. Past ook als entry-point voor `/identity/voortgang` (die nu redirect naar /identity).

*Welke data*: uitbreiding van `loadIdentityOverviewData` (in `lib/identity-data-loader.ts`). Voor elke van 7 secties: definieer een "complete"-criterium. Voorbeelden — Bezittingen: ≥1 asset toegevoegd; Inkomsten: `monthly_income` of inkomstenstroom ingevuld; FIRE: `expected_return + inflation_rate + retirement_age` ingevuld; Koppelingen: ≥1 actieve verbinding. Geen schema-wijziging, alleen aggregatie van bestaande velden.

*Waarde voor de gebruiker*: nieuwe gebruikers vragen zich af "ben ik klaar?". fintwo heeft nu geen overkoepelend overzicht — als `monthly_income` niet ingevuld is, ontdekt de gebruiker dat pas wanneer een widget leeg blijft. Een progress-overview maakt expliciet wat er nog ontbreekt en geeft een gevoel van vooruitgang.

*Hoe visueel*: groot teal-card (`--horizon-700` background, witte tekst) met percentage in serif: "5 van 7 secties klaar — 71%". Daaronder een grid van 7 sectie-cards met progress-indicator (bijv. progress-ring of klein staaf-bar) en chevron-link naar de bewerkpagina. Bij 100% compleet: vervang het percentage-card door een viering-graphic of subtiele tekst "Plan compleet — focus op groei".

*Dubbeling met bestaande functie*: deels — `koppelingen` heeft een eigen progress-indicator, `gids` heeft `GuideProgressBar`, en de auto-dashboard-builder heeft een impliciete "compleet als > X widgets"-logica. Maar geen overkoepelend completion-overzicht. **Risk**: als deze hero te veel push geeft, voelt het als nag-screen. Aanbeveling: verstop de card als 100% compleet, en behoud subtiele toon ("Nog 2 stappen om je plan compleet te maken").

---

## Tier 2 — Aanpassing voor fintwo

### 7. Financial Wellness Scorecard met emoji-status-categorieën

- **category**: Inspiratie - Boldin
- **name**: Vermogen-wellness scorecard met 5 status-buckets
- **description**: Gamified dashboard van metrics per categorie. Status-buckets met emoji's: 😊 Op koers (X), 🙂 Aandacht (Y), 😞 Risico (Z), ℹ️ Info (W), ∅ Geen data (V). Horizontale stacked bar als macro-overview, plus individueel bekijkbare metrics.
- **steps**:
  1. Definieer 19 metrics relevant voor NL: spaarquote, debt-to-income, woonquote, FIRE-voortgang, asset-allocatie, ...
  2. Per metric: drempelwaarden voor 5 status-niveaus
  3. Bouw `<WellnessScorecard>` met horizontale stacked bar
  4. Bouw `<MetricCard>` met emoji + value + status-pill
  5. Plaats op `/identity` overzicht of nieuwe `/identity/wellness`

**Implementatie in TriFinity**

*Waar*: nieuwe pagina `/identity/wellness`, of als sectie binnen `/identity` overzicht. Mogelijk ook een entry-point vanuit dashboard via een wellness-mini-widget.

*Welke data*: hergebruik en uitbreiding van bestaande `lib/financial-health.ts` met de 6-pillar `HealthScore` (Spaarquote, Schuldratio, Noodfonds, FIRE, Diversificatie, Budget). Boldin's pattern is een **uitbreiding** naar 19 metrics — voeg toe: woonquote, vaste-lasten-ratio, abonnementen-overzicht, beleggingsrendement, fee-ratio, koopkracht-projectie, en specifiek-NL items zoals AOW-gat, pensioenopbouw-tempo. Per metric: 5 drempelwaarden (Op koers / Aandacht / Risico / Info / Geen data).

*Waarde voor de gebruiker*: vandaag krijgt de gebruiker een 6-pillar score (0-100). Boldin's bucket-categorisering (5 status-niveaus met emoji's) is **vriendelijker en directer** — ipv "67 van 100" zie je "Op 11 metrics op koers, op 2 metrics aandacht nodig". Geeft prioriteit zonder schuld-toon.

*Hoe visueel*: horizontale stacked bar bovenaan met 5 segmenten kleur-gecodeerd via fintwo's tokens (`--positive` voor Op koers, `--ink-3` voor Aandacht, `--negative` voor Risico, een neutraal blauw voor Info, gestreept voor Geen data). Daaronder een rij van 5 categorie-cards met emoji + count. Detail-view: lijst van metrics per categorie. Emoji's vermijden zodat fintwo's editorial-finance toon niet kindlijk wordt — gebruik wellicht subtiele icoontjes (✓, !, ✗, ℹ, ∅) of de emoji's slechts in labels.

*Dubbeling met bestaande functie*: zeer groot met `gezondheids-score-widget.tsx` en `lib/financial-health.ts` (6-pillar `HealthScore`). Aanbeveling: **uitbreiden van bestaand model** — niet nieuw bouwen. Laat `HealthScore` blijven als macro-getal, en voeg een `HealthScorecard` toe met 19 metrics die in dezelfde lib leven. De bestaande widget kan als compactor variant blijven; de nieuwe full-page is de detail-view.

---

### 8. Customizable Metric Watchlist

- **category**: Inspiratie - Boldin
- **name**: Persoonlijke metric-watchlist (max 19 uit library)
- **description**: Uitbreiding van bestaande `widget_prefs` zodat gebruikers een eigen wellness-watchlist kunnen samenstellen. Library met 19 metrics; gebruiker kiest welke ze willen volgen. Persisted via `/api/widgets`.
- **steps**:
  1. Schema-extension: `profiles.wellness_watchlist` jsonb
  2. API: `/api/wellness-watchlist` GET/PUT
  3. UI: `<MetricLibraryDrawer>` met grid van alle metrics + add/remove
  4. Sync met scorecard view

**Implementatie in TriFinity**

*Waar*: drawer/sheet op de `/identity/wellness`-pagina, geopend via "Pas aan"-knop in de scorecard. De gekozen metrics worden zichtbaar als kaarten op de hoofdpagina.

*Welke data*: nieuwe column `profiles.wellness_watchlist` (jsonb met `string[]` van metric-IDs). API-endpoint `/api/wellness-watchlist` met GET en PUT. Voorgekozen default-set bij nieuwe gebruiker: de 6 huidige `HealthScore`-pillars.

*Waarde voor de gebruiker*: niet elke gebruiker zorgt om dezelfde metrics. Iemand met afgeloste hypotheek heeft niets aan een hypotheek-quote. Iemand zonder kinderen geen interesse in studiekosten-buckets. Door de gebruiker zelf te laten kiezen wat ze volgen, wordt de wellness-pagina relevant en niet overweldigend.

*Hoe visueel*: drawer met grid van alle 19 metric-kaarten — checkbox per item, korte beschrijving. "Voeg toe"-actie checkt het item. Op `/identity/wellness`: gekozen metrics als kaarten in een grid, met een afsluitende "+"-card aan het einde voor "voeg meer toe". Volg fintwo's bestaande shell-overlay-pattern (`<ShellOverlay kind="sheet">`).

*Dubbeling met bestaande functie*: de bestaande `widget_prefs` in `profiles` is precies dit pattern voor dashboard-widgets. Hergebruik het code-pattern uit `lib/widget-catalog.ts` en `lib/auto-dashboard-builder.ts` — zelfde mechaniek, andere context (wellness ipv dashboard). Geen conflict, alleen pattern-replicatie.

---

### 9. Globale scenario-chip in topbar

- **category**: Inspiratie - Boldin
- **name**: Scenario-context als persistent topbar-chip
- **description**: Maak het actieve scenario zichtbaar op elke pagina via een chip in de header: "Je plan ▼ BASELINE". Dropdown om snel tussen scenarios te wisselen. Veranderingen in een scenario zijn dan zichtbaar in alle modules (Kern netwo, Horizon FIRE, etc.). Maak scenarios een werkmodus ipv een Horizon-feature.
- **steps**:
  1. Ontwerp scenario-context-provider in `app/(app)/layout.tsx`
  2. Persisted scenario-id in `sessionStorage` + URL-param
  3. Bouw `<ScenarioChip>` component voor `<AppHeader>`
  4. Aanpassing: alle data-loaders accepteren `scenarioId` param
  5. Feature-flag `scenario_global_context` voor gefaseerde uitrol

**Implementatie in TriFinity**

*Waar*: chip in `<AppHeader>` (oude shell) of `<Sidebar>` topbar (nieuwe shell achter `new_navigation_shell` flag). Past links van de profile-avatar of in het midden naast de module-tabs.

*Welke data*: bestaande scenario-typen uit `lib/scenario-types.ts`. Active scenario-id leeft in een nieuwe `<ScenarioContext>`-provider in `app/(app)/layout.tsx`. Data-loaders (`loadHorizonData`, `loadDashboardData`, etc.) krijgen optionele `scenarioId`-parameter; bij ontbreken vallen ze terug op baseline. Persisted in `sessionStorage` + URL-param zodat refresh werkt.

*Waarde voor de gebruiker*: vandaag zijn scenario's Horizon-only — als je Kern netto-vermogen of Wil checkin opent, ben je per definitie in baseline. Maar een scenario heeft potentieel impact op àl je modules: "wat is mijn netto vermogen in scenario FIRE-sprinter over 5 jaar?", "hoeveel zou ik in scenario Sabbatical maandelijks moeten checken-in?" Met een globale chip wordt scenario een werkmodus.

*Hoe visueel*: kleine chip in topbar met scenario-naam + chevron, dropdown met scenario-lijst + "Beheer scenario's"-link onderaan. Active state in `--horizon-700` (omdat scenario's primair een Horizon-concept zijn — kleur-anchored aan die module). Bij baseline: subtieler `--ink-3`, geen accent.

*Dubbeling met bestaande functie*: `WhatIfHeader` (`components/app/horizon/whatif-header.tsx`) is een lokale what-if-context, niet globaal. Dit is een grotere her-architectuur — alle data-loaders moeten `scenarioId` accepteren. Aanbeveling: begin **read-only chip** die alleen Horizon-data filtert (kleinste blast-radius), later uitbreiden naar Kern + Wil zodra de data-loader-architectuur het ondersteunt.

---

### 10. Surplus-Gap diverging bar chart

- **category**: Inspiratie - Boldin
- **name**: Surplus/Gap diverging bar widget
- **description**: Visualisatie van jaren waarin je toevoegt aan vermogen (positieve paarse bars boven 0) vs jaren waarin je intert (negatieve rode bars onder 0). Lifetime totalen in summary-box: "Saved Surplus €X / Funded Gap -€Y / Total €Z".
- **steps**:
  1. Compute per jaar: income - expenses uit `runSimulation` results
  2. Bouw `<SurplusGapChart>` met diverging bars rond 0-as
  3. Lifetime aggregaten in side-card
  4. Plaats als widget op dashboard (gating widget level 2+) of in `/horizon`

**Implementatie in TriFinity**

*Waar*: nieuwe widget `surplus-gap-widget.tsx` in `components/widgets/`, of als sectie op `/horizon/uitgaven-na-pensioen`. Voor dashboard: registreer in widget-catalog met level-gating (niveau 2+, want concept is iets gevorderder).

*Welke data*: per-jaar `income - expenses` uit `runSimulation`-output (`SimResult.rows`). Lifetime-totalen via simpele optelling (positieve som = saved surplus, negatieve som = funded gap). Geen schema-wijziging.

*Waarde voor de gebruiker*: een vermogenspad-lijn (al aanwezig) toont hoogte over tijd, maar niet welke jaren je netto bouwt en welke je netto teert. Een diverging-bar geeft direct visueel antwoord: "Tot 65 bouw je elk jaar op (paars), daarna teer je in (rood) tot longevity". Maakt de overgang van opbouw- naar afbouwfase zichtbaar.

*Hoe visueel*: bar chart rond 0-as, paarse bars boven 0 (positieve `--horizon-500` of `--positive`), rode bars onder 0 (`--negative` of `--ink-3` met rood-tint). Lifetime-totalen in een side-card naast of onder de chart: "Opgebouwd €X / Ingeteerd -€Y / Saldo €Z". Gebruik fintwo's `font-mono tabular-nums` voor bedragen.

*Dubbeling met bestaande functie*: gedeeltelijke overlap met `cash-flow-widget.tsx` (toont nu wel categorie-totalen maar niet diverging-per-jaar) en logica in `bucket-projection.ts` (drawdown-jaren). Specifieke surplus-vs-gap visualisatie is niet aanwezig in fintwo. Past goed naast bestaande widgets — voegt een lens toe.

---

### 11. Tax-allocation donut (Box 1/2/3 context)

- **category**: Inspiratie - Boldin
- **name**: Box-allocatie donut voor NL-fiscale context
- **description**: Donut-chart die laat zien hoe je vermogen verdeeld is over Box 1 (eigen huis), Box 2 (aanmerkelijk belang), Box 3 (sparen/beleggen). Inclusief belasting-projectie per box.
- **steps**:
  1. Map asset-types uit `ASSET_TYPE_LABELS` naar boxen
  2. Compute totals per box uit `useAssetsAndDebts`
  3. Bouw `<TaxAllocationDonut>` met percentages
  4. Side-card met box-tarief + projectie
  5. Plaats op `/core` als secundaire view

**Implementatie in TriFinity**

*Waar*: widget op `/core` (Kern landing) als sectie naast netto-vermogen, of als deeplink in `/identity/instellingen` Box-3 sectie.

*Welke data*: assets uit `loadAssetsAndDebts` (al aanwezig), met een nieuwe mapping per asset-type naar box. `eigen_huis` → Box 1, `aanmerkelijk_belang` → Box 2 (als asset-type bestaat — anders: optioneel veld op asset), `cash` + `investment` → Box 3. Voor Box-3-belasting hergebruik `BOX3_TARIEF` uit `lib/horizon-data.ts` en bestaande logica in `box3-data.ts`. Voor Box-1: hypotheek-aftrek via debts.

*Waarde voor de gebruiker*: NL-fiscale planning is vaak ondoorzichtig — je weet wel hoeveel vermogen je hebt, maar niet hoeveel daarvan in welk fiscaal regime. De donut maakt zichtbaar dat bv. €500k in Box 3 een Box-3-tarief draagt, maar dat afgelost-op-hypotheek (Box 1) andere fiscale dynamiek heeft. Relevant voor strategie-keuzes ("verhuis spaargeld naar woninglosing om Box 3 te verlagen").

*Hoe visueel*: donut in 3 segmenten met fintwo's `--horizon-200/500/700` voor de 3 boxen, totaal in het midden. Side-card met box-tarieven + jaarlijkse belasting-impact per box. Onder de donut: korte tekst-uitleg per box wat dit betekent fiscaal.

*Dubbeling met bestaande functie*: `belasting-box3-widget.tsx` toont Box-3-belasting, `box3-drag-widget.tsx` toont impact, `box3-data.ts` heeft de berekening. Geen huidige multi-box donut. Past naast bestaande Box-3 widgets als breder-perspectief view: niet vervangen, maar aanvullen.

---

### 12. "Tips voor deze grafiek"-sectie onder complexe charts

- **category**: Inspiratie - Boldin
- **name**: Pattern: "Tips voor deze grafiek" onder visualisaties
- **description**: Reusable patroon: onder elke complexe chart een sectie met 3-5 tips ("Let op het verschil tussen baseline en je scenario", "De spike in 2046 komt van je pensioenuitkering"). Proactief leren wat te zoeken in plaats van alles in tooltips verstoppen.
- **steps**:
  1. Bouw `<ChartTips>` reusable component
  2. Tips als string-array prop, of slot voor JSX
  3. Visueel: collapsible "Lees hoe deze grafiek werkt" met chevron
  4. Pas toe op: FIRE-projectie, backtest, vermogenspad, simulatie-grafieken

**Implementatie in TriFinity**

*Waar*: reusable component `<ChartTips>` in `components/editorial/` (de canonical editorial-library volgens je memory). Toepassen op de complexe Horizon-charts: FIRE-projectie, backtest, vermogenspad, simulatie-grafiek, Sankey, have-vs-need.

*Welke data*: tips als statische string-arrays, gedefinieerd per chart-type in een `lib/chart-tips.ts`-config. Geen runtime-data nodig.

*Waarde voor de gebruiker*: complexe charts zijn dood-zwijgend zonder uitleg — een gebruiker ziet de spike en denkt "wat is dat?". Tips proactief tonen wat de aandacht waardig is ("Let op de oranje spike in 2068 — dat is je geplande einddatum") leert de gebruiker de chart te lezen zonder dat ze elke pixel hoeven te onderzoeken.

*Hoe visueel*: collapsible sectie onder de chart, default ingeklapt op mobile (om ruimte te besparen) en uitgeklapt op desktop. Header "Hoe lees je deze grafiek?" met chevron. Bullet-list in `text-sm text-[var(--ink-3)]`. Past bij fintwo's editorial-finance toon — kort, scherp, niet betuttelend.

*Dubbeling met bestaande functie*: geen directe tegenhanger. Wel: de editorial-library heeft `EducationalCallout`-achtige patronen die je herkent uit `news`-flow. `ChartTips` is een specialisatie hiervan voor chart-context. Geen conflict.

---

### 13. Coach to-dos met categorieën en status-tracking

- **category**: Inspiratie - Boldin
- **name**: Persoonlijke coach-to-dos met categorisering
- **description**: Uitbreiding van `/identity/gids`: gepersonaliseerde to-dos op basis van plan-state, gecategoriseerd (Plan-accuratesse, Strategie-ideeën, Acties, Sleuteldata, Scenario-suggesties). Status per to-do: Te doen / Klaar / Genegeerd. Filter chips bovenaan.
- **steps**:
  1. Schema: `coach_todos` table met `user_id, category, title, status, generated_at`
  2. Generator: server-side functie die plan-state analyseert en to-dos genereert
  3. UI: `<CoachTodoList>` met filter-chips + status-buckets
  4. Plaats op nieuwe `/identity/coach` of geintegreerd in `/identity/gids`

**Implementatie in TriFinity**

*Waar*: nieuwe pagina `/identity/coach`, of uitbreiding van `/identity/gids` (waar nu de ConceptFlipCards en GuideProgressBar staan). Mogelijk ook entry-points vanaf dashboard via een coach-mini-widget (`acties-widget`?).

*Welke data*: nieuwe tabel `coach_todos` (`user_id`, `category`, `title`, `status`, `generated_at`, `dismissed_at`). Server-side generator analyseert plan-state — bijvoorbeeld: ontbrekende velden detecteren, FIRE-doel onhaalbaar berekenen, geen noodfonds aanwezig — en creëert relevante to-dos. Plus integratie met bestaande `nudge-definitions.ts`.

*Waarde voor de gebruiker*: vandaag heeft fintwo nudges, voorstellen, acties verspreid over verschillende widgets. Een centraal "wat moet ik nog doen?"-overzicht met categorisering en "klaar"-status maakt voortgang voelbaar. Gebruiker kan items afvinken; dat geeft beloningsgevoel en houdbaar gedrag.

*Hoe visueel*: filter-chips bovenaan ("Plan-accuratesse", "Strategie", "Acties", "Sleuteldata") met counts. Status-buckets eronder als 3 collapsibles: Te doen (default open), Klaar (collapsed), Genegeerd (collapsed). NEW-chip op recente items. Klik op item: detail-sheet met meer uitleg + actie-knop. Volg fintwo's `<ShellOverlay kind="sheet">` pattern.

*Dubbeling met bestaande functie*: zeer groot — fintwo heeft al `acties-widget`, `voorstellen-widget`, `volgende-stap-widget`, `meldingen-widget`, `nudge-definitions.ts`. Dat is een rijk advies/nudge-systeem maar verspreid. Boldin's pattern is **één gecategoriseerde lijst met status**. Aanbeveling: niet vervangen, maar **consolideren** — alle bovengenoemde widgets blijven entry-punten, maar wijzen naar `/identity/coach` als centrale to-do-lijst. Dat is een refactor-ticket meer dan een nieuwe feature.

---

### 14. Monte Carlo fan chart met "Run Again"

- **category**: Inspiratie - Boldin
- **name**: Monte Carlo confidence-bands voor FIRE-kans
- **description**: Uitbreiding van bestaande `runBacktest`: visualiseer als fan chart met confidence-bands (1 std dev, 2 std dev) rond de mediaan. Plus "Run Again" button die simulatie opnieuw draait met nieuwe random seeds.
- **steps**:
  1. Wijzig `runBacktest` om continue confidence-bands te outputten
  2. Bouw `<MonteCarloFanChart>` met area-bands
  3. "Run Again" knop die nieuwe simulation triggert client-side (of server)
  4. Vervang bestaande backtest-widget op `/horizon` met deze nieuwe variant

**Implementatie in TriFinity**

*Waar*: nieuwe size-variant binnen bestaande `monte-carlo-widget.tsx`, of nieuwe widget `monte-carlo-fan-widget.tsx`. Als deze nieuwe variant toevoegt: registreer in widget-catalog. Past op `/horizon` als grote widget of op een nieuwe `/horizon/risico`-pagina.

*Welke data*: bestaande `runBacktest` in `lib/horizon-data.ts` levert `backtestNamedPaths` (best/worst/median) maar geen continuous std-bands. Uitbreiden: bereken percentielen (10/25/50/75/90) per jaar uit alle simulaties. fintwo heeft ook `phase-monte-carlo.ts` — die eerst checken of die al fan-data oplevert.

*Waarde voor de gebruiker*: drie paden (best/worst/median) tonen extremen, maar verbergen de **dichtheid** van uitkomsten. Een fan-chart met confidence-bands laat zien waar de uitkomsten **waarschijnlijk** liggen, niet alleen extremen. Plus de "Run Again"-knop verlaagt het mysterium ("waar komt 99% vandaan?") — gebruiker ziet dat het opnieuw rekent.

*Hoe visueel*: 2 lagen confidence-bands — buitenste in `--horizon-100` (5-95 percentiel), binnenste in `--horizon-200` (25-75), mediaanlijn in `--horizon-700`. "Run Again"-knop rechts boven de chart in fintwo's standaard button-stijl. Onder de chart het percentage "99% kans van slagen" met dezelfde getalweergave als nu.

*Dubbeling met bestaande functie*: zeer groot met `monte-carlo-widget.tsx`, `backtesting-score-widget.tsx`, `phase-monte-carlo.ts`, `phase-stress-test.ts`. **Niet vervangen** — wel: voeg fan-chart-modus toe aan bestaande Monte Carlo-widget als grotere variant (`size: 'half' | 'full'`). De `mini`/`quarter`-modes blijven percentage-only.

---

### 15. Pre-built scenario-templates

- **category**: Inspiratie - Boldin
- **name**: Scenario-templates ("Stop 3 jaar eerder", "Spaar 5% meer")
- **description**: Bij het aanmaken van een nieuw scenario op `/horizon/vrijheidsscenarios`: bied 6-8 templates aan in plaats van leeg starten. Elke template heeft pre-filled cashflows + assumpties. Verlaagt drempel.
- **steps**:
  1. Definieer template-archetypes in `lib/scenario-templates.ts`
  2. Modal/page bij "Nieuw scenario" met template-grid
  3. Optie "Begin leeg" als laatste keuze
  4. Template applicatie: kopieer current state + apply template-deltas

**Implementatie in TriFinity**

*Waar*: bij scenario-aanmaak op de scenario-manager-pagina (waar dan ook in fintwo's huidige scenario-architectuur). Modal of slide-in panel met template-grid.

*Welke data*: nieuwe `lib/scenario-templates.ts` met 6-8 archetypes. Hergebruik van bestaande `WhatIfPresets`-definities als startpunt — die hebben al "Part-time", "Loonsverhoging", "Zuinig leven", "FIRE sprinter", "Sabbatical", etc. Convert naar persistente scenario-deltas (ipv tijdelijke what-if-overrides).

*Waarde voor de gebruiker*: nieuwe scenario aanmaken vanaf een leeg formulier is drempelhoog — wat moet ik aanpassen? Templates geven concrete startpunten met al ingevulde deltas. "Stop 3 jaar eerder" past `retirement_age` aan plus voegt cashflow-aanpassing toe. Gebruiker kan dan verfijnen.

*Hoe visueel*: grid van template-cards (2x3 of 3x2) met icoon + naam + één-zin uitleg ("Spaar 15% meer dan nu"). "Begin leeg"-card als laatste optie, visueel iets minder prominent. Active state met groene border. Volg fintwo's bestaande overlay-patroon.

*Dubbeling met bestaande functie*: `WhatIfPresets` (`components/app/horizon/whatif-presets.tsx`) heeft al een vergelijkbare definitie-set, maar voor what-if (tijdelijke verkenning). Het verschil: what-if = sessie-tijdelijk, scenario-template = aanmaak-startpunt voor een persistent saved scenario. **Code-pattern hergebruiken** — kopieer de preset-definities en pas ze aan voor scenario-deltas.

---

## Tier 3 — Inspiratie, lange-termijn

### 16. AI assistent-pane ("Vraag fintwo")

- **category**: Inspiratie - Boldin
- **name**: AI-pane in shell met financial-planning chat
- **description**: Rechter slide-in pane met chat-interface. Suggested prompts ("Wanneer ben ik FIRE?", "Wat als ik €10k extra spaar?", "Verklaar mijn box 3 belasting"). Voice-input optioneel. Laagdrempelig vraag stellen ipv navigeren.
- **steps**:
  1. Onderzoek: Anthropic Claude API met tool-use voor toegang tot user-data
  2. RAG-strategie: chat met context van DashboardData + recente events
  3. Suggested prompts als entry-points
  4. UI: `<AskFintwoSheet>` met chat-bubble layout
  5. Privacy-strategie + opt-in
  6. Feature-flag `ai_assistant`

**Implementatie in TriFinity**

*Waar*: rechter slide-in pane via `<ShellOverlay kind="pane">` (volgt de driewegregel uit CLAUDE.md). Toggle-knop in topbar (vergelijkbaar met Boldin's "Ask"-knop). Beschikbaar op alle `(app)`-routes.

*Welke data*: Anthropic Claude API (Claude Sonnet 4.6 voor cost-balans, of Opus 4.7 voor lastige financiële vragen). Tool-use definities: `get_dashboard_data`, `run_simulation(scenario)`, `compute_fire`, `get_assets`, `get_recent_transactions`, `get_life_events`. System-prompt met fintwo-context (NL-fiscale regels, FIRE-terminologie). Gebruik prompt-caching voor system-prompt + tool-definities.

*Waarde voor de gebruiker*: complexe vragen ("Wanneer ben ik FIRE als ik 5% meer spaar?") vereisen nu navigatie door meerdere widgets en zelf rekenwerk. Met natural-language chat krijgt de gebruiker direct antwoord, met de AI die de juiste data ophaalt en berekent.

*Hoe visueel*: chat-bubble layout, gebruikersvragen rechts in `--ink-2` grijze bubble, AI-antwoorden links in witte cards met serif-headings. Suggested prompts als chips boven het input-veld. Voice-input optioneel als microfoon-icoon. Volg fintwo's editorial-finance toon in alle copy.

*Dubbeling met bestaande functie*: groot — fintwo heeft al `WhatIfChat` (`components/app/horizon/whatif-chat.tsx`) als per-page chat in /horizon/whatif. Een **globale Ask-pane** is uitbreiding: chat-context wordt user-wide ipv page-bound. Het bestaande `chat-provider.tsx` is een goed startpunt — uitbreiden ipv nieuw bouwen. AI-tools moeten nieuwer zijn want ze moeten hele app-data omspannen, niet alleen what-if-context.

---

### 17. Peer comparison

- **category**: Inspiratie - Boldin
- **name**: Anonieme peer-comparison voor metrics
- **description**: "X% van fintwo-gebruikers heeft een net vermogen tussen €Y en €Z". Toon waar de gebruiker valt in de distributie. Vereist grotere user-base (>1000 actieve users) voor zinvolle anonimiteit. Privacy: aggregeer per leeftijdsgroep + decile.
- **steps**:
  1. Privacy-design met dataminimalisatie + k-anonymity (k>=20)
  2. Aggregation-job (nightly) → `metric_distributions` table
  3. UI: distribution-bar met gebruikers-positie
  4. Plaats op `/core` netwo-pagina + relevante widget

**Implementatie in TriFinity**

*Waar*: bij netto-vermogen op `/core`, of als sectie op de toekomstige `/identity/wellness`. Mogelijk ook in dashboard-widget als level-2+ feature.

*Welke data*: nightly aggregation-job die per leeftijds-decennium de percentielen (10/25/50/75/90) van metrics berekent (netto vermogen, FIRE-voortgang, spaarquote). Schrijf naar `metric_distributions`-tabel. Strict k-anonymity check (k≥20 users per bucket; bij minder, geen bucket tonen). Privacy by design: alleen aggregaten worden naar de client gestuurd, nooit individuele records.

*Waarde voor de gebruiker*: individuele cijfers zijn moeilijk te interpreteren in absolute zin. "Mijn netto vermogen is €350k — is dat goed?" Zonder context: niet te beantwoorden. Met peer-context: "Mediaan voor jouw leeftijd is €280k, jij zit op p65". Sociale referentie als motivator (of geruststelling), niet als ranking.

*Hoe visueel*: horizontale distribution-bar met percentielen als markers, gebruiker-positie als prominent pin. Begeleidende tekst "Mediaan voor leeftijd 40-49: €X". Niet als ranking — als context. Belangrijke disclaimer onder: "Vergelijking is anoniem en alleen indicatief".

*Dubbeling met bestaande functie*: `huishouden-vergelijking-widget.tsx` vergelijkt met **eigen huishouden-leden** (per-relatie), niet met andere fintwo-gebruikers. `nibud-benchmark-widget.tsx` vergelijkt budget met Nibud-norm — externe baseline. Peer-compare zou fintwo's eigen userbase als baseline gebruiken — uniek. Past goed naast bestaande comparison-widgets.

---

### 18. Drie-luiker macro + Sankey + tabel

- **category**: Inspiratie - Boldin
- **name**: Lifetime cash-flow drie-luiker (lijn + Sankey + tabel)
- **description**: Eén pagina met drie weergaves van dezelfde data: macro lijngrafiek (income vs expenses over lifetime), interactive Sankey voor één jaar (year-slider), volledig jaartabel onder. Krachtige drie-niveau-zoom: macro → micro → detail.
- **steps**:
  1. Bouw na features 1 (Sankey) en 2 (have-vs-need)
  2. Combineer in `<LifetimeCashFlow>` page-component
  3. Synchronize year-slider tussen Sankey en tabel-row-highlight
  4. Tabel: virtualized scroll voor 50+ jaren
  5. Plaats als nieuwe route `/horizon/lifetime-cashflow`

**Implementatie in TriFinity**

*Waar*: nieuwe pagina `/horizon/levensloop-cashflow`, of uitbreiding van bestaande `/horizon/uitgaven-na-pensioen` (route + uitgaven-client.tsx bestaat al). Past het beste als verdiepings-pagina vanuit de Insights Library (#4).

*Welke data*: combinatie van features 1 (Sankey), 2 (have-vs-need), en bestaande `runSimulation`-output voor jaar-tabel. Geen nieuwe data — alleen samenstelling.

*Waarde voor de gebruiker*: gebruikers verschillen in zoom-voorkeur. Scanners willen overview (lijn-chart), explorers willen tijd-scrubben (Sankey met slider), analytische users willen alle cijfers (tabel). Door alle drie naast elkaar te zetten, bedien je beide profielen in één view.

*Hoe visueel*: vertical-stacked layout — line-chart bovenaan, Sankey + slider in midden, tabel onder. Alle drie gesynchroniseerd via gedeelde `useState<number>(year)`. Klik op een tabel-rij → Sankey scrollt naar dat jaar; sleep slider → tabel-rij wordt highlight.

*Dubbeling met bestaande functie*: bestaande `/horizon/uitgaven-na-pensioen` heeft al een uitgaven-pane (`uitgaven-client.tsx`). Drie-luiker is een **uitbreiding/herontwerp** van die pagina — niet een aparte route nodig. Hergebruik van Sankey (#1) en have-vs-need (#2) als sub-componenten.

---

## Toevoegingen uit sessie 2 — diepe duik

### 19. Topbar Assumptions-popover (snel-aanpassen)

- **category**: Inspiratie - Boldin
- **name**: Topbar Assumptions popover voor scenario-snelaanpassing
- **description**: Compacte popover toegankelijk via icoon in `<AppHeader>` met de 3 meest-gewijzigde assumptions: pensioenleeftijd, withdrawal-strategy, expense-method. Plus deeplinks naar `/identity/instellingen` voor diepere config. Boldin's pattern: drie segmented controls met edit-links rechts.
- **steps**:
  1. Bouw `<AssumptionsPopover>` component met 3 segmented controls
  2. Hergebruik bestaande state uit `profiles` (`expected_return`, `inflation_rate`, `FireEndStrategy`, `RetirementExpenseMethod`)
  3. Plaats icoon-knop in `<AppHeader>` of `<Sidebar>` topbar
  4. Edit-links naar `/identity/instellingen#fire`
  5. Persisteer wijzigingen via bestaande `/api/parameters` PUT
  6. Realtime herberekening triggeren via context-invalidation

**Implementatie in TriFinity**

*Waar*: icoon-knop in `<AppHeader>` (oude shell) of `<Sidebar>` topbar (nieuwe shell achter `new_navigation_shell` flag). Popover opent op-klik, sluit op-Escape of klik-buiten.

*Welke data*: bestaande velden uit `profiles` — `expected_return`, `inflation_rate`, `FireEndStrategy`, `RetirementExpenseMethod`. Geen nieuwe schema-velden. PUT via bestaande `/api/parameters`. Wijziging triggert herberekening van afhankelijke views via context-invalidation.

*Waarde voor de gebruiker*: vandaag moet je naar `/identity/instellingen` Sectie C navigeren om FIRE-aannames aan te passen — drie clicks, en je verliest je context. Met topbar-popover blijven assumptions één klik weg, op elke pagina. Voor power-users die snel willen iteraten ("wat als ik 4% return aanneem ipv 5%?") is dit goud.

*Hoe visueel*: smal popover-card (~320px breed) met 3 segmented controls verticaal gestapeld, elk met een Edit-link rechts in `--horizon-500`. Active state in `--horizon-200/700`. Past in fintwo's bestaande overlay-architectuur (`<ShellOverlay>` als smaller variant, of een echte popover-component die niet de hele view dimt).

*Dubbeling met bestaande functie*: deze 4 settings staan al in `/identity/instellingen` Sectie C (FIRE Instellingen). Popover is een **shortcut**, niet nieuwe data. Single source of truth blijft `profiles` — popover schrijft naar dezelfde velden. Geen conflict, maar zorg dat de popover niet uit-sync raakt met de instellingen-pagina (gebruik dezelfde React-Query/SWR-key).

---

### 20. Today's Dollars / Future Dollars toggle

- **category**: Inspiratie - Boldin
- **name**: Real/Nominal toggle voor Horizon-projecties
- **description**: Toggle in topbar (of in Horizon-pagina-header) om FIRE-projecties te switchen tussen "in vandaag's koopkracht" (deflated/real) en "in toekomst-euros" (nominal). Verkleint begripskloof bij grote projecties — €2M in 2050 voelt alarmerend, maar in vandaag's koopkracht is het misschien €1.1M.
- **steps**:
  1. Wijzig `formatCurrency` om optionele `displayMode: 'real' | 'nominal'` te accepteren
  2. Voor real-mode: deflateer met `inflation_rate` van profile vanaf today
  3. Hook: `useHorizonViewMode()` context — persistent in session
  4. Toggle-UI in topbar Assumptions-popover (#19) of als segmented control op `/horizon`-header
  5. Update alle Horizon-widgets om `displayMode` te respecteren
  6. Visuele indicator op chart-Y-axis: "(in 2026 koopkracht)" of "(in nominale euros)"

**Implementatie in TriFinity**

*Waar*: toggle in topbar (samen met Assumptions-popover #19), gestuurd door een context-provider in `app/(app)/layout.tsx`. Of als segmented control op `/horizon`-pagina-header.

*Welke data*: `inflation_rate` is al ingevoerd in `profiles`. fintwo's `formatCurrency` (in `lib/format.ts`) krijgt een optionele `displayMode: 'real' | 'nominal'`. Voor real-mode: deflateer met inflation vanaf today. Hook `useHorizonViewMode()` houdt actieve mode in session.

*Waarde voor de gebruiker*: een gebruiker die ziet "Je vermogen in 2050: €2,4M" reageert vaak met ongeloof of vervreemding. Zelfde getal in koopkracht-vandaag (bijv. €1,3M) is veel intuïtiever. Door beide perspectieven beschikbaar te maken, geeft fintwo de gebruiker de keuze welke lens past bij hun denken.

*Hoe visueel*: kleine pill-toggle [Vandaag | Toekomst] in topbar of pagina-header. Op chart Y-axes: subscript-tekst "(in 2026 koopkracht)" of "(nominale euro's)" zodat de modus altijd zichtbaar is. Default: real-mode (vandaag), want dat is voor de meeste gebruikers het intuïtiefst.

*Dubbeling met bestaande functie*: `inflation_rate` wordt al gebruikt in FIRE-berekeningen (bijv. `computeFireProjection` schroeft FIRE-target op met inflation). Maar fintwo visualiseert nog niet beide perspectieven naast elkaar — alle bedragen zijn nu nominaal in toekomst-euro's. Toggle is een **display-laag**, geen nieuwe rekening. Risk: alle horizon-widgets moeten respecteren dat de toggle bestaat — dat is een refactor over ~20 widgets.

---

### 21. Optimistic / Average / Pessimistic rate-presets

- **category**: Inspiratie - Boldin
- **name**: Pre-built rate-sets als one-click scenario-toggle
- **description**: Drie voorgebakken return/inflation-sets met richtings-icoontjes: optimistisch ↗ (return 7%, inflation 1.5%), gemiddeld ~ (return 5%, inflation 2%), pessimistisch ↘ (return 3%, inflation 3%). Toggle wijzigt project-input zonder profile-edit nodig.
- **steps**:
  1. Definieer `RATE_PRESETS` constant in `lib/fire-params.ts` met 3 sets
  2. UI: segmented control met richtings-icoontjes (chart-up/sinus/chart-down)
  3. Override `resolveFireParams` met preset-rates in computation context
  4. Persisted in session-state, niet profile (zodat baseline-profile intact blijft)
  5. Visuele indicator: badge "PESSIMISTIC" naast Horizon-titel als override actief
  6. Plaats in topbar Adjust-popover naast Today's/Future toggle

**Implementatie in TriFinity**

*Waar*: in dezelfde topbar-popover als de Assumptions-popover (#19), of als segmented control op `/horizon`-header. Combineren met de Today's/Future-toggle (#20) levert een compacte "scenario-control"-strip op.

*Welke data*: nieuwe `RATE_PRESETS`-constante in `lib/fire-params.ts`. Override-laag in `resolveFireParams` die session-state respecteert: bij active preset wordt die gebruikt ipv profile-waarden. Persistent in session, NIET in profile (anders raakt baseline weg).

*Waarde voor de gebruiker*: vandaag moet je `expected_return` en `inflation_rate` apart aanpassen in instellingen om een stress-test te doen. Met one-click-presets is "wat als de markt slecht presteert?" een seconde werk. Verlaagt drempel tot stress-testen.

*Hoe visueel*: segmented control met 3 segmenten en richtings-icoontjes (↗ ~ ↘). Active state in `--horizon-500`. Bij active override (bijv. "PESSIMISTIC"): subtiele badge naast Horizon-titel of in topbar zodat gebruiker zich bewust is dat hij niet in baseline kijkt.

*Dubbeling met bestaande functie*: `expected_return + inflation_rate` worden al individueel ingesteld in `/identity/instellingen`. Presets zijn een **shortcut + compactness**, geen nieuwe data. Mogelijk hergebruik in `phase-stress-test.ts` (bestaat al en doet vergelijkbare scenario-iteraties). Risico: gebruiker raakt verward over baseline vs preset-override — daarom badge verplicht.

---

### 22. AI-assistent met tool-use transparency

- **category**: Inspiratie - Boldin
- **name**: AI-pane met agent-style tool-use checklist (uitbreiding van #16)
- **description**: Specifieker dan feature #16: toon tool-calls als groene-vinkje-checklist tijdens AI-generatie ("✓ Berekenen FIRE-projectie", "✓ Analyseren vermogenspad", "✓ Lopen backtest"). Antwoorden bevatten inline links naar fintwo's eigen routes (`/horizon/levensgebeurtenissen`, `/core/budgets`).
- **steps**:
  1. Definieer Claude-tools: `run_fire_simulation(scenario_id)`, `compute_fire_range`, `load_dashboard_data`, `get_recent_events`, `query_user_assets`
  2. Stream tool-call events naar UI als progressive checklist
  3. Format Claude response met markdown + auto-link `/horizon/...`, `/core/...`, `/wil/...` paths
  4. Suggested prompts roteren op basis van plan-state (sparende user → "Hoe versnel ik FIRE?", FIRE-bereikende user → "Inkomstenstrategie na pensioen?")
  5. Per-bericht 👍/👎 feedback met opt-in voor model-verbetering
  6. Privacy: opt-in voor data-deling, expliciete uitleg welke plan-data wordt verzonden
  7. Caching strategy via Anthropic prompt-cache voor system-prompt + tool-definities

**Implementatie in TriFinity**

*Waar*: uitbreiding van feature #16 (AI-pane). De tool-use-streaming gebeurt in dezelfde `<AskFintwoSheet>`-component, met een `<ToolCallChecklist>` sub-component die animeert tijdens generatie.

*Welke data*: Anthropic Claude API met streaming tool-use events. Definieer fintwo-specifieke Claude-tools als wrappers om bestaande lib-functies — bijvoorbeeld een tool `run_fire_simulation` die intern `runSimulation` aanroept en de output naar Claude streamt. Tools dekken: `runSimulation`, `computeFireRange`, `loadDashboardData`, `runBacktest`, `getRecentEvents`, `queryUserAssets`.

*Waarde voor de gebruiker*: de grote zorg bij AI in financieel context is "verzint hij dit, of rekent hij echt op mijn data?" Door tool-calls als zichtbare checklist te tonen ("✓ Berekenen FIRE-projectie", "✓ Lopen backtest"), bouwt fintwo vertrouwen. Gebruiker ziet bewijs dat de AI zijn werkelijke plan-data heeft geraadpleegd.

*Hoe visueel*: tool-calls verschijnen tijdens generatie als groene-vinkje-checklist boven het antwoord, met fade-in per stap. Antwoord-tekst bevat **inline links** naar fintwo-routes — als de AI naar "Spending Guardrails" wijst, is dat een klikbare link naar `/horizon/uitgaven-na-pensioen` (de NL-equivalent). Gebruik fintwo's `--horizon-500` voor links, en serif voor antwoord-headings.

*Dubbeling met bestaande functie*: bouwt door op #16. fintwo heeft al `WhatIfChat` in `/horizon/whatif` maar zonder zichtbare tool-use. Dit is een **upgrade-ticket** voor bestaande chat ipv nieuwe build. De definities van Claude-tools liggen vlak bij bestaande lib-functies (`runSimulation`, etc.) — minimal wrapper-werk.

---

### 23. Proactieve follow-up vragen na AI-antwoord

- **category**: Inspiratie - Boldin
- **name**: AI genereert vervolgvraag na elk antwoord
- **description**: Sub-feature van #22. Na het beantwoorden van een vraag genereert AI proactief een concrete vervolg-vraag op basis van het inzicht in het antwoord. Bv. na "Je veilig uitgavenniveau is €4.500/maand": "Met deze ruimte van €1.200/maand boven je huidige uitgaven, heb je nagedacht over reizen of een nalatenschap?" Maakt het tot een gesprek in plaats van query-antwoord-pattern.
- **steps**:
  1. Add system-prompt clause aan Claude-call: "After answering, suggest ONE concrete follow-up question that builds on the insight"
  2. Parse Claude response om de follow-up te isoleren
  3. Render als clickable chip onder antwoord
  4. Click op chip → auto-fill input met de vraag → submit
  5. Track engagement: % users klikken op follow-up vs eigen vraag stellen

**Implementatie in TriFinity**

*Waar*: sub-feature van #16/22. Render in chat-thread direct onder elk AI-antwoord, vóór het input-veld voor de volgende vraag.

*Welke data*: geen nieuwe data of API-call. System-prompt aan Claude breidt uit met: "After answering, propose exactly ONE concrete follow-up question that the user might want to ask next, based on the most useful insight in your answer." Parse-logica isoleert deze follow-up uit de response (bv. via specifieke markers of laatste paragraaf-detectie). Track-event op "klikt user op follow-up?" voor engagement-metrics.

*Waarde voor de gebruiker*: een single query-antwoord eindigt het gesprek. Een follow-up-vraag opent de volgende deur. "Je hebt €1.200/maand over — heb je nagedacht over reizen?" leidt naar een gesprek over uitgaven-prioriteiten. Gebruiker krijgt waarde zonder zelf de volgende vraag te bedenken.

*Hoe visueel*: clickable chip onder het AI-antwoord met de vraag-tekst. Klik → auto-fill input-veld + submit. Visueel subtiel: lichte achtergrond, kleine tekst, met "Volg op:" of "Vraag verder:" als prefix-label. Past bij fintwo's editorial-finance toon.

*Dubbeling met bestaande functie*: geen huidige tegenhanger. Compatibel met bestaande `chat-provider.tsx`-architectuur — als die al messages-geschiedenis bijhoudt, dan is een follow-up gewoon de volgende user-message met pre-filled tekst.

---

## Importeren naar fintwo-backlog

Wanneer de `feature_create` MCP-tool weer beschikbaar is, kun je deze **23 features** bulk-importeren via:

```
feature_create_bulk met items uit dit bestand
```

Elk item heeft de 4 velden (category, name, description, steps) volgens CLAUDE.md format. De **Implementatie in TriFinity**-blokken kunnen losgekoppeld worden of als context-bijlage bij de feature dienen — voor de backlog zelf zijn de bestaande description+steps voldoende.

**Telling**:
- Tier 1 (direct overneembaar): #1-6 (Sankey, Have-vs-Need, What If, Insights Library, Milestones, Plan Completion)
- Tier 2 (aanpassing nodig): #7-15 (Wellness, Watchlist, Scenario-chip, Surplus-Gap, Tax-allocation, Tips, Coach, Monte Carlo, Templates)
- Tier 3 (lange termijn): #16-18 (AI-pane, Peer comparison, Drie-luiker)
- Sessie 2 (uit diepe duik): #19-23 (Assumptions popover, Today's/Future, Rate-presets, Tool-use AI, Follow-up questions)

**Belangrijkste dubbeling-bevindingen** (uit de **Implementatie in TriFinity**-blokken):

1. **#3 (What-If toggles)** — Boldin's pattern bestaat al volledig in fintwo's `/horizon/whatif`. Niet nieuwe feature, maar redesign-ticket.
2. **#13 (Coach to-dos)** — Verspreide nudge/voorstellen/acties-widgets bestaan al; consolidatie-ticket eerder dan nieuwe build.
3. **#7 (Wellness Scorecard)** — Bouwt op bestaande `lib/financial-health.ts` 6-pillar score; uitbreiden, niet vervangen.
4. **#14 (Monte Carlo fan)** — Bestaande `monte-carlo-widget` + `phase-monte-carlo.ts` doen al veel; voeg fan-modus toe als size-variant.
5. **#15 (Scenario-templates)** — `WhatIfPresets` is al een sterke basis voor scenario-templates; pattern hergebruiken.

Deze 5 features hebben een **lager netto-implementatiebudget** dan ze op het eerste gezicht lijken — fintwo heeft de bouwstenen al.