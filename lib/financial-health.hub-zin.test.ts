/**
 * De lopende zin onder de begroeting op /overzicht (B-069, F4 van "Topbar &
 * oordeelzin"): "Je financiële gezondheid is {band}, gezien je {pijlers}."
 *
 * De eis die hier vastligt: de zin noemt ALLEEN de pijlergroepen die in déze
 * score meetellen. Een groep valt weg op twee manieren — de module staat uit
 * (`PILLAR_MODULE_REQUIREMENTS`) of er zijn geen gegevens (`inactiveByData`) —
 * en beide wegen worden hieronder bewandeld, aan béíde uiteinden: alle vier de
 * groepen, precies één, en geen enkele.
 */

import { describe, it, expect } from 'vitest'
import {
  computeHealthScoreFromInputs,
  healthScoreBasisPhrase,
  healthScorePillarWords,
  type HealthPillar,
  type HealthScore,
  type HealthScoreInput,
} from '@/lib/financial-health'

// Alle zeven indicatoren actief (zelfde basis als financial-health.test.ts).
const baseInput: HealthScoreInput = {
  effectiveSavingsRatePct: 20,
  totalAssets: 100_000,
  totalDebts: 20_000,
  emergencyFundMonths: 3,
  freedomPct: 25,
  currentAge: null,
  fireAgeFractional: null,
  netMonthlyIncome: 4_000,
  debtMonthlyPayments: 600,
  largestAssetTypeShare: 0.5,
  budgetCategories: [
    { limit: 1500, spent: 1400 },
    { limit: 500, spent: 450 },
  ],
}

function pillar(id: string, extra: Partial<HealthPillar> = {}): HealthPillar {
  return {
    id,
    name: id,
    score: 50,
    weight: 1,
    explanation: '',
    improvementTip: '',
    actionHref: '/',
    actionLabel: '',
    rawValue: '',
    ...extra,
  }
}

function scoreWith(pillars: HealthPillar[]): HealthScore {
  return {
    total: 70,
    label: 'Sterk',
    pillars,
    previousMonth: null,
    trend: 0,
    activePillarCount: pillars.length,
    budgetingActive: false,
    onbekend: null,
  }
}

describe('healthScorePillarWords — alleen wat meetelt, in zinsvolgorde (B-069)', () => {
  it('alle zeven indicatoren actief → de vier woorden uit de melding, in die volgorde', () => {
    const health = computeHealthScoreFromInputs(baseInput, true)
    expect(healthScorePillarWords(health)).toEqual(['bezittingen', 'buffer', 'schulden', 'uitgaven'])
  })

  it('geen modules → alleen de buffer (de enige pijler zonder module-eis)', () => {
    const health = computeHealthScoreFromInputs(baseInput, true, [])
    expect(healthScorePillarWords(health)).toEqual(['buffer'])
  })

  it('alleen budgetteren → buffer en uitgaven, géén schulden of bezittingen', () => {
    const health = computeHealthScoreFromInputs(baseInput, true, ['budgetteren'])
    expect(healthScorePillarWords(health)).toEqual(['buffer', 'uitgaven'])
  })

  it('alleen vermogensregistratie → bezittingen via de spreiding, ook zonder FIRE-voortgang', () => {
    const health = computeHealthScoreFromInputs(baseInput, true, ['vermogensregistratie'])
    expect(health.pillars.map((p) => p.id)).not.toContain('fire_progress')
    expect(healthScorePillarWords(health)).toEqual(['bezittingen', 'buffer', 'schulden'])
  })

  it('een groep die wegvalt op DATA (niet op module) wordt ook niet genoemd', () => {
    // Vermogensregistratie aan, toekomstplannen uit, en te weinig vermogen voor
    // een spreidingsscore: de vrijheid-groep heeft dan geen enkele indicator.
    const health = computeHealthScoreFromInputs(
      { ...baseInput, largestAssetTypeShare: null },
      true,
      ['vermogensregistratie', 'budgetteren'],
    )
    expect(health.pillars.map((p) => p.pillarGroup)).not.toContain('vrijheid')
    expect(healthScorePillarWords(health)).toEqual(['buffer', 'schulden', 'uitgaven'])
  })

  it('twee indicatoren in één groep leveren één woord', () => {
    const health = scoreWith([
      pillar('debt_ratio', { pillarGroup: 'schuld' }),
      pillar('debt_service_ratio', { pillarGroup: 'schuld' }),
    ])
    expect(healthScorePillarWords(health)).toEqual(['schulden'])
  })

  it('valt terug op de id als `pillarGroup` ontbreekt (optioneel veld, oude fixtures)', () => {
    const health = scoreWith([pillar('savings_rate'), pillar('fire_progress')])
    expect(healthScorePillarWords(health)).toEqual(['bezittingen', 'uitgaven'])
  })

  it('een onbekende indicator zonder groep telt niet mee', () => {
    expect(healthScorePillarWords(scoreWith([pillar('iets_nieuws')]))).toEqual([])
  })

  it('geen pijlers → geen woorden', () => {
    expect(healthScorePillarWords(scoreWith([]))).toEqual([])
  })
})

describe('healthScoreBasisPhrase — de staart van de zin', () => {
  it('vier woorden → komma\'s en "en" voor het laatste', () => {
    const health = computeHealthScoreFromInputs(baseInput, true)
    expect(healthScoreBasisPhrase(health)).toBe('gezien je bezittingen, buffer, schulden en uitgaven')
  })

  it('twee woorden → alleen "en"', () => {
    const health = computeHealthScoreFromInputs(baseInput, true, ['budgetteren'])
    expect(healthScoreBasisPhrase(health)).toBe('gezien je buffer en uitgaven')
  })

  it('één woord → geen opsomming', () => {
    const health = computeHealthScoreFromInputs(baseInput, true, [])
    expect(healthScoreBasisPhrase(health)).toBe('gezien je buffer')
  })

  it('geen pijlers → null, zodat de zin na het bandwoord eindigt', () => {
    expect(healthScoreBasisPhrase(scoreWith([]))).toBeNull()
  })

  it('noemt nooit "vrijheid", "oordeel" of een getal (de melding: onbegrijpelijk)', () => {
    for (const modules of [undefined, [], ['budgetteren'], ['vermogensregistratie', 'toekomstplannen']] as const) {
      const health = computeHealthScoreFromInputs(baseInput, true, modules ? [...modules] : undefined)
      const phrase = healthScoreBasisPhrase(health) ?? ''
      expect(phrase).not.toMatch(/vrijheid|oordeel|\d/i)
    }
  })
})
