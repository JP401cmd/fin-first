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
