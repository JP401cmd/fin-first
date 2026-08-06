/**
 * Unit tests voor de pure functies in `aandelenHoldingsSetupConfig`.
 *
 * Dekt de versimpelde setup (aug 2026): alléén beleggingen-selectie —
 * gelijkgetrokken met crypto-holdings en hypotheekplanner. De eerdere
 * broker-/invoermethode-/uitleg-stappen zijn vervallen; validate en
 * buildPayload kennen die velden niet meer. Geen React, geen
 * Supabase-netwerk.
 *
 * Gemockte modules zijn alleen nodig omdat de config-file React-componenten
 * (die next/navigation + createClient gebruiken) in hetzelfde bestand
 * definieert. De te testen logica (initialState / validate / buildPayload)
 * heeft die afhankelijkheden zelf niet.
 */

import { describe, it, expect, vi } from 'vitest'

// ── Module-mocks (alleen om import-errors te vermijden) ─────────────────────
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}))
vi.mock('next/link', () => ({
  default: ({ children }: { children: unknown }) => children,
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/core/assets/investment',
}))

// ── Subject ─────────────────────────────────────────────────────────────────
import { aandelenHoldingsSetupConfig } from './aandelen-holdings.config'

// Alias voor leesbaarheid
const { initialState, validate, buildPayload } = aandelenHoldingsSetupConfig

// ── initialState ─────────────────────────────────────────────────────────────

describe('aandelenHoldingsSetupConfig — initialState', () => {
  it('bevat selectedAssetIds als lege array', () => {
    expect(initialState().selectedAssetIds).toEqual([])
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
    const result = validate({ selectedAssetIds: [] })
    expect(result.ok).toBe(false)
    expect(result.reason?.toLowerCase()).toMatch(/belegging/)
  })

  it('slaagt met één selectedAssetId — geen andere verplichte velden meer', () => {
    const result = validate({ selectedAssetIds: ['asset-vwrl'] })
    expect(result.ok).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('slaagt met meerdere selectedAssetIds', () => {
    const result = validate({
      selectedAssetIds: ['asset-vwrl', 'asset-meesman'],
    })
    expect(result.ok).toBe(true)
  })
})

// ── buildPayload ─────────────────────────────────────────────────────────────

describe('aandelenHoldingsSetupConfig — buildPayload', () => {
  it('bevat selectedAssetIds', () => {
    const payload = buildPayload({ selectedAssetIds: ['asset-vwrl'] }) as Record<string, unknown>
    expect(payload.selectedAssetIds).toEqual(['asset-vwrl'])
  })

  it('bevat uitsluitend selectedAssetIds — de vervallen setup-velden komen niet meer mee', () => {
    const payload = buildPayload({ selectedAssetIds: ['asset-vwrl'] }) as Record<string, unknown>
    expect(Object.keys(payload)).toEqual(['selectedAssetIds'])
  })
})
