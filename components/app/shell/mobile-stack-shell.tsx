'use client'

/**
 * SANDBOX / Fase 0 v3 — onderdeel van new-navigation-shell migratie.
 * Plan: docs/navigatie-redesign-plan.md §4
 * Achter feature-flag in productie. Voor nu: alleen sandbox-test.
 *
 * Bitvavo-pure tray-of-three: TopBar + Content + BottomBar zitten in ÉÉN
 * animation-layer. Bij push/pop schuift de hele tray als één geheel mee
 * (plan §4.1 cruciaal verschil met v2).
 *
 * Architectuur tijdens transitie:
 *
 *   tray-container (relative, overflow-hidden)
 *     ├── outgoing-tray (alleen tijdens transitie; aria-hidden=true)
 *     │   ├── TopBar    (uit transition.outgoing.title)
 *     │   ├── content   (snapshot van vorige children — zie outgoing-snapshot-mechanica)
 *     │   └── BottomBar (uit transition.outgoing.bottomBar)
 *     └── incoming-tray (altijd aanwezig; tijdens transitie animeert deze in)
 *         ├── TopBar    (uit huidige top-entry)
 *         ├── content   (children prop = nieuwe pagina-content)
 *         └── BottomBar (uit huidige top-entry.bottomBar)
 *
 * ── Outgoing-snapshot-mechanica ────────────────────────────────────
 * Bij push komen NIEUWE children binnen via React-tree. De OUDE children zijn
 * de vorige render — die bewaren we via `useState` + commit-phase `useEffect`,
 * zodat we ze tijdens de 240ms-transitie nog kunnen renderen in de outgoing-
 * tray. Dit voldoet aan React 19 lint-regels (`react-hooks/refs` verbiedt
 * ref-mutatie of -access tijdens render; state + effect is canonical).
 *
 * Werking:
 *   - State `previousChildren` start met de eerste children.
 *   - `useEffect` synchroniseert state met `children` NA paint.
 *   - Bij phase='pushing'/'popping' bevat de render `children` = nieuw,
 *     `previousChildren` (state) = vorige — precies onze snapshot.
 *
 * View Transitions API (Chrome 111+ / Safari 18+ / Firefox 129+) regelt dit
 * automatisch via `view-transition-name` CSS-properties op TopBar/Content/
 * BottomBar — geen handmatige snapshot nodig. Custom fallback hieronder
 * gebruikt de previousChildren-state.
 *
 * ── Animatie-curves (plan §4.2) ────────────────────────────────────
 * Push:  outgoing translateX(0 → -30%) + opacity 1 → 0.5
 *        incoming translateX(100% → 0) + opacity 0.7 → 1
 * Pop:   outgoing translateX(0 → 100%) + opacity 1 → 0.7
 *        incoming translateX(-30% → 0) + opacity 0.5 → 1
 * Duur:  240ms cubic-bezier(0.32, 0.72, 0, 1) (iOS-spring-curve)
 * RM:    prefers-reduced-motion → instant-swap (geen translate of fade)
 */

import { useEffect, useState, type ReactNode } from 'react'
import { useNavStack, type StackEntry, type BottomBarConfig, type TopBarKind } from './nav-stack-provider'
import { resolveRouteTitle } from '@/lib/nav-config'
import { TopBar } from './top-bar'
import { MobileBottomBar } from './mobile-bottom-bar'

