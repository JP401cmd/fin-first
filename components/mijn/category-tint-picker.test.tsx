import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CategoryTintPicker } from './category-tint-picker'

beforeEach(() => {
  window.localStorage.clear()
})

describe('CategoryTintPicker', () => {
  it('rendert de vier zones (kleur + transparantie-slider)', () => {
    render(<CategoryTintPicker />)
    // Elke zone-label komt twee keer voor: ColorPickerCard + slider-label.
    expect(screen.getAllByText('Bezittingen — boven').length).toBe(2)
    expect(screen.getAllByText('Bezittingen — onder').length).toBe(2)
    expect(screen.getAllByText('Schulden — boven').length).toBe(2)
    expect(screen.getAllByText('Schulden — onder').length).toBe(2)
  })

  it('heeft een transparantie-slider per zone', () => {
    render(<CategoryTintPicker />)
    const sliders = screen.getAllByRole('slider')
    expect(sliders.length).toBe(4)
  })

  it('schrijft een slider-wijziging naar localStorage', () => {
    render(<CategoryTintPicker />)
    const slider = screen.getByLabelText('Transparantie Bezittingen — boven')
    fireEvent.change(slider, { target: { value: '12' } })
    const stored = window.localStorage.getItem('tf-category-tint-percents')
    expect(stored).toBeTruthy()
    expect(JSON.parse(stored!).assetAbove).toBe(12)
  })

  it('reset zet kleuren + transparantie terug naar standaard', () => {
    render(<CategoryTintPicker />)
    const slider = screen.getByLabelText('Transparantie Schulden — onder')
    fireEvent.change(slider, { target: { value: '15' } })
    fireEvent.click(screen.getByRole('button', { name: /Standaard/i }))
    const stored = window.localStorage.getItem('tf-category-tint-percents')
    // Na reset is debtBelow niet langer 15.
    expect(JSON.parse(stored!).debtBelow).not.toBe(15)
  })
})
