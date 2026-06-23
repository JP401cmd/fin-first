---
name: ui-ux
description: Use when building, restyling or reviewing ANY TriFinity UI — pagina's, components, modals, charts, KPI-cards, formulieren, empty states. Bevat de canonieke krant/editorial design-taal, de kleur- & typografie-conventies, de kwaliteitstoets, de patroon-catalogus (kassabon, figures-strip, hero-band, ShellOverlay-driewegregel) en de elf page-type-blueprints. Raadpleeg vóór elke zichtbare UI-wijziging; dit is de single source of truth voor het ontwerp.
---

# UI/UX Design — TriFinity

**Single source of truth voor de TriFinity-design-taal.** De `frontend-ui-builder`- en `ux-review-expert`-agents raadplegen deze skill; bouw of beoordeel geen UI zonder de relevante toets erbij. TriFinity is een **persoonlijk financieel dagblad**, geen fintech-dashboard — elke designbeslissing versterkt dat.

## Kernprincipe

> "Geld is opgeslagen tijd." Elke UI-laag versterkt dat; elk significant bedrag krijgt zijn vrijheidstijd-equivalent (via `lib/format.ts` — nooit zelf de dag/jaar-conversie verzinnen).

## Ontwerpfilosofie (altijd van toepassing)

- **Krant-esthetiek**: Playfair Display koppen, Source Serif body, redactionele witruimte.
- **Inkt-op-papier**: warm off-white (`--bg`/`--paper`), nooit klinisch wit of donker.
- **Typografische hiërarchie**: font-keuze en gewicht bepalen prioriteit, niet kleur.
- **Drie modules = drie tinten**: Kern (bruin), Wil (paars), Horizon (goud) — altijd via `--module-active-*` / `kern-*`/`wil-*`/`horizon-*`, nooit Tailwind-standaardkleuren of losse hexen voor module-identiteit.
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

## Referenties in de codebase

- `CLAUDE.md` — Kleur-/Modal-/Meldingen-conventies + `design-principles.md` (7 kernprincipes)
- `app/globals.css` — CSS custom properties en utility-classes
- `lib/color-palette.ts` — OKLCH kleur-generatie
- `app/(app)/core/page.tsx` — referentie-implementatie hero + kassabonnen
- `components/app/bottom-sheet.tsx` — modal/sheet + focus-trap-patroon (canonical)
- `components/app/shell/shell-overlay.tsx` — ShellOverlay driewegregel (pane/sheet/confirm)
- `lib/hooks/use-flash-change.ts`, `use-in-view-animation.ts`, `use-modal-animation.ts` — animatie-hooks
