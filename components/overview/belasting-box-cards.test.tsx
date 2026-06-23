import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactElement } from 'react'
import { BelastingBoxCards, type BelastingBoxCard } from './belasting-box-cards'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'

/**
 * BelastingBoxCards hergebruikt nu de gedeelde LeverageCard-shell (zoals
 * ToekomstNavCards op /toekomst): afgeronde kaart + chevron-drilldown. De
 * "Box N"-kicker en de subtitle-beschrijving zijn van de KAARTVOORKANT naar
 * het uitklap-paneel verhuisd — die zijn dus PAS zichtbaar na een klik op de
 * chevron-<button> (aria-label "Toon detail {label}"). KPI (€…/jr of '—') en
 * de status-substext blijven op de voorkant.
 *
 * De chevron-drilldown is alleen zichtbaar in de Volledige weergave; in
 * Eenvoudig (display_mode 'simple') verdwijnt de chevron (net als HefbomenNav).
 * De fallback buiten een DisplayModeProvider is 'simple', dus de niet-modus-
 * specifieke tests renderen expliciet binnen `DisplayModeProvider initialMode="full"`.
 */

// Render binnen de Volledige modus zodat de chevron-drilldown beschikbaar is
// (buiten een provider valt useDisplayMode terug op 'simple' → geen chevron).
function renderFull(ui: ReactElement) {
  return render(<DisplayModeProvider initialMode="full">{ui}</DisplayModeProvider>)
}

function makeCards(
  overrides: Partial<Record<'1' | '2' | '3', Partial<BelastingBoxCard>>> = {},
): BelastingBoxCard[] {
  const base: BelastingBoxCard[] = [
    {
      number: '1',
      label: 'Werk + woning',
      href: '/overzicht/belasting/box1',
      tax: 12000,
      status: 'warn',
      statusText: 'Onbenutte jaarruimte',
      subtitle: 'Loon, ondernemerswinst en eigen huis.',
    },
    {
      number: '2',
      label: 'Aanmerkelijk belang',
      href: '/overzicht/belasting/box2',
      tax: null,
      status: 'neutral',
      statusText: 'Geen aanmerkelijk belang',
      subtitle: 'DGA / aandeelhouder ≥ 5%.',
    },
    {
      number: '3',
      label: 'Sparen + beleggen',
      href: '/overzicht/belasting/box3',
      tax: 3500,
      status: 'good',
      statusText: 'Geen actie nodig',
      subtitle: 'Cash, beleggingen en crypto — forfaitair.',
    },
  ]
  return base.map((c) => ({ ...c, ...(overrides[c.number as '1' | '2' | '3'] ?? {}) }))
}

describe('BelastingBoxCards — render', () => {
  it('rendert drie box-kaarten met een chevron-toggle per kaart', () => {
    renderFull(<BelastingBoxCards cards={makeCards()} />)
    // De "Box N"-kicker is naar de drilldown verhuisd en dus standaard NIET
    // op de voorkant zichtbaar — we herkennen de drie kaarten nu aan hun
    // chevron-toggle (LeverageCard geeft die aria-label "Toon detail {label}").
    expect(screen.getByRole('button', { name: 'Toon detail Werk + woning' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Toon detail Aanmerkelijk belang' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Toon detail Sparen + beleggen' })).toBeTruthy()
    // "Box 1/2/3" zit in de (dichtgeklapte) drilldown, dus niet zichtbaar.
    expect(screen.queryByText('Box 1')).toBeNull()
    expect(screen.queryByText('Box 2')).toBeNull()
    expect(screen.queryByText('Box 3')).toBeNull()
  })

  it('toont label per box', () => {
    renderFull(<BelastingBoxCards cards={makeCards()} />)
    expect(screen.getByText('Werk + woning')).toBeTruthy()
    expect(screen.getByText('Aanmerkelijk belang')).toBeTruthy()
    expect(screen.getByText('Sparen + beleggen')).toBeTruthy()
  })

  it('toont KPI-waarde wanneer beschikbaar', () => {
    renderFull(<BelastingBoxCards cards={makeCards()} />)
    expect(screen.getAllByText(/€\s*12\.000.*\/jr/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/€\s*3\.500.*\/jr/).length).toBeGreaterThan(0)
  })

  it('toont placeholder "—" bij null of 0', () => {
    renderFull(
      <BelastingBoxCards
        cards={makeCards({ '1': { tax: null }, '2': { tax: 0 }, '3': { tax: null } })}
      />,
    )
    expect(screen.getAllByText('—').length).toBe(3)
  })

  it('toont de kicker "De drie boxen" en géén dubbel jaartotaal in de kaart-header', () => {
    renderFull(<BelastingBoxCards cards={makeCards()} />)
    expect(screen.getByText('De drie boxen')).toBeTruthy()
    // Het jaartotaal is bewust verplaatst naar Sectie I (HubTotaleDruk); de
    // kaart-header dupliceert het niet langer (was "Geschatte druk €15.500/jr").
    expect(screen.queryByText('Geschatte druk')).toBeNull()
    expect(screen.queryByText(/€\s*15\.500/)).toBeNull()
  })

  it('toont status-substext per box', () => {
    renderFull(<BelastingBoxCards cards={makeCards()} />)
    expect(screen.getByText('Onbenutte jaarruimte')).toBeTruthy()
    expect(screen.getByText('Geen aanmerkelijk belang')).toBeTruthy()
    expect(screen.getByText('Geen actie nodig')).toBeTruthy()
  })

  it('linkt elke kaart naar de eigen box-subpagina', () => {
    const { container } = renderFull(<BelastingBoxCards cards={makeCards()} />)
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/overzicht/belasting/box1')
    expect(hrefs).toContain('/overzicht/belasting/box2')
    expect(hrefs).toContain('/overzicht/belasting/box3')
  })
})

