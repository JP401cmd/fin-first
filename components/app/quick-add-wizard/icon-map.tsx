'use client'

/**
 * Whitelist-map van Lucide-icons die door de quick-add wizard worden
 * gebruikt. We doen bewust geen `Lucide[name]` dynamic lookup omdat
 * dat tree-shaking breekt — de bundler moet per import kunnen bepalen
 * welke icons in de client-bundle terecht komen.
 *
 * Deze map dekt alle `ASSET_TYPE_ICONS` en `DEBT_TYPE_ICONS` keys uit
 * `lib/asset-data.ts` en `lib/debt-data.ts`. Als een key ontbreekt,
 * valt `TypeIcon` terug op `Circle` zodat de UI nooit crasht.
 *
 * De lookup is gewrapt in een `TypeIcon`-component zodat callers de
 * component niet tijdens render hoeven te binden — dat zou de React
 * `react-hooks/static-components`-regel breken en state resetten
 * telkens als de parent re-rendert.
 */

import {
  // Actieve icon-namen uit `ASSET_TYPE_ICONS` + `DEBT_TYPE_ICONS`
  Banknote,
  Briefcase,
  Building,
  Car,
  CircleDot,
  Clock,
  Coins,
  CreditCard,
  FileText,
  Gem,
  GraduationCap,
  Home,
  Hourglass,
  Landmark,
  LineChart,
  MoreHorizontal,
  Receipt,
  Repeat,
  Shield,
  Users,
  Wallet,
  Warehouse,
  // Legacy icon-namen — behouden voor backwards-compat met persisted data
  // (bv. budget-iconen, oudere asset-rijen waar de oude string nog in zit)
  Bitcoin,
  Building2,
  CalendarCheck,
  HandCoins,
  Heart,
  PiggyBank,
  RefreshCw,
  TrendingUp,
  Vault,
  // Fallback
  Circle,
} from 'lucide-react'
import type { LucideIcon, LucideProps } from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  // Actieve set
  Banknote,
  Briefcase,
  Building,
  Car,
  CircleDot,
  Clock,
  Coins,
  CreditCard,
  FileText,
  Gem,
  GraduationCap,
  Home,
  Hourglass,
  Landmark,
  LineChart,
  MoreHorizontal,
  Receipt,
  Repeat,
  Shield,
  Users,
  Wallet,
  Warehouse,
  // Legacy aliassen (backwards-compat)
  Bitcoin,
  Building2,
  CalendarCheck,
  HandCoins,
  Heart,
  PiggyBank,
  RefreshCw,
  TrendingUp,
  Vault,
}

export interface TypeIconProps extends LucideProps {
  /** Key uit `ASSET_TYPE_ICONS` of `DEBT_TYPE_ICONS`. */
  name: string
}

/**
 * Stabiele component die tijdens render een icon-key resolved naar het
 * Lucide-component en rendert. Omdat de component zelf nooit opnieuw
 * wordt gedeclareerd binnen render, behoudt hij state en voldoet aan
 * de `react-hooks/static-components`-regel.
 */
export function TypeIcon({ name, ...rest }: TypeIconProps) {
  const Icon = ICONS[name] ?? Circle
  return <Icon {...rest} />
}
