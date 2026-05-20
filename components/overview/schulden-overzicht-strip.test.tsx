import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  SchuldenOverzichtStrip,
  type DebtForStrip,
} from './schulden-overzicht-strip'

/**
 * Tests voor SchuldenOverzichtStrip — sinds de refactor naar
 * `<CategoryCard>` toetsen we hier groepering + totaal + links.
 */

function debt(debt_type: DebtForStrip['debt_type'], balance: number): DebtForStrip {
  return { debt_type, current_balance: balance }
}

describe('SchuldenOverzichtStrip — render', () => {
  it('rendert niets bij lege debts', () => {
    const { container } = render(<SchuldenOverzichtStrip debts={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('rendert niets bij grandTotal = 0', () => {
    const { container } = render(
      <SchuldenOverzichtStrip debts={[debt('mortgage', 0)]} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('rendert vier groep-kaarten', () => {
    render(
      <SchuldenOverzichtStrip
        debts={[
          debt('mortgage', 200_000),
          debt('personal_loan', 5000),
          debt('student_loan', 15_000),
          debt('credit_card', 800),
        ]}
      />,
    )
    expect(screen.getByText('Hypotheek')).toBeTruthy()
    expect(screen.getByText('Leningen')).toBeTruthy()
    expect(screen.getByText('Studieschuld')).toBeTruthy()
    expect(screen.getByText('Overig')).toBeTruthy()
  })

  it('groepeert personal_loan + car_loan + revolving_credit onder Leningen', () => {
    const { container } = render(
      <SchuldenOverzichtStrip
        debts={[
          debt('personal_loan', 3000),
          debt('car_loan', 5000),
          debt('revolving_credit', 2000),
        ]}
      />,
    )
    // 3 + 5 + 2 = 10k onder Leningen — verschijnt in totaal-header én in
    // Leningen-kaart
    expect(container.textContent).toMatch(/€\s*10\.000/)
  })

  it('groepeert credit_card + belastingschuld + dga_schuld onder Overig', () => {
    const { container } = render(
      <SchuldenOverzichtStrip
        debts={[
          debt('credit_card', 500),
          debt('belastingschuld', 2000),
          debt('dga_schuld', 1500),
        ]}
      />,
    )
    // 500 + 2000 + 1500 = 4000 onder Overig (en in totaal-header)
    expect(container.textContent).toMatch(/€\s*4\.000/)
  })

  it('toont totaal schuld in header', () => {
    render(
      <SchuldenOverzichtStrip
        debts={[debt('mortgage', 150_000), debt('student_loan', 10_000)]}
      />,
    )
    expect(screen.getByText(/€\s*160\.000/)).toBeTruthy()
    expect(screen.getByText('Totaal schuld')).toBeTruthy()
  })

  it('toont percentage per groep in meta-regel', () => {
    render(
      <SchuldenOverzichtStrip debts={[debt('mortgage', 100_000)]} />,
    )
    expect(screen.getByText(/100% van totaal/i)).toBeTruthy()
  })

  it('linkt naar sub-routes per groep', () => {
    const { container } = render(
      <SchuldenOverzichtStrip
        debts={[
          debt('mortgage', 1000),
          debt('personal_loan', 1000),
          debt('student_loan', 1000),
          debt('credit_card', 1000),
        ]}
      />,
    )
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    )
    expect(hrefs).toContain('/overzicht/schulden#debt-group-mortgage')
    expect(hrefs).toContain('/overzicht/schulden#debt-group-personal_loan')
    expect(hrefs).toContain('/overzicht/schulden#debt-group-student_loan')
    expect(hrefs).toContain('/overzicht/schulden#debt-group-credit_card')
  })

  it('toont fallback-tekst voor groep met 0 waarde', () => {
    render(
      <SchuldenOverzichtStrip
        debts={[debt('mortgage', 150_000)]}
      />,
    )
    // Drie andere groepen met 0 → CategoryCard krijgt meta "Geen schuld"
    expect(screen.getAllByText(/Geen schuld/i).length).toBe(3)
  })
})
