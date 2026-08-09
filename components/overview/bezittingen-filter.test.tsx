import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  BezittingenFilter,
  BEZITTINGEN_FILTER_MIN_ITEMS,
} from './bezittingen-filter'

/**
 * Tests voor BezittingenFilter — controlled dropdown-filter op
 * /overzicht/bezittingen. State leeft in de parent; deze tests verifiëren
 * dat de component value rendert en onChange aanroept zonder router-call,
 * plus de BEZ-2-drempel (filter pas vanaf ~8 bezittingen).
 */

// Boven de drempel: filter altijd zichtbaar, gedrag ongewijzigd.
const MANY = BEZITTINGEN_FILTER_MIN_ITEMS

describe('BezittingenFilter', () => {
  it('toont default-label "Alle bezittingen" wanneer value=null', () => {
    render(<BezittingenFilter value={null} onChange={() => {}} assetCount={MANY} />)
    expect(screen.getByText('Alle bezittingen')).toBeTruthy()
  })

  it('opent dropdown bij klik op trigger', () => {
    render(<BezittingenFilter value={null} onChange={() => {}} assetCount={MANY} />)
    expect(screen.queryByRole('listbox')).toBeNull()
    fireEvent.click(screen.getByText('Alle bezittingen'))
    expect(screen.getByRole('listbox')).toBeTruthy()
  })

  it('toont alle 13 asset-types + "Alle bezittingen" in dropdown', () => {
    render(<BezittingenFilter value={null} onChange={() => {}} assetCount={MANY} />)
    fireEvent.click(screen.getByText('Alle bezittingen'))
    const options = screen.getAllByRole('option')
    expect(options.length).toBe(14)
  })

  it('roept onChange met het juiste type bij selectie', () => {
    const onChange = vi.fn()
    render(<BezittingenFilter value={null} onChange={onChange} assetCount={MANY} />)
    fireEvent.click(screen.getByText('Alle bezittingen'))
    fireEvent.click(screen.getByText('Spaargeld'))
    expect(onChange).toHaveBeenCalledWith('savings')
  })

  it('roept onChange met null bij selectie "Alle bezittingen"', () => {
    const onChange = vi.fn()
    render(<BezittingenFilter value="eigen_huis" onChange={onChange} assetCount={MANY} />)
    expect(screen.getByText('Eigen woning')).toBeTruthy()
    fireEvent.click(screen.getByText('Eigen woning'))
    const options = screen.getAllByRole('option')
    fireEvent.click(options[0]!)
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('toont actieve type-label in trigger wanneer value gezet is', () => {
    render(<BezittingenFilter value="crypto" onChange={() => {}} assetCount={MANY} />)
    expect(screen.getByText('Crypto')).toBeTruthy()
  })

  it('aria-expanded reflecteert dropdown-state', () => {
    const { container } = render(
      <BezittingenFilter value={null} onChange={() => {}} assetCount={MANY} />,
    )
    const trigger = container.querySelector('button[aria-haspopup="listbox"]')
    expect(trigger?.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(trigger!)
    expect(trigger?.getAttribute('aria-expanded')).toBe('true')
  })

  it('elke optie heeft min-h-[44px] (WCAG tap-target)', () => {
    const { container } = render(
      <BezittingenFilter value={null} onChange={() => {}} assetCount={MANY} />,
    )
    fireEvent.click(screen.getByText('Alle bezittingen'))
    const options = container.querySelectorAll('[role="option"]')
    options.forEach((opt) => {
      expect(opt.className).toContain('min-h-[44px]')
    })
  })

  // ── BEZ-2: drempel ─────────────────────────────────────────
  describe('drempel (BEZ-2)', () => {
    it('rendert niets onder de drempel', () => {
      const { container } = render(
        <BezittingenFilter
          value={null}
          onChange={() => {}}
          assetCount={BEZITTINGEN_FILTER_MIN_ITEMS - 1}
        />,
      )
      expect(container.querySelector('button[aria-haspopup="listbox"]')).toBeNull()
      expect(screen.queryByText('Alle bezittingen')).toBeNull()
    })

    it('rendert niets bij nul bezittingen', () => {
      const { container } = render(
        <BezittingenFilter value={null} onChange={() => {}} assetCount={0} />,
      )
      expect(container.firstChild).toBeNull()
    })

    it('rendert de dropdown exact op de drempel', () => {
      render(
        <BezittingenFilter
          value={null}
          onChange={() => {}}
          assetCount={BEZITTINGEN_FILTER_MIN_ITEMS}
        />,
      )
      expect(screen.getByText('Alle bezittingen')).toBeTruthy()
    })

    it('blijft zichtbaar onder de drempel zolang er een filter actief is', () => {
      // Anders zou de lijst gefilterd blijven zonder bediening om dat terug
      // te draaien (bv. na het verwijderen van bezittingen tot onder de 8).
      render(
        <BezittingenFilter
          value="crypto"
          onChange={() => {}}
          assetCount={BEZITTINGEN_FILTER_MIN_ITEMS - 1}
        />,
      )
      expect(screen.getByText('Crypto')).toBeTruthy()
    })
  })
})
