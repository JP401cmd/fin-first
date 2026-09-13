import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

/**
 * TPR-15 stap 5 inline. Gepind: de vier bestaande regel-bodies van Voorkeuren zijn hier
 * te kiezen; de gekozen body krijgt de context van de wizard (snapshot, pot-regels,
 * saldi) en het host-contract, en een save in de body sluit de wizard niet (onClose =
 * no-op) maar meldt onSaved.
 */

const ontvangen = vi.hoisted(() => ({ props: [] as Array<Record<string, unknown>> }))
vi.mock('@/components/future/regels', async () => {
  const React = await import('react')
  const nep = (naam: string) =>
    function NepBody(props: Record<string, unknown>) {
      ontvangen.props.push({ naam, ...props })
      return React.createElement(
        'button',
        {
          type: 'button',
          onClick: () => {
            ;(props.onClose as () => void)()
            ;(props.onSaved as () => void)()
          },
        },
        `Body ${naam}`,
      )
    }
  return {
    REGEL_BODIES: {
      eindstrategie: nep('eindstrategie'),
      onttrekkingsstrategie: nep('onttrekkingsstrategie'),
      onttrekkingsvolgorde: nep('onttrekkingsvolgorde'),
      'verdeling-toename': nep('verdeling-toename'),
      'onttrekking-afname': nep('onttrekking-afname'),
    },
  }
})

import { PottenEditor } from './potten-editor'

afterEach(() => {
  cleanup()
  ontvangen.props = []
})

const POT_RULES = { surplusGroup: 'beleggingen', withdrawalOrderGroups: [], deficitOrderGroups: [] }
const SALDI = { spaargeld: 1, beleggingen: 2, pensioen: 0, vastgoed: 0, overig: 0 }

function renderEditor() {
  const onSaved = vi.fn()
  const onActionsChange = vi.fn()
  render(
    <PottenEditor
      context={{ snapshot: null, firePlan: null, potRules: POT_RULES as never, potBalances: SALDI }}
      onActionsChange={onActionsChange}
      onSaved={onSaved}
    />,
  )
  return { onSaved, onActionsChange }
}

describe('PottenEditor (plan-review stap 5)', () => {
  it('opent op het onttrekkingsprofiel en geeft de wizard-context door', () => {
    const { onActionsChange } = renderEditor()
    expect(screen.getByRole('button', { name: 'Onttrekkingsstrategie' })).toHaveAttribute('aria-pressed', 'true')
    const laatste = ontvangen.props.at(-1)!
    expect(laatste.naam).toBe('onttrekkingsstrategie')
    expect(laatste.potRules).toBe(POT_RULES)
    expect(laatste.potBalances).toBe(SALDI)
    expect(laatste.onActionsChange).toBe(onActionsChange)
  })

  it('wisselt naar een andere bestaande regel-body', () => {
    renderEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Verdeling bij toename' }))
    expect(screen.getByRole('button', { name: 'Body verdeling-toename' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Verdeling bij toename' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('een save in de body meldt onSaved en sluit niets', () => {
    const { onSaved } = renderEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Body onttrekkingsstrategie' }))
    expect(onSaved).toHaveBeenCalledTimes(1)
  })
})
