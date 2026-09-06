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

/**
 * Canonieke /mijn-navigatie \u2014 tab-balk binnen de Mijn-sectie
 * (app/(app)/mijn/layout.tsx). Hoofd-navigatie leeft in lib/nav-config.ts.
 */
export const mijnNav: ModuleNavConfig = {
  module: 'Mijn',
  basePath: '/mijn',
  color: 'teal',
  items: [
    { label: 'Overzicht', href: '/mijn' },
    { label: 'Profiel', href: '/mijn/profiel' },
    { label: 'Account', href: '/mijn/account' },
    { label: 'Notificaties', href: '/mijn/notificaties' },
    { label: 'Weergave en uiterlijk', href: '/mijn/uiterlijk' },
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
  // Trigger voor de rekenmodal "Zo is het rendement berekend"
  // (components/core/asset-return-modal.tsx) op
  // `/overzicht/bezittingen?rendementUitleg=open`. Kaart H7: die uitleg hing aan
  // precies één knop op precies één pagina, terwijl het woord "rendement" op vijf
  // andere plekken staat. De dashboard-widgets linken hier nu heen, zodat elk
  // rendementsgetal bij dezelfde uitleg uitkomt in plaats van dat de modal
  // gekopieerd wordt naar elke widget. Sheet-achtige overlay, dus (net als
  // planEditor/newBudget) géén PANE_QUERY_KEY, wél een trigger.
  rendementUitleg: 'rendementUitleg',
  tab:           'tab',
  edit:          'edit',
  via:           'via',
  month:         'month',
} as const

export type OverlayQueryKey = keyof typeof OVERLAY_QUERY_KEYS

/** Welke keys daadwerkelijk een pane-overlay openen. `tab` is in-page; `edit/via/month` zijn modifier/transient. */
export const PANE_QUERY_KEYS = ['budget', 'debt', 'asset', 'cryptoHolding', 'holding', 'strategie', 'uitgaven', 'event', 'horizonSetup'] as const satisfies readonly OverlayQueryKey[]

/**
 * Keys die bij binnenkomst op een pagina AUTOMATISCH een overlay/pane/sheet
 * openen: de pane-keys plus de sheet-triggers (`planEditor`, `newBudget`).
 * Bewust NIET meegenomen: `tab` (in-page, moet behouden blijven op embed-
 * routes zoals `/core/assets/cash?tab=budgetteren`) en de modifier/transient-
 * keys `edit/via/month`.
 *
 * Gebruikt om na een setup-completion (AppSetupGate → router.refresh()) de
 * binnengekomen trigger-param(s) op te ruimen, zodat de zojuist ontgrendelde
 * pagina kaal opent i.p.v. per ongeluk de overlay te openen.
 */
export const OVERLAY_TRIGGER_KEYS = [...PANE_QUERY_KEYS, 'planEditor', 'newBudget', 'rendementUitleg'] as const satisfies readonly OverlayQueryKey[]

/** De actuele URL-param-namen (values) die een overlay auto-openen — voor whitelist-based strippen uit een query-string. */
export const OVERLAY_TRIGGER_PARAMS: readonly string[] = OVERLAY_TRIGGER_KEYS.map(
  (key) => OVERLAY_QUERY_KEYS[key],
)

/**
 * Het CANONIEKE pad van de budgetpagina — de enige route die `BudgetsClient`
 * rendert en dus de `?budget=` / `?newBudget=`-params leest.
 *
 * Het legacy-pad `/core/budgets` is géén alternatief. Het redirect in
 * `next.config.ts` sinds ADR 0135 wél naar deze route, maar Next matcht een
 * statische redirect op de PATHNAME: de query telt niet mee voor de match en
 * wordt ongebruikt doorgeplakt. Bouw een deeplink daarom altijd op deze
 * constante, niet op het legacy-pad. (Vóór ADR 0135 landde die tussenstap
 * bovendien op de cashflow-hub — één niveau te hoog, mét een dode
 * `?budget=`-param in de adresbalk; UAT WF-BUDGET-23.)
 */
export const BUDGET_PAGE_PATH = '/overzicht/budget'

/** Deeplink naar de budgetpagina met het detailpaneel van dit budget open. */
export function budgetDetailUrl(id: string): string {
  return `${BUDGET_PAGE_PATH}?${OVERLAY_QUERY_KEYS.budget}=${encodeURIComponent(id)}`
}

/** Deeplink naar de budgetpagina met het bewerk-paneel van dit budget open. */
export function budgetEditUrl(id: string): string {
  return `${budgetDetailUrl(id)}&${OVERLAY_QUERY_KEYS.edit}=true`
}

/** Deeplink naar de budgetpagina met de "Nieuw budget"-pane open. */
export function newBudgetUrl(): string {
  return `${BUDGET_PAGE_PATH}?${OVERLAY_QUERY_KEYS.newBudget}=true`
}
