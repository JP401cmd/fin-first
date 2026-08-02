import { describe, it, expect } from 'vitest'
import {
  projectPortfolio,
  computeExpectedAnnualAppreciation,
  ASSET_CLIENT_COLUMNS,
  ASSET_CLIENT_COLUMN_LIST,
  type Asset,
} from './asset-data'

describe('computeExpectedAnnualAppreciation', () => {
  it('behandelt expected_return als PERCENTAGE (/100), niet als fractie', () => {
    // €100.000 × 7% = €7.000 — NIET €700.000 (de 100×-bug die de caller-bedrading had).
    const r = computeExpectedAnnualAppreciation([
      { id: 'a', name: 'etf', current_value: 100_000, expected_return: 7,
        asset_type: 'etf', is_active: true } as unknown as Asset,
    ])
    expect(r).toBeCloseTo(7000, 6)
  })

  it('depreciërende assets tellen als 0', () => {
    const r = computeExpectedAnnualAppreciation([
      { id: 'v', name: 'auto', current_value: 20_000, expected_return: -10,
        asset_type: 'vehicle', is_active: true } as unknown as Asset,
    ])
    expect(r).toBe(0)
  })

  it('weegt met net_worth_inclusion_pct', () => {
    const r = computeExpectedAnnualAppreciation([
      { id: 'a', name: 'etf', current_value: 100_000, expected_return: 8,
        asset_type: 'aandelen', is_active: true, net_worth_inclusion_pct: 50 } as unknown as Asset,
    ])
    expect(r).toBeCloseTo(4000, 6) // 100k × 8% × 50%
  })

  it('lege lijst → 0', () => {
    expect(computeExpectedAnnualAppreciation([])).toBe(0)
  })
})

describe('projectPortfolio — column-sparse aggregated partner row', () => {
  // Mirrors the row produced by the `household_partner_items` RPC when a
  // partner's asset privacy is set to 'totals': it carries current_value /
  // ownership / is_active but intentionally OMITS expected_return,
  // monthly_contribution, depreciation_rate and asset_type. In household /
  // partner perspective this row flows straight into projectPortfolio.
  const aggregatedPartnerRow = {
    id: 'aggregated_partner_assets',
    name: 'Partner vermogen (totaal)',
    current_value: 250_000,
    ownership: 'personal',
    user_id: 'partner-uuid',
    is_active: true,
    _aggregated: true,
    _aggregatedCount: 4,
  } as unknown as Asset

  it('produces finite totals even when return/contribution fields are missing', () => {
    const rows = projectPortfolio([aggregatedPartnerRow], 120)
    expect(rows).toHaveLength(120)
    for (const r of rows) {
      expect(Number.isFinite(r.total)).toBe(true)
    }
  })

  it('treats a missing expected_return as 0% growth (value stays flat)', () => {
    const rows = projectPortfolio([aggregatedPartnerRow], 120)
    expect(rows[rows.length - 1].total).toBe(250_000)
  })

  it('still projects normal itemized assets correctly alongside the sparse row', () => {
    const normal = {
      id: 'a1',
      asset_type: 'investment',
      current_value: 10_000,
      expected_return: 7,
      monthly_contribution: 0,
      is_active: true,
    } as unknown as Asset
    const rows = projectPortfolio([normal, aggregatedPartnerRow], 12)
    // Combined total = flat 250k partner + grown 10k investment, all finite.
    for (const r of rows) expect(Number.isFinite(r.total)).toBe(true)
    expect(rows[rows.length - 1].total).toBeGreaterThan(260_000)
  })
})

