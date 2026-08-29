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
 *  - Subpagina-titel ('simple' kind) staat bewust in editorial serif
 *    (`var(--font-serif)`) + module-accentkleur (`var(--module-active-700)`),
 *    op verzoek van de gebruiker als consistentie-fix van de bovenbalk: de
 *    titel hoort visueel bij de actieve module en bij de editorial-toon van
 *    de rest van de app. Rustig gehouden (~16px, één regel, truncate) — geen
 *    EditorialHeadline-emphasis (te zwaar voor 48px-balk + breekt getByText).
 *  - Tab-roots ('rich' kind: Overzicht/Toekomst/Mijn) tonen hun tab-label als
 *    titel (via NavStackMeta op de pagina) NAAST het utility/icoon-cluster
 *    rechts. De `kind === 'simple'` fallback met resolveRouteTitle springt
 *    bewust niet voor 'rich'; de titel komt daar dus van de NavStackMeta-prop.
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
import { resolveRouteTitle } from '@/lib/nav-config'
import { PerspectiveSwitcher } from '@/components/app/perspective-switcher'
import { useNotifications } from '@/components/app/notifications/notification-provider'
import { GlobalSyncButton } from '@/components/sync/global-sync-button'
import { SyncReportModal } from '@/components/sync/sync-report-modal'
import { LeverCompassMobile } from '@/components/app/shell/lever-compass'
import { useLeverScores } from '@/components/app/shell/shell-contexts'
import { TAP_TARGET_EXTEND_BLOCK } from '@/components/editorial/tap-target'

