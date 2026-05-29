'use client'

/**
 * SANDBOX / Fase 0 v3 — onderdeel van new-navigation-shell migratie.
 * Plan: docs/navigatie-redesign-plan.md §4.3
 * Achter feature-flag in productie. Voor nu: alleen sandbox-test.
 *
 * TopBar binnen de tray-of-three (plan §4.1). NIET sticky t.o.v. viewport
 * meer — wordt door MobileStackShell als eerste flex-row in de tray-column
 * geplaatst. Bij scroll van pagina-content blijft TopBar zichtbaar binnen
 * zijn tray (overflow-y-auto op de content); bij stack-transitie schuift hij
 * mee als onderdeel van de tray.
 *
 * Bewuste keuzes:
 *  - GEEN Playfair voor titel — Inter 14px medium is rustiger en beter
 *    leesbaar op smal scherm dan Playfair 16px (UI/UX skill validatie).
 *  - Module-aware via `--module-active-500` als 1px onderlijn op active-module
 *    routes. Op `/identity`, `/berichten`, etc. valt deze terug op
 *    `var(--border-ed)`.
 *  - 44×44px touch-targets voor ←-knop en actions (a11y minimum).
 *  - `safe-area-inset-top` padding voor iOS-notch.
 *  - Optionele `title` + `showBackOverride` props voor de outgoing-tray:
 *    daar wil MobileStackShell de OUDE entry tonen, niet de nieuwe
 *    top-entry van de stack.
 *  - aria-live='polite' op titel zodat screen-readers titel-wissel rustig
 *    aankondigen tijdens stack-push/pop (plan §4.2).
 *
 * ── Default utility-cluster (vervangt drawer-hamburger uit plan §4.7) ─
 * Plan §4.7 oorspronkelijk: hamburger opent left-side drawer met overige
 * routes + profile. Aanpassing: utility-cluster (privacy / news / bell /
 * profile) zit direct in TopBar, "overige" routes blijven via bottom-nav-
 * tab `other` bereikbaar. Dit is Bitvavo-conformer en spaart een drawer-
 * implementatie. Pagina's kunnen via `actions` prop de cluster overrulen.
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Activity, ArrowLeft, Bell, Newspaper } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavStack, type TopBarKind } from './nav-stack-provider'
import { PrivacyToggle } from '@/components/app/privacy-toggle'
import { useNotifications } from '@/components/app/notifications/notification-provider'
import { GlobalSyncButton } from '@/components/sync/global-sync-button'
import { SyncReportModal } from '@/components/sync/sync-report-modal'
import { LeverCompassMobile } from '@/components/app/shell/lever-compass'
import { useLeverScores } from '@/components/app/shell/responsive-shell'

type TopBarProps = {
  /**
   * Optionele actions rechts in de topbar. Default = `<TopBarUtilities>`
   * (PrivacyToggle + News + Bell + Avatar-dropdown). Overrule per pagina
   * voor context-specifieke knoppen — verlies dan wel de utility-cluster.
   */
  actions?: ReactNode
  /**
   * Override de breakpoint-zichtbaarheid: rendert TopBar ook ≥lg. Bedoeld
   * voor sandbox/preview-frames. Default = false.
   */
  forceVisible?: boolean
  /**
   * Optionele titel-override. Default = top-entry uit de huidige stack.
   * Wordt gebruikt door de outgoing-tray van MobileStackShell om de OUDE
   * entry-titel te tonen tijdens een stack-transitie (anders zou de TopBar
   * van outgoing al de nieuwe titel tonen — visueel verkeerd).
   */
  title?: string
  /**
   * Optionele override van de back-knop-zichtbaarheid. Default = afgeleid
   * uit `currentStack.length > 1`. Wordt gebruikt door de outgoing-tray om
   * de back-knop te tonen alsof we nog op de oude diepte zaten.
   */
  showBackOverride?: boolean
  /**
   * Optionele override van de TopBar-kind. Default = `top-entry.topBar.kind`
   * uit de active stack, met fallback `'rich'` op tab-roots (stack-diepte 1)
   * en `'simple'` daarbuiten. Outgoing-tray gebruikt deze override om de
   * OUDE entry's kind te tonen tijdens een transitie — anders zou de
   * outgoing direct de nieuwe kind aannemen en visueel "te vroeg" wisselen.
   */
  kindOverride?: TopBarKind
  /**
   * Email van de ingelogde user — gebruikt voor avatar-initial en account-
   * dropdown-header. Komt uit ResponsiveShell → MobileStackShell. Optioneel
   * zodat sandbox-renders zonder user-context geen utility-cluster tonen.
   */
  email?: string
  /**
   * Role van de user (default 'user'). Bepaalt of de superadmin Beheer-link
   * in het account-dropdown verschijnt.
   */
  role?: string
}

