export type DomainColor = 'amber' | 'teal' | 'purple'

export type ModuleNavItem = {
  label: string
  href: string
  featureId?: string
}

export type ModuleNavConfig = {
  module: string
  basePath: string
  color: DomainColor
  items: ModuleNavItem[]
}

export const coreNav: ModuleNavConfig = {
  module: 'De Kern',
  basePath: '/core',
  color: 'amber',
  items: [
    { label: 'Overzicht', href: '/core' },
    { label: 'Budgetten', href: '/core/budgets' },
    { label: 'Cash', href: '/core/cash' },
    { label: 'Schulden', href: '/core/debts' },
    { label: 'Assets', href: '/core/assets' },
    { label: 'Belasting', href: '/core/belasting', featureId: 'box3_belasting' },
  ],
}

export const willNav: ModuleNavConfig = {
  module: 'De Wil',
  basePath: '/will',
  color: 'teal',
  items: [
    { label: 'Overzicht', href: '/will' },
  ],
}

export const horizonNav: ModuleNavConfig = {
  module: 'De Horizon',
  basePath: '/horizon',
  color: 'purple',
  items: [
    { label: 'Overzicht', href: '/horizon' },
  ],
}
