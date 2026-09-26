import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import type { ReactElement } from 'react'
import type { WealthGroup } from '@/lib/wealth-composition'
import { POT_RULES_DEFAULTS, potRulesToRaw } from '@/lib/pot-rules'
import type { RegelSimSnapshot, RegelSimOverride } from '@/lib/future/regel-sim'
import type { RegelEditActionsState } from './types'

/**
 * ADR 0179 fase 3 (§7.7) — de drie pot-regel-bodies dragen de verschilregel uit DEZELFDE
 * override-run als de wizard: `runRegelProjection(snapshot)` tegen
 * `runRegelProjection(snapshot, { potRules })`, met als concept precies wat Opslaan
 * wegschrijft. Zonder wijziging of zonder snapshot: geen regel en geen kernel-run.
 */

const runs = vi.hoisted(() => ({ overrides: [] as (RegelSimOverride | undefined)[] }))
vi.mock('@/lib/future/regel-sim', async (orig) => {
  const echt = await orig<typeof import('@/lib/future/regel-sim')>()
  return {
    ...echt,
    runRegelProjection: (_s: unknown, o?: RegelSimOverride) => {
      runs.overrides.push(o)
      // Concept 12 maanden eerder vrij dan de basis.
      return { rows: [], fireAgeFractional: o ? 51 : 52, reach: { kind: 'onbekend' } }
    },
  }
})

import { OnttrekkingsvolgordeBody } from './onttrekkingsvolgorde-body'
import { VerdelingToenameBody } from './verdeling-toename-body'
import { OnttrekkingAfnameBody } from './onttrekking-afname-body'

const BALANCES: Record<WealthGroup, number> = { spaargeld: 1, beleggingen: 1, pensioen: 1, vastgoed: 1, overig: 1 }
const SNAPSHOT = { rawContext: { yearlyExpenses: 30000 } } as unknown as RegelSimSnapshot

beforeEach(() => {
  runs.overrides = []
})

type Body = typeof OnttrekkingsvolgordeBody

function renderBody(Body: Body, snapshot: RegelSimSnapshot | null = SNAPSHOT) {
  let latest: RegelEditActionsState = { canSave: false, saving: false, save: () => {} }
  const el: ReactElement = (
    <Body
      simSnapshot={snapshot}
      potRules={POT_RULES_DEFAULTS}
      potBalances={BALANCES}
      onActionsChange={(s) => {
        latest = s
      }}
      onClose={() => {}}
      onSaved={() => {}}
    />
  )
  render(el)
  return { state: () => latest }
}

function footerTekst(state: RegelEditActionsState): string {
  const { container } = render(<>{state.footerInfo}</>)
  return container.textContent ?? ''
}

const card = (title: string) => screen.getByText(title).closest('button') as HTMLButtonElement

describe.each([
  ['Onttrekkingsvolgorde', OnttrekkingsvolgordeBody, 'Beleggingen achteraan', 'withdrawal_order_groups'],
  ['Onttrekking bij afname', OnttrekkingAfnameBody, 'Beleggingen achteraan', 'deficit_order_groups'],
  ['Verdeling bij toename', VerdelingToenameBody, 'Naar spaargeld', 'surplus_group'],
] as const)('%s — verschilregel', (_naam, Body, kaart, kolom) => {
  async function wijzig() {
    fireEvent.click(card(kaart))
    await act(async () => {})
  }

  it('zonder wijziging: geen regel en geen kernel-run', () => {
    const { state } = renderBody(Body as Body)
    expect(state().footerInfo).toBeUndefined()
    expect(runs.overrides).toHaveLength(0)
  })

  it('na een wijziging: basis tegen concept met alleen potRules, en de regel in de footer', async () => {
    const { state } = renderBody(Body as Body)
    await wijzig()
    expect(state().changed).toBe(true)
    const concept = runs.overrides.find((o) => o?.potRules)
    expect(runs.overrides).toContain(undefined)
    expect(Object.keys(concept!)).toEqual(['potRules'])
    expect(concept!.potRules).toHaveProperty(kolom)
    expect(concept!.potRules).not.toEqual(potRulesToRaw(POT_RULES_DEFAULTS))
    expect(footerTekst(state())).toContain('12 mnd eerder')
  })

  it('zonder snapshot: geen regel', async () => {
    const { state } = renderBody(Body as Body, null)
    await wijzig()
    expect(state().footerInfo).toBeUndefined()
    expect(runs.overrides).toHaveLength(0)
  })
})
