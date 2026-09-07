import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import nextConfig from '../next.config'
import { getAllPageItems } from './command-palette/navigation-index'
import {
  EXTRA_ROUTE_TITLES,
  OVERVIEW_APP_SUBROUTES,
  globalNav,
  mainNav,
  navGroups,
  resolveRouteTitle,
} from './nav-config'

/**
 * SSoT-guard voor de navigatieboom (K-05 / W2.4 NAV-SSOT, uitgebreid bij UR3-26).
 *
 * Deze suite bewaakt drie dingen over élke `app/(app)/**​/page.tsx` op schijf:
 *
 *  1. TITEL — `resolveRouteTitle()` (lib/nav-config.ts) is de single source of
 *     truth voor de paginatitel die de mobiele TopBar toont wanneer een pagina
 *     zelf geen titel meegeeft. Een canonieke route buiten álle nav-bronnen
 *     "werkt" alleen doordat de pagina toevallig een `<NavStackMeta title>`
 *     zet — precies de SSoT-breuk die K-05 beschrijft.
 *  2. BEREIKBAARHEID — elke route heeft minstens één INGANG (menu, ⌘K, of een
 *     in-app link), of staat in het register hieronder mét een reden.
 *  3. DODE NAV-HREFS — elke href in de nav-bronnen wijst naar een route die
 *     werkelijk bestaat.
 *
 * WAAROM (2) EN (3) ERBIJ KWAMEN. De oude suite mat alleen titel-dekking, en
 * `LEGACY_BACKING_ROUTES` was een vrijstelling van de TITEL-eis waarvoor "de
 * pagina zet zelf een NavStackMeta" een geldige ontsnapping was. Daardoor
 * glipten twee dingen door 29 groene tests:
 *   - `/toekomst/samengestelde-interest` — een werkende calculator met titel én
 *     page-info, maar NUL ingangen sinds de compound-insight-kaart bij M41 naar
 *     /overzicht/bezittingen verhuisde. Niemand merkte dat de laatste link weg
 *     was (opgeruimd bij UR3-26).
 *   - `/tools/fire-sim` — een ⌘K-item naar een route die nooit heeft bestaan;
 *     de enige dode nav-href app-breed (verwijderd bij UR3-26).
 *
 * BEKENDE BEPERKING (bewust). De app heeft VIJF nav-bronnen, waarvan er twee
 * hun hrefs als literals in een component dragen (de desktop-sidebar en het
 * account-dropdownmenu in de TopBar). Toets (3) leest die twee daarom uit de
 * BRONTEKST, niet uit een geëxporteerde structuur. Zolang de sidebar zijn eigen
 * lijst blijft spiegelen, blijft dit een detector en geen structurele oplossing:
 * de sidebar op `navGroups`/`globalNav` laten consumeren is een aparte refactor
 * (benoemd als vervolg op UR3-26).
 */

const ROOT = path.resolve(process.cwd())
const APP_DIR = path.join(ROOT, 'app')
const APP_GROUP_DIR = path.join(APP_DIR, '(app)')

/** Bestandspad-segmenten → route-pad. Route-groups `(...)` verdwijnen uit de URL. */
function toRoute(segments: string[]): string {
  const url = segments.filter((s) => !(s.startsWith('(') && s.endsWith(')')))
  return url.length === 0 ? '/' : `/${url.join('/')}`
}

/** Recursief elke `page.tsx` onder `dir` verzamelen als route-pad. */
function collectRoutes(dir: string, segments: string[], out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    // Next.js-privémappen (`_`-prefix) zijn geen routes; overslaan.
    if (entry.name.startsWith('_')) continue
    if (entry.isDirectory()) {
      collectRoutes(path.join(dir, entry.name), [...segments, entry.name], out)
    } else if (entry.name === 'page.tsx') {
      out.push(toRoute(segments))
    }
  }
}

/** Routes binnen de app-shell — het onderwerp van de titel- en ingang-toetsen. */
const routes: string[] = (() => {
  const out: string[] = []
  if (existsSync(APP_GROUP_DIR)) collectRoutes(APP_GROUP_DIR, [], out)
  return [...new Set(out)].sort()
})()

