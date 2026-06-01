# /toekomst — Tijdas als landing + 4 navigatiekaarten

**Datum:** 2026-06-01
**Status:** Goedgekeurd (ontwerp), klaar voor implementatieplan
**Module:** De Toekomst (Horizon, paars)

## Probleem & doel

`/toekomst` gebruikt nu een segmented-control met 5 tabs (Tijdas · Doelen ·
Gebeurtenissen · Voorkeuren · Rekenhulp), client-side gestuurd via `?tab=`.
De gebruiker wil dit vervangen door het patroon van het **vier-hefbomen-kompas
op `/overzicht`**:

1. De **tijdas is de landingspagina** — je komt er direct op uit (geen tab meer).
2. **Doelen, Gebeurtenissen, Voorkeuren en Rekenhulp worden kaarten** zoals de
   hefbomen op `/overzicht` — elk met een **status** en een **KPI** — die naar
   hun eigen subpagina linken.

Het verhaal blijft consistent met `/overzicht`: dezelfde status-codering
(groen/amber/rood/neutraal), dezelfde kaart-anatomie (icoon in getinte box,
grote KPI in `font-serif tabular-nums`, status-dot, substext).

## Genomen beslissingen (door gebruiker bevestigd)

- **Navigatiemodel:** eigen subpagina's — `/toekomst/doelen`,
  `/toekomst/gebeurtenissen`, `/toekomst/voorkeuren`, `/toekomst/rekenhulp`
  (exacte parallel met hefbomen → `/overzicht/{x}`). Bookmarkbaar, schone URL.
- **Plaatsing:** kaartenrij **bovenaan**, boven de tijdas (precies waar de
  tab-balk stond).
- **KPI/status per kaart:** zie tabel hieronder. Alleen **Doelen** krijgt een
  betekenisvolle kleur-status; de andere drie zijn config/inhoud → neutrale dot.

## Architectuur

### Routing

| Route | Inhoud |
|---|---|
| `/toekomst` (landing) | kop/datum → `ToekomstNavCards` (4 kaarten) → `HorizonPage` (tijdas) |
| `/toekomst/doelen` | `← Terug naar tijdas`-header → `DoelenView` |
| `/toekomst/gebeurtenissen` | `← Terug`-header → `GebeurtenissenView` (behoudt `?strategie=aow\|pensioen\|huis`) |
| `/toekomst/voorkeuren` | `← Terug`-header → `VoorkeurenView` |
| `/toekomst/rekenhulp` | `← Terug`-header → `RekenhulpView` |

- `components/future/toekomst-tabs.tsx` wordt **verwijderd** (incl. de
  placeholder-cards en `toekomst-tabs.test.tsx`).
- Elke nieuwe subpagina is een **server component** die exact dezelfde data
  laadt als de huidige `ToekomstPage` voor die view (zie Data-flow). De zware
  per-view data (`strategieData`, `prefill`, `simSnapshot`, `potBalances`,
  `aowRows`, volledige `custom_calculators`) verhuist mee naar de subpagina →
  **de landing wordt lichter**.

### Gedeelde shell voor subpagina's

Een kleine gedeelde header-component (bv. `ToekomstSubpageShell` of een
eenvoudige `← Terug naar tijdas`-link bovenaan elke subpagina) zorgt voor een
consistente terugweg naar de tijdas-landing. Volgt de bestaande
editorial-header-stijl (kicker + serif-titel) zoals andere subpagina's.

### De navigatiekaarten — `components/future/toekomst-nav-cards.tsx`

Visueel 1-op-1 met `components/overview/overzicht-hero/hefbomen-nav.tsx`
(`HefbomenNav`):

- `grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3`
- Per kaart: `rounded-2xl border bg-[var(--paper)]`, hele kaart is een `Link`.
- **Status-dot** rechtsboven (`absolute right-2.5 top-2.5 w-2 h-2 rounded-full`),
  kleuren uit dezelfde `STATUS_DOT`-map (`emerald-500`/`amber-500`/`red-500`/
  `stone-300`).
- Icoon in getinte box (`w-8 h-8 sm:w-9 sm:h-9 rounded-lg`).
- Label (`text-sm sm:text-base font-semibold`).
- **KPI** groot (`font-serif font-semibold tabular-nums text-base sm:text-lg`).
- Status-substext (`text-[11px]`), kleur volgt status.

In tegenstelling tot `HefbomenNav` géén chevron-drilldown — de hele kaart
navigeert naar de subpagina (de "detail" is de subpagina zelf).

> Implementatiekeuze: een **nieuw component** (niet generaliseren van
> `HefbomenNav`), want de data-bron en per-kaart-logica verschillen. Visuele
> taal wordt gespiegeld; eventueel worden `STATUS_DOT`/`STATUS_LABEL` +
> `statusTextClass` gedeeld via een klein helper-bestand om duplicatie te
> vermijden.

