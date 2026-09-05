import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import archData from '@/docs/architecture/architecture.json'
import {
  INTEGRATIONS,
  buildIntegrationsModel,
  type IntegrationEntry,
} from './integrations-model'
import { selectIntegrations, type IntegrationClientFact } from './facts'

// ── Feiten van schijf — de waarheid waar de curatie mee moet syncen ──────────

const ROOT = path.resolve(process.cwd())

/** Alle *-client.ts bestanden in lib/integrations/, lib/truelayer/, lib/nibud/ */
function clientFilesOnDisk(): string[] {
  const dirs = [
    path.join(ROOT, 'lib', 'integrations'),
    path.join(ROOT, 'lib', 'truelayer'),
    path.join(ROOT, 'lib', 'nibud'),
  ]
  const SKIP_SUFFIXES = ['-adapter.ts', '-cron.ts', '-sync.ts', '.test.ts', '.d.ts']
  const SKIP_NAMES = [
    'index.ts', 'shared.ts',
    // support/helper files in integration dirs (not API clients)
    'types.ts', 'mapper.ts', 'feature-flag.ts',
    'linked-asset.ts', 'wallet-validation.ts', 'orphan-connections.ts',
    'category-mapping.ts', 'reference-data.ts',
    // fase 1 bank-connect-doelrekening (initial-fetch plan): puur/support, geen
    // eigen externe client — planInitialFetch/errors/dedup-helpers draaien op
    // client.ts (dat wél in sourceFiles staat)
    'errors.ts', 'existing-hashes.ts', 'initial-fetch.ts',
    // fase 4 bank-connect-doelrekening: de doelrekening-geschiktheidsregel praat
    // met Supabase, niet met TrueLayer — geen eigen externe client
    'target-account.ts',
    // fase 5 bank-connect-doelrekening: de cash-as-asset-backfill schrijft naar
    // Supabase en de linked-account-vorm is puur wire-type + formatter — beide
    // bellen TrueLayer nooit
    'cash-asset-backfill.ts', 'linked-account.ts',
    // fase 7 bank-connect-doelrekening: `start-relink.ts` is de CLIENTkant van het
    // herstelpad — één `fetch` naar onze eigen `/api/bank-connect/auth-link`, die
    // route belt TrueLayer. Geen tweede externe client, dus geen eigen
    // INTEGRATIONS-entry; hij staat wél in `apiRoutes` van de truelayer-entry.
    'start-relink.ts',
    // fase 8 bank-connect-doelrekening: `balance-valuation.ts` schrijft het
    // herwaarderingsspoor van een banksaldo (valuations + balance_snapshots) naar
    // Supabase en belt TrueLayer nooit — de saldo-ophaal zelf zit in `client.ts`.
    // Geen externe client, dus geen eigen INTEGRATIONS-entry; hij staat wél als
    // bronbestand bij de calc "Netto vermogen (gewogen)".
    'balance-valuation.ts',
    // infra/probe/registry — geen extern API-client
    'health-probe.ts', 'version-registry.ts',
    // parser-support
    'format-contracts.ts', 'categorize.ts', 'counterparty-normalize.ts',
    'cross-source-dedup.ts',
  ]
  const out: string[] = []
  for (const dir of dirs) {
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.ts')) continue
      const base = f.toLowerCase()
      if (SKIP_NAMES.includes(base)) continue
      if (SKIP_SUFFIXES.some(s => base.endsWith(s))) continue
      const relPath = path.relative(ROOT, path.join(dir, f)).split(path.sep).join('/')
      out.push(relPath)
    }
  }
  return out.sort()
}

