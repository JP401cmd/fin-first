// ── Privacy-modus guard coverage — statische scan (ADR 0043, FR-1.3) ────────
//
// FR-1.3 (docs/requirements-lokale-categorisatie.md §4) vraagt een dynamische
// regressietest die ELK bestand met een `getModel(...)`-call langsloopt en
// bevestigt dat de privé-gate staat waar de scope 'm eist — nooit een
// handmatige routelijst die stilletjes verrot als er AI-routes bijkomen.
//
// SCOPE. Wat begon als scope A (één route) en groeide naar twee (categorisatie +
// chat), dekt nu ALLE aanroepbare AI-routes: de gebruiker kiest per uitvoergroep
// waar de AI draait, dus elke route moet die keuze respecteren. De routelijst is
// niet langer hier gedefinieerd maar afgeleid uit lib/ai/execution-groups.ts —
// dezelfde bron die de UI en de runtime-gate voeden, zodat de drie niet uiteen
// kunnen lopen. Platform-taken (nieuws-ingest: cron, service-role, uitsluitend
// openbare bronnen) hebben geen gebruikerssessie en dus geen gate; die staan met
// reden als `gated: false` in de registry.
//
// GEREPAREERD: de vorige versie deed `source.indexOf('getModel(')` op het
// ROUTE-bestand. Bij vijf routes (briefing, aangifte, document-extractie,
// rekenhulp, publicatie-screening) staat die aanroep in een lib-bestand, niet in
// de route — de check vond dan niets, gaf `false`, en een correcte gate leek
// kapot terwijl een ontbrekende gate net zo goed onopgemerkt bleef. De scan kent
// nu de route→lib-indirectie via `modelCallIn` en zoekt in dat geval naar de
// eerste AANROEP van een symbool dat uit die module is geïmporteerd.
//
// Dit blijft een grofmazig bronniveau-net — zelfde geest als ai-callsite-scan.ts
// (ADR 0035). Het bewijst de TEKSTUELE aanwezigheid en volgorde van de gate, niet
// dat de code bereikbaar is. Combineer met de route-tests voor echt gedrag.

import * as fs from 'fs'
import * as path from 'path'
import { AI_ROUTE_BINDINGS, GATED_AI_ROUTES, type AiRouteBinding } from './execution-groups'

/**
 * Alle routes die de privé-modus-403 moeten dragen. Afgeleid uit de registry —
 * een nieuwe AI-route toevoegen daar zet 'm automatisch onder deze bewaking.
 */
export const PRIVACY_GATED_ROUTES = GATED_AI_ROUTES

/** De stabiele foutcode die de gate teruggeeft — het anker waar de scan op zoekt. */
export const PRIVACY_GATE_CODE = 'privacy_mode_active'

/**
 * De gedeelde guard-helper (lib/ai/privacy-gate.ts). Een route die deze aanroept
 * telt als correct gegate, ook zonder de letterlijke foutcode in zijn bron: de
 * helper is de single source van de 403-vorm. Zonder deze erkenning zou de scan
 * routes afkeuren juist omdat ze het nette, gedeelde pad volgen.
 */
export const PRIVACY_GATE_HELPERS = ['assertCloudAllowed', 'isCloudAllowed'] as const

/** Mappen die worden doorlopen voor getModel-consumenten (repo-relatief). */
const SCAN_DIRS = ['app', 'lib']

function walk(dir: string, onFile: (absPath: string) => void): void {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      walk(abs, onFile)
    } else if (entry.isFile()) {
      onFile(abs)
    }
  }
}

/**
 * True als de bron een echte `getModel`-import uit de canonieke config-module
 * heeft — geen comment/string-vermelding ("// ... getModel(supabase) ...").
 */
export function importsGetModel(source: string): boolean {
  const re = /import\s*(?:type\s+)?\{([^}]*)\}\s*from\s*['"]@\/lib\/ai\/config['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    if (/\bgetModel\b/.test(m[1])) return true
  }
  return false
}

