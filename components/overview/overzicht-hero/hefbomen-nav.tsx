'use client'

import Link from 'next/link'
import { Banknote, CreditCard, Wallet, Receipt } from 'lucide-react'
import type { HealthScore } from '@/lib/financial-health'

type HefboomKey = 'bezittingen' | 'schulden' | 'cashflow' | 'belasting'
type StatusCode = 'good' | 'warn' | 'bad' | 'neutral'

const HEFBOMEN: ReadonlyArray<{
  key: HefboomKey
  label: string
  href: string
  Icon: typeof Wallet
  accent: string
  /** Pillar-key uit HealthScore voor status-bepaling. null = proxy uit health.total. */
  pillarKey: string | null
  /** Korte uitleg in title-tooltip (hover desktop, long-press mobile). */
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
    pillarKey: null,
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

/**
 * Map pillar-score (0-100) naar status-codering. Drempels matchen
 * financial-health.ts (Sterk ≥ 70, Redelijk 50-70, anders bad).
 */
function pillarStatus(score: number | null | undefined): StatusCode {
  if (score == null) return 'neutral'
  if (score >= 70) return 'good'
  if (score >= 50) return 'warn'
  return 'bad'
}

export function HefbomenNav({ health }: { health: HealthScore | null }) {
  return (
    <nav
      aria-label="Vier hefbomen"
      className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 mb-6"
    >
      {HEFBOMEN.map(({ key, label, href, Icon, accent, pillarKey, tooltip }) => {
        // Eigen pillar of (bij ontbrekende pillar zoals Belasting) proxy
        // uit overall health.total. Verhindert "altijd grijs"-tegel voor
        // users met data.
        const pillar =
          pillarKey && health ? health.pillars.find((p) => p.id === pillarKey) : undefined
        const proxyScore = !pillarKey && health ? health.total : null
        const status = pillarStatus(pillar?.score ?? proxyScore)

        return (
          <Link
            key={key}
            href={href}
            title={tooltip}
            className="group relative flex flex-col rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-3 sm:p-4 hover:border-[var(--ink-3)] hover:shadow-sm transition-all"
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
            <div className="mt-2 text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--ink-3)]">
              {status === 'neutral' ? 'Geen meting' : STATUS_LABEL[status]}
            </div>
            <div className="text-sm sm:text-base font-semibold text-[var(--ink)] mt-0.5 group-hover:text-[var(--ink-0)]">
              {label}
            </div>
          </Link>
        )
      })}
    </nav>
  )
}
