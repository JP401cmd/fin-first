import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Bron-regressie voor de discriminator op `ScreenPublishResult`
 * (UAT WF-REKEN-04-bug2).
 *
 * Beide `ok: false`-takken — het LLM-oordeel en de fail-closed catch — hadden
 * dezelfde vorm; de route kon een AI-uitval daardoor niet van een echte
 * afkeuring onderscheiden en verweet de gebruiker "niet geschikt om publiek te
 * delen" terwijl er niets gescreend was. Hier borgen we dat:
 *  - een LLM-afkeuring `reason: 'content'` draagt (met issue/suggestion);
 *  - een gegooide AI-call `reason: 'unavailable'` draagt mét de vaste
 *    fail-closed-tekst — en nog steeds `ok: false` (fail-closed blijft).
 */

const mockGenerateObject = vi.fn()
vi.mock('ai', () => ({
  generateObject: (...args: unknown[]) => mockGenerateObject(...args),
}))
vi.mock('@/lib/ai/config', () => ({
  getModel: vi.fn().mockResolvedValue({ modelId: 'test-model' }),
}))

import { screenPublishMetadata, SCREEN_UNAVAILABLE_ISSUE } from './screen-publish-metadata'
import type { SupabaseClient } from '@supabase/supabase-js'

const supabase = {} as unknown as SupabaseClient
const INPUT = { name: 'Spaarbuffer opbouwen', description: 'Hoeveel maanden buffer bouw je op?' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('screenPublishMetadata — reden op de uitkomst', () => {
  it('LLM keurt de tekst af → ok=false met reason "content" en het LLM-issue', async () => {
    mockGenerateObject.mockResolvedValue({
      object: { ok: false, issue: 'De beschrijving noemt een concrete bank.', suggestion: 'Noem "een broker".' },
    })

    const res = await screenPublishMetadata(supabase, INPUT)

    expect(res).toEqual({
      ok: false,
      reason: 'content',
      issue: 'De beschrijving noemt een concrete bank.',
      suggestion: 'Noem "een broker".',
    })
  })

  it('LLM keurt af zonder issue → reason "content" met de terugval-uitleg', async () => {
    mockGenerateObject.mockResolvedValue({ object: { ok: false } })

    const res = await screenPublishMetadata(supabase, INPUT)

    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.reason).toBe('content')
    expect(res.issue).toBe('Onbekend probleem in naam/beschrijving.')
  })

  it('AI-call gooit (credit op / provider weg) → fail-closed met reason "unavailable"', async () => {
    mockGenerateObject.mockRejectedValue(new Error('402 credit balance too low'))

    const res = await screenPublishMetadata(supabase, INPUT)

    // Fail-closed blijft: nog steeds ok=false — geen ongescreende publieke rij.
    expect(res).toEqual({ ok: false, reason: 'unavailable', issue: SCREEN_UNAVAILABLE_ISSUE })
  })

  it('LLM keurt goed → ok=true zonder reden', async () => {
    mockGenerateObject.mockResolvedValue({ object: { ok: true } })

    expect(await screenPublishMetadata(supabase, INPUT)).toEqual({ ok: true })
  })

  it('lege naam → ok=true zonder LLM-call (UI/route vangen dat al af)', async () => {
    expect(await screenPublishMetadata(supabase, { name: '   ' })).toEqual({ ok: true })
    expect(mockGenerateObject).not.toHaveBeenCalled()
  })
})
