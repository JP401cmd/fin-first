'use client'

/**
 * ShellFrame (historisch: MobileStackShell) — de ENE persistente render van
 * de pagina-content, met de mobiele chrome (TopBar/BottomBar) als CSS-gegate
 * siblings.
 *
 * ── Enkelvoudige render (ADR 0053) ─────────────────────────────────
 * Vroeger rendered ResponsiveShell pré-hydratie BEIDE breakpoint-takken
 * (desktop `<main>` + deze mobiele tray), elk met een eigen kopie van
 * `children` → dubbele SSR-HTML + dubbele hydratie op élke pagina. Nu draagt
 * één `<main>` de content exact één keer:
 *  - Mobiel (<lg): de tray-of-three (TopBar + content + BottomBar) in één
 *    flex-column met interne scroll; schuift bij push/pop als één blok.
 *  - Desktop (≥lg): het frame collabeert via `lg:contents`; TopBar/BottomBar
 *    zijn `lg:hidden`; de `<main>` valt terug op document-scroll met
 *    `lg:pl-[264px]` naast de (via portal gerenderde) Sidebar.
 * Er zit GEEN JS-breakpoint-branch in het content-render-pad — server- en
 * client-render produceren identieke, breakpoint-onafhankelijke HTML; het
 * verschil zit puur in Tailwind `lg:`-classes. `useIsLgUp` wordt alléén
 * gelezen om de mobiele push/pop-overlay op desktop te onderdrukken, en dat
 * hangt af van `transition.phase` die bij SSR/first paint altijd 'idle' is —
 * dus geen hydration-mismatch.
 *
 * ── Tray-transitie: persistente content + outgoing-overlay ──────────
 * (Bitvavo-pure tray-of-three, plan §4.1). Bij push/pop schuift de hele tray
 * als één geheel mee. De single-render-variant (ADR 0053, optie 1) houdt
 * `children` gegarandeerd enkelvoudig:
 *  - De PERSISTENTE tray (`key="persistent"`) draagt altijd de live `children`
 *    en fungeert als de INCOMING laag; tijdens een transitie krijgt hij de
 *    `tray-incoming-*`-animatieklasse. Hij unmount NOOIT bij een transitie —
 *    dus `children` remount niet halverwege de slide.
 *  - De OUTGOING laag is een tijdelijke overlay bovenop, die de vorige pagina
 *    (`previousChildren`-snapshot) uit-animeert met `tray-outgoing-*`. Alleen
 *    aanwezig tijdens de 240ms-transitie, en alleen op mobiel.
 *
 * ── Outgoing-snapshot-mechanica ────────────────────────────────────
 * Bij push/pop komen NIEUWE children binnen via de React-tree. De OUDE
 * children bewaren we via `useState` + commit-phase `useEffect`, zodat we ze
 * tijdens de transitie nog in de outgoing-overlay kunnen renderen. Dit voldoet
 * aan React 19 lint-regels (state + effect i.p.v. ref-mutatie tijdens render).
 *   - State `previousChildren` start met de eerste children.
 *   - `useEffect` synchroniseert state met `children` NA paint.
 *   - Bij phase='pushing'/'popping' bevat de render `children` = nieuw,
 *     `previousChildren` (state) = vorige — precies onze snapshot.
 *
 * ── Animatie-curves (plan §4.2) ────────────────────────────────────
 * Push:  outgoing translateX(0 → -30%) + opacity 1 → 0.5
 *        incoming translateX(100% → 0) + opacity 0.7 → 1
 * Pop:   outgoing translateX(0 → 100%) + opacity 1 → 0.7
 *        incoming translateX(-30% → 0) + opacity 0.5 → 1
 * Duur:  240ms cubic-bezier(0.32, 0.72, 0, 1) (iOS-spring-curve)
 * RM:    prefers-reduced-motion → instant-swap (geen translate of fade)
 * (Keyframes leven in app/globals.css onder `.tray-{in,out}going-{push,pop}`.)
 */

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { usePathname } from 'next/navigation'
import { isImmersiveRoute } from '@/lib/shell/immersive-routes'
import { useNavStack, type StackEntry, type BottomBarConfig, type TopBarKind } from './nav-stack-provider'
import { resolveRouteTitle } from '@/lib/nav-config'
import { useIsLgUp } from '@/lib/hooks/use-media-query'
import { TopBar } from './top-bar'
import { MobileBottomBar } from './mobile-bottom-bar'
import { PullRefreshIndicator } from './pull-refresh-indicator'

