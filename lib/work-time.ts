/**
 * WERKTIJD — de canonieke "welk deel van je werkjaar gaat hier naartoe"-conversie.
 *
 * ── Waarom deze module bestaat (ADR 0105) ───────────────────────────────────
 * De app kende tot nu toe één tijd-metafoor: VRIJHEIDSTIJD (`calculateFreedomTime`
 * in lib/format.ts), waarin een bedrag door het UITGAVEN-dagtarief wordt gedeeld
 * — "hoeveel dagen van mijn levensstijl koopt dit bedrag". Dat is en blijft de
 * grondfilosofie van de app.
 *
 * Twee oppervlakken gebruikten dat getal echter met WERKTIJD-taal ("die je werkt
 * om te betalen", "per jaar opgeofferd aan belasting"). Vrijheidstijd-getallen
 * zijn NIET optelbaar tot een werkjaar: het zijn onafhankelijke aandelen van de
 * uitgaven, niet delen van dezelfde taart. Daardoor claimden /overzicht/belasting
 * ("9 maanden per jaar") en /overzicht/cashflow/vaste-lasten ("9 maanden") samen
 * ACHTTIEN maanden per jaar — naast een effectief tarief van 36,6% op dezelfde
 * kaart. Bevinding C5 van het UX-testpanel (24-08-2026).
 *
 * ── De regel ────────────────────────────────────────────────────────────────
 * Werktijd deelt door het BRUTO DAGELIJKS INKOMEN (`lib/income-rate.ts`), nooit
 * door het uitgaven-dagtarief. Omdat álle werktijd-claims op DEZELFDE noemer
 * delen (het bruto jaarinkomen = het volledige werkjaar), zijn ze per constructie
 * delen van één taart: hun som kan het werkjaar alleen overschrijden wanneer de
 * bedragen samen het bruto jaarinkomen overschrijden — en dát is dan een echt
 * signaal (`exceedsWorkYear`), geen rekenfout.
 *
 * Bruto en niet netto: belasting wordt uit het BRUTO inkomen betaald. Met netto
 * als noemer telt de belastingclaim tegen een taart waar hij zelf al uit is
 * gehaald, en kan "belasting + vaste lasten" opnieuw boven de twaalf maanden
 * uitkomen (op de PDF-cijfers: 6,9 + 7,0 = 13,9 maanden). Zie ADR 0105.
 *
 * PUUR EN CLIENT-VEILIG: geen React, geen Supabase, geen loaders — deze module
 * wordt door client-componenten geïmporteerd. De BRON van het dagtarief zit in
 * lib/income-rate.ts (server), precies zoals lib/format.ts (conversie) en
 * lib/expense-rate.ts (bron) dat voor vrijheidstijd doen.
 */
import {
  DAYS_PER_YEAR,
  WORK_YEAR_MONTHS,
  WORK_TIME_DISPLAY_MAX_MONTHS,
} from '@/lib/constants'

/** Guard tegen NaN/undefined/Infinity — 0 voor elke niet-eindige invoer. */
function safeNumber(value: unknown): number {
  if (value == null || typeof value !== 'number' || !isFinite(value)) return 0
  return value
}

export interface WorkTimeBreakdown {
  /** Werkdagen: jaarbedrag / bruto dagelijks inkomen. ONGEKNIPT. */
  workDays: number
  /** Aandeel van het werkjaar (jaarbedrag / bruto jaarinkomen). ONGEKNIPT. */
  shareOfWorkYear: number
  /**
   * Maanden per werkjaar op 1 decimaal — hét getal in de copy ("4,4 van de 12
   * maanden"). Geknipt op WORK_TIME_DISPLAY_MAX_MONTHS; `exceedsWorkYear` blijft
   * het eerlijke signaal wanneer de claim het hele werkjaar overschrijdt.
   */
  monthsPerYear: number
  /** False = geen eerlijke werkjaar-noemer (bruto inkomen onbekend of 0). */
  hasBasis: boolean
  /** Bedrag beslaat méér dan een heel werkjaar — alarm, geen afkap. */
  exceedsWorkYear: boolean
}

/** Neutrale uitkomst: geen basis, geen claim. */
export const EMPTY_WORK_TIME: WorkTimeBreakdown = {
  workDays: 0,
  shareOfWorkYear: 0,
  monthsPerYear: 0,
  hasBasis: false,
  exceedsWorkYear: false,
}

/**
 * Zet een JAARBEDRAG om naar werktijd.
 *
 * SCHAAL-CONVENTIE (hard): `yearlyAmount` is een JAARbedrag en `dailyIncome` een
 * BRUTO €/dag uit `lib/income-rate.ts`. Een maandbedrag hier invoeren geeft een
 * twaalfde van de werkelijke werktijd zonder dat iets faalt — vermenigvuldig dus
 * expliciet bij de aanroeper (`totalMonthly * 12`), zoals de uitgaven-kant dat
 * ook doet.
 *
 * @param yearlyAmount - Bedrag per jaar in EUR (negatief/0 → geen claim).
 * @param dailyIncome - Bruto dagelijks inkomen in EUR (≤ 0 → geen basis).
 */
export function calculateWorkTime(yearlyAmount: number, dailyIncome: number): WorkTimeBreakdown {
  const amount = safeNumber(yearlyAmount)
  const rate = safeNumber(dailyIncome)

  if (rate <= 0) return EMPTY_WORK_TIME
  if (amount <= 0) return { ...EMPTY_WORK_TIME, hasBasis: true }

  const workDays = amount / rate
  const shareOfWorkYear = workDays / DAYS_PER_YEAR
  const rawMonths = shareOfWorkYear * WORK_YEAR_MONTHS

  return {
    workDays,
    shareOfWorkYear,
    monthsPerYear: Math.round(Math.min(rawMonths, WORK_TIME_DISPLAY_MAX_MONTHS) * 10) / 10,
    hasBasis: true,
    // Ruisband van een tiende maand: 12,04 maanden is afrondingsruis, geen alarm.
    exceedsWorkYear: rawMonths > WORK_YEAR_MONTHS + 0.05,
  }
}

/** "4,4" — Nederlandse decimaalweergave met één decimaal. */
function nlMonths(months: number): string {
  return months.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/**
 * De canonieke werktijd-zin: "4,4 van de 12 maanden".
 *
 * De noemer staat BEWUST in de tekst. Dat is wat de bug oploste: een lezer ziet
 * meteen dat het om een deel van hetzelfde werkjaar gaat, en twee zulke claims
 * naast elkaar spreken elkaar niet meer tegen.
 */
export function formatWorkTimeString(breakdown: WorkTimeBreakdown): string {
  if (!breakdown.hasBasis) return ''
  return `${nlMonths(breakdown.monthsPerYear)} van de ${WORK_YEAR_MONTHS} maanden`
}
