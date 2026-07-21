import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  weightedAssetTotal,
  weightedDebtTotal,
  computeSnapshotNetWorth,
  computeSnapshotFreedomPct,
  buildSnapshotParams,
  type SnapshotAsset,
  type SnapshotDebt,
} from './snapshot-math'
import { BOX3_DRAG } from '@/lib/constants'
import { CURRENT_TAX_YEAR } from '@/lib/box3-data'

/**
 * Regressie-suite voor de canonieke snapshot-rekenhelpers. Borgt dat de drie
 * snapshot-schrijfpaden (POST / auto / cron) het opgeslagen net_worth identiek
 * berekenen: inclusion-gewogen assets + losse cash − inclusion-gewogen debts
 * (audit §R2.2 S4 / §R2.4 punt 1).
 */

const assets: SnapshotAsset[] = [
  { current_value: 100_000, net_worth_inclusion_pct: 100 }, // → 100.000
  { current_value: 200_000, net_worth_inclusion_pct: 50 },  // → 100.000 (huis half meegerekend)
  { current_value: 10_000, net_worth_inclusion_pct: null },  // → 10.000 (default 100%)
]
const debts: SnapshotDebt[] = [
  { current_balance: 150_000, net_worth_inclusion_pct: 100 }, // → 150.000
  { current_balance: 20_000, net_worth_inclusion_pct: 50 },   // → 10.000
]
const unlinkedCash = 5_000

describe('snapshot-math — inclusion-gewogen sommen', () => {
  it('weegt assets met net_worth_inclusion_pct (en default 100%)', () => {
    expect(weightedAssetTotal(assets)).toBe(210_000)
  })

  it('weegt debts met net_worth_inclusion_pct', () => {
    expect(weightedDebtTotal(debts)).toBe(160_000)
  })
})

describe('snapshot-math — canoniek net_worth', () => {
  it('= gewogen assets + losse cash − gewogen debts (spiegelt dashboard-loader)', () => {
    const nw = computeSnapshotNetWorth(
      weightedAssetTotal(assets),
      unlinkedCash,
      weightedDebtTotal(debts),
    )
    // 210.000 + 5.000 − 160.000
    expect(nw).toBe(55_000)
  })

  it('wijkt af van de OUDE ongewogen + cash-loze formule (de gefixte bug)', () => {
    const canonical = computeSnapshotNetWorth(
      weightedAssetTotal(assets),
      unlinkedCash,
      weightedDebtTotal(debts),
    )
    // Oude POST/cron: Σ current_value − Σ current_balance, geen inclusion, geen cash.
    const oudOngewogenZonderCash =
      assets.reduce((s, a) => s + Number(a.current_value), 0) -
      debts.reduce((s, d) => s + Number(d.current_balance), 0)
    // 310.000 − 170.000 = 140.000 ≠ 55.000
    expect(oudOngewogenZonderCash).toBe(140_000)
    expect(canonical).not.toBe(oudOngewogenZonderCash)

    // Oude auto: gewogen, maar zonder losse cash in het opgeslagen net_worth.
    const oudGewogenZonderCash = weightedAssetTotal(assets) - weightedDebtTotal(debts)
    // 210.000 − 160.000 = 50.000 ≠ 55.000 (cash van 5.000 ontbrak)
    expect(oudGewogenZonderCash).toBe(50_000)
    expect(canonical).not.toBe(oudGewogenZonderCash)
  })
})

describe('snapshot-math — per-rij freedom_percentage', () => {
  it('= netWorth / fireTarget × 100, geclampt op 0–100', () => {
    expect(computeSnapshotFreedomPct(50_000, 200_000)).toBe(25)
  })

  it('clampt op 100 bij vermogen ≥ doel', () => {
    expect(computeSnapshotFreedomPct(300_000, 200_000)).toBe(100)
  })

  it('clampt op 0 bij negatief vermogen', () => {
    expect(computeSnapshotFreedomPct(-10_000, 200_000)).toBe(0)
  })

  it('is 0 bij fireTarget ≤ 0 (geen essentiële budgetten)', () => {
    expect(computeSnapshotFreedomPct(50_000, 0)).toBe(0)
  })

  it('rekent met hetzelfde net_worth dat in de rij wordt opgeslagen (per-rij consistentie)', () => {
    const nw = computeSnapshotNetWorth(
      weightedAssetTotal(assets),
      unlinkedCash,
      weightedDebtTotal(debts),
    )
    const fireTarget = 110_000
    // De freedomPct van dezelfde rij gebruikt exact dit net_worth (55.000) → 50%.
    expect(computeSnapshotFreedomPct(nw, fireTarget)).toBe(50)
  })
})

