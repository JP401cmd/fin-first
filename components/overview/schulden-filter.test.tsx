import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SchuldenFilter } from './schulden-filter'

/**
 * Tests voor SchuldenFilter — controlled dropdown-filter op
 * /overzicht/schulden. State leeft in de parent; deze tests verifiëren
 * dat de component value rendert en onChange aanroept zonder router-call.
 */

describe('SchuldenFilter', () => {
  it('toont default-label "Alle schulden" wanneer value=null', () => {
    render(<SchuldenFilter value={null} onChange={() => {}} />)
    expect(screen.getByText('Alle schulden')).toBeTruthy()
  })

  it('opent dropdown bij klik op trigger', () => {
    render(<SchuldenFilter value={null} onChange={() => {}} />)
    expect(screen.queryByRole('listbox')).toBeNull()
    fireEvent.click(screen.getByText('Alle schulden'))
    expect(screen.getByRole('listbox')).toBeTruthy()
  })

  it('toont alle debt-types + "Alle schulden" in dropdown', () => {
    render(<SchuldenFilter value={null} onChange={() => {}} />)
    fireEvent.click(screen.getByText('Alle schulden'))
    const options = screen.getAllByRole('option')
    expect(options.length).toBeGreaterThan(10)
  })

  it('roept onChange met het juiste type bij selectie', () => {
    const onChange = vi.fn()
    render(<SchuldenFilter value={null} onChange={onChange} />)
    fireEvent.click(screen.getByText('Alle schulden'))
    fireEvent.click(screen.getByText('Hypotheek'))
    expect(onChange).toHaveBeenCalledWith('mortgage')
  })

  it('roept onChange met null bij selectie "Alle schulden"', () => {
    const onChange = vi.fn()
    render(<SchuldenFilter value="mortgage" onChange={onChange} />)
    expect(screen.getByText('Hypotheek')).toBeTruthy()
    fireEvent.click(screen.getByText('Hypotheek'))
    const options = screen.getAllByRole('option')
    fireEvent.click(options[0]!)
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('toont actieve type-label in trigger wanneer value gezet is', () => {
    render(<SchuldenFilter value="student_loan" onChange={() => {}} />)
    expect(screen.getByText('Studielening')).toBeTruthy()
  })

  it('aria-expanded reflecteert dropdown-state', () => {
    const { container } = render(<SchuldenFilter value={null} onChange={() => {}} />)
    const trigger = container.querySelector('button[aria-haspopup="listbox"]')
    expect(trigger?.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(trigger!)
    expect(trigger?.getAttribute('aria-expanded')).toBe('true')
  })

  it('elke optie heeft min-h-[44px] (WCAG tap-target)', () => {
    const { container } = render(<SchuldenFilter value={null} onChange={() => {}} />)
    fireEvent.click(screen.getByText('Alle schulden'))
    const options = container.querySelectorAll('[role="option"]')
    options.forEach((opt) => {
      expect(opt.className).toContain('min-h-[44px]')
    })
  })
})
