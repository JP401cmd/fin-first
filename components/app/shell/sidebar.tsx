/**
 * SANDBOX / Fase 0 — onderdeel van new-navigation-shell migratie.
 * Plan: docs/navigatie-redesign-plan.md §3
 * Achter feature-flag in productie. Voor nu: alleen sandbox-test.
 *
 * Productie-versie van prototype variant A (editorial-zwaar). Verschillen
 * t.o.v. prototype:
 *  - Geen `variant`-prop (alleen variant A is productie).
 *  - Collapsed-state via `useSidebarCollapsed` (localStorage).
 *  - Active-module via `usePathname()` ipv hardcoded `kern`.
 *  - Module-fallback via `useModuleAccess`: gedimde rij + tooltip-CTA.
 *  - Sub-tag-strip toont alleen *categorieën* (Bezittingen/Schulden,
 *    Wat-Als/Strategieën) — geen apps, conform plan §3.3.
 *  - Echte routes (Link) ipv mock-buttons.
 *  - Echte data via props (netto-vermogen, acties, badge).
 */
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  Wallet,
  Zap,
  Compass,
  Inbox,
  Newspaper,
  BarChart3,
  Search,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Lock,
  Activity,
  type LucideIcon,
} from 'lucide-react'
import { useModuleAccess } from '@/components/app/feature-access-provider'
import {
  getActiveNavModules,
  type NavModule,
} from '@/lib/module-registry'
import { useSidebarCollapsed } from '@/lib/hooks/use-sidebar-collapsed'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { formatNetWorthShort } from '@/lib/net-worth-format'
import { usePerspective } from '@/components/app/perspective-provider'
import { PerspectiveSwitcher } from '@/components/app/perspective-switcher'
import { LeverCompassCollapsed, type LeverScores, type LeverStatus } from '@/components/app/shell/lever-compass'
import { GlobalSyncButton } from '@/components/sync/global-sync-button'
import { SyncReportModal } from '@/components/sync/sync-report-modal'
import { useCommandPalette } from '@/components/command-palette/command-palette-provider'

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'
const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

// ── Public API ───────────────────────────────────────────────────────────────

export type SidebarProps = {
  /** Netto vermogen in EUR — getoond rechts van "Overzicht". */
  netWorth: number
  /** Aantal openstaande acties — getoond als "· {n} acties" rechts van "Overzicht". */
  actionCount: number
  /** Aantal ongelezen berichten in Inbox-rij. */
  unreadMessageCount?: number
  /** 1-2 letter avatar-initialen, uppercase. */
  userInitials: string
  /** Volledige naam in profiel-pill. */
  userName: string
  /** Role van de user — bij `'superadmin'` verschijnt extra Beheer-link in footer. */
  role?: string
  /**
   * App-slugs die actief zijn op basis van tracking-flags op assets/debts —
   * de bron van waarheid is `getActiveAppKeys()` uit
   * `components/core/category-deepening-registry.ts`. Een app uit `MODULES.apps`
   * verschijnt alleen wanneer haar `appKey` in deze lijst staat.
   */
  activeAppKeys?: string[]
  /** Vier-hefbomen-kompas scores. Optioneel; valt terug op neutrale status. */
  leverScores?: LeverScores
}

// ── Module-config ────────────────────────────────────────────────────────────

type ModuleEntry = {
  /** Drives module-active CSS-vars on the row. */
  key: NavModule
  /** Plain prefix that comes before the italicEm word. */
  prefix: string
  /** Italic emphasis word (Playfair italic-em). */
  italicEm: string
  /** Combined plain label, used in aria-label / tooltip. */
  label: string
  /** Hoofd-route voor de module. */
  href: string
  Icon: LucideIcon
  /** Inline tag-strip met categorie-routes — alleen op active module. */
  subTags: SubTag[]
  /**
   * Optionele tag-strip met *apps* (verdiepingen) van de module. Alleen
   * gerenderd voor apps wiens `appKey` voorkomt in `activeAppKeys` — d.w.z.
   * minstens één gekoppeld asset/debt heeft de tracking-vlag aan staan.
   * Apps zijn de category-deepening-entries uit
   * `components/core/category-deepening-registry.ts` (Budgetteren, Holdings,
   * Hypotheekplanner, Verhuurrendement).
   */
  apps?: AppTag[]
}

type AppTag = {
  label: string
  href: string
  /**
   * App-slug — moet matchen met de slug uit `getDeepeningSlug()` op de
   * bijbehorende registry-entry. Een app verschijnt alleen wanneer deze slug
   * in `activeAppKeys` staat (= ≥1 asset/debt heeft de tracking-vlag aan).
   */
  appKey: string
}

type SubTag = {
  label: string
  href: string
  /**
   * Optionele kompas-key — wanneer aanwezig, toont SubTagStrip een gekleurde
   * status-dot naast de tag-label (uit `leverScores[key]`). Dit voegt de
   * kompas-functionaliteit samen met de sub-route navigatie zodat er geen
   * dubbele rij ontstaat (gebruiker-feedback mei 2026).
   */
  leverKey?: keyof LeverScores
  /**
   * Optionele geneste subroutes — verschijnen ingesprongen ónder deze tag,
   * maar alléén wanneer de gebruiker op deze tag (of een van zijn kinderen)
   * staat. Houdt de sidebar rustig: het derde niveau is contextueel. Gebruikt
   * voor de Box 1/2/3-pagina's onder Belasting.
   */
  children?: SubTag[]
}

