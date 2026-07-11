# Patroon-kaarten — UI/UX-skill (TriFinity)

> Deel van de `ui-ux`-skill. Bewuste, niet-universele editorial patronen + shell-componenten. Activeer alleen wanneer het paginatype erom vraagt. Zie ook `quality-checklist.md` en `page-blueprints.md`.

## Patroon-kaarten (optionele editorial elementen)

Bewuste, niet-universele patronen. Activeer alleen wanneer het paginatype erom vraagt. **Uitzondering:** de eerste kaart (*Editorial pagina-opening*) is juist wél de standaard — dé aanhef van app-pagina's.

**Component eerst, recept als toets.** Veel kaarten zijn geïmplementeerd in `components/editorial/` — gebruik dan de component en schrijf het recept niet opnieuw inline: Pull-quote → `PullQuote` + `HL`/`HLNeg` · Figures-strip → `FiguresStrip` · Scenario-callout → `ScenarioCallout` · Rekening-tag → `RekeningTag` · Toggle-pill → `TogglePill` · Comparison-row → `ComparisonRow` · Romeinse numbering → `RomanSection`/`SectionLabel` · Ornament-colophon → `OrnamentColophon` · kicker/headline/deck/highlight → `Kicker`/`EditorialHeadline`/`EditorialDeck`/`HighlightMark`. De CSS-details hieronder zijn de specificatie (voor review en voor de zeldzame plek zonder component).

