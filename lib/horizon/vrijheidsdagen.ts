import { factorAtAge, type FactorRow } from '@/lib/euro-display'
import type { FreedomRateSource } from '@/lib/format'

/**
 * vrijheidsdagen — bedrag-op-een-leeftijd → vrijheidsdagen, mechanisch juist.
 *
 * ══ Waarom deze helper bestaat ═══════════════════════════════════════════════
 *
 * De regel is één zin — *"de teller exact één keer deflateren, de noemer nooit"*
 * (ADR 0093 §11) — en werd op /toekomst drie keer op een andere manier verkeerd
 * uitgevoerd (UR3-08 vervolg). De drie fase-modals deden elk hun eigen som:
 *
 *  · opbouw     — noemer was `yearlyMustExpenses / 365`: het uitgavenniveau ná
 *                 je stoppen, gebruikt om je spaarbedrag van vandaag te vertalen.
 *  · overgang   — een NOMINALE kernelwaarde op een toekomstige leeftijd gedeeld
 *                 door een dagtarief van nu (1,3–1,8× overschatting), boven op
 *                 een grondslag (`startNetWorth`) die de eigen woning meetelde,
 *                 en een DERDE koers (`monthlyExpenses × 12 / 365`) als noemer.
 *  · onttrekking— een tautologie: teller = het inkomen dat per kernelconstructie
 *                 exact de noemer dekt, dus ≈ 365 by design.
 *
 * Drie schermen, drie wisselkoersen, één munt. Deze helper is het ene huis van
 * die deling, zodat een vierde variant niet meer per ongeluk kan ontstaan.
 *
 * ══ De twee valkuilen die hij AFDWINGT ═══════════════════════════════════════
 *
 *  1. **Nooit via `deflate(x, factor, euroView)`.** Vrijheidstijd is
 *     REAL-VERANKERD: hij drukt een bedrag uit in dagen van het leven dat je nu
 *     leidt, en mag dus NIET meebewegen met de Nominaal/Reëel-schakelaar. Wie
 *     `euroView` doorgeeft, laat het aantal dagen springen zodra de gebruiker de
 *     weergave wisselt — terwijl er niets aan zijn vrijheid veranderde. Daarom
 *     delen we hier ONVOORWAARDELIJK door de factor; `euroView` komt in deze
 *     module bewust niet voor.
 *
 *  2. **Onbekend is geen nul (ADR 0131).** Bij `source === 'none'` is er geen
 *     geloofwaardige dagbasis en tonen we GEEN regel — `null`, geen 0 dagen.
 *     `'transactions'` impliceert de geloofwaardigheidsvloer al, dus die hoeft
 *     hier niet apart te worden getoetst. `'estimate'` en `'cohort'` passeren
 *     bewust wél: een geschat of cohort-tarief is een geloofwaardige grondslag,
 *     alleen een minder harde — de herkomst staat eronder in
 *     `VrijheidstijdVoetnoot`, en de rest van de app behandelt ze net zo.
 *     `'none'` is dus de enige uitsluiting, niet "alles behalve transactions".
 *
 * ══ Wat hij NIET doet ════════════════════════════════════════════════════════
 *
 * Hij maakt geen dagtarief. De noemer is ALTIJD het canonieke tarief uit de
 * bundel (`HorizonPageData.dailyExpenseRate`, 12-mnd rolling via
 * lib/expense-rate.ts) en wordt hier alleen geconsumeerd — nooit afgeleid.
 *
 * Hij is ook niet bedoeld voor bedragen van **klasse C** (een som of gemiddelde
 * over meerdere jaren: totale inleg, gemiddelde onttrekking over de hele fase).
 * Zulke bedragen hebben geen canonieke deflator en zijn per ADR 0093 §1 exempt —
 * die regels horen niet vertaald te worden, maar te verdwijnen of te worden
 * herschreven naar een klasse-S-grootheid (één bedrag op één leeftijd).
 */

/** Gedeelde guards + de ene deling. Enige plek waar de som staat. */
function toFreedomDays(
  nominalAmount: number,
  factor: number,
  canonicalDailyRate: number,
  source: FreedomRateSource | undefined,
): number | null {
  // ADR 0131 — onbekende grondslag levert geen getal, ook geen nul.
  if (source === 'none') return null
  if (!Number.isFinite(canonicalDailyRate) || canonicalDailyRate <= 0) return null
  if (!Number.isFinite(nominalAmount) || nominalAmount <= 0) return null
  if (!Number.isFinite(factor) || factor <= 0) return null

  const dagen = Math.round(nominalAmount / factor / canonicalDailyRate)
  return dagen > 0 ? dagen : null
}

