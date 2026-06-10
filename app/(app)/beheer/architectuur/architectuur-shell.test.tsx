import { beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import archData from '@/docs/architecture/architecture.json'
import { buildArchimateModel } from '@/lib/architecture/archimate-model'
import { selectInsights } from '@/lib/architecture/facts'
import { ArchitectuurShell } from './architectuur-shell'

const model = buildArchimateModel({
  version: '0.71.0', generatedDate: '2026-06-10',
  stats: { api: 376, components: 706, providers: 12, tables: 47, migrations: 88 },
})
const insights = selectInsights(archData)

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

function renderShell() {
  window.history.replaceState(null, '', '/beheer/architectuur')
  return render(
    <ArchitectuurShell model={model} insights={insights} diff={null} generatedDate="2026-06-10" version="0.71.0" />,
  )
}

describe('ArchitectuurShell — view-switcher', () => {
  it('toont drie views met de plaat als default', () => {
    renderShell()
    expect(screen.getByRole('tab', { name: /Plaat/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: /De architectuur in/i })).toBeInTheDocument()
  })

  it('schakelt naar de database-view (ERD)', () => {
    renderShell()
    fireEvent.click(screen.getByRole('tab', { name: /Database/ }))
    expect(screen.getByRole('heading', { name: /Hoe de.*tabellen.*samenhangen/i })).toBeInTheDocument()
    expect(window.location.search).toContain('view=database')
  })

  it('schakelt naar de berekeningen-view', () => {
    renderShell()
    fireEvent.click(screen.getByRole('tab', { name: /Berekeningen/ }))
    expect(screen.getByRole('heading', { name: /Wat er met de.*brongegevens/i })).toBeInTheDocument()
    expect(window.location.search).toContain('view=berekeningen')
  })

  it('schakelt naar de praatplaat (HLD, gebruikersperspectief)', () => {
    renderShell()
    fireEvent.click(screen.getByRole('tab', { name: /Praatplaat/ }))
    expect(screen.getByRole('heading', { name: /Geld is opgeslagen/i })).toBeInTheDocument()
    expect(screen.getByText(/Wat de app voor je doet/i)).toBeInTheDocument()
    expect(window.location.search).toContain('view=praatplaat')
  })

  it('?view=database opent direct de database-view', () => {
    window.history.replaceState(null, '', '/beheer/architectuur?view=database')
    render(<ArchitectuurShell model={model} insights={insights} diff={null} generatedDate="2026-06-10" version="0.71.0" />)
    expect(screen.getByRole('heading', { name: /Hoe de.*tabellen.*samenhangen/i })).toBeInTheDocument()
  })

  it('"→ plaat" vanuit een berekening schakelt naar de plaat en selecteert het element', () => {
    renderShell()
    fireEvent.click(screen.getByRole('tab', { name: /Berekeningen/ }))
    // open de spaarquote-kaart
    fireEvent.click(screen.getByRole('button', { name: /Spaarquote/i }))
    // klik de plaat-koppeling naar de budgetteringsdienst
    fireEvent.click(screen.getByRole('button', { name: /Budgetteringsdienst/i }))
    expect(screen.getByRole('tab', { name: /Plaat/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { level: 3, name: /Budgetteringsdienst/ })).toBeInTheDocument()
  })
})

describe('ArchitectuurShell — database-view interactie', () => {
  it('selecteert een tabel en toont haar relaties', () => {
    window.history.replaceState(null, '', '/beheer/architectuur?view=database')
    render(<ArchitectuurShell model={model} insights={insights} diff={null} generatedDate="2026-06-10" version="0.71.0" />)
    fireEvent.click(screen.getByRole('button', { name: /Tabel holdings$/i }))
    expect(screen.getByRole('heading', { level: 3, name: 'holdings' })).toBeInTheDocument()
    expect(screen.getByText(/Verwezen door/i)).toBeInTheDocument()
  })
})
