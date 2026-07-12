/**
 * Unit tests voor de pure functies in `cryptoHoldingsSetupConfig`.
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
import { cryptoHoldingsSetupConfig } from './crypto-holdings.config'

// Alias voor leesbaarheid
const { initialState, validate, buildPayload } = cryptoHoldingsSetupConfig

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Geeft een volledig geldige state terug. */
function validState() {
  return {
    selectedAssetIds: ['asset-btc'],
    sources: ['bitvavo'],
    inputMethod: 'manual' as const,
    acknowledgedTxLogging: true,
  }
}

// ── initialState ─────────────────────────────────────────────────────────────

describe('cryptoHoldingsSetupConfig — initialState', () => {
  it('bevat selectedAssetIds als lege array', () => {
    expect(initialState().selectedAssetIds).toEqual([])
  })

  it('bevat sources als lege array', () => {
    expect(initialState().sources).toEqual([])
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

describe('cryptoHoldingsSetupConfig — validate', () => {
  it('faalt wanneer selectedAssetIds leeg is', () => {
    const result = validate({ ...validState(), selectedAssetIds: [] })
    expect(result.ok).toBe(false)
    expect(result.reason?.toLowerCase()).toMatch(/bezitting/)
  })

  it('faalt wanneer sources leeg is', () => {
    const result = validate({ ...validState(), sources: [] })
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
      selectedAssetIds: ['asset-btc', 'asset-eth', 'asset-sol'],
    })
    expect(result.ok).toBe(true)
  })

  it('slaagt met alle inputMethod-varianten', () => {
    for (const method of ['manual', 'csv', 'api'] as const) {
      expect(validate({ ...validState(), inputMethod: method }).ok).toBe(true)
    }
  })
})

// ── buildPayload ─────────────────────────────────────────────────────────────

describe('cryptoHoldingsSetupConfig — buildPayload', () => {
  it('bevat selectedAssetIds', () => {
    const payload = buildPayload(validState()) as Record<string, unknown>
    expect(payload.selectedAssetIds).toEqual(['asset-btc'])
  })

  it('bevat sources', () => {
    const payload = buildPayload(validState()) as Record<string, unknown>
    expect(payload.sources).toEqual(['bitvavo'])
  })

  it('bevat inputMethod', () => {
    const payload = buildPayload(validState()) as Record<string, unknown>
    expect(payload.inputMethod).toBe('manual')
  })

  it('stuurt meerdere selectedAssetIds correct door', () => {
    const state = { ...validState(), selectedAssetIds: ['asset-btc', 'asset-eth'] }
    const payload = buildPayload(state) as Record<string, unknown>
    expect(payload.selectedAssetIds).toEqual(['asset-btc', 'asset-eth'])
  })

  it('bevat acknowledgedTxLogging NIET (privacy — client-only veld)', () => {
    const payload = buildPayload(validState()) as Record<string, unknown>
    expect(Object.keys(payload)).not.toContain('acknowledgedTxLogging')
  })
})
