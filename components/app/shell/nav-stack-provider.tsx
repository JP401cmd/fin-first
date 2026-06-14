'use client'

/**
 * SANDBOX / Fase 0 v3 — onderdeel van new-navigation-shell migratie.
 * Plan: docs/navigatie-redesign-plan.md §4
 * Achter feature-flag in productie. Voor nu: alleen sandbox-test.
 *
 * Per-tab navigatie-stacks (Bitvavo-stijl) + transition-state voor de
 * tray-of-three dual-render-animatie.
 *
 * Belangrijke architectuur (plan §2.3 + §4.2):
 *  - Stacks leven in een module-scoped external store + `sessionStorage`,
 *    NIET in browser-history.
 *  - `useSyncExternalStore` voor stacks → SSR-safe, geen hydration-mismatch.
 *  - Transitioning-state leeft in dezelfde external store: bij push/pop
 *    schrijven we ÉÉRST de transition-fields, dan pas de definitieve stack-
 *    mutatie. Subscribers krijgen via één event-stream beide updates.
 *  - View Transitions API wordt gedetecteerd in de mutators; valt automatisch
 *    terug op custom dual-render via de phase-state.
 *  - prefers-reduced-motion → instant-swap (geen transitie-fase, direct idle).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { shouldLogViewTransitionError } from './view-transition-utils'

// ── Types ────────────────────────────────────────────────────────

/**
 * Soorten TopBar die een stack-entry kan vereisen. Zie plan §4.3.
 *  - 'rich' (default voor tab-roots): geen ←-knop, titel + utility-cluster
 *    (PrivacyToggle + News + Bell + Avatar-dropdown). Visueel breed.
 *  - 'simple' (default voor sub-pages): ←-knop links + titel midden, geen
 *    utility-cluster. Compact 48px. Pop via ←-knop = `router.back()`.
 *  - 'hidden': geen TopBar — full-screen content (rare flows zoals onboarding-
 *    embedded). Pagina is dan zelf verantwoordelijk voor terug-navigatie.
 */
export type TopBarKind = 'rich' | 'simple' | 'hidden'

/** TopBar-configuratie per stack-entry. */
export type TopBarConfig = { kind: TopBarKind }

/** Soorten BottomBar die een stack-entry kan vereisen. */
export type BottomBarKind = 'tabs' | 'action-bar' | 'context-actions' | 'app-tabs' | 'hidden'

/** Eén CTA in een action-bar of context-actions BottomBar. */
export type BottomBarAction = {
  label: string
  /** Optioneel icon-id (lucide). Renderer mapt naar component. */
  icon?: string
  /** Klik-handler. Niet serializable — leeft alleen runtime, sessionStorage skipt 'm. */
  onClick?: () => void
  /** Alternatief voor onClick: navigatie-href. */
  href?: string
  /** Voor context-actions: rood / destructieve styling. */
  destructive?: boolean
}

/**
 * Eén tap-target in een `app-tabs` BottomBar (in-app navigatie binnen één
 * Kern-app zoals Budgetteren). Verschilt van `BottomBarAction` doordat de
 * positie (left/center/right) vast is, het label altijd zichtbaar is, en de
 * accent-kleur optioneel per-tab overgenomen kan worden van een andere
 * module dan de omringende.
 */
export type BottomBarAppTab = {
  label: string
  /** ICON_MAP-key in mobile-bottom-bar.tsx (lucide). */
  icon: string
  href?: string
  onClick?: () => void
  /** Active-state: streep + filled icon. Alleen visueel — navigatie blijft mogelijk. */
  active?: boolean
  /**
   * Forceer een module-kleurpalet voor dit tap-target los van de omringende
   * module. Gebruikt voor de centrale "home"-knop in Kern-apps die naar Wil
   * verwijst maar de Wil-accent behoudt.
   */
  moduleAccent?: 'kern' | 'wil' | 'horizon'
}

/**
 * BottomBar-configuratie per stack-entry. Zie plan §4.4.
 * - 'tabs' (default): module-tabs (Kern/Wil/Horizon), gating-aware.
 * - 'action-bar': primary + optionele secondary CTA.
 * - 'context-actions': 2-3 actie-knoppen.
 * - 'app-tabs': drie vaste in-app-tabs (left/center/right) voor Kern-apps
 *   zoals Budgetteren. Vervangt de module-tabs zolang de gebruiker binnen
 *   één app navigeert.
 * - 'hidden': geen BottomBar — full-screen content.
 */
