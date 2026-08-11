/**
 * resolveSavingsSource — canonieke spaarbron voor de FIRE-prognose.
 *
 * Spiegelt exact het getal dat het instellingenblok onderaan
 * /overzicht/cashflow toont (`components/overview/cashflow-instellingen-blok.tsx`):
 *
 *   - inkomen     = handmatig ? net_monthly_income × 12 : extrapolated jaarinkomen
 *   - spaarquote  = uitgaven-handmatig
 *                     ? (inkomen − handmatige uitgaven) / inkomen
 *                     : savingsRate6m  (incl. spaarbudgetten + schuldaflossing)
 *   - baseAnnualSavings = inkomen × spaarquote%
 *
 * De spaarbudget-/aflossing-correctie hoort BIJ het transactie-pad, waar de
 * uitgavensom rauw uit transacties komt. Handmatige invoer is al een keuze van de
 * gebruiker (en bij een ingevoerd "eigen percentage" zelfs de bron waaruit de
 * uitgaven worden terugberekend) — daar nog eens corrigeren telt hetzelfde
 * spaargeld twee keer. Zie de toelichting bij `resolveSavingsSource`.
 *
 * Door precies dezelfde keuzeregel te gebruiken kan de prognose nooit
 * divergeren van wat de gebruiker op de cashflow-pagina ziet.
 *
 * SINDS ADR 0103 heeft `resolveSavingsSource` twee takken. Krijgt hij het
 * optionele `basis`-blok (de geresolveerde grondslag uit
 * `resolveAmountWithBasis`), dan VOLGT de spaarquote de grondslag: beide op
 * 'transaction' → ongewijzigd `savingsRate6m`; anders één uniforme
 * (I − E) / I zonder spaarbudget-/aflossingscorrectie. Zonder dat blok blijft de
 * legacy-keuzeregel hieronder gelden — byte-identiek voor elke call-site die de
 * grondslag (nog) niet kent.
 */
import { type Debt, computeRenteAflossingsSplit } from '@/lib/debt-data'
import type { ResolvedBasis } from '@/lib/effective-financials'

/**
 * De geresolveerde grondslag + de effectieve bedragen daarop (ADR 0103).
 *
 * De spaarquote VOLGT de grondslag; ze is geen aparte instelbare bron. Levert de
 * caller dit blok, dan is de spaarbron volledig door de grondslag bepaald.
 */
export interface SavingsBasisInput {
  /** Grondslag van het inkomen (uit `resolveAmountWithBasis`). */
  income: ResolvedBasis
  /** Grondslag van de uitgaven (uit `resolveAmountWithBasis`). */
  expenses: ResolvedBasis
  /** Effectief JAARinkomen op die grondslag. */
  annualIncome: number
  /**
   * Effectieve MAANDuitgaven op die grondslag. Op de transactiegrondslag hoort
   * hier het 6-maands GEMIDDELDE (dezelfde meting waar `savingsRate6m` op staat),
   * niet de lopende maand — anders zou een half geboekte maand de quote laten
   * springen.
   */
  monthlyExpenses: number
}

export interface SavingsSourceInput {
  /** profiles.income_source — 'manual' wint over de berekende waarde. */
  incomeSource?: string | null
  /** profiles.expenses_source — 'manual' wint over de berekende waarde. */
  expensesSource?: string | null
  /** profiles.net_monthly_income — handmatige maandinkomen-override. */
  netMonthlyIncome: number
  /** Berekend (geëxtrapoleerd) jaarinkomen uit transacties. */
  estimatedAnnualIncome: number
  /** profiles.estimated_monthly_expenses — handmatige maanduitgaven-override. */
  estimatedMonthlyExpenses: number
  /** Canonieke 6-maands spaarquote (%) incl. spaarbudgetten + aflossing-correctie. */
  savingsRate6m: number
  /**
   * @deprecated Genegeerd sinds 29 jul 2026. Maandelijkse schuldaflossing die als
   * sparen telt (`computeDebtAflossingMonthly`). Werd op het HANDMATIGE pad bij
   * het spaardeel opgeteld — bovenop een percentage dat de gebruiker zélf al als
   * spaarquote had ingevoerd. Dat dubbeltelde: op productie werd 30 % → 37,2 %
   * en 40 % → 55 %. Blijft alleen in de signatuur zodat call-sites niet breken.
   */
  monthlyDebtAflossing?: number
  /**
   * @deprecated Genegeerd sinds 29 jul 2026 — zelfde dubbeltelling als
   * `monthlyDebtAflossing`, zie daar.
   */
  monthlySavingsContribution?: number
  /**
   * NIEUW (ADR 0103) — de geresolveerde grondslag. WEGLATEN = byte-identiek aan
   * het gedrag van vóór dat besluit (de legacy-tak hieronder, die alleen
   * `manual` versus "berekend" kent).
   *
   * De server-oppervlakken geven 'm inmiddels allemaal mee: de drie loaders, de
   * twee cashflow-KPI-loaders, de drie snapshot-routes, `/api/report` en
   * `/api/guide-progress`. Wat bewust ZONDER blijft: `lib/check/build-report.ts`
   * (zet expliciet manual/manual — in de check-funnel vult de gebruiker zelf in)
   * en de what-if-pagina, die op een eigen, door de gebruiker gestuurde baseline
   * rekent. De optionaliteit blijft daarom bestaan; ze is geen restschuld.
   */
  basis?: SavingsBasisInput
}