/** Álle routes van de app, inclusief landing/auth/marketing buiten de shell. */
const allAppRoutes: ReadonlySet<string> = (() => {
  const out: string[] = []
  if (existsSync(APP_DIR)) collectRoutes(APP_DIR, [], out)
  return new Set(out)
})()

// ── Uitzonderingen (a): structureel, geen registratie nodig ───────────────────

/** Een segment als `[id]` / `[...slug]` → dynamische route (runtime-titel via NavStackMeta). */
const isDynamic = (route: string): boolean =>
  route.split('/').some((s) => s.startsWith('[') && s.endsWith(']'))

/**
 * Admin-panel — valt buiten de gebruikers-nav en heeft een eigen, gescand
 * register (`lib/beheer-sections.ts`) met eigen titelvoorziening. Dat register
 * is bewust het voorbeeldgedrag: 40 hrefs, 0 dode entries.
 */
const isBeheer = (route: string): boolean => route === '/beheer' || route.startsWith('/beheer/')

// ── Het bereikbaarheidsregister ──────────────────────────────────────────────

/**
 * Routes buiten de canonieke gebruikers-nav (canoniek = /overzicht/** en
 * /toekomst/**), elk mét een verplichte reden. Drie lijsten, drie soorten
 * "waarom staat dit niet in het menu":
 *
 *  - `REDIRECT_SHADOWED` — de URL is NIET bereikbaar: een config-redirect draait
 *    vóór filesystem-routing. Het bestand blijft alleen bestaan als
 *    backing-module voor een re-export elders.
 *  - `DEEPLINK_ONLY` — bereikbaar en in-app gelinkt, bewust niet in het menu.
 *    De reden noemt de vindplaats van de ingang.
 *  - `EXTERNAL_ENTRY` — de ingang komt van buiten de app (bank-OAuth, een
 *    server-redirect, of een middleware-vertaling).
 *
 * BELANGRIJK: een NIEUWE canonieke route hoort hier NIET bij — die krijgt een
 * titel in nav-config (mainNav/navGroups/EXTRA_ROUTE_TITLES) én een ingang.
 * Elke toevoeging hier is een bewuste, te verantwoorden keuze; de reden is
 * verplicht en wordt op inhoud getoetst (niet leeg, niet een losse kreet).
 */
const REDIRECT_SHADOWED: Readonly<Record<string, string>> = {
  '/core/checkin/historie':
    'Redirect (next.config.ts) naar /mijn/checkins — één canoniek pad voor de check-in-historie sinds UR3-26. Het bestand blijft als backing-module: app/(app)/mijn/checkins/page.tsx re-exporteert deze page build-time.',
  '/horizon/inflatie-koopkracht':
    'Redirect (next.config.ts) naar /toekomst/inflatie-koopkracht. Blijft backing-module voor de re-export onder de canonieke /toekomst-naam.',
}

