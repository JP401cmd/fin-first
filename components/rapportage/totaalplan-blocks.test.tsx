import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProjectieBlock, SlagingskansBlock, InzichtenBlock } from './totaalplan-blocks'
import type { ProjectieData, SlagingskansData, InzichtItem } from '@/lib/totaalplan-data'

/**
 * Runtime-assertie op de weergave-mapping. De load-bearing correctheidszorg hier
 * is de grondslag-scheiding (CLAUDE.md): het doel-marker en vermogenspad staan op
 * `nettoVermogen` (incl. eigen woning); de liquide FIRE-pot (`fireLiquidePot`, excl.
 * woning) is een AFZONDERLIJKE grootheid en mag NOOIT op de doel-as belanden.
 * Bewust ver uit elkaar liggende bedragen zodat verkeerde-veld-drift zichtbaar wordt.
 */
const projectieOk: ProjectieData = {
  ok: true,
  reason: null,
  fireReachable: true,
  fireAge: 52,
  fireAgeFractional: 52.5,
  currentAge: 40,
  fireCalendarYear: 2038,
  doelbedragNettoVermogen: 850_000, // incl. eigen woning — hoort op doel-row + as
  fireLiquidePot: 600_000, // excl. woning — hoort ALLEEN in losse duiding
  displayEndAge: 90,
  strategy: 'deplete',
  vermogenspad: [
    { year: 0, age: 40, nettoVermogen: 300_000 },
    { year: 6, age: 46, nettoVermogen: 520_000 },
    { year: 12, age: 52, nettoVermogen: 850_000 },
    { year: 30, age: 70, nettoVermogen: 1_100_000 },
  ],
  eindwaardeNettoVermogen: 1_100_000,
}

describe('ProjectieBlock — grondslag-scheiding (nettoVermogen vs liquide pot)', () => {
  it('rendert het doelbedrag uit doelbedragNettoVermogen (incl. woning), niet de liquide pot', () => {
    render(<ProjectieBlock projectie={projectieOk} dailyExpenseRate={100} num="x." />)
    const doelLabel = screen.getByText(/Doelbedrag — netto vermogen/i)
    const doelRow = doelLabel.parentElement
    // De doel-row toont 850.000 (nettoVermogen-grondslag) …
    expect(doelRow?.textContent).toMatch(/850\.000/)
    // … en NOOIT de liquide FIRE-pot (600.000) op diezelfde row.
    expect(doelRow?.textContent).not.toMatch(/600\.000/)
  })

  it('benoemt de grondslag expliciet en toont de liquide pot enkel als losse duiding', () => {
    render(<ProjectieBlock projectie={projectieOk} dailyExpenseRate={100} num="x." />)
    expect(screen.getByText(/netto vermogen \(inclusief eigen woning\)/i)).toBeTruthy()
    // Liquide pot verschijnt in de aparte duidingszin, met eigen bedrag.
    const duiding = screen.getByText(/liquide FIRE-pot/i).closest('p')
    expect(duiding?.textContent).toMatch(/600\.000/)
  })

  it('rendert een inline SVG vermogenspad (geen canvas)', () => {
    const { container } = render(
      <ProjectieBlock projectie={projectieOk} dailyExpenseRate={100} num="x." />,
    )
    expect(container.querySelector('svg')).toBeTruthy()
    expect(container.querySelector('canvas')).toBeNull()
  })

  it('toont een nette lege staat bij ok=false zonder grafiek', () => {
    const empty: ProjectieData = {
      ...projectieOk,
      ok: false,
      reason: 'geen geboortedatum',
      vermogenspad: [],
    }
    const { container } = render(
      <ProjectieBlock projectie={empty} dailyExpenseRate={100} num="x." />,
    )
    expect(screen.getByText(/Nog geen projectie mogelijk/i)).toBeTruthy()
    expect(container.querySelector('svg')).toBeNull()
  })
})

describe('SlagingskansBlock', () => {
  it('toont het percentage en het aantal runs', () => {
    const ok: SlagingskansData = { ok: true, successProbability: 0.82, runs: 200, strategy: 'deplete' }
    render(<SlagingskansBlock slagingskans={ok} num="xi." />)
    expect(screen.getByText(/82%/)).toBeTruthy()
    expect(screen.getByText(/200/)).toBeTruthy()
  })

  it('toont lege staat bij successProbability=null', () => {
    const empty: SlagingskansData = { ok: false, successProbability: null, runs: 0, strategy: null }
    render(<SlagingskansBlock slagingskans={empty} num="xi." />)
    expect(screen.getByText(/Nog geen slagingskans/i)).toBeTruthy()
  })
})

describe('InzichtenBlock', () => {
  it('rendert titels met vrijheidsdagen-framing', () => {
    const items: InzichtItem[] = [
      { id: 'a:1', title: 'Verlaag je vaste lasten', detail: 'Twee abonnementen overlappen.', freedomDays: 12, savingsPerYear: 480 },
    ]
    render(<InzichtenBlock inzichten={items} num="xii." />)
    expect(screen.getByText(/Verlaag je vaste lasten/i)).toBeTruthy()
    expect(screen.getByText(/12 dagen vrijheid/i)).toBeTruthy()
  })

  it('toont lege staat bij geen inzichten', () => {
    render(<InzichtenBlock inzichten={[]} num="xii." />)
    expect(screen.getByText(/Geen directe verbeterpunten/i)).toBeTruthy()
  })
})
