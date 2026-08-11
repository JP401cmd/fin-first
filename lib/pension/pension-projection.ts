/**
 * Pensioen-projectie — pure rekenfunctie (geen IO, geen React, geen Supabase).
 *
 * Zet de pensioenpotten (life_events met event_type='pension') om naar een
 * rij-per-leeftijd projectie van het verwachte JAARBEDRAG, in drie grootheden:
 *
 *  - brutoNominaal      = som van de jaarbedragen van de potten die op die
 *                         leeftijd actief zijn. Vlak nominaal — dit is precies
 *                         wat mijnpensioenoverzicht.nl als `TeBereiken` toont
 *                         (een nominaal, NIET geïndexeerd bedrag).
 *  - brutoGeindexeerd   = brutoNominaal opgehoogd met inflatie vanaf nu:
 *                         compounding met `inflationRate` over (age − currentAge).
 *                         Dit is het NOMINALE bedrag dat je zou ontvangen ALS je
 *                         pensioen volledig met de inflatie meegroeit (volledige
 *                         indexatie) — een illustratieve bovengrens, ongeacht of
 *                         een pot daadwerkelijk geïndexeerd is. Het VERSCHIL met de
 *                         vlakke `brutoNominaal`-lijn is je koopkrachtverlies bij
 *                         een niet-meegroeiend pensioen (dus GEEN reëel-naar-
 *                         vandaag deflatie van de nominale lijn).
 *  - nettoGeindexeerd   = brutoGeindexeerd − Box 1-belasting over dat bruto.
 *
 * BELANGRIJK — single source of truth:
 *  - Inflatie komt van de aanroeper (resolveFireParams → inflationRate). Geen
 *    hardcoded inflatiepercentage hier.
 *  - Belasting via `computeBox1Tax` (lib/box1-tax.ts) — geen eigen tarieven,
 *    met `arbeidsinkomen: 0`: een pensioenuitkering is geen loon/winst/resultaat
 *    uit werkzaamheden en geeft dus geen recht op arbeidskorting of IACK. Tot
 *    11 aug 2026 ontbrak die grondslag en kende de motor hier wél een
 *    arbeidskorting toe — `nettoGeindexeerd` viel daardoor te hoog uit
 *    (bij € 60.000 bruto AOW-tarief 2026 ruim € 2.300/jaar).
 *
 * BEKENDE SIMPLIFICATIES (bewust, restpunt):
 *  - Box 1-tarieven zijn die van het kalenderjaar `year`; bracket-creep (het
 *    jaarlijks meebewegen van schijfgrenzen) wordt NIET gemodelleerd. Over
 *    meerdere jaren overschat dit de belasting licht in reële termen.
 *  - AOW wordt NIET als lijn meegenomen (zit niet in `pension`-events); de
 *    belasting wordt op het pensioen-bruto alléén berekend.
 *  - De pensioenpot wordt als AOW-gerechtigd inkomen belast (lager schijf-1
 *    tarief): pensioen-uitkeringen lopen per definitie vanaf de pensioendatum.
 */
import { computeBox1Tax, type Box1TaxYear } from '@/lib/box1-tax'
import type { LifeEvent } from '@/lib/horizon-data'

export interface PensionProjectionRow {
  /** Leeftijd waarvoor deze rij geldt. */
  age: number
  /** Som van de actieve potten — vlak nominaal jaarbedrag (TeBereiken). */
  brutoNominaal: number
  /** Nominaal opgehoogd met inflatie = bedrag bij volledige indexatie (illustratieve bovengrens). */
  brutoGeindexeerd: number
  /** Geïndexeerd bruto na aftrek van Box 1-belasting. */
  nettoGeindexeerd: number
}

export interface BuildPensionProjectionArgs {
  /** De pensioenpotten (life_events met event_type='pension'). */
  pensionEvents: LifeEvent[]
  /** Huidige leeftijd (uit dateOfBirth via ageAtDate). */
  currentAge: number
  /** Inflatievoet als fractie (bv. 0.02), uit resolveFireParams. */
  inflationRate: number
  /** Belastingjaar voor de Box 1-tarieven. */
  year: Box1TaxYear
  /** Bovengrens van de projectie (default 90). */
  maxAge?: number
}

/**
 * Bepaalt het bruto jaarbedrag van één pot op een gegeven leeftijd.
 * Respecteert `target_age` (ingangsleeftijd) als start en `duration_months`
 * (0 = levenslang) als einde. Buiten het actieve venster → 0.
 */
function potYearlyAtAge(ev: LifeEvent, age: number): number {
  const start = ev.target_age ?? 0
  if (age < start) return 0
  // duration_months === 0 betekent levenslang.
  if (ev.duration_months && ev.duration_months > 0) {
    const endExclusive = start + ev.duration_months / 12
    if (age >= endExclusive) return 0
  }
  return Math.max(0, Number(ev.monthly_income_change ?? 0)) * 12
}

/**
 * Bouwt de pensioen-projectie: rijen per leeftijd van de vroegste
 * ingangsleeftijd t/m `maxAge`. Lege input → lege rijen. Deterministisch.
 */
export function buildPensionProjection({
  pensionEvents,
  currentAge,
  inflationRate,
  year,
  maxAge = 90,
}: BuildPensionProjectionArgs): PensionProjectionRow[] {
  if (!pensionEvents || pensionEvents.length === 0) return []

  // Vroegste ingangsleeftijd = startleeftijd van de projectie.
  const startAge = Math.min(
    ...pensionEvents.map((ev) => ev.target_age ?? Number.POSITIVE_INFINITY),
  )
  if (!Number.isFinite(startAge) || startAge > maxAge) return []

  const rows: PensionProjectionRow[] = []
  const safeInflation = Number.isFinite(inflationRate) ? inflationRate : 0

  for (let age = Math.floor(startAge); age <= maxAge; age++) {
    const brutoNominaal = pensionEvents.reduce(
      (sum, ev) => sum + potYearlyAtAge(ev, age),
      0,
    )

    // Indexatie vanaf nu: compounding over verstreken jaren sinds currentAge.
    // Vóór "nu" (zou niet voorkomen, maar defensief) geen ophoging.
    const yearsFromNow = Math.max(0, age - currentAge)
    const indexFactor = Math.pow(1 + safeInflation, yearsFromNow)
    const brutoGeindexeerd = brutoNominaal * indexFactor

    // Belasting op het geïndexeerde bruto (AOW-gerechtigd tarief: pensioen
    // loopt per definitie vanaf de pensioendatum).
    // `arbeidsinkomen: 0` — een pensioenuitkering is geen loon/winst/resultaat
    // uit werkzaamheden, dus er is geen recht op arbeidskorting of IACK. Zonder
    // die expliciete grondslag kende de motor hier een arbeidskorting toe over
    // het pensioen en viel de heffing te laag (het nettobedrag te hoog) uit.
    const tax =
      brutoGeindexeerd > 0
        ? computeBox1Tax({
            grossYearlyIncome: brutoGeindexeerd,
            year,
            aow: true,
            arbeidsinkomen: 0,
          }).tax
        : 0
    const nettoGeindexeerd = Math.max(0, brutoGeindexeerd - tax)

    rows.push({ age, brutoNominaal, brutoGeindexeerd, nettoGeindexeerd })
  }

  return rows
}
