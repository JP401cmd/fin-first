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
  note: string | null
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

/**
 * Box 3 calculation result.
 *
 * Naming convention: Dutch Box 3 tax-specific terms (forfaitairSpaargeld,
 * heffingsvrijVermogen, rendementsgrondslag, schuldendrempel, etc.) retain
 * Dutch naming as official legal terminology. Generic financial terms use
 * English (tax, savings, freedomDays, box3Income).
 */
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

  // Calculation steps (Dutch tax terms — see naming convention above)
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
  box3Income: number
  tax: number

  // Freedom metric
  freedomDays: number
  dailyExpenses: number
}

export interface Box3Optimization {
  id: string
  title: string
  description: string
  savings: number
  freedomDays: number
}

export interface PartnerAllocation {
  partner1Spaargeld: number
  partner1Beleggingen: number
  partner1Schulden: number
  partner2Spaargeld: number
  partner2Beleggingen: number
  partner2Schulden: number
  totalTax: number
  savingsVsEqual: number
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

/**
 * Het lopende/actieve belastingjaar — de enige plek waar "welk jaar is nu
 * actueel" wordt vastgelegd. UI-defaults (jaar-toggle, glossary/guide-teksten)
 * én de NL-FIRE-afgeleiden in lib/constants.ts (NL_FICTIEF_BELEGGINGEN →
 * BOX3_DRAG/NL_SWR/NL_MULTIPLIER) lezen hun jaarwaarden uit
 * BOX3_PARAMS[CURRENT_TAX_YEAR]. Bump dit zodra een nieuw jaar aan BOX3_PARAMS
 * is toegevoegd; alle afgeleiden en oppervlakken schuiven dan automatisch mee.
 */
export const CURRENT_TAX_YEAR: TaxYear = 2026

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
  vorderingDGA: 'De vordering op uw BV valt in Box 3, het aanmerkelijk belang zelf in Box 2.',
  levensverzekering: 'Polissen van vóór 2001 kunnen onder overgangsrecht vrijgesteld zijn. Raadpleeg uw verzekeraar of belastingadviseur.',
}

// ── Classification ───────────────────────────────────────────

/**
 * Uitsluitingsredenen — de tekst die het scherm bij een niet-Box 3-post toont.
 * Benoemde constanten (geen inline literals) zodat UI, tests en de
 * Berekeningen-catalogus dezelfde bron citeren.
 */
export const BOX3_UITSLUITING_REDENEN = {
  eigenHuis: 'Eigen woning valt onder Box 1',
  pensioenFiscaal: 'Pensioen met fiscaal voordeel (Box 1)',
  pensioenAangenomen: 'Pensioenaanspraak — belast bij uitkering (Box 1)',
  deelneming: 'Aanmerkelijk belang — belast in Box 2',
  roerendEigenGebruik: 'Roerende zaak voor eigen gebruik — vrijgesteld in Box 3',
  handmatigVrijgesteld: 'Handmatig gemarkeerd als vrijgesteld',
  onbekendType: 'Onbekend type — niet ingedeeld in Box 3',
  eigenwoningHypotheek: 'Hypotheek eigen woning (Box 1)',
  belastingschuld: 'Belastingschuld is niet aftrekbaar in Box 3',
} as const

/**
 * Toelichtingen bij een classificatie die de gebruiker zélf moet natrekken.
 * Bewust zónder euro-bedragen: een bedrag hoort in `BOX3_PARAMS[jaar]` en zou
 * hier jaar-blind worden (dezelfde valkuil als de groen-vrijstelling).
 */
export const BOX3_CLASSIFICATIE_NOTITIES = {
  pensioenZonderVlag:
    'Aangenomen dat dit een fiscaal gefaciliteerde pensioenaanspraak is (Box 1). Is het een gewone spaar- of beleggingspot? Markeer hem dan als niet-vrijgesteld.',
  roerendMogelijkBelegging:
    'Vrijgesteld als je dit voor eigen gebruik houdt. Houd je het hoofdzakelijk als belegging, markeer het dan als niet-vrijgesteld.',
  physicalTerBelegging:
    'Kunst en verzamelingen tellen mee in Box 3 zodra je ze hoofdzakelijk als belegging houdt. Is dit puur voor eigen gebruik? Markeer het dan als vrijgesteld.',
  overigeZaak:
    'Conservatief in Box 3 geteld. Is dit een roerende zaak voor eigen gebruik (denk aan een boot of caravan)? Markeer hem dan als vrijgesteld.',
  uitvaartverzekering:
    'Een uitvaartverzekering is tot een wettelijk maximum vrijgesteld. Controleer je polis en markeer hem zo nodig als vrijgesteld.',
  onbekendType:
    'Dit type herkennen we niet, dus we rekenen er geen Box 3-heffing over. Kies een passend type of markeer de bezitting als niet-vrijgesteld.',
} as const