type MobileStackShellProps = {
  /** Optionele custom actions in de TopBar (rechts). Default = utility-cluster
   *  (News + Bell + Avatar) wanneer `email` aanwezig is. */
  topBarActions?: ReactNode
  /** Pagina-content. Wordt in de persistente tray (incoming-laag) gerenderd. */
  children: ReactNode
  /**
   * Override de `lg:`-collaps + `lg:hidden`-chrome-gating. Bedoeld voor
   * sandbox-device-frames die de mobiele shell op desktop tonen: bij
   * `forceVisible` blijft het frame een 100vh-tray-of-three (met interne
   * scroll) én tonen TopBar/BottomBar óók ≥lg. Default = false (productie:
   * frame collabeert naar één document-scroll-`<main>` op desktop).
   */
  forceVisible?: boolean
  /** Email van de ingelogde user — door TopBar's utility-cluster gebruikt
   *  voor avatar-initial en account-dropdown-header. */
  email?: string
  /** Role van de user — bepaalt of de Beheer-link in account-dropdown
   *  verschijnt (alleen bij `role === 'superadmin'`). */
  role?: string
}

// Animatie-duur (240ms) en easing (iOS-spring-curve cubic-bezier(0.32, 0.72, 0, 1))
// leven in app/globals.css onder de .tray-{in/out}going-{push/pop} classes.
// Houd `TRANSITION_DURATION_MS` in nav-stack-provider.tsx synchroon met de CSS.

/**
 * Render één tray-of-three: TopBar + content + BottomBar.
 *
 * Op mobiel is de tray `absolute inset-0` binnen een 100vh-clip-box en scrollt
 * de content intern (`flex-1 overflow-y-auto`). Op desktop (`!forceVisible`)
 * collabeert de tray naar normale document-flow (`lg:static lg:block`): de
 * TopBar/BottomBar zijn `lg:hidden` en de `<main>` krijgt `lg:pl-[264px]`
 * naast de portal-Sidebar.
 *
 * `entryTitle`/`topBarKind`/`showBack` overrulen de TopBar-afleiding — nodig
 * voor de outgoing-overlay, die de OUDE entry moet blijven tonen tijdens een
 * transitie (useNavStack geeft daar al de NIEUWE top-entry terug).
 *
 * `animClass` (optioneel) hangt de `tray-{in,out}going-*`-animatieklasse op de
 * tray-root; `mainRef` geeft de parent toegang tot het scroll-element van de
 * persistente tray (scroll-reset bij route-wissel).
 */
type TrayProps = {
  animClass?: string
  entryTitle?: string
  bottomBar?: BottomBarConfig
  topBarActions?: ReactNode
  /**
   * Default = afgeleid uit `currentStack.length > 1` binnen TopBar.
   * Voor outgoing-overlay: expliciet doorgeven omdat de huidige stack al de
   * NIEUWE top-entry bevat — anders zou de outgoing onmiddellijk de nieuwe
   * back-knop-state aannemen.
   */
  showBack: boolean
  /**
   * Default = afgeleid uit `top.topBar.kind` binnen TopBar. Voor outgoing-
   * overlay: expliciet met de OUDE entry's kind zodat de visuele transitie
   * consistent is (rich → simple bij push; simple → rich bij pop).
   */
  topBarKind?: TopBarKind
  children: ReactNode
  forceVisible: boolean
  ariaHidden?: boolean
  email?: string
  role?: string
  /**
   * Ref naar het scroll-`<main>` (alleen de persistente tray gebruikt dit).
   * Bewust een `RefObject` en geen brede `Ref`: het pull-to-refresh-gebaar leest
   * `.current` van dit element, en dat kan een callback-ref niet leveren. De
   * aanwezigheid van deze ref is tegelijk het signaal dat dit de persistente
   * tray is — de outgoing-overlay is `aria-hidden` en mag geen tweede
   * ververs-gebaar meebrengen.
   */
  mainRef?: RefObject<HTMLElement | null>
  /**
   * De paginanaam die als de ENIGE `<h1>` van de route wordt gerenderd
   * (sr-only). Alleen de persistente tray geeft dit door — de outgoing-tray is
   * `aria-hidden` en mag geen tweede h1 in de boom zetten. Leeg/undefined ⇒
   * geen h1 (beter dan de lege `<h1>` die de TopBar hiervóór rendde op
   * tab-roots). Zie ADR 0110.
   */
  pageName?: string
}

