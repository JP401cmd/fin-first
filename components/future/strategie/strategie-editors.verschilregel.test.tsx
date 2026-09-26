import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import type { RegelSimOverride, RegelSimSnapshot } from '@/lib/future/regel-sim'
import type { StrategieEditorsData } from './strategie-editors'

/**
 * ADR 0179 fase 3 (§7.7) — de levensstrategie-editors in katern Instellingen tonen het effect
 * als verschilregel in de footer, uit dezelfde kern-run als de wizard (`lifeEvent`-override
 * resp. `housingStrategyConfig`), niet meer via de losse `previewFireAge`-regel. De chrome is
 * `ShellOverlay kind="sheet"` (een dialog met de sticky footer).
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const runs = vi.hoisted(() => ({ overrides: [] as (RegelSimOverride | undefined)[] }))
vi.mock('@/lib/future/regel-sim', async (orig) => ({
  ...(await orig<typeof import('@/lib/future/regel-sim')>()),
  runRegelProjection: (_s: unknown, o?: RegelSimOverride) => {
    runs.overrides.push(o)
    return { rows: [], fireAgeFractional: o ? 51.5 : 52, reach: { kind: 'onbekend' } }
  },
}))
const preview = vi.hoisted(() => ({ n: 0 }))
vi.mock('@/lib/strategy-preview', async (orig) => ({
  ...(await orig<typeof import('@/lib/strategy-preview')>()),
  previewFireAge: () => {
    preview.n += 1
    return 52
  },
}))

import { StrategieEditors } from './strategie-editors'

const SNAPSHOT = { rawContext: { profile: {} } } as unknown as RegelSimSnapshot
const DATA = {
  baseline: { rawContext: {} },
  dailyExpenses: 80,
  aowRows: [],
  dateOfBirth: '1980-01-01',
  grossYearlyIncome: 60000,
  pensioenFactorA: 0,
  currentAge: 46,
  inflationRate: 0.02,
  currentNetMonthly: 3500,
  housingPreview: null,
} as unknown as StrategieEditorsData

beforeEach(() => {
  runs.overrides = []
  preview.n = 0
})

describe('StrategieEditors met snapshot — verschilregel', () => {
  it('AOW: na een wijziging de regel in de footer, uit een lifeEvent-override op type aow', async () => {
    render(<StrategieEditors open="aow" onClose={() => {}} events={[]} data={DATA} snapshot={SNAPSHOT} />)
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^Alleenstaand/ }))
    await act(async () => {})
    const concept = runs.overrides.find((o) => o?.lifeEvent)
    expect(concept?.lifeEvent?.vervang).toEqual({ eventType: 'aow' })
    expect(document.body.textContent).toContain('6 mnd eerder')
    expect(preview.n).toBe(0)
  })

  it('zonder snapshot: de oude preview-regel, geen kern-run', async () => {
    render(<StrategieEditors open="aow" onClose={() => {}} events={[]} data={DATA} />)
    fireEvent.click(screen.getByRole('button', { name: /^Alleenstaand/ }))
    await act(async () => {})
    expect(runs.overrides).toHaveLength(0)
  })
})
