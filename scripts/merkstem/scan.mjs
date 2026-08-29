#!/usr/bin/env node
/**
 * TriFinity — merkstem-attestatiescanner
 * ============================================================================
 * Zero-dependency Node ESM script.
 *
 *   node scripts/merkstem/scan.mjs           (of: npm run merkstem:scan)   herattesteren
 *   node scripts/merkstem/scan.mjs --check   (of: npm run merkstem:check)  de poort
 *
 * DIT IS GEEN PARITY-SCANNER, EN DAT IS OPZET (ADR 0112).
 * `scripts/ai-parity/scan.mjs` meet EENZIJDIGE AFLEIDING: LOCAL_CHAT_DNA ís een
 * condensatie van lib/ai/dna/base.ts, dus "bron gewijzigd" heeft één uitvoerbare
 * herstelactie (hercondenseren). Landingcopy is géén afgeleide van base.ts — er
 * valt niets te hercondenseren. Wat je hier vastlegt is een ATTESTATIE: "deze copy
 * is op datum X naast deze toon- en claimbron gelegd en akkoord bevonden".
 * Drift = één van beide kanten is sindsdien bewogen.
 *
 * Daarom deelt dit script bewust géén code met de parity-scanner en neemt het zijn
 * woordenschat niet over (`subBudget`, `estimatedTokens`, `withinBudget`, `inSync`
 * passen hier op geen enkel veld). Het rapport van de parity-scanner heeft boven-
 * dien een in-app consument (/beheer/kennisbank importeert docs/ai-parity/parity.json
 * statisch); merkstem-rijen horen daar niet in. Het PATROON is hergebruikt, de code niet.
 *
 * DE GELAAGDE POORT (besluit eigenaar 26-08-2026, optie 1B):
 *   HARD (exit 1)  — de TOON- of CLAIMBRON is gewijzigd zonder herattestatie.
 *                    Daar zit de Wft-relevante schade: de copy doet claims die
 *                    niemand opnieuw naast de bron heeft gelegd.
 *   WAARSCHUWING   — de COPY is bewogen (of een oppervlakbestand is nieuw,
 *                    verdwenen of levert plotseling geen copy meer op). Zichtbaar,
 *                    maar het blokkeert een push niet: dat zou wrijving op élke
 *                    tekstwijziging zetten.
 *
 * WAT DIT NIET BEWIJST. Het manifest bewijst dat iemand hééft gekeken, niet dat de
 * copy goed is. De inhoudelijke toets is `compliance-check` (Wft-grens + claimlijst)
 * en de `merkstem`-skill; dit script is alleen de wekker.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, sep } from 'node:path'
import { copyHash, extractCopy, jsxForFile, extractDnaSection, extractMarkdownSection } from './extract-copy.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const OUT_DIR = join(ROOT, 'docs', 'merkstem')
const DATA_FILE = join(OUT_DIR, 'merkstem.json')
const MANIFEST_FILE = join(ROOT, 'lib', 'merkstem', 'merkstem-manifest.json')

/**
 * De twee canonieke bronnen die de merkstem-skill aanwijst. Bewust de SECTIE, niet
 * het hele bestand: een wijziging in `== REKENREGELS & BRONGEGEVENS ==` (canonieke
 * bestandspaden) verandert de merkstem niet en mag landingcopy niet rood maken —
 * dat is hetzelfde ruisprobleem als hele-bestand-hashing aan de copykant.
 *
 * De claimlijst staat in .claude/. Dit script LEEST dat bestand alleen; het schrijft
 * nooit in .claude/ (de zelfmodificatie-gate uit CLAUDE.md blijft dus buiten beeld).
 */
const TONE_SOURCES = [
  {
    id: 'dna-toon',
    label: 'Toon (base.ts § TOON)',
    file: 'lib/ai/dna/base.ts',
    kind: 'dna-section',
    section: 'TOON',
  },
  {
    id: 'dna-framing',
    label: 'Framing (base.ts § FRAMING)',
    file: 'lib/ai/dna/base.ts',
    kind: 'dna-section',
    section: 'FRAMING',
  },
  {
    id: 'claimlijst',
    label: 'Toegestane claims (compliance-check § De claimlijst)',
    file: '.claude/skills/compliance-check/SKILL.md',
    kind: 'markdown-section',
    section: 'De claimlijst',
  },
]

