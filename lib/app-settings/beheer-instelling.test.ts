/**
 * `leesBeheerInstelling(en)` is de ene route waarlangs beheer-content uit
 * `app_settings` server-side gelezen wordt (ADR 0163). Bewaakt: service-role
 * (nooit de sessie-client), lege/ontbrekende waarden vallen weg, en geen
 * enkele fout lekt als throw naar een gebruikerspad.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFrom, mockGetServiceClient } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockGetServiceClient: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({ getServiceClient: mockGetServiceClient }))

import {
  isBeheerSleutel,
  leesBeheerInstelling,
  leesBeheerInstellingen,
  type BeheerSleutel,
} from './beheer-instelling'

function stubRows(result: { data: unknown; error?: unknown } | Error) {
  mockFrom.mockImplementation(() => ({
    select: () => ({
      in: async () => {
        if (result instanceof Error) throw result
        return { data: result.data, error: result.error ?? null }
      },
    }),
  }))
  mockGetServiceClient.mockReturnValue({ from: mockFrom })
}

beforeEach(() => {
  mockFrom.mockReset()
  mockGetServiceClient.mockReset()
})

describe('leesBeheerInstellingen', () => {
  it('leest via de service-role en levert alleen niet-lege string-waarden', async () => {
    stubRows({
      data: [
        { key: 'briefing_directives', value: '[{"id":"a"}]' },
        { key: 'briefing_functional_directives', value: '   ' },
        { key: 'iets_anders', value: 42 },
      ],
    })
    const map = await leesBeheerInstellingen(['briefing_directives', 'briefing_functional_directives'])
    expect(mockGetServiceClient).toHaveBeenCalledTimes(1)
    expect(mockFrom).toHaveBeenCalledWith('app_settings')
    expect(map).toEqual({ briefing_directives: '[{"id":"a"}]' })
  })

  it('zonder sleutels: geen leesronde, lege map', async () => {
    expect(await leesBeheerInstellingen([])).toEqual({})
    expect(mockGetServiceClient).not.toHaveBeenCalled()
  })

  it('een databasefout of throw levert een lege map, nooit een exception', async () => {
    stubRows({ data: null, error: { message: 'permission denied' } })
    expect(await leesBeheerInstellingen(['briefing_directives'])).toEqual({})
    stubRows(new Error('ECONNRESET'))
    expect(await leesBeheerInstellingen(['briefing_directives'])).toEqual({})
  })

  it('een sleutel buiten BEHEER_SLEUTELS wordt nooit opgevraagd — ook niet via een cast', async () => {
    // Dit is een BYPASSRLS-lezer: zonder deze grendel zou een toekomstige
    // aanroeper andermans check-in-snapshot via de service-role kunnen lezen.
    stubRows({ data: [{ key: 'checkin_snapshot_1234-uuid_2026-09', value: 'inhoud' }] })
    const map = await leesBeheerInstellingen([
      'checkin_snapshot_1234-uuid_2026-09' as BeheerSleutel,
    ])
    expect(map).toEqual({})
    expect(mockGetServiceClient).not.toHaveBeenCalled()
    expect(isBeheerSleutel('waardestromen')).toBe(true)
    expect(isBeheerSleutel('anthropic_api_key')).toBe(false)
  })
})

describe('leesBeheerInstelling', () => {
  it('geeft de waarde of null', async () => {
    stubRows({ data: [{ key: 'ai_system_prompt_override', value: 'JIJ BENT FIN' }] })
    expect(await leesBeheerInstelling('ai_system_prompt_override')).toBe('JIJ BENT FIN')
    stubRows({ data: [] })
    expect(await leesBeheerInstelling('ai_system_prompt_override')).toBeNull()
  })
})
