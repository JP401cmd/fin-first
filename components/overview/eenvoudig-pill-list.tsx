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
 * Enige nesting-uitzondering: een pill met `subItems` (de leningdelen van één
 * hypotheek, W-005 / ADR 0140) toont het groepstotaal en klapt de delen uit.
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

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
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
  /**
   * Onderliggende posten die pas ná openklappen verschijnen — de leningdelen
   * van één hypotheek (W-005 / ADR 0140). Is dit gevuld, dan is `amount` het
   * GROEPSTOTAAL en wordt de pill zélf de open/dicht-knop: het losse item
   * openen doe je op het deel eronder. Zo strijdt de klik niet met een bedrag
   * dat een ander bereik heeft dan de detail-pane erachter. `onClick` wordt
   * dan genegeerd (geen geneste knoppen, geen dubbele betekenis).
   */
  subItems?: PillItem[]
  /** Korte duiding naast de naam bij een groep, bv. "3 leningdelen". */
  meta?: string
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

/** Aandeel-balk: groen voor bezittingen, maroon voor schulden — laag-opaak. */
function barColorFor(variant: 'asset' | 'debt'): string {
  return variant === 'asset'
    ? 'color-mix(in srgb, var(--positive) 16%, transparent)'
    : 'color-mix(in srgb, var(--negative) 16%, transparent)'
}

/**
 * Eén pill-regel. Draagt `subItems`, dan is de pill de open/dicht-knop voor
 * de onderliggende posten (leningdelen) en verschijnen die als ingesprongen
 * lijst eronder — géén geneste knoppen.
 */
function PillRow({ item, variant }: { item: PillItem; variant: 'asset' | 'debt' }) {
  const [open, setOpen] = useState(false)
  const amountClass = variant === 'asset' ? 'text-positive' : 'text-negative'
  const barColor = barColorFor(variant)
  const heeftSubItems = (item.subItems?.length ?? 0) > 0
  const klikbaar = heeftSubItems || item.onClick != null
  const Tag = klikbaar ? 'button' : 'div'
  const share = item.sharePct != null ? Math.max(0, Math.min(item.sharePct, 100)) : 0

  return (
    <li>
      <Tag
        {...(klikbaar
          ? {
              type: 'button' as const,
              onClick: heeftSubItems ? () => setOpen((v) => !v) : item.onClick,
              ...(heeftSubItems
                ? {
                    'aria-expanded': open,
                    'aria-label': `${item.name} — onderdelen ${open ? 'verbergen' : 'tonen'}`,
                  }
                : { 'aria-label': `${item.name} openen` }),
            }
          : {})}
        className={`relative flex w-full items-center gap-3 overflow-hidden rounded-full border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-left transition-colors ${
          klikbaar ? 'hover:bg-[var(--subtle)]' : 'cursor-default'
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

        {/* Naam (+ groepsduiding) */}
        <span className="relative min-w-0 flex-1 truncate text-sm font-medium text-[var(--ink)]">
          {item.name}
          {item.meta && (
            <span
              className="ml-1.5 text-[11px] italic font-normal text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
            >
              {item.meta}
            </span>
          )}
        </span>

        {/* Echte lijn-sparkline (dezelfde data als de kaart), ~64×20. */}
        <PillSparkline values={item.sparklineValues} variant={variant} />

        {/* Bedrag rechts — font-mono tabular-nums via MaskedAmount */}
        <MaskedAmount
          value={item.amount}
          tone="inherit"
          className={`relative shrink-0 text-sm font-semibold ${amountClass}`}
        />

        {heeftSubItems && (
          <ChevronDown
            className={`relative h-4 w-4 shrink-0 text-[var(--ink-3)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        )}
      </Tag>

      {heeftSubItems && open && (
        <ul className="mt-2 flex flex-col gap-2 border-l border-[var(--border-ed)] pl-3 sm:pl-4">
          {item.subItems!.map((sub) => (
            <PillRow key={sub.id} item={sub} variant={variant} />
          ))}
        </ul>
      )}
    </li>
  )
}

export function EenvoudigPillList({ items, variant }: Props) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <PillRow key={item.id} item={item} variant={variant} />
      ))}
    </ul>
  )
}
