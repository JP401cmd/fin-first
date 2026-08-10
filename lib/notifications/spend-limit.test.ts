import { describe, it, expect } from 'vitest'
import {
  decideSpendLimitEvents,
  isStreakMilestone,
  parseSpendLimitEventGate,
  SPEND_LIMIT_GATE_PERIOD_LIMIT,
  type SpendLimitEventGate,
} from './spend-limit'
import {
  buildSpendLimitReport,
  computeSpendLimitTrend,
  computeStreaks,
  type SpendLimitPeriodKind,
  type SpendLimitPeriodOutcome,
  type SpendLimitStatus,
} from '@/lib/spend-limits/engine'
import type { SpendLimitWithReport } from '@/lib/spend-limits/types'

/**
 * Deze suite bewaakt WELKE melding een gebruiker over zijn eigen uitgavengrens
 * krijgt — en vooral wanneer hij er géén of maar één krijgt. De regels die hier
 * vastliggen zijn precies die welke stil kunnen omvallen:
 *
 *  1. `near` en `exceeded` sluiten elkaar uit, en die uitsluiting komt uit de
 *     MOTOR (`isNearLimit` eist `status === 'within'`), niet uit een eigen
 *     drempel hier;
 *  2. de eenmalige events vuren precies één keer, en de gate wordt NIET gezet
 *     wanneer de gebruiker het berichttype uit heeft staan;
 *  3. elk id draagt de periodesleutel, zodat "eenmaal gelezen" niet over een
 *     periodegrens heen blijft gelden;
 *  4. een retroactieve wijziging (refund) heropent geen oude melding.
 */

// ── Fixtures ─────────────────────────────────────────────────────────────────

function period(o: {
  periodKey: string
  label?: string
  isOpen?: boolean
  matched: number
  limit: number
  status: SpendLimitStatus
  isNearLimit?: boolean
}): SpendLimitPeriodOutcome {
  return {
    periodKey: o.periodKey,
    label: o.label ?? o.periodKey,
    since: `${o.periodKey}-01`,
    until: `${o.periodKey}-28`,
    isOpen: o.isOpen ?? false,
    periodMatchedAmount: o.matched,
    limitAmount: o.limit,
    periodOverAmount: Math.max(0, o.matched - o.limit),
    periodHeadroom: Math.max(0, o.limit - o.matched),
    status: o.status,
    isNearLimit: o.isNearLimit ?? false,
    matchedTransactionCount: 0,
    matchedCounterpartyNames: [],
  }
}

/**
 * Een doorgerekende pot. `streaks` en `trend` komen uit de ECHTE motor over de
 * meegegeven afgesloten periodes — zo kan een fixture nooit een reeks beweren
 * die de motor niet zou opleveren.
 */
function pot(o: {
  id?: string
  name?: string
  isActive?: boolean
  periodKind?: SpendLimitPeriodKind
  current: SpendLimitPeriodOutcome
  closed?: SpendLimitPeriodOutcome[]
  /**
   * Standaard ruim vóór elk venster in deze suite: die tests gaan niet over de
   * aanmaakdatum, en een pot die "er altijd al was" is de neutrale grondtoestand.
   * De tests die de datum wél onderzoeken zetten 'm expliciet.
   */
  createdAt?: string
}): SpendLimitWithReport {
  const closed = o.closed ?? []
  return {
    config: {
      id: o.id ?? 'pot-1',
      name: o.name ?? 'Tankstations',
      purpose: null,
      ruleType: 'counterparty',
      rules: [
        {
          id: 'r-1',
          budgets: [],
          includeChildBudgets: false,
          counterparties: [{ key: 'SHELL', label: 'Shell' }],
        },
      ],
      limitAmount: o.current.limitAmount,
      period: o.periodKind ?? 'month',
      isActive: o.isActive ?? true,
      createdAt: o.createdAt ?? '2020-01-01T00:00:00Z',
    },
    report: {
      currentPeriod: o.current,
      lastClosedPeriod: closed.length > 0 ? closed[closed.length - 1] : null,
      closedPeriods: closed,
      streaks: computeStreaks(closed),
      trend: computeSpendLimitTrend(closed),
    },
    budgetSplit: [],
    ruleSplit: [],
  }
}

const OPEN_WITHIN = period({
  periodKey: '2026-08',
  label: 'augustus 2026',
  isOpen: true,
  matched: 20,
  limit: 200,
  status: 'within',
})

