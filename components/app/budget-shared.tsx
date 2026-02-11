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

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatCurrencyDecimals(value: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export type BudgetType = 'income' | 'expense' | 'savings'

export function formatRollover(amount: number, type: string): string {
  if (amount <= 0) return ''
  const formatted = formatCurrency(amount)
  switch (type) {
    case 'carry-over':
      return `+${formatted} doorgeschoven`
    case 'invest-sweep':
      return `${formatted} belegd`
    default:
      return ''
  }
}

export function getTypeColors(budgetType: BudgetType) {
  switch (budgetType) {
    case 'income':
      return {
        bg: 'bg-emerald-50',
        bgDark: 'bg-emerald-100',
        text: 'text-emerald-600',
        textLight: 'text-emerald-500',
        border: 'border-emerald-200',
        barDefault: 'bg-emerald-400',
        barWarning: 'bg-emerald-500',
        barLight: 'bg-emerald-200',
        headerGradient: 'from-emerald-50 to-white',
        hoverBorder: 'hover:border-emerald-200',
        hoverBg: 'hover:bg-emerald-50/30',
        buttonBg: 'bg-emerald-600 hover:bg-emerald-700',
        gradient: 'from-emerald-50 to-white',
        barWarn: 'bg-emerald-500',
        spinner: 'border-emerald-500',
        hex: '#10b981',
        hexLight: '#6ee7b7',
      }
    case 'savings':
      return {
        bg: 'bg-blue-50',
        bgDark: 'bg-blue-100',
        text: 'text-blue-600',
        textLight: 'text-blue-500',
        border: 'border-blue-200',
        barDefault: 'bg-blue-400',
        barWarning: 'bg-blue-500',
        barLight: 'bg-blue-200',
        headerGradient: 'from-blue-50 to-white',
        hoverBorder: 'hover:border-blue-200',
        hoverBg: 'hover:bg-blue-50/30',
        buttonBg: 'bg-blue-600 hover:bg-blue-700',
        gradient: 'from-blue-50 to-white',
        barWarn: 'bg-blue-500',
        spinner: 'border-blue-500',
        hex: '#3b82f6',
        hexLight: '#93c5fd',
      }
    default:
      return {
        bg: 'bg-amber-50',
        bgDark: 'bg-amber-100',
        text: 'text-amber-600',
        textLight: 'text-amber-500',
        border: 'border-amber-200',
        barDefault: 'bg-amber-400',
        barWarning: 'bg-amber-500',
        barLight: 'bg-amber-200',
        headerGradient: 'from-amber-50 to-white',
        hoverBorder: 'hover:border-amber-200',
        hoverBg: 'hover:bg-amber-50/30',
        buttonBg: 'bg-amber-600 hover:bg-amber-700',
        gradient: 'from-amber-50 to-white',
        barWarn: 'bg-amber-500',
        spinner: 'border-amber-500',
        hex: '#f59e0b',
        hexLight: '#fcd34d',
      }
  }
}