/** Repo-relatief pad (forward slashes) voor een absoluut pad onder root. */
function relOf(root: string, abs: string): string {
  return path.relative(root, abs).split(path.sep).join('/')
}

/**
 * Elk bestand (repo-relatief) dat `getModel` echt importeert en dus kan
 * aanroepen. Sluit de definitie zelf (lib/ai/config.ts) en tests uit. Een nieuwe
 * regel hier is een nieuwe AI-generatie-callsite en daarmee een bewust
 * beslismoment: hoort die route in de uitvoergroepen-registry?
 */
export function collectGetModelConsumers(root: string = process.cwd()): string[] {
  const files: string[] = []
  for (const dir of SCAN_DIRS) {
    walk(path.join(root, dir), (abs) => {
      if (!abs.endsWith('.ts') && !abs.endsWith('.tsx')) return
      if (abs.endsWith('.test.ts') || abs.endsWith('.test.tsx')) return
      const rel = relOf(root, abs)
      if (rel === 'lib/ai/config.ts') return // de definitie, geen consument
      let src: string
      try {
        src = fs.readFileSync(abs, 'utf-8')
      } catch {
        return
      }
      if (importsGetModel(src)) files.push(rel)
    })
  }
  return files.sort()
}

// ── Commentaar en strings maskeren ──────────────────────────────────────────
//
// Zonder dit telt een comment als code. Concreet gebeurd tijdens de bouw: een
// toelichting boven de gate ("de model-call zit in redactBriefing (…)") werd
// herkend als de modelcall zelf, waardoor de gate ineens "te laat" leek te
// staan. Comments benoemen nu eenmaal functienamen — dat is goede documentatie,
// geen bug.
//
// De maskering vervangt commentaar (en optioneel stringinhoud) door spaties, met
// behoud van LENGTE en regelovergangen, zodat alle index-vergelijkingen exact
// blijven kloppen op de oorspronkelijke bron.
//
// Twee views, bewust verschillend:
//   - aanroepen zoeken → comments én strings gemaskeerd (een naam in een string
//     is geen aanroep);
//   - het letterlijke `privacy_mode_active`-anker zoeken → alleen comments
//     gemaskeerd, want dát anker stáát juist in een string (`code: '…'`).
//
// Dit blijft een grofmazige lexer: een regex-literal met quotes erin kan 'm in
// theorie op het verkeerde been zetten. Voor route-bestanden is dat geen reëel
// patroon, en de scan is expliciet een net — geen parser.
function maskSource(source: string, maskStrings: boolean): string {
  const out = source.split('')
  const n = source.length
  let i = 0

  const blank = (at: number) => {
    if (source[at] !== '\n') out[at] = ' '
  }

  while (i < n) {
    const c = source[i]
    const next = source[i + 1]

    if (c === '/' && next === '/') {
      while (i < n && source[i] !== '\n') blank(i++)
      continue
    }

    if (c === '/' && next === '*') {
      blank(i++)
      blank(i++)
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) blank(i++)
      if (i < n) {
        blank(i++)
        blank(i++)
      }
      continue
    }

    if (c === '"' || c === "'" || c === '`') {
      const quote = c
      if (maskStrings) blank(i)
      i++
      while (i < n) {
        if (source[i] === '\\') {
          if (maskStrings) {
            blank(i)
            if (i + 1 < n) blank(i + 1)
          }
          i += 2
          continue
        }
        if (source[i] === quote) {
          if (maskStrings) blank(i)
          i++
          break
        }
        if (maskStrings) blank(i)
        i++
      }
      continue
    }

    i++
  }

  return out.join('')
}

/** Bron met commentaar weg, strings intact — voor het letterlijke gate-anker. */
export function withoutComments(source: string): string {
  return maskSource(source, false)
}

/** Bron met commentaar én strings weg — voor het vinden van echte aanroepen. */
export function codeOnly(source: string): string {
  return maskSource(source, true)
}

// ── Ankers en aanroepen lokaliseren ─────────────────────────────────────────

/**
 * Positie van het gate-anker: de letterlijke foutcode of een aanroep van de
 * gedeelde helper, wat het eerst komt. -1 als geen van beide voorkomt.
 */
