/**
 * Box 3 vermogensrendementsheffing — pure calculation engine.
 *
 * No Supabase dependency. Follows the pattern of horizon-data.ts.
 */

import type { Asset, AssetType } from './asset-data'
import type { Debt } from './debt-data'

// ── Types ────────────────────────────────────────────────────

export type TaxYear = 2025 | 2026

export type Box3Category = 'spaargeld' | 'beleggingen' | null

export interface Box3Params {
  forfaitSpaargeld: number
  forfaitBeleggingen: number
  forfaitSchulden: number
  tarief: number
  heffingsvrijSingle: number
  heffingsvrijPartner: number
  schuldendrempelSingle: number
  schuldendrempelPartner: number
}

export interface AssetClassification {
  asset: Asset
  category: Box3Category
  exclusionReason: string | null
}

export interface DebtClassification {
  debt: Debt
  inBox3: boolean
  exclusionReason: string | null
}

export interface Box3Input {
  assets: Asset[]
  debts: Debt[]
  hasPartner: boolean
  dailyExpenses: number // for freedom-days calculation
  year: TaxYear
}

export interface Box3Result {
  year: TaxYear
  hasPartner: boolean
  params: Box3Params

  // Classifications
  assetClassifications: AssetClassification[]
  debtClassifications: DebtClassification[]

  // Totals per category
  totaalSpaargeld: number
  totaalBeleggingen: number
  totaalUitgesloten: number
  totaalBox3Schulden: number
  totaalUitgeslotenSchulden: number

  // Calculation steps
  schuldendrempel: number
  aftrekbareSchulden: number
  forfaitairSpaargeld: number
  forfaitairBeleggingen: number
  forfaitairSchulden: number
  voordeelUitSparen: number
  rendementsgrondslag: number
  heffingsvrijVermogen: number
  grondslagSparen: number
  effectiefRendement: number
  box3Inkomen: number
  belasting: number

  // Freedom metric
  vrijheidsdagen: number
  dailyExpenses: number
}

export interface Box3Optimization {
  id: string
  title: string
  description: string
  besparing: number
  vrijheidsdagen: number
}

export interface PartnerAllocation {
  partner1Spaargeld: number
  partner1Beleggingen: number
  partner1Schulden: number
  partner2Spaargeld: number
  partner2Beleggingen: number
  partner2Schulden: number
  totalBelasting: number
  besparingVsGelijk: number
}

// ── Constants ────────────────────────────────────────────────

export const BOX3_PARAMS: Record<TaxYear, Box3Params> = {
  2025: {
    forfaitSpaargeld: 0.0137,
    forfaitBeleggingen: 0.0588,
    forfaitSchulden: 0.0270,
    tarief: 0.36,
    heffingsvrijSingle: 57_684,
    heffingsvrijPartner: 115_368,
    schuldendrempelSingle: 3_800,
    schuldendrempelPartner: 7_600,
  },
  2026: {
    forfaitSpaargeld: 0.0128,
    forfaitBeleggingen: 0.0600,
    forfaitSchulden: 0.0270,
    tarief: 0.36,
    heffingsvrijSingle: 59_357,
    heffingsvrijPartner: 118_714,
    schuldendrempelSingle: 3_800,
    schuldendrempelPartner: 7_600,
  },
}

export const BOX3_TOOLTIPS: Record<string, string> = {
  box3: 'Box 3 belast je vermogen op basis van een fictief rendement — niet wat je werkelijk verdient.',
  forfaitairRendement: 'Een vast percentage waarmee de Belastingdienst berekent hoeveel je "geacht wordt" te verdienen. Spaargeld heeft een lager percentage dan beleggingen.',
  peildatum: 'De waarde van je vermogen op 1 januari bepaalt je belasting voor het hele jaar.',
  heffingsvrijVermogen: 'Tot dit bedrag betaal je geen Box 3 belasting. Met fiscaal partner is het dubbele vrijgesteld.',
  schuldendrempel: 'Alleen schulden boven deze drempel worden afgetrokken. Schulden eronder tellen niet mee.',
  rendementsgrondslag: 'Je totale Box 3 bezittingen minus aftrekbare schulden — de basis voor de berekening.',
  effectiefTarief: 'Het werkelijke percentage dat je betaalt over je totale Box 3 vermogen. Door de vrijstelling vaak lager dan 36%.',
  eigenWoning: 'Je eigen woning valt onder Box 1 (eigenwoningforfait), niet onder Box 3.',
  cryptoAlsBelegging: 'De Belastingdienst classificeert alle crypto — ook stablecoins — als "overige bezittingen", niet als spaargeld.',
  pensioenVrijstelling: 'Pensioen en lijfrente met fiscaal voordeel vallen niet in Box 3. Ze zijn al belast bij uitkering (Box 1).',
}

// ── Classification ───────────────────────────────────────────

