/**
 * Unit tests voor de pure functies in `aandelenHoldingsSetupConfig`.
 *
 * Dekt de gedragswijziging uit juni 2026: selectie-gebaseerde setup
 * (selectedAssetIds verplicht ≥1). Geen React, geen Supabase-netwerk.
 *
 * Gemockte modules zijn alleen nodig omdat de config-file React-componenten
 * (die next/link + createClient gebruiken) in hetzelfde bestand definieert.
 * De te testen logica (initialState / validate / buildPayload) heeft die
 * afhankelijkheden zelf niet.
 */

import { describe, it, expect, vi } from 'vitest'

// ── Module-mocks (alleen om import-errors te vermijden) ─────────────────────
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}))
vi.mock('next/link', () => ({
  default: ({ children }: { children: unknown }) => children,
}))

// ── Subject ─────────────────────────────────────────────────────────────────
import { aandelenHoldingsSetupConfig } from './aandelen-holdings.config'

// Alias voor leesbaarheid
const { initialState, validate, buildPayload } = aandelenHoldingsSetupConfig

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Geeft een volledig geldige state terug. */
function validState() {
  return {
    selectedAssetIds: ['asset-vwrl'],
    brokers: ['degiro'],
    inputMethod: 'manual' as const,
    acknowledgedTxLogging: true,
  }
}

// ── initialState ─────────────────────────────────────────────────────────────

describe('aandelenHoldingsSetupConfig — initialState', () => {
  it('bevat selectedAssetIds als lege array', () => {
    expect(initialState().selectedAssetIds).toEqual([])
  })

  it('bevat brokers als lege array', () => {
    expect(initialState().brokers).toEqual([])
  })

  it('bevat inputMethod als null', () => {
    expect(initialState().inputMethod).toBeNull()
  })

  it('bevat acknowledgedTxLogging als false', () => {
    expect(initialState().acknowledgedTxLogging).toBe(false)
  })

  it('elke aanroep geeft een verse object-instantie', () => {
    const a = initialState()
    const b = initialState()
    expect(a).not.toBe(b)
  })
})

// ── validate ─────────────────────────────────────────────────────────────────

describe('aandelenHoldingsSetupConfig — validate', () => {
  it('faalt wanneer selectedAssetIds leeg is', () => {
    const result = validate({ ...validState(), selectedAssetIds: [] })
    expect(result.ok).toBe(false)
    expect(result.reason?.toLowerCase()).toMatch(/belegging|asset/)
  })

  it('faalt wanneer brokers leeg is', () => {
    const result = validate({ ...validState(), brokers: [] })
    expect(result.ok).toBe(false)
  })

  it('faalt wanneer inputMethod null is', () => {
    const result = validate({ ...validState(), inputMethod: null })
    expect(result.ok).toBe(false)
  })

  it('faalt wanneer acknowledgedTxLogging false is', () => {
    const result = validate({ ...validState(), acknowledgedTxLogging: false })
    expect(result.ok).toBe(false)
  })

  it('slaagt met één selectedAssetId en alle verplichte velden gezet', () => {
    const result = validate(validState())
    expect(result.ok).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('slaagt met meerdere selectedAssetIds', () => {
    const result = validate({
      ...validState(),
      selectedAssetIds: ['asset-vwrl', 'asset-iwda', 'asset-aapl'],
    })
    expect(result.ok).toBe(true)
  })

  it('slaagt met alle inputMethod-varianten', () => {
    for (const method of ['manual', 'csv', 'api'] as const) {
      expect(validate({ ...validState(), inputMethod: method }).ok).toBe(true)
    }
  })

  it('slaagt met meerdere brokers', () => {
    const result = validate({ ...validState(), brokers: ['degiro', 'ibkr'] })
    expect(result.ok).toBe(true)
  })
})

// ── buildPayload ─────────────────────────────────────────────────────────────

describe('aandelenHoldingsSetupConfig — buildPayload', () => {
  it('bevat selectedAssetIds', () => {
    const payload = buildPayload(validState()) as Record<string, unknown>
    expect(payload.selectedAssetIds).toEqual(['asset-vwrl'])
  })

  it('bevat brokers', () => {
    const payload = buildPayload(validState()) as Record<string, unknown>
    expect(payload.brokers).toEqual(['degiro'])
  })

  it('bevat inputMethod', () => {
    const payload = buildPayload(validState()) as Record<string, unknown>
    expect(payload.inputMethod).toBe('manual')
  })

  it('stuurt meerdere selectedAssetIds correct door', () => {
    const state = { ...validState(), selectedAssetIds: ['asset-vwrl', 'asset-iwda'] }
    const payload = buildPayload(state) as Record<string, unknown>
    expect(payload.selectedAssetIds).toEqual(['asset-vwrl', 'asset-iwda'])
  })

  it('bevat acknowledgedTxLogging NIET (privacy — client-only veld)', () => {
    const payload = buildPayload(validState()) as Record<string, unknown>
    expect(Object.keys(payload)).not.toContain('acknowledgedTxLogging')
  })
})
