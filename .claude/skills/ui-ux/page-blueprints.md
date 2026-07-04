# Page-type-blueprints — UI/UX-skill (TriFinity)

> Deel van de `ui-ux`-skill. Elke pagina valt in een van elf archetypes; bepaal eerst het type, volg dan de blueprint. Zie ook `quality-checklist.md` en `pattern-cards.md`.

## Page-type-blueprints

> Elke pagina valt in één van elf archetypes. Bij review/ontwerp eerst type bepalen, dan de blueprint volgen. Pagina's mogen blokken weglaten, maar nooit volgorde of hiërarchie veranderen. Cross-cutting standaarden (back-nav, action-bar, confirmation, loading, saving, success) gelden voor alle types.

Cross-cutting voor alle types: shell-chrome wordt geleverd door `ResponsiveShell` (zie Type 11). Pagina-content leeft *binnen* die chrome zonder zelf back-knop, breadcrumb, of module-tab-rij te renderen. Module-layouts (`app/(app)/{module}/layout.tsx`) leveren alleen de kleur-context (`--module-active-*` CSS-vars) en optionele transitie-context (DreamTransition op `/horizon/**`).

### Type 1: Module-landing
- **Routes**: `/overzicht`, `/toekomst`, `/mijn`, `/rapportages`, `/berichten`, `/nieuws` (legacy backing: `/dashboard`, `/core`, `/horizon` — niet als referentie gebruiken).
- **Doel**: hero + categorie-overzicht — eerste indruk van een module of feed.
- **Top-down structuur**:
  1. Module-accent-bar (3px boven, `bg-[var(--module-active-500)]`).
  2. Hero (mini-figures-strip of single hoofdcijfer): kicker-met-streepje → hoofdcijfer (DM Mono, met highlight-marker als de pagina een uitkomst-anker heeft) → italic Source Serif sub-meta.
  3. Optionele `<EditorialDeck>` met italic Playfair intro (max 60ch).
  4. `<SectionDivider />` standaard.
  5. Sectie A: Categorie-grid (cards in mini-artikel-blueprint) of overview-cards. Section-label rij met UPPERCASE-kicker links, optionele romeinse num rechts.
  6. `<SectionDivider />` (eventueel `variant="double-rule"` voor zware overgangen).
  7. Sectie B: optionele app-strip / module-app-tabs.
  8. Footer: ornament-colophon `Trifinity ✦ {module} ✦ {datum}`.
- **Niet doen**: meerdere hero-blokken stapelen, mini-bar gebruiken in plaats van figures-strip, cards in een tabel renderen.

### Type 2: Categorie / list-pagina
- **Routes**: `/overzicht/bezittingen/[type]`, `/overzicht/schulden/[type]`, `/overzicht/cashflow/budget`, `/overzicht/cashflow/transacties`, `/overzicht/cashflow/vaste-lasten`, `/mijn/koppelingen`, rapportage-sublijsten.
- **Doel**: overzicht van entiteiten binnen één categorie.
- **Top-down structuur**:
  1. ~~Back-link~~ — shell levert via TopBar (mobile) of pane-header (desktop). Pagina rendert geen eigen "← Terug naar {parent}"-link.
  2. Mini-hero: kicker-met-streepje → categorie-naam (Playfair, optionele italic-em) → mini-`<FiguresStrip cols={2}>` met `[totaal-met-highlight, count]` of `[totaal, KPI]`.
  3. Optionele `<EditorialDeck>` (alleen als context vereist is).
  4. Toolbar (sticky bij scroll op desktop): search-input (alleen >25 items), filter-chips, sort-control rechts, primaire CTA "Toevoegen" rechts (button-stijl met module-active accent).
  5. Cards-grid OF tabel:
     - Cards (≤20 items, heterogeen): `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`, mini-artikel-blueprint.
     - Tabel (>20 items, vergelijking): editorial dotted ritme, headers in mono UPPERCASE, numerieke kolommen rechts uitgelijnd in DM Mono.
  6. Empty-state (als count = 0): zie Type 9.
  7. Optionele app-tab onderaan (cash → Budgetteren, investment → Holdings, crypto → Holdings, mortgage → Aflosstrategie). De app-tab-content volgt de patroon-kaart *Categorie-app-tab hero-band (KPI-paper-blok)* — KPI-balk staat in een paper-blok met `border-t border-b border-[var(--ink)] bg-[var(--paper)]` binnen de host-padding, overige secties hangen direct in de top-level `space-y-8`. Geen `-mx-` uitbreek-truc; alle blokken hebben dezelfde outer-breedte als de tabs. Geen `-mx-4 sm:-mx-6` breakouts in de tab-content: embeddable clients accepteren host-padding; standalone routes krijgen hun eigen wrapper in het server-page-bestand. Bij twijfel: spiegel de structuur van `crypto-holdings-page.tsx` (geen eigen wrapper, top-level `<div className="space-y-8">` met hero-band als eerste section).
