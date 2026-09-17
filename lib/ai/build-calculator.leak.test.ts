import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * V-002 security-review: de rekenhulp gaf bij een providerfout de ruwe
 * responsbody (bv. "invalid x-api-key") en bij elke andere fout `err.name:
 * err.message` door aan de client. Beide horen alleen in het serverlog.
 */

const { mockGenerateObject } = vi.hoisted(() => ({ mockGenerateObject: vi.fn() }))

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>()
  return { ...actual, generateObject: mockGenerateObject }
})
vi.mock('@/lib/ai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/config')>()
  return { ...actual, getModel: vi.fn(async () => ({})) }
})

import { APICallError } from 'ai'
import { buildCalculator } from './build-calculator'

const supabase = {} as never

beforeEach(() => {
  mockGenerateObject.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('buildCalculator — geen providertekst naar de client', () => {
  it('providerfout: neutrale copy + code, geen responsbody', async () => {
    mockGenerateObject.mockRejectedValue(
      new APICallError({
        message: 'Unauthorized',
        url: 'https://provider.example/v1',
        requestBodyValues: {},
        statusCode: 401,
        responseBody: '{"error":"invalid x-api-key sk-geheim"}',
        isRetryable: false,
      }),
    )

    const result = await buildCalculator(supabase, 'Hoeveel spaar ik per jaar?')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('ai_provider_refused')
    expect(result.error).not.toMatch(/x-api-key|geheim|HTTP 401|provider/i)
  })

  it('onbekende fout: geen err.name of err.message in de tekst', async () => {
    mockGenerateObject.mockRejectedValue(new Error('relation "calculators_secret" does not exist'))

    const result = await buildCalculator(supabase, 'Hoeveel spaar ik per jaar?')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('ai_unknown')
    expect(result.error).not.toMatch(/calculators_secret|relation|Error:/)
  })
})
