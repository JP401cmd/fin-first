import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  RECOMMENDATION_OPEN_COLUMNS,
  countOpenRecommendations,
  isRecommendationOpen,
} from './recommendation-status'

const TODAY = '2026-09-07'

describe('isRecommendationOpen', () => {
  it('pending wacht altijd op je', () => {
    expect(isRecommendationOpen({ status: 'pending' }, TODAY)).toBe(true)
    expect(isRecommendationOpen({ status: 'pending', postponed_until: null }, TODAY)).toBe(true)
  })

  it('uitgesteld tot in de toekomst wacht NIET op je', () => {
    // Dit is het geval waar UR3-27/D1 over ging: druk je bij je laatste tip op
    // "Later", dan komt hij hier terecht — en móet elk oppervlak hem overslaan.
    expect(isRecommendationOpen({ status: 'postponed', postponed_until: '2026-09-21' }, TODAY)).toBe(false)
  })

  it('uitgesteld tot vandaag of eerder wacht wél op je', () => {
    expect(isRecommendationOpen({ status: 'postponed', postponed_until: '2026-09-07' }, TODAY)).toBe(true)
    expect(isRecommendationOpen({ status: 'postponed', postponed_until: '2026-09-06' }, TODAY)).toBe(true)
  })

  it('uitgesteld zonder datum telt niet mee', () => {
    expect(isRecommendationOpen({ status: 'postponed', postponed_until: null }, TODAY)).toBe(false)
    expect(isRecommendationOpen({ status: 'postponed' }, TODAY)).toBe(false)
  })

  it('afgehandelde statussen tellen nooit mee', () => {
    for (const status of ['accepted', 'rejected', 'expired', 'completed']) {
      expect(isRecommendationOpen({ status }, TODAY)).toBe(false)
    }
  })

  it('een tijdstempel in postponed_until wordt op de datum beoordeeld', () => {
    // De kolom kan een `date` of een `timestamptz` bevatten. ISO-strings sorteren
    // lexicografisch gelijk aan chronologisch, dus de vergelijking blijft kloppen.
    expect(isRecommendationOpen({ status: 'postponed', postponed_until: '2026-09-01T10:00:00Z' }, TODAY)).toBe(true)
    expect(isRecommendationOpen({ status: 'postponed', postponed_until: '2026-09-20T10:00:00Z' }, TODAY)).toBe(false)
  })
})

describe('countOpenRecommendations', () => {
  it('telt precies de rijen die vandaag op je wachten', () => {
    expect(
      countOpenRecommendations(
        [
          { status: 'pending' },
          { status: 'postponed', postponed_until: '2026-09-21' },
          { status: 'postponed', postponed_until: '2026-09-01' },
          { status: 'rejected' },
        ],
        TODAY,
      ),
    ).toBe(2)
  })

  it('een enkele uitgestelde tip laat de teller op nul staan', () => {
    // Precies het scenario waarin de zijbalk-stip veertien dagen doorbrandde
    // boven een pagina die "Geen tips op dit moment" toonde.
    expect(
      countOpenRecommendations([{ status: 'postponed', postponed_until: '2026-09-21' }], TODAY),
    ).toBe(0)
  })
})

/**
 * Bron-grendel: de drie oppervlakken die deze vraag stellen, moeten hem hier
 * stellen. Zolang niemand het predicaat opnieuw uitschrijft, kunnen ze niet
 * opnieuw uit elkaar groeien — en dát, niet de losse filterregel, was het
 * defect (UR3-27, D1).
 */
describe('bron — alle drie de oppervlakken consumeren dit predicaat', () => {
  const CONSUMERS = [
    'lib/fin-data-loader.ts',
    'app/(app)/layout.tsx',
    'components/overview/tips-lijst.tsx',
  ]

  function stripComments(source: string): string {
    return source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
  }

  it.each(CONSUMERS)('%s importeert lib/recommendation-status', (file) => {
    const source = readFileSync(join(process.cwd(), file), 'utf8')
    expect(source).toContain("from '@/lib/recommendation-status'")
  })

  it.each(CONSUMERS)('%s vergelijkt postponed_until niet zelf', (file) => {
    const clean = stripComments(readFileSync(join(process.cwd(), file), 'utf8'))
    // Commentaar is er hierboven uit: de toelichtingen bij deze fix noemen
    // `postponed_until` juist wél, en zonder strippen zou de grendel op zijn
    // eigen uitleg afgaan. Elke overgebleven vermelding is dus echte code.
    //
    // Het verbod geldt op VERGELIJKEN, niet op noemen: de datum SCHRIJVEN bij
    // "Later" (`body.postponed_until = …`) is geen tweede oordeel, en de
    // kolomnaam in de select-lijst evenmin. Alles wat de waarde tegen een
    // moment afzet — `<=`, `<`, `>`, `new Date(…)` — is dat wél, en hoort in
    // lib/recommendation-status.ts.
    //
    // Deze grendel ving bij zijn eerste run een vierde formulering die met de
    // hand niet gevonden was: de sorteerhulp in tips-lijst.tsx.
    const offenders = clean
      .split(/\r?\n/)
      .filter((line) => /postponed_until/.test(line))
      // Schrijven mag: `body.postponed_until = …` zet de datum bij "Later".
      .filter((line) => !/\.postponed_until\s*=[^=]/.test(line))
      .filter((line) => /<=|>=|[<>]|new Date\(\s*\w+\.postponed_until/.test(line))
    expect(offenders).toEqual([])
  })

  it('de select-lijst dekt de velden waarop het oordeel rust', () => {
    expect(RECOMMENDATION_OPEN_COLUMNS).toContain('status')
    expect(RECOMMENDATION_OPEN_COLUMNS).toContain('postponed_until')
  })
})
