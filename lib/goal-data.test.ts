/**
 * Unit-tests voor `lib/goal-data.ts` — de doel-metadata en de voortgangsmotor
 * `computeGoalProgress`.
 *
 * Focus:
 *  1. REGRESSIE — de bestaande (up-)doel-types moeten zich exact hetzelfde
 *     blijven gedragen na de introductie van richting-bewuste voortgang.
 *  2. Twee nieuwe lab-gegenereerde types (`expected_return`, `fire_age`):
 *     meta-velden, `formatGoalValue`, `goalValueLabels` en — voor `fire_age` —
 *     de `direction: 'down'`-tak (lager-is-beter).
 */

import { describe, it, expect } from 'vitest'
import {
  computeGoalProgress,
  formatGoalValue,
  goalValueLabels,
  isGoalReached,
  GOAL_TYPE_META,
  GOAL_TYPE_LABELS,
  GOAL_TYPE_ICONS,
  type Goal,
  type GoalType,
} from './goal-data'
import { GOAL_PACE_DAYS_PER_MONTH, GOAL_PACE_GRACE_DAYS } from './constants'

/** Minimale, volledig getypeerde Goal-fixture — alleen de velden die
 *  computeGoalProgress leest hoeven per test te worden overschreven. */
function makeGoal(overrides: Partial<Goal>): Goal {
  return {
    id: 'test-goal', user_id: 'test-user', name: 'Doel', description: null,
    goal_type: 'savings', target_value: 5000, current_value: 0, target_date: null,
    linked_asset_id: null, linked_debt_id: null, budget_id: null, custom_unit: null,
    icon: 'PiggyBank', color: 'emerald', is_completed: false, completed_at: null,
    sort_order: 0, ownership: 'personal', household_id: null,
    created_at: '2026-01-01', updated_at: '2026-01-01',
    ...overrides,
  }
}

// ── 1. Regressie: bestaande 'up'-types byte-identiek ───────────────────────

describe('computeGoalProgress — bestaande up-types (regressie)', () => {
  it('savings: 3000/5000 = 60%, zonder datum onTrack=true, eta=null', () => {
    const p = computeGoalProgress(makeGoal({ goal_type: 'savings', current_value: 3000, target_value: 5000 }))
    expect(p).toEqual({ current: 3000, target: 5000, pct: 60, onTrack: true, measured: true, requiredMonthly: null, eta: null })
  })

  it('savings: current > target → pct geclampt op 100', () => {
    const p = computeGoalProgress(makeGoal({ current_value: 9000, target_value: 5000 }))
    expect(p.pct).toBe(100)
  })

  it('target <= 0 → pct 0, onTrack false, eta null', () => {
    const p = computeGoalProgress(makeGoal({ current_value: 100, target_value: 0 }))
    expect(p).toEqual({ current: 100, target: 0, pct: 0, onTrack: false, measured: false, requiredMonthly: null, eta: null })
  })

  it('debt_payoff: 4000 afgelost van 10000 = 40%', () => {
    const p = computeGoalProgress(makeGoal({ goal_type: 'debt_payoff', current_value: 4000, target_value: 10000 }))
    expect(p.pct).toBe(40)
    expect(p.onTrack).toBe(true)
  })

  it('savings_rate blijft up-richting (hoger is beter): 20/40 = 50%', () => {
    const p = computeGoalProgress(makeGoal({ goal_type: 'savings_rate', current_value: 20, target_value: 40 }))
    expect(p.pct).toBe(50)
    expect(p.onTrack).toBe(true)
  })

  it('met target_date: ruim vóór op schema → onTrack true + eta gezet', () => {
    // Regressie-anker uit de tijd-fractie-heuristiek; blijft geldig onder de
    // pace-toets. created_at 100 dagen terug (≈3,29 mnd gemeten), target_date
    // 100 dagen vooruit (≈3,29 mnd te gaan): benodigd €2.000/3,29 ≈ €609/mnd,
    // feitelijk €3.000/3,29 ≈ €913/mnd → ruim boven de 10%-marge.
    const now = Date.now()
    const created = new Date(now - 100 * 86400_000).toISOString()
    const target = new Date(now + 100 * 86400_000).toISOString()
    const p = computeGoalProgress(makeGoal({
      current_value: 3000, target_value: 5000, // 60%
      created_at: created, target_date: target,
    }))
    expect(p.pct).toBe(60)
    expect(p.onTrack).toBe(true)
    expect(p.eta).not.toBeNull()
  })

  it('met target_date: achter op schema → onTrack false', () => {
    // Benodigd €4.500/3,29 ≈ €1.370/mnd, feitelijk €500/3,29 ≈ €152/mnd.
    const now = Date.now()
    const created = new Date(now - 100 * 86400_000).toISOString()
    const target = new Date(now + 100 * 86400_000).toISOString()
    const p = computeGoalProgress(makeGoal({
      current_value: 500, target_value: 5000, // 10%
      created_at: created, target_date: target,
    }))
    expect(p.pct).toBe(10)
    expect(p.onTrack).toBe(false)
    expect(p.eta).not.toBeNull()
  })
})

