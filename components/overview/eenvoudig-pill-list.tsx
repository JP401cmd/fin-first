'use client'

/**
 * EenvoudigPillList — compacte "pill"-weergave van bezittingen/schulden voor
 * de weergavemodus **Eenvoudig** (`useDisplayMode().mode === 'simple'`).
 *
 * PRESENTATIE-ONLY: dit component rekent niets uit en laadt geen data. De host
 * (assets-client.tsx / debts/page.tsx) blijft de bron van waarheid voor
 * groepering, perspectief-weging en totalen, en levert hier kant-en-klare
 * items aan. In Eenvoudig vervangt deze pill-lijst alléén het kaart-grid;
 * de hero (FiguresStrip) en toolbar/CTA blijven in de host staan.
 *
 * Eén PLATTE lijst: géén `CategoryGroupHeader`-koppen meer. Het categorie-
 * onderscheid loopt uitsluitend via het pill-icoon (type-naam + type-kleur).
 * De per-groep deeplink-ankers (`#asset-group-<type>`) van het kaart-grid
 * vervallen daarmee in Eenvoudig — Volledig houdt z'n ankers.
 *
 * Hergebruik:
 *  - icoon per item via `BudgetIcon` op de bestaande type→icoon-naam-mapping
 *    (`ASSET_TYPE_ICONS` / `DEBT_TYPE_ICONS`); kleur via de type→hex-mapping
 *    (`ASSET_TYPE_COLORS` / `DEBT_TYPE_COLORS`) — exact zoals de kaarten.
 *  - sparkline per pill via dezelfde `CardTintOverlay` die de kaart op de
 *    achtergrond toont; identieke `variant` + `sparklineValues`-serie, hier
 *    klein/inline. Item zonder historie (<2 punten / undefined) → geen
 *    sparkline (graceful, zoals de kaart die op een vlakke berg terugvalt).
 *  - bedrag via `MaskedAmount` (masking blijft doorwerken); de bedragkleur is
 *    semantisch — `text-positive` (bezittingen) / `text-negative` (schulden),
 *    via de `variant`-prop. Bewust afwijkend van de amber kern-tone die de
 *    kaarten in Volledig gebruiken. Geen tweede icon/format-bron.
 */

import { MaskedAmount } from '@/components/app/masked-amount'
import { BudgetIcon } from '@/components/app/budget-shared'
import { CardTintOverlay } from '@/components/core/card-tint-overlay'

/** Eén item (bezitting/schuld) in de pill-lijst. */
export type PillItem = {
  id: string
  name: string
  /** Lucide-icoonnaam (string) — zelfde mapping als de kaart gebruikt. */
  iconName: string
  /** Hex-accentkleur voor het icoon — zelfde type→hex-mapping als de kaart. */
  iconColor: string
  /** Perspectief-correcte waarde zoals de host die al berekent. */
  amount: number
  /**
   * Maand-historie (oudste → nieuwste) voor de inline sparkline — exact
   * dezelfde serie die de kaart aan `CardTintOverlay` voedt. `undefined` of
   * <2 punten → geen sparkline (bv. partner-aggregaatrijen zonder historie).
   */
  sparklineValues?: number[]
  /** Klik opent dezelfde flow als de kaart (detail-pane/categorie-pagina). */
  onClick?: () => void
}

interface Props {
  /** Platte lijst van alle items, over alle categorieën heen. */
  items: PillItem[]
  /** Bepaalt de bedragkleur: 'asset' → groen (positief), 'debt' → maroon (negatief). */
  variant: 'asset' | 'debt'
}

export function EenvoudigPillList({ items, variant }: Props) {
  // Semantische bedragkleur: bezittingen positief (groen), schulden negatief
  // (maroon) — conform de positief/negatief-conventie en het referentiebeeld.
  const amountClass = variant === 'asset' ? 'text-positive' : 'text-negative'

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => {
        const Tag = item.onClick ? 'button' : 'div'
        const hasSparkline = !!item.sparklineValues && item.sparklineValues.length >= 2
        return (
          <li key={item.id}>
            <Tag
              {...(item.onClick
                ? {
                    type: 'button' as const,
                    onClick: item.onClick,
                    'aria-label': `${item.name} openen`,
                  }
                : {})}
              className={`flex w-full items-center gap-3 rounded-full border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-left transition-colors ${
                item.onClick ? 'hover:bg-[var(--subtle)]' : 'cursor-default'
              }`}
            >
              {/* Type-icoon in een rond vakje — accentkleur via currentColor
                  (zelfde hex-mapping als de kaart). Het icoon IS de
                  categorie-indicatie nu de koppen vervallen. */}
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--subtle)]"
                style={{ color: item.iconColor }}
                aria-hidden="true"
              >
                <BudgetIcon
                  name={item.iconName}
                  className="h-4 w-4"
                />
              </span>

              {/* Naam */}
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--ink)]">
                {item.name}
              </span>

              {/* Inline sparkline — dezelfde CardTintOverlay-serie als de kaart,
                  klein (~64×20). Alleen bij ≥2 punten; anders niets (graceful). */}
              {hasSparkline && (
                <span
                  className="relative hidden h-5 w-16 shrink-0 overflow-hidden rounded-sm sm:block"
                  aria-hidden="true"
                >
                  <CardTintOverlay variant={variant} sparklineValues={item.sparklineValues} />
                </span>
              )}

              {/* Bedrag rechts — font-mono tabular-nums via MaskedAmount */}
              <MaskedAmount
                value={item.amount}
                tone="inherit"
                className={`shrink-0 text-sm font-semibold ${amountClass}`}
              />
            </Tag>
          </li>
        )
      })}
    </ul>
  )
}