// Conform plan §3.3: tag-strip toont *categorieën* (eerste rij). Daaronder
// optioneel een *apps*-strip met de verdiepende functionaliteit per module —
// alleen apps die geactiveerd zijn door minstens één gekoppeld asset/debt
// (zie `getActiveAppKeys()` in category-deepening-registry.ts). Apps
// deeplinken naar hun categorie-pagina met de juiste `?tab=`-state.
const MODULES: ModuleEntry[] = [
  {
    key: 'kern',
    prefix: 'Het ',
    italicEm: 'Overzicht',
    label: 'Het Overzicht',
    href: '/overzicht',
    Icon: Wallet,
    subTags: [
      // De vier hefbomen — sub-routes onder "Het Overzicht" mét kompas-
      // status-indicators. Vervangt de aparte LeverCompassExpanded-mount
      // (user-feedback mei 2026: "kompas staat los van overzicht, voeg ze
      // samen zodat er geen duplicatie is").
      { label: 'Bezittingen', href: '/overzicht/bezittingen', leverKey: 'assets' },
      { label: 'Schulden', href: '/overzicht/schulden', leverKey: 'debts' },
      {
        label: 'Cashflow',
        href: '/overzicht/cashflow',
        leverKey: 'cashflow',
        // Cashflow-onderdelen — derde niveau, alleen zichtbaar op een
        // cashflow-route (zie SubTagStrip). Bron: app/(app)/overzicht/
        // cashflow/{budget,transacties,vaste-lasten,forecast}/page.tsx.
        children: [
          { label: 'Budget', href: '/overzicht/cashflow/budget' },
          { label: 'Transacties', href: '/overzicht/cashflow/transacties' },
          { label: 'Vaste lasten', href: '/overzicht/cashflow/vaste-lasten' },
          { label: 'Forecast', href: '/overzicht/cashflow/forecast' },
        ],
      },
      {
        label: 'Belasting',
        href: '/overzicht/belasting',
        leverKey: 'tax',
        // Box-subpagina's — derde niveau, alleen zichtbaar op een
        // belasting-route (zie SubTagStrip). Bron: app/(app)/overzicht/
        // belasting/box{1,2,3}/page.tsx.
        children: [
          { label: 'Box 1 · Werk + woning', href: '/overzicht/belasting/box1' },
          { label: 'Box 2 · Aanmerkelijk belang', href: '/overzicht/belasting/box2' },
          { label: 'Box 3 · Sparen + beleggen', href: '/overzicht/belasting/box3' },
        ],
      },
    ],
    apps: [
      // Bron: components/core/category-deepening-registry.ts. `appKey` matcht
      // de slug uit `getDeepeningSlug()` zodat de Sidebar kan filteren op
      // welke apps daadwerkelijk een gekoppeld asset/debt hebben.
      { label: 'Budgetteren',       href: '/overzicht/cashflow/budget',                      appKey: 'budgetteren' },
      { label: 'Aandelen holdings', href: '/overzicht/bezittingen/investment?tab=aandelen-holdings', appKey: 'aandelen-holdings' },
      { label: 'Crypto holdings',   href: '/overzicht/bezittingen/crypto?tab=crypto-holdings',       appKey: 'crypto-holdings' },
      { label: 'Hypotheekplanner',  href: '/overzicht/schulden/mortgage?tab=hypotheekplanner',       appKey: 'hypotheekplanner' },
      { label: 'Verhuurrendement',  href: '/overzicht/bezittingen/real_estate?tab=verhuurrendement', appKey: 'verhuurrendement' },
    ],
  },
  // 'wil'-entry is verwijderd: Will-coach is een persona overal, geen
  // route. WillLanding-content (briefing + acties + widget-dashboard)
  // leeft nu op /overzicht (= 'kern' entry hierboven). Floating
  // nav-button toont "Vraag Will" als globaal item in NavMenuSheet.
  {
    key: 'horizon',
    prefix: 'De ',
    italicEm: 'Toekomst',
    label: 'De Toekomst',
    href: '/toekomst',
    Icon: Compass,
    subTags: [
      // Toekomst-subnavigatie: Tijdas (/toekomst) is de landing met
      // navigatiekaarten; de overige items hebben elk een eigen subroute.
      { label: 'Tijdas', href: '/toekomst' },
      { label: 'Doelen', href: '/toekomst/doelen' },
      { label: 'Gebeurtenissen', href: '/toekomst/gebeurtenissen' },
      { label: 'Voorkeuren', href: '/toekomst/voorkeuren' },
      { label: 'Rekenhulp', href: '/toekomst/rekenhulp' },
      { label: 'Wat-Als', href: '/toekomst/whatif' },
    ],
  },
]

type OverigeEntry = {
  label: string
  Icon: LucideIcon
  href: string
}

