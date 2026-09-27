/**
 * Deeplink `?modal=life_events` opent de EventPane-catalogus
 * (ADR 0179 fase 1 stap 2, 26 sep 2026).
 *
 * WAT ER VERANDERDE: `?modal=life_events` opende het legacy-gebeurtenisformulier
 * (een BottomSheet van ruim 2.200 regels in horizon-client.tsx, met eigen
 * client-writes op `life_events`). Dat formulier is verwijderd; de deeplink
 * opent voortaan dezelfde EventPane-catalogus als `?event=new`. Zo blijft een
 * oude bladwijzer werken en is er één weg om een gebeurtenis toe te voegen.
 *
 * WAAROM EEN BRON-TEST: `horizon-client.tsx` hangt aan de volledige
 * kernel-bundel; renderen in vitest is niet realistisch. Precedent in deze map:
 * `horizon-client.na-pensioen-klik.test.ts`. Verhuist het deeplink-effect naar
 * de overlay-host (fase 1 stap 11), dan verhuist `SOURCE_PATH` mee.
 */

import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { readSourceLF } from '@/lib/test-utils/read-source'
import { leesToekomstAlles } from '@/lib/test-utils/toekomst-bronnen'

/** Het deeplink-effect (E2) woont sinds ADR 0179 fase 1 stap 13 in de overlay-state-hook. */
const SOURCE_PATH = join(process.cwd(), 'components', 'toekomst', 'state', 'use-toekomst-overlay-state.ts')
const source = readSourceLF(SOURCE_PATH)
/** Het legacy-formulier mag in géén /toekomst-bron terugkomen. */
const alles = leesToekomstAlles()

/** De body van een `if/else if`-tak, tot de eerstvolgende sluitende accolade op dezelfde inspringing. */
function branchBody(opener: RegExp): string {
  const match = source.match(opener)
  expect(match, `tak ${opener} niet gevonden`).not.toBeNull()
  const start = match!.index! + match![0].length
  const indent = match![1]
  const end = source.indexOf(`\n${indent}}`, start)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

/** De drie EventPane-setters, in de volgorde waarin een tak ze zet. */
function eventPaneCalls(body: string): string[] {
  return [...body.matchAll(/setEventPane(EditingId|Mode|Open)\(([^)]*)\)/g)].map((m) => `${m[1]}=${m[2]}`)
}

/** De body van de ene opener `openEventPane` (fase 6: één EventPane op /toekomst). */
function openerBody(): string {
  const start = source.indexOf('const openEventPane = useCallback(')
  expect(start, 'openEventPane niet gevonden').toBeGreaterThan(-1)
  const end = source.indexOf('}, [])', start)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe('deeplink ?modal=life_events → EventPane-catalogus (ADR 0179 fase 1 stap 2)', () => {
  it('de opener zet voor "new" de catalogus zonder bewerk-id en opent de pane', () => {
    const body = openerBody()
    const nieuwTak = body.slice(body.indexOf("if (doel === 'new') {"), body.indexOf('} else {'))
    expect(eventPaneCalls(nieuwTak)).toEqual(['EditingId=null', "Mode='catalog'"])
    // Open staat ná de if/else: elke opening, catalogus of gebeurtenis, zet hem.
    expect(eventPaneCalls(body.slice(body.lastIndexOf('}')))).toEqual(['Open=true'])
  })

  it('?modal=life_events doet exact hetzelfde als ?event=new: allebei via openEventPane("new")', () => {
    const lifeEvents = branchBody(/\n( +)\} else if \(modal === 'life_events'\) \{/)
    expect(lifeEvents).toMatch(/openEventPane\('new'\)/)
    expect(eventPaneCalls(lifeEvents)).toEqual([])
    // ?event=new (en de alias ?nieuw=1) loopt via dezelfde opener met eventParam === 'new'.
    expect(source).toMatch(/openEventPane\(eventParam,/)
  })

  it('geen enkele pad zet de EventPane-state buiten de ene opener (één sheet tegelijk)', () => {
    const buiten = source.replace(openerBody(), '')
    expect(eventPaneCalls(buiten)).toEqual([])
  })

  it('het legacy-gebeurtenisformulier en zijn schrijfpad bestaan niet meer', () => {
    expect(alles).not.toMatch(/\bsetShowForm\b/)
    expect(alles).not.toMatch(/\bsaveEvent\b/)
    expect(alles).not.toMatch(/\brefreshEvents\b/)
    expect(alles).not.toMatch(/=== Event Form Modal ===/)
  })
})