/**
 * De oppervlakken die dezelfde stem moeten dragen. `dirs` wordt recursief gescand,
 * zodat een NIEUW landingbestand niet stil buiten de dekking valt; `files` is een
 * expliciete lijst voor oppervlakken waar maar één of twee bestanden copy dragen.
 *
 * Bewust NIET hierin: /privacy, /voorwaarden en /wft. Die lopen via hun eigen,
 * strengere poort (juridische-brief + compliance-check, CLAUDE.md) en horen niet
 * onder een waarschuwing te vallen. En app/(app)/nieuws/**: die pagina draagt nul
 * copy — de redactionele stem van /nieuws zit in lib/news-system-prompt.ts, dat al
 * bron is in het DNA-parity-manifest.
 */
const SURFACES = [
  {
    id: 'landing',
    label: 'Landingcopy',
    dirs: ['components/landing'],
    files: [],
  },
  {
    id: 'publiek',
    label: 'Publieke routes',
    dirs: [],
    files: [
      'app/page.tsx',
      'app/functies/page.tsx',
      'app/prijzen/page.tsx',
      'app/veiligheid/page.tsx',
      'app/over/page.tsx',
    ],
  },
  {
    id: 'funnel',
    label: 'Funnel',
    dirs: [],
    files: ['app/check/page.tsx', 'app/signup/page.tsx', 'app/contact/page.tsx'],
  },
  {
    id: 'nieuws',
    label: '/nieuws — chrome',
    dirs: [],
    files: ['components/berichten/nieuws-only-client.tsx'],
    caveat:
      'Alleen de chrome. De berichten zelf worden door het model geschreven; die stem zit in lib/news-system-prompt.ts en is al bron in het DNA-parity-manifest.',
  },
  {
    id: 'briefing',
    label: 'Briefing-mail',
    dirs: [],
    files: ['lib/briefing/directives.ts', 'lib/briefing/email-template.ts'],
    caveat:
      'GEDEELTELIJKE DEKKING: lib/briefing/directives.ts bevat alleen de startwaarden. De draaiende richtlijnen zijn beheer-overschrijfbaar via app_settings.briefing_directives — een hash op dit bestand bewijst dus niets over wat er vandaag daadwerkelijk verstuurd wordt.',
  },
]

// ── fs-helpers ───────────────────────────────────────────────────────────────
function read(file) {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return null
  }
}
function rel(file) {
  return relative(ROOT, file).split(sep).join('/')
}

/** Recursief alle .ts/.tsx in een map, testbestanden uitgezonderd, gesorteerd. */
function walkSourceFiles(dir) {
  const abs = join(ROOT, dir)
  const out = []
  let entries
  try {
    entries = readdirSync(abs)
  } catch {
    return out
  }
  for (const name of entries) {
    const full = join(abs, name)
    let s
    try {
      s = statSync(full)
    } catch {
      continue
    }
    if (s.isDirectory()) out.push(...walkSourceFiles(rel(full)))
    else if (/\.[jt]sx?$/.test(name) && !/\.(test|spec)\./.test(name)) out.push(rel(full))
  }
  return out.sort()
}

/** Alle bestanden van één oppervlak: expliciete lijst + wat er in `dirs` staat. */
function surfaceFiles(surface) {
  const set = new Set(surface.files || [])
  for (const dir of surface.dirs || []) for (const f of walkSourceFiles(dir)) set.add(f)
  return [...set].sort()
}

// ── bronkant (de harde laag) ─────────────────────────────────────────────────
/**
 * Hash één toon-/claimbron LIVE. Ontbreekt het bestand of is de sectie hernoemd,
 * dan is `sha256` leeg — dat telt hard als drift, nooit als "geen wijziging".
 * Precies dat stille-nul-geval is de faalmodus die deze gate moet vangen.
 */
function hashToneSource(src) {
  const raw = read(join(ROOT, src.file))
  if (raw == null) return { text: null, sha256: '', reason: 'bestand ontbreekt' }
  const text =
    src.kind === 'dna-section'
      ? extractDnaSection(raw, src.section)
      : extractMarkdownSection(raw, src.section)
  if (text == null) return { text: null, sha256: '', reason: `sectie "${src.section}" niet gevonden` }
  return { text, sha256: createHash('sha256').update(text).digest('hex'), reason: '' }
}