const OVERIGE_BASE: OverigeEntry[] = [
  // Tips & acties — de Will-stroom (briefing-vervolg) als vaste ingang.
  // Zap = de actie-helft van "tips & acties" (zie guide-naslagwerk).
  { label: 'Tips & acties', Icon: Zap, href: '/overzicht/tips' },
  { label: 'Berichten', Icon: Inbox, href: '/berichten' },
  { label: 'Nieuws', Icon: Newspaper, href: '/nieuws' },
  { label: 'Rapportages', Icon: BarChart3, href: '/rapportages' },
]

type FooterLink = {
  label: string
  href: string
}

const FOOTER_LINKS: FooterLink[] = [
  { label: 'Mijn', href: '/mijn' },
  { label: 'Uitloggen', href: '/logout' },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map een module-key naar inline CSS-vars zodat children `var(--module-active-*)`
 * kunnen referencen — zelfde patroon als de module-layouts (`app/(app)/{module}/layout.tsx`).
 */
function moduleVars(module: NavModule): React.CSSProperties {
  const shades = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']
  return Object.fromEntries(
    shades.map((s) => [`--module-active-${s}`, `var(--color-${module}-${s})`]),
  ) as React.CSSProperties
}

/**
 * Bepaal welke module actief is op basis van pathname. Match op startsWith
 * — sub-routes zoals `/overzicht/bezittingen` blijven onder Overzicht actief.
 *
 * Match op zowel nieuwe canonieke routes (/overzicht /toekomst /mijn) als
 * oude paden (/core /horizon /identity /will) zodat de sidebar de juiste
 * module markeert ook tijdens redirect-cyclus.
 */
function detectActiveModule(pathname: string): NavModule | null {
  if (pathname.startsWith('/overzicht') || pathname.startsWith('/core')) return 'kern'
  if (pathname.startsWith('/toekomst') || pathname.startsWith('/horizon')) return 'horizon'
  // /will redirecteert naar /overzicht — als gebruiker pre-redirect /will ziet
  // markeren we ook 'kern' (= de tab waar WillLanding nu leeft)
  if (pathname.startsWith('/will')) return 'kern'
  return null
}

// ── Main component ───────────────────────────────────────────────────────────

const DEFAULT_LEVER_SCORES: LeverScores = {
  assets: { score: null, status: 'neutral', detail: 'Geen data' },
  debts: { score: null, status: 'neutral', detail: 'Geen data' },
  cashflow: { score: null, status: 'neutral', detail: 'Geen data' },
  tax: { score: null, status: 'neutral', detail: 'Geen data' },
}

export function Sidebar({
  netWorth,
  actionCount,
  unreadMessageCount = 0,
  userInitials,
  userName,
  role,
  activeAppKeys = [],
  leverScores = DEFAULT_LEVER_SCORES,
}: SidebarProps) {
  const pathname = usePathname() ?? '/'
  const [collapsed, setCollapsed] = useSidebarCollapsed()
  const { activeModules } = useModuleAccess()

  const activeModule = detectActiveModule(pathname)

  // Module-fallback: welke nav-modules ten minste één actief module hebben.
  // We gebruiken de echte bron-of-truth (`getActiveNavModules`) i.p.v. zelf
  // moduleId's matchen — zo blijft de fallback synchroon met de mobile tabs en
  // widget-gating. App-zichtbaarheid in de strip wordt afzonderlijk
  // gefilterd op `activeAppKeys` (zie ModuleRow).
  const activeNavModules = getActiveNavModules(activeModules)

  // Width drives both sidebar shell and `<main>`-offset in DesktopSidebarShell
  // via data-collapsed. Hier alleen layout van sidebar zelf.
  const widthClass = collapsed ? 'w-[64px]' : 'w-[264px]'

  return (
    <aside
      id="app-sidebar"
      data-collapsed={collapsed ? 'true' : 'false'}
      aria-label="Hoofdnavigatie"
      className={`hidden lg:flex flex-col fixed left-0 top-0 bottom-0 z-30 ${widthClass} bg-[var(--paper)] border-r border-[var(--border-ed)] overflow-y-auto`}
      style={{ height: '100dvh' }}
    >
      <BrandingRow
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
      />

      <SidebarPerspectiveBadge collapsed={collapsed} />

      <ModulesSection
        collapsed={collapsed}
        activeModule={activeModule}
        activeNavModules={activeNavModules}
        activeAppKeys={activeAppKeys}
        netWorth={netWorth}
        actionCount={actionCount}
        leverScores={leverScores}
      />

      <div className="border-t border-[var(--border-ed)]" aria-hidden />

      <OverigeSection
        collapsed={collapsed}
        unreadMessageCount={unreadMessageCount}
      />

      {/* Kompas-sectie verplaatst onder Het Overzicht (zie ModulesSection).
          User-feedback (mei 2026): "kompas staat los van overzicht, neem hem
          op onder overzicht knop". Kompas-status leeft nu naast de module-
          row waar hij bij hoort. Voor collapsed-state behouden we onderaan
          een compacte indicator zodat de kleuren ook in collapse zichtbaar
          zijn. */}
      {collapsed && <LeverCompassCollapsed scores={leverScores} />}

      <div className="flex-1" aria-hidden />

      <FooterSection
        collapsed={collapsed}
        userInitials={userInitials}
        userName={userName}
        role={role}
      />
    </aside>
  )
}

// ─────────────────────────────────────────────────────────────────
// Branding-rij
// ─────────────────────────────────────────────────────────────────

function BrandingRow({
  collapsed,
  onToggle,
}: {
  collapsed: boolean
  onToggle: () => void
}) {
  // `tf.` mark in Playfair, kern-accent op de punt — canonieke brand-glyph.
  // Collapsed: alleen "t." getoond.
  const mark = (
    <span
      className="font-black italic tracking-[-0.02em] leading-none"
      style={{
        fontFamily: PLAYFAIR,
        fontSize: collapsed ? 22 : 26,
        color: 'var(--ink)',
      }}
    >
      {collapsed ? 't' : 'tf'}
      <span style={{ color: 'var(--color-kern-500)' }}>.</span>
    </span>
  )

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1 py-3 border-b border-[var(--border-ed)]">
        {mark}
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={true}
          aria-label="Sidebar uitklappen"
          aria-controls="app-sidebar"
          title="Sidebar uitklappen"
          className="flex items-center justify-center w-8 h-8 text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-[var(--subtle)]/50 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[var(--ink)]"
        >
          <ChevronsRight className="w-3.5 h-3.5" aria-hidden />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-2 px-4 py-4 border-b border-[var(--border-ed)]">
      <div className="flex items-center gap-2">
        {mark}
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={false}
          aria-label="Sidebar inklappen"
          aria-controls="app-sidebar"
          title="Sidebar inklappen"
          className="flex items-center justify-center w-8 h-8 text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-[var(--subtle)]/50 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[var(--ink)]"
        >
          <ChevronsLeft className="w-3.5 h-3.5" aria-hidden />
        </button>
      </div>
      <SearchTrigger />
    </div>
  )
}

