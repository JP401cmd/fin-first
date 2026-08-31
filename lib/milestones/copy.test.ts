import { describe, it, expect } from 'vitest'
import { buildMilestoneCopy } from './copy'
import { calculateFreedomTime, formatCurrency, formatFreedomTimeString } from '@/lib/format'
import type { AchievedMilestoneRow, MilestoneKind } from './types'

function row(kind: MilestoneKind, over: Partial<AchievedMilestoneRow> = {}): AchievedMilestoneRow {
  return {
    id: 'm1',
    user_id: 'u1',
    milestone_key: 'x',
    kind,
    threshold_value: null,
    observed_value: null,
    achieved_at: '2026-08-31T10:00:00.000Z',
    acknowledged_at: null,
    source: 'detect',
    ...over,
  }
}

/**
 * Emoji-detectie: pictogrammen, dingbats, variantselector en de vlaggen-range.
 * `lib/freedom-milestones.ts` draagt nog "🎉 "-teksten uit een eerdere
 * generatie — die stijl mag hier niet binnenlekken.
 */
const EMOJI =
  /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u

/** Werkwoorden die van een constatering een aanbeveling maken (Wft-grens). */
const ADVIES = [
  'overweeg',
  'zou je',
  'raden we',
  'aanrader',
  'moet je',
  'ga nu',
  'zorg dat',
  'advies',
  'tip:',
  'kun je het beste',
  'we adviseren',
]

const ALL_ROWS: AchievedMilestoneRow[] = [
  row('vermogen', { milestone_key: 'vermogen-10k', threshold_value: 10_000, observed_value: 11_000 }),
  row('vermogen', { milestone_key: 'vermogen-1m', threshold_value: 1_000_000, observed_value: 1_010_000 }),
  row('vrijheid', { milestone_key: 'vrijheid-25', threshold_value: 25, observed_value: 26 }),
  row('vrijheid', { milestone_key: 'vrijheid-50', threshold_value: 50, observed_value: 50 }),
  row('vrijheid', { milestone_key: 'vrijheid-75', threshold_value: 75, observed_value: 80 }),
  row('vrijheid', { milestone_key: 'vrijheid-100', threshold_value: 100, observed_value: 100 }),
  row('schuldenvrij', { milestone_key: 'schuldenvrij', threshold_value: 0, observed_value: 0 }),
  row('noodfonds', { milestone_key: 'noodfonds-gevuld', threshold_value: 3, observed_value: 6 }),
  row('doel', { milestone_key: 'doel-behaald:abc' }),
]

describe('buildMilestoneCopy — toon', () => {
  it.each([null, 0, 95] as (number | null)[])(
    'draagt geen emoji, uitroepteken of adviestaal (dagtarief %s)',
    (rate) => {
      for (const r of ALL_ROWS) {
        const { titel, betekenis } = buildMilestoneCopy(r, rate)
        const tekst = `${titel} ${betekenis}`
        expect(tekst, `emoji in "${tekst}"`).not.toMatch(EMOJI)
        expect(tekst, `uitroepteken in "${tekst}"`).not.toContain('!')
        for (const woord of ADVIES) {
          expect(tekst.toLowerCase(), `adviestaal "${woord}" in "${tekst}"`).not.toContain(woord)
        }
        expect(titel.length).toBeGreaterThan(0)
        expect(betekenis.length).toBeGreaterThan(0)
      }
    },
  )

  it('sluit elke betekenis af als hele zin', () => {
    for (const r of ALL_ROWS) {
      expect(buildMilestoneCopy(r, 95).betekenis.endsWith('.')).toBe(true)
    }
  })
})

describe('buildMilestoneCopy — vermogen draagt de vrijheidstijd-vertaling', () => {
  it('vertaalt het bedrag naar tijd via calculateFreedomTime', () => {
    const r = row('vermogen', {
      milestone_key: 'vermogen-100k',
      threshold_value: 100_000,
      observed_value: 104_000,
    })
    const copy = buildMilestoneCopy(r, 100)

    // Consume, don't recompute: het verwachte antwoord komt uit dezelfde
    // canonieke helper, niet uit een met de hand nagerekende string.
    const verwacht = formatFreedomTimeString(calculateFreedomTime(100_000, 100))
    expect(verwacht).toBe('2 jaar en 9 maanden')
    expect(copy.titel).toContain('100.000')
    expect(copy.betekenis).toContain(verwacht)
    expect(copy.betekenis).toContain('vrijheid')
  })

  it('toetst op de DREMPEL, niet op de waargenomen waarde — de mijlpaal is de drempel', () => {
    const r = row('vermogen', {
      threshold_value: 100_000,
      observed_value: 137_777,
    })
    const copy = buildMilestoneCopy(r, 100)
    expect(copy.titel).toContain('100.000')
    expect(copy.titel).not.toContain('137')
  })

  it('valt terug op een feitelijke duiding zonder geloofwaardig dagtarief', () => {
    const r = row('vermogen', { threshold_value: 50_000, observed_value: 51_000 })
    // formatCurrency levert nl-NL met een harde spatie; nooit met de hand
    // natypen — dan test je je eigen toetsenbord.
    const verwacht = `Je netto vermogen passeerde ${formatCurrency(50_000)}.`
    expect(buildMilestoneCopy(r, null).betekenis).toBe(verwacht)
    expect(buildMilestoneCopy(r, 0).betekenis).toBe(verwacht)
    // Onder de geloofwaardigheidsvloer (€100/mnd ≈ €3,29/dag) — geen
    // "13.000 jaar vrijheid" presenteren.
    expect(buildMilestoneCopy(r, 0.01).betekenis).toBe(verwacht)
  })
})

