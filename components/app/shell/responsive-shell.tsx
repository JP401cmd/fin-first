/**
 * ResponsiveShell — wrapper rond de pagina-content die de nieuwe shell
 * rendert: Sidebar (desktop, via portal) + MobileStackShell (mobile,
 * tray-of-three) + ChatLayoutWrapper voor de Will-chat-sidebar.
 *
 * Layout-strategie:
 *  - Sidebar via portal naar `document.body` — omzeilt ChatLayoutWrapper's
 *    `contain: layout` zodat de fixed-positioned sidebar t.o.v. de viewport
 *    blijft (niet de wrapper).
 *  - Content blijft binnen ChatLayoutWrapper voor de right-side chat-panel
 *    (`--chat-sidebar-width` resize).
 *  - Op desktop (≥lg) krijgt content `lg:pl-[264px]` ruimte naast de sidebar.
 *  - Op mobile (<lg) wrapt MobileStackShell de content in TopBar + Content +
 *    BottomBar — schuift als één blok bij push/pop.
 *  - Pre-hydratie staan beide breakpoint-takken in de DOM (Tailwind hide/show)
 *    voor identieke SSR-HTML; post-hydratie kiest `useIsLgUp` welke tak in
 *    de React-tree blijft zodat zware pagina-content niet dubbel draait.
 *
 * Auth/onboarding/phase-transition/sovereignty/color-vars/font-vars blijven
 * verantwoordelijkheid van `app/(app)/layout.tsx`. Alle providers daar
 * blijven nesting-gelijk; alleen het binnenste rendering-blok wordt door
 * deze component geleverd.
 */
'use client'

import { Suspense, createContext, useContext, useEffect, useState, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { WelcomeBanner } from '@/components/app/welcome-banner'
import { ChatLayoutWrapper } from '@/components/app/chat/chat-layout-wrapper'
import { FloatingNavButton } from '@/components/app/shell/floating-nav-button'
import { DailyExpenseProvider } from '@/components/app/freedom-time-label'
import { Sidebar } from '@/components/app/shell/sidebar'
import { MobileStackShell } from '@/components/app/shell/mobile-stack-shell'
import { NavStackProvider } from '@/components/app/shell/nav-stack-provider'
import { MobileAppStripProvider } from '@/components/app/shell/mobile-app-strip-state'
import { useIsLgUp } from '@/lib/hooks/use-media-query'
import type { CategoryAppLink } from '@/lib/category-app-nav'
import type { LeverScores } from '@/components/app/shell/lever-compass'

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

  // Media-query-gated single-mount: pre-hydratie blijven beide shells in de
  // boom (SSR-output matcht, geen flash op eerste paint). Direct na de eerste
  // commit zet `hydrated` op true en kiest `useIsLgUp` welke shell levend
  // blijft. De inactieve tak unmount, met al haar effects/intervals/fetches,
  // zodat we in stabiele toestand precies één kopie van `children` mounten.
  const isLgUp = useIsLgUp()
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    setHydrated(true)
  }, [])

  return (
    <NavStackProvider>
     <LeverScoresContext.Provider value={leverScores}>
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
        />
      </SidebarPortal>

      <ChatLayoutWrapper>
        <Suspense fallback={null}>
          <WelcomeBanner />
        </Suspense>
        <DailyExpenseProvider>
          {/* Single-mount strategie: pre-hydratie (`hydrated=false`) rendert
              Next.js beide branches met de oude Tailwind hide/show-classes —
              dat houdt de SSR-HTML identiek aan de eerdere implementatie en
              voorkomt hydratie-mismatches en visuele flash. Zodra de eerste
              `useEffect` heeft gecommit, kiest `useIsLgUp` welke tak in de
              React-tree blijft; de andere unmount volledig en zijn effects/
              intervals/fetches cleanen op. Hierdoor draait de zware
              pagina-content (widgets, charts, FIRE-sims) niet langer dubbel.
              `{cond && <Comp />}` per positie zorgt dat React's
              reconciliation de child-instantie binnen elke tak behoudt zolang
              de breakpoint niet over lg-grenze springt — bij een resize over
              de breakpoint volgt wel een unmount/remount, wat een acceptabele
              edge-case is omdat gebruikers zelden tijdens een sessie de
              viewport over 1024px schalen. */}
          {/* Wrapper met id="main-content" — skip-link target voor BEIDE
              breakpoint-takken. tabIndex={-1} maakt 'm focus-bestemming via
              JS (skip-link click) maar niet bereikbaar via gewone Tab. Eén
              wrapper-div omdat HTML niet twee elementen met dezelfde id
              tolereert; pre-hydratie zijn beide takken in de DOM. */}
          <div id="main-content" tabIndex={-1} className="outline-none">
            {(!hydrated || isLgUp) && (
              <main className={hydrated ? 'lg:pl-[264px]' : 'hidden lg:block lg:pl-[264px]'}>
                {children}
              </main>
            )}
            {(!hydrated || !isLgUp) && (
              <MobileStackShell email={email} role={role}>{children}</MobileStackShell>
            )}
          </div>
        </DailyExpenseProvider>
      </ChatLayoutWrapper>
      <FloatingNavButton />
      </MobileAppStripProvider>
     </CategoryAppLinksContext.Provider>
     </LeverScoresContext.Provider>
    </NavStackProvider>
  )
}

// ── Public API ──────────────────────────────────────────────────────────────

export function ResponsiveShell(props: ResponsiveShellProps) {
  return <ShellContent {...props} />
}
