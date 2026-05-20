import Link from 'next/link'
import { Wallet, TrendingUp, Home, PiggyBank, type LucideIcon } from 'lucide-react'
import { formatCurrency } from '@/lib/format'

/**
 * BezittingenOverzichtStrip — KPI-tegels bovenaan /overzicht/bezittingen.
 *
 * Vier categorieën die de Nederlandse vermogensopbouw afdekken:
 *  - Cash: spaargeld + niet-gekoppelde bank-accounts (liquide buffer)
 *  - Beleggen: aandelen + crypto (groei-potentie)
 *  - Eigen huis: woning-waarde minus hypotheek (illiquide)
 *  - Pensioen: AOW + werkgevers-pensioen + lijfrente (afbouw-fase)
 *
 * Per tegel: bedrag + percentage van totaal vermogen. Klikbaar naar
 * de sub-route die alleen die asset-type toont.
 *
 * Plan-context: vergelijkbaar met BelastingOverzichtStrip op
 * /overzicht/belasting — geeft user direct overzicht van waar zijn
 * vermogen zit, zonder doorklikken in AssetsPage.
 */

type AssetCategory = 'cash' | 'investment' | 'eigen_huis' | 'pensioen'

const CATEGORIES: {
  key: AssetCategory
  label: string
  description: string
  href: string
  Icon: LucideIcon
  bg: string
  text: string
}[] = [
  {
    key: 'cash',
    label: 'Cash + spaargeld',
    description: 'Liquide buffer voor onverwachte uitgaven',
    href: '/overzicht/bezittingen/cash',
    Icon: Wallet,
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
  },
  {
    key: 'investment',
    label: 'Beleggen',
    description: 'Aandelen, ETFs, crypto — voor groei op lange termijn',
    href: '/overzicht/bezittingen/investment',
    Icon: TrendingUp,
    bg: 'bg-sky-50',
    text: 'text-sky-700',
  },
  {
    key: 'eigen_huis',
    label: 'Eigen huis',
    description: 'Woning-waarde minus hypotheekschuld',
    href: '/overzicht/bezittingen/eigen_huis',
    Icon: Home,
    bg: 'bg-amber-50',
    text: 'text-amber-700',
  },
  {
    key: 'pensioen',
    label: 'Pensioen',
    description: 'AOW + werkgevers-pensioen + lijfrente',
    href: '/overzicht/bezittingen/retirement',
    Icon: PiggyBank,
    bg: 'bg-violet-50',
    text: 'text-violet-700',
  },
]

export function BezittingenOverzichtStrip({
  cashTotal,
  investmentTotal,
  housingTotal,
  pensioenTotal,
}: {
  cashTotal: number
  investmentTotal: number
  /** Net van eigen huis: woning-waarde minus hypotheek. */
  housingTotal: number
  pensioenTotal: number
}) {
  const totals: Record<AssetCategory, number> = {
    cash: cashTotal,
    investment: investmentTotal,
    eigen_huis: housingTotal,
    pensioen: pensioenTotal,
  }
  const grandTotal = cashTotal + investmentTotal + housingTotal + pensioenTotal

  if (grandTotal <= 0) {
    return null
  }

  return (
    <section className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
      <header className="mb-4 flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            Bezittingen — overzicht
          </div>
          <h2 className="font-serif text-xl text-[var(--ink)] mt-1">
            Vier categorieën, één totaal
          </h2>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Totaal vermogen
          </div>
          <div className="font-serif font-semibold text-[var(--ink)] tabular-nums">
            {formatCurrency(Math.round(grandTotal))}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {CATEGORIES.map(({ key, label, description, href, Icon, bg, text }) => {
          const value = totals[key]
          const pct = grandTotal > 0 ? (value / grandTotal) * 100 : 0
          const Icn = Icon
          return (
            <Link
              key={key}
              href={href}
              className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-3 sm:p-4 hover:border-[var(--ink-3)] hover:shadow-sm transition-all"
            >
              <header className="flex items-center gap-2 mb-2">
                <span
                  className={`inline-flex items-center justify-center w-7 h-7 rounded-lg ${bg} ${text}`}
                >
                  <Icn className="w-3.5 h-3.5" aria-hidden="true" />
                </span>
                <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--ink-3)] truncate">
                  {label}
                </div>
              </header>
              <div className="font-serif text-base sm:text-lg font-semibold text-[var(--ink)] tabular-nums">
                {value > 0 ? formatCurrency(Math.round(value)) : '—'}
              </div>
              <div className="mt-0.5 text-[10px] text-[var(--ink-3)] tabular-nums">
                {Math.round(pct)}% van totaal
              </div>
              <p className="mt-1.5 text-[11px] text-[var(--ink-2)] leading-snug">
                {description}
              </p>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