// ── 1b. Pace-toets: bevindingen M31 + M32 ─────────────────────────────────
//
// De on-track-toets voor 'up'-doelen met streefdatum mat een lineaire
// TIJD-FRACTIE sinds `created_at`; `target_value` kwam er niet in voor. Gevolg:
//  · M32 — een doel zwaarder maken (hoger bedrag, eerdere deadline) liet de
//    status ongewijzigd op "op koers" staan;
//  · M31 — een zojuist aangemaakt doel stond per constructie meteen "achter op
//    planning", omdat `now` altijd nét ná `created_at` ligt.
// Vervangen door: benodigde inleg/maand tot de streefdatum vs. feitelijke
// inleg/maand sinds aanmaak (eigenaarsbesluit 26-08-2026, optie A).

const DAY_MS = 86400_000

describe('computeGoalProgress — pace-toets (M32: doelbedrag telt mee)', () => {
  it('M32-repro: doel verzwaren + deadline vervroegen maakt de status SLECHTER, niet gelijk', () => {
    const now = Date.now()
    // Doel bestaat net; er staat al €1.500 op (dus meetbaar — zie M31-blok).
    const created = new Date(now - 2 * DAY_MS).toISOString()

    const voor = computeGoalProgress(makeGoal({
      current_value: 1500, target_value: 5000, // 30%
      created_at: created,
      target_date: new Date(now + 340 * DAY_MS).toISOString(), // ± jul 2027
    }))
    const na = computeGoalProgress(makeGoal({
      current_value: 1500, target_value: 9000, // 17%
      created_at: created, // een PATCH raakt created_at niet
      target_date: new Date(now + 129 * DAY_MS).toISOString(), // ± dec 2026
    }))

    expect(voor.pct).toBe(30)
    expect(voor.onTrack).toBe(true)
    expect(na.pct).toBe(17)
    expect(na.onTrack).toBe(false) // de kern van M32: het oordeel verslechtert
    // En de lat is zichtbaar omhoog gegaan.
    expect(na.requiredMonthly).toBeGreaterThan(voor.requiredMonthly as number)
  })

  it('target_value beïnvloedt de uitkomst bij IDENTIEKE created_at/target_date', () => {
    // Precies wat de oude tijd-fractie-heuristiek structureel niet kon: twee
    // doelen met dezelfde looptijd en dezelfde inleg, maar een ander doelbedrag.
    const now = Date.now()
    const created = new Date(now - 60 * DAY_MS).toISOString()
    const target_date = new Date(now + 60 * DAY_MS).toISOString()

    const haalbaar = computeGoalProgress(makeGoal({
      current_value: 2000, target_value: 4000, created_at: created, target_date,
    }))
    const onhaalbaar = computeGoalProgress(makeGoal({
      current_value: 2000, target_value: 1_000_000, created_at: created, target_date,
    }))

    expect(haalbaar.onTrack).toBe(true)
    expect(onhaalbaar.onTrack).toBe(false)
  })

  it('requiredMonthly = resterend bedrag gedeeld door de maanden tot de streefdatum', () => {
    const now = Date.now()
    const p = computeGoalProgress(makeGoal({
      current_value: 1000, target_value: 5000,
      created_at: new Date(now - 30 * DAY_MS).toISOString(),
      target_date: new Date(now + 120 * DAY_MS).toISOString(),
    }))
    const maandenTeGaan = 120 / GOAL_PACE_DAYS_PER_MONTH
    expect(p.requiredMonthly).toBeCloseTo(4000 / maandenTeGaan, 2)
  })

  it('vloer op de meetperiode: een verse inleg deelt niet door bijna-nul tijd', () => {
    // Zonder GOAL_PACE_MIN_MEASURE_MONTHS zou €10 die één minuut geleden
    // binnenkwam een tempo van duizenden euro's per maand suggereren en élk
    // doel triviaal "op koers" maken.
    const now = Date.now()
    const p = computeGoalProgress(makeGoal({
      current_value: 10, target_value: 50_000,
      created_at: new Date(now - 60_000).toISOString(),
      target_date: new Date(now + 365 * DAY_MS).toISOString(),
    }))
    expect(p.measured).toBe(true) // current > 0 → er is iets te meten
    expect(p.onTrack).toBe(false)
  })

  it('verstreken streefdatum met een onbereikt doel is niet "op koers"', () => {
    const now = Date.now()
    const p = computeGoalProgress(makeGoal({
      current_value: 2000, target_value: 5000,
      created_at: new Date(now - 400 * DAY_MS).toISOString(),
      target_date: new Date(now - 10 * DAY_MS).toISOString(),
    }))
    expect(p.onTrack).toBe(false)
    expect(p.requiredMonthly).toBeNull() // geen maand meer om iets in te halen
  })

  it('verstreken streefdatum met een BEHAALD doel blijft op koers', () => {
    const now = Date.now()
    const p = computeGoalProgress(makeGoal({
      current_value: 5000, target_value: 5000,
      created_at: new Date(now - 400 * DAY_MS).toISOString(),
      target_date: new Date(now - 10 * DAY_MS).toISOString(),
    }))
    expect(p.pct).toBe(100)
    expect(p.onTrack).toBe(true)
  })

  it('zonder created_at (lichte projectie zoals TopGoal): geen pace-oordeel, wél requiredMonthly', () => {
    const now = Date.now()
    const p = computeGoalProgress({
      goal_type: 'savings', current_value: 100, target_value: 5000,
      target_date: new Date(now + 90 * DAY_MS).toISOString(),
    })
    expect(p.onTrack).toBe(true) // geen meetperiode → geen vals alarm
    expect(p.measured).toBe(true)
    expect(p.requiredMonthly).not.toBeNull()
  })
})