/**
 * Utility-cluster rechts in de TopBar — PrivacyToggle + News + Bell + Avatar.
 * Alle utility-affordances op mobile leven hier; de Sidebar levert hetzelfde
 * op desktop.
 *
 * - PrivacyToggle: maskeer bedragen across de app (eye-icoon, context-driven).
 * - Newspaper: shortcut naar `/nieuws` (TriFinity Post).
 * - Bell: opent `NotificationModal` via `useNotifications().openModal`.
 *   Toont badge met `unreadCount` (cap '9+').
 * - Avatar: tap toont dropdown met Identiteit / Rapportages / Sync nu +
 *   Sync-rapport (2-kolom-grid) / Beheer (superadmin) / Uitloggen. Geen
 *   perspective-switcher (leeft in `/identity/profiel`) — houdt cluster compact.
 */
function TopBarUtilities({ email, role }: { email: string; role?: string }) {
  const { unreadCount, openModal } = useNotifications()
  const leverScores = useLeverScores()
  const [menuOpen, setMenuOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [menuOpen])

  return (
    <div className="flex items-center gap-0.5">
      {/* Vier-hefbomen-kompas — compact dots, expand on tap */}
      <LeverCompassMobile scores={leverScores} />

      <PrivacyToggle />

      <Link
        href="/nieuws"
        aria-label="Nieuws"
        className="flex h-9 w-9 items-center justify-center text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-2)]"
      >
        <Newspaper className="h-4 w-4" aria-hidden="true" />
      </Link>

      <button
        type="button"
        onClick={() => {
          setMenuOpen(false)
          openModal()
        }}
        aria-label="Meldingen"
        className="relative flex h-9 w-9 items-center justify-center text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-2)]"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Account"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="flex h-9 w-9 items-center justify-center transition-colors hover:bg-[var(--subtle)]"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--ink)] text-[10px] font-medium text-[var(--paper)]">
            {email[0]?.toUpperCase() ?? '?'}
          </span>
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-full mt-1 w-56 border border-[var(--border-ed)] bg-[var(--paper)] py-1 shadow-[var(--s2)] z-50"
          >
            <div className="px-4 py-3 border-b border-[var(--border-ed)]">
              <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)] mb-1">
                Ingelogd als
              </div>
              <div className="text-sm font-medium text-[var(--ink)] truncate">{email}</div>
            </div>
            {role === 'superadmin' && (
              <Link
                href="/beheer"
                role="menuitem"
                className="block px-4 py-2 text-sm font-medium text-[var(--module-active-700)] hover:bg-[var(--subtle)]"
                onClick={() => setMenuOpen(false)}
              >
                Beheer
              </Link>
            )}
            <Link
              href="/mijn"
              role="menuitem"
              className="block px-4 py-2 text-sm text-[var(--ink-2)] hover:bg-[var(--subtle)]"
              onClick={() => setMenuOpen(false)}
            >
              Identiteit
            </Link>
            <Link
              href="/rapportages"
              role="menuitem"
              className="block px-4 py-2 text-sm text-[var(--ink-2)] hover:bg-[var(--subtle)]"
              onClick={() => setMenuOpen(false)}
            >
              Rapportages
            </Link>

            {/* Sync nu + Sync-rapport, side-by-side. GlobalSyncButton triggert globale
                sync; "Rapport" opent SyncReportModal voor het laatste verslag. */}
            <div className="grid grid-cols-2 border-y border-[var(--border-ed)]">
              <div className="flex flex-col items-center justify-center gap-1 py-2 hover:bg-[var(--subtle)]">
                <GlobalSyncButton
                  onOpenReport={() => {
                    setMenuOpen(false)
                    setReportOpen(true)
                  }}
                />
                <span className="text-[10px] uppercase tracking-[0.06em] text-[var(--ink-3)]">
                  Sync nu
                </span>
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false)
                  setReportOpen(true)
                }}
                className="flex flex-col items-center justify-center gap-1 border-l border-[var(--border-ed)] py-2 text-[var(--ink-3)] hover:bg-[var(--subtle)]"
              >
                <span className="flex h-7 w-7 items-center justify-center">
                  <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <span className="text-[10px] uppercase tracking-[0.06em]">
                  Rapport
                </span>
              </button>
            </div>

            <Link
              href="/logout"
              role="menuitem"
              className="block px-4 py-2 text-sm text-[var(--ink-2)] hover:bg-[var(--subtle)]"
              onClick={() => setMenuOpen(false)}
            >
              Uitloggen
            </Link>
          </div>
        )}
      </div>

      {/* Sync-rapport-modal — gerenderd buiten dropdown zodat sluiten van
          dropdown niet de modal mee-sluit. */}
      <SyncReportModal open={reportOpen} onClose={() => setReportOpen(false)} />
    </div>
  )
}

