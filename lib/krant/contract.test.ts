import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, expectTypeOf, it } from 'vitest'
import type { z } from 'zod'
import { readSourceLF } from '@/lib/test-utils/read-source'
import {
  KRANT_V1_OPERATIES,
  archiefResponseSchema,
  herkomstSchema,
  profielPutBodySchema,
  tijdlijnBerichtSchema,
  tijdlijnResponseSchema,
  V1_TIJDLIJN_PAGINA,
  V1_WEEK_KEY,
} from './contract'
import { PROFIEL_VELDEN } from './profiel-velden'
import { RUBRIEKEN_MAX } from './profiel'
import { TIJDLIJN_PAGINA, WEEK_KEY, rijNaarBericht, type TijdlijnBericht, type TijdlijnPagina, type TijdlijnWeek } from './tijdlijn-lezen'

/**
 * Het v1-contract (Krant 3A, ADR 0187) mag niet stil afdrijven van wat de
 * server bouwt en levert:
 *   - de fase-2-schema's hebben exact de TS-vorm van de 1C-leesloader;
 *   - precies de fase-1-operaties hebben een route (met die methode), fase 2 nog niet;
 *   - PUT profiel is strikt; herkomst kent precies de dertien velden;
 *   - het contract blijft puur (geen server-imports).
 */

describe('fase 2 volgt de 1C-leesloader', () => {
  it('paginagrootte en weeksleutel zijn die van tijdlijn-lezen.ts', () => {
    expect(V1_TIJDLIJN_PAGINA).toBe(TIJDLIJN_PAGINA)
    expect(V1_WEEK_KEY.source).toBe(WEEK_KEY.source)
  })

  it('bericht, pagina en week hebben exact de TS-vorm van de loader', () => {
    expectTypeOf<z.infer<typeof tijdlijnBerichtSchema>>().toEqualTypeOf<TijdlijnBericht>()
    expectTypeOf<z.infer<typeof tijdlijnResponseSchema>['pagina']>().toEqualTypeOf<TijdlijnPagina>()
    expectTypeOf<z.infer<typeof archiefResponseSchema>['archief'][number]>().toEqualTypeOf<TijdlijnWeek>()
  })

  it('een bericht uit rijNaarBericht haalt het schema (ook de raakt-vorm met kop)', () => {
    const bericht = rijNaarBericht({
      id: '11111111-1111-1111-1111-111111111111',
      editie_id: '22222222-2222-2222-2222-222222222222',
      created_at: '2026-09-29T05:30:00+00:00',
      positie: 0,
      vorm: 'raakt',
      tekst: 'Dit raakt je situatie.',
      waarom: ['wonen = koop-met-hypotheek'],
      wat_mist: null,
      deadline: null,
      snapshot: { titel: 'Hypotheekrente omlaag', rubriek: 'wonen', bron: 'NOS', url: 'https://nos.nl/x' },
      krant_edities: { week_key: '2026-W40' },
    })
    expect(tijdlijnBerichtSchema.parse(bericht)).toEqual(bericht)
  })
})

describe('operaties ↔ routes', () => {
  const ROOT = process.cwd()
  const routeBestand = (pad: string) => join(ROOT, 'app', ...pad.split('/').filter(Boolean), 'route.ts')

  it('elke operatie is uniek (operationId en pad+methode)', () => {
    const ids = KRANT_V1_OPERATIES.map((o) => o.operationId)
    const sleutels = KRANT_V1_OPERATIES.map((o) => `${o.methode} ${o.pad}`)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(sleutels).size).toBe(sleutels.length)
    for (const o of KRANT_V1_OPERATIES) expect(o.pad.startsWith('/api/v1/krant/')).toBe(true)
  })

  it.each(KRANT_V1_OPERATIES.filter((o) => o.fase === 1).map((o) => [o.operationId, o] as const))(
    'fase 1: %s heeft een route met die methode',
    (_id, op) => {
      const bestand = routeBestand(op.pad)
      expect(existsSync(bestand)).toBe(true)
      expect(readSourceLF(bestand)).toContain(`export async function ${op.methode.toUpperCase()}(`)
    },
  )

  it.each(KRANT_V1_OPERATIES.filter((o) => o.fase === 2).map((o) => [o.operationId, o] as const))(
    'fase 2: %s heeft nog GEEN route',
    (_id, op) => {
      expect(existsSync(routeBestand(op.pad))).toBe(false)
    },
  )

  it('de oude leesstatus (/api/news/read) gaat mee in v1 — besluit eigenaar 29-09', () => {
    const newsRead = KRANT_V1_OPERATIES.filter((o) => o.pad === '/api/v1/krant/news-read')
    expect(newsRead.map((o) => o.methode).sort()).toEqual(['get', 'post'])
  })
})

describe('profiel', () => {
  it('herkomst kent precies de dertien profielvelden', () => {
    expect(herkomstSchema.safeParse({ inkomen: 'zelf', woonplan: 'afgeleid' }).success).toBe(true)
    expect(herkomstSchema.safeParse({ krant_variant: 'zelf' }).success).toBe(false)
    expect(herkomstSchema.safeParse({ inkomen: 'geraden' }).success).toBe(false)
    expect(PROFIEL_VELDEN).toHaveLength(13)
  })

  it('lijsten zijn begrensd en zonder dubbelen (rubrieken ≤ 20 = de DB-CHECK)', () => {
    const rubrieken = (n: number) => Array.from({ length: n }, (_, i) => `rubriek-${i}`)
    expect(profielPutBodySchema.safeParse({ rubrieken: rubrieken(RUBRIEKEN_MAX) }).success).toBe(true)
    expect(profielPutBodySchema.safeParse({ rubrieken: rubrieken(RUBRIEKEN_MAX + 1) }).success).toBe(false)
    expect(profielPutBodySchema.safeParse({ rubrieken: ['wonen', 'wonen'] }).success).toBe(false)
    expect(profielPutBodySchema.safeParse({ werk: ['loondienst', 'dga'] }).success).toBe(true)
    expect(profielPutBodySchema.safeParse({ werk: ['dga', 'dga'] }).success).toBe(false)
    expect(profielPutBodySchema.safeParse({ schulden: ['geen', 'geen'] }).success).toBe(false)
    expect(profielPutBodySchema.safeParse({ beleggingen: { band: null, vorm: ['crypto', 'crypto'] } }).success).toBe(false)
  })

  it('PUT is strikt en vraagt minstens één veld', () => {
    expect(profielPutBodySchema.safeParse({ woonplan: null }).success).toBe(true)
    expect(profielPutBodySchema.safeParse({}).success).toBe(false)
    for (const verboden of ['krant_variant', 'afgeleid_at', 'tijdlijn_vernieuwd_at', 'tijdlijn_gelezen_tot', 'herkomst', 'versie']) {
      expect(profielPutBodySchema.safeParse({ woonplan: null, [verboden]: null }).success, verboden).toBe(false)
    }
  })
})

describe('puurheid', () => {
  it.each(['lib/krant/contract.ts', 'lib/krant/contract-openapi.ts'])('%s importeert alleen zod en pure profielmodules', (pad) => {
    const imports = [...readSourceLF(pad).matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1])
    expect(imports.length).toBeGreaterThan(0)
    for (const i of imports) expect(['zod', './profiel', './profiel-velden', './contract']).toContain(i)
  })
})
