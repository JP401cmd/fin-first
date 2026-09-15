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
 *    Strategieën) — geen apps, conform plan §3.3.
 *  - Echte routes (Link) ipv mock-buttons.
 *  - Echte data via props (netto-vermogen, acties, badge).
 */
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  Zap,
  Inbox,
  Newspaper,
  BarChart3,
  Search,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Activity,
  type LucideIcon,
} from 'lucide-react'
import { TAP_TARGET_ROW_MIN } from '@/components/editorial/tap-target'
import { useModuleAccess } from '@/components/app/feature-access-provider'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'
import {
  SIMPLE_HIDDEN_NAV_HREFS,
  menuNav,
  isMenuEntryActive,
  type MenuEntry,
  type NavColor,
  type NavItem,
} from '@/lib/nav-config'
import type { NavModule } from '@/lib/module-registry'
import { useSidebarCollapsed } from '@/lib/hooks/use-sidebar-collapsed'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { formatNetWorthShort } from '@/lib/net-worth-format'
import { LeverCompassCollapsed, type LeverScores, type LeverStatus } from '@/components/app/shell/lever-compass'
import { leverStatusLabel, leverageToLeverStatus } from '@/components/app/shell/lever-scores'
import { usePlanStatus } from '@/components/app/plan-status-provider'
import { GlobalSyncButton } from '@/components/sync/global-sync-button'
import { SyncReportModal } from '@/components/sync/sync-report-modal'
import { useCommandPalette } from '@/components/command-palette/command-palette-provider'
import type { SidebarSignals } from '@/components/app/shell/shell-contexts'
import {
  LEVERAGE_STATUS_DOT,
  LEVERAGE_STATUS_LABEL,
  type LeverageStatus,
} from '@/lib/leverage-status'
import { useNotifications } from '@/components/app/notifications/notification-provider'
import { useNewsUnread } from '@/lib/hooks/use-news-unread'
import { hasSubscription } from '@/lib/feature-registry'
import { useCashflowStatusContext } from '@/components/app/cashflow-status-provider'
import type { CashflowCardStatuses } from '@/lib/cashflow-cards'

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'
const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

// ── Public API ───────────────────────────────────────────────────────────────

export type SidebarProps = {
  /** Netto vermogen in EUR — getoond rechts van "Home" (alleen Volledig). */
  netWorth: number
  /** Aantal openstaande acties. Momenteel niet in het menu getoond. */
  actionCount: number
  /** 1-2 letter avatar-initialen, uppercase. */
  userInitials: string
  /** Volledige naam in profiel-pill. */
  userName: string
  /** Role van de user — bij `'superadmin'` verschijnt extra Beheer-link in footer. */
  role?: string
  /**
   * App-slugs die actief zijn op basis van tracking-flags op assets/debts —
   * de bron van waarheid is `getActiveAppKeys()` uit
   * `components/core/category-deepening-registry.ts`. Een app uit `menuNav[].apps`
   * verschijnt alleen wanneer haar `appKey` in deze lijst staat.
   */
  activeAppKeys?: string[]
  /** Vier-hefbomen-kompas scores. Optioneel; valt terug op neutrale status. */
  leverScores?: LeverScores
  /**
   * Goedkope status-signalen voor de sidebar-dots (freshness + belasting
   * status-mirror), voorberekend in `app/(app)/layout.tsx`. Undefined-safe:
   * dots tonen dan hun inactieve (grijze/neutrale) staat.
   */
  sidebarSignals?: SidebarSignals
}

// ── Menu-config ──────────────────────────────────────────────────────────────

// De menu-structuur zelf komt uit `menuNav` in lib/nav-config.ts — dezelfde
// lijst die de mobiele nav-sheet leest. Tot 15 sep 2026 hield deze zijbalk een
// eigen kopie (`MODULES`) bij, gegroepeerd onder "Twee modules"; die liep op
// labels en subpagina's al uit de pas met de nav-config (Fiscale kansen en de
// Budget-instellingen ontbraken hier).

/**
 * Menu-kleur → `--module-active-*`-vars op de rij, zodat icoon, actieve streep
 * en actieve tint het accent van dát onderdeel dragen (Bezittingen kern,
 * Schulden wil, Budget en De toekomst horizon). `stone` (Home, Belasting) heeft
 * geen accent en valt terug op ink — dezelfde neutraliteit als
 * `HEFBOOM_CONFIG.belasting.tint`.
 */
const ACCENT_FOR_COLOR: Record<Exclude<NavColor, 'stone'>, NavModule> = {
  amber: 'kern',
  purple: 'horizon',
  teal: 'wil',
}

