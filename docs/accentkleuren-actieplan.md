# Instelbare accentkleuren — onderzoek & actieplan

*Datum: 2026-06-12 · Status: fasen 1-4 uitgevoerd (zie "Uitvoering & besluiten" onderaan)*

## Aanleiding

Op `/mijn/uiterlijk` (onder "Geavanceerd") kan de gebruiker drie accentkleuren
instellen — Overzicht (`kern`), Will & acties (`wil`) en Toekomst (`horizon`).
Met de overgang naar de nieuwe IA (Overzicht/Toekomst/Mijn) is het *gebruik*
van die kleuren uit beeld geraakt: de keuze werkt technisch, maar op veel
nieuwe oppervlakken is er simpelweg niets meer dat de kleur draagt.

## Hoe het systeem werkt (en dat het wérkt)

De keten is intact, end-to-end:

1. **Kiezer** — `components/mijn/module-accent-picker.tsx` (8 swatches per accent).
2. **Runtime** — `components/app/module-color-provider.tsx` zet 132 CSS-vars
   (`--color-kern-50..950`, `--color-wil-*`, `--color-horizon-*`, budget, fase)
   op `document.documentElement`.
3. **Tailwind v4** — `@theme` in `app/globals.css:296-331` mapt die vars naar
   utility-classes: **`bg-kern-500`, `text-wil-700`, `border-horizon-200` e.d.
   volgen dus de gebruikerskeuze**. Alleen *standaard*-Tailwindkleuren
   (`emerald-*`, `violet-*`, `amber-*`, …) en losse hexen volgen níet.
4. **Persistentie** — debounced `PUT /api/appearance` → `profiles.module_colors`
   + `profiles.budget_colors` (eigen rij, RLS).
5. **Server-side** — `app/(app)/layout.tsx:376-394` leest het profiel en bakt
   de vars als inline styles in de eerste render (geen kleurflits).
6. **Route-accent** — `--module-active-*` (default = neutrale ink-shades,
   `globals.css:117-133`) wordt per route-layout overschreven:
   `/overzicht` → kern, `/toekomst` → horizon (+ legacy `/core`, `/will`,
   `/horizon`). Sidebar, top-bar en mobile-bottom-bar kleuren hierop mee.

## Waar de accenten vandaag zichtbaar zijn

| Oppervlak | Status |
|---|---|
| Sidebar / mobile-nav / top-bar (actieve items, module-iconen) | ✅ volgt keuze via `--module-active-*` |
| `/overzicht`-layout (kicker-strepen, markers, mini-networth-chart) | ✅ kern-accent |
| `/toekomst`- en `/horizon`-layout + horizon-SVG-charts (`compound-interest-chart`, `health-score-receipt`) | ✅ horizon-accent |
| WidgetShell-accentbalk + kicker (`module`-prop) | ✅ volgt keuze (via Tailwind-tokens) |
| ModuleNav (tabbalk o.a. op /mijn) | ✅ volgt keuze (`text-wil-700` etc.) |
| Nieuws-categoriechips, berichten-badge | ✅ volgt keuze (module-tokens) |

## Waar het uit beeld is geraakt (de gaten)

**G1 — Toekomst-navigatiekaarten gebruiken vreemde kleuren.**
`components/future/toekomst-nav-cards.tsx:206-236`: icon-chips in
`violet/amber/sky/emerald` — vier Tailwind-standaardkleuren die de
horizon-keuze negeren, op een prominent oppervlak van /toekomst.

**G2 — Will & acties heeft geen route-accent.**
`/berichten`, `/nieuws` en `/mijn` hebben geen layout-override van
`--module-active-*` en vallen terug op neutrale ink-defaults
(bewust gedocumenteerd als "cross-module", `globals.css:117-122` — maar
geschreven vóór de nieuwe IA). Gevolg: de gekozen Will-kleur is vrijwel
nergens te zien behalve in de ModuleNav-tabs en een enkele badge. Ook de
Will-chat (`components/app/will/will-home.tsx`) is volledig ink/paper.

