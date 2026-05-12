'use client'

/**
 * SANDBOX / Fase 0 v3 — onderdeel van new-navigation-shell migratie.
 * Plan: docs/navigatie-redesign-plan.md §4.4
 * Achter feature-flag in productie. Voor nu: alleen sandbox-test.
 *
 * Slot-component dat de juiste BottomBar-content rendert op basis van een
 * `BottomBarConfig` (uit StackEntry.bottomBar). Vier kinds:
 *  - `tabs` (default): module-tabs (Kern/Wil/Horizon), gating via
 *    `useModuleAccess`. Gebruikt `<BottomNavTabs />` (content-only export).
 *  - `action-bar`: primary + optionele secondary CTA voor sub-flows.
 *  - `context-actions`: 2-3 actie-knoppen op detail-pagina's.
 *  - `hidden`: rendert niets — full-screen content.
 *
 * Hoogte komt overeen met de bestaande BottomNav (var --bottom-nav-height,
 * standaard 64px) + safe-area-padding voor iOS home-indicator.
 *
 * Achtergrond + border-top: consistent met de bestaande BottomNav
 * (`bg-[var(--paper)]/90 backdrop-blur-md`, `border-t-2 border-[var(--ink)]`).
 *
 * Belangrijke ontwerpkeuze: dit component zit BINNEN de tray-of-three van
 * MobileStackShell. Geen `fixed bottom-0` — de positionering komt van de
 * tray-layout (flex column met BottomBar als laatste row).
 */

import Link from 'next/link'
import {
  Check,
  X,
  Pencil,
  Trash2,
  Share2,
  Plus,
  Save,
  ArrowLeft,
  ArrowRight,
  Edit3,
  Copy,
  Download,
  Upload,
  Filter,
  Search,
  RefreshCw,
  Settings,
  MoreHorizontal,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { BottomNavTabs } from '@/components/app/bottom-nav'
import type { BottomBarConfig, BottomBarAction } from './nav-stack-provider'
import { useLiveBottomBar } from './nav-stack-provider'
import { MobileAppStrip } from './mobile-app-strip'

type MobileBottomBarProps = {
  /**
   * BottomBar-config uit de huidige stack-entry. `undefined` of ontbrekend
   * wordt behandeld als `{ kind: 'tabs' }` (default).
   */
  config?: BottomBarConfig
}

/**
 * Static map van toegestane icon-namen → lucide components. Bewust een vaste
 * lijst (en geen `import * as Icons`-spread) zodat:
 *   1. We voldoen aan de React 19 lint-regel `react-hooks/static-components`:
 *      we creëren geen component tijdens render — we lezen 'm uit een vooraf
 *      gedefinieerde map.
 *   2. Bundle-size is voorspelbaar — alleen de werkelijk gebruikte icons komen
 *      mee in de productie-build.
 * Onbekende namen → `null`, we vallen dan terug op alleen-label.
 *
 * Bij rollout naar productie kan deze lijst uitgebreid worden met de icons
 * die echte pagina's gebruiken; voor de sandbox dekken deze 18 icons de
 * voorbeelden in stack-demo + de meest voorkomende action-bar/context-action
 * patronen.
 */
const ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
  Check,
  X,
  Pencil,
  Trash2,
  Share2,
  Plus,
  Save,
  ArrowLeft,
  ArrowRight,
  Edit3,
  Copy,
  Download,
  Upload,
  Filter,
  Search,
  RefreshCw,
  Settings,
  MoreHorizontal,
}

/**
 * Render één action-bar of context-actions knop. Ondersteunt zowel `onClick`
 * (button) als `href` (Link) — exact één van de twee. Als beide ontbreken:
 * een gedisabled-look (geen interactie). Touch-target 44×44 minimum (a11y).
 */
