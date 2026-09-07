import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildBankSignalNotification } from '@/lib/notifications/bank-signalen'
import { WOZ_REMINDER_TEMPLATE } from '@/lib/notifications/woz-reminder'
import { PENSION_REMINDER_TEMPLATE } from '@/lib/notifications/pension-reminder'

/**
 * Grendel op waar een melding je heen stuurt (UR3-27, D2).
 *
 * De bevinding: negen van de URL-families die `/api/notifications` uitgaf,
 * liepen via een legacy 307 (`/core/cash` → `/overzicht/bezittingen/cash`,
 * `/horizon` → `/toekomst`, `/identity/koppelingen` → `/mijn/koppelingen`,
 * `/core/budgets` → `/overzicht/budget`). Niets was kapot — geen enkele 404 —
 * en juist daarom kon het wegdrijven: de meldingen bléven werken terwijl de
 * bestemmingen onder ze vandaan verhuisden, tot `/overzicht/budget` de
 * opgeheven cashflow-hub had overgenomen en de melding je op een hub zette.
 *
 * Vier families waren daarnaast hub-niveau by construction: ze gaven een
 * hubroute uit terwijl de entiteit-id op het moment van genereren wél in de hand
 * was.
 *
 * Deze twee toetsen zijn de vangrail:
 *  1. geen enkel pad dat de meldingen uitgeven mag een pad zijn dat
 *     `next.config.ts` omleidt;
 *  2. de vier gerepareerde families dragen aantoonbaar hun id (of, bij de
 *     partnertransactie, hun maand) in de URL.
 */

const REPO_ROOT = process.cwd()

/** Elk bestand dat een `actionUrl` voor een melding produceert. */
const PRODUCER_FILES = [
  'app/api/notifications/route.ts',
  'lib/notifications/bank-signalen.ts',
  'lib/notifications/woz-reminder.ts',
  'lib/notifications/pension-reminder.ts',
  'lib/notifications/spend-limit.ts',
]

/**
 * De `source`-paden uit de `redirects()` in `next.config.ts` — de paden die een
 * 307 opleveren. Handmatig gespiegeld en niet geïmporteerd, omdat `next.config`
 * laden in een vitest-omgeving de hele Next-config meesleept; de lijst is kort
 * en verandert zelden. Groeit hij, dan groeit deze mee.
 *
 * LET OP: exacte paden, geen prefixen. `/core/budgets` wordt omgeleid,
 * `/core/budgets/[id]` bewust NIET — sub-routes blijven op hun oude pad bestaan
 * (zie de toelichting bij `redirects()`). Een prefixregel zou de detailroutes
 * ten onrechte verbieden en daarmee precies de fix wegduwen.
 */
const REDIRECTED_PATHS = new Set([
  '/core',
  '/core/budgets',
  '/core/cash',
  '/core/belasting',
  '/core/checkin/historie',
  '/horizon',
  '/horizon/inflatie-koopkracht',
  '/horizon/samengestelde-interest',
  '/horizon/whatif',
  '/horizon/strategie',
  '/horizon/uitgaven-na-pensioen',
  '/identity',
  '/identity/profiel',
  '/identity/koppelingen',
  '/identity/parameters',
  '/identity/instellingen',
  '/identity/voortgang',
  '/identity/widgets',
  '/will',
  '/overzicht/acties',
  '/overzicht/cashflow',
  '/overzicht/cashflow/budget',
  '/overzicht/cashflow/transacties',
  '/overzicht/cashflow/vaste-lasten',
  '/overzicht/cashflow/forecast',
  '/toekomst/samengestelde-interest',
  '/toekomst/whatif',
  '/toekomst/strategie',
  '/toekomst/uitgaven-na-pensioen',
])

/**
 * Commentaar eruit vóór we matchen. Zonder dit slaat de grendel aan op zijn
 * eigen toelichting: de wijzigingen van UR3-27 leggen in commentaar uit dat
 * `/core/cash` een 307 is, en die zin zou de toets dan rood maken (of, erger,
 * groen houden op een verkeerde grond).
 *
 * De regel-commentaar-stap slaat `//` over dat door een `:` wordt voorafgegaan,
 * zodat `https://…` binnen een string heel blijft.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Elke app-pad-literal (gewone string of template) in de bron. */