### Editorial pagina-opening (standaard-aanhef) ⭐
- **Toepassen op**: **elke app-pagina-opening** — dit is de standaard (door de gebruiker gevalideerd op budget, vaste-lasten, forecast, transacties, jul 2026). Hub-, lijst- en analyse-pagina's openen zó, niet met een kaart/doos.
- **Niet toepassen op**: modals/sheets (eigen header-spec), forms/wizard-stappen (Type 4), de marketing-/landingpagina (eigen clamp-maatvoering) en dashboard-widgets (`WidgetShell`).
- **Opbouw** (in deze volgorde, container `<header className="relative space-y-3">`):
  1. **Hairline-kicker-rij**: `flex flex-wrap items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--module-active-700)]` met vóór de tekst een streep `inline-block h-px w-7 shrink-0` in `var(--module-active-500)` (`aria-hidden`).
  2. **Narratieve Playfair-H1**: `font-bold leading-tight tracking-[-0.02em] text-[28px] sm:text-[36px] md:text-[44px]` in `var(--font-playfair, serif)`, geformuleerd als korte vraag/zin in "Geld is opgeslagen tijd"-geest, met precies één `<em className="font-normal italic">`-accentwoord in `var(--module-active-700)`. **Let op**: dit is bewust de líchtere maatvoering — niet `EditorialHeadline` (font-black/leading-0.95) hergebruiken.
  3. **Optionele deck**: `<EditorialDeck>` (redactionele intro, 1-2 zinnen).
  4. **Optioneel hairline-cijferblok**: `border-t border-[var(--border-ed)] pt-4` met sub-kicker, hoofdcijfer via `<MaskedAmount>` (mono/tabular is default) `text-[32px] sm:text-[40px] font-bold text-[var(--ink)]` + eenheid, en italic Source Serif sub-meta (vrijheidstijd-equivalent). **Alleen** wanneer de pagina een canoniek, al geconsumeerd hoofdcijfer heeft (consume-don't-recompute!) én de sectie eronder dat cijfer niet al als KPI toont — anders weglaten (dubbeling, zie forecast).
- **Verboden**: gradient-kaart-dozen (`bg-gradient-to-br … border … shadow`) als pagina-kop; meer dan één `<em>`-accent; Tailwind-standaardkleuren; een tweede kop-variant naast deze binnen dezelfde routefamilie.
- **Referentie-implementaties**: `components/overview/cashflow-editorial-header.tsx` (herbruikbaar composiet, kicker+H1+deck), `BudgetEditorialHeader` in `components/app/budgets-client.tsx` en de kop in `components/overview/vaste-lasten-client.tsx` (beide mét cijferblok).
- **NavStackMeta** blijft de nav-titel leveren — dat is géén duplicaat van deze kop (budget/transacties doen beide).

### Inline info-disclosure (content-rijke i-uitleg)
- **Toepassen op**: blok-niveau i-uitleg met formules, lijsten of meerdere paragrafen (dekkingsradar, guardrail-kompas, levensinkomenstrook, scenario-kaarten, Vrijheidsas).
- **Niet toepassen op**: pagina-niveau uitleg van één alinea — dat is `PageInfoButton` (popover, `components/editorial`). **Keuzeregel: popover voor één alinea, inline-disclosure voor lijsten/meerdere paragrafen.**
- **Component**: `InlineInfoDisclosure` (`components/editorial/inline-info-disclosure.tsx`) — i-knop `h-7 w-7 rounded-full border-[var(--border-ed)] bg-[var(--paper)]` met `aria-expanded` én focus-visible-ring, plus inline uitklap-paneel (`border-l-[3px] border-l-[var(--color-horizon-500)]` op `--paper-2`). Gebruik de component; herimplementeer het recept niet inline — vijf losse kopieën zijn in jul 2026 precies hierom gesaneerd.

### Pull-quote met inline highlights
- **Toepassen op**: narratieve pagina's met menselijk verhaal (gids-intro, briefing-opener, jaarafsluiting, will-narratief, rapportage-conclusie) **en** scenario-output-samenvattingen bovenaan kassabonnen/analyses.
- **Niet toepassen op**: data-pagina's zonder narratieve laag, dashboards, lijsten, forms.
- **Implementatie container**: `relative border-t border-b border-[var(--ink)] py-5 pl-7 mb-7`, body `font-serif italic font-normal text-lg sm:text-xl leading-snug text-[var(--ink)]`. Quote-mark (linker bovenhoek): `absolute -top-2 -left-1 font-serif font-black not-italic text-[40px] sm:text-[56px] md:text-[80px] text-[var(--module-active-500)] leading-none`. Op `<380px`: padding-left 14px, body-text 14.5px, quote-mark 40px.
- **Inline highlight-types**:
  - *Concept-highlight* (regelnaam, parameter): `font-bold not-italic text-[var(--module-active-700)]` — bv. "**70%-regeling**", "**jaar 10**".
  - *Bedrag-positief*: `font-bold not-italic text-[var(--module-active-700)]` of `text-[var(--positive)]`.
  - *Bedrag-negatief*: `font-bold not-italic text-[var(--negative)]`.
  - *Hoofduitkomst-bedrag* (samenvattings-anker): combineer concept-highlight `text-[var(--module-active-700)]` MET highlight-marker `bg-[linear-gradient(transparent_60%,var(--module-active-200)_60%)]` — alleen op het hoogtepunt-bedrag, max één per quote.

### Figures-strip (4-kolommen-summary)
- **Toepassen op**: kassabon-modals, scenario-output-pagina's, analyse-conclusie-blokken, jaaroverzicht-headers, asset-detail mini-hero.
- **Niet toepassen op**: dashboard-widgets (gebruik `WidgetShell`), tabel-rijen, lijst-items, forms.
- **Implementatie container**: `grid grid-cols-2 sm:grid-cols-4 border-t border-b border-[var(--ink)] my-6`. Per kolom: `p-4 sm:p-5 border-r border-[var(--rule-soft)] last:border-r-0`. Op mobile rij-borders: `nth-child(-n+2):border-b`.
- **Kicker**: `text-[10px] uppercase tracking-[0.20em] text-[var(--ink-3)] mb-1.5 font-mono`.
- **Bedrag**: `font-serif font-black text-[22px] sm:text-[28px] leading-none tracking-[-0.02em] tabular-nums` (Playfair, niet DM Mono — uitzondering voor figures-strip). Kleurcodering: neutraal `text-[var(--ink)]`, negatief `text-[var(--negative)]`, positief `text-[var(--positive)]`, **eindresultaat/winnaar** `text-[var(--ink)]` MET highlight-marker. Eén per strip.
- **Sub-meta**: `font-serif italic text-[11px] text-[var(--ink-3)] mt-1.5`.
- **Optionele teken-prefix** voor positieve uitkomst: `+€` zoals `+€203.375`.
- **Bedrag + kwalificatie inline** (`items-baseline`) binnen een kolom-cel: altijd `flex-wrap` + `gap-x`/`gap-y`, nooit kaal `flex` — euro-bedragen van 6-7 cijfers overschrijden anders de mobile-grid-kolombreedte.

### Gesegmenteerde katern-kaart (interne hairline-koppen)
- **Toepassen op**: een katern met méérdere nauw verwante, gelijksoortige en (deels) conditionele duidingsblokken die als één geheel moeten lezen — bv. katern III "Wat het betekent" op /toekomst (Levensinkomenstrook + Guardrail-kompas + Dekkingsradar + Scenario's naast elkaar).
- **Niet toepassen op**: content-groepen met elk een eigen karakter, doel of interactiemodel — daar geldt kop-bóven-kaart (h2 + subtitel boven een eigen `card-editorial`, zoals katern II op /toekomst). Ook niet voor dashboard-widgets (`WidgetShell`) of lijsten.
- **Implementatie container**: één `card-editorial no-hover-lift divide-y divide-[var(--border-ed)]`; per segment een `div.p-4 sm:p-5` met de kop-rij (`h2.label-editorial` + evt. status-chip, `mb-1`) en subtitel (`font-sans text-[12px] text-[var(--ink-3)] mb-3`) **ín** het segment. `no-hover-lift` is verplicht — het vat is zelf niet klikbaar, dus geen hover-lift-kliksignaal.
- **Conditionele segmenten**: render als `{cond && <div>…}` — React rendert `false` niet, dus `divide-y` plaatst nooit wees-hairlines bij ontbrekende segmenten. Laat het `SectionLabel` en de kaart één gedeelde OR-conditie gebruiken zodat label en inhoud altijd sámen verschijnen of verdwijnen.
- **Kop-laag per segment** (twee lagen, in deze volgorde): (1) de canonieke `<Kicker className="mb-1">JARGONNAAM</Kicker>` uit `components/editorial` (brengt de verplichte 28×1px module-streep + `--module-active-700` mee — géén inline font-mono-`<p>` nabouwen); (2) een narratieve **vraag** als `h2` in **Playfair** (`font-display text-[14px] font-semibold leading-snug text-[var(--ink)]`) — nooit `font-serif` (= Source Serif = body). Daaronder de subtitel (`font-sans text-[12px] text-[var(--ink-3)] mb-3`). De vraag draagt de betekenis, de kicker draagt de vakterm: "Hoeveel kun je veilig uitgeven?" boven kicker GUARDRAIL-KOMPAS.
- **Kies-regel**: verwante analyses die samen één vraag beantwoorden → één gesegmenteerde kaart; blokken met een eigen doel of route → losse kaarten met koppen erboven.

### Categorie-app-tab hero-band (KPI-paper-blok)
- **Toepassen op**: categorie-app-tabs binnen een module-categorie-pagina (`?tab=<appKey>`) — bv. crypto Holdings, investment Holdings, cash Budgetteren, mortgage Aflosstrategie, plus de standalone equivalenten op `/core/budgets`, `/core/assets/holdings`. Geldt ook voor andere "app"-tabs die een KPI-balk als entry-point hebben.
- **Doel**: de KPI-balk leest als afgebakend hero-blok (paper-bg + harde ink-borders), maar **respecteert de tab-padding** zodat z'n outer-rand exact gelijk is aan tabs, charts, panels en tabellen op dezelfde tab. Geen blok mag visueel breder of smaller zijn dan een ander — uniformiteit zoals op `/core/budgets`.
- **Niet toepassen op**: items-tab (lijst-content houdt normale tab-padding zonder hero-band), detail-pagina's (Type 3 — eigen header), forms/wizards (Type 4 — eigen layout), empty-state-blokken (geen hero-band-suggestie wanneer er geen data is).
- **Implementatie** (in de tab-component of de page-component die de tab rendert):
  ```tsx
  <div className="space-y-8">
    {/* hero-band: paper-blok binnen host-padding */}
    <section className="border-t border-b border-[var(--ink)] bg-[var(--paper)] px-4 py-5 sm:px-6 sm:py-7">
      {/* KPI-balk / figures-strip (kicker + period-toggle + cellen) */}
    </section>

    {/* overige secties zonder eigen wrapper-padding — host levert via px-4 sm:px-6 */}
    <ChartSection />
    <PanelSection />
    <ListSection />
    <TransactionsSection />
  </div>
  ```
- **Geen `-mx-4 sm:-mx-6`-truc**: een eerdere versie van deze kaart liet de KPI-band uitbreken naar volle `max-w-6xl`-breedte. Dat gaf een 24px overshoot t.o.v. tabs en charts en leverde een visuele inconsistentie op (paper-bg breder dan de rest-content). Verworpen — de hero-band blijft binnen de host-padding.
- **Geen aparte rest-wrapper**: de overige secties hangen rechtstreeks aan de top-level `space-y-8`. Een tweede wrapper met eigen `px-4 sm:px-6` zou dubbel inspringen veroorzaken (host levert al). De `space-y-8` op de top-level levert ook de gap onder de hero-band — geen `pt-8` nodig.
- **Border-keuze**: `border-t border-b border-[var(--ink)]` (harde ink-border) — niet de zachte `--border-ed`. De hero-band moet als duidelijk afgebakend "blok" lezen, niet als subtiele scheiding.
- **Padding-keuze hero-band**: `px-4 py-5 sm:px-6 sm:py-7` — verticaal matched met `CategoryHero` in `asset-category-page.tsx`; horizontaal komt de KPI-content na host-padding (24px) plus paper-padding (24px) = 48px van max-w-6xl rand. De **outer-rand** van de paper-band lijnt uit met tabs/charts (X=161 op 1441px viewport); de **content** binnen de paper-band staat 24px ingedrukt t.o.v. tabs. Dit verschil is acceptabel en spiegelt budgetten waar de heroChild ook met `px-4` ingedrukt is.
- **KPI-strip zelf** (bv. `crypto-kpi-strip.tsx`) draagt **geen** eigen `border-b` of `bg-paper` meer — dat zit op het host-section-blok. De inner-wrapper blijft een simpele `<div className="space-y-4">` voor het ritme tussen kicker-rij + cellen + collapsible details.
- **Sub-strips onder een toggle** (P&L, risico, fiscaal): blijven binnen het paper-blok wanneer de toggle openstaat — de hero-band rekt dan natuurlijk mee. Geen aparte band per sub-strip.
- **Niet stapelen**: één hero-band per tab. Bouw geen tweede paper-band onder de KPI-balk voor sub-secties (bv. "Performance" of "Verdeling") — die secties leven binnen de gewone tab-padding zonder eigen ink-borders. Reden: meer dan één hero-band per scherm vlakt de hiërarchie af.
- **Verificatie**: meet via DevTools de outer-rand van paper-band, tablist en eerste rest-sectie. Alle drie moeten dezelfde X-coördinaten hebben (op 1441px viewport: L=161, R=1265, W=1104). Als het paper-blok breder oogt → `-mx-` is per ongeluk geslopen of een aparte rest-wrapper drukt dubbel in.
- **Wrapper-eigenaarschap**: tab-componenten leveren nooit `mx-auto max-w-*` of `px-*` op hun outer-div. Dat is de verantwoordelijkheid van de host (server-page voor standalone gebruik, category-page voor embedded). Dual-purpose clients (zoals `BudgetsClient` op `/core/budgets` én in de cash-tab, `HoldingsPage` op `/core/assets/holdings` én in de investment-tab) wrappen hun standalone gebruik in het server-page-bestand (`app/(app)/core/budgets/page.tsx`, `app/(app)/core/assets/holdings/page.tsx`). Bij embedded gebruik in een category-app-tab voldoet de host-padding van `asset-category-page.tsx` (regel 494: `<div className="px-4 sm:px-6">`). Reden: alleen zo lijnen alle blokken (tabs, KPI-band, charts, lijsten, tabellen) uit op dezelfde outer-X — geen `-mx-4 sm:-mx-6` breakout-trucs meer.

### Scenario-callout / regime-info
- **Toepassen op**: bovenaan kassabonnen, scenario-output, regime-vergelijkingen — uitleg van de geactiveerde regel/instelling die het scenario bepaalt.
- **Niet toepassen op**: generieke info-tekst, tooltips, hints in forms.
- **Implementatie**: `bg-[var(--paper)] border border-[var(--ink)] border-l-4 border-l-[var(--module-active-500)] p-3 sm:p-4 mb-5 font-serif text-sm leading-snug text-[var(--ink-2)]`. **Strong-tag** voor regelnaam: `font-serif italic font-bold not-italic text-[var(--ink)]` — bv. "*Box 1 — Tijdelijke verhuur (70%-regeling):*". Geen kicker — de callout zelf is de kicker. Op `<380px`: padding 10px 12px, font-size 12.5px.

### Rekening-tag uit de rand
- **Toepassen op**: kassabon-modals, breakdown-cards op summary-pagina's (jaaroverzicht, rapportage-segmenten), scenario-output-cards.
- **Niet toepassen op**: `WidgetShell` (kicker doet dat al), forms, lijst-items, dashboard-widgets — twee labels = chaos.
- **Implementatie**: container `relative pt-6 overflow-visible`, `::before` met `content: '{label}'; position: absolute; top: -10px; left: 16px; padding: 0 8px; background: var(--paper); font-family: var(--font-playfair); font-style: italic; font-size: 11px; color: var(--ink-3); white-space: nowrap`. Tag-breedte <40% van containerbreedte. Op `<640px`: `left: 14px; font-size: 10.5px`.

### Toggle-pill aan/uit
- **Toepassen op**: scenario-toggles, wat-als-knoppen, density-switches, optionele fiscale parameters in calculator-flows.
- **Niet als checkbox-vervanger in forms** — gebruik `<Switch>`/`<Checkbox>` met label voor formulier-velden. Pill is voor *visuele wat-als-toggling*, niet voor *form-state*.
- **Implementatie aan**: `inline-flex items-center bg-[var(--ink)] text-[var(--paper)] px-2 py-0.5 rounded-full font-mono text-[10px] font-semibold uppercase tracking-[0.15em] border border-[var(--ink)]`. **Uit**: `bg-transparent text-[var(--ink-3)] border border-[var(--rule-soft)]`. **Wrapper**: `min-h-[44px] flex items-center` voor touch-target. Tap-highlight: `-webkit-tap-highlight-color: transparent`.

### Comparison-row module-highlight
- **Toepassen op**: scenario-vergelijkingstabellen, wat-als-output, before/after-overzichten, regime-comparisons.
- **Implementatie**: huidige/geselecteerde rij krijgt `bg-[var(--module-active-100)]/40 border-l-[3px] border-[var(--module-active-500)] -mx-2 px-3`. Padding-left minimaal 12px. Andere rijen blijven `bg-transparent`.

### Range-slider thumb
- **Toepassen op**: native `<input type=range>` voor scenario-parameters, what-if-knoppen, budget-sliders.
- **Implementatie**: `::-webkit-slider-thumb` en `::-moz-range-thumb`: `width: 16px; height: 16px; background: var(--module-active-500); border: 2px solid var(--ink); border-radius: 50%; cursor: pointer`. Track: `height: 2px; background: var(--ink)` (3px op `<640px`). Mobile (`@media (pointer:coarse)`): thumb 18px, border 1.5px. Hover: `transform: scale(1.2)` + thumb-fill naar `var(--module-active-700)`.

### Sleep-affordance op overflow-tabellen
- **Toepassen op**: tabellen die op `<640px` horizontaal scrollen.
- **Implementatie**: container `relative`, `::before` met `content: 'sleep →'; position: absolute; top: 14px; right: 14px; font-family: var(--font-dm-mono); font-size: 8.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--module-active-500); background: var(--paper); padding: 1px 6px; border: 1px solid var(--rule-soft); z-index: 2; pointer-events: none; transition: opacity 0.2s`. Verbergen via `[data-scrolled="true"]::before { opacity: 0 }` zodra `scrollLeft > 0`.

### Gestreepte legenda-patronen
- **Toepassen op**: print-mode, accessibility-kritische legenda's waar kleur niet voldoende is.
- **Niet als default**: voor digitale weergave is OKLCH shade-variatie scherper en mobile-vriendelijker.
- **Implementatie**: `background: repeating-linear-gradient(45deg, var(--module-active-500) 0, var(--module-active-500) 3px, var(--module-active-700) 3px, var(--module-active-700) 6px)`. Swatch-grootte: 14×14px (10×10px op `<640px`).

### Body radial-gradient (`bg-editorial`)
- **Toepassen op**: editorial pagina's (gids, jaaroverzicht, briefing, hero-secties) als optionele utility-class.
- **Niet als default body-bg**: dashboards en data-pagina's blijven plat `var(--bg)` voor maximale leesbaarheid.
- **Implementatie**: `.bg-editorial { background-image: radial-gradient(circle at 20% 10%, color-mix(in oklch, var(--color-wil-500) 4%, transparent) 0%, transparent 40%), radial-gradient(circle at 80% 80%, color-mix(in oklch, var(--color-horizon-500) 5%, transparent) 0%, transparent 45%); }`. Op mobile (`<640px`): opacity halveren (4→2%, 5→3%).

### Romeinse sectie-numbering
- **Toepassen op**: long-form editorial met ≤4 secties (gids-stappen, jaaroverzicht-blokken, will-narratief-fases). Vaste sectie-set, geen dynamische lengte.
- **Niet toepassen op**: dashboards, lijsten, forms, settings, dynamische rapportages (kan vii. worden — onhandig).
- **Implementatie**: section-label is een grid-row met label-links + cijfer-rechts: `<div className="flex items-center justify-between border-b border-[var(--rule-soft)] mb-6 pb-2"><span className="text-[10px] uppercase tracking-[0.22em] text-[var(--module-active-500)]">{label}</span><span className="font-serif italic text-sm text-[var(--module-active-700)]">{romanNumeral}.</span></div>`. Op `<380px`: cijfer `text-xs`. Op `<320px`: verbergen.

### Sidebar (variant A — desktop shell)
- **Toepassen op**: persistente verticale navigatie op `≥lg` (1024px+). Productie-implementatie in `components/app/shell/sidebar.tsx`.
- **Niet toepassen op**: mobile (<lg) — daar levert `MobileStackShell` de chrome; sidebar rendert `null` via `hidden lg:flex`.
- **Implementatie**: `position: fixed; left: 0; top: var(--header-height); width: 264px` expanded, `64px` collapsed (icon-rail). Toggle-state in `localStorage` per device via `lib/hooks/use-sidebar-collapsed.ts` — sluit aan bij plan §9 Q7.
- **Inhoud-volgorde** (top-naar-bottom): branding-rij (`tf.` + ⌘K-skeleton) → kicker `DRIE MODULES` met streep → modules-lijst (Kern · Wil · Horizon, gating-aware via `getActiveNavModules()`) → kicker `overige` (lowercase italic) → secundaire bestemmingen (Berichten, Nieuws, Rapportages, Tools) → spacer → profiel-pill in footer.
- **Active-state**: linker accent 3px in `--module-active-500` + bg-tint `bg-[var(--module-active-50)]/40` op de actieve module-rij. Inline tag-strip onder active module met **alleen categorieën** (Kern: `Bezittingen · Schulden`; Horizon: `Wat-Als · Doorrekening`). Géén apps in tag-strip — apps zijn in-page `?tab=`-segmented.
- **Module-uit (gedimd)**: zie patroon-kaart *Module-fallback in shell*.
- **Portal-mount**: Sidebar wordt via `createPortal(document.body)` gerenderd vanuit `ResponsiveShell` om `ChatLayoutWrapper`'s `contain: layout` te ontwijken. Anders zou `position: fixed` relatief aan de wrapper komen te staan.

### Mobile TopBar (binnen tray-of-three)
- **Toepassen op**: bovenrand van mobile-stack-shell (<lg). Productie-implementatie in `components/app/shell/top-bar.tsx`.
- **Niet toepassen op**: desktop — daar levert de Sidebar oriëntatie.
- **Implementatie**: hoogte 48px (zonder meta-strook) of 72-80px (met module-meta-strook op tab-roots). Safe-area-padding boven via `env(safe-area-inset-top)`.
- **Lay-out**: ←-knop links (44×44 touch, alleen bij stack-diepte > 1) → titel midden → max 2 actions rechts.
- **Titel-typografie**: Inter 14px medium met `tabular-nums` indien numeriek. **Niet Playfair** — voelde te zwaar in Fase 0.0-validatie. Module-meta-strook (saldo of subtitel) eronder gebruikt italic Source Serif 13px.
- **Animatie**: TopBar zit *binnen* de animation-layer van de tray, niet sticky t.o.v. viewport. Schuift mee bij stack-push/pop. Bij scroll van content blijft hij aan de top van zijn tray.
- **A11y**: `aria-live="polite"` op de titel zodat screen-readers de nieuwe pagina aankondigen na transitie. ←-knop heeft `aria-label="Terug"` + native button.

### Slide-in pane (desktop)
- **Toepassen op**: doorklik vanuit een lijst naar een entiteit-detail die naast de lijst zichtbaar moet blijven (transactie binnen budget, holding-edit binnen overzicht). Productie-implementatie in `components/app/shell/slide-in-pane.tsx`.
- **Niet toepassen op**: modules-overzichten, categorie-pagina's (vervangen content-area volledig), of mobile (<lg, daar wordt het stack-push).
- **Implementatie**: `transform: translateX(100%) → 0` over 240ms `cubic-bezier(0.32, 0.72, 0, 1)`. Breedte `lg:w-[560px] xl:w-[680px]`. Geen dim-overlay — wel rand-schaduw `shadow-[-12px_0_32px_rgba(0,0,0,0.08)]`.
- **Volle viewport-hoogte**: pane reikt van `top: 0` tot `bottom: 0`. De shell rendert geen `AppHeader`; de pane loopt dus tot bovenaan de viewport door — dat geeft visuele ruimte voor een prominente close-affordance bovenin én voorkomt een lege strook waar voorheen `top: var(--header-height)` werd gebruikt.
- **Standaard content-padding**: SlideInPane levert via een inner-wrapper standaard `px-7 py-6 lg:px-8 lg:py-7` rondom `{children}`. Consumers van `<ShellOverlay kind="pane">` renderen daarom **geen eigen outer padding** meer op het top-level child binnen de pane. Innerlijke section-padding (cards, dividers, sticky headers met eigen full-width-vereisten) mag uiteraard wél aan de consument blijven. Wanneer een consumer een full-width element direct onder de pane-header nodig heeft (accent-streep, gradient-header, sticky tabs), is dat een patroon dat de default body-padding niet kan opvangen — dergelijke pane-content blijft conservatief en houdt zelf padding totdat het patroon expliciet ondersteund wordt.
- **Standaard ←-knop linksboven**: pane-header rendert **altijd** een ←-affordance links. Wanneer de consumer een eigen `onBack`-handler doorgeeft (sub-mode binnen pane, bv. catalog → edit), wordt die aangeroepen; ontbreekt `onBack`, dan valt de knop terug op `onClose`. ✕ rechtsboven (44×44) blijft als secundaire close-affordance — sommige flows tonen op back een bevestiging, X is dan een snelle exit. `aria-label` schakelt tussen `"Terug"` (met `onBack`) en `"Sluiten"` (zonder).
- **Standaard footer-bar (`primaryAction` / `secondaryAction`)**: pane-footer-slot levert sticky `primary` (solid `bg-[var(--ink)]` + `text-[var(--paper)]`) en `secondary` (outline `border-2 border-[var(--ink)]`) knoppen. Knoppen worden **links uitgelijnd** (`justify-start`) met **primary eerst (links), secondary erna**. Bewust afwijkend van platform-conventie (rechts) om visuele overlap met de zwevende chat-FAB rechtsonderin (`z-50`) te voorkomen — de pane staat op `z-40` zodat de chat-bubble erbovenin blijft floaten, en links-uitgelijnde knoppen vallen ruim weg van die bubble. Slot staat **buiten** de overflow-y-scroll-div in de pane-flex-column → blijft staan tijdens scrollen. **Opt-in per pagina**: alleen wanneer minimaal één van de twee actions is doorgegeven, verschijnt de footer (geen lege bar bij read-only panes). Mobile-fallback (BottomSheet) krijgt dezelfde footer-knoppen via een `footerSlot`-prop, full-width met `flex-1` per knop, **identieke volgorde primary-secondary** zodat het mental-model over breakpoints heen klopt. Touch-target ≥44px (`min-h-11`). Inter-font, `disabled:opacity-50 disabled:cursor-not-allowed`. Loading-state op primary toont `"Opslaan …"` en blokkeert click. Type-definitie:
  ```ts
  type PaneAction = {
    label: string
    onClick: () => void
    disabled?: boolean
    loading?: boolean
    /** Tooning: 'primary' (default, solid ink), 'secondary' (outline), 'destructive' (text-link rood). */
    variant?: 'primary' | 'secondary' | 'destructive'
    /** Optioneel icoon links van het label (lucide-react). */
    icon?: React.ReactNode
  }
  ```
- **Geen inline action-knoppen — ALLE actie-knoppen horen in de footer-bar**: dit geldt voor zowel **edit-mode** (Opslaan / Annuleren / Bijwerken) als **view-mode** (Bewerken / Verwijderen) als **catalog-mode** (Volgende / Terug). Geen `[Bewerken]` of `[Verwijderen]` knop direct onder een figures-strip of body-content rendderen — dat verstoort de visuele afsluiting van de pane en laat ze "zweven" boven witruimte. Footer-bar is de **enige** plek waar primary, secondary en destructive acties verschijnen. Uitzondering: kleine inline icon-actions binnen een lijstitem (bv. ✎ bewerk-icoontje per row) — die zijn rij-context, geen pane-action. Voor view-mode: pas de wrapper-component (bv. EventPane, AssetPane) aan zodat de child via een actions-callback `onActionsChange` de relevante `primaryAction`/`secondaryAction` doorgeeft aan de `ShellOverlay` — zelfde patroon als de edit-flow al gebruikt.
- **Sluiten**: ✕ rechtsboven (44×44), `Esc`-toets, klik op overlay-rand, of browser-back. URL-bron is altijd query-state uit `OVERLAY_QUERY_KEYS` — pane leest `useSearchParams()` en opent automatisch.
- **A11y**: focus-trap actief (hergebruik `useFocusTrap` uit `bottom-sheet.tsx:7`), initial-focus op veilig element (annuleer-knop of eerste leesbare regio — nooit destructive), return-focus naar trigger. Sub-overlays binnen pane (sheet of confirm) krijgen *eigen* focus-trap die de pane-trap pauzeert.
- **Reduced motion**: `prefers-reduced-motion: reduce` → instant-show, geen translate.

### Entity detail-pane met mode-switch (view ↔ edit)
- **Toepassen op**: detail-flows voor één entiteit binnen een lijst — bv. levensgebeurtenis (`event-pane`), bezitting (`asset-pane`), schuld (`debt-pane`). De wrapper schakelt tussen **view** (read-only weergave + KPI's) en **edit** (form) zonder de pane te sluiten. Eén `<ShellOverlay kind="pane">` voor beide modi; mode leeft in lokale state.
- **Footer-keuze per mode**:
  - **view**: `primaryAction` = "Bewerken" (switch naar edit), `secondaryAction` = de meest gebruikte aanvullende actie op deze entiteit (bv. "Herwaarderen" voor assets, "Saldo bijwerken" voor debts, "Verwijderen" voor events).
  - **edit**: `primaryAction` = "Opslaan" / "Bijwerken" (gepubliceerd via `onActionsChange` door de form-child), `secondaryAction` = "Annuleren" (terug naar view bij bestaand item, sluit pane bij create).
- **Kern-actie in beide modi bereikbaar**: een actie die het primaire **doel** van de entiteit dient (bv. herwaardering bij bezittingen — gebruikers willen de waarde bijwerken zonder eerst alle velden te bewerken) mag niet wegvallen achter een mode-switch. Houd de actie:
  - in **view-mode** als `secondaryAction` in de footer (prominent),
  - in **edit-mode** als **header-action icon** in `<ShellOverlay actions={…}>` (zodat de footer vrij blijft voor Opslaan/Annuleren),
  - in **beide gevallen** opent dezelfde sub-overlay (`kind="sheet"` voor herwaardering, `kind="confirm"` voor delete).
- **Form-child publiceert save-state via callback**: edit-component accepteert `onActionsChange?: (state: { canSave, saving, isEditing, save }) => void`. Wrapper houdt de meest recente state in `useState`, leidt daaruit `primaryAction` af. Save-handler in de child gebruikt een `useRef` om stale closures te voorkomen — zie `event-pane-edit.tsx:379-392` als canonical referentie.
- **Embedded-mode op de body-componenten**: de standalone modal-componenten (`AssetDetailModal`, `AssetForm`, `DebtDetailModal`, `DebtForm`, …) blijven hun eigen `BottomSheet`/`ShellOverlay`-wrapper en inline action-bar renderen voor backward-compat. Voeg een `embedded?: boolean` prop toe — wanneer true skippen ze hun wrapper en hun inline action-knoppen, en renderen alleen de body. De pane-wrapper leveert dan de overlay + footer-knoppen.
- **Sub-overlays als sibling**: herwaardering, delete-confirm en vergelijk-modals worden naast (`<>{ pane }{ subOverlay }</>`) de detail-pane gerenderd, niet als child binnen de pane-content. Reden: focus-trap, scroll-lock en `Esc` werken per overlay; nesting zou de host-pane sluiten bij Esc op de sub-overlay.
- **URL-state**: deeplink via `OVERLAY_QUERY_KEYS` (`asset`, `debt`, `event`, …). Pane-wrapper leest `useSearchParams()` en opent automatisch wanneer de id in URL staat. `onClose` ruimt de query-param op via `router.replace()` — geen history-vervuiling.

### ShellOverlay (driewegregel)
- **Toepassen op**: alle modal-achtige UI buiten de pure shell-chrome. Eén canonical wrapper in `components/app/shell/shell-overlay.tsx`. Geen directe `BottomSheet`-imports buiten deze wrapper (uitzondering: sandbox).
- **Drie kinds met regel**:
  - `kind="pane"` — *"ergens naartoe gaan"*. Eigen oriëntatie nodig, meerdere data-secties. Rendert `SlideInPane` op desktop, stack-push op mobile. Voorbeelden: budget-detail, scenario-modals, fase-analyses. **Content-padding** wordt door de pane geleverd (`px-7 py-6 lg:px-8 lg:py-7`) — consumers renderen geen eigen outer padding op het top-level child; zie patroon-kaart *Slide-in pane (desktop)* voor de details en uitzonderingen. **Standaard footer-bar**: geef `primaryAction` en/of `secondaryAction` (`PaneAction`-type) door aan `<ShellOverlay kind="pane">` — beide rendermodi (desktop SlideInPane + mobile BottomSheet-fallback) renderen identieke sticky save/cancel-knoppen onderaan. Footer is opt-in: zonder acties geen bar. Edit/create-flows binnen een pane gebruiken **altijd** deze footer in plaats van inline knoppen onderin de form-content.
  - `kind="sheet"` — *"even iets snel doen"*. Single-form, terugkeer-context. Rendert via `BottomSheet` (responsive `md:max-w-*`). Voorbeelden: opzeggen, herwaardering, jaar-inspectie.
  - `kind="confirm"` — *"onomkeerbare bevestiging"*. Smal centered modal `max-w-sm` met focus-trap, type-to-confirm bij destructive. Voorbeelden: delete-asset, account-verwijdering.
- **Beslis-flowchart**: heeft de gebruiker eigen oriëntatie nodig (multi-section, eigen back-stack)? → pane. Anders: snelle actie met retour naar dezelfde context? → sheet. Bevestiging van iets onomkeerbaars? → confirm.
- **A11y**: alle drie kinds verplicht focus-trap, return-focus, `inert` op achtergrond. Hergebruik `useFocusTrap` patroon uit `bottom-sheet.tsx:232-276`.
- **Verbod**: parallel modal-systemen bouwen ("ConfirmDialog", "DetailDrawer", etc.). Eén wrapper, drie kinds — uitbreiden via prop, niet via nieuwe component.

### Hoek-anker-element naast sluitknop (geen overlap)
- **Toepassen op**: overlays, kaarten en meldingen die een decoratief hoek-element (avatar, badge, icoon) rechtsboven verankeren én óók een sluitknop (×) rechtsboven tonen — bv. de coach-melding met avatar.
- **Probleem**: anker-element en sluitknop claimen allebei dezelfde rechterbovenhoek en botsen (overlap), omdat ze onafhankelijk op `right-*` zijn geplaatst.
- **Regel**: plaats de sluitknop vrij links van het anker-element. **Vrije rechter-offset van de × ≥ (`right`-offset van het anker + breedte van het anker + ~4-8px grid-marge).** Verplaats de **knop**, niet het anker — het anker heeft vaak een bewuste positie (bv. top-anchored zodat het niet meedrift bij content-groei).
- **Voorbeeld uit de codebase**: coach-melding — avatar op `right:0.625rem` (10px) + 36px breed → linkerrand van de avatar ligt op ~46px vanaf de rechterrand; de sluitknop staat daarom op `right-14` (56px) i.p.v. `right-2.5` (10px), zodat hij vrij links van de avatar valt.

### Page action-bar (Bitvavo-stijl)
- **Toepassen op**: edit/create-form-pagina's die buiten een pane leven (full-page form-routes), én overzicht-pagina's met een primaire CTA die altijd zichtbaar moet blijven tijdens scrollen (bv. "Volgende" in een onboarding-stap, "Toevoegen" in een list-pagina met veel scroll). Dezelfde primary/secondary affordance als de pane-footer (`SlideInPane.primaryAction`), maar dan voor standalone-pagina's.
- **Niet toepassen op**: read-only pagina's zonder save-context, dashboards/widget-grids, list-pagina's met paginering en geen save-actie. Niet gebruiken naast een geopende pane: de pane-footer (`z-40`) heeft voorrang en de page-bar (`z-30`) zou daaronder verdwijnen — kies één affordance per scherm-staat.
- **API**: `<PageActionBar primaryAction={…} secondaryAction={…} />` uit `components/app/page-action-bar.tsx`. Beide actions volgen het `PaneAction`-type (`{ label, onClick, disabled?, loading? }`) zodat het patroon één-op-één identiek is met de pane-footer.
- **Mobile-rendering** (<lg): registreert via bestaande `MobileBottomBarLive` met `kind: 'action-bar'`. De tray-of-three vervangt de tab-rij door de action-bar zolang de pagina gemount is. Geen eigen DOM op mobile — alle styling komt van de mobile shell.
- **Desktop-rendering** (≥lg): `position: fixed` strip onderaan de viewport met `bottom-0`, `lg:left-[264px]` (matcht sidebar-padding), `right: var(--chat-sidebar-width, 0px)` (reserveert ruimte naast geopende chat-panel). Hergebruikt SlideInPane-footer styling (border-top, paper/95-bg + backdrop-blur, primary solid + secondary outline, min-h-11 touch-target). Knoppen worden **links uitgelijnd** (`justify-start`) met **primary eerst (links), secondary erna** — gelijk aan de pane-footer en om visuele overlap met de zwevende chat-FAB rechtsonderin te voorkomen.
- **Mobile-volgorde wijkt af**: `MobileBottomBarLive` → `MobileBottomBar` rendert action-bars als `[secondary, primary]` (secondary links, primary rechts). Die volgorde wordt door meer flows gebruikt dan alleen PageActionBar, dus we trekken 'm bewust niet gelijk om elders geen regressie te veroorzaken. Resultaat: PageActionBar mobile = `[secondary, primary]`, desktop = `[primary, secondary]`. Een toekomstige refactor kan dit gelijktrekken zodra de impact op andere `MobileBottomBar`-consumers is geëvalueerd.
- **Z-index**: desktop-strip op `z-30` — bewust LAGER dan SlideInPane (`z-40`) en zwevende FAB's (chat-panel, activation-button op `z-50`). Reden: als een pagina én een PageActionBar toont én een pane opent, moet de pane-footer voorrang krijgen — alleen één primary-knop per zichtbare zone. Zwevende FAB's blijven boven beide; daarom worden zowel pane-footer als page-action-bar links uitgelijnd om overlap met de chat-bubble te vermijden.
- **Spacer**: PageActionBar voegt geen auto-spacer toe onder de page-content. Pagina's die laatste-content-afdekking willen voorkomen voegen zelf `pb-20 lg:pb-24` of vergelijkbare bottom-padding toe onder hun laatste sectie.
- **Sidebar-collapse**: `lg:left-[264px]` is hardcoded (matcht `desktop-sidebar-shell.tsx`). Bij collapsed sidebar (64px) blijft 200px gap links — bewust geaccepteerd, gelijk aan de bestaande `<main>`-padding-keuze. Toekomstige `--sidebar-width` CSS-var migreert beide tegelijk.

### Module-fallback in shell
- **Toepassen op**: sidebar-entry's en bottom-nav-tabs voor modules die uit staan (zie `isModuleActive()` en `getActiveNavModules()` in `lib/module-registry.ts`).
- **Niet stilzwijgend verbergen** — gebruiker moet zien dat de module bestaat maar uit staat (CLAUDE.md fallback-regel).
- **Sidebar-entry (desktop)**: gedimde rij zonder accent-streep, met daaronder een italic Source Serif voetregel `"Activeer in Instellingen"` (`text-[11px] text-[var(--ink-3)]`) — zie de implementatie in `components/app/shell/sidebar.tsx`. Geen module-tag-strip eronder.
- **Bottom-nav-tab (mobile)**: gedimd icon + label op `text-[var(--ink-4)]`, `opacity-60`; klik leidt naar de instellingen (module-activatie), niet naar de module-route.
- **Categorie-app-tabs binnen module**: bestaande tip-strip (`tipStripCopy` uit `category-deepening-registry.ts`) + teaser blijven zoals nu — die zitten één laag dieper.

