import { describe, it, expect } from 'vitest'
import { selectLabDoelenBuitenPlan } from './lab-doelen-buiten-plan'

describe('selectLabDoelenBuitenPlan — telt alleen lab-doelen die n.v.t. zijn (spec §4.2)', () => {
  it('lab-doel met n.v.t.-reden telt; knop-doel zonder reden en handmatig doel met reden tellen niet', () => {
    const goals = [
      { id: 'a', metadata: { bron: 'parameter' }, notApplicableReason: 'Je stopmoment ligt vast…' },
      { id: 'b', metadata: { bron: 'parameter' }, notApplicableReason: null },
      { id: 'c', metadata: {}, notApplicableReason: 'vrijheidsgetal n.v.t.' },
      { id: 'd', metadata: { bron: 'parameter' } },
    ]
    expect(selectLabDoelenBuitenPlan(goals).map((g) => g.id)).toEqual(['a'])
  })
})
