---
id: 0174-de-topbar-draagt-de-paginanaam
title: 'De mobiele TopBar draagt de paginanaam op een eigen, instelbare kleur; de kop op de pagina wordt een oordeelzin'
status: aanvaard
date: 2026-09-22
elements: [app-comp]
---

# 0174 — De TopBar draagt de paginanaam

## Context

Testgebruikers vinden de teksten boven aan de pagina's moeilijk (B-069, B-071). De kop
van een subpagina bestaat sinds de kop-herziening van september uit twee delen,
"Paginanaam | oordeel". Op mobiel toont hij alleen het oordeel, omdat de TopBar de naam al
draagt (`PageVerdictOpening`). Die naam stond daar echter klein en gecentreerd, in de
accentkleur van de module, op papier. Het oog vond hem niet, dus miste de kop zijn onderwerp.

De eigenaar (22 sep 2026) wil op mobiel de paginanaam links in de balk, naast de
terugknop, op een donkerblauwe balk waarvan de gebruiker zelf de kleur kiest. De kop op de
pagina wordt dan één zin mét de paginanaam erin ("Je bezittingen zijn *goed gespreid*.").
Het oordeelswoord houdt zijn stoplichtkleur. Mockup: "‹ Bezittingen" in witte serif op
leisteenblauw (≈ `#3f4a5e`), zonder onderlijn.

Het werk is gefaseerd (plankaart "Topbar & oordeelzin"): F1 de balk, F2 de instelling, F3
de oordeelzin-koppen, F4 de hub-zin en de afronding. Dit ADR legt de besluiten van alle
fasen vast. F1 bouwt alleen D1, D2, D4 en D5.

## Besluit

**D1 — De naam staat links, naast de terugknop.** De rij is [terug?] [naam] [acties]. De
terugknop is een chevron (`ChevronLeft`) en rendert alleen bij een stack-pop of bij de
"← home" op de secundaire tab-roots. Zonder knop staat er géén lege placeholder meer: de
naam schuift naar links en lijnt op de pagina-gutter (16px). De naam is serif, 18px, één
regel met `truncate`, en blijft een `<p aria-hidden>`. De enige `<h1>` blijft de sr-only
paginanaam in de shell (ADR 0110).

**D2 — De balk is chrome, geen module-identiteit.** Zijn kleur loopt via vier eigen
tokens: `--topbar-bg`, `--topbar-fg`, `--topbar-fg-muted` (iconen) en `--topbar-hover`
(drukvlak). Ze worden gegenereerd met `topbarColorVars(hex)` in `lib/color-palette.ts`.
De voorgrond is wit of inkt, en wel de kleur met het meeste contrast op de balk; muted en
hover zijn alfa-varianten daarvan. De naam draagt dus níet meer het module-accent, en de
onderlijn in `--module-active-500` vervalt. De vier accenten (Bezittingen, Schulden,
Budget, Fin) blijven wat ze zijn: identiteit op de pagina. De balk staat erboven en hoort
bij geen van de vier.

Twee regels die daaruit volgen:

- De kleur staat per element, niet als `text-*` op de header, en `--ink`/`--subtle`
  worden op de header niet overschreven. Het accountmenu, het kompas-paneel en het
  weergavemenu hangen ín de header-DOM en moeten op papier en in inkt blijven.
- De ui-ux-regel "inkt-op-papier, nooit donker" geldt voor de pagina. Deze balk is de
  enige bewuste uitzondering, en alleen op mobiel. Desktop heeft geen TopBar
  (`lg:hidden`) en verandert niet.

**D3 — De kleur is per gebruiker instelbaar (F2).** Hij staat op `/mijn/uiterlijk` en
wordt per account opgeslagen in `profiles.topbar_color`. Zelfde patroon als de accenten:
de (app)-layout zet server-side `topbarColorVars(profiel.topbar_color)` op de
app-root, de voorkeur is een own-row pref, en de picker waarschuwt maar blokkeert niet.
`topbarColorVars` accepteert alleen `#rrggbb`. Al het andere valt terug op de standaard,
omdat de waarde rechtstreeks een `style`-attribuut in gaat. `ThemeColorSync` (D4) krijgt in
F2 dezelfde gevalideerde waarde, uit de provider, zodat hij live meeloopt met de picker.
In F1 staat daar nog `DEFAULT_TOPBAR_COLOR`. Blijft dat staan, dan tekent de browserchrome
de standaard terwijl de balk de keuze van de gebruiker toont. Rond een balk-luminantie van
~0,2 halen wit én inkt maar ~4,2:1. Daar hoort de picker te waarschuwen, zoals de
WCAG-hint bij de accenten.

Uitgevoerd in F2 (22 sep), met drie keuzes die hier niet stonden:
- **`null` is de standaard.** Ook wie leisteen zelf kiest of reset, krijgt `null`
  (`normalizeTopbarColor`). Zo volgt die gebruiker een latere wijziging van de standaard.
- **De provider persisteert per groep.** Een PUT bevat alleen de groep die de gebruiker
  aanraakte. Wie de balkkleur kiest, stuurt dus geen accenten mee die op een ander
  apparaat inmiddels veranderd kunnen zijn, en andersom. Tot F2 ging bij elke keuze
  `{module_colors, budget_colors}` samen mee. Een save die op het netwerk of de server
  (5xx) mislukt, gaat terug in de wachtrij en reist mee met de volgende keuze. Zo
  herstelt een mislukte save zich nog steeds, zoals toen alles samen ging.
