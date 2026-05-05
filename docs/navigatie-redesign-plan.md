# Navigatie-redesign — Webapp sidebar + mobile stack

> **Versie 3.1 — Fase 4 cleanup (2026-05-05)**
>
> **Wijzigingen t.o.v. v3:**
> 1. **Q4 / Q6 / Q7 gesloten** in §9 — bottom-nav-state op Identity/Beheer = gedimd-actief; ⌘K skeleton-only voor Fase 0/4; sidebar-collapse-state in `localStorage` per device.
> 2. **Sandbox-cleanup**: `app/(app)/beheer/sidebar-prototype/` + `components/app/beheer/sidebar-prototype/` verwijderd (sandbox-evaluatie afgerond, variant A is productie). `shell-prototype` blijft tot post-rollout (host van flag-toggle).
> 3. **CLAUDE.md + ui-ux-skill bijgewerkt** volgens §12 — zie commit `feat: nav-shell fase 4 cleanup`.
> 4. **§4.7 herzien — drawer geschrapt**: TopBar krijgt inline utility-cluster (PrivacyToggle + News + Bell + Avatar-dropdown) ipv left-side drawer. Reden: feature-pariteit met `AppHeader` op mobile zonder extra component-laag. "Overige" routes blijven via bottom-nav-tab `other`.
> 5. **§4.3 herzien — TopBar pagina-attribuut**: TopBar is nu net als BottomBar een pagina-attribuut met drie kinds (`'rich'` = utility-cluster zichtbaar / `'simple'` = ←+titel / `'hidden'` = geen bar). Default `'rich'` op tab-roots, `'simple'` op sub-pages. Override via `<NavStackMeta topBar={...}>`.
> 6. **Pathname-watcher animatie**: bij `<Link>`-clicks detecteert de pathname-watcher push vs pop vs root-reset en speelt de 240ms tray-of-three animatie (plan §4.1). `pop()` is nu een `router.back()`-wrapper — browser-back ↔ ←-knop ↔ swipe-back gaan via één code-pad.
>
> **Versie 3 — Bitvavo-pure mobile stack (2026-05-05)**
>
> **Wijzigingen t.o.v. v2 (deze revisie):**
> 1. **Mobile stack = tray-of-three**: TopBar + Content + BottomBar zitten in **één animation-layer**. Bij push/pop schuift de hele tray mee — niet alleen de content. (§4.1)
> 2. **Dual-content-animatie**: outgoing + incoming pagina staan tegelijk in DOM tijdens de overgang (240ms). Push: oude naar `translateX(-30%)` met fade, nieuwe van `translateX(100%) → 0`. Pop: spiegelbeeld. Implementatie: View Transitions API + custom fallback. (§4.2)
> 3. **BottomBar = pagina-attribuut, niet vaste BottomNav**: default toont module-tabs (Kern/Wil/Horizon, gating zoals nu). Sub-pagina's kunnen een eigen `bottomBar`-content meegeven (action-bar, context-knoppen, of leeg). De huidige `BottomNav`-component blijft de default-renderer; pagina's kunnen via een `<MobileBottomBar>`-component overschrijven. (§4.4)
> 4. **Loading-strategie**: TopBar+BottomBar-meta uit stack-entry direct synchroon beschikbaar; content via Suspense-skeleton. Bij navigatie naar een nieuwe pagina verschijnt de juiste tray-of-three direct, content laadt eronder. (§4.6 nieuw)
> 5. **Module-tab-switch op sub-pagina's**: als BottomBar op sub-page geen module-tabs toont, kan gebruiker pas wisselen na ←-terug naar tab-root. Conform Bitvavo. (§4.5)
>
> **Versie 2 — gecorrigeerd op basis van codebase-verificatie (2026-05-05)**
>
> **Wijzigingslog (top 5 aanpassingen t.o.v. v1):**
> 1. **§5 modal-strategie herschreven als driewegregel** (pane/stack vs sheet vs modal-confirm) met nieuwe wrapper `<ShellOverlay kind="...">` — de oude tegenstelling "centered modal op desktop, sheet op mobile" was onjuist: de bestaande `BottomSheet` (`components/app/bottom-sheet.tsx:1-60`) is één component dat al responsive is via Tailwind `md:max-w-*`-classes, geen `useMediaQuery`. (A1)
> 2. **§2.5 nieuw — App-tabs binnen categorie**: apps (`?tab=<slug>`) blijven in-page segmented-controls; geen stack-push, geen pane. (B1)
> 3. **§2.6 nieuw — Module-fallback** voor uitgeschakelde modules: gedimde sidebar-/bottom-nav-entry met "Activeer in Instellingen"-CTA, geen stilzwijgende verberging. (B2)
> 4. **Q1 gesloten in §2.7**: `/core/budgets/[id]` blijft redirect-shim → pane luistert op query-state, geen route-rewrite. Geen bookmark-breuk. (B3)
> 5. **Fase 0 begint nu met UI/UX-skill design-token-validatie** (verplicht volgens CLAUDE.md voor UI-wijzigingen). (B5)
>
> Aanvullend gecorrigeerd: `KassabonShell` is een styled card-wrapper (`components/app/kassabon-shell.tsx:1-16`), géén modal — geschrapt uit overlay-tabel. `ValuationModal` (correcte exportnaam, was `DebtValuationModal`) blijft wel in de tabel. URL-state-keys uitgebreid met `?asset=` (`components/core/holdings-client.tsx:83`) en `?budget=<id>&edit=true`-compositie. `/core/budgets/new` is een echte pagina, niet een redirect. Per-tab-stack vs. browser-history expliciet gedocumenteerd. DreamTransitionContext wordt per-module override op een generieke default (geen vervanging).
>
> Inventarisatie-bron: [`docs/routing-inventarisatie.md`](./routing-inventarisatie.md). Prototype-bron: `/beheer/sidebar-prototype` (variant A).

---

## 1. Context & doel

**Probleem dat we oplossen:**
- Inconsistente terug-navigatie: `/core` en `/identity` hebben breadcrumbs (amber/teal), `/will` en `/horizon` hebben geen oriëntatie-spoor.
- Horizontale top-nav met dropdowns op desktop benut het brede scherm slecht.
- Modal-via-URL-state (`?budget=<id>`, `?debt=<id>`, `?strategie=open`, `?asset=<uuid>`, `?tab=<slug>`) en BottomSheets/echte-pagina's lopen door elkaar — gebruiker weet niet of een back-knop een overlay sluit of een navigatie ongedaan maakt.
- Geen consistent mentaal model voor "ik ben in een sub-flow" versus "ik ben terug bij de overzichtspagina".

**Wat we gaan doen:**
1. **Webapp**: persistente sidebar links (264px, modules-first, Notion/Claude-stijl) — gebruikt variant A van het bestaande prototype als basis.
2. **Mobile**: stack-navigatie waarbij sub-pagina's van rechts inschuiven, met persistente terug-knop linksboven en bottom-nav die overal blijft staan.
3. **Eén route-tree**: dezelfde URL's en dezelfde content-componenten voor beide shells. De **shell verschilt per breakpoint** — niet de content of de routes.
4. **Driewegregel voor overlays**: `<ShellOverlay kind="pane|sheet|confirm">` kiest zelf de juiste container per shell + breakpoint. Eén wrapper, geen divergente patronen.

