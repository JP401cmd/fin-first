# Kwaliteitstoets — UI/UX-skill (TriFinity)

> Deel van de `ui-ux`-skill. Pas deze toets toe op ELKE zichtbare UI-bouw of -review. Zie ook `pattern-cards.md` (optionele editorial patronen) en `page-blueprints.md` (elf page-type-blueprints).

## Kwaliteitstoets (pas dit toe op ELKE review)

### Typografie
- [ ] Correcte font per context? (Playfair=koppen, Source Serif=body, DM Mono=data, Inter=UI)
- [ ] Kickers zijn UPPERCASE, 10-11px, letter-spacing 0.08-0.12em?
- [ ] Geldbedragen in DM Mono met tabular-nums?
- [ ] Geen font-mixing binnen één element?
- [ ] Content-secties (artikelen, uitleg, gidstekst) gebruiken `text-base` + `leading-relaxed` voor leesbare body-tekst. Data-secties (tabellen, lijsten, metrics) blijven compact (`text-sm`/`text-xs`).
- [ ] **Mono-font blijft DM Mono**: financiële cijfers, kickers en monospace-meta gebruiken `var(--font-dm-mono)` met `tabular-nums`. JetBrains Mono (zoals in WOZ-rekenmodel) is technisch/code-georiënteerd; DM Mono is humanistic en past bij krant-warmte. Voor toekomstige calculator-modes kan een vierde `font-theme: 'computational'` worden toegevoegd aan `useFontTheme()` zonder de globale standaard te raken.

