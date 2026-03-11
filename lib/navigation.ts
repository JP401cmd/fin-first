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

export const identityNav: ModuleNavConfig = {
  module: 'Identiteit',
  basePath: '/identity',
  color: 'teal',
  items: [
    { label: 'Overzicht', href: '/identity' },
    { label: 'Profiel', href: '/identity/profiel' },
    { label: 'Gids', href: '/identity/gids' },
    { label: 'Instellingen', href: '/identity/instellingen' },
    { label: 'Delen', href: '/identity/delen' },
  ],
}