describe('computeGoalProgress — genadeperiode voor een vers doel (M31)', () => {
  it('M31-repro: zojuist aangemaakt doel op €0 is NIET "achter op planning"', () => {
    const now = Date.now()
    const p = computeGoalProgress(makeGoal({
      current_value: 0, target_value: 5000,
      created_at: new Date(now - 5_000).toISOString(), // 5 seconden geleden
      target_date: new Date(now + 330 * DAY_MS).toISOString(), // elf maanden
    }))
    expect(p.pct).toBe(0)
    expect(p.measured).toBe(false) // niets te meten → scherm toont "Net begonnen"
    expect(p.onTrack).toBe(true) // geen vals alarm op ENIG oppervlak
    expect(p.requiredMonthly).not.toBeNull() // de lat is wél al bekend
  })

  it('binnen de genadeperiode maar mét bijdrage: wél meten (M32 hoeft niet te wachten)', () => {
    const now = Date.now()
    const p = computeGoalProgress(makeGoal({
      current_value: 1500, target_value: 9000,
      created_at: new Date(now - 1 * DAY_MS).toISOString(),
      target_date: new Date(now + 129 * DAY_MS).toISOString(),
    }))
    expect(p.measured).toBe(true)
  })

  it('ná de genadeperiode is uitblijvende inleg wél een signaal', () => {
    const now = Date.now()
    const p = computeGoalProgress(makeGoal({
      current_value: 0, target_value: 5000,
      created_at: new Date(now - (GOAL_PACE_GRACE_DAYS + 1) * DAY_MS).toISOString(),
      target_date: new Date(now + 330 * DAY_MS).toISOString(),
    }))
    expect(p.measured).toBe(true)
    expect(p.onTrack).toBe(false)
  })

  it('doel ZONDER streefdatum blijft ongemoeid: gemeten, op koers, geen maandlat', () => {
    const p = computeGoalProgress(makeGoal({ current_value: 0, target_value: 5000 }))
    expect(p.measured).toBe(true)
    expect(p.onTrack).toBe(true)
    expect(p.requiredMonthly).toBeNull()
  })
})

