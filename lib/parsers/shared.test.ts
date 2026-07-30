/**
 * Golden-vectortest voor computeHash (shared.ts#computeHash).
 *
 * Waarom deze test bestaat: computeHash is de ENIGE bron van duplicaatdetectie-
 * laag 1 over alle importbronnen heen (CSV, MT940, OFX, TrueLayer-sync) — zie de
 * INVARIANT-docstring bij shared.ts#computeHash. Vóór deze test pinden de
 * bestaande tests alleen de VORM (64 hextekens) en het determinisme, niet de
 * invoer zelf. Dat betekent dat de separator, de slice-lengte of een extra veld
 * in de gehashte string ongemerkt kon wijzigen: geen enkele test zou rood worden,
 * terwijl elke bestaande transactie in het corpus een andere hash zou krijgen en
 * dus bij de eerstvolgende import/sync als "nieuw" zou terugkomen — onomkeerbaar
 * voor de gebruiker (data staat dan dubbel).
 *
 * Wie deze test rood ziet: pas NIET de verwachte digest aan om weer groen te
 * worden. Rood hier betekent dat de hash-invoer (separator, slice-lengte,
 * amount-serialisatie, veldvolgorde) is veranderd. Heroverweeg die wijziging —
 * en als hij toch nodig is, hoort daar een hash-v2 met migratiepad bij (zie
 * shared.ts#computeHash), niet een stille aanpassing van dit contract.
 *
 * Hoe de golden hashes zijn bepaald: eerste run met een bewust foute placeholder-
 * digest → de "Received"-waarde uit de test-output overgenomen als literal.
 * Spiegelt format-contracts.test.ts in structuur/methode.
 */

import { describe, it, expect } from 'vitest'
import { computeHash } from './shared'

describe('computeHash — golden vectors (R1: hash-contract v1 onaangeroerd)', () => {
  it('gewoon geval: datum + positief bedrag + korte omschrijving', async () => {
    // GOLDEN HASH — gegenereerd vanuit de echte computeHash-aanroep (eerste run)
    const GOLDEN = '8153a9c438f02a7d600f10a800a152e609a2b5db9048a79fdf4e87d2d508149d'
    const hash = await computeHash('2026-01-15', 42.99, 'Lidl Amsterdam')
    expect(hash).toBe(GOLDEN)
  })

  it('negatief bedrag (dekt tekenwissel én de ${amount}-serialisatie-invariant: "-12.5", niet "-12.50")', async () => {
    // GOLDEN HASH — gegenereerd vanuit de echte computeHash-aanroep (eerste run)
    const GOLDEN = '219c6468404931fdd18b21efe7005e33766ef94a2775a44e76deb1b5d8b2b27b'
    const hash = await computeHash('2026-07-29', -12.5, 'ALBERT HEIJN 1234')
    expect(hash).toBe(GOLDEN)
  })

  it('omschrijving langer dan 100 tekens: golden hash van de afgekapte 100-tekens-prefix', async () => {
    // GOLDEN HASH — gegenereerd vanuit de echte computeHash-aanroep (eerste run)
    const GOLDEN = '127c80054eb7141a5c26a0bdbff2c422051f018281f8b868a726ef3bb8b8d684'
    const longDescription = 'A'.repeat(100) + 'STAART-DIE-VOORBIJ-DE-AFKAPGRENS-LIGT'
    const hash = await computeHash('2026-03-01', 10, longDescription)
    expect(hash).toBe(GOLDEN)
  })

  it('afkapping op 100 tekens: twee omschrijvingen die pas ná teken 100 verschillen, geven dezelfde hash', async () => {
    const prefix = 'A'.repeat(100)
    const descriptionA = prefix + 'STAART-EEN'
    const descriptionB = prefix + 'EEN-HEEL-ANDERE-STAART-DIE-NIET-MATCHT'
    expect(descriptionA).not.toBe(descriptionB) // sanity: de invoer verschilt echt

    const [hashA, hashB] = await Promise.all([
      computeHash('2026-03-01', 10, descriptionA),
      computeHash('2026-03-01', 10, descriptionB),
    ])

    expect(hashA).toBe(hashB)
  })
})