function decide(
  limits: SpendLimitWithReport[],
  gate: SpendLimitEventGate = {},
  enabled = true,
  alias: string | null = null,
) {
  return decideSpendLimitEvents({ limits, gate, enabled, alias })
}

// ── Live statussen ───────────────────────────────────────────────────────────

describe('decideSpendLimitEvents — lopende periode', () => {
  it('meldt `near` met prioriteit 3 en zet de periodesleutel in het id (AC-B6-01)', () => {
    const { events, gateChanged } = decide([
      pot({
        current: period({
          periodKey: '2026-08',
          label: 'augustus 2026',
          isOpen: true,
          matched: 170,
          limit: 200,
          status: 'within',
          isNearLimit: true,
        }),
      }),
    ])

    expect(events).toHaveLength(1)
    expect(events[0].kind).toBe('near')
    expect(events[0].notification.priority).toBe(3)
    expect(events[0].notification.id).toBe('spend_limit_pot-1_2026-08_near')
    // Live statussen hebben geen gate: er valt niets vast te leggen.
    expect(events[0].once).toBe(false)
    expect(gateChanged).toBe(false)
  })

  it('meldt `exceeded` met prioriteit 2 en géén `near` voor dezelfde periode (AC-B6-02)', () => {
    const { events } = decide([
      pot({
        current: period({
          periodKey: '2026-08',
          isOpen: true,
          matched: 223,
          limit: 200,
          status: 'exceeded',
          // Zelfs als een bron ooit beide zou beweren, wint `exceeded`.
          isNearLimit: true,
        }),
      }),
    ])

    expect(events.map((e) => e.kind)).toEqual(['exceeded'])
    expect(events[0].notification.priority).toBe(2)
    expect(events[0].notification.title).toContain('boven je grens')
  })

  it('zwijgt bij een pot ruim binnen de grens (AC-B6-10)', () => {
    const { events, gateChanged } = decide([pot({ current: OPEN_WITHIN })])
    expect(events).toEqual([])
    expect(gateChanged).toBe(false)
  })

  it('zwijgt over een gepauzeerde pot, maar houdt zijn gate vast', () => {
    const gate: SpendLimitEventGate = { 'pot-1': { '2026-07': ['recovered'] } }
    const result = decide(
      [
        pot({
          isActive: false,
          current: period({
            periodKey: '2026-08',
            isOpen: true,
            matched: 400,
            limit: 200,
            status: 'exceeded',
          }),
        }),
      ],
      gate,
    )
    expect(result.events).toEqual([])
    expect(result.gateChanged).toBe(false)
    expect(result.gate['pot-1']['2026-07']).toEqual(['recovered'])
  })

  it('leidt de uitsluiting near/exceeded uit de MOTOR af, niet uit een eigen drempel', () => {
    // Geen 0,8 in dit bestand en geen in spend-limit.ts: de vlag komt uit
    // `buildSpendLimitReport`. Draait iemand de motor-drempel om, dan verschuift
    // deze test mee — precies de bedoeling.
    const now = new Date(2026, 7, 15)
    const build = (spent: number) =>
      buildSpendLimitReport({
        rule: { ruleType: 'counterparty', limitAmount: 100, period: 'month' },
        rows: [
          {
            bucketStart: '2026-08-01',
            transactionType: 'expense',
            sumPositief: 0,
            sumNegatief: -spent,
            count: 2,
          },
        ],
        now,
        windowPeriods: 13,
      })

    const nearReport = build(85)
    const overReport = build(120)

    const asPot = (report: ReturnType<typeof build>): SpendLimitWithReport => ({
      ...pot({ current: report.currentPeriod }),
      report,
    })

    // Alleen de LIVE events: een venster zonder historie levert twaalf lege —
    // en dus per motor-definitie "binnen de grens" — afgesloten maanden op. Deze
    // fixture-pot bestaat sinds 2020, dus die reeks telt hier legitiem mee en
    // levert daarnaast een mijlpaal op (voor een NIEUWE pot onderdrukt
    // `streakStartsAfterCreation` dat juist — zie de mijlpaal-suite hieronder).
    // Hier gaat het uitsluitend om de uitsluiting near ⇄ exceeded.
    const live = (limits: SpendLimitWithReport[]) =>
      decide(limits).events.filter((e) => !e.once).map((e) => e.kind)

    expect(live([asPot(nearReport)])).toEqual(['near'])
    expect(live([asPot(overReport)])).toEqual(['exceeded'])
  })
})

