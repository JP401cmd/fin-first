/**
 * Box 1 inkomstenbelasting — pure calculation engine.
 *
 * Inkomen uit werk en woning (loon, eigen woning). No Supabase or React
 * dependency. Mirrors the pattern of box3-data.ts: a pure rekenmotor that
 * returns numbers; geld-formattering hoort in de UI (lib/format.ts), niet hier.
 *
 * Naming convention: officiële NL fiscale termen blijven Nederlands
 * (heffingskorting, arbeidskorting, eigenwoningforfait, schijf, Hillen).
 * Generieke termen Engels (tax, rate, income, year).
 *
 * ⚠️ ALLE bedragen/tarieven zijn configureerbaar per jaar via BOX1_PARAMS.
 * Veel knikpunten zijn "// indicatie — verifieer tegen Belastingdienst 2026":
 * de exacte afbouw-grenzen van heffingskortingen bepalen de "cliffs" in de
 * marginale-druk-curve en zijn met opzet als config geïsoleerd zodat ze
 * triviaal te corrigeren zijn zonder de rekenlogica aan te raken.
 */

// ── Types ────────────────────────────────────────────────────

export type Box1TaxYear = 2025 | 2026

/** Eén belastingschijf. tot=null betekent de bovenste (open) schijf. */
export interface Box1Schijf {
  tot: number | null
  tarief: number
}

/** Eén opbouw-punt van de arbeidskorting (piecewise lineaire opbouw). */
export interface ArbeidskortingPunt {
  vanaf: number
  tarief: number
}

export interface Box1Params {
  schijven: Box1Schijf[]
  /** AOW-gerechtigd: lager schijf-1 tarief (geen AOW-premie). */
  schijvenAow: Box1Schijf[]
  algemeneHeffingskorting: { max: number; afbouwStart: number; afbouwRate: number }
  arbeidskorting: {
    max: number
    opbouwPunten: ArbeidskortingPunt[]
    afbouwStart: number
    afbouwRate: number
  }
  iack: { max: number; drempelInkomen: number; opbouwRate: number }
  eigenwoningforfaitRate: number // 0.0035 (0,35% WOZ)
  hypotheekAftrekMaxTarief: number // 0.3756
  hillenPct: number // 0.718 (2026)
}

export interface Box1Input {
  grossYearlyIncome: number
  year: Box1TaxYear
  aow?: boolean
  wozValue?: number
  hypotheekRente?: number // jaarlijkse aftrekbare rente eigen woning
  heeftKinderenOnder12?: boolean // voor IACK (optioneel)
  dailyExpenses?: number // voor freedomDays
}

export interface Box1Result {
  year: Box1TaxYear
  grossYearlyIncome: number
  belastbaarInkomen: number // na eigenwoning-saldo
  eigenwoningforfait: number
  hypotheekrenteaftrek: number
  hillenAftrek: number
  eigenwoningSaldo: number // forfait - aftrek - hillen (kan negatief = aftrekpost)
  heffingVoorKortingen: number
  algemeneHeffingskorting: number
  arbeidskorting: number
  iack: number
  totaleHeffingskortingen: number
  tax: number // netto te betalen Box 1 (>= 0)
  effectiveRate: number // tax / grossYearlyIncome
  marginalRate: number // tarief over de volgende euro (incl. korting-afbouw)
  nettoBesteedbaar: number
  freedomDays: number
}

// ── Constants ────────────────────────────────────────────────

