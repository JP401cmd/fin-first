'use client'

import { useState } from 'react'
import { Info, ShoppingCart, TrendingUp } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { MaskedAmount } from '@/components/app/masked-amount'
import type { RetirementExpenseMethod } from '@/lib/budget-utils'

interface MustExpenseItem {
  name: string
  monthlyAmount: number
  annualAmount: number
  interval: string
}

interface IncomeMonthEntry {
  month: string
  amount: number
}

interface CoreKengetallenProps {
  /** Geschat jaarinkomen (12-maands extrapolatie of profiel-fallback). */
  yearlyIncome: number
  /**
   * Aantal maanden waarover de inkomensschatting is gebaseerd. `0` betekent
   * dat de waarde uit het profiel komt (geen transactie-historie).
   */
  incomeMonths: number
  /** Per-maand uitsplitsing voor de inkomen-kassabon. */
  incomeByMonth: IncomeMonthEntry[]
  /** Jaarlijkse must-uitgaven (essentiële budgetten × jaarfrequentie). */
  yearlyMustExpenses: number
  /** Item-breakdown van must-uitgaven voor de uitgaven-kassabon. */
  mustExpenseItems: MustExpenseItem[]
  /** Methode waarop retirement-uitgaven berekend zijn (essential_budgets / custom_amount / current_income). */
  retirementMethod: RetirementExpenseMethod
  /** Of `budgetteren` actief is — bepaalt welke kassabon-variant we tonen voor uitgaven. */
  budgetingActive: boolean
}

export function CoreKengetallen({
  yearlyIncome,
  incomeMonths,
  incomeByMonth,
  yearlyMustExpenses,
  mustExpenseItems,
  retirementMethod,
  budgetingActive,
}: CoreKengetallenProps) {
  const [showIncomeReceipt, setShowIncomeReceipt] = useState(false)
  const [showExpenseReceipt, setShowExpenseReceipt] = useState(false)

  const showIncome = yearlyIncome > 0
  const showMustExpenses = yearlyMustExpenses > 0

  if (!showIncome && !showMustExpenses) {
    return null
  }

  return (
    <section
      data-testid="core-kengetallen"
      aria-label="Financiële kengetallen"
      className="border-t border-[var(--border-ed)] bg-[var(--paper)] px-4 py-6 sm:px-6 sm:py-8"
    >
      <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
        Kencijfers
      </p>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {showIncome && (
          <KengetalCard
            kicker="Geschat jaarinkomen"
            value={yearlyIncome}
            context={
              incomeMonths > 0 && incomeMonths < 12
                ? `Geëxtrapoleerd vanuit ${incomeMonths} ${incomeMonths === 1 ? 'maand' : 'maanden'}`
                : incomeMonths >= 12
                  ? 'Laatste 12 maanden'
                  : 'Profiel-schatting'
            }
            icon={<TrendingUp className="h-5 w-5 text-kern-600" aria-hidden="true" />}
            tooltip="Geschat jaarinkomen op basis van werkelijke transacties. Bij minder dan 12 maanden data extrapoleren we het gemiddelde naar een vol jaar."
            onClick={() => setShowIncomeReceipt(true)}
          />
        )}

        {showMustExpenses && (
          <KengetalCard
            kicker="Jaarlijkse must-uitgaven"
            value={yearlyMustExpenses}
            context="Essentiële kosten per jaar"
            icon={<ShoppingCart className="h-5 w-5 text-[var(--ink-3)]" aria-hidden="true" />}
            tooltip={
              budgetingActive
                ? 'Jaarlijkse som van essentiële budgetten: vaste lasten, dagelijkse uitgaven en vervoer. Dit bedrag bepaalt hoeveel vermogen je nodig hebt voor volledige vrijheid.'
                : 'Geschatte jaarlijkse uitgaven na pensioen, gebaseerd op je instellingen.'
            }
            onClick={() => setShowExpenseReceipt(true)}
          />
        )}
      </div>

      <BottomSheet
        open={showIncomeReceipt}
        onClose={() => setShowIncomeReceipt(false)}
        title="Geschat jaarinkomen"
        size="md"
      >
        <IncomeKassabon
          yearlyIncome={yearlyIncome}
          incomeMonths={incomeMonths}
          incomeByMonth={incomeByMonth}
        />
      </BottomSheet>

      <BottomSheet
        open={showExpenseReceipt}
        onClose={() => setShowExpenseReceipt(false)}
        title={budgetingActive ? 'Essentiële uitgaven' : 'Jaarlijkse uitgaven'}
        size="md"
      >
        <MustExpenseKassabon
          yearlyMustExpenses={yearlyMustExpenses}
          mustExpenseItems={mustExpenseItems}
          retirementMethod={retirementMethod}
          budgetingActive={budgetingActive}
        />
      </BottomSheet>
    </section>
  )
}

