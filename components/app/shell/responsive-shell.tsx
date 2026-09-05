/**
 * ResponsiveShell — wrapper rond de pagina-content die de shell rendert:
 * Sidebar (desktop, via portal) + de enkelvoudige ShellFrame (MobileStackShell)
 * voor de content + mobiele chrome, binnen ChatLayoutWrapper voor de Fin-chat-
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

import { useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChatLayoutWrapper } from '@/components/app/chat/chat-layout-wrapper'
import { FloatingNavButton } from '@/components/app/shell/floating-nav-button'
import { DailyExpenseProvider } from '@/components/app/freedom-time-label'
import { Sidebar } from '@/components/app/shell/sidebar'
import { MobileStackShell } from '@/components/app/shell/mobile-stack-shell'
import { userInitials, userDisplayName } from '@/lib/user-initials'
import { NavStackProvider } from '@/components/app/shell/nav-stack-provider'
import { MobileAppStripProvider } from '@/components/app/shell/mobile-app-strip-state'
import {
  CategoryAppLinksContext,
  LeverScoresContext,
  ActiveAppKeysContext,
  DEFAULT_LEVER_SCORES,
  type SidebarMetrics,
} from '@/components/app/shell/shell-contexts'

export type ResponsiveShellProps = {
  /** Email van de ingelogde user — terugval voor initialen/naam als het profiel geen `full_name` draagt. */
  email: string
  /**
   * `profiles.full_name` van de ingelogde user (own-row, al geladen in
   * `app/(app)/layout.tsx`). Wint van het e-mailadres voor de profiel-pill in
   * de Sidebar én het avatar-rondje in de TopBar — zie `lib/user-initials.ts`.
   */
  fullName?: string | null
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

// Initialen en weergavenaam komen uit `lib/user-initials.ts` — één regel voor
// de Sidebar-pill én het TopBar-avatar (UR3-17 #27b). Eerder leidde elk
// oppervlak zijn eigen letters af uit het e-mailadres.

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
  fullName,
  role,
  sidebarMetrics,
  children,
}: ResponsiveShellProps) {
  const initials = userInitials(fullName, email)
  const userName = userDisplayName(fullName, email)

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
            <MobileStackShell email={email} initials={initials} role={role}>{children}</MobileStackShell>
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
