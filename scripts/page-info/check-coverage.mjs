#!/usr/bin/env node
/**
 * check-coverage — detector voor de info-knoppen (PageInfoButton/PAGE_INFO).
 *
 * Goedkope, statische scan over app/(app)/** en components/** die vier dingen
 * signaleert:
 *   1. missing    — een `getPageInfo('key'[, 'fallback'])`/`infoKey="key"` die
 *                    naar een key wijst die niet in PAGE_INFO bestaat.
 *   2. orphaned   — een PAGE_INFO-key waar geen enkele call site (meer) naar
 *                    verwijst.
 *   3. inlineLiterals — een `<PageInfoButton>`-aanroep waarvan de `content`-
 *                    prop niet via `getPageInfo(...)` loopt (omzeilt de
 *                    centrale bron).
 *   4. uncoveredRoutes — een app-route (`app/(app)/**​/page.tsx`) die helemaal
 *                    géén info-knop rendert, terwijl besluit 9 (12 jul 2026,
 *                    `docs/ux-review-jul2026.md`) die op élke inhoudspagina
 *                    voorschrijft. Instellingen- en flow-schermen zijn bewust
 *                    uitgezonderd (`SETTINGS_OR_FLOW_ROUTES`); de nog niet
 *                    opgeloste gaten staan op de afbouwlijst `RESIDUE_ROUTES`,
 *                    die ALLEEN MAG KRIMPEN.
 *
 * Categorie 4 bestond niet toen deze gate werd geschreven: hij bewaakte alleen
 * key↔call-site, niet of een route überhaupt een knop hééft. Daardoor was
 * besluit 9 niet afdwingbaar en groeide het gat naar 17 van de 64 routes
 * (UX-onderzoek 5 sep 2026, kaart UR3-14).
 *
 * Zoals bij `check-heading-levels.mjs`: dit BEWIJST geen volledige dekking.
 * De route-scan volgt de importgraaf twee niveaus diep (page.tsx → import →
 * import) en zoekt daar naar écht gebruik — `<PageInfoButton`, een
 * doorgegeven `infoKey`, of een `getPageInfo(`-lookup. Twee niveaus is bewust:
 * dieper zoeken maakt élke pagina "gedekt" via een willekeurig hulpcomponent
 * dat toevallig ook een `i` draagt. Een knop die pas op niveau drie wordt
 * gerenderd meldt dus als gat; zet die route dan op `RESIDUE_ROUTES` met een
 * reden, of trek de knop naar de pagina zelf.
 *
 * `DEF_FILES` zijn de bestanden die de knop alleen definiëren of doorgeven
 * (de barrel, het component zelf, `page-info-content.ts`) plus de wrappers met
 * een OPTIONELE `infoKey` — die tellen niet als dekking: `ToekomstSubpageShell`
 * bevat `getPageInfo(infoKey)` ook wanneer de aanroeper geen sleutel meegeeft.
 *
 * Orphan-nuance: een PAGE_INFO-key die exact overeenkomt met een bestaande,
 * gedekte app-route (inclusief via een dynamisch segment, bv.
 * `/overzicht/schulden/mortgage` ↔ `/overzicht/schulden/[type]`) is bereikbaar
 * via de runtime `getPageInfo(pathname, 'fallback')`-match en wordt daarom NIET
 * als wees gemeld. Dat haalt de vroegere blinde vlek weg (`/toekomst/whatif`
 * meldde als wees terwijl hij prima live was) zonder dode entries te maskeren:
 * verdwijnt de route, dan valt de key vanzelf terug in `orphaned`.
 *
 * Exit 0 = geen treffers. Exit 1 = missing, inlineLiterals, uncoveredRoutes of
 * een opgeloste RESIDUE-entry die nog in de lijst staat.
 * `orphaned` alleen is een waarschuwing (exit blijft 0) — een key die je
 * bewust achterhoudt voor hergebruik is geen fout, maar wordt wel getoond.
 * Draai met `--json` voor machine-leesbare output.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, sep, dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const SCAN_DIRS = ['app/(app)', 'components']
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build', '.git'])
const CONTENT_FILE = 'lib/page-info-content.ts'
const APP_DIR = 'app/(app)'

/**
 * ── Uitzonderingen (besluit 9) ───────────────────────────────────────────────
 * Pure instellingen-schermen, wizard-/flowstappen en redirect-only routes
 * dragen bewust GEEN "Wat zie ik hier?". Dit is een permanente lijst, geen
 * afbouwlijst: een nieuw instellingenscherm hoort hier gewoon bij.
 */
