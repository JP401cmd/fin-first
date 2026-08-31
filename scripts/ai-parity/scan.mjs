#!/usr/bin/env node
/**
 * TriFinity — Lokale-prompt-parity scanner
 * ============================================================================
 * Zero-dependency Node ESM script, gespiegeld op scripts/architecture/generate.mjs:
 * pure scan-functies → één object → writeFileSync naar een GECOMMITTE JSON, plus
 * een `--check`-modus die alleen staleness rapporteert (exit-code) zonder te
 * schrijven — symmetrisch met `arch:check`.
 *
 *   node scripts/ai-parity/scan.mjs           (of: npm run parity:scan)
 *   node scripts/ai-parity/scan.mjs --check   (of: npm run parity:check)
 *
 * Output (docs/ai-parity/):
 *   - parity.json   parity-rapport (commit dit → schone diffs; de beheerpagina
 *                   /beheer/kennisbank importeert het statisch)
 *
 * WAT HET METEN: de gecondenseerde lokale Fin-DNA (LOCAL_CHAT_DNA in
 * lib/ai/local/local-chat-prompt.ts) is een handmatig gecondenseerde afgeleide
 * van de cloud-bron-DNA (lib/ai/dna/base.ts + wil.ts). De GECOMMITTE baseline
 * staat in lib/ai/local/parity-manifest.json (per bron een sha256 + het
 * DNA-sub-budget). Deze scanner herhasht de bronnen LIVE en vergelijkt ze met de
 * opgeslagen sha256 → per-bron + overall `inSync`. Drift = een bron is gewijzigd
 * zonder dat de lokale DNA opnieuw is gecondenseerd/gebaselined (dat re-condense-
 * en-review-pad is de `lokale-prompt-parity`-skill, niet dit script).
 *
 * `--check` is de CI-poort: is het GECOMMITTE parity.json nog vers t.o.v. een
 * verse herberekening? Zo niet (bron gewijzigd → andere live-hash/`inSync`), dan
 * exit 1. Symmetrisch met arch:check; de scan-tijd (`generatedAt`) telt bewust
 * NIET mee in de vergelijking (anders zou elke run "stale" lijken).
 *
 * HASH-METHODE (moet exact gelijk zijn aan de baseline-generator van P1):
 * crypto.createHash('sha256').update(<RAW utf8 bestandsinhoud>).digest('hex') —
 * NIET de git-blob-hash. TOKEN-HEURISTIEK: Math.ceil(text.length / 4), dezelfde
 * heuristiek als lib/ai/local/knowledge-context.ts#estimateTokens.
 *
 * Elke stap is defensief: ontbreekt het manifest/bestand/patroon, dan degradeert
 * het script netjes (fallback + markering) i.p.v. te crashen.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, sep } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const OUT_DIR = join(ROOT, 'docs', 'ai-parity')
const DATA_FILE = join(OUT_DIR, 'parity.json')
const MANIFEST_FILE = join(ROOT, 'lib', 'ai', 'local', 'parity-manifest.json')
const PROMPT_FILE = join(ROOT, 'lib', 'ai', 'local', 'local-chat-prompt.ts')

// ── kleine fs-helpers (spiegel van generate.mjs) ─────────────────────────────
function read(file) {
  try {
    // CRLF→LF vóór alles: met autocrlf=true checkt git dezelfde blob op de ene
    // machine als LF en op de andere als CRLF uit. Zonder normalisatie is de
    // live-hash (en de token-telling) een functie van de LOKALE
    // regelinde-representatie en verklaart elke verse checkout het gecommitte
    // rapport onterecht stale — precies zo gevonden bij de release van 31 aug
    // 2026 (base.ts LF naast wil.ts CRLF in dezelfde boom).
    return readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
  } catch {
    return ''
  }
}
function rel(file) {
  return relative(ROOT, file).split(sep).join('/')
}
function warn(msg) {
  console.warn('  ! ' + msg)
}

// ── kern-heuristieken (moeten met de app-laag overeenkomen) ──────────────────
/**
 * sha256 van RAW utf8-inhoud — exact de methode waarmee P1 de baseline in
 * parity-manifest.json genereerde (node:crypto op de bestandsbytes, NIET de
 * git-blob-hash). Wijkt deze af, dan is de hele parity-vergelijking betekenisloos.
 */
function sha256(text) {
  return createHash('sha256').update(text).digest('hex')
}