// ── Eenmalige events ─────────────────────────────────────────────────────────

describe('decideSpendLimitEvents — herstel', () => {
  const herstel = () =>
    pot({
      current: OPEN_WITHIN,
      closed: [
        period({ periodKey: '2026-06', matched: 260, limit: 200, status: 'exceeded' }),
        period({ periodKey: '2026-07', label: 'juli 2026', matched: 150, limit: 200, status: 'within' }),
      ],
    })

  it('meldt `recovered` één keer en legt dat vast in de gate (AC-B6-03)', () => {
    const result = decide([herstel()])

    expect(result.events.map((e) => e.kind)).toEqual(['recovered'])
    expect(result.events[0].notification.id).toBe('spend_limit_pot-1_2026-07_recovered')
    expect(result.events[0].notification.priority).toBe(4)
    expect(result.events[0].notification.description).toContain('juli 2026')
    expect(result.gateChanged).toBe(true)
    expect(result.gate['pot-1']['2026-07']).toContain('recovered')
  })

  it('herhaalt `recovered` niet zodra de gate staat (AC-B6-04)', () => {
    const first = decide([herstel()])
    const second = decide([herstel()], first.gate)

    expect(second.events).toEqual([])
    expect(second.gateChanged).toBe(false)
  })

  it('meldt geen herstel als de periode dáárvóór ook binnen de grens bleef', () => {
    const { events } = decide([
      pot({
        current: OPEN_WITHIN,
        closed: [
          period({ periodKey: '2026-06', matched: 120, limit: 200, status: 'within' }),
          period({ periodKey: '2026-07', matched: 150, limit: 200, status: 'within' }),
        ],
      }),
    ])
    expect(events).toEqual([])
  })

  it('heropent geen melding wanneer een refund de laatst afgesloten periode retroactief omzet', () => {
    // Eerst herstel gemeld (juli binnen na een juni erboven). Daarna verschuift
    // een correctie juli alsnog naar `exceeded`: de historie wordt NIET
    // herschreven en er komt geen tweede melding over dezelfde periode.
    const gate = decide([herstel()]).gate

    const naCorrectie = decide(
      [
        pot({
          current: OPEN_WITHIN,
          closed: [
            period({ periodKey: '2026-06', matched: 260, limit: 200, status: 'exceeded' }),
            period({ periodKey: '2026-07', matched: 240, limit: 200, status: 'exceeded' }),
          ],
        }),
      ],
      gate,
    )

    expect(naCorrectie.events).toEqual([])
    // De marker blijft staan: een latere terug-flip mag de melding niet opnieuw afvuren.
    expect(naCorrectie.gate['pot-1']['2026-07']).toContain('recovered')
  })
})

describe('decideSpendLimitEvents — reeks-mijlpalen', () => {
  const closedWithin = (keys: string[]) =>
    keys.map((k) => period({ periodKey: k, matched: 100, limit: 200, status: 'within' }))

  it('meldt de mijlpaal bij een reeks van 6 (AC-B6-05)', () => {
    const result = decide([
      pot({
        current: OPEN_WITHIN,
        closed: closedWithin([
          '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07',
        ]),
      }),
    ])

    expect(result.events.map((e) => e.kind)).toEqual(['streak_milestone'])
    expect(result.events[0].notification.id).toBe('spend_limit_pot-1_2026-07_streak6')
    expect(result.events[0].notification.title).toContain('6 maanden op rij')
    expect(result.gate['pot-1']['2026-07']).toContain('streak6')
  })

  it('zwijgt bij een reeks die geen mijlpaal is', () => {
    const { events } = decide([
      pot({ current: OPEN_WITHIN, closed: closedWithin(['2026-06', '2026-07']) }),
    ])
    expect(events).toEqual([])
  })

  it('gebruikt het meervoud van de periodesoort', () => {
    const result = decide([
      pot({
        periodKind: 'quarter',
        current: period({
          periodKey: '2026-Q3',
          label: 'Q3 2026',
          isOpen: true,
          matched: 10,
          limit: 900,
          status: 'within',
        }),
        closed: closedWithin(['2025-Q4', '2026-Q1', '2026-Q2']),
      }),
    ])
    expect(result.events[0].notification.title).toContain('3 kwartalen op rij')
  })

  it('herkent 3, 6, 12 en 24 als mijlpaal en de rest niet', () => {
    for (const n of [3, 6, 12, 24, 48]) expect(isStreakMilestone(n)).toBe(true)
    for (const n of [0, 1, 2, 4, 5, 7, 8, 9, 11, 18, 30]) expect(isStreakMilestone(n)).toBe(false)
  })
})

