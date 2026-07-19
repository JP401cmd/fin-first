---
id: 0053-responsive-shell-enkelvoudig
title: 'ResponsiveShell enkelvoudig — één render van children, CSS-gestuurde chrome'
status: aanvaard
date: 2026-07-19
elements: [app-comp]
---

# 0053 — ResponsiveShell enkelvoudig (één render van children)

## Context

`components/app/shell/responsive-shell.tsx` rendered pré-hydratie BEIDE
breakpoint-takken naast elkaar:

```tsx
<div id="main-content">
  {(!hydrated || isLgUp) && <main className="hidden lg:block lg:pl-[264px]">{children}</main>}
  {(!hydrated || !isLgUp) && <MobileStackShell>{children}</MobileStackShell>}
</div>
```

`hydrated` start `false` en `useIsLgUp()` levert bij SSR `false`. Pré-hydratie
zijn dus BEIDE condities waar → **`children` (alle widgets, charts, de
FIRE-sim-hook) staat TWEE keer in de SSR-HTML en hydrateert dubbel** op élke
app-pagina. Eén tak is `hidden` (`display:none`), maar de DOM + hydratie +
de bijhorende effects/fetches draaien wél dubbel. Na de eerste commit koos
`useIsLgUp` welke tak levend bleef en unmountte de andere — die post-hydratie-
tak-swap + `hidden`-flip is de dominante bron van de layout-shift (gemeten
CLS-baseline ~0,94 op `/overzicht`, mobiel).

Er waren daardoor ook twee `<main>`-elementen per pagina (a11y-smell) en, in
combinatie met per-route providers (bv. `PageStatusProvider`), dubbele
provider-instanties → dubbele client-fetches (zie fase 1, `page-status` 2×).

## Besluit

Eén persistente content-mount met de chrome als **CSS-gegate siblings**, zonder
JS-breakpoint-branch in het content-render-pad:

- De ShellFrame (`mobile-stack-shell.tsx`) draagt `children` in **één** `<main>`.
  Mobiel (<lg) is dat de tray-of-three (TopBar + content + BottomBar) met
  interne scroll; desktop (≥lg) **collabeert** het frame via `lg:contents` en
  valt de `<main>` terug op document-scroll met `lg:pl-[264px]` naast de
  (via portal gerenderde) Sidebar. TopBar/BottomBar zijn `lg:hidden`.
- Server- en client-render produceren **identieke, breakpoint-onafhankelijke
  HTML**; het verschil zit puur in Tailwind `lg:`-classes → geen dubbele
  SSR-HTML, geen post-hydratie-unmount, geen hydration-mismatch. `hydrated`/
  `useIsLgUp` zijn uit het content-pad verwijderd.
- **Tray-transitie (mobiel push/pop) — optie 1: persistente content +
  outgoing-overlay.** De persistente tray (`key="persistent"`) draagt altijd de
  live `children` en fungeert als de INCOMING laag (krijgt tijdens een
  transitie de `tray-incoming-*`-klasse); hij unmount niet, dus `children`
  remount niet halverwege de slide. De OUTGOING laag is een tijdelijke overlay
  bovenop met de `previousChildren`-snapshot (`tray-outgoing-*`). `children`
  blijft daardoor gegarandeerd enkelvoudig. De bestaande snapshot-mechaniek
  (`previousChildren`-state + commit-effect, React 19 lint-safe) blijft de bron.
- `useIsLgUp` wordt nog uitsluitend gelezen om de push/pop-overlay op desktop te
  **onderdrukken** (`showTransition = isTransitioning && !isLgUp`). Dat is
  hydratie-veilig omdat `transition.phase` bij SSR/first paint altijd `idle`
  is, dus de eerste render hangt niet van `isLgUp` af.
- **Scroll-reset bij route-wissel.** Omdat de `<main>` niet meer per navigatie
  remount, zet een `usePathname`-effect z'n interne scroll terug naar boven
  (spiegel van `ChatLayoutWrapper`'s scroll-to-top). Op desktop is `<main>`
  geen scroll-container, dus daar is het een no-op.

De `forceVisible`-vlag (sandbox-device-frames) blijft intact: bij `forceVisible`
vervallen álle `lg:`-collaps-classes zodat de mobiele tray-of-three óók ≥lg
blijft renderen.

## Gevolgen

- Halvering van de content-SSR-HTML + hydratie op elke app-pagina; CLS-bron
  (tak-swap / `hidden`-flip) verdwijnt (doel: CLS < 0,1).
- Structureel één `<main>` en één provider-instantie per pagina. De fase-1
  `inflight('page-status:…')`-dedupe wordt hierdoor **redundant** (er is nog
  maar één `PageStatusProvider`), maar blijft als goedkoop vangnet staan.
  `inflight('postponed-ready')` blijft nodig — die dedupe had een andere
  oorzaak (`WillHome`'s twee mount-effecten), niet de shell-mount.
- Sidebar + `SidebarPortal`, `NavStackProvider`, `ChatLayoutWrapper`,
  `FloatingNavButton`/`overlay-signal.ts` en de provider-nesting blijven
  ongewijzigd. De z-index-orde (ADR 0039) verschuift niet.

## Alternatief (verworpen)

Optie 2 — volledig leunen op de View Transitions API voor de tray-slide — is
niet gekozen: de custom keyframe-fallback (`tray-*`-classes) moet sowieso
bestaan voor browsers/paden zonder view-transitions, en optie 1 houdt
`children` met de minste bewegende delen enkelvoudig. De bestaande
`document.startViewTransition`-wrap in `nav-stack-provider.tsx` blijft
ongemoeid.

## Verificatie

- Karakteriseringstest `responsive-shell.characterization.test.tsx`: de
  SSR-HTML bevat het content-`data-testid` en `<main` elk exact één keer
  (rood vóór, groen ná de fix).
- `npx tsc --noEmit` schoon; `components/app/shell` + `lib/page-status`
  vitest-suites groen.
- Visuele matrix (390×844 / 768×1024 / 1024×768 / 1440×900 + live resize over
  1024px) + vóór/ná CLS-traces op `/overzicht` en `/toekomst`: geen zichtbare
  wijziging, CLS < 0,1.
