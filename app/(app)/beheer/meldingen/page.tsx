import Link from 'next/link'

export default function BeheerMeldingenPage() {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-[var(--ink)]">Meldingoverzicht</h2>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          Budget-meldingen zijn samengevoegd in de Budget Hub op de budgetpagina.
        </p>
      </div>

      <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-5">
        <p className="text-sm text-[var(--ink-2)]">
          Alle budget-alerts (overschreden, bijna vol) worden nu getoond in de{' '}
          <Link href="/core/budgets" className="font-medium text-wil-600 underline">
            Budgetanalyse hub
          </Link>
          {' '}op de budgetpagina. Het meldingencentrum blijft notificaties tonen via de API.
        </p>
      </div>
    </div>
  )
}
