import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { OnttrekkingsstrategieBody } from './onttrekkingsstrategie-body'
import type { RegelEditActionsState } from './types'

// Body leunt op /api/withdrawal-strategy (GET preselectie + PUT opslaan).
let putBody: Record<string, unknown> | null = null

beforeEach(() => {
  putBody = null
  global.fetch = vi.fn((url: unknown, opts?: { method?: string; body?: string }) => {
    if (opts?.method === 'PUT') {
      putBody = JSON.parse(opts.body ?? '{}')
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) })
    }
    // GET — nog geen profiel gekozen (bestaande static-gebruiker).
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          withdrawal_strategy: 'static',
          guardrail_floor: 0.8,
          guardrail_ceiling: 1.2,
          guardrail_cut_step: 0.1,
          guardrail_raise_step: 0.1,
          withdrawal_profile_config: null,
        }),
    })
  }) as unknown as typeof fetch
})

const flush = () => new Promise((r) => setTimeout(r, 10))

async function renderBody() {
  let latestSave: () => void = () => {}
  const onActionsChange = (s: RegelEditActionsState) => {
    latestSave = s.save
  }
  const utils = render(
    <OnttrekkingsstrategieBody
      simSnapshot={null}
      onActionsChange={onActionsChange}
      onClose={() => {}}
      onSaved={() => {}}
    />,
  )
  await flush()
  return { ...utils, getSave: () => latestSave }
}

describe('OnttrekkingsstrategieBody — opslaan-payload', () => {
  it('toont de vier profielen, niet vpw/bucket', async () => {
    const { getByText, queryByText } = await renderBody()
    expect(getByText('Vast')).toBeTruthy()
    expect(getByText('Afnemend')).toBeTruthy()
    expect(getByText('Oplopend')).toBeTruthy()
    expect(getByText('Guardrails')).toBeTruthy()
    expect(queryByText('VPW')).toBeNull()
    expect(queryByText('Bucket')).toBeNull()
  })

  it('Afnemend → enum static + profiel afnemend + curve in payload', async () => {
    const { getByText, getSave } = await renderBody()
    fireEvent.click(getByText('Afnemend').closest('button')!)
    await flush()
    getSave()()
    await flush()
    expect(putBody).toBeTruthy()
    expect(putBody!.withdrawal_strategy).toBe('static')
    const cfg = putBody!.withdrawal_profile_config as Record<string, unknown>
    expect(cfg.profiel).toBe('afnemend')
    // Curve-velden meegestuurd met Excel-defaults als startwaarde.
    expect(cfg.gogo_tot_leeftijd).toBe(75)
    expect(cfg.gogo_pct).toBe(100)
    expect(cfg.nogo_pct).toBe(70)
  })

  it('Guardrails → enum guardrails + profiel guardrails, geen curve', async () => {
    const { getByText, getSave } = await renderBody()
    fireEvent.click(getByText('Guardrails').closest('button')!)
    await flush()
    getSave()()
    await flush()
    expect(putBody!.withdrawal_strategy).toBe('guardrails')
    const cfg = putBody!.withdrawal_profile_config as Record<string, unknown>
    expect(cfg.profiel).toBe('guardrails')
    expect(cfg.gogo_pct).toBeUndefined()
  })
})
