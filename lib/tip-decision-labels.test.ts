import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TIP_DECISION_LABELS, TIP_DECISION_DONE_LABELS } from './tip-decision-labels'

/**
 * UR3-17 · #19 — de tipkaart in de Fin-chat en de TipsLijst op /overzicht/tips
 * beslissen over hetzelfde object en moeten dus dezelfde woorden dragen.
 * Ze deelden die woorden niet: de chat zei "Accepteer / Uitstel / Wijs af",
 * de pagina "Doe nu / Later / Negeren".
 *
 * Naast de waarden pinnen we hier de BRON: beide oppervlakken moeten de
 * constanten consumeren. Een bron-toets, want de twee componenten hebben geen
 * gedeelde renderbare vorm — de drift ontstond juist doordat elk scherm zijn
 * eigen letterlijke tekst opschreef.
 */

const REPO_ROOT = join(__dirname, '..')

function source(relPath: string): string {
  return readFileSync(join(REPO_ROOT, relPath), 'utf8')
}

/** Oppervlakken waar een gebruiker op een tip beslist. */
const TIP_DECISION_SURFACES = [
  'components/app/chat/chat-panel.tsx',
  'components/overview/tips-lijst.tsx',
]

/**
 * Woorden die vóór de fix in gebruik waren. Ze mogen in geen enkel
 * beslis-oppervlak meer letterlijk voorkomen — anders is de tweede
 * woordenset teruggeslopen.
 */
const AFGEDANKTE_WOORDEN = ['Accepteer', 'Uitstel', 'Wijs af']

describe('tip-decision-labels', () => {
  it('houdt de canonieke woordenset vast', () => {
    expect(TIP_DECISION_LABELS).toEqual({
      accept: 'Doe nu',
      postpone: 'Later',
      reject: 'Negeren',
    })
    expect(TIP_DECISION_DONE_LABELS).toEqual({
      accept: 'Geaccepteerd',
      postpone: 'Uitgesteld',
      reject: 'Genegeerd',
    })
  })

  it.each(TIP_DECISION_SURFACES)('%s consumeert de gedeelde constanten', (relPath) => {
    const src = source(relPath)
    expect(src).toContain("from '@/lib/tip-decision-labels'")
    expect(src).toContain('TIP_DECISION_LABELS.accept')
    expect(src).toContain('TIP_DECISION_LABELS.postpone')
    expect(src).toContain('TIP_DECISION_LABELS.reject')
  })

  it.each(TIP_DECISION_SURFACES)('%s draagt geen tweede woordenset meer', (relPath) => {
    const src = source(relPath)
    for (const woord of AFGEDANKTE_WOORDEN) {
      expect(src).not.toContain(woord)
    }
  })

  it('beschrijft in het prompt-DNA dezelfde knoppen als de UI', () => {
    // Fin verwees gebruikers naar knopnamen die niet bestonden; de DNA-regel
    // en de tool-omschrijving moeten de echte woorden noemen.
    const dna = source('lib/ai/dna/wil.ts')
    const tool = source('lib/ai/tools/suggest-recommendation.ts')
    for (const bron of [dna, tool]) {
      for (const label of Object.values(TIP_DECISION_LABELS)) {
        expect(bron).toContain(label)
      }
      for (const woord of AFGEDANKTE_WOORDEN) {
        expect(bron).not.toContain(woord)
      }
    }
  })
})