/**
 * Grove token-schatting (chars/4) — dezelfde heuristiek als
 * lib/ai/local/knowledge-context.ts#estimateTokens. Single source is die functie;
 * hier bewust her-geïmplementeerd omdat dit een zero-dependency .mjs-script is dat
 * geen TS-module importeert (net als generate.mjs zijn eigen scanners bezit).
 */
function estimateTokens(text) {
  return Math.ceil(text.length / 4)
}

/**
 * Extraheer de inhoud van `export const <CONSTANT> = \`...\`` uit een bronbestand —
 * de template-literal tussen de backticks. Faalt de extractie (hernoemd/
 * herstructureerd), dan retourneert dit `null` en valt de caller terug op de
 * manifest-baseline (geen crash).
 *
 * Was hardgecodeerd op LOCAL_CHAT_DNA; nu geparametriseerd omdat er meerdere
 * gecondenseerde artefacten naast elkaar bestaan (chat, briefing, rapport, …) die
 * elk hun eigen sub-budget en bron-hashes hebben.
 *
 * ESCAPES. De eerdere versie ging ervan uit dat een DNA-tekst geen backticks
 * bevat en stopte non-greedy bij de eerstvolgende backtick. Dat klopt niet meer:
 * de chat-DNA draagt sinds het fin-actie-contract een ` ```fin-actie `-fence, en
 * die staat als `\\``-escape in de literal. Zonder deze afhandeling zou de tekst
 * dáár afgekapt worden en de tokenschatting te laag uitvallen — precies het cijfer
 * waarop de sub-budget-poort besluit. We matchen daarom tot de eerste ONGE-escapete
 * backtick en draaien de escapes terug, zodat we de tokens tellen van wat het
 * MODEL ziet (drie tekens ```), niet van de broncode-notatie (zes tekens \\`\\`\\`).
 */
