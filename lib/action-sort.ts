/**
 * Canonieke volgorde van acties — één formule, één plek (WF-OVZ-20-bug1, 3 sep 2026).
 *
 * De compacte "Open acties"-lijst (`components/app/action-board.tsx`), de
 * "Alle acties"-modal (`components/app/action-list-modal.tsx`, default-sortering),
 * de top-5 op /overzicht (`lib/dashboard-data-loader.ts`) en de server-queries
 * (`lib/fin-data-loader.ts`, de AI-contextbouwers) sorteren allemaal op dezelfde
 * drie sleutels:
 *
 *   1. `priority_score` DESC — hoogste prioriteit bovenaan (`null` telt als 0);
 *   2. `sort_order` ASC — handmatige volgorde binnen gelijke prioriteit;
 *   3. `created_at` DESC — nieuwste eerst bij een volledig gelijkspel.
 *
 * Waarom de derde sleutel: geen enkel aanmaakpad schrijft `sort_order` (DB-default 0),
 * dus drie acties met dezelfde `priority_score` waren een 3-weg gelijkspel zonder
 * derde sleutel — Postgres gaf ze in onbepaalde volgorde terug en de compacte lijst
 * en de modal toonden een ANDERE volgorde voor dezelfde set. Bewust GEEN
 * "max+1"-schrijfpad voor `sort_order` (read-before-write, race bij dubbelklik):
 * `created_at` is altijd gezet en atomair (eigenaarsbesluit 3 sep 2026).
 *
 * Richting van de derde sleutel: NIEUWSTE EERST. Het acceptatiecriterium
 * (UAT-OVZ-20a: "de nieuwe actie komt bovenaan de lijst") én de optimistische
 * `[nieuw, ...prev]`-prepend in het actiebord vragen allebei dat een zojuist
 * toegevoegde actie bij gelijke prioriteit bóven haar even-belangrijke zusters
 * staat — ook na een volledige page-reload.
 */

/** Minimale sleutelset; `priority_score`/`sort_order` mogen als string binnenkomen (MCP/JSON). */
export interface ActionSortKeys {
  priority_score: number | string | null | undefined
  sort_order: number | string | null | undefined
  created_at: string | null | undefined
}

const num = (v: number | string | null | undefined): number => Number(v) || 0

/**
 * Comparator voor `Array.prototype.sort`: priority_score DESC, sort_order ASC,
 * created_at DESC. Deterministisch voor elke set met unieke `created_at`.
 */
export function compareActionsByPriority(a: ActionSortKeys, b: ActionSortKeys): number {
  return (
    num(b.priority_score) - num(a.priority_score) ||
    num(a.sort_order) - num(b.sort_order) ||
    // ISO-8601-tijdstempels sorteren lexicografisch = chronologisch; nieuwste eerst.
    (b.created_at ?? '').localeCompare(a.created_at ?? '')
  )
}

/** Query-builder-vorm die `.order()` chainable aanbiedt (structureel, supabase-js). */
interface Orderable<Q> {
  order(column: string, options?: { ascending?: boolean }): Q
}

/**
 * Past dezelfde drie ORDER BY-sleutels toe op een supabase-query op `actions`, zodat
 * de server-volgorde één-op-één overeenkomt met `compareActionsByPriority`. Voeg
 * eventuele voorgaande sleutels (bv. `status`) vóór deze aanroep toe.
 */
export function applyActionPriorityOrder<Q extends Orderable<Q>>(query: Q): Q {
  return query
    .order('priority_score', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
}