// ── De aanmaakdatum als ondergrens van betekenis ─────────────────────────────

describe('decideSpendLimitEvents — geen mijlpaal over periodes van vóór de pot', () => {
  const zesLegeMaanden = ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07']

  /** Zes afgesloten periodes zonder één transactie — per motor-definitie "binnen". */
  const legeHistorie = () =>
    zesLegeMaanden.map((k) =>
      period({ periodKey: k, matched: 0, limit: 200, status: 'within' }),
    )

  it('zwijgt bij een splinternieuwe pot met een geërfde reeks', () => {
    // De reeks van 6 bestaat volledig uit maanden die al voorbij waren toen de
    // pot werd aangemaakt. Een felicitatie daarover is een rekenartefact.
    const result = decide([
      pot({
        current: OPEN_WITHIN,
        closed: legeHistorie(),
        createdAt: '2026-08-01T09:15:00Z',
      }),
    ])

    expect(result.events).toEqual([])
    // En net zo belangrijk: de gate blijft leeg, zodat dezelfde pot over zes
    // ECHTE maanden alsnog zijn mijlpaal krijgt.
    expect(result.gateChanged).toBe(false)
    expect(result.gate['pot-1']).toBeUndefined()
  })

  it('meldt wél zodra de hele reeks ná de aanmaak begint', () => {
    // Aangemaakt op 1 februari 2026 — de reeks start met februari, dus alle zes
    // periodes liggen volledig binnen het bestaan van de pot.
    const result = decide([
      pot({
        current: OPEN_WITHIN,
        closed: legeHistorie(),
        createdAt: '2026-02-01T00:00:00Z',
      }),
    ])

    expect(result.events.map((e) => e.kind)).toEqual(['streak_milestone'])
    expect(result.events[0].notification.id).toBe('spend_limit_pot-1_2026-07_streak6')
  })

  it('onderdrukt ook bij aanmaak MIDDEN in de eerste periode van de reeks', () => {
    // 14 februari: die maand liep al toen de grens er nog niet was, dus "je bleef
    // er binnen" is geen prestatie. Bewust streng — de volgende mijlpaal telt wel.
    const result = decide([
      pot({
        current: OPEN_WITHIN,
        closed: legeHistorie(),
        createdAt: '2026-02-14T12:00:00Z',
      }),
    ])

    expect(result.events).toEqual([])
  })

  it('laat de mijlpaal door wanneer de aanmaakdatum onbruikbaar is', () => {
    // Doorlaten-bij-twijfel: een datavlek mag de mijlpalen niet stil permanent
    // uitzetten. Hooguit één te vroege felicitatie.
    const result = decide([
      pot({ current: OPEN_WITHIN, closed: legeHistorie(), createdAt: '' }),
    ])

    expect(result.events.map((e) => e.kind)).toEqual(['streak_milestone'])
  })

  it('raakt `recovered` niet: die eist een overschrijding en kan dus niet geërfd zijn', () => {
    const result = decide([
      pot({
        current: OPEN_WITHIN,
        closed: [
          period({ periodKey: '2026-06', matched: 260, limit: 200, status: 'exceeded' }),
          period({ periodKey: '2026-07', label: 'juli 2026', matched: 150, limit: 200, status: 'within' }),
        ],
        createdAt: '2026-08-01T09:15:00Z',
      }),
    ])

    expect(result.events.map((e) => e.kind)).toEqual(['recovered'])
  })
})

// ── Voorkeur, periodegrens, pruning ──────────────────────────────────────────