export const BOX1_PARAMS: Record<Box1TaxYear, Box1Params> = {
  2025: {
    // indicatie — verifieer tegen Belastingdienst 2025
    schijven: [
      { tot: 38_441, tarief: 0.3582 }, // schijf 1 (incl. premies volksverzekeringen)
      { tot: 76_817, tarief: 0.3748 }, // schijf 2
      { tot: null, tarief: 0.495 }, // schijf 3
    ],
    schijvenAow: [
      { tot: 38_441, tarief: 0.1792 }, // benadering — alleen belastingdeel, geen AOW-premie
      { tot: 76_817, tarief: 0.3748 },
      { tot: null, tarief: 0.495 },
    ],
    algemeneHeffingskorting: {
      max: 3_068, // indicatie 2025
      afbouwStart: 28_406, // indicatie — afbouw start rond minimumloon-grens
      afbouwRate: 0.06337,
    },
    arbeidskorting: {
      max: 5_599, // indicatie 2025
      // Piecewise opbouw (benadering van de officiële knikpunten).
      opbouwPunten: [
        { vanaf: 0, tarief: 0.08053 },
        { vanaf: 12_169, tarief: 0.30030 },
        { vanaf: 26_288, tarief: 0.02258 },
      ],
      afbouwStart: 39_957, // indicatie 2025
      afbouwRate: 0.0651,
    },
    iack: {
      max: 2_950, // indicatie 2025
      drempelInkomen: 6_145, // indicatie
      opbouwRate: 0.11450,
    },
    eigenwoningforfaitRate: 0.0035,
    hypotheekAftrekMaxTarief: 0.3748, // gelijk aan schijf 2 tarief 2025
    hillenPct: 0.7333, // indicatie — Wet Hillen 2025 ≈ 73,33%
  },
  2026: {
    schijven: [
      { tot: 38_883, tarief: 0.3575 }, // schijf 1 (incl. premies volksverzekeringen)
      { tot: 78_426, tarief: 0.3756 }, // schijf 2
      { tot: null, tarief: 0.495 }, // schijf 3
    ],
    schijvenAow: [
      // benadering — alleen belastingdeel (geen AOW-premie) in schijf 1
      { tot: 38_883, tarief: 0.197 },
      { tot: 78_426, tarief: 0.3756 },
      { tot: null, tarief: 0.495 },
    ],
    algemeneHeffingskorting: {
      max: 3_115, // indicatie — verifieer tegen Belastingdienst 2026
      afbouwStart: 28_406, // indicatie — verifieer tegen Belastingdienst 2026
      afbouwRate: 0.06337, // indicatie
    },
    arbeidskorting: {
      max: 5_685, // indicatie — verifieer tegen Belastingdienst 2026
      // Piecewise opbouw — gedocumenteerde benadering; exacte knikpunten = indicatie.
      // De drie opbouwtrajecten lopen tot ~de afbouwStart, daarna afbouw.
      opbouwPunten: [
        { vanaf: 0, tarief: 0.08231 }, // indicatie
        { vanaf: 12_465, tarief: 0.30030 }, // indicatie
        { vanaf: 26_940, tarief: 0.02258 }, // indicatie
      ],
      afbouwStart: 43_071, // indicatie — verifieer tegen Belastingdienst 2026
      afbouwRate: 0.0651, // indicatie
    },
    iack: {
      max: 2_986, // indicatie — verifieer tegen Belastingdienst 2026
      drempelInkomen: 6_145, // indicatie
      opbouwRate: 0.11450, // indicatie
    },
    eigenwoningforfaitRate: 0.0035, // 0,35% WOZ
    hypotheekAftrekMaxTarief: 0.3756, // max aftrektarief 2026
    hillenPct: 0.718, // Wet Hillen 2026 ≈ 71,8% (aftrek wanneer forfait > rente)
  },
}

export const BOX1_TOOLTIPS: Record<string, string> = {
  box1: 'Box 1 belast inkomen uit werk en je eigen woning, in oplopende schijven.',
  schijven: 'Je inkomen wordt in schijven belast: over elke schijf geldt een eigen tarief. Alleen het deel binnen een schijf wordt tegen dat tarief belast.',
  algemeneHeffingskorting: 'Een korting op je belasting die iedereen krijgt. Bij hogere inkomens bouwt deze geleidelijk af tot nul.',
  arbeidskorting: 'Een extra korting omdat je werkt. Hij loopt eerst op met je inkomen en bouwt daarna weer af.',
  iack: 'Inkomensafhankelijke combinatiekorting — extra korting voor werkende ouders met een kind onder de 12.',
  eigenwoningforfait: 'Een bijtelling bij je inkomen voor het woongenot van je eigen huis: een percentage van de WOZ-waarde.',
  hypotheekrenteaftrek: 'De rente op je hypotheek mag je aftrekken, maar tegen een gemaximeerd tarief.',
  hillen: 'Wet Hillen: heb je weinig of geen aftrekbare rente, dan krijg je een extra aftrek zodat je per saldo weinig of niets bijtelt voor je eigen woning. Deze regeling wordt jaarlijks afgebouwd.',
  aowTarief: 'AOW-gerechtigden betalen geen AOW-premie meer, waardoor het tarief in de eerste schijf flink lager is.',
  marginaalTarief: 'Het tarief dat je betaalt over je volgende verdiende euro — inclusief het effect van afbouwende heffingskortingen.',
}

// ── Helpers: schijven-berekening ─────────────────────────────

