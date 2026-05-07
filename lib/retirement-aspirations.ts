/**
 * Retirement aspirations — pure datamodel + reken-functies voor de
 * "Zelf samenstellen"-flow op /horizon/uitgaven-na-pensioen.
 *
 * Doel: vertaal lifestyle-keuzes (reizen, auto, uit eten, hobby's, zorg,
 * familie, lifestyle-temperatuur) naar één jaarbedrag dat opgeslagen kan
 * worden in profiles.retirement_expense_custom_amount.
 *
 * Bedragen zijn gegrond in Nibud 2025 / 2026 referentiecijfers en bedoeld
 * als startpunt — gebruiker kan altijd bijstellen via per-categorie sliders.
 */

// ─── Reizen ──────────────────────────────────────────────────────
// Dagprijs p.p.; gebruiker bepaalt aantal weken via tier of custom.
export const TRAVEL_TIERS = [
  { id: 'home', label: 'Thuisblijver', sublabel: 'Een uitje af en toe', weeks: 1, dailyPp: 45 },
  { id: 'eu', label: 'Eén EU-vakantie', sublabel: '2 weken Europa', weeks: 2, dailyPp: 78 },
  { id: 'mixed', label: 'EU + ver weg', sublabel: '2 wk Europa + 2 wk ver', weeks: 4, dailyPp: 150 },
  { id: 'nomad', label: 'Veel onderweg', sublabel: '12+ weken per jaar', weeks: 12, dailyPp: 250 },
] as const

export type TravelTierId = (typeof TRAVEL_TIERS)[number]['id']

// ─── Auto & vervoer ──────────────────────────────────────────────
// Nibud autokosten 2025: kleine occasion ~€3.600/jr, middenklasse ~€7.200/jr,
// luxe (nieuwere auto / hogere km-stand) ~€10.000/jr. Geen auto = €600 OV-budget.
export const CAR_TIERS = [
  { id: 'none', label: 'Geen auto', sublabel: 'OV en fiets', yearly: 600 },
  { id: 'small', label: 'Kleine occasion', sublabel: 'Tweedehands miniklasse', yearly: 3600 },
  { id: 'mid', label: 'Middenklasse', sublabel: 'Comfortabel, niet nieuw', yearly: 7200 },
  { id: 'luxe', label: 'Nieuwere of luxe', sublabel: 'Vrijheid en comfort', yearly: 10000 },
] as const

export type CarTierId = (typeof CAR_TIERS)[number]['id']

// ─── Uit eten & cultuur ──────────────────────────────────────────
// Per-keer-prijzen p.p. — gebruiker zet aantal keer/maand via slider.
export const DINING_PER_PERSON = 60
export const CULTURE_PER_PERSON = 45

// ─── Zorg & comfort ──────────────────────────────────────────────
// NL 2025: basis = verplichte zorgverzekering + eigen risico ~€1.800/jr.
// Comfort = + aanvullend pakket + tandarts ~€2.700/jr.
// Ruim = + particulier comfort, fysio, alternatief ~€5.000/jr.
export const CARE_TIERS = [
  { id: 'basic', label: 'Basis', sublabel: 'Verplichte verzekering + eigen risico', yearly: 1800 },
  { id: 'comfort', label: 'Comfort', sublabel: 'Aanvullend pakket + tandarts', yearly: 2700 },
  { id: 'spacious', label: 'Ruim', sublabel: 'Particulier comfort, fysio, alternatief', yearly: 5000 },
] as const

export type CareTierId = (typeof CARE_TIERS)[number]['id']

// Reservering voor verzorgingstehuis-suppletie (gemiddeld over pensioenjaren).
// €800/mnd vanaf ~80 over ~10 jaar = €96k, gespreid over ~30 pensioenjaren ≈ €3.200/jr.
export const NURSING_TOPUP_YEARLY = 3200

// ─── Hobby's & dromen ────────────────────────────────────────────
// Suggested jaarbedragen — gebruiker kan bijstellen via slider per chip.
export const HOBBY_SUGGESTIONS = [
  { id: 'tuin', label: 'Tuinieren', suggested: 600 },
  { id: 'kunst', label: 'Kunst & creatief', suggested: 1200 },
  { id: 'muziek', label: 'Muziek', suggested: 800 },
  { id: 'sport', label: 'Sport', suggested: 1500 },
  { id: 'leren', label: 'Studie & leren', suggested: 2000 },
  { id: 'vrijwillig', label: 'Vrijwilligerswerk', suggested: 300 },
  { id: 'schrijven', label: 'Schrijven', suggested: 400 },
  { id: 'koken', label: 'Koken & wijn', suggested: 1500 },
  { id: 'cultuur', label: 'Reizen voor cultuur', suggested: 2500 },
  { id: 'project', label: 'Eigen project', suggested: 3000 },
] as const

