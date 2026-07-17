import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NetworthGroupsChart, type NetworthGroupsChartProps } from './networth-groups-chart'
import { PrivacyProvider, PRIVACY_MASKED_STORAGE_KEY } from '@/lib/hooks/use-privacy'
import { MASKED_AMOUNT_PLACEHOLDER } from '@/lib/format'
import type { WealthGroup } from '@/lib/wealth-composition'
import type { DebtGroup } from '@/lib/debt-data'

/**
 * Tests voor NetworthGroupsChart — de butterfly-modus van het "Netto vermogen —
 * verloop"-sheet. Valideren: banden boven/onder de nulas, de gelabelde restband
 * (rest>0 én rest<0, weg bij rest≈0), het GAT in de netto-lijn bij null, de
 * tooltip (vier waarden, geen entiteitsnamen), de herkomstmarkering (LOCF
 * visueel onderscheiden + legenda toont alleen voorkomende staten) en masking.
 */

const ASSET_GROUPS: WealthGroup[] = ['spaargeld', 'beleggingen', 'pensioen', 'vastgoed', 'overig']
const DEBT_GROUPS: DebtGroup[] = ['wonen', 'consumptief', 'overig']

/** Vul alle assetgroepen met 0 en overschrijf de meegegeven groepen. */
function assets(len: number, over: Partial<Record<WealthGroup, number[]>> = {}) {
  const rec = {} as Record<WealthGroup, number[]>
  for (const g of ASSET_GROUPS) rec[g] = over[g] ?? new Array(len).fill(0)
  return rec
}

function debts(len: number, over: Partial<Record<DebtGroup, number[]>> = {}) {
  const rec = {} as Record<DebtGroup, number[]>
  for (const g of DEBT_GROUPS) rec[g] = over[g] ?? new Array(len).fill(0)
  return rec
}

