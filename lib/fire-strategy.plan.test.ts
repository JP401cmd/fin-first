import { describe, it, expect } from 'vitest'
import {
  parseFirePlan,
  isFixedAnchor,
  isStopAnchorKind,
  isFireEndForm,
  STOP_ANCHOR_KINDS,
  FIRE_END_FORMS,
  FIRE_END_STRATEGIES,
  type FirePlan,
} from '@/lib/fire-strategy'

/**
 * ADR 0129 F1 — het plan-type (stop-anker × eind-vorm) naast de bestaande enum.
 *
 * Dit is de EXPAND-fase: sommige rijen dragen het anker nog in `fire_end_strategy`
 * ('pensioen'/'nu-stoppen'), andere al in `fire_stop_anchor`. De invariant die deze
 * suite bewaakt is dat `parseFirePlan` over BEIDE rijvormen hetzelfde plan oplevert
 * en dat geen enkele rij zichzelf kan tegenspreken — ook niet halverwege de backfill.
 */

describe('parseFirePlan — de tegenspraak-regel (ADR 0129 D2)', () => {
  it('een legacy-anker in de oude kolom WINT van de nieuwe kolom', () => {
    // De gevaarlijkste rij die kan bestaan: oude kolom zegt 'pensioen' (= AOW-anker),
    // nieuwe kolom is nog niet gebackfilld en staat op de default 'solved'. Zou de
    // nieuwe kolom winnen, dan gaat een AOW-plan halverwege de migratie stil over op
    // een gesolvede bisectie — een ander plan, zonder dat iemand iets wijzigde.
    const plan = parseFirePlan({
      fire_end_strategy: 'pensioen',
      fire_stop_anchor: 'solved',
      fire_end_age: 100,
    })
    expect(plan.anchor).toEqual({ kind: 'aow' })
  })

  it("'nu-stoppen' in de oude kolom levert het now-anker", () => {
    const plan = parseFirePlan({ fire_end_strategy: 'nu-stoppen', fire_stop_anchor: 'solved' })
    expect(plan.anchor).toEqual({ kind: 'now' })
  })

  it('een eind-vorm in de oude kolom laat de nieuwe ankerkolom leiden', () => {
    const plan = parseFirePlan({ fire_end_strategy: 'legacy', fire_stop_anchor: 'aow' })
    expect(plan.anchor).toEqual({ kind: 'aow' })
    expect(plan.endForm).toBe('legacy')
  })

  it('gebackfillde en niet-gebackfillde rij geven hetzelfde plan', () => {
    const voor = parseFirePlan({ fire_end_strategy: 'pensioen', fire_end_age: 100 })
    const na = parseFirePlan({ fire_end_strategy: 'deplete', fire_stop_anchor: 'aow', fire_end_age: 100 })
    expect(voor.anchor).toEqual(na.anchor)
    expect(voor.endForm).toBe(na.endForm)
    expect(voor.endAge).toBe(na.endAge)
  })
})

describe('parseFirePlan — de vijf bestaande waarden', () => {
  const gevallen: Array<[string, FirePlan['anchor'], FirePlan['endForm']]> = [
    ['deplete', { kind: 'solved' }, 'deplete'],
    ['legacy', { kind: 'solved' }, 'legacy'],
    ['perpetual', { kind: 'solved' }, 'perpetual'],
    ['pensioen', { kind: 'aow' }, 'deplete'],
    ['nu-stoppen', { kind: 'now' }, 'deplete'],
  ]

  it.each(gevallen)('%s → anker %j, eind-vorm %s', (strategy, anchor, endForm) => {
    const plan = parseFirePlan({ fire_end_strategy: strategy })
    expect(plan.anchor).toEqual(anchor)
    expect(plan.endForm).toBe(endForm)
  })

  it('dekt elke waarde uit de canonieke allowlist', () => {
    // Grendel: komt er een zesde strategie bij zonder dat deze suite meegroeit, dan
    // valt hij hier om in plaats van stil naar 'solved × deplete' te vouwen.
    expect(gevallen.map(([s]) => s).sort()).toEqual([...FIRE_END_STRATEGIES].sort())
  })
})

