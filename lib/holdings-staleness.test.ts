/**
 * Tests voor de gedeelde verouderd-definitie.
 *
 * ── HET DEFECT DAT HIER WORDT VASTGEPIND ────────────────────────────────────
 * Twee schermen spraken elkaar tegen. Op hetzelfde account, op hetzelfde
 * moment, meldde de zijbalk "Koersen actueel" (0) terwijl de banner op de
 * holdings-pagina "Prijzen verouderd" (1) toonde. Beide klopten volgens hun
 * eigen definitie — 24 uur tegenover 7 dagen, nooit-bijgewerkt wél of niet
 * meegeteld, gesloten posities wél of niet uitgesloten.
 *
 * En de grens zelf deugde niet: met een vaste 24-uursgrens is élke positie
 * maandagochtend "verouderd", want de beurzen waren het weekend dicht. Een
 * melding die elke maandag afgaat, leert de gebruiker haar te negeren.
 *
 * Deze suite legt beide vast: één regel, en die regel telt handelsdagen.
 */

import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { readSourceLF } from '@/lib/test-utils/read-source'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  stalenessCutoff,
  isPriceStale,
  isClosedPosition,
  countStalePrices,
  STALE_AFTER_TRADING_DAYS,
  type StalenessRow,
} from './holdings-staleness'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Lokale tijd, zodat de weekend-detectie (getDay) test wat de gebruiker ziet.
 *
 * Óók de bron voor de `last_price_update`-fixtures hieronder: een kale
 * `new Date(jaar, maand, …).toISOString()` is verboden (lint-vangrail voor de
 * NL-maandgrens). Hier is de lokale wandkloktijd juist de bedoeling — een
 * slotkoers valt op 17:35 Amsterdam — dus loopt de conversie via deze helper.
 */
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min)

function row(over: Partial<StalenessRow> = {}): StalenessRow {
  return { units: 10, ticker: 'MRVL', last_price_update: null, ...over }
}

describe('stalenessCutoff — telt handelsdagen, geen klokuren', () => {
  it('slaat het weekend over: maandag kijkt terug tot vrijdag', () => {
    // Maandag 10 augustus 2026, 09:00. Eén handelsdag terug = vrijdag de 7e.
    const maandag = at(2026, 8, 10, 9)
    const cutoff = stalenessCutoff(maandag, 1)
    expect(cutoff.getDay()).toBe(5) // vrijdag
    expect(cutoff.getDate()).toBe(7)
  })

  it('doet op een doordeweekse dag gewoon één dag terug', () => {
    const woensdag = at(2026, 8, 12, 9)
    const cutoff = stalenessCutoff(woensdag, 1)
    expect(cutoff.getDate()).toBe(11) // dinsdag
  })

  it('werkt ook vanaf een weekenddag zelf', () => {
    // Zondag 9 aug → één handelsdag terug is vrijdag de 7e.
    const cutoff = stalenessCutoff(at(2026, 8, 9, 9), 1)
    expect(cutoff.getDay()).toBe(5)
    expect(cutoff.getDate()).toBe(7)
  })

  it('is eindig bij een onzinnige invoer', () => {
    expect(() => stalenessCutoff(at(2026, 8, 10), 100_000)).not.toThrow()
  })
})

describe('isPriceStale', () => {
  const maandagOchtend = at(2026, 8, 10, 9)

  it('DE MAANDAGTEST: een vrijdagkoers is maandagochtend NIET verouderd', () => {
    // Dit was de structurele vals-positief. Vrijdag 7 aug 17:35 (slotkoers
    // Amsterdam) — maandagochtend is er nog geen handelsdag afgesloten.
    const vrijdagSlot = at(2026, 8, 7, 17, 35).toISOString()
    expect(isPriceStale(row({ last_price_update: vrijdagSlot }), maandagOchtend)).toBe(false)
  })

  it('maar dinsdag is diezelfde vrijdagkoers wél verouderd', () => {
    const vrijdagSlot = at(2026, 8, 7, 17, 35).toISOString()
    expect(isPriceStale(row({ last_price_update: vrijdagSlot }), at(2026, 8, 11, 9))).toBe(true)
  })

  it('een gesloten positie is nooit verouderd', () => {
    // Niet omdat haar prijs vers is, maar omdat refresh-prices haar overslaat:
    // meetellen levert een aantal op dat door vernieuwen niet kán dalen.
    const oud = at(2020, 1, 1, 0).toISOString()
    expect(isPriceStale(row({ units: 0, last_price_update: oud }), maandagOchtend)).toBe(false)
    expect(
      isPriceStale(row({ units: 10, pnl_is_closed: true, last_price_update: oud }), maandagOchtend),
    ).toBe(false)
  })

  it('de engine-vlag wint van de units-kolom', () => {
    const oud = at(2020, 1, 1, 0).toISOString()
    // Units 0 maar de engine zegt open → telt wél mee.
    expect(
      isPriceStale(row({ units: 0, pnl_is_closed: false, last_price_update: oud }), maandagOchtend),
    ).toBe(true)
  })

  it('zonder ticker én zonder ISIN is er geen koersbron, dus geen veroudering', () => {
    const oud = at(2020, 1, 1, 0).toISOString()
    expect(
      isPriceStale({ units: 10, ticker: null, isin: null, last_price_update: oud }, maandagOchtend),
    ).toBe(false)
    // Alleen een ISIN volstaat wél als bron.
    expect(
      isPriceStale({ units: 10, ticker: null, isin: 'NL0011794037', last_price_update: oud }, maandagOchtend),
    ).toBe(true)
  })

  it('nooit bijgewerkt telt als verouderd', () => {
    // Dit is precies wat de zijbalk NIET zag: `.lt(kolom, grens)` op NULL levert
    // NULL, dus zulke rijen matchten daar nooit.
    expect(isPriceStale(row({ last_price_update: null }), maandagOchtend)).toBe(true)
  })

  it('een onleesbare datum telt als verouderd, niet als vers', () => {
    expect(isPriceStale(row({ last_price_update: 'geen-datum' }), maandagOchtend)).toBe(true)
  })
})

