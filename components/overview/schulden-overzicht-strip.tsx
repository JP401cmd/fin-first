import { formatCurrency } from '@/lib/format'
import { CategoryCard } from '@/components/core/category-card'
import type { DebtType } from '@/lib/debt-data'

/**
 * SchuldenOverzichtStrip — overzichtsstrook bovenaan /overzicht/schulden.
 *
 * Hergebruikt `<CategoryCard>` uit /core voor de tegels — identiek aan de
 * bezittingen-strook. De strip groepeert de 11 DebtType-waarden in vier
 * mentale categorieën (hypotheek, leningen, studieschuld, overig) en levert
 * per groep een aggregaat aan CategoryCard. Visualisatie-discipline (rode
 * accent-streep, sparkline-achtergrond, hover-lift) komt 1-op-1 uit /core.
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

// Tegel-href = anchor naar de eerste debt-group in dezelfde bundle op
// /overzicht/schulden. Klik scrollt naar die sectie, alles daaronder
// (inclusief overige groep-types in dezelfde bundle) blijft zichtbaar.
const GROUPS: {
  key: DebtGroup
  label: string
  iconName: string
  href: string
}[] = [
  {
    key: 'mortgage',
    label: 'Hypotheek',
    iconName: 'Building2',
    href: '/overzicht/schulden#debt-group-mortgage',
  },
  {
    key: 'loans',
    label: 'Leningen',
    iconName: 'Banknote',
    href: '/overzicht/schulden#debt-group-personal_loan',
  },
  {
    key: 'student',
    label: 'Studieschuld',
    iconName: 'GraduationCap',
    href: '/overzicht/schulden#debt-group-student_loan',
  },
  {
    key: 'other',
    label: 'Overig',
    iconName: 'CreditCard',
    href: '/overzicht/schulden#debt-group-credit_card',
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
  const counts: Record<DebtGroup, number> = {
    mortgage: 0,
    loans: 0,
    student: 0,
    other: 0,
  }
  for (const d of debts) {
    const group = GROUP_MAP[d.debt_type] ?? 'other'
    const balance = Number(d.current_balance ?? 0)
    totals[group] += balance
    if (balance > 0) counts[group] += 1
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 sm:gap-4">
        {GROUPS.map(({ key, label, iconName, href }, idx) => {
          const value = totals[key]
          const count = counts[key]
          const pct = grandTotal > 0 ? Math.round((value / grandTotal) * 100) : 0
          const meta =
            value > 0
              ? count > 0
                ? `${count} item${count === 1 ? '' : 's'} · ${pct}% van totaal`
                : `${pct}% van totaal`
              : 'Geen schuld'
          return (
            <CategoryCard
              key={key}
              iconName={iconName}
              label={label}
              total={value}
              count={count}
              meta={meta}
              href={href}
              variant="debt"
              staggerIndex={idx}
            />
          )
        })}
      </div>
    </section>
  )
}