export function classifyAsset(asset: Asset): { category: Box3Category; exclusionReason: string | null } {
  const type = asset.asset_type as AssetType

  if (type === 'eigen_huis') {
    return { category: null, exclusionReason: 'Eigen woning valt onder Box 1' }
  }

  if (type === 'retirement') {
    if (asset.tax_benefit) {
      return { category: null, exclusionReason: 'Pensioen met fiscaal voordeel (Box 1)' }
    }
    return { category: 'beleggingen', exclusionReason: null }
  }

  if (type === 'savings') {
    return { category: 'spaargeld', exclusionReason: null }
  }

  // All other types are beleggingen
  return { category: 'beleggingen', exclusionReason: null }
}

export function classifyDebt(
  debt: Debt,
  eigenHuisAssetIds: Set<string>,
): { inBox3: boolean; exclusionReason: string | null } {
  // Mortgage linked to eigen_huis with tax deductible flag
  if (
    debt.debt_type === 'mortgage' &&
    debt.linked_asset_id &&
    eigenHuisAssetIds.has(debt.linked_asset_id) &&
    debt.is_tax_deductible
  ) {
    return { inBox3: false, exclusionReason: 'Hypotheek eigen woning (Box 1)' }
  }

  return { inBox3: true, exclusionReason: null }
}

// ── Core Calculation ─────────────────────────────────────────

export function calculateBox3(input: Box3Input): Box3Result {
  const params = BOX3_PARAMS[input.year]
  const activeAssets = input.assets.filter(a => a.is_active)
  const activeDebts = input.debts.filter(d => d.is_active)

  // Step 1: Classify assets
  const eigenHuisAssetIds = new Set(
    activeAssets
      .filter(a => a.asset_type === 'eigen_huis')
      .map(a => a.id),
  )

  const assetClassifications: AssetClassification[] = activeAssets.map(asset => {
    const { category, exclusionReason } = classifyAsset(asset)
    return { asset, category, exclusionReason }
  })

  // Step 2: Classify debts
  const debtClassifications: DebtClassification[] = activeDebts.map(debt => {
    const { inBox3, exclusionReason } = classifyDebt(debt, eigenHuisAssetIds)
    return { debt, inBox3, exclusionReason }
  })

  // Step 3: Sum totals per category
  let totaalSpaargeld = 0
  let totaalBeleggingen = 0
  let totaalUitgesloten = 0

  for (const ac of assetClassifications) {
    const value = Number(ac.asset.current_value)
    if (ac.category === 'spaargeld') totaalSpaargeld += value
    else if (ac.category === 'beleggingen') totaalBeleggingen += value
    else totaalUitgesloten += value
  }

  let totaalBox3Schulden = 0
  let totaalUitgeslotenSchulden = 0

  for (const dc of debtClassifications) {
    const balance = Number(dc.debt.current_balance)
    if (dc.inBox3) totaalBox3Schulden += balance
    else totaalUitgeslotenSchulden += balance
  }

  // Step 4: Schuldendrempel
  const schuldendrempel = input.hasPartner
    ? params.schuldendrempelPartner
    : params.schuldendrempelSingle

  // Step 5: Aftrekbare schulden
  const aftrekbareSchulden = Math.max(0, totaalBox3Schulden - schuldendrempel)

  // Step 6: Forfaitair rendement spaargeld
  const forfaitairSpaargeld = totaalSpaargeld * params.forfaitSpaargeld

  // Step 7: Forfaitair rendement beleggingen
  const forfaitairBeleggingen = totaalBeleggingen * params.forfaitBeleggingen

  // Step 8: Forfaitair rendement schulden
  const forfaitairSchulden = aftrekbareSchulden * params.forfaitSchulden

  // Step 9: Voordeel uit sparen en beleggen
  const voordeelUitSparen = forfaitairSpaargeld + forfaitairBeleggingen - forfaitairSchulden

  // Step 10: Rendementsgrondslag
  const totaalBox3Bezittingen = totaalSpaargeld + totaalBeleggingen
  const rendementsgrondslag = totaalBox3Bezittingen - aftrekbareSchulden

  // Step 11: Heffingsvrij vermogen
  const heffingsvrijVermogen = input.hasPartner
    ? params.heffingsvrijPartner
    : params.heffingsvrijSingle

  // Step 12: Grondslag sparen en beleggen
  const grondslagSparen = Math.max(0, rendementsgrondslag - heffingsvrijVermogen)

  // Step 13: Effectief rendement
  const effectiefRendement = rendementsgrondslag > 0
    ? voordeelUitSparen / rendementsgrondslag
    : 0

  // Step 14: Box 3 inkomen
  const box3Inkomen = grondslagSparen * effectiefRendement

  // Step 15: Belasting
  const belasting = box3Inkomen * params.tarief

  // Freedom metric
  const vrijheidsdagen = input.dailyExpenses > 0
    ? Math.round(belasting / input.dailyExpenses)
    : 0

  return {
    year: input.year,
    hasPartner: input.hasPartner,
    params,
    assetClassifications,
    debtClassifications,
    totaalSpaargeld,
    totaalBeleggingen,
    totaalUitgesloten,
    totaalBox3Schulden,
    totaalUitgeslotenSchulden,
    schuldendrempel,
    aftrekbareSchulden,
    forfaitairSpaargeld,
    forfaitairBeleggingen,
    forfaitairSchulden,
    voordeelUitSparen,
    rendementsgrondslag,
    heffingsvrijVermogen,
    grondslagSparen,
    effectiefRendement,
    box3Inkomen,
    belasting,
    vrijheidsdagen,
    dailyExpenses: input.dailyExpenses,
  }
}

