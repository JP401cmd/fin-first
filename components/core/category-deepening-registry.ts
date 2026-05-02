// ── Category deepening registry ──────────────────────────────
//
// Een verdieping is een tweede (of derde, etc.) tab op een asset/debt
// categorie-pagina, gekoppeld aan een specifieke module of "app". Bij `cash`
// toont de tab Budgetteren, bij `investment` toont de tab Holdings, etc.
//
// Multi-app: Eén categorie kan meerdere apps hebben (bv. `mortgage` krijgt
// zowel Aflosstrategie als Hypotheekplanner). Daarom retourneert
// `findDeepenings()` een **array** van entries; `findDeepening()` blijft
// bestaan als alias voor de eerste match (backwards-compat) zodat bestaande
// call-sites blijven werken.
//
// Toevoegen van een nieuwe verdieping kost één entry — de tab-component zelf
// wordt opgehaald via `getDeepeningComponent()` zodat callers nooit direct
// met de mapping hoeven te werken.
//
// Architectuurnoot: de tabs zijn statische imports. De vorige opzet met
// `next/dynamic({ ssr: false })` produceerde op Turbopack (Next 16) een
// ChunkLoadError op `/core/assets/[type]`, omdat de runtime de async chunk
// (`components_core_deepenings_*.js`) niet wist te resolven binnen het
// page-bundle. De tabs zijn al `'use client'` en re-exporteren bestaande
// clients (`BudgetsClient`, `HoldingsPage`) — code-splitting won daar niets,
// want die bundles werden sowieso meegezogen door de tab-page.

import type { ComponentType } from 'react'
import type { Asset, AssetType } from '@/lib/asset-data'
import type { Debt, DebtType } from '@/lib/debt-data'
import type { ModuleId } from '@/lib/module-registry'
import { CashBudgetterenTab } from './deepenings/cash-budgetteren-tab'
import { InvestmentHoldingsTab } from './deepenings/investment-holdings-tab'
import { CryptoHoldingsTab } from './deepenings/crypto-holdings-tab'
import { AflosstrategieTab } from './deepenings/aflosstrategie-tab'
import { HypotheekplannerTab } from './deepenings/hypotheekplanner-tab'
import { VerhuurrendementTab } from './deepenings/verhuurrendement-tab'

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
 * heeft (bv. `mortgage` met Aflosstrategie + Hypotheekplanner). De
 * volgorde in de array bepaalt de volgorde van de tabs op de
 * categorie-pagina.
 */
/**
 * Debt-types die de Aflosstrategie-app krijgen. Eén entry per type — de
 * tab-component (`AflosstrategieTab`) is gedeeld, de registry-entries staan
 * los zodat per type de items-tab telling correct werkt en toekomstige
 * type-specifieke tweaks (label/copy) één plek hebben.
 *
 * `mortgage` zit ook in deze lijst: een hypotheek doet mee in de gedeelde
 * snowball/avalanche-engine. De Hypotheekplanner-app komt er straks als
 * tweede entry naast (multi-app per categorie via slug-disambiguation).
 */
const AFLOSSTRATEGIE_DEBT_TYPES: readonly DebtType[] = [
  'personal_loan',
  'student_loan',
  'car_loan',
  'credit_card',
  'revolving_credit',
  'mortgage',
] as const

