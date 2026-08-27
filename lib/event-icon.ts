import React from 'react'
import {
  Calendar, Globe, Baby, Hammer, GraduationCap, Briefcase,
  Clock, Sunset, Home, Heart, HeartHandshake, HeartCrack, Truck, Car, Caravan, Tent, Gift, Zap, HandCoins,
  Landmark, PiggyBank, UserX, UserMinus, Flower2,
  CheckCircle2, PartyPopper, Mountain, Sparkles, AlertTriangle, Shield, Receipt, TrendingUp,
  Compass, Wallet,
  Target, CreditCard, Sun, Activity, LineChart, Banknote, ShieldCheck, Coins, Hourglass,
  type LucideIcon,
} from 'lucide-react'

/**
 * Canonieke icoon-bron voor levensgebeurtenissen (single source of truth).
 *
 * Sleutels zijn **Lucide-componentnamen** — exact zoals `LIFE_EVENT_CATALOG.icon`
 * (`lib/horizon-data.ts`) ze opslaat (`'Palmtree'`, `'Hammer'`, `'HandCoins'`, …).
 * Eén map, twee uitlees-vormen:
 *  - `EVENT_ICON_COMPONENTS` → het Lucide-component (voor JSX `<Icon className=… />`)
 *  - `EVENT_ICON_NODES`      → een kant-en-klare `<Icon className="h-4 w-4" />`-node
 *
 * Let op: `Palmtree` bestaat niet (meer) als Lucide-glyph in deze build; de
 * catalogus gebruikt de naam `'Palmtree'` maar we renderen bewust het
 * `Sunset`-glyph — gedrag identiek aan de oude `log-timeline`-map.
 */
export const EVENT_ICON_COMPONENTS: Record<string, LucideIcon> = {
  Calendar,
  Palmtree: Sunset,
  Globe,
  Baby,
  Hammer,
  GraduationCap,
  Briefcase,
  Clock,
  Sunset,
  Home,
  Heart,
  HeartCrack,
  Truck,
  Car,
  Caravan,
  Tent,
  Gift,
  Zap,
  HeartHandshake,
  HandCoins,
  Landmark,
  PiggyBank,
  UserX,
  UserMinus,
  Flower2,
  // ── Natuurlijke mijlpalen ──
  CheckCircle2,
  PartyPopper,
  Mountain,
  Sparkles,
  AlertTriangle,
  Shield,
  Receipt,
  TrendingUp,
  // ── Doel-markers (GOAL_TYPE_ICONS, lib/goal-data.ts) ──
  // Zonder deze regels valt de marker-laag terug op `Calendar` en ziet een doel
  // eruit als een levensgebeurtenis. `PiggyBank`, `Briefcase` en `TrendingUp`
  // staan hierboven al.
  Target,
  CreditCard,
  Sun,
  Activity,
  LineChart,
  Banknote,
  ShieldCheck,
  Coins,
  Hourglass,
}

/**
 * Voor-gerenderde `h-4 w-4`-nodes per Lucide-naam. Drop-in vervanger van de
 * oude lokale `EVENT_ICONS`-map in `log-timeline.tsx` (gedrag identiek).
 */
export const EVENT_ICON_NODES: Record<string, React.ReactNode> = Object.fromEntries(
  Object.entries(EVENT_ICON_COMPONENTS).map(([name, Icon]) => [
    name,
    React.createElement(Icon, { className: 'h-4 w-4' }),
  ]),
)

// Behouden voor bestaande imports (alias van de node-map).
export const EVENT_ICONS = EVENT_ICON_NODES

/**
 * Legacy-fallback: rijen zonder `icon`-veld worden via hun `event_type`
 * gemapt naar de Lucide-naam uit `LIFE_EVENT_CATALOG`. Zo krijgen oude
 * rijen alsnog hun catalogus-icoon. (catalogus-sleutel → Lucide-naam)
 */
export const EVENT_TYPE_ICON_NAME: Record<string, string> = {
  sabbatical: 'Palmtree',
  world_trip: 'Globe',
  children: 'Baby',
  renovation: 'Hammer',
  study: 'GraduationCap',
  career_change: 'Briefcase',
  part_time: 'Clock',
  early_retirement: 'Sunset',
  house_purchase: 'Home',
  house_sale: 'HandCoins',
  move: 'Truck',
  wedding: 'Heart',
  car_purchase: 'Car',
  camper_purchase: 'Caravan',
  holiday_home_purchase: 'Tent',
  inheritance: 'Gift',
  side_hustle: 'Zap',
  aow: 'Landmark',
  pension: 'PiggyBank',
  overlijden_partner: 'HeartHandshake',
  scheiding: 'HeartCrack',
  werkloosheid: 'UserMinus',
  schenking: 'HandCoins',
  begrafenis: 'Flower2',
  custom: 'Calendar',
  // ── Legacy korte event-types (pre-catalogus rijen) ──
  child: 'Baby',
  kind: 'Baby',
  career: 'Briefcase',
  zzp: 'Briefcase',
  werk: 'Briefcase',
  retirement: 'Sunset',
  housing: 'Home',
}

/** Sensible default wanneer noch `icon` noch `event_type` herkend wordt. */
export const DEFAULT_EVENT_ICON: LucideIcon = Wallet

/**
 * Resolve het Lucide-component voor een levensgebeurtenis.
 *
 * Volgorde:
 *  1. `event.icon` (de catalogus-Lucide-naam) → rijke map.
 *  2. `event_type` → Lucide-naam (legacy-fallback) → rijke map.
 *  3. `DEFAULT_EVENT_ICON` (Wallet).
 */
export function resolveEventIcon(eventType: string, icon?: string | null): LucideIcon {
  if (icon && EVENT_ICON_COMPONENTS[icon]) return EVENT_ICON_COMPONENTS[icon]!
  const fallbackName = EVENT_TYPE_ICON_NAME[(eventType ?? '').toLowerCase()]
  if (fallbackName && EVENT_ICON_COMPONENTS[fallbackName]) return EVENT_ICON_COMPONENTS[fallbackName]!
  return DEFAULT_EVENT_ICON
}

// Compass blijft beschikbaar voor neutrale plekken die geen event-icoon zijn.
export { Compass }
