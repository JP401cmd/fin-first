#!/usr/bin/env node
/**
 * TriFinity — attest van de Krant-sjablooncatalogus
 * ============================================================================
 * Zero-dependency Node ESM script (Node ≥ 23.6: type-stripping voor de .ts-import).
 *
 *   node scripts/krant/attest-sjablonen.mjs --check
 *       De poort: elke tekst in lib/krant/sjablonen-catalogus.ts heeft een
 *       sha256 in lib/krant/sjablonen-attest.json (exit 1 bij drift). Meldt
 *       daarnaast — informatief, nooit exit 1 — of er een geldige
 *       herbevestiging door de eigenaar ligt.
 *
 *   node scripts/krant/attest-sjablonen.mjs --attest \
 *       --door "<wie>" --compliance goedgekeurd --motivering "<waarom>" \
 *       --toets "<Notion-URL · Juridische toetsen>"
 *       Herattesteren (de agent-/zelfattestatie-route): schrijft het attest
 *       opnieuw, mét de uitkomst van de compliance-check, de link naar de
 *       juridische toets en de attestatiedatum van het merkstem-manifest.
 *       WIST een eventuele herbevestiging: een nieuw attest is door de
 *       eigenaar nog niet gezien.
 *
 *   node scripts/krant/attest-sjablonen.mjs --herbevestig --toets "<Notion-URL>"
 *       ALLEEN VOOR DE EIGENAAR (rol Grenswachter). Legt vast dat de eigenaar
 *       het bestaande attest op déze catalogus (sha256, LF-regeleinden) heeft
 *       herbevestigd. Het script controleert niet wíé het draait — het draaien
 *       ervan ís de verklaring. Weigert als het attest de catalogus niet exact
 *       dekt (eerst --attest) of zonder --toets.
 *
 * WAT DIT IS: dezelfde attestatie-gedachte als het merkstem-manifest (ADR 0112),
 * maar per SJABLOON. De catalogus is copy die de app namens ons uitspreekt; het
 * attest bewijst dat iemand elke formulering naast de Wft-grens
 * (compliance-check) en de merkstem heeft gelegd. Wijzigt een tekst, dan is
 * de hash weg en is lib/krant/sjablonen-attest.test.ts rood tot iemand
 * opnieuw attesteert — bewust, want een sjabloon raakt élke lezer tegelijk.
 * De herbevestiging is de tweede sleutel: de tijdlijn-bèta gaat pas open voor
 * echte lezers als de eigenaar déze catalogus-versie heeft herbevestigd
 * (lib/krant/tijdlijn-beta.gate.test.ts).
 *
 * WAT DIT NIET BEWIJST: dat de tekst goed is. Dat is de toets zelf.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SJABLONEN, SJABLOON_VERSIE } from '../../lib/krant/sjablonen-catalogus.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const ATTEST_FILE = join(ROOT, 'lib', 'krant', 'sjablonen-attest.json')
const CATALOGUS_FILE = join(ROOT, 'lib', 'krant', 'sjablonen-catalogus.ts')
const MANIFEST_FILE = join(ROOT, 'lib', 'merkstem', 'merkstem-manifest.json')

const HELP = `attest-sjablonen — attest van de Krant-sjablooncatalogus (ADR 0172)

  --check
      Poort: elke formulering heeft een hash in het attest (exit 1 bij drift).
      Meldt informatief of de eigenaar deze catalogus heeft herbevestigd.

  --attest --door "<wie>" --compliance <goedgekeurd|aanpassen|afgewezen>
           --motivering "<waarom>" --toets "<Notion-URL · Juridische toetsen>"
      Agent-/zelfattestatie: schrijft het attest opnieuw en WIST de
      herbevestiging (die hoort bij de vorige versie).

  --herbevestig --toets "<Notion-URL>"
      ALLEEN VOOR DE EIGENAAR (rol Grenswachter). Het script controleert niet
      wie het draait: het draaien ervan is de verklaring dat de eigenaar dit
      attest op de huidige catalogus heeft herbevestigd. Weigert als het attest
      de catalogus niet exact dekt (draai eerst --attest).

  --help
      Deze tekst.
`

const sha256 = (tekst) => createHash('sha256').update(tekst, 'utf8').digest('hex')

/** sha256 van de catalogus met LF-regeleinden — de werkboom kan CRLF hebben. */
function catalogusSha256() {
  return sha256(readFileSync(CATALOGUS_FILE, 'utf8').replace(/\r\n/g, '\n'))
}

function hashes() {
  const out = {}
  for (const id of Object.keys(SJABLONEN).sort()) out[id] = SJABLONEN[id].map(sha256)
  return out
}

function arg(naam) {
  const i = process.argv.indexOf(naam)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function lees(file) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null
}

/** Afwijkingen tussen attest en catalogus; leeg = het attest dekt de catalogus exact. */
function afwijkingen(attest) {
  const live = hashes()
  const fouten = []
  if (attest.sjabloonVersie !== SJABLOON_VERSIE) fouten.push(`sjabloonVersie ${attest.sjabloonVersie} ≠ ${SJABLOON_VERSIE}`)
  for (const [id, lijst] of Object.entries(live)) {
    const bekend = attest.sjablonen?.[id] ?? []
    lijst.forEach((h, v) => {
      if (bekend[v] !== h) fouten.push(`${id}[${v}] niet geattesteerd`)
    })
    if (bekend.length !== lijst.length) fouten.push(`${id}: ${bekend.length} geattesteerd, ${lijst.length} in de catalogus`)
  }
  for (const id of Object.keys(attest.sjablonen ?? {})) if (!(id in live)) fouten.push(`${id} staat in het attest maar niet in de catalogus`)
  return fouten
}

