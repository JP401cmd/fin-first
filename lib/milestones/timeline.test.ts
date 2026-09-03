import { describe, it, expect } from 'vitest'
import {
  buildMilestoneTimeline,
  isSecondaryMilestone,
  resolveMilestoneGoalName,
  type MilestoneGoalRef,
} from './timeline'
import { buildMilestoneCopy } from './copy'
import type { AchievedMilestoneRow } from './types'

const USER = 'user-1'

function row(over: Partial<AchievedMilestoneRow> = {}): AchievedMilestoneRow {
  return {
    id: over.milestone_key ?? 'id-1',
    user_id: USER,
    milestone_key: 'vermogen-100k',
    kind: 'vermogen',
    threshold_value: 100_000,
    observed_value: 103_412,
    achieved_at: '2026-03-12T10:00:00.000Z',
    acknowledged_at: null,
    source: 'detect',
    ...over,
  }
}

describe('resolveMilestoneGoalName', () => {
  const goals: MilestoneGoalRef[] = [
    { id: 'g1', name: 'Nieuwe keuken', user_id: USER },
    { id: 'g2', name: 'Doel van de partner', user_id: 'partner-9' },
  ]

  it('lost de naam op bij een behaald doel', () => {
    expect(resolveMilestoneGoalName('doel-behaald:g1', goals, USER)).toBe('Nieuwe keuken')
  })

  it('lost de naam op bij een checkpoint (id vóór het percentage)', () => {
    expect(resolveMilestoneGoalName('doel-checkpoint:g1:50', goals, USER)).toBe('Nieuwe keuken')
  })

  it('geeft nooit de naam van een doel van iemand anders terug', () => {
    expect(resolveMilestoneGoalName('doel-behaald:g2', goals, USER)).toBeNull()
  })

  it('geeft null bij een onbekend doel, een niet-doel-sleutel of zonder gebruiker', () => {
    expect(resolveMilestoneGoalName('doel-behaald:weg', goals, USER)).toBeNull()
    expect(resolveMilestoneGoalName('vermogen-100k', goals, USER)).toBeNull()
    expect(resolveMilestoneGoalName('doel-behaald:g1', goals, null)).toBeNull()
  })
})

describe('isSecondaryMilestone', () => {
  it('markeert doel-checkpoints als tussenstation', () => {
    expect(isSecondaryMilestone(row({ milestone_key: 'doel-checkpoint:g1:25', kind: 'doel' }))).toBe(true)
  })

  it('markeert een stil gelogd (seed) doel als tussenstation', () => {
    expect(
      isSecondaryMilestone(row({ milestone_key: 'doel-behaald:g1', kind: 'doel', source: 'seed' })),
    ).toBe(true)
  })

  it('laat een echt behaald doel en een geseede vermogensmijlpaal volwaardig', () => {
    expect(
      isSecondaryMilestone(row({ milestone_key: 'doel-behaald:g1', kind: 'doel', source: 'detect' })),
    ).toBe(false)
    expect(isSecondaryMilestone(row({ source: 'seed' }))).toBe(false)
  })
})