function months(len: number): string[] {
  const out: string[] = []
  const d = new Date(2025, 0, 1)
  for (let i = 0; i < len; i++) {
    const m = new Date(d.getFullYear(), d.getMonth() + i, 1)
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

/** Basis-props met een gezonde asset+schuld+netto-reeks van `len` maanden. */
function baseProps(len = 4, overrides: Partial<NetworthGroupsChartProps> = {}): NetworthGroupsChartProps {
  const ms = months(len)
  const spaargeld = new Array(len).fill(0).map((_, i) => 20_000 + i * 1_000)
  const beleggingen = new Array(len).fill(0).map((_, i) => 50_000 + i * 2_000)
  const wonen = new Array(len).fill(0).map((_, i) => 240_000 - i * 500)
  const net = ms.map((_, i) => spaargeld[i] + beleggingen[i] - wonen[i])
  return {
    months: ms,
    assetGroups: assets(len, { spaargeld, beleggingen }),
    debtGroups: debts(len, { wonen }),
    rest: new Array(len).fill(0),
    net,
    provenance: { net: new Array(len).fill('measured') },
    ...overrides,
  }
}

function nums(attr: string, nodes: Element[]): number[] {
  return nodes.map((n) => Number(n.getAttribute(attr)))
}

describe('NetworthGroupsChart — lege / edge-gevallen', () => {
  it('rendert niets (null) bij lege months', () => {
    const { container } = render(
      <NetworthGroupsChart
        months={[]}
        assetGroups={assets(0)}
        debtGroups={debts(0)}
        rest={[]}
        net={[]}
        provenance={{}}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('crasht niet bij één maand', () => {
    const { container } = render(<NetworthGroupsChart {...baseProps(1)} />)
    expect(container.querySelector('svg')).toBeTruthy()
  })
})

describe('NetworthGroupsChart — assets boven, schulden onder de nulas', () => {
  it('rendert asset-banden (side=asset) boven schuld-banden (side=debt)', () => {
    const { container } = render(<NetworthGroupsChart {...baseProps(4)} />)
    const assetBands = Array.from(container.querySelectorAll('[data-side="asset"]'))
    const debtBands = Array.from(container.querySelectorAll('[data-side="debt"]'))
    expect(assetBands.length).toBeGreaterThan(0)
    expect(debtBands.length).toBeGreaterThan(0)
    // Assets zitten hoger op het scherm (kleinere y) dan schulden.
    const maxAssetTop = Math.max(...nums('y', assetBands))
    const minDebtTop = Math.min(...nums('y', debtBands))
    expect(maxAssetTop).toBeLessThanOrEqual(minDebtTop)
  })

  it('rendert een band per aanwezige groep met de juiste testid', () => {
    const { container } = render(<NetworthGroupsChart {...baseProps(4)} />)
    expect(container.querySelectorAll('[data-testid="asset-band-spaargeld"]').length).toBe(4)
    expect(container.querySelectorAll('[data-testid="asset-band-beleggingen"]').length).toBe(4)
    expect(container.querySelectorAll('[data-testid="debt-band-wonen"]').length).toBe(4)
  })
})

describe('NetworthGroupsChart — restband (niet-uitgesplitst)', () => {
  it('toont de gelabelde restband bovenaan bij rest > 0', () => {
    const { container } = render(
      <NetworthGroupsChart {...baseProps(4, { rest: [5_000, 5_000, 5_000, 5_000] })} />,
    )
    expect(container.querySelectorAll('[data-testid="rest-band-positive"]').length).toBe(4)
    expect(screen.getByText(/niet-uitgesplitst/i)).toBeTruthy()
  })

  it('toont de gelabelde restband onder de schuld-kant bij rest < 0', () => {
    const { container } = render(
      <NetworthGroupsChart {...baseProps(4, { rest: [-4_000, -4_000, -4_000, -4_000] })} />,
    )
    const negBands = Array.from(container.querySelectorAll('[data-testid="rest-band-negative"]'))
    expect(negBands.length).toBe(4)
    // De rest⁻-band ligt onder de nulas (onder de schuld-stapel): grootste y.
    const debtBands = Array.from(container.querySelectorAll('[data-testid="debt-band-wonen"]'))
    expect(Math.max(...nums('y', negBands))).toBeGreaterThanOrEqual(Math.max(...nums('y', debtBands)))
    expect(screen.getByText(/niet-uitgesplitst/i)).toBeTruthy()
  })

  it('toont GEEN restband en GEEN restlabel bij rest ≈ 0 overal', () => {
    const { container } = render(<NetworthGroupsChart {...baseProps(4, { rest: [0, 0, 0, 0] })} />)
    expect(container.querySelector('[data-testid="rest-band-positive"]')).toBeNull()
    expect(container.querySelector('[data-testid="rest-band-negative"]')).toBeNull()
    expect(screen.queryByText(/niet-uitgesplitst/i)).toBeNull()
  })
})

describe('NetworthGroupsChart — netto-lijn met gat bij null', () => {
  it('breekt de lijn bij null (geen interpolatie → twee losse segmenten)', () => {
    const len = 5
    const p = baseProps(len)
    // net: [v, v, null, v, v] → run1 (2 punten → 1 seg) + run2 (2 punten → 1 seg)
    const net = [...p.net]
    net[2] = null
    const { container } = render(<NetworthGroupsChart {...p} net={net} />)
    const segs = container.querySelectorAll('[data-testid="net-segment"]')
    expect(segs.length).toBe(2)
  })

  it('rendert een doorlopende lijn (n-1 segmenten) zonder gaten', () => {
    const { container } = render(<NetworthGroupsChart {...baseProps(5)} />)
    expect(container.querySelectorAll('[data-testid="net-segment"]').length).toBe(4)
  })

  it('alle netto null → banden zonder enige lijn', () => {
    const p = baseProps(4)
    const { container } = render(
      <NetworthGroupsChart {...p} net={[null, null, null, null]} />,
    )
    expect(container.querySelectorAll('[data-testid="net-segment"]').length).toBe(0)
    expect(container.querySelectorAll('[data-side="asset"]').length).toBeGreaterThan(0)
  })
})

describe('NetworthGroupsChart — tooltip', () => {
  it('toont bezittingen, schulden, netto en de maand-op-maand-delta, zonder entiteitsnamen', () => {
    const { container } = render(<NetworthGroupsChart {...baseProps(4)} />)
    const hits = container.querySelectorAll('[data-testid="month-hit"]')
    // Hover maand-index 1 (heeft een vorige maand → delta beschikbaar).
    fireEvent.mouseEnter(hits[1])
    const status = screen.getByRole('status')
    expect(status.textContent).toMatch(/Bezittingen/)
    expect(status.textContent).toMatch(/Schulden/)
    expect(status.textContent).toMatch(/Netto/)
    // Delta: netto stijgt maand-op-maand → '+'-teken zichtbaar.
    expect(status.textContent).toMatch(/\+/)
    // Geen per-groep-opsomming / entiteitsnamen in de tooltip.
    expect(status.textContent).not.toMatch(/Spaargeld/)
    expect(status.textContent).not.toMatch(/Wonen/)
    expect(status.textContent).not.toMatch(/Beleggingen/)
  })

  it('toont "—" als netto voor de gehoverde maand ontbreekt (null)', () => {
    const p = baseProps(4)
    const net = [...p.net]
    net[2] = null
    const { container } = render(<NetworthGroupsChart {...p} net={net} />)
    const hits = container.querySelectorAll('[data-testid="month-hit"]')
    fireEvent.mouseEnter(hits[2])
    const status = screen.getByRole('status')
    expect(status.textContent).toMatch(/—/)
  })
})

describe('NetworthGroupsChart — herkomstmarkering', () => {
  it('markeert LOCF-banden visueel (data-provenance + gedimd/patroon)', () => {
    const p = baseProps(4)
    const { container } = render(
      <NetworthGroupsChart
        {...p}
        provenance={{
          ...p.provenance,
          'asset:spaargeld': ['measured', 'locf', 'measured', 'measured'],
        }}
      />,
    )
    const locfBands = container.querySelectorAll('[data-testid="asset-band-spaargeld"][data-provenance="locf"]')
    expect(locfBands.length).toBe(1)
    // Gedimd (lagere opacity) — 'niet alleen kleur'.
    expect(Number((locfBands[0] as SVGElement).getAttribute('opacity'))).toBeLessThan(0.85)
  })

  it('legenda toont alleen de herkomststaten die voorkomen (measured + locf, geen manual)', () => {
    const p = baseProps(4)
    render(
      <NetworthGroupsChart
        {...p}
        provenance={{
          net: ['measured', 'locf', 'measured', 'measured'],
          'asset:spaargeld': ['measured', 'locf', 'measured', 'measured'],
        }}
      />,
    )
    expect(screen.getByText('Gemeten')).toBeTruthy()
    expect(screen.getByText('Doorgetrokken')).toBeTruthy()
    expect(screen.queryByText('Handmatig')).toBeNull()
  })

  it('markeert handmatige netto-punten en toont "Handmatig" in de legenda', () => {
    const p = baseProps(4)
    const { container } = render(
      <NetworthGroupsChart
        {...p}
        provenance={{ net: ['measured', 'manual', 'measured', 'measured'] }}
      />,
    )
    expect(container.querySelectorAll('[data-testid="net-manual-marker"]').length).toBe(1)
    expect(screen.getByText('Handmatig')).toBeTruthy()
  })
})

describe('NetworthGroupsChart — privacy-masking', () => {
  afterEach(() => {
    window.localStorage.clear()
  })

  it('maskeert de bedragen in de tooltip wanneer masking aan staat', () => {
    window.localStorage.setItem(PRIVACY_MASKED_STORAGE_KEY, 'true')
    const { container } = render(
      <PrivacyProvider>
        <NetworthGroupsChart {...baseProps(4)} />
      </PrivacyProvider>,
    )
    fireEvent.mouseEnter(container.querySelectorAll('[data-testid="month-hit"]')[1])
    const status = screen.getByRole('status')
    expect(status.textContent).toContain(MASKED_AMOUNT_PLACEHOLDER)
    // Rauwe bedragen (bv. de €50k-beleggingen) mogen niet lekken.
    expect(status.textContent).not.toMatch(/\d{2}\.\d{3}/)
  })

  it('toont echte bedragen in de tooltip zonder masking', () => {
    const { container } = render(<NetworthGroupsChart {...baseProps(4)} />)
    fireEvent.mouseEnter(container.querySelectorAll('[data-testid="month-hit"]')[1])
    const status = screen.getByRole('status')
    expect(status.textContent).not.toContain(MASKED_AMOUNT_PLACEHOLDER)
    expect(status.textContent).toMatch(/€/)
  })
})
