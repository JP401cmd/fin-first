/**
 * De GRONDSLAG van `assetGrowthDirection` in `loadCoreData` (lib/core-data-loader.ts).
 *
 * ── WAT HIER WORDT BEWAAKT ──────────────────────────────────────────────────
 * Het groei-pijltje op de Kern had tot 11-08-2026 een tweetraps-pad: primair een
 * top-50 `valuations`-query, met `net_worth_snapshots.total_assets` als fallback.
 * Dat primaire pad is verwijderd (Notion-kaart "Groeischuld valuations", optie A)
 * om twee onafhankelijke redenen, en deze suite bewaakt dat het niet terugkomt:
 *
 *  1. **Correctheid.** `sorted[0]`/`sorted[1]` heetten "totalen" maar waren de
 *     waarde van twee LOSSE bezittingen. Zonder tiebreaker op gelijke
 *     `valuation_date` vergeleek het pijltje twee VERSCHILLENDE assets — op
 *     productie hebben gebruikers 2-3 waarderingen op dezelfde datum. Alleen
 *     `total_assets` is een echt totaal en dus de grondslag die het label claimt.
 *  2. **Groeischuld.** `valuations` groeit dagelijks; de RLS-disjunctie
 *     (`auth.uid() = user_id OR (ownership = 'shared' AND household_id = …)`)
 *     dwingt een Seq Scan + top-N heapsort af die met de tabel meegroeit. Gemeten
 *     op 292k gesimuleerde rijen: 4172 buffers / 174 ms. Een expliciete
 *     `.eq('user_id')` haalt die Sort er bij `limit 50` NIET uit.
 *
 * ── ECHTE REGEL + EEN BRON-ANKER ────────────────────────────────────────────
 * De berekening staat inline in `loadCoreData`, een functie met tientallen
 * queries die in een unit-test niet te draaien is. Deze suite doet daarom
 * hetzelfde als lib/dashboard-data-loader.spend-limit-injectie.test.ts:
 *
 *  · een BRON-ANKER leest lib/core-data-loader.ts van schijf en eist dat de
 *    beslissende fragmenten er letterlijk in staan (en dat de valuations-query
 *    er letterlijk NIET meer in staat). Keert het oude pad terug, dan valt dit
 *    bestand om in plaats van stilzwijgend een regel te bewaken die niet bestaat;
 *  · de DREMPELREGEL zelf (±0,1 %) is hieronder gespiegeld en wordt op de
 *    randgevallen getest.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LOADER_PATH = join(REPO_ROOT, 'lib', 'core-data-loader.ts')

/** Strip block- en regelcommentaar en normaliseer witruimte, zodat het anker op
 *  CODE matcht en niet op proza (de toelichting bij de verwijderde query noemt
 *  `valuations` immers zelf), en niet omvalt bij een herformattering. */