describe('buildMilestoneTimeline', () => {
  it('groepeert per kalenderjaar, nieuwste jaar eerst', () => {
    const jaren = buildMilestoneTimeline(
      [
        row({ milestone_key: 'vermogen-25k', achieved_at: '2024-07-01T12:00:00.000Z' }),
        row({ milestone_key: 'vermogen-100k', achieved_at: '2026-03-12T12:00:00.000Z' }),
        row({ milestone_key: 'vermogen-50k', achieved_at: '2024-11-01T12:00:00.000Z' }),
      ],
      [],
      USER,
      null,
    )

    expect(jaren.map((j) => j.year)).toEqual([2026, 2024])
    // Binnen een jaar óók aflopend: november vóór juli.
    expect(jaren[1].entries.map((e) => e.row.milestone_key)).toEqual([
      'vermogen-50k',
      'vermogen-25k',
    ])
  })

  it('draagt de canonieke copy over — geen eigen zinnen', () => {
    // Mét dagtarief: titel én betekenis letterlijk uit buildMilestoneCopy.
    const bron = row()
    const tarief = 114.52
    const [{ entries }] = buildMilestoneTimeline([bron], [], USER, tarief)
    const canoniek = buildMilestoneCopy(bron, tarief, { goalName: null })

    expect(entries[0].titel).toBe(canoniek.titel)
    expect(entries[0].betekenis).toBe(canoniek.betekenis)
  })

  it('laat de betekenis weg bij vermogen zonder dagtarief — geen herhaalde titel', () => {
    // Zonder tarief zou de betekenis "Je netto vermogen passeerde € X." zijn:
    // hetzelfde feit als de titel, twee keer (review 1 sep). Dan liever null;
    // andere soorten behouden hun betekenis gewoon.
    const [{ entries }] = buildMilestoneTimeline([row()], [], USER, null)
    expect(entries[0].betekenis).toBeNull()

    const [{ entries: vrij }] = buildMilestoneTimeline(
      [row({ milestone_key: 'vrijheid-25', kind: 'vrijheid', threshold_value: 25, observed_value: 26 })],
      [],
      USER,
      null,
    )
    expect(vrij[0].betekenis).not.toBeNull()
  })

  it('seed zonder echte datering claimt geen jaar — "Zonder datum"-bak i.p.v. omstreeks-vandaag', () => {
    // De seed-run dateert schuldenvrij/noodfonds (en te korte snapshots) op het
    // seed-moment zelf; achieved_at ≈ created_at verraadt dat. Zo'n rij in de
    // jaargroep van vandaag zetten zou een onjuiste bewering zijn (review-🔴).
    const gedateerd = row({
      milestone_key: 'vermogen-50k',
      threshold_value: 50_000,
      source: 'seed',
      achieved_at: '2023-06-09T12:00:00.000Z',
      created_at: '2026-09-01T08:00:00.000Z',
    })
    const nietDateerbaar = row({
      milestone_key: 'schuldenvrij',
      kind: 'schuldenvrij',
      threshold_value: 0,
      observed_value: 0,
      source: 'seed',
      achieved_at: '2026-09-01T08:00:00.000Z',
      created_at: '2026-09-01T08:00:01.000Z',
    })

    const years = buildMilestoneTimeline([gedateerd, nietDateerbaar], [], USER, null)

    const g = years.flatMap((y) => y.entries).find((e) => e.row.milestone_key === 'vermogen-50k')!
    const o = years.flatMap((y) => y.entries).find((e) => e.row.milestone_key === 'schuldenvrij')!
    expect(g.dateKind).toBe('omstreeks')
    expect(o.dateKind).toBe('onbekend')
    // De niet-dateerbare rij zit in de jaarloze bak, de gedateerde in 2023.
    expect(years.find((y) => y.entries.includes(g))!.year).toBe(2023)
    expect(years.find((y) => y.entries.includes(o))!.year).toBeNull()
  })

  it('sorteert deterministisch bij gelijke achieved_at (tiebreaker op sleutel)', () => {
    const a = row({ milestone_key: 'vermogen-25k', threshold_value: 25_000 })
    const b = row({ milestone_key: 'vermogen-10k', threshold_value: 10_000 })
    const [{ entries: e1 }] = buildMilestoneTimeline([a, b], [], USER, null)
    const [{ entries: e2 }] = buildMilestoneTimeline([b, a], [], USER, null)
    expect(e1.map((e) => e.row.milestone_key)).toEqual(e2.map((e) => e.row.milestone_key))
  })

  it('geeft de doelnaam door aan de copy', () => {
    const bron = row({ milestone_key: 'doel-behaald:g1', kind: 'doel', threshold_value: null })
    const [{ entries }] = buildMilestoneTimeline(
      [bron],
      [{ id: 'g1', name: 'Nieuwe keuken', user_id: USER }],
      USER,
      null,
    )

    expect(entries[0].titel).toContain('Nieuwe keuken')
  })

  it('draagt alleen bij een vermogens-mijlpaal een euro-bedrag', () => {
    const [{ entries }] = buildMilestoneTimeline(
      [
        row({ milestone_key: 'vermogen-100k', achieved_at: '2026-03-12T12:00:00.000Z' }),
        row({
          milestone_key: 'vrijheid-50',
          kind: 'vrijheid',
          threshold_value: 50,
          observed_value: 51,
          achieved_at: '2026-02-01T12:00:00.000Z',
        }),
        row({
          // MAANDEN, geen euro's — dit veld mag nooit als bedrag lezen.
          milestone_key: 'noodfonds-gevuld',
          kind: 'noodfonds',
          threshold_value: 6,
          observed_value: 6.4,
          achieved_at: '2026-01-05T12:00:00.000Z',
        }),
      ],
      [],
      USER,
      null,
    )

    expect(entries.map((e) => e.euroAmount)).toEqual([100_000, null, null])
  })

  it('zet rijen met een onleesbare datum in een eigen bak, achteraan', () => {
    const jaren = buildMilestoneTimeline(
      [
        row({ milestone_key: 'kapot', achieved_at: 'geen-datum' }),
        row({ milestone_key: 'vermogen-100k', achieved_at: '2026-03-12T12:00:00.000Z' }),
      ],
      [],
      USER,
      null,
    )

    expect(jaren.map((j) => j.year)).toEqual([2026, null])
  })

  it('levert een lege lijst bij een lege log', () => {
    expect(buildMilestoneTimeline([], [], USER, null)).toEqual([])
  })

  /**
   * WF-MIJN-32 — de "Zonder datum"-bak brak een jaargroep doormidden.
   *
   * Live waargenomen op /mijn/mijlpalen (UAT 3 sep 2026), jaarkoppen van boven
   * naar beneden: `2026` → `ZONDER DATUM` → `2026` → `2025`. Twee losse
   * 2026-koppen dus, met de jaarloze bak ertussen in plaats van onderaan.
   *
   * Oorzaak: de comparator sorteerde op de rauwe `achieved_at`. Voor een
   * 'onbekend'-rij ís dat het seed-moment (vandaag) — een geldige datum, dus de
   * NaN-tak ving 'm niet af en hij landde tussen de echte 2026-rijen. De
   * groepering voegt alleen AANEENGESLOTEN gelijke jaren samen, dus het jaar
   * viel in tweeën uiteen.
   */
  it('houdt de "Zonder datum"-bak onderaan en laat een jaar niet in tweeën vallen (WF-MIJN-32)', () => {
    const SEED_RUN = '2026-09-01T08:00:00.000Z'
    /** Seed-rij zonder betrouwbare datering: achieved_at ≈ created_at (< 48u). */
    const onbekend = (key: string) =>
      row({
        milestone_key: key,
        kind: 'schuldenvrij',
        threshold_value: 0,
        observed_value: 0,
        source: 'seed',
        achieved_at: SEED_RUN,
        created_at: '2026-09-01T08:00:01.000Z',
      })
    /** Seed-rij mét historische datering: achieved_at ligt ver vóór de seed-run. */
    const omstreeks = (key: string, achievedAt: string) =>
      row({ milestone_key: key, source: 'seed', achieved_at: achievedAt, created_at: SEED_RUN })

    const jaren = buildMilestoneTimeline(
      [
        // Exact gedateerd, ná het seed-moment.
        row({ milestone_key: 'vermogen-100k', achieved_at: '2026-09-02T12:00:00.000Z' }),
        // Deze twee sorteerden vóór de fix tussen de twee 2026-rijen in: hun
        // achieved_at (het seed-moment) ligt chronologisch precies daartussen.
        onbekend('schuldenvrij'),
        onbekend('noodfonds-gevuld'),
        // Zelfde jaar, maar chronologisch vóór het seed-moment.
        omstreeks('vermogen-50k', '2026-01-01T12:00:00.000Z'),
        omstreeks('vermogen-25k', '2025-01-01T12:00:00.000Z'),
      ],
      [],
      USER,
      null,
    )

    // Eén kop per jaar, aflopend, en de jaarloze bak als laatste groep.
    expect(jaren.map((j) => j.year)).toEqual([2026, 2025, null])

    // Beide 2026-rijen zitten in dezelfde groep — het jaar is niet gesplitst.
    expect(jaren[0].entries.map((e) => e.row.milestone_key)).toEqual([
      'vermogen-100k',
      'vermogen-50k',
    ])

    // De jaarloze bak is één aaneengesloten groep met precies de onbekend-rijen.
    expect(jaren[2].entries.map((e) => e.row.milestone_key)).toEqual([
      'noodfonds-gevuld',
      'schuldenvrij',
    ])
    expect(jaren[2].entries.every((e) => e.dateKind === 'onbekend')).toBe(true)
  })

  it('bundelt een onleesbare datum en een seed-zonder-datering in dezelfde bak', () => {
    // Twee verschillende routes naar "geen jaar" (onleesbare achieved_at op een
    // detect-rij, en een seed-rij op het seed-moment) mogen niet twee losse
    // jaarloze groepen opleveren.
    const jaren = buildMilestoneTimeline(
      [
        row({ milestone_key: 'kapot', achieved_at: 'geen-datum' }),
        row({ milestone_key: 'vermogen-100k', achieved_at: '2026-03-12T12:00:00.000Z' }),
        row({
          milestone_key: 'schuldenvrij',
          kind: 'schuldenvrij',
          threshold_value: 0,
          observed_value: 0,
          source: 'seed',
          achieved_at: '2026-09-01T08:00:00.000Z',
          created_at: '2026-09-01T08:00:01.000Z',
        }),
      ],
      [],
      USER,
      null,
    )

    expect(jaren.map((j) => j.year)).toEqual([2026, null])
    expect(jaren[1].entries.map((e) => e.row.milestone_key)).toEqual(['kapot', 'schuldenvrij'])
  })
})
