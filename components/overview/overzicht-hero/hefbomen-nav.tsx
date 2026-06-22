'use client'

/**
 * HefbomenNav — vier-hefbomen-rij op /overzicht hero. Klikbare tegels
 * naar /overzicht/{bezittingen,schulden,cashflow,belasting}.
 *
 * Per tegel: icoon + label + bedrag + contextuele status-substext.
 * Status-dot rechtsboven uit pillar.score. Chevron rechtsonder toggle
 * een drill-down met meer detail (zelfde status-kleur, relevante info).
 */

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import type { HealthScore, HealthPillar } from '@/lib/financial-health'
import { HEFBOOM_CONFIG, type Hefboom } from '@/lib/hefboom-config'
import { LeverageCard } from '@/components/overview/leverage-card'
import {
  pillarStatus,
  leverageStatusBgClass,
  leverageStatusTextClass,
  type LeverageStatus,
} from '@/lib/leverage-status'

type HefboomKey = Hefboom
type StatusCode = LeverageStatus

export type HefbomenTotals = {
  /** Totale waarde bezittingen, in EUR. */
  bezittingen?: number | null
  /** Totale openstaande schulden, in EUR. */
  schulden?: number | null
  /** Spaarquote 6-maands gemiddelde (0–100 %). */
  cashflow?: number | null
  /** Jaarlijkse Box 3-belasting, in EUR. */
  belasting?: number | null
}

/**
 * Nav-specifieke metadata per hefboom — `href`, `pillarKey`, `tooltip`.
 * Visuele velden (label/Icon/accent) komen uit `HEFBOOM_CONFIG` zodat de
 * navigatie 1-op-1 matcht met BriefingPanel- en TipsLijst-tags.
 */
const HEFBOMEN: ReadonlyArray<{
  key: Hefboom
  href: string
  pillarKey: string | null
  tooltip: string
}> = [
  {
    key: 'bezittingen',
    href: '/overzicht/bezittingen',
    pillarKey: 'asset_concentration',
    tooltip: 'Cash, beleggingen, eigen huis en pensioen — wat groeit voor je.',
  },
  {
    key: 'schulden',
    href: '/overzicht/schulden',
    pillarKey: 'debt_ratio',
    tooltip: 'Hypotheek, leningen, studieschuld — wat je terugbetaalt.',
  },
  {
    key: 'cashflow',
    href: '/overzicht/cashflow',
    pillarKey: 'savings_rate',
    tooltip: 'In en uit per maand — het deel dat je opzij zet bepaalt je tempo.',
  },
  {
    key: 'belasting',
    href: '/overzicht/belasting',
    pillarKey: null,
    tooltip: 'Box 1, Box 2 en Box 3 — verken je positie en hoe je het verdeelt.',
  },
] as const

function statusSubText(key: HefboomKey, status: StatusCode, pillar?: HealthPillar): string | null {
  if (status === 'neutral') return null
  if (key === 'bezittingen') {
    return status === 'good' ? 'Goed gespreid' : status === 'warn' ? 'Beperkt gespreid' : 'Sterk geconcentreerd'
  }
  if (key === 'schulden') {
    const ratio = pillar?.rawValue ?? ''
    return status === 'good' ? 'Aflossing op schema' : status === 'warn' ? `Schuldratio ${ratio}` : 'Hoge schuldenlast'
  }
  if (key === 'cashflow') {
    return status === 'good' ? 'Op koers met sparen' : status === 'warn' ? 'Lager dan doel' : 'Tekort op rekening'
  }
  if (key === 'belasting') {
    // Geen pijler meer (ADR 0010): valt terug op de totaal-score-proxy en is
    // bewust een richtingaanwijzer — geen handelingsadvies of besparingsbelofte.
    return 'Verken je Box 3-positie'
  }
  return null
}