describe('decideSpendLimitEvents — voorkeur en dedupe', () => {
  it('meldt niets én brandt de gate niet op wanneer het type uit staat (AC-B6-06)', () => {
    const gate: SpendLimitEventGate = {}
    const result = decideSpendLimitEvents({
      limits: [
        pot({
          current: OPEN_WITHIN,
          closed: [
            period({ periodKey: '2026-06', matched: 260, limit: 200, status: 'exceeded' }),
            period({ periodKey: '2026-07', matched: 150, limit: 200, status: 'within' }),
          ],
        }),
      ],
      gate,
      alias: null,
      enabled: false,
    })

    expect(result.events).toEqual([])
    expect(result.gateChanged).toBe(false)
    expect(result.gate).toEqual({})

    // …en zodra de gebruiker het type weer aanzet, verschijnt de melding alsnog.
    const naAanzetten = decideSpendLimitEvents({
      limits: [
        pot({
          current: OPEN_WITHIN,
          closed: [
            period({ periodKey: '2026-06', matched: 260, limit: 200, status: 'exceeded' }),
            period({ periodKey: '2026-07', matched: 150, limit: 200, status: 'within' }),
          ],
        }),
      ],
      gate: result.gate,
      alias: null,
      enabled: true,
    })
    expect(naAanzetten.events.map((e) => e.kind)).toEqual(['recovered'])
  })

  it('geeft een nieuw id over een periodegrens heen (AC-B6-09)', () => {
    const augustus = decide([
      pot({
        current: period({
          periodKey: '2026-08',
          isOpen: true,
          matched: 250,
          limit: 200,
          status: 'exceeded',
        }),
      }),
    ])
    const september = decide([
      pot({
        current: period({
          periodKey: '2026-09',
          isOpen: true,
          matched: 250,
          limit: 200,
          status: 'exceeded',
        }),
      }),
    ])

    expect(augustus.events[0].notification.id).not.toBe(september.events[0].notification.id)
    expect(september.events[0].notification.id).toContain('2026-09')
  })

  it('vult geen historie terug: alleen de laatst afgesloten periode telt', () => {
    // Twee eerdere herstelmomenten in het venster; alleen het laatste mag melden.
    const result = decide([
      pot({
        current: OPEN_WITHIN,
        closed: [
          period({ periodKey: '2026-04', matched: 260, limit: 200, status: 'exceeded' }),
          period({ periodKey: '2026-05', matched: 100, limit: 200, status: 'within' }),
          period({ periodKey: '2026-06', matched: 260, limit: 200, status: 'exceeded' }),
          period({ periodKey: '2026-07', matched: 100, limit: 200, status: 'within' }),
        ],
      }),
    ])

    expect(result.events).toHaveLength(1)
    expect(result.events[0].periodKey).toBe('2026-07')
    expect(Object.keys(result.gate['pot-1'])).toEqual(['2026-07'])
  })

  it(`houdt hooguit ${SPEND_LIMIT_GATE_PERIOD_LIMIT} periodesleutels per pot en gooit onbekende potten weg`, () => {
    const gate: SpendLimitEventGate = {
      'pot-1': {
        '2025-09': ['recovered'], '2025-10': ['recovered'], '2025-11': ['recovered'],
        '2025-12': ['recovered'], '2026-01': ['recovered'], '2026-02': ['recovered'],
        '2026-03': ['recovered'],
      },
      'pot-weg': { '2026-01': ['recovered'] },
    }

    const result = decide([pot({ current: OPEN_WITHIN })], gate)

    expect(result.gateChanged).toBe(true)
    expect(result.gate['pot-weg']).toBeUndefined()
    expect(Object.keys(result.gate['pot-1'])).toEqual([
      '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03',
    ])
  })

  it('laat een gate die niets hoeft te veranderen ongemoeid (geen schrijfbeurt per poll)', () => {
    const gate: SpendLimitEventGate = { 'pot-1': { '2026-07': ['recovered'] } }
    const result = decide([pot({ current: OPEN_WITHIN })], gate)
    expect(result.gateChanged).toBe(false)
    expect(result.gate).toEqual(gate)
  })
})

// ── Copy: moment-in-tijd ─────────────────────────────────────────────────────