function SearchTrigger() {
  const { open } = useCommandPalette()
  return (
    <button
      type="button"
      onClick={open}
      className="inline-flex items-center gap-1.5 px-2 h-8 border border-[var(--border-ed)] text-[var(--ink-3)] hover:bg-[var(--subtle)]/50 hover:text-[var(--ink-2)] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[var(--ink)]"
      aria-label="Zoeken in TriFinity"
      title="Zoeken (⌘K)"
    >
      <Search className="w-3.5 h-3.5" aria-hidden />
      <span className="font-mono text-[10px] uppercase tracking-[0.15em]">⌘K</span>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────
// Weergave-badge (perspectief: eigen / huishouden / partner)
// ─────────────────────────────────────────────────────────────────

/**
 * Toont de weergave-badge bovenaan de sidebar — alleen voor leden van een
 * huishouden (self-gating via PerspectiveSwitcher + isHousehold). Expanded:
 * kicker "Weergave" + pill. Collapsed: alleen de icoon-pill (gecentreerd).
 */
function SidebarPerspectiveBadge({ collapsed }: { collapsed: boolean }) {
  const { isHousehold, loading } = usePerspective()
  if (loading || !isHousehold) return null

  if (collapsed) {
    return (
      <div className="flex justify-center py-2 border-b border-[var(--border-ed)]">
        <PerspectiveSwitcher compact menuAlign="left" />
      </div>
    )
  }

  return (
    <div className="px-4 py-3 border-b border-[var(--border-ed)]">
      <div className="flex items-center gap-2.5 mb-1.5">
        <span
          aria-hidden
          className="inline-block w-7 h-px"
          style={{ background: 'var(--color-horizon-500)' }}
        />
        <span className="text-[10px] font-mono uppercase tracking-[0.20em] text-[var(--ink-2)]">
          Weergave
        </span>
      </div>
      <PerspectiveSwitcher menuAlign="left" />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Modules-sectie (PRIMAIR)
// ─────────────────────────────────────────────────────────────────

function ModulesSection({
  collapsed,
  activeModule,
  activeNavModules,
  activeAppKeys,
  netWorth,
  actionCount,
  leverScores,
}: {
  collapsed: boolean
  activeModule: NavModule | null
  activeNavModules: NavModule[]
  activeAppKeys: string[]
  netWorth: number
  actionCount: number
  leverScores: LeverScores
}) {
  // Netto vermogen is een saldo → honoreert de privacy-toggle (Bedragen
  // verbergen). Bij masked toont formatNetWorthShort de bullet-placeholder.
  const { masked } = useMaskedAmounts()
  const metrics: Record<NavModule, string> = {
    kern: formatNetWorthShort(netWorth, masked),
    wil: actionCount > 0 ? `· ${actionCount}` : '·',
    horizon: '·',
  }

  return (
    <div className="flex flex-col gap-1 px-2 py-3">
      {!collapsed && <ModulesSectionLabel />}
      <div className="flex flex-col gap-0.5">
        {MODULES.map((mod) => (
          <ModuleRow
            key={mod.key}
            module={mod}
            collapsed={collapsed}
            isActive={mod.key === activeModule}
            isEnabled={activeNavModules.includes(mod.key)}
            metric={metrics[mod.key]}
            activeAppKeys={activeAppKeys}
            leverScores={leverScores}
          />
        ))}
      </div>
    </div>
  )
}

function ModulesSectionLabel() {
  return (
    <div className="flex items-center gap-2.5 px-2 mb-2">
      <span
        aria-hidden
        className="inline-block w-7 h-px"
        style={{ background: 'var(--color-horizon-500)' }}
      />
      <span className="text-[10px] font-mono uppercase tracking-[0.20em] text-[var(--ink-2)]">
        Twee modules
      </span>
    </div>
  )
}

function ModuleRow({
  module,
  collapsed,
  isActive,
  isEnabled,
  metric,
  activeAppKeys,
  leverScores,
}: {
  module: ModuleEntry
  collapsed: boolean
  isActive: boolean
  isEnabled: boolean
  metric: string
  activeAppKeys: string[]
  leverScores: LeverScores
}) {
  const Icon = module.Icon
  const styleVars = moduleVars(module.key)

  // Drie visuele states in volgorde van prioriteit:
  //  1. !isEnabled (module uit) — gedimd, geen accent, hover toont activeer-CTA
  //  2. isActive (huidige route) — accent + bg-tint + module-700 tekst
  //  3. enabled & inactive — neutrale ink-2 tekst met hover
  const baseRowClass = !isEnabled
    ? 'text-[var(--ink-4)]'
    : isActive
      ? 'bg-[color-mix(in_oklch,var(--module-active-500)_8%,transparent)] text-[var(--module-active-700)]'
      : 'text-[var(--ink-2)] hover:bg-[var(--subtle)]/50 hover:text-[var(--ink)]'

  // Module-toggle is verwijderd uit Trifinity; modules zijn altijd enabled.
  // De fallback-tak (`!isEnabled`) blijft hieronder bestaan voor het geval
  // toekomstige module-gating teruggebracht wordt, maar wordt momenteel
  // niet bereikt. `targetHref` valt terug op de module-route zelf.
  const targetHref = module.href
  const tooltip = module.label

  if (collapsed) {
    return (
      <div className="relative" style={isEnabled ? styleVars : undefined}>
        {isActive && isEnabled && (
          <span
            aria-hidden
            className="absolute left-0 top-1 bottom-1 w-[3px]"
            style={{ background: 'var(--module-active-500)' }}
          />
        )}
        <Link
          href={targetHref}
          aria-label={tooltip}
          title={tooltip}
          className={`flex items-center justify-center w-full h-12 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[var(--ink)] ${baseRowClass}`}
          style={isEnabled ? styleVars : undefined}
        >
          {/* Module-icon met optionele Lock-overlay voor uitgeschakelde modules.
              Lock-badge is een visuele markering naast de gedimde tekst-kleur,
              zodat gebruikers met kleurblindheid of high-contrast modes ook
              zien dat de module uit staat (WCAG 1.4.1 Use of Color). */}
          <span className="relative inline-flex">
            <Icon
              className="w-5 h-5"
              style={
                isEnabled
                  ? isActive
                    ? { color: 'var(--module-active-700)' }
                    : { color: 'var(--module-active-500)', opacity: 0.7 }
                  : undefined
              }
              aria-hidden
            />
            {!isEnabled && (
              <Lock
                aria-hidden
                className="absolute -bottom-0.5 -right-1 w-2.5 h-2.5 bg-[var(--paper)] text-[var(--ink-4)] rounded-full p-px"
              />
            )}
          </span>
        </Link>
      </div>
    )
  }

  // Expanded — full row met label + sub-tags + metric.
  // Sub-tag-strip krijgt een eigen klikgebied per tag; door dit BUITEN de
  // hoofd-link te plaatsen (sibling, niet child) voorkomen we genest-link-warnings.
  return (
    <div className="relative" style={isEnabled ? styleVars : undefined}>
      {isActive && isEnabled && (
        <span
          aria-hidden
          className="absolute left-0 top-1.5 bottom-1.5 w-[3px]"
          style={{ background: 'var(--module-active-500)' }}
        />
      )}
      <Link
        href={targetHref}
        title={tooltip}
        className={`flex w-full items-start gap-3 px-3 py-3 text-left transition-colors duration-150 min-h-[64px] focus-visible:outline-2 focus-visible:outline-[var(--ink)] ${baseRowClass}`}
      >
        {/* Module-icon met optionele Lock-overlay (zie collapsed-variant). */}
        <span className="relative inline-flex shrink-0 mt-0.5">
          <Icon
            className="w-[18px] h-[18px]"
            style={
              isEnabled
                ? isActive
                  ? { color: 'var(--module-active-700)' }
                  : { color: 'var(--module-active-500)', opacity: 0.7 }
                : undefined
            }
            aria-hidden
          />
          {!isEnabled && (
            <Lock
              aria-hidden
              className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-[var(--paper)] text-[var(--ink-4)] rounded-full p-px"
            />
          )}
        </span>
        <div className="flex-1 min-w-0">
          <ModuleLabel
            module={module}
            isActive={isActive && isEnabled}
          />
        </div>
        {!isEnabled ? (
          <span className="font-mono uppercase text-[10px] tracking-[0.06em] mt-1 shrink-0 text-[var(--ink-4)]">
            Activeer
          </span>
        ) : (
          <span
            className="font-mono tabular-nums text-[11px] tracking-[0.02em] mt-0.5 shrink-0"
            style={
              isActive && isEnabled
                ? { color: 'var(--module-active-700)' }
                : { color: 'var(--ink-3)' }
            }
          >
            {metric}
          </span>
        )}
      </Link>

      {/* Sub-tag-strip — alleen op active+enabled module met sub-tags. Plan
          §3.3: sub-pages verschijnen alleen bij de huidige module om de
          sidebar visueel rustig te houden. leverScores wordt doorgegeven
          zodat tags met `leverKey` een status-dot tonen. */}
      {isActive && isEnabled && module.subTags.length > 0 && (
        <SubTagStrip subTags={module.subTags} leverScores={leverScores} />
      )}

      {/* Apps-strip — alleen op active+enabled module met apps die door
          minstens één gekoppeld asset/debt geactiveerd zijn (filter via
          activeAppKeys, gevoed door tracking-flags op assets en debts). */}
      {isActive && isEnabled && module.apps && module.apps.length > 0 && (
        <AppTagStrip
          apps={module.apps.filter((a) => activeAppKeys.includes(a.appKey))}
        />
      )}

      {/* Inactive-module CTA — kleine voet onder de rij die naar Instellingen linkt.
          Géén tooltip-only: gebruikers moeten zien dat de module bestaat maar uit staat. */}
      {!isEnabled && (
        <div
          className="px-3 pb-2 -mt-1 italic text-[11px] leading-snug text-[var(--ink-3)]"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          Activeer in Instellingen
        </div>
      )}
    </div>
  )
}

function ModuleLabel({
  module,
  isActive,
}: {
  module: ModuleEntry
  isActive: boolean
}) {
  return (
    <span
      className="text-[16px] leading-tight font-bold"
      style={{ fontFamily: PLAYFAIR }}
    >
      {module.prefix}
      <em
        className="font-normal italic"
        style={isActive ? { color: 'var(--module-active-700)' } : undefined}
      >
        {module.italicEm}
      </em>
    </span>
  )
}

const SUBTAG_STATUS_DOT: Record<LeverStatus, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  neutral: 'bg-[var(--ink-4)]',
}

const SUBTAG_STATUS_LABEL: Record<LeverStatus, string> = {
  green: 'Gezond',
  amber: 'Aandacht',
  red: 'Zorg',
  neutral: 'Geen data',
}

function SubTagStrip({
  subTags,
  dimmed = false,
  leverScores,
}: {
  subTags: SubTag[]
  dimmed?: boolean
  leverScores?: LeverScores
}) {
  const pathname = usePathname() ?? '/'
  // Dimmed-state op non-active modules: een toon lichter zodat de actieve
  // module visueel blijft dominen, maar de sub-pages wel scanbaar zijn.
  const baseColorClass = dimmed ? 'text-[var(--ink-3)]' : 'text-[var(--ink-2)]'
  const linkHoverClass = dimmed ? 'hover:text-[var(--ink-2)]' : 'hover:text-[var(--ink)]'
  // Match op de tag zelf of een dieper kind zodat het derde niveau
  // (Box 1/2/3) alleen op een belasting-route uitklapt.
  const isOnTag = (href: string) => pathname === href || pathname.startsWith(href + '/')
  // Vertical stack: elke sub-tag op eigen rij. pl-[42px] = px-3 (12) + icon (18)
  // + gap-3 (12) zodat de tags onder de module-label uitlijnen i.p.v. onder de
  // icon-kolom. Communiceert duidelijker de parent/child-relatie.
  return (
    <div
      className={`flex flex-col italic text-[12px] leading-snug pl-[42px] pr-3 pb-2 -mt-1 ${baseColorClass}`}
      style={{ fontFamily: SOURCE_SERIF }}
    >
      {subTags.map((tag) => {
        const entry = tag.leverKey && leverScores ? leverScores[tag.leverKey] : null
        const showChildren = tag.children && tag.children.length > 0 && isOnTag(tag.href)
        return (
          <div key={tag.href} className="flex flex-col">
            <Link
              href={tag.href}
              className={`flex items-center gap-2 py-0.5 ${linkHoverClass} transition-colors duration-150`}
              title={
                entry
                  ? `${tag.label}: ${SUBTAG_STATUS_LABEL[entry.status]} — ${entry.detail}`
                  : tag.label
              }
            >
              <span className="flex-1">{tag.label}</span>
              {entry && (
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${SUBTAG_STATUS_DOT[entry.status]}`}
                  aria-label={`${tag.label}: ${SUBTAG_STATUS_LABEL[entry.status]}`}
                />
              )}
            </Link>
            {showChildren && (
              <div className="flex flex-col border-l border-[var(--border-ed)] ml-1 pl-3 mt-0.5 mb-1">
                {tag.children!.map((child) => {
                  const childActive = isOnTag(child.href)
                  return (
                    <Link
                      key={child.href}
                      href={child.href}
                      aria-current={childActive ? 'page' : undefined}
                      className={`py-0.5 transition-colors duration-150 ${
                        childActive
                          ? 'text-[var(--ink)] font-medium'
                          : `text-[var(--ink-3)] ${linkHoverClass}`
                      }`}
                    >
                      {child.label}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Apps-strip onder de categorie-tags. Visueel ondergeschikt: kleine mono-kicker
 * "apps" + dezelfde middle-dot-separator als SubTagStrip, maar lichter ink
 * en 11px (vs 12px) zodat hij rustig hangt. Wordt alleen gerenderd wanneer
 * er minstens één app actief is na filtering.
 */
function AppTagStrip({ apps, dimmed = false }: { apps: AppTag[]; dimmed?: boolean }) {
  if (apps.length === 0) return null
  // Op non-active modules toont de strip wel apps maar in een lichtere ink,
  // zodat de actieve module visueel blijft domineren. Kicker-streep gebruikt
  // op non-active de neutrale --rule-soft i.p.v. de module-active-500.
  const bodyColorClass = dimmed ? 'text-[var(--ink-3)]' : 'text-[var(--ink-2)]'
  const linkHoverClass = dimmed ? 'hover:text-[var(--ink-2)]' : 'hover:text-[var(--ink)]'
  const stripeColor = dimmed ? 'var(--rule-soft, var(--border-ed))' : 'var(--module-active-500)'
  // Vertical stack — zelfde indent als SubTagStrip (pl-[42px]) zodat alle
  // children van de module onder de label uitlijnen. Kicker "apps" staat
  // boven de stack als sectie-marker.
  return (
    <div className="pl-[42px] pr-3 pb-2.5 -mt-1">
      <div className="flex items-center gap-1.5 mb-0.5 text-[9px] font-mono uppercase tracking-[0.18em] text-[var(--ink-3)]">
        <span
          aria-hidden
          className="inline-block w-4 h-px"
          style={{ background: stripeColor }}
        />
        apps
      </div>
      <div
        className={`flex flex-col text-[11px] leading-snug ${bodyColorClass}`}
        style={{ fontFamily: SOURCE_SERIF }}
      >
        {apps.map((app) => (
          <Link
            key={app.href}
            href={app.href}
            className={`block py-0.5 ${linkHoverClass} transition-colors duration-150`}
          >
            {app.label}
          </Link>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Overige-sectie (SECUNDAIR)
// ─────────────────────────────────────────────────────────────────

function OverigeSection({
  collapsed,
  unreadMessageCount,
}: {
  collapsed: boolean
  unreadMessageCount: number
}) {
  // Berichten krijgt een dynamische badge; andere entries blijven statisch.
  const entries = OVERIGE_BASE.map((e) =>
    e.label === 'Berichten' && unreadMessageCount > 0
      ? { ...e, badge: `· ${unreadMessageCount}` }
      : e,
  )

  return (
    <div className="flex flex-col px-2 py-3">
      {!collapsed && <OverigeSectionLabel />}
      <div className="flex flex-col">
        {entries.map((entry) => (
          <OverigeRow key={entry.label} entry={entry} collapsed={collapsed} />
        ))}
      </div>
    </div>
  )
}

function OverigeSectionLabel() {
  return (
    <div className="px-2 mb-1.5">
      <span
        className="italic text-[12px] text-[var(--ink-3)] lowercase"
        style={{ fontFamily: SOURCE_SERIF }}
      >
        overige
      </span>
    </div>
  )
}

function OverigeRow({
  entry,
  collapsed,
}: {
  entry: OverigeEntry & { badge?: string }
  collapsed: boolean
}) {
  const Icon = entry.Icon
  if (collapsed) {
    return (
      <Link
        href={entry.href}
        aria-label={entry.label}
        title={entry.label}
        className="relative flex items-center justify-center h-9 text-[var(--ink-3)] hover:bg-[var(--subtle)]/50 hover:text-[var(--ink-2)] transition-colors duration-150"
      >
        <Icon className="w-4 h-4" aria-hidden />
        {entry.badge && (
          <span
            className="absolute top-1 right-2 font-mono text-[9px] text-[var(--ink-3)]"
            aria-hidden
          >
            {entry.badge.replace('· ', '')}
          </span>
        )}
      </Link>
    )
  }
  return (
    <Link
      href={entry.href}
      className="flex items-center justify-between gap-2 px-3 h-8 text-[var(--ink-3)] hover:bg-[var(--subtle)]/50 hover:text-[var(--ink-2)] transition-colors duration-150"
    >
      <span className="flex items-center gap-2.5 min-w-0">
        <Icon className="w-[14px] h-[14px] shrink-0" aria-hidden />
        <span className="text-[12px] truncate">{entry.label}</span>
      </span>
      {entry.badge && (
        <span className="font-mono text-[10px] text-[var(--ink-3)] tabular-nums">
          {entry.badge}
        </span>
      )}
    </Link>
  )
}

// ─────────────────────────────────────────────────────────────────
// Footer-sectie (TERTIAIR)
// ─────────────────────────────────────────────────────────────────

function FooterSection({
  collapsed,
  userInitials,
  userName,
  role,
}: {
  collapsed: boolean
  userInitials: string
  userName: string
  role?: string
}) {
  // Beheer-link is alleen voor superadmin. Krijgt kern-700 accent zodat hij
  // visueel onderscheidt van neutrale FOOTER_LINKS (Identiteit/Instellingen/Uitloggen).
  const isSuperadmin = role === 'superadmin'

  // Sync-rapport-modal state — leeft binnen FooterSection zodat we de modal
  // hier kunnen renderen en zowel Sync nu als de Rapport-knop hem kunnen openen.
  const [reportOpen, setReportOpen] = useState(false)

  if (collapsed) {
    return (
      <>
        <div className="flex flex-col items-center border-t border-[var(--border-ed)] py-2">
          <Link
            href="/mijn"
            aria-label={`Account — ${userName}`}
            title={userName}
            className="flex items-center justify-center h-10 w-10 hover:bg-[var(--subtle)]/50 transition-colors duration-150"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--ink)] text-[10px] font-bold text-[var(--paper)]">
              {userInitials}
            </span>
          </Link>
          {isSuperadmin && (
            <Link
              href="/beheer"
              aria-label="Beheer"
              title="Beheer"
              className="flex items-center justify-center h-9 w-full text-[var(--color-kern-700)] hover:bg-[var(--color-kern-50)]/40 transition-colors duration-150 font-mono text-[9px] uppercase tracking-[0.1em] font-semibold"
            >
              B
            </Link>
          )}
          {/* Sync-knop — collapsed icon-only. GlobalSyncButton rendert zijn
              eigen icon (refresh-arrows) + state-indicators. */}
          <div className="flex items-center justify-center h-9 w-full text-[var(--ink-3)] hover:bg-[var(--subtle)]/50 hover:text-[var(--ink-2)] transition-colors duration-150">
            <GlobalSyncButton onOpenReport={() => setReportOpen(true)} />
          </div>
          {/* Rapport-knop — collapsed icon-only naar SyncReportModal. */}
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            aria-label="Sync-rapport"
            title="Sync-rapport"
            className="flex items-center justify-center h-9 w-full text-[var(--ink-3)] hover:bg-[var(--subtle)]/50 hover:text-[var(--ink-2)] transition-colors duration-150"
          >
            <Activity className="h-3.5 w-3.5" aria-hidden />
          </button>
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              aria-label={link.label}
              title={link.label}
              className="flex items-center justify-center h-9 w-full text-[var(--ink-3)] hover:bg-[var(--subtle)]/50 hover:text-[var(--ink-2)] transition-colors duration-150 font-mono text-[9px] uppercase tracking-[0.1em]"
            >
              {link.label.charAt(0)}
            </Link>
          ))}
        </div>
        <SyncReportModal open={reportOpen} onClose={() => setReportOpen(false)} />
      </>
    )
  }
  return (
    <>
      <div className="border-t border-[var(--border-ed)] px-2 py-3">
        <Link
          href="/mijn"
          className="flex items-center gap-2.5 w-full px-2 h-10 hover:bg-[var(--subtle)]/50 transition-colors duration-150"
          aria-label="Account-menu"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-[10px] font-bold text-[var(--paper)]">
            {userInitials}
          </span>
          <span className="flex-1 text-left text-[13px] font-medium text-[var(--ink-2)] truncate">
            {userName}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-[var(--ink-3)] shrink-0" aria-hidden />
        </Link>
        <div className="flex flex-col mt-1">
          {isSuperadmin && (
            <Link
              href="/beheer"
              className="flex items-center px-2 h-8 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--color-kern-700)] hover:bg-[var(--color-kern-50)]/40 transition-colors duration-150 text-left font-semibold"
            >
              Beheer
            </Link>
          )}
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="flex items-center px-2 h-8 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ink-3)] hover:bg-[var(--subtle)]/50 hover:text-[var(--ink)] transition-colors duration-150 text-left"
            >
              {link.label}
            </Link>
          ))}
          {/* Sync nu + Sync-rapport — 2-kolom-grid identiek aan TopBar's
              avatar-dropdown op mobile, zodat sidebar (desktop) dezelfde
              functionaliteit heeft. Plaatsing onder de FOOTER_LINKS zodat
              de visuele hiërarchie identiek aan mobile blijft. */}
          <div className="grid grid-cols-2 mt-2 border-t border-[var(--border-ed)]">
            <div className="flex flex-col items-center justify-center gap-1 py-2 hover:bg-[var(--subtle)]/50 transition-colors duration-150">
              <GlobalSyncButton onOpenReport={() => setReportOpen(true)} />
              <span className="text-[9px] uppercase tracking-[0.1em] text-[var(--ink-3)] font-mono">
                Sync nu
              </span>
            </div>
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="flex flex-col items-center justify-center gap-1 border-l border-[var(--border-ed)] py-2 text-[var(--ink-3)] hover:bg-[var(--subtle)]/50 transition-colors duration-150"
            >
              <span className="flex h-6 w-6 items-center justify-center">
                <Activity className="h-3.5 w-3.5" aria-hidden />
              </span>
              <span className="text-[9px] uppercase tracking-[0.1em] font-mono">
                Rapport
              </span>
            </button>
          </div>
        </div>
      </div>
      <SyncReportModal open={reportOpen} onClose={() => setReportOpen(false)} />
    </>
  )
}