// ── 2. Nieuwe richting: 'down' (fire_age, lager-is-beter) ──────────────────

describe('computeGoalProgress — down-richting (fire_age)', () => {
  it('op koers: huidige leeftijd == doel → 100% en onTrack', () => {
    const p = computeGoalProgress(makeGoal({ goal_type: 'fire_age', current_value: 58, target_value: 58 }))
    expect(p.pct).toBe(100)
    expect(p.onTrack).toBe(true)
    expect(p.eta).toBeNull()
  })

  it('niet op koers: huidige leeftijd ver boven doel → <100% en niet onTrack', () => {
    // 58/62 = 0,935 → 94%; 62 > 58 + 0,25 → niet op koers.
    const p = computeGoalProgress(makeGoal({ goal_type: 'fire_age', current_value: 62, target_value: 58 }))
    expect(p.pct).toBe(94)
    expect(p.onTrack).toBe(false)
  })

  it('current 0 (of null → 0): 0% en niet onTrack', () => {
    const p = computeGoalProgress(makeGoal({ goal_type: 'fire_age', current_value: 0, target_value: 58 }))
    expect(p).toEqual({ current: 0, target: 58, pct: 0, onTrack: false, measured: false, requiredMonthly: null, eta: null })
  })

  it('doel bereikt met overshoot (current < target) → pct geclampt op 100 + onTrack', () => {
    // Eerder vrij dan gepland: 58/55 = 105% → clamp 100; 55 <= 58,25 → op koers.
    const p = computeGoalProgress(makeGoal({ goal_type: 'fire_age', current_value: 55, target_value: 58 }))
    expect(p.pct).toBe(100)
    expect(p.onTrack).toBe(true)
  })

  it('tolerantie-grens: current == target + 0,25 → nog net op koers', () => {
    const p = computeGoalProgress(makeGoal({ goal_type: 'fire_age', current_value: 58.25, target_value: 58 }))
    expect(p.onTrack).toBe(true)
  })

  it('tolerantie-grens: current net boven target + 0,25 → niet op koers', () => {
    const p = computeGoalProgress(makeGoal({ goal_type: 'fire_age', current_value: 58.5, target_value: 58 }))
    expect(p.onTrack).toBe(false)
  })

  it('target <= 0 (ongeldig) → 0% en niet onTrack', () => {
    const p = computeGoalProgress(makeGoal({ goal_type: 'fire_age', current_value: 60, target_value: 0 }))
    expect(p).toEqual({ current: 60, target: 0, pct: 0, onTrack: false, measured: false, requiredMonthly: null, eta: null })
  })

  it('down-tak negeert target_date (geen eta, geen tijdlijn-onTrack)', () => {
    const now = Date.now()
    const target = new Date(now + 100 * 86400_000).toISOString()
    const p = computeGoalProgress(makeGoal({
      goal_type: 'fire_age', current_value: 62, target_value: 58, target_date: target,
    }))
    expect(p.eta).toBeNull()
    expect(p.onTrack).toBe(false)
  })
})

