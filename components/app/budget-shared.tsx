'use client'

import {
  Home, ShoppingCart, Car, Shield, UtensilsCrossed, Repeat, User,
  Building2, Zap, Droplets, Landmark, Store, Apple,
  Fuel, Train, Wrench, HeartPulse, Armchair, ShieldCheck,
  ChefHat, Coffee, Bike, Tv, Dumbbell, Smartphone,
  Shirt, Activity, Palette, Circle,
  Wallet, Banknote, Baby, Receipt, HandCoins,
  SprayCan, CarFront, PartyPopper, Palmtree, PiggyBank,
  Vault, TrendingUp, CreditCard, HomeIcon,
  GraduationCap, RefreshCw, CalendarCheck, CircleDot,
  Gem, Bitcoin, LineChart, Building, Briefcase,
  SlidersHorizontal, ArrowRightLeft, ArrowLeftRight,
  Heart,
  // Waarschuwings-icoon: een ingeklapt hoofdbudget dat zelf niet over budget is,
  // maar wel één of meer over-budget deelbudgetten heeft.
  AlertTriangle,
  // Toegevoegd voor de nieuwe asset/debt icon-set
  Hourglass, Warehouse, Coins, Clock, MoreHorizontal, FileText, Users,
  // Toegevoegd voor de uitgebreide budget-templates (telefoon/internet,
  // onderhoud huis & tuin, huisdieren, cadeaus & feestdagen)
  Wifi, Hammer, PawPrint, Gift,
} from 'lucide-react'

export const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Home, ShoppingCart, Car, Shield, UtensilsCrossed, Repeat, User,
  Building2, Zap, Droplets, Landmark, Store, Apple,
  Fuel, Train, Wrench, HeartPulse, Armchair, ShieldCheck,
  ChefHat, Coffee, Bike, Tv, Dumbbell, Smartphone,
  Shirt, Activity, Palette, Circle,
  Wallet, Banknote, Baby, Receipt, HandCoins,
  SprayCan, CarFront, PartyPopper, Palmtree, PiggyBank,
  Vault, TrendingUp, CreditCard, HomeIcon,
  GraduationCap, RefreshCw, CalendarCheck, CircleDot,
  Gem, Bitcoin, LineChart, Building, Briefcase,
  Sliders: SlidersHorizontal, SlidersHorizontal, ArrowRightLeft, ArrowLeftRight,
  Heart,
  Hourglass, Warehouse, Coins, Clock, MoreHorizontal, FileText, Users,
  Wifi, Hammer, PawPrint, Gift,
}

export const iconOptions = Object.keys(iconMap)

export function BudgetIcon({ name, className }: { name: string; className?: string }) {
  const Icon = iconMap[name] ?? Circle
  return <Icon className={className} />
}

import { formatCurrency as _formatCurrency, formatCurrencyDecimals as _formatCurrencyDecimals } from '@/lib/format'
export { _formatCurrency as formatCurrency, _formatCurrencyDecimals as formatCurrencyDecimals }
import type { Budget } from '@/lib/budget-data'
import { budgetBarPct } from '@/lib/budget-spending'

export type BudgetType = 'income' | 'expense' | 'savings' | 'debt' | 'archive'

/** Over budget is semantically positive for income, savings, and debt (earned/saved/repaid more than planned) */
export function isOverPositive(budgetType: BudgetType): boolean {
  return budgetType === 'income' || budgetType === 'savings' || budgetType === 'debt'
}

/**
 * True wanneer minstens één deelbudget zijn limiet overschrijdt. Alleen
 * relevant wanneer een overschrijding semantisch slecht is (uitgaven): bij
 * income/savings/debt is 'over' juist positief en dus géén waarschuwing.
 *
 * Gebruikt dezelfde limit-afleiding als de boom-/pill-weergave
 * (`beschikbaar + spent` indien bekend, anders `default_limit`), zodat het
 * waarschuwingssignaal exact samenvalt met de rood-kleuring van een deelbudget.
 */
export function anyChildOverBudget(
  children: Budget[],
  spending: Record<string, number>,
  beschikbaarMap: Record<string, number> | undefined,
  budgetType: BudgetType,
): boolean {
  if (isOverPositive(budgetType)) return false
  return children.some((c) => {
    const spent = spending[c.id] ?? 0
    const limit =
      beschikbaarMap?.[c.id] !== undefined ? beschikbaarMap[c.id] + spent : Number(c.default_limit)
    return limit > 0 && spent > limit
  })
}

/**
 * Stoplicht-rood waarschuwings-icoon op een hoofdbudget waarvan één of meer
 * deelbudgetten over budget zijn — zichtbaar óók als de parent is ingeklapt en
 * het totaal zelf binnen budget blijft. Bewust semantisch rood (géén
 * module-accent). Combineer met `anyChildOverBudget`.
 */
