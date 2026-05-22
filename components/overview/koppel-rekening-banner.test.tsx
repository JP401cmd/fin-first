import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KoppelRekeningBanner } from './koppel-rekening-banner'

describe('KoppelRekeningBanner', () => {
  describe('zonder gekoppelde rekeningen', () => {
    it('toont invite-banner met CTA naar PSD2-flow', () => {
      const { container } = render(<KoppelRekeningBanner accountCount={0} />)
      expect(screen.getByText(/Geen bankrekeningen gekoppeld/i)).toBeTruthy()
      expect(screen.getByText(/Koppel je bank in 2 minuten/i)).toBeTruthy()
      const links = Array.from(container.querySelectorAll('a')).map((a) =>
        a.getAttribute('href'),
      )
      expect(links).toContain('/core/cash/connect')
      expect(links).toContain('/core/cash/import')
    })

    it('vermeldt PSD2 + GoCardless privacy-context', () => {
      const { container } = render(<KoppelRekeningBanner accountCount={0} />)
      expect(container.textContent).toMatch(/PSD2/)
      expect(container.textContent).toMatch(/GoCardless/)
    })
  })

  describe('met gekoppelde rekeningen', () => {
    it('toont compact statusje "1 rekening gekoppeld"', () => {
      render(<KoppelRekeningBanner accountCount={1} />)
      expect(screen.getByText(/1 rekening gekoppeld/)).toBeTruthy()
    })

    it('toont "3 rekeningen gekoppeld" bij meerdere', () => {
      render(<KoppelRekeningBanner accountCount={3} />)
      expect(screen.getByText(/3 rekeningen gekoppeld/)).toBeTruthy()
    })

    it('toont beheer-links naast status', () => {
      const { container } = render(<KoppelRekeningBanner accountCount={2} />)
      const links = Array.from(container.querySelectorAll('a')).map((a) =>
        a.getAttribute('href'),
      )
      expect(links).toContain('/core/cash/connect')
      expect(links).toContain('/core/assets/cash')
    })
  })
})
