---
id: 0026-weergavemodus-eenvoudig-volledig
title: Weergavemodus "Eenvoudig ⇄ Volledig" — server-side scalar pref + palet-commando
status: aanvaard
date: 2026-06-22
elements: [do-meta, app-comp]
---

## Context

TriFinity-pagina's hebben een "diepte"-laag (secundaire KPI's, detail-secties, uitleg) die voor
beginners overweldigend is maar voor gevorderden waardevol. We willen één profiel-brede voorkeur
die deze diepte-laag standaard inklapt ("Eenvoudig") of openzet ("Volledig"), cross-device en zonder
flash.

De app kent al drie aparte zichtbaarheid/voorkeur-machines: privacy-masking en insight-zichtbaarheid
(beide localStorage, apparaat-lokaal) en status-banner-minimaliseren + appearance (beide server-side,
own-row op `profiles`). Een nieuwe modus moet bij het JUISTE patroon aansluiten en geen vierde variant
uitvinden.

## Besluit

- **Opslag = server-side scalar.** Eén kolom `profiles.display_mode text default 'simple'` met
  `check (display_mode in ('simple','full'))`. Scalar (geen jsonb) omdat het één globale waarde is,
  geen per-route-map. Geen nieuwe RLS-policy: de bestaande own-row policy (`auth.uid() = id`) dekt de
  kolom. Geschreven via `PUT /api/display-mode` met de anon RLS-client (`.eq('id', user.id)`), nooit
  service-role.
- **Eén bron van waarheid.** Alle consumers lezen `useDisplayMode()` (`lib/hooks/use-display-mode.tsx`).
  Geen tweede leespad (geen localStorage-spiegel, geen prop-drilling van de raw waarde) — dat zou de
  drift introduceren die CLAUDE.md verbiedt. De provider wordt met `initialMode` uit een server-prop
  geseed (layout-render) zodat SSR == client → geen flash. Persist = optimistisch + fire-and-forget
  PUT met rollback (page-status-stijl).
- **Toggle = ⌘K-palet-commando.** Eén actie `action:toggle-display-mode`, exacte spiegel van
  `action:toggle-privacy`, met dynamisch label. Geen TopBar-knop of `/mijn`-instelling in v1.
- **Default 'simple' voor nieuwe accounts; bestaande accounts gebackfilled naar 'full'.** Een kale
  NOT NULL DEFAULT zou alle bestaande gebruikers in Eenvoudig zetten; de migratie backfillt daarom
  bestaande rijen naar 'full' zodat alleen nieuwe accounts Eenvoudig starten.
- **Mechanisme-only (v1).** De gedeelde `DepthSection`-component wordt opgeleverd maar nog op geen
  pagina ingehangen — pagina-omzetting (te beginnen met de tweede laag van `/overzicht`) is een
  vervolgkaart.

## Gevolgen

- Het zichtbare effect volgt pas wanneer pagina's `DepthSection` gaan gebruiken; v1 levert het schone,
  geteste contract (kolom, hook-API, palet-actie) vóórdat UI erop leunt.
- De ERD beweegt vanzelf mee na `npm run arch:diagram` (nieuwe `profiles.display_mode`-kolom).
- `display_mode` is orthogonaal aan `widget_prefs` en `use-insight-visibility`: het stuurt de diepte-
  laag aan, niet welke widgets aanstaan of welke insight-cards apparaat-lokaal zijn weggeklikt.

## Aanvulling — 9 augustus 2026 (vindbaarheid, fase 1 eenvoudige weergave)

Het UX-onderzoek van 8 aug 2026 (`docs/eenvoudige-weergave-audit.md`) legde bloot dat het besluit
"geen `/mijn`-instelling in v1" in de praktijk betekende: **niemand kon de keuze vinden**. Nieuwe
accounts starten op 'simple' en wisten niet dat er meer was; bestaande accounts stonden na de
backfill op 'full' en wisten niet dat het rustiger kon. ⌘K is een expert-ingang, geen ontdekpad.

Twee aanpassingen op het oorspronkelijke besluit:

- **De keuze staat nu óók op `/mijn/uiterlijk`** — als eerste blok (`DisplayModePicker`,
  `components/mijn/display-mode-picker.tsx`), boven palet en typografie. ⌘K blijft bestaan als
  snelkoppeling. Er komt géén tweede schrijfpad bij: de picker roept `setMode` uit `useDisplayMode()`
  aan, dus dezelfde optimistische state + `PUT /api/display-mode` met rollback.