function Tray({
  animClass,
  entryTitle,
  bottomBar,
  topBarActions,
  showBack,
  topBarKind,
  children,
  forceVisible,
  ariaHidden = false,
  email,
  role,
  mainRef,
  pageName,
}: TrayProps) {
  // Desktop-collaps: alleen in productie (niet in een forceVisible-sandbox-
  // frame). De tray valt terug op document-flow; TopBar/BottomBar zijn hidden.
  const trayDesktop = forceVisible ? '' : ' lg:static lg:block lg:bg-transparent'
  const mainDesktop = forceVisible ? '' : ' lg:flex-none lg:overflow-visible lg:pl-[264px]'
  // `--mobile-nav-clearance` houdt onderin ruimte vrij vóór de zwevende
  // nav-pill. Op een immersieve taakflow is die pill verborgen
  // (lib/shell/immersive-routes.ts), dus is de reservering niet alleen
  // overbodig maar schadelijk: de padding verkleint de scrollport, waardoor
  // een `sticky bottom-0`-voettekst 76px bóven de onderrand blijft hangen met
  // doorlopende content eronder.
  const immersive = isImmersiveRoute(usePathname())
  const mainClearance = immersive ? '' : ' pb-[var(--mobile-nav-clearance)]'

  return (
    <div
      aria-hidden={ariaHidden || undefined}
      className={`absolute inset-0 flex flex-col bg-[var(--bg)]${trayDesktop}${animClass ? ` ${animClass}` : ''}`}
    >
      {/* De ENIGE <h1> van de route (ADR 0110). Bewust hier en niet in TopBar:
          die is `lg:hidden` (= display:none ⇒ uit de a11y-tree op desktop),
          rendert `null` bij `topBar.kind: 'hidden'`, en houdt zijn titel leeg
          op tab-roots ('rich'). Een kop-drager die op één van de drie assen
          wegvalt kan de "precies één h1"-invariant niet dragen.
          `sr-only` (clip, géén display:none) houdt 'm op BEIDE breakpoints in
          de a11y-tree; de zichtbare titel in de TopBar is hetzelfde label maar
          niet-semantisch. `aria-live="polite"` staat hier — zo kondigt een
          push/pop de nieuwe paginanaam aan i.p.v. de chrome. */}
      {pageName && (
        <h1 className="sr-only" aria-live="polite">
          {pageName}
        </h1>
      )}

      {/* TopBar binnen de tray — niet sticky t.o.v. viewport, wel binnen de
          tray-flex-column zodat hij meeschuift bij push/pop. Zelf `lg:hidden`
          (tenzij forceVisible) via zijn eigen visibility-class. */}
      <TopBar
        actions={topBarActions}
        forceVisible={forceVisible}
        title={entryTitle}
        showBackOverride={showBack}
        kindOverride={topBarKind}
        email={email}
        role={role}
      />

      {/* Content. Mobiel: `flex-1 overflow-y-auto` (interne scroll), TopBar +
          BottomBar lijken "vast" binnen de tray. Desktop: normale document-
          flow (`lg:flex-none lg:overflow-visible`) met `lg:pl-[264px]` naast
          de Sidebar. `pb-[var(--mobile-nav-clearance)]` reserveert onderaan
          ruimte voor de zwevende FloatingNavButton; die var is 0 boven 1024px,
          dus op desktop is de padding automatisch 0. */}
      {/* `overscroll-y-contain`: zonder dit chaint een drag-down bovenaan de
          tray-scroller door naar de root en vuurt Android's NATIVE
          pull-to-refresh naast de onze — twee verversingen op één gebaar. De
          contain hoort daarom onlosmakelijk bij de eigen indicator hieronder;
          los geshipt zou Android tijdelijk helemaal geen refresh hebben. */}
      <main
        ref={mainRef}
        className={`flex-1 overflow-y-auto overscroll-y-contain${mainClearance}${mainDesktop}`}
        // `--fin-melding-clearance` is 0px behalve zolang de gedokte
        // Fin-meldingstrook onderin staat (UR2-08; gezet in app/globals.css,
        // hoogte gemeten door components/app/fin/fin-home.tsx). Bewust een
        // MARGE en geen padding: een marge maakt de scrollport zelf korter,
        // zodat er geen pagina-inhoud onder de strook kán liggen. Padding zou
        // alleen aan het eind van de content ruimte bijzetten en de melding
        // midden op de pagina nog steeds over een link heen leggen. Boven lg is
        // de var 0, dus de desktop-flow blijft ongemoeid. De `pb`-clearance
        // hierboven blijft gewoon staan: die zit ín de scrollport (ruimte ná de
        // laatste content) en is zolang de strook staat wat royaal — ~76px
        // extra scrollruimte aan het eind, onzichtbaar en zonder sprong.
        style={{ marginBottom: 'var(--fin-melding-clearance, 0px)' }}
      >
        {/* Pull-to-refresh — alleen op de persistente tray (mainRef). `sticky`
            met `h-0`, dus het kost geen layout-ruimte en duwt `children` niet
            omlaag. Op ≥lg verbergt het component zichzelf; het gebaar is daar
            sowieso een no-op omdat deze `<main>` dan geen scroll-container is. */}
        {mainRef && <PullRefreshIndicator scrollRef={mainRef} />}
        {children}
      </main>

      {/* BottomBar slot — `lg:hidden` (tenzij forceVisible) zodat de mobiele
          bar niet op desktop verschijnt. De wrapper is 0px hoog wanneer
          MobileBottomBar `null` rendert (tabs/hidden). */}
      <div className={forceVisible ? undefined : 'lg:hidden'}>
        <MobileBottomBar config={bottomBar} />
      </div>
    </div>
  )
}

