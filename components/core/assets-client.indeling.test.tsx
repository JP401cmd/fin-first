/**
 * De herindeling van het bezittingenformulier: minder velden, zelfde data.
 *
 * Regressie-eis: een veld dat het formulier niet meer toont, houdt bij het
 * opslaan zijn opgeslagen waarde. Verbergen is geen wissen.
 *
 * Given een bestaande bezitting met waarden in velden die niet meer getoond worden
 * When de gebruiker iets anders wijzigt en opslaat
 * Then staan die waarden ongewijzigd in de weggeschreven rij.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import type { Asset } from '@/lib/asset-data'

let updatedRow: Record<string, unknown> | null = null

function makeSupabase() {
  function builder(table: string): Record<string, unknown> {
    const target: Record<string, unknown> = {
      update: (row: Record<string, unknown>) => {
        if (table === 'assets') updatedRow = row
        return builder(table)
      },
      maybeSingle: async () => ({ data: { id: 'asset-1' }, error: null }),
      single: async () => ({ data: { id: 'asset-1' }, error: null }),
      then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
        Promise.resolve(resolve({ data: [], error: null })),
    }
    return new Proxy(target, {
      get(t, prop: string) {
        if (prop in t) return (t as Record<string, unknown>)[prop]
        return () => builder(table)
      },
    })
  }
  return {
    from: (table: string) => builder(table),
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
  }
}

vi.mock('@/lib/supabase/client', () => ({ createClient: () => makeSupabase() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/core/assets',
}))

let hasHousehold = false
vi.mock('@/components/app/ownership-toggle', () => ({
  useHouseholdStatus: () => ({ hasHousehold, householdId: hasHousehold ? 'hh-1' : null }),
  OwnershipToggle: () => <div data-testid="ownership-toggle" />,
}))

// De koppel-secties hebben een eigen ToastProvider nodig en vallen buiten deze toets.
vi.mock('./asset-edit-broker-section', () => ({ AssetEditBrokerSection: () => <div data-testid="broker-sectie" /> }))
vi.mock('./asset-edit-connection-section', () => ({ AssetEditConnectionSection: () => null }))

import { AssetForm } from './assets-client'

function makeAsset(overrides: Partial<Asset>): Asset {
  return {
    id: 'asset-1',
    user_id: 'u1',
    name: 'Test',
    asset_type: 'investment',
    current_value: 25_000,
    purchase_value: 20_000,
    purchase_date: '2021-03-15',
    expected_return: 6,
    monthly_contribution: 250,
    institution: 'DEGIRO',
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: '',
    updated_at: '',
    subtype: null,
    risk_profile: null,
    tax_benefit: null,
    is_liquid: null,
    lock_end_date: null,
    ticker_symbol: null,
    rental_income: null,
    woz_value: null,
    retirement_provider_type: null,
    depreciation_rate: null,
    address_postcode: null,
    address_house_number: null,
    expiry_date: null,
    beneficiary: null,
    kvk_number: null,
    ownership_percentage: null,
    annual_dividend: null,
    linked_asset_id: null,
    ownership: 'personal',
    household_id: null,
    net_worth_inclusion_pct: 100,
    has_budget_tracking: false,
    has_woonbalans_tracking: false,
    has_rental_tracking: false,
    monthly_maintenance_cost: 0,
    vva_fee: 0,
    vacancy_log: [],
    ...overrides,
  }
}

function renderForm(asset: Asset) {
  return render(
    <AssetForm asset={asset} linkedBankAccounts={new Map()} onClose={() => {}} onSaved={() => {}} />,
  )
}

async function saveAndGetRow(): Promise<Record<string, unknown>> {
  fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))
  await waitFor(() => expect(updatedRow).not.toBeNull())
  return updatedRow as Record<string, unknown>
}

function labels(): string[] {
  return Array.from(document.querySelectorAll('label')).map((l) => (l.textContent ?? '').trim())
}

beforeEach(() => {
  updatedRow = null
  hasHousehold = false
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }) as unknown as Response) as unknown as typeof fetch,
  )
  if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = () => {}
  }
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('AssetForm — beleggingen', () => {
  it('toont geen aankoopdatum en geen ticker meer', () => {
    renderForm(makeAsset({ ticker_symbol: 'VWRL' }))

    expect(labels()).not.toContain('Aankoopdatum')
    expect(labels()).not.toContain('Ticker / ISIN')
    expect(labels()).toContain('Huidige waarde')
    expect(labels()).toContain('Inleg p/m')
  })

  it('bewaart aankoopdatum, ticker en instelling bij opslaan', async () => {
    renderForm(makeAsset({ ticker_symbol: 'VWRL', risk_profile: 'middel' }))

    const row = await saveAndGetRow()

    expect(row.purchase_date).toBe('2021-03-15')
    expect(row.ticker_symbol).toBe('VWRL')
    expect(row.institution).toBe('DEGIRO')
    expect(row.risk_profile).toBe('middel')
    expect(row.purchase_value).toBe(20_000)
    expect(row.monthly_contribution).toBe(250)
  })

  it('"Hoe telt dit mee" draagt percentage en risicoprofiel', () => {
    renderForm(makeAsset({}))

    const telt = screen.getByTestId('asset-telt-mee') as HTMLDetailsElement
    expect(telt.open).toBe(false)
    expect(telt.textContent).toContain('Neem dit % mee')
    expect(telt.textContent).toContain('Risicoprofiel')
    expect(telt.textContent).not.toContain('Notities')
  })

  it('"Meer gegevens en koppelingen" draagt type, holdings en notities', () => {
    renderForm(makeAsset({}))

    const meer = screen.getByTestId('asset-meer-instellingen') as HTMLDetailsElement
    expect(meer.open).toBe(false)
    expect(meer.textContent).toContain('Type')
    expect(meer.textContent).toContain('Holdings bijhouden')
    expect(meer.textContent).toContain('Notities')
    expect(meer.textContent).not.toContain('Risicoprofiel')
  })

  it('de samenvatting toont dicht percentage en risicoprofiel', () => {
    renderForm(makeAsset({ net_worth_inclusion_pct: 50, risk_profile: 'middel' }))

    const samenvatting = screen.getByTestId('asset-telt-mee').querySelector('[data-samenvatting]')
    expect(samenvatting?.textContent).toBe('Telt voor 50% mee · risicoprofiel middel')
  })
})

describe('AssetForm — verkoopstrategie en externe koppeling uit de kern', () => {
  it('de verkoopstrategie staat in "Hoe telt dit mee", niet in de kern', () => {
    renderForm(makeAsset({ asset_type: 'vehicle', depreciation_rate: 15, expected_return: 0, monthly_contribution: 0, institution: null }))

    const telt = screen.getByTestId('asset-telt-mee')
    expect(telt.textContent).toContain('Verkoopstrategie in prognose')
    expect(telt.querySelector('[data-samenvatting]')?.textContent).toBe('Telt volledig mee · verkoop bij behoefte')
  })

  it('voertuig: het tweede blok heet "Meer gegevens", zonder koppelingen', () => {
    renderForm(makeAsset({ asset_type: 'vehicle', depreciation_rate: 15, expected_return: 0, monthly_contribution: 0, institution: null }))

    expect(screen.getByTestId('asset-meer-instellingen').querySelector('summary')?.textContent).toContain('Meer gegevens')
    expect(screen.getByTestId('asset-meer-instellingen').querySelector('summary')?.textContent).not.toContain('koppelingen')
  })

  it('de samenvatting noemt holdings met het woord van de schakelaar', () => {
    renderForm(makeAsset({ has_holdings_tracking: true }))

    expect(screen.getByTestId('asset-meer-instellingen').querySelector('[data-samenvatting]')?.textContent).toBe('Holdings bijgehouden')
  })

  it('de externe koppeling staat in "Meer gegevens en koppelingen"', () => {
    renderForm(makeAsset({}))

    // De sectie zelf is weggemockt tot een herkenbaar element; de plek is wat telt.
    const meer = screen.getByTestId('asset-meer-instellingen')
    expect(meer.contains(screen.getByTestId('broker-sectie'))).toBe(true)
  })
})

describe('AssetForm — per type', () => {
  it('pensioen: bewaart fiscaal voordeel en uitvoerder-type zonder ze te tonen', async () => {
    renderForm(makeAsset({
      asset_type: 'retirement',
      tax_benefit: true,
      retirement_provider_type: 'verzekeraar',
    }))
    expect(screen.queryByText('Fiscaal voordeel')).toBeNull()
    expect(labels()).not.toContain('Pensioenuitvoerder')

    const row = await saveAndGetRow()

    expect(row.tax_benefit).toBe(true)
    expect(row.retirement_provider_type).toBe('verzekeraar')
  })

  it('eigen woning: toont WOZ, verbergt huur en bewaart die', async () => {
    renderForm(makeAsset({
      asset_type: 'eigen_huis',
      current_value: 450_000,
      purchase_value: 300_000,
      monthly_contribution: 0,
      institution: null,
      woz_value: 420_000,
      rental_income: 900,
      address_postcode: '1234 AB',
      address_house_number: '42',
    }))
    expect(labels()).toContain('WOZ-waarde')
    expect(labels()).not.toContain('Huurinkomsten p/m')

    const row = await saveAndGetRow()

    expect(row.woz_value).toBe(420_000)
    expect(row.rental_income).toBe(900)
    expect(row.address_postcode).toBe('1234 AB')
    expect(row.address_house_number).toBe('42')
  })

  it('voertuig: toont afschrijving, geen inleg en geen instelling', () => {
    renderForm(makeAsset({
      asset_type: 'vehicle',
      current_value: 18_000,
      purchase_value: 30_000,
      monthly_contribution: 0,
      institution: null,
      depreciation_rate: 15,
      expected_return: 0,
    }))

    expect(labels()).toContain('Afschrijving (% p.j.)')
    expect(labels()).toContain('Aankoopwaarde')
    expect(labels()).not.toContain('Inleg p/m')
    expect(labels()).not.toContain('Instelling')
  })

  it('overig met een opgeslagen inleg: het veld blijft zichtbaar en is op nul te zetten', async () => {
    renderForm(makeAsset({ asset_type: 'other', monthly_contribution: 200, institution: null }))
    expect(labels()).toContain('Inleg p/m')

    const inleg = Array.from(document.querySelectorAll('label'))
      .find((l) => (l.textContent ?? '').trim() === 'Inleg p/m')
      ?.parentElement?.querySelector('input')
    if (!inleg) throw new Error('Geen invoerveld onder "Inleg p/m"')
    fireEvent.change(inleg, { target: { value: '0' } })

    const row = await saveAndGetRow()

    expect(row.monthly_contribution).toBe(0)
  })

  it('pensioen: de link naar mijnpensioenoverzicht staat bij de waarde', () => {
    renderForm(makeAsset({ asset_type: 'retirement' }))

    expect(screen.getByText('Open mijnpensioenoverzicht.nl')).toBeTruthy()
  })

  it('spaargeld: toont geen aankoopwaarde en bewaart de opgeslagen waarde', async () => {
    renderForm(makeAsset({
      asset_type: 'savings',
      current_value: 10_000,
      purchase_value: 8_000,
      expected_return: 2.5,
      is_liquid: true,
      institution: 'ING',
    }))
    expect(labels()).not.toContain('Aankoopwaarde')

    const row = await saveAndGetRow()

    expect(row.purchase_value).toBe(8_000)
  })

  it('overig: toont geen leeg kader "Details"', () => {
    renderForm(makeAsset({ asset_type: 'other', monthly_contribution: 0, institution: null }))

    expect(screen.queryByText('Details')).toBeNull()
  })

  it('levensverzekering: de einddatum van de polis wordt opgeslagen in lock_end_date', async () => {
    renderForm(makeAsset({
      asset_type: 'levensverzekering',
      current_value: 20_000,
      expected_return: 1.5,
      lock_end_date: '2036-09-29',
    }))
    expect(labels()).toContain('Einddatum polis')
    expect(labels()).not.toContain('Begunstigde')

    const row = await saveAndGetRow()

    expect(row.lock_end_date).toBe('2036-09-29')
  })
})

describe('AssetForm — deelneming', () => {
  const deelneming = makeAsset({
    asset_type: 'deelneming',
    name: 'Holding BV',
    current_value: 100_000,
    purchase_value: 18_000,
    expected_return: 0,
    monthly_contribution: 0,
    institution: null,
    ownership_percentage: 60,
    annual_dividend: 12_000,
    kvk_number: '12345678',
  })

  it('toont belang en dividend met de opgeslagen waarden', () => {
    renderForm(deelneming)

    expect((screen.getByTestId('asset-ownership-percentage') as HTMLInputElement).value).toBe('60')
    expect((screen.getByTestId('asset-annual-dividend') as HTMLInputElement).value).toBe('12000')
  })

  it('slaat een gewijzigd belang en dividend op', async () => {
    renderForm(deelneming)
    fireEvent.change(screen.getByTestId('asset-ownership-percentage'), { target: { value: '45.5' } })
    fireEvent.change(screen.getByTestId('asset-annual-dividend'), { target: { value: '8000' } })

    const row = await saveAndGetRow()

    expect(row.ownership_percentage).toBe(45.5)
    expect(row.annual_dividend).toBe(8000)
  })

  it('een leeg belang blijft leeg, geen nul', async () => {
    renderForm(deelneming)
    fireEvent.change(screen.getByTestId('asset-ownership-percentage'), { target: { value: '' } })

    const row = await saveAndGetRow()

    expect(row.ownership_percentage).toBeNull()
  })

  it.each(['0', '101', '-5'])('weigert belang %s en schrijft niets weg', async (invoer) => {
    renderForm(deelneming)
    fireEvent.change(screen.getByTestId('asset-ownership-percentage'), { target: { value: invoer } })

    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))

    expect(await screen.findByText('Vul een belang in dat groter is dan 0 en hoogstens 100%.')).toBeInTheDocument()
    expect(updatedRow).toBeNull()
  })

  it('leest dividend in Nederlandse notatie: "12.500" is twaalfenhalfduizend', async () => {
    renderForm(deelneming)
    fireEvent.change(screen.getByTestId('asset-annual-dividend'), { target: { value: '12.500' } })

    const row = await saveAndGetRow()

    expect(row.annual_dividend).toBe(12_500)
  })

  it('een leeg dividend blijft leeg, geen nul', async () => {
    renderForm(deelneming)
    fireEvent.change(screen.getByTestId('asset-annual-dividend'), { target: { value: '' } })

    const row = await saveAndGetRow()

    expect(row.annual_dividend).toBeNull()
  })

  it('accepteert een belang van precies 100', async () => {
    renderForm(deelneming)
    fireEvent.change(screen.getByTestId('asset-ownership-percentage'), { target: { value: '100' } })

    const row = await saveAndGetRow()

    expect(row.ownership_percentage).toBe(100)
  })
})

describe('AssetForm — eigendom', () => {
  it('toont Eigendom niet zonder huishouden', () => {
    renderForm(makeAsset({}))

    expect(screen.queryByTestId('ownership-toggle')).toBeNull()
  })

  it('toont Eigendom met een huishouden', () => {
    hasHousehold = true
    renderForm(makeAsset({}))

    expect(screen.getByTestId('ownership-toggle')).toBeTruthy()
  })

  it('toont Eigendom bij een bezitting die al gedeeld is', () => {
    renderForm(makeAsset({ ownership: 'shared', household_id: 'hh-1' }))

    expect(screen.getByTestId('ownership-toggle')).toBeTruthy()
  })
})