export function BudgetOverWarningIcon({ className, decorative }: { className?: string; decorative?: boolean }) {
  const label = 'Eén of meer deelbudgetten zijn over budget'
  // `decorative`: het icoon zit in een control die de waarschuwing al in zijn
  // eigen aria-label draagt (een expliciete aria-label op een knop overschrijft
  // de naam van child-elementen). Dan markeren we het icoon als puur visueel.
  if (decorative) {
    return <AlertTriangle aria-hidden="true" className={`h-4 w-4 shrink-0 text-red-600 ${className ?? ''}`} />
  }
  return (
    <AlertTriangle role="img" aria-label={label} className={`h-4 w-4 shrink-0 text-red-600 ${className ?? ''}`}>
      <title>{label}</title>
    </AlertTriangle>
  )
}

export function formatRollover(amount: number, type: string): string {
  if (amount <= 0) return ''
  const formatted = _formatCurrency(amount)
  switch (type) {
    case 'carry-over':
      return `+${formatted} doorgeschoven`
    case 'invest-sweep':
      return `${formatted} belegd`
    default:
      return ''
  }
}

// Static lookup — full class strings so Tailwind JIT can scan them at build time.
// CSS variable tokens (bg-income-50, text-savings-600, etc.) are registered via
// @theme inline in globals.css and resolve dynamically from the user's color settings.
const TYPE_COLORS: Record<BudgetType, {
  bg: string; bgDark: string; text: string; textLight: string
  border: string; barDefault: string; barWarning: string; barLight: string
  headerGradient: string; hoverBorder: string; hoverBg: string
  buttonBg: string; gradient: string; barWarn: string; spinner: string
  hex: string; hexLight: string
  barHex: string; barHexWarn: string; barHexLight: string
}> = {
  income: {
    bg: 'bg-income-50',
    bgDark: 'bg-income-100',
    text: 'text-income-600',
    textLight: 'text-income-500',
    border: 'border-income-200',
    barDefault: 'bg-income-400',
    barWarning: 'bg-income-500',
    barLight: 'bg-income-200',
    headerGradient: 'from-income-50 to-white',
    hoverBorder: 'hover:border-income-200',
    hoverBg: 'hover:bg-income-50',
    buttonBg: 'bg-income-600 hover:bg-income-700',
    gradient: 'from-income-50 to-white',
    barWarn: 'bg-income-500',
    spinner: 'border-income-500',
    hex: 'var(--color-income-500)',
    hexLight: 'var(--color-income-200)',
    barHex: 'var(--color-income-400)',
    barHexWarn: 'var(--color-income-500)',
    barHexLight: 'var(--color-income-200)',
  },
  expense: {
    bg: 'bg-expense-50',
    bgDark: 'bg-expense-100',
    text: 'text-expense-600',
    textLight: 'text-expense-500',
    border: 'border-expense-200',
    barDefault: 'bg-expense-400',
    barWarning: 'bg-expense-500',
    barLight: 'bg-expense-200',
    headerGradient: 'from-expense-50 to-white',
    hoverBorder: 'hover:border-expense-200',
    hoverBg: 'hover:bg-expense-50',
    buttonBg: 'bg-expense-600 hover:bg-expense-700',
    gradient: 'from-expense-50 to-white',
    barWarn: 'bg-expense-500',
    spinner: 'border-expense-500',
    hex: 'var(--color-expense-500)',
    hexLight: 'var(--color-expense-200)',
    barHex: 'var(--color-expense-400)',
    barHexWarn: 'var(--color-expense-500)',
    barHexLight: 'var(--color-expense-200)',
  },
  savings: {
    bg: 'bg-savings-50',
    bgDark: 'bg-savings-100',
    text: 'text-savings-600',
    textLight: 'text-savings-500',
    border: 'border-savings-200',
    barDefault: 'bg-savings-400',
    barWarning: 'bg-savings-500',
    barLight: 'bg-savings-200',
    headerGradient: 'from-savings-50 to-white',
    hoverBorder: 'hover:border-savings-200',
    hoverBg: 'hover:bg-savings-50',
    buttonBg: 'bg-savings-600 hover:bg-savings-700',
    gradient: 'from-savings-50 to-white',
    barWarn: 'bg-savings-500',
    spinner: 'border-savings-500',
    hex: 'var(--color-savings-500)',
    hexLight: 'var(--color-savings-200)',
    barHex: 'var(--color-savings-400)',
    barHexWarn: 'var(--color-savings-500)',
    barHexLight: 'var(--color-savings-200)',
  },
  debt: {
    bg: 'bg-debt-50',
    bgDark: 'bg-debt-100',
    text: 'text-debt-600',
    textLight: 'text-debt-500',
    border: 'border-debt-200',
    barDefault: 'bg-debt-400',
    barWarning: 'bg-debt-500',
    barLight: 'bg-debt-200',
    headerGradient: 'from-debt-50 to-white',
    hoverBorder: 'hover:border-debt-200',
    hoverBg: 'hover:bg-debt-50',
    buttonBg: 'bg-debt-600 hover:bg-debt-700',
    gradient: 'from-debt-50 to-white',
    barWarn: 'bg-debt-500',
    spinner: 'border-debt-500',
    hex: 'var(--color-debt-500)',
    hexLight: 'var(--color-debt-200)',
    barHex: 'var(--color-debt-400)',
    barHexWarn: 'var(--color-debt-500)',
    barHexLight: 'var(--color-debt-200)',
  },
  archive: {
    bg: 'bg-zinc-50',
    bgDark: 'bg-zinc-100',
    text: 'text-zinc-500',
    textLight: 'text-zinc-400',
    border: 'border-zinc-200',
    barDefault: 'bg-zinc-300',
    barWarning: 'bg-zinc-400',
    barLight: 'bg-zinc-100',
    headerGradient: 'from-zinc-50 to-white',
    hoverBorder: 'hover:border-zinc-200',
    hoverBg: 'hover:bg-zinc-50',
    buttonBg: 'bg-zinc-500 hover:bg-zinc-600',
    gradient: 'from-zinc-50 to-white',
    barWarn: 'bg-zinc-400',
    spinner: 'border-zinc-400',
    hex: 'var(--ink-4)',
    hexLight: '#e4e4e7',
    barHex: '#a1a1aa',
    barHexWarn: '#71717a',
    barHexLight: '#f4f4f5',
  },
}

