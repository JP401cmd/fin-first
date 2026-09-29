import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * aiLaagStand (eindreview Y3): de reden waarom de AI-laag NU stilstaat, live
 * getoetst in de volgorde van de poorten — niets opgeslagen.
 */

const mockCloud = vi.fn()
vi.mock('@/lib/ai/privacy-gate', () => ({ isCloudAllowed: (...a: unknown[]) => mockCloud(...a) }))
const mockTegoed = vi.fn()
vi.mock('@/lib/ai/credit-gate', () => ({ checkCreditBudget: (...a: unknown[]) => mockTegoed(...a) }))

import { maakNepClient, type NepRij } from './nep-client.fixture'
import { aiLaagStand } from './ai-laag-stand'

const UID = 'user-a'
const NU = new Date('2026-09-29T12:00:00Z')
const tokens = (n: number): NepRij[] =>
  Array.from({ length: n }, (_, i) => ({ id: `t${i}`, user_id: UID, feature: 'krant_ai', created_at: new Date(NU.getTime() - (i + 1) * 3_600_000).toISOString() }))
const client = (n = 0, fouten?: Record<string, string>) => maakNepClient({ krant_edities: [], ai_token_usage: tokens(n) }, { fouten }).client as never

beforeEach(() => {
  vi.clearAllMocks()
  mockCloud.mockResolvedValue(true)
  mockTegoed.mockResolvedValue({ allowed: true })
})

describe('aiLaagStand', () => {
  it('bezwaar wint van alles, zonder verdere lezingen', async () => {
    expect(await aiLaagStand(client(9), UID, { bezwaar: true, now: NU })).toBe('bezwaar')
    expect(mockCloud).not.toHaveBeenCalled()
  })

  it("lokaal / privé-modus / kill-switch (isCloudAllowed 'nieuws' = nee, of een leesfout)", async () => {
    mockCloud.mockResolvedValueOnce(false)
    expect(await aiLaagStand(client(), UID, { bezwaar: false, now: NU })).toBe('lokaal')
    expect(mockCloud).toHaveBeenCalledWith(expect.anything(), UID, 'nieuws')
    mockCloud.mockRejectedValueOnce(new Error('db'))
    expect(await aiLaagStand(client(), UID, { bezwaar: false, now: NU })).toBe('lokaal')
  })

  it('quotum: 4 calls nog niet, 5 wel; een leesfout zegt niets (null)', async () => {
    expect(await aiLaagStand(client(4), UID, { bezwaar: false, now: NU })).toBeNull()
    expect(await aiLaagStand(client(5), UID, { bezwaar: false, now: NU })).toBe('quotum')
    expect(await aiLaagStand(client(0, { 'ai_token_usage:select': 'kapot' }), UID, { bezwaar: false, now: NU })).toBeNull()
  })

  it('tegoed op → tegoed; een leesfout op het tegoed zegt niets', async () => {
    mockTegoed.mockResolvedValueOnce({ allowed: false })
    expect(await aiLaagStand(client(), UID, { bezwaar: false, now: NU })).toBe('tegoed')
    mockTegoed.mockRejectedValueOnce(new Error('db'))
    expect(await aiLaagStand(client(), UID, { bezwaar: false, now: NU })).toBeNull()
  })
})