**G3 — Charts hardcoden hexen; de kleur-hooks liggen ongebruikt.**
`useModuleHex()` bestaat maar heeft 0 afnemers; `getBudgetHex`/`getPhaseHex`
idem. Voorbeelden: `horizon-cashflow-sankey.tsx` (vaste categorie-hexen),
cashflow-kalender (vast rood/groen),
`mini-networth-chart.tsx` (goede `var(--module-active-*)`-aanpak, maar met
hardcoded hex-fallbacks die bij refactors stilletjes kunnen gaan "winnen").

**G4 — Widget-binnenkanten en hero-kaarten op /overzicht.**
`HealthScoreCard`, `VoortgangDoelenCard`, briefing-categorieën en
hefboom-status-dots draaien op vaste stoplicht-/categoriekleuren. Deels
**terecht** (zie afbakening), maar decoratieve delen (ringen, balken,
icoon-chips zonder status-betekenis) kunnen het module-accent dragen.

**G5 — Dode takken in het systeem.**
Fase-kleuren (`PhaseColorConfig`) worden niet gepersisteerd en hebben geen
picker meer op /mijn/uiterlijk; `getBudgetHex` wordt nergens aangeroepen
terwijl de BudgetTintPicker wél bestaat (tints werken via CSS-vars, de
hook-route is dood).

## Afbakening (bewust NIET module-kleuren)

- **Semantiek blijft semantiek**: positief/negatief (`text-positive`/
  `text-negative`), stoplicht-status (op koers / aandacht / actie) en
  risico-rood zijn universele signalen — die mogen nóóit met de
  accentkeuze meebewegen.
- **Belasting-boxkleuren** (`--color-box1/2/3-*`) zijn functionele codering
  (amber/violet/teal) en blijven een eigen systeem.
- **Categoriekleuren** in de sankey zijn herkenbaarheid per categorie; die
  horen bij de categorie-tints, niet bij module-accenten.

## Actieplan

### Fase 1 — Quick wins, hoogste zichtbaarheid (klein, /kleine-aanpassing)
1. **Toekomst-nav-cards op horizon-tokens** (G1): vervang de vier
   standaard-Tailwind-tints door horizon-shades (of één horizon-tint voor
   alle vier — rustiger en consistent met de editorial-stijl).
2. **Sweep /toekomst + /overzicht op decoratieve standaardkleuren**:
   vervang accentgebruik zonder status-betekenis door module-tokens
   (o.a. fuchsia/sky-decoraties in de hero-omgeving).
3. **Mini-networth-chart fallbacks gelijktrekken**: fallback-hexen laten
   verwijzen naar de module-defaults of weglaten (de vars staan altijd).

### Fase 2 — Will-domein een gezicht geven (medium, /extend-feature)
4. **Route-accent voor Will & acties**: layout-wrapper voor `/berichten` en
   `/nieuws` die `--module-active-*` op wil-shades zet (zelfde patroon als
   `app/(app)/overzicht/layout.tsx`). Beslispunt: krijgt `/mijn` óók
   wil-accent of blijft die bewust neutraal? (Aanbeveling: wil-accent —
   de picker noemt de kleur "Will & acties" en de /mijn-tabs zijn al wil.)
5. **Will-chat accenteren**: avatar-ring, verzendknop, actieve states in
   `will-home.tsx`/ChatPanel op wil-tokens.
6. **Update de gedocumenteerde defaults** in `globals.css:117-122` zodat de
   route-lijst de nieuwe IA beschrijft.

### Fase 3 — Charts aan de hooks (medium)
7. **Recharts/SVG-charts** die module-identiteit dragen → `useModuleHex()`
   in plaats van hexen; begin bij de charts op /overzicht en /toekomst.
8. **Surplus/spaargroen ontdubbelen**: het hardcoded `#10b981` in de sankey
   vervangen door de semantische positief-token (geen module-kleur, wel
   één bron).

### Fase 4 — Borgen & opruimen (klein)
9. **Conventie vastleggen** in `design-principles.md` (+ CLAUDE.md-regel):
   *module-identiteit altijd via kern/wil/horizon-tokens of
   `--module-active-*`; nooit Tailwind-standaardkleuren voor accenten;
   semantiek (positief/negatief/status) blijft semantisch.*
