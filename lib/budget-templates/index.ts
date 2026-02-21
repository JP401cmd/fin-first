import { getStarterBudgets } from './starter'
import { getGezinBudgets } from './gezin'
import { getZzpBudgets } from './zzp'
import { getPensioenBudgets } from './pensioen'

export type SeedBudget = {
  name: string
  slug: string
  icon: string
  description: string
  default_limit: number
  budget_type: 'income' | 'expense' | 'savings' | 'debt' | 'archive'
  is_essential: boolean
  priority_score: number
  sort_order: number
  children?: {
    name: string
    slug: string
    icon: string
    description: string
    default_limit: number
  }[]
}

export type BudgetTemplate = {
  id: 'starter' | 'gezin' | 'zzp' | 'pensioen'
  name: string
  description: string
  icon: string  // Lucide icon name
  getBudgets: () => SeedBudget[]
}

export const BUDGET_TEMPLATES: BudgetTemplate[] = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'Alleenstaand, huur, geen auto',
    icon: 'User',
    getBudgets: getStarterBudgets,
  },
  {
    id: 'gezin',
    name: 'Gezin',
    description: 'Met kinderen, hogere lasten',
    icon: 'Users',
    getBudgets: getGezinBudgets,
  },
  {
    id: 'zzp',
    name: 'ZZP',
    description: 'Zelfstandig, onregelmatig inkomen',
    icon: 'Briefcase',
    getBudgets: getZzpBudgets,
  },
  {
    id: 'pensioen',
    name: 'Pensioen',
    description: 'Gepensioneerd, meer vrije tijd',
    icon: 'Sunset',
    getBudgets: getPensioenBudgets,
  },
]