- **Mobile**: filter-bar wordt scroll-x chip-strip; search verbergt achter een knop; sort-control wordt segmented control onder de toolbar; CTA blijft prominent.

### Type 3: Detail-pagina
- **Routes**: entiteit-details (budget, rekening, holding, rapportage) — tegenwoordig bij voorkeur als pane binnen de lijst (zie *In-list detail-flow* hieronder); aparte detail-routes zijn de uitzondering.
- **Doel**: alles wat één entiteit toont — eigendomsinfo, KPI's, transacties, gekoppelde items.
- **In-list detail-flow**: voor entiteiten die altijd via een lijst worden bereikt (bezittingen, schulden, events) — gebruik het *Entity detail-pane met mode-switch* patroon i.p.v. een aparte route. Eén pane wisselt tussen view en edit; herwaardering blijft als secondary footer-action in view-mode én als header-action icon in edit-mode beschikbaar (kern-actie mag niet wegvallen).
- **Top-down structuur** (voor de aparte-route variant):
  1. ~~Back-link~~ — shell levert. Detail-pagina's openen vanaf desktop bij voorkeur als `<ShellOverlay kind="pane">`; vanaf mobile als stack-push. URL-state in `OVERLAY_QUERY_KEYS`.
  2. Editorial header: kicker-met-streepje (categorie/type) → entiteit-naam (Playfair, italic-em op subtype) → hoofdwaarde-bedrag (DM Mono, ~32-40px) MET highlight-marker → sub-meta italic Source Serif (provider, looptijd, "Bijgewerkt om HH:mm").
  3. Action-bar (sticky onderaan op mobile, inline op desktop): primair "Bewerken" / "Herwaarderen" → secundair "Verwijderen" achter type-to-confirm.
  4. `<FiguresStrip cols={4}>` met afgeleide KPI's. Maximaal één extra highlight-marker.
  5. Section: Eigendoms-/contract-info — `<SectionLabel kicker romanNum />` + key-value-rows met dotted ritme.
  6. Section: Transacties / historie — tabel met dotted ritme + sleep-affordance op `<640px`.
  7. Section: Verbonden entiteiten — linked-cards (bv. hypotheek-koppeling op `eigen_huis`).
  8. Optionele `<SectionDivider variant="double-rule" />` voor footer-notes.
  9. Footer-notes (italic Source Serif, klein, `text-[var(--ink-3)]`).
- **Niet doen**: hoofdwaarde dupliceren tussen header en figures-strip; meer dan één highlight-marker per scherm-sectie.

### Type 4: Bewerk-/create-pagina (form-flow)
- **Routes**: create/edit-flows voor budgetten, bezittingen, schulden, import-flows (bank/CSV/holdings), en alle CRUD-sheets/modals.
- **Doel**: gegevens aanmaken of wijzigen in een gestructureerd formulier.
- **Variant-keuze** (altijd via `<ShellOverlay kind="...">`, nooit directe `BottomSheet`):
  - Lichte form (≤5 velden): `kind="sheet"` op zowel desktop als mobile — responsive uit één component.
  - Multi-section form / wizard: `kind="pane"` op desktop (slide-in, eigen back-stack), stack-push op mobile.
  - Type-to-confirm destructive: `kind="confirm"`.
  - Full-page wizard (>10 velden, multi-step): aparte route met `<NavStackMeta bottomBar={{kind: 'action-bar'}} />`, geen ShellOverlay.