const DEEPLINK_ONLY: Readonly<Record<string, string>> = {
  '/core/checkin':
    'BEWUST buiten het menu (eigenaarsbesluit 6 sep 2026, UR3-26 keuze K1). De maand-check-in is een terugkerende prompt, geen bestemming: de ingang is de banner op /overzicht (components/overview/checkin-banner.tsx) plus de dashboard-kaart, en ⌘K vindt hem op naam. Een 7-staps-flow in de navigatieboom hangen zou het menu vullen met iets dat de app zelf aanbiedt op het moment dat het telt. Deze entry legt dat vast, zodat de volgende inventarisatie het niet opnieuw als gat rapporteert.',
  '/core/assets':
    'Backing-route van de bezittingen-tak; de canonieke ingang is /overzicht/bezittingen. In-app gelinkt vanuit de categorie- en holdings-schermen.',
  '/core/assets/holdings':
    'Verdieping onder bezittingen — bereikbaar vanaf de beleggingscategorie, niet als eigen menu-item.',
  '/core/assets/holdings/import':
    'Import-flow; ingang is de knop op de holdings-pagina, niet het menu (je start een import vanuit de plek waar de data landt).',
  '/core/assets/revalue':
    'Herwaardeer-flow; ingang is de actieknop op een bezitting en ⌘K. Geen zelfstandige bestemming.',
  '/core/budgets/new':
    'Aanmaakflow; ingang is de "nieuw budget"-knop op /overzicht/budget.',
  '/core/cash/connect':
    'Bankkoppel-flow; ingang is de koppelknop bij de rekeningen en op /mijn/koppelingen.',
  '/core/cash/import':
    'Bestandsimport (MT940/CSV/OFX); ingang is de importknop bij de transacties.',
  '/core/debts':
    'Backing-route van de schulden-tak; de canonieke ingang is /overzicht/schulden.',
  '/mijn/checkins':
    'Canoniek pad voor de check-in-historie. Staat niet in navGroups maar wél in het kaartgrid op /mijn, in de briefing en in ⌘K — één ingang per functie (zie de toelichting bij EXTRA_ROUTE_TITLES).',
}

const EXTERNAL_ENTRY: Readonly<Record<string, string>> = {
  '/dashboard':
    'Universeel "ga naar home". De edge-middleware (lib/supabase/proxy.ts) vertaalt hem naar profiles.home_screen; de page is de statische terugval. Bewust GEEN config-redirect: die zou vóór de middleware draaien en de vertaling onbereikbaar maken.',
  '/core/cash/connect/callback':
    'Defensieve terugval voor bank-OAuth. De echte redirect_uri is /api/bank-connect/callback (app/api/bank-connect/auth-link/route.ts), maar bij TrueLayer kan nog een oudere redirect_uri geregistreerd staan. NIET verwijderen zonder een change-request op de TrueLayer-appconfig: een diff kan niet bewijzen dat die oude waarde weg is.',
  '/core/cash/connect/success':
    'Landing ná een geslaagde bankkoppeling. De ingang is een server-redirect uit GET /api/bank-connect/callback (`${appUrl}/core/cash/connect/success`) — een template-literal, dus voor een bronscan onzichtbaar.',
}

/** Het volledige register: de drie lijsten samen. */
const REACHABILITY_REGISTER: Readonly<Record<string, string>> = {
  ...REDIRECT_SHADOWED,
  ...DEEPLINK_ONLY,
  ...EXTERNAL_ENTRY,
}

const REGISTERED = new Set(Object.keys(REACHABILITY_REGISTER))

// ── Bronnen voor de ingang-/href-toetsen ─────────────────────────────────────

/**
 * De twee nav-bronnen die hun hrefs als literals in een component dragen.
 * Ze worden uit de BRONTEKST gelezen omdat er niets te importeren valt.
 */
const LITERAL_NAV_SOURCES: readonly string[] = [
  'components/app/shell/sidebar.tsx',
  'components/app/shell/top-bar.tsx',
  'components/mijn/mijn-overview.tsx',
]

/** Alle interne hrefs uit een bronbestand (`href: '/x'` én `href="/x"`). */
function hrefsInSource(relPath: string): string[] {
  const full = path.join(ROOT, relPath)
  if (!existsSync(full)) return []
  const src = readFileSync(full, 'utf8')
  const found = new Set<string>()
  for (const m of src.matchAll(/href\s*[:=]\s*['"](\/[^'"{}\s]*)['"]/g)) {
    found.add(m[1]!)
  }
  return [...found]
}