- **De welkomstgids noemt de weergave in één regel** met een link naar `/mijn/uiterlijk`, in beide
  modi. Dit is de enige plek waar de app zélf over de modus praat.

Wat NIET verandert: de bewuste keuze uit `components/app/hide-in-simple.tsx` om **geen per-sectie-hint
of -toggle** te tonen op de pagina's zelf blijft staan. Het voorstel voor een "ontdek-voetregel" op
zwaar gereduceerde pagina's (APP-4) is expliciet afgewezen — dat zou precies de rust ondermijnen die
Eenvoudig moet leveren.

Ook achterhaald: het "mechanisme-only"-punt hierboven. `DepthSection` is nooit ingehangen; de
pagina-reductie loopt in de praktijk volledig via `HideInSimple` (hard verbergen). De ⌘K-omschrijving
is daarop bijgesteld — "Meer/minder detail op elke pagina" in plaats van de belofte
"Diepte-secties standaard tonen of inklappen", die gedrag beschreef dat niet bestaat. Of
`DepthSection` alsnog wordt ingezet of verwijderd, is een open punt (audit §9.1).

## Aanvulling — 9 augustus 2026 (cijfernorm, fase 2 eenvoudige weergave)

Fase 2 van de audit voegt één regel toe die niet per pagina maar in de **primitive** leeft, en die
daarmee een besluit is en geen implementatiedetail.

**De stripnorm (APP-7): in Eenvoudig toont een `FiguresStrip` maximaal twee cellen.** De norm zit in
`components/editorial/index.tsx` (`SIMPLE_MAX_FIGURES`), niet in tientallen losse mode-ternaries op
de call-sites. Reden: de reductie liep tot nu toe per pagina, en dat liet stelselmatig achterblijvers
staan (Box 1 toonde in Eenvoudig nog vier KPI's, schulden drie) zonder dat iemand dat zag. Een norm
in de primitive vangt óók de call-sites die later worden toegevoegd — dat is precies het verschil
tussen een afspraak en een garantie. De strip forceert daarbij `cols` naar 2, zodat de reductie geen
half-lege kolomindeling oplevert.

Twee ontsnappingsluiken, allebei bewust smal:

- **`simpleFigures`** — expliciete keuze wélke twee cellen blijven staan, voor strips waar "de eerste
  twee" niet de juiste twee zijn. Zonder dit zou de norm de betekenisvolle cel kunnen wegsnijden
  (bv. een uitkomst-cel die achteraan staat).
- **`alwaysFull`** — reductie helemaal uit. Gezet op de zes design-system-previews onder
  `app/(app)/beheer/blueprints/**`, die de primitive juist in zijn volle vorm moeten tonen, en op de
  zes strips onder `app/(app)/rapportages/**`: een gegenereerd rapport- of printdocument mag geen
  cijfers verliezen omdat de lezer toevallig in Eenvoudig staat. Rapportages staan bewust buiten de
  audit-voorstellen. **Niet** gezet op `components/editorial/page-blueprints.tsx`: `PageMiniHero` is
  een compositie-helper voor échte pagina-hero's, geen preview — die hoort gewoon mee te reduceren.

Waar `alwaysFull` wél en niet tegen beschermt, preciezer dan de code-comment het zegt: alle
opt-out-oppervlakken liggen binnen `app/(app)/layout.tsx` en dus binnen de provider. `alwaysFull`
beschermt ze daar niet tegen de fallback hieronder, maar tegen de échte modus-keuze van de gebruiker.

**Bijvangst die als waarschuwing hoort te blijven staan:** `useDisplayMode()` valt búiten een
`DisplayModeProvider` terug op `'simple'` (zie de hook), en die provider hangt alleen in
`app/(app)/layout.tsx`. Elke modus-lezende component die daarbuiten rendert — in de praktijk vooral
unit-tests — krijgt dus stilzwijgend de eenvoudige tak. Tests die de volledige weergave bedoelen
moeten expliciet in een `DisplayModeProvider initialMode="full"` renderen; doen ze dat niet, dan
blijven ze groen terwijl ze de verkeerde tak asserten. Dat is geen theoretisch risico: bij fase 2
gebeurde het in meerdere bestaande suites tegelijk, en het is de reden dat `alwaysFull` bestaat.

Wat NIET verandert: de norm is **presentatie-reductie**, geen tweede rekenweg. Beide modi consumeren
dezelfde reeds berekende `FigureProps`; er wordt nergens een cijfer "vereenvoudigd herberekend"
(CLAUDE.md, consume-don't-recompute). En Volledig blijft in alle gevallen exact zoals het was.