- **Top-down structuur**:
  1. Editorial header: kicker-met-streepje "BEWERKEN" / "TOEVOEGEN" / "IMPORTEREN" → entiteit-naam (Playfair).
  2. Optionele `<ScenarioCallout>` met context/uitleg.
  3. Form-secties: Section-label (mono UPPERCASE links + optionele romeinse num rechts) → field-rows (label boven veld, input DM Mono voor bedragen, italic help-text onder veld) → toggle-pills voor optionele velden → range-sliders met module-thumb. Smart defaults; inputs in groepen, 24-32px tussen, 8-12px binnen.
  4. Validatie: valideer op `blur`, her-valideer op `input`. Inline error onder veld in `text-negative`. Toast alleen voor netwerk/systeem-errors.
  5. Sticky save-bar onderaan (mobile-safe-area-bottom): primaire CTA voorwaarts → secundaire CTA terug. **Geen** "Sluiten" of "OK" als enige optie. **Edit/create-flows binnen een pane** gebruiken **altijd** de standaard pane-footer (`primaryAction` + `secondaryAction` op `<ShellOverlay kind="pane">`) in plaats van inline save-knoppen onderin de form-content — zie patroon-kaart *Slide-in pane (desktop)*. Inline save-blokken in de body zijn nog wel toegestaan op standalone form-routes (waar geen pane is), of als secundaire affordance (delete-knop in een FIRE-vertraging-card).
  6. Voorwaartse beweging na save: sluit form → toast met "Ongedaan maken"-link OP bestemmingspagina (success-banner). Géén success-state in dezelfde modal/pagina blijven zitten.
- **Autosave-variant** (alleen voor settings-achtige edit-flows): status-label rechtsbovenin "Saving…" / "Opgeslagen — zojuist", debounce 500ms.

### Type 5: Modal / sheet (CRUD / detail / lookup)
- **Wrapper**: `<ShellOverlay kind="pane|sheet|confirm">` is canonical (zie patroon-kaart *ShellOverlay (driewegregel)*). Render-mechanisme voor `kind="sheet"` is `bottom-sheet.tsx`; pagina-componenten importeren **niet** direct.
- **Doel**: ingrijpen op één entiteit zonder pagina-context te verliezen, of detail-zoom.
- **Variant-keuze (driewegregel)**:
  - `kind="sheet"` (default) — single-form, "even iets snel doen". Mobile = peek/mid/full detents; desktop = `md:max-w-lg` centered-bottom.
  - `kind="pane"` — multi-section detail of wizard binnen modal (multi-step). Slide-in op desktop, stack-push op mobile.
  - `kind="confirm"` — onomkeerbare bevestiging. Smal centered modal `max-w-sm` met focus-trap + type-to-confirm.
- **Top-down structuur**:
  1. Drag-handle (alleen bottom-sheet, 4×40px gecentreerd).
  2. Modal header: kicker-met-streepje (klein, 9px mono) → titel (Playfair, 18-22px) → sluit-knop ✕ rechtsboven (44×44 touch-target).
  3. Body: korte uitleg (Source Serif, optioneel) → hoofdinhoud (form, list, detail, breakdown) → optionele `<FiguresStrip>` of `<PullQuote>`.
  4. Footer (sticky, `border-t border-[var(--border-ed)]`, safe-area-padding): duo-CTA verplicht — primair voorwaarts + secundair annuleren. **Niet** "OK" of "Sluiten" als enige optie.
- **Accessibility verplicht**: focus-trap actief, initial-focus op veilig element, return-focus naar trigger bij close, `inert` op achtergrond. Hergebruik `bottom-sheet.tsx` als canonical referentie.

### Type 6: Kassabon / breakdown-modal
- **Doel**: financiële uitkomst tonen als "rekening" — pure WOZ-screenshot stijl.
- **Top-down structuur**:
  1. `<ScenarioCallout>` — regime/scenario-uitleg met paarse linker-border.
  2. `<PullQuote>` met inline highlights (concept-paars, hoofdbedrag-marker).
  3. `<FiguresStrip cols={4}>` — kleurgecodeerd Playfair, één highlight-marker op winnaar.
  4. Breakdown-card met `<RekeningTag label="rekening">` uit bovenrand: section-titles dashed border, mono UPPERCASE; rows in Source Serif body + DM Mono num; subtotal-row bold met solid border; total-row Playfair black met `border-b-4 border-double border-[var(--ink)]`; tax-calc inline-block met paarse linker-border; warn/good-rows met linker-border.
  5. Optionele chart-section (SVG met `useInViewAnimation`).
  6. Optionele year-table met dotted-rows + sleep-hint op `<640px`.