function appPathLiterals(source: string): string[] {
  const clean = stripComments(source)
  const found = new Set<string>()
  for (const match of clean.matchAll(/['"`](\/[^'"`\s]*)['"`]/g)) {
    found.add(match[1])
  }
  return [...found]
}

/** Het padgedeelte van een URL-literal: alles vóór `?` of `#`. */
function pathOf(url: string): string {
  return url.split(/[?#]/)[0]
}

describe('meldingen — actionUrl wijst naar een levende route', () => {
  it.each(PRODUCER_FILES)('%s geeft geen omgeleid pad uit', (file) => {
    const source = readFileSync(join(REPO_ROOT, file), 'utf8')
    const offenders = appPathLiterals(source)
      .map(pathOf)
      .filter((path) => REDIRECTED_PATHS.has(path))

    // Een 307 is geen kapotte link, en dat is precies het risico: hij verbergt
    // dat de bestemming verhuisd is tot de nieuwe bewoner iets anders blijkt.
    expect(offenders).toEqual([])
  })
})

describe('meldingen — de vier hub-families landen op het detail', () => {
  const routeSource = stripComments(
    readFileSync(join(REPO_ROOT, 'app/api/notifications/route.ts'), 'utf8'),
  )

  it('budget-alert opent het budgetdetail, niet de budgetten-hub', () => {
    expect(routeSource).toContain('`/core/budgets/${budget.id}`')
    // De oude vorm hing de id aan een querystring die op de hub niet gelezen werd.
    expect(routeSource).not.toContain('/core/budgets?budget=')
  })

  it('mijlpaal-melding opent de mijlpalenpagina, niet het dashboard', () => {
    expect(routeSource).toContain("actionUrl: '/mijn/mijlpalen'")
    expect(routeSource).toContain("entityType: 'milestone'")
  })

  it('partnertransactie opent de transactielijst op de maand van de transactie', () => {
    expect(routeSource).toContain('/overzicht/budget/transacties?maand=${String(tx.date).slice(0, 7)}')
    expect(routeSource).toContain("entityType: 'transaction'")
    // De id gaat mee, ook al kan de route hem nog niet openen: dat is wat de
    // vervolgstap (`?tx=`) straks alleen nog aan de URL hoeft toe te voegen.
    expect(routeSource).toContain('entityId: tx.id')
  })

  it('crypto-alert gaat naar de crypto-detailroute, niet naar het beleggingsdetail', () => {
    expect(routeSource).toContain('`/core/assets/crypto/${alert.crypto_holding_id}`')
    expect(routeSource).toContain('`/core/assets/holdings/${alert.investment_holding_id}`')
  })
})

describe('meldingen — de pure producenten', () => {
  const baseInput = {
    connectionAccountId: 'acct-1',
    label: 'NL01 BANK 0123',
    providerName: 'Testbank',
    linkIsActive: true,
    connectionStatus: 'linked' as string | null,
    tokenExpiresAt: null as string | null,
    lastSyncedAt: null as string | null,
  }
  const now = new Date('2026-09-07T12:00:00Z')

  it('een verlopende bankkoppeling stuurt naar de koppelingenpagina, mét id', () => {
    const signal = buildBankSignalNotification(
      { ...baseInput, tokenExpiresAt: '2026-09-10T12:00:00Z' },
      now,
    )
    expect(signal).not.toBeNull()
    expect(signal!.actionUrl).toBe('/mijn/koppelingen')
    expect(signal!.entityType).toBe('bank_connection_account')
    expect(signal!.entityId).toBe('acct-1')
  })

  it('een verouderde sync stuurt naar dezelfde plek, mét id', () => {
    const signal = buildBankSignalNotification(
      { ...baseInput, lastSyncedAt: '2026-08-01T12:00:00Z' },
      now,
    )
    expect(signal).not.toBeNull()
    expect(signal!.actionUrl).toBe('/mijn/koppelingen')
    expect(signal!.entityId).toBe('acct-1')
  })

  it('de jaarlijkse reminders wijzen naar het nieuwe koppelingenpad', () => {
    expect(WOZ_REMINDER_TEMPLATE.actionUrl).toBe('/mijn/koppelingen')
    expect(PENSION_REMINDER_TEMPLATE.actionUrl).toBe('/mijn/koppelingen')
  })
})