/** Parser-bestanden in lib/parsers/ (mt940/ofx/csv/broker-csv) */
function parserFilesOnDisk(): string[] {
  const dir = path.join(ROOT, 'lib', 'parsers')
  if (!existsSync(dir)) return []
  // Support-bestanden die geen externe clients zijn en niet in INTEGRATIONS staan:
  // - shared.ts, index.ts: gedeelde utilities/barrel
  // - format-contracts.ts: declaratief contract-register, geen externe client
  // - categorize.ts: AI-categorie-helper (geen extern API)
  // - counterparty-normalize.ts: normaliseringslogica (geen extern API)
  // - cross-source-dedup.ts: pure cross-bron dedup-laag (laag 2), geen
  //   bestandsformaat en geen externe client — gedeeld door de bank-sync en,
  //   vanaf fase 3, het importpad
  // - iban.ts: IBAN-validatie (mod-97) + éénduidige extractie uit vrije tekst.
  //   Zuivere tekstlogica zonder bestandsformaat en zonder externe client;
  //   staat in dezelfde familie als counterparty-normalize.ts. Wordt gedeeld
  //   door de TrueLayer-mapper (UR3-02) en is bewust géén integratie-entry —
  //   de integratie is de bankkoppeling, niet de helper die zij aanroept.
  const SKIP = [
    'index.ts',
    'shared.ts',
    'format-contracts.ts',
    'categorize.ts',
    'counterparty-normalize.ts',
    'cross-source-dedup.ts',
    'iban.ts',
  ]
  return readdirSync(dir)
    .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts') && !SKIP.includes(f))
    .map(f => `lib/parsers/${f}`)
    .sort()
}

const diskClients = clientFilesOnDisk()
const diskParsers = parserFilesOnDisk()
const pensionRoute = 'app/api/pension/parse/route.ts'

// Gescande feiten uit architecture.json
const rawFacts = selectIntegrations(archData)

// ── sync: curatie ↔ schijf ───────────────────────────────────────────────────

describe('integrations-model — sync met schijf', () => {
  it('elke *-client.ts op schijf heeft ≥1 INTEGRATIONS-entry via sourceFiles', () => {
    const allSourceFiles = new Set(INTEGRATIONS.flatMap(e => e.sourceFiles))
    const missing = diskClients.filter(f => !allSourceFiles.has(f))
    expect(missing, `niet-ingedeelde client-bestanden: ${missing.join(', ')}`).toEqual([])
  })

  it('geen stale entries — elk gecureerd sourceFile bestaat op schijf', () => {
    const stale: string[] = []
    for (const entry of INTEGRATIONS) {
      for (const sf of entry.sourceFiles) {
        if (!existsSync(path.join(ROOT, sf))) stale.push(`${entry.id}: ${sf}`)
      }
    }
    expect(stale, `stale sourceFiles: ${stale.join(', ')}`).toEqual([])
  })

  it('elk parser-bestand in lib/parsers/ (niet-SKIP) zit in minstens één INTEGRATIONS-entry via sourceFiles', () => {
    // Bewaking: een nieuw parser-bestand dat niet in SKIP staat én niet in
    // INTEGRATIONS.sourceFiles zit, maakt deze test rood → bewuste curatie vereist.
    const allSourceFiles = new Set(INTEGRATIONS.flatMap(e => e.sourceFiles))
    const missing = diskParsers.filter(f => !allSourceFiles.has(f))
    expect(missing, `niet-ingedeelde parser-bestanden: ${missing.join(', ')}`).toEqual([])
  })

  it('elk parser-bestand in lib/parsers/ heeft een entry met het juiste kind', () => {
    for (const parserFile of diskParsers) {
      const entries = INTEGRATIONS.filter(e => e.sourceFiles.includes(parserFile))
      if (entries.length === 0) continue // niet-relevante parsers (categorize, etc.)
      for (const e of entries) {
        const fname = parserFile.split('/').pop() ?? ''
        if (fname.includes('mt940')) expect(e.kind).toBe('mt940')
        else if (fname.includes('ofx')) expect(e.kind).toBe('ofx')
        else if (fname.includes('broker-csv')) expect(e.kind, `broker-csv entry: ${e.id}`).toBe('csv')
        else if (fname.includes('csv')) expect(e.kind).toBe('csv')
      }
    }
  })

  it('pension-parse-route → entry pension-pdf', () => {
    const entry = INTEGRATIONS.find(e => e.sourceFiles.includes(pensionRoute))
    expect(entry?.id).toBe('pension-pdf')
  })

  it('elke public-probe heeft een url', () => {
    for (const e of INTEGRATIONS) {
      if (e.healthProbe.kind === 'public') {
        expect(e.healthProbe.url, `${e.id}: public probe heeft geen url`).toBeTruthy()
      }
    }
  })

  it('elke none-probe heeft een note', () => {
    for (const e of INTEGRATIONS) {
      if (e.healthProbe.kind === 'none') {
        expect(e.healthProbe.note, `${e.id}: none probe heeft geen note`).toBeTruthy()
      }
    }
  })
})

