import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SCHRIJFROUTE_VELD_REGISTER, type VeldPlek } from './veld-register'
import { PLAN_REVIEW_STAPPEN } from './types'

/**
 * Meebeweeg-check laag c (TPR-15, ontwerp-eis 7): elk veld dat een schrijfroute van de
 * plan-review uit de body leest of wegschrijft, staat in het veld-register — met een plek in
 * de wizard of een reden waarom niet. Deze test scant de BRON, niet een lijst die iemand
 * bijhoudt: een nieuw `body.<veld>` in een route maakt hem rood tot er een keuze is gemaakt.
 *
 * Wat de scanner herkent (bewust eenvoudig, en daarom zelf getest hieronder):
 *  - `body.<veld>` en `body[CONST]` (met `const CONST = '<veld>'` in hetzelfde bestand);
 *  - `const { a, b } = body` en `for (const key of ['a', 'b'])`-lussen over de body;
 *  - `updateData.<veld> =`, `updatePayload.<veld> =`, `safePayload.<veld> =`, `out.<veld> =`,
 *    `updateData[CONST] =`;
 *  - sleutels in `.update({ … })` / `.upsert({ … })`;
 *  - zod-sleutels aan het begin van een regel (`<veld>: z.…`, `leeftijd`, `bedrag(`, `…Schema`).
 */

function scanVelden(src: string): Set<string> {
  const consts = new Map([...src.matchAll(/const\s+([A-Z_]+)\s*=\s*'([a-z0-9_]+)'/g)].map((m) => [m[1], m[2]]))
  const velden = new Set<string>()
  const voeg = (k: string) => {
    const naam = (consts.get(k) ?? k).trim()
    if (naam) velden.add(naam)
  }
  for (const m of src.matchAll(/\bbody\.([a-zA-Z_]\w*)/g)) voeg(m[1])
  for (const m of src.matchAll(/\bbody\[([A-Z_]+)\]/g)) voeg(m[1])
  for (const m of src.matchAll(/\b(?:updateData|updatePayload|safePayload|out)\.([a-zA-Z_]\w*)\s*=/g)) voeg(m[1])
  for (const m of src.matchAll(/\b(?:updateData|updatePayload)\[([A-Z_]+)\]\s*=/g)) voeg(m[1])
  for (const m of src.matchAll(/const\s*\{([^}]*)\}\s*=\s*body\b/g)) {
    for (const k of m[1].split(',')) voeg(k.split(':')[0])
  }
  for (const m of src.matchAll(/for\s*\(const\s+\w+\s+of\s+\[([^\]]*)\]/g)) {
    for (const k of m[1].matchAll(/'([a-z0-9_]+)'/g)) voeg(k[1])
  }
  for (const m of src.matchAll(/\.(?:update|upsert)\(\{([^}]*)\}/g)) {
    for (const k of m[1].matchAll(/([a-zA-Z_]\w*)\s*[:,]/g)) voeg(k[1])
  }
  for (const m of src.matchAll(/^\s+([a-zA-Z_]\w*):\s*(?:z\.|leeftijd\b|bedrag\(|[A-Z]\w*Schema\b)/gm)) voeg(m[1])
  return velden
}

const root = resolve(__dirname, '../..')
const lees = (pad: string) => readFileSync(resolve(root, pad), 'utf8')

describe('veld-register per schrijfroute (meebeweeg-check laag c)', () => {
  for (const [route, reg] of Object.entries(SCHRIJFROUTE_VELD_REGISTER)) {
    describe(route, () => {
      const bronnen = reg.bronnen as readonly string[]
      const velden = reg.velden as Readonly<Record<string, VeldPlek>>

      it('de bronbestanden bestaan', () => {
        for (const pad of bronnen) expect(existsSync(resolve(root, pad)), pad).toBe(true)
      })

      const gescand = new Set<string>()
      for (const pad of bronnen) {
        if (existsSync(resolve(root, pad))) for (const v of scanVelden(lees(pad))) gescand.add(v)
      }

      it('elk veld dat de bron leest of schrijft, is geregistreerd', () => {
        const ontbreekt = [...gescand].filter((v) => !(v in velden)).sort()
        expect(
          ontbreekt,
          `${route}: nieuw veld zonder registratie in lib/plan-review/veld-register.ts — ` +
            'neem het op in de wizard (stap of laag 2 + editor-body) of zet buitenWizard met reden',
        ).toEqual([])
      })

      it('geen registratie die de bron niet meer noemt', () => {
        const verouderd = Object.keys(velden).filter((v) => !gescand.has(v)).sort()
        expect(verouderd, `${route}: registratie zonder veld in de bron — ruim op`).toEqual([])
      })

      it('elke plek is geldig: een bestaande stap of laag 2 met een editor, of een reden', () => {
        for (const [veld, plek] of Object.entries(velden)) {
          if ('wizard' in plek) {
            expect([...PLAN_REVIEW_STAPPEN, 'laag2'], `${route}.${veld}`).toContain(plek.wizard)
            expect(plek.editor.trim().length, `${route}.${veld}: editor ontbreekt`).toBeGreaterThan(3)
          } else {
            expect(plek.buitenWizard.trim().length, `${route}.${veld}: reden ontbreekt`).toBeGreaterThan(20)
          }
        }
      })
    })
  }
})

describe('scanVelden — de scanner zelf', () => {
  it('herkent de leesvormen en schrijfvormen van de routes', () => {
    const src = `
      const KOLOM_KEY = 'box3_heffingvrij_inkomen'
      const a = body.fire_end_age
      const b = body[KOLOM_KEY]
      const { surplusGroup, deficitOrderGroups } = body
      for (const key of ['income_source', 'expenses_source'] as const) {}
      updatePayload.deficit_loan_rate = 1
      updateData[KOLOM_KEY] = 2
      await supabase.from('assets').update({ sale_config: cfg }).eq('id', id)
      const Schema = z.object({
        leefsituatie: z.enum(['a']),
        target_age: leeftijd,
        pot: PotSchema,
      })
    `
    expect([...scanVelden(src)].sort()).toEqual(
      [
        'box3_heffingvrij_inkomen',
        'deficitOrderGroups',
        'deficit_loan_rate',
        'expenses_source',
        'fire_end_age',
        'income_source',
        'leefsituatie',
        'pot',
        'sale_config',
        'surplusGroup',
        'target_age',
      ].sort(),
    )
  })

  it('een nieuw body-veld in een route wordt gezien (de rode-test-belofte)', () => {
    const route = lees('app/api/fire-settings/route.ts') + '\nconst x = body.nieuwe_instelling\n'
    expect(scanVelden(route).has('nieuwe_instelling')).toBe(true)
    expect('nieuwe_instelling' in SCHRIJFROUTE_VELD_REGISTER['/api/fire-settings'].velden).toBe(false)
  })
})
