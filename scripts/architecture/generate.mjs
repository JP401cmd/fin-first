#!/usr/bin/env node
/**
 * TriFinity — Architectuurplaat generator
 * ============================================================================
 * Zero-dependency Node ESM script. Scant de repo, voegt de curatie-laag
 * (annotations.mjs) toe, berekent een dagelijkse diff en rendert één
 * zelfstandige interactieve HTML-plaat.
 *
 *   node scripts/architecture/generate.mjs        (of: npm run arch:diagram)
 *
 * Output (docs/architecture/):
 *   - architecture.json   gestructureerde snapshot (commit dit → schone diffs)
 *   - index.html          de interactieve plaat (zelfstandig, geen deps)
 *   - CHANGELOG.md        dagelijkse wijzigingslog (append-only)
 *
 * ONDERHOUD: een nieuw domein verschijnt vanzelf zodra de code bestaat. Wil je
 * een extra scanner? Voeg een scanXxx()-functie toe en hang 'm onder in build().
 * Elke scanner is defensief: ontbreekt een bestand/patroon, dan degradeert hij
 * netjes naar leeg i.p.v. te crashen.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, sep } from 'node:path'
import annotations from './annotations.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const OUT_DIR = join(ROOT, 'docs', 'architecture')
const DATA_FILE = join(OUT_DIR, 'architecture.json')
const HTML_FILE = join(OUT_DIR, 'index.html')
const CHANGELOG = join(OUT_DIR, 'CHANGELOG.md')
const TEMPLATE = join(HERE, 'template.html')

const SKIP_DIRS = new Set(['node_modules', '.next', '.git', '.turbo', 'dist', 'build', 'coverage', '.vercel', 'public'])

// ── kleine fs-helpers ───────────────────────────────────────────────────────
function walk(dir, match) {
  const out = []
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue
      out.push(...walk(join(dir, e.name), match))
    } else if (match(join(dir, e.name))) {
      out.push(join(dir, e.name))
    }
  }
  return out
}
function read(file) { try { return readFileSync(file, 'utf8') } catch { return '' } }
function rel(file) { return relative(ROOT, file).split(sep).join('/') }
function uniq(arr) { return [...new Set(arr)] }
function warn(msg) { console.warn('  ! ' + msg) }

// ── routes / schermen ─────────────────────────────────────────────────────--
function routeFromFile(file, tail) {
  const r = rel(file).replace(/^app\//, '').replace(tail, '')
  const segs = r.split('/').filter((s) => s && !/^\(.*\)$/.test(s)) // strip route-groups
  return { url: segs.length ? '/' + segs.join('/') : '/', segs }
}
function classifyRoute(segs) {
  const top = segs[0] || ''
  for (const [key, m] of Object.entries(annotations.modules || {})) {
    if ((m.routePrefixes || []).includes(top)) return key
  }
  if (top === 'beheer') return 'beheer'
  if (top === 'onboarding') return 'onboarding'
  if (['mijn', 'rapportages', 'nieuws', 'berichten', 'household-invite'].includes(top)) return 'persoonlijk'
  if (segs.length === 0 || ['login', 'signup', 'logout', 'reset-password', 'forgot-password', 'privacy', 'voorwaarden', 'wft', 'over', 'contact'].includes(top)) return 'publiek'
  return 'overig'
}
function scanRoutes() {
  const files = walk(join(ROOT, 'app'), (f) => /[\\/]page\.(tsx|jsx|ts|js)$/.test(f))
  const routes = files.map((f) => {
    const { url, segs } = routeFromFile(f, /\/page\.(tsx|jsx|ts|js)$/)
    return { url, file: rel(f), group: classifyRoute(segs), isTest: segs.some((s) => /(^|-)test/i.test(s)) }
  })
  // dedup op url (een route kan via meerdere bestanden lijken te bestaan)
  const seen = new Set()
  return routes.filter((r) => (seen.has(r.url) ? false : seen.add(r.url))).sort((a, b) => a.url.localeCompare(b.url))
}

// ── API-routes ───────────────────────────────────────────────────────────--
const HTTP = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']
function scanApi() {
  const files = walk(join(ROOT, 'app', 'api'), (f) => /[\\/]route\.(ts|js)$/.test(f))
  return files.map((f) => {
    const { url, segs } = routeFromFile(f, /\/route\.(ts|js)$/)
    const src = read(f)
    const methods = HTTP.filter((m) => new RegExp(`export\\s+(async\\s+function\\s+${m}\\b|const\\s+${m}\\b|\\{[^}]*\\b${m}\\b[^}]*\\})`).test(src))
    return { url, file: rel(f), domain: segs[1] || segs[0] || 'root', methods }
  }).sort((a, b) => a.url.localeCompare(b.url))
}

// ── Supabase-tabellen (uit migraties) ───────────────────────────────────────
function scanTables() {
  const files = walk(join(ROOT, 'supabase', 'migrations'), (f) => /\.sql$/.test(f)).sort()
  const tables = new Map()
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?/gi
  let migrationCount = files.length
  for (const f of files) {
    let m
    const src = read(f)
    while ((m = re.exec(src))) {
      const name = m[1].toLowerCase()
      if (!tables.has(name)) tables.set(name, rel(f))
    }
  }
  const list = [...tables.entries()].map(([name, migration]) => ({ name, migration })).sort((a, b) => a.name.localeCompare(b.name))
  return { list, migrationCount }
}
function groupTables(list) {
  const domains = annotations.tableDomains || {}
  const groups = {}
  for (const t of list) {
    let domain = 'Overig'
    for (const [d, keys] of Object.entries(domains)) {
      if (keys.some((k) => t.name === k || t.name.includes(k))) { domain = d; break }
    }
    ;(groups[domain] ??= []).push(t)
  }
  return Object.entries(groups).map(([domain, tables]) => ({ domain, tables })).sort((a, b) => b.tables.length - a.tables.length)
}

// ── providers (uit de app-shell layout) ─────────────────────────────────────
function scanProviders() {
  const candidates = [join(ROOT, 'app', '(app)', 'layout.tsx'), join(ROOT, 'app', 'layout.tsx')]
  const found = new Set()
  const sources = {}
  for (const c of candidates) {
    const src = read(c)
    if (!src) continue
    for (const m of src.matchAll(/<([A-Z]\w*Provider)\b/g)) found.add(m[1])
    for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
      for (const n of m[1].split(',').map((s) => s.trim())) if (/Provider$/.test(n)) sources[n] = m[2]
    }
  }
  return [...found].sort().map((name) => ({ name, source: sources[name] || null }))
}

// ── componenten ─────────────────────────────────────────────────────────────
function scanComponents() {
  const files = walk(join(ROOT, 'components'), (f) => /\.(tsx|jsx)$/.test(f))
  const groups = {}
  for (const f of files) {
    const parts = rel(f).split('/')
    const group = parts[1] || 'root'
    const name = parts[parts.length - 1].replace(/\.(tsx|jsx)$/, '')
    ;(groups[group] ??= []).push(name)
  }
  const list = Object.entries(groups)
    .map(([group, items]) => ({ group, count: items.length, items: items.sort() }))
    .sort((a, b) => b.count - a.count)
  return { total: files.length, groups: list }
}

// ── integraties (deps + env + parsers + curatie) ────────────────────────────
const DEP_INTEGRATIONS = {
  '@ai-sdk/anthropic': ['Anthropic Claude', 'AI'],
  '@ai-sdk/openai': ['OpenAI', 'AI'],
  '@ai-sdk/mistral': ['Mistral', 'AI'],
  '@ai-sdk/react': ['Vercel AI SDK (React)', 'AI'],
  ai: ['Vercel AI SDK', 'AI'],
  '@supabase/supabase-js': ['Supabase — DB / Auth / Realtime', 'Data'],
  '@supabase/ssr': ['Supabase SSR', 'Data'],
  postgres: ['PostgreSQL (postgres.js)', 'Data'],
  mt940js: ['Bank-import MT940', 'Banking'],
  'pdfjs-dist': ['PDF-extractie (pdf.js)', 'Documents'],
  serwist: ['PWA / Service Worker (Serwist)', 'Platform'],
  '@vercel/speed-insights': ['Vercel Speed Insights', 'Observability'],
  'lucide-react': ['Lucide iconen', 'UI'],
  '@dnd-kit/core': ['Drag & drop (dnd-kit)', 'UI'],
  zod: ['Zod schema-validatie', 'Platform'],
  next: ['Next.js 16', 'Framework'],
  react: ['React 19', 'Framework'],
  tailwindcss: ['Tailwind CSS v4', 'Framework'],
}
const ENV_INTEGRATIONS = [
  [/POLAR_/, ['Polar (betalingen)', 'Payments']],
  [/TRUELAYER|BANK_CONNECT/, ['TrueLayer (bank-connect)', 'Banking']],
  [/OPENROUTER/, ['OpenRouter', 'AI']],
  [/OLLAMA/, ['Ollama (lokaal)', 'AI']],
  [/BITVAVO/, ['Bitvavo', 'Crypto']],
  [/COINBASE/, ['Coinbase', 'Crypto']],
  [/KRAKEN/, ['Kraken', 'Crypto']],
  [/PLAID/, ['Plaid', 'Banking']],
]
function scanIntegrations(pkg) {
  const map = new Map() // name -> category
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
  for (const dep of Object.keys(deps)) {
    const hit = DEP_INTEGRATIONS[dep]
    if (hit) map.set(hit[0], hit[1])
  }
  // bank-import parsers
  for (const [fmt, file] of [['CSV', 'csv'], ['OFX', 'ofx'], ['MT940', 'mt940']]) {
    if (existsSync(join(ROOT, 'lib', 'parsers', `${file}.ts`))) map.set(`Bank-import ${fmt}`, 'Banking')
  }
  // env-detectie
  const envText = ['.env', '.env.local', '.env.example', '.env.development'].map((f) => read(join(ROOT, f))).join('\n')
  for (const [re, [name, cat]] of ENV_INTEGRATIONS) if (re.test(envText)) map.set(name, cat)
  // curatie-aanvullingen
  for (const x of annotations.extraIntegrations || []) map.set(x.name, x.category)
  return [...map.entries()].map(([name, category]) => ({ name, category })).sort((a, b) => (a.category + a.name).localeCompare(b.category + b.name))
}

// ── generieke mechanismen ────────────────────────────────────────────────--
function scanContextBuilders() {
  const file = join(ROOT, 'lib', 'ai', 'context', 'builder.ts')
  const src = read(file)
  const builders = []
  for (const m of src.matchAll(/import\s*\{\s*(build\w*Context)\s*\}\s*from\s*['"]([^'"]+)['"]/g)) {
    builders.push({ name: m[1], source: m[2] })
  }
  if (!builders.length) warn('geen buildXContext-imports gevonden in builder.ts')
  return { file: rel(file), composes: /Promise\.all\s*\(\s*\[/.test(src), builders }
}
function scanBriefingTools() {
  const file = join(ROOT, 'lib', 'ai', 'dna', 'briefing.ts')
  const src = read(file)
  const tools = uniq([...src.matchAll(/^[ \t]*(\w+):\s*tool\(/gm)].map((m) => m[1])).sort()
  if (!tools.length) warn('geen "showX: tool(" definities gevonden in briefing.ts')
  return { file: rel(file), tools }
}
function scanCoach() {
  const file = join(ROOT, 'lib', 'coach-suggestions.ts')
  const src = read(file)
  const layers = []
  for (const m of src.matchAll(/(\w+):\s*\{\s*label:\s*'([^']+)',\s*description:\s*'((?:[^'\\]|\\.)*)',\s*order:\s*(\d+)/g)) {
    layers.push({ key: m[1], label: m[2], description: m[3].replace(/\s+/g, ' ').trim(), order: Number(m[4]) })
  }
  layers.sort((a, b) => a.order - b.order)
  let dataGapSignals = []
  const gap = src.match(/export type CoachDataGaps = \{([\s\S]*?)\n\}/)
  if (gap) dataGapSignals = [...gap[1].matchAll(/(\w+):\s*boolean/g)].map((m) => m[1])
  let deferredFields = []
  const def = src.match(/export type DeferredField =([^\n]+)/)
  if (def) deferredFields = [...def[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
  if (!layers.length) warn('geen COACH_LAYER_META-lagen gevonden in coach-suggestions.ts')
  return { file: rel(file), layers, dataGapSignals, deferredFields }
}

// ── functionele modules + soevereiniteitsniveaus ───────────────────────────-
function scanModules() {
  const file = join(ROOT, 'lib', 'module-registry.ts')
  const src = read(file)
  const modules = [...src.matchAll(/id:\s*'([a-z_]+)',\s*label:\s*'([^']+)'/g)].map((m) => ({ id: m[1], label: m[2] }))
  return { file: rel(file), modules }
}
function scanPhases() {
  const file = join(ROOT, 'lib', 'feature-phases.ts')
  const src = read(file)
  const phases = [...src.matchAll(/id:\s*'(\w+)',\s*label:\s*'(\w+)',\s*color:\s*'(\w+)',\s*cssName:\s*'(\w+)',\s*levels:\s*\[([^\]]*)\]/g)]
    .map((m) => ({ id: m[1], label: m[2], color: m[3], levels: m[5].split(',').map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n)) }))
  return { file: rel(file), phases }
}

// ── diff t.o.v. vorige snapshot ──────────────────────────────────────────--
function diffList(prev, cur, keyFn, labelFn = keyFn) {
  const p = new Map((prev || []).map((x) => [keyFn(x), x]))
  const c = new Map(cur.map((x) => [keyFn(x), x]))
  const added = [...c.keys()].filter((k) => !p.has(k)).map((k) => labelFn(c.get(k)))
  const removed = [...p.keys()].filter((k) => !c.has(k)).map((k) => labelFn(p.get(k)))
  return { added, removed }
}
function computeDiff(prev, data) {
  if (!prev) return { baseline: true, previousDate: null, hasChanges: false, sections: [] }
  const specs = [
    ['Schermen', prev.routes, data.routes, (r) => r.url],
    ['API-routes', prev.api, data.api, (r) => r.url],
    ['Tabellen', prev.tables?.list, data.tables.list, (t) => t.name],
    ['Context-builders', prev.patterns?.contextBuilder?.builders, data.patterns.contextBuilder.builders, (b) => b.name],
    ['Briefing-kaarten', (prev.patterns?.briefing?.tools || []).map((t) => ({ t })), data.patterns.briefing.tools.map((t) => ({ t })), (x) => x.t],
    ['Integraties', prev.integrations, data.integrations, (i) => i.name],
    ['Functionele modules', prev.modules?.modules, data.modules.modules, (m) => m.id],
  ]
  const sections = []
  for (const [label, p, c, key] of specs) {
    const d = diffList(p, c, key)
    if (d.added.length || d.removed.length) sections.push({ label, ...d })
  }
  const prevComp = prev.components?.total ?? null
  if (prevComp !== null && prevComp !== data.components.total) {
    sections.push({ label: 'Componenten (aantal)', added: data.components.total > prevComp ? [`+${data.components.total - prevComp}`] : [], removed: data.components.total < prevComp ? [`-${prevComp - data.components.total}`] : [] })
  }
  return { baseline: false, previousDate: prev.generatedDate || null, hasChanges: sections.length > 0, sections }
}

// ── build ───────────────────────────────────────────────────────────────--
function build() {
  console.log('TriFinity architectuurplaat — scannen...')
  const pkg = JSON.parse(read(join(ROOT, 'package.json')) || '{}')
  const now = new Date()

  const routes = scanRoutes()
  const api = scanApi()
  const tables = scanTables()
  const providers = scanProviders()
  const components = scanComponents()
  const integrations = scanIntegrations(pkg)
  const contextBuilder = scanContextBuilders()
  const briefing = scanBriefingTools()
  const coach = scanCoach()
  const modules = scanModules()
  const phases = scanPhases()

  // groeperingen voor de UI
  const routesByGroup = {}
  for (const r of routes) (routesByGroup[r.group] ??= []).push(r)
  const apiDomains = {}
  for (const a of api) (apiDomains[a.domain] ??= []).push(a)
  const apiByDomain = Object.entries(apiDomains)
    .map(([domain, routes]) => ({ domain, label: (annotations.apiDomainLabels || {})[domain] || domain, count: routes.length, routes }))
    .sort((a, b) => b.count - a.count)
  const tablesByDomain = groupTables(tables.list)

  const data = {
    generatedAt: now.toISOString(),
    generatedDate: now.toISOString().slice(0, 10),
    repo: { name: pkg.name || 'fin', version: pkg.version || '0.0.0' },
    annotations,
    stats: {
      routes: routes.length,
      routesProduction: routes.filter((r) => !r.isTest && r.group !== 'beheer').length,
      api: api.length,
      tables: tables.list.length,
      migrations: tables.migrationCount,
      integrations: integrations.length,
      components: components.total,
      providers: providers.length,
      contextBuilders: contextBuilder.builders.length,
      briefingTools: briefing.tools.length,
      coachLayers: coach.layers.length,
      modules: modules.modules.length,
      phases: phases.phases.length,
    },
    routes,
    routesByGroup,
    api,
    apiByDomain,
    tables,
    tablesByDomain,
    providers,
    components,
    integrations,
    patterns: { contextBuilder, briefing, coach },
    modules,
    phases,
  }

  const prev = existsSync(DATA_FILE) ? JSON.parse(read(DATA_FILE) || 'null') : null
  data.diff = computeDiff(prev, data)

  // schrijven
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2))
  renderHtml(data)
  writeChangelog(data)
  printSummary(data)
  return data
}

function renderHtml(data) {
  let tpl = read(TEMPLATE)
  if (!tpl) { warn('template.html ontbreekt — sla HTML over'); return }
  const json = JSON.stringify(data).replace(/</g, "\\u003c")
  tpl = tpl.replace('"__ARCH_DATA__"', () => json)
  writeFileSync(HTML_FILE, tpl)
}

function writeChangelog(data) {
  const d = data.diff
  let entry = `\n## ${data.generatedDate}\n\n`
  if (d.baseline) entry += '- Eerste snapshot (baseline).\n'
  else if (!d.hasChanges) entry += '- Geen wijzigingen.\n'
  else {
    for (const s of d.sections) {
      if (s.added.length) entry += `- **${s.label}** toegevoegd: ${s.added.join(', ')}\n`
      if (s.removed.length) entry += `- **${s.label}** verwijderd: ${s.removed.join(', ')}\n`
    }
  }
  if (!existsSync(CHANGELOG)) writeFileSync(CHANGELOG, '# Architectuurplaat — wijzigingslog\n')
  appendFileSync(CHANGELOG, entry)
}

function printSummary(data) {
  const s = data.stats
  console.log(`\n  Repo ${data.repo.name}@${data.repo.version} — ${data.generatedDate}`)
  console.log(`  Schermen ${s.routes} (prod ${s.routesProduction}) · API ${s.api} · Tabellen ${s.tables} · Integraties ${s.integrations} · Componenten ${s.components}`)
  console.log(`  Context-builders ${s.contextBuilders} · Briefing-kaarten ${s.briefingTools} · Coach-lagen ${s.coachLayers} · Modules ${s.modules} · Niveaus ${s.phases}`)
  const d = data.diff
  if (d.baseline) console.log('  Diff: baseline (eerste run).')
  else if (!d.hasChanges) console.log(`  Diff: geen wijzigingen sinds ${d.previousDate}.`)
  else {
    console.log(`  Diff sinds ${d.previousDate}:`)
    for (const sec of d.sections) {
      if (sec.added.length) console.log(`    + ${sec.label}: ${sec.added.join(', ')}`)
      if (sec.removed.length) console.log(`    - ${sec.label}: ${sec.removed.join(', ')}`)
    }
  }
  console.log(`\n  ✓ ${rel(HTML_FILE)}\n  ✓ ${rel(DATA_FILE)}\n`)
}

build()