export interface SavingsSource {
  /** Effectief jaarinkomen (handmatig of berekend). */
  effectiveAnnualIncome: number
  /** Effectieve spaarquote in procenten. */
  effectiveSavingsRatePct: number
  /** Jaarlijks spaarbedrag = effectiveAnnualIncome × effectiveSavingsRatePct%. */
  baseAnnualSavings: number
}

/**
 * Maandelijkse schuldaflossing die meetelt als vermogensopbouw ("sparen").
 * Zelfde regels als de loaders en de check-in-route: alleen actieve schulden
 * met include_aflossing_in_savings, gewogen met net_worth_inclusion_pct.
 */
export function computeDebtAflossingMonthly(debts: Debt[]): number {
  let monthly = 0
  for (const d of debts) {
    if (!d.is_active || !d.include_aflossing_in_savings) continue
    const aflossing = d.custom_aflossing_amount != null
      ? Number(d.custom_aflossing_amount)
      : (computeRenteAflossingsSplit(d)?.currentAflossing ?? 0)
    monthly += aflossing * ((d.net_worth_inclusion_pct ?? 100) / 100)
  }
  return monthly
}

/**
 * Kern-formule van de 6-maands spaarquote (%):
 *   (inkomen − uitgaven + aflossing) / inkomen × 100
 *
 * De loaders (dashboard/horizon) voegen hier extrapolatie bij <6 maanden
 * data en een spaarbudget-term aan toe; dit is de gedeelde basis voor
 * call-sites die met rauwe 6-maands-aggregaten werken (check-in, what-if).
 */
export function savingsRateFromAggregates(
  income6m: number,
  expenses6m: number,
  debtAflossing6m: number,
): number {
  return income6m > 0 ? ((income6m - expenses6m + debtAflossing6m) / income6m) * 100 : 0
}

/**
 * Inverse van savingsRateFromAggregates: het maandelijkse spaarbedrag (€) dat bij
 * een gegeven spaarquote (%) en maandinkomen hoort — `inkomen × quote%`.
 *
 * Dé canonieke "quote → bedrag"-conversie zodat het getoonde spaarpercentage en
 * het getoonde €-bedrag ALTIJD op dezelfde grondslag staan (bedrag / inkomen × 100
 * == quote). Voorkomt dat een oppervlak (bv. de spaarquote-widget) naast de
 * canonieke quote een tweede, afwijkend huidige-maand-bedrag optelt.
 */
export function monthlySavingsFromRate(monthlyIncome: number, savingsRatePct: number): number {
  return monthlyIncome * (savingsRatePct / 100)
}

/**
 * Ruwe 6-maands aggregaten waaruit de canonieke spaarquote volgt. De loaders
 * (dashboard/horizon/core/lever-scores) leveren deze uit hun eigen queries; de
 * extrapolatie + `savingsRateFromAggregates` + profiel-fallback wonen HIER, zodat
 * er niet vier onderling-driftende kopieën van dat staartstuk bestaan.
 */