function ActionButton({
  action,
  variant,
}: {
  action: BottomBarAction
  variant: 'primary' | 'secondary' | 'context'
}) {
  // Lookup uit static map — geen dynamische component-creatie tijdens render.
  // Onbekende icon-namen vallen terug op `null` en dan tonen we alleen-label.
  const Icon = action.icon ? ICON_MAP[action.icon] ?? null : null

  // Variant-styling. Primary: solid ink-bg met paper-text. Secondary: outline.
  // Context: minimal label + icon, destructive overrules met --negative.
  const baseClasses =
    'tap-highlight inline-flex items-center justify-center gap-2 min-h-11 px-4 text-sm font-medium leading-none transition-colors'

  const variantClasses = (() => {
    if (variant === 'primary') {
      return 'flex-1 bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--ink-2)]'
    }
    if (variant === 'secondary') {
      return 'flex-1 border-2 border-[var(--ink)] text-[var(--ink)] bg-[var(--paper)] hover:bg-[var(--subtle)]'
    }
    // context
    if (action.destructive) {
      return 'flex flex-col flex-1 gap-0.5 text-[var(--negative)] hover:bg-[var(--subtle)]'
    }
    return 'flex flex-col flex-1 gap-0.5 text-[var(--ink-2)] hover:bg-[var(--subtle)] hover:text-[var(--ink)]'
  })()

  // Inter font voor UI-chrome (consistent met TopBar). Inline-style forceert
  // Inter zelfs als de parent een serif-stack injecteert.
  const fontStyle = { fontFamily: 'var(--font-inter, system-ui, sans-serif)' } as const

  const content = (
    <>
      {Icon ? <Icon className={variant === 'context' ? 'h-4 w-4' : 'h-4 w-4'} /> : null}
      <span className={variant === 'context' ? 'text-[10px] uppercase tracking-[0.06em]' : ''}>
        {action.label}
      </span>
    </>
  )

  if (action.href) {
    return (
      <Link href={action.href} className={`${baseClasses} ${variantClasses}`} style={fontStyle}>
        {content}
      </Link>
    )
  }

  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={!action.onClick}
      className={`${baseClasses} ${variantClasses} disabled:opacity-50 disabled:cursor-not-allowed`}
      style={fontStyle}
    >
      {content}
    </button>
  )
}

/**
 * MobileBottomBar — slot-component binnen de tray-of-three. Plaatsing en
 * achtergrond komen van deze wrapper; de inhoud komt uit de juiste renderer
 * voor het gegeven `kind`.
 */
export function MobileBottomBar({ config }: MobileBottomBarProps) {
  // Live-override (LiveBottomBarContext) wint van de stack-entry config —
  // pagina's die een action-bar met `onClick`-handlers tonen registreren via
  // <MobileBottomBarLive>; zolang die gemount is, gebruiken we hun config.
  const live = useLiveBottomBar()
  const effectiveConfig = live?.config ?? config

  // Default = 'tabs'. Behandel ontbrekende config of expliciete `undefined`
  // hetzelfde — beide betekenen "geen override, toon de module-tabs".
  const kind: BottomBarConfig['kind'] = effectiveConfig?.kind ?? 'tabs'

  if (kind === 'hidden') return null

  // Wrapper-styling: consistent met de bestaande BottomNav. Geen `fixed`
  // hier — de tray-layout in MobileStackShell positioneert ons als laatste
  // flex-row, zodat we MEEschuiven bij push/pop (plan §4.1 cruciaal verschil
  // met v2 waar BottomNav buiten de animation-layer zat).
  const wrapperClasses =
    'border-t-2 border-[var(--ink)] bg-[var(--paper)]/90 backdrop-blur-md'

  if (kind === 'tabs') {
    // Secundaire app-strip (icon-only) verschijnt BOVEN de bottom-nav voor
    // modules met actieve category-apps (vandaag: alleen Kern). De strip
    // beslist zelf of hij rendert (pathname-detectie + lege-state filter) —
    // op /will, /horizon en op brand-new accounts rendert hij `null` zonder
    // dat we hier hoeven te gaten.
    return (
      <>
        <MobileAppStrip />
        <nav className={wrapperClasses}>
          <BottomNavTabs />
        </nav>
      </>
    )
  }

  if (kind === 'action-bar' && effectiveConfig?.kind === 'action-bar') {
    return (
      <div
        className={`${wrapperClasses} flex items-center gap-2 px-3 pb-[var(--safe-area-bottom)]`}
        style={{ minHeight: 'var(--bottom-nav-height)' }}
      >
        {/* Secondary links (terug-context), primary rechts (forward-action) —
            volgens platform-conventie (iOS/Android). */}
        {effectiveConfig.secondary ? <ActionButton action={effectiveConfig.secondary} variant="secondary" /> : null}
        <ActionButton action={effectiveConfig.primary} variant="primary" />
      </div>
    )
  }

  if (kind === 'context-actions' && effectiveConfig?.kind === 'context-actions') {
    // Limiteer tot 4 voor leesbaarheid. Bij >4 wordt het visueel druk en
    // verliezen we touch-target-ruimte.
    const actions = effectiveConfig.actions.slice(0, 4)
    return (
      <div
        className={`${wrapperClasses} flex items-stretch px-1 pb-[var(--safe-area-bottom)]`}
        style={{ minHeight: 'var(--bottom-nav-height)' }}
        role="toolbar"
      >
        {actions.map((action, i) => (
          <ActionButton key={`${action.label}-${i}`} action={action} variant="context" />
        ))}
      </div>
    )
  }

  // Type-safety net: `kind` is union-exhaustief boven, maar runtime-cast naar
  // unknown zou hier uitkomen. Render dan niets.
  return null
}