export type BottomBarConfig =
  | { kind: 'tabs' }
  | {
      kind: 'action-bar'
      primary: BottomBarAction
      secondary?: BottomBarAction
    }
  | {
      kind: 'context-actions'
      actions: BottomBarAction[]
    }
  | {
      kind: 'app-tabs'
      left: BottomBarAppTab
      center: BottomBarAppTab
      right: BottomBarAppTab
    }
  | { kind: 'hidden' }

/**
 * Eén entry in de per-tab-stack. `bottomBar` is optioneel; ontbrekend wordt
 * behandeld als `{ kind: 'tabs' }`.
 *
 * Belangrijk: `BottomBarConfig` met onClick/href is NIET serializable. We
 * schrijven alleen `pathname` + `title` + `scrollY` + `bottomBar.kind` (+
 * label-velden) naar sessionStorage; live handlers worden bij rehydrate niet
 * hersteld — dat is acceptabel want na refresh komt de pagina opnieuw mounten
 * en re-pushen met verse handlers.
 */
export type StackEntry = {
  /** Volledig pad incl. dynamic-segments, bv. /core/assets/holdings/abc-123. */
  pathname: string
  /** Wordt in TopBar getoond. Leeg = TopBar toont generieke fallback. */
  title: string
  /** Bewaard bij push, te herstellen bij pop. SSR: 0. */
  scrollY: number
  /** Optionele BottomBar-override; default = `{ kind: 'tabs' }`. */
  bottomBar?: BottomBarConfig
  /** Optionele TopBar-override; default = `'rich'` op tab-roots, `'simple'` op sub-pages. */
  topBar?: TopBarConfig
}

export type TabId = 'kern' | 'wil' | 'horizon' | 'identity' | 'other'

/** Animatie-fase tijdens push/pop. 'idle' = geen transitie aan de gang. */
export type TransitionPhase = 'idle' | 'pushing' | 'popping' | 'cross-tab'

/**
 * Transitie-state. Tijdens pushing/popping leven outgoing + incoming naast
 * elkaar in de DOM (custom-fallback) of via View Transitions (Chrome 111+).
 * Cross-tab = instant switch, geen dual-render — outgoing/incoming blijven
 * null en MobileStackShell rendert alleen de actieve stack.
 */
export type TransitionState = {
  phase: TransitionPhase
  outgoing: StackEntry | null
  incoming: StackEntry | null
}

export type NavStackContextValue = {
  /** Active tab afgeleid uit `usePathname()`. */
  activeTab: TabId
  /** Huidige stack van de active tab. Lege array tot eerste push. */
  currentStack: StackEntry[]
  /** Transitioning-state voor dual-render-animatie. */
  transition: TransitionState
  /** Push een nieuwe entry op de active tab-stack (scrollY wordt automatisch ingevuld). */
  push: (entry: Omit<StackEntry, 'scrollY'>) => void
  /** Pop de top-entry van de active tab-stack. */
  pop: () => void
  /** Vervang de hele stack van een tab (cross-tab herstel of reset). */
  resetTab: (tabId: TabId, entries: StackEntry[]) => void
}

// ── Constants ────────────────────────────────────────────────────

/**
 * Stack-diepte limiet per tab (zie plan §4.2 + §8.7). Bij push #6 wordt de
 * oudste entry weggegooid (FIFO). Reden: meerdere stack-entries onthouden
 * = meerdere DOM-trees op mobile, performance-impact.
 */
const MAX_STACK_DEPTH = 5

/** sessionStorage-sleutel — bewust geprefixed met `fintwo:` om collisions te voorkomen. */
const STORAGE_KEY = 'fintwo:nav-stacks'

/** Custom event — gedispatch door dezelfde tab om subscribers wakker te maken. */
const STACK_CHANGE_EVENT = 'fintwo:nav-stacks:change'

/**
 * Custom event waarmee `<NavStackMeta>` (zie nav-stack-meta.tsx) de top-entry
 * van de active tab-stack bijwerkt zonder een nieuwe push te doen. Wordt door
 * pagina-componenten gebruikt om TopBar-titel + BottomBar-config te bevestigen
 * na pathname-driven auto-push (waar de meta nog leeg is).
 */
const NAV_STACK_META_EVENT = 'fintwo:nav-stack-meta'

/** Detail-shape van het meta-event. Moet matchen met `NavStackMetaDetail` in nav-stack-meta.tsx. */
type NavStackMetaDetail = {
  title: string
  bottomBar: BottomBarConfig
  topBar: TopBarConfig
}