export interface Box3AssetClassificationResult {
  category: Box3Category
  exclusionReason: string | null
  note: string | null
}

/** `physical`-subtypes die je hoofdzakelijk ter belegging houdt → wél Box 3. */
const PHYSICAL_BELEGGING_SUBTYPES: ReadonlySet<string> = new Set(['kunst', 'verzameling'])

/**
 * Type-/subtype-afleiding van de Box 3-indeling. Bewust een EXHAUSTIEVE switch
 * over `AssetType`: de oude `if`-keten eindigde op een fall-through
 * ("alles overige is een belegging"), waardoor roerende zaken voor eigen gebruik
 * (auto, sieraden, inboedel, boot) stilzwijgend op het beleggingsforfait van 6%
 * landden terwijl art. 5.3 lid 2 Wet IB 2001 ze juist buiten de grondslag houdt.
 * Met de `never`-afsluiter geeft een nieuw `AssetType` een compile-fout in plaats
 * van een stille fiscale aanname.
 */
function classifyAssetByType(asset: Asset): Box3AssetClassificationResult {
  const type = asset.asset_type as AssetType
  const subtype = asset.subtype ?? null

  switch (type) {
    // ── Box 3: spaargeld (laag forfait) ──
    case 'cash':
    case 'savings':
      return { category: 'spaargeld', exclusionReason: null, note: null }

    // ── Box 3: overige bezittingen (hoog forfait) ──
    case 'investment':
    case 'crypto':
    case 'real_estate':
    case 'vordering':
      return { category: 'beleggingen', exclusionReason: null, note: null }

    // ── Buiten Box 3 ──
    case 'eigen_huis':
      return { category: null, exclusionReason: BOX3_UITSLUITING_REDENEN.eigenHuis, note: null }

    case 'deelneming':
      return { category: null, exclusionReason: BOX3_UITSLUITING_REDENEN.deelneming, note: null }

    case 'retirement':
      // Een als "Pensioen" geregistreerde aanspraak is fiscaal gefaciliteerd en
      // wordt bij uitkering in Box 1 belast — álle drie de subtypes
      // (uitkeringsregeling/premieregeling/lijfrente) zijn Box 1-producten.
      // Voorheen hing dit volledig aan de losse `tax_benefit`-vink, die in het
      // formulier op `false` staat tot de gebruiker hem aanraakt; een pensioen
      // zónder vinkje kwam daardoor volledig op het 6%-forfait terecht (op
      // €200.000 pensioenvermogen ruim €4.000 fantoomheffing per jaar).
      return {
        category: null,
        exclusionReason: asset.tax_benefit
          ? BOX3_UITSLUITING_REDENEN.pensioenFiscaal
          : BOX3_UITSLUITING_REDENEN.pensioenAangenomen,
        note: asset.tax_benefit ? null : BOX3_CLASSIFICATIE_NOTITIES.pensioenZonderVlag,
      }

    case 'vehicle':
      // Auto/motor/camper: roerende zaak voor eigen gebruik → art. 5.3 lid 2.
      return {
        category: null,
        exclusionReason: BOX3_UITSLUITING_REDENEN.roerendEigenGebruik,
        note: BOX3_CLASSIFICATIE_NOTITIES.roerendMogelijkBelegging,
      }

    case 'physical':
      // Sieraden/inboedel (en een niet nader bepaalde fysieke bezitting) zijn
      // roerende zaken voor eigen gebruik. Kunst en verzamelingen houd je
      // vaker hoofdzakelijk ter belegging → die blijven in Box 3.
      if (subtype && PHYSICAL_BELEGGING_SUBTYPES.has(subtype)) {
        return {
          category: 'beleggingen',
          exclusionReason: null,
          note: BOX3_CLASSIFICATIE_NOTITIES.physicalTerBelegging,
        }
      }
      return {
        category: null,
        exclusionReason: BOX3_UITSLUITING_REDENEN.roerendEigenGebruik,
        note: BOX3_CLASSIFICATIE_NOTITIES.roerendMogelijkBelegging,
      }

    case 'levensverzekering':
      // Conservatief in Box 3: de vrijstellingen (overgangsrecht kapitaal-
      // verzekering, gemaximeerde uitvaartverzekering) hangen aan de polis,
      // niet aan het type. De toelichting maakt dat nu zichtbaar i.p.v. hem
      // te berekenen en weg te gooien.
      return {
        category: 'beleggingen',
        exclusionReason: null,
        note: subtype === 'uitvaartverzekering'
          ? BOX3_CLASSIFICATIE_NOTITIES.uitvaartverzekering
          : BOX3_TOOLTIPS.levensverzekering,
      }

    case 'other':
      // Echte restcategorie — kan van alles zijn. Blijft conservatief in Box 3,
      // maar zegt er nu bij dat een roerende zaak voor eigen gebruik hier niet
      // hoort.
      return {
        category: 'beleggingen',
        exclusionReason: null,
        note: BOX3_CLASSIFICATIE_NOTITIES.overigeZaak,
      }

    default: {
      // COMPILE-TIJD: een nieuw lid van `AssetType` geeft hier een fout, zodat
      // niemand een assettype kan toevoegen zonder de fiscale vraag te
      // beantwoorden. Dat was precies het gat in de oude `if`-keten.
      const exhaustive: never = type
      void exhaustive
      // RUNTIME: `assets.asset_type` is een vrije tekstkolom, dus een waarde
      // buiten de union is mogelijk (oude import, handmatige rij). Die telt NIET
      // mee: een onbekend type een forfait van 6% opleggen is een verzonnen
      // heffing, en dat is exact de fout die deze functie repareert. Hij wordt
      // wél zichtbaar in de indelingslijst, met deze reden erbij.
      return {
        category: null,
        exclusionReason: BOX3_UITSLUITING_REDENEN.onbekendType,
        note: BOX3_CLASSIFICATIE_NOTITIES.onbekendType,
      }
    }
  }
}