// ── What-If: Shift between categories ────────────────────────

export function calculateBox3WithShift(
  input: Box3Input,
  shiftAmount: number, // positive = from beleggingen to spaargeld
): Box3Result {
  // Create modified input with shifted assets
  const modifiedAssets = input.assets.map(a => ({ ...a }))

  // Find first savings and first investment to shift between
  const savingsAsset = modifiedAssets.find(a => a.asset_type === 'savings' && a.is_active)
  const investmentAsset = modifiedAssets.find(a =>
    ['investment', 'real_estate', 'crypto', 'vehicle', 'physical', 'other'].includes(a.asset_type)
    && a.is_active,
  )

  if (savingsAsset && investmentAsset) {
    const maxShift = shiftAmount > 0
      ? Number(investmentAsset.current_value)
      : Number(savingsAsset.current_value)
    const clampedShift = Math.min(Math.abs(shiftAmount), maxShift) * Math.sign(shiftAmount)

    savingsAsset.current_value = Number(savingsAsset.current_value) + clampedShift
    investmentAsset.current_value = Number(investmentAsset.current_value) - clampedShift
  }

  return calculateBox3({ ...input, assets: modifiedAssets })
}

// ── Optimizations ────────────────────────────────────────────

export function generateBox3Optimizations(
  result: Box3Result,
  input: Box3Input,
): Box3Optimization[] {
  const tips: Box3Optimization[] = []

  // Tip 1: Shift from beleggingen to spaargeld (if beleggingen are significant)
  if (result.totaalBeleggingen > 10_000 && result.belasting > 0) {
    const shiftAmount = Math.min(result.totaalBeleggingen, 50_000)
    const shifted = calculateBox3WithShift(input, shiftAmount)
    const besparing = result.belasting - shifted.belasting
    if (besparing > 10) {
      tips.push({
        id: 'shift-to-savings',
        title: 'Verschuif naar spaargeld',
        description: `Door ${formatEur(shiftAmount)} van beleggingen naar spaargeld te verschuiven betaal je minder Box 3 belasting (lager forfait).`,
        besparing,
        vrijheidsdagen: input.dailyExpenses > 0 ? Math.round(besparing / input.dailyExpenses) : 0,
      })
    }
  }

  // Tip 2: Partner allocation (if no partner yet)
  if (!input.hasPartner && result.belasting > 0) {
    const partnerResult = calculateBox3({ ...input, hasPartner: true })
    const besparing = result.belasting - partnerResult.belasting
    if (besparing > 10) {
      tips.push({
        id: 'fiscaal-partner',
        title: 'Fiscaal partnerschap',
        description: `Met een fiscaal partner verdubbelt je heffingsvrij vermogen naar ${formatEur(result.params.heffingsvrijPartner)}.`,
        besparing,
        vrijheidsdagen: input.dailyExpenses > 0 ? Math.round(besparing / input.dailyExpenses) : 0,
      })
    }
  }

  // Tip 3: Schulden timing
  if (result.totaalBox3Schulden > 0 && result.aftrekbareSchulden === 0) {
    tips.push({
      id: 'schulden-timing',
      title: 'Schulden boven drempel',
      description: `Je Box 3 schulden (${formatEur(result.totaalBox3Schulden)}) vallen onder de drempel van ${formatEur(result.schuldendrempel)}. Ze tellen daarom niet mee als aftrek.`,
      besparing: 0,
      vrijheidsdagen: 0,
    })
  }

  // Tip 4: Groene beleggingen
  if (result.totaalBeleggingen > 20_000 && result.belasting > 0) {
    const groenVrijstelling = input.hasPartner ? 145_014 : 72_507
    tips.push({
      id: 'groene-beleggingen',
      title: 'Groene beleggingen',
      description: `Groene beleggingen (ASN Groenprojectenfonds e.d.) zijn tot ${formatEur(groenVrijstelling)} vrijgesteld van Box 3. Check of je beleggingen hiervoor in aanmerking komen.`,
      besparing: 0,
      vrijheidsdagen: 0,
    })
  }

  // Tip 5: Peildatum planning
  if (result.belasting > 100) {
    tips.push({
      id: 'peildatum-planning',
      title: 'Peildatum planning',
      description: 'Je Box 3 vermogen wordt gemeten op 1 januari. Grote aankopen net voor die datum verlagen tijdelijk je vermogen.',
      besparing: 0,
      vrijheidsdagen: 0,
    })
  }

  return tips
}

