// ── Category App Nav Builder ─────────────────────────────────
// Server-side helper die de set "klikbare app-links per categorie" bouwt
// die de nieuwe CategoryAppNavBar bovenin het Will-dashboard rendert.
//
// Eén link verschijnt alleen wanneer:
//   1. de gekoppelde module (uit `CATEGORY_DEEPENINGS`) actief is, EN
//   2. de gebruiker minstens één bezit/schuld in die categorie heeft.
//
// Beide voorwaarden zijn nodig: zonder module zou een teaser-link verwarren
// (de app-tab toont dan alleen een uitleg-strip), zonder items is de pagina
// een lege empty-state — dat hoort niet als first-class navigatie-doel.
//
// Uitzondering: `crypto` heeft geen `isItemTracked`-veld op asset-niveau
// (de Holdings-app leest `crypto_holdings` per asset in plaats van een
// boolean). Daarom telt `crypto` mee zodra er één crypto-asset bestaat —
// hetzelfde gedrag als de bestaande category-card-app-strip.

import type { AssetType, Asset } from '@/lib/asset-data'
import { ASSET_TYPE_LABELS, ASSET_TYPE_ICONS } from '@/lib/asset-data'
import type { DebtType, Debt } from '@/lib/debt-data'
import { DEBT_TYPE_LABELS, DEBT_TYPE_ICONS } from '@/lib/debt-data'
import type { ModuleId } from '@/lib/module-registry'
import {
  CATEGORY_DEEPENINGS,
  getDeepeningSlug,
} from '@/components/core/category-deepening-registry'

// ── Public types ─────────────────────────────────────────────

export interface CategoryAppLink {
  /** Asset/Debt-type van de categorie — gebruikt voor stabiele key + URL. */
  type: AssetType | DebtType
  /** Bezit of schuld — bepaalt het URL-pad en de visuele variant. */
  kind: 'asset' | 'debt'
  /** Mens-leesbare categorienaam, bv. "Cash / Bankrekeningen". */
  categoryLabel: string
  /** App-naam, bv. "Budgetteren", "Holdings". */
  appLabel: string
  /** URL-deeplink naar `/core/{assets|debts}/[type]?tab=<slug>`. */
  href: string
  /** Lucide icon-naam (matcht `ASSET_TYPE_ICONS` / `DEBT_TYPE_ICONS`). */
  iconName: string
  /** Aantal items in de categorie — voor de meta-regel onder de app-naam. */
  itemCount: number
}

// ── Asset / debt input shapes ────────────────────────────────
// We accepteren expres een minimale shape (`asset_type` resp. `debt_type` plus
// de optionele app-vlaggen) zodat callers met `Asset[]` of een lichte
// projectie beide werken.

export interface CategoryNavAssetInput {
  asset_type: AssetType
  has_budget_tracking?: boolean | null
  has_holdings_tracking?: boolean | null
  has_woonbalans_tracking?: boolean | null
  has_rental_tracking?: boolean | null
}

export interface CategoryNavDebtInput {
  debt_type: DebtType
  has_strategy_tracking?: boolean | null
}

// Asset/Debt-vrije check voor `isItemTracked` — we hergebruiken niet de
// helper uit `category-deepening-registry.ts` direct omdat die `Asset|Debt`
// vereist; voor de nav-builder is een lichtere shape voldoende. Resultaat
// is identiek: dezelfde boolean-velden bepalen of een item gekoppeld is.
function isAssetTracked(
  type: AssetType,
  asset: CategoryNavAssetInput,
): boolean {
  switch (type) {
    case 'cash':
      return asset.has_budget_tracking === true
    case 'investment':
      return asset.has_holdings_tracking === true
    case 'eigen_huis':
      return asset.has_woonbalans_tracking === true
    case 'real_estate':
      return asset.has_rental_tracking === true
    case 'crypto':
      // Geen tracking-vlag op crypto-assets; aanwezigheid telt.
      return true
    default:
      return false
  }
}

