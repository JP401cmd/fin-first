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
  it('savings: 3000/5000 = 60%, zonder datum geen tempo-oordeel, eta=null', () => {
    const p = computeGoalProgress(makeGoal({ goal_type: 'savings', current_value: 3000, target_value: 5000 }))
    // `paceSkipped: true` zonder streefdatum is de norm sinds R5: er is geen
    // termijn om tegen te meten, dus geen oordeel. `onTrack` blijft true zodat
    // de off-track-filters dit doel niet als probleem oppikken.
    expect(p).toEqual({ current: 3000, target: 5000, pct: 60, onTrack: true, measured: true, requiredMonthly: null, eta: null, paceSkipped: true })
  })

  it('savings: current > target → pct geclampt op 100', () => {
    const p = computeGoalProgress(makeGoal({ current_value: 9000, target_value: 5000 }))
    expect(p.pct).toBe(100)
  })

  it('target <= 0 → pct 0, onTrack false, eta null', () => {
    const p = computeGoalProgress(makeGoal({ current_value: 100, target_value: 0 }))
    expect(p).toEqual({ current: 100, target: 0, pct: 0, onTrack: false, measured: false, requiredMonthly: null, eta: null, paceSkipped: false })
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

// ── UR2-17: geen tempo-oordeel op een live-getrackt STAND-doel ─────────────
//
// De pace-toets deelt `current_value` door de maanden sinds aanmaak. Bij een
// handmatig spaardoel klopt dat (het begon op 0), bij een live stand-doel niet:
// `current_value` is dan het hele netto vermogen. Het gevolg was "OP KOERS" op
// het vrijheidsgetal-doel terwijl er €0 werd ingelegd — de meting kán daar
// niet anders uitvallen, hoe oud het doel ook is.
describe('computeGoalProgress — live-getrackt stand-doel slaat de tempo-toets over (UR2-17)', () => {
  const now = Date.now()
  /** Tessa-repro: €960.000 stand, doel €1.650.000, streefdatum jun 2039. */
  const standDoel = {
    current_value: 960_000,
    target_value: 1_650_000,
    goal_type: 'net_worth' as GoalType,
    created_at: new Date(now - 10 * DAY_MS).toISOString(),
    target_date: new Date(now + 13 * 365 * DAY_MS).toISOString(),
  }

  it('repro: zonder marker meet de pace-toets een absurd tempo en zegt "op koers"', () => {
    const p = computeGoalProgress(makeGoal(standDoel))
    // Dit is het defect zoals het was: 960.000 gedeeld door de minimale
    // meetperiode ligt honderden malen boven de vereiste maandinleg.
    expect(p.paceSkipped).toBe(false)
    expect(p.onTrack).toBe(true)
    expect(p.requiredMonthly).toBeGreaterThan(0)
  })

  it('vrijheidsgetal-doel: tempo-toets overgeslagen, geen vals "op koers"-oordeel', () => {
    const p = computeGoalProgress(makeGoal({
      ...standDoel,
      metadata: { standaardDoel: 'vrijheidsgetal' },
    }))
    expect(p.paceSkipped).toBe(true)
    // Geen alarm (dat zou net zo onterecht zijn), maar het scherm mag hier geen
    // stoplicht op baseren — dát is wat `paceSkipped` afdwingt.
    expect(p.onTrack).toBe(true)
    // De STAND is wél gemeten: "Net begonnen" zou hier onwaar zijn.
    expect(p.measured).toBe(true)
    // De lat blijft een eerlijke uitspraak en verdwijnt niet van de kaart.
    expect(p.requiredMonthly).toBeGreaterThan(0)
    expect(p.pct).toBe(58)
  })

  it('doelbasis-doel (metadata.sync === "auto") krijgt dezelfde behandeling', () => {
    const p = computeGoalProgress(makeGoal({ ...standDoel, metadata: { sync: 'auto' } }))
    expect(p.paceSkipped).toBe(true)
  })

  it('handmatig doel met dezelfde cijfers behoudt zijn tempo-oordeel (regressie)', () => {
    const achter = computeGoalProgress(makeGoal({
      current_value: 100,
      target_value: 50_000,
      created_at: new Date(now - 400 * DAY_MS).toISOString(),
      target_date: new Date(now + 60 * DAY_MS).toISOString(),
      metadata: { bron: 'parameter' }, // andere marker: géén stand-doel
    }))
    expect(achter.paceSkipped).toBe(false)
    expect(achter.onTrack).toBe(false)
  })

  it('stand-doel ZONDER streefdatum: ook geen oordeel — maar nu via paceSkipped', () => {
    const p = computeGoalProgress(makeGoal({
      current_value: 960_000,
      target_value: 1_650_000,
      metadata: { standaardDoel: 'vrijheidsgetal' },
    }))
    // Deze test las eerder `paceSkipped: false` met de redenering "er was al
    // geen toets, dus er is niets overgeslagen". Sinds R5 is dat omgedraaid:
    // juist omdát er niets te toetsen valt, hoort het scherm géén oordeel te
    // tonen — en `paceSkipped` is het kanaal dat dat afdwingt. Zonder streefdatum
    // kwam het anders alsnog als groen "Op koers" op het scherm.
    expect(p.paceSkipped).toBe(true)
    expect(p.onTrack).toBe(true)
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
    expect(p).toEqual({ current: 0, target: 58, pct: 0, onTrack: false, measured: false, requiredMonthly: null, eta: null, paceSkipped: false })
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
    expect(p).toEqual({ current: 60, target: 0, pct: 0, onTrack: false, measured: false, requiredMonthly: null, eta: null, paceSkipped: false })
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
    // Uitgebreid 20 sep 2026: `retirement_expense` — minder uitgeven ná je pensioen maakt
    // het plan haalbaarder, dus lager is beter. `legacy_amount` staat hier bewust NIET:
    // dat is een streefBEDRAG dat je opbouwt (zelfde richting als `end_balance`), ook al is
    // de hefboom-richting van dezelfde knop 'dalend'.
    const downTypes: GoalType[] = ['fire_age', 'debt_free_date', 'tax_burden', 'retirement_expense']
    for (const type of Object.keys(GOAL_TYPE_META) as GoalType[]) {
      if (downTypes.includes(type)) {
        expect(GOAL_TYPE_META[type].direction, type).toBe('down')
      } else {
        expect(GOAL_TYPE_META[type].direction, type).toBeUndefined()
      }
    }
  })

  it('plan_coverage (ADR 0145): %/1/0–100, up (default), viaLab, GEEN doelbasis (eigenaarsbesluit), bron horizon-kernel', () => {
    const m = GOAL_TYPE_META.plan_coverage
    expect(m.unit).toBe('%')
    expect(m.step).toBe('1')
    expect(m.min).toBe(0)
    expect(m.max).toBe(100)
    expect(m.direction).toBeUndefined() // default 'up': meer dekking is beter
    expect(m.viaLab).toBe(true)
    expect(m.metricBasis).toBe(false)
    expect(m.metricSource).toBe('horizon-kernel')
    expect(m.supportsAssetLink).toBe(false)
    expect(m.supportsDebtLink).toBe(false)
    expect(GOAL_TYPE_LABELS.plan_coverage).toBe('Plan gedekt')
    expect(GOAL_TYPE_ICONS.plan_coverage).toBe('ShieldCheck')
    expect(formatGoalValue(78.4, 'plan_coverage')).toBe('78,4%')
    expect(goalValueLabels('plan_coverage')).toEqual({ target: 'Doel-dekking (%)', current: 'Huidige dekking (%)' })
    // Bereikt-toets: richting up, 100 van 100.
    expect(isGoalReached('plan_coverage', 100, 100)).toBe(true)
    expect(isGoalReached('plan_coverage', 78, 100)).toBe(false)
  })

  it('viaLab alleen op de lab-types; savings_rate/salary blijven vrij aanmaakbaar', () => {
    const labTypes: GoalType[] = [
      'expected_return',
      'fire_age',
      'plan_coverage',
      // De drie knop-doelen (20 sep 2026) ontstaan uitsluitend via /api/toekomst-doel.
      'extra_deposit',
      'retirement_expense',
      'legacy_amount',
    ]
    for (const type of Object.keys(GOAL_TYPE_META) as GoalType[]) {
      const expected = labTypes.includes(type)
      expect(Boolean(GOAL_TYPE_META[type].viaLab)).toBe(expected)
    }
    // Expliciet: de instelbare parameter-achtige types blijven handmatig.
    expect(GOAL_TYPE_META.savings_rate.viaLab).toBeFalsy()
    expect(GOAL_TYPE_META.salary.viaLab).toBeFalsy()
  })

  it('de drie knop-doelen (20 sep 2026): lab-only, GEEN doelbasis; twee gemeten uit de kernel, extra inleg bewust niet', () => {
    const knopTypes: GoalType[] = ['extra_deposit', 'retirement_expense', 'legacy_amount']
    for (const type of knopTypes) {
      const m = GOAL_TYPE_META[type]
      expect(m.viaLab, type).toBe(true)
      expect(m.metricBasis, type).toBe(false)
      // Euro-types: geen META-range (net als end_balance); de grens staat op de zod-poort.
      expect(m.min, type).toBeUndefined()
      expect(m.max, type).toBeUndefined()
      expect(m.supportsAssetLink, type).toBe(false)
      expect(m.supportsDebtLink, type).toBe(false)
    }

    // De twee MEETBARE: hun stand komt uit de canonieke kernel-run (VrijheidsgetalSnapshot).
    expect(GOAL_TYPE_META.retirement_expense.metricSource).toBe('horizon-kernel')
    expect(GOAL_TYPE_META.legacy_amount.metricSource).toBe('horizon-kernel')
    // HARDE EIS, niet cosmetisch: `metricSource` is per docstring "een belofte zonder
    // dekking" zolang er geen aanroep achter zit. Voor extra inleg BESTAAT die bron niet
    // (een storting is niet van sparen te onderscheiden), dus de sleutel blijft leeg.
    expect(GOAL_TYPE_META.extra_deposit.metricSource).toBeUndefined()

    expect(GOAL_TYPE_META.extra_deposit.unit).toBe('EUR/mnd')
    expect(GOAL_TYPE_META.retirement_expense.unit).toBe('EUR/jaar')
    expect(GOAL_TYPE_META.legacy_amount.unit).toBe('EUR')
    expect(GOAL_TYPE_LABELS.extra_deposit).toBe('Extra inleg')
    expect(GOAL_TYPE_LABELS.retirement_expense).toBe('Uitgave na pensioen')
    expect(GOAL_TYPE_LABELS.legacy_amount).toBe('Nalatenschap')
    // De eenheid moet uit de weergave blijken: €31.800 zonder "/jaar" leest als maandbedrag.
    expect(formatGoalValue(31800, 'retirement_expense')).toContain('/jaar')
    expect(formatGoalValue(500, 'extra_deposit')).toContain('/mnd')
    expect(formatGoalValue(100000, 'legacy_amount')).not.toContain('/')

    // Zonder meting (0) mag geen enkel type "bereikt" heten — ook de 'down'-tak niet,
    // die anders een vers doel meteen zou afsluiten (mét viering en een onomkeerbare
    // regel in het mijlpalenlogboek).
    expect(isGoalReached('retirement_expense', 0, 31800)).toBe(false)
    expect(isGoalReached('legacy_amount', 0, 100000)).toBe(false)
    expect(isGoalReached('extra_deposit', 0, 500)).toBe(false)
  })

  it('plan-instelling: behaald = het plan staat óp het doel, niet "voorbij" in de richting (review 22 sep 2026)', () => {
    for (const t of ['extra_deposit', 'retirement_expense', 'legacy_amount'] as const) {
      expect(GOAL_TYPE_META[t].planInstelling).toBe(true)
    }
    // Het defect: plan reserveert €100.000, de knop legt €50.000 vast → mocht NIET meteen
    // "behaald" heten (100.000 >= 50.000), want het plan draagt de verandering nog niet.
    expect(isGoalReached('legacy_amount', 100000, 50000)).toBe(false)
    // Gespiegeld voor de uitgave: plan €36.000, knop €40.000 → niet behaald (36.000 <= 40.000).
    expect(isGoalReached('retirement_expense', 36000, 40000)).toBe(false)

    // Marge = 0,5% van het doel (40.000 → €200), aan béíde kanten, op de rand zelf wél binnen.
    expect(isGoalReached('retirement_expense', 40000, 40000)).toBe(true)
    expect(isGoalReached('retirement_expense', 39800, 40000)).toBe(true)
    expect(isGoalReached('retirement_expense', 40200, 40000)).toBe(true)
    expect(isGoalReached('retirement_expense', 39799, 40000)).toBe(false)
    expect(isGoalReached('retirement_expense', 40201, 40000)).toBe(false)
    expect(isGoalReached('legacy_amount', 50250, 50000)).toBe(true)
    expect(isGoalReached('legacy_amount', 49749, 50000)).toBe(false)
    expect(isGoalReached('legacy_amount', 50251, 50000)).toBe(false)

    // Ondergrens van de marge: minimaal €1 (0,5% van €100 = €0,50 zou te krap zijn).
    expect(isGoalReached('legacy_amount', 101, 100)).toBe(true)
    expect(isGoalReached('legacy_amount', 99, 100)).toBe(true)
    expect(isGoalReached('legacy_amount', 101.01, 100)).toBe(false)
    expect(isGoalReached('legacy_amount', 98.99, 100)).toBe(false)

    // Geen meting blijft nooit behaald, ook niet bij een doel onder de marge-ondergrens.
    expect(isGoalReached('legacy_amount', 0, 0.5)).toBe(false)
    expect(isGoalReached('extra_deposit', 0, 500)).toBe(false)

    // Uitkomst-doelen houden de richtingstoets (geen regressie op end_balance).
    expect(isGoalReached('end_balance', 120000, 100000)).toBe(true)
    expect(isGoalReached('end_balance', 80000, 100000)).toBe(false)
  })
})

describe('down-doel "op koers"-speling is EENHEID-BEWUST (20 sep 2026)', () => {
  /**
   * `retirement_expense` is het eerste `down`-doel in een BEDRAG-eenheid, en het eerste
   * dat een echte meting draagt. Met de oude gedeelde marge van 0,25 (bedoeld voor jaren
   * en procentpunten) zou een plan dat één euro boven het doel ligt "niet op koers" heten
   * — 0,25 euro op €31.800 is geen speling. De marge is daarom relatief voor bedragen.
   */
  it('een bedrag-doel krijgt een relatieve marge (0,5%), niet de absolute 0,25', () => {
    const doel = (current: number) =>
      computeGoalProgress({
        goal_type: 'retirement_expense',
        current_value: current,
        target_value: 31_800,
        target_date: null,
      })
    // 0,5% van €31.800 = €159 speling.
    expect(doel(31_800 + 100).onTrack).toBe(true)
    expect(doel(31_800 + 159).onTrack).toBe(true)
    expect(doel(31_800 + 200).onTrack).toBe(false)
    // Met de oude absolute 0,25 zou €31.801 al "niet op koers" zijn — dat is de regressie.
    expect(doel(31_801).onTrack).toBe(true)
  })

  it('de drie bestaande omlaag-doelen houden hun absolute 0,25 (geen regressie)', () => {
    // fire_age (jaren): 0,25 jaar ≈ 3 maanden speling, exact als voorheen.
    const fire = (current: number) =>
      computeGoalProgress({ goal_type: 'fire_age', current_value: current, target_value: 55, target_date: null })
    expect(fire(55.25).onTrack).toBe(true)
    expect(fire(55.3).onTrack).toBe(false)
    // tax_burden (procentpunten): 0,25 pp.
    const tax = (current: number) =>
      computeGoalProgress({ goal_type: 'tax_burden', current_value: current, target_value: 30, target_date: null })
    expect(tax(30.25).onTrack).toBe(true)
    expect(tax(30.5).onTrack).toBe(false)
    // debt_free_date (decimale jaren): 0,25 jaar.
    const debt = (current: number) =>
      computeGoalProgress({ goal_type: 'debt_free_date', current_value: current, target_value: 2031, target_date: null })
    expect(debt(2031.25).onTrack).toBe(true)
    expect(debt(2031.5).onTrack).toBe(false)
  })

  it('de relatieve marge schaalt mee met de doelwaarde (geen vaste euro die overal fout is)', () => {
    const bij = (target: number, current: number) =>
      computeGoalProgress({
        goal_type: 'retirement_expense',
        current_value: current,
        target_value: target,
        target_date: null,
      }).onTrack
    // Klein doel: €5.000 → €25 speling. Groot doel: €500.000 → €2.500.
    expect(bij(5_000, 5_025)).toBe(true)
    expect(bij(5_000, 5_100)).toBe(false)
    expect(bij(500_000, 502_400)).toBe(true)
    expect(bij(500_000, 510_000)).toBe(false)
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

// ── Doel zonder streefdatum: geen oordeel, geen "Op koers" (R5) ─────────────

describe('computeGoalProgress — doel zonder streefdatum krijgt geen tempo-oordeel (R5)', () => {
  const DAG = 86400_000

  /**
   * Zonder `target_date` is er geen planning om tegen af te zetten. De motor
   * hield `onTrack` dan op `true` en `paceSkipped` op `false`, waardoor het
   * scherm er een groen "Op koers" van maakte — óók bij 0% voortgang. Dat is
   * geen oordeel maar de afwezigheid ervan, en het hoort als zodanig te tonen.
   *
   * `onTrack` blijft bewust `true`: de off-track-filters (briefing-heads-up,
   * off-track-doelenlijst, sorteringen) lezen `!onTrack` als "hier is een
   * probleem", en een ongemeten doel ís geen probleem. `paceSkipped` is het
   * kanaal dat de oordeel-TONENDE oppervlakken stil houdt.
   */
  const zonderDatum = {
    current_value: 0,
    target_value: 10_000,
    target_date: null,
    created_at: new Date(Date.now() - 200 * DAG).toISOString(),
  }

  it('slaat het tempo-oordeel over in plaats van "op koers" te claimen', () => {
    const p = computeGoalProgress(makeGoal(zonderDatum))
    expect(p.paceSkipped).toBe(true)
  })

  it('houdt onTrack op true, zodat de off-track-filters het doel niet als probleem flaggen', () => {
    const p = computeGoalProgress(makeGoal(zonderDatum))
    expect(p.onTrack).toBe(true)
  })

  it('berekent geen maandinleg zonder streefdatum — er is geen termijn', () => {
    const p = computeGoalProgress(makeGoal(zonderDatum))
    expect(p.requiredMonthly).toBeNull()
  })

  it('raakt een doel MET streefdatum niet — dat houdt zijn echte tempo-oordeel', () => {
    const p = computeGoalProgress(makeGoal({
      current_value: 0,
      target_value: 10_000,
      created_at: new Date(Date.now() - 200 * DAG).toISOString(),
      target_date: new Date(Date.now() + 200 * DAG).toISOString(),
    }))
    expect(p.paceSkipped).toBe(false)
    expect(p.onTrack).toBe(false)
  })
})