// ── KPI-kaart ────────────────────────────────────────────────

function KengetalCard({
  kicker,
  value,
  context,
  icon,
  tooltip,
  onClick,
}: {
  kicker: string
  value: number
  context: string
  icon: React.ReactNode
  tooltip: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-start gap-3 border border-[var(--border-ed)] bg-[var(--paper)] p-4 text-left transition-all hover:-translate-y-px hover:shadow-[var(--s2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-[var(--subtle)]">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
            {kicker}
          </p>
          <span
            className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[var(--ink-4)] transition-colors group-hover:text-[var(--ink-3)]"
            title={tooltip}
            aria-label={tooltip}
          >
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </div>
        <p className="mt-1 text-[var(--ink)]">
          <MaskedAmount value={value} tone="kern" className="text-xl font-semibold sm:text-2xl" />
        </p>
        <p className="mt-1 text-[11px] text-[var(--ink-4)]">{context}</p>
      </div>
    </button>
  )
}

// ── Kassabon: inkomen ────────────────────────────────────────

function IncomeKassabon({
  yearlyIncome,
  incomeMonths,
  incomeByMonth,
}: {
  yearlyIncome: number
  incomeMonths: number
  incomeByMonth: IncomeMonthEntry[]
}) {
  const subtotal = incomeByMonth.reduce((sum, entry) => sum + entry.amount, 0)
  const monthsLabel =
    incomeMonths > 0 && incomeMonths < 12
      ? `${incomeMonths} ${incomeMonths === 1 ? 'maand' : 'maanden'} data beschikbaar`
      : incomeMonths >= 12
        ? 'Laatste 12 maanden'
        : 'Profiel-schatting'

  return (
    <KassabonShell>
      <div className="mb-3 text-center">
        <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
          Inkomen overzicht
        </p>
        <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
          {monthsLabel}
        </p>
      </div>

      <div className="mb-1 border-b border-dashed border-[var(--border-ed)] pb-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
        Je geschat jaarinkomen is de basis voor veel berekeningen, zoals je
        spaarquote en vrijheidspercentage. We tellen alle positieve transacties
        op over de afgelopen 12 maanden.
      </div>

      {incomeByMonth.length > 0 && (
        <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
          {incomeByMonth.map(({ month, amount }) => {
            const [y, m] = month.split('-')
            const label = new Date(Number(y), Number(m) - 1).toLocaleDateString(
              'nl-NL',
              { month: 'long', year: 'numeric' },
            )
            return (
              <div key={month} className="flex justify-between py-0.5">
                <span className="capitalize text-[var(--ink-2)]">{label}</span>
                <span className="text-[var(--ink)]">
                  <MaskedAmount value={amount} tone="kern" />
                </span>
              </div>
            )
          })}
        </div>
      )}

      {incomeByMonth.length > 0 && (
        <div className="flex justify-between py-1">
          <span className="text-[var(--ink-3)]">Subtotaal werkelijk</span>
          <span className="font-medium text-[var(--ink)]">
            <MaskedAmount value={subtotal} tone="kern" />
          </span>
        </div>
      )}

      {incomeMonths > 0 && incomeMonths < 12 && incomeByMonth.length > 0 && (
        <div className="mt-2 border-t border-dashed border-[var(--border-ed)] pt-2">
          <p className="font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
            Gemiddeld per maand:{' '}
            <MaskedAmount value={subtotal / incomeMonths} tone="kern" />
            {' '}({incomeMonths} mnd) → geëxtrapoleerd naar 12 maanden
          </p>
        </div>
      )}

      <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2">
        <span className="font-bold text-[var(--ink)]">Geschat jaarinkomen</span>
        <span className="font-bold text-[var(--ink)]">
          <MaskedAmount value={yearlyIncome} tone="kern" />
        </span>
      </div>

      <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
        <p>
          <strong className="text-[var(--ink-3)]">Formule:</strong> som van alle
          positieve transacties over{' '}
          {incomeMonths > 0 && incomeMonths < 12
            ? `${incomeMonths} maanden, gedeeld door ${incomeMonths} en vermenigvuldigd met 12`
            : 'de laatste 12 maanden'}
          .
        </p>
      </div>

      <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">
        Berekend op basis van werkelijke transacties.
      </p>
    </KassabonShell>
  )
}

// ── Kassabon: must-uitgaven ──────────────────────────────────

function MustExpenseKassabon({
  yearlyMustExpenses,
  mustExpenseItems,
  retirementMethod,
  budgetingActive,
}: {
  yearlyMustExpenses: number
  mustExpenseItems: MustExpenseItem[]
  retirementMethod: RetirementExpenseMethod
  budgetingActive: boolean
}) {
  const monthlyAverage = yearlyMustExpenses / 12

  if (budgetingActive && mustExpenseItems.length > 0) {
    return (
      <KassabonShell>
        <div className="mb-3 text-center">
          <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
            Essentiële uitgaven
          </p>
          <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
            Vaste lasten op jaarbasis
          </p>
        </div>

        <div className="mb-1 border-b border-dashed border-[var(--border-ed)] pb-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
          Dit zijn de kosten die je sowieso maakt — vaste lasten, dagelijkse
          boodschappen en vervoer. Dit bedrag bepaalt hoeveel vermogen je nodig
          hebt voor volledige vrijheid.
        </div>

        <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
          {mustExpenseItems.map((item) => {
            const intervalLabel =
              item.interval === 'monthly'
                ? '/mnd'
                : item.interval === 'quarterly'
                  ? '/kwt'
                  : '/jr'
            return (
              <div key={item.name} className="flex justify-between py-0.5">
                <span className="text-[var(--ink-2)]">
                  {item.name}{' '}
                  <span className="text-[10px] text-[var(--ink-3)]">
                    {intervalLabel}
                  </span>
                </span>
                <span className="text-[var(--ink)]">
                  <MaskedAmount value={item.annualAmount} tone="kern" />
                </span>
              </div>
            )
          })}
        </div>

        <div className="mt-1 flex justify-between border-t-2 border-[var(--ink)] pt-2">
          <span className="font-bold text-[var(--ink)]">Totaal per jaar</span>
          <span className="font-bold text-[var(--ink)]">
            <MaskedAmount value={yearlyMustExpenses} tone="kern" />
          </span>
        </div>

        <div className="mt-1 flex justify-between text-[var(--ink-3)]">
          <span>Gemiddeld per maand</span>
          <MaskedAmount value={monthlyAverage} tone="kern" />
        </div>

        <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
          <p>
            <strong className="text-[var(--ink-3)]">Formule:</strong> per budget
            het limietbedrag omgerekend naar jaarbasis (maandelijks × 12, per
            kwartaal × 4, of jaarlijks × 1), alles opgeteld.
          </p>
        </div>

        <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">
          Berekend op basis van essentiële budgetinstellingen.
        </p>
      </KassabonShell>
    )
  }

  // Fallback: budgetteren uit of geen items — toon de afgeleide jaaruitgaven.
  return (
    <KassabonShell>
      <div className="mb-3 text-center">
        <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
          Jaarlijkse uitgaven
        </p>
        <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
          Geschatte kosten na pensioen
        </p>
      </div>

      <div className="mb-1 border-b border-dashed border-[var(--border-ed)] pb-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
        Dit bedrag wordt gebruikt voor je vrijheidsberekening en FIRE-doel. Je
        kunt het aanpassen in je instellingen.
      </div>

      <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
        <div className="flex justify-between py-0.5">
          <span className="text-[var(--ink-2)]">
            {retirementMethod === 'custom_amount'
              ? 'Eigen bedrag'
              : retirementMethod === 'current_income'
                ? 'Huidig jaarinkomen'
                : 'Geschatte jaarlijkse uitgaven'}
          </span>
          <span className="text-[var(--ink)]">
            <MaskedAmount value={yearlyMustExpenses} tone="kern" />
          </span>
        </div>
      </div>

      <div className="mt-1 flex justify-between border-t-2 border-[var(--ink)] pt-2">
        <span className="font-bold text-[var(--ink)]">Totaal per jaar</span>
        <span className="font-bold text-[var(--ink)]">
          <MaskedAmount value={yearlyMustExpenses} tone="kern" />
        </span>
      </div>

      <div className="mt-1 flex justify-between text-[var(--ink-3)]">
        <span>Gemiddeld per maand</span>
        <MaskedAmount value={monthlyAverage} tone="kern" />
      </div>

      <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
        <p>
          Pas je jaarlijkse uitgaven aan via{' '}
          <a
            href="/toekomst"
            className="text-kern-700 underline underline-offset-2"
          >
            de strategie-modal op /toekomst
          </a>
          .
        </p>
      </div>

      <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">
        {retirementMethod === 'custom_amount'
          ? 'Eigen bedrag uit instellingen.'
          : retirementMethod === 'current_income'
            ? 'Gebaseerd op huidig jaarinkomen.'
            : 'Gebaseerd op geschatte maandelijkse uitgaven.'}
      </p>
    </KassabonShell>
  )
}