export type HobbyId = (typeof HOBBY_SUGGESTIONS)[number]['id']

// ─── Lifestyle-temperatuur ───────────────────────────────────────
// Multiplier op base-totaal. Activeert mental-time-travel.
export const LIFESTYLE_MULTIPLIERS = {
  lean: 0.85,
  comfort: 1.0,
  gul: 1.15,
} as const

export type LifestyleId = keyof typeof LIFESTYLE_MULTIPLIERS

// Onverwachts-buffer (toggle binnen Lifestyle-temperatuur).
export const UNEXPECTED_BUFFER_PCT = 0.1

// ─── Antwoord-shape ──────────────────────────────────────────────

export interface AspirationAnswers {
  /** Aantal personen dat reist (1 = alleen, 2 = stel). Default 1. */
  travelersCount: number
  travel: TravelTierId
  /** Optionele override op het aantal weken — gebruikt aangepaste waarde i.p.v. tier-default. */
  travelCustomWeeks?: number | null
  car: CarTierId
  diningPerMonth: number
  culturePerMonth: number
  diningPersons: number
  /** Geselecteerde hobby's met (eventueel bijgestelde) jaarbedragen. */
  hobbies: { id: string; yearly: number }[]
  /** Eigen droom toegevoegd door gebruiker (free-text). */
  customDreams: { label: string; yearly: number }[]
  care: CareTierId
  nursingTopUp: boolean
  unexpectedBuffer: boolean
  lifestyle: LifestyleId
  /** Handmatige eindwaarde die de berekende `total` overschrijft. `null` = geen override. */
  manualOverride: number | null
}

export const DEFAULT_ASPIRATIONS: AspirationAnswers = {
  travelersCount: 1,
  travel: 'eu',
  travelCustomWeeks: null,
  car: 'small',
  diningPerMonth: 2,
  culturePerMonth: 1,
  diningPersons: 2,
  hobbies: [],
  customDreams: [],
  care: 'comfort',
  nursingTopUp: false,
  unexpectedBuffer: false,
  lifestyle: 'comfort',
  manualOverride: null,
}

// ─── Reken-functie ───────────────────────────────────────────────

export interface AspirationBreakdown {
  travel: number
  transport: number
  dining: number
  hobbies: number
  care: number
  /** Som van alle subtotalen, vóór lifestyle-multiplier en buffer. */
  base: number
  /** Lifestyle multiplier (0.85, 1.0 of 1.15). */
  multiplier: number
  /** Eindresultaat — afgerond op €100. */
  total: number
}

export function computeAspirationTotal(a: AspirationAnswers): AspirationBreakdown {
  // Reizen
  const travelTier = TRAVEL_TIERS.find(t => t.id === a.travel) ?? TRAVEL_TIERS[1]
  const weeks = a.travelCustomWeeks != null && a.travelCustomWeeks > 0
    ? a.travelCustomWeeks
    : travelTier.weeks
  const travel = weeks * 7 * travelTier.dailyPp * Math.max(1, a.travelersCount)

  // Vervoer
  const carTier = CAR_TIERS.find(t => t.id === a.car) ?? CAR_TIERS[1]
  const transport = carTier.yearly

  // Uit eten & cultuur
  const persons = Math.max(1, a.diningPersons)
  const dining =
    (a.diningPerMonth * DINING_PER_PERSON + a.culturePerMonth * CULTURE_PER_PERSON) * 12 * persons

  // Hobby's & dromen
  const hobbiesSum = a.hobbies.reduce((s, h) => s + Math.max(0, h.yearly), 0)
  const dreamsSum = a.customDreams.reduce((s, d) => s + Math.max(0, d.yearly), 0)
  const hobbies = hobbiesSum + dreamsSum

  // Zorg
  const careTier = CARE_TIERS.find(t => t.id === a.care) ?? CARE_TIERS[1]
  const care = careTier.yearly + (a.nursingTopUp ? NURSING_TOPUP_YEARLY : 0)

  const base = travel + transport + dining + hobbies + care

  const multiplier = LIFESTYLE_MULTIPLIERS[a.lifestyle] ?? 1.0
  const buffer = a.unexpectedBuffer ? 1 + UNEXPECTED_BUFFER_PCT : 1
  const rawTotal = base * multiplier * buffer

  // Afgerond op €100 voor "gevoelig" eindgetal.
  const total = Math.round(rawTotal / 100) * 100

  return {
    travel: Math.round(travel),
    transport: Math.round(transport),
    dining: Math.round(dining),
    hobbies: Math.round(hobbies),
    care: Math.round(care),
    base: Math.round(base),
    multiplier,
    total,
  }
}