// ── Chevron-drilldown (hergebruik LeverageCard-shell) ─────────────────────

describe('BelastingBoxCards — chevron-drilldown', () => {
  it('rendert per kaart een chevron-<button> met aria-expanded=false', () => {
    renderFull(<BelastingBoxCards cards={makeCards()} />)
    const buttons = screen.getAllByRole('button', { name: /^Toon detail / })
    expect(buttons.length).toBe(3)
    buttons.forEach((b) => expect(b.getAttribute('aria-expanded')).toBe('false'))
  })

  it('is standaard dichtgeklapt: subtitle + "Box N" + action-link nog niet zichtbaar', () => {
    const { container } = renderFull(<BelastingBoxCards cards={makeCards()} />)
    // De drilldown-inhoud (subtitle/beschrijving, "Box N"-kicker, action-link)
    // wordt pas gerenderd na uitklappen.
    expect(screen.queryByText('Loon, ondernemerswinst en eigen huis.')).toBeNull()
    expect(screen.queryByText('Bekijk Box 1')).toBeNull()
    expect(screen.queryByText('Box 1')).toBeNull()
    // Standaard alleen de drie heel-kaart-Links (geen uitgeklapte action-links).
    expect(container.querySelectorAll('a').length).toBe(3)
  })

  it('klikken op de chevron klapt het drilldown-paneel uit zonder te navigeren', () => {
    const { container } = renderFull(<BelastingBoxCards cards={makeCards()} />)
    const toggle = screen.getByRole('button', { name: 'Toon detail Werk + woning' })
    fireEvent.click(toggle)

    // "Box 1"-kicker, de beschrijving (subtitle) en de action-link verschijnen.
    expect(screen.getByText('Box 1')).toBeTruthy()
    expect(screen.getByText('Loon, ondernemerswinst en eigen huis.')).toBeTruthy()
    expect(toggle.getAttribute('aria-expanded')).toBe('true')

    // De action-link wijst naar dezelfde box-subpagina (navigatie, geen toggle).
    const actionLink = screen.getByText('Bekijk Box 1').closest('a')
    expect(actionLink?.getAttribute('href')).toBe('/overzicht/belasting/box1')

    // Nu zijn er 4 anchors (3 kaarten + 1 uitgeklapte action-link).
    expect(container.querySelectorAll('a').length).toBe(4)
  })

  it('opent maximaal één drilldown tegelijk (accordeon)', () => {
    renderFull(<BelastingBoxCards cards={makeCards()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Toon detail Werk + woning' }))
    expect(screen.getByText('Bekijk Box 1')).toBeTruthy()

    // Tweede kaart openen sluit de eerste.
    fireEvent.click(screen.getByRole('button', { name: 'Toon detail Sparen + beleggen' }))
    expect(screen.getByText('Bekijk Box 3')).toBeTruthy()
    expect(screen.queryByText('Bekijk Box 1')).toBeNull()
  })

  it('toont voor Box 2 (tax=null) een kale "—" als drilldown-waarde, niet de status-tekst', () => {
    renderFull(<BelastingBoxCards cards={makeCards()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Toon detail Aanmerkelijk belang' }))
    // De drilldown is open (action-link zichtbaar)…
    expect(screen.getByText('Bekijk Box 2')).toBeTruthy()
    // …maar de numerieke waarde-kolom (mono tabular) blijft '—'. De status
    // "Geen aanmerkelijk belang" staat alléén op de kaartvoorkant (substext),
    // niet in het getallen-veld → precies 1 voorkomen.
    expect(screen.getAllByText('Geen aanmerkelijk belang').length).toBe(1)
  })
})

// ── Eenvoudige weergave (display_mode simple) ─────────────────────────────

describe('BelastingBoxCards — Eenvoudige weergave (display_mode simple)', () => {
  // De chevron-drilldown-toggle in LeverageCard is een <button> met aria-label
  // "Toon detail {label}" / "Verberg detail {label}".
  const CHEVRON_RE = /detail/i

  it('toont chevron-toggles in Volledig', () => {
    const { container } = render(
      <DisplayModeProvider initialMode="full">
        <BelastingBoxCards cards={makeCards()} />
      </DisplayModeProvider>,
    )
    const toggles = Array.from(container.querySelectorAll('button')).filter((b) =>
      CHEVRON_RE.test(b.getAttribute('aria-label') ?? ''),
    )
    expect(toggles.length).toBe(3)
  })

  it('verbergt alle chevron-toggles in Eenvoudig', () => {
    const { container } = render(
      <DisplayModeProvider initialMode="simple">
        <BelastingBoxCards cards={makeCards()} />
      </DisplayModeProvider>,
    )
    const toggles = Array.from(container.querySelectorAll('button')).filter((b) =>
      CHEVRON_RE.test(b.getAttribute('aria-label') ?? ''),
    )
    expect(toggles.length).toBe(0)
  })

  it('rendert in Eenvoudig nog steeds de drie box-kaarten (alleen rustiger)', () => {
    render(
      <DisplayModeProvider initialMode="simple">
        <BelastingBoxCards cards={makeCards()} />
      </DisplayModeProvider>,
    )
    expect(screen.getByText('Werk + woning')).toBeTruthy()
    expect(screen.getByText('Aanmerkelijk belang')).toBeTruthy()
    expect(screen.getByText('Sparen + beleggen')).toBeTruthy()
  })
})