- **De kleur-vars komen óók op `[data-app-root]`.** Daar wint de SSR-inline van
  `documentElement`. Dat geldt voor alle kleurgroepen, niet alleen de balk.

**D4 — De browserchrome volgt de balk.** `ThemeColorSync` hangt in de TopBar en zet een
tweede `<meta name="theme-color">` vóór de statische papier-meta van de root-layout, met
`media="(max-width: 1023.98px)"`. De browser kiest de eerste passende meta. Onder `lg`
is dat de balkkleur (statusbalk op Android, tabbalk in Safari). Daarboven, en buiten de
app-shell (landing, onboarding), blijft het papier. Bij `topBar.kind: 'hidden'` is er geen
balk, dus ook geen meta. Met `statusBarStyle: 'black-translucent'` loopt de balk op iOS
dóór onder de statusbalk. De witte statusbalktekst was op papier onleesbaar en is dat op
leisteen niet meer. `public/manifest.json` houdt zijn `theme_color`: die is statisch en
kan een gebruikerskeuze (D3) niet volgen.

**D5 — De focusring volgt de balk.** De globale ring is inkt en haalt op de
standaard-leisteen maar 1,96:1. Binnen `[data-topbar]` krijgt hij de voorgrondkleur. De
menu's die in de header hangen (`role=menu`/`dialog`) staan op papier en houden de
inkt-ring (`app/globals.css`, `@layer base`). De compacte `PerspectiveSwitcher` zet
daarom zelf geen ringkleur meer.

**D5b — Rood op de balk krijgt een ring.** Stoplichtkleuren blijven semantisch en dus
ongewijzigd, maar rood-500 haalt op leisteen maar 2,37:1, onder de 3:1 voor een grafisch
object. Groen (3,5:1) en amber (4,2:1) halen het wel. De rode kompasstip en de
ongelezen-badge krijgen daarom een 1px-ring in `--topbar-fg`. Rood haalt tegen wit 3,8:1,
en bij een lichte balk (dan is de ring inkt) 4,2:1. Een ring om álle stippen is verworpen:
amber tegen wit is 2,2:1. De kompaspil in Eenvoudig staat op papier en hovert in een
neutrale rand, niet in het module-accent.

**D6 — De kop op de pagina wordt een oordeelzin (F3).** Dat geldt op
`/overzicht/bezittingen`, `/schulden`, `/budget`, `/belasting` en `/toekomst`: één zin met
de paginanaam en het oordeel ("Je schulden *vragen aandacht*."), constaterend, zonder
imperatief (Wft) en zonder koop-/verkoopmetafoor (ADR 0165). Het oordeelswoord draagt de
stoplichtkleur. Het oordeel wordt geconsumeerd uit de bestaande bron
(`HEFBOOM_VERDICT` blijft ongewijzigd; de zinnen komen in een eigen module), nooit
herberekend. De overige subpagina's houden "Naam | oordeel" (vervolg in F4). De hub
`/overzicht` houdt zijn begroeting. Alleen de zin eronder wordt de lopende zin uit B-069.

## Gevolgen

- **F1:**
  - `components/app/shell/top-bar.tsx` (lay-out en tokens) en
    `components/app/shell/theme-color-sync.tsx` (nieuw).
  - `DEFAULT_TOPBAR_COLOR` en `topbarColorVars` in `lib/color-palette.ts`.
  - De tokens en de focusring in `app/globals.css`.
  - Het hover-vlak van de kompas-trigger (`lever-compass.tsx`) en de ringkleur van de
    compacte `PerspectiveSwitcher`.
  - Tests: `lib/color-palette.topbar.test.ts` (contrast, invoerpoort, `:root` = generator),
    `components/app/shell/top-bar.render.test.tsx` (volgorde, tokens, theme-color) en
    `app/globals-tokens.test.ts` (mapping in `@theme inline`).
- **Documentatie:** de patroonkaart *Mobile TopBar* en de checklist in de ui-ux-skill. Die
  beschreven nog een gecentreerde Inter-titel van 14px.
- **Geen architectuurplaat-wijziging:** dit is presentatie binnen `app-comp`, geen domein,
  datastroom of rekenmotor. F2 voegt een kolom toe; die verschijnt via de ERD-scanner.

## Verworpen alternatieven

- **`--ink`/`--paper` op de header omdraaien** (een "donker thema" voor één element).
  Verworpen: de uitklapmenu's hangen in de header-DOM en zouden meedraaien. Dan staan het
  accountmenu en het kompas-paneel donker, of moet elk menu zijn tokens terugzetten.
- **De balk in het module-accent kleuren.** Verworpen: dan wisselt de balk per route van
  kleur, botst hij op /toekomst met het oordeel in stoplichtkleur eronder, en krijgt de
  gebruiker één kleurkeuze die twee betekenissen draagt.
- **De naam gecentreerd laten en alleen groter maken.** Verworpen door de eigenaar: links
  uitgelijnd leest de naam als het onderwerp van de pagina en sluit hij aan op de kop
  eronder, die ook links begint.
- **De theme-color in de `viewport`-export van de root-layout zetten.** Verworpen: die
  geldt voor de hele site, dus ook voor landing en onboarding (geen balk), en kan de
  gebruikerskeuze van D3 niet volgen.
