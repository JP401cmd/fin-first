/**
 * Definitie van de 10 page-type-blueprints + module-override per type.
 * Gedeeld tussen hub-pagina en dynamic [type] route.
 */

export type BlueprintType =
  | 'landing'
  | 'list'
  | 'detail'
  | 'edit'
  | 'modal'
  | 'kassabon'
  | 'wizard'
  | 'settings'
  | 'empty'
  | 'calculator'
  | 'app-budgetteren'

export type ModuleKey = 'kern' | 'wil' | 'horizon' | 'cross'

export interface BlueprintMeta {
  type: BlueprintType
  number: string
  title: string
  italicEm: string
  kicker: string
  description: string
  module: ModuleKey
  routeExample: string
  /** Categorisering voor de hub-pagina. */
  group: 'page-type' | 'app'
}

export const BLUEPRINTS: BlueprintMeta[] = [
  {
    type: 'landing',
    number: 'i.',
    title: 'Module-landing',
    italicEm: 'landing',
    kicker: 'Type 1',
    description:
      'Hero + categorie-overzicht. Eerste indruk van een module of feed.',
    module: 'kern',
    routeExample: '/core, /will, /horizon, /dashboard',
    group: 'page-type',
  },
  {
    type: 'list',
    number: 'ii.',
    title: 'Categorie-pagina',
    italicEm: 'lijst',
    kicker: 'Type 2',
    description:
      'Lijst van entiteiten binnen één categorie. Mini-hero + cards-grid.',
    module: 'kern',
    routeExample: '/core/assets/cash, /core/budgets',
    group: 'page-type',
  },
  {
    type: 'detail',
    number: 'iii.',
    title: 'Detail-pagina',
    italicEm: 'detail',
    kicker: 'Type 3',
    description:
      'Single entity view met hoofdwaarde-highlight, KPI-strip, transactiehistorie.',
    module: 'kern',
    routeExample: '/core/assets/cash/[id], /core/budgets/[id]',
    group: 'page-type',
  },
  {
    type: 'edit',
    number: 'iv.',
    title: 'Bewerk / Create',
    italicEm: 'bewerken',
    kicker: 'Type 4',
    description:
      'Form-flow met section-labels, validatie, sticky save-bar en voorwaartse CTA.',
    module: 'kern',
    routeExample: '/core/budgets/new, /core/budgets/[id]/edit',
    group: 'page-type',
  },
  {
    type: 'modal',
    number: 'v.',
    title: 'Modal / Sheet',
    italicEm: 'modal',
    kicker: 'Type 5',
    description:
      'Bottom-sheet of centered-modal met duo-CTA. Focus-trap verplicht.',
    module: 'wil',
    routeExample: 'recommendation-modal, account-form-modal',
    group: 'page-type',
  },
  {
    type: 'kassabon',
    number: 'vi.',
    title: 'Kassabon',
    italicEm: 'rekening',
    kicker: 'Type 6',
    description:
      'Financiële uitkomst als rekening: callout + pull-quote + figures-strip + breakdown.',
    module: 'horizon',
    routeExample: 'box3-scenario-modal, hypotheek-vs-beleggen-modal',
    group: 'page-type',
  },
  {
    type: 'wizard',
    number: 'vii.',
    title: 'Wizard',
    italicEm: 'flow',
    kicker: 'Type 7',
    description:
      'Multi-step met romeinse stappen-balk, progress-bar en navigatie-balk.',
    module: 'kern',
    routeExample: '/core/checkin, /identity/gids',
    group: 'page-type',
  },
  {
    type: 'settings',
    number: 'viii.',
    title: 'Settings',
    italicEm: 'voorkeuren',
    kicker: 'Type 8',
    description:
      'Voorkeuren-pagina met tabs, autosave en card-editorial per groep.',
    module: 'cross',
    routeExample: '/mijn, /mijn/profiel',
    group: 'page-type',
  },
  {
    type: 'empty',
    number: 'ix.',
    title: 'Empty-state',
    italicEm: 'leeg',
    kicker: 'Type 9',
    description:
      'Universeel patroon voor lege lijst, eerste-gebruik, no-results.',
    module: 'cross',
    routeExample: 'overal — list, detail, dashboard',
    group: 'page-type',
  },
  {
    type: 'calculator',
    number: 'x.',
    title: 'Calculator',
    italicEm: 'rekenmodel',
    kicker: 'Type 10',
    description:
      'Volledig WOZ-blueprint: masthead + 2-koloms grid + comparison + footer-notes.',
    module: 'horizon',
    routeExample: '/horizon/whatif',
    group: 'page-type',
  },
  {
    type: 'app-budgetteren',
    number: 'app · 1',
    title: 'App: Budgetteren',
    italicEm: 'budget',
    kicker: 'App',
    description:
      'Envelope-budgetting binnen Cash. Maand-cyclus, potjes per categorie, AI-categorisering.',
    module: 'kern',
    routeExample: '/core/budgets, /core/assets/cash?tab=budget',
    group: 'app',
  },
]

export const BLUEPRINT_BY_TYPE: Record<BlueprintType, BlueprintMeta> =
  Object.fromEntries(BLUEPRINTS.map((b) => [b.type, b])) as Record<
    BlueprintType,
    BlueprintMeta
  >

/** Inline-style die de `--module-active-*` variabelen mapt op een module-palet.
 *  Uitzondering: `--module-active-200` wordt gebruikt voor highlight-marker en valt
 *  op cross-module-pagina's terug op Horizon-200 (universele uitkomst-marker). */
export function moduleStyle(module: ModuleKey): React.CSSProperties {
  if (module === 'cross') {
    return {
      '--module-active-50': 'var(--ink-4)',
      '--module-active-100': 'var(--ink-4)',
      // Highlight-marker fallback — Horizon-200 als universele uitkomst-marker
      '--module-active-200': 'var(--color-horizon-200)',
      '--module-active-300': 'var(--ink-3)',
      '--module-active-400': 'var(--ink-3)',
      '--module-active-500': 'var(--ink-2)',
      '--module-active-600': 'var(--ink-2)',
      '--module-active-700': 'var(--ink)',
      '--module-active-800': 'var(--ink)',
      '--module-active-900': 'var(--ink)',
      '--module-active-950': 'var(--ink)',
    } as React.CSSProperties
  }
  const prefix = `var(--color-${module}`
  const shades = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']
  return Object.fromEntries(
    shades.map((shade) => [`--module-active-${shade}`, `${prefix}-${shade})`])
  ) as React.CSSProperties
}