function accentVars(color: NavColor): React.CSSProperties {
  if (color === 'stone') {
    return {
      '--module-active-500': 'var(--ink-3)',
      '--module-active-700': 'var(--ink)',
    } as React.CSSProperties
  }
  return moduleVars(ACCENT_FOR_COLOR[color])
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

/**
 * Welke bron de freshness-dot van een "overige"-rij voedt. Dit is een STABIELE
 * SLEUTEL op de entry zelf — bewust géén vergelijking op `entry.label`.
 *
 * Waarom: de dot van de Krant-rij was drie weken dood. De rij heette op 28 aug
 * (6c49f5cbc) "Nieuws" → "Krant", maar de dot-dispatch matchte nog op de
 * letterlijke tekst 'Nieuws'. `useNewsUnread` bleef draaien, het resultaat werd
 * weggegooid en het aria-label bleef leeg — stil, want een niet-matchende
 * if-tak faalt nergens. Copy is geen sleutel: elke hernoeming (er staat er nog
 * één aan te komen) breekt zo'n koppeling opnieuw, en altijd geruisloos.
 *
 * De sleutel reist daarom mét de entry mee. Voeg je een rij toe, dan dwingt het
 * type een keuze af, en de switch in `OverigeRow` is exhaustief (never-check).
 */
type OverigeSignal = 'tips' | 'berichten' | 'nieuws' | 'geen'

type OverigeEntry = {
  /** Stabiele sleutel voor de dot-dispatch — nooit het zichtbare label. */
  signal: OverigeSignal
  label: string
  Icon: LucideIcon
  href: string
  /** Aria-/title-tekst van de dot, actief en inactief. */
  freshness: FreshnessLabels
}

const OVERIGE_BASE: OverigeEntry[] = [
  // Tips & acties — de Fin-stroom (briefing-vervolg) als vaste ingang.
  // Zap = de actie-helft van "tips & acties" (zie guide-naslagwerk).
  {
    signal: 'tips',
    label: 'Tips & acties',
    Icon: Zap,
    href: '/overzicht/tips',
    freshness: { on: 'Er zijn tips of acties', off: 'Geen openstaande acties' },
  },
  {
    signal: 'berichten',
    label: 'Berichten',
    Icon: Inbox,
    href: '/berichten',
    freshness: { on: 'Ongelezen berichten', off: 'Geen nieuwe berichten' },
  },
  // "Krant", niet "Nieuws". `lib/nav-config.ts` (globalNav) is de canonieke IA
  // en de pagina zelf zet `<NavStackMeta title="Krant">`; deze zijbalk hield
  // een eigen label aan en dreef daarmee weg (bevinding M14). Eén naam per
  // concept — de zijbalk volgt de nav-config, niet andersom. Ook de dot-teksten
  // zeggen "krant": een screenreader hoort anders een naam die nergens staat.
  {
    signal: 'nieuws',
    label: 'Krant',
    Icon: Newspaper,
    href: '/nieuws',
    freshness: { on: 'Ongelezen krant', off: 'Krant gelezen' },
  },
  // Rapportages heeft geen signaal: altijd grijs (zelf te genereren).
  {
    signal: 'geen',
    label: 'Rapportages',
    Icon: BarChart3,
    href: '/rapportages',
    freshness: { on: 'Rapportages op aanvraag', off: 'Rapportages op aanvraag' },
  },
]

type FooterLink = {
  label: string
  href: string
}

const FOOTER_LINKS: FooterLink[] = [
  // Geen losse Account-link meer (15 sep 2026, eigenaar: "dat gaat via Mijn").
  // Mijn en Account stonden hier onder elkaar; Account is een onderdeel van
  // Mijn. De ingang zit sindsdien als kaart in het /mijn-grid — let op: haal je
  // die kaart weg, dan heeft desktop géén Account-ingang meer (de mobiele
  // nav-pill met `open-account` is `lg:hidden`).
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


// ── Main component ───────────────────────────────────────────────────────────

const DEFAULT_LEVER_SCORES: LeverScores = {
  assets: { score: null, status: 'neutral', detail: 'Geen data' },
  debts: { score: null, status: 'neutral', detail: 'Geen data' },
  cashflow: { score: null, status: 'neutral', detail: 'Geen data' },
  tax: { score: null, status: 'neutral', detail: 'Geen data' },
}

export function Sidebar({
  netWorth,
  userInitials,
  userName,
  role,
  activeAppKeys = [],
  leverScores = DEFAULT_LEVER_SCORES,
  sidebarSignals,
}: SidebarProps) {
  const pathname = usePathname() ?? '/'
  const [collapsed, setCollapsed] = useSidebarCollapsed()

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

      {/* Geen eigen Weergave-sectie meer (perspectief + euro-weergave): beide
          schakelaars zitten in het zoekmenu (⌘K), de SearchTrigger hierboven. */}

      <MenuSection
        collapsed={collapsed}
        pathname={pathname}
        activeAppKeys={activeAppKeys}
        netWorth={netWorth}
        leverScores={leverScores}
        sidebarSignals={sidebarSignals}
      />

      <div className="border-t border-[var(--border-ed)]" aria-hidden />

      <OverigeSection
        collapsed={collapsed}
        sidebarSignals={sidebarSignals}
      />

      {/* De kompas-status staat als stip naast elke hefboom-rij (zie
          MenuRow). Ingeklapt zijn er geen labels om een stip naast te zetten,
          dus daar houden we onderaan een compacte indicator. */}
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
// Menu (PRIMAIR)
// ─────────────────────────────────────────────────────────────────

function MenuSection({
  collapsed,
  pathname,
  activeAppKeys,
  netWorth,
  leverScores,
  sidebarSignals,
}: {
  collapsed: boolean
  pathname: string
  activeAppKeys: string[]
  netWorth: number
  leverScores: LeverScores
  sidebarSignals?: SidebarSignals
}) {
  // Netto vermogen is een saldo → honoreert de privacy-toggle (Bedragen
  // verbergen). Bij masked toont formatNetWorthShort de bullet-placeholder.
  const { masked } = useMaskedAmounts()
  // NAV-5 — in Eenvoudig geen netto-vermogen-badge naast Home: een cijfer
  // zonder context, dat op de pagina zelf al twee keer staat (hero +
  // vermogensgrafiek). De navigatie is een wegwijzer, geen tweede dashboard.
  // In Volledig blijft de badge staan.
  const simple = useDisplayMode().mode === 'simple'
  const homeMetric = simple ? null : formatNetWorthShort(netWorth, masked)
  // Handmatig open/dicht geklapte takken, per href. Leeg = volg de
  // begintoestand: alleen de actieve hoofdpagina staat open (NAV-2). Zelfde
  // patroon als de mobiele nav-sheet (B-048) — bewust géén localStorage: een
  // kijkje nemen binnen één sessie, geen voorkeur om te onthouden.
  const [branchOverride, setBranchOverride] = useState<Record<string, boolean>>({})

  return (
    <div className="flex flex-col gap-0.5 px-2 py-3">
      {menuNav.map((entry) => {
        const isActive = isMenuEntryActive(pathname, entry.href)
        const expanded = branchOverride[entry.href] ?? isActive
        return (
          <MenuRow
            key={entry.href}
            entry={entry}
            pathname={pathname}
            collapsed={collapsed}
            isActive={isActive}
            expanded={expanded}
            onToggle={() =>
              setBranchOverride((prev) => ({ ...prev, [entry.href]: !expanded }))
            }
            metric={entry.href === '/overzicht' ? homeMetric : null}
            activeAppKeys={activeAppKeys}
            leverScores={leverScores}
            sidebarSignals={sidebarSignals}
          />
        )
      })}
    </div>
  )
}

function MenuRow({
  entry,
  pathname,
  collapsed,
  isActive,
  expanded,
  onToggle,
  metric,
  activeAppKeys,
  leverScores,
  sidebarSignals,
}: {
  entry: MenuEntry
  pathname: string
  collapsed: boolean
  isActive: boolean
  expanded: boolean
  onToggle: () => void
  metric: string | null
  activeAppKeys: string[]
  leverScores: LeverScores
  sidebarSignals?: SidebarSignals
}) {
  const Icon = entry.icon
  const styleVars = accentVars(entry.color)
  const { mode: displayMode } = useDisplayMode()
  const lever = entry.leverKey ? leverScores[entry.leverKey] : null
  // Plan-stoplicht (De toekomst): alleen een punt zodra er een oordeel is —
  // tijdens het nastreamen (`neutral`) liever niets dan een grijze flits.
  const planStatus = usePlanStatus()
  const planDot: LeverStatus | null =
    entry.statusSource === 'plan' && planStatus !== 'neutral' ? leverageToLeverStatus(planStatus) : null
  const dotStatus: LeverStatus | null = lever ? lever.status : planDot

  // Eenvoudig-weergave: verberg de menu-ingang voor de aangewezen routes
  // (Rekenhulp). Filtert ALLEEN de sidebar-ingang — de pagina's
  // blijven via deeplink + Volledig bereikbaar.
  const subPages = (entry.children ?? []).filter(
    (page) => displayMode !== 'simple' || !SIMPLE_HIDDEN_NAV_HREFS.includes(page.href),
  )
  // Apps (verdiepingen) alleen wanneer minstens één gekoppeld asset/debt de
  // tracking-vlag aan heeft (activeAppKeys).
  const apps = (entry.apps ?? []).filter((app) => activeAppKeys.includes(app.appKey))

  const rowClass = isActive
    ? 'bg-[color-mix(in_oklch,var(--module-active-500)_8%,transparent)] text-[var(--module-active-700)]'
    : 'text-[var(--ink-2)] hover:bg-[var(--subtle)]/50 hover:text-[var(--ink)]'
  const iconStyle = isActive
    ? { color: 'var(--module-active-700)' }
    : { color: 'var(--module-active-500)', opacity: 0.7 }
  const title = lever
    ? `${entry.label}: ${leverStatusLabel(lever.status)} — ${lever.detail}`
    : planDot
      ? `${entry.label}: ${leverStatusLabel(planDot)}`
      : entry.label
  const current = pathname === entry.href ? 'page' : undefined

  const activeStripe = isActive && (
    <span
      aria-hidden
      className="absolute left-0 top-1.5 bottom-1.5 w-[3px]"
      style={{ background: 'var(--module-active-500)' }}
    />
  )

  if (collapsed) {
    return (
      <div className="relative" style={styleVars}>
        {activeStripe}
        <Link
          href={entry.href}
          aria-label={entry.label}
          aria-current={current}
          title={title}
          className={`flex items-center justify-center w-full h-11 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[var(--ink)] ${rowClass}`}
        >
          {/* Kleur op de wrapper: `NavIcon` kent geen style-prop, het icoon
              erft via currentColor. */}
          <span className="inline-flex" style={iconStyle} aria-hidden>
            <Icon className="w-5 h-5" />
          </span>
        </Link>
      </div>
    )
  }

  const hasSubs = subPages.length > 0 || apps.length > 0
  const branchId = `sidebar-branch${entry.href.replace(/\//g, '-')}`

  // Subpagina's en apps staan als sibling ná de hoofdlink (niet als child),
  // zodat er geen geneste links ontstaan. De chevron is om dezelfde reden een
  // eigen knop náást de link, niet erin.
  return (
    <div className="relative" style={styleVars}>
      {activeStripe}
      <div className={`flex items-stretch transition-colors duration-150 ${rowClass}`}>
        <Link
          href={entry.href}
          aria-current={current}
          title={title}
          className={`flex flex-1 min-w-0 items-center gap-3 py-2.5 min-h-[44px] text-left focus-visible:outline-2 focus-visible:outline-[var(--ink)] ${hasSubs ? 'pl-3 pr-1' : 'px-3'}`}
        >
          <span className="inline-flex shrink-0" style={iconStyle} aria-hidden>
            <Icon className="w-[18px] h-[18px]" />
          </span>
          <span
            className="flex-1 min-w-0 truncate text-[15px] leading-tight font-bold"
            style={{ fontFamily: PLAYFAIR }}
          >
            {entry.label}
          </span>
          {metric && (
            <span
              className="font-mono tabular-nums text-[11px] tracking-[0.02em] shrink-0"
              style={isActive ? { color: 'var(--module-active-700)' } : { color: 'var(--ink-3)' }}
            >
              {metric}
            </span>
          )}
          {dotStatus && (
            <span
              data-testid={planDot ? 'sidebar-plan-status' : undefined}
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${SUBTAG_STATUS_DOT[dotStatus]}`}
              aria-label={`${entry.label}: ${leverStatusLabel(dotStatus)}`}
            />
          )}
        </Link>
        {hasSubs && (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            // Alleen verwijzen zolang het paneel er ook daadwerkelijk staat;
            // dicht is het uit de DOM, niet verborgen.
            aria-controls={expanded ? branchId : undefined}
            aria-label={
              expanded
                ? `Verberg de onderdelen van ${entry.label}`
                : `Toon de onderdelen van ${entry.label}`
            }
            title={expanded ? 'Inklappen' : 'Uitklappen'}
            className="flex w-9 shrink-0 items-center justify-center text-[var(--ink-3)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--ink)]"
          >
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </button>
        )}
      </div>

      {/* Begintoestand: alleen de actieve hoofdpagina staat open (plan §3.3,
          NAV-2) — rustig maar scanbaar. De chevron klapt elke tak open of
          dicht zonder de pagina te openen. */}
      {expanded && hasSubs && (
        // Zonder subpagina's erboven zou de "apps"-kop (-mt-1) tegen de rij plakken.
        <div id={branchId} className={subPages.length === 0 ? 'pt-1.5' : undefined}>
          {subPages.length > 0 && (
            <SubPageStrip pages={subPages} sidebarSignals={sidebarSignals} />
          )}
          {apps.length > 0 && <AppTagStrip apps={apps} sidebarSignals={sidebarSignals} />}
        </div>
      )}
    </div>
  )
}

const SUBTAG_STATUS_DOT: Record<LeverStatus, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  neutral: 'bg-[var(--ink-4)]',
}

// Géén eigen woordenlijst meer (UR2-04): het statuswoord komt uit dezelfde
// generieke `LEVERAGE_STATUS_LABEL` die de Box 1/2/3-kinderen even verderop in
// deze sidebar (SubTagChild) én de hefboomkaarten op /overzicht al lazen —
// vóór de fix zei de Belasting-subtag "Gezond" terwijl zijn eigen Box 3-kind
// "Goed op koers" zei. Vertaling via `leverStatusLabel` (lib/lever-scores.ts).

// ── Status-dots ───────────────────────────────────────────────────────────
//
// Twee dot-talen, bewust gescheiden:
//  1. FreshnessDot — binair: groen = "iets nieuws / iets te doen", grijs =
//     "niets". Eén herbruikbaar component, met aria-label + title (Dutch).
//  2. Status-mirror (Belasting Box 1/2/3) — meerkleurig via het bestaande
//     LEVERAGE_STATUS_DOT (good/warn/bad/neutral). Inline afgehandeld in
//     SubTagStrip, NIET via dit component.
// De bestaande categorie-tag-gezondheidsdots (SUBTAG_STATUS_DOT hierboven)
// staan los hiervan en blijven ongewijzigd.

/**
 * Binaire freshness-dot: groen gevuld wanneer `active`, anders een grijze
 * holle ring. Bewust kleiner (w-1/h-1) dan de health/status-dots (w-1.5/h-1.5)
 * zodat de twee dot-talen in één oogopslag te onderscheiden zijn.
 */
function FreshnessDot({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={
        active
          ? 'w-1 h-1 rounded-full shrink-0 bg-emerald-500'
          : 'w-1 h-1 rounded-full shrink-0 bg-transparent ring-1 ring-inset ring-[var(--ink-4)]'
      }
      aria-label={label}
      title={label}
    />
  )
}

/** Surface-specifieke labels (actief/inactief) per freshness-dot. */
type FreshnessLabels = { on: string; off: string }

// Cashflow-children (SubTagStrip): status-mirror i.p.v. freshness. Elke child-
// href mapt op een sleutel in CashflowCardStatuses, gevuld door
// `useCashflowStatusContext()` (op de hub: de server-seed van de pagina; op de
// sub-pagina's: /api/overzicht/cashflow-status). Beide paden lopen door
// buildCashflowCards + cashflowCardStatuses, dus elke dot toont EXACT dezelfde
// LeverageStatus als de bijbehorende cashflow-landingskaart (Budget/Transacties/
// Vaste lasten/Forecast) — één bron, geen drift.
const CASHFLOW_STATUS_BY_HREF: Record<string, keyof CashflowCardStatuses> = {
  // '/overzicht/budget' staat hier bewust NIET: dat is sinds UR3-28 de ouder,
  // en die haalt zijn dot uit `leverKey: 'cashflow'` — de hefboomscore.
  '/overzicht/budget/transacties': 'transacties',
  '/overzicht/budget/vaste-lasten': 'vasteLasten',
  '/overzicht/budget/forecast': 'forecast',
}

// Belasting-children (status-mirror), gemapt op child-href → belasting-key.
const BELASTING_BOX_BY_HREF: Record<string, 'box1' | 'box2' | 'box3'> = {
  '/overzicht/belasting/box1': 'box1',
  '/overzicht/belasting/box2': 'box2',
  '/overzicht/belasting/box3': 'box3',
}

// Apps (AppTagStrip), gemapt op AppTag.appKey.
const APP_FRESHNESS: Record<
  string,
  { key: 'budgetOver' | 'aandelenStale' | 'cryptoStale' | 'hypotheekRateReset' | 'verhuurMissingIncome'; labels: FreshnessLabels }
> = {
  budgetteren: {
    key: 'budgetOver',
    labels: { on: 'Budget overschreden', off: 'Budgetten op schema' },
  },
  'aandelen-holdings': {
    key: 'aandelenStale',
    labels: { on: 'Koersen verouderd', off: 'Koersen actueel' },
  },
  'crypto-holdings': {
    key: 'cryptoStale',
    labels: { on: 'Koersen verouderd', off: 'Koersen actueel' },
  },
  hypotheekplanner: {
    key: 'hypotheekRateReset',
    labels: { on: 'Rentevaste periode loopt af', off: 'Geen renteherziening op komst' },
  },
  verhuurrendement: {
    key: 'verhuurMissingIncome',
    labels: { on: 'Huurinkomsten ontbreken', off: 'Huurgegevens compleet' },
  },
}

/**
 * Subpagina's onder de actieve hoofdpagina (bv. Box 1/2/3 onder Belasting,
 * Transacties/Vaste lasten/Vooruitblik onder Budget, Doelen onder De toekomst).
 * Tot 15 sep 2026 was dit een derde niveau onder "Het Overzicht"; nu hangen ze
 * direct onder hun eigen hoofdpagina. pl-[42px] = px-3 (12) + icon (18) +
 * gap-3 (12), zodat ze onder het label uitlijnen i.p.v. onder de icoonkolom.
 */
function SubPageStrip({
  pages,
  sidebarSignals,
}: {
  pages: NavItem[]
  sidebarSignals?: SidebarSignals
}) {
  const pathname = usePathname() ?? '/'
  // Cashflow-kaartstatussen uit de gedeelde CashflowStatusProvider (app-layout).
  // Die provider is lazy — op de hub consumeert hij de server-seed van de
  // pagina (geen request), op de sub-pagina's fetcht hij
  // /api/overzicht/cashflow-status, en daarbuiten blijven de statussen neutraal.
  const cashflowStatuses = useCashflowStatusContext()
  const isOn = (href: string) => pathname === href || pathname.startsWith(href + '/')
  return (
    <div
      className="flex flex-col italic text-[12px] leading-snug pl-[42px] pr-3 pb-2 -mt-0.5 text-[var(--ink-2)]"
      style={{ fontFamily: SOURCE_SERIF }}
    >
      {pages.map((page) => (
        <SubTagChild
          key={page.href}
          child={page}
          active={isOn(page.href)}
          linkHoverClass="hover:text-[var(--ink)]"
          sidebarSignals={sidebarSignals}
          cashflowStatuses={cashflowStatuses}
        />
      ))}
    </div>
  )
}

/**
 * Eén subpagina-rij. Krijgt een trailing 4-kleuren status-mirror-dot
 * (LEVERAGE_STATUS_DOT), die EXACT dezelfde LeverageStatus toont als de
 * bijbehorende landingskaart:
 *  - Belasting Box 1/2/3 → `sidebarSignals.belasting[boxN]` (server-berekend,
 *    gedeelde helpers met de Belasting-kaart).
 *  - Budget Transacties/Vaste lasten/Vooruitblik → `cashflowStatuses[key]`
 *    (client-hook → /api/overzicht/cashflow-status → buildCashflowCards, exact
 *    dezelfde bron als de cashflow-kaarten).
 * Overige subpagina's (Fiscale kansen, Doelen…) hebben geen stip.
 */
function SubTagChild({
  child,
  active,
  linkHoverClass,
  sidebarSignals,
  cashflowStatuses,
}: {
  child: NavItem
  active: boolean
  linkHoverClass: string
  sidebarSignals?: SidebarSignals
  cashflowStatuses: CashflowCardStatuses
}) {
  const belastingBox = BELASTING_BOX_BY_HREF[child.href]
  const cashflowKey = CASHFLOW_STATUS_BY_HREF[child.href]

  let dot: React.ReactNode = null
  if (belastingBox) {
    // Belasting-status-mirror. Default 'neutral' wanneer geen signaal.
    const status: LeverageStatus = sidebarSignals?.belasting[belastingBox] ?? 'neutral'
    const dotLabel = `${child.label}: ${LEVERAGE_STATUS_LABEL[status]}`
    dot = (
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${LEVERAGE_STATUS_DOT[status]}`}
        aria-label={dotLabel}
        title={dotLabel}
      />
    )
  } else if (cashflowKey) {
    // Cashflow-status-mirror — exact de kaart-status (zie use-cashflow-card-statuses).
    const status: LeverageStatus = cashflowStatuses[cashflowKey]
    const dotLabel = `${child.label}: ${LEVERAGE_STATUS_LABEL[status]}`
    dot = (
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${LEVERAGE_STATUS_DOT[status]}`}
        aria-label={dotLabel}
        title={dotLabel}
      />
    )
  }

  return <SubTagChildLink child={child} active={active} linkHoverClass={linkHoverClass} dot={dot} />
}

/** Gedeelde child-link-markup zodat dot-bron los staat van layout. */
function SubTagChildLink({
  child,
  active,
  linkHoverClass,
  dot,
}: {
  child: NavItem
  active: boolean
  linkHoverClass: string
  dot: React.ReactNode
}) {
  return (
    <Link
      href={child.href}
      aria-current={active ? 'page' : undefined}
      // UR3-20/B — zie SubTagStrip: rij zelf naar de 24px-vloer.
      className={`flex items-center gap-2 py-1 ${TAP_TARGET_ROW_MIN} transition-colors duration-150 ${
        active ? 'text-[var(--ink)] font-medium' : `text-[var(--ink-2)] ${linkHoverClass}`
      }`}
    >
      <span className="flex-1">{child.label}</span>
      {dot}
    </Link>
  )
}

/**
 * Apps-strip onder de categorie-tags. Visueel ondergeschikt: kleine mono-kicker
 * "apps" + dezelfde middle-dot-separator als SubTagStrip, maar lichter ink
 * en 11px (vs 12px) zodat hij rustig hangt. Wordt alleen gerenderd wanneer
 * er minstens één app actief is na filtering.
 */
function AppTagStrip({
  apps,
  dimmed = false,
  sidebarSignals,
}: {
  apps: AppTag[]
  dimmed?: boolean
  sidebarSignals?: SidebarSignals
}) {
  // Actieve route vergelijken op pathname-only (negeer ?tab= query-strings).
  // usePathname() vóór de early-return zodat de hook-volgorde stabiel blijft
  // (react-hooks/rules-of-hooks).
  const pathname = usePathname() ?? '/'
  if (apps.length === 0) return null
  // Op non-active modules toont de strip wel apps maar in een lichtere ink,
  // zodat de actieve module visueel blijft domineren. Kicker-streep gebruikt
  // op non-active de neutrale --rule-soft i.p.v. de module-active-500.
  const bodyColorClass = dimmed ? 'text-[var(--ink-3)]' : 'text-[var(--ink-2)]'
  const linkHoverClass = dimmed ? 'hover:text-[var(--ink-2)]' : 'hover:text-[var(--ink)]'
  const stripeColor = dimmed ? 'var(--rule-soft, var(--border-ed))' : 'var(--module-active-500)'
  const isAppActive = (href: string) => {
    // href kan een query-string bevatten (bv. /overzicht?tab=budgetteren) —
    // vergelijk uitsluitend het pad-deel zodat de rij correct highlight.
    const hrefPath = href.split('?')[0]
    return pathname === hrefPath || pathname.startsWith(hrefPath + '/')
  }
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
        {apps.map((app) => {
          const freshness = APP_FRESHNESS[app.appKey]
          const on = freshness ? (sidebarSignals?.[freshness.key] ?? false) : false
          const active = isAppActive(app.href)
          return (
            <Link
              key={app.href}
              href={app.href}
              aria-current={active ? 'page' : undefined}
              // UR3-20/B — zie SubTagStrip: rij zelf naar de 24px-vloer.
              className={`flex items-center gap-2 py-1 ${TAP_TARGET_ROW_MIN} transition-colors duration-150 ${
                active ? 'text-[var(--ink)] font-medium' : linkHoverClass
              }`}
            >
              <span className="flex-1">{app.label}</span>
              {freshness && (
                <FreshnessDot active={on} label={on ? freshness.labels.on : freshness.labels.off} />
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Overige-sectie (SECUNDAIR)
// ─────────────────────────────────────────────────────────────────

function OverigeSection({
  collapsed,
  sidebarSignals,
}: {
  collapsed: boolean
  sidebarSignals?: SidebarSignals
}) {
  // Nieuws-freshness: ÉÉN gedeelde bron (perf fase 1). Voorheen riep elke
  // OverigeRow `useNewsUnread()` aan (Rules of Hooks: onvoorwaardelijk) →
  // ~4 rijen × 1 peek-fetch = 4× `/api/news?peek=1` per pageload. Hier één keer,
  // entitlement-gated: zonder AI-abonnement raakt de peek de 403-gate → we slaan
  // 'm over (`enabled=false`). Het resultaat gaat als prop naar de Nieuws-rij.
  const { subscriptions } = useModuleAccess()
  const hasAi = hasSubscription(subscriptions, 'ai')
  const newsUnread = useNewsUnread(hasAi)

  return (
    <div className="flex flex-col px-2 py-3">
      {!collapsed && <OverigeSectionLabel />}
      <div className="flex flex-col">
        {OVERIGE_BASE.map((entry) => (
          <OverigeRow
            key={entry.signal}
            entry={entry}
            collapsed={collapsed}
            sidebarSignals={sidebarSignals}
            newsUnread={newsUnread}
          />
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
  sidebarSignals,
  newsUnread,
}: {
  entry: OverigeEntry
  collapsed: boolean
  sidebarSignals?: SidebarSignals
  /** Nieuws-freshness: gedeelde bron uit OverigeSection (één fetch, gated). */
  newsUnread: boolean
}) {
  const Icon = entry.Icon

  // Berichten consumeert het ongelezen-aantal uit de notificatie-provider
  // (context-read, geen fetch — badge + dot consistent en live). De Nieuws-
  // freshness komt als prop uit OverigeSection (één gedeelde peek-fetch).
  const { unreadCount } = useNotifications()

  // Bepaal per rij: numerieke badge (alleen Berichten) + freshness-dot.
  // Dispatch loopt op `entry.signal` (stabiele sleutel), niet op het label.
  const isBerichten = entry.signal === 'berichten'
  const badge = isBerichten && unreadCount > 0 ? `· ${unreadCount}` : null

  // Freshness-dot per surface. Tips & acties + Berichten + Krant zijn live;
  // Rapportages is altijd grijs (zelf te genereren — geen signaal). De switch is
  // exhaustief: een nieuw signaal zonder bron is een compile-fout, geen dode dot.
  let dotActive: boolean
  switch (entry.signal) {
    case 'tips':
      dotActive = sidebarSignals?.tipsActions ?? false
      break
    case 'berichten':
      dotActive = unreadCount > 0
      break
    case 'nieuws':
      dotActive = newsUnread
      break
    case 'geen':
      dotActive = false
      break
    default: {
      const onbekend: never = entry.signal
      throw new Error(`Onbekend overige-signaal: ${String(onbekend)}`)
    }
  }
  const dotLabel = dotActive ? entry.freshness.on : entry.freshness.off

  if (collapsed) {
    // Collapsed: alleen icoon + (voor Berichten) numerieke badge. Freshness-
    // dots zijn een no-op in collapsed (consistent met de strip-surfaces).
    return (
      <Link
        href={entry.href}
        aria-label={entry.label}
        title={entry.label}
        className="relative flex items-center justify-center h-9 text-[var(--ink-3)] hover:bg-[var(--subtle)]/50 hover:text-[var(--ink-2)] transition-colors duration-150"
      >
        <Icon className="w-4 h-4" aria-hidden />
        {badge && (
          <span
            className="absolute top-1 right-2 font-mono text-[9px] text-[var(--ink-3)]"
            aria-hidden
          >
            {badge.replace('· ', '')}
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
      <span className="flex items-center gap-2 shrink-0">
        {badge && (
          <span className="font-mono text-[10px] text-[var(--ink-3)] tabular-nums">
            {badge}
          </span>
        )}
        <FreshnessDot active={dotActive} label={dotLabel} />
      </span>
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
        {/*
          GEEN aria-label hier (UR3-20/A): een aria-label VERVANGT de berekende
          naam, dus "Account-menu" wiste de zichtbare `{userName}` uit de
          toegankelijke naam — WCAG 2.5.3 (Label in Name) faalde daardoor op
          vrijwel elke desktop-route, en spraakbediening kon de link niet vinden
          op wat er staat. Het label was bovendien feitelijk onjuist: dit is een
          navigatielink naar /mijn, geen menu-trigger. De initialen zijn puur
          decoratief (de naam staat er leesbaar naast) en gaan daarom
          aria-hidden, zodat de berekende naam exact de zichtbare naam is.
          De collapsed-variant hierboven houdt zijn aria-label wél: daar is
          geen zichtbare naamtekst, dus geen tegenspraak.
        */}
        <Link
          href="/mijn"
          className="flex items-center gap-2.5 w-full px-2 h-10 hover:bg-[var(--subtle)]/50 transition-colors duration-150"
        >
          <span
            aria-hidden
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-[10px] font-bold text-[var(--paper)]"
          >
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