10. **Dode takken beslissen** (G5): fase-kleuren-persistentie + picker
    terugbrengen óf de tak verwijderen; `getBudgetHex`/`getPhaseHex`
    gebruiken of schrappen.
11. **Optioneel — regressie-guard**: vitest die in module-oppervlakken
    (`components/future`, `components/overview/overzicht-hero`, widgets)
    waarschuwt bij nieuwe `emerald|violet|sky|fuchsia`-accentklassen op
    niet-semantische plekken.

## Inschatting

| Fase | Omvang | Risico |
|---|---|---|
| 1 | ~3 bestanden, puur classes | Zeer laag |
| 2 | 1 nieuwe layout-wrapper + 2-3 componenten | Laag (visueel reviewen) |
| 3 | 5-8 chartbestanden | Laag-middel (visueel reviewen) |
| 4 | docs + evt. cleanup | Zeer laag |

## Uitvoering & besluiten (2026-06-12)

- **Fase-kleuren (G5): besloten te LATEN STAAN, bewust niet-instelbaar.**
  Onderzoek wees uit dat de tak niet dood is: `--color-phase-*`-vars hebben
  levende afnemers (`jouw-pad-widget`, `persona-card`, `roadmap-modal`,
  `activation-button`) en `/mijn/profiel` laadt legacy `profiles.phase_colors`
  nog in de provider. Geen picker/persistentie terugbrengen (sovereignty =
  motivatie, ADR 0001-lijn); geen code verwijderen (blast radius nul).
- **`/mijn` krijgt wél het wil-accent** (conform aanbeveling fase 2): de
  picker noemt de kleur "Will & acties" en de /mijn-tabs (ModuleNav) waren
  al wil-gekleurd.
- **Conventie verankerd** in `CLAUDE.md` (sectie "Kleurconventie —
  module-accenten"); `design-principles.md` bleek niet (meer) in de repo te
  bestaan.
- **Regressie-guard (punt 11)**: ingevuld als `app/globals-legacy-aliases.test.ts`
  (23 asserties die het legacy-alias-blok vastpinnen) i.p.v. een lint-regel;
  de conventie in CLAUDE.md + review-gates dekken de rest af.
- **Bonus-vondst legacy-aliassen**: de shorthand-familie `--kern/--will/--hor`
  (+`-t/-l/-m`) en kale genummerde vars (`--kern-NNN`, `--horizon-NNN`) werden
  in ~25 componenten gebruikt maar waren NERGENS gedefinieerd — die plekken
  draaiden stilletjes op hex-fallbacks of renderden zonder kleur. Eén
  alias-blok in `globals.css` (na de horizon-palette) koppelt ze nu aan de
  instelbare module-kleuren. Let op: `--will-*` → `--color-wil-*` is bewust
  (historische Engelse schrijfwijze).
- **Review-uitkomsten** (code-review: 0 kritiek/hoog; ux-review): Amber-swatch
  horizon `#f59e0b` → `#d97706` (WCAG-contrast 700-shade), en de groeikleur in
  `net-worth-projection-chart.tsx` van hardcoded `#f59e0b` naar
  `var(--module-active-600)` / daling naar `var(--negative)`.

### Restpunten (bewust open)
- `savingsColors` paarse 4-traps-ramps in `cash-account-view.tsx:725` +
  `budget-sankey.tsx:22` — horen bij het budget-tint-domein (BudgetTintPicker
  heeft een savings-kleur); aparte beslissing.
- `avatars.tsx` `#8B5CB8` — bewuste Will-avatar-stijl, niet aangeraakt.
- `horizon-cashflow-sankey.tsx` multi-series-paletten — categorisch, gelaten.
- Commit-hygiëne: `scenarios-modal.tsx` + `horizon-helpers.tsx` bevatten in de
  working tree óók ongerelateerde gezondheidsscore-v2-hunks — bij commit
  hunk-selectief splitsen.
- Fallback-stijl charts is gemengd (mét `, #c4a06b` in horizon-bestanden,
  zónder in mini-networth) — cosmetisch, beide correct.
