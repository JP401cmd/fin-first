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
  SlidersHorizontal, ArrowRightLeft,
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
  Sliders: SlidersHorizontal, SlidersHorizontal, ArrowRightLeft,
}

export const iconOptions = Object.keys(iconMap)

export function BudgetIcon({ name, className }: { name: string; className?: string }) {
  const Icon = iconMap[name] ?? Circle
  return <Icon className={className} />
}

import { formatCurrency as _formatCurrency, formatCurrencyDecimals as _formatCurrencyDecimals } from '@/lib/format'
export { _formatCurrency as formatCurrency, _formatCurrencyDecimals as formatCurrencyDecimals }

export type BudgetType = 'income' | 'expense' | 'savings' | 'debt'

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
}

export function getTypeColors(budgetType: BudgetType) {
  return TYPE_COLORS[budgetType] ?? TYPE_COLORS.expense
}