// ── manifest ─────────────────────────────────────────────────────────────────
function readManifest() {
  const raw = read(MANIFEST_FILE)
  if (raw == null) return null
  try {
    return JSON.parse(raw)
  } catch {
    console.warn(`  ! merkstem-manifest is geen geldige JSON: ${rel(MANIFEST_FILE)}`)
    return null
  }
}

/** Baseline als lookup: bron-id → sha256, en bestand → { sha256, copyLines }. */
function baselineIndex(manifest) {
  const tone = new Map()
  const copy = new Map()
  for (const s of manifest?.toneSources || []) if (s?.id) tone.set(s.id, typeof s.sha256 === 'string' ? s.sha256 : '')
  for (const s of manifest?.surfaces || []) {
    for (const f of s?.files || []) {
      if (f?.file) copy.set(f.file, { sha256: typeof f.sha256 === 'string' ? f.sha256 : '', copyLines: Number(f.copyLines) || 0 })
    }
  }
  return { tone, copy }
}

// ── het rapport samenstellen ─────────────────────────────────────────────────
/**
 * Pure meting: leest van schijf, muteert niets. `attestedAt` komt uit het manifest
 * (dat is de menselijke handeling), `generatedAt` is scan-tijd en telt níét mee in
 * de staleness-signatuur — anders zou elke run "stale" lijken.
 */
function buildReport() {
  const manifest = readManifest()
  const base = baselineIndex(manifest)

  const toneSources = TONE_SOURCES.map((src) => {
    const live = hashToneSource(src)
    const attestedSha256 = base.tone.get(src.id) ?? ''
    const status = !live.sha256
      ? 'onvindbaar'
      : !attestedSha256
        ? 'niet-geattesteerd'
        : attestedSha256 === live.sha256
          ? 'attested'
          : 'drift'
    return {
      id: src.id,
      label: src.label,
      file: src.file,
      section: src.section,
      attestedSha256,
      liveSha256: live.sha256,
      status,
      reason: live.reason,
    }
  })

  const surfaces = SURFACES.map((surface) => {
    const live = surfaceFiles(surface)
    const attestedForSurface = (manifest?.surfaces || []).find((s) => s?.id === surface.id)
    const attestedFiles = (attestedForSurface?.files || []).map((f) => f?.file).filter(Boolean)
    const all = [...new Set([...attestedFiles, ...live])].sort()

    const files = all.map((file) => {
      const raw = read(join(ROOT, file))
      const known = base.copy.get(file)
      if (raw == null) {
        // Hernoemd of verplaatst. Telt als drift — nooit stil als "geen copy".
        return { file, attestedSha256: known?.sha256 ?? '', liveSha256: '', copyLines: 0, attestedCopyLines: known?.copyLines ?? 0, status: 'verdwenen' }
      }
      const opts = { jsx: jsxForFile(file) }
      const lines = extractCopy(raw, opts).length
      const liveSha256 = copyHash(raw, opts)
      let status
      if (!known) status = 'nieuw'
      else if (known.sha256 !== liveSha256) status = 'drift'
      else status = 'attested'
      return {
        file,
        attestedSha256: known?.sha256 ?? '',
        liveSha256,
        copyLines: lines,
        attestedCopyLines: known?.copyLines ?? 0,
        // De extractie is een heuristiek; een bestand dat plotseling nul copyregels
        // oplevert terwijl het er eerder had, is zélf een signaal (extractie stuk of
        // copy weggehaald) en verdient een eigen markering naast de hash-vergelijking.
        extractionCollapsed: Boolean(known && known.copyLines > 0 && lines === 0),
        status,
      }
    })

    return {
      id: surface.id,
      label: surface.label,
      caveat: surface.caveat || '',
      fileCount: files.length,
      copyLines: files.reduce((n, f) => n + f.copyLines, 0),
      files,
    }
  })

  const toneDrift = toneSources.filter((s) => s.status !== 'attested')
  const copyDrift = surfaces.flatMap((s) => s.files.filter((f) => f.status !== 'attested'))

  return {
    generatedAt: new Date().toISOString(),
    attestedAt: typeof manifest?.attestedAt === 'string' ? manifest.attestedAt : '',
    // De harde laag: bron bewogen zonder herattestatie.
    toneStatus: toneDrift.length === 0 ? 'attested' : 'drift',
    // De zachte laag: copy bewogen sinds de laatste attestatie.
    copyStatus: copyDrift.length === 0 ? 'attested' : 'drift',
    toneSources,
    surfaces,
  }
}

