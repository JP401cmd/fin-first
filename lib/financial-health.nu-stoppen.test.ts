import { describe, it, expect } from 'vitest'
import { scoreFireProgressVsPeers } from './financial-health'

/**
 * ADR 0127 D5 — de fire_progress-pijler (ADR 0124, peer-relatief op vulling) oordeelt
 * onder 'nu-stoppen' op TIJDSDEKKING: `freedomPct` is daar uitputtingsmaand ÷ eindmaand,
 * en de peer-lat (opbouw naar een FIRE-moment) is betekenisloos wanneer FIRE = nu.
 */
describe("scoreFireProgressVsPeers — 'nu-stoppen'", () => {
  it('scoort rechtstreeks op de dekking (afgerond, 0–100), niet peer-relatief', () => {
    const nu = scoreFireProgressVsPeers({ freedomPct: 62.4, currentAge: 42, fireAgeFractional: 42, fireEndStrategy: 'nu-stoppen' })
    expect(nu).toBe(62)
    // Dezelfde invoer zonder het anker loopt door de peer-formule en geeft een ander getal.
    const peer = scoreFireProgressVsPeers({ freedomPct: 62.4, currentAge: 42, fireAgeFractional: 42 })
    expect(peer).not.toBe(62)
  })

  it('volledige dekking → 100, deficit → 0', () => {
    expect(scoreFireProgressVsPeers({ freedomPct: 100, currentAge: 42, fireAgeFractional: 42, fireEndStrategy: 'nu-stoppen' })).toBe(100)
    expect(scoreFireProgressVsPeers({ freedomPct: 0, currentAge: 42, fireAgeFractional: 42, fireEndStrategy: 'nu-stoppen' })).toBe(0)
  })

  it('zonder het veld (oude snapshots, mocks) blijft de peer-relatieve score ongewijzigd', () => {
    const a = scoreFireProgressVsPeers({ freedomPct: 40, currentAge: 30, fireAgeFractional: 55 })
    const b = scoreFireProgressVsPeers({ freedomPct: 40, currentAge: 30, fireAgeFractional: 55, fireEndStrategy: 'deplete' })
    expect(a).toBe(b)
  })
})
