/**
 * Gedeelde opbouw van `PillItem`s voor de Eenvoudig-weergave.
 *
 * Waarom een aparte helper: dezelfde pill-lijst staat op twee soorten
 * oppervlak — het overzicht (/overzicht/bezittingen, /overzicht/schulden, een
 * platte lijst over alle types heen) én de categoriepagina van één type
 * (/overzicht/bezittingen/[type], /overzicht/schulden/[type]). Tot B-044 bouwde
 * alleen het overzicht pills; de categoriepagina viel in Eenvoudig terug op het
 * kaarten-grid van Volledig. Beide hosts gebruiken nu déze functies, zodat
 * icoon, kleur en aandeel-balk op beide plekken per definitie gelijk zijn.
 *
 * PRESENTATIE-ONLY: de host levert het bedrag al perspectief-correct aan
 * (`perspectiveAssetValue` / `shareOf` / het hero-grondslag van de
 * categoriepagina). Hier wordt niets herberekend behalve het aandeel van elke
 * post in de som van de getoonde posten.
 */

import { ASSET_TYPE_COLORS, ASSET_TYPE_ICONS, type AssetType } from '@/lib/asset-data'
import { DEBT_TYPE_COLORS, DEBT_TYPE_ICONS, type DebtType } from '@/lib/debt-data'
import type { PillItem } from './eenvoudig-pill-list'

interface PillSource {
  id: string
  name: string
}

interface PillOptions {
  /** Perspectief-correcte waarde zoals de host die al berekent. */
  amount: number
  /** Dezelfde maand-serie die de kaart in Volledig gebruikt. */
  sparklineValues?: number[]
  /** Opent dezelfde flow als de kaart; weglaten = read-only pill. */
  onClick?: () => void
}

/** Pill voor één bezitting — icoon en kleur uit de type→icoon/kleur-mapping van de kaart. */
export function assetPillItem(
  asset: PillSource,
  type: AssetType,
  { amount, sparklineValues, onClick }: PillOptions,
): PillItem {
  return {
    id: asset.id,
    name: asset.name,
    iconName: ASSET_TYPE_ICONS[type] ?? ASSET_TYPE_ICONS.other,
    iconColor: ASSET_TYPE_COLORS[type] ?? ASSET_TYPE_COLORS.other,
    amount,
    sparklineValues,
    onClick,
  }
}

/** Pill voor één schuld — icoon en kleur uit de type→icoon/kleur-mapping van de kaart. */
export function debtPillItem(
  debt: PillSource,
  type: DebtType,
  { amount, sparklineValues, onClick }: PillOptions,
): PillItem {
  return {
    id: debt.id,
    name: debt.name,
    iconName: DEBT_TYPE_ICONS[type] ?? 'CircleDot',
    iconColor: DEBT_TYPE_COLORS[type] ?? DEBT_TYPE_COLORS.other,
    amount,
    sparklineValues,
    onClick,
  }
}

/**
 * Vult `sharePct` (aandeel van elke post in de som van de getoonde posten) —
 * de balk achter de pill. Muteert en geeft dezelfde array terug, zodat een
 * host het direct aan zijn `useMemo` kan teruggeven. Som ≤ 0 → geen balken.
 */
export function withSharePct(items: PillItem[]): PillItem[] {
  const total = items.reduce((s, it) => s + it.amount, 0)
  if (total > 0) for (const it of items) it.sharePct = (it.amount / total) * 100
  return items
}