export function findGateAnchorIndex(source: string): number {
  const candidates: number[] = []
  const code = codeOnly(source)

  for (const helper of PRIVACY_GATE_HELPERS) {
    // Alleen een echte AANROEP telt, niet de import-regel: anders zou een route
    // die de helper importeert maar nooit gebruikt als "gegate" doorgaan.
    const re = new RegExp(`\\b${helper}\\s*\\(`, 'g')
    let m: RegExpExecArray | null
    while ((m = re.exec(code)) !== null) {
      candidates.push(m.index)
      break
    }
  }

  return candidates.length > 0 ? Math.min(...candidates) : -1
}

/**
 * Zoekt een route die de privé-keuze ZELF uitrekent in plaats van de gedeelde
 * helper te gebruiken: een rauwe lezing van `privacy_mode` uit `profiles`.
 *
 * WAAROM DIT EEN EIGEN CHECK IS. De scan accepteerde eerder ook de kale string
 * `privacy_mode_active` als bewijs van een gate. Dat leek redelijk — die code
 * hóórt immers in het antwoord — maar het bewijst alleen dat er ergens een 403
 * met dat label wordt teruggegeven, niet dat de juiste beslisregel is gevolgd.
 *
 * Precies daar ging het mis: /api/ai/chat en /api/ai/categorize lazen alleen de
 * hoofdschakelaar `privacy_mode` en negeerden de per-groep-override, terwijl ze
 * met vlag en wimpel door deze scan kwamen. Twee van de zeven schakelaars op
 * /mijn/privacy waren daardoor decoratief.
 *
 * Sinds ADR 0078 is er maar één juiste beslisregel — `resolveExecutionMode`,
 * bereikt via `assertCloudAllowed`/`isCloudAllowed`. Een route die zelf
 * `privacy_mode` selecteert, implementeert per definitie de oude, zwakkere regel.
 */
export function readsPrivacyModeDirectly(source: string): boolean {
  const code = codeOnly(source)
  // `.select('privacy_mode')` en varianten daarop: de kolomnaam staat in een
  // string, dus we kijken naar de bron mét strings maar zonder commentaar.
  const withStrings = withoutComments(source)
  const selectsColumn = /\.select\(\s*['"`][^'"`]*\bprivacy_mode\b/.test(withStrings)
  // Of leest 'm als veld van een opgehaalde rij.
  const readsField = /\bprivacy_mode\s*[?:]?\s*[,}]/.test(code) || /\.privacy_mode\b/.test(code)
  return selectsColumn || readsField
}

/** `@/lib/briefing/redactie` → `lib/briefing/redactie`; anders null. */
function specToRepoPath(spec: string): string | null {
  if (!spec.startsWith('@/')) return null
  return spec.slice(2).replace(/\.tsx?$/, '')
}

/**
 * De namen die deze bron importeert uit `modelCallIn` — de symbolen waarlangs
 * een modelcall indirect bereikt kan worden. Plus de positie waar het laatste
 * van die imports eindigt, zodat we de import-regel zelf niet als aanroep tellen.
 */
export function importedNamesFrom(
  source: string,
  modelCallIn: string,
): { names: string[]; importEnd: number } {
  const target = modelCallIn.replace(/\.tsx?$/, '')
  const names: string[] = []
  let importEnd = 0

  // Commentaar weg (een uitgecommentarieerde import telt niet), strings intact —
  // het modulepad zelf staat in een string.
  const scan = withoutComments(source)
  const re = /import\s*(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(scan)) !== null) {
    if (specToRepoPath(m[2]) !== target) continue
    for (const raw of m[1].split(',')) {
      // Ondersteunt `foo as bar` — de lokale naam is wat aangeroepen wordt.
      const name = raw.split(/\s+as\s+/).pop()?.trim()
      if (name) names.push(name)
    }
    importEnd = Math.max(importEnd, m.index + m[0].length)
  }

  return { names, importEnd }
}