### Type 7: Wizard / multi-step-pagina
- **Routes**: `/onboarding`, `/mijn/checkins`, bank-koppel- en importflows.
- **Doel**: gefaseerde flow — onboarding, jaaroverzicht, doorrekening-stappen.
- **Top-down structuur**:
  1. Stappen-balk bovenaan: "i / iv" of "stap 2 van 5" in italic Playfair, paarse cijfers → dunne progress-bar (height 1-2px).
  2. Editorial header per stap: kicker-met-streepje → stap-vraag in headline (Playfair met italic-em) → `<EditorialDeck>`.
  3. Form-blueprint per stap (zelfde als Type 4, sectie 3-4).
  4. Navigatie-balk onderaan (sticky, safe-area-bottom): "Vorige" tekst-link links → "Volgende" primaire CTA rechts → optioneel "Skip" tekst-link in midden voor optionele stappen.
  5. Save-progress-banner: "Voortgang opgeslagen — je kunt later terugkomen via {deeplink}".
  6. Bij laatste stap success: redirect naar bestemming + toast met undo-link.

### Type 8: Settings / preferences-pagina
- **Routes**: `/mijn/*` (profiel, uiterlijk, notificaties, privacy, geavanceerd, account), `/beheer/*`.
- **Doel**: configuratie en voorkeuren — meestal autosave.
- **Top-down structuur**:
  1. Editorial header: kicker-met-streepje "INSTELLINGEN" → titel (Playfair) → `<EditorialDeck>`.
  2. TabBar of section-anchors: tabs (≤4) of dropdown (>4 secties op mobile). Actieve tab krijgt `border-b-3 border-[var(--module-active-500)]` + subtiele `bg-[var(--module-active-50)]/40`.
  3. Per sectie: `card-editorial`-container met section-label (mono UPPERCASE + optionele romeinse num) → setting-rows (label links + control rechts + help-text italic onder) → toggle-pills voor on/off-knoppen.
  4. Autosave-status-label rechtsbovenin: "Opgeslagen — zojuist" (debounce 500ms).
  5. **Geen save-CTA** voor reguliere settings — autosave is de standaard. Uitzondering: gevoelige instellingen (e-mail, wachtwoord, betaalmethoden) krijgen expliciete save-bevestiging.
  6. Footer: link naar gegevens-export / account verwijderen / privacy-statement.

### Type 9: Empty-state (universeel patroon)
- **Toepassen op**: elke lege lijst, eerste-gebruik-staat, "user-cleared" state, no-results filter.
- **Top-down structuur**:
  1. Centered container: `max-w-md mx-auto py-12 px-4 text-center`.
  2. Icoon (`text-[var(--ink-3)]`, 32-40px) of italic serif kicker.
  3. Headline (Playfair, 1 zin, 18-20px, met optionele italic-em).
  4. Beschrijving (italic Source Serif, 1-2 zinnen, `text-[var(--ink-2)]`, `max-w-prose`).
  5. Primaire CTA — voorwaartse beweging ("Voeg je eerste budget toe"). **Niet** "Sluiten" of passieve "OK".
  6. Optionele secundaire link onder CTA — uitleg/help, mono UPPERCASE 10px.
- **Drie types** (elk eigen copy + CTA):
  - *First-use*: "Nog geen {type}. Voeg je eerste {type} toe om te beginnen."
  - *User-cleared*: "Alles afgerond. Ruim."
  - *No-results-van-filter*: "Geen resultaten. Wis filters."

