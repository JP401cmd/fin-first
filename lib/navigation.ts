export type DomainColor = 'amber' | 'teal' | 'purple'

export type ModuleNavItem = {
  label: string
  href: string
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
  ],
}

export const willNav: ModuleNavConfig = {
  module: 'De Wil',
  basePath: '/will',
  color: 'teal',
  items: [
    { label: 'Overzicht', href: '/will' },
    { label: 'Acties', href: '/will/actions' },
    { label: 'Doelen', href: '/will/goals' },
    { label: "Scenario's", href: '/will/scenarios' },
    { label: 'Optimalisatie', href: '/will/optimization' },
  ],
}

export const horizonNav: ModuleNavConfig = {
  module: 'De Horizon',
  basePath: '/horizon',
  color: 'purple',
  items: [
    { label: 'Overzicht', href: '/horizon' },
    { label: 'Projecties', href: '/horizon/projections' },
    { label: "Scenario's", href: '/horizon/scenarios' },
    { label: 'Tijdlijn', href: '/horizon/timeline' },
    { label: 'Simulaties', href: '/horizon/simulations' },
    { label: 'Opnamestrategie', href: '/horizon/withdrawal' },
  ],
}
