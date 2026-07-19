// ── Category deepening keys ──────────────────────────────────
//
// Pure key-/activatie-laag van de category-deepening-registry: de types, de
// entry-data (`CATEGORY_DEEPENINGS`) en alle helpers die géén tab-component
// nodig hebben (`findDeepenings`, `getDeepeningSlug`, `getActiveAppKeys`,
// `countTrackedItems`, …).
//
// Waarom apart van `components/core/category-deepening-registry.ts`? Die
// registry importeert vier zware client-tab-componenten (holdings, crypto,
// hypotheekplanner, verhuurrendement) statisch. `app/(app)/layout.tsx` en
// `lib/category-app-nav.ts` renderen de shell op ELKE (app)-route en hebben
// alléén de keys nodig — niet de componenten. Door de keys hier zonder enige
// component-import te plaatsen, blijft de domein-UI uit de layout-chunkgroep
// van alle app-pagina's (perf-fase-1, Task 1.2).
//
// De registry importeert deze keys terug, voegt alleen de component-mapping
// (`getDeepeningComponent`) toe en re-exporteert alles hier, zodat bestaande
// consumers ongewijzigd blijven werken.

import type { Asset, AssetType } from '@/lib/asset-data'
import type { Debt, DebtType } from '@/lib/debt-data'
import type { ModuleId } from '@/lib/module-registry'

// ── Types ────────────────────────────────────────────────────

/** Props die elke verdiepings-tab ontvangt vanuit de categorie-pagina. */
export interface DeepeningTabProps {
  /** Het concrete asset- of debt-type van de huidige categorie. */
  type: AssetType | DebtType
  /** Of de bijbehorende module actief is. Bij `false` toont de tab uitleg + tip. */
  moduleActive: boolean
  /**
   * Optionele server-geladen module-data die de tab kan doorgeven aan de
   * onderliggende full-feature client (bv. `<BudgetsClient initialData={…} />`).
   *
   * Bewust `unknown` zodat de registry-laag generiek blijft — elke concrete
   * tab cast zelf naar zijn eigen verwachte shape (zoals `BudgetsPageData`
   * voor cash of `HoldingsPageData` voor investment). Hiermee voorkomen we
   * dat de registry een union van alle module-data types moet kennen.
   */
  initialData?: unknown
}

export interface DeepeningEntry {
  /** Het asset- of debt-type waar deze verdieping bij hoort. */
  type: AssetType | DebtType
  /** Asset of schuld? (bepaalt welk register doorzocht wordt) */
  kind: 'asset' | 'debt'
  /** Tab-label, sentence case (bijv. "Budgetteren", "Holdings"). */
  label: string
  /** Module die actief moet zijn om de tab inhoud te laten zien. */
  moduleId: ModuleId
  /**
   * Fallback-tekst voor de tip-strip wanneer de module uit staat.
   * Actieve stem, geen uitroepteken, krant-toon.
   */
  tipStripCopy: string
  /**
   * Bepaalt of een specifiek item door deze app wordt gevolgd. Leest een
   * boolean op de asset/debt zelf — geen separate state, geen junction.
   *
   * Voor cash → `Asset.has_budget_tracking`. Voor investment → `Asset.has_holdings_tracking`.
   * Toekomstige apps voegen hier hun eigen veld toe; de architectuur-regel
   * blijft: het bezit (asset/debt) bepaalt de app-koppeling, niet andersom.
   */
  isItemTracked?: (item: Asset | Debt) => boolean
  /**
   * API-endpoint voor het togglen van de koppeling. Gebruikt door de
   * detail-sheet (niet voor quick-toggles op kaart-niveau — instellingen
   * worden bewust met meer friction aangepast).
   */
  toggleEndpoint?: string
}

// ── Registry ─────────────────────────────────────────────────

/**
 * De volledige lijst van bekende verdiepingen. Eén of meer entries per
 * (type, kind) — meerdere entries betekent dat een categorie meerdere apps
 * heeft. De volgorde in de array bepaalt de volgorde van de tabs op de
 * categorie-pagina.
 *
 * Aflosstrategie heeft geen entry: sinds de v2-refactor leeft die als globale
 * "Schuldenprofiel & Aflosroute"-kaart op `/core/debts` (zie
 * `app/(app)/core/debts/page.tsx`). Hypotheekplanner blijft per-debt
 * (mortgage-only) via `has_hypotheekplanner_tracking`.
 */
