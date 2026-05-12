/**
 * Fase 0.2 — onderdeel van new-navigation-shell migratie.
 * Plan: docs/navigatie-redesign-plan.md §2.2, §3.1, §4.1
 * Achter feature-flag `new_navigation_shell`. Bij flag uit = oude shell.
 *
 * Kern-wrapper die op basis van de feature-flag `new_navigation_shell` de
 * oude (AppHeader + ChatLayoutWrapper + BottomNav) of de nieuwe shell
 * (Sidebar + MobileStackShell + tray-of-three) rendert.
 *
 * ── Veiligheidsgaranties bij flag UIT ────────────────────────────────
 * Wanneer de flag uit staat (default voor alle gebruikers in Fase 0.2)
 * rendert deze component EXACT dezelfde DOM-structuur als de oude layout:
 *
 *   <ChatLayoutWrapper>
 *     <AppHeader />
 *     <Suspense><WelcomeBanner /></Suspense>
 *     <DailyExpenseProvider>
 *       <main className="pb-20 md:pb-0">{children}</main>
 *     </DailyExpenseProvider>
 *   </ChatLayoutWrapper>
 *   <BottomNav />
 *
 * Geen gedragsverandering, geen visuele afwijking. Bestaande rendering-
 * volgorde, classes, providers — alles behouden.
 *
 * ── Bij flag AAN ─────────────────────────────────────────────────────
 * 1. NavStackProvider wikkelt alles voor per-tab-stack-state.
 * 2. Sidebar (≥lg) wordt via portal naar `document.body` gerenderd —
 *    omzeilt ChatLayoutWrapper's `contain: layout` dat fixed-positioned
 *    descendants normaal aan de wrapper bindt i.p.v. de viewport. Zie
 *    `app/(app)/beheer/shell-prototype/sidebar-demo.tsx:117-141` voor
 *    het canonical portal-patroon dat we hier hergebruiken.
 * 3. ChatLayoutWrapper blijft staan zodat de chat-functionaliteit
 *    (right-panel resize via `--chat-sidebar-width`) onaangeroerd werkt.
 * 4. Op desktop rendert content met `lg:pl-[264px]` (sidebar-breedte).
 * 5. Op mobile (<lg) wordt content geëmbed in MobileStackShell — de
 *    tray-of-three (TopBar + Content + BottomBar) regelt rendering.
 * 6. AppHeader + BottomNav blijven achterwege bij flag aan; Sidebar +
 *    TopBar + MobileBottomBar nemen het over.
 *
 * ── Sidebar-mock-data (Fase 0.2) ─────────────────────────────────────
 * In deze fase krijgt Sidebar mock-props (netWorth=0, actionCount=0)
 * omdat productie-data integratie een aparte taak is (Fase 1.x).
 * userInitials + userName worden afgeleid uit `email`.
 *
 * ── Bekende edge-cases tijdens transitiefase ─────────────────────────
 * - Pagina's met ingebakken back-knoppen (zie docs/shell-agnostische-
 *   content-audit.md) tonen tijdelijk dubbele back-knoppen bij flag aan.
 *   Cleanup in Fase 1.x.
 * - Sidebar krijgt mock-data, geen echte gebruikersmetrieken — Fase 1.x.
 * - ChatPanel + NotificationModal blijven in `(app)/layout.tsx` zelf;
 *   deze wrapper raakt ze niet aan.
 */
'use client'

import { Suspense, createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AppHeader } from '@/components/app/app-header'
import { WelcomeBanner } from '@/components/app/welcome-banner'
import { ChatLayoutWrapper } from '@/components/app/chat/chat-layout-wrapper'
import { BottomNav } from '@/components/app/bottom-nav'
import { DailyExpenseProvider } from '@/components/app/freedom-time-label'
import { Sidebar } from '@/components/app/shell/sidebar'
import { MobileStackShell } from '@/components/app/shell/mobile-stack-shell'
import { NavStackProvider } from '@/components/app/shell/nav-stack-provider'
import { MobileAppStripProvider } from '@/components/app/shell/mobile-app-strip-state'
import { useFeatureFlag } from '@/lib/hooks/use-feature-flag'
import { useIsLgUp } from '@/lib/hooks/use-media-query'
import type { CategoryAppLink } from '@/lib/category-app-nav'

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

