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
import { Banknote, CreditCard, Wallet, Receipt, ChevronDown, ArrowRight } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import type { HealthScore, HealthPillar } from '@/lib/financial-health'

type HefboomKey = 'bezittingen' | 'schulden' | 'cashflow' | 'belasting'
type StatusCode = 'good' | 'warn' | 'bad' | 'neutral'

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

const HEFBOMEN: ReadonlyArray<{
  key: HefboomKey
  label: string
  href: string
  Icon: typeof Wallet
  accent: string
  pillarKey: string | null
  tooltip: string
}> = [
  {
    key: 'bezittingen',
    label: 'Bezittingen',
    href: '/overzicht/bezittingen',
    Icon: Wallet,
    accent: 'text-emerald-700 bg-emerald-50',
    pillarKey: 'diversification',
    tooltip: 'Cash, beleggingen, eigen huis en pensioen — wat groeit voor je.',
  },
  {
    key: 'schulden',
    label: 'Schulden',
    href: '/overzicht/schulden',
    Icon: CreditCard,
    accent: 'text-amber-700 bg-amber-50',
    pillarKey: 'debt_ratio',
    tooltip: 'Hypotheek, leningen, studieschuld — wat je terugbetaalt.',
  },
  {
    key: 'cashflow',
    label: 'Cashflow',
    href: '/overzicht/cashflow',
    Icon: Banknote,
    accent: 'text-sky-700 bg-sky-50',
    pillarKey: 'savings_rate',
    tooltip: 'In en uit per maand — het deel dat je opzij zet bepaalt je tempo.',
  },
  {
    key: 'belasting',
    label: 'Belasting',
    href: '/overzicht/belasting',
    Icon: Receipt,
    accent: 'text-violet-700 bg-violet-50',
    pillarKey: 'tax_optimization',
    tooltip: 'Box 1, Box 2 en Box 3 — slim verdelen scheelt geld per jaar.',
  },
] as const

const STATUS_DOT: Record<StatusCode, string> = {
  good: 'bg-emerald-500',
  warn: 'bg-amber-500',
  bad: 'bg-red-500',
  neutral: 'bg-stone-300',
}

const STATUS_LABEL: Record<StatusCode, string> = {
  good: 'Goed op koers',
  warn: 'Aandacht',
  bad: 'Risico',
  neutral: 'Geen score',
}

function pillarStatus(score: number | null | undefined): StatusCode {
  if (score == null) return 'neutral'
  if (score >= 70) return 'good'
  if (score >= 50) return 'warn'
  return 'bad'
}

function statusTextClass(status: StatusCode): string {
  return status === 'good'
    ? 'text-emerald-700'
    : status === 'warn'
      ? 'text-amber-700'
      : 'text-red-700'
}

function statusSubText(key: HefboomKey, status: StatusCode, pillar?: HealthPillar): string | null {
  if (status === 'neutral') return null
  if (key === 'bezittingen') {
    return status === 'good' ? 'Diversificatie ok' : status === 'warn' ? 'Beperkt gespreid' : 'Slecht gespreid'
  }
  if (key === 'schulden') {
    const ratio = pillar?.rawValue ?? ''
    return status === 'good' ? 'Aflossing op schema' : status === 'warn' ? `Schuldratio ${ratio}` : 'Hoge schuldenlast'
  }
  if (key === 'cashflow') {
    return status === 'good' ? 'Op koers met sparen' : status === 'warn' ? 'Lager dan doel' : 'Tekort op rekening'
  }
  if (key === 'belasting') {
    return status === 'good' ? 'Geen actie nodig' : status === 'warn' ? 'Optimaliseer Box 3' : 'Box 3-actie nodig'
  }
  return null
}