### KPI + status per kaart

| Kaart | Icoon (tint) | KPI (groot) | Status-dot | Substext |
|---|---|---|---|---|
| **Doelen** | `Target` (violet) | `3 doelen` / `Geen` | **echt**: slechtste actieve doel (groen=alles op koers, amber=≥1 aandacht, rood=≥1 achter) | "1 vraagt aandacht" / "Allemaal op koers" / "Stel je eerste doel in" |
| **Gebeurtenissen** | `CalendarClock` (amber) | `5 gebeurtenissen` / `Geen` | neutraal | "Volgende: Kind · 2028" / "Nog niets gepland" |
| **Voorkeuren** | `SlidersHorizontal` (sky) | eindstrategie-naam, bv. `Vermogen behouden` | neutraal | "Vast 4% · SWR 3,4%" |
| **Rekenhulp** | `Calculator` (emerald) | `4 rekenhulpen` / `Geen` | neutraal | "Nieuwe met Will" / "Nog geen rekenhulpen" |

**Status-afleiding Doelen** (hergebruik bestaande logica uit `DoelenView` /
`OverzichtHero`): koppel `goals[i]` met `goalProgresses[i]`, negeer voltooide
(`pct >= 100`); status = `red` als een actief doel `!onTrack && pct < 50`,
`amber` als `!onTrack && pct >= 50`, anders `green`. Geen actieve doelen →
`neutral` + substext "Stel je eerste doel in".

**KPI Voorkeuren:** `STRATEGY_LABELS[fireStrategy.strategy].name` als grote KPI;
substext combineert de onttrekkingsstrategie-naam + `formatPct(fireParams.effectiveSwr)`.

**Volgende event (Gebeurtenissen):** eerstvolgende event op `target_date`
(of `target_age` → jaar) ná nu; toon naam + jaartal. Geen toekomstige events →
"Nog niets gepland".

### Data-flow

De **landing** heeft voor de kaarten genoeg aan data die de tijdas toch al
laadt + één lichte count:

- Doelen-KPI: `willData.goals` + `willData.goalProgresses` (uit `loadWillData`).
- Gebeurtenissen-KPI: `horizonData.events`.
- Voorkeuren-KPI: `horizonData.fireStrategy`, `horizonData.withdrawalStrategy`,
  `horizonData.fireParams`.
- Rekenhulp-KPI: `count`-query op `custom_calculators` (alleen aantal; geen
  volledige rijen op de landing).

De landing hoeft `aowRows`, `prefill`, `strategieData`, `simSnapshot`,
`potBalances` en de volledige `savedCalculators` **niet** meer te laden — die
verhuizen naar de respectievelijke subpagina's:

- `/toekomst/doelen`: `loadWillData` (goals + goalProgresses).
- `/toekomst/gebeurtenissen`: `loadHorizonData` + `loadDashboardData` +
  `aow_leeftijd`-query → `events`, `currentAge`, `annualSavings`, `strategieData`
  (baseline uit `effectiveInput`, `dailyExpenses`, `aowRows`, `dateOfBirth`,
  `grossYearlyIncome`).
- `/toekomst/voorkeuren`: `loadHorizonData` + `loadDashboardData` → `fireParams`,
  `fireStrategy`, `withdrawalStrategy`, `fireAge`, `simRows`,
  `regelSimSnapshot`, `regelVoorkeuren`, `potBalances`.
- `/toekomst/rekenhulp`: `loadHorizonData` (voor `prefill`) +
  volledige `custom_calculators`-query.

(De exacte prop-opbouw wordt 1-op-1 overgenomen uit de huidige `ToekomstPage`
regels 42–157 en per view gesplitst.)

### Redirect-strategie (backwards compatibility)

Om de ~30 bestaande `?tab=`-deeplinks niet stuk voor stuk te hoeven herschrijven,
krijgt de **`/toekomst` server-page** een redirect-guard bovenaan:

```
searchParams.tab in {doelen, gebeurtenissen, voorkeuren, rekenhulp}
  → redirect naar /toekomst/<tab>, met alle overige query-params behouden
    (bv. ?tab=gebeurtenissen&strategie=aow → /toekomst/gebeurtenissen?strategie=aow)
```

**Niet** redirecten wanneer `tab` ontbreekt: `?strategie=open`, `?whatif=open`,
`?uitgaven=open` zijn tijdas-modal/pane-params en blijven op `/toekomst`.

Daarnaast worden de **canonieke bronnen** direct naar de nieuwe routes gezet
(geen dubbele redirect-hop):

