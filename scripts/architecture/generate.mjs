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
import { execFileSync } from 'node:child_process'
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

// ── datatoegang: welke API-domeinen welke tabellen lezen/schrijven ──────────--
// Regex op `.from('tabel')` (alleen bekende tabellen) met een schrijf-detectie
// in een venster erna. Test-/verify-/migratie-routes worden overgeslagen.
function scanTableAccess(knownTables) {
  const tableSet = new Set(knownTables)
  const files = walk(join(ROOT, 'app', 'api'), (f) => /[\\/]route\.(ts|js)$/.test(f))
  const domainLabels = annotations.apiDomainLabels || {}
  // domain -> table -> { write }
  const domainTables = new Map()
  // table -> domain -> { write, routes:Set }
  const tableDomains = new Map()

  for (const f of files) {
    const { url, segs } = routeFromFile(f, /\/route\.(ts|js)$/)
    const domain = segs[1] || segs[0] || 'root'
    // sla niet-product-routes over (test, verify, migratie-helpers)
    if (/^(verify|test)/.test(domain) || /migration|schema-check|run-|apply-/.test(domain) || /\/(verify|test)-/.test(url)) continue
    const src = read(f)
    for (const m of src.matchAll(/\.from\(\s*['"`]([a-z_][a-z0-9_]*)['"`]\s*\)/g)) {
      const table = m[1]
      if (!tableSet.has(table)) continue
      const after = src.slice(m.index, m.index + 140)
      const write = /\.(insert|update|upsert|delete)\s*\(/.test(after)
      // domain -> table
      let dt = domainTables.get(domain)
      if (!dt) domainTables.set(domain, (dt = new Map()))
      dt.set(table, { write: (dt.get(table)?.write ?? false) || write })
      // table -> domain
      let td = tableDomains.get(table)
      if (!td) tableDomains.set(table, (td = new Map()))
      let entry = td.get(domain)
      if (!entry) td.set(domain, (entry = { write: false, routes: new Set() }))
      entry.write = entry.write || write
      entry.routes.add(url)
    }
  }

  const byDomain = {}
  for (const [domain, tables] of domainTables) {
    byDomain[domain] = [...tables.entries()]
      .map(([name, v]) => ({ name, write: v.write }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }
  const byTable = {}
  for (const [table, domains] of tableDomains) {
    byTable[table] = [...domains.entries()]
      .map(([domain, v]) => ({ domain, label: domainLabels[domain] || domain, write: v.write, routes: [...v.routes].sort() }))
      .sort((a, b) => Number(b.write) - Number(a.write) || a.domain.localeCompare(b.domain))
  }
  const multiWriter = Object.entries(byTable)
    .filter(([, writers]) => writers.filter((w) => w.write).length > 1)
    .map(([t]) => t)
    .sort()

  return { byDomain, byTable, multiWriter }
}

// ── datarelaties: foreign keys + eigenaarschap + RLS ────────────────────────-
// Line-based state machine over de migraties. Edges = FK's tussen bekende
// public-tabellen, behálve naar `profiles`/`auth.users` (universele
// gebruikers-eigenaar) — die worden als eigenaarschap-badge getoond i.p.v. als
// ruis-edge. household_id → households blijft wél een edge (de huishoudgraaf is
// juist interessant).
function scanTableRelations(knownTables) {
  const tableSet = new Set(knownTables)
  const files = walk(join(ROOT, 'supabase', 'migrations'), (f) => /\.sql$/.test(f)).sort()
  const relations = []
  const relKey = new Set()
  const meta = {}
  const ensure = (t) => (meta[t] ??= { user: false, household: false, rls: false })
  const addRef = (from, column, schema, table) => {
    ensure(from)
    if (schema === 'auth' || table === 'users' || table === 'profiles') {
      meta[from].user = true
      return
    }
    if (column === 'household_id') meta[from].household = true
    if (column === 'user_id') meta[from].user = true
    if (!tableSet.has(table) || from === table) return
    const k = `${from}->${table}:${column}`
    if (relKey.has(k)) return
    relKey.add(k)
    relations.push({ from, to: table, column })
  }

  const REF = /references\s+(?:"?(public|auth)"?\.)?"?([a-z_][a-z0-9_]*)"?/i
  for (const f of files) {
    let current = null
    const src = read(f)
    for (const line of src.split('\n')) {
      const ct = line.match(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?/i)
      if (ct) {
        current = ct[1].toLowerCase()
        if (tableSet.has(current)) ensure(current)
        continue
      }
      if (current && /^\s*\)\s*;?/.test(line)) current = null
      // inline kolom-referentie binnen een CREATE TABLE
      if (current && tableSet.has(current) && REF.test(line)) {
        const col = line.match(/^\s*"?([a-z_][a-z0-9_]*)"?\s/)
        const ref = line.match(REF)
        if (col && ref) addRef(current, col[1].toLowerCase(), (ref[1] || '').toLowerCase(), ref[2].toLowerCase())
      }
      // RLS
      const rls = line.match(/alter\s+table\s+(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?\s+enable\s+row\s+level\s+security/i)
      if (rls && tableSet.has(rls[1].toLowerCase())) ensure(rls[1].toLowerCase()).rls = true
      const pol = line.match(/create\s+policy\s+.*\bon\s+(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?/i)
      if (pol && tableSet.has(pol[1].toLowerCase())) ensure(pol[1].toLowerCase()).rls = true
    }
    // ALTER TABLE … ADD COLUMN … REFERENCES — statement-scan, óók multi-line
    // (kolomnaam en REFERENCES op aparte regels). `[^;]` blijft binnen één
    // statement maar staat newlines toe; addRef dedupt, dus geen dubbele edge.
    const alterRef =
      /alter\s+table\s+(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?\s+add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?[^;]*?references\s+(?:"?(public|auth)"?\.)?"?([a-z_][a-z0-9_]*)"?/gi
    for (const m of src.matchAll(alterRef)) {
      if (tableSet.has(m[1].toLowerCase()))
        addRef(m[1].toLowerCase(), m[2].toLowerCase(), (m[3] || '').toLowerCase(), m[4].toLowerCase())
    }
  }
  relations.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to))
  return { relations, meta }
}

// ── Claude-team: subagents + skill-pijplijnen (.claude/) ────────────────────-
// Feiten gescand uit de teamopstelling op schijf; de betekenis (rol/inzet,
// groepen, taglines) wordt gecureerd in lib/architecture/development-model.ts.
// Defensief: ontbreekt .claude/ of een bestand, dan degraderen we naar leeg.
function scanAgentFrontmatter(src, fallbackName) {
  const { data } = parseFrontmatter(src)
  // description afknippen vóór het (lange) voorbeeldenblok
  let desc = typeof data.description === 'string' ? data.description : ''
  // YAML-escapes uit een quoted scalar terug naar leesbare tekst
  desc = desc.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\t/g, '\t')
  const cut = desc.search(/Examples?:|<example>/i)
  if (cut !== -1) desc = desc.slice(0, cut)
  desc = desc.replace(/\s+/g, ' ').trim()
  const agent = { name: typeof data.name === 'string' && data.name ? data.name : fallbackName, description: desc }
  if (typeof data.model === 'string' && data.model) agent.model = data.model
  if (typeof data.color === 'string' && data.color) agent.color = data.color
  return agent
}
function scanSkillSteps(body, agentIds) {
  // pijplijn-stappen: koppen `### N. Titel` (eventueel met `— ` + agent-naam)
  const steps = []
  const headRe = /^###\s+(\d+)\.\s+(.+?)\s*$/gm
  const heads = [...body.matchAll(headRe)]
  for (let i = 0; i < heads.length; i++) {
    const h = heads[i]
    const index = Number(h[1])
    // titel: alles vóór een eventueel "— `agent`"-achtervoegsel
    const title = h[2].split('—')[0].replace(/\s+/g, ' ').trim()
    const start = h.index + h[0].length
    // sectietekst loopt tot de volgende ### of de volgende ## (wat het eerst komt)
    const rest = body.slice(start)
    const nextH = rest.search(/\n###\s/)
    const nextHH = rest.search(/\n##\s/)
    const stop = [nextH, nextHH].filter((n) => n >= 0).sort((a, b) => a - b)[0]
    const section = stop >= 0 ? rest.slice(0, stop) : rest
    // verzamel backtick-tokens die exact een agent-id zijn, in volgorde, gededup.
    // De kop telt mee: agents staan vaak als "— `agent`"-achtervoegsel.
    const agents = []
    for (const m of (h[0] + '\n' + section).matchAll(/`([a-z0-9-]+)`/g)) {
      const tok = m[1]
      if (agentIds.has(tok) && !agents.includes(tok)) agents.push(tok)
    }
    steps.push({ index, title, agents })
  }
  return steps
}
function scanClaudeTeam() {
  const empty = { agents: [], skills: [] }
  const claudeDir = join(ROOT, '.claude')
  if (!existsSync(claudeDir)) return empty

  // ── agents ──
  const agents = []
  const agentIds = new Set()
  const agentsDir = join(claudeDir, 'agents')
  let agentFiles = []
  try { agentFiles = readdirSync(agentsDir).filter((f) => /\.md$/.test(f)).sort() } catch { agentFiles = [] }
  for (const f of agentFiles) {
    const id = f.replace(/\.md$/, '')
    const src = read(join(agentsDir, f))
    if (!src) continue
    agents.push({ id, ...scanAgentFrontmatter(src, id) })
    agentIds.add(id)
  }

  // ── skills ──
  const skills = []
  const skillsDir = join(claudeDir, 'skills')
  let skillDirs = []
  try {
    skillDirs = readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()
  } catch { skillDirs = [] }
  for (const id of skillDirs) {
    const src = read(join(skillsDir, id, 'SKILL.md'))
    if (!src) continue
    const { data, body } = parseFrontmatter(src)
    const name = typeof data.name === 'string' && data.name ? data.name : id
    const description = typeof data.description === 'string' ? data.description.replace(/\s+/g, ' ').trim() : ''
    const steps = scanSkillSteps(body, agentIds)
    skills.push({ id, name, description, steps })
  }

  return { agents, skills }
}

// ── architectuurbesluiten (ADR's) ───────────────────────────────────────────-
function parseFrontmatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return { data: {}, body: src }
  const data = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z_]+):\s*(.*)$/)
    if (!kv) continue
    let val = kv[2].trim()
    if (/^\[.*\]$/.test(val)) {
      val = val.slice(1, -1).split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
    } else {
      val = val.replace(/^['"]|['"]$/g, '')
    }
    data[kv[1]] = val
  }
  return { data, body: src.slice(m[0].length) }
}
function scanAdrs() {
  const dir = join(ROOT, 'docs', 'adr')
  const files = walk(dir, (f) => /\.md$/.test(f) && !/README/i.test(f)).sort()
  const adrs = []
  for (const f of files) {
    const { data, body } = parseFrontmatter(read(f))
    const base = f.split(sep).pop().replace(/\.md$/, '')
    const firstPara = body.split(/\r?\n\r?\n/).map((p) => p.trim()).find((p) => p && !p.startsWith('#')) || ''
    adrs.push({
      id: data.id || base,
      title: data.title || base.replace(/^\d+[-_]?/, '').replace(/[-_]/g, ' '),
      status: data.status || 'voorgesteld',
      date: data.date || '',
      elements: Array.isArray(data.elements) ? data.elements : data.elements ? [data.elements] : [],
      summary: firstPara.replace(/\s+/g, ' ').slice(0, 280),
      file: rel(f),
    })
  }
  if (!adrs.length) warn('geen ADR-bestanden gevonden in docs/adr/ (optioneel)')
  return adrs
}

// ── churn: wijzigingsdruk per gebied + grootste bestanden ───────────────────-
const CHURN_AREAS = [
  'app/api/ai', 'app/api/household', 'app/api/budgets', 'app/api/assets',
  'app/(app)/toekomst', 'app/(app)/overzicht',
  'lib/ai', 'lib/fire-simulation.ts', 'lib/horizon-data.ts', 'components/horizon',
]
// Geen shell: execFileSync met argument-array. Alle args zijn repo-constanten
// of paden uit de eigen walk — nooit externe invoer.
function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
}
function gitCommitCount(since, path) {
  try {
    const out = git(['log', since, '--pretty=format:%h', '--', path]).trim()
    return out ? out.split(/\r?\n/).length : 0
  } catch {
    return 0
  }
}
function countLines(file) {
  const s = read(file)
  return s ? s.split('\n').length : 0
}
function scanChurn(sinceDays = 90) {
  try {
    git(['rev-parse', '--is-inside-work-tree'])
  } catch {
    warn('git niet beschikbaar — churn overgeslagen')
    return null
  }
  const since = `--since=${sinceDays} days ago`
  const areas = CHURN_AREAS.map((path) => ({ path, commits: gitCommitCount(since, path) }))
  // grootste client-/lib-bestanden op regelaantal, met commit-druk
  const codeFiles = [
    ...walk(join(ROOT, 'components'), (f) => /\.(tsx|ts)$/.test(f)),
    ...walk(join(ROOT, 'app'), (f) => /\.(tsx|ts)$/.test(f)),
    ...walk(join(ROOT, 'lib'), (f) => /\.(tsx|ts)$/.test(f)),
  ].filter((f) => !/\.test\.|\.spec\./.test(f))
  const sized = codeFiles.map((f) => ({ file: rel(f), loc: countLines(f) })).sort((a, b) => b.loc - a.loc).slice(0, 8)
  const hotFiles = sized.map((s) => ({ file: s.file, loc: s.loc, commits: gitCommitCount(since, s.file) }))
  return { sinceDays, areas: areas.sort((a, b) => b.commits - a.commits), hotFiles }
}

// ── trend-historie: rollende dagreeks van de kerngetallen ───────────────────-
function buildStatsHistory(prev, today) {
  const prior = Array.isArray(prev?.statsHistory) ? prev.statsHistory.filter((e) => e && e.date !== today.date) : []
  return [...prior, today].slice(-120)
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
    ['Integratie-clients', prev.integrationClients, data.integrationClients, (c) => c.file],
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

// ── integratie-clients (broncode-scan) ──────────────────────────────────────-
// Feiten gescand: welke integratie-clients bestaan, welke base-URLs gebruiken
// ze, hebben ze een adapter-interface. Defensief → [] bij fout.
// Sla over: *-adapter.ts, *-cron.ts, *-sync.ts, *.test.ts, index.ts, shared.ts
function scanIntegrationClients() {
  const empty = []
  const SKIP_SUFFIXES = ['-adapter.ts', '-cron.ts', '-sync.ts', '.test.ts', '.d.ts']
  const SKIP_NAMES = [
    'index.ts', 'shared.ts',
    // support/helper files in integration dirs (not API clients)
    'types.ts', 'mapper.ts', 'feature-flag.ts',
    'linked-asset.ts', 'wallet-validation.ts',
    'category-mapping.ts', 'reference-data.ts',
    // infra/probe/registry files — geen extern API-client
    'health-probe.ts', 'version-registry.ts',
    // parser-support (geen formaat-client)
    'format-contracts.ts', 'categorize.ts', 'counterparty-normalize.ts',
  ]

  const dirs = [
    join(ROOT, 'lib', 'integrations'),
    join(ROOT, 'lib', 'parsers'),
    join(ROOT, 'lib', 'truelayer'),
    join(ROOT, 'lib', 'nibud'),
  ]

  const extraFiles = [
    join(ROOT, 'app', 'api', 'pension', 'parse', 'route.ts'),
  ]

  const allFiles = []
  for (const dir of dirs) {
    try {
      const entries = readdirSync(dir).filter(f => f.endsWith('.ts'))
      for (const f of entries) {
        const base = f.toLowerCase()
        if (SKIP_NAMES.includes(base)) continue
        if (SKIP_SUFFIXES.some(s => base.endsWith(s))) continue
        allFiles.push(join(dir, f))
      }
    } catch { /* dir missing — skip */ }
  }
  for (const f of extraFiles) {
    if (existsSync(f)) allFiles.push(f)
  }

  const results = []
  for (const file of allFiles) {
    try {
      const src = read(file)
      if (!src) continue
      const filePath = rel(file)
      const exists = true

      // base-URL: `const \w*BASE\w* = '...'` or `const \w*HOST\w* = '...'`
      // HOST-consts (bv. Coinbase: 'api.coinbase.com') hebben geen scheme → prepend https://
      let baseUrl = ''
      const baseRe = /const\s+\w*(?:BASE|HOST)\w*\s*=\s*['"]([^'"]+)['"]/
      const baseM = src.match(baseRe)
      if (baseM) {
        const val = baseM[1]
        baseUrl = val.startsWith('http') ? val : `https://${val}`
      }
      // fallback: first inline https:// literal (for FMP/NIBUD/TrueLayer inline URLs)
      // Knip af na het host-stuk (+ optioneel /vN-pad), niet verder
      if (!baseUrl) {
        const httpsM = src.match(/https:\/\/[a-z0-9._-]+(?:\/(?:api\/)?v\d+)?/i)
        if (httpsM) baseUrl = httpsM[0]
      }

      // hasAdapter: implements ExchangeAdapter or BrokerAdapter
      const hasAdapter = /:\s*ExchangeAdapter\b|:\s*BrokerAdapter\b/.test(src)

      // parser format: detect by filename patterns
      let parserFormat = null
      const fname = filePath.split('/').pop() || ''
      if (fname.includes('mt940')) parserFormat = 'mt940'
      else if (fname.includes('ofx')) parserFormat = 'ofx'
      else if (fname.includes('broker-csv') || fname.includes('broker_csv')) parserFormat = 'csv'
      else if (fname.includes('csv') && filePath.includes('parsers')) parserFormat = 'csv'

      results.push({ file: filePath, exists, baseUrl: baseUrl || null, hasAdapter, parserFormat })
    } catch { /* skip on error */ }
  }

  return results
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
  const tableAccess = scanTableAccess(tables.list.map((t) => t.name))
  const tableRelations = scanTableRelations(tables.list.map((t) => t.name))
  const adrs = scanAdrs()
  const churn = scanChurn()
  const claudeTeam = scanClaudeTeam()
  const integrationClients = scanIntegrationClients()

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
    tableAccess,
    tableRelations,
    adrs,
    churn,
    claudeTeam,
    integrationClients,
  }

  const prev = existsSync(DATA_FILE) ? JSON.parse(read(DATA_FILE) || 'null') : null
  data.diff = computeDiff(prev, data)
  data.statsHistory = buildStatsHistory(prev, {
    date: data.generatedDate,
    api: data.stats.api,
    components: data.stats.components,
    tables: data.stats.tables,
    routesProduction: data.stats.routesProduction,
  })

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
  const ta = data.tableAccess
  console.log(`  Datatoegang: ${Object.keys(ta.byTable).length} tabellen geraakt · ${ta.multiWriter.length} multi-writer · ADR's ${data.adrs.length} · Churn ${data.churn ? data.churn.areas.length + ' gebieden' : 'n.v.t.'}`)
  console.log(`  Datarelaties: ${data.tableRelations.relations.length} FK-edges · ${Object.values(data.tableRelations.meta).filter((m) => m.rls).length} tabellen met RLS`)
  console.log(`  Claude-team: ${data.claudeTeam.agents.length} agents · ${data.claudeTeam.skills.length} skills`)
  console.log(`  Integratie-clients: ${data.integrationClients.length} gescand`)
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