// ── Partner Allocation Optimization ──────────────────────────

function calculateSinglePartnerBox3(
  spaargeld: number,
  beleggingen: number,
  schulden: number,
  params: Box3Params,
): number {
  const aftrekbareSchulden = Math.max(0, schulden - params.schuldendrempelSingle)
  const forfaitS = spaargeld * params.forfaitSpaargeld
  const forfaitB = beleggingen * params.forfaitBeleggingen
  const forfaitSch = aftrekbareSchulden * params.forfaitSchulden
  const voordeel = forfaitS + forfaitB - forfaitSch
  const bezittingen = spaargeld + beleggingen
  const grondslag = bezittingen - aftrekbareSchulden
  const grondslagSparen = Math.max(0, grondslag - params.heffingsvrijSingle)
  const effectief = grondslag > 0 ? voordeel / grondslag : 0
  const inkomen = grondslagSparen * effectief
  return inkomen * params.tarief
}

export function optimizePartnerAllocation(
  result: Box3Result,
  input: Box3Input,
): PartnerAllocation {
  const params = BOX3_PARAMS[input.year]
  const totalS = result.totaalSpaargeld
  const totalB = result.totaalBeleggingen
  const totalSch = result.totaalBox3Schulden

  // Equal split baseline
  const equalTax =
    calculateSinglePartnerBox3(totalS / 2, totalB / 2, totalSch / 2, params) * 2

  // Try different allocations in 10% increments
  let bestTax = Infinity
  let bestAlloc: PartnerAllocation = {
    partner1Spaargeld: totalS / 2,
    partner1Beleggingen: totalB / 2,
    partner1Schulden: totalSch / 2,
    partner2Spaargeld: totalS / 2,
    partner2Beleggingen: totalB / 2,
    partner2Schulden: totalSch / 2,
    totalBelasting: equalTax,
    besparingVsGelijk: 0,
  }

  for (let pctS = 0; pctS <= 100; pctS += 5) {
    for (let pctB = 0; pctB <= 100; pctB += 5) {
      for (let pctSch = 0; pctSch <= 100; pctSch += 5) {
        const p1s = totalS * (pctS / 100)
        const p1b = totalB * (pctB / 100)
        const p1sch = totalSch * (pctSch / 100)
        const p2s = totalS - p1s
        const p2b = totalB - p1b
        const p2sch = totalSch - p1sch

        const tax =
          calculateSinglePartnerBox3(p1s, p1b, p1sch, params) +
          calculateSinglePartnerBox3(p2s, p2b, p2sch, params)

        if (tax < bestTax) {
          bestTax = tax
          bestAlloc = {
            partner1Spaargeld: Math.round(p1s),
            partner1Beleggingen: Math.round(p1b),
            partner1Schulden: Math.round(p1sch),
            partner2Spaargeld: Math.round(p2s),
            partner2Beleggingen: Math.round(p2b),
            partner2Schulden: Math.round(p2sch),
            totalBelasting: Math.round(tax),
            besparingVsGelijk: Math.round(equalTax - tax),
          }
        }
      }
    }
  }

  return bestAlloc
}

// ── Manual Partner Split ─────────────────────────────────────

export function calculatePartnerSplit(
  p1Spaargeld: number,
  p1Beleggingen: number,
  p1Schulden: number,
  p2Spaargeld: number,
  p2Beleggingen: number,
  p2Schulden: number,
  year: TaxYear,
): { partner1Tax: number; partner2Tax: number; totalTax: number } {
  const params = BOX3_PARAMS[year]
  const partner1Tax = calculateSinglePartnerBox3(p1Spaargeld, p1Beleggingen, p1Schulden, params)
  const partner2Tax = calculateSinglePartnerBox3(p2Spaargeld, p2Beleggingen, p2Schulden, params)
  return {
    partner1Tax: Math.round(partner1Tax),
    partner2Tax: Math.round(partner2Tax),
    totalTax: Math.round(partner1Tax + partner2Tax),
  }
}

// ── Horizon Integration ──────────────────────────────────────

export function estimateBox3TaxDrag(result: Box3Result): number {
  const totalBox3 = result.totaalSpaargeld + result.totaalBeleggingen
  if (totalBox3 <= 0) return 0
  return result.belasting / totalBox3
}

// ── Helpers ──────────────────────────────────────────────────

function formatEur(n: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}