export type ResponsiveShellProps = {
  /** Email van de ingelogde user — gebruikt voor AppHeader (oude shell) en initials/name afleiding (nieuwe shell sidebar). */
  email: string
  /** Role van de user (default 'user'). Doorgegeven aan AppHeader voor superadmin-link. */
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

/** De feature-flag die de nieuwe shell activeert. */
const NEW_NAVIGATION_SHELL_FLAG = 'new_navigation_shell'

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
// Zie `app/(app)/beheer/shell-prototype/sidebar-demo.tsx:133-135` — we
// hergebruiken hetzelfde useSyncExternalStore-pattern (i.p.v.
// useState+useEffect) zodat we voldoen aan de React 19 lint-regel
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

// ── Sub-shell renderers ─────────────────────────────────────────────────────

/**
 * Oude shell (flag UIT). EXACT zoals in `app/(app)/layout.tsx` vóór de
 * migratie — geen wijziging. Veiligheidsgarantie: als deze rendering identiek
 * blijft aan de pre-migratie versie, kan de flag risicoloos uit blijven staan.
 */
function LegacyShell({
  email,
  role,
  children,
}: ResponsiveShellProps) {
  return (
    <>
      <ChatLayoutWrapper>
        <AppHeader email={email} role={role} />
        <Suspense fallback={null}>
          <WelcomeBanner />
        </Suspense>
        <DailyExpenseProvider>
          <main id="main-content" tabIndex={-1} className="pb-20 md:pb-0 outline-none">{children}</main>
        </DailyExpenseProvider>
      </ChatLayoutWrapper>
      <BottomNav />
    </>
  )
}

/**
 * Nieuwe shell (flag AAN). Sidebar (desktop, via portal) + MobileStackShell
 * (mobile, geëmbed binnen ChatLayoutWrapper). NavStackProvider wikkelt alles
 * voor per-tab-stack-state.
 *
 * Layout-strategie:
 *  - Sidebar wordt via SidebarPortal naar `document.body` gerenderd. Dit is
 *    nodig omdat ChatLayoutWrapper `contain: layout` gebruikt om een
 *    containing-block te creëren voor fixed-positioned descendants — zonder
 *    portal zou de Sidebar relatief aan ChatLayoutWrapper komen te staan en
 *    meescrollen met de wrapper-content. Door naar document.body te porteren
 *    ontwijken we de containment en blijft `position: fixed` t.o.v. viewport.
 *  - Content blijft binnen ChatLayoutWrapper zodat de chat-functionaliteit
 *    (right-side panel via `--chat-sidebar-width`) onaangeroerd werkt.
 *  - Op desktop (≥lg) krijgt content `lg:pl-[264px]` om ruimte naast de
 *    fixed sidebar te reserveren. Onder lg verbergt Sidebar zichzelf
 *    (`hidden lg:flex`) en valt de padding weg.
 *  - Op mobile (<lg) wikkelt MobileStackShell de content in een tray-of-
 *    three (TopBar + Content + BottomBar), die als één blok schuift bij
 *    push/pop. Tegelijkertijd toont Desktop een directe `<main>` met
 *    sidebar-padding — beide zijn altijd in de DOM, breakpoint-classes
 *    bepalen welke zichtbaar is (geen useMediaQuery, geen flicker).
 */
function NewShell({
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
      </MobileAppStripProvider>
     </CategoryAppLinksContext.Provider>
    </NavStackProvider>
  )
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * ResponsiveShell — rendert oude of nieuwe shell op basis van feature-flag
 * `new_navigation_shell`. Default uit; toggle via
 * `/beheer/shell-prototype` of direct via localStorage:
 *   localStorage.setItem('fintwo:flag:new_navigation_shell', 'true')
 *
 * Vervangt het `<ChatLayoutWrapper>...<BottomNav />`-blok in
 * `app/(app)/layout.tsx`. Alle providers in (app)/layout blijven nesting-
 * gelijk; alleen het binnenste deel verandert. Auth-redirect, onboarding-
 * redirect, phase-transition-detection, sovereignty-level-detection, color
 * vars en font-vars blijven verantwoordelijkheid van (app)/layout.tsx.
 */
export function ResponsiveShell({
  email,
  role,
  sidebarMetrics,
  children,
}: ResponsiveShellProps) {
  const [enabled] = useFeatureFlag(NEW_NAVIGATION_SHELL_FLAG)

  if (enabled) {
    return (
      <NewShell email={email} role={role} sidebarMetrics={sidebarMetrics}>
        {children}
      </NewShell>
    )
  }

  return <LegacyShell email={email} role={role}>{children}</LegacyShell>
}
