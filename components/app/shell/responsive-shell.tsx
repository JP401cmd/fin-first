/**
 * ResponsiveShell — wrapper rond de pagina-content die de shell rendert:
 * Sidebar (desktop, via portal) + de enkelvoudige ShellFrame (MobileStackShell)
 * voor de content + mobiele chrome, binnen ChatLayoutWrapper voor de Will-chat-
 * sidebar.
 *
 * Layout-strategie (ADR 0053 — enkelvoudige render):
 *  - Sidebar via portal naar `document.body` — omzeilt ChatLayoutWrapper's
 *    `contain: layout` zodat de fixed-positioned sidebar t.o.v. de viewport
 *    blijft (niet de wrapper). Zelf `hidden lg:flex`, dus mobiel onzichtbaar.
 *  - Content blijft binnen ChatLayoutWrapper voor de right-side chat-panel
 *    (`--chat-sidebar-width` resize).
 *  - `children` wordt EXACT ÉÉN keer gerenderd: de ShellFrame draagt één
 *    persistente `<main>` en gate de mobiele chrome (TopBar/BottomBar) puur via
 *    Tailwind `lg:`-classes. Mobiel (<lg) is dat een tray-of-three met interne
 *    scroll; desktop (≥lg) collabeert het frame en valt de `<main>` terug op
 *    document-scroll met `lg:pl-[264px]` naast de Sidebar. Geen JS-breakpoint-
 *    branch in het content-pad → geen dubbele SSR-HTML, geen post-hydratie-
 *    unmount, geen hydration-mismatch.
 *
 * Auth/onboarding/phase-transition/sovereignty/color-vars/font-vars blijven
 * verantwoordelijkheid van `app/(app)/layout.tsx`. Alle providers daar
 * blijven nesting-gelijk; alleen het binnenste rendering-blok wordt door
 * deze component geleverd.
 */
'use client'

import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChatLayoutWrapper } from '@/components/app/chat/chat-layout-wrapper'
import { FloatingNavButton } from '@/components/app/shell/floating-nav-button'
import { DailyExpenseProvider } from '@/components/app/freedom-time-label'
import { Sidebar } from '@/components/app/shell/sidebar'
import { MobileStackShell } from '@/components/app/shell/mobile-stack-shell'
import { NavStackProvider } from '@/components/app/shell/nav-stack-provider'
import { MobileAppStripProvider } from '@/components/app/shell/mobile-app-strip-state'
import type { CategoryAppLink } from '@/lib/category-app-nav'
import type { LeverScores } from '@/components/app/shell/lever-compass'
import type { LeverageStatus } from '@/lib/leverage-status'

/**
 * Goedkope sidebar-signalen voor de status-dots, voorberekend in
 * `app/(app)/layout.tsx` (server). Twee dot-talen:
 *  - binaire freshness-booleans ("iets nieuws / iets te doen")
 *  - status-mirror `belasting` (good/warn/bad/neutral) voor Box 1/2/3.
 */
export type SidebarSignals = {
  /** Tips & acties: open/uitgestelde acties óf aanbevelingen. */
  tipsActions: boolean
  /** Minstens één budget overschreden. */
  budgetOver: boolean
  /** Aandelen-koersen ouder dan de staleness-drempel. */
  aandelenStale: boolean
  /** Crypto-koersen ouder dan de staleness-drempel. */
  cryptoStale: boolean
  /** Hypotheek-rentevaste periode loopt binnen het venster af. */
  hypotheekRateReset: boolean
  /** Verhuurd onroerend goed zonder ingevulde huurinkomsten. */
  verhuurMissingIncome: boolean
  /** Status-mirror voor de Box 1/2/3-subpagina's onder Belasting. */
  belasting: { box1: LeverageStatus; box2: LeverageStatus; box3: LeverageStatus }
}

export type SidebarMetrics = {
  /** Netto vermogen (assets − debts, gewogen volgens inclusion-pct). */
  netWorth: number
  /** Aantal openstaande/uitgestelde acties (Wil-module). */
  actionCount: number
  /**
   * App-slugs die geactiveerd zijn door minstens één gekoppeld asset/debt —
   * voedt de Sidebar's apps-strip filter zodat apps alleen verschijnen
   * wanneer de gebruiker ze daadwerkelijk gebruikt.
   */
  activeAppKeys: string[]
  /**
   * Klikbare app-deeplinks per actieve categorie. Bron is dezelfde server-
   * builder die het Will-dashboard voedt (`buildCategoryAppLinks`), zodat
   * iconen + labels exact matchen tussen dashboard en mobile shell.
   * Mobile-only consumer: `MobileAppStrip` boven de bottom-nav.
   */
  categoryAppLinks: CategoryAppLink[]
  /**
   * Vier-hefbomen-kompas: bezittingen, schulden, cashflow, belasting.
   * Berekend in layout.tsx uit reeds-geladen data. Optioneel voor
   * backwards-compatibiliteit.
   */
  leverScores?: LeverScores
  /**
   * Goedkope sidebar-signalen voor de status-dots (freshness + belasting-
   * status-mirror). Optioneel: bij weglaten tonen de dots hun grijze/neutrale
   * inactieve staat.
   */
  sidebarSignals?: SidebarSignals
}