export function getTypeColors(budgetType: BudgetType) {
  return TYPE_COLORS[budgetType] ?? TYPE_COLORS.expense
}

/* ── Progress bar segment computation ─────────────────────── */

export interface BarSegments {
  /** Fill 1: 0 → min(rawPct, threshold) in barHex */
  normalPct: number
  normalColor: string
  /** Fill 2: threshold → min(rawPct, 100) in barHexWarn */
  warnPct: number
  warnLeft: number
  warnColor: string
  /** Extension: limitPosition → limitPosition + extensionPct */
  extensionPct: number
  extensionLeft: number
  extensionColor: string
  /** Marker positions (scaled when overbudget) */
  limitPosition: number
  alertPosition: number
  /** Bij >105%: alles in overColor */
  isFullyOver: boolean
  overColor: string
}

export function computeBarSegments(
  spent: number,
  limit: number,
  threshold: number,
  colors: { barHex: string; barHexWarn: string },
  overPositive: boolean,
): BarSegments {
  // Onderaan geklemd op 0 (budgetBarPct), bovenaan NIET: een negatieve
  // besteding — meer inkomsten dan uitgaven op een uitgaven-budget — zou anders
  // een breedte van `-410%` opleveren, wat ongeldige CSS is en de balk stil laat
  // verdwijnen. De >100-staart blijft wél intact, want die draagt de
  // overschrijdings-signalering (extensie-segment + 105%-schaling).
  const rawPct = budgetBarPct(spent, limit)
  // Stoplicht-semantiek via design-tokens (oklch), niet losse hexen — zo valt de
  // 'volledig over budget'-balk exact samen met bg-positive/negative elders.
  const overColor = overPositive ? 'var(--positive)' : 'var(--negative)'
  // Op de rauwe (niet-boven-geklemde) waarde: een negatieve besteding is nooit
  // 'volledig over', dus de onder-klem verandert dit oordeel niet.
  const isFullyOver = rawPct > 105

  // When overbudget, scale everything so 105% fits within the track
  const hasExtension = rawPct > 100
  const scale = hasExtension ? 100 / 105 : 1

  const normalPct = Math.min(rawPct, threshold) * scale
  const warnLeft = threshold * scale
  const warnPct = Math.max(0, Math.min(rawPct, 100) - threshold) * scale
  const extensionPct = (hasExtension ? Math.min(rawPct - 100, 5) : 0) * scale
  const extensionLeft = 100 * scale

  return {
    normalPct,
    normalColor: isFullyOver ? overColor : colors.barHex,
    warnPct,
    warnLeft,
    warnColor: isFullyOver ? overColor : colors.barHexWarn,
    extensionPct,
    extensionLeft,
    extensionColor: overColor,
    limitPosition: 100 * scale,
    alertPosition: threshold * scale,
    isFullyOver,
    overColor,
  }
}
