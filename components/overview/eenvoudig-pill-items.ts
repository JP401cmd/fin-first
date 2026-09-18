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
import {
  groepeerLeningdelen,
  leningdelenLabel,
  type LeningdeelRij,
} from '@/lib/debt-leningdelen'
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
  /**
   * Onderliggende pills (leningdelen van één hypotheek). Gevuld → `amount` is
   * het groepstotaal en de pill klapt open i.p.v. te navigeren; zie
   * `EenvoudigPillList`.
   */
  subItems?: PillItem[]
  /** Korte duiding naast de naam, bv. "3 leningdelen". */
  meta?: string
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
  { amount, sparklineValues, onClick, subItems, meta }: PillOptions,
): PillItem {
  return {
    id: debt.id,
    name: debt.name,
    iconName: DEBT_TYPE_ICONS[type] ?? 'CircleDot',
    iconColor: DEBT_TYPE_COLORS[type] ?? DEBT_TYPE_COLORS.other,
    amount,
    sparklineValues,
    onClick,
    subItems,
    meta,
  }
}

/**
 * Pills voor één schuld-categorie, met de leningdelen van een hypotheek onder
 * één uitklapbare pill (W-005 / ADR 0140).
 *
 * Eén hypotheek = één pill met het groepstotaal; openklappen toont de delen,
 * elk met zijn eigen pill en eigen klik naar de detail-pane. Het aandeel-
 * balkje van de delen is hun aandeel in de hypotheek (de groep is hun
 * "getoonde totaal"); het aandeel van de groep-pill zelf bepaalt de host met
 * `withSharePct` over de volledige lijst.
 *
 * Schulden zonder delen blijven exact de pill die ze waren.
 */
export function debtPillItemsMetLeningdelen<T extends PillSource & LeningdeelRij>(
  debts: readonly T[],
  type: DebtType,
  opts: {
    /** Perspectief-correcte waarde, door de host bepaald. */
    amountOf: (debt: T) => number
    sparklineOf?: (debt: T) => number[] | undefined
    /** Weglaten = read-only pills (bv. een aggregaatrij). */
    onItemClick?: (debt: T) => void
  },
): PillItem[] {
  const pill = (debt: T, amount: number): PillItem =>
    debtPillItem(debt, type, {
      amount,
      sparklineValues: opts.sparklineOf?.(debt),
      onClick: opts.onItemClick ? () => opts.onItemClick!(debt) : undefined,
    })

  return groepeerLeningdelen(debts, opts.amountOf).map((entry) => {
    if (entry.kind === 'enkel') return pill(entry.debt, opts.amountOf(entry.debt))
    return debtPillItem(entry.hoofd, type, {
      amount: entry.totaal,
      meta: leningdelenLabel(entry.leden.length),
      subItems: withSharePct(entry.leden.map((lid) => pill(lid, opts.amountOf(lid)))),
    })
  })
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
