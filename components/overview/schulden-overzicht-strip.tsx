import Link from 'next/link'
import { Building2, Banknote, GraduationCap, CreditCard, type LucideIcon } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import type { DebtType } from '@/lib/debt-data'

/**
 * SchuldenOverzichtStrip — KPI-tegels bovenaan /overzicht/schulden.
 *
 * Vier groep-categorieën uit de 11 DebtType-waarden, geclusterd op
 * mentaal model van de gebruiker:
 *  - Hypotheek: mortgage (typisch grootste, beste rente)
 *  - Leningen: personal_loan + car_loan + revolving_credit
 *  - Studieschuld: student_loan (specifiek NL-instrument)
 *  - Overig: credit_card + payment_plan + belastingschuld + familielening
 *            + dga_schuld + other (vaak prio voor aflossen)
 *
 * Per tegel: bedrag + percentage van totaal schuld + link naar
 * sub-route. Vergelijkbaar patroon met BezittingenOverzichtStrip.
 */

type DebtGroup = 'mortgage' | 'loans' | 'student' | 'other'

const GROUP_MAP: Record<DebtType, DebtGroup> = {
  mortgage: 'mortgage',
  personal_loan: 'loans',
  car_loan: 'loans',
  revolving_credit: 'loans',
  student_loan: 'student',
  credit_card: 'other',
  payment_plan: 'other',
  belastingschuld: 'other',
  familielening: 'other',
  dga_schuld: 'other',
  other: 'other',
}

const GROUPS: {
  key: DebtGroup
  label: string
  description: string
  href: string
  Icon: LucideIcon
  bg: string
  text: string
}[] = [
  {
    key: 'mortgage',
    label: 'Hypotheek',
    description: 'Woonschuld — typisch grootste post, lage rente.',
    href: '/overzicht/schulden/mortgage',
    Icon: Building2,
    bg: 'bg-amber-50',
    text: 'text-amber-700',
  },
  {
    key: 'loans',
    label: 'Leningen',
    description: 'Auto, persoonlijk, doorlopend krediet.',
    href: '/overzicht/schulden/personal_loan',
    Icon: Banknote,
    bg: 'bg-rose-50',
    text: 'text-rose-700',
  },
  {
    key: 'student',
    label: 'Studieschuld',
    description: 'DUO-lening met aangepast aflosregime.',
    href: '/overzicht/schulden/student_loan',
    Icon: GraduationCap,
    bg: 'bg-sky-50',
    text: 'text-sky-700',
  },
  {
    key: 'other',
    label: 'Overig',
    description: 'Creditcard, afbetalingsregeling, belastingschuld.',
    href: '/overzicht/schulden/other',
    Icon: CreditCard,
    bg: 'bg-stone-100',
    text: 'text-stone-700',
  },
]

export interface DebtForStrip {
  debt_type: DebtType
  current_balance: number
}

export function SchuldenOverzichtStrip({ debts }: { debts: DebtForStrip[] }) {
  const totals: Record<DebtGroup, number> = {
    mortgage: 0,
    loans: 0,
    student: 0,
    other: 0,
  }
  for (const d of debts) {
    const group = GROUP_MAP[d.debt_type] ?? 'other'
    totals[group] += Number(d.current_balance ?? 0)
  }
  const grandTotal = Object.values(totals).reduce((s, v) => s + v, 0)
  if (grandTotal <= 0) return null

  return (
    <section className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
      <header className="mb-4 flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            Schulden — overzicht
          </div>
          <h2 className="font-serif text-xl text-[var(--ink)] mt-1">
            Vier groepen, één totaal
          </h2>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Totaal schuld
          </div>
          <div className="font-serif font-semibold text-[var(--ink)] tabular-nums">
            {formatCurrency(Math.round(grandTotal))}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {GROUPS.map(({ key, label, description, href, Icon, bg, text }) => {
          const value = totals[key]
          const pct = grandTotal > 0 ? (value / grandTotal) * 100 : 0
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
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" />
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