// ── staleness-signatuur (voor --check) ───────────────────────────────────────
/** Deterministische vorm van het rapport ZONDER scan-tijd. */
function signature(data) {
  const d = data && typeof data === 'object' ? data : {}
  return JSON.stringify({
    attestedAt: typeof d.attestedAt === 'string' ? d.attestedAt : '',
    toneStatus: typeof d.toneStatus === 'string' ? d.toneStatus : '',
    copyStatus: typeof d.copyStatus === 'string' ? d.copyStatus : '',
    toneSources: (Array.isArray(d.toneSources) ? d.toneSources : []).map((s) => ({
      id: s?.id ?? '',
      attestedSha256: s?.attestedSha256 ?? '',
      liveSha256: s?.liveSha256 ?? '',
      status: s?.status ?? '',
    })),
    surfaces: (Array.isArray(d.surfaces) ? d.surfaces : []).map((s) => ({
      id: s?.id ?? '',
      files: (Array.isArray(s?.files) ? s.files : []).map((f) => ({
        file: f?.file ?? '',
        attestedSha256: f?.attestedSha256 ?? '',
        liveSha256: f?.liveSha256 ?? '',
        copyLines: Number(f?.copyLines) || 0,
        status: f?.status ?? '',
      })),
    })),
  })
}

// ── herattesteren (npm run merkstem:scan) ────────────────────────────────────
/**
 * Schrijft de nieuwe baseline én het rapport. Dit is een MENSELIJKE HANDELING met
 * een betekenis: "ik heb de copy naast toon en claimlijst gelegd en akkoord
 * bevonden". Draai dit dus niet reflexmatig om een waarschuwing weg te krijgen —
 * de commit van dit bestand ís de attestatie.
 */
function runScan() {
  console.log('TriFinity merkstem — herattesteren...')
  const report = buildReport()

  // Wat verandert er t.o.v. de vorige attestatie? Expliciet tonen, zodat de
  // handeling zichtbaar is en de commit-diff leesbaar blijft.
  for (const s of report.toneSources) {
    if (s.status !== 'attested') console.log(`  → bron opnieuw geattesteerd: ${s.label}${s.reason ? ' (' + s.reason + ')' : ''}`)
  }
  for (const surface of report.surfaces) {
    for (const f of surface.files) {
      if (f.status === 'verdwenen') console.log(`  → uit de baseline verwijderd (bestand weg): ${f.file}`)
      else if (f.status !== 'attested') console.log(`  → copy opnieuw geattesteerd (${f.status}): ${f.file}`)
    }
  }

  const manifest = {
    attestedAt: new Date().toISOString(),
    note:
      'Attestatie-baseline voor de merkstem (ADR 0112). Per toon-/claimbron en per ' +
      'copy-oppervlak een sha256. Bijwerken betekent: de copy is opnieuw naast de bron ' +
      'gelegd. Zie .claude/skills/merkstem/SKILL.md en scripts/merkstem/scan.mjs.',
    toneSources: report.toneSources
      .filter((s) => s.liveSha256)
      .map((s) => ({ id: s.id, label: s.label, file: s.file, section: s.section, sha256: s.liveSha256 })),
    surfaces: report.surfaces.map((s) => ({
      id: s.id,
      label: s.label,
      caveat: s.caveat,
      files: s.files
        .filter((f) => f.status !== 'verdwenen')
        .map((f) => ({ file: f.file, sha256: f.liveSha256, copyLines: f.copyLines })),
    })),
  }

  mkdirSync(dirname(MANIFEST_FILE), { recursive: true })
  writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2) + '\n')

  // Rapport opnieuw meten tegen de VERSE baseline, zodat het gecommitte rapport
  // consistent is met het gecommitte manifest (anders is merkstem:check meteen stale).
  const fresh = buildReport()
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(DATA_FILE, JSON.stringify(fresh, null, 2) + '\n')

  printSummary(fresh)
  console.log(`  ✓ ${rel(MANIFEST_FILE)}`)
  console.log(`  ✓ ${rel(DATA_FILE)}\n`)
}

