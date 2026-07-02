import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  CategoriePrioEditor,
  BEZIT_CATEGORIES,
  DEFAULT_CATEGORIE_PRIOS,
} from './categorie-prio-editor'

describe('CategoriePrioEditor', () => {
  it('uit: toont geen categorie-rijen, wel de fallback-uitleg', () => {
    render(
      <CategoriePrioEditor
        enabled={false}
        prios={DEFAULT_CATEGORIE_PRIOS}
        onToggle={() => {}}
        onChange={() => {}}
      />,
    )
    // Geen radiogroups zichtbaar wanneer uit.
    expect(screen.queryAllByRole('radiogroup')).toHaveLength(0)
    expect(screen.getByText(/volgorde hierboven bepaalt de prioriteit/i)).toBeTruthy()
  })

  it('aan: toont één radiogroup per bezit-categorie (6)', () => {
    render(
      <CategoriePrioEditor
        enabled
        prios={DEFAULT_CATEGORIE_PRIOS}
        onToggle={() => {}}
        onChange={() => {}}
      />,
    )
    expect(screen.getAllByRole('radiogroup')).toHaveLength(BEZIT_CATEGORIES.length)
    expect(BEZIT_CATEGORIES).toHaveLength(6)
  })

  it('klik op een prio → onChange met gemergede map (reserve = 5)', () => {
    const onChange = vi.fn()
    render(
      <CategoriePrioEditor
        enabled
        prios={DEFAULT_CATEGORIE_PRIOS}
        onToggle={() => {}}
        onChange={onChange}
      />,
    )
    // Zet 'Beleggingen' op reserve (5).
    const group = screen.getByRole('radiogroup', { name: /Prioriteit voor Beleggingen/i })
    const reserveBtn = group.querySelector('[aria-label="5 (reserve)"]') as HTMLButtonElement
    fireEvent.click(reserveBtn)
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ ...DEFAULT_CATEGORIE_PRIOS, Beleggingen: 5 }),
    )
  })

  it('touch-targets: prio-knoppen zijn ≥44px (h-11 w-11)', () => {
    render(
      <CategoriePrioEditor
        enabled
        prios={DEFAULT_CATEGORIE_PRIOS}
        onToggle={() => {}}
        onChange={() => {}}
      />,
    )
    const group = screen.getByRole('radiogroup', { name: /Prioriteit voor Spaargeld/i })
    for (const btn of group.querySelectorAll('[role="radio"]')) {
      expect(btn.className).toContain('h-11')
      expect(btn.className).toContain('w-11')
    }
  })

  it('roving tabindex: alleen de geselecteerde prio is tabbaar', () => {
    render(
      <CategoriePrioEditor
        enabled
        prios={DEFAULT_CATEGORIE_PRIOS} // Spaargeld = 4
        onToggle={() => {}}
        onChange={() => {}}
      />,
    )
    const group = screen.getByRole('radiogroup', { name: /Prioriteit voor Spaargeld/i })
    const active = group.querySelector('[aria-checked="true"]') as HTMLButtonElement
    expect(active.getAttribute('aria-label')).toBe('4')
    expect(active.getAttribute('tabindex')).toBe('0')
    for (const btn of group.querySelectorAll('[aria-checked="false"]')) {
      expect(btn.getAttribute('tabindex')).toBe('-1')
    }
  })

  it('pijltjestoets verplaatst de prio (met wrap voorbij reserve)', () => {
    const onChange = vi.fn()
    render(
      <CategoriePrioEditor
        enabled
        prios={{ ...DEFAULT_CATEGORIE_PRIOS, Spaargeld: 5 }} // op reserve (index 4)
        onToggle={() => {}}
        onChange={onChange}
      />,
    )
    const group = screen.getByRole('radiogroup', { name: /Prioriteit voor Spaargeld/i })
    // Vanaf 5 (laatste) wrapt rechts naar 1 (eerste).
    fireEvent.keyDown(group, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ Spaargeld: 1 }))
  })

  it('toggle-switch reflecteert enabled en roept onToggle', () => {
    const onToggle = vi.fn()
    render(
      <CategoriePrioEditor
        enabled={false}
        prios={DEFAULT_CATEGORIE_PRIOS}
        onToggle={onToggle}
        onChange={() => {}}
      />,
    )
    const sw = screen.getByRole('switch')
    expect(sw.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(sw)
    expect(onToggle).toHaveBeenCalledWith(true)
  })
})
