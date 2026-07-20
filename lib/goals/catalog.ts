// ── Goal Catalog ────────────────────────────────────────────────────────
// Bron van waarheid voor de 6 outcome-georiënteerde doelen die in onboarding
// getoond worden, en de mapping naar de modules die elke goal onder water
// activeert.

import type { GoalCatalogEntry, GoalSlug } from './types'
import type { IntentId } from '@/lib/module-registry'

// ── Catalog Entries ─────────────────────────────────────────────────────

export const GOAL_CATALOG_ENTRIES: readonly GoalCatalogEntry[] = [
  {
    slug: 'bewust-leven',
    label: 'Financieel bewust leven',
    tagline: 'Routine en reflectie',
    description: 'Ik wil rustig en bewust met geld omgaan, met persoonlijke tips',
    icon: 'Sparkles',
    emoji: '✨',
    primary: true,
    modulesPreset: ['budgetteren', 'inzicht_acties'],
  },
  {
    slug: 'grip-uitgaven',
    label: 'Grip op je uitgaven',
    tagline: 'Budgetteren en besparen',
    description: 'Ik wil weten waar mijn geld naartoe gaat en bewuster uitgeven',
    icon: 'Wallet',
    emoji: '🎯',
    modulesPreset: ['budgetteren'],
  },
  {
    slug: 'vermogen-overzicht',
    label: 'Overzicht over je vermogen',
    tagline: 'Bezittingen en schulden',
    description: 'Ik wil al mijn bezittingen en schulden op één plek zien',
    icon: 'PieChart',
    emoji: '📊',
    modulesPreset: ['vermogensregistratie'],
  },
  {
    slug: 'noodfonds',
    label: 'Bouw een buffer',
    tagline: 'Veiligheidsbuffer opbouwen',
    description: 'Ik wil 3-6 maanden vaste lasten opzij zetten als buffer',
    icon: 'ShieldCheck',
    emoji: '🛡️',
    modulesPreset: ['budgetteren', 'inzicht_acties'],
  },
  {
    slug: 'schulden-aflossen',
    label: 'Los je schulden af',
    tagline: 'Versnel je aflossing',
    description: 'Ik wil mijn schulden gestructureerd aflossen en de impact zien',
    icon: 'CreditCard',
    emoji: '💳',
    modulesPreset: ['vermogensregistratie', 'inzicht_acties'],
  },
  {
    slug: 'eerder-stoppen',
    label: 'Eerder stoppen met werken',
    tagline: 'Pensioen en FIRE',
    description: 'Ik wil weten wanneer ik financieel vrij ben en scenario’s doorrekenen',
    icon: 'Compass',
    emoji: '🔭',
    modulesPreset: ['vermogensregistratie', 'toekomstplannen', 'inzicht_acties'],
  },
] as const

// ── Lookup map (id → entry) ─────────────────────────────────────────────

export const GOAL_CATALOG: Record<GoalSlug, GoalCatalogEntry> =
  Object.fromEntries(GOAL_CATALOG_ENTRIES.map((e) => [e.slug, e])) as Record<
    GoalSlug,
    GoalCatalogEntry
  >

// ── Display order voor onboarding-grid ──────────────────────────────────

export const GOAL_DISPLAY_ORDER: readonly GoalSlug[] = GOAL_CATALOG_ENTRIES.map(
  (e) => e.slug,
) as readonly GoalSlug[]

// ── Helpers ─────────────────────────────────────────────────────────────

/** Korte labels voor admin- en debug-UI's */
export const GOAL_LABELS: Record<GoalSlug, string> = Object.fromEntries(
  GOAL_CATALOG_ENTRIES.map((e) => [e.slug, e.label]),
) as Record<GoalSlug, string>

/** Modulesets per goal — gebruikt door save-onboarding-route */
export const GOAL_MODULE_PRESETS: Record<GoalSlug, GoalCatalogEntry['modulesPreset']> =
  Object.fromEntries(GOAL_CATALOG_ENTRIES.map((e) => [e.slug, e.modulesPreset])) as Record<
    GoalSlug,
    GoalCatalogEntry['modulesPreset']
  >

/**
 * Best-effort fallback van een legacy `onboarding_intent` naar een goal.
 * Gebruikt door /will om bestaande gebruikers een doel-suggestie te geven
 * bij eerste bezoek na deze deploy.
 */
export const INTENT_TO_GOAL_FALLBACK: Record<IntentId, GoalSlug | null> = {
  coaching: 'bewust-leven',
  grip_uitgaven: 'grip-uitgaven',
  overzicht_geld: 'vermogen-overzicht',
  toekomst: 'eerder-stoppen',
  alles: 'eerder-stoppen',
  nieuws: null,
}

/** Spreektekst voor Fin-mascotte na keuze */
export const GOAL_SPEECH_TEXT: Record<GoalSlug, string> = {
  'grip-uitgaven':
    'Slim! Ik breng je direct naar je budgetten en cashflow.',
  'vermogen-overzicht':
    'Overzicht is de basis! We beginnen bij je bezittingen en schulden.',
  noodfonds:
    'Een buffer geeft rust. Ik help je doel berekenen en bouwen.',
  'schulden-aflossen':
    'Goede stap. We sorteren op rente en versnellen je aflossing.',
  'eerder-stoppen':
    'Toekomstgericht! Ik breng je naar je vrijheidsprojectie.',
  'bewust-leven':
    'Mooi voornemen. Ik begeleid je stap voor stap met persoonlijke tips.',
}

/** Pre-keuze speech text — getoond zolang er nog niets gekozen is */
export const GOAL_DEFAULT_SPEECH =
  'Wat is jouw belangrijkste doel? Ik help je stap voor stap richting dat doel.'

/**
 * Eerste-bezoek-pagina ná onboarding op basis van het gekozen doel. Mirror
 * van getFirstWinPath() in module-registry maar nu goal-georiënteerd.
 */
export function getGoalFirstWinPath(slug: GoalSlug): string {
  switch (slug) {
    case 'grip-uitgaven':
      return '/core/budgets'
    case 'vermogen-overzicht':
      return '/core'
    case 'noodfonds':
      return '/will'
    case 'schulden-aflossen':
      return '/core/debts'
    case 'eerder-stoppen':
      return '/horizon'
    case 'bewust-leven':
      return '/will'
  }
}

/** Type-guard voor onbekende strings (zoals een localStorage-veld) */
export function isGoalSlug(value: unknown): value is GoalSlug {
  return (
    typeof value === 'string' &&
    (GOAL_DISPLAY_ORDER as readonly string[]).includes(value)
  )
}
