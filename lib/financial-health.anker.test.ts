import { describe, it, expect } from 'vitest'
import { scoreFireProgressVsPeers } from './financial-health'

/**
 * ADR 0129 B3 (F3a) — de fire_progress-pijler oordeelt onder ÉLK vast anker op de
 * DEKKING (freedomPct is daar `computeRunwayCoveragePct`), niet peer-relatief. De
 * sleutel is `fireStopAnchor`; de legacy-label `fireEndStrategy` blijft de terugval.
 */
describe('scoreFireProgressVsPeers — vast anker', () => {
  const basis = { freedomPct: 62.4, currentAge: 42, fireAgeFractional: 67 }

  it.each(['aow', 'now', 'age'] as const)('%s: scoort rechtstreeks op de dekking (afgerond)', (anchor) => {
    expect(scoreFireProgressVsPeers({ ...basis, fireStopAnchor: anchor })).toBe(62)
  })

  it('solved: de peer-relatieve score (een ander getal dan de dekking)', () => {
    const solved = scoreFireProgressVsPeers({ ...basis, fireStopAnchor: 'solved' })
    expect(solved).not.toBe(62)
    expect(scoreFireProgressVsPeers(basis)).toBe(solved)
  })

  it('het anker wint van een tegenstrijdige legacy-label; zonder anker geldt de legacy-vertaling', () => {
    expect(scoreFireProgressVsPeers({ ...basis, fireStopAnchor: 'solved', fireEndStrategy: 'nu-stoppen' })).not.toBe(62)
    expect(scoreFireProgressVsPeers({ ...basis, fireEndStrategy: 'pensioen' })).toBe(62)
    expect(scoreFireProgressVsPeers({ ...basis, fireEndStrategy: 'nu-stoppen' })).toBe(62)
  })

  it('volledige dekking → 100, deficit → 0', () => {
    expect(scoreFireProgressVsPeers({ ...basis, freedomPct: 100, fireStopAnchor: 'aow' })).toBe(100)
    expect(scoreFireProgressVsPeers({ ...basis, freedomPct: 0, fireStopAnchor: 'age' })).toBe(0)
  })
})