describe('parseFirePlan — het age-anker', () => {
  it('leest een halve leeftijd zonder afronden', () => {
    const plan = parseFirePlan({ fire_stop_anchor: 'age', fire_stop_age: 58.5 })
    expect(plan.anchor).toEqual({ kind: 'age', age: 58.5 })
  })

  it('rondt naar de dichtstbijzijnde halve — de slider-resolutie (B6)', () => {
    expect(parseFirePlan({ fire_stop_anchor: 'age', fire_stop_age: 58.3 }).anchor).toEqual({ kind: 'age', age: 58.5 })
    expect(parseFirePlan({ fire_stop_anchor: 'age', fire_stop_age: 58.1 }).anchor).toEqual({ kind: 'age', age: 58 })
  })

  it('leest een numerieke string (PostgREST levert numeric zo terug)', () => {
    expect(parseFirePlan({ fire_stop_anchor: 'age', fire_stop_age: '62.0' }).anchor).toEqual({ kind: 'age', age: 62 })
  })

  it('age zonder geldige leeftijd valt terug op solved, niet op een bogus anker', () => {
    // De DB-CHECK verbiedt deze combinatie, maar de parser mag daar niet op vertrouwen:
    // een anker zonder leeftijd zou de kernel op NaN laten kortsluiten.
    for (const bogus of [null, undefined, 'x', 17, 101, NaN]) {
      expect(parseFirePlan({ fire_stop_anchor: 'age', fire_stop_age: bogus as never }).anchor)
        .toEqual({ kind: 'solved' })
    }
  })

  it('negeert een stopleeftijd wanneer het anker niet age is', () => {
    expect(parseFirePlan({ fire_stop_anchor: 'aow', fire_stop_age: 58 }).anchor).toEqual({ kind: 'aow' })
  })
})

describe('parseFirePlan — onbekende en lege invoer', () => {
  it('een lege rij is een gesolved deplete-plan tot 90', () => {
    const plan = parseFirePlan({})
    expect(plan).toEqual({ anchor: { kind: 'solved' }, endForm: 'deplete', endAge: 90, legacyAmount: 0 })
  })

  it('onzin in beide kolommen valt terug op solved × deplete', () => {
    const plan = parseFirePlan({ fire_end_strategy: 'nonsense', fire_stop_anchor: 'ooit' })
    expect(plan.anchor).toEqual({ kind: 'solved' })
    expect(plan.endForm).toBe('deplete')
  })

  it('leest endAge en legacyAmount door, ook als string', () => {
    const plan = parseFirePlan({ fire_end_strategy: 'legacy', fire_end_age: 85, fire_legacy_amount: '100000' })
    expect(plan.endAge).toBe(85)
    expect(plan.legacyAmount).toBe(100_000)
  })
})

describe('isFixedAnchor — de enige toets op een vast stopmoment', () => {
  it('solved is niet vast, de drie ankers wel', () => {
    const basis = { endForm: 'deplete', endAge: 90, legacyAmount: 0 } as const
    expect(isFixedAnchor({ ...basis, anchor: { kind: 'solved' } })).toBe(false)
    expect(isFixedAnchor({ ...basis, anchor: { kind: 'aow' } })).toBe(true)
    expect(isFixedAnchor({ ...basis, anchor: { kind: 'now' } })).toBe(true)
    expect(isFixedAnchor({ ...basis, anchor: { kind: 'age', age: 58 } })).toBe(true)
  })
})

describe('allowlists', () => {
  it('de vier ankers en de drie eind-vormen', () => {
    expect(STOP_ANCHOR_KINDS).toEqual(['solved', 'aow', 'now', 'age'])
    expect(FIRE_END_FORMS).toEqual(['deplete', 'legacy', 'perpetual'])
  })

  it('de eind-vormen zijn de enum minus de twee ankers', () => {
    const ankers = ['pensioen', 'nu-stoppen']
    expect([...FIRE_END_FORMS].sort()).toEqual(
      FIRE_END_STRATEGIES.filter((s) => !ankers.includes(s)).sort(),
    )
  })

  it('de type-guards wijzen onbekende waarden af', () => {
    expect(isStopAnchorKind('age')).toBe(true)
    expect(isStopAnchorKind('pensioen')).toBe(false)
    expect(isFireEndForm('deplete')).toBe(true)
    expect(isFireEndForm('nu-stoppen')).toBe(false)
  })
})
