'use client'

/**
 * CashflowLandingCards — vier hefboom-stijl kaarten op /overzicht/cashflow.
 * Zelfde shell als de vier-hefbomen-rij op /overzicht (gedeelde LeverageCard):
 * status-dot + KPI + uitklapbare chevron met een 1-regel inzicht en een
 * deeplink naar de bijbehorende sub-pagina.
 *
 * De kaart-data (status/KPI/detail) wordt server-side berekend in
 * `buildCashflowCards` en hier alleen gerenderd. Het icoon + de tint per
 * onderdeel zitten client-side (kunnen niet geserialiseerd worden).
 */

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  PiggyBank,
  ArrowLeftRight,
  Repeat,
  LineChart,
  type LucideIcon,
} from 'lucide-react'
import { LeverageCard } from './leverage-card'
import { leverageStatusBgClass, leverageStatusTextClass } from '@/lib/leverage-status'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'
import type { CashflowCard, CashflowCardKey } from '@/lib/cashflow-cards'

const VISUAL: Record<CashflowCardKey, { Icon: LucideIcon; tint: string }> = {
  budget: { Icon: PiggyBank, tint: 'text-amber-700 bg-amber-50' },
  transacties: { Icon: ArrowLeftRight, tint: 'text-sky-700 bg-sky-50' },
  'vaste-lasten': { Icon: Repeat, tint: 'text-violet-700 bg-violet-50' },
  forecast: { Icon: LineChart, tint: 'text-emerald-700 bg-emerald-50' },
}

export function CashflowLandingCards({ cards }: { cards: CashflowCard[] }) {
  // Eén kaart open per keer — accordeon, identiek aan HefbomenNav.
  const [expandedKey, setExpandedKey] = useState<CashflowCardKey | null>(null)
  // In Eenvoudig: geen uitklap-chevron — de drill-down is detail, niet kern.
  const simple = useDisplayMode().mode === 'simple'

  return (
    <nav
      aria-label="Cashflow-onderdelen"
      className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3"
    >
      {cards.map((card) => {
        const { Icon, tint } = VISUAL[card.key]
        const expanded = expandedKey === card.key
        return (
          <LeverageCard
            key={card.key}
            Icon={Icon}
            tint={tint}
            label={card.label}
            kpi={card.kpi}
            status={card.status}
            subText={card.subText}
            href={card.href}
            tooltip={card.tooltip}
            expandable={!simple}
            expanded={expanded}
            onToggleExpand={() => setExpandedKey(expanded ? null : card.key)}
          >
            <CashflowCardDetail card={card} />
          </LeverageCard>
        )
      })}
    </nav>
  )
}

/**
 * Uitklap-detail per kaart — zelfde opmaak als HefboomDetailCard: status-
 * getinte achtergrond, secundaire waarde rechtsboven, 1-regel inzicht en een
 * deeplink naar de sub-pagina.
 */
function CashflowCardDetail({ card }: { card: CashflowCard }) {
  return (
    <div
      className={`mt-2 -mx-3 sm:-mx-4 px-3 sm:px-4 py-3 border-t border-[var(--border-ed)] ${leverageStatusBgClass(card.status)}`}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="text-[10px] uppercase tracking-[0.1em] font-semibold text-[var(--ink-3)]">
          {card.detail.label}
        </span>
        <span className={`text-[11px] font-mono tabular-nums font-semibold ${leverageStatusTextClass(card.status)}`}>
          {card.detail.value}
        </span>
      </div>
      <p className={`text-xs leading-snug ${leverageStatusTextClass(card.status)}`}>
        {card.detail.tip}
      </p>
      <Link
        href={card.href}
        className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--ink-2)] hover:text-[var(--ink)] hover:underline"
      >
        {card.detail.actionLabel}
        <ArrowRight className="w-3 h-3" aria-hidden="true" />
      </Link>
    </div>
  )
}