export function MobileStackShell({
  topBarActions,
  children,
  forceVisible = false,
  email,
  role,
}: MobileStackShellProps) {
  const { currentStack, transition } = useNavStack()
  const top: StackEntry | undefined = currentStack[currentStack.length - 1]
  const stackDepth = currentStack.length

  // ── Outgoing-snapshot via state + commit-effect (zie header-doc) ──
  const [previousChildren, setPreviousChildren] = useState<ReactNode>(children)
  const isTransitioning = transition.phase === 'pushing' || transition.phase === 'popping'

  useEffect(() => {
    // Update snapshot na commit. Bij het volgende renderpad (bv. wanneer phase
    // naar 'pushing' overgaat) is deze waarde de "vorige" render.
    setPreviousChildren(children)
  }, [children])

  // ── Scroll-reset bij route-wissel ──────────────────────────────
  // De persistente `<main>` unmount niet bij navigatie (single-mount), dus
  // moeten we z'n interne scrollpositie zelf terugzetten bij een route-wissel
  // — anders erft een nieuwe pagina de scroll van de vorige. Dit spiegelt
  // ChatLayoutWrapper's scroll-to-top (die reset de desktop-document-scroll;
  // deze reset de mobiele interne tray-scroll). Op desktop is `<main>` geen
  // scroll-container (`lg:overflow-visible`), dus daar is dit een no-op.
  const mainScrollRef = useRef<HTMLElement>(null)
  const pathname = usePathname()
  useEffect(() => {
    mainScrollRef.current?.scrollTo(0, 0)
  }, [pathname])

  // ── Tray-transitie: mobiel-only ────────────────────────────────
  // Op desktop navigeert Next.js/router zonder tray-of-three-slide (de chrome
  // is daar `lg:hidden`). We lezen de breakpoint puur om de outgoing-overlay +
  // slide op desktop te onderdrukken. Veilig t.o.v. hydratie: `isTransitioning`
  // is bij SSR/first paint altijd false (SERVER_SNAPSHOT = idle), dus `isLgUp`
  // beïnvloedt de eerste render niet en het single-mount van `children` hangt
  // er niet van af.
  const isLgUp = useIsLgUp()
  const showTransition = isTransitioning && !isLgUp

  const isPush = transition.phase === 'pushing'
  const outgoingClass = isPush ? 'tray-outgoing-push' : 'tray-outgoing-pop'
  const incomingClass = isPush ? 'tray-incoming-push' : 'tray-incoming-pop'

  // Desktop-collaps van het frame (100vh-flex-column → display:contents) —
  // alleen in productie; een forceVisible-sandbox houdt de mobiele tray.
  const frameCollapse = forceVisible ? '' : ' lg:contents'

  // ── Paginanaam voor de enige <h1> (ADR 0110) ───────────────────
  // Eigen resolutie, bewust NIET die van TopBar: die houdt tab-roots ('rich')
  // opzettelijk leeg omdat de chrome daar geen titel wil tónen. De a11y-boom
  // heeft juist dáár een naam nodig. Volgorde: expliciete NavStackMeta-titel →
  // nav-config op het pad van de top-entry → nav-config op het live pad
  // (dekt een pagina die nog geen NavStackMeta rendert). Blijft alles leeg,
  // dan rendert er géén h1 — beter dan de lege <h1> van hiervoor.
  const pageName =
    top?.title ||
    resolveRouteTitle(top?.pathname ?? '') ||
    resolveRouteTitle(pathname) ||
    ''

  return (
    // Buitenste frame: mobiel een 100vh-flex-column; desktop collabeert
    // (`lg:contents`) zodat alleen de `<main>` in de document-flow overblijft.
    <div
      className={`relative flex flex-col bg-[var(--bg)]${frameCollapse}`}
      style={{ minHeight: '100vh' }}
    >
      {/* Clip-box: bindt de `absolute inset-0`-trays aan 100vh (mobiel) en
          knipt de uit-schuivende overlay af. Collabeert mee op desktop. */}
      <div
        className={`relative flex-1 overflow-hidden${frameCollapse}`}
        style={{ minHeight: '100vh' }}
      >
        {/* Outgoing-overlay — alleen tijdens een mobiele transitie. Toont de
            vorige pagina (snapshot) die uit-animeert. DOM-vóór de persistente
            tray zodat de incoming (persistent) er bovenop ligt. */}
        {showTransition && (
          <Tray
            key="outgoing"
            animClass={outgoingClass}
            // Outgoing-titel: de OUDE entry's eigen titel. Viel die leeg (een
            // subpagina zonder NavStackMeta), val dan óók terug op de nav-
            // config-resolver via de OUDE pathname — anders zou de outgoing-
            // TopBar de fallback van de NIEUWE top-entry pakken. Alleen voor
            // 'simple'-subpagina's; tab-roots ('rich') blijven leeg.
            entryTitle={
              transition.outgoing?.title ||
              (transition.outgoing?.topBar?.kind === 'simple'
                ? resolveRouteTitle(transition.outgoing?.pathname ?? '') ?? ''
                : '')
            }
            bottomBar={transition.outgoing?.bottomBar}
            topBarActions={topBarActions}
            // Outgoing toont back-knop alsof het nog op zijn diepte zat —
            // visuele continuïteit. Stack-diepte vóór de pop = na de pop + 1.
            showBack={isPush ? stackDepth - 1 > 1 : stackDepth + 1 > 1}
            topBarKind={transition.outgoing?.topBar?.kind}
            forceVisible={forceVisible}
            ariaHidden
            email={email}
            role={role}
          >
            {previousChildren}
          </Tray>
        )}

        {/* Persistente tray = de ENE render van `children` (incoming-laag).
            Altijd aanwezig (keyed) zodat `children` niet remount bij het
            starten/stoppen van een transitie. Krijgt tijdens een mobiele
            transitie de incoming-animatieklasse. */}
        <Tray
          key="persistent"
          animClass={showTransition ? incomingClass : undefined}
          bottomBar={top?.bottomBar}
          topBarActions={topBarActions}
          showBack={stackDepth > 1}
          forceVisible={forceVisible}
          email={email}
          role={role}
          mainRef={mainScrollRef}
          pageName={pageName}
        >
          {children}
        </Tray>
      </div>
    </div>
  )
}
