/**
 * Bron-scan op GET /api/notifications (Krant 2B). De route is 1600 regels met
 * tien databronnen; hem echt aanroepen vraagt een halve database aan mocks. De
 * beslissing zelf (`receivesBriefing`, `isKrantProfile`) heeft eigen tests in
 * krant-grens.test.ts; deze scan bewaakt dat de route hem op de juiste plekken
 * gebruikt:
 *   - de weekbriefing-melding ("Je weekbriefing staat klaar") hangt aan
 *     `receivesBriefing`, op een profielrij die mee komt in een BESTAANDE
 *     profiel-select (geen extra query), en de week-key brandt niet op;
 *   - de drie horizon-meldingen hangen aan `horizonAlertsApply`.
 */

import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { readSourceLF } from '@/lib/test-utils/read-source'

const src = readSourceLF(resolve(__dirname, '..', '..', 'app', 'api', 'notifications', 'route.ts'))
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '')

describe('notificaties — weekbriefing-melding niet voor een Krant-account', () => {
  it('de moduleset komt mee in de bestaande grondslag-profielselect', () => {
    expect(src).toMatch(/\.select\('income_source, expenses_source, active_modules'\)/)
    expect(src).toMatch(/ownModulesRow = grondslagProfileRes\.data/)
  })

  it('het briefing-blok (week-key én melding) draait alleen bij receivesBriefing', () => {
    const blok = src.match(/if \(computeSlow && receivesBriefing\(ownModulesRow\)\) try \{[\s\S]*?briefing_notified_week_/)
    expect(blok, 'week-key-lezing staat niet binnen de guard').not.toBeNull()
    // De melding zelf staat in hetzelfde blok.
    const na = src.slice(src.indexOf('receivesBriefing(ownModulesRow)'))
    expect(na.indexOf("title: 'Je weekbriefing staat klaar'")).toBeGreaterThan(-1)
    expect(na.indexOf("title: 'Je weekbriefing staat klaar'")).toBeLessThan(na.indexOf('Weekly briefing notification error'))
  })

  it('er is geen tweede, ongegate briefing-melding', () => {
    expect(src.split("title: 'Je weekbriefing staat klaar'").length - 1).toBe(1)
  })

  it('de ownModulesRow-toewijzing gebeurt vóór het briefing-blok', () => {
    expect(src.indexOf('ownModulesRow = grondslagProfileRes.data')).toBeLessThan(
      src.indexOf('receivesBriefing(ownModulesRow)'),
    )
  })
})

describe('notificaties — horizon-meldingen niet voor een Krant-account', () => {
  it('de drie horizon-meldingen hangen aan horizonAlertsApply', () => {
    expect(src).toMatch(/const horizonAlertsApply = !isKrantProfile\(profile\)/)
    expect(src).toMatch(/if \(horizonAlertsApply && !dateOfBirth\)/)
    expect(src).toMatch(/if \(horizonAlertsApply && totalDebts > 0\)/)
    expect(src).toMatch(/if \(horizonAlertsApply && dateOfBirth\)/)
  })
})