// ── 1c. isGoalReached — de ENE richting-bewuste bereikt-toets (ADR 0125) ────

describe('isGoalReached', () => {
  it('up-doel: bereikt zodra current >= target', () => {
    expect(isGoalReached('savings', 100, 100)).toBe(true)
    expect(isGoalReached('savings', 101, 100)).toBe(true)
    expect(isGoalReached('savings', 99, 100)).toBe(false)
  })

  it('down-doel: bereikt zodra current <= target (lager is beter)', () => {
    expect(isGoalReached('fire_age', 58, 58)).toBe(true)
    expect(isGoalReached('fire_age', 50, 58)).toBe(true) // eerder vrij dan gepland
    expect(isGoalReached('fire_age', 62, 58)).toBe(false)
  })

  it('target <= 0 → nooit bereikt, in beide richtingen', () => {
    expect(isGoalReached('savings', 100, 0)).toBe(false)
    expect(isGoalReached('savings', 100, -50)).toBe(false)
    expect(isGoalReached('fire_age', 40, 0)).toBe(false)
    expect(isGoalReached('fire_age', 40, -10)).toBe(false)
  })

  it('niet-eindige invoer levert nooit "bereikt"', () => {
    expect(isGoalReached('savings', NaN, 100)).toBe(false)
    expect(isGoalReached('savings', 100, NaN)).toBe(false)
    expect(isGoalReached('savings', Infinity, 100)).toBe(false)
    expect(isGoalReached('fire_age', -Infinity, 58)).toBe(false)
  })

  it('pint de twee historische fouten uit de ADR 0125-analyse expliciet', () => {
    // Een vrijheidsleeftijd van 46 tegen een doel van 55 IS bereikt — een kale
    // `current >= target` (46 >= 55) zou dit ten onrechte missen.
    expect(isGoalReached('fire_age', 46, 55)).toBe(true)
    // Een belastingdruk van 35% tegen een doel van 30% is NIET bereikt — een
    // kale `current >= target` (35 >= 30) zou dit ten onrechte vieren.
    expect(isGoalReached('tax_burden', 35, 30)).toBe(false)
  })

  it('schuldenvrij-datum (down): eerder dan het doeljaar is bereikt, later niet', () => {
    expect(isGoalReached('debt_free_date', 2029.5, 2031)).toBe(true)
    expect(isGoalReached('debt_free_date', 2035, 2031)).toBe(false)
  })
})

// ── 3. Meta-velden ─────────────────────────────────────────────────────────

describe('GOAL_TYPE_META — nieuwe types', () => {
  it('expected_return: %/0.1/0–20, up (default), viaLab', () => {
    const m = GOAL_TYPE_META.expected_return
    expect(m.unit).toBe('%')
    expect(m.step).toBe('0.1')
    expect(m.min).toBe(0)
    expect(m.max).toBe(20)
    expect(m.direction).toBeUndefined() // default 'up'
    expect(m.viaLab).toBe(true)
    expect(m.group).toBe('Financieel')
    expect(m.freedomTimeRelevant).toBe(false)
  })

  it('fire_age: jaar/0.5/18–100, direction down, viaLab', () => {
    const m = GOAL_TYPE_META.fire_age
    expect(m.unit).toBe('jaar')
    expect(m.step).toBe('0.5')
    expect(m.min).toBe(18)
    expect(m.max).toBe(100)
    expect(m.direction).toBe('down')
    expect(m.viaLab).toBe(true)
    expect(m.group).toBe('Financieel')
    expect(m.freedomTimeRelevant).toBe(false)
  })

  it('labels en iconen aanwezig voor beide nieuwe types', () => {
    expect(GOAL_TYPE_LABELS.expected_return).toBe('Verwacht rendement')
    expect(GOAL_TYPE_LABELS.fire_age).toBe('Vrijheidsleeftijd')
    expect(GOAL_TYPE_ICONS.expected_return).toBe('Coins')
    expect(GOAL_TYPE_ICONS.fire_age).toBe('Hourglass')
  })

  it('elke doel-icoonnaam resolvet in de gedeelde iconMap (geen Circle-fallback) — bug 1 sep 2026', async () => {
    // De check-in (en elk oppervlak dat BudgetIcon gebruikt) rendert
    // doel-iconen op naam via components/app/budget-shared. Een naam die daar
    // ontbreekt valt stil terug op Circle — 'Target' (de goal-form-default!)
    // en 'Sun' ontbraken. Deze test pint dat elke GOAL_TYPE_ICONS-waarde een
    // echte mapping heeft.
    const { iconMap } = await import('@/components/app/budget-shared')
    for (const [type, iconName] of Object.entries(GOAL_TYPE_ICONS)) {
      expect(iconMap[iconName], `icoon '${iconName}' (type '${type}') ontbreekt in iconMap`).toBeDefined()
    }
  })
})

