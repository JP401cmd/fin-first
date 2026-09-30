import { describe, it, expect } from 'vitest'
import { ALL_MODULES, type ModuleId } from '@/lib/module-registry'
import { resolveActiveModules } from '@/lib/modules/resolve'
import {
  KRANT_HOME_HREF,
  KRANT_MIJN_HREF,
  KRANT_ROUTES,
  isKrantAccount,
  isKrantProfile,
  isKrantRoute,
  isRouteAllowed,
  krantRedirect,
  receivesBriefing,
  receivesSnapshots,
  shouldMountFin,
} from './krant-grens'
import { join } from 'node:path'
import { readSourceLF } from '@/lib/test-utils/read-source'

const KRANT: ModuleId[] = ['nieuws']

/**
 * Bestaande profielen (productie 21 sep 2026: alleen `null` en alle zes) plus
 * de randgevallen die `resolveActiveModules` naar "alle modules" terugvouwt.
 * Voor elk hiervan moet ELKE beslissing het oude gedrag geven.
 */
const BESTAANDE_PROFIELEN: Array<[string, unknown]> = [
  ['null', null],
  ['kolom afwezig', undefined],
  ['alle zes', [...ALL_MODULES]],
  ['alle zes, andere volgorde', [...ALL_MODULES].reverse()],
  ['lege array (fail-open)', []],
  ['onbekende waarden', ['onzin']],
  ['nieuws + budgetteren', ['nieuws', 'budgetteren']],
  ['alleen budgetteren', ['budgetteren']],
]

describe('isKrantRoute — exacte prefixgrenzen', () => {
  it.each([...KRANT_ROUTES])('%s en alles eronder ligt binnen de grens', (route) => {
    expect(isKrantRoute(route)).toBe(true)
    expect(isKrantRoute(`${route}/`)).toBe(true)
    expect(isKrantRoute(`${route}/iets/dieper`)).toBe(true)
    expect(isKrantRoute(`${route}?tab=x`)).toBe(true)
    expect(isKrantRoute(`${route}#anker`)).toBe(true)
  })

  it.each([
    '/nieuwsX',
    '/nieuwsbrief',
    '/nieuws-archief',
    '/mijn',
    '/mijn/',
    '/mijn/profiel',
    '/mijn/accounts',
    '/mijn/notificatiesX',
    '/mijn/privacy',
    '/mijn/koppelingen',
    '/krant',
    '/krant/meerX',
    '/overzicht',
    '/toekomst',
    '/berichten',
    '/rapportages',
    '/beheer',
    '/',
    '',
  ])('%s ligt buiten de grens (geen prefix-lek)', (path) => {
    expect(isKrantRoute(path)).toBe(false)
  })

  it('de allowlist is precies de vijf routes uit de kaart (met /mijn/notificaties voor /mijn/meldingen)', () => {
    expect([...KRANT_ROUTES].sort()).toEqual(
      ['/krant/meer', '/mijn/account', '/mijn/notificaties', '/mijn/nieuwsprofiel', '/nieuws'].sort(),
    )
  })

  it('Home en Mijn van een Krant-account liggen zelf binnen de grens (anders een lus)', () => {
    expect(isKrantRoute(KRANT_HOME_HREF)).toBe(true)
    expect(isKrantRoute(KRANT_MIJN_HREF)).toBe(true)
  })
})