// ── CategoryAppLinks context ────────────────────────────────────────────────
//
// Door de tree heen prop-drillen van `MobileStackShell → Tray → MobileBottomBar`
// zou Tray dwingen om iets van app-strip-data af te weten. Een lichte context
// houdt het slot-component-patroon zuiver — MobileBottomBar leest direct, Tray
// blijft puur over visuele transitie gaan. Sidebar zit elders in de tree
// (portal) en behoudt zijn bestaande prop-API.
const CategoryAppLinksContext = createContext<CategoryAppLink[]>([])

export function useCategoryAppLinks(): CategoryAppLink[] {
  return useContext(CategoryAppLinksContext)
}

// ── LeverScores context ─────────────────────────────────────────────────────
//
// Vier-hefbomen-kompas data, voorberekend in layout.tsx. Via context beschikbaar
// voor zowel de Sidebar (portal, buiten tree) als de mobile TopBar.
const DEFAULT_LEVER_SCORES: LeverScores = {
  assets: { score: null, status: 'neutral', detail: 'Geen data — Start' },
  debts: { score: null, status: 'neutral', detail: 'Geen data — Start' },
  cashflow: { score: null, status: 'neutral', detail: 'Geen data — Start' },
  tax: { score: null, status: 'neutral', detail: 'Geen data — Start' },
}

const LeverScoresContext = createContext<LeverScores>(DEFAULT_LEVER_SCORES)

export function useLeverScores(): LeverScores {
  return useContext(LeverScoresContext)
}

// ── ActiveAppKeys context ────────────────────────────────────────────────────
//
// Welke deep-app-tools daadwerkelijk geactiveerd zijn door tracking-flags op
// assets/debts. Sidebar (desktop, portal-tree) consumeert dit al via prop;
// NavMenuSheet (mobile, render-tree) leest via context zodat hij dezelfde
// filtering kan toepassen voor de Overzicht-sub-items.
const ActiveAppKeysContext = createContext<string[]>([])

export function useActiveAppKeys(): string[] {
  return useContext(ActiveAppKeysContext)
}

export type ResponsiveShellProps = {
  /** Email van de ingelogde user — initials/name worden hieruit afgeleid voor de Sidebar profile-pill. */
  email: string
  /** Role van de user (default 'user'). Bepaalt zichtbaarheid van de superadmin-link in de Sidebar en TopBar avatar-dropdown. */
  role?: string
  /**
   * Sidebar-kerncijfers, voorberekend in de server-layout zodat ze synchroon
   * met dashboard/horizon blijven. Optioneel: bij weglaten valt de Sidebar
   * terug op zero/null placeholders (tijdens rendering buiten layout-context).
   */
  sidebarMetrics?: SidebarMetrics
  /** Pagina-content. */
  children: ReactNode
}

/**
 * Leid 1-2 letter initialen af uit een email-adres voor de Sidebar profiel-pill.
 * Pakt de eerste twee tekens van het deel vóór de `@` en zet ze in uppercase.
 *
 * Voorbeelden:
 *   getInitials('jan@example.com')          → 'JA'
 *   getInitials('a@b.com')                  → 'A'
 *   getInitials('jpsmit@jps-holding.nl')    → 'JP'
 *   getInitials('')                         → '?'
 */
function getInitials(email: string): string {
  if (!email) return '?'
  const localPart = email.split('@')[0] ?? ''
  if (!localPart) return '?'
  const slice = localPart.slice(0, 2)
  return slice.toUpperCase()
}

/**
 * Leid een vriendelijke gebruikersnaam af uit een email-adres voor display
 * in de Sidebar profiel-pill. We pakken het deel vóór de `@` en laten verdere
 * verfraaiing aan latere fases over (bv. echte profile.full_name uit de DB).
 *
 * Voorbeelden:
 *   getUserName('jan@example.com')          → 'jan'
 *   getUserName('jpsmit@jps-holding.nl')    → 'jpsmit'
 *   getUserName('')                         → 'Account'
 */