const ALL_TABS: TabId[] = ['kern', 'wil', 'horizon', 'identity', 'other']

/**
 * Animatie-duur in ms — moet matchen met MobileStackShell-keyframes en
 * SlideInPane (240ms) voor consistentie. Na deze duur reset transition-state
 * naar 'idle' en wordt outgoing unmounted.
 */
export const TRANSITION_DURATION_MS = 240

// ── Pathname → Tab mapping ───────────────────────────────────────

/**
 * Leid de active tab af uit de pathname.
 *
 * Canonieke IA (single source of truth: `lib/nav-config.ts`):
 *  - /overzicht/** → kern
 *  - /toekomst/**  → horizon
 *  - /mijn/**      → identity
 *
 * Legacy backing-routes blijven werken en mappen op dezelfde tabs:
 *  - /core/**     → kern
 *  - /will/**     → wil
 *  - /horizon/**  → horizon
 *  - /identity/** → identity
 *
 * Alles anders → other. Belangrijk: de canonieke routes MOETEN hier herkend
 * worden — anders vallen ze in `other`, worden ze nooit als tab-root gezien
 * (zie `isTabRoot`) en krijgen de hoofd-pagina's `topBar.kind = 'simple'`
 * i.p.v. `'rich'` → de mobiele utility-cluster (kompas + account) verdwijnt.
 */
export function deriveTabFromPath(pathname: string): TabId {
  if (pathname === '/overzicht' || pathname.startsWith('/overzicht/')) return 'kern'
  if (pathname === '/toekomst' || pathname.startsWith('/toekomst/')) return 'horizon'
  if (pathname === '/mijn' || pathname.startsWith('/mijn/')) return 'identity'
  if (pathname === '/core' || pathname.startsWith('/core/')) return 'kern'
  if (pathname === '/will' || pathname.startsWith('/will/')) return 'wil'
  if (pathname === '/horizon' || pathname.startsWith('/horizon/')) return 'horizon'
  if (pathname === '/identity' || pathname.startsWith('/identity/')) return 'identity'
  return 'other'
}

/**
 * Bepaal of een pathname de root van een tab is. Gebruikt om automatisch te
 * resetten naar single-entry bij root-bezoek (auto-pop tot de root) én om de
 * TopBar-kind te bepalen: roots → `'rich'` (utility-cluster), sub-pages →
 * `'simple'`. Zowel de canonieke als de legacy root telt mee.
 *
 * Geëxporteerd voor unit-tests (zie nav-stack-provider.test.ts).
 */
export function isTabRoot(pathname: string, tab: TabId): boolean {
  switch (tab) {
    case 'kern': return pathname === '/overzicht' || pathname === '/core'
    case 'wil': return pathname === '/will'
    case 'horizon': return pathname === '/toekomst' || pathname === '/horizon'
    case 'identity': return pathname === '/mijn' || pathname === '/identity'
    case 'other': return false
  }
}

// ── External store (sessionStorage-backed) ───────────────────────
//
// We modelleren stacks ÉN transitie-state als één external store. De
// transitie-state staat NIET in sessionStorage (puur runtime), maar wel in
// een module-scoped variabele zodat useSyncExternalStore er hetzelfde
// subscribe-mechanisme voor kan gebruiken.

type StackMap = Record<TabId, StackEntry[]>

type StoreState = {
  /** Stacks per tab — gepersisteerd in sessionStorage. */
  stacks: StackMap
  /** Transitie-state — runtime only, niet in sessionStorage. */
  transition: TransitionState
}

const EMPTY_STACK_MAP: StackMap = {
  kern: [],
  wil: [],
  horizon: [],
  identity: [],
  other: [],
}

const IDLE_TRANSITION: TransitionState = {
  phase: 'idle',
  outgoing: null,
  incoming: null,
}

/**
 * Module-scoped runtime-state. We bewaren een referentieel-stabiele snapshot
 * en muteren via `setState`. useSyncExternalStore krijgt deze snapshot en
 * notificeert subscribers via STACK_CHANGE_EVENT.
 */
let runtimeState: StoreState = {
  stacks: EMPTY_STACK_MAP,
  transition: IDLE_TRANSITION,
}

/** Snapshot voor SSR — altijd lege state zodat server- en eerste-client-render matchen. */
const SERVER_SNAPSHOT: StoreState = {
  stacks: EMPTY_STACK_MAP,
  transition: IDLE_TRANSITION,
}