### Type 10: Calculator / tool-pagina (volledig WOZ-blueprint)
- **Routes**: `/toekomst/whatif`, `/toekomst/strategie`, `/toekomst/rekenhulp`, `/overzicht/belasting` (+ box1/2/3).
- **Doel**: scenario-input + live berekening + resultaat-uitkomst.
- **Top-down structuur**:
  1. Masthead met dubbele lijn boven (`border-t-4 border-double border-b border-[var(--ink)]`): meta-l "Editie · {Module}" → logo "tf." met module-accent dot → meta-r (subtitle).
  2. Headline-row: kicker-met-streepje → h1 met italic-em (Playfair, `clamp(28px, 5vw, 68px)`) → deck (italic Source Serif, linker module-border).
  3. Optionele regime/scenario-toggle: segmented control of `<TogglePill>` rij.
  4. 2-koloms grid (`grid-cols-[380px_1fr]` op desktop, stacked op `<980px`):
     **Linkerkolom (inputs)**: vertical ink-border rechts; section-labels met romeinse numbering; field-rows (label + value); range-slider met module-thumb; toggle-pills voor optionele velden; derived-block (mono, `bg-[var(--paper)]`).
     **Rechterkolom (results)**: `<ScenarioCallout>` → `<PullQuote>` met inline highlights → `<FiguresStrip cols={4}>` → Breakdown-card met `<RekeningTag label="rekening">` → Chart-section (SVG) → Year-table met sleep-hint.
  5. Comparison-block onderaan (`border-t-4 border-double border-[var(--ink)]`): comparison-title (Playfair black + meta) → optionele comparison-summary (italic Playfair met paars/rood highlights) → comparison-bars met "current"-row highlight.
  6. Footer-notes-grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-7 border-t-4 border-double border-[var(--ink)] pt-6 mt-8`): per blok kicker (mono UPPERCASE) + 1 paragraaf body (Source Serif).
  7. Ornament-colophon: `Trifinity ✦ {Module} ✦ {Tool} v{x}`.

### Type 11: Module-shell (cross-cutting chrome-blueprint)
- **Bestanden**: `components/app/shell/responsive-shell.tsx` als root, daarbinnen `desktop-sidebar-shell.tsx` (≥lg) of `mobile-stack-shell.tsx` (<lg).
- **Doel**: chrome leveren rond alle pagina-content — sidebar (desktop), TopBar + StackContainer + BottomBar (mobile), slide-in pane, focus-trap, swipe-back, skeleton-fallbacks.
- **Top-down structuur (desktop, ≥lg)**:
  1. `ResponsiveShell` rendert `Sidebar` via portal naar `document.body` (omzeilt `ChatLayoutWrapper`'s `contain: layout`).
  2. `<main className="hidden lg:block lg:pl-[264px]">` reserveert ruimte naast de fixed sidebar.
  3. Pagina-content rendert binnen `<main>` zonder eigen back-knop, breadcrumb, of module-tab-rij.
  4. Optionele `SlideInPane` (zie patroon-kaart) rendert rechts via dezelfde portal.
- **Top-down structuur (mobile, <lg)**:
  1. `MobileStackShell` wikkelt content in tray-of-three (`TopBar` + content + `MobileBottomBar`).
  2. Tray schuift als één geheel bij push/pop (240ms View Transition met fallback).
  3. `NavStackProvider` houdt per-tab-stacks (`kern`, `wil`, `horizon`, `identity`, `other`) in `sessionStorage`, max-diepte 5.
  4. Pagina declareert `<NavStackMeta title="..." bottomBar={...} />` synchroon vóór data-fetch zodat tray instant rendert; content via Suspense-skeleton.
- **BottomBar-kinds** (Q9 in plan, per-pagina vastgesteld):
  - `'tabs'` — module-tabs, gating-aware. Default voor tab-roots.
  - `'action-bar'` — primair + secundair CTA (form-flows, bv. nieuw-budget, edit-debt).
  - `'context-actions'` — 2-3 detail-knoppen (Bewerken/Verwijderen/Delen op detail-pagina's).
  - `'app-tabs'` — drie vaste in-app-tabs (left/center/right) voor Kern-apps. Vervangt de module-tabs zolang de gebruiker binnen één app navigeert (bv. Budgetteren op `/core/assets/cash?tab=budgetteren`). Center-positie is conventioneel de **home-knop** (`Home`-icon, `moduleAccent: 'wil'`) met label "Home" en `href="/will"`. Left en right linken binnen de app. Registratie via `useLiveBottomBar()?.setConfig({ kind: 'app-tabs', left, center, right })` met cleanup bij unmount — **niet** `live` zelf als useEffect-dep (de context-value identiteit wijzigt bij elke config-set en veroorzaakt een render-loop; depend alleen op de stabiele `setConfig`-setter).
  - `'hidden'` — full-screen wizards (CSV-import, bank-koppeling, check-in).
- **BottomBar-iconen**: `'tabs'` en `'app-tabs'` gebruiken `h-3.5 w-3.5` (14px) — subtiel formaat dat de tekst niet domineert. `'action-bar'` en `'context-actions'` gebruiken `h-4 w-4` (16px). Label-typografie altijd: `text-[10px] font-medium uppercase tracking-[0.06em]`, `gap-0.5` tussen icon en label. Active-state in `'tabs'`/`'app-tabs'`: `border-t-3 border-[var(--module-active-500)]` + `bg-[var(--module-active-50)]/40` + `text-[var(--module-active-700)]` + `rounded-b-sm`. Inactive: `text-[var(--ink-3)]` + `border-transparent`. Hoogte: `style={{ height: 'var(--bottom-nav-height)' }}` op het tap-target, `pb-[var(--safe-area-bottom)]` op de wrapper-`<nav>`.
- **Bottom-nav-state buiten hoofd-modules** (Identity-stack, Beheer, globaal): laatst-actieve hoofd-module **gedimd-actief** (icon + label op `text-[var(--ink-3)]`, accent-streep op `--module-active-200/40`). Niet vol-actief, niet neutraal — behoudt oriëntatie zonder misleiden.
- **DreamTransitionContext** (`/horizon/**`): module-layout overrideert generieke stack-transitie met golden-veil-animatie. Buiten Horizon valt MobileStackShell terug op standaard slide.
- **Beheer-routes** (`/beheer/**`): behouden eigen `max-w-4xl` layout, geen ResponsiveShell-interferentie. Plan §8.6.
- **A11y**:
  - Skip-link "Naar hoofdinhoud" als eerste tab-stop, `sr-only focus:not-sr-only`.
  - Sidebar volledig keyboard-bereikbaar: tab-order = branding → modules → overige → profiel-pill. Collapse-toggle bereikbaar als eigen `<button>`.
  - Mobile: `aria-live="polite"` op TopBar-titel + outgoing tray-tree krijgt `aria-hidden="true"` tijdens 240ms transitie.
  - Swipe-back-gesture beperkt tot edge-zone (`clientX < 24px` op touchstart) om conflict met horizontale scroll-content (charts/tables) te voorkomen.
  - `prefers-reduced-motion: reduce` → instant-swap, geen translate of fade.
- **Niet doen**: pagina rendert eigen back-knop / breadcrumb (shell levert dat), parallel sidebar/drawer-systemen bouwen, `BottomSheet` direct importeren buiten `<ShellOverlay>` (zie driewegregel-patroon-kaart).

### Cross-cutting standaarden voor alle page-types

- [ ] **Back-navigation**: shell levert de terug-affordance — TopBar `←` op mobile (binnen tray-of-three), pane-header of browser-back op desktop. Pagina-content rendert **geen** eigen "← Terug naar X"-link; max 3 niveaus stack-diepte (per `NavStackProvider` configuratie).
- [ ] **Action-bar**: primaire actie altijd voorwaarts geframed ("Bewerken", "Opslaan en doorgaan", "Voeg toe"), nooit destructief.
- [ ] **Confirmation**: type-to-confirm met preview → expliciete bevestiging → success-scherm met undo-window (5s toast). Géén één-tap-destructive ooit.
- [ ] **Loading**: skeleton voor pagina-load (matcht final layout, geen layout-shift); spinner voor enkele actie. Pagina-skeleton volgt page-type-blueprint.
- [ ] **Saving**: autosave (Type 8) → debounced 500ms + status-label; save-CTA (Type 4-7) → expliciete primaire CTA + voorwaartse beweging na save.
- [ ] **Success**: toast/banner OP bestemmingspagina (na redirect), niet in dezelfde modal blijven. Celebration alleen bij mijlpalen.

### Mobile-aanpassing per type
| Type | Mobile-aanpassing |
|---|---|
| 1. Module-landing | Cards-grid 2→1 col, mini-hero stacked. |
| 2. List | Filter-bar wordt scroll-x chips, search verbergt achter knop, sort-control wordt segmented control. |
| 3. Detail | Figures-strip 4→2 col, action-bar wordt sticky bottom met safe-area. |
| 4. Bewerk-pagina | Full-page (geen modal), sticky save-bar onderaan met safe-area. |
| 5. Modal | Bottom-sheet patroon met 3 detents (peek/mid/full), drag-handle zichtbaar. |
| 6. Kassabon | Figures-strip 4→2 col, breakdown blijft single-col, year-table sleep-hint. |
| 7. Wizard | Stappen-balk compact, navigatie-balk sticky bottom met safe-area. |
| 8. Settings | Tabs worden segmented control of dropdown, setting-rows stacked. |
| 9. Empty-state | Geen aanpassing nodig (al gecentreerd). |
| 10. Calculator | Stacked, comparison-bars worden 2-rij grid, regime-toggle full-width. |