export const SETTINGS_OR_FLOW_ROUTES = [
  '/dashboard', // redirect-only naar het gekozen homescherm
  '/core/assets/revalue', // herwaardeer-flow
  '/core/budgets/new',
  '/core/budgets/[id]/edit',
  '/core/cash/connect/callback',
  '/core/cash/connect/success',
  // NIET meer uitgezonderd: /overzicht/budget/instellingen. Hij begon als pure
  // instelling, maar draagt inhoud die nergens anders staat — met name dat
  // onderlinge overboekingen tussen twee meelopende eigen rekeningen op de post
  // "Eigen rekening" horen, omdat ze anders dubbel meetellen en de spaarquote
  // drukken. Dat is precies een "wat zie ik hier?"-vraag, dus de route heeft nu
  // een eigen `i` (eigenaarsbesluit 7 sep 2026).
  '/mijn/uiterlijk',
  '/mijn/geavanceerd',
  '/mijn/lokale-chat',
  '/mijn/feedback',
]

/**
 * ── Afbouwlijst (RESIDUE) ────────────────────────────────────────────────────
 * Bevroren op de stand van 6 sep 2026, ná de eerste ronde van UR3-14 (knoppen
 * op de bezittingen- en schulden-categoriepagina's + de rekenhulp). Dit zijn de
 * inhoudspagina's die nog géén info-knop dragen.
 *
 * Deze lijst MAG ALLEEN KRIMPEN — spiegelt `RESIDUE_ENTRIES` in
 * `check-heading-levels.mjs`. Een entry die geen gat meer is maakt de gate HARD
 * ROOD; anders blijft een afbouwschema stilstaan zonder dat iemand het merkt.
 * Iets TOEVOEGEN is precies de overtreding die deze gate hoort te vangen: een
 * nieuwe inhoudspagina krijgt een knop, geen regel op deze lijst.
 */
export const RESIDUE_ROUTES = [
  '/core/assets/cash/[accountId]',
  '/core/assets/crypto/[holdingId]',
  '/core/assets/holdings',
  '/core/assets/holdings/[id]',
  '/core/assets/holdings/import',
  '/core/assets/investment/[holdingId]',
  '/core/budgets/[id]',
  '/core/cash/import',
  '/rapportages/[id]',
  '/toekomst/bibliotheek/[id]',
]

/**
 * Bestanden die de knop alleen definiëren, doorgeven of achter een OPTIONELE
 * prop renderen. Ze bewijzen dus niets over de aanroepende route.
 */
const DEF_FILES = new Set([
  CONTENT_FILE,
  'components/editorial/index.ts',
  'components/editorial/page-info-button.tsx',
  'components/future/toekomst-subpage-shell.tsx', // infoKey is optioneel
])

/** Hoe diep de importgraaf gevolgd wordt bij de route-scan. Zie de kopnoot. */
const ROUTE_SCAN_DEPTH = 2

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      walk(full, out)
    } else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) {
      if (entry.endsWith('.test.tsx') || entry.endsWith('.test.ts')) continue
      out.push(full)
    }
  }
  return out
}

function loadPageInfoKeys() {
  const src = readFileSync(join(ROOT, CONTENT_FILE), 'utf8')
  const bodyMatch = src.match(/export const PAGE_INFO: Record<string, PageInfoContent> = \{([\s\S]*?)\n\}/)
  if (!bodyMatch) return []
  const body = bodyMatch[1]
  const keys = []
  const keyRe = /^\s*'([^']+)':\s*\{/gm
  let m
  while ((m = keyRe.exec(body))) keys.push(m[1])
  return keys
}

