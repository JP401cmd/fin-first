import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import type { RegelSimOverride, RegelSimSnapshot } from '@/lib/future/regel-sim'

/**
 * ADR 0179 fase 3 (§7.7) — de markt-sheets van katern Instellingen dragen de verschilregel
 * van hun body in de sheet-footer (`ModalFooter.info`), uit dezelfde override-run als de
 * wizard (laag 2): `parameters` met alleen de gewijzigde kolom(men).
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const runs = vi.hoisted(() => ({ overrides: [] as (RegelSimOverride | undefined)[] }))
vi.mock('@/lib/future/regel-sim', async (orig) => ({
  ...(await orig<typeof import('@/lib/future/regel-sim')>()),
  runRegelProjection: (_s: unknown, o?: RegelSimOverride) => {
    runs.overrides.push(o)
    return { rows: [], fireAgeFractional: o ? 53 : 52, reach: { kind: 'onbekend' } }
  },
}))

import { VoorkeurBewerkenSheet } from './voorkeur-bewerken-sheet'
import { Box3MethodeSheet } from './box3-methode-sheet'

const SNAPSHOT = { rawContext: { profile: {} } } as unknown as RegelSimSnapshot

beforeEach(() => {
  runs.overrides = []
})

const footer = () => document.body.textContent ?? ''

describe('verschilregel in de markt-sheets', () => {
  it('inflatie: na een wijziging "Vrijheid 12 mnd later" in de footer, uit parameters.inflation_rate', async () => {
    render(
      <VoorkeurBewerkenSheet title="Inflatie" column="inflation_rate" currentValuePct={2} snapshot={SNAPSHOT} onClose={() => {}} />,
    )
    expect(footer()).not.toContain('mnd later')
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3' } })
    await act(async () => {})
    expect(runs.overrides).toContainEqual({ parameters: { inflation_rate: 0.03 } })
    expect(footer()).toContain('12 mnd later')
  })

  it('Box 3: na een methodewissel de regel, uit parameters.box3_method', async () => {
    render(<Box3MethodeSheet current="forfaitair" snapshot={SNAPSHOT} onClose={() => {}} />)
    expect(footer()).not.toContain('mnd later')
    fireEvent.click(screen.getByRole('button', { name: /^Werkelijk rendement/ }))
    await act(async () => {})
    expect(runs.overrides.some((o) => o?.parameters?.box3_method === 'werkelijk')).toBe(true)
    expect(footer()).toContain('12 mnd later')
  })

  it('zonder snapshot: geen regel en geen kernel-run', async () => {
    render(<Box3MethodeSheet current="forfaitair" onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /^Werkelijk rendement/ }))
    await act(async () => {})
    expect(runs.overrides).toHaveLength(0)
    expect(footer()).not.toContain('mnd later')
  })
})
