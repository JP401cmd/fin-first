/**
 * Unit-tests voor normalizePensionFondsNaam + reconcilePensionPots
 * (lib/pension/reconcile.ts).
 *
 * Dekking:
 *  normalizePensionFondsNaam
 *   - strips " (deels indicatief)" suffix (case-insensitief)
 *   - strips losse juridische tokens (NV / N.V. / B.V. / BV / Mij / Mij.)
 *     maar NIET als ingebed in een langere token (bv. "BVG")
 *   - collapst meerdere spaties naar één
 *   - case-fold naar lowercase
 *   - lege / whitespace-only → ''
 *
 *  reconcilePensionPots
 *   - PRIMARY-match via metadata.mijnpensioenBron
 *   - FALLBACK-match via genormaliseerde event.name
 *   - suffix-flip: "ABP (deels indicatief)" matcht bestaande "ABP"
 *   - geen match → defaultAction 'add', match null
 *   - gemengde batch (match + geen match) → juiste per-entry acties
 *   - consumed-id-guard: twee potten die hetzelfde event zouden matchen →
 *     eerste 'update', tweede 'add'
 *   - alleen ouderdomspensioen-regelingen worden opgenomen
 *   - lege input → lege array
 *   - lege existing → alle 'add'
 */

import { describe, it, expect } from 'vitest'
import { normalizePensionFondsNaam, reconcilePensionPots } from '@/lib/pension/reconcile'
import type { Regeling, PensionReconcileEntry } from '@/lib/pension/reconcile'
import type { LifeEvent } from '@/lib/horizon-data'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRegeling(overrides: Partial<Regeling> = {}): Regeling {
  return {
    fondsNaam: 'ABP',
    brutoBedrag: 800,
    ingangLeeftijd: 67,
    isGeindexeerd: true,
    type: 'ouderdomspensioen',
    ...overrides,
  }
}

function makePensionEvent(overrides: Partial<LifeEvent> & { metadata?: Record<string, unknown> } = {}): LifeEvent {
  return {
    id: 'event-1',
    name: 'ABP',
    event_type: 'pension',
    target_age: 67,
    target_date: null,
    one_time_cost: 0,
    monthly_cost_change: 0,
    monthly_income_change: 800,
    duration_months: 0,
    icon: 'Landmark',
    is_active: true,
    sort_order: 1,
    is_indexed: true,
    ...overrides,
  }
}

// ── normalizePensionFondsNaam ─────────────────────────────────────────────────

describe('normalizePensionFondsNaam', () => {
  describe('suffix " (deels indicatief)" verwijderen', () => {
    it('verwijdert de standaard suffix', () => {
      expect(normalizePensionFondsNaam('ABP (deels indicatief)')).toBe('abp')
    })

    it('verwijdert de suffix case-insensitief', () => {
      expect(normalizePensionFondsNaam('ABP (DEELS INDICATIEF)')).toBe('abp')
    })

    it('verwijdert de suffix ook met extra spaties ervoor', () => {
      expect(normalizePensionFondsNaam('ABP  (deels indicatief)')).toBe('abp')
    })

    it('naam zonder suffix blijft intact', () => {
      expect(normalizePensionFondsNaam('ABP')).toBe('abp')
    })
  })

  describe('losse juridische tokens verwijderen', () => {
    it('verwijdert standalone "NV" achteraan', () => {
      expect(normalizePensionFondsNaam('Pensioenfonds NV')).toBe('pensioenfonds')
    })

    it('verwijdert standalone "N.V."', () => {
      expect(normalizePensionFondsNaam('Pensioenfonds N.V.')).toBe('pensioenfonds')
    })

    it('verwijdert standalone "B.V."', () => {
      expect(normalizePensionFondsNaam('Beheer B.V.')).toBe('beheer')
    })

    it('verwijdert standalone "BV"', () => {
      expect(normalizePensionFondsNaam('Bouw BV')).toBe('bouw')
    })

    it('verwijdert standalone "Mij"', () => {
      expect(normalizePensionFondsNaam('Delta Lloyd Mij')).toBe('delta lloyd')
    })

    it('verwijdert standalone "Mij."', () => {
      expect(normalizePensionFondsNaam('Delta Lloyd Mij.')).toBe('delta lloyd')
    })

    it('verwijdert GEEN ingebed token: "BVG" blijft intact', () => {
      // "BVG" begint met "BV" maar is geen standalone token
      expect(normalizePensionFondsNaam('BVG Pensioen')).toBe('bvg pensioen')
    })

    it('verwijdert GEEN ingebed token: een naam die "NV" bevat als deel van een woord', () => {
      // "PNVF" of soortgelijk — voor de zekerheid een duidelijk geval
      // We testen met "Universeel" want dat eindigt niet op standalone NV
      expect(normalizePensionFondsNaam('Universeel Pensioen')).toBe('universeel pensioen')
    })
  })

  describe('whitespace-collapse en case-fold', () => {
    it('collapst meerdere spaties naar één', () => {
      expect(normalizePensionFondsNaam('ABP   Pensioen')).toBe('abp pensioen')
    })

    it('converteert naar lowercase', () => {
      expect(normalizePensionFondsNaam('DELTA LLOYD')).toBe('delta lloyd')
    })

    it('trimt leading/trailing whitespace', () => {
      expect(normalizePensionFondsNaam('  ABP  ')).toBe('abp')
    })
  })

  describe('lege/whitespace-only input', () => {
    it('lege string → ""', () => {
      expect(normalizePensionFondsNaam('')).toBe('')
    })

    it('alleen spaties → ""', () => {
      expect(normalizePensionFondsNaam('   ')).toBe('')
    })
  })

  describe('gecombineerde gevallen', () => {
    it('suffix + legal token worden beide verwijderd', () => {
      // Bijv. "ABP N.V. (deels indicatief)" → "abp"
      expect(normalizePensionFondsNaam('ABP N.V. (deels indicatief)')).toBe('abp')
    })

    it('suffix-flip: "ABP (deels indicatief)" normaliseert gelijk aan "ABP"', () => {
      const a = normalizePensionFondsNaam('ABP (deels indicatief)')
      const b = normalizePensionFondsNaam('ABP')
      expect(a).toBe(b)
    })
  })
})