export const CATEGORY_DEEPENINGS: DeepeningEntry[] = [
  {
    type: 'investment',
    kind: 'asset',
    label: 'Aandelen holdings',
    moduleId: 'aandelenregistratie',
    tipStripCopy:
      'Activeer Aandelenregistratie om individuele holdings, koersen en dagrendement bij te houden.',
    isItemTracked: (item) =>
      'has_holdings_tracking' in item && item.has_holdings_tracking === true,
    toggleEndpoint: '/api/assets/toggle-holdings',
  },
  // ── Crypto holdings ──────────────────────────────────────────
  // Symmetrisch met de investment-app, maar bewust eigen label
  // ("Crypto holdings") zodat de sidebar-slug niet collidet met
  // 'aandelen-holdings'. Beide apps delen wel `moduleId` —
  // gebruikers die aandelen-/cryptoregistratie aanzetten krijgen
  // direct beide apps. Voor crypto bouwt de tab zelf een lichte
  // allocation-overview op de typed CryptoHoldingRow's.
  {
    type: 'crypto',
    kind: 'asset',
    label: 'Crypto holdings',
    moduleId: 'aandelenregistratie',
    tipStripCopy:
      'Activeer aandelen- en cryptoregistratie voor het volledige coin-overzicht per exchange of wallet.',
    // Symmetrisch met de investment-entry: crypto-assets dragen dezelfde
    // `has_holdings_tracking`-vlag (zie `assets-client.tsx` waar de vlag voor
    // crypto netjes wordt weggeschreven). Daarmee telt `countTrackedItems`
    // de Kern-landing-strip correct als 1/N zodra een crypto-asset is
    // geactiveerd voor Holdings.
    isItemTracked: (item) =>
      'has_holdings_tracking' in item && item.has_holdings_tracking === true,
    toggleEndpoint: '/api/assets/toggle-holdings',
  },
  // ── Hypotheekplanner — twee entries ────────────────────────
  // Eén op de `mortgage` (debt) categorie, één op het `eigen_huis` (asset).
  // Beide leiden tot dezelfde `<HypotheekplannerTab>`-component, maar via
  // een ander `isItemTracked`/`toggleEndpoint`-paar dat de host-pagina
  // gebruikt voor zijn telling en (toekomstig) toggle-flow.
  //
  // De debt-entry leest `has_hypotheekplanner_tracking` (mortgage-only); de
  // asset-entry leest `has_woonbalans_tracking` op het gekoppelde eigen_huis.
  {
    type: 'mortgage',
    kind: 'debt',
    label: 'Hypotheekplanner',
    moduleId: 'toekomstplannen',
    tipStripCopy:
      "Activeer Toekomstplannen om je equity, oversluit-scenario's en hypotheek-vs-beleggen vergelijking te zien.",
    isItemTracked: (item) =>
      'has_hypotheekplanner_tracking' in item &&
      (item as Debt).has_hypotheekplanner_tracking === true,
    toggleEndpoint: '/api/debts/toggle-hypotheekplanner',
  },
  {
    type: 'eigen_huis',
    kind: 'asset',
    label: 'Hypotheekplanner',
    moduleId: 'toekomstplannen',
    tipStripCopy:
      'Activeer Toekomstplannen om je equity-opbouw en hypotheekstrategie te zien.',
    isItemTracked: (item) =>
      'has_woonbalans_tracking' in item && item.has_woonbalans_tracking === true,
    toggleEndpoint: '/api/assets/toggle-woonbalans',
  },
  // ── Verhuurrendement — single entry op real_estate ─────────
  // De app rekent per pand de cashflow-, ROI- en Box 3-vergelijking door,
  // gevoed door `Asset.rental_income`, `current_value`, en de optionele
  // verhuur-velden (`monthly_maintenance_cost`, `vva_fee`, `vacancy_log`).
  {
    type: 'real_estate',
    kind: 'asset',
    label: 'Verhuurrendement',
    moduleId: 'vermogensregistratie',
    tipStripCopy:
      'Activeer Vermogensregistratie om netto rendement, cashflow en bezetting per object te zien.',
    isItemTracked: (item) =>
      'has_rental_tracking' in item && item.has_rental_tracking === true,
    toggleEndpoint: '/api/assets/toggle-rental',
  },
]

// ── Lookup helpers ───────────────────────────────────────────

/**
 * Vind alle verdiepingen voor een specifiek (type, kind). Retourneert een
 * lege array als de categorie geen verdiepingen kent — dan wordt alleen de
 * items-tab getoond. Volgorde uit `CATEGORY_DEEPENINGS` blijft behouden
 * zodat tabs altijd in een voorspelbare volgorde verschijnen.
 */
