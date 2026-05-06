// Public types voor het ⌘K command-palette systeem.
//
// Drie lagen: navigation (statisch), entity (dynamisch via API), action (statisch).
// Alle items implementeren `CommandItem` zodat ze door één UI-componentboom
// gerenderd en gerankt kunnen worden.

import type { LucideIcon } from 'lucide-react'
import type { ModuleId, NavModule } from '@/lib/module-registry'

export type CommandKind = 'page' | 'item' | 'action'

export type CommandSection =
  | 'recent'
  | 'pages'
  | 'items'
  | 'actions'

/**
 * Module-context-tag op een result-row. Bepaalt accent-kleur + (optioneel) een
 * tekst-badge. NavModule (`kern|wil|horizon`) is de meest voorkomende; `beheer`
 * en `globaal` zijn UI-only labels (geen runtime module-eis).
 */
export type CommandModuleContext = NavModule | 'beheer' | 'globaal'

export type CommandItem = {
  /** Stable, unique id — gebruikt voor key + recents-dedupe. */
  id: string
  kind: CommandKind
  /** Hoofdtekst. */
  label: string
  /** Subtekst, bv. "Kern · Cash" of "Schuld · Hypotheek". */
  sublabel?: string
  /** Optioneel icoon (Lucide). */
  icon?: LucideIcon
  /** Module-context — bepaalt het accent-streep-kleurtje + zichtbaarheid bij gating. */
  module?: CommandModuleContext
  /** Module-id die actief moet zijn om dit item te tonen (alleen pages/actions). */
  requiredModule?: ModuleId
  /** Waar het item naar navigeert. Mutually exclusive met `run`. */
  href?: string
  /**
   * Programmatische runner. Mutually exclusive met `href`. De provider sluit
   * de palette automatisch ná run; de runner mag z'n eigen router-push doen.
   */
  run?: () => void | Promise<void>
}

/** Resultaat van entity-search API. */
export type EntitySearchResponse = {
  results: CommandItem[]
}

/** Recent-entry zoals opgeslagen in localStorage. */
export type RecentEntry = {
  id: string
  kind: CommandKind
  label: string
  sublabel?: string
  /** ms-timestamp — voor LRU-sortering. */
  ts: number
  /** Alleen voor `kind: 'page' | 'item'`. Acties hergebruiken het statische register. */
  href?: string
  module?: CommandModuleContext
}
