/**
 * DE ENE BRON voor de vraag "staat de dashboard-widget van deze grenzenpot aan?"
 * — en voor de vorm van de pref die daarbij hoort.
 *
 * ── WAAROM DIT EEN EIGEN BESTAND IS ────────────────────────────────────────
 * Een grenzenpot heeft geen catalog-entry (`WIDGET_CATALOG` kent alleen statische
 * id's; `spend_limit:*` staat er bewust niet in — ADR 0092 besluit 1). De
 * zichtbaarheid van zo'n tegel wordt dus door TWEE dingen bepaald die op drie
 * plekken nodig zijn:
 *
 *  · de INJECTIE in `lib/dashboard-data-loader.ts` — elke ACTIEVE pot zonder
 *    opgeslagen pref krijgt er automatisch één (`quarter`, order-offset −300);
 *  · de OPGESLAGEN pref in `profiles.widget_prefs` — de bewuste keuze van de
 *    gebruiker, die de injectie altijd wint.
 *
 * Daaruit volgt de effectieve staat: `pref?.enabled ?? isActive`. Zonder pref is
 * een actieve pot dus zichtbaar (de injectie maakt er straks één) en een
 * gepauzeerde niet (die wordt niet geïnjecteerd).
 *
 * Die regel is nergens uit af te leiden zonder hem opnieuw uit te schrijven, en
 * hij wordt geconsumeerd door:
 *  1. de loader-injectie (`newSpendLimitWidgetPrefs` + `lowestWidgetOrder`),
 *  2. `PATCH /api/spend-limits/[id]/widget` (de schakelaar schrijft de pref),
 *  3. het bewerkformulier (`SpendLimitsSection` → `SpendLimitForm`), dat de
 *     begintoestand van de schakelaar hieruit leest.
 *
 * ── WAAROM AANZETTEN ALTIJD SCHRIJFT ───────────────────────────────────────
 * Een gepauzeerde pot wordt nooit geïnjecteerd. "Aan" mag daarom niet op de
 * injectie leunen maar moet een echte pref opleveren — met exact dezelfde
 * defaults als de injectie, anders landt de teruggezette tegel op een andere
 * plek/maat dan een verse. Vandaar dat `newSpendLimitWidgetPref` hier woont en
 * de loader hem consumeert in plaats van de vorm te herhalen.
 *
 * Puur en server/client-neutraal: geen supabase, geen React.
 */

import { DEFAULT_WIDGET_PREFS, type WidgetPref, type WidgetSize } from '@/lib/widget-catalog'

/** Prefix van elke dynamische grenzenpot-widget-id. */
export const SPEND_LIMIT_WIDGET_PREFIX = 'spend_limit:'

/** Maat van een vers geïnjecteerde/teruggezette grens-tegel. */
export const SPEND_LIMIT_WIDGET_SIZE: WidgetSize = 'quarter'

/**
 * Order-offset t.o.v. de laagste bestaande order. −300 zet een nieuwe grens-tegel
 * bóven de favoriete budgetten (−100) en holdings (−200), dus bovenaan het
 * startscherm. Het getal zelf is verder betekenisloos; alleen de volgorde telt.
 */
export const SPEND_LIMIT_WIDGET_ORDER_OFFSET = -300

/** `spend_limit:<uuid>` — de widget-id van een pot. */
export function spendLimitWidgetId(limitId: string): string {
  return `${SPEND_LIMIT_WIDGET_PREFIX}${limitId}`
}

/**
 * De basis waarop de dynamische injecties hun offset zetten: de laagste order in
 * de huidige prefs, met 0 als plafond zodat een dashboard dat alleen positieve
 * orders kent toch bovenaan begint.
 */
export function lowestWidgetOrder(widgets: readonly WidgetPref[]): number {
  return Math.min(0, ...widgets.map(w => w.order))
}

/** De pref-vorm van een verse grens-tegel (de defaults van de loader-injectie). */
export function newSpendLimitWidgetPref(
  limitId: string,
  lowestOrder: number,
  index = 0,
): WidgetPref {
  return {
    id: spendLimitWidgetId(limitId),
    enabled: true,
    size: SPEND_LIMIT_WIDGET_SIZE,
    order: lowestOrder + SPEND_LIMIT_WIDGET_ORDER_OFFSET + index,
  }
}

/**
 * De loader-injectie: alleen ACTIEVE potten zónder opgeslagen pref krijgen een
 * nieuwe tegel. Een gepauzeerde pot krijgt er geen — en een bestaande pref
 * (inclusief een bewuste `enabled: false`) wordt hier nooit overschreven, zodat
 * "widget weg" een pauze/hervat-cyclus overleeft.
 */
export function newSpendLimitWidgetPrefs(
  spendLimits: readonly { id: string; isActive: boolean }[],
  savedSpendLimitIds: ReadonlySet<string>,
  lowestOrder: number,
): WidgetPref[] {
  return spendLimits
    .filter(s => s.isActive && !savedSpendLimitIds.has(spendLimitWidgetId(s.id)))
    .map((s, i) => newSpendLimitWidgetPref(s.id, lowestOrder, i))
}

/**
 * Effectieve staat van de tegel: de opgeslagen keuze wint, en zonder keuze
 * bepaalt de injectie het (actief = straks zichtbaar, gepauzeerd = niet).
 */
export function isSpendLimitWidgetEnabled(
  widgets: readonly WidgetPref[] | null | undefined,
  limitId: string,
  isActive: boolean,
): boolean {
  const pref = widgets?.find(w => w.id === spendLimitWidgetId(limitId))
  return pref ? pref.enabled : isActive
}

/**
 * Read-modify-write op de widget-prefs: zet één grens-tegel aan of uit en laat
 * al het andere ongemoeid.
 *
 * Twee dingen die hier bewust gebeuren:
 *  · UITzetten schrijft óók een pref wanneer die nog ontbrak. Zonder die rij zou
 *    de loader de tegel bij de volgende bundel gewoon opnieuw injecteren.
 *  · Ontbreken de prefs helemaal (`null` — nooit iets aangepast), dan wordt
 *    eerst de catalogus-standaard gezaaid. Anders zou het schrijven van één
 *    dynamische pref de kolom van "onaangeraakt" naar "dit is de hele indeling"
 *    tillen en de defaults van de gebruiker stil vervangen.
 *
 * Geeft altijd een NIEUWE lijst met nieuwe elementen terug: de bron kan een
 * gedeelde constante zijn (`DEFAULT_WIDGET_PREFS`) en die mag nooit meemuteren.
 */
export function setSpendLimitWidgetEnabled(
  widgets: readonly WidgetPref[] | null | undefined,
  limitId: string,
  enabled: boolean,
): WidgetPref[] {
  const base = (widgets ?? DEFAULT_WIDGET_PREFS.widgets).map(w => ({ ...w }))
  const id = spendLimitWidgetId(limitId)
  if (base.some(w => w.id === id)) {
    return base.map(w => (w.id === id ? { ...w, enabled } : w))
  }
  return [...base, { ...newSpendLimitWidgetPref(limitId, lowestWidgetOrder(base)), enabled }]
}
