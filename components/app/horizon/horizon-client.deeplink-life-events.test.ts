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

const SOURCE_PATH = join(process.cwd(), 'components', 'app', 'horizon', 'horizon-client.tsx')
const source = readSourceLF(SOURCE_PATH)

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

describe('deeplink ?modal=life_events → EventPane-catalogus (ADR 0179 fase 1 stap 2)', () => {
  it('opent de EventPane in catalogus-modus zonder bewerk-id', () => {
    const body = branchBody(/\n( +)\} else if \(modal === 'life_events'\) \{/)
    expect(eventPaneCalls(body)).toEqual(['EditingId=null', "Mode='catalog'", 'Open=true'])
  })

  it('doet exact hetzelfde als ?event=new', () => {
    const lifeEvents = branchBody(/\n( +)\} else if \(modal === 'life_events'\) \{/)
    const eventNew = branchBody(/\n( +)if \(eventParam === 'new'\) \{/)
    expect(eventPaneCalls(lifeEvents)).toEqual(eventPaneCalls(eventNew))
  })

  it('het legacy-gebeurtenisformulier en zijn schrijfpad bestaan niet meer', () => {
    expect(source).not.toMatch(/\bsetShowForm\b/)
    expect(source).not.toMatch(/\bsaveEvent\b/)
    expect(source).not.toMatch(/\brefreshEvents\b/)
    expect(source).not.toMatch(/=== Event Form Modal ===/)
  })
})
