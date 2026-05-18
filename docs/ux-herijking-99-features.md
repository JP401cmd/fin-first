# UX-herijking: 99 features — Wat verandert er en waar zie je het?

> Gebaseerd op het UX-onderzoek "Van overdaad naar gerichte vrijheid" (mei 2026).
> Drie architectuurbesluiten genomen: cashflow hybride binnen Kern, kompas naast modules, settings hybride opsplitsing.

---

## Leeswijzer

Dit document beschrijft alle 99 nieuwe features verdeeld over 4 fasen. Per feature-groep staat:

- **Wat verandert** — de functionele wijziging
- **Waar zichtbaar** — welke pagina('s) of component(en) geraakt worden
- **Waarom** — de UX-motivatie uit het plan

---

## Fase 1: Promotie & Repositie (18 features)

Snelle wins die bestaande functionaliteit beter positioneren zonder nieuwbouw.

### 1.1 Smart defaults verbergen (2 features)

| | |
|---|---|
| **Wat verandert** | FIRE-parameters (verwacht rendement, inflatie, SWR) zijn niet langer direct zichtbaar. Ze zitten achter een 'Geavanceerd'-knop. De bestaande `resolveFireParams()` defaults (6%, 2.5%, 4%) doen het werk zonder dat de gebruiker er iets voor hoeft te doen. |
| **Waar zichtbaar** | `/horizon` — parametervelden verdwijnen uit het hoofdzicht. Een discrete link of gear-icoon maakt ze bereikbaar voor gevorderde gebruikers. |
| **Waarom** | Nieuwe gebruikers worden niet geconfronteerd met jargon als "Safe Withdrawal Rate" of "fictief rendement". De app werkt out-of-the-box. |

### 1.2 Lege staten consistent met één CTA (4 features)

| | |
|---|---|
| **Wat verandert** | Alle lege staten in Core, Will, Horizon en Identity volgen hetzelfde patroon: één primaire CTA-knop, een korte uitleg, en optioneel een secundaire link. Het bestaande `empty-state.tsx` patroon wordt de standaard overal. |
| **Waar zichtbaar** | `/core/assets` (geen assets), `/core/debts` (geen schulden), `/core/cash` (geen transacties), `/core/budgets` (geen budgetten), `/will` (geen acties), `/horizon` (onvoldoende data), `/identity/koppelingen` (geen koppelingen), `/identity/delen` (niets gedeeld). |
| **Waarom** | Consistentie verlaagt cognitieve belasting. Eén CTA geeft duidelijke richting in plaats van een lege pagina of een overweldigend keuzemenu. |

### 1.3 Module-namen verbergen (2 features)

| | |
|---|---|
| **Wat verandert** | Technische module-ID's (`budgetteren`, `vermogensregistratie`, `aandelenregistratie`) verdwijnen uit de eindgebruiker-UI. Overal worden leesbare feature-labels gebruikt: "Budgetten", "Vermogen", "Beleggingen". Module-namen blijven alleen zichtbaar in `/identity/instellingen` (sectie H) en tijdens onboarding. |
| **Waar zichtbaar** | Widget-headers, navigatie-items, FeatureGate-fallbacks, WidgetShell kickers — overal waar nu module-slugs staan. |
| **Waarom** | "Vermogensregistratie" is een interne term, geen gebruikerstaal. Feature-labels sluiten aan bij hoe mensen spreken over hun financiën. |

### 1.4 UPO-import promoten (2 features)

| | |
|---|---|
| **Wat verandert** | De bestaande `PensionPdfUpload` (al volledig werkend) wordt zichtbaar gemaakt op twee nieuwe plekken: als optionele stap in de onboarding, en als prominente kaart op `/horizon` wanneer pensioendata ontbreekt. |
| **Waar zichtbaar** | **Onboarding flow** — nieuwe optionele stap "Upload je UPO". **`/horizon`** — uitnodigingskaart die verdwijnt na upload. |
| **Waarom** | UPO-import bestond al maar was verstopt. Pensioendata verbetert FIRE-projecties aanzienlijk. Door het eerder aan te bieden krijgen gebruikers sneller accurate inzichten. |

### 1.5 Gezondheidsscore naar /core hero (4 features)

| | |
|---|---|
| **Wat verandert** | De `computeHealthScore()` (6 pillars, al werkend als dashboard-widget) wordt het visuele anker van De Kern. De score (0-100) staat prominent in de hero-sectie. Klikken opent een BottomSheet met pillar-breakdown (spaarquote, schuldratio, noodfonds, FIRE, diversificatie, budget). Elke pillar is kleurgecodeerd (groen >70, amber 40-70, rood <40). Een trend-pijl toont verbetering/verslechtering t.o.v. vorige maand. |
| **Waar zichtbaar** | **`/core` hero-sectie** — grote score + trend-indicator. **Drill-down sheet** — 6 pillars met visuele bars en uitleg. |
| **Waarom** | De Kern miste een eigen "hero metric". De gezondheidsscore geeft gebruikers in één getal antwoord op "hoe sta ik ervoor?" en maakt de weg vrij naar gerichte verbetering. |

### 1.6 Briefing herpositioneren (4 features)

| | |
|---|---|
| **Wat verandert** | De bestaande briefing-engine (DAIshboard met 9 AI-modules) wordt het hoofdcomponent op `/will`. Een cadence-toggle laat gebruikers kiezen tussen dagelijks en wekelijks. De briefing op het dashboard wordt een compacte versie met link. Eerdere briefings zijn terug te lezen via een geschiedenislijst. |
| **Waar zichtbaar** | **`/will` (bovenaan)** — volledige briefing als hoofdwidget. **Dashboard** — compacte samenvatting of link. **`/will` geschiedenislink** — archief van eerdere briefings. |
| **Waarom** | De Wil is de plek voor inzicht en actie. Een persoonlijke briefing als openingszet op `/will` geeft de pagina een duidelijke reden om terug te komen. |

---

## Fase 2: Uitbreiden op bestaand fundament (45 features)

Integratie- en uitbreidingswerk op bestaande bouwstenen.

### 2.1 Netto-vermogen-tijdslijn (6 features)

| | |
|---|---|
| **Wat verandert** | De bestaande net-worth projectie-chart (nu 1-5 jaar) wordt uitgebreid tot pensioenleeftijd. Een FIRE-target stippellijn toont het snijpunt waar financiële vrijheid bereikt wordt. Mijlpalen (€10K, €50K, €100K, etc.) verschijnen als markers met verwachte datum. Een toggle wisselt tussen korte termijn (maanden/kwartalen) en lange termijn (jaren tot pensioen). |
| **Waar zichtbaar** | **`/core` hero-sectie** — naast de gezondheidsscore. Twee visuele ankers: score (hoe gezond) + tijdslijn (waar naartoe). Responsive: desktop naast elkaar, mobile gestapeld. |
| **Waarom** | Gebruikers zien nu alleen korte termijn. De lange lijn tot pensioen — met het moment van vrijheid — is de krachtigste motivator. |

### 2.2 Coach-bubble post-onboarding (4 features)

| | |
|---|---|
| **Wat verandert** | Na voltooiing van de onboarding verschijnt een niet-blokkerende coach-bubble die de gebruiker begeleidt naar de eerste zinvolle actie. De suggestie is contextueel: geen bank → "koppel bank", geen assets → "voeg vermogen toe", geen budget → "stel budget in". De bubble is wegklikbaar en houdt bij wat gezien is. |
| **Waar zichtbaar** | **Eerste pagina na onboarding** — floating bubble met CTA. Verdwijnt na interactie of dismiss, komt niet terug voor dezelfde suggestie. |
| **Waarom** | Het moment na onboarding is kritiek: de gebruiker is gemotiveerd maar weet niet waar te beginnen. Eén gerichte suggestie verlaagt de drempel naar waarde. |

### 2.3 Tijdas drag/drop + fusie (8 features)

| | |
|---|---|
| **Wat verandert** | Life events op de Horizon-tijdas worden draggable. Slepen naar een andere leeftijd werkt de database bij en herberekent de projectie real-time. De what-if sliders (nu apart op `/horizon/whatif`) worden inline geïntegreerd als overlay. Doorrekening-resultaten (opbouw/afbouw) verschijnen inline als tabs. Scenario-overlays tonen meerdere toekomstpaden tegelijk. `/horizon/whatif` en `/horizon/doorrekening-test/*` worden redirects naar de uniforme tijdas. Een undo-toast verschijnt na elke drag-operatie. |
| **Waar zichtbaar** | **`/horizon`** — één geïntegreerde tijdas vervangt drie aparte ingangen. Touch-support voor mobile. **`/horizon/whatif`** en **`/horizon/doorrekening-test/*`** — redirects naar `/horizon`. |
| **Waarom** | Drie aparte horizon-oppervlakken (landing, whatif, doorrekening) zijn verwarrend. Eén manipuleerbare tijdas is een PocketSmith-achtig mentaal model dat veel intuïtiever is dan formulieren. |

### 2.4 Insights-actie-audit (4 features)

| | |
|---|---|
| **Wat verandert** | Alle KPI-widgets en insight-cards worden geaudit en geclassificeerd als "observatie" (legitiem zonder actie — bijv. netto vermogen, fase-bar) of "insight" (moet actie-link hebben). Observatie-widgets worden NIET geforceerd van een CTA voorzien. Insight-cards zonder actie krijgen een link naar de relevante pagina. Widgets zonder duidelijk doel worden gemarkeerd voor review. |
| **Waar zichtbaar** | **Dashboard, `/core`, `/will`, `/horizon`** — insight-cards krijgen klikbare CTA's ("Budget aanpassen", "Bekijk scenario's"). Observatie-widgets blijven ongewijzigd. |
| **Waarom** | Informatie zonder handelingsperspectief is ruis. Maar observaties (vermogensgrafiek, fase-bar) zijn wél legitiem — de audit maakt het onderscheid expliciet. |

### 2.5 Monte Carlo confidence band (3 features)

| | |
|---|---|
| **Wat verandert** | De Monte Carlo simulatie-resultaten (5000 paths, al berekend in `phase-monte-carlo.ts`) worden gevisualiseerd als gradient confidence band op de tijdas. Twee lagen: p10-p90 (licht) en p25-p75 (donkerder), met p50 als centrale lijn. Hover toont exacte percentielwaarden. De band is optioneel aan/uit te zetten. |
| **Waar zichtbaar** | **`/horizon` tijdas** — gradient band rond de projectielijn, breder wordend naar rechts (meer onzekerheid). Purple-thema consistent met Horizon. |
| **Waarom** | Een enkele projectielijn suggereert valse zekerheid. De confidence band communiceert eerlijk: "dit is het bereik van uitkomsten." De data was er al — alleen de visualisatie ontbrak. |

### 2.6 Chat Wft-disclaimer (4 features)

| | |
|---|---|
| **Wat verandert** | Bij eerste chatgebruik verschijnt een Wft-disclaimer (accepteren vereist, eenmalig). De AI geeft nooit directe koop/verkoop-aanbevelingen — alleen educatieve informatie. Een subtiele footer-tekst onder het invoerveld herinnert permanent. Chat krijgt uitgebreide structured outputs: mini-charts, vergelijkingstabellen, scenario-visualisaties naast tekst. |
| **Waar zichtbaar** | **ChatPanel** (floating, overal) — eenmalige disclaimer-modal, permanente footer-tekst, visuele cards in chatberichten. |
| **Waarom** | Nederlands financieel product zonder Wft-vergunning mag geen advies geven. De disclaimer is juridisch noodzakelijk. De visuele cards maken complexe antwoorden begrijpelijker. |

### 2.7 PSD2 promotie + categorisatie (6 features)

| | |
|---|---|
| **Wat verandert** | De bestaande PSD2/Open Banking flow wordt prominent aangeboden in de onboarding ("aanbevolen" / "snelste weg"). Na import worden transacties automatisch gecategoriseerd op basis van bekende patronen (Albert Heijn → Boodschappen). Gebruikers reviewen suggesties via een 'Voorgesteld' badge. Het systeem leert van correcties: corrigeer Bol.com één keer, en toekomstige Bol.com-transacties krijgen automatisch de juiste categorie. Ongecategoriseerde transacties worden gegroepeerd voor bulk-categorisatie. |
| **Waar zichtbaar** | **Onboarding** — prominente PSD2-kaart. **Na onboarding** — eerste suggestie als bank niet gekoppeld is. **`/core/cash`** — 'Voorgesteld' badges op transacties, bulk-categorisatie UI, leer-feedback loop. |
| **Waarom** | Handmatig categoriseren is de grootste bron van frictie. Auto-categorisatie met leer-loop vermindert het werk drastisch en maakt budgetteren bruikbaar voor normale gebruikers. |

### 2.8 Cashflow prominenter op /core + /will (4 features)

| | |
|---|---|
| **Wat verandert** | Cashflow krijgt een eigen hero-tegel op `/core` met budget-gezondheidsstatus (groen/amber/rood). Op `/will` worden VasteKostenAnalyse, spaarquote-widget en uitgaventrends gegroepeerd in één herkenbare 'Cashflow'-sectie. Het kompas-icoon voor cashflow linkt naar deze sectie op `/will` (analyse), niet naar `/core/budgets` (registratie). |
| **Waar zichtbaar** | **`/core`** — cashflow-tegel in hero-gebied met kleurstatus. **`/will`** — gebundelde Cashflow-sectie. |
| **Waarom** | Architectuurbesluit: cashflow blijft binnen Kern (geen 4e tab), maar wordt prominenter. Drie bestaande plekken worden benut: registratie (Kern), analyse (Wil), projectie (Horizon). |

### 2.9 Settings hybride opsplitsing (6 features)

| | |
|---|---|
| **Wat verandert** | Het 2459-regel settings-monster wordt ontmanteld via het hybride model: **4 verhuizingen** — FIRE-parameters → `/horizon` inline, Widget-instellingen → dashboard/`/will` edit-mode, Rebalancing → `/core/assets`, Module-toggles → blijven. **1 herstructurering** — overblijvende cross-cutting settings (Notificaties, Weergave, Gegevens, Privacy, Toelichting, Huishouden) worden tabs in plaats van accordions. |
| **Waar zichtbaar** | **`/horizon`** — inline FIRE-parameter edit. **Dashboard/`/will`** — widget edit-mode. **`/core/assets`** — rebalancing settings. **`/identity/instellingen`** — sterk gereduceerd, alleen cross-cutting concerns als tabs. |
| **Waarom** | Module-specifieke instellingen horen bij hun context ("FIRE op Horizon is logisch"). Cross-cutting settings blijven samen op één overzichtelijke plek. Het resultaat: van 8 accordions naar 6 tabs, en de pagina krimpt met ~60%. |

---

## Fase 3: Compositie & Content (16 features)

Bestaande bouwstenen combineren met nieuwe content-lagen.

### 3.1 Onboarding velden inkorten (5 features)

| | |
|---|---|
| **Wat verandert** | Elke onboarding-stap krijgt minder verplichte velden (max 2-3 per stap). Optionele velden hebben een expliciete 'Later invullen' optie. Uitgestelde velden worden bijgehouden en na onboarding als suggesties aangeboden (via coach-bubble). De voortgangsindicator werkt correct bij minimale input — de flow voelt compleet. Validatie blokkeert alleen bij verplichte velden. |
| **Waar zichtbaar** | **Onboarding flow** — minder velden per stap, 'Later invullen' links, snellere doorloop (<3 min). **Na onboarding** — uitgestelde items als suggesties. |
| **Waarom** | De onboarding is al teruggebracht van 10 naar 6 stappen, maar binnen elke stap zijn er nog te veel velden. Het "later invullen"-pad verlaagt de drempel tot registratie zonder informatie te verliezen. |

### 3.2 GlossaryTerm wrapper (4 features)

| | |
|---|---|
| **Wat verandert** | Een nieuw `<GlossaryTerm>` component wrapat financieel jargon met hover/tap tooltips. Content komt uit dezelfde bron als de ConceptFlipCards in `/identity/gids` (één bron van waarheid). Eerder geziene termen krijgen subtielere styling, nieuwe termen vallen meer op. Het component wordt toegepast op ~15 hoofdpagina's voor termen als FIRE, SWR, Box 3, diversificatie, rebalancing. |
| **Waar zichtbaar** | **Alle hoofdpagina's** — jargontermen krijgen stippellijn-onderstreping. Hover/tap toont korte uitleg. Geen visuele overload: alleen echte jargontermen worden gewrapped. |
| **Waarom** | "FIRE", "SWR", "fictief rendement" zijn onbekend voor 90% van de NL-bevolking. Inline uitleg verlaagt de kennisdrempel zonder de pagina te veranderen. |

### 3.3 Tips visueel koppelen aan hefboom (3 features)

| | |
|---|---|
| **Wat verandert** | Elke aanbeveling/tip in De Wil toont een hefboom-icoon (bezittingen/schulden/cashflow/belasting). Een mapping-tabel koppelt bestaande type_tags (`budget_optimization` → cashflow, `debt_acceleration` → schulden) aan de 4 hefbomen. Gebruikers kunnen filteren op hefboom via chips. |
| **Waar zichtbaar** | **`/will`** — hefboom-icoon per tip, filter-chips bovenaan de lijst met aantallen per hefboom. |
| **Waarom** | Tips zonder domein-context ("verlaag uitgaven") voelen generiek. Het hefboom-icoon maakt onmiddellijk duidelijk welk financieel domein geraakt wordt. |

### 3.4 Scenario-bibliotheek presets (4 features)

| | |
|---|---|
| **Wat verandert** | Vier NL-specifieke scenario-presets worden toegevoegd aan de scenario-functie op `/horizon`: **Kind krijgen** (kinderopvang ~€1500/mnd, kinderbijslag, minder werken), **Huis kopen** (overdrachtsbelasting 2%, hypotheeklasten, wegvallende huur), **ZZP starten** (wegvallend inkomen, aanloopperiode, zelfstandigenaftrek, pensioenreservering), **Deeltijd werken** (procentuele inkomensdaling, effect op spaarquote). Elk preset vult realistische NL-defaults in die aanpasbaar zijn. |
| **Waar zichtbaar** | **`/horizon` scenario-sectie** — 4 preset-kaarten met één-klik-activatie. Na selectie verschijnen defaults die de gebruiker kan fine-tunen. Impact direct zichtbaar in de FIRE-projectie. |
| **Waarom** | De what-if functie is krachtig maar vereist dat gebruikers zelf bedragen invullen. Presets met realistische NL-defaults maken scenario-planning toegankelijk voor iedereen. |

---

## Fase 4: Nieuw bouwen (20 features)

Volledig nieuwe componenten en functionaliteiten.

### 4.1 Vier-hefbomen-kompas (8 features)

| | |
|---|---|
| **Wat verandert** | Een nieuw compact kompas-component in de shell-header toont 4 mini-indicatoren voor de financiële hefbomen: **Bezittingen** (asset health / groeitrend), **Schulden** (aflosvoortgang / schuldenvrij-status), **Cashflow** (budget + spaarstatus), **Belasting** (Box 3 optimalisatie). Elke indicator is kleurgecodeerd (groen/amber/rood/grijs). Hover toont mini-samenvatting. Klikken navigeert naar de relevante pagina — asymmetrisch: bezittingen → `/core/assets`, schulden → `/core/debts`, cashflow → `/will`, belasting → `/core/belasting`. Bij ontbrekende data toont de indicator een neutrale grijze staat met 'Start' hint. Op mobile collapsed het kompas tot 4 gekleurde dots; tappen opent expanded view. |
| **Waar zichtbaar** | **App shell-header** — altijd zichtbaar op elke pagina. Desktop: 4 mini-gauges. Mobile: 4 compacte dots met expandable overlay. |
| **Waarom** | Architectuurbesluit: het kompas is een inhoudelijke quick-access door de Kern/Wil/Horizon-lagen heen. Het beantwoordt "hoe sta ik ervoor per domein?" zonder navigatie. Modules blijven de gating-laag; het kompas is de status-laag. |

### 4.2 "Wat zie ik hier?"-knop (4 features)

| | |
|---|---|
| **Wat verandert** | Een info-knop (ⓘ) verschijnt rechtsboven in de hero-sectie van alle ~15 hoofdpagina's. Klikken opent een popover met 2-3 zinnen uitleg: wat toont deze pagina, welke acties zijn mogelijk, hoe past het in het geheel. Elke pagina heeft unieke content (geen generieke placeholder). De positie is consistent op elke pagina. |
| **Waar zichtbaar** | **Alle hoofdpagina's** — rechtsboven in hero: `/dashboard`, `/core`, `/core/assets`, `/core/debts`, `/core/cash`, `/core/budgets`, `/core/belasting`, `/will`, `/horizon`, `/identity`, en subpagina's. |
| **Waarom** | Nieuwe gebruikers begrijpen niet altijd wat een pagina doet of wat de volgende stap is. Eén knop met uitleg voorkomt afhaken zonder de interface te vervuilen. |

### 4.3 Dramatic visualisaties (5 features)

| | |
|---|---|
| **Wat verandert** | Drie impact-visualisaties als pilot: **Fee-erosie** (twee groeilijnen: hoge vs lage TER over 30 jaar), **Samengestelde interest** (exponentiële groeicurve, nadruk op versnelling in latere jaren), **Inflatie koopkrachtverlies** (€1000 vandaag → X over 30 jaar, geframed in verdampende vrijheidsdagen). Alle visualisaties gebruiken user-specifieke data. Ze bouwen zich progressief op (animated reveal) voor dramatisch effect. Ze zijn bereikbaar via relevante insight-cards in de app. |
| **Waar zichtbaar** | **Insight-cards** op `/core/assets`, `/will`, `/horizon` — link naar visualisatie. **Visualisatie-view** — full-screen animatie met progressive reveal (<3 sec), daarna interactief. |
| **Waarom** | Financiële concepten als fee-erosie en compound interest zijn abstract. Een dramatische visualisatie met eigen data maakt het impact voelbaar — "dit kost je 4 jaar vrijheid" is krachtiger dan een percentage. |

### 4.4 Jargon-vervanging (3 features)

| | |
|---|---|
| **Wat verandert** | Een centrale vertaaltabel koppelt ~20+ financiële jargontermen aan toegankelijke alternatieven (bijv. 'SWR' → 'Opnamestrategie', 'Box 3' → 'Vermogensbelasting'). Op Core module pagina's worden de belangrijkste termen vervangen. De oorspronkelijke vakterm blijft altijd beschikbaar via GlossaryTerm tooltip — er gaat geen informatie verloren voor gevorderde gebruikers. |
| **Waar zichtbaar** | **`/core`, `/core/assets`, `/core/debts`, `/core/budgets`, `/core/cash`, `/core/belasting`** — jargontermen tonen de toegankelijke variant met tooltip voor het origineel. Uitbreidbaar naar andere modules. |
| **Waarom** | De app moet professioneel aanvoelen maar niet intimiderend. Toegankelijke termen met tooltip-fallback bedienen zowel beginners ("Wat is Box 3?") als gevorderden ("Ik wil de exacte vakterm zien"). |

---

## Architectuurbesluiten (samenvatting)

Drie principekeuzes die de features ondersteunen:

### Besluit 1: Cashflow — hybride binnen Kern

Cashflow wordt **niet** gepromoveerd tot 4e tab. In plaats daarvan:
- Registratie: `/core/budgets` (behoudt huidige positie)
- Analyse: `/will` (nieuwe gebundelde cashflow-sectie)
- Projectie: `/horizon` (bestaand via savings-rate)
- Kompas: cashflow-icoon linkt naar `/will`

### Besluit 2: Kompas naast modules (toevoeging)

Het vier-hefbomen-kompas is een **status-laag** (altijd zichtbaar in shell-header). Modules blijven de **gating-laag** (configuratie in instellingen/onboarding). Drie systemen, elk op eigen oppervlak: kompas overal, tabs in navigatie, modules in configuratie.

### Besluit 3: Settings — hybride opsplitsing

Module-specifieke settings verhuizen naar hun context:
- FIRE → `/horizon`
- Widgets → dashboard edit-mode
- Rebalancing → `/core/assets`

Cross-cutting settings (Notificaties, Weergave, Gegevens, Privacy) blijven samen op `/identity/instellingen` als tabs.

---

## Bewust niet opgenomen

**T2-13 Modus Kijken/Plannen** — Het plan zelf twijfelt over deze feature. Een tweede gating-laag (kijken vs plannen) naast de bestaande modules riskeert dezelfde verwarring als het eerder opgeruimde sovereignty-systeem. Kan later heroverwogen worden na evaluatie van het kompas.

---

## Impact per pagina (snelle referentie)

| Pagina | Wat verandert |
|---|---|
| **Shell/header** | + Vier-hefbomen-kompas (altijd zichtbaar) |
| **Alle pagina's** | + "Wat zie ik hier?" info-knop (ⓘ) rechtsboven |
| **`/dashboard`** | Briefing wordt compacte versie + link naar `/will` |
| **`/core`** | + Gezondheidsscore in hero + Netto-vermogen-tijdslijn tot pensioen + Cashflow hero-tegel |
| **`/core/assets`** | + Rebalancing-instellingen (verhuisd uit settings) |
| **`/core/cash`** | + Auto-categorisatie badges + bulk-categorisatie + leer-feedback |
| **`/core/belasting`** | + GlossaryTerm tooltips op jargon |
| **`/will`** | + Briefing als hoofdwidget + cadence-toggle + Cashflow-sectie gebundeld + hefboom-iconen op tips + hefboom-filter |
| **`/horizon`** | + Tijdas drag/drop + inline what-if + inline doorrekening + scenario-overlays + MC confidence band + FIRE-parameters inline + UPO-upload kaart + 4 scenario-presets |
| **`/horizon/whatif`** | Redirect → `/horizon` |
| **`/horizon/doorrekening-test/*`** | Redirect → `/horizon` |
| **`/identity/instellingen`** | Sterk gereduceerd: alleen cross-cutting als tabs |
| **Onboarding** | Minder verplichte velden + "Later invullen" + UPO-upload optie + PSD2 prominent |
| **Na onboarding** | Coach-bubble met contextuele eerste actie |
| **ChatPanel** | + Wft-disclaimer + permanente footer + visuele cards + geen advies |
| **Insight-cards** | + Links naar dramatic visualisaties (fee-erosie, compound interest, inflatie) |

---

> *99 features, 59 met dependencies, aangemaakt op 17 mei 2026.*
> *Gebaseerd op: UX-onderzoek "Van overdaad naar gerichte vrijheid" + delta-audit + drie architectuurbesluiten.*