/** Alle hrefs uit de vijf nav-bronnen, met vermelding van hun herkomst. */
function collectNavHrefs(): Array<{ href: string; source: string }> {
  const out: Array<{ href: string; source: string }> = []
  const push = (href: string | undefined, source: string) => {
    if (href) out.push({ href, source })
  }

  for (const item of mainNav) push(item.href, 'nav-config:mainNav')
  for (const group of navGroups) {
    for (const item of group.items) {
      push(item.href, 'nav-config:navGroups')
      for (const child of item.children ?? []) push(child.href, 'nav-config:navGroups.children')
    }
  }
  for (const item of OVERVIEW_APP_SUBROUTES) {
    push(item.href, 'nav-config:OVERVIEW_APP_SUBROUTES')
    push(item.tabHref, 'nav-config:OVERVIEW_APP_SUBROUTES.tabHref')
  }
  for (const item of globalNav) push(item.href, 'nav-config:globalNav')
  for (const href of Object.keys(EXTRA_ROUTE_TITLES)) push(href, 'nav-config:EXTRA_ROUTE_TITLES')
  for (const item of getAllPageItems()) push(item.href, 'command-palette:navigation-index')
  for (const relPath of LITERAL_NAV_SOURCES) {
    for (const href of hrefsInSource(relPath)) push(href, relPath)
  }
  return out
}

/**
 * Matcht een concreet pad tegen een dynamische route-template, segment voor
 * segment: `[type]` slikt precies één segment, `[...slug]` de rest. Bewust
 * strikt — een eerdere versie vergeleek alleen het AANTAL segmenten en
 * verklaarde daarmee élk driedelig pad bestaand, inclusief /tools/fire-sim.
 */
function matchesDynamicRoute(route: string): boolean {
  const parts = route.split('/').filter(Boolean)
  for (const template of allAppRoutes) {
    if (!isDynamic(template)) continue
    const tparts = template.split('/').filter(Boolean)
    let ok = true
    for (let i = 0; i < tparts.length; i++) {
      const t = tparts[i]!
      if (t.startsWith('[...') || t.startsWith('[[...')) {
        // Catch-all: slikt alle resterende segmenten (minstens één).
        return parts.length >= i + 1
      }
      if (i >= parts.length) { ok = false; break }
      if (t.startsWith('[') && t.endsWith(']')) continue
      if (t !== parts[i]) { ok = false; break }
    }
    if (ok && tparts.length === parts.length) return true
  }
  return false
}

/** Strip query/hash zodat een deeplink-href tegen de routetabel te leggen is. */
function bareRoute(href: string): string {
  let p = href.split('?')[0]!.split('#')[0]!
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)
  return p
}

/** Alle `source`-patronen van de config-redirects — die "bestaan" ook als URL. */
const redirectSources: Promise<ReadonlySet<string>> = (async () => {
  const rules = await nextConfig.redirects!()
  return new Set(rules.map((r) => bareRoute(r.source)))
})()

/**
 * Bronbestanden waarin een INGANG kan staan: de schermen zelf plus de nav-
 * registers. Bewust NIET meegeteld: `lib/page-info-content.ts` (een info-tekst
 * is geen ingang), scripts en testbestanden.
 */
const entrySourceFiles: readonly string[] = (() => {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.next') continue
        walk(full)
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        out.push(full)
      }
    }
  }
  walk(APP_DIR)
  walk(path.join(ROOT, 'components'))
  out.push(path.join(ROOT, 'lib', 'nav-config.ts'))
  out.push(path.join(ROOT, 'lib', 'command-palette', 'navigation-index.ts'))
  out.push(path.join(ROOT, 'lib', 'beheer-sections.ts'))
  return out
})()

const sourceCache = new Map<string, string>()
function readCached(file: string): string {
  let src = sourceCache.get(file)
  if (src === undefined) {
    src = readFileSync(file, 'utf8')
    sourceCache.set(file, src)
  }
  return src
}

/**
 * Heeft deze route minstens één ingang? Een ingang is een verwijzing naar het
 * route-pad als string-literal in een scherm of nav-register, buiten de eigen
 * routemap. Bewust een ONDER-benadering: dynamisch samengestelde paden
 * (template-literals) ziet deze scan niet — die horen daarom in EXTERNAL_ENTRY.
 */
function hasEntry(route: string): boolean {
  const ownDir = path.join(APP_GROUP_DIR, ...route.split('/').filter(Boolean))
  const patterns = [`'${route}'`, `"${route}"`, `\`${route}\``, `'${route}?`, `"${route}?`]
  return entrySourceFiles.some(
    (file) => !file.startsWith(ownDir + path.sep) && patterns.some((p) => readCached(file).includes(p)),
  )
}