function printSummary(data) {
  console.log(`\n  Merkstem — bron: ${data.toneStatus === 'attested' ? 'GEATTESTEERD ✓' : 'DRIFT ✗'}   copy: ${data.copyStatus === 'attested' ? 'geattesteerd ✓' : 'drift !'}`)
  console.log(`  laatst geattesteerd: ${data.attestedAt || '—'}`)
  for (const s of data.toneSources) {
    console.log(`      ${s.status === 'attested' ? '✓' : '✗'} ${s.label}${s.reason ? ' — ' + s.reason : ''}`)
  }
  for (const surface of data.surfaces) {
    const drift = surface.files.filter((f) => f.status !== 'attested').length
    console.log(`      ${drift === 0 ? '✓' : '!'} ${surface.label} — ${surface.fileCount} bestanden, ${surface.copyLines} copyregels${drift ? `, ${drift} gewijzigd` : ''}`)
  }
}

// ── de poort (npm run merkstem:check) ────────────────────────────────────────
/**
 * Gelaagd, conform het eigenaar-besluit van 26-08-2026 (optie 1B):
 * bron-drift blokkeert, copy-drift waarschuwt.
 */
function runCheck() {
  const fresh = buildReport()

  if (!existsSync(MANIFEST_FILE)) {
    console.error('\nmerkstem:check — lib/merkstem/merkstem-manifest.json ontbreekt. Draai `npm run merkstem:scan` en commit het resultaat.\n')
    process.exit(1)
  }

  const toneDrift = fresh.toneSources.filter((s) => s.status !== 'attested')
  const copyDrift = fresh.surfaces.flatMap((s) => s.files.filter((f) => f.status !== 'attested'))
  const collapsed = fresh.surfaces.flatMap((s) => s.files.filter((f) => f.extractionCollapsed))

  // ── zachte laag eerst: zichtbaar, maar niet blokkerend ─────────────────────
  if (copyDrift.length > 0) {
    console.warn(`\nmerkstem:check — WAARSCHUWING: ${copyDrift.length} copy-bestand(en) bewogen sinds de laatste attestatie (${fresh.attestedAt || '—'}).`)
    for (const f of copyDrift.slice(0, 20)) console.warn(`  • ${f.status.padEnd(12)} ${f.file}`)
    if (copyDrift.length > 20) console.warn(`  • … en nog ${copyDrift.length - 20}`)
    console.warn('  Leg de copy naast lib/ai/dna/base.ts (§ TOON/§ FRAMING) en de claimlijst, en draai daarna `npm run merkstem:scan`.')
  }
  for (const f of collapsed) {
    console.warn(`  ! ${f.file} levert plotseling 0 copyregels op (was ${f.attestedCopyLines}) — copy weggehaald, of de extractie is stuk.`)
  }

  // Rapport-versheid is óók een waarschuwing: het rapport is een leesvorm, geen bron.
  const committed = existsSync(DATA_FILE) ? JSON.parse(read(DATA_FILE) || 'null') : null
  if (signature(committed) !== signature(fresh)) {
    console.warn('  ! docs/merkstem/merkstem.json is stale t.o.v. een verse meting — draai `npm run merkstem:scan`.')
  }

  // ── harde laag: de bron is bewogen zonder herattestatie ────────────────────
  if (toneDrift.length > 0) {
    console.error('\nmerkstem:check — GEBLOKKEERD: de toon-/claimbron is gewijzigd zonder herattestatie.\n')
    for (const s of toneDrift) {
      console.error(`  ✗ ${s.label} (${s.file}${s.section ? ' § ' + s.section : ''}) — ${s.status}${s.reason ? ': ' + s.reason : ''}`)
    }
    console.error(
      '\n  De landingcopy, /nieuws-chrome en briefing-mail zijn nooit naast DEZE versie van toon/claims gelegd.\n' +
        '  Loop ze na (skill: merkstem; claims via compliance-check) en draai daarna `npm run merkstem:scan`.\n',
    )
    process.exit(1)
  }

  console.log(`\nmerkstem:check — toon- en claimbron geattesteerd ✓${copyDrift.length ? '  (copy-drift: waarschuwing, zie boven)' : '  (geen copy-drift)'}\n`)
}

if (process.argv.includes('--check')) runCheck()
else runScan()