/**
 * Positie van de vroegste manier waarop data een model kan bereiken:
 *   - een directe `getModel(`-aanroep in deze bron, en/of
 *   - de eerste aanroep van een symbool dat uit `viaModule` is geïmporteerd.
 *
 * Beide worden meegenomen en de VROEGSTE telt: een route die zowel zelf getModel
 * aanroept als een lib-functie gebruikt, moet de gate vóór allebei hebben.
 * -1 als er geen modelcall te vinden is.
 */
export function findModelCallIndex(source: string, viaModule?: string): number {
  const candidates: number[] = []
  // Aanroepen zoeken we uitsluitend in echte code: een functienaam in een
  // comment of string is geen aanroep.
  const code = codeOnly(source)

  const direct = code.indexOf('getModel(')
  if (direct !== -1) candidates.push(direct)

  if (viaModule) {
    const { names, importEnd } = importedNamesFrom(source, viaModule)
    for (const name of names) {
      const re = new RegExp(`\\b${name}\\s*\\(`, 'g')
      let m: RegExpExecArray | null
      while ((m = re.exec(code)) !== null) {
        if (m.index > importEnd) {
          candidates.push(m.index)
          break
        }
      }
    }
  }

  return candidates.length > 0 ? Math.min(...candidates) : -1
}

/**
 * True als `source` het gate-anker draagt VÓÓR de eerste manier waarop data een
 * model kan bereiken (FR-1.2: "vóórdat getModel() ... de promptopbouw bereikt").
 *
 * `viaModule` is het bestand waarin de echte `getModel(`-aanroep staat wanneer
 * die niet in de route zelf zit — zie `AiRouteBinding.modelCallIn`.
 */
export function hasPrivacyGateBeforeModelCall(source: string, viaModule?: string): boolean {
  const gateIdx = findGateAnchorIndex(source)
  const callIdx = findModelCallIndex(source, viaModule)
  if (gateIdx === -1 || callIdx === -1) return false
  return gateIdx < callIdx
}

/** Alle bindings die gegate horen te zijn — voor de test-iteratie. */
export function gatedRouteBindings(): AiRouteBinding[] {
  return AI_ROUTE_BINDINGS.filter((b) => b.gated)
}

// ── Indirecte consumenten: de blinde vlek van de scan ───────────────────────
//
// `collectGetModelConsumers` vindt alleen bestanden die `getModel` RECHTSTREEKS
// importeren. Een route die het model via een lib bereikt — `extractFinancialData`,
// `buildCalculator`, `screenPublishMetadata`, `redactBriefing`,
// `extractAangifteData` — is voor die scan onzichtbaar.
//
// Dat is niet theoretisch: alle drie de routes die een externe provider bereikten
// zónder abonnementscheck deden dat indirect. De scan zag ze niet, dus geen test
// werd rood, en het gat kon maanden blijven staan. Deze functie vult dat aan:
// hij vindt élke route die een symbool aanroept uit een bestand dat zelf
// `getModel` importeert.

/** De libs die zelf `getModel` importeren en dus een model kunnen bereiken. */
export function collectModelReachingLibs(root: string = process.cwd()): string[] {
  return collectGetModelConsumers(root).filter((f) => !f.startsWith('app/api/'))
}

/**
 * Welke GEËXPORTEERDE symbolen in een lib leiden werkelijk tot een modelcall?
 *
 * Zonder deze verfijning is "importeert uit een model-bereikend bestand" te grof.
 * Concreet geval: `lib/briefing/redactie.ts` bevat zowel `redactBriefing` (roept
 * het model aan) als `buildRedactiePromptPreview` (geeft alleen de prompttekst
 * terug, voor de beheerpagina). Hetzelfde in `lib/ai/build-calculator.ts`:
 * `buildCalculator` genereert, `buildSystemPrompt` beschrijft alleen. Een
 * beheerroute die uitsluitend de preview-functies aanroept raakt nooit een model
 * en hoort dus niet als ongegate AI-route gemeld te worden.
 *
 * HEURISTIEK, geen parser: we knippen de bron op bij elke top-level `export`
 * en kijken in welk blok `getModel(` valt. Dat is grof — een geneste helper die
 * buiten elk exportblok staat wordt aan het voorgaande blok toegerekend — maar
 * ruim genoeg voor het doel: liever een symbool te veel als "bereikt een model"
 * (dan volgt hooguit een terechte registratie-eis) dan één te weinig.
 */
