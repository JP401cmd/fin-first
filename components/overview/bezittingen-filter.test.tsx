import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BezittingenFilter } from './bezittingen-filter'

/**
 * Tests voor BezittingenFilter — controlled dropdown-filter op
 * /overzicht/bezittingen. State leeft in de parent; deze tests verifiëren
 * dat de component value rendert en onChange aanroept zonder router-call.
 */

describe('BezittingenFilter', () => {
  it('toont default-label "Alle bezittingen" wanneer value=null', () => {
    render(<BezittingenFilter value={null} onChange={() => {}} />)
    expect(screen.getByText('Alle bezittingen')).toBeTruthy()
  })

  it('opent dropdown bij klik op trigger', () => {
    render(<BezittingenFilter value={null} onChange={() => {}} />)
    expect(screen.queryByRole('listbox')).toBeNull()
    fireEvent.click(screen.getByText('Alle bezittingen'))
    expect(screen.getByRole('listbox')).toBeTruthy()
  })

  it('toont alle 13 asset-types + "Alle bezittingen" in dropdown', () => {
    render(<BezittingenFilter value={null} onChange={() => {}} />)
    fireEvent.click(screen.getByText('Alle bezittingen'))
    const options = screen.getAllByRole('option')
    expect(options.length).toBe(14)
  })

  it('roept onChange met het juiste type bij selectie', () => {
    const onChange = vi.fn()
    render(<BezittingenFilter value={null} onChange={onChange} />)
    fireEvent.click(screen.getByText('Alle bezittingen'))
    fireEvent.click(screen.getByText('Spaargeld'))
    expect(onChange).toHaveBeenCalledWith('savings')
  })

  it('roept onChange met null bij selectie "Alle bezittingen"', () => {
    const onChange = vi.fn()
    render(<BezittingenFilter value="eigen_huis" onChange={onChange} />)
    expect(screen.getByText('Eigen woning')).toBeTruthy()
    fireEvent.click(screen.getByText('Eigen woning'))
    const options = screen.getAllByRole('option')
    fireEvent.click(options[0]!)
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('toont actieve type-label in trigger wanneer value gezet is', () => {
    render(<BezittingenFilter value="crypto" onChange={() => {}} />)
    expect(screen.getByText('Crypto')).toBeTruthy()
  })

  it('aria-expanded reflecteert dropdown-state', () => {
    const { container } = render(<BezittingenFilter value={null} onChange={() => {}} />)
    const trigger = container.querySelector('button[aria-haspopup="listbox"]')
    expect(trigger?.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(trigger!)
    expect(trigger?.getAttribute('aria-expanded')).toBe('true')
  })

  it('elke optie heeft min-h-[44px] (WCAG tap-target)', () => {
    const { container } = render(<BezittingenFilter value={null} onChange={() => {}} />)
    fireEvent.click(screen.getByText('Alle bezittingen'))
    const options = container.querySelectorAll('[role="option"]')
    options.forEach((opt) => {
      expect(opt.className).toContain('min-h-[44px]')
    })
  })
})