describe('snapshot-math — buildSnapshotParams (provenance, [Arch F6] #27)', () => {
  const fire = { grossReturn: 0.07, inflationRate: 0.02, effectiveSwr: 0.0284, box3Method: 'forfaitair' as const, marginaalTarief: 0.37 }

  it('legt de aannames vast (SWR/rendement/inflatie/box3Drag/belastingjaar/grondslag)', () => {
    const p = buildSnapshotParams(fire)
    expect(p).toEqual({
      v: 1,
      swr: 0.0284,
      grossReturn: 0.07,
      inflation: 0.02,
      box3Drag: Math.round(BOX3_DRAG * 1e5) / 1e5,
      taxYear: CURRENT_TAX_YEAR,
      grondslag: 'full-networth',
      savingsSource: 'transactions',
    })
  })

  it('consumeert het canonieke belastingjaar (geen hardcode)', () => {
    expect(buildSnapshotParams(fire).taxYear).toBe(CURRENT_TAX_YEAR)
  })

  it('trimt float-ruis af op 5 decimalen', () => {
    const p = buildSnapshotParams({ grossReturn: 0.070000001, inflationRate: 0.0199999, effectiveSwr: 0.02840003 })
    expect(p.grossReturn).toBe(0.07)
    expect(p.inflation).toBe(0.02)
    expect(p.swr).toBe(0.0284)
  })

  it('bevat geen PII/bedragen — uitsluitend numerieke parameters + enum-labels', () => {
    const p = buildSnapshotParams(fire)
    // Alleen de acht bekende sleutels; niets dat op een naam/omschrijving/bedrag lijkt.
    expect(Object.keys(p).sort()).toEqual(
      ['box3Drag', 'grondslag', 'grossReturn', 'inflation', 'savingsSource', 'swr', 'taxYear', 'v'],
    )
  })
})

// ── Structurele borging: de drie schrijfpaden gebruiken DE helper ─────────
// De pure-helper-tests hierboven borgen de FORMULE, maar niet dat de drie
// snapshot-routes 'm ook echt aanroepen. Een toekomstige edit zou in één route
// stilletjes een afwijkende net_worth-som kunnen herinlinen (precies de §R2.4
// punt-1-bug die deze ronde is gefixt) zonder dat één pure-helper-test rood
// wordt. Deze bron-structuurcheck leest de route-bestanden en dwingt af dat
// elk schrijfpad het canonieke net_worth via computeSnapshotNetWorth bouwt.
describe('snapshot-math — drie schrijfpaden delen de helper (bron-structuur)', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const routeFiles = [
    { label: 'POST /api/snapshots', path: join(here, 'route.ts') },
    { label: 'auto /api/snapshots/auto', path: join(here, 'auto', 'route.ts') },
    { label: 'cron /api/snapshots/cron', path: join(here, 'cron', 'route.ts') },
  ] as const

  for (const { label, path } of routeFiles) {
    it(`${label} importeert en gebruikt computeSnapshotNetWorth`, () => {
      const src = readFileSync(path, 'utf8')
      // Importeert uit snapshot-math (relatief pad verschilt per diepte).
      expect(src).toMatch(/from ['"]\.\.?(\/\.\.)?\/snapshot-math['"]/)
      // Bouwt het OP TE SLAAN net_worth via de canonieke helper.
      expect(src).toMatch(/const\s+netWorth\s*=\s*computeSnapshotNetWorth\s*\(/)
      // En weegt assets/debts via de gedeelde inclusion-helpers (geen los Σ).
      expect(src).toMatch(/weightedAssetTotal\s*\(/)
      expect(src).toMatch(/weightedDebtTotal\s*\(/)
    })

    it(`${label} bouwt het op te slaan net_worth niet via een ongewogen Σ-reduce`, () => {
      const src = readFileSync(path, 'utf8')
      // De §R2.4-bug: het op te slaan net_worth werd los gesommeerd over
      // current_value − current_balance, zónder inclusion-weging en zónder de
      // helper. Zo'n reduce direct in een netWorth/totalAssets-toewijzing mag
      // niet terugkeren. (Read-backs van een reeds opgeslagen s.net_worth in de
      // GET-handler zijn legitiem en vallen hier bewust buiten.)
      const ongewogenReduceAssign =
        /(?:netWorth|totalAssets|net_worth)\s*[:=]\s*[^\n]*\.reduce\([^\n]*current_value/.test(src)
      expect(ongewogenReduceAssign).toBe(false)
    })

    it(`${label} vult de provenance-parameterset via buildSnapshotParams ([Arch F6] #27)`, () => {
      const src = readFileSync(path, 'utf8')
      // Elk schrijfpad importeert de helper en zet 'm op de op-te-slaan rij als
      // `params:`. Borgt AC-punt "alle drie schrijfpaden vullen hem" — een edit
      // die één route stil laat vallen, wordt hier rood.
      expect(src).toMatch(/buildSnapshotParams/)
      expect(src).toMatch(/params:\s*buildSnapshotParams\s*\(/)
    })
  }
})