export function modelReachingExports(libSource: string): string[] {
  const code = codeOnly(libSource)
  const re = /^export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm

  const blocks: Array<{ name: string; start: number }> = []
  let m: RegExpExecArray | null
  while ((m = re.exec(code)) !== null) blocks.push({ name: m[1], start: m.index })

  const names: string[] = []
  for (let i = 0; i < blocks.length; i++) {
    const start = blocks[i].start
    const end = i + 1 < blocks.length ? blocks[i + 1].start : code.length
    if (code.slice(start, end).includes('getModel(')) names.push(blocks[i].name)
  }
  return names
}

/**
 * Geïmporteerde bindingen uit `modelCallIn`, met zowel de oorspronkelijke als de
 * lokale naam. De oorspronkelijke naam matcht tegen de exports van de lib, de
 * lokale naam is waarop in dit bestand wordt aangeroepen — bij
 * `import { buildSystemPrompt as buildCalculatorSystemPrompt }` zijn dat er twee.
 */
export function importedBindingsFrom(
  source: string,
  modelCallIn: string,
): { bindings: Array<{ original: string; local: string }>; importEnd: number } {
  const target = modelCallIn.replace(/\.tsx?$/, '')
  const bindings: Array<{ original: string; local: string }> = []
  let importEnd = 0

  const scan = withoutComments(source)
  const re = /import\s*(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(scan)) !== null) {
    if (specToRepoPath(m[2]) !== target) continue
    for (const raw of m[1].split(',')) {
      const parts = raw.split(/\s+as\s+/).map((p) => p.trim()).filter(Boolean)
      if (parts.length === 0) continue
      bindings.push({ original: parts[0], local: parts[parts.length - 1] })
    }
    importEnd = Math.max(importEnd, m.index + m[0].length)
  }

  return { bindings, importEnd }
}

/**
 * Elke route (repo-relatief) die een model bereikt — direct óf via een lib uit
 * `collectModelReachingLibs`. Dit is de lijst die volledig in `AI_ROUTE_BINDINGS`
 * hoort te staan; ontbreekt er één, dan valt die route buiten élke gate.
 */
export function collectModelReachingRoutes(root: string = process.cwd()): string[] {
  const routes = new Set<string>(collectGetModelConsumers(root).filter((f) => f.startsWith('app/api/')))

  // Per lib: welke van zijn exports leiden écht tot een modelcall.
  const libExports = new Map<string, Set<string>>()
  for (const lib of collectModelReachingLibs(root)) {
    try {
      libExports.set(lib, new Set(modelReachingExports(fs.readFileSync(path.join(root, ...lib.split('/')), 'utf-8'))))
    } catch {
      /* onleesbaar bestand → overslaan */
    }
  }

  walk(path.join(root, 'app', 'api'), (abs) => {
    if (!abs.endsWith('route.ts') && !abs.endsWith('route.tsx')) return
    const rel = relOf(root, abs)
    if (routes.has(rel)) return
    let src: string
    try {
      src = fs.readFileSync(abs, 'utf-8')
    } catch {
      return
    }

    const code = codeOnly(src)
    for (const [lib, reaching] of libExports) {
      const { bindings, importEnd } = importedBindingsFrom(src, lib)
      for (const { original, local } of bindings) {
        // Alleen symbolen die in de lib zélf bij een modelcall uitkomen tellen —
        // een prompt-preview uit hetzelfde bestand is geen AI-aanroep.
        if (!reaching.has(original)) continue
        const callRe = new RegExp(`\\b${local}\\s*\\(`, 'g')
        let m: RegExpExecArray | null
        while ((m = callRe.exec(code)) !== null) {
          if (m.index > importEnd) {
            routes.add(rel)
            return
          }
        }
      }
    }
  })

  return [...routes].sort()
}