/**
 * Resolve de TopBar-kind voor de huidige render.
 *  1. Expliciete override (van outgoing-tray) wint altijd.
 *  2. Anders: top-entry's eigen `topBar.kind` (gezet door pathname-watcher
 *     of `<NavStackMeta>`).
 *  3. Fallback: `'rich'` op tab-root (stack-diepte 1), `'simple'` daarbuiten.
 *     Dekt de eerste-render-vóór-meta en sandbox-renders met lege stack.
 */
function resolveTopBarKind(
  override: TopBarKind | undefined,
  topEntryKind: TopBarKind | undefined,
  stackDepth: number,
): TopBarKind {
  if (override) return override
  if (topEntryKind) return topEntryKind
  return stackDepth <= 1 ? 'rich' : 'simple'
}

export function TopBar({
  actions,
  forceVisible = false,
  title: titleOverride,
  showBackOverride,
  kindOverride,
  email,
  role,
}: TopBarProps) {
  const { activeTab, currentStack, pop } = useNavStack()

  const top = currentStack[currentStack.length - 1]
  const title = titleOverride ?? top?.title ?? ''
  const kind = resolveTopBarKind(kindOverride, top?.topBar?.kind, currentStack.length)

  // 'hidden' — pagina wil full-screen content, geen TopBar. Pagina is dan
  // zelf verantwoordelijk voor terug-navigatie (bv. een eigen ←-knop in de
  // hero-section, zoals bij onboarding-stappen).
  if (kind === 'hidden') return null

  // ←-knop default: 'simple' toont altijd ←, 'rich' nooit. showBackOverride
  // (van outgoing-tray) wint nog steeds — anders schiet de back-knop weg
  // tijdens transitie van sub-page naar tab-root.
  const showBack = showBackOverride ?? (kind === 'simple' && currentStack.length > 1)

  // Module-aware onderlijn: hoofdmodules krijgen `--module-active-500`-streep,
  // andere tabs (identity, other) → defaultkleur.
  const isModuleTab = activeTab === 'kern' || activeTab === 'wil' || activeTab === 'horizon'
  const borderColorVar = isModuleTab ? 'var(--module-active-500)' : 'var(--border-ed)'

  // BELANGRIJK: NIET meer `sticky top-0`. TopBar zit binnen de tray-flex-
  // column van MobileStackShell — als hij sticky was zou hij over de
  // tray-grenzen heen plakken bij scroll. Visibility-gating via lg:hidden
  // (of forceVisible voor sandbox).
  const visibilityClass = forceVisible ? '' : 'lg:hidden'

  // Actions-resolutie:
  //  - Pagina-specifieke actions (via prop) winnen altijd — vervangen de
  //    cluster volledig.
  //  - 'rich' kind: utility-cluster (PrivacyToggle + News + Bell + Avatar)
  //    wanneer email beschikbaar is.
  //  - 'simple' kind: geen actions (compact 48px voor sub-pages).
  const renderedActions =
    actions ?? (kind === 'rich' && email ? <TopBarUtilities email={email} role={role} /> : null)

  return (
    <header
      className={`${visibilityClass} bg-[var(--paper)] shrink-0`}
      style={{
        // Safe-area padding voor iOS-notch / Dynamic Island.
        paddingTop: 'env(safe-area-inset-top, 0px)',
        // 1px onderlijn — module-aware. Inline-style omdat var-driven kleur
        // in Tailwind v4 een arbitrary-value zou zijn die slechter leest.
        borderBottom: `1px solid ${borderColorVar}`,
      }}
    >
      {/* Inner-row vaste hoogte 48px volgens spec.
          Lay-out: [back of placeholder] [title (truncate)] [actions]
          Grid met 1fr in midden zodat titel altijd gecentreerd lijkt.
          shrink-0 op flanken voorkomt dat een lange titel de knoppen knijpt. */}
      <div className="grid grid-cols-[44px_1fr_auto] items-center gap-2 px-2 h-12">
        {/* Links — back of lege placeholder van 44px om titel symmetrisch te houden. */}
        {showBack ? (
          <button
            type="button"
            onClick={pop}
            aria-label="Terug"
            className="touch-target text-[var(--ink-2)] hover:bg-[var(--subtle)] tap-highlight"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : (
          <span aria-hidden className="block h-11 w-11" />
        )}

        {/* Midden — titel. aria-live='polite' voor smooth voorlees-update bij
            stack-transities (plan §4.2 a11y). Inter 14px medium voor
            leesbaarheid op smal scherm; truncate op één regel. */}
        <h1
          aria-live="polite"
          className="text-center text-sm font-medium text-[var(--ink)] truncate min-w-0 leading-none"
          style={{ fontFamily: 'var(--font-inter, system-ui, sans-serif)' }}
        >
          {title}
        </h1>

        {/* Rechts — utility-cluster ('rich' kind) of pagina-specifieke actions. */}
        <div className="flex items-center justify-end gap-1">{renderedActions}</div>
      </div>
    </header>
  )
}