describe('buildMilestoneCopy — eenheden per soort', () => {
  it('vrijheid spreekt in procenten, nooit in euro of tijd', () => {
    const copy = buildMilestoneCopy(
      row('vrijheid', { threshold_value: 50, observed_value: 51 }),
      100,
    )
    expect(copy.titel).toBe('Halverwege je vrijheid')
    expect(copy.betekenis).toBe('Je vermogen dekt 50% van je vrijheidsdoel.')
    expect(copy.betekenis).not.toContain('€')
  })

  it('100% vrijheid krijgt een eigen zin', () => {
    const copy = buildMilestoneCopy(row('vrijheid', { threshold_value: 100 }), 100)
    expect(copy.titel).toBe('Volledige vrijheid bereikt')
    expect(copy.betekenis).toBe('Je vermogen dekt je vrijheidsdoel volledig.')
  })

  it('noodfonds spreekt in MAANDEN — de maanden mogen nooit als bedrag lezen', () => {
    const copy = buildMilestoneCopy(
      row('noodfonds', { threshold_value: 3, observed_value: 6 }),
      100,
    )
    expect(copy.titel).toBe('Noodfonds gevuld')
    expect(copy.betekenis).toContain('6 maanden')
    expect(copy.betekenis).toContain('3 maanden')
    // 6 maanden als €6 door de vrijheidstijd halen zou "0 dagen" opleveren;
    // een euroteken hier is per definitie een eenheidsfout.
    expect(copy.betekenis).not.toContain('€')
  })

  it('schuldenvrij constateert, meer niet', () => {
    const copy = buildMilestoneCopy(row('schuldenvrij', { threshold_value: 0 }), 100)
    expect(copy).toEqual({
      titel: 'Schuldenvrij',
      betekenis: 'Er staan geen schulden meer open.',
    })
  })

  it('doel krijgt neutrale copy — het doelen-scherm doet de viering', () => {
    const copy = buildMilestoneCopy(row('doel', { milestone_key: 'doel-behaald:g1' }), 100)
    expect(copy.titel).toBe('Doel behaald')
  })
})

describe('buildMilestoneCopy — onbekende soort', () => {
  it('crasht niet op een rij met een onbekend soort', () => {
    const raar = { ...row('vermogen'), kind: 'iets-nieuws' as unknown as MilestoneKind }
    const copy = buildMilestoneCopy(raar, 100)
    expect(copy.titel).toBe('Mijlpaal bereikt')
    expect(copy.betekenis.length).toBeGreaterThan(0)
  })
})

describe('doel-checkpoints (plan 3c)', () => {
  it('benoemt het gepasseerde stuk met de doelnaam uit de context', () => {
    const copy = buildMilestoneCopy(
      row('doel', { milestone_key: 'doel-checkpoint:g1:50', threshold_value: 50, observed_value: 53 }),
      null,
      { goalName: 'Wereldreis' },
    )
    expect(copy.titel).toBe('De helft van "Wereldreis"')
    expect(copy.betekenis).toContain('50%')
    expect(copy.betekenis).toContain('Wereldreis')
  })

  it('blijft generiek zonder doelnaam', () => {
    const copy = buildMilestoneCopy(
      row('doel', { milestone_key: 'doel-checkpoint:g1:25', threshold_value: 25 }),
      null,
    )
    expect(copy.titel).toBe('Een kwart van je doel')
    expect(copy.betekenis).toContain('langetermijndoel')
  })

  it('doel-behaald draagt de naam mee wanneer die er is', () => {
    const copy = buildMilestoneCopy(
      row('doel', { milestone_key: 'doel-behaald:g1' }),
      null,
      { goalName: 'Noodfonds' },
    )
    expect(copy.titel).toBe('Doel behaald: "Noodfonds"')
  })
})
