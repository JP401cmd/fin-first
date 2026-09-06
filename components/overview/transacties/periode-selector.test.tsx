/**
 * PeriodeSelector — de periode-keuze op /overzicht/budget/transacties.
 *
 * Wat hier bewaakt wordt is TXN-2 (faseplan "Eenvoudige weergave" §8, fase 2,
 * herzien 10 aug 2026): in **Eenvoudig** zijn er drie periodes (30 dagen /
 * maand / jaar), in **Volledig** blijven het er vier. Maand hoorde eerst bij de
 * diepte, maar is de natuurlijke eenheid waarin mensen hun uitgaven lezen — en
 * Eenvoudig is de standaard voor nieuwe profielen. Alleen kwartaal blijft
 * Volledig-only. Plus het randgeval dat een reductie altijd oplevert: een keuze
 * die in Volledig gemaakt is en in Eenvoudig niet bestaat, mag niet in een
 * tab-strip zonder actieve tab eindigen.
 *
 * De reductie raakt UITSLUITEND de keuze — `resolvePeriodWindow` (de
 * venster-berekening) wordt hier niet aangeraakt en is elders getest.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DisplayModeProvider, type DisplayMode } from '@/lib/hooks/use-display-mode'
import type { PeriodKind } from '@/lib/transaction-insights'
import { PeriodeSelector, resolvePeriodForMode, SIMPLE_PERIOD_KEYS } from './periode-selector'

function renderSelector(mode: DisplayMode, period: PeriodKind = '30d') {
  return render(
    <DisplayModeProvider initialMode={mode}>
      <PeriodeSelector
        period={period}
        offset={0}
        label="Afgelopen 30 dagen"
        canGoForward={false}
        onPeriodChange={() => {}}
        onOffsetChange={() => {}}
      />
    </DisplayModeProvider>,
  )
}

describe('PeriodeSelector — periodetabs per weergavemodus', () => {
  it('toont in Volledig alle vier de periodes', () => {
    renderSelector('full')
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['30 dagen', 'Maand', 'Kwartaal', 'Jaar'])
  })

  it('toont in Eenvoudig "30 dagen", "Maand" en "Jaar" — alleen kwartaal ontbreekt', () => {
    renderSelector('simple')
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(3)
    expect(tabs.map((t) => t.textContent)).toEqual(['30 dagen', 'Maand', 'Jaar'])
  })

  it('houdt de maand-tab in Eenvoudig selecteerbaar en actief', () => {
    // De kern van deze kaart: de melder verwachtte een kalendermaand-selectie
    // op de standaardweergave. 'month' moet daar dus niet alleen bestaan, maar
    // ook als actieve tab kunnen staan (geen stille terugval naar 30 dagen).
    renderSelector('simple', 'month')
    const active = screen
      .getAllByRole('tab')
      .filter((t) => t.getAttribute('aria-selected') === 'true')
    expect(active).toHaveLength(1)
    expect(active[0].textContent).toBe('Maand')
  })
})

describe('resolvePeriodForMode — terugval zonder lege staat', () => {
  it('laat elke keuze in Volledig ongemoeid', () => {
    for (const p of ['30d', 'month', 'quarter', 'year'] as PeriodKind[]) {
      expect(resolvePeriodForMode(p, 'full')).toBe(p)
    }
  })

  it('houdt in Eenvoudig de periodes die daar bestaan', () => {
    for (const p of SIMPLE_PERIOD_KEYS) {
      expect(resolvePeriodForMode(p, 'simple')).toBe(p)
    }
  })

  it('laat maand in Eenvoudig staan en valt alleen voor kwartaal terug op 30 dagen', () => {
    expect(resolvePeriodForMode('month', 'simple')).toBe('month')
    expect(resolvePeriodForMode('quarter', 'simple')).toBe('30d')
  })

  it('geeft altijd een periode die in Eenvoudig ook echt een tab heeft', () => {
    // De strip mag nooit zonder actieve tab staan: elke terugval landt op een
    // key die de gefilterde tab-lijst daadwerkelijk rendert.
    renderSelector('simple', resolvePeriodForMode('quarter', 'simple'))
    const active = screen.getAllByRole('tab').filter((t) => t.getAttribute('aria-selected') === 'true')
    expect(active).toHaveLength(1)
    expect(active[0].textContent).toBe('30 dagen')
  })
})