function scanFile(path, referenced, buttonSites) {
  const rel = relative(ROOT, path).split(sep).join('/')
  const src = readFileSync(path, 'utf8')

  // Literal keys referenced via getPageInfo('key') or getPageInfo(x, 'fallback')
  for (const m of src.matchAll(/getPageInfo\(\s*'([^']+)'/g)) referenced.add(m[1])
  for (const m of src.matchAll(/getPageInfo\([^,()]+,\s*'([^']+)'\s*\)/g)) referenced.add(m[1])
  // Literal keys threaded via an `infoKey="..."` prop (BelastingBoxPageHeader,
  // ToekomstSubpageShell) — these resolve to getPageInfo(infoKey) internally.
  for (const m of src.matchAll(/infoKey=["']([^"']+)["']/g)) referenced.add(m[1])

  // <PageInfoButton ...> (and its infoContent-threading wrappers PhaseIntro/
  // RegimeKaart/TipsActiesPage) call sites: flag only a genuine inline-literal
  // bypass — an object literal written directly in JSX (`content={{ ... }}`
  // or `infoContent={{ ... }}` — this is exactly where the six phase-modal
  // literals used to live before this migration). A bare identifier
  // (`content={pageInfoText}`) or a `getPageInfo(...)` call is fine even
  // though it isn't visible in this same tag: TypeScript already enforces the
  // `PageInfoContent` shape at the call site, and the identifier is
  // presumptively fed by `getPageInfo()` elsewhere in the file (this is the
  // app's `const pageInfoText = getPageInfo(pathname, 'fallback')` pattern
  // for embedded/reused client components).
  const tagRe = /<(?:PageInfoButton|PhaseIntro|RegimeKaart|TipsActiesPage)\b([\s\S]*?)(?:\/>|>)/g
  let tm
  while ((tm = tagRe.exec(src))) {
    const attrs = tm[1]
    const contentMatch = attrs.match(/(?:content|infoContent)=\{(\{[\s\S]*?\})\}/)
    if (!contentMatch) continue // no inline object literal — not this detector's concern
    const line = src.slice(0, tm.index).split('\n').length
    buttonSites.push({ file: rel, line, snippet: contentMatch[1].trim().slice(0, 80) })
  }
}

// ── Route-dekking (categorie 4) ─────────────────────────────────────────────

/** Alle `page.tsx`-bestanden onder app/(app)/**. */
function walkPages(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) walkPages(full, out)
    else if (entry === 'page.tsx') out.push(full)
  }
  return out
}

/** `app/(app)/overzicht/schulden/[type]/page.tsx` → `/overzicht/schulden/[type]`. */
export function routePathOf(file) {
  const rel = relative(join(ROOT, 'app'), file).split(sep).join('/').replace(/\/page\.tsx$/, '')
  const segments = rel
    .split('/')
    .filter((s) => s && !(s.startsWith('(') && s.endsWith(')')) && !s.startsWith('@'))
  return '/' + segments.join('/')
}

const IMPORT_EXTS = ['.tsx', '.ts']

function resolveImport(spec, fromFile) {
  let base
  if (spec.startsWith('@/')) base = join(ROOT, spec.slice(2))
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec)
  else return null // package import — buiten de repo
  for (const ext of IMPORT_EXTS) if (existsSync(base + ext)) return base + ext
  for (const ext of IMPORT_EXTS) {
    const index = join(base, 'index' + ext)
    if (existsSync(index)) return index
  }
  return null
}