describe('isClosedPosition', () => {
  it('prefereert de engine-vlag en valt terug op units met EPSILON', () => {
    expect(isClosedPosition({ units: 10, pnl_is_closed: true })).toBe(true)
    expect(isClosedPosition({ units: 0, pnl_is_closed: false })).toBe(false)
    expect(isClosedPosition({ units: 0 })).toBe(true)
    expect(isClosedPosition({ units: 1e-12 })).toBe(true)
    expect(isClosedPosition({ units: 5 })).toBe(false)
  })

  it('leest NUMERIC-kolommen die PostgREST als string levert', () => {
    expect(isClosedPosition({ units: '0' })).toBe(true)
    expect(isClosedPosition({ units: '10' })).toBe(false)
  })
})

describe('countStalePrices — het gemelde scenario', () => {
  it('telt 1 waar de oude regel er 96 meldde', () => {
    // 95 verkochte posities met een stokoude prijs, 1 open positie die
    // daadwerkelijk verouderd is, 13 open posities die actueel zijn.
    const oud = at(2026, 1, 1, 0).toISOString()
    // Maandag 18:00 — het moment waarop de dagelijkse cron draait (vercel.json).
    // Op dinsdagochtend ligt dat ná de grens (maandag 09:00) en is de koers vers.
    const vers = at(2026, 8, 10, 18).toISOString()
    const nu = at(2026, 8, 11, 9) // dinsdag

    const holdings: StalenessRow[] = [
      ...Array.from({ length: 95 }, () => row({ units: 0, last_price_update: oud })),
      row({ units: 25, last_price_update: oud }),
      ...Array.from({ length: 13 }, () => row({ units: 5, last_price_update: vers })),
    ]
    expect(countStalePrices(holdings, nu)).toBe(1)
  })

  it('is 0 op een lege set', () => {
    expect(countStalePrices([], at(2026, 8, 11))).toBe(0)
  })
})

/**
 * BRONANKER — repo-breed, op de VORM van een eigen grens.
 *
 * De eerste versie van deze grendel somde drie bestandspaden op en was groen,
 * terwijl een VIERDE oppervlak op diezelfde holdings-pagina — de heatmap achter
 * de weergave-toggle — zijn eigen 24-uursregel hield. Die stond in geen enkele
 * grep op `isPriceStale`/`countStalePrices`, want juist een bestand dat de
 * gedeelde module níét importeert is onzichtbaar in een import-zoektocht.
 *
 * Daarom zoekt deze test niet naar de nieuwe functienaam maar naar het patroon
 * van de óude regel: een handmatige uren-/dagenberekening rond
 * `last_price_update`. Wie een nieuw oppervlak bouwt en zijn eigen drempel
 * schrijft, valt hier om — ook als hij dit bestand nooit gezien heeft.
 */