// ── Toetsen ──────────────────────────────────────────────────────────────────

describe('nav-config — route-titel-dekking (SSoT)', () => {
  it('vindt de app-routes op schijf (sanity)', () => {
    // Vangt een gebroken glob/walker: als dit 0 is, zegt de hele suite niets.
    expect(routes.length).toBeGreaterThan(50)
  })

  it('elke canonieke app-route heeft een titel-keuze', () => {
    const uncovered = routes.filter((route) => {
      if (isDynamic(route)) return false
      if (isBeheer(route)) return false
      if (REGISTERED.has(route)) return false
      return resolveRouteTitle(route) === null
    })
    expect(
      uncovered,
      `routes zonder titel-bron — voeg een titel toe aan nav-config (EXTRA_ROUTE_TITLES) ` +
        `of, als de route bewust buiten de nav valt, aan het bereikbaarheidsregister: ${uncovered.join(', ')}`,
    ).toEqual([])
  })

  it('het register bevat geen dode entries', () => {
    const stale = [...REGISTERED].filter((r) => !routes.includes(r))
    expect(stale, `register verwijst naar niet-bestaande routes: ${stale.join(', ')}`).toEqual([])
  })

  it('het register en de nav-config-SSoT overlappen niet', () => {
    // Krijgt een geregistreerde route alsnog een nav-config-titel, dan hoort hij
    // uit het register verwijderd — anders verbergt het register een route die
    // inmiddels in de SSoT staat.
    const overlap = [...REGISTERED].filter((r) => resolveRouteTitle(r) !== null)
    expect(overlap, `register-routes die al via nav-config resolven: ${overlap.join(', ')}`).toEqual([])
  })
})

describe('nav-config — bereikbaarheid (UR3-26)', () => {
  it('elke register-entry draagt een inhoudelijke reden', () => {
    // Een lege of eenwoordige reden is geen verantwoording. De drempel is
    // bewust laag maar niet nul: hij dwingt af dat je de vindplaats van de
    // ingang (of het redirect-doel) opschrijft, niet alleen "legacy".
    const thin = Object.entries(REACHABILITY_REGISTER)
      .filter(([, reason]) => reason.trim().length < 40)
      .map(([route]) => route)
    expect(
      thin,
      `register-entries zonder bruikbare reden (noem de ingang of het redirect-doel): ${thin.join(', ')}`,
    ).toEqual([])
  })

  it('elke nav-href wijst naar een bestaande route', async () => {
    const sources = await redirectSources
    const dead = collectNavHrefs()
      .filter(({ href }) => {
        const route = bareRoute(href)
        if (route === '/') return false
        if (allAppRoutes.has(route)) return false
        // Een config-redirect telt als bestaande URL: hij draait vóór
        // filesystem-routing, dus de gebruiker landt ergens.
        if (sources.has(route)) return false
        // Categorie-deeplinks (/overzicht/bezittingen/investment) landen op een
        // dynamische route-template (/overzicht/bezittingen/[type]).
        if (matchesDynamicRoute(route)) return false
        return true
      })
      .map(({ href, source }) => `${href} (${source})`)
    expect(
      dead,
      `nav-hrefs zonder bestaande route — ⌘K/menu levert hier een 404: ${dead.join(', ')}`,
    ).toEqual([])
  })

  it('elke route heeft een ingang, of staat met reden in het register', () => {
    const orphans = routes.filter((route) => {
      if (isDynamic(route)) return false
      if (isBeheer(route)) return false
      if (REGISTERED.has(route)) return false
      return !hasEntry(route)
    })
    expect(
      orphans,
      `routes zonder enkele ingang (geen menu, geen ⌘K, geen in-app link) — geef ze een ingang ` +
        `of leg met een reden vast waarom ze er geen hebben: ${orphans.join(', ')}`,
    ).toEqual([])
  })
})