- `lib/nav-config.ts` (regels ~83–92): subnav-items → `/toekomst/doelen` etc.
- `components/app/shell/sidebar.tsx` (regels ~173–180): `subTags` → idem.
- `next.config.ts` (regel ~72): `/identity/parameters` →
  `/toekomst/voorkeuren` (i.p.v. `?tab=voorkeuren`).
- `app/(app)/toekomst/strategie/page.tsx` (regel ~15): redirect →
  `/toekomst/gebeurtenissen?strategie=${key}` (i.p.v. `?tab=…&strategie=…`).

Alle overige `?tab=`-links (briefing-engine, onboarding-orchestrator,
guide-horizon-uitleg, privacy-overview, strategie-modal, off-track-doelen-lijst,
bibliotheek, doorrekening-test, event-pane-view) blijven werken via de
redirect-guard. Optioneel mogen de meest zichtbare later naar directe routes,
maar dat is geen blocker.

## Affected files (migratie)

**Nieuw:**
- `app/(app)/toekomst/doelen/page.tsx`
- `app/(app)/toekomst/gebeurtenissen/page.tsx`
- `app/(app)/toekomst/voorkeuren/page.tsx`
- `app/(app)/toekomst/rekenhulp/page.tsx`
- `components/future/toekomst-nav-cards.tsx`
- (optioneel) `components/future/toekomst-subpage-shell.tsx`
- `components/future/toekomst-nav-cards.test.tsx`

**Gewijzigd:**
- `app/(app)/toekomst/page.tsx` — verwijder `ToekomstTabs`, render
  `ToekomstNavCards` + `HorizonPage`; voeg redirect-guard toe; laad alleen de
  lichte KPI-data + count; plaats de `PrintTijdasButton` in de landing-header
  (die zat voorheen in `ToekomstTabs`). De `print-tijdas-button.tsx`-component
  zelf hoeft niet te wijzigen — alleen het gebruik verhuist.
- `lib/nav-config.ts` — subnav → nieuwe routes.
- `components/app/shell/sidebar.tsx` — `subTags` → nieuwe routes.
- `next.config.ts` — `/identity/parameters` → `/toekomst/voorkeuren`.
- `app/(app)/toekomst/strategie/page.tsx` — redirect → nieuwe gebeurtenissen-route.

**Verwijderd:**
- `components/future/toekomst-tabs.tsx`
- `components/future/toekomst-tabs.test.tsx`

**Te auditen (verifiëren, mogelijk aanpassen):**
- `lib/regression-tests/suites/navigatie.ts` (+ andere suites) op `?tab=`-asserts.
- `components/future/doelen-view.test.tsx`, `gebeurtenissen-view.test.tsx`,
  `voorkeuren-view.test.tsx` — `usePathname`-mocks → nieuwe routes; verifiëren
  dat ze slagen.
- `lib/command-palette/navigation-index.ts` — *optioneel*: 4 sub-route-entries
  toevoegen (en bestaande `/horizon`-links eventueel naar `/toekomst`).
- `lib/page-info-content.ts` — *optioneel*: `PAGE_INFO`-entries voor de 4 nieuwe
  routes.

## Testen & verificatie

- **Unit:** `toekomst-nav-cards.test.tsx` — rendert 4 kaarten met juiste hrefs,
  KPI-tekst en status-dot-kleur (groen/amber/rood/neutraal) voor representatieve
  datasets (incl. lege staten).
- **Redirect:** test dat `/toekomst?tab=voorkeuren` → `/toekomst/voorkeuren`
  redirect en dat `?tab=gebeurtenissen&strategie=aow` de `strategie`-param
  behoudt; dat `?strategie=open` (zonder tab) **niet** redirect.
- **Bestaande view-tests** blijven groen (eventueel pathname-mocks bijwerken).
- `npx tsc --noEmit` schoon.
- Relevante vitest-paden + regressiesuites groen.
- Visuele check: landing toont kaarten boven tijdas; klik → subpagina; terug
  → tijdas; deeplinks (briefing/onboarding/guide) komen op de juiste subpagina.

## Buiten scope

- Inhoudelijke wijzigingen aan de views zelf (`DoelenView` etc.) — ze worden
  1-op-1 hergebruikt.
- Wijzigingen aan de tijdas (`HorizonPage`) zelf, behalve dat hij nu direct op
  de landing rendert.
- Command-palette `/horizon`→`/toekomst` opschoning (pre-existing; optioneel).

## Filosofie / consistentie

- Status-codering identiek aan hefbomen-kompas (groen/amber/rood/neutraal).
- Geldbedragen in `font-mono`/`font-serif tabular-nums`.
- Editorial tokens (`var(--ink*)`, `var(--border-ed)`, `var(--paper)`,
  `var(--subtle)`); module-accent paars (Horizon) waar gepast.
- "Geld is opgeslagen tijd" blijft de afsluitende tagline op de landing.
