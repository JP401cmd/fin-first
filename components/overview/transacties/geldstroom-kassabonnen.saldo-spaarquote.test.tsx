import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SaldoSpaarquoteKassabon } from './geldstroom-kassabonnen'
import { summarizeFlow, type AnalysisTransaction } from '@/lib/transaction-insights'
import { savingsRateFromAggregates } from '@/lib/savings-source'
import { formatCurrencyDecimals } from '@/lib/format'

/**
 * UR3-14 deel D — de bon achter de Saldo-cel en de spaarquote-leeswaarde.
 *
 * De harde assertie is niet "er staat een percentage", maar dat het GERENDERDE
 * percentage exact de canonieke `savingsRateFromAggregates`-uitkomst is voor
 * dezelfde transacties. Een kassabon die zijn eigen deling doet, ziet er op het
 * scherm plausibel uit; alleen deze pinning maakt zulke drift zichtbaar.
 */

const eur = (value: number) => formatCurrencyDecimals(value).replace(/[\u00a0\u202f]/g, ' ')

const TXNS: AnalysisTransaction[] = [
  { id: '1', date: '2026-09-01', amount: 3_200, description: 'Salaris', budget_id: null, account_id: 'a1' },
  { id: '2', date: '2026-09-03', amount: -1_450.5, description: 'Huur', budget_id: 'b1', account_id: 'a1' },
  { id: '3', date: '2026-09-08', amount: -389.25, description: 'Boodschappen', budget_id: 'b2', account_id: 'a1' },
] as AnalysisTransaction[]

const SUMMARY = summarizeFlow(TXNS)
const VENSTER = 'September tot nu toe'

describe('SaldoSpaarquoteKassabon', () => {
  it('toont het saldo dat de samenvatting draagt, niet een eigen som', () => {
    render(<SaldoSpaarquoteKassabon summary={SUMMARY} windowLabel={VENSTER} />)
    expect(screen.getByTestId('flow-kassabon-saldo').textContent).toContain(
      formatCurrencyDecimals(SUMMARY.net),
    )
    expect(screen.getByText(eur(SUMMARY.income))).toBeTruthy()
    expect(screen.getByText(eur(-SUMMARY.expense))).toBeTruthy()
  })

  it('pint de spaarquote op de canonieke savingsRateFromAggregates-uitkomst', () => {
    render(<SaldoSpaarquoteKassabon summary={SUMMARY} windowLabel={VENSTER} />)

    const canoniek = Math.round(
      savingsRateFromAggregates(SUMMARY.income, SUMMARY.expense, 0),
    )
    expect(screen.getByTestId('flow-kassabon-spaarquote').textContent).toBe(`${canoniek}%`)
  })

  it('benoemt het venster en de afwijkende grondslag van de overzicht-quote', () => {
    render(<SaldoSpaarquoteKassabon summary={SUMMARY} windowLabel={VENSTER} />)
    // Twee dingen die allebei "spaarquote" heten mogen niet als hetzelfde
    // getal lezen — de bon zegt daarom welke hij toont.
    expect(screen.getByText(/kan hiervan afwijken/i)).toBeTruthy()
    expect(screen.getByText(/Aflossingen tellen hier niet als sparen mee/i)).toBeTruthy()
  })

  it('velt bij een tekort geen vrijheidstijd-oordeel over een lopende periode', () => {
    const tekort = summarizeFlow([
      { id: '1', date: '2026-09-03', amount: -1_450.5, description: 'Huur', budget_id: 'b1', account_id: 'a1' },
    ] as AnalysisTransaction[])
    render(<SaldoSpaarquoteKassabon summary={tekort} windowLabel={VENSTER} />)
    expect(screen.getByText(/Saldo — tekort/)).toBeTruthy()
    expect(screen.queryByText(/vrijheid$/)).toBeNull()
  })
})
