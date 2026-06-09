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
  /**
   * Optionele geneste subroutes — verschijnen ingesprongen ónder dit item,
   * maar alléén wanneer de gebruiker op dit item (of een van zijn kinderen)
   * staat (contextueel derde niveau). Gebruikt voor Box 1/2/3 onder Belasting.
   */
  children?: NavItem[]
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
      // De vier hefbomen — kompas-categorieën onder Overzicht. Statisch
      // omdat ze altijd beschikbaar zijn (lege state heeft eigen empty-
      // state-UI). Actieve deep-app-tools komen daar BOVENOP, dynamisch
      // gefilterd op tracking-flag — zie OVERVIEW_APP_SUBROUTES.
      { label: 'Bezittingen', href: '/overzicht/bezittingen' },
      { label: 'Schulden', href: '/overzicht/schulden' },
      { label: 'Cashflow', href: '/overzicht/cashflow' },
      {
        label: 'Belasting',
        href: '/overzicht/belasting',
        // Box-subpagina's — geneste, contextuele subroutes (zie NavMenuSheet).
        children: [
          { label: 'Box 1 · Werk + woning', href: '/overzicht/belasting/box1' },
          { label: 'Box 2 · Aanmerkelijk belang', href: '/overzicht/belasting/box2' },
          { label: 'Box 3 · Sparen + beleggen', href: '/overzicht/belasting/box3' },
        ],
      },
    ],
  },
  {
    parent: mainNav[1]!,
    items: [
      // Toekomst-subnavigatie: Tijdas (/toekomst) is de landing met
      // navigatiekaarten; Doelen/Gebeurtenissen/Voorkeuren/Rekenhulp en
      // Wat-Als hebben elk een eigen subroute.
      { label: 'Tijdas', href: '/toekomst' },
      { label: 'Doelen', href: '/toekomst/doelen' },
      { label: 'Gebeurtenissen', href: '/toekomst/gebeurtenissen' },
      { label: 'Voorkeuren', href: '/toekomst/voorkeuren' },
      { label: 'Rekenhulp', href: '/toekomst/rekenhulp' },
      { label: 'Wat-Als', href: '/toekomst/whatif' },
    ],
  },
  {
    parent: mainNav[2]!,
    // Plan §6.4 + §6.10: nieuwe nav verwijst naar /mijn-sub-routes
    // i.p.v. legacy /identity/*. De legacy routes blijven werken via
    // bestaande server-pagina's, maar zijn niet meer in de nav.
    items: [
      { label: 'Profiel', href: '/mijn/profiel' },
      { label: 'Account', href: '/mijn/account' },
      { label: 'Privacy', href: '/mijn/privacy' },
      { label: 'Koppelingen', href: '/mijn/koppelingen' },
      { label: 'Notificaties', href: '/mijn/notificaties' },
      { label: 'Uiterlijk', href: '/mijn/uiterlijk' },
      { label: 'Geavanceerd', href: '/mijn/geavanceerd' },
    ],
  },
]

/**
 * Overzicht-sub-tools (deep-app-tools) per appKey — dynamisch gefilterd op
 * de active-tracking-flag op assets/debts. Sidebar én NavMenuSheet lezen
 * deze lijst en tonen alleen items waarvan `appKey` voorkomt in de
 * runtime `activeAppKeys` (via useActiveAppKeys-context op mobiel, of
 * `activeAppKeys`-prop op de sidebar).
 *
 * Bron-of-truth voor appKey-slugs is `getActiveAppKeys()` uit
 * components/core/category-deepening-registry.ts. Toevoegen van een
 * nieuwe deep-tool: hier registreren én registry bijwerken.
 */
export type OverviewAppItem = NavItem & { appKey: string }

export const OVERVIEW_APP_SUBROUTES: OverviewAppItem[] = [
  { label: 'Budgetteren', href: '/overzicht/cashflow/budget', appKey: 'budgetteren' },
  { label: 'Aandelen holdings', href: '/overzicht/bezittingen/investment?tab=aandelen-holdings', appKey: 'aandelen-holdings' },
  { label: 'Crypto holdings', href: '/overzicht/bezittingen/crypto?tab=crypto-holdings', appKey: 'crypto-holdings' },
  { label: 'Hypotheekplanner', href: '/overzicht/schulden/mortgage?tab=hypotheekplanner', appKey: 'hypotheekplanner' },
  { label: 'Verhuurrendement', href: '/overzicht/bezittingen/real_estate?tab=verhuurrendement', appKey: 'verhuurrendement' },
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