describe('krantRedirect — de beslisfunctie van layout en client-wacht', () => {
  it('Krant-account buiten de grens → /nieuws', () => {
    for (const path of ['/overzicht', '/toekomst/doelen', '/mijn', '/mijn/profiel', '/berichten', '/rapportages', '/nieuwsX']) {
      expect(krantRedirect(path, KRANT, false), path).toBe(KRANT_HOME_HREF)
    }
  })

  it('Krant-account binnen de grens → geen redirect, óók niet op /nieuws zelf (geen lus)', () => {
    for (const path of ['/nieuws', '/nieuws/', '/nieuws?x=1', '/mijn/account', '/mijn/notificaties', '/mijn/nieuwsprofiel', '/krant/meer']) {
      expect(krantRedirect(path, KRANT, false), path).toBeNull()
    }
  })

  it('onbekend pad (header ontbrak) → fail-closed naar /nieuws', () => {
    expect(krantRedirect(null, KRANT, false)).toBe(KRANT_HOME_HREF)
    expect(krantRedirect(undefined, KRANT, false)).toBe(KRANT_HOME_HREF)
    expect(krantRedirect('', KRANT, false)).toBe(KRANT_HOME_HREF)
  })

  it('superadmin met een Krant-account houdt /beheer, maar niets anders buiten de grens', () => {
    expect(krantRedirect('/beheer', KRANT, true)).toBeNull()
    expect(krantRedirect('/beheer/nieuws', KRANT, true)).toBeNull()
    expect(krantRedirect('/beheerX', KRANT, true)).toBe(KRANT_HOME_HREF)
    expect(krantRedirect('/overzicht', KRANT, true)).toBe(KRANT_HOME_HREF)
    // Zonder superadmin geen uitzondering.
    expect(krantRedirect('/beheer', KRANT, false)).toBe(KRANT_HOME_HREF)
  })

  it.each(BESTAANDE_PROFIELEN)('bestaand profiel (%s): nooit een redirect, op geen enkel pad', (_label, raw) => {
    const modules = resolveActiveModules({ active_modules: raw })
    for (const path of ['/overzicht', '/toekomst', '/mijn', '/mijn/profiel', '/beheer', '/nieuws', '/rapportages']) {
      expect(krantRedirect(path, modules, false), path).toBeNull()
      expect(krantRedirect(path, modules, true), path).toBeNull()
      expect(isRouteAllowed(path, modules, false), path).toBe(true)
    }
    // Óók niet bij een ontbrekende header: fail-closed geldt alleen voor de Krant.
    expect(krantRedirect(null, modules, false)).toBeNull()
  })
})

describe('Fin-mount, briefing en profielherkenning', () => {
  it('Krant-account: geen Fin, geen briefing', () => {
    expect(isKrantAccount(KRANT)).toBe(true)
    expect(shouldMountFin(KRANT)).toBe(false)
    expect(isKrantProfile({ active_modules: ['nieuws'] })).toBe(true)
    expect(receivesBriefing({ active_modules: ['nieuws'] })).toBe(false)
    // Dubbelen in de DB veranderen niets aan "alleen nieuws".
    expect(receivesBriefing({ active_modules: ['nieuws', 'nieuws'] })).toBe(false)
  })

  it.each(BESTAANDE_PROFIELEN)('bestaand profiel (%s): Fin gemount, briefing aan', (_label, raw) => {
    const row = { active_modules: raw }
    expect(isKrantProfile(row)).toBe(false)
    expect(shouldMountFin(resolveActiveModules(row))).toBe(true)
    expect(receivesBriefing(row)).toBe(true)
  })

  it('geen profielrij → geen Krant-account (fail-open naar het oude gedrag)', () => {
    expect(isKrantProfile(null)).toBe(false)
    expect(receivesBriefing(undefined)).toBe(true)
  })

  // Krant 2C: een Krant-account rondt zijn onboarding af en viel daardoor in de
  // snapshots-cron (`onboarding_completed = true`). Net als de briefing: niet.
  it('snapshots: niet voor een Krant-account, wel voor elk bestaand profiel', () => {
    expect(receivesSnapshots({ active_modules: ['nieuws'] })).toBe(false)
    for (const [, raw] of BESTAANDE_PROFIELEN) expect(receivesSnapshots({ active_modules: raw })).toBe(true)
    expect(receivesSnapshots(null)).toBe(true)
  })

  it('snapshots-cron: leest active_modules mee en filtert met receivesSnapshots', () => {
    const src = readSourceLF(join(process.cwd(), 'app', 'api', 'snapshots', 'cron', 'route.ts'))
    expect(src).toMatch(/budgeting_active, active_modules, \$\{FIRE_PLAN_COLUMNS\}/)
    expect(src).toMatch(/\.filter\(\(p\) => receivesSnapshots\(p\)\)/)
  })
})