export function findDeepenings(
  type: AssetType | DebtType,
  kind: 'asset' | 'debt',
): DeepeningEntry[] {
  return CATEGORY_DEEPENINGS.filter((d) => d.type === type && d.kind === kind)
}

/**
 * Vind de eerste verdieping voor een specifiek (type, kind). Alias voor
 * `findDeepenings()[0]` — bewust behouden voor backwards-compat met alle
 * bestaande call-sites die op één entry rekenen. Gebruik voor nieuwe code
 * `findDeepenings()` zodat multi-app correct wordt afgehandeld.
 */
export function findDeepening(
  type: AssetType | DebtType,
  kind: 'asset' | 'debt',
): DeepeningEntry | undefined {
  return findDeepenings(type, kind)[0]
}

/**
 * Heeft deze categorie überhaupt een verdieping?
 * Gebruikt door de categorie-pagina om te beslissen of er extra tabs moeten
 * worden getoond (ook als de module uit staat — dan komt er een tip-strip).
 */
export function hasDeepening(
  type: AssetType | DebtType,
  kind: 'asset' | 'debt',
): boolean {
  return findDeepenings(type, kind).length > 0
}

/**
 * Genereer een stabiele URL-slug voor een entry. Gebruikt door de
 * categorie-pagina als `?tab=<slug>` zodat meerdere apps op dezelfde
 * categorie onderscheidbaar zijn in de URL.
 *
 * De slug is afgeleid van het label (lowercase, spaties → koppels, niet-
 * alfanumeriek weggehaald) en is per (type, kind) uniek: registry-entries
 * binnen één categorie hebben verschillende labels (`"Aflosstrategie"` vs
 * `"Hypotheekplanner"`), dus collisions zijn structureel uitgesloten zonder
 * extra disambiguation. Buiten één categorie spelen collisions geen rol —
 * de slug leeft binnen de URL van die categoriepagina.
 */
export function getDeepeningSlug(entry: DeepeningEntry): string {
  return entry.label
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // diakrieten weghalen
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Bepaal welke apps actief zijn op basis van tracking-flags op assets/debts.
 *
 * Een app is actief als minstens één asset/debt de bijbehorende tracking-vlag
 * heeft staan. Returns app-slugs (zoals `getDeepeningSlug` ze produceert) — bij
 * multi-app categorieën met dezelfde label ("Hypotheekplanner" op zowel mortgage
 * als eigen_huis) wordt dezelfde slug uit beide bronnen geactiveerd.
 *
 * Wordt gebruikt door de Sidebar om de apps-strip te filteren: een app
 * verschijnt alleen wanneer de gebruiker daadwerkelijk een gekoppeld
 * asset/debt heeft.
 */
export function getActiveAppKeys(
  assets: Array<Asset>,
  debts: Array<Debt>,
): string[] {
  const active = new Set<string>()
  for (const entry of CATEGORY_DEEPENINGS) {
    if (!entry.isItemTracked) continue
    const items = entry.kind === 'asset' ? assets : debts
    const matchingType = items.filter(
      (i) =>
        ('asset_type' in i && (i as Asset).asset_type === entry.type) ||
        ('debt_type' in i && (i as Debt).debt_type === entry.type),
    )
    if (matchingType.some((i) => entry.isItemTracked!(i))) {
      active.add(getDeepeningSlug(entry))
    }
  }
  return [...active]
}

/**
 * Tel hoeveel items in een lijst de app gebruiken (en hoeveel in totaal).
 * Voor de strip op de categoriekaart en de samenvatting in de banner.
 *
 * Retourneert `null` als de categorie geen app heeft — dan toont de UI
 * niets app-gerelateerd. Bij multi-app categorieën werkt deze helper per
 * entry: zonder `slug` valt hij terug op de eerste entry (legacy gedrag);
 * met `slug` rekent hij voor de gevraagde entry.
 */
export function countTrackedItems(
  type: AssetType | DebtType,
  kind: 'asset' | 'debt',
  items: Array<Asset | Debt>,
  slug?: string,
): { tracked: number; total: number } | null {
  const entries = findDeepenings(type, kind)
  if (entries.length === 0) return null
  const entry = slug
    ? entries.find((e) => getDeepeningSlug(e) === slug)
    : entries[0]
  if (!entry?.isItemTracked) return null
  let tracked = 0
  for (const item of items) {
    if (entry.isItemTracked(item)) tracked++
  }
  return { tracked, total: items.length }
}
