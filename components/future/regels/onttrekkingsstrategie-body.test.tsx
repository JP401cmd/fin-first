import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { OnttrekkingsstrategieBody } from './onttrekkingsstrategie-body'
import type { RegelEditActionsState } from './types'
import type { RegelSimSnapshot } from '@/lib/future/regel-sim'
import { EXCEL_FASE_CURVE } from '@/lib/horizon-kernel/adapter/defaults'

// De live-sim-draft moet de VOLLEDIGE withdrawal_profile_config dragen (profiel +
// 3-fasen-curve), niet alleen de enum: anders beweegt de FIRE-delta-footer niet mee
// met de fasen. We mocken de kernel-aanroep en inspecteren de meegegeven override.
const { runRegelProjection } = vi.hoisted(() => ({
  runRegelProjection: vi.fn((_snapshot: unknown, _override?: unknown) => ({
    rows: [],
    fireAgeFractional: null,
  })),
}))
vi.mock('@/lib/future/regel-sim', () => ({ runRegelProjection }))

// Body leunt op /api/withdrawal-strategy (GET preselectie + PUT opslaan).
let putBody: Record<string, unknown> | null = null

beforeEach(() => {
  putBody = null
  runRegelProjection.mockClear()
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

async function renderBody(simSnapshot: RegelSimSnapshot | null = null) {
  let latestSave: () => void = () => {}
  const onActionsChange = (s: RegelEditActionsState) => {
    latestSave = s.save
  }
  const utils = render(
    <OnttrekkingsstrategieBody
      simSnapshot={simSnapshot}
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
    // Curve-velden meegestuurd met de kernel-defaults als startwaarde (single source).
    expect(cfg.gogo_tot_leeftijd).toBe(EXCEL_FASE_CURVE.fase1TotLeeftijd)
    expect(cfg.gogo_pct).toBe(EXCEL_FASE_CURVE.factor1Pct)
    expect(cfg.nogo_pct).toBe(EXCEL_FASE_CURVE.factor3Pct)
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

describe('OnttrekkingsstrategieBody — live-sim-draft', () => {
  // Alleen de vorm telt: de body geeft de snapshot ongelezen door aan de (gemockte) kernel.
  const SNAPSHOT = { rawContext: {} } as unknown as RegelSimSnapshot

  /** De laatste draft-run (= de aanroep MET override); de baseline draait zonder. */
  function laatsteDraftConfig(): Record<string, unknown> | undefined {
    const drafts = runRegelProjection.mock.calls.filter((c) => c[1] !== undefined)
    const laatste = drafts.at(-1)?.[1] as { withdrawalProfileConfig?: unknown } | undefined
    return laatste?.withdrawalProfileConfig as Record<string, unknown> | undefined
  }

  it('baseline draait zonder override (blijft de opgeslagen waarheid)', async () => {
    await renderBody(SNAPSHOT)
    expect(runRegelProjection.mock.calls.some((c) => c[1] === undefined)).toBe(true)
  })

  it('Afnemend + gewijzigde no-go-factor bereiken de draft-projectie', async () => {
    const { getByText, getByLabelText } = await renderBody(SNAPSHOT)
    fireEvent.click(getByText('Afnemend').closest('button')!)
    fireEvent.change(getByLabelText(/No-go factor/), { target: { value: '55' } })
    // Debounce (200 ms) afwachten zodat de draft-run met de nieuwe curve draait.
    await new Promise((r) => setTimeout(r, 320))

    const cfg = laatsteDraftConfig()
    expect(cfg).toBeTruthy()
    expect(cfg!.profiel).toBe('afnemend')
    expect(cfg!.nogo_pct).toBe(55)
    // Ongewijzigde fasen komen mee met hun startwaarde, en die MOET de kernel-default
    // zijn: de draft stuurt de curve nu expliciet mee terwijl de baseline hem per veld
    // uit EXCEL_FASE_CURVE vult. Zou de editor een eigen kopie van die getallen houden,
    // dan toonde de preview een delta die de gebruiker nooit heeft ingesteld.
    expect(cfg!.gogo_tot_leeftijd).toBe(EXCEL_FASE_CURVE.fase1TotLeeftijd)
    expect(cfg!.slowgo_pct).toBe(EXCEL_FASE_CURVE.factor2Pct)
    expect(cfg!.gogo_pct).toBe(EXCEL_FASE_CURVE.factor1Pct)
    expect(cfg!.slowgo_tot_leeftijd).toBe(EXCEL_FASE_CURVE.fase2TotLeeftijd)
  })

  it('Vast stuurt geen curve mee (kern gebruikt factor 1)', async () => {
    const { getByText } = await renderBody(SNAPSHOT)
    fireEvent.click(getByText('Vast').closest('button')!)
    await new Promise((r) => setTimeout(r, 320))

    const cfg = laatsteDraftConfig()
    expect(cfg!.profiel).toBe('vast')
    expect(cfg!.gogo_pct).toBeUndefined()
    expect(cfg!.flex_nice_only).toBeUndefined()
  })
})