type MobileStackShellProps = {
  /** Optionele custom actions in de TopBar (rechts). Default = utility-cluster
   *  (PrivacyToggle + News + Bell + Avatar) wanneer `email` aanwezig is. */
  topBarActions?: ReactNode
  /** Pagina-content. Wordt gerenderd in de incoming-tray. */
  children: ReactNode
  /**
   * Override de `lg:hidden` breakpoint-gating. Bedoeld voor sandbox-device-
   * frames die de mobile-shell op desktop tonen. Default = false.
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
 * `entryTitle` overruled de TopBar-titel — nodig voor de outgoing-tray omdat
 * useNavStack daar al de NIEUWE top-entry teruggeeft.
 */
type TrayProps = {
  entryTitle?: string
  bottomBar?: BottomBarConfig
  topBarActions?: ReactNode
  /**
   * Default = afgeleid uit `currentStack.length > 1` binnen TopBar.
   * Voor outgoing-tray: expliciet doorgeven omdat de huidige stack al de
   * NIEUWE top-entry bevat — anders zou de outgoing onmiddellijk de
   * nieuwe back-knop-state aannemen.
   */
  showBack: boolean
  /**
   * Default = afgeleid uit `top.topBar.kind` binnen TopBar.
   * Voor outgoing-tray: expliciet doorgeven met de OUDE entry's kind zodat
   * de visuele transitie consistent is (rich → simple bij push naar sub-
   * page; simple → rich bij pop terug naar tab-root).
   */
  topBarKind?: TopBarKind
  children: ReactNode
  forceVisible: boolean
  ariaHidden?: boolean
  email?: string
  role?: string
}

function Tray({
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
}: TrayProps) {
  return (
    <div
      aria-hidden={ariaHidden || undefined}
      className="absolute inset-0 flex flex-col bg-[var(--bg)]"
    >
      {/* TopBar binnen de tray — niet sticky t.o.v. viewport, wel binnen de
          tray-flex-column zodat hij meeschuift bij push/pop. */}
      <TopBar
        actions={topBarActions}
        forceVisible={forceVisible}
        title={entryTitle}
        showBackOverride={showBack}
        kindOverride={topBarKind}
        email={email}
        role={role}
      />

      {/* Content scrollt binnen de tray. flex-1 vult de ruimte tussen
          TopBar en BottomBar; overflow-y-auto zodat lange pagina's scrollen
          terwijl TopBar+BottomBar visueel "vast" lijken (binnen de tray).
          `pb-[var(--mobile-nav-clearance)]` reserveert onderaan ruimte voor de
          zwevende FloatingNavButton (zie globals.css) zodat de laatste content
          en knoppen er niet onder verdwijnen; de var is 0 boven 768px waar de
          pill verborgen is. */}
      <main className="flex-1 overflow-y-auto pb-[var(--mobile-nav-clearance)]">{children}</main>

      {/* BottomBar slot — config bepaalt of het tabs / action-bar /
          context-actions / hidden wordt. */}
      <MobileBottomBar config={bottomBar} />
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

  // ── Outgoing-snapshot via state + commit-effect ────────────────
  // We bewaren de "vorige render"-children in state, die we ALLEEN in een
  // commit-phase useEffect updaten — niet tijdens render. Dat voldoet aan
  // de React 19 lint-regels (geen ref-mutatie + geen ref-access tijdens
  // render).
  //
  // Werking:
  //   - State `previousChildren` start gelijk aan de eerste children.
  //   - Een useEffect synchroniseert state met de huidige children NA paint.
  //   - Wanneer de provider phase='pushing'/'popping' zet, triggert dat een
  //     re-render. In die render is `children` al de NIEUWE pagina-content,
  //     maar `previousChildren` (state) bevat nog de WAARDE van de vorige
  //     render — precies onze outgoing-snapshot. We renderen 'm uit, en de
  //     useEffect overschrijft 'm vervolgens met de nieuwe children (klaar
  //     voor de volgende cyclus).
  //
  // Trade-off: één extra re-render per stack-mutatie (state-update via effect),
  // maar het houdt de render-functie zuiver volgens React 19 regels — geen
  // refs lezen/schrijven in render. Bij de huidige scope (sandbox + max
  // 5 stack-entries) is de impact verwaarloosbaar.
  //
  // View Transitions API (Chrome 111+) regelt dit automatisch via DOM-snapshots
  // — we hoeven geen handmatige snapshot te onderhouden. Onze custom-fallback
  // gebruikt deze state. Beide paden lopen parallel zonder visuele tegenstrijdigheid.
  const [previousChildren, setPreviousChildren] = useState<ReactNode>(children)
  const isTransitioning = transition.phase === 'pushing' || transition.phase === 'popping'

  useEffect(() => {
    // Update snapshot na commit. Bij het volgende renderpad (bv. wanneer
    // phase naar 'pushing' overgaat) is deze waarde de "vorige" render.
    setPreviousChildren(children)
  }, [children])

  const visibilityClass = forceVisible ? '' : 'lg:hidden'

  // ── Idle: enkele tray, geen dual-render ────────────────────────
  if (!isTransitioning) {
    return (
      <div
        className={`${visibilityClass} relative flex flex-col bg-[var(--bg)]`}
        style={{ minHeight: '100vh' }}
      >
        <div className="relative flex-1 overflow-hidden" style={{ minHeight: '100vh' }}>
          <Tray
            bottomBar={top?.bottomBar}
            topBarActions={topBarActions}
            showBack={stackDepth > 1}
            forceVisible={forceVisible}
            email={email}
            role={role}
          >
            {children}
          </Tray>
        </div>
      </div>
    )
  }

  // ── Transitie: dual-render outgoing + incoming ─────────────────
  // View Transitions API regelt animaties zelf via view-transition-name CSS;
  // onze custom-fallback gebruikt aria-hidden + CSS-keyframes. Beide paden
  // renderen dezelfde DOM (geen feature-detect-branch in JSX) — alleen de
  // animatie-bron verschilt. Voor browsers met view-transitions wordt onze
  // keyframes-CSS naast de browser-animatie gedraaid; geeft geen visuele
  // tegenstrijdigheid omdat beide dezelfde duur hebben.
  const isPush = transition.phase === 'pushing'
  const outgoingClass = isPush ? 'tray-outgoing-push' : 'tray-outgoing-pop'
  const incomingClass = isPush ? 'tray-incoming-push' : 'tray-incoming-pop'

  return (
    <div
      className={`${visibilityClass} relative flex flex-col bg-[var(--bg)]`}
      style={{ minHeight: '100vh' }}
    >
      <div className="relative flex-1 overflow-hidden" style={{ minHeight: '100vh' }}>
        {/* Outgoing tray — vorige pagina, animeert OUT.
            Krijgt aria-hidden=true zodra animatie start (plan §4.2 a11y). */}
        <div className={outgoingClass} style={{ position: 'absolute', inset: 0 }}>
          <Tray
            // Outgoing-titel: de OUDE entry's eigen titel. Viel die leeg (een
            // subpagina zonder NavStackMeta), val dan tijdens de transitie óók
            // terug op de nav-config-resolver via de OUDE pathname — anders zou
            // de outgoing-TopBar de fallback van de NIEUWE top-entry pakken.
            // Alleen voor 'simple'-subpagina's; tab-roots ('rich') blijven leeg.
            entryTitle={
              transition.outgoing?.title ||
              (transition.outgoing?.topBar?.kind === 'simple'
                ? resolveRouteTitle(transition.outgoing?.pathname ?? '') ?? ''
                : '')
            }
            bottomBar={transition.outgoing?.bottomBar}
            topBarActions={topBarActions}
            // Outgoing toont back-knop alsof het nog op zijn diepte zat —
            // visuele continuiteit. Stack-diepte vóór de pop = na de pop + 1.
            showBack={isPush ? stackDepth - 1 > 1 : stackDepth + 1 > 1}
            // Outgoing krijgt OUDE TopBar-kind expliciet door — anders neemt
            // hij de huidige top-entry's kind aan (visueel "te vroeg" wisselen).
            topBarKind={transition.outgoing?.topBar?.kind}
            forceVisible={forceVisible}
            ariaHidden
            email={email}
            role={role}
          >
            {previousChildren}
          </Tray>
        </div>

        {/* Incoming tray — nieuwe pagina, animeert IN.
            aria-live='polite' op de TopBar binnen Tray voorkomt dat
            screen-readers de oude én nieuwe titel tegelijk announceren. */}
        <div className={incomingClass} style={{ position: 'absolute', inset: 0 }}>
          <Tray
            bottomBar={top?.bottomBar}
            topBarActions={topBarActions}
            showBack={stackDepth > 1}
            forceVisible={forceVisible}
            email={email}
            role={role}
          >
            {children}
          </Tray>
        </div>
      </div>

    </div>
  )
}
