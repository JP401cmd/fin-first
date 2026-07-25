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
    return readFileSync(file, 'utf8')
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
 * Extraheer de inhoud van `export const LOCAL_CHAT_DNA = \`...\`` uit
 * local-chat-prompt.ts — de template-literal tussen de backticks. De DNA-tekst
 * bevat geen backticks of ${}-interpolatie (het is een platte string), dus de
 * non-greedy match tot de eerstvolgende backtick pakt de volledige inhoud.
 * Faalt de extractie (hernoemd/herstructureerd), dan retourneert dit `null` en
 * valt de caller terug op de manifest-baseline (geen crash).
 */
function extractDnaText(promptSource) {
  const m = promptSource.match(/export const LOCAL_CHAT_DNA = `([\s\S]*?)`/)
  return m ? m[1] : null
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
function buildParity() {
  const now = new Date()
  const manifest = readManifest() || {}
  const manifestSources = Array.isArray(manifest.sources) ? manifest.sources : []

  // Per bron: herhash LIVE en vergelijk met de opgeslagen sha256.
  const sources = manifestSources
    .map((s) => {
      const file = typeof s?.file === 'string' ? s.file : ''
      if (!file) return null
      const storedSha256 = typeof s?.sha256 === 'string' ? s.sha256 : ''
      const raw = read(join(ROOT, file))
      const liveSha256 = raw ? sha256(raw) : ''
      // Ontbreekt het bronbestand (lege raw → lege live-hash), dan is dat per
      // definitie drift: we kunnen de baseline niet bevestigen.
      const inSync = Boolean(storedSha256) && storedSha256 === liveSha256
      return { file, storedSha256, liveSha256, inSync }
    })
    .filter(Boolean)

  // Overall in-sync: elke bron moet kloppen én er moet minstens één bron zijn
  // (een leeg manifest is geen "alles in sync").
  const inSync = sources.length > 0 && sources.every((s) => s.inSync)

  // Live tokenschatting van de gecondenseerde DNA-tekst; bij extractie-falen de
  // manifest-baseline met een expliciete markering (geen stille aanname).
  const dnaText = extractDnaText(read(PROMPT_FILE))
  const manifestBaseline =
    typeof manifest.dnaEstimatedTokens === 'number' ? manifest.dnaEstimatedTokens : 0
  let dnaEstimatedTokens
  let dnaTokenSource
  if (dnaText != null) {
    dnaEstimatedTokens = estimateTokens(dnaText)
    dnaTokenSource = 'live'
  } else {
    dnaEstimatedTokens = manifestBaseline
    dnaTokenSource = 'manifest-fallback'
    warn('LOCAL_CHAT_DNA niet gevonden in local-chat-prompt.ts — val terug op manifest-baseline')
  }

  return {
    generatedAt: now.toISOString(),
    manifestGeneratedAt: typeof manifest.generatedAt === 'string' ? manifest.generatedAt : '',
    inSync,
    dnaSubBudget: typeof manifest.dnaSubBudget === 'number' ? manifest.dnaSubBudget : 0,
    dnaEstimatedTokens,
    // 'live' = uit de bron geëxtraheerd; 'manifest-fallback' = extractie faalde.
    dnaTokenSource,
    sources,
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
  return JSON.stringify({
    inSync: Boolean(d.inSync),
    dnaSubBudget: typeof d.dnaSubBudget === 'number' ? d.dnaSubBudget : 0,
    dnaEstimatedTokens: typeof d.dnaEstimatedTokens === 'number' ? d.dnaEstimatedTokens : 0,
    dnaTokenSource: typeof d.dnaTokenSource === 'string' ? d.dnaTokenSource : '',
    manifestGeneratedAt: typeof d.manifestGeneratedAt === 'string' ? d.manifestGeneratedAt : '',
    sources: sources.map((s) => ({
      file: typeof s?.file === 'string' ? s.file : '',
      storedSha256: typeof s?.storedSha256 === 'string' ? s.storedSha256 : '',
      liveSha256: typeof s?.liveSha256 === 'string' ? s.liveSha256 : '',
      inSync: Boolean(s?.inSync),
    })),
  })
}

// ── uitvoer ──────────────────────────────────────────────────────────────────
function printSummary(data) {
  const badge = data.inSync ? 'IN SYNC ✓' : 'DRIFT ✗'
  console.log(`\n  Lokale-prompt-parity — ${badge}`)
  console.log(`  DNA-tokens (${data.dnaTokenSource}): ${data.dnaEstimatedTokens} / ${data.dnaSubBudget} sub-budget`)
  for (const s of data.sources) {
    console.log(`  ${s.inSync ? '✓' : '✗'} ${s.file}`)
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