// ── reconcilePensionPots ──────────────────────────────────────────────────────

describe('reconcilePensionPots', () => {
  describe('PRIMARY-match via metadata.mijnpensioenBron', () => {
    it('match via mijnpensioenBron → defaultAction update, match ingevuld', () => {
      const regeling = makeRegeling({ fondsNaam: 'ABP' })
      const event = makePensionEvent({
        id: 'ev-1',
        name: 'Mijn ABP',
        metadata: { mijnpensioenBron: 'abp' },
      })

      const entries = reconcilePensionPots([regeling], [event])

      expect(entries).toHaveLength(1)
      expect(entries[0].defaultAction).toBe('update')
      expect(entries[0].match).toBe(event)
    })

    it('PRIMARY-match is precies — andere bron match NIET via PRIMARY', () => {
      const regeling = makeRegeling({ fondsNaam: 'ABP' })
      const event = makePensionEvent({
        metadata: { mijnpensioenBron: 'bpf bouw' }, // andere bron
      })

      const entries = reconcilePensionPots([regeling], [event])
      // Geen PRIMARY-match; FALLBACK via event.name = "ABP" → normalizes to "abp" → match
      // event.name = 'ABP' (default uit makeEvent), dus FALLBACK vindt het
      expect(entries[0].match).toBeTruthy()
    })
  })

  describe('FALLBACK-match via genormaliseerde event.name', () => {
    it('event zonder mijnpensioenBron maar met gelijke genormaliseerde naam → update', () => {
      const regeling = makeRegeling({ fondsNaam: 'ABP (deels indicatief)' })
      const event = makePensionEvent({
        id: 'ev-abp',
        name: 'ABP',
        metadata: {}, // geen mijnpensioenBron
      })

      const entries = reconcilePensionPots([regeling], [event])

      expect(entries).toHaveLength(1)
      expect(entries[0].defaultAction).toBe('update')
      expect(entries[0].match).toBe(event)
    })

    it('suffix-flip: "ABP (deels indicatief)" matcht bestaand event genaamd "ABP"', () => {
      const regeling = makeRegeling({ fondsNaam: 'ABP (deels indicatief)' })
      const event = makePensionEvent({ id: 'ev-abp', name: 'ABP', metadata: {} })

      const entries = reconcilePensionPots([regeling], [event])
      expect(entries[0].defaultAction).toBe('update')
      expect(entries[0].match?.id).toBe('ev-abp')
    })
  })

  describe('geen match → add', () => {
    it('geen enkel bestaand event → defaultAction add, match null', () => {
      const regeling = makeRegeling({ fondsNaam: 'Onbekend Fonds' })
      const entries = reconcilePensionPots([regeling], [])

      expect(entries).toHaveLength(1)
      expect(entries[0].defaultAction).toBe('add')
      expect(entries[0].match).toBeNull()
    })

    it('bestaand event heeft andere naam én geen mijnpensioenBron → add', () => {
      const regeling = makeRegeling({ fondsNaam: 'BPF Bouw' })
      const event = makePensionEvent({ name: 'Delta Lloyd', metadata: {} })

      const entries = reconcilePensionPots([regeling], [event])
      expect(entries[0].defaultAction).toBe('add')
      expect(entries[0].match).toBeNull()
    })
  })

  describe('gemengde batch', () => {
    it('twee potten: één match, één nieuw → correcte per-entry acties', () => {
      const regelingen = [
        makeRegeling({ fondsNaam: 'ABP', brutoBedrag: 800 }),
        makeRegeling({ fondsNaam: 'Nieuw Fonds', brutoBedrag: 200 }),
      ]
      const event = makePensionEvent({ id: 'ev-abp', name: 'ABP', metadata: {} })

      const entries = reconcilePensionPots(regelingen, [event])

      expect(entries).toHaveLength(2)
      expect(entries[0].defaultAction).toBe('update')
      expect(entries[0].match?.id).toBe('ev-abp')
      expect(entries[1].defaultAction).toBe('add')
      expect(entries[1].match).toBeNull()
    })
  })

  describe('consumed-id-guard', () => {
    it('twee potten die hetzelfde event zouden matchen → eerste update, tweede add', () => {
      // Beide incoming fondsNamen normaliseren naar "abp"
      const regelingen = [
        makeRegeling({ fondsNaam: 'ABP', brutoBedrag: 800 }),
        makeRegeling({ fondsNaam: 'ABP (deels indicatief)', brutoBedrag: 850 }),
      ]
      const event = makePensionEvent({
        id: 'ev-abp',
        name: 'ABP',
        metadata: { mijnpensioenBron: 'abp' },
      })

      const entries = reconcilePensionPots(regelingen, [event])

      expect(entries).toHaveLength(2)
      expect(entries[0].defaultAction).toBe('update')
      expect(entries[0].match?.id).toBe('ev-abp')
      // Tweede pot: event al geconsumeerd → add
      expect(entries[1].defaultAction).toBe('add')
      expect(entries[1].match).toBeNull()
    })
  })

  describe('filter: alleen ouderdomspensioen', () => {
    it('nabestaandenpensioen regeling wordt NIET opgenomen in entries', () => {
      const regelingen: Regeling[] = [
        makeRegeling({ fondsNaam: 'ABP', type: 'ouderdomspensioen' }),
        makeRegeling({ fondsNaam: 'Weduwe fonds', type: 'nabestaandenpensioen' }),
      ]

      const entries = reconcilePensionPots(regelingen, [])
      expect(entries).toHaveLength(1)
      expect(entries[0].regeling.fondsNaam).toBe('ABP')
    })

    it('alleen nabestaandenpensioen in lijst → lege entries', () => {
      const regelingen: Regeling[] = [
        makeRegeling({ type: 'nabestaandenpensioen' }),
      ]
      const entries = reconcilePensionPots(regelingen, [])
      expect(entries).toHaveLength(0)
    })
  })

  describe('lege input', () => {
    it('lege regelingen → lege entries', () => {
      const entries = reconcilePensionPots([], [])
      expect(entries).toHaveLength(0)
    })

    it('lege regelingen met bestaande events → lege entries', () => {
      const event = makePensionEvent()
      const entries = reconcilePensionPots([], [event])
      expect(entries).toHaveLength(0)
    })

    it('lege existing events → alle potten als add', () => {
      const regelingen = [
        makeRegeling({ fondsNaam: 'ABP' }),
        makeRegeling({ fondsNaam: 'BPF Bouw' }),
      ]
      const entries: PensionReconcileEntry[] = reconcilePensionPots(regelingen, [])
      expect(entries).toHaveLength(2)
      expect(entries.every((e) => e.defaultAction === 'add')).toBe(true)
    })
  })

  describe('non-pension events worden genegeerd', () => {
    it('bestaand aow-event telt NIET mee als match (event_type filteren)', () => {
      const regeling = makeRegeling({ fondsNaam: 'AOW' })
      const aowEvent = makePensionEvent({
        id: 'ev-aow',
        name: 'AOW',
        event_type: 'aow', // niet 'pension'!
        metadata: {},
      })

      const entries = reconcilePensionPots([regeling], [aowEvent])
      // aow-event telt niet als pension-event → geen match
      expect(entries[0].defaultAction).toBe('add')
      expect(entries[0].match).toBeNull()
    })
  })

  describe('regeling-referentie behouden', () => {
    it('entries[i].regeling is hetzelfde object als de invoer', () => {
      const regeling = makeRegeling({ fondsNaam: 'ABP' })
      const entries = reconcilePensionPots([regeling], [])
      expect(entries[0].regeling).toBe(regeling)
    })
  })
})