describe('bronanker — één definitie, repo-breed', () => {
  /** Bestanden die een eigen grens MOGEN dragen, met reden. */
  const ALLOWLIST = new Set<string>([
    // De gedeelde module zelf: hier hóórt de berekening te staan.
    'lib/holdings-staleness.ts',
  ])

  function sourceFiles(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(join(REPO_ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`
      if (entry.isDirectory()) {
        if (['node_modules', '.next', '.claude', 'dist'].includes(entry.name)) continue
        sourceFiles(rel, acc)
      } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        acc.push(rel)
      }
    }
    return acc
  }

  /**
   * De grensberekening moet IN DE BUURT van `last_price_update` staan.
   *
   * Een bestandsbrede check is te grof: `assets-client.tsx` rekent leningeind-
   * datums uit en `dashboard-data-loader.ts` een 30-dagenvenster voor acties —
   * allebei met `24 * 60 * 60 * 1000`, allebei in een bestand dat elders
   * toevallig `last_price_update` noemt. Die als overtreding melden zou de
   * grendel binnen een week uitgezet krijgen. Vandaar een venster van 400 tekens
   * rond elke vindplaats van de kolom.
   */
  const VENSTER = 400
  const GRENS_VORMEN = [
    /24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/,
    /1000\s*\*\s*60\s*\*\s*60/,
    /hoursSince/i,
    /\.lt\(\s*['"]last_price_update['"]/,
  ]

  it('geen enkel oppervlak rekent zelf een verouderd-grens uit', () => {
    const overtreders: string[] = []
    for (const rel of [...sourceFiles('app'), ...sourceFiles('components'), ...sourceFiles('lib')]) {
      if (ALLOWLIST.has(rel)) continue
      // CRLF-veilig (zie lib/test-utils/read-source.ts).
      const code = readSourceLF(join(REPO_ROOT, rel))
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^[ \t]*\/\/.*$/gm, '')

      for (let i = code.indexOf('last_price_update'); i !== -1; i = code.indexOf('last_price_update', i + 1)) {
        const omgeving = code.slice(Math.max(0, i - VENSTER), i + VENSTER)
        if (GRENS_VORMEN.some((v) => v.test(omgeving))) {
          overtreders.push(rel)
          break
        }
      }
    }
    expect(overtreders).toEqual([])
  })

  it('de drie oppervlakken die het defect vormden consumeren de gedeelde regel', () => {
    const uses = (p: string) => readSourceLF(join(REPO_ROOT, p))
    expect(uses('app/(app)/layout.tsx')).toContain('countStalePrices')
    expect(uses('components/core/holdings-client.tsx')).toContain('countStalePrices')
    expect(uses('components/app/holdings-heatmap.tsx')).toContain('isPriceStale')
  })

  it('de drempel staat als benoemde constante, niet als los getal', () => {
    expect(STALE_AFTER_TRADING_DAYS).toBeGreaterThan(0)
  })
})

describe('fiat-saldi hebben geen koersbron', () => {
  it('een exchange-fiatsaldo veroudert nooit', () => {
    // Alle drie de koerspaden slaan zo'n rij over ("Fiat balance — geen
    // prijsverversing"). Meetellen gaf een stipje dat door verversen niet kón
    // doven — hetzelfde patroon als bij de gesloten posities.
    const oud = at(2020, 1, 1, 0).toISOString()
    expect(
      isPriceStale({ units: 500, ticker: 'EUR', is_fiat_balance: true, last_price_update: oud }),
    ).toBe(false)
    // Zonder de vlag is diezelfde rij wél verouderd — de vlag doet het werk,
    // niet het symbool.
    expect(
      isPriceStale({ units: 500, ticker: 'EUR', last_price_update: oud }),
    ).toBe(true)
  })
})

describe('stalenessCutoff — UTC en invoergrenzen', () => {
  it('rekent in UTC, zodat server en browser hetzelfde antwoord geven', () => {
    // Zondag 23:30 UTC. In lokale NL-tijd is dat al maandag; met lokale
    // kalenderrekening zou de browser een dag verder terugspringen dan de
    // server. In UTC is het voor beide zondag → één handelsdag terug = vrijdag.
    const cutoff = stalenessCutoff(new Date('2026-08-09T23:30:00Z'), 1)
    expect(cutoff.getUTCDay()).toBe(5)
    expect(cutoff.getUTCDate()).toBe(7)
  })

  it('klemt de invoer i.p.v. de lus, zodat de uitkomst zijn betekenis houdt', () => {
    // Een lus-guard zou een cutoff teruggeven die niet het gevraagde aantal
    // handelsdagen terugligt — stil iets anders dan de documentatie belooft.
    const nu = new Date('2026-08-11T09:00:00Z')
    const geklemd = stalenessCutoff(nu, 100_000)
    const maximum = stalenessCutoff(nu, 260)
    expect(geklemd.getTime()).toBe(maximum.getTime())
  })

  it('geeft bij 0 handelsdagen het huidige moment terug', () => {
    const nu = new Date('2026-08-11T09:00:00Z')
    expect(stalenessCutoff(nu, 0).getTime()).toBe(nu.getTime())
  })
})