function schrijf(attest) {
  writeFileSync(ATTEST_FILE, JSON.stringify(attest, null, 2) + '\n', 'utf8')
}

const mode = process.argv.includes('--help') || process.argv.length <= 2
  ? 'help'
  : process.argv.includes('--herbevestig')
    ? 'herbevestig'
    : process.argv.includes('--attest')
      ? 'attest'
      : process.argv.includes('--check')
        ? 'check'
        : 'help'

if (mode === 'help') {
  console.log(HELP)
} else if (mode === 'check') {
  const attest = lees(ATTEST_FILE)
  if (!attest) {
    console.error('sjablonen-attest.json ontbreekt — draai --attest na merkstem en compliance-check')
    process.exit(1)
  }
  const fouten = afwijkingen(attest)
  if (fouten.length) {
    console.error(`sjablonen-attest: ${fouten.length} afwijking(en)\n  ${fouten.join('\n  ')}`)
    process.exit(1)
  }
  console.log(`sjablonen-attest: ${Object.keys(SJABLONEN).length} sjablonen geattesteerd (versie ${SJABLOON_VERSIE}, ${attest.attestedAt})`)
  // Informatief: de herbevestiging is geen poort voor --check, wél voor de bèta-vlag.
  const hb = attest.herbevestiging ?? null
  if (!hb) console.log('herbevestiging: geen — de eigenaar heeft dit attest nog niet herbevestigd')
  else if (hb.door === 'eigenaar' && hb.catalogusSha256 === catalogusSha256()) console.log(`herbevestiging: geldig (eigenaar, ${hb.at})`)
  else console.log('herbevestiging: VERVALLEN — de catalogus is gewijzigd sinds de herbevestiging')
} else if (mode === 'herbevestig') {
  const toets = arg('--toets')
  if (!toets) {
    console.error('gebruik: --herbevestig --toets "<Notion-URL · Juridische toetsen>"')
    process.exit(1)
  }
  const attest = lees(ATTEST_FILE)
  if (!attest) {
    console.error('sjablonen-attest.json ontbreekt — draai eerst --attest')
    process.exit(1)
  }
  const fouten = afwijkingen(attest)
  if (fouten.length) {
    console.error(`herbevestigen geweigerd: het attest dekt de catalogus niet (${fouten.length} afwijking(en)) — draai eerst --attest\n  ${fouten.join('\n  ')}`)
    process.exit(1)
  }
  // Alleen interactief (security Y2, 28-09): een agent-shell heeft geen TTY en
  // wordt hier geweigerd. Dat maakt een herbevestiging door een agent geen
  // ongeluk meer maar een bewuste overtreding — waterdicht is het niet.
  if (!process.stdin.isTTY) {
    console.error('herbevestigen geweigerd: alleen interactief, in een eigen terminal van de eigenaar (geen TTY gevonden)')
    process.exit(1)
  }
  const verwacht = catalogusSha256().slice(0, 8)
  const { createInterface } = await import('node:readline/promises')
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const antwoord = (await rl.question(`Je herbevestigt als eigenaar (Grenswachter) dat je elke formulering van deze catalogus hebt gelezen.\nTyp ter bevestiging de eerste 8 tekens van de catalogus-hash (${verwacht}): `)).trim()
  rl.close()
  if (antwoord !== verwacht) {
    console.error('herbevestigen geweigerd: bevestiging klopt niet')
    process.exit(1)
  }
  attest.herbevestiging = {
    door: 'eigenaar',
    rol: 'Grenswachter',
    at: new Date().toISOString(),
    catalogusSha256: catalogusSha256(),
    juridischeToets: toets,
  }
  schrijf(attest)
  console.log(`sjablonen-attest herbevestigd door de eigenaar (catalogus ${attest.herbevestiging.catalogusSha256.slice(0, 12)}…)`)
} else {
  const door = arg('--door')
  const verdict = arg('--compliance')
  const motivering = arg('--motivering')
  const toets = arg('--toets')
  if (!door || !verdict || !motivering || !toets) {
    console.error('gebruik: --attest --door "<wie>" --compliance <goedgekeurd|aanpassen|afgewezen> --motivering "<waarom>" --toets "<Notion-URL>"')
    process.exit(2)
  }
  const manifest = lees(MANIFEST_FILE)
  const oppervlak = manifest?.surfaces?.find((s) => s.id === 'krant-sjablonen')
  const at = new Date().toISOString()
  const attest = {
    note: 'Attest van de Krant-sjablooncatalogus (ADR 0172). Per sjabloon-id een sha256 per formulering. Bijwerken = de catalogus is opnieuw door merkstem en compliance-check gegaan: node scripts/krant/attest-sjablonen.mjs --attest … ; herbevestiging door de eigenaar: --herbevestig --toets …',
    attestedAt: at,
    attestedBy: door,
    sjabloonVersie: SJABLOON_VERSIE,
    merkstem: {
      manifestAttestedAt: manifest?.attestedAt ?? null,
      oppervlak: oppervlak ? { id: oppervlak.id, files: oppervlak.files.map((f) => ({ file: f.file, sha256: f.sha256 })) } : null,
    },
    compliance: { verdict, at, motivering, toets },
    // Een nieuw (zelf)attest is door de eigenaar nog niet gezien: herbevestiging wissen.
    herbevestiging: null,
    sjablonen: hashes(),
  }
  schrijf(attest)
  console.log(`sjablonen-attest geschreven: ${Object.keys(attest.sjablonen).length} sjablonen, compliance ${verdict}; herbevestiging door de eigenaar gewist`)
}