export interface SavingsRate6mAggregates {
  /** Ruwe (of <6m) inkomsten uit transacties — transfer-gefilterd. */
  income6m: number
  /** Ruwe (of <6m) uitgaven, absoluut — transfer-gefilterd. */
  expenses6m: number
  /** 6-maands stortingen op spaarbudgetten (telt als sparen, niet als uitgave). */
  savingsBudgetSpent6m: number
  /** 6-maands schuldaflossing (`computeDebtAflossingMonthly` × 6). */
  debtAflossing6m: number
  /** Aantal maanden werkelijke data (1–6) voor extrapolatie bij <6m historie. */
  dataMonths: number
  /**
   * Profiel-fallback bij een transactieloze gebruiker (aggregaat-quote = 0):
   * `(inkomen − uitgaven) / inkomen`, afgerond. Beide moeten > 0 zijn, anders
   * geen fallback. Optioneel — laat weg om GEEN profiel-fallback toe te passen
   * (dan blijft de quote de aggregaat-uitkomst, bv. de lichte sidebar-loader die
   * bij ontbrekende transactie-inkomsten bewust `null` toont).
   */
  fallbackMonthlyIncome?: number
  fallbackMonthlyExpenses?: number
}

export interface SavingsRate6mResult {
  /** Spaarquote (%) — 6-maands, incl. spaarbudget/aflossing-correctie + fallback. */
  savingsRate6m: number
  /**
   * De aggregaat-formule gaf 0 (geen bruikbare transactie-inkomsten) → true. Callers
   * gebruiken dit om een verdere fallback (net-worth-delta) te triggeren én om te
   * weten of het inkomen-anker het 6m-gemiddelde of het profiel-inkomen is.
   */
  isEstimate: boolean
  /** Geëxtrapoleerde 6m-inkomsten (= income6m bij ≥6m data). */
  extIncome6: number
  /** Geëxtrapoleerde 6m-uitgaven. */
  extExpenses6: number
  /** Geëxtrapoleerde 6m-spaarbudget-stortingen. */
  extSavingsBudget6: number
}

/**
 * Canonieke 6-maands spaarquote (%). Ééns geëxtraheerd uit de vier loaders die
 * dit staartstuk inline dupliceerden (dashboard/horizon/core/lever-scores):
 *   1. extrapoleer <6m data naar een 6-maands basis,
 *   2. `savingsRateFromAggregates(extInkomen, extUitgaven − extSpaarbudget, extAflossing)`,
 *   3. optionele profiel-fallback bij aggregaat = 0.
 *
 * Byte-identiek aan de vroegere inline-versies; verving GEEN semantiek, alleen de
 * plaats waar de formule woont ("consume, don't recompute").
 */
export function computeSavingsRate6m(agg: SavingsRate6mAggregates): SavingsRate6mResult {
  const dataMonths = Math.max(1, Math.min(6, agg.dataMonths))
  const extIncome6 = dataMonths < 6 ? (agg.income6m / dataMonths) * 6 : agg.income6m
  const extExpenses6 = dataMonths < 6 ? (agg.expenses6m / dataMonths) * 6 : agg.expenses6m
  const extSavingsBudget6 =
    dataMonths < 6 ? (agg.savingsBudgetSpent6m / dataMonths) * 6 : agg.savingsBudgetSpent6m

  const rate = savingsRateFromAggregates(extIncome6, extExpenses6 - extSavingsBudget6, agg.debtAflossing6m)
  const isEstimate = rate === 0

  let savingsRate6m = rate
  if (
    rate === 0 &&
    agg.fallbackMonthlyIncome != null &&
    agg.fallbackMonthlyIncome > 0 &&
    agg.fallbackMonthlyExpenses != null &&
    agg.fallbackMonthlyExpenses > 0
  ) {
    savingsRate6m = Math.round(
      ((agg.fallbackMonthlyIncome - agg.fallbackMonthlyExpenses) / agg.fallbackMonthlyIncome) * 100,
    )
  }

  return { savingsRate6m, isEstimate, extIncome6, extExpenses6, extSavingsBudget6 }
}

