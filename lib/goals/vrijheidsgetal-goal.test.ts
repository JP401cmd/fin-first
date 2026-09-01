import { describe, it, expect } from 'vitest'
import {
  VRIJHEIDSGETAL_PRESET_KEY,
  isVrijheidsgetalGoal,
  buildVrijheidsgetalSnapshot,
  applyVrijheidsgetalSync,
  pickEndBalanceAtEndAge,
  type VrijheidsgetalSnapshot,
} from '@/lib/goals/vrijheidsgetal-goal'
import { computeGoalProgress } from '@/lib/goal-data'
import { computeFreedomProgressWithBasis } from '@/lib/core-metrics'
import { deriveCountdown } from '@/lib/horizon/fire-scalar'

/**
 * Bevinding C10 — het FIRE-antwoord liep dertien jaar uiteen tussen /overzicht
 * en /toekomst/doelen. Deze suite legt de fix vast: het vrijheidsgetal-doel
 * consumeert dezelfde canonieke grondslag en dezelfde countdown-datum als de
 * FIRE-prognose, en niet-gemarkeerde doelen blijven met rust.
 */

// De cijfers uit de bevinding (persona Tessa): het doel stond statisch op
// €960.000 van €1.650.000 met streefdatum aug 2039, terwijl /overzicht
// €1.585.000 / 99% / "nog 0j 1m" toonde.
const OPGESLAGEN = {
  goal_type: 'net_worth' as const,
  current_value: 960_000,
  target_value: 1_650_000,
  target_date: '2039-08-01',
  metadata: { standaardDoel: VRIJHEIDSGETAL_PRESET_KEY },
}

/** Canonieke stand zoals /overzicht 'm berekent: INCL.-woning grondslag. */
const CANONIEK = {
  homeExcludedFromFire: false,
  netWorthInclHome: 1_585_000,
  fireEligibleNetWorth: 960_000,
  requiredNetWorthInclHome: 1_594_000,
  requiredPortfolioExclHome: 969_000,
  fireAgeFractional: 42.1,
  currentAge: 42.0,
}

describe('isVrijheidsgetalGoal', () => {
  it('herkent de preset-marker', () => {
    expect(isVrijheidsgetalGoal({ metadata: { standaardDoel: 'vrijheidsgetal' } })).toBe(true)
  })

  it('laat andere net_worth-doelen met rust (noodfonds, erfenis, vrij doel)', () => {
    // Precies het risico uit de analyse: niet elk vermogensdoel is een FIRE-doel.
    expect(isVrijheidsgetalGoal({ metadata: { standaardDoel: 'noodfonds' } })).toBe(false)
    expect(isVrijheidsgetalGoal({ metadata: {} })).toBe(false)
    expect(isVrijheidsgetalGoal({ metadata: null })).toBe(false)
    expect(isVrijheidsgetalGoal({})).toBe(false)
    // Lab-parameterdoelen hebben een ándere marker en blijven op hun eigen pad.
    expect(isVrijheidsgetalGoal({ metadata: { bron: 'parameter' } })).toBe(false)
  })
})

describe('buildVrijheidsgetalSnapshot', () => {
  it('kiest teller én noemer op DEZELFDE grondslag (incl. woning = default)', () => {
    const snap = buildVrijheidsgetalSnapshot(CANONIEK)
    expect(snap.currentValue).toBe(CANONIEK.netWorthInclHome)
    expect(snap.targetValue).toBe(CANONIEK.requiredNetWorthInclHome)
  })

  it('valt op de EXCL.-grondslag terug wanneer de woning is uitgesloten van FIRE', () => {
    const snap = buildVrijheidsgetalSnapshot({ ...CANONIEK, homeExcludedFromFire: true })
    expect(snap.currentValue).toBe(CANONIEK.fireEligibleNetWorth)
    expect(snap.targetValue).toBe(CANONIEK.requiredPortfolioExclHome)
  })

  it('levert exact dezelfde datum als de FIRE-countdown op /overzicht', () => {
    const snap = buildVrijheidsgetalSnapshot(CANONIEK)
    expect(snap.eta).toBe(deriveCountdown(CANONIEK.fireAgeFractional, CANONIEK.currentAge).fireDate)
    expect(snap.eta).not.toBeNull()
  })

  it('geeft geen datum zonder kernel-uitkomst of zonder leeftijd', () => {
    expect(buildVrijheidsgetalSnapshot({ ...CANONIEK, fireAgeFractional: null }).eta).toBeNull()
    expect(buildVrijheidsgetalSnapshot({ ...CANONIEK, currentAge: null }).eta).toBeNull()
  })

  it('geeft geen doelbedrag wanneer de motor er geen kon leveren', () => {
    const snap = buildVrijheidsgetalSnapshot({
      ...CANONIEK,
      requiredNetWorthInclHome: null,
      requiredPortfolioExclHome: null,
    })
    expect(snap.targetValue).toBeNull()
  })
})

