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
 * Per pill:
 *  - icoon (categorie-indicatie) via `BudgetIcon` op de bestaande type→icoon-
 *    en type→kleur-mapping — exact zoals de kaart.
 *  - een ECHTE lijn-sparkline (`PillSparkline`) uit dezelfde maand-serie
 *    (`sparklineValues`) die de kaart in Volledig gebruikt; trend-kleur groen
 *    = "goede kant op". <2 punten → geen sparkline (graceful).
 *  - een aandeel-balk: de pill wordt van links gevuld tot `sharePct`% — het
 *    aandeel van deze post in het getoonde totaal (groen bij bezittingen,
 *    maroon bij schulden, laag-opaak zodat tekst leesbaar blijft).
 *  - bedrag via `MaskedAmount` (masking blijft doorwerken); kleur semantisch
 *    `text-positive` (bezittingen) / `text-negative` (schulden) via `variant`.
 */

import { MaskedAmount } from '@/components/app/masked-amount'
import { BudgetIcon } from '@/components/app/budget-shared'

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
   * Aandeel (0-100) van deze post in het getoonde totaal — gevuld als balk
   * achter de pill. Door de host berekend; weglaten/0 → geen balk.
   */
  sharePct?: number
  /**
   * Maand-historie (oudste → nieuwste) voor de inline sparkline — exact
   * dezelfde serie die de kaart gebruikt. `undefined` of <2 punten → geen
   * sparkline (bv. partner-aggregaatrijen zonder historie).
   */
  sparklineValues?: number[]
  /** Klik opent dezelfde flow als de kaart (detail-pane/categorie-pagina). */
  onClick?: () => void
}

interface Props {
  /** Platte lijst van alle items, over alle categorieën heen. */
  items: PillItem[]
  /** Bepaalt de bedrag-/balk-kleur: 'asset' → groen (positief), 'debt' → maroon (negatief). */
  variant: 'asset' | 'debt'
}

/**
 * Kleine ECHTE lijn-sparkline uit een getallenreeks (dezelfde serie die de
 * kaart in Volledig gebruikt). Trend-kleur: groen = "goede kant op"
 * (bezitting omhoog / schuld omlaag), anders rood. Spiegelt de teken-logica
 * van `MiniSparkline` (assets) / `DebtMiniSparkline` (debts). <2 punten → niets.
 */
function PillSparkline({ values, variant }: { values?: number[]; variant: 'asset' | 'debt' }) {
  const W = 64
  const H = 20
  const PAD = 2
  // Geen/onvoldoende historie → vlakke neutrale lijn, zodat ELKE pill een
  // sparkline toont (visuele consistentie over alle posten).
  if (!values || values.length < 2) {
    return (
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        preserveAspectRatio="none"
        aria-hidden="true"
        className="relative hidden shrink-0 sm:block"
      >
        <line
          x1={PAD}
          y1={H / 2}
          x2={W - PAD}
          y2={H / 2}
          stroke="var(--ink-4)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    )
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = values
    .map((v, i) => {
      const x = PAD + (i / (values.length - 1)) * (W - PAD * 2)
      const y = H - PAD - ((v - min) / range) * (H - PAD * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  // Bezitting: omhoog = goed. Schuld: omlaag = goed.
  const good =
    variant === 'asset'
      ? values[values.length - 1] >= values[0]
      : values[values.length - 1] <= values[0]
  const stroke = good ? 'var(--positive)' : 'var(--negative)'
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      preserveAspectRatio="none"
      aria-hidden="true"
      className="relative hidden shrink-0 sm:block"
    >
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function EenvoudigPillList({ items, variant }: Props) {
  const amountClass = variant === 'asset' ? 'text-positive' : 'text-negative'
  // Aandeel-balk: groen voor bezittingen, maroon voor schulden — laag-opaak.
  const barColor =
    variant === 'asset'
      ? 'color-mix(in srgb, var(--positive) 16%, transparent)'
      : 'color-mix(in srgb, var(--negative) 16%, transparent)'

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => {
        const Tag = item.onClick ? 'button' : 'div'
        const share = item.sharePct != null ? Math.max(0, Math.min(item.sharePct, 100)) : 0
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
              className={`relative flex w-full items-center gap-3 overflow-hidden rounded-full border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-left transition-colors ${
                item.onClick ? 'hover:bg-[var(--subtle)]' : 'cursor-default'
              }`}
            >
              {/* Aandeel-balk: vult de pill van links tot `sharePct`%. Achter
                  de inhoud (de inhoud krijgt `relative` zodat ze erbovenop valt). */}
              {share > 0 && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 left-0"
                  style={{ width: `${share}%`, background: barColor }}
                />
              )}

              {/* Type-icoon — categorie-indicatie nu de koppen vervallen. */}
              <span
                className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--subtle)]"
                style={{ color: item.iconColor }}
                aria-hidden="true"
              >
                <BudgetIcon name={item.iconName} className="h-4 w-4" />
              </span>

              {/* Naam */}
              <span className="relative min-w-0 flex-1 truncate text-sm font-medium text-[var(--ink)]">
                {item.name}
              </span>

              {/* Echte lijn-sparkline (dezelfde data als de kaart), ~64×20. */}
              <PillSparkline values={item.sparklineValues} variant={variant} />

              {/* Bedrag rechts — font-mono tabular-nums via MaskedAmount */}
              <MaskedAmount
                value={item.amount}
                tone="inherit"
                className={`relative shrink-0 text-sm font-semibold ${amountClass}`}
              />
            </Tag>
          </li>
        )
      })}
    </ul>
  )
}
