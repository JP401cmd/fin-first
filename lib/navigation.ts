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
  module: 'Tips & acties',
  basePath: '/will',
  color: 'teal',
  items: [
    { label: 'Overzicht', href: '/will' },
  ],
}

export const horizonNav: ModuleNavConfig = {
  module: 'Toekomst',
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
    { label: 'Instellingen', href: '/identity/instellingen' },
    { label: 'Koppelingen', href: '/identity/koppelingen' },
  ],
}

/**
 * Canonieke /mijn-navigatie. Sub-route-stubs (notificaties, uiterlijk,
 * privacy, geavanceerd) redirecten naar legacy /identity/instellingen
 * met de juiste tab geopend \u2014 totdat de monster-pagina is opgesplitst.
 */
export const mijnNav: ModuleNavConfig = {
  module: 'Mijn',
  basePath: '/mijn',
  color: 'teal',
  items: [
    { label: 'Overzicht', href: '/mijn' },
    { label: 'Profiel', href: '/mijn/profiel' },
    { label: 'Notificaties', href: '/mijn/notificaties' },
    { label: 'Uiterlijk', href: '/mijn/uiterlijk' },
    { label: 'Privacy', href: '/mijn/privacy' },
    { label: 'Koppelingen', href: '/mijn/koppelingen' },
    { label: 'Geavanceerd', href: '/mijn/geavanceerd' },
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
  budget:        'budget',
  debt:          'debt',
  asset:         'asset',
  // Eén-coin pane op `/core/assets/crypto?tab=crypto-holdings`. Bewust een
  // eigen sleutel (niet `asset`) omdat de detail-pane één crypto-holding
  // toont — niet de parent-asset — en omdat `?asset=…` al in gebruik is
  // door `AssetPane` op de items-tab van dezelfde categorie. Twee panes
  // tegelijk via dezelfde key zou ze tegen elkaar laten openen.
  cryptoHolding: 'crypto',
  // Eén-positie pane op `/core/assets/holdings` en
  // `/core/assets/investment?tab=holdings`. Symmetrisch met `cryptoHolding`
  // maar dan voor investment-holdings (aandelen/ETF/fondsen). Eigen sleutel
  // ipv `asset` omdat de pane één holding-rij toont — niet de parent-asset
  // — en `?asset=…` op dezelfde categorie-pagina al gebruikt wordt door
  // `AssetPane` op de items-tab.
  holding:       'holding',
  strategie:     'strategie',
  uitgaven:      'uitgaven',
  event:         'event',
  // Trigger voor BudgetPlanEditorSheet binnen de Budgetteren-app. Wordt
  // gezet door de in-app bottom-bar "Plan"-knop op `/core/assets/cash?tab=
  // budgetteren&planEditor=true`. BudgetsClient leest dit en opent de sheet;
  // bij close wordt de param weggehaald. Geen pane-overlay maar een sheet —
  // daarom bewust niet in PANE_QUERY_KEYS opgenomen.
  planEditor:    'planEditor',
  // Trigger voor de uitgebreide BudgetForm in een pane (`<ShellOverlay
  // kind="pane">`) op `/core/budgets?newBudget=true` en
  // `/core/assets/cash?tab=budgetteren&newBudget=true`. Geopend vanuit de
  // "+ Nieuw budget"-CTA in de planeditor-toolbar én vanuit de oude
  // /core/budgets/new-route die nu een redirect is. Eigen sleutel (niet `new`)
  // om collisies met toekomstige create-flows op andere pagina's te vermijden.
  newBudget:     'newBudget',
  // Trigger voor de Horizon-prognose setup-pane (ShellOverlay kind="pane")
  // op `/horizon?horizonSetup=open`. Geopend vanuit de intro-card die de
  // hoofd-grafiek vervangt zolang de gebruiker de basis-instellingen-pane
  // nog niet doorlopen + opgeslagen heeft. Bij close wordt de param
  // weggehaald (horizon-client cleant URL na mount).
  horizonSetup:  'horizonSetup',
  tab:           'tab',
  edit:          'edit',
  via:           'via',
  month:         'month',
} as const

export type OverlayQueryKey = keyof typeof OVERLAY_QUERY_KEYS

/** Welke keys daadwerkelijk een pane-overlay openen. `tab` is in-page; `edit/via/month` zijn modifier/transient. */
export const PANE_QUERY_KEYS = ['budget', 'debt', 'asset', 'cryptoHolding', 'holding', 'strategie', 'uitgaven', 'event', 'horizonSetup'] as const satisfies readonly OverlayQueryKey[]
