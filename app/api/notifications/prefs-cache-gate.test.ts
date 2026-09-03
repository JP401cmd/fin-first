/**
 * Bron-grendel op de splitsing "genereren altijd / dedupe-state alleen als de
 * voorkeur aanstaat" in `app/api/notifications/route.ts` (WF-WILL-13 bug1).
 *
 * DE BUG. De drie langzame generatoren (weekbriefing, grenzenpotten, mijlpaal)
 * stonden achter `if (computeSlow && prefs.X !== false)`. Viel een
 * cache-miss-recompute in het venster waarin het type UIT stond, dan schreef de
 * 15-minuten-cache (`slowChecksCache`) een snapshot ZONDER dat type weg. Zette
 * de gebruiker het type daarna weer aan, dan bleef `computeSlow` false en
 * serveerde de route die stale snapshot tot de TTL verliep: de
 * dashboard-meldingen-widget (`components/widgets/meldingen-widget.tsx`, leest
 * `notifications` = `filtered`) en de `unreadCount`-badge misten de melding tot
 * 15 minuten lang. (`/berichten` en de bel-modal lezen `history`, dat élk
 * request vers op de actuele voorkeuren wordt gefilterd — die waren nooit stuk.)
 *
 * DE FIX, EN WAAROM HIJ TWEE HELFTEN HEEFT. De voorkeur is een
 * PRESENTATIE-filter (r~1207 `filtered` + de `returnHistory`-filter), geen
 * generatie-voorwaarde: content wordt dus altijd berekend en in `slow` geduwd.
 * Maar de DEDUPE-STATE (`briefing_notified_week_*`, de spend-limit-gate) mag
 * NIET opbranden terwijl een type uit staat — anders is de melding voor die
 * week/periode "verbruikt" en verschijnt hij pas dagen later. Dat is een groter
 * gat dan de 15 minuten die we repareren. Beide helften moeten dus tegelijk
 * blijven gelden.
 *
 * WAAROM EEN BRON-TEST. De GET is één functie van ~1200 regels met ruim twintig
 * queries over evenveel tabellen; een integratietest zou een mock van vrijwel
 * het hele datamodel vergen en zou vooral die mock testen. De regressie die we
 * moeten uitsluiten is bovendien structureel en met één teken terug te zetten
 * (`computeSlow &&` + een prefs-check ervoor). Precedent voor deze vorm:
 * `components/app/horizon/horizon-client.euro-view.test.ts`.
 */

import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { readSourceLF } from '@/lib/test-utils/read-source'

const SOURCE_PATH = join(process.cwd(), 'app', 'api', 'notifications', 'route.ts')

/** Bron zonder commentaarregels — anders matcht de test zijn eigen uitleg. */
function codeOnly(): string {
  return readSourceLF(SOURCE_PATH)
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim()
      return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*')
    })
    .join('\n')
}

/** Index van de `}` die hoort bij de eerste `{` vanaf `from`. */
function matchingBraceEnd(code: string, from: number): number {
  const open = code.indexOf('{', from)
  expect(open, 'openingsaccolade verwacht').toBeGreaterThan(-1)
  let depth = 0
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') depth++
    else if (code[i] === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  throw new Error('geen sluitende accolade gevonden')
}

describe('meldingen-route — generatie staat los van de voorkeur (WF-WILL-13 bug1)', () => {
  it('gate geen enkele langzame generator meer op de voorkeur', () => {
    const code = codeOnly()
    const treffers = code.match(/computeSlow\s*&&\s*prefs[.[]/g) ?? []
    expect(
      treffers,
      'een `computeSlow && prefs.X`-gate laat de 15-min-cache een voorkeur-afhankelijke ' +
        'snapshot onthouden; de voorkeur hoort in het eindfilter, niet in de generatie',
    ).toEqual([])
  })

  it('draait de drie eerder gegate generatoren op `computeSlow` alleen', () => {
    const code = codeOnly()
    // Per generator: de dichtstbijzijnde `if (computeSlow…`-gate erbóven moet de
    // kale vorm hebben. De andere langzame secties (sync, jaarreminders,
    // horizon, holdings) hadden die vorm altijd al.
    const gateVoor = (anker: string): string => {
      const anchorIndex = code.indexOf(anker)
      expect(anchorIndex, `anker "${anker}" niet gevonden`).toBeGreaterThan(-1)
      const gateIndex = code.lastIndexOf('if (computeSlow', anchorIndex)
      expect(gateIndex, `geen computeSlow-gate boven "${anker}"`).toBeGreaterThan(-1)
      return code.slice(gateIndex, code.indexOf('\n', gateIndex)).trim()
    }

    expect(gateVoor('const briefingWeekKey'), 'weekbriefing (4c)').toBe('if (computeSlow) try {')
    expect(gateVoor('const spendLimitGateKey'), 'grenzenpotten (4d)').toBe('if (computeSlow) try {')
    expect(gateVoor('const milestoneCutoff'), 'mijlpaal (4e)').toBe('if (computeSlow) try {')
  })

  it('brandt de briefing-weeksleutel alleen op wanneer de voorkeur aanstaat', () => {
    const code = codeOnly()
    const guard = code.indexOf('if (prefs.briefing !== false) {')
    expect(guard, 'de burn-guard rond de week-key-upsert ontbreekt').toBeGreaterThan(-1)

    const einde = matchingBraceEnd(code, guard)
    const body = code.slice(guard, einde)
    expect(body, 'de guard hoort exact de week-key-upsert te omsluiten').toContain(
      'key: briefingWeekKey',
    )
    expect(
      body,
      'de melding zelf mag NIET binnen de burn-guard staan — dan is de cache weer ' +
        'voorkeur-afhankelijk en is de bug terug',
    ).not.toContain('slow.push(')
  })

  it('schrijft de grenzenpot-gate alleen weg wanneer de voorkeur aanstaat', () => {
    const code = codeOnly()
    expect(code).toContain('spendLimitDecision.gateChanged && prefs.spend_limit !== false')
  })

  it('houdt de voorkeur als eindfilter op zowel de live lijst als de historie', () => {
    const code = codeOnly()
    expect(code, 'live lijst (notifications/unreadCount)').toContain('prefs[n.type] !== false')
    expect(code, '30-dagenhistorie (/berichten + bel-modal)').toContain('prefs[h.type] !== false')
  })
})