function getServerSnapshot(): StoreState {
  return SERVER_SNAPSHOT
}

function getClientSnapshot(): StoreState {
  return runtimeState
}

/**
 * Subscribe op zowel cross-tab `storage`-events (browser-built-in) als
 * same-tab `STACK_CHANGE_EVENT` (door ons gedispatched). useSyncExternalStore
 * vereist een unsubscribe-return.
 */
function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const handleStorage = (e: StorageEvent) => {
    // Cross-tab storage-update: rehydrate stacks vanuit sessionStorage.
    if (e.key === STORAGE_KEY) {
      runtimeState = {
        stacks: parseStacks(e.newValue ?? ''),
        // Transitie-state is per-tab — andere browser-tab raakt onze niet.
        transition: runtimeState.transition,
      }
      callback()
    }
  }
  window.addEventListener('storage', handleStorage)
  window.addEventListener(STACK_CHANGE_EVENT, callback)
  return () => {
    window.removeEventListener('storage', handleStorage)
    window.removeEventListener(STACK_CHANGE_EVENT, callback)
  }
}

/**
 * Schrijf nieuwe state naar runtime + sessionStorage. Wordt aangeroepen door
 * push/pop/resetTab. `persistStacks` controleert of we naar sessionStorage
 * moeten schrijven (transitie-state niet, stack-state wel).
 */
function setState(next: StoreState, persistStacks: boolean): void {
  runtimeState = next
  if (persistStacks && typeof window !== 'undefined') {
    try {
      // Strip non-serializable handlers uit bottomBar voordat we naar
      // sessionStorage schrijven. Bij rehydrate krijgt rendering-code geen
      // live handlers; de pagina re-pusht bij mount met verse handlers.
      const serialized = JSON.stringify(next.stacks, sanitizeForStorage)
      window.sessionStorage.setItem(STORAGE_KEY, serialized)
    } catch {
      // Quota-error / storage geblokt — runtime werkt nog, refresh verliest data.
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(STACK_CHANGE_EVENT))
  }
}

/**
 * JSON.stringify-replacer: laat onClick/icon callbacks weg (functions zijn
 * niet serializable, lucide icon-strings wel maar handlers zeker niet). We
 * laten de string-velden (label, href, kind, destructive) staan zodat een
 * minimale bottomBar-meta na refresh weer aanwezig is.
 */
function sanitizeForStorage(_key: string, value: unknown): unknown {
  if (typeof value === 'function') return undefined
  return value
}

/**
 * Defensief parsen: alleen bekende tab-keys overnemen, rest leeg. Vangt
 * corrupte JSON op zonder crash.
 */
function parseStacks(raw: string): StackMap {
  if (!raw) return EMPTY_STACK_MAP
  try {
    const parsed = JSON.parse(raw) as Partial<StackMap>
    return {
      kern: Array.isArray(parsed.kern) ? parsed.kern : [],
      wil: Array.isArray(parsed.wil) ? parsed.wil : [],
      horizon: Array.isArray(parsed.horizon) ? parsed.horizon : [],
      identity: Array.isArray(parsed.identity) ? parsed.identity : [],
      other: Array.isArray(parsed.other) ? parsed.other : [],
    }
  } catch {
    return EMPTY_STACK_MAP
  }
}

/**
 * Eén-keer-per-page-load: hydrate runtime vanuit sessionStorage. We doen
 * dit lazy zodat SSR de IDLE_STORE krijgt en de eerste client-render matcht.
 * Daarna wordt runtimeState bij elke mutator overschreven.
 */
let hasHydrated = false
function hydrateFromStorage(): void {
  if (hasHydrated || typeof window === 'undefined') return
  hasHydrated = true
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY) ?? ''
    runtimeState = {
      stacks: parseStacks(raw),
      transition: IDLE_TRANSITION,
    }
  } catch {
    // Storage geblokt — laat IDLE staan.
  }
}

// ── Reduced-motion + View Transitions detect ─────────────────────

/**
 * Detecteer `prefers-reduced-motion: reduce`. Bij reduced-motion skippen we
 * de transitie-fase volledig (instant swap).
 */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/**
 * Detecteer View Transitions API (Chrome 111+, Safari 18+, Firefox 129+).
 * Indien beschikbaar wrappen we state-mutaties in `document.startViewTransition`
 * — die regelt cross-fade-and-slide automatisch via `view-transition-name`
 * CSS-properties op TopBar/Content/BottomBar.
 */