function loaderCode(): string {
  return readFileSync(LOADER_PATH, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
    .replace(/\s+/g, ' ')
}

// ── Bron-anker ──────────────────────────────────────────────────────────────

describe('bronanker — de grondslag in loadCoreData is net_worth_snapshots', () => {
  const code = loaderCode()

  it('leest een niet-lege bron (anders is elke assertie hieronder groen om niets)', () => {
    expect(code.length).toBeGreaterThan(1000)
  })

  it('bevat GEEN valuations-query meer — de groeischuld is bij de wortel weg', () => {
    expect(code).not.toContain("from('valuations')")
  })

  it('leest `assetGrowthDirection` niet meer uit een valuations-resultaat', () => {
    expect(code).not.toContain('assetValuationResult')
  })

  it('bepaalt de richting uit total_assets van de laatste twee snapshots', () => {
    expect(code).toContain("let assetGrowthDirection: 'up' | 'down' | 'flat' = 'flat'")
    expect(code).toContain('if (snapshotResult.data && snapshotResult.data.length >= 2)')
    expect(code).toContain('const latestAssets = Number(snaps[snaps.length - 1].total_assets)')
    expect(code).toContain('const prevAssets = Number(snaps[snaps.length - 2].total_assets)')
  })

  it('houdt de snapshot-query ASC gesorteerd — anders wijzen [-1]/[-2] de verkeerde kant op', () => {
    expect(code).toContain(
      "from('net_worth_snapshots').select('snapshot_date, total_assets, total_debts, net_worth, freedom_percentage, fire_age, sovereignty_level, savings_rate, resilience_score, fire_portfolio_required').order('snapshot_date', { ascending: true })",
    )
  })

  it('houdt de ±0,1 %-drempel die hieronder gespiegeld staat', () => {
    expect(code).toContain("if (latestAssets > prevAssets * 1.001) assetGrowthDirection = 'up'")
    expect(code).toContain("else if (latestAssets < prevAssets * 0.999) assetGrowthDirection = 'down'")
  })
})

// ── Gespiegelde regel ───────────────────────────────────────────────────────

type Snapshot = { total_assets: number | string }

/** Spiegel van de regel in loadCoreData; het bron-anker hierboven borgt dat de
 *  spiegeling de bron nog beschrijft. */
function assetGrowthDirection(snapshots: Snapshot[] | null): 'up' | 'down' | 'flat' {
  if (snapshots && snapshots.length >= 2) {
    const latestAssets = Number(snapshots[snapshots.length - 1].total_assets)
    const prevAssets = Number(snapshots[snapshots.length - 2].total_assets)
    if (latestAssets > prevAssets * 1.001) return 'up'
    if (latestAssets < prevAssets * 0.999) return 'down'
  }
  return 'flat'
}

describe('assetGrowthDirection — richting uit total_assets', () => {
  it('stijgend boven de drempel ⇒ up', () => {
    expect(assetGrowthDirection([{ total_assets: 100_000 }, { total_assets: 101_000 }])).toBe('up')
  })

  it('dalend onder de drempel ⇒ down', () => {
    expect(assetGrowthDirection([{ total_assets: 100_000 }, { total_assets: 99_000 }])).toBe('down')
  })

  it('beweging binnen ±0,1 % ⇒ flat (ruis is geen richting)', () => {
    expect(assetGrowthDirection([{ total_assets: 100_000 }, { total_assets: 100_050 }])).toBe('flat')
    expect(assetGrowthDirection([{ total_assets: 100_000 }, { total_assets: 99_950 }])).toBe('flat')
    expect(assetGrowthDirection([{ total_assets: 100_000 }, { total_assets: 100_000 }])).toBe('flat')
  })

  it('kijkt naar de LAATSTE twee snapshots, niet de eerste twee (ASC-volgorde)', () => {
    // Eerste twee zouden 'up' zeggen, de laatste twee zeggen 'down'.
    const snaps = [{ total_assets: 100_000 }, { total_assets: 120_000 }, { total_assets: 90_000 }]
    expect(assetGrowthDirection(snaps)).toBe('down')
  })

  it('minder dan 2 snapshots ⇒ flat in plaats van een willekeurige richting', () => {
    expect(assetGrowthDirection(null)).toBe('flat')
    expect(assetGrowthDirection([])).toBe('flat')
    expect(assetGrowthDirection([{ total_assets: 100_000 }])).toBe('flat')
  })

  it('rekent met numerieke waarde, ook als PostgREST numeric als string levert', () => {
    expect(assetGrowthDirection([{ total_assets: '100000' }, { total_assets: '101000' }])).toBe('up')
  })

  it('is deterministisch: één totaal per snapshot, dus geen tiebreaker nodig', () => {
    // Regressie op de oude valuations-tak: die vergeleek bij gelijke
    // valuation_date twee LOSSE bezittingen en gaf per aanroep een andere
    // richting. `total_assets` is per snapshot_date uniek en al geaggregeerd.
    const snaps = [{ total_assets: 100_000 }, { total_assets: 105_000 }]
    const uitkomsten = new Set(Array.from({ length: 20 }, () => assetGrowthDirection([...snaps])))
    expect([...uitkomsten]).toEqual(['up'])
  })
})