type TopBarProps = {
  /**
   * Optionele actions rechts in de topbar. Default = `<TopBarUtilities>`
   * (News + Bell + Avatar-dropdown). Overrule per pagina
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
 * Utility-cluster rechts in de TopBar — News + Bell + Avatar.
 * Alle utility-affordances op mobile leven hier; de Sidebar levert hetzelfde
 * op desktop.
 *
 * De weergave-schakelaars (euro-weergave, bedragen verbergen) staan hier
 * bewust NIET (B-011): het ⌘K-zoekmenu is de primaire plek om van weergave
 * te wisselen — één manier van switchen. Dit draait bevinding M13 terug op
 * eigenaarsbesluit; niet opnieuw toevoegen zonder nieuw besluit.
 *
 * - Newspaper: shortcut naar `/nieuws` (TriFinity Post).
 * - Bell: opent `NotificationModal` via `useNotifications().openModal`.
 *   Toont badge met `unreadCount` (cap '9+').
 * - Avatar: tap toont dropdown met Identiteit / Rapportages / Sync nu +
 *   Sync-rapport (2-kolom-grid) / Beheer (superadmin) / Uitloggen.
 * - Weergave-badge (`PerspectiveSwitcher`, compact): eerste item in de cluster,
 *   self-gating — alleen zichtbaar voor leden van een huishouden.
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
    /* Raakgebied-compromis (M19): de cluster hield ten tijde van M19 zeven
       controls — te veel voor 44px-brede knoppen op een 360px-scherm. Sinds
       B-011 zijn het er vijf, maar het compromis blijft: 36px BREEDTE, en
       alleen het raakgebied VERTICAAL opgerekt naar 44px — de balk is 48px
       hoog, dus dat kost niets. Horizontaal blijft 36px met vrije ruimte ruim
       boven de WCAG-2.5.8-ondergrens (24px). Vastgelegd in de ui-ux-skill. */
    <div className="flex items-center gap-0.5">
      {/* Weergave-badge (eigen/huishouden/partner) — alleen voor huishoudens. */}
      <PerspectiveSwitcher compact menuAlign="right" />

      {/* Vier-hefbomen-kompas — compact dots, expand on tap */}
      <LeverCompassMobile scores={leverScores} />

      <Link
        href="/nieuws"
        aria-label="Nieuws"
        className={`flex h-9 w-9 items-center justify-center text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-2)] ${TAP_TARGET_EXTEND_BLOCK}`}
      >
        <Newspaper className="h-4 w-4" aria-hidden="true" />
      </Link>

      <button
        type="button"
        onClick={() => {
          setMenuOpen(false)
          openModal()
        }}
        aria-label={unreadCount > 0 ? `Meldingen, ${unreadCount > 9 ? 'meer dan 9' : unreadCount} ongelezen` : 'Meldingen'}
        className={`flex h-9 w-9 items-center justify-center text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-2)] ${TAP_TARGET_EXTEND_BLOCK}`}
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
          className={`flex h-9 w-9 items-center justify-center transition-colors hover:bg-[var(--subtle)] ${TAP_TARGET_EXTEND_BLOCK}`}
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
  const kind = resolveTopBarKind(kindOverride, top?.topBar?.kind, currentStack.length)

  // Titel-resolutie:
  //  - `titleOverride` (outgoing-tray) wint altijd.
  //  - Anders de stack-title (gezet door <NavStackMeta>).
  //  - Lege stack-title op een 'simple'-subpagina → fallback op de nav-config
  //    via de pathname van de stack-`top`-entry (NIET usePathname(), zodat de
  //    outgoing-tray de OUDE entry blijft tonen). Self-healing: pagina's
  //    zonder eigen NavStackMeta krijgen zo alsnog een titel.
  //  - 'rich' (tab-roots) krijgt NOOIT een fallback-titel — die blijven leeg.
  const stackTitle = titleOverride ?? top?.title ?? ''
  const fallbackTitle =
    kind === 'simple' && !stackTitle ? resolveRouteTitle(top?.pathname ?? '') ?? '' : ''
  const title = stackTitle || fallbackTitle

  // 'hidden' — pagina wil full-screen content, geen TopBar. Pagina is dan
  // zelf verantwoordelijk voor terug-navigatie (bv. een eigen ←-knop in de
  // hero-section, zoals bij onboarding-stappen).
  if (kind === 'hidden') return null

  // ←-knop default: 'simple' toont altijd ←, 'rich' nooit. showBackOverride
  // (van outgoing-tray) wint nog steeds — anders schiet de back-knop weg
  // tijdens transitie van sub-page naar tab-root.
  const showBack = showBackOverride ?? (kind === 'simple' && currentStack.length > 1)

  // "Terug naar overzicht" op de secundaire tab-roots (Toekomst/Mijn). Die
  // tonen normaliter géén ←-knop ('rich' kind), maar de gebruiker wil van
  // daaruit altijd één tik terug naar het Overzicht — de "home" tab-root.
  // Kern (Overzicht zelf) krijgt 'm niet; sub-pages houden hun eigen pop-←.
  // Tab-bepaald (niet pad-exact) zodat de knop op de outgoing rich-tray
  // tijdens een within-tab transitie blijft staan i.p.v. weg te flikkeren.
  const showHomeBack =
    !showBack && kind === 'rich' && (activeTab === 'horizon' || activeTab === 'identity')

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
  //  - 'rich' kind: utility-cluster (News + Bell + Avatar)
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
        ) : showHomeBack ? (
          <Link
            href="/overzicht"
            aria-label="Terug naar overzicht"
            className="touch-target text-[var(--ink-2)] hover:bg-[var(--subtle)] tap-highlight"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        ) : (
          <span aria-hidden className="block h-11 w-11" />
        )}

        {/* Midden — titel. Bewust een <p>, GÉÉN <h1> (ADR 0110): deze balk is
            `lg:hidden` (= display:none, dus weg uit de a11y-tree op desktop),
            rendert niet bij `kind: 'hidden'`, en blijft op tab-roots ('rich')
            leeg — een kop die op drie assen kan wegvallen kan de enige h1 niet
            zijn. De echte <h1> is de sr-only paginanaam in MobileStackShell;
            die draagt nu ook de `aria-live`. Dit label is puur zichtbaar en
            daarom `aria-hidden` — anders leest een schermlezer de naam twee
            keer. Editorial serif + module-
            accentkleur (op module-tabs) zodat de titel visueel bij de actieve
            module + de editorial-toon hoort; truncate op één regel. Op niet-
            module-routes valt de kleur terug op `var(--ink)`.
            Bewust `--module-active-900` (niet -700): de horizon-accent is een
            licht warm goud waarvan -700 op `var(--paper)` onder WCAG AA (4.5:1)
            zakt bij 16px tekst; -900 blijft in de accent-familie maar haalt het
            contrast. Expliciete fontWeight 400 voorkomt UA-bold op de serif-
            fallback. (Kleur via inline-style, dus geen `text-*`-class hier.) */}
        <p
          aria-hidden="true"
          className="text-center text-base truncate min-w-0 leading-tight"
          style={{
            fontFamily: 'var(--font-serif, Georgia, serif)',
            fontWeight: 400,
            color: isModuleTab ? 'var(--module-active-900)' : 'var(--ink)',
          }}
        >
          {title}
        </p>

        {/* Rechts — utility-cluster ('rich' kind) of pagina-specifieke actions. */}
        <div className="flex items-center justify-end gap-1">{renderedActions}</div>
      </div>
    </header>
  )
}