/** Belasting (vóór heffingskortingen) over een belastbaar inkomen, gegeven de schijven. */
function taxOverSchijven(belastbaarInkomen: number, schijven: Box1Schijf[]): number {
  if (belastbaarInkomen <= 0) return 0
  let tax = 0
  let ondergrens = 0
  for (const schijf of schijven) {
    const bovengrens = schijf.tot ?? Infinity
    if (belastbaarInkomen <= ondergrens) break
    const deel = Math.min(belastbaarInkomen, bovengrens) - ondergrens
    if (deel > 0) tax += deel * schijf.tarief
    ondergrens = bovengrens
  }
  return tax
}

/** Het schijftarief dat geldt op een gegeven inkomensniveau (de volgende euro). */
function schijftariefBij(income: number, schijven: Box1Schijf[]): number {
  for (const schijf of schijven) {
    const bovengrens = schijf.tot ?? Infinity
    if (income < bovengrens) return schijf.tarief
  }
  // Fallback: bovenste schijf
  return schijven[schijven.length - 1]?.tarief ?? 0
}

// ── Helpers: heffingskortingen ───────────────────────────────

/** Algemene heffingskorting bij een gegeven (belastbaar) inkomen. */
function computeAlgemeneHeffingskorting(
  belastbaarInkomen: number,
  p: Box1Params['algemeneHeffingskorting'],
): number {
  if (belastbaarInkomen <= p.afbouwStart) return p.max
  const afbouw = (belastbaarInkomen - p.afbouwStart) * p.afbouwRate
  return Math.max(0, p.max - afbouw)
}

/**
 * Arbeidskorting bij een gegeven inkomen (piecewise opbouw, dan afbouw).
 * De opbouw is een lineaire benadering tussen de opbouwpunten; het resultaat
 * wordt geclampt op `max`. Boven `afbouwStart` bouwt de korting af naar 0.
 */
function computeArbeidskorting(
  income: number,
  p: Box1Params['arbeidskorting'],
): number {
  if (income <= 0) return 0

  // Opbouw-fase: sommeer per traject tot aan afbouwStart of inkomen.
  const opbouwEind = Math.min(income, p.afbouwStart)
  let korting = 0
  const punten = p.opbouwPunten
  for (let i = 0; i < punten.length; i++) {
    const vanaf = punten[i].vanaf
    if (opbouwEind <= vanaf) break
    const volgende = i + 1 < punten.length ? punten[i + 1].vanaf : Infinity
    const trajectEind = Math.min(opbouwEind, volgende)
    const deel = trajectEind - vanaf
    if (deel > 0) korting += deel * punten[i].tarief
  }
  korting = Math.min(korting, p.max)

  // Afbouw-fase
  if (income > p.afbouwStart) {
    const afbouw = (income - p.afbouwStart) * p.afbouwRate
    korting = Math.max(0, korting - afbouw)
  }

  return korting
}

/** Inkomensafhankelijke combinatiekorting (IACK). Alleen bij kind < 12. */
function computeIack(
  income: number,
  heeftKinderen: boolean,
  p: Box1Params['iack'],
): number {
  if (!heeftKinderen) return 0
  if (income <= p.drempelInkomen) return 0
  const opbouw = (income - p.drempelInkomen) * p.opbouwRate
  return Math.min(p.max, opbouw)
}

// ── Eigen woning ─────────────────────────────────────────────

interface EigenWoningResult {
  eigenwoningforfait: number
  hypotheekrenteaftrek: number
  hillenAftrek: number
  eigenwoningSaldo: number
}

function computeEigenWoning(input: Box1Input, params: Box1Params): EigenWoningResult {
  const woz = input.wozValue ?? 0
  const rente = input.hypotheekRente ?? 0

  const eigenwoningforfait = woz > 0 ? woz * params.eigenwoningforfaitRate : 0
  const hypotheekrenteaftrek = rente

  // Wet Hillen: extra aftrek wanneer forfait > rente (positief saldo vóór Hillen).
  const saldoVoorHillen = eigenwoningforfait - hypotheekrenteaftrek
  const hillenAftrek = saldoVoorHillen > 0 ? saldoVoorHillen * params.hillenPct : 0

  const eigenwoningSaldo = saldoVoorHillen - hillenAftrek

  return { eigenwoningforfait, hypotheekrenteaftrek, hillenAftrek, eigenwoningSaldo }
}

// ── Core Calculation ─────────────────────────────────────────

/**
 * Berekent alle Box 1-velden BEHALVE marginalRate. Apart gehouden zodat
 * marginalRateAt deze core twee keer kan aanroepen (income en income+1)
 * zonder oneindige recursie via computeBox1Tax → marginalRateAt → ...
 */