describe('applyVrijheidsgetalSync', () => {
  it('overschrijft huidige waarde én doelbedrag van het gemarkeerde doel', () => {
    const goals = [{ ...OPGESLAGEN }]
    const synced = applyVrijheidsgetalSync(goals, buildVrijheidsgetalSnapshot(CANONIEK))
    expect(synced).toBe(1)
    expect(goals[0].current_value).toBe(1_585_000)
    expect(goals[0].target_value).toBe(1_594_000)
  })

  it('raakt niet-gemarkeerde doelen niet aan', () => {
    const ander = { ...OPGESLAGEN, metadata: { standaardDoel: 'noodfonds' } }
    const goals = [ander]
    expect(applyVrijheidsgetalSync(goals, buildVrijheidsgetalSnapshot(CANONIEK))).toBe(0)
    expect(goals[0].current_value).toBe(960_000)
    expect(goals[0].target_value).toBe(1_650_000)
  })

  it('is alles-of-niets: zonder canoniek doelbedrag blijft ÓÓK de huidige waarde staan', () => {
    // Een canonieke teller tegen een opgeslagen noemer is exact de
    // grondslag-menging die deze fix opheft — dus liever niets synchroniseren.
    const goals = [{ ...OPGESLAGEN }]
    const snap = buildVrijheidsgetalSnapshot({
      ...CANONIEK,
      requiredNetWorthInclHome: null,
      requiredPortfolioExclHome: null,
    })
    expect(applyVrijheidsgetalSync(goals, snap)).toBe(0)
    expect(goals[0].current_value).toBe(960_000)
    expect(goals[0].target_value).toBe(1_650_000)
  })

  it('doet niets zonder snapshot (motor kon niet draaien)', () => {
    const goals = [{ ...OPGESLAGEN }]
    expect(applyVrijheidsgetalSync(goals, null)).toBe(0)
    expect(goals[0].current_value).toBe(960_000)
  })
})

describe('pickEndBalanceAtEndAge — rij-selectie op een reeds gedraaide kernel-run', () => {
  it('kiest de laatste rij met age <= displayEndAge en slaat rijen erna over', () => {
    const sim = {
      rows: [
        { age: 80, endPortfolio: 100 },
        { age: 90, endPortfolio: 200 },
        { age: 95, endPortfolio: 300 },
      ],
      displayEndAge: 90,
    }
    expect(pickEndBalanceAtEndAge(sim)).toBe(200)
  })

  it('geen enkele rij binnen bereik → null (nooit het saldo van een andere leeftijd)', () => {
    const sim = {
      rows: [{ age: 91, endPortfolio: 200 }, { age: 95, endPortfolio: 300 }],
      displayEndAge: 90,
    }
    expect(pickEndBalanceAtEndAge(sim)).toBeNull()
  })

  it('lege rijen → null', () => {
    expect(pickEndBalanceAtEndAge({ rows: [], displayEndAge: 90 })).toBeNull()
  })

  it('ontbrekende/null sim → null', () => {
    expect(pickEndBalanceAtEndAge(null)).toBeNull()
    expect(pickEndBalanceAtEndAge(undefined)).toBeNull()
  })

  it('niet-eindige displayEndAge → null', () => {
    expect(
      pickEndBalanceAtEndAge({ rows: [{ age: 80, endPortfolio: 100 }], displayEndAge: NaN }),
    ).toBeNull()
  })

  it('slaat rijen met een niet-eindige age over', () => {
    const sim = {
      rows: [{ age: NaN, endPortfolio: 999 }, { age: 70, endPortfolio: 150 }],
      displayEndAge: 90,
    }
    expect(pickEndBalanceAtEndAge(sim)).toBe(150)
  })
})

describe('C10-regressie: één antwoord op de kernvraag', () => {
  it('doelkaart en FIRE-prognose komen op hetzelfde percentage uit', () => {
    const goals = [{ ...OPGESLAGEN }]
    const snapshot: VrijheidsgetalSnapshot = buildVrijheidsgetalSnapshot(CANONIEK)

    // Vóór de sync: het defect. 58% op de doelkaart naast 99% op /overzicht.
    const voor = computeGoalProgress(goals[0])
    expect(voor.pct).toBe(58)
    expect(voor.eta).toBe('aug 2039')

    applyVrijheidsgetalSync(goals, snapshot)
    const na = computeGoalProgress(goals[0], { etaOverride: snapshot.eta })

    const freedomPct = computeFreedomProgressWithBasis(CANONIEK)
    expect(na.pct).toBe(Math.round(freedomPct))
    // Het defect zelf: dit was 58 vs. 99.
    expect(na.pct).not.toBe(voor.pct)
    // En de datum komt uit de countdown, niet uit het opgeslagen target_date.
    expect(na.eta).toBe(snapshot.eta)
    expect(na.eta).not.toBe('aug 2039')
  })

  it('etaOverride laat `target_date` intact als meetlat voor "op koers"', () => {
    // De streefdatum blijft de ambitie van de gebruiker; alleen de GETOONDE
    // datum wordt de projectie. Zonder override blijft alles zoals het was.
    const goal = { ...OPGESLAGEN, current_value: 1_585_000, target_value: 1_594_000 }
    const zonder = computeGoalProgress(goal)
    const met = computeGoalProgress(goal, { etaOverride: 'mrt 2027' })
    expect(zonder.eta).toBe('aug 2039')
    expect(met.eta).toBe('mrt 2027')
    expect(met.onTrack).toBe(zonder.onTrack)
    expect(met.pct).toBe(zonder.pct)
  })

  it('etaOverride null laat het bestaande target_date-gedrag ongemoeid', () => {
    const goal = { ...OPGESLAGEN }
    expect(computeGoalProgress(goal, { etaOverride: null }).eta).toBe('aug 2039')
    expect(computeGoalProgress(goal, {}).eta).toBe('aug 2039')
  })
})
