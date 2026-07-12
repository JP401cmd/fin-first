---
id: 0038-button-primitive-twee-varianten
title: 'Button-primitive met twee gesanctioneerde CTA-varianten (ink-standaard + module-moment)'
status: accepted
date: 2026-07-13
elements: [app-comp, m-principes]
---

De UX-review (`docs/ux-review-jul2026.md` §8, besluit 5) legt het knop-recept van
TriFinity vast op **twee gesanctioneerde CTA-varianten** plus een secundaire
outline, geïmplementeerd als één primitive `components/editorial/button.tsx`.
Nieuwe CTA's lopen voortaan via deze component; losse knop-recepten
(`rounded-lg/xl`, `zinc/stone`, `bg-<module>-500`, gradient, shadow) zijn niet
meer toegestaan.

## Context

De H-01-bevinding van de UX-review inventariseerde >10 afwijkende knop-recepten
verspreid door de app: afgeronde hoeken (`rounded-lg`/`rounded-xl`),
Tailwind-standaardkleuren (`bg-zinc-900`), directe module-shades
(`bg-wil-500`/`bg-horizon-700`), fase-gradients en schaduwen. Dit ondermijnt de
krant-esthetiek (scherpe hoeken, inkt-op-papier, module-identiteit alleen via
`--module-active-*`) en maakt de call-to-action-hiërarchie inconsistent: een
"Opslaan" zag er per scherm anders uit, en module-kleur werd gebruikt voor
alledaagse acties in plaats van gereserveerd voor betekenisvolle momenten.

De `ModalFooter` (ADR-loos, Track B2) had het canonieke ink/outline-recept al
verbatim vastgelegd, maar als losse class-strings — niet als herbruikbare
primitive die ook link-CTA's en de module-moment-variant dekt.

## Besluit

Eén component `Button` (`components/editorial/button.tsx`), geëxporteerd via de
editorial-barrel, met drie varianten en twee maten:

- **`primary`** (default) — inkt-zwart, module-neutraal, het canonieke recept:
  `bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--ink-2)]`. De standaard
  voor vrijwel elke actie (opslaan, toevoegen, publiceren, verder).
- **`secondary`** — outline, zelfde maatvoering:
  `border-2 border-[var(--ink)] bg-[var(--paper)] hover:bg-[var(--subtle)]`.
- **`moment`** — module-kleur, **uitsluitend voor grote momenten**
  (onboarding-afronding, module-activatie, doel vastleggen):
  `bg-[var(--module-active-600)] text-white hover:bg-[var(--module-active-700)]`.
  Gebruikt `--module-active-*` zodat de kleur automatisch de route-module volgt
  (cross-module-routes vallen terug op ink-shades).

Gedeelde eigenschappen: altijd scherpe hoeken, Inter (UI-chrome), `text-sm`,
`size` `md` (min-h-11, default) of `sm` (min-h-9), press-feedback
`active:scale-[0.98]` met `transition-[background-color,transform]`, en een
`focus-visible` outline (2px) voor toetsenbord-toegankelijkheid. De component
rendert als echte `<button>`, of als `next/link` `<a>` zodra `href` is
meegegeven — met dezelfde look. Alle standaard button-/anchor-props worden
doorgegeven (`disabled`, `type`, `aria-*`, `onClick`).

`ModalFooter` consumeert nu deze primitive (layout-logica — inline/stacked,
uitlijning, `flex-1`, loading, volgorde — blijft in de footer).

## Gevolgen

- **Zes afwijkende recepten gemigreerd** naar `Button`: `mijn/profiel`
  ("Opslaan", 2×, zinc → primary), `activation-button` (fase-gradient →
  moment + "Later" → secondary), `household-privacy-settings` (wil → primary),
  `publish-curation-sheet` (horizon → primary), `action-form` (wil → primary),
  `action-edit-modal` (wil → primary), `onboarding-horizon` ("Verder", horizon
  → primary), `onboarding-success` ("Ga naar je toekomst", horizon → moment) en
  `toekomst/bibliotheek` (2 link-CTA's → primary + secondary).
- **Module-kleur op knoppen is nu betekenisdragend**: een gekleurde knop
  signaleert een groot moment; alledaagse acties zijn inkt. Dit herstelt de
  hiërarchie die door losse `bg-<module>-500`-knoppen was vervaagd.
- **Kleine visuele deltas** bij migratie (bewust, richting het canonieke
  recept): hoogte naar `min-h-11` (44px touch-target), padding naar `px-5`,
  `font-semibold` → `font-medium`, verwijderde schaduwen/afgeronde hoeken. In
  `ModalFooter` betekent dat `px-4` → `px-5` plus toegevoegde press-feedback en
  focus-ring.
- **Regel voor nieuw werk**: elke nieuwe CTA gebruikt `Button`. `moment`
  reserveren voor onboarding-afronding, module-activatie en doel-vastlegging;
  bij twijfel `primary`.
- Enkele bewust ongemoeide knoppen blijven buiten scope (bv. de Wft-knop in
  `chat-panel`, ghost-tekstknoppen als "Annuleer"/"Sluiten").
