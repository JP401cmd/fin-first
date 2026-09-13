import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OnttrekkingBlock } from './persoonlijk-plan-blocks'
import type { PersoonlijkPlanOnttrekking } from '@/lib/persoonlijk-plan-data'
import { WITHDRAWAL_LABELS } from '@/lib/persoonlijk-plan-data'

/**
 * Regressieslot B-042 (weergave-kant): de SWR-/4%-duiding in het
 * Onttrekkingsstrategie-blok hoort ALLEEN bij het vaste profiel. Vóór B-042 kende
 * het contract alleen de enum (static/guardrails) en verscheen die tekst dus ook
 * bij een afnemend/oplopend plan.
 */
function data(type: PersoonlijkPlanOnttrekking['type']): PersoonlijkPlanOnttrekking {
  return {
    type,
    typeLabel: WITHDRAWAL_LABELS[type].name,
    typeSubtitle: WITHDRAWAL_LABELS[type].subtitle,
    guardrailFloor: 0.8,
    guardrailCeiling: 1.2,
    guardrailCutStep: 0.1,
  }
}

describe('OnttrekkingBlock — SWR-tekst alleen bij het vaste profiel (B-042)', () => {
  it('vast → label + de 4%-regel-duiding', () => {
    render(<OnttrekkingBlock data={data('vast')} />)
    expect(screen.getByText('Vaste onttrekking (SWR)')).toBeTruthy()
    expect(screen.getByText(/in NL\s+door Box 3 lager/i)).toBeTruthy()
  })

  it('afnemend → Afnemend-label, géén 4%-regel-duiding en géén guardrail-parameters', () => {
    render(<OnttrekkingBlock data={data('afnemend')} />)
    expect(screen.getByText(/Afnemende onttrekking/)).toBeTruthy()
    expect(screen.queryByText(/in NL\s+door Box 3 lager/i)).toBeNull()
    expect(screen.queryByText(/Floor \(ondergrens\)/)).toBeNull()
  })

  it('oplopend → Oplopend-label zonder SWR-duiding', () => {
    render(<OnttrekkingBlock data={data('oplopend')} />)
    expect(screen.getByText(/Oplopende onttrekking/)).toBeTruthy()
    expect(screen.queryByText(/in NL\s+door Box 3 lager/i)).toBeNull()
  })

  it('guardrails → de vier guardrail-parameters, geen SWR-duiding', () => {
    render(<OnttrekkingBlock data={data('guardrails')} />)
    expect(screen.getByText(/Floor \(ondergrens\)/)).toBeTruthy()
    expect(screen.queryByText(/in NL\s+door Box 3 lager/i)).toBeNull()
  })
})
