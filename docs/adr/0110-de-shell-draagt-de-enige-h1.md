---
id: 0110-de-shell-draagt-de-enige-h1
title: 'De shell draagt de enige h1 — de pagina-aanhef is een h2'
status: aanvaard
date: 2026-08-28
elements: [app-comp]
---

Een onafhankelijk UX-testpanel liep `/overzicht` en `/overzicht/bezittingen`
zoals een schermlezer dat doet, en vond op beide pagina's **twee `<h1>`-koppen**
plus sprongen van `h1` direct naar `h3` (bevinding M28). De koppenlijst is voor
een schermlezergebruiker wat de scrollbalk voor een ziende is: de manier om te
overzien wat er op een scherm staat. Twee h1's maken onduidelijk waar de pagina
over gaat; een overgeslagen niveau suggereert een ontbrekende sectie.

Het was geen incident op twee routes. De tweede h1 kwam uit twee gedeelde
editorial-bouwstenen — `PageOpening` (30 call-sites) en `EditorialHeadline`
(default `level='h1'`) — bovenop de `<h1>` die de mobiele `TopBar` per route al
rendert. Elke route die de canonieke pagina-aanhef gebruikte, kreeg de fout
gratis mee.

## Besluit

**Binnen de app-shell draagt de shell de enige `<h1>`; de pagina-aanhef is een
`<h2>`.**

De drager is één `sr-only` `<h1>` in `components/app/shell/mobile-stack-shell.tsx`,
gerenderd in de persistente tray, gevoed door `NavStackMeta.title` met
`resolveRouteTitle()` als terugval.

| Niveau | Wie rendert het |
|---|---|
| `h1` | Alleen de shell — de sr-only paginanaam. Exclusief. |
| `h2` | De pagina-aanhef (`PageOpening`, hard `<h2>`) en elke zelfstandige sectie (`EditorialHeadline`, default `'h2'`). |
| `h3` | Kaarten, widgets, katern-segmenten, en de titelbalk van elke overlay (`BottomSheet`, `SlideInPane` — al `h3`). |
| `h4+` | Verdieping bínnen een kaart of overlay, in volgorde. |

Buiten de app-shell (`components/landing/**`, `components/onboarding/**`,
`components/check/**`, en alles buiten de `(app)`-routegroep) is er geen
shell-h1; die pagina's dragen hun eigen `<h1>`. Dat is de enige uitzondering.

## Waarom de TopBar-titel niet de drager kon zijn

De eigenaar gaf akkoord op "TopBar-titel wordt de enige h1". Die intentie is
overgenomen, maar de TopBar-titel is chrome en valt op **drie** onafhankelijke
assen weg — elk daarvan zou de invariant breken:

1. **Breakpoint.** `top-bar.tsx` zet `lg:hidden` op zijn `<header>`. Tailwinds
   `hidden` is `display: none`, en dat haalt de hele subtree uit de
   accessibility-tree. De desktop-chrome (`sidebar.tsx`) is een `<nav>` zonder
   enige kop. Het besluit naar de letter zou `≥1024px` dus **nul** h1's opleveren
   — een nieuwe regressie in plaats van een oplossing.
2. **TopBar-kind.** `resolveTopBarKind` geeft tab-roots `kind: 'rich'`, en daar
   blijft de titel bewust leeg (alleen `'simple'` krijgt een fallback). De vijf
   meest bezochte routes rendeerden dus al een **lege** `<h1>`.
3. **Aanwezigheid.** Bij `topBar: { kind: 'hidden' }` geeft `TopBar` `null`
   terug — drie routes hebben helemaal geen balk.

Een tweede, desktop-only `<h1>` naast de mobiele viel af: dan staan er twee
`<h1>`-elementen in de DOM waarvan er per breakpoint één `display: none` is. Dat
is een breakpoint-vertakking in het content-pad, en geen enkele statische toets
kan bepalen wélke van de twee live is. CSS kan geen tagnaam wisselen, dus één
tag moet het zijn — en alleen de shell-h1 overleeft alle drie de assen.

De zichtbare TopBar-titel blijft staan, maar als `<p aria-hidden="true">`:
hetzelfde label, niet-semantisch, en niet twee keer voorgelezen. De
`aria-live="polite"` verhuisde mee naar de sr-only h1 — daar kondigt hij bij
push/pop de nieuwe *paginanaam* aan in plaats van de chrome.

## De prijs, bewust aanvaard

De enige `h1` is onzichtbaar, en de visueel grootste tekst op het scherm (de
pagina-aanhef) is een `h2`. Dat is WCAG-conform — geen enkel succescriterium
eist een zíchtbare h1 — en het levert een paginanaam op die stabiel is over
beide breakpoints en gelijkloopt met `lib/nav-config.ts` en `metadata.title`.

## De gate, en wat hij niet bewijst

`scripts/check-heading-levels.mjs` (`npm run check:headings`, in `.husky/pre-push`)
bewaakt twee lexicale invarianten: geen literale `<h1` in `app/(app)/**` of
`components/**` buiten de drager en de niet-shell-oppervlakken, en geen
`level="h1"`. Die tweede is redundant zolang `EditorialHeadline`'s union op
`'h2' | 'h3'` staat — bewust dubbel, want een type kan verruimd worden.

Wat een statische scan **niet** kan bewijzen, en waar de gate dus niet doet alsof:
de gerenderde koppenvolgorde per route. Koppen komen pas in de DOM samen uit
drie bomen (shell, pagina, portal/overlay). Een `<h4>` in een bestand is
bijvoorbeeld vaak correct genest onder de `<h3>` die een overlay in een *ander*
bestand rendert; een sprong-detector per bestand zou daar structureel vals
alarm slaan en is daarom niet gebouwd. De echte volgordetoets hoort in de DOM —
een axe-`heading-order`-assertie over representatieve routes in de
playwright/UAT-laag.

## Uitrol

Fase 1 (dit besluit) legt het contract, de drager en de gate vast, en maakt de
twee gemelde routes schoon. De 35 in-shell bestanden die nog een eigen `<h1>`
renderen staan op de `RESIDUE`-afbouwlijst in het gate-script. Die lijst **mag
alleen krimpen**: een entry die geen overtreding meer is maakt de gate hard rood,
zodat het afbouwschema niet stil kan blijven staan. Dat is bewust strenger dan
de permanente allowlist van `check-tap-targets.mjs` en spiegelt
`COLUMN_RULE_RESIDUE` uit `check-client-data-reads.mjs`.
