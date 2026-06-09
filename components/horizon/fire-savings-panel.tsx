'use client'

import { MaskedAmount } from '@/components/app/masked-amount'

export interface FireSavingsPanelValue {
  /** Lege string = override leeg = gebruik berekende waarde (NULL in DB). */
  override: string
}

export interface FireSavingsPanelProps {
  value: FireSavingsPanelValue
  onChange: (next: FireSavingsPanelValue) => void
  /** Berekend uit assets.monthly_contribution. Null als geen assets met contributies. */
  monthlyContributionFromAssets: number | null
  /** Berekend uit 6m-transactie-surplus als budgetteren-module actief is. Null als module uit of geen surplus. */
  monthlySurplusFromBudget: number | null
  /** Spaarquote × inkomen per maand uit de cashflow-pagina — exact het bedrag dat
   *  de prognose gebruikt als deze override leeg is. Null als nog onbekend. */
  baseMonthlySavingsFromCashflow: number | null
  /** Of de Budgetteren-module actief is. Bepaalt of we de budget-summary tonen. */
  budgetingActive: boolean
}

export function FireSavingsPanel({
  value,
  onChange,
  monthlyContributionFromAssets,
  baseMonthlySavingsFromCashflow,
}: FireSavingsPanelProps) {
  const { override } = value

  // Primaire berekende waarde = spaarquote × inkomen uit de cashflow-pagina.
  // Dit is exact wat de prognose gebruikt als de override leeg blijft.
  const hasCashflowSavings = baseMonthlySavingsFromCashflow != null && baseMonthlySavingsFromCashflow > 0
  const hasAssetContribution = monthlyContributionFromAssets != null && monthlyContributionFromAssets > 0

  const overrideNum = override === '' ? null : Number(override)
  const overrideActive = overrideNum != null && !isNaN(overrideNum) && overrideNum >= 0

  return (
    <div className="mb-6">
      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Spaargeld in de prognose</p>
      <p className="mb-4 font-sans text-sm text-[var(--ink-3)]">
        Hoeveel je per maand opzij zet voor je toekomstige vermogen. Bepaalt direct het tempo van je vermogensopbouw.
      </p>

      <div className="mb-4 rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2.5">
        <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">Berekende waarde</p>
        <div className="mt-1 font-sans text-[13px] text-[var(--ink-2)]">
          {hasCashflowSavings ? (
            <>
              Op basis van je <span className="font-semibold text-[var(--ink)]">spaarquote en inkomen</span> uit Cashflow
              zet je momenteel{' '}
              <span className="font-semibold text-[var(--ink)]">
                <MaskedAmount value={baseMonthlySavingsFromCashflow!} tone="ink" />
              </span>
              /maand opzij. Dit gebruikt de prognose als je hieronder niets invult.
            </>
          ) : hasAssetContribution ? (
            <>
              Je legt momenteel{' '}
              <span className="font-semibold text-[var(--ink)]">
                <MaskedAmount value={monthlyContributionFromAssets!} tone="ink" />
              </span>
              /maand in op je beleggingsrekeningen.
            </>
          ) : (
            <span className="italic text-[var(--ink-3)]">
              Nog niet bekend &mdash; stel je inkomen en spaarquote in op de Cashflow-pagina, of vul hieronder zelf in.
            </span>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="monthlySavingsOverride" className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">
          Spaargeld per maand (&euro;) &mdash; vul in om de berekende waarde te overrulen
        </label>
        <input
          id="monthlySavingsOverride"
          type="number"
          min={0}
          step={50}
          value={override}
          onChange={e => onChange({ ...value, override: e.target.value })}
          placeholder={hasCashflowSavings
            ? `Standaard: ${Math.round(baseMonthlySavingsFromCashflow!)}`
            : hasAssetContribution
              ? `Standaard: ${Math.round(monthlyContributionFromAssets!)}`
              : 'bv. 500'}
          className="mt-1.5 w-full rounded-lg border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm font-mono text-[var(--ink)] outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
        />
        {overrideActive && (
          <p className="mt-1.5 font-sans text-[11px] text-[var(--ink-3)]">
            &asymp; <MaskedAmount value={overrideNum! * 12} tone="ink" />/jaar wordt in de FIRE-prognose meegerekend.
          </p>
        )}
        {!overrideActive && (
          <p className="mt-1.5 font-sans text-[11px] text-[var(--ink-3)]">
            Laat leeg om je spaarquote &times; inkomen uit Cashflow te gebruiken.
          </p>
        )}
      </div>
    </div>
  )
}
