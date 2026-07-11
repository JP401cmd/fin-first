import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { ScenarioKaarten } from './scenario-kaarten'
import { MASKED_AMOUNT_PLACEHOLDER } from '@/lib/format'
import type { ScenarioPresetResult } from '@/lib/horizon/scenario-presets'

// Stuurbare privacy-mock — default zichtbaar; per test op masked te zetten.
const mockPrivacy = { masked: false }
vi.mock('@/lib/hooks/use-privacy', () => ({
  useMaskedAmounts: () => mockPrivacy,
}))

beforeEach(() => {
  mockPrivacy.masked = false
})

function makeKaart(over: Partial<ScenarioPresetResult> = {}): ScenarioPresetResult {
  return {
    id: 'basis',
    label: 'Basisplan',
    kind: 'basis',
    stopLeeftijd: 62.3,
    fireAgeFractional: 62.3,
    laagsteBuffer: { bedrag: 84000, age: 66 },
    maandruimteOfDelta: null,
    status: 'basis',
    ...over,
  }
}

const VIJF: ScenarioPresetResult[] = [
  makeKaart({ id: 'basis', label: 'Basisplan', kind: 'basis', status: 'basis' }),
  makeKaart({
    id: 'een-jaar-langer',
    label: 'Een jaar langer',
    kind: 'stop',
    status: 'groen',
    stopLeeftijd: 63.3,
    laagsteBuffer: { bedrag: 120000, age: 66 },
  }),
  makeKaart({
    id: 'minder-uitgeven',
    label: 'Minder uitgeven',
    kind: 'input',
    status: 'amber',
    maandruimteOfDelta: -300,
    laagsteBuffer: { bedrag: 90000, age: 65 },
  }),
  makeKaart({
    id: 'extra-inleg',
    label: 'Extra inleg',
    kind: 'input',
    status: 'groen',
    maandruimteOfDelta: 250,
    laagsteBuffer: { bedrag: 110000, age: 64 },
  }),
  makeKaart({
    id: 'eerder-stoppen',
    label: 'Eerder stoppen',
    kind: 'stop',
    status: 'rood',
    stopLeeftijd: 60.3,
    laagsteBuffer: { bedrag: -5000, age: 68 },
  }),
]

describe('ScenarioKaarten', () => {
  it('rendert vijf scenario-kaarten met hun label', () => {
    render(<ScenarioKaarten kaarten={VIJF} />)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(5)
    expect(screen.getByText('Basisplan')).toBeTruthy()
    expect(screen.getByText('Eerder stoppen')).toBeTruthy()
  })

  it('toont per status de juiste flag-tint (BASIS/GROEN/AMBER/ROOD)', () => {
    render(<ScenarioKaarten kaarten={VIJF} />)

    const basis = screen.getByText('BASIS')
    expect(basis.className).toContain('bg-amber-50')

    const groen = screen.getAllByText('GROEN')[0]
    expect(groen.className).toContain('bg-emerald-50')

    const amber = screen.getByText('AMBER')
    expect(amber.className).toContain('bg-amber-100')

    const rood = screen.getByText('ROOD')
    expect(rood.className).toContain('bg-red-50')
  })

  it('maskeert het laagste-buffer-bedrag wanneer privacy aanstaat', () => {
    mockPrivacy.masked = true
    render(<ScenarioKaarten kaarten={VIJF} />)
    // Vijf kaarten, elk één buffer-bedrag via MaskedAmount → vijf bullets.
    expect(screen.getAllByText(MASKED_AMOUNT_PLACEHOLDER)).toHaveLength(5)
  })

  it('toont het echte buffer-bedrag wanneer privacy uitstaat', () => {
    render(<ScenarioKaarten kaarten={VIJF} />)
    // formatCurrency(nl-NL) → "€ 84.000"
    expect(screen.getByText(/84\.000/)).toBeTruthy()
    expect(screen.queryByText(MASKED_AMOUNT_PLACEHOLDER)).toBeNull()
  })

  it('kleurt de buffer van de rood-kaart met de negatief-token', () => {
    render(<ScenarioKaarten kaarten={VIJF} />)
    const roodCard = screen.getByText('Eerder stoppen').closest('li')!
    const bedrag = within(roodCard).getByText(/5\.000/)
    expect(bedrag.className).toContain('var(--negative)')
  })

  it('labelt de middenrij als "Delta" voor input-varianten en "Maandruimte" voor de rest', () => {
    render(<ScenarioKaarten kaarten={VIJF} />)
    // input-variant (minder uitgeven, extra inleg) → "Delta"
    expect(screen.getAllByText('Delta').length).toBe(2)
    // basis + twee stop-varianten → "Maandruimte"
    expect(screen.getAllByText('Maandruimte').length).toBe(3)
  })

  it('toont "—" voor null-velden (stopleeftijd, delta, buffer)', () => {
    const leeg: ScenarioPresetResult[] = [
      makeKaart({
        id: 'basis',
        label: 'Basisplan',
        kind: 'basis',
        status: 'basis',
        stopLeeftijd: null,
        maandruimteOfDelta: null,
        laagsteBuffer: null,
      }),
    ]
    render(<ScenarioKaarten kaarten={leeg} />)
    const card = screen.getByRole('listitem')
    // Drie rijen tonen elk "—".
    expect(within(card).getAllByText('—')).toHaveLength(3)
  })

  it('rendert de stopleeftijd met één decimaal in NL-notatie', () => {
    render(<ScenarioKaarten kaarten={VIJF} />)
    expect(screen.getAllByText('62,3 jr').length).toBeGreaterThan(0)
    // en de unieke stop-varianten tonen hun eigen leeftijd
    expect(screen.getByText('63,3 jr')).toBeTruthy()
    expect(screen.getByText('60,3 jr')).toBeTruthy()
  })

  it('toont skeleton-kaarten bij isLoading (geen echte data)', () => {
    render(<ScenarioKaarten kaarten={VIJF} isLoading />)
    // Vijf skeleton-listitems, maar geen echte labels.
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(screen.queryByText('Basisplan')).toBeNull()
  })

  it('opent de i-uitleg bij klik', () => {
    render(<ScenarioKaarten kaarten={VIJF} />)
    expect(screen.queryByText(/Hoe de scenario's zijn doorgerekend/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: "Uitleg scenario's" }))
    expect(screen.getByText(/Hoe de scenario's zijn doorgerekend/)).toBeTruthy()
    expect(screen.getByText(/laagste buffer/)).toBeTruthy()
  })
})