/** Écht gebruik van de knop — geen re-export, geen definitie. */
const USES_PAGE_INFO = /<PageInfoButton|infoKey\s*[=:]|getPageInfo\s*\(/
const IMPORT_SPEC_RE = /(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g

export function routeHasInfoButton(entryFile) {
  const seen = new Set()
  const stack = [[entryFile, 0]]
  while (stack.length) {
    const [file, depth] = stack.pop()
    if (seen.has(file) || depth > ROUTE_SCAN_DEPTH) continue
    seen.add(file)
    let src
    try {
      src = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    const rel = relative(ROOT, file).split(sep).join('/')
    if (!DEF_FILES.has(rel) && USES_PAGE_INFO.test(src)) return true
    for (const m of src.matchAll(IMPORT_SPEC_RE)) {
      const resolved = resolveImport(m[1], file)
      if (resolved) stack.push([resolved, depth + 1])
    }
  }
  return false
}

/** `/overzicht/schulden/[type]` → regex die `/overzicht/schulden/mortgage` matcht. */
export function routePatternToRegex(route) {
  const body = route
    .split('/')
    .map((seg) => {
      if (/^\[\.\.\..+\]$/.test(seg)) return '.+'
      if (/^\[.+\]$/.test(seg)) return '[^/]+'
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('/')
  return new RegExp('^' + body + '$')
}

export function scanRoutes() {
  const files = walkPages(join(ROOT, APP_DIR))
  const routes = []
  for (const file of files) {
    const route = routePathOf(file)
    // /beheer is intern gereedschap, geen inhoudspagina voor de gebruiker.
    if (route.startsWith('/beheer')) continue
    routes.push({ route, file: relative(ROOT, file).split(sep).join('/'), covered: routeHasInfoButton(file) })
  }
  routes.sort((a, b) => a.route.localeCompare(b.route))
  return routes
}

function main() {
  const asJson = process.argv.includes('--json')
  const pageInfoKeys = new Set(loadPageInfoKeys())
  const referenced = new Set()
  const inlineLiterals = []

  const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)))
  for (const f of files) scanFile(f, referenced, inlineLiterals)

  const routes = scanRoutes()
  const settings = new Set(SETTINGS_OR_FLOW_ROUTES)
  const residue = new Set(RESIDUE_ROUTES)

  const uncoveredRoutes = routes
    .filter((r) => !r.covered && !settings.has(r.route) && !residue.has(r.route))
    .map((r) => `${r.route}  (${r.file})`)

  const knownRoutes = new Set(routes.map((r) => r.route))
  const staleResidue = RESIDUE_ROUTES.filter((route) => {
    if (!knownRoutes.has(route)) return true // route bestaat niet meer
    return routes.some((r) => r.route === route && r.covered) // gat is gedicht
  })

  // Een key die een BESTAANDE, GEDEKTE route beschrijft is bereikbaar via de
  // runtime `getPageInfo(pathname, 'fallback')`-match, ook zonder letterlijke
  // vermelding. Zie de kopnoot.
  const coveredRoutePatterns = routes.filter((r) => r.covered).map((r) => routePatternToRegex(r.route))
  const reachableViaRoute = (key) => coveredRoutePatterns.some((re) => re.test(key))

  const missing = [...referenced].filter((k) => !pageInfoKeys.has(k)).sort()
  const orphaned = [...pageInfoKeys]
    .filter((k) => !referenced.has(k) && !reachableViaRoute(k))
    .sort()

  const result = { missing, orphaned, inlineLiterals, uncoveredRoutes, staleResidue }

  if (asJson) {
    console.log(JSON.stringify(result, null, 2))
  } else if (
    missing.length === 0 &&
    orphaned.length === 0 &&
    inlineLiterals.length === 0 &&
    uncoveredRoutes.length === 0 &&
    staleResidue.length === 0
  ) {
    console.log('info-knoppen actueel, geen wijziging nodig.')
  } else {
    if (missing.length) {
      console.log(`Missing (referenced, geen PAGE_INFO-entry): ${missing.length}`)
      for (const k of missing) console.log(`  - ${k}`)
    }
    if (orphaned.length) {
      console.log(`Orphaned (PAGE_INFO-entry zonder verwijzing): ${orphaned.length}`)
      for (const k of orphaned) console.log(`  - ${k}`)
    }
    if (inlineLiterals.length) {
      console.log(`Inline-literal bypass (content omzeilt getPageInfo): ${inlineLiterals.length}`)
      for (const s of inlineLiterals) console.log(`  - ${s.file}:${s.line} — ${s.snippet}`)
    }
    if (uncoveredRoutes.length) {
      console.log(`Route zonder info-knop (besluit 9): ${uncoveredRoutes.length}`)
      for (const r of uncoveredRoutes) console.log(`  - ${r}`)
      console.log(
        '  → Voeg een PageInfoButton toe, of zet de route op SETTINGS_OR_FLOW_ROUTES als het een instellingen-/flowscherm is.',
      )
    }
    if (staleResidue.length) {
      console.log(`RESIDUE-entry die geen gat meer is (lijst mag alleen krimpen): ${staleResidue.length}`)
      for (const r of staleResidue) console.log(`  - ${r}`)
      console.log('  → Haal de regel uit RESIDUE_ROUTES in scripts/page-info/check-coverage.mjs.')
    }
  }

  process.exit(
    missing.length > 0 || inlineLiterals.length > 0 || uncoveredRoutes.length > 0 || staleResidue.length > 0
      ? 1
      : 0,
  )
}

// Alleen uitvoeren als direct aangeroepen (niet bij `import` vanuit de test).
// `pathToFileURL` is vereist voor Windows-paden (`file:///C:/...`).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
