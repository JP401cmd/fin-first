'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Pencil } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { MaskedAmount } from '@/components/app/masked-amount'
import {
  DEBT_TYPE_LABELS,
  DEBT_SUBTYPE_LABELS,
  type Debt,
} from '@/lib/debt-data'
import { AppToggleSection } from './app-toggle-section'

interface DebtDetailSheetProps {
  /** Geselecteerde schuld of `null` als de sheet gesloten moet zijn. */
  debt: Debt | null
  /** Sluit-callback. */
  onClose: () => void
}

/**
 * Eenvoudige read-only detail-sheet voor een schuld op de categorie-pagina.
 *
 * Bewerken/herwaarderen gaat via de volledige flow op `/core/debts?debt=<id>`
 * — daar bestaat al een form. We linken expliciet zodat de gebruiker zelf
 * kiest om te navigeren.
 */
export function DebtDetailSheet({ debt, onClose }: DebtDetailSheetProps) {
  const router = useRouter()
  const { masked } = useMaskedAmounts()
  return (
    <BottomSheet
      open={debt !== null}
      onClose={onClose}
      title={debt?.name ?? 'Schuld'}
      size="md"
    >
      {debt && (
        <div className="space-y-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
              Huidig saldo
            </p>
            <p className="mt-1 text-negative">
              <MaskedAmount value={Number(debt.current_balance)} tone="kern" className="text-3xl font-bold" />
            </p>
          </div>

          {/* App-toggles: laat user een verdieping (Aflosstrategie,
              Hypotheekplanner, …) per schuld in/uitschakelen direct vanuit
              de sheet. Component is generiek via de registry — toekomstige
              apps verschijnen automatisch zonder code-aanpassing hier. */}
          <AppToggleSection
            item={debt}
            kind="debt"
            onToggled={() => router.refresh()}
          />

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-y border-[var(--border-ed)] py-4">
            <Meta label="Categorie" value={DEBT_TYPE_LABELS[debt.debt_type]} />
            {debt.subtype && (
              <Meta
                label="Subtype"
                value={
                  DEBT_SUBTYPE_LABELS[debt.debt_type]?.[debt.subtype] ??
                  debt.subtype
                }
              />
            )}
            {debt.creditor && (
              <Meta label="Geldverstrekker" value={debt.creditor} />
            )}
            {debt.interest_rate != null && (
              <Meta
                label="Rente"
                value={`${(Number(debt.interest_rate) * 100).toFixed(2)}%`}
              />
            )}
            {debt.monthly_payment != null && Number(debt.monthly_payment) > 0 && (
              <Meta
                label="Maandlasten"
                value={formatMaskedCurrency(Number(debt.monthly_payment), masked)}
              />
            )}
            {debt.original_amount != null && Number(debt.original_amount) > 0 && (
              <Meta
                label="Oorspronkelijk"
                value={formatMaskedCurrency(Number(debt.original_amount), masked)}
              />
            )}
            {debt.repayment_type && (
              <Meta label="Aflossingsvorm" value={debt.repayment_type} />
            )}
            {debt.end_date && (
              <Meta
                label="Einddatum"
                value={new Date(debt.end_date).toLocaleDateString('nl-NL', {
                  year: 'numeric',
                  month: 'short',
                })}
              />
            )}
          </dl>

          <div className="flex flex-wrap gap-2 pt-2">
            <Link
              href={`/core/debts?debt=${debt.id}`}
              className="inline-flex h-11 items-center gap-2 border border-kern-300 bg-kern-50 px-4 text-sm font-medium text-kern-700 transition-colors hover:bg-kern-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              Bewerken
            </Link>
            <Link
              href="/core/debts"
              className="inline-flex h-11 items-center gap-2 border border-[var(--border-ed)] bg-[var(--paper)] px-4 text-sm font-medium text-[var(--ink-2)] transition-colors hover:border-[var(--border-md)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            >
              Alle schulden
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      )}
    </BottomSheet>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-medium text-[var(--ink)]">{value}</dd>
    </div>
  )
}