/**
 * Box 3-indeling van één bezitting: spaargeld, belegging, of buiten Box 3.
 *
 * Twee lagen, in deze volgorde:
 *  1. `assets.box3_vrijgesteld` — de expliciete gebruikers-OVERSCHRIJVING. Niet
 *     ingevuld (`null`) is de normale stand; `true`/`false` wint altijd van de
 *     afleiding. Zo kan een gebruiker een boot vrijstellen of een "pensioen"
 *     dat in werkelijkheid een gewone beleggingspot is terugzetten in Box 3,
 *     zonder dat we per bezitting een volledige box-keuze hoeven op te slaan
 *     (box 1/box 2 zijn al afleidbaar uit `eigen_huis`/`deelneming`).
 *  2. `classifyAssetByType` — de afleiding uit type + subtype.
 */
export function classifyAsset(asset: Asset): Box3AssetClassificationResult {
  const override = asset.box3_vrijgesteld
  if (override === true) {
    return {
      category: null,
      exclusionReason: asset.box3_vrijstelling_reden?.trim()
        || BOX3_UITSLUITING_REDENEN.handmatigVrijgesteld,
      note: null,
    }
  }
  if (override === false) {
    // Expliciet NIET vrijgesteld: hij hoort in Box 3. Het lage spaarforfait
    // blijft gelden voor spaar-/cash-typen; al het andere valt onder het
    // beleggingsforfait.
    const derived = classifyAssetByType(asset)
    return {
      category: derived.category === 'spaargeld' ? 'spaargeld' : 'beleggingen',
      exclusionReason: null,
      note: asset.box3_vrijstelling_reden?.trim() || null,
    }
  }
  return classifyAssetByType(asset)
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
    return { inBox3: false, exclusionReason: BOX3_UITSLUITING_REDENEN.eigenwoningHypotheek }
  }

  // Belastingschulden zijn wettelijk UITGESLOTEN van aftrek in Box 3
  // (art. 5.3 lid 3 onder b Wet IB 2001). Alleen een erfbelastingschuld is de
  // uitzondering, en die kent dit datamodel niet als apart subtype — alle vijf
  // de `belastingschuld`-subtypes (inkomstenbelasting, voorlopige aanslag,
  // box3-nabetaling, btw, overig) vallen dus onder de uitsluiting. Voorheen
  // trok de motor ze wél af, waardoor de heffing te LAAG uitkwam — de enige
  // fout in deze reeks die de andere kant op wijst.
  if (debt.debt_type === 'belastingschuld') {
    return { inBox3: false, exclusionReason: BOX3_UITSLUITING_REDENEN.belastingschuld }
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
    const { category, exclusionReason, note } = classifyAsset(asset)
    return { asset, category, exclusionReason, note }
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

  // Step 14: Box 3 income
  const box3Income = grondslagSparen * effectiefRendement

  // Step 15: Tax
  const tax = box3Income * params.tarief

  // Freedom metric
  const freedomDays = input.dailyExpenses > 0
    ? Math.round(tax / input.dailyExpenses)
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
    box3Income,
    tax,
    freedomDays,
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
  if (result.totaalBeleggingen > 10_000 && result.tax > 0) {
    const shiftAmount = Math.min(result.totaalBeleggingen, 50_000)
    const shifted = calculateBox3WithShift(input, shiftAmount)
    const savings = result.tax - shifted.tax
    if (savings > 10) {
      tips.push({
        id: 'shift-to-savings',
        title: 'Verschuif naar spaargeld',
        description: `Door ${formatEur(shiftAmount)} van beleggingen naar spaargeld te verschuiven betaal je minder Box 3 belasting (lager forfait).`,
        savings,
        freedomDays: input.dailyExpenses > 0 ? Math.round(savings / input.dailyExpenses) : 0,
      })
    }
  }

  // Tip 2: Partner allocation (if no partner yet)
  if (!input.hasPartner && result.tax > 0) {
    const partnerResult = calculateBox3({ ...input, hasPartner: true })
    const savings = result.tax - partnerResult.tax
    if (savings > 10) {
      tips.push({
        id: 'fiscaal-partner',
        title: 'Fiscaal partnerschap',
        description: `Met een fiscaal partner verdubbelt je heffingsvrij vermogen naar ${formatEur(result.params.heffingsvrijPartner)}.`,
        savings,
        freedomDays: input.dailyExpenses > 0 ? Math.round(savings / input.dailyExpenses) : 0,
      })
    }
  }

  // Tip 3: Schulden timing
  if (result.totaalBox3Schulden > 0 && result.aftrekbareSchulden === 0) {
    tips.push({
      id: 'schulden-timing',
      title: 'Schulden boven drempel',
      description: `Je Box 3 schulden (${formatEur(result.totaalBox3Schulden)}) vallen onder de drempel van ${formatEur(result.schuldendrempel)}. Ze tellen daarom niet mee als aftrek.`,
      savings: 0,
      freedomDays: 0,
    })
  }

  // Tip 4: Groene beleggingen
  if (result.totaalBeleggingen > 20_000 && result.tax > 0) {
    // 2026-vrijstelling: € 26.715 p.p. / € 53.430 fiscale partners (laatste
    // aantrekkelijke jaar). De regeling bouwt sterk af: in 2027 resteert nog
    // slechts ± € 200 p.p. en per 2028 vervalt de vrijstelling volledig.
    const groenVrijstelling = input.hasPartner ? 53_430 : 26_715
    tips.push({
      id: 'groene-beleggingen',
      title: 'Groene beleggingen',
      description: `Groene beleggingen (ASN Groenprojectenfonds e.d.) zijn in 2026 tot ${formatEur(groenVrijstelling)} vrijgesteld van Box 3 — plus een kleine heffingskorting. Let op: dit is het laatste gunstige jaar. In 2027 daalt de vrijstelling naar circa € 200 en per 2028 vervalt de regeling. Check of je beleggingen hiervoor in aanmerking komen.`,
      savings: 0,
      freedomDays: 0,
    })
  }

  // Tip 5: Peildatum planning
  if (result.tax > 100) {
    tips.push({
      id: 'peildatum-planning',
      title: 'Peildatum planning',
      description: 'Je Box 3 vermogen wordt gemeten op 1 januari. Grote aankopen net voor die datum verlagen tijdelijk je vermogen.',
      savings: 0,
      freedomDays: 0,
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
    totalTax: equalTax,
    savingsVsEqual: 0,
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
            totalTax: Math.round(tax),
            savingsVsEqual: Math.round(equalTax - tax),
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
  return result.tax / totalBox3
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