export const CATEGORY_DEEPENINGS: DeepeningEntry[] = [
  {
    type: 'cash',
    kind: 'asset',
    label: 'Budgetteren',
    moduleId: 'budgetteren',
    tipStripCopy:
      'Activeer Budgetteren om uitgaven per rekening te volgen en je spaarquote automatisch te berekenen.',
    isItemTracked: (item) =>
      'has_budget_tracking' in item && item.has_budget_tracking === true,
    toggleEndpoint: '/api/assets/toggle-budget',
  },
  {
    type: 'investment',
    kind: 'asset',
    label: 'Holdings',
    moduleId: 'aandelenregistratie',
    tipStripCopy:
      'Activeer Aandelenregistratie om individuele holdings, koersen en dagrendement bij te houden.',
    isItemTracked: (item) =>
      'has_holdings_tracking' in item && item.has_holdings_tracking === true,
    toggleEndpoint: '/api/assets/toggle-holdings',
  },
  // ── Holdings (crypto) ────────────────────────────────────────
  // Symmetrisch met de investment-Holdings-app: dezelfde label-keuze
  // ("Holdings"), dezelfde moduleId — gebruikers die de aandelen-/crypto-
  // registratie aanzetten krijgen direct beide apps. Voor crypto bouwt de
  // tab zelf een lichte allocation-overview op de typed CryptoHoldingRow's.
  {
    type: 'crypto',
    kind: 'asset',
    label: 'Holdings',
    moduleId: 'aandelenregistratie',
    tipStripCopy:
      'Activeer aandelen- en cryptoregistratie voor het volledige coin-overzicht per exchange of wallet.',
    // Crypto-asset wordt door de Holdings-app gevolgd zodra hij gekoppeld is
    // aan een exchange-connectie of wallet, óf zodra er handmatig holdings
    // onder hangen. Op asset-niveau hebben we (nog) geen vlag — de telling
    // op de items-tab wordt gevoed door de typed-loader, niet door deze
    // helper. Hier `undefined` laten = "geen item-toggle van toepassing".
    isItemTracked: undefined,
    toggleEndpoint: undefined,
  },
  // ── Aflosstrategie — zes debt-types ─────────────────────────
  // Eén DebtType per entry. De `isItemTracked`/`toggleEndpoint`/`moduleId`/
  // `label`/`tipStripCopy` zijn per definitie identiek; alleen `type`
  // verschilt. Een `.map()` houdt de bron bondig en het registry stabiel
  // voor uitbreidingen (bv. Hypotheekplanner naast `mortgage`).
  ...AFLOSSTRATEGIE_DEBT_TYPES.map((type): DeepeningEntry => ({
    type,
    kind: 'debt',
    label: 'Aflosstrategie',
    moduleId: 'toekomstplannen',
    tipStripCopy:
      'Activeer Toekomstplannen om je optimale aflossingsroute over al je schulden te zien.',
    isItemTracked: (item) =>
      'has_strategy_tracking' in item && item.has_strategy_tracking === true,
    toggleEndpoint: '/api/debts/toggle-strategy',
  })),
  // ── Hypotheekplanner — twee entries ────────────────────────
  // Eén op de `mortgage` (debt) categorie, één op het `eigen_huis` (asset).
  // Beide leiden tot dezelfde `<HypotheekplannerTab>`-component, maar via
  // een ander `isItemTracked`/`toggleEndpoint`-paar dat de host-pagina
  // gebruikt voor zijn telling en (toekomstig) toggle-flow.
  //
  // Volgorde-noot: dit entry komt ná de Aflosstrategie-entry voor
  // `mortgage`, zodat de tabs op `/core/debts/mortgage` in deze volgorde
  // verschijnen: Items → Aflosstrategie → Hypotheekplanner.
  {
    type: 'mortgage',
    kind: 'debt',
    label: 'Hypotheekplanner',
    moduleId: 'toekomstplannen',
    tipStripCopy:
      "Activeer Toekomstplannen om je equity, oversluit-scenario's en hypotheek-vs-beleggen vergelijking te zien.",
    isItemTracked: (item) =>
      'has_strategy_tracking' in item && item.has_strategy_tracking === true,
    toggleEndpoint: '/api/debts/toggle-strategy',
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

// ── Static tab components ────────────────────────────────────
//
// De tabs zijn directe imports (zie module header). De map hieronder is
// puur lookup-glue zodat callers nooit zelf hoeven te switchen op type/kind.
//
// Multi-app: bij meerdere entries voor één (type, kind) gebruiken we de
// optionele `slug`-parameter om de juiste app-component te kiezen. De map
// wordt dan een nested `Record<slug, ComponentType>` voor die categorie.

/**
 * Component-mapping per (kind, type). Voor categorieën met één app is de
 * waarde een `ComponentType<DeepeningTabProps>`. Voor categorieën met
 * meerdere apps is de waarde een `Record<slug, ComponentType>` zodat
 * `getDeepeningComponent()` op slug kan disambigueren.
 *
 * Schulden hebben (in deze fase) nog geen tab-componenten — die komen in
 * latere fases (Aflosstrategie, Hypotheekplanner) en worden hier dan
 * ingehaakt.
 */
type DeepeningComponentMap =
  | ComponentType<DeepeningTabProps>
  | Record<string, ComponentType<DeepeningTabProps>>

const DEEPENING_COMPONENTS: Partial<
  Record<'asset' | 'debt', Partial<Record<AssetType | DebtType, DeepeningComponentMap>>>
> = {
  asset: {
    cash: CashBudgetterenTab,
    investment: InvestmentHoldingsTab,
    crypto: CryptoHoldingsTab,
    // `eigen_huis` heeft één app (Hypotheekplanner) — single-component vorm.
    // Slug-disambiguation is hier niet nodig; toekomstige tweede app
    // (bv. Verzekerings-tab) zou de waarde naar de nested vorm migreren.
    eigen_huis: HypotheekplannerTab,
    // `real_estate` — Verhuurrendement-app. Single-component vorm; bij een
    // toekomstige tweede app (bv. Aankoop-checker) wordt dit een nested map.
    real_estate: VerhuurrendementTab,
  },
  debt: {
    // Aflosstrategie als single-app voor vijf debt-types — slug-keyed
    // disambiguation is hier niet nodig.
    personal_loan: AflosstrategieTab,
    student_loan: AflosstrategieTab,
    car_loan: AflosstrategieTab,
    credit_card: AflosstrategieTab,
    revolving_credit: AflosstrategieTab,
    // `mortgage` is multi-app: zowel Aflosstrategie als Hypotheekplanner.
    // Slugs zijn afgeleid van de entry-labels via `getDeepeningSlug()`:
    //   - "Aflosstrategie"     → `aflosstrategie`
    //   - "Hypotheekplanner"   → `hypotheekplanner`
    // De volgorde hier is niet bindend — de tab-volgorde komt uit de
    // CATEGORY_DEEPENINGS-array.
    mortgage: {
      aflosstrategie: AflosstrategieTab,
      hypotheekplanner: HypotheekplannerTab,
    },
  },
}

/**
 * Resolveer de daadwerkelijke tab-component voor een (type, kind, slug?)
 * combinatie.
 *
 * Retourneert `undefined` als er geen tab-component voor deze categorie
 * bestaat — de categorie-pagina toont in dat geval alleen de items-tab.
 * Bij een module-uit toestand kun je alsnog een component terugkrijgen; de
 * tab is zelf verantwoordelijk voor het tonen van de tip-strip wanneer
 * `moduleActive === false` (en eventueel een korte teaser-uitleg).
 *
 * `slug` is optioneel:
 * - Bij categorieën met één app wordt `slug` genegeerd.
 * - Bij categorieën met meerdere apps wordt `slug` gebruikt om de juiste
 *   component te kiezen. Zonder `slug` valt de lookup terug op de eerste
 *   entry voor backwards-compat met legacy callers.
 */
export function getDeepeningComponent(
  type: AssetType | DebtType,
  kind: 'asset' | 'debt',
  slug?: string,
): ComponentType<DeepeningTabProps> | undefined {
  const entry = DEEPENING_COMPONENTS[kind]?.[type]
  if (!entry) return undefined

  // Single-component vorm — direct teruggeven, slug is irrelevant.
  if (typeof entry === 'function') return entry

  // Multi-app vorm: kies op slug, of fallback op de eerste registry-entry.
  if (slug) {
    return entry[slug]
  }
  const entries = findDeepenings(type, kind)
  const fallbackSlug = entries[0] ? getDeepeningSlug(entries[0]) : undefined
  return fallbackSlug ? entry[fallbackSlug] : undefined
}