describe('decideSpendLimitEvents — copy', () => {
  const overPot = () =>
    pot({
      current: period({
        periodKey: '2026-08',
        isOpen: true,
        matched: 223,
        limit: 200,
        status: 'exceeded',
      }),
    })

  it('stelt de tekst samen met de alias die op generatiemoment geldt (AC-B5-04)', () => {
    const standaard = decide([overPot()], {}, true, null).events[0].notification.description
    const gekozen = decide([overPot()], {}, true, 'schaamtepot').events[0].notification.description

    expect(standaard).not.toBe(gekozen)
    // Geen naam-literals in dit bestand: we toetsen dát de naam meebeweegt,
    // niet welke letters erin staan. De namen zelf staan in lib/spend-limits/copy.ts.
    expect(standaard).toContain('dan de grens die je jezelf stelde')
    expect(gekozen).toContain('dan de grens die je jezelf stelde')
  })

  it('valt terug op de standaardnaam bij een onbekende alias', () => {
    const standaard = decide([overPot()], {}, true, null).events[0].notification.description
    const rommel = decide([overPot()], {}, true, 'potje').events[0].notification.description
    expect(rommel).toBe(standaard)
  })

  it('blijft observationeel — geen voorschrijvende toon', () => {
    const { events } = decide([overPot()])
    const tekst = `${events[0].notification.title} ${events[0].notification.description}`
    expect(tekst).not.toMatch(/je moet|zou je moeten|stop met/i)
  })

  // ── Maskeerbaarheid (ADR 0091, laag 2) ────────────────────────────────────
  // Bedragmaskering is client-side en per call-site opt-in: een bedrag dat in
  // `title`/`description` is ingebakken, kan de privacy-toggle nooit meer
  // verbergen. De getallen horen daarom in `metadata`, zodat
  // notification-item.tsx ze live via <MaskedAmount> rendert — hetzelfde patroon
  // als de opzeg-actie na migratie 20260807120000.
  it('bakt geen euro-bedragen in de meldingstekst (ADR 0091)', () => {
    const alleEvents = [
      ...decide([overPot()]).events,
      ...decide([
        pot({
          current: period({
            periodKey: '2026-08',
            isOpen: true,
            matched: 180,
            limit: 200,
            status: 'within',
            isNearLimit: true,
          }),
        }),
      ]).events,
      ...decide([
        pot({
          current: OPEN_WITHIN,
          closed: [
            period({ periodKey: '2026-06', matched: 260, limit: 200, status: 'exceeded' }),
            period({ periodKey: '2026-07', matched: 150, limit: 200, status: 'within' }),
          ],
        }),
      ]).events,
    ]

    expect(alleEvents.length).toBeGreaterThan(0)
    for (const { notification } of alleEvents) {
      expect(notification.title).not.toMatch(/€/)
      expect(notification.description).not.toMatch(/€/)
    }
  })

  it('draagt de bedragen apart mee zodat de renderer ze kan maskeren', () => {
    const over = decide([overPot()]).events[0].notification
    expect(over.metadata).toEqual({ matched: 223, limit: 200, over: 23 })
  })

  it('geeft elke melding een aiContext en een deeplink naar de pot', () => {
    const { events } = decide([
      pot({
        current: OPEN_WITHIN,
        closed: [
          period({ periodKey: '2026-06', matched: 260, limit: 200, status: 'exceeded' }),
          period({ periodKey: '2026-07', matched: 150, limit: 200, status: 'within' }),
        ],
      }),
    ])
    expect(events[0].notification.aiContext.length).toBeGreaterThan(20)
    expect(events[0].notification.actionUrl).toBe(
      '/overzicht/cashflow/transacties?limit=pot-1&periode=2026-07',
    )
  })
})

// ── Gate-serialisatie ────────────────────────────────────────────────────────

describe('parseSpendLimitEventGate', () => {
  it('leest een geldige blob', () => {
    expect(parseSpendLimitEventGate('{"pot-1":{"2026-07":["recovered","streak3"]}}')).toEqual({
      'pot-1': { '2026-07': ['recovered', 'streak3'] },
    })
  })

  it('valt terug op leeg bij ontbrekende, kapotte of verkeerd gevormde waarden', () => {
    expect(parseSpendLimitEventGate(null)).toEqual({})
    expect(parseSpendLimitEventGate('')).toEqual({})
    expect(parseSpendLimitEventGate('{niet json')).toEqual({})
    expect(parseSpendLimitEventGate('[1,2,3]')).toEqual({})
    expect(parseSpendLimitEventGate('"tekst"')).toEqual({})
  })

  it('gooit onbruikbare takken weg zonder de rest mee te slepen', () => {
    expect(
      parseSpendLimitEventGate('{"pot-1":{"2026-07":["ok",7,null]},"pot-2":"stuk"}'),
    ).toEqual({ 'pot-1': { '2026-07': ['ok'] } })
  })
})
