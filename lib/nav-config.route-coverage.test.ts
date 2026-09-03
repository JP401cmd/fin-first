import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveRouteTitle } from './nav-config'

/**
 * SSoT-guard voor de mobiele TopBar-titel (K-05 / W2.4 NAV-SSOT).
 *
 * `resolveRouteTitle()` (lib/nav-config.ts) is de single source of truth voor
 * de paginatitel die de mobiele TopBar toont wanneer een pagina zelf geen
 * titel meegeeft. Als een canonieke route buiten álle nav-bronnen valt, "werkt"
 * hij nu alleen doordat de pagina toevallig een `<NavStackMeta title>` zet —
 * dat is precies de SSoT-breuk die K-05 beschrijft.
 *
 * Deze test scant élke `app/(app)/**​/page.tsx` van schijf, vertaalt het
 * bestandspad naar het route-pad (Next.js stript route-groups tussen haakjes
 * uit de URL) en eist per route een expliciete titel-keuze: óf een titel via
 * `resolveRouteTitle()` (de nav-config-SSoT), óf plaatsing op een van de
 * gedocumenteerde uitzonderingen hieronder. Zo faalt de test zodra iemand een
 * nieuwe canonieke route toevoegt zonder titel-keuze.
 */

const APP_DIR = path.resolve(process.cwd(), 'app', '(app)')

/** Bestandspad-segmenten → route-pad. Route-groups `(...)` verdwijnen uit de URL. */
function toRoute(segments: string[]): string {
  const url = segments.filter((s) => !(s.startsWith('(') && s.endsWith(')')))
  return url.length === 0 ? '/' : `/${url.join('/')}`
}

/** Recursief elke `page.tsx` onder app/(app)/ verzamelen als route-pad. */
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

const routes: string[] = (() => {
  const out: string[] = []
  if (existsSync(APP_DIR)) collectRoutes(APP_DIR, [], out)
  return [...new Set(out)].sort()
})()

// ── Uitzonderingen (b): routes die bewust géén nav-config-titel hebben ────────

/** Een segment als `[id]` / `[...slug]` → dynamische route (runtime-titel via NavStackMeta). */
const isDynamic = (route: string): boolean =>
  route.split('/').some((s) => s.startsWith('[') && s.endsWith(']'))

/** Admin-panel — valt buiten de gebruikers-nav en heeft eigen titelvoorziening. */
const isBeheer = (route: string): boolean => route === '/beheer' || route.startsWith('/beheer/')

/**
 * Legacy backing-routes buiten de canonieke gebruikers-nav (canoniek =
 * /overzicht/** en /toekomst/**). Deze routes redirecten óf zetten hun eigen
 * `<NavStackMeta>` client-side en staan bewust NIET in de nav-config-SSoT.
 *
 * BELANGRIJK: een NIEUWE canonieke route hoort hier NIET bij — die krijgt een
 * titel in nav-config (mainNav/navGroups/EXTRA_ROUTE_TITLES). Deze lijst is
 * alleen voor bestaande legacy/redirect-routes; elke toevoeging is een bewuste,
 * te verantwoorden keuze.
 */
const LEGACY_BACKING_ROUTES: readonly string[] = [
  // /dashboard → redirect('/overzicht')
  '/dashboard',
  // Legacy /core/** — canonieke equivalenten leven onder /overzicht/**
  '/core',
  '/core/assets',
  '/core/assets/holdings',
  '/core/assets/holdings/import',
  '/core/assets/revalue',
  '/core/belasting',
  '/core/budgets',
  '/core/budgets/new',
  // NB: '/core/cash', '/horizon/whatif', '/horizon/strategie' en
  // '/horizon/uitgaven-na-pensioen' staan hier bewust NIET (meer). Ze hebben
  // geen page.tsx meer maar redirecten op de routing-laag (next.config.ts) —
  // ze bestaan dus niet als route op schijf en zouden hier als dode entry
  // gelden. Zie next.config.test.ts voor het waarom (React #310).
  '/core/cash/connect',
  '/core/cash/connect/callback',
  '/core/cash/connect/success',
  '/core/cash/import',
  '/core/checkin',
  '/core/checkin/historie',
  // `/mijn/checkins` is een letterlijke re-export van
  // `/core/checkin/historie` hierboven, en dat component registreert zelf
  // `<NavStackMeta title="Check-in historie" />`. Hij hoort dus in deze lijst
  // om dezelfde reden als zijn bron: de titel komt client-side van de pagina,
  // niet uit de nav-config-kaart. Een entry in EXTRA_ROUTE_TITLES zou dode
  // configuratie zijn — een expliciete paginatitel wint van de fallback, dus
  // die tekst zou nooit gelezen worden (WF-NAV-05).
  '/mijn/checkins',
  '/core/debts',
  // Legacy /horizon/** — canonieke equivalenten leven onder /toekomst/**
  '/horizon',
  '/horizon/samengestelde-interest',
  '/horizon/inflatie-koopkracht',
]

describe('nav-config — route-titel-dekking (SSoT)', () => {
  it('vindt de app-routes op schijf (sanity)', () => {
    // Vangt een gebroken glob/walker: als dit 0 is, zegt de hele suite niets.
    expect(routes.length).toBeGreaterThan(50)
  })

  it('elke canonieke app-route heeft een titel-keuze', () => {
    const uncovered = routes.filter((route) => {
      if (isDynamic(route)) return false
      if (isBeheer(route)) return false
      if (LEGACY_BACKING_ROUTES.includes(route)) return false
      return resolveRouteTitle(route) === null
    })
    expect(
      uncovered,
      `routes zonder titel-bron — voeg een titel toe aan nav-config (EXTRA_ROUTE_TITLES) ` +
        `of, als het bewust een legacy/redirect-route is, aan LEGACY_BACKING_ROUTES: ${uncovered.join(', ')}`,
    ).toEqual([])
  })

  it('de legacy-allowlist bevat geen dode entries', () => {
    const stale = LEGACY_BACKING_ROUTES.filter((r) => !routes.includes(r))
    expect(stale, `allowlist verwijst naar niet-bestaande routes: ${stale.join(', ')}`).toEqual([])
  })

  it('de legacy-allowlist en de nav-config-SSoT overlappen niet', () => {
    // Krijgt een legacy backing-route alsnog een nav-config-titel, dan hoort hij
    // uit deze allowlist verwijderd — anders verbergt de allowlist een route die
    // inmiddels in de SSoT staat.
    const overlap = LEGACY_BACKING_ROUTES.filter((r) => resolveRouteTitle(r) !== null)
    expect(overlap, `allowlist-routes die al via nav-config resolven: ${overlap.join(', ')}`).toEqual([])
  })
})