export function HefbomenNav({
  health,
  totals,
  simple = false,
}: {
  health: HealthScore | null
  totals?: HefbomenTotals
  /**
   * Eenvoudige weergave (display_mode === 'simple'): verberg de chevron /
   * uitklap-drill-down op de hefboomkaarten — de kaarten blijven dan rustige,
   * klikbare tegels zonder collapse-affordance. Default false → ongewijzigd.
   */
  simple?: boolean
}) {
  // Eén tegel-expand per keer — open/dicht via chevron. Mobile: tap, desktop:
  // tap of hover (we gebruiken alleen state-based toggle voor consistente UX).
  const [expandedKey, setExpandedKey] = useState<HefboomKey | null>(null)

  // Euro-totalen (bezittingen/schulden/belasting) zijn saldi en honoreren de
  // privacy-toggle. Het cashflow-percentage is géén saldo en blijft zichtbaar.
  const { masked } = useMaskedAmounts()

  return (
    <nav
      aria-label="Vier hefbomen"
      className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 mb-3"
    >
      {HEFBOMEN.map(({ key, href, pillarKey, tooltip }) => {
        const cfg = HEFBOOM_CONFIG[key]
        const { label, Icon } = cfg
        const accent = cfg.tint
        const pillar =
          pillarKey && health ? health.pillars.find((p) => p.id === pillarKey) : undefined
        const proxyScore = !pillarKey && health ? health.total : null
        const status = pillarStatus(pillar?.score ?? proxyScore)

        const totalValue = totals?.[key]
        const showTotal = typeof totalValue === 'number' && totalValue > 0
        const formattedTotal = showTotal
          ? key === 'cashflow'
            ? `${Math.round(totalValue)}%`
            : key === 'belasting'
              ? `${formatMaskedCurrency(totalValue, masked)}/jr`
              : formatMaskedCurrency(totalValue, masked)
          : ''
        const subText = statusSubText(key, status, pillar)
        const expanded = expandedKey === key

        const hasDrilldown = Boolean(pillar) || status !== 'neutral'

        return (
          <LeverageCard
            key={key}
            Icon={Icon}
            tint={accent}
            label={label}
            kpi={showTotal ? formattedTotal : null}
            status={status}
            subText={subText}
            href={href}
            tooltip={tooltip}
            expandable={hasDrilldown && !simple}
            expanded={expanded}
            onToggleExpand={() => setExpandedKey(expanded ? null : key)}
          >
            {pillar && (
              <HefboomDetailCard pillar={pillar} status={status} href={href} />
            )}
          </LeverageCard>
        )
      })}
    </nav>
  )
}

/**
 * Drill-down detail-content per hefboom. Toont rawValue + improvementTip
 * uit de pillar, plus deep-link naar de actie-pagina. Tekst-kleur volgt
 * status zodat groen=informatief, rood=urgent zichtbaar is.
 */
function HefboomDetailCard({
  pillar,
  status,
  href,
}: {
  pillar: HealthPillar
  status: StatusCode
  href: string
}) {
  return (
    <div
      className={`mt-2 -mx-3 sm:-mx-4 px-3 sm:px-4 py-3 border-t border-[var(--border-ed)] ${leverageStatusBgClass(status)}`}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="text-[10px] uppercase tracking-[0.1em] font-semibold text-[var(--ink-3)]">
          {pillar.name}
        </span>
        <span className={`text-[11px] font-mono tabular-nums font-semibold ${leverageStatusTextClass(status)}`}>
          {pillar.rawValue}
        </span>
      </div>
      <p className={`text-xs leading-snug ${leverageStatusTextClass(status)}`}>
        {pillar.improvementTip}
      </p>
      <Link
        href={pillar.actionHref || href}
        className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--ink-2)] hover:text-[var(--ink)] hover:underline"
      >
        {pillar.actionLabel || 'Bekijk details'}
        <ArrowRight className="w-3 h-3" aria-hidden="true" />
      </Link>
    </div>
  )
}

/**
 * Compacte legenda onder de hefbomen-rij. Mockup-stijl uitleg voor de
 * status-dots zodat gebruikers meteen weten wat groen/oranje/rood betekent.
 */
export function HefbomenLegenda() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mt-3 mb-6 text-xs text-[var(--ink-3)]">
      <span className="inline-flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true" />
        Op koers
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-amber-500" aria-hidden="true" />
        Aandacht nodig
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-red-500" aria-hidden="true" />
        Actie vereist
      </span>
    </div>
  )
}
