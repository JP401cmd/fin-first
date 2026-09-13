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
 * Wat de scanner herkent (een heuristiek, en daarom zelf getest hieronder; commentaar telt niet):
 *  - `body.<veld>`, `(body as …).<veld>`, `body[CONST]` en `body['veld']`;
 *  - `const { a, b } = body`, en `for (const key of ['a', 'b'])` of `of BENOEMDE_ARRAY`;
 *  - `updateData.<veld> =`, `updatePayload.<veld> =`, `safePayload.<veld> =`, `out.<veld> =`,
 *    `updateData[CONST] =`;
 *  - alle sleutels (ook shorthand) in `.update({ … })` / `.upsert({ … })` / `.insert({ … })`;
 *  - zod-sleutels: aan het begin van een regel met `z`, een zod-helper uit hetzelfde bestand of
 *    `…Schema` als waarde (ook als die op de volgende regel begint), en inline in `z.object({ … })`.
 * Niet: velden die een helper in een bestand BUITEN `bronnen` leest — voeg zo'n validator-module
 * dan aan de bronnen van de route toe (zoals `lib/cashflow-settings.ts` bij /api/parameters).
 */

function scanVelden(src: string): Set<string> {
  // Commentaar weg: een voorbeeld in een doc-regel is geen veld (en mag de scan niet vullen).
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const consts = new Map([...code.matchAll(/const\s+([A-Z_]+)\s*=\s*'([a-z0-9_]+)'/g)].map((m) => [m[1], m[2]]))
  // Benoemde arrays met veldnamen (`const ageFields = ['gogo_tot_leeftijd', …] as const`).
  const arrays = new Map(
    [...code.matchAll(/const\s+(\w+)\s*=\s*\[([^\]]*)\]/g)].map((m) => [
      m[1],
      [...m[2].matchAll(/'([a-zA-Z0-9_]+)'/g)].map((k) => k[1]),
    ]),
  )
  // Zod-helpers in hetzelfde bestand (`const leeftijd = z.…`, `const bedrag = (max) => z.…`).
  const helpers = [...code.matchAll(/const\s+(\w+)\s*=\s*(?:\([^)]*\)\s*=>\s*)?z\b/g)].map((m) => m[1])
  const helperAlt = ['z', ...helpers].map((h) => `${h}\\b`).join('|')
  const velden = new Set<string>()
  const voeg = (k: string) => {
    const naam = (consts.get(k.trim()) ?? k).trim()
    if (/^[a-zA-Z_]\w*$/.test(naam)) velden.add(naam)
  }
  for (const m of code.matchAll(/\bbody\??\.([a-zA-Z_]\w*)/g)) voeg(m[1])
  for (const m of code.matchAll(/\(body as [^)]*\)\??\.([a-zA-Z_]\w*)/g)) voeg(m[1])
  for (const m of code.matchAll(/\bbody\[([A-Z_]+)\]/g)) voeg(m[1])
  for (const m of code.matchAll(/\bbody\['([a-zA-Z_]\w*)'\]/g)) voeg(m[1])
  for (const m of code.matchAll(/\b(?:updateData|updatePayload|safePayload|out)\.([a-zA-Z_]\w*)\s*=/g)) voeg(m[1])
  for (const m of code.matchAll(/\b(?:updateData|updatePayload)\[([A-Z_]+)\]\s*=/g)) voeg(m[1])
  for (const m of code.matchAll(/const\s*\{([^}]*)\}\s*=\s*body\b/g)) {
    for (const k of m[1].split(',')) voeg(k.split(':')[0])
  }
  for (const m of code.matchAll(/for\s*\(const\s+\w+\s+of\s+\[([^\]]*)\]/g)) {
    for (const k of m[1].matchAll(/'([a-zA-Z0-9_]+)'/g)) voeg(k[1])
  }
  for (const m of code.matchAll(/for\s*\(const\s+\w+\s+of\s+(\w+)\)/g)) {
    for (const k of arrays.get(m[1]) ?? []) voeg(k)
  }
  // Rij-literals: alle sleutels, ook shorthand (`.update({ a, b: c })`).
  for (const m of code.matchAll(/\.(?:update|upsert|insert)\(\{([^}]*)\}/g)) {
    for (const deel of m[1].split(',')) voeg(deel.split(':')[0].replace(/^\.\.\./, '_spread'))
  }
  // Zod-sleutels: aan het begin van een regel (ook als de waarde op de volgende regel begint) …
  for (const m of code.matchAll(new RegExp(`^[ \\t]+([a-zA-Z_]\\w*):\\s*(?:${helperAlt}|[A-Z]\\w*Schema\\b)`, 'gm'))) voeg(m[1])
  // … en inline in `z.object({ a: …, b: … })`.
  for (const m of code.matchAll(/z\.object\(\{([^{}]*)\}\)/g)) {
    for (const k of m[1].matchAll(/([a-zA-Z_]\w*)\s*:/g)) voeg(k[1])
  }
  velden.delete('_spread')
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
      // body.alleen_in_commentaar
      const KOLOM_KEY = 'box3_heffingvrij_inkomen'
      const leeftijd = z.number()
      const bedrag = (max: number) => z.number().max(max)
      const ageFields = ['gogo_tot_leeftijd', 'slowgo_tot_leeftijd'] as const
      const a = body.fire_end_age
      const b = body[KOLOM_KEY]
      const c = body['letterlijk_veld']
      const d = (body as { aspirations?: unknown })?.aspirations
      const { surplusGroup, deficitOrderGroups } = body
      for (const key of ['income_source', 'expenses_source'] as const) {}
      for (const f of ageFields) {}
      updatePayload.deficit_loan_rate = 1
      updateData[KOLOM_KEY] = 2
      await supabase.from('assets').update({ sale_config: cfg, expected_return }).eq('id', id)
      const Schema = z.object({
        leefsituatie: z.enum(['a']),
        target_age: leeftijd,
        huidigNettoMaand: bedrag(50_000),
        faseStappen: z
          .array(z.object({ fromAge: leeftijd, pct: z.number() }).strict()),
        pot: PotSchema,
      })
    `
    expect([...scanVelden(src)].sort()).toEqual(
      [
        'aspirations',
        'box3_heffingvrij_inkomen',
        'deficitOrderGroups',
        'deficit_loan_rate',
        'expected_return',
        'expenses_source',
        'faseStappen',
        'fire_end_age',
        'fromAge',
        'gogo_tot_leeftijd',
        'huidigNettoMaand',
        'income_source',
        'leefsituatie',
        'letterlijk_veld',
        'pct',
        'pot',
        'sale_config',
        'slowgo_tot_leeftijd',
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