describe('ASSET_CLIENT_COLUMNS — kolomcontract voor client-lezingen op `assets`', () => {
  // Ground truth voor `public.assets`, opgevraagd via
  // `information_schema.columns` op de LIVE remote database (mcp__supabase,
  // 2026-07-31) — niet handmatig samengesteld uit de migraties, want vijf
  // kolommen (`has_woonbalans_tracking`, `has_rental_tracking`,
  // `monthly_maintenance_cost`, `vva_fee`, `vacancy_log`) staan wél op de live
  // tabel maar in GEEN enkel bestand onder `supabase/migrations/*` (kennelijk
  // buiten de ingecheckte migratiehistorie om aangebracht — een gat op
  // zichzelf, maar buiten de scope van deze test). 48 kolommen exact.
  //
  // WAAROM dit een aparte, hardgecodeerde set is en geen live db-call: deze
  // test moet deterministisch en snel blijven (CLAUDE.md-non-negotiable) en
  // mag niet van netwerktoegang afhangen. Wijzigt het schema, dan moet deze
  // set bewust worden bijgewerkt — dat is precies het doel: een niet-bestaande
  // kolom in `ASSET_CLIENT_COLUMNS` geeft PostgREST een 400, en de loaders
  // hier slikken die fout stil (leeg scherm, geen console-signaal).
  const SCHEMA_COLUMNS = new Set<string>([
    'account_number',
    'account_number_encrypted',
    'account_number_hash',
    'address_house_number',
    'address_postcode',
    'annual_dividend',
    'asset_type',
    'created_at',
    'current_value',
    'depreciation_rate',
    'expected_return',
    'has_budget_tracking',
    'has_holdings_tracking',
    'has_rental_tracking',
    'has_woonbalans_tracking',
    'household_id',
    'id',
    'imported_peildatum',
    'institution',
    'is_active',
    'is_liquid',
    'kvk_number',
    'linked_asset_id',
    'linked_bank_account_id',
    'lock_end_date',
    'monthly_contribution',
    'monthly_maintenance_cost',
    'name',
    'net_worth_inclusion_pct',
    'notes',
    'ownership',
    'ownership_percentage',
    'purchase_date',
    'purchase_value',
    'rental_income',
    'retirement_provider_type',
    'risk_profile',
    'sale_config',
    'sort_order',
    'source',
    'subtype',
    'tax_benefit',
    'ticker_symbol',
    'updated_at',
    'user_id',
    'vacancy_log',
    'vva_fee',
    'woz_value',
  ])

  it('SCHEMA_COLUMNS-fixture zelf telt 48 (sanity op de ground truth)', () => {
    expect(SCHEMA_COLUMNS.size).toBe(48)
  })

  it('bevat GEEN van de drie account-nummer-kolommen — exacte namen, geen substring-check', () => {
    // Een `.includes('account_number')`-achtige substring-assertie zou hier
    // vals-groen zijn: 'account_number' zit letterlijk in
    // 'account_number_hash' en 'account_number_encrypted'. Vergelijk daarom
    // op de exacte, gesplitste kolomnamen uit ASSET_CLIENT_COLUMN_LIST.
    expect(ASSET_CLIENT_COLUMN_LIST).not.toContain('account_number_hash')
    expect(ASSET_CLIENT_COLUMN_LIST).not.toContain('account_number_encrypted')
    expect(ASSET_CLIENT_COLUMN_LIST).not.toContain('account_number')
  })

  it('elke kolom in ASSET_CLIENT_COLUMN_LIST bestaat echt in het schema van public.assets', () => {
    const unknown = ASSET_CLIENT_COLUMN_LIST.filter((col) => !SCHEMA_COLUMNS.has(col))
    expect(unknown).toEqual([])
  })

  it('expiry_date en beneficiary zijn fantoomvelden op Asset — NIET in de database en dus NIET in de kolomlijst', () => {
    // Staan wel op de `Asset`-TS-interface (historisch), maar `select('*')`
    // gaf ze ook nooit terug — geen bestaande kolom om op te vragen.
    expect(SCHEMA_COLUMNS.has('expiry_date')).toBe(false)
    expect(SCHEMA_COLUMNS.has('beneficiary')).toBe(false)
    expect(ASSET_CLIENT_COLUMN_LIST).not.toContain('expiry_date')
    expect(ASSET_CLIENT_COLUMN_LIST).not.toContain('beneficiary')
  })

  it('geen duplicaten en geen lege segmenten na het splitsen van ASSET_CLIENT_COLUMNS', () => {
    expect(new Set(ASSET_CLIENT_COLUMN_LIST).size).toBe(ASSET_CLIENT_COLUMN_LIST.length)
    for (const col of ASSET_CLIENT_COLUMN_LIST) {
      expect(col.length).toBeGreaterThan(0)
      expect(col.trim()).toBe(col)
    }
  })

  it('ASSET_CLIENT_COLUMNS is precies ASSET_CLIENT_COLUMN_LIST met ", " als scheidingsteken (string-literal invariant)', () => {
    expect(ASSET_CLIENT_COLUMNS).toBe(ASSET_CLIENT_COLUMN_LIST.join(', '))
  })
})