**Niet-doelen:**
- Geen redesign van content-pagina's (kassabonnen, charts, forms blijven zoals ze zijn).
- Geen routing-rewrites (URL's blijven bestaan; alleen het shell-pattern eromheen verandert).
- Geen mobile-app (PWA / iOS / Android) — dit is de mobile-web-versie.

---

## 2. Architectuur-principes

### 2.1 Shell-agnostische content
Elke pagina-component (`/core/page.tsx`, `/will/page.tsx`, detail-pagina's, etc.) heeft **geen ingebakken**:
- Top-bar met titel of terug-knop
- Eigen breadcrumb
- Eigen "shell-chrome" (zoals dropdown-knop voor account-menu)

**Wel behouden** in module-layouts (zie `app/(app)/horizon/layout.tsx:64-75`, `app/(app)/core/layout.tsx`):
- `--module-active-*` CSS-variabelen op Kern/Wil/Horizon-shades.
- DreamTransitionContext op `/horizon` (zie §2.4 + §8.1).

> Bedoeling: de **shell** rendert chrome (sidebar/topbar/bottom-nav, slide-in pane); de **module-layout** rendert kleur-CSS-vars en module-specifieke transitie-context. De **pagina** rendert alleen content.

### 2.2 Twee shells, één route-tree
```
app/(app)/layout.tsx
├── ResponsiveShell
│   ├── DesktopSidebarShell      (lg:flex)   ← nieuw
│   │   ├── Sidebar (264px)
│   │   ├── ContentArea
│   │   └── SlideInPane          (overlay, lg+)
│   └── MobileStackShell         (lg:hidden) ← nieuw
│       ├── TopBar (sticky)
│       ├── StackContainer       (per-tab-stack)
│       └── BottomNav (sticky)
└── {children}                   ← bestaande pagina's (module-layout intact)
```

`AppHeader` en de huidige `BottomNav` worden **vervangen** door `ResponsiveShell`. Module-layouts (CSS-vars + DreamTransitionContext) blijven onveranderd — ze zitten binnen de content.

### 2.3 Stack-state vs browser-history
Per-tab-stacks (Bitvavo-stijl, één stack per bottom-nav-tab) **botsen** met Next.js' lineaire history. Daarom:

- **Stacks leven in `NavStackProvider` + `sessionStorage`**, NIET in browser-history.
- **Browser-back = lineair binnen de huidige tab** (pop top-entry van actieve tab-stack). Komt het uit op de root-entry, dan exit (gewenst gedrag).
- **Cross-tab navigatie** (bv. Kern → Wil via bottom-nav) wist de andere stack NIET, maar **negeert** de browser-history-volgorde voor de niet-actieve tab. Eén `router.replace()` om history-vervuiling te voorkomen.
- **`usePathname` blijft de bron** voor active-state in shell; stack-context is alleen voor scrollpositie + entry-titels.
- **Refresh** = stack uit `sessionStorage` herstellen voor huidige tab; andere tabs blijven leeg tot eerste bezoek.

Documenteer dit expliciet in code-comments — anders blokkeert fase 0 op race-conditions tussen `NavStackProvider`, `usePathname`, en browser-back.

### 2.4 Consistent mental model

| Soort handeling                                   | Web (DesktopSidebarShell)              | Mobile (MobileStackShell)                  |
|---------------------------------------------------|-----------------------------------------|---------------------------------------------|
| Naar een module of categorie                      | Sidebar-klik → content-replace          | Bottom-nav of drawer → tab-stack root       |
| Naar een entiteit-detail (holding, budget, account) | Slide-in pane van rechts (560px)      | Stack-push (slide-in van rechts)            |
| Snel iets kleins doen (opzeggen, herwaarderen, partner-verdeling) | `<ShellOverlay kind="sheet">` (BottomSheet, responsive `md:max-w-lg`) | `<ShellOverlay kind="sheet">` idem |
| Vergelijking/inspectie naast onderliggende content | `<ShellOverlay kind="sheet">`         | `<ShellOverlay kind="sheet">`               |
| Bevestiging (delete, type-to-confirm)             | `<ShellOverlay kind="confirm">` (centered, smal) | `<ShellOverlay kind="confirm">` idem |

> `<ShellOverlay>` is een nieuwe wrapper rond de bestaande `BottomSheet`-component. Drie kinds: `pane` rendert via `SlideInPane` op desktop / stack-push op mobile; `sheet` rendert `BottomSheet` met juiste size (`sm`/`md`/`lg`) — al responsive zonder extra logica; `confirm` rendert smalle centered modal met focus-trap. Eén refactor, drie kanten.

### 2.5 App-tabs binnen categorie (geen stack/pane)
CLAUDE.md beschrijft de Kern → Categorie → App-hiërarchie; apps leven als **`?tab=<slug>`-tabs binnen een categorie-pagina** (zie `components/core/category-deepening-registry.ts:115-221`). Apps: Budgetteren bij `cash`, Holdings bij `investment`/`crypto`, Aflosstrategie + Hypotheekplanner bij `mortgage`, Hypotheekplanner bij `eigen_huis`, Verhuurrendement bij `real_estate`.

**Beslissing:**
- App-keuze blijft een **in-page segmented-control** (`?tab=`); **geen stack-push, geen pane**.
- Back-knop op een categorie-pagina met actieve app-tab gaat terug naar Kern (categorie-overzicht), niet naar items-tab.
- Sidebar tag-strip (zie §3.3) linkt **alleen naar categorieën**, niet naar apps. Apps zijn binnen-categorie-context.
- Op mobile geldt hetzelfde: tab-switch is in-page, geen stack-push.

### 2.6 Module-fallback bij afgesloten modules
CLAUDE.md punt 2: *"Bouw nooit een feature die stilzwijgend breekt of lege data toont omdat een andere module uit staat."*

- **Sidebar-entry voor uitgeschakelde module** = gedimd (`text-[var(--ink-4)]`, geen accent-streep), met "Activeer in Instellingen"-CTA als hover-tooltip of inline-link.
- **Bottom-nav-tab idem**: gedimde icon + label, klik opent `/identity/instellingen#modules` in plaats van de module-route.
- Gebruik bestaande `getActiveNavModules()` (`lib/module-registry.ts:264-277`) en `isModuleActive()` (rij 213-215) als bron.
- **Geen stilzwijgende verberging** — gebruiker moet zien dat de module bestaat maar uit staat, anders verdwijnen ze in een blinde vlek.
- Op categorie-pagina's met afgesloten app-tabs: bestaande tip-strip + teaser (`tipStripCopy` uit registry) blijft zoals nu.

### 2.7 URL-state als pane-bron (Q1 — gesloten)
**Beslissing**: pane luistert op query-state, **geen** route-rewrite van `/core/budgets/[id]` naar echte route.

Reden:
- `/core/budgets/[id]` is al een redirect-shim naar `?budget=<id>` (`app/(app)/core/budgets/[id]/page.tsx:1-21`).
- Geen bookmark-breuk; consistent met bestaande pattern voor `?debt=`, `?asset=`, `?strategie=`, `?tab=`.
- Pane-component leest `useSearchParams()` en opent automatisch.

**Centralisatie**: nieuwe constant `OVERLAY_QUERY_KEYS` in `lib/navigation.ts`:
```ts
export const OVERLAY_QUERY_KEYS = {
  budget: 'budget',
  debt:   'debt',
  asset:  'asset',          // /core/assets/holdings: ?asset=<uuid>
  strategie: 'strategie',   // /horizon: ?strategie=open
  tab:    'tab',            // categorie-pagina app-tab (NIET overlay, wel shell-aware)
  edit:   'edit',           // compositie: ?budget=<id>&edit=true
  via:    'via',            // /horizon: ?via=dreamgate (transient)
  month:  'month',          // /core/assets/cash/[id]: ?month=YYYY-MM
} as const
```

Pane kijkt naar `budget|debt|asset|strategie`. `tab` is in-page (zie §2.5). `edit` is composiet-state. `via` en `month` zijn niet-overlay.

---

## 3. Webapp sidebar — desktop shell

Bron: variant A van `/beheer/sidebar-prototype` (editorial-zwaar, Playfair italic-em modules).

### 3.1 Layout
- **Breedte:** 264px expanded; toggle naar 64px icon-rail (state in `localStorage`, default expanded).
- **Positie:** `position: fixed; left: 0; top: var(--header-height)`. Geen scroll mee met de pagina.
- **Achtergrond:** `var(--paper)` met 1px `border-r border-[var(--border-ed)]`.
- **Hoogte:** `calc(100vh - var(--header-height))`. Eigen scroll als content overloopt.
- **Visibility:** alleen op `lg:` (≥1024px). Onder die breedte = MobileStackShell.

### 3.2 Inhoud (modules-first, gedegradeerde secundaire content)
```
┌────────────────────────────┐
│ tf.                  ⌘K    │  ← branding + zoek-shortcut
├────────────────────────────┤
│ ─ DRIE MODULES             │  ← kicker met streepje
│                            │
│ ⊙ De Kern         € 142k   │  ← active: linker accent + bg-tint
│   Bezittingen · Schulden   │  ← inline tag-strip, alleen op active
│                            │     (alleen categorieën — zie §3.3)
│ ⚡ De Wil           · 4    │
│ ✦ De Horizon     62 jr     │
│ ⊘ {gedimde module}         │  ← module uit: gedimd + activeer-CTA
├────────────────────────────┤
│ ─ overige                  │  ← lowercase italic kicker
│   Berichten         · 2    │
│   Nieuws                   │
│   Rapportages              │
├────────────────────────────┤
│ (vrije ruimte / spacer)    │
├────────────────────────────┤
│ 👤 Jan Pieter ▾            │  ← profiel-pill (klikbaar → /identity)
│   Identiteit               │
│   Instellingen             │
│   Uitloggen                │
└────────────────────────────┘
```

### 3.3 Sub-navigatie binnen module (alleen categorieën)
Active-module toont **inline tag-strip** met directe **categorie**-routes — niet met features of apps. Reden: features (Belasting, Check-in) en categorieën (Bezittingen, Schulden) zijn semantisch verschillend; mengen verwart.

- **Kern** (active): `Bezittingen · Schulden` (categorieën). Belasting en Check-in zijn *features*; bereik via Kern-landing of als feature-link onder de strip.
- **Wil** (active): geen tag-strip (één pagina).
- **Horizon** (active): `Wat-Als · Doorrekening` (sub-routes, niet features).
- **Identiteit**: bestaande ModuleNav binnen `/identity` blijft (7 tabs); geen tag-strip in sidebar.

> Beslissing: Identiteit krijgt **geen** plek tussen de drie hoofdmodules. Profiel-pill opent `/identity` direct (geen pane, geen dropdown).

### 3.4 Slide-in pane voor diepe doorklik
**Wanneer:** doorklik vanuit een lijst naar een **detail-context** die je naast de lijst wilt blijven zien (transactie-detail vanuit budget, holding-edit vanuit holdings-overzicht).

**Hoe:**
- Pane glijdt van rechts in (`transform: translateX(100%) → 0`, 240ms cubic-bezier).
- Breedte: `lg:w-[480px] xl:w-[560px]` (alleen op `lg:` actief — geen pane onder 1024px).
- Onderliggende content blijft zichtbaar links — **geen** dim-overlay (wel rand-schaduw).
- Sluiten: ✕ rechtsboven, `Esc`-toets, klik op overlay-rand, of browser-back.
- URL-bron: query-state (zie §2.7).
- **Niet voor** modules-overzicht of categorie-pagina's — die vervangen content-area volledig.
- Respecteert `prefers-reduced-motion`: instant-show, geen slide.

### 3.5 Sidebar-collapse
- Toggle-knop bovenin sidebar (`<<` icon).
- Collapsed (64px): alleen icons + accent-streepje. Tooltip op hover toont label.
- Expanded blijft default; toggle persisteert in `localStorage` per device.

---

## 4. Mobile stack-navigatie — Bitvavo-pure (tray-of-three)

### 4.1 Layout — TopBar + Content + BottomBar als één tray

```
┌────────────────────────────┐
│ ← TitelMet schuif    (⋯)   │  ← TopBar       ┐
├────────────────────────────┤                 │
│                            │                 │
│   Pagina-content           │  ← Content      │ schuift samen
│   (Suspense-skeleton bij   │                 │ als één tray
│    nog niet geladen data)  │                 │ bij push/pop
│                            │                 │
├────────────────────────────┤                 │
│  Kern   Wil   Horizon      │  ← BottomBar    ┘
└────────────────────────────┘     (default = module-tabs)
```

**Cruciaal verschil met v1/v2**: TopBar én BottomBar zitten **binnen de animation-layer**, niet erbuiten. Bij push/pop schuift de **hele tray-of-three** als één geheel mee — exact zoals Bitvavo. Dit geeft het continue "kaart-verschuiven"-gevoel waarbij oude pagina als één blok naar links uit en nieuwe pagina als één blok van rechts in glijdt.

### 4.2 Stack-mechanica + dual-content-animatie

**Per-tab-stacks** (ongewijzigd):
- Eén stack per bottom-nav-tab (`kern`, `wil`, `horizon`, `identity`, `other`).
- Stacks in `NavStackProvider` + `sessionStorage`. Stack-diepte ≤ 5; oudste FIFO weg.
- Scrollpositie per stack-entry bewaard.

**Dual-content-animatie** (nieuw in v3):

Tijdens een push/pop staan **twee complete tray-of-three-trees tegelijk in de DOM**: de outgoing en incoming. Beide animeren tegelijk gedurende 240ms; daarna unmount de outgoing.

| Operatie       | Outgoing (oude pagina)                                                     | Incoming (nieuwe pagina)                                                  |
|----------------|-----------------------------------------------------------------------------|----------------------------------------------------------------------------|
| **Push**       | `translateX(0 → -30%)` + `opacity: 1 → 0.5`                                | `translateX(100% → 0)` + `opacity: 0.7 → 1`                                |
| **Pop**        | `translateX(0 → 100%)` + `opacity: 1 → 0.7`                                | `translateX(-30% → 0)` + `opacity: 0.5 → 1`                                |
| **Cross-tab**  | Geen animatie — instant switch (geen "diepere pagina"-richting).            | Tab-state direct hersteld uit `sessionStorage`.                            |

**Implementatie — twee paden:**
1. **View Transitions API** (Chrome 111+, Safari 18+, Firefox 129+): `document.startViewTransition()` regelt cross-fade-and-slide automatisch. ~30 regels code, low DOM-overhead. Detect via `'startViewTransition' in document`.
2. **Custom fallback** voor oudere browsers: `NavStackProvider` houdt `transitioning` state met `outgoing` + `incoming` entries; rendert beide tegelijk; CSS-keyframes regelen de transform. Schakelt automatisch om wanneer View Transitions niet beschikbaar zijn.

**Animatie-timing**:
- Duur: 240ms (matcht SlideInPane voor consistentie).
- Easing: `cubic-bezier(0.32, 0.72, 0, 1)` (iOS-spring-curve).
- `prefers-reduced-motion`: instant-swap, geen translate of fade.
- Hardware-accelerated via `transform` + `opacity` (geen layout-trash).

**A11y bij dual-render**: outgoing tree krijgt `aria-hidden="true"` zodra animatie start; pas verwijderd bij animation-end. Voorkomt dat screen-readers twee titels tegelijk announceren. Incoming TopBar-titel krijgt `aria-live="polite"` voor smooth voorlees-update.

**Pop-trigger**:
- ←-knop (44×44 touch).
- Swipe-back-gesture op `(pointer: coarse)` — iOS-stijl edge-swipe vanaf links 24px (gebruik edge-zone-detection: alleen bij `clientX < 24px` op touchstart, anders niet — voorkomt conflict met horizontale scroll-content).
- Browser-back-knop.

### 4.3 TopBar — pagina-attribuut, drie kinds (v3.1)

> **v3.1**: TopBar is nu — net als BottomBar (§4.4) — een pagina-attribuut met meerdere kinds. Het oorspronkelijke "één uniforme TopBar"-model gaf op tab-roots een lege bar zonder utility-cluster, met als gevolg dat AppHeader-functionaliteit (privacy / news / bell / profile) alleen via de niet-bestaande drawer (§4.7 oud) bereikbaar zou zijn. De kind-systematiek lost dat op zonder een drawer-component te bouwen.

**Drie kinds**:
- **`'rich'`** (default voor tab-roots — `/core`, `/will`, `/horizon`, `/identity`, `/dashboard`):
  - Geen ←-knop.
  - Titel midden.
  - **Utility-cluster rechts**: PrivacyToggle + News-shortcut + Notification-bell met badge + Avatar-dropdown. Vervangt de oude `AppHeader`-functionaliteit op mobile.
  - Hoogte 48px. Optionele module-meta-strook eronder (saldo of subtitel) verlengt naar 72-80px en schuift mee in tray-animatie.
- **`'simple'`** (default voor sub-pages — alles met stack-diepte > 1):
  - **←-knop** links — roept `pop()` aan, die `router.back()` triggert (browser-history-conform).
  - Titel midden.
  - Geen utility-cluster (compact 48px). Pagina kan via `topBarActions`-prop op `MobileStackShell` eigen actions injecteren.
- **`'hidden'`**:
  - Geen TopBar — full-screen flows (onboarding-stappen, immersive wizards). Pagina is dan zelf verantwoordelijk voor terug-navigatie.

**Override per pagina** — analoog aan §4.4:
1. **Stack-entry-meta** (declaratief) via `<NavStackMeta>`:
   ```tsx
   <NavStackMeta
     title="Holding bewerken"
     topBar={{ kind: 'simple' }}
     bottomBar={{ kind: 'action-bar', primary: { label: 'Opslaan', ... } }}
   />
   ```
2. **Imperatief** via `push({ pathname, title, topBar: { kind: 'rich' }, ... })` — alleen voor sandbox/programmatic navigation.

**Defaults bij pathname-driven auto-push** (Next.js `<Link>`-clicks):
- Tab-root bezoek (bv. `/core`) → `topBar: { kind: 'rich' }`, `bottomBar: { kind: 'tabs' }`.
- Sub-page push → `topBar: { kind: 'simple' }`, `bottomBar: { kind: 'tabs' }`.
- `<NavStackMeta>` overschrijft daarna deze defaults.

**Animation-layer** (ongewijzigd): TopBar zit binnen de tray-flex-column van `MobileStackShell`. Bij scroll van pagina-content blijft TopBar aan de top van zijn tray; bij stack-push/pop schuift hij mee als onderdeel van de tray-of-three (plan §4.1).

**Outgoing-tray-render** (technisch detail): tijdens 240ms transitie krijgt de outgoing-tray's TopBar de OUDE entry's `topBar.kind` als override — anders zou hij visueel direct de nieuwe kind aannemen en "te vroeg" wisselen. Zelfde patroon als `entryTitle`-override.

### 4.4 BottomBar — pagina-attribuut, niet vaste BottomNav

**Defaults bij pathname-driven auto-push** (v3.1 herzien):
- **Tab-root** (`/core`, `/will`, `/horizon`, `/identity`, `/dashboard`): `bottomBar: { kind: 'tabs' }` — module-tabs zichtbaar met gating-logica + activeer-CTA voor inactieve modules (§2.6). Renderer: `components/app/bottom-nav.tsx` gewikkeld in `MobileBottomBar`-slot.
- **Sub-page** (alle stack-diepte > 1): `bottomBar: { kind: 'hidden' }` — geen bar. Gebruiker keert terug via ←-knop in TopBar (Bitvavo-conform). Pagina's die alsnog tabs willen tonen (bv. een list-overview die op zichzelf staat) overrulen expliciet via `<NavStackMeta bottomBar={{ kind: 'tabs' }} />`.

**Override per pagina**: een pagina kan een eigen BottomBar-content meegeven via:
1. **Stack-entry-meta** (declaratief) — bij `push()`:
   ```ts
   push({
     pathname: '/core/budgets/new',
     title: 'Nieuw budget',
     bottomBar: { kind: 'action-bar', primary: 'Opslaan', secondary: 'Annuleren' },
   })
   ```
2. **In-page component** (imperatief) — pagina rendert `<MobileBottomBar>` als child; provider injecteert content in de BottomBar-slot van de tray (via portal of context-state).

**Override-types** (initiële set, uitbreidbaar):
- `'tabs'` (default) — module-tabs, gating-aware.
- `'action-bar'` — primary + secondary CTA (bv. "Opslaan" / "Annuleren") voor sub-flows zoals form-pagina's.
- `'context-actions'` — 2-3 context-knoppen (bv. "Bewerken" / "Verwijderen" / "Delen") op detail-pagina's.
- `'hidden'` — geen BottomBar (full-screen content).

Bij `'tabs'` op een sub-pagina blijft cross-tab-switching werken. Bij andere types verdwijnen de tabs — gebruiker moet eerst ←-terug naar tab-root (zie §4.5).

### 4.5 Module-switch op sub-pagina's (Bitvavo-conform)

Op een sub-pagina met `bottomBar.kind !== 'tabs'`:
- Geen module-tabs zichtbaar.
- Klik op een module-tab is fysiek niet mogelijk (tabs er niet).
- Gebruiker tikt ←-knop tot tab-root → tabs verschijnen → switch naar andere module.
- Cross-tab via deeplink (bv. een widget-link naar `/core/...` vanuit Wil) blijft werken: NavStackProvider opent de juiste tab-stack en plaatst de pagina daarin (zie §6.3).

> Beslissing **(Q8 nieuw, gesloten)**: dit is acceptabel UX. Dezelfde flow gebruikt Bitvavo en het voorkomt dat gebruikers per ongeluk een form-flow afbreken door een tab-tap.

### 4.6 Loading-strategie — tray-eerst, content-later

**Probleem**: bij navigatie naar een nieuwe pagina willen we direct visuele feedback. De TopBar (titel + ←) en BottomBar (action-bar of tabs) moeten **synchroon** verschijnen; alleen de pagina-content mag asynchroon laden met skeleton.

**Oplossing**:
1. **Stack-entry-meta is synchroon beschikbaar**: bij `push()` worden `title` + `bottomBar`-config meegegeven. NavStackProvider rendert de tray met deze meta direct, zonder server-roundtrip.
2. **Content via Suspense**: pagina-content (server-component of `use()` in client-component) suspended tot data binnen is. Tijdens loading toont een skeleton dat de pagina-layout matcht.
3. **Layout-shift voorkomen**: skeleton-dimensies komen overeen met final layout.

**Concrete sequence bij push**:
```
t=0ms     push() in NavStackProvider; sessionStorage update.
t=0ms     React rendert nieuwe tray: TopBar (uit meta) + Suspense-skeleton + BottomBar (uit meta).
t=0ms     View Transition / custom dual-render start; outgoing en incoming tray animeren.
t=240ms   Animatie klaar; outgoing unmount; aria-hidden weg op incoming.
t=...ms   Server-component / data-fetch resolves; Suspense vervangt skeleton met content.
```

**Implementatie-eisen**:
- Elke pagina (of route-group) levert een `loading.tsx` (Next.js convention) dat de tray-skeleton rendert.
- Pagina-component declareert haar `<NavStackMeta title="..." bottomBar={...} />` vroeg in de component-tree (synchroon, voor data-fetching) zodat NavStackProvider de meta kan oppikken.
- Server-componenten: gebruik `<Suspense fallback={<PageSkeleton />}>` voor data-fetching child-components.

**Niet doen**: skeleton tonen voor TopBar of BottomBar — die zijn synchroon beschikbaar uit de stack-entry-meta.

### 4.7 Utility-cluster in TopBar (geen drawer)

> **Update v3.1 — drawer geschrapt** ten faveure van een inline utility-cluster rechts in de TopBar. Vorige iteratie schreef een left-side drawer voor; in praktijk maakt dat extra component, focus-trap, animation, en a11y-flow voor functionaliteit die ook prima rechts in de TopBar past (Bitvavo-conform).

Op mobile is er geen sidebar — wel een **utility-cluster** rechts in de TopBar met de essentiële cross-route-functies. De cluster vervangt de oorspronkelijke drawer-hamburger en levert:
- **PrivacyToggle** (oog-icoon): bedragen maskeren via `useMaskedAmounts`-context.
- **News-shortcut** (Newspaper-icon): direct naar `/nieuws` (TriFinity Post).
- **Notification-bell** met badge: opent `NotificationModal` via `useNotifications().openModal`.
- **Avatar-dropdown**: tap toont menu met `Beheer (superadmin) · Identiteit · Rapportages · Sync nu / Sync-rapport · Uitloggen`. Sync-blok is een 2-kolom-grid met `GlobalSyncButton` links en een `Activity`-knop rechts die `SyncReportModal` opent. Geen perspective-switcher in de cluster (leeft in `/identity/profiel`) — houdt menu compact.

Implementatie: `components/app/shell/top-bar.tsx` rendert `TopBarUtilities` als default-actions wanneer `email` aanwezig is. Pagina's kunnen via `topBarActions` prop op `MobileStackShell` de cluster overrulen voor pagina-specifieke actions; de utility-cluster verschijnt dan niet (bewuste trade-off: pagina-context wint, gebruiker bereikt utilities via tab-root).

**"Overige" routes** — Berichten, Rapportages, Tools — leven in bottom-nav-tab `other`, niet in een drawer. News krijgt een eigen icon in de utility-cluster wegens hoge gebruiksfrequentie. Settings → via `/identity/instellingen` deeplink in avatar-dropdown.

**Niet meer in scope**: left-side `Drawer`-component, hamburger-menu, drawer-focus-trap. Wanneer ooit een use-case opduikt voor een left-side overlay (bv. command-palette voor ⌘K) bouwen we die als `<ShellOverlay kind="sheet">` met linker-uitlijning — niet als generieke drawer.

---

## 5. Overlay-strategie — driewegregel

**De regel** (zelfde op web én mobile):
> *Pane/stack als de gebruiker "ergens naartoe gaat" (eigen oriëntatie nodig). Sheet als de gebruiker "even iets snel doet" (terugkeer-context bewaard moet blijven). Confirm-modal voor bevestiging van onomkeerbare acties.*

**Implementatie**: nieuwe wrapper `<ShellOverlay kind="pane|sheet|confirm">` die op basis van shell + breakpoint de juiste container kiest. De bestaande `BottomSheet` (`components/app/bottom-sheet.tsx`) wordt het rendermechanisme voor `kind="sheet"` op zowel desktop (`md:max-w-lg` etc.) als mobile (`peek/mid/full` detents). `kind="pane"` rendert een `SlideInPane` op desktop en gebruikt de nav-stack op mobile. `kind="confirm"` rendert een smalle centered modal met focus-trap.

Eén refactor, drie kanten — geen divergente componenten per breakpoint.

### 5.1 `kind="pane"` — wordt slide-in pane (desktop) / stack-push (mobile)

| Huidige modal/sheet/route                          | Reden                                                           |
|----------------------------------------------------|------------------------------------------------------------------|
| `/core/budgets/[id]` (query-state via shim)        | Volledige budget-context met meerdere data-secties.             |
| Transactie-detail (binnen budget-flow)             | Eigen oriëntatie nodig; aparte data + acties.                  |
| `/core/assets/holdings/[id]` (al echte pagina)     | Detail met koershistorie, transacties, Box 3 — blijft pagina.  |
| `/core/assets/cash/[accountId]` (al echte pagina)  | Account-detail met maand-selector — blijft pagina.             |
| `DebtDetailModal`                                  | Volledige schuld-context, meerdere acties.                      |
| `GoalDetailModal`                                  | Doel-historie + form + timeline = volledige flow.               |
| `StrategieModal`                                   | Strategie-keuze met uitleg per optie + impact-preview.          |
| `WithdrawalModal`                                  | Onttrekkings-strategie keuze + uitleg per optie.                |
| `BacktestingModal`                                 | Eigen flow met upload + replay-stappen.                         |
| `ScenariosModal`, `SimulationsModal`               | Scenario-beheer met lijst + acties — full-page op mobile.       |
| `PhaseModalOpbouw/Overgang/Onttrekking`            | Fase-analyse met meerdere secties.                              |
| `QuickAddWizard` (3-stap)                          | Multi-step wizard — past niet in modal.                         |
| Bank-koppeling wizard (`/core/cash/connect/*`)     | Al een pagina-flow; krijgt stack-treatment.                     |
| Holdings/Cash CSV-import                           | Multi-step wizard.                                              |

### 5.2 `kind="sheet"` — blijft sheet (desktop + mobile, één component)

| Huidige modal/sheet                                | Reden                                                           |
|----------------------------------------------------|------------------------------------------------------------------|
| `OpzegModal` (abonnement opzeggen)                 | Single-form, "even snel".                                       |
| `DebtForm` (snel bewerken/aanmaken)                | Single-form, terugkeer-context op debt-pagina blijven.          |
| `ValuationModal` (herwaardering — `debt-valuation-modal.tsx`) | Single-veld + notitie. Component-naam = `ValuationModal`. |
| `Box3PartnerModal`                                 | Inspectie-overlay, terugkeer naar belasting-context.            |
| `YearDetailsSheet`                                 | Inspectie van één jaar in tabel — terugkeer naar tabel.         |
| `SimChartModal` (chart fullscreen)                 | Tijdelijke zoom; sluit terug naar overzicht. `size="full"`.     |
| `PensionPdfUpload`                                 | File-upload modal.                                              |
| Asset/debt **edit** (lichte form, < 5 velden)      | Bewerken zonder volledige detail-context.                       |

> **Niet meer in deze tabel**: `KassabonShell` is een styled card-wrapper (`components/app/kassabon-shell.tsx:1-16`), géén modal/overlay — die hoort niet thuis in de overlay-strategie.

### 5.3 `kind="confirm"` — bevestiging van onomkeerbare acties
- Type-to-confirm-deletes (delete-asset, delete-debt, delete-budget, delete-goal).
- Account-verwijdering.
- Bulk-undo waarschuwingen.
- Smal centered modal (`max-w-sm`), focus-trap, `Esc` annuleert, primaire CTA destructief gestyled.

### 5.4 Twijfelgevallen (te besluiten in Fase 0.1)

| Component                                         | Optie A                          | Optie B                          | Voorlopige keuze            |
|----------------------------------------------------|----------------------------------|----------------------------------|------------------------------|
| `Box3PartnerModal`                                | Sheet (status quo)               | Pane                             | Sheet — voelt als inspectie. |
| Holdings-import wizard                            | Stack-push (kind="pane")         | Sheet (3 stappen)                | Stack — meerdere stappen, oriëntatie nodig. |
| `/core/assets/revalue` (bulk-herwaardering)       | Eigen pagina (huidig)            | Pane                             | Pagina — bulk-actie verdient ruimte. |

---

## 6. Bijzondere doorklik-cases

### 6.1 Transactie-analyse vanuit budget
- Pad: `/core/budgets` → klik op budget → budget-detail (pane web / stack-push mobile) → klik op transactie-rij → transactie-detail.
- **Web**: budget-detail-pane open; transactie-detail vervangt **inhoud van het pane** (geen tweede pane). Pane krijgt eigen back-knop in zijn header.
- **Mobile**: stack groeit met 1 niveau. Back-knop linksboven gaat naar budget-detail; nogmaals back gaat naar `/core/budgets`.

### 6.2 Holding-edit vanuit holdings-overzicht
- Pad: `/core/assets/holdings` → klik op holding → holding-detail (volledige pagina, pane / stack) → klik "Bewerken".
- **Web**: bewerken opent `<ShellOverlay kind="sheet" size="md">` (lichte form, geen detail-vervanging). Sluiten = terug naar pane.
- **Mobile**: bewerken opent `<ShellOverlay kind="sheet">` (BottomSheet). Sluiten = terug naar holding-detail.
- Reden: edit-form is "even iets aanpassen" — niet "ergens heen gaan". Past bij de driewegregel uit §5.

### 6.3 Cross-module deeplink
- Bv. een widget op `/will` linkt naar `/core/assets/holdings/[id]`.
- **Web**: route navigeert direct; sidebar-active-state schuift naar Kern; geen pane (want directe navigatie, niet "doorklik vanuit lijst").
- **Mobile**: stack van Wil-tab wordt bewaard; Kern-tab opent met holding-detail bovenop het Kern-overzicht (twee niveaus diep). Back-stack van Kern is dus `/core` → `/core/assets/holdings` → `/core/assets/holdings/[id]`. Bewust — anders verliezen we oriëntatie.

### 6.4 "Laatste" bewerk-pagina's — `/core/budgets/new` vs `/core/budgets/[id]/edit`

Deze twee gedragen zich **nu al verschillend**:
- `/core/budgets/new` is een **echte pagina** (`BudgetForm`, geen redirect) — `app/(app)/core/budgets/new/page.tsx`.
- `/core/budgets/[id]/edit` is een **client-redirect-shim** naar `/core/budgets?budget=<id>&edit=true`.

**Beslissing — consistente keuze**: maak beide `<ShellOverlay kind="sheet">`.
- `/core/budgets/new` wordt een sheet vanaf de budgets-overzicht-pagina (open via "Nieuw budget"-CTA → query `?new=true`).
- `/core/budgets/[id]/edit` blijft redirect-shim naar `?budget=<id>&edit=true` — pane opent, met edit-mode aan binnen pane.

> Niet doen alsof beide al modal zijn — dat was foutief in v1. De huidige situatie is asymmetrisch, en deze migratie heelt dat.

---

## 7. Implementatie-fases

### Fase 0 — Architectuur & shell-componenten (1-2 weken)
- **0.0** UI/UX-skill design-token-validatie (verplicht volgens CLAUDE.md). Output: page-type-blueprints voor sidebar variant A, mobile TopBar (Playfair vs Inter beslissing), SlideInPane, ShellOverlay. Gearchiveerd in `docs/`.
- **0.1** Beslissingen vastleggen (twijfelgevallen §5.4 + open Q1-Q7 — zie §9).
- **0.2** Bouw `ResponsiveShell` wrapper achter feature-flag `new_navigation_shell`.
- **0.3** Bouw `DesktopSidebarShell` + `Sidebar` (variant A productie-versie).
- **0.4** Bouw `SlideInPane` component.
- **0.5** Bouw `MobileStackShell` + `NavStackProvider` (per-tab-stacks, sessionStorage).
- **0.6** Shell-agnostische content audit (verwijder ingebakken back-knoppen).
- **0.7** Bouw `<ShellOverlay kind="pane|sheet|confirm">` wrapper.
- **0.8** Centraliseer `OVERLAY_QUERY_KEYS` in `lib/navigation.ts`.

### Fase 1 — Kern-module migreren (1-2 weken)
- Migreer `/core/**` overlays volgens §5.1/5.2.
- Update content-pagina's naar shell-agnostisch.
- App-tabs binnen categorie blijven `?tab=`-segmented (§2.5).
- Module-fallback (§2.6) live testen op uitgeschakelde modules.
- Test: alle Kern-flows werken op web + mobile, regression-suite groen (`navigatie.ts`).

### Fase 2 — Wil & Horizon migreren (1-2 weken)
- `/will` modal-mapping (`GoalDetailModal`, `OpzegModal`).
- `/horizon` alle modals volgens §5.1/5.2.
- DreamTransitionContext blijft Horizon-specifiek (zie §8.1).
- Doorrekening-test sub-tree: tab-layout blijft binnen content; shell verandert daar niet.

### Fase 3 — Identiteit & globale routes (1 week)
- Identiteit krijgt eigen behandeling — niet als sidebar-module maar via profiel-pill-deeplink. Op mobile: eigen tab-stack via TopBar-profielicoon.
- ModuleNav binnen `/identity` blijft (7 tabs).
- Globale routes (`/berichten`, `/nieuws`, `/rapportages`, `/tools/fire-sim`) komen onder "overige".
- Account-flows (login/logout/onboarding) blijven shell-loos (Q4 → vastgelegd).

### Fase 4 — Cleanup & feature-flag uit (1 week)
- Verwijder oude `AppHeader`-tabs en breadcrumb-renderingen waar overbodig.
- Verwijder `app/(app)/beheer/sidebar-prototype/*` (sandbox is gediend).
- Memory en `routing-inventarisatie.md` updaten.
- **CLAUDE.md en `.claude/commands/ui-ux.md` bijwerken** volgens §12.
- Feature-flag `new_navigation_shell` verwijderen.

### Fase 5 — Polish (continue)
- Animatie-tweaks (slide-in timing, sidebar-collapse smooth).
- Accessibility-audit (focus-trap in pane, ARIA-live op stack-changes, keyboard-nav sidebar).
- Performance: lazy-load niet-actieve module-stacks op mobile; stack-diepte ≤5 enforce.
- UX-review-expert agent op alle migrated routes.

---

## 8. Aandachtspunten & risico's

### 8.1 DreamTransitionContext — per-module override (Q3 → vastgelegd)
**Beslissing**: generieke stack-transitie als default in `MobileStackShell`/`SlideInPane`; Horizon-layout overridet met `triggerDream(href)` voor zijn eigen golden-veil-animatie. Co-existentie via per-module override-pattern. Geen vervanging.

Impact:
- `MobileStackShell` accepteert een `transitionContext`-prop (default = generieke slide).
- `app/(app)/horizon/layout.tsx` injecteert `DreamTransitionContext.Provider` zoals nu (`components/app/horizon/dream-transition-context.tsx:1-90`).
- Bij stack-push binnen Horizon: shell controleert of context aanwezig is en gebruikt `triggerDream()` ipv standaard transform.
- Buiten Horizon: standaard slide.

### 8.2 Browser-back en stack-state
Pane sluit = back gaat één stap terug (URL-query-param verwijderd). Stack-pop = back. Geen dubbele history-entries — gebruik `router.replace()` waar nodig om ruis te voorkomen.

### 8.3 Modal focus-trap binnen pane
Pane heeft eigen focus-trap; modal binnen pane is dubbel focus-trap. Test goed; bestaande hook `useFocusTrap` in `bottom-sheet.tsx:7` is canonical referentie.

### 8.4 Mobile swipe-back-gesture
Native iOS-swipe vs onze stack — moet niet conflicteren met horizontale scroll-content (charts, tables). Test in Fase 0.5 met regression-suite `navigatie.ts`.

### 8.5 Test routes (`/test-*` ~80 stuks)
Niet migreren, blijven oude shell of buiten shell. Geen risico voor productie.

### 8.6 Beheer/admin (Q5 → vastgelegd)
Behoud eigen layout (`app/(app)/beheer/layout.tsx`). Admin is een gescheiden context — eigen sidebar/tabs daar maakt dat de hoofdshell niet vervuild raakt met admin-paden. Markeer als uitzondering in shell-rendering.

### 8.7 Performance op mobile
Meerdere stack-entries onthouden = meerdere DOM-trees. Limiteer stack-diepte tot 5; oudste entries unmounten maar URL onthouden voor reload (lazy-rehydrate uit `sessionStorage`).

### 8.8 Service workers / caching
Stack-state moet niet verdwijnen op refresh — bewaren in `sessionStorage`. SW-cache geldt niet voor stack-state, alleen voor static assets.

### 8.9 Identiteit-positionering (mobile + desktop)
- **Desktop**: profiel-pill in sidebar-footer linkt direct naar `/identity` — geen pane. ModuleNav binnen `/identity` (7 tabs) blijft.
- **Mobile**: eigen tab-stack via TopBar-profielicoon. Bottom-nav blijft staan met laatste actieve hoofd-module gedimd-actief (zie Q4 in §9).

---

## 9. Open vragen — overzicht & status

Bij v3.1 (Fase 4 cleanup) zijn Q1–Q8 alle gesloten. Q9 en Q10 zijn structureel open per-pagina/per-browser en worden in implementatie afgehandeld, niet als blokkerend besluit.

- **Q1** (gesloten in §2.7): Pane luistert op query-state; geen route-migratie. Geen bookmark-breuk.
- **Q2** (gesloten in §2.5): App-tab in mobile-shell rendert als in-page segmented-control via `?tab=<slug>`. Geen stack-push.
- **Q3** (gesloten in §8.1): DreamTransition als per-module override; default = generieke stack-transitie.
- **Q4** (gesloten in v3.1): Bottom-nav-state op pagina's buiten de drie hoofd-modules (Identity-stack, Beheer, globaal). **Definitief**: laatst-actieve hoofd-module **gedimd-actief** weergeven (icon + label op `text-[var(--ink-3)]`, accent-streep op `--module-active-200/40`). Reden: gebruiker behoudt oriëntatie ("ik kom van Kern") zonder een misleidende active-state te suggereren in een neutrale context. Implementatie: `MobileBottomBar` leest `lastNonNeutralTab` uit `NavStackProvider` en past dim-styling toe wanneer huidige route geen module-tab is.
- **Q5** (gesloten in §8.6): Beheer-shell apart; eigen layout blijft. Markeer als uitzondering.
- **Q6** (gesloten in v3.1): Search-knop (⌘K) in sidebar-branding-rij. **Definitief**: alleen visuele skeleton (knop + placeholder + ⌘K-shortcut-hint) tot Fase 5+. Klik opent een toast `"Zoeken komt binnenkort — werk je via de zijbalk."`. Geen blokker voor flag-flip; command-palette is een aparte feature-track met eigen indexering en scope.
- **Q7** (gesloten in v3.1): Sidebar-collapse-state opslag. **Definitief**: `localStorage` per device via `lib/hooks/use-sidebar-collapsed.ts`. Reden: voorkeur is device/scherm-afhankelijk (laptop = expanded, externe monitor = collapsed); persist-naar-`profiles` zou cross-device botsen. Heroverweging mogelijk wanneer profile-prefs een algemenere device-prefs-bucket krijgt.
- **Q8** (gesloten in §4.5): Module-switch op sub-pagina's met action-bar BottomBar — ←-terug naar tab-root vereist. Bitvavo-conform.
- **Q9** (open per migratie, v3): Welke pagina's krijgen welke `MobileBottomBar`-kind (`'tabs' | 'action-bar' | 'context-actions' | 'hidden'`)? **Default-mapping**: tab-roots = `tabs`; form-flows (`/core/budgets/new`, `/core/budgets/[id]/edit`, debt-edit) = `action-bar`; detail-pagina's (holding-detail, account-detail) = `context-actions`; full-screen wizards (CSV-import, bank-koppeling, check-in) = `hidden`. Wordt per-pagina vastgesteld bij integratie via `<NavStackMeta bottomBar={...} />`.
- **Q10** (open per browser, v3): View Transitions API of custom dual-render? **Default**: View Transitions wanneer `'startViewTransition' in document`, anders fallback naar custom dual-render in `NavStackProvider`. Beide implementaties leven naast elkaar; geen feature-flag nodig (capability-detect).

---

## 10. Verificatie & acceptatiecriteria

Per fase moet voldaan worden aan:

1. **Regression-suites groen**:
   - `lib/regression-tests/suites/navigatie.ts` (algemene nav-flows)
   - `lib/regression-tests/suites/identity-navigatie.ts` (Identity-tabs)
   - `lib/regression-tests/suites/module-access.ts` (gating + fallback)
   - `lib/regression-tests/suites/feature-gating.ts` (app-tabs binnen categorie)
2. **Module-toggling**: zet elke module uit (`active_modules` minus één) → sidebar-entry dimt zichtbaar, bottom-nav-tab dimt, tip-strip verschijnt waar nodig op categorie-pagina's.
3. **Deeplink**: `/core/assets/cash?tab=budgetteren&budget=<id>` werkt op:
   - Web: pagina opent op cash-categorie met Budgetteren-tab actief; pane opent direct op `<id>`.
   - Mobile: stack-push naar cash-categorie + Budgetteren-tab actief; vervolgens pane-equivalent (stack-push) op `<id>`.
   - Geen bookmark-breuk; reload herstelt zelfde state.
4. **Browser-back**: één klik = één stap; geen dubbele history-entries bij tab-wissel of pane-close.
5. **`prefers-reduced-motion`**: pane- en stack-slide vervallen; instant-show. Test op `(prefers-reduced-motion: reduce)`.
6. **A11y**:
   - Pane-focus-trap actief; return-focus naar trigger.
   - ARIA-live op stack-push (`polite`) en stack-pop (`polite`).
   - Swipe-back-conflict-test met horizontale scroll-content (charts in `/horizon/whatif`).
   - Skip-link "Naar hoofdinhoud" als eerste tab-stop.
7. **UI/UX-skill audit per fase**: `/ui-ux` aangeroepen op de gemigreerde routes; bevindingen + screenshots gearchiveerd in `docs/ui-reviews/fase-{n}.md`.
8. **Tray-of-three integriteit**: visueel test dat TopBar + Content + BottomBar samen schuiven bij push/pop (geen "alleen content schuift"-regressie). Test met Chrome DevTools "slow motion" (Cmd+Shift+P → "Show Animations").
9. **Dual-content-animatie**: outgoing en incoming pagina staan beide in DOM tijdens 240ms; outgoing krijgt `aria-hidden="true"`. Test met React DevTools dat na animatie outgoing unmount.
10. **BottomBar-override**: ten minste één pagina per type (`tabs`, `action-bar`, `context-actions`, `hidden`) live testen. Module-switch werkt alleen op `tabs`-pagina's.
11. **Loading-strategie**: nieuwe pagina-push toont TopBar+BottomBar instant (uit stack-meta), content via Suspense-skeleton. Geen layout-shift bij data-aankomst.
12. **View Transitions fallback**: forceer fallback in een browser zonder support (Firefox <129) of via feature-detect-mock; verifieer dat custom dual-render correct werkt.

---

## 11. Bronnen & referenties

- **Routing-inventarisatie**: `docs/routing-inventarisatie.md` — welke routes bestaan en wat hun huidige nav-pattern is.
- **Sidebar-prototype**: `/beheer/sidebar-prototype` — variant A is de visuele bron voor sidebar-styling.
- **UI/UX skill**: `.claude/commands/ui-ux.md` — design-tokens, kicker-streep, module-aware kleuren, page-type-blueprints.
- **Bestaande BottomSheet**: `components/app/bottom-sheet.tsx` — responsive (mobile peek/mid/full + desktop `md:max-w-*`), bron voor `<ShellOverlay kind="sheet">`.
- **Module-registry**: `lib/module-registry.ts` — `getActiveNavModules()`, `isModuleActive()` voor gating.
- **Category-deepening-registry**: `components/core/category-deepening-registry.ts` — apps per categorie, gebruikt voor `?tab=`-resolution.
- **DreamTransition**: `components/app/horizon/dream-transition-context.tsx`, `app/(app)/horizon/layout.tsx` — Horizon-specifieke transitie, blijft bestaan als per-module override.
- **Bitvavo Android-app**: gebruikt als referentie voor mobile stack-pattern.
- **Notion / Claude Desktop**: referentie voor sidebar-patroon.

---

## 12. Wijzigingen in CLAUDE.md en de UI/UX-skill

Dit redesign raakt twee canonical-documenten. De wijzigingen worden in **Fase 4** (cleanup) gemaakt — eerder zou ze nog niet de werkelijkheid weerspiegelen.

### 12.1 Wijzigingen in `CLAUDE.md`

**Te toevoegen (nieuwe secties):**

1. **Sectie "Shell-architectuur"** (na "Kern-architectuur: Kern → Categorie → App"):
   - Beschrijf `ResponsiveShell` met de twee implementaties (DesktopSidebarShell, MobileStackShell).
   - Documenteer de regel: shell rendert chrome (sidebar/topbar/bottom-nav/pane), module-layout rendert kleur-CSS-vars, pagina rendert alleen content.
   - Verwijs naar `components/app/shell/responsive-shell.tsx` als canonical entry-point.
   - Vermeld feature-flag-rollout en post-rollout cleanup.

2. **Sectie "Overlay-strategie (driewegregel)"** (nieuw, na shell-architectuur):
   - `<ShellOverlay kind="pane|sheet|confirm">` als canonical wrapper.
   - Driewegregel: pane = "ergens naartoe", sheet = "even snel iets doen", confirm = "onomkeerbare bevestiging".
   - Verbod op direct gebruik van `BottomSheet` buiten `ShellOverlay`-wrapper (uitzondering: sandbox/prototype).

3. **Sectie "Per-tab stack-state"** (nieuw):
   - Stacks leven in `NavStackProvider` + `sessionStorage`, niet in browser-history.
   - Stack-diepte ≤ 5; oudste entries unmounten.
   - Cross-tab navigatie wist andere stack niet maar gebruikt `router.replace()`.
   - Refresh herstelt huidige tab-stack uit `sessionStorage`.

**Te updaten (bestaande secties):**

4. **"Module-scheiding Architectuurprincipe" — punt 2 (fallback)**:
   - Voeg toe: sidebar-entry en bottom-nav-tab voor uitgeschakelde module = gedimd met "Activeer in Instellingen"-CTA. Geen stilzwijgende verberging.
   - Verwijs naar `lib/module-registry.ts` `getActiveNavModules()` en `isModuleActive()`.

5. **"Kern-architectuur: Kern → Categorie → App" — sectie "Regels voor Apps"**:
   - Voeg toe: app-keuze blijft in-page segmented-control (`?tab=<slug>`); geen stack-push, geen pane.
   - Sidebar tag-strip linkt alleen naar categorieën, niet naar apps.

6. **"UI/UX Skill (verplicht)" — sectie**:
   - Verwijs naar de driewegregel uit §12.2 voor overlay-keuze.
   - Vermeld dat shell-aanpassingen *altijd* via Fase 0.0 UI/UX-skill-validatie gaan.

7. **Memory-relevante secties** (Identity Module Restructure):
   - Identity-tabs zijn 7 (al in MEMORY.md gecorrigeerd, hier ook bevestigen voor volledigheid).
   - Identiteit krijgt geen sidebar-modules-positie; bereik via profiel-pill (desktop) of TopBar-profielicoon (mobile).

**Te verwijderen / aanpassen:**

8. **Verwijs niet meer naar de horizontale top-nav-tabs** (vervangen door sidebar/stack).
9. **Verwijs niet meer naar breadcrumbs als algemene oriëntatie** — `Breadcrumb`-component blijft beschikbaar maar niet langer canonical voor pagina-oriëntatie (de shell levert dat).

### 12.2 Wijzigingen in `.claude/commands/ui-ux.md`

**Te toevoegen (nieuwe secties / patroon-kaarten):**

1. **Page-type 11 — Module-shell**: `ResponsiveShell` als nieuwe blueprint:
   - Top-down: shell-chrome (sidebar/topbar/bottom-nav) → content-area → optional pane/stack.
   - Mobile-aanpassing: TopBar + StackContainer + BottomNav.
   - Cross-cutting: shell levert back-knop, pagina levert geen eigen back.

2. **Patroon-kaart "Sidebar (variant A)"**:
   - 264px expanded / 64px collapsed.
   - Modules-first hiërarchie met kicker-streep, italic-em module-namen.
   - Active-state: linker accent 3px in `--module-active-500` + bg-tint `bg-[var(--module-active-50)]/40`.
   - Profiel-pill in footer; "overige"-sectie met lowercase italic kicker.
   - Volledige Tailwind-specs uit prototype variant A.

3. **Patroon-kaart "Mobile TopBar"**:
   - Hoogte 48px, sticky, safe-area-padding.
   - ←-knop 44×44px touch, titel midden (Inter 14-15px medium — Playfair 16px is te zwaar, definitief in Fase 0.0).
   - Action-buttons rechts (max 2).
   - Optional module-meta-strook eronder.

4. **Patroon-kaart "Slide-in pane"**:
   - Breedte `lg:w-[480px] xl:w-[560px]`, alleen op `lg:` actief.
   - Transform `translateX(100%)` → 0, 240ms cubic-bezier.
   - Geen dim-overlay, wel rand-schaduw.
   - Sluiten: ✕ / Esc / klik-rand / browser-back.
   - Respecteert `prefers-reduced-motion`.

5. **Patroon-kaart "ShellOverlay (driewegregel)"**:
   - Beschrijf `kind="pane"`, `"sheet"`, `"confirm"` met use-cases.
   - Verwijs naar `components/app/bottom-sheet.tsx` als render-mechanisme voor `kind="sheet"`.
   - Verbod op direct `BottomSheet`-gebruik.

6. **Patroon-kaart "Module-fallback in shell"**:
   - Gedimde sidebar-entry: `text-[var(--ink-4)]`, geen accent-streep.
   - "Activeer in Instellingen"-CTA als hover-tooltip / inline-link.
   - Bottom-nav-tab: gedimde icon + label, klik → `/identity/instellingen#modules`.

**Te updaten (bestaande blueprints):**

7. **Type 1 (Module-landing) en Type 2 (Categorie/list)**:
   - Voeg toe: pagina rendert geen eigen back-knop of header — shell levert dat.
   - Module-accent-bar (3px boven) blijft binnen content; shell raakt dat niet aan.

8. **Type 3 (Detail-pagina)**:
   - Back-link wordt door shell geleverd; pagina rendert geen eigen `← Terug naar {parent}`-link in content-header.
   - Action-bar blijft pagina-verantwoordelijkheid (sticky bottom op mobile, inline op desktop).

9. **Type 4 (Bewerk-/create-pagina) en Type 5 (Modal/sheet)**:
   - Verwijs expliciet naar `<ShellOverlay kind="sheet">` voor sheet-cases.
   - Type 4 full-page-variant blijft voor wizards (Type 7); kleine forms gaan via `kind="sheet"`.

10. **Sectie "Navigatie"** (in Kwaliteitstoets):
    - Voeg toe: "Geen ingebakken back-knop in pagina-content — shell levert die via TopBar (mobile) of pane-header (desktop)."
    - Voeg toe: "Sidebar-active-state via `--module-active-*` (zelfde tokens als kicker-streep)."

11. **Sectie "Empty states"**:
    - Empty-state CTA mag een `router.push()` triggeren die in pane/stack opent — geen aparte modal-CTA.

**Te verwijderen / aanpassen:**

12. **Verwijs niet meer naar `Breadcrumb`-component als verplicht element** voor pagina-oriëntatie. Breadcrumb blijft beschikbaar voor specifieke contexten (long-form editorial), maar shell-pad is canonical.

### 12.3 Volgorde en eigenaarschap

- Wijzigingen aan `CLAUDE.md` en `ui-ux.md` worden gemaakt in **Fase 4** (cleanup) — pas wanneer de implementatie afgerond en getest is.
- Tijdens fase 0-3 staan de huidige documenten nog; nieuwe patronen worden in code en in dit plan gedocumenteerd.
- Een aparte taak in de todo-list (`Fase 4.x — CLAUDE.md + ui-ux skill bijwerken`) houdt dit zichtbaar.
