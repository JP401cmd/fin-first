---
name: ui-ux
description: Use when building, restyling or reviewing ANY TriFinity UI — pagina's, components, modals, charts, KPI-cards, formulieren, empty states. Bevat de canonieke krant/editorial design-taal, de kleur- & typografie-conventies, de kwaliteitstoets, de patroon-catalogus (kassabon, figures-strip, hero-band, ShellOverlay-driewegregel) en de elf page-type-blueprints. Raadpleeg vóór elke zichtbare UI-wijziging; dit is de single source of truth voor het ontwerp.
---

# UI/UX Design — TriFinity

**Single source of truth voor de TriFinity-design-taal.** De `frontend-ui-builder`- en `ux-review-expert`-agents raadplegen deze skill; bouw of beoordeel geen UI zonder de relevante toets erbij. TriFinity is een **persoonlijk financieel dagblad**, geen fintech-dashboard — elke designbeslissing versterkt dat.

## Kernprincipe

> "Geld levert tijd op." Elke UI-laag versterkt dat; elk significant bedrag krijgt zijn vrijheidstijd-equivalent (via `lib/format.ts` — nooit zelf de dag/jaar-conversie verzinnen). Vrijheidstijd **bouw je op**; de koop-/verkoop-metafoor ("vrijgekocht", "vrijheid terugkopen") is verboden — ADR 0165.

## Ontwerpfilosofie (altijd van toepassing)

- **Krant-esthetiek**: Playfair Display koppen, Source Serif body, redactionele witruimte.
- **Pagina-aanhef die het oordeel uitspreekt** (sinds sep 2026): elke app-pagina onder `/overzicht/**` en `/toekomst/**` opent met `PageVerdictOpening` — titel = paginanaam + oordeel (op mobiel alleen het oordeel; de TopBar draagt daar de naam) → korte deck van twee zinnen. Geen kicker. Het oordeel wordt geconsumeerd uit de bestaande bron, nooit herberekend, en draagt de stoplichtkleur — nooit het module-accent. De narratieve aanhef met kicker en italic-`<em>` (`PageOpening`) is dáármee vervangen. Nooit een gradient-kaart-doos als kop. **Uitzondering: de hub `/overzicht` zelf** — die kop draagt de begroeting met je naam en zet het gezondheidsoordeel in de deck eronder (eigenaarsbesluit 20 sep 2026); subpagina's onder `/overzicht/**` houden de oordeel-aanhef. Volledige spec: `pattern-cards.md` → *Pagina-aanhef die het oordeel uitspreekt*.
- **Inkt-op-papier**: warm off-white (`--bg`/`--paper`), nooit klinisch wit of donker.
- **Typografische hiërarchie**: font-keuze en gewicht bepalen prioriteit, niet kleur.
- **Drie modules = drie gebruikersinstelbare accenten**: de gebruiker kiest de kern-/wil-/horizon-kleur op `/mijn/uiterlijk` — noem dus nooit een vaste kleurnaam als regel. Module-identiteit altijd via `--module-active-*` / `kern-*`/`wil-*`/`horizon-*`-tokens; charts/canvas die een echte hex nodig hebben via `useModuleHex()`. Nooit Tailwind-standaardkleuren of losse hexen voor module-identiteit.
- **Data = monospace**: DM Mono met `tabular-nums` voor alle bedragen en cijfers.
- **Elk getal is klikbaar**: kassabon (receipt breakdown) als standaard interactiepatroon.
- **Beweging is functioneel**: fadeUp entrance, hover lift, progress fill — nooit decoratief.
- **Scherpe hoeken**: geen `border-radius` op kaarten/containers; alleen `rounded-full` voor cirkelvormige elementen.
- **Palet-richting — minder FD, meer FT**: warm-zalm cream achtergrond, bijna-wit paper. Bij twijfel: de minder-bruine variant; nooit pure-wit, geen 1-op-1 FT-imitatie.

## Hoe je deze skill gebruikt

Bepaal wat je doet, lees gericht de bijbehorende reference (laad alleen wat je nodig hebt — token-zuinig):

| Je gaat… | Lees |
|---|---|
| een component/pagina **bouwen of beoordelen** op tokens, typografie, kleur, a11y, interactie, copy | `quality-checklist.md` |
| een **editorial patroon** of shell-component toepassen (kassabon, figures-strip, pull-quote, hero-band, ShellOverlay, slide-in pane, sidebar, TopBar…) | `pattern-cards.md` |
| een **nieuwe of bestaande pagina** structureren | `page-blueprints.md` — bepaal eerst het page-type (1–11), volg dan de blueprint |

Voor een volledige paginareview lees je doorgaans alle drie; voor een gerichte tweak volstaat de relevante sectie.

## Hoe je communiceert

- **Nederlands** voor alle uitleg en feedback.
- **Specifiek**: "Gebruik `text-kern-700` i.p.v. `text-amber-800`" — niet "maak het bruiner". Noem exacte tokens, font-combinaties, px-waarden, Tailwind-classes.
- **Visueel denken**: beschrijf in termen van krantenpagina's, kolommen, witruimte.
- **Geen compromissen**: schaadt iets de UX, zeg het direct en leg uit waarom.
- **Prioriteit**: Leesbaarheid > Esthetiek > Technische eenvoud.
- **Toon alternatieven**: minimaal 2 opties bij designkeuzes, met voor/nadelen.

## Editorial component-laag (verplicht — bouw niet opnieuw wat er al is)

De patronen uit `pattern-cards.md` zijn geïmplementeerd als herbruikbare componenten in **`components/editorial/`** (canoniek, zie `index.tsx`): `Kicker`, `EditorialHeadline`, `EditorialDeck`, `HighlightMark`, `HL`/`HLNeg`, `FiguresStrip`, `PullQuote`, `ScenarioCallout`, `RekeningTag`, `TogglePill`, `ComparisonRow`, `RomanSection`, `SectionLabel`, `OrnamentColophon`, `CardEditorial` — plus page-compositie-helpers in `components/editorial/page-blueprints.tsx` (`PageMiniHero`, `PageDetailHeader`, …). **Bestaat er een component voor het patroon, dan gebruik je die** — de CSS-recepten in de pattern-cards zijn de specificatie/toets, geen uitnodiging om inline JSX te dupliceren. Nieuwe editorial primitives horen in `components/editorial/`, niet als kopie in `components/app/`.

## Route-canon

De canonieke IA: **`/overzicht`** (Kern), **`/toekomst`** (Horizon), **`/mijn` + `/berichten` + `/nieuws`** (Wil-gekleurd), `/rapportages`, `/beheer`. Oude routes (`/core`, `/will`, `/horizon`, `/identity`, `/dashboard`) bestaan deels nog als legacy backing — verwijs er niet naar in nieuwe UI of documentatie; `lib/nav-config.ts` is de bron voor navigatie en titels.

## Referenties in de codebase

- `CLAUDE.md` — Kleur-/Modal-/Meldingen-conventies + `design-principles.md` (7 kernprincipes)
- `app/globals.css` — CSS custom properties en utility-classes
- `lib/color-palette.ts` — OKLCH kleur-generatie · `components/app/module-color-provider.tsx` — `useModuleHex()`
- `components/editorial/` — canonieke editorial primitives + page-blueprint-helpers (zie boven)
- `components/app/bottom-sheet.tsx` — modal/sheet + focus-trap-patroon (canonical)
- `components/app/shell/shell-overlay.tsx` — ShellOverlay driewegregel (pane/sheet/confirm)
- `lib/hooks/use-flash-change.ts`, `use-in-view-animation.ts`, `use-modal-animation.ts` — animatie-hooks