type ViewTransitionLike = {
  ready?: Promise<void>
  finished?: Promise<void>
  updateCallbackDone?: Promise<void>
  skipTransition?: () => void
}
type DocumentWithViewTransitions = Document & {
  startViewTransition?: (callback: () => void) => ViewTransitionLike
}

function hasViewTransitions(): boolean {
  if (typeof document === 'undefined') return false
  return 'startViewTransition' in document
}

function startViewTransition(callback: () => void): void {
  const doc = document as DocumentWithViewTransitions
  if (typeof doc.startViewTransition !== 'function') {
    callback()
    return
  }
  const transition = doc.startViewTransition(callback)
  // De View Transitions API heeft drie promises (ready/finished/updateCallbackDone)
  // die rejecten zodra de transitie wordt geskipped — door een nieuwe transitie
  // (AbortError) of doordat het document hidden/niet-active was (InvalidStateError).
  // Beide zijn verwacht en functioneel onschadelijk (de mutatie draait alsnog);
  // alle drie swallowen voorkomt rejection-spam in de Next.js dev-overlay.
  const swallow = (err: unknown) => {
    if (shouldLogViewTransitionError(err)) {
      console.error('[nav-stack] view transition error:', err)
    }
  }
  transition?.ready?.catch(swallow)
  transition?.finished?.catch(swallow)
  transition?.updateCallbackDone?.catch(swallow)
}

// ── Context ──────────────────────────────────────────────────────

const NavStackContext = createContext<NavStackContextValue | null>(null)

/**
 * Runtime-only override voor `MobileBottomBar.config`. Bedoeld voor pagina's
 * die een action-bar willen tonen met live `onClick`-handlers — die kunnen
 * niet via `<NavStackMeta bottomBar={...}>` omdat de CustomEvent functions
 * stript voor sessionStorage-rehydration. Een form-page rendert
 * `<MobileBottomBarLive primary={...} secondary={...}>` en de context-state
 * overruled de stack-entry's bottomBar zolang het component gemount is.
 *
 * Geen sessionStorage-persistentie — bij refresh moet de pagina opnieuw
 * registreren. Dat is acceptabel: handlers worden bij refresh sowieso opnieuw
 * gecreëerd.
 */
type LiveBottomBarContextValue = {
  config: BottomBarConfig | null
  setConfig: (config: BottomBarConfig | null) => void
}

const LiveBottomBarContext = createContext<LiveBottomBarContextValue | null>(null)

/** Hook om de live-bottom-bar-config te lezen vanuit MobileBottomBar. */
export function useLiveBottomBar(): LiveBottomBarContextValue | null {
  return useContext(LiveBottomBarContext)
}

// ── Provider ─────────────────────────────────────────────────────

type NavStackProviderProps = {
  children: ReactNode
  /**
   * Alleen voor sandbox/preview: override de afgeleide active tab. Productie
   * laat dit weg — pathname blijft canonical.
   */
  overrideActiveTab?: TabId
}

