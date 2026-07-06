import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SubtotalLine } from './subtotal-line'

// De privacy-context defaultet (geen provider) op niet-gemaskeerd, dus de
// bedragen renderen als echte euro's. Zie components/app/masked-amount.tsx.

describe('SubtotalLine', () => {
  it('rendert label, geformatteerd bedrag en trailing-inhoud', () => {
    render(
      <SubtotalLine
        label="excl. eigen woning"
        amount={125000}
        trailing="8 jaar en 4 maanden vrijheid"
      />,
    )
    expect(screen.getByText('excl. eigen woning')).toBeTruthy()
    // formatCurrency(nl-NL) → "€ 125.000" (non-breaking space + punt-duizendtal)
    expect(screen.getByText(/125\.000/)).toBeTruthy()
    expect(screen.getByText('8 jaar en 4 maanden vrijheid')).toBeTruthy()
  })

  it('laat trailing weg wanneer niet meegegeven', () => {
    const { container } = render(
      <SubtotalLine label="Totale schuld · excl. eigen woning" amount={0} />,
    )
    // Alleen label-span + bedrag-span; geen italic trailing-span.
    expect(container.querySelector('span.italic')).toBeNull()
  })

  it('kleurt het bedrag via className (text-kern-700), NIET via een concurrerende tone-class', () => {
    // Fix 3-borging: MaskedAmount tone="inherit" levert geen kleurclass, zodat
    // uitsluitend text-kern-700 het accent zet (geen --color-kern-500 conflict).
    const { container } = render(<SubtotalLine label="excl. eigen woning" amount={125000} />)
    const amountSpan = Array.from(container.querySelectorAll('span')).find(
      (s) => s.textContent?.includes('125.000'),
    )
    expect(amountSpan).toBeTruthy()
    expect(amountSpan!.className).toContain('text-kern-700')
    // Geen module-tone-class die met text-kern-700 zou concurreren.
    expect(amountSpan!.className).not.toContain('--color-kern-500')
    expect(amountSpan!.className).not.toContain('module-active')
  })
})