export function resolveSavingsSource(input: SavingsSourceInput): SavingsSource {
  // ── GRONDSLAG-PAD (ADR 0103) ───────────────────────────────────────────────
  // De spaarquote volgt de grondslag van inkomen en uitgaven; ze is geen aparte
  // instelbare bron.
  //
  //  • Staan BEIDE op 'transaction', dan blijft de uitkomst exact die van
  //    vandaag: `savingsRate6m`, mét de spaarbudget-/aflossingscorrectie die in
  //    `computeSavingsRate6m` zit.
  //  • Staat ÉÉN van beide NIET op 'transaction', dan geldt één uniforme formule
  //    (I − E) / I op de effectieve bedragen, ZONDER die correctie.
  //
  // Waarom zonder: de correctie bestaat omdat `expenses6m` een RÚWE
  // transactiesom is waar spaarstortingen en aflossing ten onrechte in zitten
  // (zie de toelichting bij het handmatige pad hieronder). Een
  // budget-uitgavensom bevat die per constructie niet — alleen
  // `budget_type='expense'` telt mee, 'savings' en 'debt' vallen erbuiten
  // (BASIS_BUDGET_TYPE in lib/budget-basis.ts, een DRAGENDE invariant). Het geld
  // dat de correctie zou terugtellen is er nooit afgehaald; hem er alsnog
  // bovenop leggen geeft exact de dubbeltelling die ooit een ingevoerde 30 % tot
  // 37,2 % opblies.
  //
  // BEWUSTE GEDRAGSWIJZIGING (eigenaar-besluit, wijkt af van de "erkende
  // uitzondering" in ADR 0103 §"De spaarquote volgt de uitgavengrondslag"): ook
  // de GEMENGDE combinatie — handmatig of budget-inkomen × transactie-uitgaven —
  // valt nu onder de uniforme formule. Voorheen leverde die combinatie
  // `savingsRate6m` op: een VERHOUDING gemeten over het transactie-inkomen,
  // vermenigvuldigd met een inkomen uit een ándere grondslag. Dat getal is door
  // niemand na te vertellen. Gevolg: voor gebruikers met income_source='manual'
  // en expenses_source='auto'/'transaction' verschuift de spaarquote (en daarmee
  // de FIRE-datum en de gezondheidsscore-pijler Rondkomen) eenmalig.
  if (input.basis) {
    // Val terug op de transactie-extrapolatie wanneer de grondslag geen bruikbaar
    // jaarinkomen oplevert (bv. income_source='manual' met een leeggemaakt bedrag).
    // Zelfde `> 0`-guard als de legacy-tak hieronder — die is hier bewust
    // behouden zodat een randgeval geen inkomen van €0 de FIRE-prognose in duwt.
    const effectiveAnnualIncome =
      input.basis.annualIncome > 0 ? input.basis.annualIncome : input.estimatedAnnualIncome
    const bothTransaction = input.basis.income === 'transaction' && input.basis.expenses === 'transaction'
    const effectiveSavingsRatePct = bothTransaction
      ? input.savingsRate6m
      : savingsRateFromAggregates(effectiveAnnualIncome / 12, input.basis.monthlyExpenses, 0)
    return {
      effectiveAnnualIncome,
      effectiveSavingsRatePct,
      baseAnnualSavings: effectiveAnnualIncome * (effectiveSavingsRatePct / 100),
    }
  }

  // ── LEGACY-PAD (geen grondslag meegegeven) ─────────────────────────────────
  const incomeManual = input.incomeSource === 'manual' && input.netMonthlyIncome > 0
  const effectiveAnnualIncome = incomeManual
    ? input.netMonthlyIncome * 12
    : input.estimatedAnnualIncome

  const effectiveMonthlyIncome = effectiveAnnualIncome / 12

  const expensesManual = input.expensesSource === 'manual'
  // HANDMATIG PAD = letterlijk wat het instellingenblok onderaan
  // /overzicht/cashflow toont: (inkomen − uitgaven) / inkomen. Géén
  // spaarbudget-/aflossing-correctie erbovenop.
  //
  // Waarom niet: die correcties hoorden bij het TRANSACTIE-pad, waar `expenses6m`
  // een rúwe uitgavensom is waar spaarstortingen en aflossing ten onrechte in
  // zitten. Op het handmatige pad is `estimated_monthly_expenses` géén rauwe som
  // maar de uitkomst van een keuze van de gebruiker — sterker nog, wie in het
  // spaarquote-sheet een "eigen percentage" invult, laat `recomputeTriple` de
  // uitgaven juist ÚIT dat percentage terugrekenen. De correcties er dan weer
  // bovenop leggen telt hetzelfde spaargeld twee keer: op productie werd een
  // ingevoerde 30 % zo 37,2 % en een ingevoerde 40 % zelfs 55 %, en dat
  // opgeblazen getal voedde zowel de gezondheidsscore als de FIRE-prognose.
  const effectiveSavingsRatePct = expensesManual
    ? savingsRateFromAggregates(effectiveMonthlyIncome, input.estimatedMonthlyExpenses, 0)
    : input.savingsRate6m

  const baseAnnualSavings = effectiveAnnualIncome * (effectiveSavingsRatePct / 100)

  return { effectiveAnnualIncome, effectiveSavingsRatePct, baseAnnualSavings }
}
