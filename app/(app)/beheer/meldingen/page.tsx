import { BudgetAlert } from '@/components/app/budget-alert'

export default function BeheerMeldingenPage() {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-[var(--ink)]">Meldingoverzicht</h2>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          Alle mogelijke budget-meldingen per type — live preview
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* Inkomen */}
        <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-5">
          <h3 className="mb-3 text-sm font-semibold text-[var(--ink-2)]">Inkomen</h3>
          <p className="text-xs text-[var(--ink-3)]">Geen meldingen — inkomen dat de limiet overschrijdt is positief</p>
        </div>

        {/* Uitgaven */}
        <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-5">
          <h3 className="mb-3 text-sm font-semibold text-[var(--ink-2)]">Uitgaven</h3>
          <div className="space-y-2">
            <BudgetAlert
              budgetName="Boodschappen"
              budgetId="demo-warning"
              spent={425}
              limit={500}
              threshold={80}
              budgetType="expense"
            />
            <BudgetAlert
              budgetName="Horeca & eten"
              budgetId="demo-danger"
              spent={210}
              limit={200}
              threshold={80}
              budgetType="expense"
            />
            <BudgetAlert
              budgetName="Kleding"
              budgetId="demo-critical"
              spent={250}
              limit={200}
              threshold={80}
              budgetType="expense"
            />
          </div>
        </div>

        {/* Sparen */}
        <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-5">
          <h3 className="mb-3 text-sm font-semibold text-[var(--ink-2)]">Sparen</h3>
          <div className="space-y-2">
            <BudgetAlert
              budgetName="Sparen & noodbuffer"
              budgetId="demo-savings"
              spent={45}
              limit={100}
              threshold={80}
              budgetType="savings"
            />
          </div>
        </div>

        {/* Schulden */}
        <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-5">
          <h3 className="mb-3 text-sm font-semibold text-[var(--ink-2)]">Schulden</h3>
          <div className="space-y-2">
            <BudgetAlert
              budgetName="Schulden & aflossingen"
              budgetId="demo-debt"
              spent={18}
              limit={60}
              threshold={80}
              budgetType="debt"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