### Kleur
- [ ] Module-kleur alleen voor de actieve module, niet voor neutrale UI?
- [ ] Contrast ratio minimaal 4.5:1 (AA) voor tekst, 7:1 (AAA) voor kleine tekst?
- [ ] Inkt-hiërarchie correct? (--ink voor primair, --ink-2 voor secundair, --ink-3 voor meta)
- [ ] Geen pure zwart (#000) of pure wit (#fff) als achtergrond?
- [ ] Semantische value-change tokens gebruikt? `--positive` (groen, oklch 0.50 0.09 162) voor stijging, `--negative` (rood, oklch 0.50 0.09 25) voor daling, `--neutral-change` (grijs, oklch 0.67 0.005 88) voor ongewijzigd. Gebruik `text-positive`/`text-negative` classes, NOOIT hardcoded groen/rood.
- [ ] **Module-aware CSS-variabelen**: pagina's onder een module-route leven binnen een layout die `--module-active-50/100/.../950` zet op de bijbehorende module-shades (`--color-kern-*` / `--color-wil-*` / `--color-horizon-*`). Components verwijzen naar `--module-active-500/700/200` in plaats van hardcoded `kern`/`wil`/`horizon`. Cross-module pagina's vallen terug op `--ink`-shades (default in `:root`). Uitzondering: `--module-active-200` (highlight-marker) heeft `--color-horizon-200` als default zodat cross-module-pagina's marker-zichtbaarheid behouden.
- [ ] **Palet-richting — minder FD, meer FT**: TriFinity zit *tussen* FD.nl (cream/bruin) en FT.com (zalm-roze) in. De pagina-achtergrond is geen warm-bruin meer maar een warm-zalm cream (`#fbf2e7`/`--bg`) met bijna-wit paper (`#fef9ef`/`--paper`). Bij twijfel: kies de minder-bruine variant. Géén pure-witte achtergrond toelaten — de warmth blijft. Géén FT-imitatie (geen FT-pink `#FFF1E5` als 1-op-1 kopie).

### Ruimte & Layout
- [ ] Consistent gebruik van spacing (4px grid: 4, 8, 12, 16, 20, 24, 32)?
- [ ] Touch targets minimaal 44×44px?
- [ ] Responsive: werkt op 360px mobiel en 1280px desktop?
- [ ] Witruimte als bewuste keuze, niet als toevallige leegte?

### Interactie
- [ ] Hover state aanwezig op klikbare elementen? (schaduw + translateY(-1px))
- [ ] Klikbare kaarten als `<button type="button">` met `text-left`?
- [ ] Transitions 0.15-0.2s, geen abrupte veranderingen?
- [ ] Focus state zichtbaar voor keyboard-navigatie?
- [ ] Bij waardeveranderingen (herberekening, data-refresh): `flash-up` (groene puls) of `flash-down` (rode puls) CSS-class via `useFlashChange(value)` hook (`lib/hooks/use-flash-change.ts`). Animatie duurt 1s, respecteert `prefers-reduced-motion`. Toepassen op saldi, budgetbedragen, vermogensupdates.

### Tabellen
- [ ] Numerieke kolommen rechts uitgelijnd (`text-right font-mono tabular-nums`)?
- [ ] Header-rij: `text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]` — nooit bold of groot?
- [ ] Hover op rijen: `hover:bg-[var(--subtle)]` voor scanbaar browsen?
- [ ] Zebra-striping optioneel (`even:bg-[var(--subtle)]/30`) — alleen bij >10 rijen?
- [ ] Geen verticale borders — alleen horizontale `border-b border-[var(--border-ed)]`?
- [ ] **Dotted ritme** voor editorial-pagina's: tabellen op gids, jaaroverzicht, rapportages gebruiken `border-b border-dotted border-[var(--rule-soft)]` i.p.v. solid borders. Op data-zware dashboards blijft `border-[var(--border-ed)]` solid voor scanbaarheid.
- [ ] **Sleep-affordance**: tabellen die op `<640px` horizontaal scrollen tonen `'sleep →'`-hint absolute top-2 right-2 in mono UPPERCASE. Verbergen via `[data-scrolled="true"]::before { opacity: 0 }` zodra `scrollLeft > 0`. Zie patroon-kaart *Sleep-affordance op overflow-tabellen*.
- [ ] **Conditionele celkleur** (bv. stoplicht per rij/waarde): geef de kleur door als een override die de standaard-kleurklasse *vervángt* (JS-ternary / `className || default`), nooit als een extra `text-*`-class die náást de component-eigen kleurklasse wordt geplakt. Twee `text-*`-utilities met gelijke specificiteit strijden om dezelfde property en de winnaar hangt af van Tailwinds scanvolgorde, niet van de stringvolgorde — de kleur rendert dan onbetrouwbaar. Spiegel het `Kpi`-patroon (`valueClass ?? 'text-[var(--ink)]'`), niet een `Td`-helper die intern al een default zet én een losse kleur-className achteraan plakt.

### Grafiek-animaties
- [ ] Elke chart/sparkline/voortgangsbalk gebruikt `useInViewAnimation` (`lib/hooks/use-in-view-animation.ts`)?
- [ ] SVG-paden: `pathLength={1}` + `strokeDasharray="1"` + `strokeDashoffset={hasEntered ? 0 : 1}`?
- [ ] Balken starten op `width: '0%'` vóór viewport-intrede (niet direct op doelwaarde)?
- [ ] Inline `transition` style i.p.v. Tailwind `transition-*` (voor delay + cubic-bezier controle)?
- [ ] `transition: 'none'` bewaker voor pre-entered state?
- [ ] Stagger-timing aanwezig: 60ms per rij, 80ms per SVG-pad?
- [ ] `prefers-reduced-motion` gerespecteerd (hook handelt dit intern af)?
- [ ] Animaties herhalen bij pagina-navigatie (component remount reset hook state)?
- [ ] `duration` dekt de volledige animatiesequentie?

### Editorial signature-elementen
- [ ] **Kicker-streep**: elke kicker heeft een 28×1px module-gekleurde streep ervoor. Implementatie: `<span class="inline-block w-7 h-px bg-[var(--module-active-500)] mr-2.5 align-middle" />` vóór de kicker-tekst, of `::before` met dezelfde dimensies. Op `<380px` reduceren naar 20px.
- [ ] **Headline-emphasis**: H1/H2 met redactionele lading (hero, sectie-opening, gids-vraag) bevat één italic em-element in module-kleur: `<em class="font-serif italic font-normal text-[var(--module-active-700)]">woord</em>`. Niet meer dan één per headline. Niet bij data-koppen ("Saldo per categorie") — alleen narratieve koppen ("Welke route kies je?", "Hoeveel ruimte heb je nog?").
- [ ] **Editorial deck**: subkop onder hero-headline gebruikt `border-l-2 border-[var(--module-active-500)] pl-3 italic font-serif text-[var(--ink-2)] max-w-[60ch]`. Vervangt gewone `<p>` als de pagina een redactionele intro nodig heeft.
- [ ] **Highlight-marker (halve transparante streep)**: gebruik `bg-[linear-gradient(transparent_60%,var(--module-active-200)_60%)] inline px-0.5` op één à twee woorden of bedragen binnen een paragraaf, of op een hoofdbedrag in een figures-strip. Highlight-marker neemt de **actieve module-kleur** aan in haar transparante 200-shade — Kern-200 op `/overzicht`-routes, Wil-200 op wil-routes (`/mijn`, `/berichten`, `/nieuws`), Horizon-200 op `/toekomst`-routes. Cross-module-pagina's vallen terug op Horizon-200 (universele uitkomst-marker). Het 200-niveau is van zichzelf zo licht dat de tekst eronder leesbaar blijft.
- [ ] **Hoofdbedrag-highlight verplicht**: in elke analyse, scenario-output, kassabon-summary, jaaroverzicht of figures-strip krijgt het *eindresultaat / hoofduitkomst-bedrag* (de conclusie waar de gebruiker naartoe leest) consistent een highlight-marker. Niet meer dan één highlight-marker per pagina-sectie. Géén highlight op tussentotalen, kosten, of vergelijkings-baselines — alleen op de winnaar/uitkomst.
- [ ] **Module-aware accenten** (incl. highlight-marker): kicker-streep, headline-em, editorial-deck én highlight-marker volgen automatisch de actieve module-kleur via `--module-active-*` (`-500` voor accent-bars/strepen, `-700` voor em-tekst, `-200` voor highlight-marker). Cross-module pagina's vallen terug op `--ink-2` voor em en `--rule-soft` voor streepjes; voor highlight-marker geldt Horizon-200 als expliciete fallback (zodat de marker zichtbaar blijft).
- [ ] **Mini-artikel-blueprint voor entiteit-kaarten**: categorie-, asset-, debt-, en doel-kaarten (alle klikbare entiteit-tegels op kern/will/horizon-pagina's) volgen de redactionele blueprint:
      1. Module-accent-streep (3px boven, `bg-[var(--module-active-500)]` of type-kleur).
      2. Kicker-regel: kleine icon + UPPERCASE label in mono — geeft categorie-context.
      3. Headline (Playfair, 16-18px) met optionele italic-em op één woord wanneer de naam meerwoordig is ("Eigen *huis*", "Spaar*pot*").
      4. Hoofdbedrag (DM Mono, 18-22px, tabular-nums) met highlight-marker (`var(--module-active-200)`) wanneer het bedrag het *primaire scan-doel* is (categorie-totaal, asset-waarde, debt-restschuld). Sub-bedragen geen marker.
      5. KPI-strip of mini-bar als secundaire data.
      6. Meta-regel in italic Source Serif 4 (`text-[var(--ink-3)]`, italic, 11-12px) — "4 rekeningen", "1 huis", "12 jaar resterend". Vervangt UPPERCASE-meta op entiteit-kaarten; krant-italic past bij artikel-DNA.
      Niet voor pure data-widgets (sparkline, kpi-tile, dashboard-totals) — die houden de bestaande compacte structuur.
- [ ] **Dubbele lijn als finale**: total-rijen in kassabonnen, rapportage-summaries en balans-eindtotalen krijgen `border-b-4 border-double border-[var(--ink)]` als boekhoudkundige sluitstreep. Eenmalig per tabel, alleen op de eindrij — nooit als generieke divider.
- [ ] **Ornament-colophon**: footer-meta op editorial pagina's gebruikt `✦` als scheidingsteken: `Trifinity ✦ {module} ✦ v{x.y}`. Niet `|`, niet `·`, niet `—`. Cursor-default, niet selectable.
- [ ] **Romeinse sectie-numbering** (optioneel): long-form editorial pagina's met ≤4 secties (gids, jaaroverzicht, will-narratief) tonen `i. ii. iii. iv.` rechts in section-label, in italic Playfair `text-[var(--module-active-700)]`. Niet op dashboards/lijsten/forms. Op `<380px`: `text-xs`. Op `<320px`: verbergen.
- [ ] **Romeinse reeks bij meerstaps-flows** (zoals onboarding): de romeinse reeks is een doorlopende telling over álle content-stappen — leid 'm af uit dezelfde bron als `STEP_GROUP_INDEX`/`currentStep`, niet uit een losse hardcoded string per stap-component, zodat een tussengevoegde stap niet stilzwijgend de rest laat verschuiven.

### Consistentie
- [ ] Past het in het bestaande design systeem?
- [ ] Geen nieuwe kleuren, fonts of patronen zonder goede reden?
- [ ] Hergebruik van bestaande tokens en utilities?
- [ ] Geen `rounded-*` classes (behalve `rounded-full`) — alle hoeken zijn scherp?
- [ ] Elke `WidgetShell` MOET een `kicker` prop hebben — het UPPERCASE label bovenaan de widget. Geen widget zonder kicker.
- [ ] `SectionDivider` gebruiken voor visuele scheiding tussen content-blokken. Drie varianten: (1) dunne lijn `border-t border-[var(--border-ed)]` met `my-6`, (2) redactioneel asterisk-patroon `* * *` in `text-[var(--ink-4)] text-center my-8`, of (3) **`variant="double-rule"`** voor hero-koppen op editorial-pagina's: rendert `border-t-4 border-double border-b border-[var(--ink)]` (krant-masthead-stijl). Niet voor chrome (`AppHeader`) — kost te veel verticale ruimte op mobile.
- [ ] Tijdnotatie krant-stijl: `HH:mm` voor vandaag, `d MMM` voor dit jaar, `d MMM yyyy` voor oudere datums. NOOIT relatieve tijden als "2 uur geleden" of "3 dagen geleden" — dit doorbreekt de krant-esthetiek.
- [ ] Tests die getoonde bedragen pinnen: assert `formatCurrency`-output met een regex (bv. `/€\s*1\.234/`) of een genormaliseerde string — de nbsp (` `) tussen `€` en het bedrag matcht níet tegen testing-library's default whitespace-normalizer (kostte in jul 2026 twee extra iteraties).

### Navigatie
- [ ] Actieve tab heeft `border-b-3` onderstreep + subtiele achtergrond `bg-[module-50]/40`?
- [ ] Tab-tekst matcht module-kleur bij active state?
- [ ] Alle navigatie-elementen minimaal 44px touch target?
- [ ] Geen ingebakken back-knop in pagina-content — shell levert die via mobile TopBar of desktop pane-header. Zie patroon-kaart *Mobile TopBar* en page-type 11.
- [ ] Sidebar-active-state via `--module-active-*` (zelfde tokens als kicker-streep): linker accent 3px in `-500` + bg-tint `-50/40`. Niet hardcoden naar `kern`/`wil`/`horizon`-hex.
- [ ] Modal-keuze altijd via `<ShellOverlay kind="...">` driewegregel — geen directe `BottomSheet`-imports buiten de wrapper.
- [ ] **Mobiele TopBar-titel** (elke nieuwe route onder `app/(app)/**` behalve tab-hoofdpagina's, die zijn bewust titelloos): route in `lib/nav-config.ts` opnemen (dan vult `resolveRouteTitle()` automatisch), anders `EXTRA_ROUTE_TITLES`; runtime-titel op `[type]`/`[id]`-detailpagina's via `<NavStackMeta title={…} />`. Titel-styling zit centraal in `components/app/shell/top-bar.tsx` — niet per pagina regelen. Verifieer op smal viewport.

### Happy Flow & Voorwaartse Beweging
- [ ] Bij elke succesvolle actie beantwoordt de UI drie vragen: (1) Is het gelukt? (2) Wat nu? (3) Wat als fout? — NOOIT een kale "OK"/"Sluiten".
- [ ] Primaire CTA na succes is *outcome-modelled* ("Terug naar budgetten", "Bekijk je doel") — NOOIT "Sluiten", "X", "OK".
- [ ] Elke modal/sheet na save heeft een duo-CTA: **primair** (voorwaartse vervolgactie, bv. "Voeg nog een toe") + **secundair** (terug naar overzicht). Nooit alleen een exit.
- [ ] Success-state NIET in dezelfde modal — sluit modal, toon inline success-banner op bestemmingspagina (`--positive` tint, 4-6s) of toast met "Ongedaan maken" link.
- [ ] Celebration (confetti, `LevelUpCelebration`, grote animatie) alleen bij mijlpalen: eerste entiteit, doel 100%, maand-afsluiting, streak. NOOIT bij routine-saves.
- [ ] Routine-feedback: subtiele green-check draw-in (200-400ms) + toast via bestaand `ToastProvider` (`components/app/toast-provider.tsx`). Bewaar spectakel voor wat telt.
- [ ] Micro-feedback binnen 100ms op klik (knop-shrink, haptic op mobiel) — nog vóór de server reageert.
- [ ] Context-aware next action: na budget aanmaken → "Voeg eerste transactie toe"; na transactie → "Nog een?"; na doel behaald → "Stel volgende doel"; na aanbeveling geaccepteerd → "Bekijk je actiebord".

### Microcopy voor succes & bevestiging
- [ ] Actieve stem met "je": "Je hebt je eerste budget opgezet" — NOOIT "Budget is aangemaakt" (passief, banktaal).
- [ ] Werkwoord eerst in CTA's: "Bekijk je spaarquote" > "Spaarquote bekijken".
- [ ] Empowerend, niet bevestigend: "Genoteerd. Nog een?" > "Opgeslagen ✓".
- [ ] NOOIT forced continuation: primaire CTA mag sturen, maar een tekstlink "Later" / "Terug naar overzicht" moet altijd zichtbaar zijn.
- [ ] Geen dubbele bevestiging ("Zeker weten?") nadat de gebruiker al bevestigd heeft.
- [ ] Framing blijft krant-toon: feitelijk en waardig, geen uitroepteken-overload. "April is rond. Bekijk je spaarquote." past; "Yay! Gelukt! 🎉" niet.

### Error states & form-validatie
- [ ] Valideer op `blur`, her-valideer op `input` zodra error zichtbaar is. Error verdwijnt zodra input geldig wordt.
- [ ] Foutmelding inline onder het veld met rood-icoon + `text-negative`. Toast alleen voor netwerk/systeem-fouten, niet voor veld-specifiek.
- [ ] Copy-formule: *wat ging mis + hoe fix je het*. Nooit "Ongeldige invoer" — wel "Vul een bedrag groter dan 0 in."
- [ ] Bij >5 velden: samenvatting bovenaan form met anchor-links naar veld + inline errors.
- [ ] Errors aangekondigd via `role="alert"` of `aria-live="assertive"` voor screenreaders.
- [ ] Netwerk-fout UI: titel + oorzaak + `Opnieuw proberen`-knop + (indien transactie) transactie-ID + support-link.
- [ ] Required-indicator consistent: rood sterretje `*` na label als meeste velden optioneel zijn; "(optioneel)" als meeste verplicht.

### Accessibility diepte (beyond contrast)
- [ ] Alle interactieve elementen bereikbaar via `Tab` in logische DOM-volgorde.
- [ ] Focus-ring zichtbaar: minimaal 2px, 3:1 contrast tegen omliggende kleuren. Niet `outline: none` zonder vervanging.
- [ ] Modals/sheets: focus-trap actief, initial-focus op veilig element (annuleren of eerste input — nooit destructive), return-focus naar trigger bij close. Hergebruik het trap-patroon uit `components/app/bottom-sheet.tsx` (r232-276) als canonical referentie — bouw geen parallel systeem.
- [ ] Skip-link "Naar hoofdinhoud" als eerste tab-stop, `sr-only focus:not-sr-only`.
- [ ] Live-regions: `aria-live="polite"` voor status (opgeslagen, bijgewerkt), `"assertive"` alleen voor errors/interrupts.
- [ ] `prefers-reduced-transparency` gerespecteerd (iOS 17+): translucente oppervlakken worden vol op voorkeur.
- [ ] Zichtbare labeltekst moet in de accessible name zitten — `aria-label` mag nooit zichtbare tekst tegenspreken.
- [ ] Icons-only buttons: altijd `aria-label`, nooit alleen een emoji/SVG zonder tekstalternatief.

### Trust & veiligheid (fintech-specifiek)
- [ ] Privacy-toggle (oog-icoon) om bedragen te maskeren — status onthouden per device. Bedragen worden `••••••` in DM Mono.
- [ ] Data-freshness label op elk saldo/chart: "Bijgewerkt om HH:mm" (krant-stijl, nooit "2 min geleden"). Stale >N min → zichtbaar markeren. Zie `briefing-stale-banner.tsx` als patroon.
- [ ] Bevestiging bij onomkeerbare acties: type-to-confirm (bedrag of naam) voor transacties >drempel of delete van entiteit. Nooit één-tap destructive.
- [ ] Twee-staps-flow voor destructief: preview → expliciet bevestigen → success-scherm met referentie + undo-window (indien mogelijk).
- [ ] Saldo op primaire dashboards standaard zichtbaar — gebruiker kiest maskeren, niet andersom.
- [ ] Fout-herstel bij transacties: altijd transactie-ID + retry + support-pad. Nooit onzekerheid of het geld bewoog.
- [ ] Sessie-timeout countdown + laatste-login info in profiel + kill-switch voor andere sessies (langetermijn).

### Empty states
- [ ] Elke lege lijst toont: icoon/kicker + 1-regel kop + 1 zin uitleg + 1 primaire CTA. Geen CTA = doodlopend.
- [ ] Onderscheid drie types: (1) *first-use* ("Voeg je eerste budget toe"), (2) *user-cleared* ("Alles afgerond. Ruim."), (3) *no-results* van filter ("Geen resultaten. Wis filters."). Elk eigen copy + CTA.
- [ ] `WidgetEmpty` uitbreiden met optionele `action`-prop — verplicht voor lijstcomponenten op entiteitpagina's (budgets, assets, debts, goals).
- [ ] Illustratie alleen als die iets léért. Bij twijfel: kicker + serif-zin in `italic` + CTA — past bij krant-esthetiek.
- [ ] Eerste-gebruik empty state IS het onboarding-moment. Niet bovenop modal-tour stapelen.
- [ ] Empty-state-CTA mag direct een `<ShellOverlay kind="sheet">` openen via query-state of `router.push()` (bv. "Voeg eerste budget toe" → `?new=true` triggert sheet) — géén aparte modal-CTA-component bouwen die buiten de driewegregel valt.

### Notifications & feedback-hiërarchie
- [ ] Gebruik het bestaande `ToastProvider` (`components/app/toast-provider.tsx`) — bouw geen parallel toast-systeem. Ondersteunt success/info/warning/error, auto-dismiss, `role="alert"` + `aria-live`.
- [ ] Hiërarchie (laag naar hoog): inline < toast < banner < modal. Kies laagste niveau dat info overbrengt.
- [ ] Toast: non-blocking, auto-dismiss 4-6s (errors 8-10s), max 3 gestapeld, met actie ("Ongedaan maken" / "Opnieuw") wanneer mogelijk.
- [ ] Banner voor persistente state (offline, sandbox, onderhoud) — dismissible alleen als niet-kritiek.
- [ ] Modal alleen voor destructieve/onomkeerbare bevestigingen of blokkerende beslissingen.
- [ ] Badge-counts: cap op "99+", clear bij view, niet opnieuw badgen voor hetzelfde item.

### Loading states & skeletons
- [ ] Nielsen-drempels: <100ms geen indicator, 100ms–1s micro-fade, 1–10s skeleton/spinner, >10s progressbar met stappen.
- [ ] Skeleton voor bekende layout (pagina, widget, tabel), spinner voor enkele actie (save-knop, rij-update).
- [ ] Skeleton-dimensies matchen final layout — geen layout-shift bij data-aankomst.
- [ ] Shimmer/pulse max 1.5s cycle, respecteert `prefers-reduced-motion` (statisch grijs fallback).
- [ ] Nooit spinner én skeleton in dezelfde container stapelen.
- [ ] Skeletons in krantstijl: grijze blokken op `--paper`, scherpe hoeken (geen `rounded-*`).

### Mobile gestures & touch (codificering bestaand)
- [ ] Tap-target minimaal 44×44px (Apple) / 48×48dp (Material), minimaal 8px spatie ertussen.
- [ ] Primaire acties in thumb-zone (onderste derde op phones); destructive buiten thumb-zone of achter confirm.
- [ ] Swipe-to-delete altijd met zichtbare affordance (icoon) + undo-toast 5s. Nooit enige delete-manier.
- [ ] Pull-to-refresh alleen op scrollbare content-lijsten, niet op forms/dashboards met auto-refresh.
- [ ] Bottom-sheets: 3 detents (peek/mid/full), drag-handle zichtbaar, expliciete sluit-knop (niet alleen swipe), `inert` op achtergrond, focus-trapped. Hergebruik `components/app/bottom-sheet.tsx`.
- [ ] Safe-area: `env(safe-area-inset-bottom)` padding voor CTA's op iOS-notch / Android-gesture-bar (zie `safe-bottom` class in bottom-sheet).
- [ ] **Range-thumb dimensies**: native of custom `<input type=range>` thumbs zijn 16px desktop / 18px op `(pointer:coarse)`, met `--module-active-500` fill en 2px ink-border. Geen onzichtbare/subtiele thumbs. Track: `height: 2px` desktop / `3px` mobile. Hover-state: `transform: scale(1.2)` + thumb-fill naar `--module-active-700`.

### Offline & stale-data
- [ ] Persistente offline-banner bovenaan bij verlies connectie; writes lokaal queuen met "Synchroniseert zodra online"-label.
- [ ] Stale-data badge op elke view ouder dan freshness-budget (5 min voor saldi, 1u voor budgetten, 24u voor briefings).
- [ ] Fallback bij afgesloten modules: waar een berekening zijn bron uit een andere module haalt, altijd een alternatief pad (per CLAUDE.md module-regel).
- [ ] Retry met exponential backoff, zichtbaar voor gebruiker: "Opnieuw over 3s…" — nooit stilzwijgend falen.

### Form design & input-UX
- [ ] Labels **boven** velden, nooit placeholder-als-label (placeholder verdwijnt, schaadt recall + accessibility).
- [ ] Smart defaults: vandaag als datum, EUR als valuta, vorige keuze onthouden. Nooit pre-fill bij bedragen of gevoelige velden.
- [ ] Progressive disclosure binnen forms: geavanceerde velden achter "Meer opties"-toggle. Korter form = meer ingevulde forms.
- [ ] Autosave-patroon voor multi-field sheets: status-label "Saving…" / "Opgeslagen — zojuist" / "Niet opgeslagen — opnieuw". Debounce 500ms.
- [ ] Input-groepen: verwante velden bij elkaar met 24-32px tussen groepen, 8-12px binnen. Geen borders om groepen.
- [ ] Numerieke inputs: `inputmode="decimal"`, `font-mono tabular-nums`, locale-formatting (NL: 1.234,56), valuta-symbool als prefix.

### Data-density & informatie-architectuur
- [ ] **Tabel** voor vergelijking/sort/bulk-acties over ≥3 attributen. **Lijst** voor single-stream met ≤3 attributen. **Kaart** voor visuele/heterogene items of <12 items.
- [ ] Bij >20 rijen: dichtheids-toggle (comfortabel/compact) + groeperingskop (datum, categorie).
- [ ] F-patroon voor dashboards/tekstdicht: kritieke data linksboven, labels links, waarden rechts. Z-patroon voor single-goal schermen.
- [ ] Miller 7±2: inline chip-sets, top-nav items, dashboard-widgets above-the-fold max 5-9.
- [ ] Progressieve disclosure: <20% use-case achter "Toon meer" / expand-on-row-click.

### Search, filter, sort
- [ ] Search-bar pas bij >25 items of cross-entity. Bij kleine vaste lijsten: filter-chips.
- [ ] Actieve filters als verwijderbare chips bovenaan resultaten + "Alles wissen". Zichtbare state + één klik verwijderen.
- [ ] Filter-state in URL-query params — terug-knop herstelt state, URL deelbaar.
- [ ] Live resultaat-aantal naast "Toepassen" (of auto-apply met 300ms debounce).
- [ ] Bulk-selectie: sticky actiebalk verschijnt bij eerste selectie met "X geselecteerd" + "Alle N selecteren".
- [ ] Sort-control apart van filter, blijft actief wanneer filters wijzigen.

### Performance UX & optimistic UI
- [ ] Nielsen-drempels gerespecteerd: 0.1s instant, 1s flow, 10s aandacht weg. Feedback bij elke grens.
- [ ] Optimistic updates voor idempotente acties (toggle, mark-complete, reorder, like) — revert met toast bij fout.
- [ ] **NOOIT optimistic** voor financiële schrijf-acties (transactie, overboeking, aflossing). Altijd expliciete pending-state + server-bevestiging.
- [ ] Debounce tekst-input 300ms, throttle scroll/resize 16ms (1 frame).
- [ ] Doherty-drempel (400ms): UI-rondreis <400ms houdt gebruiker in flow — target voor interacties.

### Content & copy (aanvulling op toon)
- [ ] Plain language: korte zinnen (≤20 woorden), actieve stem, één idee per zin.
- [ ] Sentence case voor UI (knoppen, koppen, menu-items). Title Case alleen voor eigennamen.
- [ ] Cijfers als cijfers (behalve "één" als voornaamwoord). Valuta volgens NL-locale met `1.234,56`.
- [ ] "Je" als aanspreking, "we" spaarzaam. Geen chatty contracties in financiële context (vertrouwen).
- [ ] Glossarium: één woord per concept ("transactie" óf "boeking", niet beide door elkaar).


## Animatie-standaarden (canoniek — voor bouw én review)

> Eén bron voor zowel `frontend-ui-builder` als `ux-review-expert`. Charts, sparklines en voortgangsbalken volgen deze timing exact.

### Trigger-regels (KRITISCH — welke hook)
- **Pagina-component** (scrollbare inhoud) → `useInViewAnimation` uit `lib/hooks/use-in-view-animation.ts`.
- **Modal/BottomSheet-component** (altijd zichtbaar bij openen) → `useModalAnimation` uit `lib/hooks/use-modal-animation.ts`.
- Nooit een kale `useState + useEffect + setTimeout`-constructie — altijd via een van deze hooks (worden automatisch gereset bij remount/heropenen en respecteren `prefers-reduced-motion`).

### Unified timing (alle charts MOETEN dit volgen)
| Element | Duur | Bezier | Delay |
|---|---|---|---|
| SVG lijn draw | 700ms | `.22,1,.36,1` | 0ms |
| SVG fill fade | 250ms ease-out | n.v.t. | 455ms |
| SVG meerdere lijnen stagger | 80ms per lijn | `.22,1,.36,1` | 0ms |
| Progress bar fill | 700ms | `.22,1,.36,1` | 0ms |
| Rij/item stagger | 60ms per rij | `.22,1,.36,1` | 0ms |
| Modal open delay | 100ms | n.v.t. | — |

**Verboden:** stagger < 60ms, duration < 400ms voor lijn-charts.

### Waardeverandering-animaties (flash)
| Trigger | CSS-class | Kleur | Duur |
|---|---|---|---|
| Waarde stijgt | `flash-up` | `--positive` (groen oklch puls) | 1s |
| Waarde daalt | `flash-down` | `--negative` (rood oklch puls) | 1s |
| Geen verandering | — | — | — |

Altijd via `useFlashChange(value)` (`lib/hooks/use-flash-change.ts`) — nooit handmatig CSS-classes toekennen. Respecteert `prefers-reduced-motion`. Toepassen op saldi, budgetbedragen, vermogensupdates, netto-vermogen.

### Checklist per chart-component
- [ ] Pagina-component: `useInViewAnimation` met `ref` op wrapper-div · Modal-component: `useModalAnimation` (geen ref nodig).
- [ ] SVG-paths: `pathLength={1}` + `strokeDasharray="1"` + conditionale `strokeDashoffset`.
- [ ] Pre-entered guard: `transition: hasEntered ? '...' : 'none'` (geen flash bij mount).
- [ ] `animationComplete` gebruikt om hover-handlers te gaten.
- [ ] `duration`-prop = totale animatie-sequentie (inclusief stagger van laatste element).
- [ ] `prefers-reduced-motion` automatisch gerespecteerd door de hook.
- [ ] Animaties herhalen bij pagina-navigatie (component-remount reset hook-state).
- [ ] `LogTimeline`: tijdlijn-lijn via `drawPath` op `<path pathLength={1}>` (niet `fadeInFill` op root `<svg>`); volgorde lijn (t=0ms, 500ms) → labels (t=300ms) → huidig-marker (t=400ms) → FIRE-markers (t=500ms) → events/acties (t=600ms).
- [ ] `useInViewAnimation` in een modal (bijv. veerkrachtsbalken) → `forModal: true` of `triggerDelay` instellen.
