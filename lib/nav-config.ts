import type { ComponentType } from 'react'
import { Wallet, Compass, User, Newspaper, Bell, MessageCircle, Settings } from 'lucide-react'

/**
 * Unified nav-config — single source of truth voor sidebar (desktop) én
 * floating-button-menu (mobile). Geïnspireerd op Vercel's command-mega-menu:
 * één lijst met hoofdpagina's, groepen subroutes onder elk, en globale
 * acties die overal beschikbaar zijn (krant, berichten, coach, account).
 *
 * Beide UI-laagen (sidebar + sheet) consumeren dezelfde structuur, dus
 * een nieuwe sub-route toevoegen verschijnt automatisch in beide.
 */

export type NavIcon = ComponentType<{ className?: string; size?: number }>
export type NavColor = 'amber' | 'teal' | 'purple' | 'stone'

export type NavItem = {
  label: string
  href: string
  icon?: NavIcon
  description?: string
}

export type NavGroup = {
  parent: NavItem & { color: NavColor }
  items: NavItem[]
}

export type GlobalNavItem = {
  label: string
  icon: NavIcon
  href?: string
  /** Optionele action-id voor non-route items (chat openen, account-menu, etc.) */
  action?: 'open-chat' | 'open-account' | 'open-search'
}

/**
 * Hoofdpagina's — verschijnen bovenaan het menu als grote tap-targets.
 */
export const mainNav: Array<NavItem & { color: NavColor }> = [
  {
    label: 'Overzicht',
    href: '/overzicht',
    icon: Wallet,
    color: 'amber',
    description: 'Hoe sta je er voor — kompas, score, tijdslijn',
  },
  {
    label: 'Toekomst',
    href: '/toekomst',
    icon: Compass,
    color: 'purple',
    description: 'Tijdas, doelen, gebeurtenissen, voorkeuren',
  },
  {
    label: 'Mijn',
    href: '/mijn',
    icon: User,
    color: 'teal',
    description: 'Profiel, partner, voorkeuren, koppelingen',
  },
]

/**
 * Groepen subroutes onder elke hoofdpagina. Lege items-array = nog niet
 * uitgesplitste verdiepingen (alleen hoofdpagina toont).
 */
export const navGroups: NavGroup[] = [
  {
    parent: mainNav[0]!,
    items: [
      { label: 'Bezittingen', href: '/overzicht/bezittingen' },
      { label: 'Schulden', href: '/overzicht/schulden' },
      { label: 'Cashflow', href: '/overzicht/cashflow' },
      { label: 'Belasting', href: '/overzicht/belasting' },
    ],
  },
  {
    parent: mainNav[1]!,
    items: [
      // Toekomst-tabs (Tijdas/Doelen/Gebeurtenissen/Voorkeuren) leven als
      // segmented-control binnen /toekomst, geen aparte routes. Lege groep
      // wordt skip-gerendered in de UI.
    ],
  },
  {
    parent: mainNav[2]!,
    // Plan §6.4 + §6.10: nieuwe nav verwijst naar /mijn-sub-routes
    // i.p.v. legacy /identity/*. De legacy routes blijven werken via
    // bestaande server-pagina's, maar zijn niet meer in de nav.
    items: [
      { label: 'Profiel', href: '/mijn/profiel' },
      { label: 'Privacy', href: '/mijn/privacy' },
      { label: 'Koppelingen', href: '/mijn/koppelingen' },
      { label: 'Delen', href: '/mijn/delen' },
      { label: 'Notificaties', href: '/mijn/notificaties' },
      { label: 'Uiterlijk', href: '/mijn/uiterlijk' },
      { label: 'Geavanceerd', href: '/mijn/geavanceerd' },
    ],
  },
]

/**
 * Globale items — altijd beschikbaar onderaan het menu (krant, berichten,
 * coach-chat, account/settings). Verschijnen ook als topbar-iconen op desktop.
 */
export const globalNav: GlobalNavItem[] = [
  { label: 'Krant', icon: Newspaper, href: '/nieuws' },
  { label: 'Berichten', icon: Bell, href: '/berichten' },
  { label: 'Vraag Will', icon: MessageCircle, action: 'open-chat' },
  { label: 'Account', icon: Settings, action: 'open-account' },
]
