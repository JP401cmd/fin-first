'use client'

export interface BankAccountEntry {
  name: string
  bank_name: string
  account_type: string
  balance: string
}

const EMPTY: BankAccountEntry = { name: '', bank_name: '', account_type: 'checking', balance: '' }

export function MiniBankForm({
  items,
  onChange,
}: {
  items: BankAccountEntry[]
  onChange: (items: BankAccountEntry[]) => void
}) {
  const add = () => onChange([...items, { ...EMPTY }])
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i))
  const update = (i: number, patch: Partial<BankAccountEntry>) =>
    onChange(items.map((item, idx) => (idx === i ? { ...item, ...patch } : item)))

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)] p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--ink-3)]">Rekening {i + 1}</span>
            <button onClick={() => remove(i)} className="text-xs text-red-500 hover:text-red-700">Verwijder</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Naam (bijv. Betaalrekening)"
              value={item.name}
              onChange={(e) => update(i, { name: e.target.value })}
              className="col-span-2 rounded-md border border-[var(--border-ed)] bg-[var(--paper)] px-2.5 py-1.5 text-base text-[var(--ink)] outline-none focus:border-[var(--border-md)] sm:text-xs"
            />
            <input
              type="text"
              placeholder="Bank (bijv. ING)"
              value={item.bank_name}
              onChange={(e) => update(i, { bank_name: e.target.value })}
              className="rounded-md border border-[var(--border-ed)] bg-[var(--paper)] px-2.5 py-1.5 text-base text-[var(--ink)] outline-none focus:border-[var(--border-md)] sm:text-xs"
            />
            <select
              value={item.account_type}
              onChange={(e) => update(i, { account_type: e.target.value })}
              className="rounded-md border border-[var(--border-ed)] bg-[var(--paper)] px-2.5 py-1.5 text-base text-[var(--ink)] outline-none focus:border-[var(--border-md)] sm:text-xs"
            >
              <option value="checking">Betaalrekening</option>
              <option value="savings">Spaarrekening</option>
              <option value="joint">Gezamenlijk</option>
            </select>
            <div className="col-span-2 relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--ink-4)]">&euro;</span>
              <input
                type="number"
                inputMode="decimal"
                step={0.01}
                placeholder="Saldo"
                value={item.balance}
                onChange={(e) => update(i, { balance: e.target.value })}
                className="w-full rounded-md border border-[var(--border-ed)] bg-[var(--paper)] py-1.5 pr-2.5 pl-6 text-base text-[var(--ink)] outline-none focus:border-[var(--border-md)] sm:text-xs"
              />
            </div>
          </div>
        </div>
      ))}
      <button
        onClick={add}
        className="flex w-full min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--border-ed)] py-2 text-xs font-medium text-[var(--ink-3)] hover:border-[var(--border-md)] hover:text-[var(--ink-2)] active:bg-[var(--subtle)]"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Rekening toevoegen
      </button>
    </div>
  )
}
