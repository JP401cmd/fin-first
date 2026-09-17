import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { NOTIFICATION_TYPES } from './identity-constants'

/**
 * Elke schakelaar op /mijn/notificaties is een belofte: "als dit gebeurt, hoor
 * je het". Die belofte is alleen waar als er ergens code bestaat die een
 * melding van precies dat type aanmaakt. Deze gate scant de twee plekken waar
 * meldingen ontstaan — de routehandlers onder `app/api` (waaronder de poll
 * `GET /api/notifications` en de partner-actie in `PATCH /api/ai/actions/[id]`)
 * en de generatoren in `lib/notifications` — en eist voor élk type in
 * `NOTIFICATION_TYPES` minstens één `type: '<type>'`-constructie.
 *
 * Aanleiding (UR3-21, sep 2026): het type `recommendation` ("Partner-acties")
 * werd als dode belofte aangemerkt omdat het niet in `app/api/notifications/
 * route.ts` voorkwam. Het wordt wél aangemaakt — door de actions-route, die het
 * in de historie van de partner schrijft — maar niets legde dat vast, dus
 * bleef de vraag "bestaat hier een generator voor?" handwerk. Nu is het een
 * compile-onafhankelijke, herhaalbare toets: valt een generator weg of komt er
 * een schakelaar bij zonder bron, dan wordt dit rood.
 *
 * Bewust een tekstscan en geen import: de generatoren zitten in route-modules
 * met server-only afhankelijkheden, en het gaat om aanwezigheid, niet gedrag.
 */

const ROOT = join(__dirname, '..')
const SCAN_DIRS = ['app/api', 'lib/notifications'] as const

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, acc)
    } else if (full.endsWith('.ts') && !full.endsWith('.test.ts')) {
      acc.push(full)
    }
  }
  return acc
}

const SOURCE_FILES = SCAN_DIRS.flatMap((d) => collectSourceFiles(join(ROOT, d)))
const SOURCE_TEXT = new Map(SOURCE_FILES.map((f) => [f, readFileSync(f, 'utf8')]))

/** Bestanden (repo-relatief) die een melding van dit type construeren. */
function generatorsFor(type: string): string[] {
  // `type: 'x'` of `type: 'x' as const` — de object-literal-vorm waarin elke
  // generator zijn melding opbouwt. Unie-leden (`| 'x'`), voorkeuren-defaults
  // (`x: true`) en `validTypes`-lijsten matchen bewust niet.
  const re = new RegExp(`\\btype:\\s*'${type}'(\\s+as\\s+const)?\\s*,?`)
  return SOURCE_FILES.filter((f) => re.test(SOURCE_TEXT.get(f) ?? '')).map((f) =>
    relative(ROOT, f).replace(/\\/g, '/'),
  )
}

describe('NOTIFICATION_TYPES — elke schakelaar heeft een generator', () => {
  it('scant een niet-lege bronset', () => {
    expect(SOURCE_FILES.length).toBeGreaterThan(10)
  })

  it('controle: een verzonnen type heeft géén generator (de scanner ziet afwezigheid)', () => {
    expect(generatorsFor('__geen_bestaand_meldingstype__')).toEqual([])
  })

  it('controle: de poll-route zelf zit in de scan (budget wordt daar aangemaakt)', () => {
    expect(generatorsFor('budget')).toContain('app/api/notifications/route.ts')
  })

  for (const { type, label } of NOTIFICATION_TYPES) {
    it(`'${type}' (${label}) wordt ergens aangemaakt`, () => {
      const gens = generatorsFor(type)
      expect(
        gens.length,
        `Meldingstype '${type}' ("${label}") heeft een schakelaar op /mijn/notificaties ` +
          `maar geen enkele generator in ${SCAN_DIRS.join(' of ')}. Bouw de generator, ` +
          `of haal de belofte uit NOTIFICATION_TYPES.`,
      ).toBeGreaterThan(0)
    })
  }

  it("'recommendation' (Partner-acties) komt uit de actions-route, niet uit de poll", () => {
    // De reden dat dit type ten onrechte "dood" heette: het staat niet in de
    // poll-route. Pin de echte bron, zodat die verklaring vindbaar blijft.
    expect(generatorsFor('recommendation')).toContain('app/api/ai/actions/[id]/route.ts')
  })
})
