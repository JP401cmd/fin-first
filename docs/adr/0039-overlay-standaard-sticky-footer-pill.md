---
id: 0039-overlay-standaard-sticky-footer-pill
title: Eén overlay-systeem — sticky footer-acties + automatisch verbergen van de nav-pill
status: aanvaard
date: 2026-07-13
elements: [app-comp]
---

De app krijgt één overlay-systeem: alle modale oppervlakken lopen via
`<ShellOverlay>` (kinds `pane`/`sheet`/`confirm`, bouwend op `BottomSheet` en
`SlideInPane`), met een korte, expliciete uitzonderingslijst. Twee gedragingen
worden standaard: primaire acties staan in een **sticky footer** onderin elke
sheet (óók op klein scherm), en de zwevende `FloatingNavButton` (de nav-pill)
**verbergt zich automatisch** zodra er een overlay open is.

## Context

Er waren in de app ~18 afwijkende overlay-implementaties: eigen `fixed inset-0`
constructies met wisselende z-index (`z-40`/`z-50`), knoppen die onderaan de
scroll-content meescrolden (en op mobiel achter de nav-pill of onder de
viewport-rand verdwenen), en inconsistente omgang met de zwevende pill. De
`BottomSheet`/`SlideInPane`/`ShellOverlay`-driewegregel bestond al maar werd niet
overal gebruikt. Dit gaf UX-drift en herhaalde z-index-bugs (zie
`docs/ux-review-jul2026.md` §8, besluit 6).

Twee terugkerende klachten:

1. **Sticky acties ontbraken.** Sheets lieten hun primaire knoppen onderaan de
   scrollbare content staan. Bij een lange sheet op een klein scherm moest de
   gebruiker naar beneden scrollen om te kunnen opslaan/annuleren.
2. **De nav-pill prikte door modals heen.** De pill (`z-[60]`) werd door gewone
   modals (`z-[70]`) wel afgedekt, maar bij afwijkende overlays met een lagere
   z-index (`z-40`/`z-50`) stond de pill er nog overheen — visuele overlap met
   modale content en actieknoppen.

## Besluit

**Fase 1 (deze ADR — capability).** De gedeelde overlay-componenten krijgen de
standaard-affordances; de migratie van de afwijkende oppervlakken volgt in fase
2.

1. **Eén systeem.** Nieuwe overlays lopen verplicht via `<ShellOverlay>`. De
   z-index-tabel in CLAUDE.md §Modal-conventie beschrijft **alleen** de
   gedocumenteerde uitzonderingen — geen vrij keuze-menu:
   - **chat** (Will-coach-FAB/-pane),
   - **command-palette** (`⌘K`, peer van de pill),
   - **share-dialog** (`z-[90]`),
   - **sleepmodus** (`z-[80]`),
   - **sessie-timeout** (`z-[200]`).

2. **Sticky footer-acties (ook mobiel).** `BottomSheet` rendert de `footerSlot`
   als niet-scrollend blok onderin (bovenrand `border-t border-[var(--border-ed)]`
   + `bg-[var(--paper)]` + safe-area-padding). `<ShellOverlay>` exposeert dit als
   `footer`-prop voor kind `sheet`/`confirm`; kind `pane` genereert de footer al
   uit `primaryAction`/`secondaryAction` (desktop `SlideInPane` én mobiele
   `BottomSheet`-fallback). Backwards-compatible: zonder footer verandert er
   niets.

   *Naamkeuze:* de sticky-footer-capability bestond al als `footerSlot` op
   `BottomSheet` (met 8 consumers). Die is **niet** hernoemd — een tweede,
   identiek gedragende prop zou parallelle stijl introduceren. `footerSlot` is de
   canonieke prop; `<ShellOverlay>` biedt hem als `footer` aan de publieke
   entree.

3. **Nav-pill verbergen bij open overlay.** Nieuw ref-counted signaal
   `lib/overlay-signal.ts`:
   - `acquireOverlay(): () => void` verhoogt een module-teller en dispatcht een
     `CustomEvent`; de teruggegeven (idempotente) release-functie telt weer af.
   - `useOverlayOpen(): boolean` subscribet via `useSyncExternalStore` en levert
     `true` zodra er ≥1 overlay open is (SSR-snapshot = `false`).
   - `BottomSheet` en `SlideInPane` `acquire`-en zolang ze open zijn.
     `FloatingNavButton` verbergt zich (`visibility: hidden`, geen unmount →
     geen layout-sprong, wél uit tab-order/pointer-events) zolang
     `useOverlayOpen()` waar is.
   - **Uitzondering:** `NavMenuSheet` (`belowFloatingNav`) meldt zich bewust NIET
     aan — de pill is dáár de toggle. Het `acquire` is gegate op
     `!belowFloatingNav`.

   *Waarom een module-teller i.p.v. React-context:* overlays renderen via
   `createPortal` naar `document.body`, buiten de app-boom. Een module-scoped
   teller + event werkt portal-agnostisch zonder alle overlays aan één provider
   te binden.

   *Timing:* het signaal komt **direct bij close-start** vrij (release hangt aan
   de `open`-prop, niet aan de exit-animatie/unmount), zodat de pill soepel
   terugkomt tijdens de exit-animatie i.p.v. pas als het element weg is.

## Gevolgen

- Nieuwe en gemigreerde sheets gebruiken de `footer`-prop; de pill hoeft niet
  meer handmatig te worden ontweken (geen `--mobile-nav-clearance` op
  overlay-footers behalve bij `belowFloatingNav`).
- Custom overlays op de uitzonderingslijst die full-screen zijn, moeten zelf
  `acquireOverlay()` aanroepen (effect met cleanup) als ze de pill willen
  verbergen.
- **Fase 2 — migratie (volgt, NIET in deze ADR):** de ~18 afwijkende overlays
  worden omgezet naar `<ShellOverlay>`:
  - z-index normaliseren naar `z-[70]` (of de juiste gedocumenteerde
    uitzonderingslaag);
  - primaire acties verplaatsen naar de sticky `footer`-prop;
  - hand-rolled `fixed inset-0`-constructies vervangen door de wrapper, of —
    als ze op de uitzonderingslijst staan en full-screen zijn — expliciet
    `acquireOverlay()` toevoegen.
  De uitzonderingslijst (chat, palette, share, sleepmodus, sessie-timeout)
  blijft buiten de migratie.

**Addendum (2026-07-29) — modale sub-oppervlakken bínnen een uitzonderings-overlay.**
Een full-screen overlay op de uitzonderingslijst (chat, palette, share,
sleepmodus, sessie-timeout) krijgt géén tweede z-laag voor zijn eigen modale
sub-oppervlakken. Bevestigingen, detailkaarten en kleine formulieren renderen
als kaart binnen dezelfde container, boven de content maar binnen de
bestaande focus-trap, scroll-lock en Escape-handler van de overlay. Reden:
een `createPortal` naar `document.body` valt buiten de `containerRef` van de
focus-trap (toegankelijkheidsregressie) en zou de uitzonderingslijst laten
groeien met lagen die geen eigen uitzondering zijn. Precedent: `ConfirmCard`
en `TransactieDetailsKaart` in de sleepmodus. Sub-oppervlakken horen als fase
in de state-machine van de overlay, niet als losse open/dicht-vlag ernaast.