describe('GOAL_TYPE_META — vlaggen op bestaande types (regressie)', () => {
  it('alleen de drie lager-is-beter-types hebben direction "down"; alle andere zijn up (undefined)', () => {
    // Uitgebreid 1 sep 2026: `debt_free_date` (eerder schuldenvrij is beter) en
    // `tax_burden` (minder belasting is beter) kwamen erbij naast `fire_age`.
    // De lijst blijft bewust een WITTE lijst: een nieuw type erft 'up' tenzij het
    // hier expliciet wordt opgevoerd.
    const downTypes: GoalType[] = ['fire_age', 'debt_free_date', 'tax_burden']
    for (const type of Object.keys(GOAL_TYPE_META) as GoalType[]) {
      if (downTypes.includes(type)) {
        expect(GOAL_TYPE_META[type].direction, type).toBe('down')
      } else {
        expect(GOAL_TYPE_META[type].direction, type).toBeUndefined()
      }
    }
  })

  it('viaLab alleen op de twee lab-types; savings_rate/salary blijven vrij aanmaakbaar', () => {
    const labTypes: GoalType[] = ['expected_return', 'fire_age']
    for (const type of Object.keys(GOAL_TYPE_META) as GoalType[]) {
      const expected = labTypes.includes(type)
      expect(Boolean(GOAL_TYPE_META[type].viaLab)).toBe(expected)
    }
    // Expliciet: de instelbare parameter-achtige types blijven handmatig.
    expect(GOAL_TYPE_META.savings_rate.viaLab).toBeFalsy()
    expect(GOAL_TYPE_META.salary.viaLab).toBeFalsy()
  })
})

// ── 4. formatGoalValue + goalValueLabels voor de nieuwe types ──────────────

describe('formatGoalValue — nieuwe types', () => {
  it('expected_return: % met 1 decimaal (nl-NL)', () => {
    expect(formatGoalValue(6, 'expected_return')).toBe('6,0%')
    expect(formatGoalValue(7.5, 'expected_return')).toBe('7,5%')
  })

  it('fire_age: hele jaren zonder decimaal, halve jaren met komma', () => {
    expect(formatGoalValue(58, 'fire_age')).toBe('58 jaar')
    expect(formatGoalValue(58.5, 'fire_age')).toBe('58,5 jaar')
  })

  it('regressie: bestaande EUR/% formattering ongewijzigd', () => {
    expect(formatGoalValue(5000, 'savings')).toBe('€5.000')
    expect(formatGoalValue(40, 'savings_rate')).toBe('40,0%')
  })
})

describe('goalValueLabels — nieuwe types', () => {
  it('expected_return', () => {
    expect(goalValueLabels('expected_return')).toEqual({
      target: 'Doelrendement (%)', current: 'Huidig rendement (%)',
    })
  })

  it('fire_age', () => {
    expect(goalValueLabels('fire_age')).toEqual({
      target: 'Doel-vrijheidsleeftijd', current: 'Huidige vrijheidsleeftijd',
    })
  })
})
