/**
 * EFFECTEN-APP LEVERT GEEN CRYPTO — anti-driftgrendel.
 *
 * ── HET DEFECT DAT HIER WORDT VASTGEPIND ────────────────────────────────────
 * `loadHoldingsData` las naast `investment_holdings` óók `crypto_holdings` en
 * plakte beide in één lijst met een `bucket`-discriminator. Dat stamde uit de
 * tijd dat er nog geen crypto-app was. Inmiddels is die er wél — de
 * "Crypto holdings"-tab op `/core/assets/crypto`, met eigen transacties,
 * koershistorie, spreiding en Box 3-strook (`lib/crypto-holdings-data.ts`).
 *
 * Gevolg van de dubbele bron: munten verschenen in de AANDELEN-app
 * (`/overzicht/bezittingen/investment?tab=aandelen-holdings`) als een tweede,
 * armere weergave van posities die een eigen scherm hebben — met een afgeleide
 * `{SYMBOOL}-EUR`-ticker die de aandelen-lijst als beursticker toonde, zonder
 * de crypto-specifieke cijfers die dáár wél kloppen.
 *
 * ── WAAROM EEN BRONANKER EN GEEN UNIT-TEST ──────────────────────────────────
 * `loadHoldingsData` doet vier queries op een echte Supabase-client en is niet
 * unit-draaibaar; hetzelfde patroon als
 * lib/holdings-data-loader.swr-grondslag.test.ts. Deze suite toetst daarom de
 * BRON: geen van beide leveranciers van de holdings-lijst mag `crypto_holdings`
 * aanraken. Ze moeten dezelfde set leveren — de loader vult de eerste render,
 * de route elke herlading dáárna; lopen ze uiteen, dan verschijnen of
 * verdwijnen er posities zonder dat de gebruiker iets deed.
 */

import { describe, it, expect } from 'vitest'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readSourceLF } from '@/lib/test-utils/read-source'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LOADER_PATH = join(REPO_ROOT, 'lib', 'holdings-data-loader.ts')
const ROUTE_PATH = join(REPO_ROOT, 'app', 'api', 'holdings', 'route.ts')
const CRYPTO_LOADER_PATH = join(REPO_ROOT, 'lib', 'crypto-holdings-data.ts')

/** Strip commentaar: de toelichtingen NOEMEN crypto_holdings nog wel — terecht,
 *  ze leggen uit waaróm het er niet meer is. Het anker matcht op CODE.
 *  CRLF-veilig via readSourceLF (zie lib/test-utils/read-source.ts). */
function codeOf(path: string): string {
  return readSourceLF(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
    .replace(/\s+/g, ' ')
}

describe('de effecten-holdings-lijst leest geen crypto', () => {
  it('loadHoldingsData bevraagt crypto_holdings niet', () => {
    expect(codeOf(LOADER_PATH)).not.toContain('crypto_holdings')
  })

  it('GET /api/holdings bevraagt crypto_holdings niet', () => {
    // De route is de tweede leverancier van dezelfde lijst. Zou één van de twee
    // crypto meenemen, dan wisselt de inhoud van de lijst zodra de pagina
    // herlaadt — precies het soort stille verschil dat niemand meldt.
    //
    // Match op de QUERY, niet op het woord: de tabelnaam staat ook in de
    // 400-melding die een crypto-holding op dit endpoint weigert. Die tekst is
    // juist gewenst en mag deze grendel niet rood maken.
    expect(codeOf(ROUTE_PATH)).not.toContain("from('crypto_holdings')")
  })

  it('de loader kent geen crypto-bucket en geen afgeleide -EUR-ticker meer', () => {
    // Bewust alleen de loader: in de route stáát `'crypto'` nog, maar dan als
    // POST-guard die juist wéigert een holding op een crypto-bezitting aan te
    // maken (WF-BEZIT-21). Die hoort te blijven — een blanket-verbod op het
    // woord zou een correcte afscherming rood maken.
    const code = codeOf(LOADER_PATH)
    expect(code).not.toContain("'crypto'")
    expect(code).not.toContain('-EUR')
  })

  it('de crypto-app bestaat wél en is de plek waar die posities horen', () => {
    // Vangnet tegen de verkeerde conclusie uit de tests hierboven: crypto is
    // niet weggevallen, het heeft een eigen oppervlak. Verdwijnt die loader,
    // dan is "geen crypto in de effecten-app" ineens dataverlies in plaats van
    // een scheiding, en hoort deze suite opnieuw bekeken te worden.
    expect(codeOf(CRYPTO_LOADER_PATH)).toContain('crypto_holdings')
    expect(codeOf(CRYPTO_LOADER_PATH)).toContain('loadCryptoHoldingsForUser')
  })
})