function isDebtTracked(debt: CategoryNavDebtInput): boolean {
  return debt.has_strategy_tracking === true
}

// ── Builder ──────────────────────────────────────────────────

/**
 * Bouw de geordende lijst app-links voor de categorie-balk op het
 * Will-dashboard. Volgorde volgt `CATEGORY_DEEPENINGS` zodat tabs op de
 * categorie-pagina en links in de balk in dezelfde lees-volgorde verschijnen.
 *
 * Multi-app-categorieën (zoals `mortgage` met Aflosstrategie + Hypotheekplanner)
 * leveren meerdere links — één per app-entry. De `slug` in de href
 * disambigueert welke tab geopend wordt.
 *
 * Een entry levert geen link wanneer:
 * - de bijbehorende module niet in `activeModules` zit; OF
 * - er geen items in die categorie zijn die door de app gevolgd worden.
 *   `isItemTracked` valt terug op "asset bestaat" voor categorieën zonder
 *   tracking-vlag (crypto), zodat de gebruiker direct naar de app-tab kan.
 */
export function buildCategoryAppLinks(
  assets: CategoryNavAssetInput[],
  debts: CategoryNavDebtInput[],
  activeModules: ModuleId[] | string[],
): CategoryAppLink[] {
  const moduleSet = new Set<string>(activeModules)
  const links: CategoryAppLink[] = []

  for (const entry of CATEGORY_DEEPENINGS) {
    if (!moduleSet.has(entry.moduleId)) continue

    const slug = getDeepeningSlug(entry)

    if (entry.kind === 'asset') {
      const type = entry.type as AssetType
      const itemsInCategory = assets.filter((a) => a.asset_type === type)
      if (itemsInCategory.length === 0) continue

      // Tel items die actief gevolgd worden door deze app. Voor categorieën
      // zonder tracking-vlag (crypto) telt de aanwezigheid van het item zelf.
      const tracked = itemsInCategory.filter((a) => isAssetTracked(type, a))
      if (tracked.length === 0) continue

      links.push({
        type,
        kind: 'asset',
        categoryLabel: ASSET_TYPE_LABELS[type] ?? type,
        appLabel: entry.label,
        href: `/core/assets/${type}?tab=${slug}`,
        iconName: ASSET_TYPE_ICONS[type] ?? 'Circle',
        itemCount: tracked.length,
      })
    } else {
      const type = entry.type as DebtType
      const itemsInCategory = debts.filter((d) => d.debt_type === type)
      if (itemsInCategory.length === 0) continue

      const tracked = itemsInCategory.filter(isDebtTracked)
      if (tracked.length === 0) continue

      links.push({
        type,
        kind: 'debt',
        categoryLabel: DEBT_TYPE_LABELS[type] ?? type,
        appLabel: entry.label,
        href: `/core/debts/${type}?tab=${slug}`,
        iconName: DEBT_TYPE_ICONS[type] ?? 'CircleDot',
        itemCount: tracked.length,
      })
    }
  }

  return links
}

// ── Type-extraction helpers ──────────────────────────────────
// Lichte projecties zodat `Asset[]` en `Debt[]` direct in de builder passen
// zonder full-type lekken naar consumenten.

export function projectAssetForCategoryNav(asset: Asset): CategoryNavAssetInput {
  return {
    asset_type: asset.asset_type,
    has_budget_tracking: asset.has_budget_tracking,
    has_holdings_tracking: asset.has_holdings_tracking,
    has_woonbalans_tracking: asset.has_woonbalans_tracking,
    has_rental_tracking: asset.has_rental_tracking,
  }
}

export function projectDebtForCategoryNav(debt: Debt): CategoryNavDebtInput {
  return {
    debt_type: debt.debt_type,
    has_strategy_tracking: debt.has_strategy_tracking,
  }
}