function getUserName(email: string): string {
  if (!email) return 'Account'
  const localPart = email.split('@')[0] ?? ''
  return localPart || 'Account'
}

// ── Portal subscribe-helpers (canonical client-only-detect pattern) ─────────
//
// useSyncExternalStore-pattern (i.p.v. useState+useEffect) zodat we voldoen
// aan de React 19 lint-regel
// `react-hooks/set-state-in-effect`. Server-snapshot = false (geen mount);
// client-snapshot = true → portal mount.
const subscribePortal = (): (() => void) => () => {}
const getPortalSnapshot = (): boolean => true
const getPortalServerSnapshot = (): boolean => false

/**
 * Portal-wrapper die kinderen naar `document.body` rendert. Bedoeld om de
 * Sidebar buiten ChatLayoutWrapper's `contain: layout` containing-block te
 * plaatsen, zodat haar `position: fixed` correct ten opzichte van de viewport
 * blijft staan i.p.v. ten opzichte van de wrapper.
 */
function SidebarPortal({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(
    subscribePortal,
    getPortalSnapshot,
    getPortalServerSnapshot,
  )
  if (!mounted || typeof document === 'undefined') return null
  return createPortal(children, document.body)
}

// ── Shell renderer ──────────────────────────────────────────────────────────

function ShellContent({
  email,
  role,
  sidebarMetrics,
  children,
}: ResponsiveShellProps) {
  const initials = getInitials(email)
  const userName = getUserName(email)

  // Sidebar-kerncijfers komen uit `app/(app)/layout.tsx` (server) — netWorth
  // weegt mee via net_worth_inclusion_pct (consistent met dashboard), actionCount
  // is open + postponed acties. Wanneer geen metrics worden meegegeven
  // (rendering buiten layout-context) tonen we de placeholders die Sidebar zelf
  // al ondersteunt: 0 / 0 → '€ 0' / '·'.
  const netWorth = sidebarMetrics?.netWorth ?? 0
  const actionCount = sidebarMetrics?.actionCount ?? 0
  const activeAppKeys = sidebarMetrics?.activeAppKeys ?? []
  const categoryAppLinks = sidebarMetrics?.categoryAppLinks ?? []
  const leverScores = useMemo(
    () => sidebarMetrics?.leverScores ?? DEFAULT_LEVER_SCORES,
    [sidebarMetrics?.leverScores],
  )
  const sidebarSignals = sidebarMetrics?.sidebarSignals

  return (
    <NavStackProvider>
     <LeverScoresContext.Provider value={leverScores}>
     <ActiveAppKeysContext.Provider value={activeAppKeys}>
     <CategoryAppLinksContext.Provider value={categoryAppLinks}>
      <MobileAppStripProvider>
      {/* Sidebar via portal naar document.body — omzeilt ChatLayoutWrapper's
          `contain: layout`. Onder lg:-breakpoint rendert Sidebar `null`
          (hidden lg:flex), dus de portal heeft daar geen visuele impact. */}
      <SidebarPortal>
        <Sidebar
          netWorth={netWorth}
          actionCount={actionCount}
          userInitials={initials}
          userName={userName}
          role={role}
          activeAppKeys={activeAppKeys}
          leverScores={leverScores}
          sidebarSignals={sidebarSignals}
        />
      </SidebarPortal>

      <ChatLayoutWrapper>
        <DailyExpenseProvider>
          {/* Skip-link target (WCAG Bypass Blocks) + focus-bestemming.
              tabIndex={-1} maakt 'm focusbaar via de skip-link-click maar niet
              via gewone Tab. De ShellFrame hieronder draagt `children` exact
              één keer; de mobiele chrome hangt als CSS-gegate siblings in
              dezelfde boom, dus er is geen tweede breakpoint-tak meer. */}
          <div id="main-content" tabIndex={-1} className="outline-none">
            <MobileStackShell email={email} role={role}>{children}</MobileStackShell>
          </div>
        </DailyExpenseProvider>
      </ChatLayoutWrapper>
      <FloatingNavButton />
      </MobileAppStripProvider>
     </CategoryAppLinksContext.Provider>
     </ActiveAppKeysContext.Provider>
     </LeverScoresContext.Provider>
    </NavStackProvider>
  )
}

// ── Public API ──────────────────────────────────────────────────────────────

export function ResponsiveShell(props: ResponsiveShellProps) {
  return <ShellContent {...props} />
}