function extractConstantText(source, constant) {
  const m = source.match(new RegExp('export const ' + constant + ' = `((?:\\\\.|[^\\\\`])*)`'))
  if (!m) return null
  // Alleen de escapes terugdraaien die in een template-literal betekenisdragend
  // zijn (backtick, backslash, dollar). `\n` e.d. laten we met rust: de DNA-teksten
  // gebruiken echte regelovergangen, geen escape-sequenties.
  return m[1].replace(/\\([`\\$])/g, '$1')
}

// ── manifest (de opgeslagen baseline) ────────────────────────────────────────
function readManifest() {
  const raw = read(MANIFEST_FILE)
  if (!raw) {
    warn(`parity-manifest ontbreekt of is leeg: ${rel(MANIFEST_FILE)}`)
    return null
  }
  try {
    return JSON.parse(raw)
  } catch {
    warn(`parity-manifest is geen geldige JSON: ${rel(MANIFEST_FILE)}`)
    return null
  }
}

// ── het parity-rapport samenstellen ──────────────────────────────────────────
/**
 * Bouw het parity-object. Pure functie: leest van schijf, muteert niets. De
 * scan-tijd (`generatedAt`) wordt hier gezet maar telt niet mee in de
 * staleness-signatuur (zie signature()).
 */
/**
 * Normaliseer de artefactenlijst uit het manifest.
 *
 * Er zijn inmiddels meerdere gecondenseerde prompt-artefacten (chat, en per
 * lokale functie die er een nodig heeft). Een ouder manifest kent alleen de
 * platte chat-vorm (dnaSubBudget/dnaEstimatedTokens/sources); die vertalen we
 * hier naar één artefact, zodat het script op beide vormen werkt.
 */
function readArtefacts(manifest) {
  if (Array.isArray(manifest.artefacts) && manifest.artefacts.length > 0) {
    return manifest.artefacts
  }
  return [
    {
      id: 'chat',
      label: 'Lokale chat-DNA',
      constant: 'LOCAL_CHAT_DNA',
      file: rel(PROMPT_FILE),
      subBudget: manifest.dnaSubBudget,
      estimatedTokens: manifest.dnaEstimatedTokens,
      sources: Array.isArray(manifest.sources) ? manifest.sources : [],
    },
  ]
}

/** Herhash één artefact live en meet zijn tokenverbruik tegen het sub-budget. */
function buildArtefact(a) {
  const id = typeof a?.id === 'string' ? a.id : ''
  const constant = typeof a?.constant === 'string' ? a.constant : ''
  const file = typeof a?.file === 'string' ? a.file : ''
  const subBudget = typeof a?.subBudget === 'number' ? a.subBudget : 0
  const baseline = typeof a?.estimatedTokens === 'number' ? a.estimatedTokens : 0

  // Per bron: herhash LIVE en vergelijk met de opgeslagen sha256.
  const sources = (Array.isArray(a?.sources) ? a.sources : [])
    .map((s) => {
      const srcFile = typeof s?.file === 'string' ? s.file : ''
      if (!srcFile) return null
      const storedSha256 = typeof s?.sha256 === 'string' ? s.sha256 : ''
      const raw = read(join(ROOT, srcFile))
      const liveSha256 = raw ? sha256(raw) : ''
      // Ontbreekt het bronbestand (lege raw → lege live-hash), dan is dat per
      // definitie drift: we kunnen de baseline niet bevestigen.
      const inSync = Boolean(storedSha256) && storedSha256 === liveSha256
      return { file: srcFile, storedSha256, liveSha256, inSync }
    })
    .filter(Boolean)

  // Live tokenschatting van de gecondenseerde tekst; bij extractie-falen de
  // manifest-baseline met een expliciete markering (geen stille aanname).
  const text = constant && file ? extractConstantText(read(join(ROOT, file)), constant) : null
  let estimatedTokens
  let tokenSource
  if (text != null) {
    estimatedTokens = estimateTokens(text)
    tokenSource = 'live'
  } else {
    estimatedTokens = baseline
    tokenSource = 'manifest-fallback'
    warn(`${constant || id} niet gevonden in ${file || '?'} — val terug op manifest-baseline`)
  }

  return {
    id,
    label: typeof a?.label === 'string' ? a.label : id,
    constant,
    file,
    subBudget,
    estimatedTokens,
    tokenSource,
    // Een artefact dat over zijn eigen sub-budget groeit, verdringt in het
    // contextvenster van 8192 tokens de gegevens waar het over moet praten.
    // Dat is een aparte faalmodus dan drift en verdient een eigen signaal.
    withinBudget: subBudget > 0 ? estimatedTokens <= subBudget : true,
    inSync: sources.length > 0 && sources.every((s) => s.inSync),
    sources,
  }
}

function buildParity() {
  const now = new Date()
  const manifest = readManifest() || {}
  const artefacts = readArtefacts(manifest).map(buildArtefact)

  // Overall in-sync: elk artefact moet kloppen én er moet er minstens één zijn
  // (een leeg manifest is geen "alles in sync").
  const inSync = artefacts.length > 0 && artefacts.every((a) => a.inSync)
  const budgetsOk = artefacts.every((a) => a.withinBudget)

  // De chat-DNA blijft ook op het TOPNIVEAU staan. Niet uit gemakzucht: de
  // beheerpagina (/beheer/kennisbank) en de UAT-criteria lezen die velden
  // rechtstreeks. Ze verhuizen mee zodra die consumenten de artefactenlijst
  // gebruiken; tot die tijd is dit een bewuste, additieve uitbreiding.
  const primary = artefacts.find((a) => a.id === 'chat') || artefacts[0] || null

  return {
    generatedAt: now.toISOString(),
    manifestGeneratedAt: typeof manifest.generatedAt === 'string' ? manifest.generatedAt : '',
    inSync,
    budgetsOk,
    dnaSubBudget: primary ? primary.subBudget : 0,
    dnaEstimatedTokens: primary ? primary.estimatedTokens : 0,
    // 'live' = uit de bron geëxtraheerd; 'manifest-fallback' = extractie faalde.
    dnaTokenSource: primary ? primary.tokenSource : 'manifest-fallback',
    sources: primary ? primary.sources : [],
    artefacts,
  }
}

// ── staleness-signatuur (voor --check) ───────────────────────────────────────
/**
 * Canonieke, deterministische vorm van het parity-rapport ZONDER de scan-tijd —
 * gebruikt om een gecommit rapport te vergelijken met een verse herberekening.
 * Defensief opgebouwd zodat een oud/afwijkend gecommit rapport niet crasht.
 */
function signature(data) {
  const d = data && typeof data === 'object' ? data : {}
  const sources = Array.isArray(d.sources) ? d.sources : []
  const artefacts = Array.isArray(d.artefacts) ? d.artefacts : []
  const sig = (list) =>
    list.map((s) => ({
      file: typeof s?.file === 'string' ? s.file : '',
      storedSha256: typeof s?.storedSha256 === 'string' ? s.storedSha256 : '',
      liveSha256: typeof s?.liveSha256 === 'string' ? s.liveSha256 : '',
      inSync: Boolean(s?.inSync),
    }))

  return JSON.stringify({
    inSync: Boolean(d.inSync),
    budgetsOk: Boolean(d.budgetsOk),
    dnaSubBudget: typeof d.dnaSubBudget === 'number' ? d.dnaSubBudget : 0,
    dnaEstimatedTokens: typeof d.dnaEstimatedTokens === 'number' ? d.dnaEstimatedTokens : 0,
    dnaTokenSource: typeof d.dnaTokenSource === 'string' ? d.dnaTokenSource : '',
    manifestGeneratedAt: typeof d.manifestGeneratedAt === 'string' ? d.manifestGeneratedAt : '',
    sources: sig(sources),
    artefacts: artefacts.map((a) => ({
      id: typeof a?.id === 'string' ? a.id : '',
      constant: typeof a?.constant === 'string' ? a.constant : '',
      subBudget: typeof a?.subBudget === 'number' ? a.subBudget : 0,
      estimatedTokens: typeof a?.estimatedTokens === 'number' ? a.estimatedTokens : 0,
      tokenSource: typeof a?.tokenSource === 'string' ? a.tokenSource : '',
      withinBudget: Boolean(a?.withinBudget),
      inSync: Boolean(a?.inSync),
      sources: sig(Array.isArray(a?.sources) ? a.sources : []),
    })),
  })
}

// ── uitvoer ──────────────────────────────────────────────────────────────────
function printSummary(data) {
  const badge = data.inSync ? 'IN SYNC ✓' : 'DRIFT ✗'
  console.log(`\n  Lokale-prompt-parity — ${badge}${data.budgetsOk ? '' : '  (SUB-BUDGET OVERSCHREDEN ✗)'}`)
  for (const a of data.artefacts) {
    const over = a.withinBudget ? '' : '  ← boven budget'
    console.log(
      `\n  ${a.inSync ? '✓' : '✗'} ${a.label} — ${a.estimatedTokens}/${a.subBudget} tokens (${a.tokenSource})${over}`,
    )
    for (const s of a.sources) {
      console.log(`      ${s.inSync ? '✓' : '✗'} ${s.file}`)
    }
  }
  console.log(`\n  ✓ ${rel(DATA_FILE)}\n`)
}

function runScan() {
  console.log('TriFinity lokale-prompt-parity — scannen...')
  const data = buildParity()
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + '\n')
  printSummary(data)
}

// ── versheidscheck (CI-poort): het gecommitte parity.json mag niet stale zijn ─
// De gecommitte parity.json wordt door niets in CI/hooks vers gehouden. Deze
// --check-modus herberekent het rapport in-memory en vergelijkt de signatuur
// (zonder scan-tijd) met de gecommitte snapshot. Dit vangt exact het gat: een
// bron-DNA (base.ts/wil.ts) die wijzigt zonder een verse `npm run parity:scan`.
function checkFresh() {
  if (!existsSync(DATA_FILE)) {
    console.error(
      'parity:check — docs/ai-parity/parity.json ontbreekt. Draai `npm run parity:scan` en commit het resultaat.',
    )
    process.exit(1)
  }
  let committed
  try {
    committed = JSON.parse(read(DATA_FILE) || 'null')
  } catch {
    committed = null
  }
  const fresh = buildParity()
  if (signature(committed) === signature(fresh)) {
    console.log('\nparity:check — parity-rapport is vers (structureel gelijk). ✓\n')
    return
  }
  console.error('\nparity:check — docs/ai-parity/parity.json is STALE.\n')
  const c = JSON.parse(signature(committed))
  const f = JSON.parse(signature(fresh))
  if (c.inSync !== f.inSync) console.error(`  • inSync: gecommit ${c.inSync} → nu ${f.inSync}`)
  if (c.dnaEstimatedTokens !== f.dnaEstimatedTokens)
    console.error(`  • dnaEstimatedTokens: gecommit ${c.dnaEstimatedTokens} → nu ${f.dnaEstimatedTokens}`)
  const fByFile = new Map(f.sources.map((s) => [s.file, s]))
  for (const cs of c.sources) {
    const fs2 = fByFile.get(cs.file)
    if (fs2 && cs.liveSha256 !== fs2.liveSha256) {
      console.error(`  • ${cs.file}: live-hash gewijzigd (bron is aangepast)`)
    }
  }
  console.error('\nDraai `npm run parity:scan` en commit het bijgewerkte docs/ai-parity/parity.json.\n')
  process.exit(1)
}

if (process.argv.includes('--check')) checkFresh()
else runScan()
