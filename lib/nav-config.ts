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
      // De vier hefbomen — kompas-categorieën onder Overzicht.
      { label: 'Bezittingen', href: '/overzicht/bezittingen' },
      { label: 'Schulden', href: '/overzicht/schulden' },
      { label: 'Cashflow', href: '/overzicht/cashflow' },
      { label: 'Belasting', href: '/overzicht/belasting' },
      // Actieve apps — deep-tools per categorie. Statisch opgenomen
      // zodat ze direct in zowel de desktop-sidebar als het mobile-
      // menu klikbaar zijn (sidebar.tsx filtert ze nog op tracking-
      // flag, mobiel toont alle).
      { label: 'Budgetteren', href: '/core/assets/cash?tab=budgetteren' },
      { label: 'Aandelen holdings', href: '/core/assets/investment?tab=aandelen-holdings' },
      { label: 'Crypto holdings', href: '/core/assets/crypto?tab=crypto-holdings' },
      { label: 'Hypotheekplanner', href: '/core/debts/mortgage?tab=hypotheekplanner' },
      { label: 'Verhuurrendement', href: '/core/assets/real_estate?tab=verhuurrendement' },
    ],
  },
  {
    parent: mainNav[1]!,
    items: [
      // Toekomst-tabs als deeplink ?tab=… — segmented-control binnen
      // /toekomst leest dezelfde query-key (zie components/future/
      // toekomst-tabs.tsx). Tijdas is de default zonder query-param.
      { label: 'Tijdas', href: '/toekomst' },
      { label: 'Doelen', href: '/toekomst?tab=doelen' },
      { label: 'Gebeurtenissen', href: '/toekomst?tab=gebeurtenissen' },
      { label: 'Voorkeuren', href: '/toekomst?tab=voorkeuren' },
      { label: 'Rekenhulp', href: '/toekomst?tab=rekenhulp' },
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