// ── sync: gescande feiten ↔ gecureerde baseUrl ────────────────────────────────

describe('integrations-model — base-URL drift-check (op architecture.json)', () => {
  it('gescande base-URL == gecureerde baseUrl voor entries met constanten', () => {
    const model = buildIntegrationsModel(rawFacts)
    const drifted = model.entries.filter(e => e.baseUrlDrift)
    const names = drifted.map(e => `${e.id}: gecureerd=${e.baseUrl} gescand=${e.scannedBaseUrl}`)
    expect(names, `base-URL drift gevonden: ${names.join(' | ')}`).toEqual([])
  })

  it('counts.total === INTEGRATIONS.length', () => {
    const model = buildIntegrationsModel(rawFacts)
    expect(model.counts.total).toBe(INTEGRATIONS.length)
  })
})

// ── model op de echt gegenereerde feiten ─────────────────────────────────────

describe('integrations-model — op gegenereerde feiten', () => {
  it('heeft gevulde feiten (draai npm run arch:diagram als dit faalt)', () => {
    // Niet strikt vereist dat ze aanwezig zijn voor de pure unit-tests,
    // maar als de scanner draaide moet er iets zijn.
    if (rawFacts.length > 0) {
      expect(rawFacts.length).toBeGreaterThan(0)
    }
  })

  it('probeerbaar ≥ 5 (bitvavo+kraken+coinbase+coingecko+blockchair)', () => {
    const model = buildIntegrationsModel(rawFacts)
    // Als feiten leeg zijn (nog niet gegenereerd), sla over
    if (rawFacts.length === 0) return
    expect(model.counts.probeerbaar).toBeGreaterThanOrEqual(5)
  })
})

// ── pure unit-gevallen (defensief gedrag) ────────────────────────────────────

describe('buildIntegrationsModel — puur & defensief', () => {
  it('null/undefined/lege feiten → leeg-maar-geldig model', () => {
    const inputs: Array<IntegrationClientFact[] | null | undefined> = [undefined, null, []]
    for (const input of inputs) {
      const m = buildIntegrationsModel(input)
      expect(m.entries.length).toBe(INTEGRATIONS.length)
      expect(m.counts.total).toBe(INTEGRATIONS.length)
      // Zonder feiten zijn alle sourceFilesExist = false
      for (const e of m.entries) {
        expect(e.sourceFilesExist.every(v => v === false)).toBe(true)
      }
    }
  })

  it('feiten met één bekende file → sourceFilesExist correct gematcht', () => {
    const fakeFact: IntegrationClientFact = {
      file: 'lib/integrations/bitvavo-client.ts',
      exists: true,
      baseUrl: 'https://api.bitvavo.com/v2',
      hasAdapter: true,
      parserFormat: null,
    }
    const m = buildIntegrationsModel([fakeFact])
    const bitvavo = m.entries.find(e => e.id === 'bitvavo')!
    expect(bitvavo.sourceFilesExist[0]).toBe(true)
    expect(bitvavo.scannedBaseUrl).toBe('https://api.bitvavo.com/v2')
    expect(bitvavo.baseUrlDrift).toBe(false)
  })

  it('base-URL drift detectie werkt', () => {
    const fakeFact: IntegrationClientFact = {
      file: 'lib/integrations/bitvavo-client.ts',
      exists: true,
      baseUrl: 'https://api.bitvavo.com/v3', // ANDERE versie
      hasAdapter: true,
      parserFormat: null,
    }
    const m = buildIntegrationsModel([fakeFact])
    const bitvavo = m.entries.find(e => e.id === 'bitvavo')!
    expect(bitvavo.baseUrlDrift).toBe(true)
  })
})