export interface FreedomDaysAtAgeArgs {
  /** Kernelrijen die de deflator dragen (`inflationFactor`, jaar 0 = exact 1.0). */
  rows: readonly FactorRow[]
  /** De leeftijd waarop het bedrag staat. `null` = een bedrag van vandaag (factor 1). */
  age: number | null | undefined
  /**
   * Het NOMINALE bedrag op die leeftijd — klasse S (één bedrag, één moment).
   * Voor vermogen is dat de J-grondslag (`startNettoLiquide` / `nettoLiquide`,
   * netto LIQUIDE), nooit `startNetWorth`/`netWorth`: die tellen niet-liquide
   * bezit zoals de eigen woning mee, en een huis is geen op te leven vrijheid.
   */
  nominalAmount: number
  /** `HorizonPageData.dailyExpenseRate` — geconsumeerd, nooit hier gerekend. */
  canonicalDailyRate: number
  /** `HorizonPageData.dailyExpenseRateDetail.source` — `'none'` ⇒ geen regel. */
  source?: FreedomRateSource
}

/**
 * Vrijheidsdagen voor een nominaal bedrag op een toekomstige leeftijd.
 *
 * Teller één keer door `factorAtAge(rows, age)` (euro's van vandaag), noemer
 * onaangeraakt. `null` = geen eerlijke regel te tonen.
 */
export function freedomDaysAtAge({
  rows,
  age,
  nominalAmount,
  canonicalDailyRate,
  source,
}: FreedomDaysAtAgeArgs): number | null {
  // age == null → factorAtAge geeft 1.0: een bedrag van vandaag deflateert niet.
  const factor = factorAtAge(rows, age)
  return toFreedomDays(nominalAmount, factor, canonicalDailyRate, source)
}

/** Minimale vorm om de J-grondslag op een leeftijd op te zoeken. */
export interface NettoLiquideRow {
  age: number
  startNettoLiquide?: number
}

/**
 * De J-grondslag (netto LIQUIDE) aan het begin van de rij op `age`.
 *
 * Bestaat als losse functie omdat dit precies de plek was waar de UR3-08-fix
 * bijna stilletjes misging. In `horizon-client` stond de afleiding als inline
 * expressie op `unifiedRows.filter(r => r.phase === 'transition')[0]` — en die
 * filter matcht op productie NOOIT: de kernel kent geen overbrugging en zet
 * `phase` alleen op 'accumulation' of 'withdrawal' (bridge.ts:44 en :728). Het
 * gevolg was niet een fout getal maar een verdwenen regel, en dat was onzichtbaar
 * omdat de modaltest de waarde als prop injecteert en zelf een fixture met
 * synthetische 'transition'-rijen bouwt.
 *
 * Als functie is de afleiding wél te toetsen tegen productievormige rijen.
 *
 * Let op de grondslag: dit valt NOOIT terug op `startNetWorth` (Prognose!I). Een
 * terugval J→I zou de eigen woning als op te leven vrijheidsdagen presenteren.
 * Geen rij op die leeftijd ⇒ `undefined` ⇒ de call-site toont geen regel.
 */
export function nettoLiquideAtAge(
  rows: readonly NettoLiquideRow[] | null | undefined,
  age: number | null | undefined,
): number | undefined {
  if (!rows || age == null) return undefined
  return rows.find((r) => r.age === age)?.startNettoLiquide
}

/**
 * Vrijheidsdagen voor een bedrag dat AL in euro's van vandaag staat (factor 1
 * per constructie) — bv. je huidige maandelijkse besparing.
 *
 * Bewust een eigen naam in plaats van `age: null`: zo staat in de call-site
 * zwart-op-wit dat de vintage "vandaag" een keuze is en geen vergeten leeftijd.
 */
export function freedomDaysToday(args: {
  nominalAmount: number
  canonicalDailyRate: number
  source?: FreedomRateSource
}): number | null {
  return toFreedomDays(args.nominalAmount, 1, args.canonicalDailyRate, args.source)
}
