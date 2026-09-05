// lib/checkin/terugblik.ts
//
// Welke cijfers voedt de terugblik-stap van de maandelijkse check-in?
//
// ── WAAROM DIT EEN EIGEN MODULE IS (B-016) ─────────────────────────────────
// De stap heet "Terugblik <vorige maand>" en vraagt "hoe hebben je financiën
// zich afgelopen maand ontwikkeld?", maar vulde zijn kaarten met `monthlyIncome`
// /`monthlyExpenses`/`monthlySavings` — de LOPENDE maand. Op 4 september las een
// gebruiker dus "Terugblik augustus" boven € 0 inkomen en € 97 uitgaven: de
// eerste dagen van september. Dezelfde velden voeden verderop in de check-in wél
// terecht een "je hebt DEZE maand gespaard"-regel, dus ompunten kon niet; er
// moesten expliciet benoemde `prevMonth*`-velden bij (de grondslag-in-de-veldnaam
// van ADR 0073).
//
// De keuze "welke maand hoort bij deze stap" woont daarom hier, als pure functie
// met een test eromheen, in plaats van als losse veldverwijzingen verspreid door
// een component van ruim tweeduizend regels.

/** De maandvelden uit `/api/checkin/overview` die de terugblik nodig heeft. */
export interface TerugblikBron {
  /** Naam van de maand waar de terugblik over gaat, bv. 'augustus'. */
  prevMonthLabel: string
  /** De maand dáárvoor — de vergelijkingsbasis, bv. 'juli'. */
  monthBeforePrevLabel: string
  prevMonthIncome: number
  prevMonthExpenses: number
  prevMonthSavings: number
  /** Uitgaven van de maand vóór de terugblik-maand; basis voor het percentage. */
  monthBeforePrevExpenses: number
}

/** Wat de terugblik-stap toont. */
export interface TerugblikCijfers {
  /** Maandnaam voor de kop; valt terug op 'afgelopen maand'. */
  label: string
  income: number
  expenses: number
  savings: number
  /**
   * Verandering van de uitgaven t.o.v. de maand ervóór, in procenten.
   * `null` = niet te bepalen of niet te benoemen; toon dan géén percentage.
   */
  expenseChangePct: number | null
  /** Bijschrift bij het percentage, bv. 't.o.v. juli'. `null` als er geen is. */
  changeLabel: string | null
}

/** Bedrag of 0 — een ontbrekend veld is geen reden om de kaart leeg te laten. */
function bedrag(value: number | null | undefined): number {
  return Number.isFinite(value) ? (value as number) : 0
}

/**
 * Zet de maandvelden om naar wat de terugblik-stap toont.
 *
 * Het percentage verschijnt alleen als het te ONDERBOUWEN is: er moet een
 * positieve vergelijkingsbasis zijn én een maand om bij naam te noemen. Een
 * percentage zonder zichtbare vergelijkingsmaand is precies de verwarring die
 * deze stap had — dan liever niets.
 */
export function terugblikCijfers(bron: TerugblikBron): TerugblikCijfers {
  const basis = bedrag(bron.monthBeforePrevExpenses)
  const vergelijkMaand = bron.monthBeforePrevLabel?.trim() || ''
  const expenses = bedrag(bron.prevMonthExpenses)

  const kanVergelijken = basis > 0 && vergelijkMaand.length > 0

  return {
    label: bron.prevMonthLabel?.trim() || 'afgelopen maand',
    income: bedrag(bron.prevMonthIncome),
    expenses,
    savings: bedrag(bron.prevMonthSavings),
    expenseChangePct: kanVergelijken ? ((expenses - basis) / basis) * 100 : null,
    changeLabel: kanVergelijken ? `t.o.v. ${vergelijkMaand}` : null,
  }
}