export function HefbomenNav({
  health,
  totals,
}: {
  health: HealthScore | null
  totals?: HefbomenTotals
}) {
  // Eén tegel-expand per keer — open/dicht via chevron. Mobile: tap, desktop:
  // tap of hover (we gebruiken alleen state-based toggle voor consistente UX).
  const [expandedKey, setExpandedKey] = useState<HefboomKey | null>(null)

  return (
    <nav
      aria-label="Vier hefbomen"
      className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 mb-3"
    >
      {HEFBOMEN.map(({ key, label, href, Icon, accent, pillarKey, tooltip }) => {
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
              ? `${formatCurrency(totalValue)}/jr`
              : formatCurrency(totalValue)
          : ''
        const subText = statusSubText(key, status, pillar)
        const expanded = expandedKey === key

        const hasDrilldown = pillar || status !== 'neutral'

        return (
          <div
            key={key}
            className={[
              'group relative flex flex-col rounded-2xl border bg-[var(--paper)] p-3 sm:p-4 transition-all',
              expanded
                ? 'border-[var(--ink-3)] shadow-sm row-span-2 sm:row-span-1'
                : 'border-[var(--border-ed)] hover:border-[var(--ink-3)] hover:shadow-sm',
            ].join(' ')}
          >
            <Link
              href={href}
              title={tooltip}
              className="flex flex-col"
            >
              <span
                className={`absolute right-2.5 top-2.5 sm:right-3 sm:top-3 w-2 h-2 rounded-full ${STATUS_DOT[status]}`}
                aria-hidden="true"
                title={STATUS_LABEL[status]}
              />
              <div
                className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center ${accent}`}
              >
                <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="mt-2 text-sm sm:text-base font-semibold text-[var(--ink)]">
                {label}
              </div>
              {showTotal && (
                <div className="mt-0.5 text-base sm:text-lg font-serif font-semibold text-[var(--ink)] tabular-nums">
                  {formattedTotal}
                </div>
              )}
              {/* Subtext + chevron op één rij — chevron rechts naast de
                  status-substext zodat de tegel niet hoger wordt en de
                  primaire link (heel kaartje) intact blijft. */}
              <div className="mt-1 flex items-end justify-between gap-2 min-h-[16px]">
                {subText ? (
                  <span className={`text-[11px] font-medium ${statusTextClass(status)}`}>
                    {subText}
                  </span>
                ) : (
                  <span />
                )}
              </div>
            </Link>

            {/* Chevron-toggle — kleine icon-only knop in rechter-onderhoek,
                absolute-gepositioneerd binnen de tegel zodat hij naast de
                status-substext landt. Card-klik gaat naar /overzicht/<hefboom>;
                alleen chevron-klik toggelt de drill-down hieronder. */}
            {hasDrilldown && (
              <button
                type="button"
                onClick={() => setExpandedKey(expanded ? null : key)}
                aria-expanded={expanded}
                aria-label={expanded ? `Verberg detail ${label}` : `Toon detail ${label}`}
                className="absolute right-2 bottom-2 sm:right-2.5 sm:bottom-2.5 inline-flex items-center justify-center w-6 h-6 rounded-md text-[var(--ink-3)] hover:text-[var(--ink-2)] hover:bg-[var(--subtle)] transition-colors"
              >
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>
            )}

            {expanded && pillar && (
              <HefboomDetailCard pillar={pillar} status={status} href={href} />
            )}
          </div>
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
  const bgClass =
    status === 'good'
      ? 'bg-emerald-50/50'
      : status === 'warn'
        ? 'bg-amber-50/50'
        : status === 'bad'
          ? 'bg-red-50/50'
          : 'bg-[var(--subtle)]'
  return (
    <div
      className={`mt-2 -mx-3 sm:-mx-4 px-3 sm:px-4 py-3 border-t border-[var(--border-ed)] ${bgClass}`}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="text-[10px] uppercase tracking-[0.1em] font-semibold text-[var(--ink-3)]">
          {pillar.name}
        </span>
        <span className={`text-[11px] font-mono tabular-nums font-semibold ${statusTextClass(status)}`}>
          {pillar.rawValue}
        </span>
      </div>
      <p className={`text-xs leading-snug ${statusTextClass(status)}`}>
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