export function NavStackProvider({
  children,
  overrideActiveTab,
}: NavStackProviderProps) {
  const pathname = usePathname()
  const router = useRouter()
  const activeTab: TabId = overrideActiveTab ?? deriveTabFromPath(pathname)

  // Hydrate runtime-state bij eerste client-render. Veilig om elke render
  // aan te roepen — de hasHydrated-guard zorgt dat het maar één keer effect
  // heeft. Geen useEffect-roundtrip nodig.
  if (typeof window !== 'undefined') hydrateFromStorage()

  const storeState = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot)
  const stacks = storeState.stacks
  const transition = storeState.transition

  // ── Mutators ───────────────────────────────────────────────────
  // Mutators schrijven naar de external store; subscribe-callback van
  // useSyncExternalStore triggert vervolgens re-render automatisch.
  //
  // Push/pop schrijven in twee stappen:
  //   1. Direct: stack muteren + transition.phase = 'pushing'/'popping' met
  //      outgoing+incoming gevuld.
  //   2. Na TRANSITION_DURATION_MS: transition.phase terug naar 'idle',
  //      outgoing+incoming gewist.
  //
  // Bij prefers-reduced-motion of cross-tab slaan we stap 2 direct over.
  // Bij View Transitions wrappen we stap 1 in startViewTransition() — de
  // browser regelt de cross-fade-and-slide via CSS view-transition-name.

  const push = useCallback((entry: Omit<StackEntry, 'scrollY'>) => {
    const scrollY = typeof window !== 'undefined' ? window.scrollY : 0
    const tabStack = runtimeState.stacks[activeTab]
    const top = tabStack[tabStack.length - 1]
    // Voorkom dubbele entries: zelfde pathname al bovenaan → niets doen.
    if (top && top.pathname === entry.pathname) return

    const fullEntry: StackEntry = { ...entry, scrollY }
    const next: StackEntry[] = [...tabStack, fullEntry]
    // FIFO: zodra max overschreden, oudste afkappen.
    const trimmed = next.length > MAX_STACK_DEPTH
      ? next.slice(next.length - MAX_STACK_DEPTH)
      : next

    const reduced = prefersReducedMotion()

    const applyMutation = () => {
      setState({
        stacks: { ...runtimeState.stacks, [activeTab]: trimmed },
        transition: reduced
          ? IDLE_TRANSITION
          : { phase: 'pushing', outgoing: top ?? null, incoming: fullEntry },
      }, true)
    }

    // Geen view-transition wrap hier: de pathname-watcher useEffect doet dat
    // canonical wanneer Next.js de pathname wisselt. Dubbel wrappen veroorzaakt
    // AbortError 'Transition was skipped'.
    applyMutation()

    // Reset transition naar idle na de animatie-duur. Zonder reduced-motion
    // én zonder view-transitions doen we dit altijd; met view-transitions ook
    // (browser regelt de animatie zelf, maar onze fallback-CSS gebruikt de
    // phase nog 240ms voor extra zekerheid).
    if (!reduced && typeof window !== 'undefined') {
      window.setTimeout(() => {
        // Alleen idle zetten als we nog in dezelfde phase zitten. Anders is
        // er ondertussen een nieuwe push/pop geweest en zou idle de nieuwe
        // animatie cancellen.
        if (
          runtimeState.transition.phase === 'pushing' &&
          runtimeState.transition.incoming?.pathname === fullEntry.pathname
        ) {
          setState({
            stacks: runtimeState.stacks,
            transition: IDLE_TRANSITION,
          }, false)
        }
      }, TRANSITION_DURATION_MS)
    }
  }, [activeTab])

  // pop() = router.back() wrapper. We muteren hier NIET zelf de stack of
  // transition-state — de pathname-watcher (zie verderop) detecteert de pop
  // automatisch (pathname matcht een eerdere stack-entry) en speelt de
  // 'popping'-animatie. Hierdoor is browser-back ↔ ←-knop ↔ swipe-back
  // gedrags-identiek: alle drie triggeren één code-pad.
  //
  // Edge-case — directe deeplink zonder history: bij `history.length <= 1`
  // (gebruiker komt rechtstreeks binnen op een sub-pagina, geen previous
  // entry in browser-history) valt `router.back()` terug op leave-the-site
  // gedrag, wat we niet willen. In dat geval doen we een expliciete
  // `router.push(previous.pathname)`. Pathname-watcher detecteert het als
  // pop (matcht eerdere stack-entry) en speelt alsnog de juiste animatie.
  const pop = useCallback(() => {
    const tabStack = runtimeState.stacks[activeTab]
    if (tabStack.length <= 1) return // Niet onder root popen.
    const previous = tabStack[tabStack.length - 2]
    if (!previous) return
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push(previous.pathname)
    }
  }, [activeTab, router])

  const resetTab = useCallback((tabId: TabId, entries: StackEntry[]) => {
    setState({
      stacks: { ...runtimeState.stacks, [tabId]: entries },
      // Cross-tab / reset is instant: geen dual-render. Plan §4.2 cross-tab.
      transition: IDLE_TRANSITION,
    }, true)
  }, [])

  // ── Pathname-watcher: auto-push/pop/reset op pathname-change ───
  //
  // Pathname is een externe input (browser-URL); de stack synchroniseert
  // daarop. Plan §4.1 + §4.2: bij push/pop schuift de tray-of-three als
  // één geheel — dit pad is de enige animatie-trigger voor productie-routes
  // (Next.js `<Link>`-clicks gaan via pathname-change, niet via
  // expliciete `push()`-calls).
  //
  // Drie scenario's onderscheiden:
  //  1. Tab-root bezoek (bv. /core) → reset stack tot single-entry, IDLE
  //     (geen animatie — root-reset is conceptueel een "naar home").
  //  2. Pathname matcht een EERDERE entry in stack → POP (truncate stack
  //     tot die entry) met 'popping'-fase voor animatie.
  //  3. Anders → PUSH (nieuwe entry op stack) met 'pushing'-fase.
  //
  // Bij `prefers-reduced-motion: reduce` slaan we de animatie-fase over
  // (instant swap, geen translate of fade — plan §4.2 a11y).
  //
  // De 240ms cleanup-timer reset transition naar IDLE; we checken dat de
  // phase nog steeds dezelfde push/pop is voordat we resetten — anders zou
  // een snelle vervolg-navigatie de nieuwe animatie cancellen.
  useEffect(() => {
    if (overrideActiveTab) return // Sandbox-override: handmatige push/pop.

    const tabStack = runtimeState.stacks[activeTab]
    const top = tabStack[tabStack.length - 1]

    if (top && top.pathname === pathname) return

    const reduced = prefersReducedMotion()
    const isRoot = isTabRoot(pathname, activeTab)

    // Default-config voor nieuwe entries.
    //  - TopBar: 'rich' op tab-roots (utility-cluster), 'simple' op sub-pages
    //    (←+titel).
    //  - BottomBar: 'tabs' alleen op tab-roots; sub-pages krijgen 'hidden'
    //    (lege bar). Reden: gebruiker keert op sub-pages terug via ←-knop,
    //    niet via cross-tab-tabs. Pagina's die alsnog tabs willen zien (bv.
    //    een list-overview onder een module) overrulen via
    //    `<NavStackMeta bottomBar={{ kind: 'tabs' }}>`. Pagina's met een
    //    form-flow overrulen naar 'action-bar', detail-pagina's naar
    //    'context-actions'.
    const defaultTopBar: TopBarConfig = { kind: isRoot ? 'rich' : 'simple' }
    const defaultBottomBar: BottomBarConfig = { kind: isRoot ? 'tabs' : 'hidden' }

    // ── Scenario 1: tab-root bezoek ──────────────────────────────
    if (isRoot) {
      setState({
        stacks: {
          ...runtimeState.stacks,
          [activeTab]: [{
            pathname,
            title: '',
            scrollY: 0,
            topBar: defaultTopBar,
            bottomBar: defaultBottomBar,
          }],
        },
        transition: IDLE_TRANSITION,
      }, true)
      return
    }

    // ── Scenario 2: POP — pathname matcht een eerdere stack-entry ──
    const existingIdx = tabStack.findIndex(e => e.pathname === pathname)
    if (existingIdx >= 0 && existingIdx < tabStack.length - 1) {
      const popped = tabStack.slice(0, existingIdx + 1)
      const outgoing = top
      const incoming = popped[popped.length - 1] ?? null

      const applyMutation = () => {
        setState({
          stacks: { ...runtimeState.stacks, [activeTab]: popped },
          transition: reduced
            ? IDLE_TRANSITION
            : { phase: 'popping', outgoing: outgoing ?? null, incoming },
        }, true)
      }

      if (hasViewTransitions() && !reduced) {
        startViewTransition(applyMutation)
      } else {
        applyMutation()
      }

      if (!reduced && typeof window !== 'undefined') {
        window.setTimeout(() => {
          if (
            runtimeState.transition.phase === 'popping' &&
            runtimeState.transition.outgoing?.pathname === outgoing?.pathname
          ) {
            setState({
              stacks: runtimeState.stacks,
              transition: IDLE_TRANSITION,
            }, false)
          }
        }, TRANSITION_DURATION_MS)
      }
      return
    }

    // ── Scenario 3: PUSH — nieuwe sub-page ───────────────────────
    const scrollY = typeof window !== 'undefined' ? window.scrollY : 0
    const newEntry: StackEntry = {
      pathname,
      title: '',
      scrollY,
      topBar: defaultTopBar,
      bottomBar: defaultBottomBar,
    }
    const next: StackEntry[] = [...tabStack, newEntry]
    const trimmed = next.length > MAX_STACK_DEPTH
      ? next.slice(next.length - MAX_STACK_DEPTH)
      : next

    const applyMutation = () => {
      setState({
        stacks: { ...runtimeState.stacks, [activeTab]: trimmed },
        transition: reduced
          ? IDLE_TRANSITION
          : { phase: 'pushing', outgoing: top ?? null, incoming: newEntry },
      }, true)
    }

    if (hasViewTransitions() && !reduced) {
      startViewTransition(applyMutation)
    } else {
      applyMutation()
    }

    if (!reduced && typeof window !== 'undefined') {
      window.setTimeout(() => {
        if (
          runtimeState.transition.phase === 'pushing' &&
          runtimeState.transition.incoming?.pathname === newEntry.pathname
        ) {
          setState({
            stacks: runtimeState.stacks,
            transition: IDLE_TRANSITION,
          }, false)
        }
      }, TRANSITION_DURATION_MS)
    }
  }, [pathname, activeTab, overrideActiveTab])

  // ── NavStackMeta listener: top-entry meta-update ──────────────
  // Pagina-componenten kunnen `<NavStackMeta title=... bottomBar=...>`
  // renderen om hun TopBar-titel + BottomBar-config te bevestigen na een
  // pathname-driven auto-push (waar de meta nog leeg was). We werken dan
  // alleen de TOP-entry van de active tab-stack bij — geen nieuwe push, geen
  // pop. De event-bron staat in nav-stack-meta.tsx.
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handler = (e: Event) => {
      // CustomEvent typing — strict TypeScript zonder `any`.
      const detail = (e as CustomEvent<NavStackMetaDetail>).detail
      if (!detail) return

      const tabStack = runtimeState.stacks[activeTab]
      if (tabStack.length === 0) return

      const top = tabStack[tabStack.length - 1]
      // Defensief: als top om wat voor reden niet bestaat, niets doen.
      if (!top) return

      // No-op-detectie: als de meta al gelijk is, niet opnieuw schrijven.
      // Voorkomt onnodige re-renders + sessionStorage-writes bij idempotente
      // re-renders van NavStackMeta met dezelfde props.
      const sameTitle = top.title === detail.title
      const sameBottomBar = JSON.stringify(top.bottomBar) === JSON.stringify(detail.bottomBar)
      const sameTopBar = JSON.stringify(top.topBar) === JSON.stringify(detail.topBar)
      if (sameTitle && sameBottomBar && sameTopBar) return

      const updated: StackEntry = {
        ...top,
        title: detail.title,
        bottomBar: detail.bottomBar,
        topBar: detail.topBar,
      }
      setState({
        stacks: {
          ...runtimeState.stacks,
          [activeTab]: [...tabStack.slice(0, -1), updated],
        },
        transition: runtimeState.transition,
      }, true)
    }

    window.addEventListener(NAV_STACK_META_EVENT, handler)
    return () => window.removeEventListener(NAV_STACK_META_EVENT, handler)
  }, [activeTab])

  // ── Memoized context value ─────────────────────────────────────
  const value = useMemo<NavStackContextValue>(() => ({
    activeTab,
    currentStack: stacks[activeTab],
    transition,
    push,
    pop,
    resetTab,
  }), [activeTab, stacks, transition, push, pop, resetTab])

  // ── Live BottomBar override (zie LiveBottomBarContext) ─────────
  // Runtime-only state voor pagina's die een action-bar met `onClick`-handlers
  // nodig hebben. Stack-entry's bottomBar (sessionStorage-gebackt) kan geen
  // functions dragen; deze context wel.
  const [liveBottomBarConfig, setLiveBottomBarConfig] = useState<BottomBarConfig | null>(null)
  const liveBottomBarValue = useMemo<LiveBottomBarContextValue>(() => ({
    config: liveBottomBarConfig,
    setConfig: setLiveBottomBarConfig,
  }), [liveBottomBarConfig])

  return (
    <NavStackContext.Provider value={value}>
      <LiveBottomBarContext.Provider value={liveBottomBarValue}>
        {children}
      </LiveBottomBarContext.Provider>
    </NavStackContext.Provider>
  )
}

// ── Hook ─────────────────────────────────────────────────────────

/**
 * Toegang tot per-tab-stack-state. Buiten een `<NavStackProvider>` gooit dit
 * een runtime error — dat is bewust: shell-componenten mogen niet stilzwijgend
 * werken zonder provider.
 */
export function useNavStack(): NavStackContextValue {
  const ctx = useContext(NavStackContext)
  if (!ctx) {
    throw new Error('useNavStack must be used within a <NavStackProvider>')
  }
  return ctx
}

// ── Test/debug exports ───────────────────────────────────────────

export const ALL_NAV_TABS: ReadonlyArray<TabId> = ALL_TABS
export const STACK_DEPTH_LIMIT = MAX_STACK_DEPTH
export const NAV_STACK_STORAGE_KEY = STORAGE_KEY
