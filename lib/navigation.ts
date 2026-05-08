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
    { label: 'Uitgave na pensioen', href: '/horizon?uitgaven=open' },
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
    { label: 'Koppelingen', href: '/identity/koppelingen' },
    { label: 'Testscenario\u2019s', href: '/identity/testscenarios' },
    { label: 'Delen', href: '/identity/delen' },
  ],
}

/**
 * Canonical query-state keys voor overlays/panes en in-page-state.
 * Pane luistert op: budget | debt | asset | strategie.
 * In-page (geen overlay): tab.
 * Compositie / transient: edit | via | month.
 *
 * Reden om te centraliseren: voorkomt typos en magic strings verspreid door
 * de codebase (huidige call-sites: holdings-client.tsx:83, budgets-client,
 * debts-client, horizon strategie-modal).
 */
export const OVERLAY_QUERY_KEYS = {
  budget:    'budget',
  debt:      'debt',
  asset:     'asset',
  strategie: 'strategie',
  uitgaven:  'uitgaven',
  event:     'event',
  tab:       'tab',
  edit:      'edit',
  via:       'via',
  month:     'month',
} as const

export type OverlayQueryKey = keyof typeof OVERLAY_QUERY_KEYS

/** Welke keys daadwerkelijk een pane-overlay openen. `tab` is in-page; `edit/via/month` zijn modifier/transient. */
export const PANE_QUERY_KEYS = ['budget', 'debt', 'asset', 'strategie', 'uitgaven', 'event'] as const satisfies readonly OverlayQueryKey[]
