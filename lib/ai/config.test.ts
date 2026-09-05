import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * UR3-09 / ADR 0132 — geen bestaand config.test.ts vóór deze wijziging. Twee
 * dingen die de failure-middleware-integratie raakt:
 *  1. Een ontbrekende provider-sleutel (niet de kill-switch) moet
 *     `logAiFailure('ai:config', ...)` aanroepen — dat is de fout die vóór 24
 *     aug nergens landde.
 *  2. De kill-switch (`ai_disabled_platform`) is een BEWUSTE beheerdersactie,
 *     geen storing — die mag NOOIT loggen.
 * `getModel()` legt de failure-middleware nu ALTIJD om het model (ook zonder
 * feature) — die kant wordt hier niet apart getest (geen netwerk-call in
 * vitest), enkel de twee config-foutpaden hierboven.
 */

const { mockLogAiFailure, mockAiFailureMiddleware, mockFrom } = vi.hoisted(() => ({
  // Expliciet getypeerd: zonder parameters infereert vitest `.mock.calls` als
  // `[]` (0-tuple), en de destructure naar de echte 3-argumenten-vorm
  // hieronder wordt dan een TS2352/TS2493-fout.
  mockLogAiFailure: vi.fn(async (_tag: string, _err: unknown, _opts?: { supabase?: unknown }) => {}),
  mockAiFailureMiddleware: vi.fn(() => ({})),
  mockFrom: vi.fn(),
}))

vi.mock('@/lib/ai/ai-failure-middleware', () => ({
  logAiFailure: mockLogAiFailure,
  aiFailureMiddleware: mockAiFailureMiddleware,
}))
vi.mock('@/lib/supabase/service', () => ({ getServiceClient: () => ({ from: mockFrom }) }))

import { getModel, AIConfigError } from './config'
import { AI_ERROR_CODE } from './error-copy'

function appSettingsChain(rows: { key: string; value: string }[]) {
  return {
    select: () => ({
      in: async () => ({ data: rows, error: null }),
    }),
  }
}

const fakeSupabase = {} as never

beforeEach(() => {
  mockLogAiFailure.mockClear()
  mockAiFailureMiddleware.mockClear()
  mockFrom.mockReset()
  vi.stubEnv('ANTHROPIC_API_KEY', '')
  vi.stubEnv('OPENAI_API_KEY', '')
  vi.stubEnv('MISTRAL_API_KEY', '')
  vi.stubEnv('AI_PROVIDER', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getModel — ontbrekende API-sleutel', () => {
  it('throwt AIConfigError(ai_unavailable) en logt naar ai:config', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'app_settings') return appSettingsChain([])
      throw new Error(`onverwachte tabel: ${table}`)
    })

    await expect(getModel(fakeSupabase)).rejects.toThrow(AIConfigError)
    expect(mockLogAiFailure).toHaveBeenCalledTimes(1)

    const [tag, err, opts] = mockLogAiFailure.mock.calls[0] as [string, Error, { supabase: unknown }]
    expect(tag).toBe('ai:config')
    expect(err).toBeInstanceOf(Error)
    expect(opts.supabase).toBe(fakeSupabase)
  })

  it('de gethrowde AIConfigError draagt reason ai_unavailable (de veilige, client-neutrale klasse)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'app_settings') return appSettingsChain([])
      throw new Error(`onverwachte tabel: ${table}`)
    })

    let caught: unknown
    try {
      await getModel(fakeSupabase)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(AIConfigError)
    expect((caught as InstanceType<typeof AIConfigError>).reason).toBe(AI_ERROR_CODE.unavailable)
  })
})

describe('getModel — platform-kill-switch', () => {
  it('throwt AIConfigError(ai_disabled_platform) ZONDER te loggen — bewuste beheerdersactie, geen storing', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'app_settings') {
        return appSettingsChain([
          { key: 'platform_status', value: JSON.stringify({ killSwitches: { ai: false } }) },
        ])
      }
      throw new Error(`onverwachte tabel: ${table}`)
    })

    let caught: unknown
    try {
      await getModel(fakeSupabase)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(AIConfigError)
    expect((caught as InstanceType<typeof AIConfigError>).reason).toBe(AI_ERROR_CODE.disabledPlatform)
    expect(mockLogAiFailure).not.toHaveBeenCalled()
  })
})
