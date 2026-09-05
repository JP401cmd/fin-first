import { describe, it, expect } from 'vitest'
import { loadRondleidingSeed, withRondleidingPending } from './seed'

/**
 * lib/rondleiding/seed — de server-seed en de merge-helper (ADR 0130).
 *
 * De bepalende keuze hier is de FAIL-SAFE RICHTING: bij twijfel `seen: true`.
 * Een rondleiding die niet start is een gemis; eentje die bij een bestaande
 * gebruiker uit het niets over het scherm valt is een defect. Daarnaast bewaakt
 * deze suite dat `withRondleidingPending` de rest van `module_guide_state`
 * intact laat — die map draagt óók de welkomstgids, de coachmarks en de
 * coach-staat.
 */

describe('loadRondleidingSeed', () => {
  it('een net geonboarde gebruiker heeft de rondleiding tegoed', () => {
    expect(loadRondleidingSeed({ 'rondleiding:pending': { since: '2026-09-05T10:00:00.000Z' } }))
      .toEqual({ pending: true, seen: false })
  })

  it('een afgelopen rondleiding telt als gezien, ongeacht de uitkomst', () => {
    expect(
      loadRondleidingSeed({
        'rondleiding:pending': { since: '2026-09-05T10:00:00.000Z' },
        'coachmark:overzicht-rondleiding': { dismissedAt: '2026-09-05T10:02:00.000Z', outcome: 'overgeslagen' },
      }),
    ).toEqual({ pending: true, seen: true })
  })

  it('een bestaande gebruiker zonder vlaggen krijgt niets te zien', () => {
    expect(loadRondleidingSeed({ 'welcome:guide': { status: 'active' } }))
      .toEqual({ pending: false, seen: false })
  })

  it('een lege map is geldig: geen pending, niet gezien', () => {
    expect(loadRondleidingSeed({})).toEqual({ pending: false, seen: false })
  })

  it('valt bij een ontbrekende of corrupte kolom terug op "niets tonen"', () => {
    for (const raw of [null, undefined, 'kapot', 42, ['rondleiding:pending']]) {
      expect(loadRondleidingSeed(raw), String(raw)).toEqual({ pending: false, seen: true })
    }
  })
})

describe('withRondleidingPending', () => {
  it('zet de vlag met een ISO-tijdstip', () => {
    const now = new Date('2026-09-05T12:00:00.000Z')
    expect(withRondleidingPending({}, now)).toEqual({
      'rondleiding:pending': { since: '2026-09-05T12:00:00.000Z' },
    })
  })

  it('bewaart ALLE bestaande sleutels (welkomstgids, coachmarks, coach-staat)', () => {
    const bestaand = {
      'welcome:guide': { status: 'active', completedStepIds: ['s1'] },
      'coachmark:euro-view': { dismissedAt: '2026-08-01T00:00:00.000Z' },
      'coach:state': { dismissed: ['gap_bank'], lastDismissedAt: null, guideLastShownAt: null },
    }
    const next = withRondleidingPending(bestaand, new Date('2026-09-05T12:00:00.000Z'))
    expect(next['welcome:guide']).toEqual(bestaand['welcome:guide'])
    expect(next['coachmark:euro-view']).toEqual(bestaand['coachmark:euro-view'])
    expect(next['coach:state']).toEqual(bestaand['coach:state'])
    expect(next['rondleiding:pending']).toEqual({ since: '2026-09-05T12:00:00.000Z' })
    // De bron blijft ongemoeid — de routes hergebruiken 'm niet, maar een stille
    // mutatie is precies het soort fout dat pas maanden later opvalt.
    expect(bestaand).not.toHaveProperty('rondleiding:pending')
  })

  it('start bij een corrupte of ontbrekende kolom met een lege map', () => {
    const now = new Date('2026-09-05T12:00:00.000Z')
    for (const raw of [null, undefined, 'kapot', ['x']]) {
      expect(withRondleidingPending(raw, now)).toEqual({
        'rondleiding:pending': { since: '2026-09-05T12:00:00.000Z' },
      })
    }
  })

  it('overschrijft een oudere pending-vlag met het nieuwe moment (her-onboarding)', () => {
    const next = withRondleidingPending(
      { 'rondleiding:pending': { since: '2026-01-01T00:00:00.000Z' } },
      new Date('2026-09-05T12:00:00.000Z'),
    )
    expect(next['rondleiding:pending']).toEqual({ since: '2026-09-05T12:00:00.000Z' })
  })
})
