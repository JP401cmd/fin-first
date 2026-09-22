// ── Golden: de vier P1-klasse-regressiegevallen van Krant 1F (ADR 0176) ──
//
// Vastgelegd op 22-09-2026, vóór het wissen van de oude artikelbak (B29): de
// productierij (read-only gelezen) plus de bronpagina, opnieuw opgehaald met
// de User-Agent van de ingest. Deze test bewaakt dat de fixtures heel blijven
// (hashes kloppen, het fragment staat letterlijk op de pagina) en legt per
// geval vast WAAROM de samenvatting fout was: wat de samenvatting beweert,
// staat niet in het eigen fragment. Dat is de meetlat voor 1F fase 2 (duiding
// op het eigen fragment, G1/G2/G6) — een golden bewijst reproduceerbaarheid,
// geen volledigheid.

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

interface BronFixture {
  fixtureVersie: number
  geval: string
  vangtHet: string[]
  rij: { id: string; source_url: string; published_at: string; duiding: { samenvatting: string; doelgroep: unknown[] } }
  bron: {
    paginaUrl: string
    detailUrl: string | null
    opgehaaldOp: string
    htmlSha256: string
    paginaTekstSha256: string
    fragment: string
    fragmentSha256: string
    paginaTekst: string
  }
}

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')
const laad = (id: string): BronFixture =>
  JSON.parse(readFileSync(join(__dirname, '__golden__', `bron-${id}.json`), 'utf8')) as BronFixture

const GEVALLEN = ['bf458a7b', '059ba103', '41ed4267', '7ce838c7'] as const

describe('Krant 1F — regressiefixtures (P1-klasse)', () => {
  for (const id of GEVALLEN) {
    it(`${id}: fixture is heel — hashes kloppen en het fragment staat letterlijk op de opgehaalde pagina`, () => {
      const f = laad(id)
      expect(f.fixtureVersie).toBe(1)
      expect(f.rij.id.startsWith(id)).toBe(true)
      expect(f.rij.source_url.split('#')[0]).toBe(f.bron.paginaUrl)
      expect(sha(f.bron.fragment)).toBe(f.bron.fragmentSha256)
      expect(sha(f.bron.paginaTekst)).toBe(f.bron.paginaTekstSha256)
      expect(f.bron.htmlSha256).toMatch(/^[0-9a-f]{64}$/)
      expect(f.bron.paginaTekst).toContain(f.bron.fragment)
      expect(f.vangtHet.length).toBeGreaterThan(0)
      // De oude ingest zette elke rij op middernacht (oorzaak van bugkaart P2).
      expect(f.rij.published_at).toMatch(/ 00:00:00\+00$/)
    })
  }

  it('bf458a7b: de publicatiedatum in de samenvatting komt nergens in de bron voor (G2)', () => {
    const f = laad('bf458a7b')
    expect(f.rij.duiding.samenvatting).toMatch(/1 januari 2026/)
    expect(f.bron.paginaTekst).not.toMatch(/januari/i)
    expect(f.bron.fragment).toMatch(/8 wetsvoorstellen/)
  })

  it('059ba103 en 41ed4267: de procentpunten staan op de pagina, maar niet in het eigen fragment (G1)', () => {
    for (const id of ['059ba103', '41ed4267']) {
      const f = laad(id)
      expect(f.rij.duiding.samenvatting).toMatch(/0,2/)
      expect(f.bron.paginaTekst).toMatch(/0,2%-punt/) // grondslag A (hele pagina) laat de fout door
      expect(f.bron.fragment).not.toMatch(/0,2|0,1/) // grondslag B (eigen fragment) wijst hem af
    }
  })

  it('7ce838c7: de sectorverdeling in samenvatting en doelgroep staat niet in de bron (G6)', () => {
    const f = laad('7ce838c7')
    expect(f.rij.duiding.samenvatting).toMatch(/sociale als de vrije sector/)
    expect(f.rij.duiding.doelgroep.length).toBeGreaterThan(0)
    // ("Arbeid en sociale zekerheid" staat wél in het menu — vandaar geen kale /sociale/.)
    expect(f.bron.paginaTekst).not.toMatch(/vrije sector|sociale (huur|sector)/i)
    expect(f.bron.fragment).toBe('Woninghuur stijgt gemiddeld met 4,4 procent 4-9-2026 06:30')
    // Het echte artikel staat als href op de lijstpagina: dat is in 1F de sleutel van een web_lijst-item.
    expect(f.bron.detailUrl).toBe('https://www.cbs.nl/nl-nl/nieuws/2026/36/woninghuur-stijgt-gemiddeld-met-4-4-procent')
  })
})