function computeBox1Core(input: Box1Input): Omit<Box1Result, 'marginalRate'> {
  const params = BOX1_PARAMS[input.year]
  const aow = input.aow ?? false
  const schijven = aow ? params.schijvenAow : params.schijven
  const gross = Math.max(0, input.grossYearlyIncome)

  // Stap 1: Eigen woning saldo (kan negatief = aftrekpost)
  const ew = computeEigenWoning(input, params)

  // Stap 2: Belastbaar inkomen = bruto + eigenwoning-saldo (saldo is meestal negatief)
  const belastbaarInkomen = Math.max(0, gross + ew.eigenwoningSaldo)

  // Stap 3: Heffing vóór kortingen
  const heffingVoorKortingen = taxOverSchijven(belastbaarInkomen, schijven)

  // Stap 4: Heffingskortingen
  // Arbeidskorting wordt over arbeidsinkomen berekend (hier: bruto inkomen).
  const algemeneHeffingskorting = computeAlgemeneHeffingskorting(
    belastbaarInkomen,
    params.algemeneHeffingskorting,
  )
  const arbeidskorting = computeArbeidskorting(gross, params.arbeidskorting)
  const iack = computeIack(gross, input.heeftKinderenOnder12 ?? false, params.iack)

  // Heffingskortingen kunnen de heffing niet onder nul brengen.
  const totaleHeffingskortingenRaw = algemeneHeffingskorting + arbeidskorting + iack
  const totaleHeffingskortingen = Math.min(totaleHeffingskortingenRaw, heffingVoorKortingen)

  // Stap 5: Netto te betalen (>= 0)
  const tax = Math.max(0, heffingVoorKortingen - totaleHeffingskortingen)

  // Stap 6: Afgeleide ratio's
  const effectiveRate = gross > 0 ? tax / gross : 0
  const nettoBesteedbaar = gross - tax

  // Freedom metric
  const dailyExpenses = input.dailyExpenses ?? 0
  const freedomDays = dailyExpenses > 0 ? Math.round(tax / dailyExpenses) : 0

  return {
    year: input.year,
    grossYearlyIncome: gross,
    belastbaarInkomen,
    eigenwoningforfait: ew.eigenwoningforfait,
    hypotheekrenteaftrek: ew.hypotheekrenteaftrek,
    hillenAftrek: ew.hillenAftrek,
    eigenwoningSaldo: ew.eigenwoningSaldo,
    heffingVoorKortingen,
    algemeneHeffingskorting,
    arbeidskorting,
    iack,
    totaleHeffingskortingen,
    tax,
    effectiveRate,
    nettoBesteedbaar,
    freedomDays,
  }
}

export function computeBox1Tax(input: Box1Input): Box1Result {
  const core = computeBox1Core(input)
  const marginalRate = marginalRateAt(core.grossYearlyIncome, input.year, input.aow)
  return { ...core, marginalRate }
}

// ── Marginal & effective rate helpers ────────────────────────

/**
 * Marginaal tarief op een inkomensniveau: het effectieve tarief over +€1.
 *
 * = schijftarief op dat inkomen
 *   + extra afbouw van algemene heffingskorting (waar van toepassing)
 *   + extra afbouw van arbeidskorting (waar van toepassing).
 *
 * De korting-afbouw verhoogt het marginale tarief in de afbouw-zones — dit
 * voedt de marginale-druk-curve, dus de afbouw-zones moeten de curve omhoog
 * duwen. Berekend als numerieke afgeleide (tax(income+1) − tax(income)) zodat
 * álle effecten (schijfgrenzen, beide kortingen) consistent worden meegenomen.
 */
export function marginalRateAt(income: number, year: Box1TaxYear, aow?: boolean): number {
  if (income < 0) return 0
  const lo = computeBox1Core({ grossYearlyIncome: income, year, aow })
  const hi = computeBox1Core({ grossYearlyIncome: income + 1, year, aow })
  return hi.tax - lo.tax
}

/** Gemiddeld (effectief) tarief op een inkomensniveau: tax / income. */
export function effectiveRateAt(income: number, year: Box1TaxYear, aow?: boolean): number {
  if (income <= 0) return 0
  const r = computeBox1Tax({ grossYearlyIncome: income, year, aow })
  return r.tax / income
}

// Re-export voor consumenten die het pure schijf-tarief willen (zonder afbouw).
export function schijftariefOp(income: number, year: Box1TaxYear, aow?: boolean): number {
  const params = BOX1_PARAMS[year]
  const schijven = aow ? params.schijvenAow : params.schijven
  return schijftariefBij(income, schijven)
}
