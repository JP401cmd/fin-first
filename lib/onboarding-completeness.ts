/**
 * Onboarding-compleetheid — "6 van 7 onderdelen ingevuld".
 *
 * Achtergrond (bevinding M11): het eindscherm van de onboarding toonde een
 * hardgecodeerde `100%` in de Voortgang-cel, náást twee cellen met "Vul je
 * later aan". Dat percentage mat "einde wizard bereikt", niet "profiel
 * compleet" — de gebruiker dacht klaar te zijn en ontdekte pas later dat de
 * projecties op lege aannames draaien. Deze module vervangt die 100% door een
 * echte meting.
 *
 * ## Definitie — welke onderdelen tellen mee
 *
 * Besluit eigenaar (26-08-2026): **alle data-onderdelen tellen mee**, inclusief
 * pensioen en eindstrategie — niet alleen de financiële kernvelden. Dat waren
 * er acht; sinds de spaardoel-stap uit de onboarding is (19-09-2026, ADR 0162)
 * zijn het er zeven.
 *
 * De onboarding-orchestrator kent acht *groepen* (`STEP_GROUP_INDEX` in
 * `app/(onboarding)/onboarding/page.tsx`), maar de groepen ná de eindstrategie
 * (opslag/budget/bank en het eindscherm `klaar`) dragen geen data; groep 2
 * (`inkomen`/`uitgaven`) draagt er juist twee. De zeven onderdelen hieronder
 * zijn daarom de zeven *data*-groepen: groep 2 valt uiteen in inkomen en
 * uitgaven, en het eindscherm telt niet als "ingevuld". Zo telt niets mee dat
 * per definitie altijd waar is.
 *
 * ## Wat telt per onderdeel als "gevuld" (Given/When/Then)
 *
 * 1. **naam** — Given het eindscherm, When zowel `fullName` (na trim) als
 *    `dateOfBirth` niet leeg zijn, Then telt `naam` als gevuld. Beide velden
 *    zijn verplicht in de flow, dus dit is in de praktijk altijd waar; het
 *    predicaat blijft expliciet zodat een toekomstige skip meteen doortelt.
 * 2. **inkomen** — Given het eindscherm, When het genormaliseerde netto
 *    maandinkomen > 0 is (de orchestrator leidt dat af uit
 *    `net_monthly_income`, of uit `estimated_yearly_income / 12` voor een
 *    hersteld oud draft), Then telt `inkomen` als gevuld. `0` = overgeslagen
 *    of leeg.
 * 3. **uitgaven** — Given het eindscherm, When de geschatte maanduitgaven > 0
 *    zijn, Then telt `uitgaven` als gevuld.
 * 4. **bezittingen** — Given het eindscherm, When de gebruiker minstens één
 *    bezitting heeft toegevoegd (`assetCount > 0`), Then telt `bezittingen`
 *    als gevuld.
 * 5. **schulden** — Given het eindscherm, When de gebruiker minstens één
 *    schuld heeft toegevoegd (`debtCount > 0`), Then telt `schulden` als
 *    gevuld. Let op: een gebruiker die eerlijk géén schulden heeft, verlaat de
 *    sectie via "Ik heb (verder) geen schulden" en dat pad laat *geen* spoor
 *    achter in de orchestrator-state (het slaat het review-scherm bewust over,
 *    zie `onboarding-schulden.tsx`). Er is dus geen signaal om "bewust nul" van
 *    "overgeslagen" te onderscheiden; we tellen op datapresentie. Dat
 *    onderschat hooguit — het overschat nooit, en overschatten was de bug.
 * 6. **pensioen** — Given het eindscherm, When de pensioenstap een bruikbaar
 *    resultaat oplevert (`buildPensionParseResult(...) !== null`: een upload,
 *    of een schatting met een bruto maandbedrag > 0), Then telt `pensioen` als
 *    gevuld. "Overslaan" zet de draft terug op de begintoestand → `null`.
 * 7. **eindstrategie** — Given het eindscherm, When de gebruiker de
 *    eindstrategie-stap heeft gepasseerd, Then telt `eindstrategie` als
 *    gevuld. De stap kent bewust géén overslaan-knop: de gebruiker ziet twee
 *    tegels (FIRE / pensioenleeftijd) met een voorselectie en bevestigt met
 *    "Verder". Dit is daarom géén predicaat op de wáárde: `fire_end_strategy`
 *    heeft de default `'deplete'`, dus "is niet leeg" zou universeel waar zijn
 *    en "wijkt af van de default" zou juist iedereen straffen die FIRE wíl.
 *    De aanroeper geeft daarom expliciet door of de stap gepasseerd is; komt
 *    er ooit een overslaan-knop, dan verandert alleen die ene doorgave.
 */

/** De zeven onderdelen, in de volgorde van de flow. */
export const ONBOARDING_ONDERDELEN = [
  'naam',
  'inkomen',
  'uitgaven',
  'bezittingen',
  'schulden',
  'pensioen',
  'eindstrategie',
] as const

export type OnboardingOnderdeelKey = (typeof ONBOARDING_ONDERDELEN)[number]

/** Totaal aantal onderdelen — de noemer van "6 van 7". */
export const ONBOARDING_TOTAAL_ONDERDELEN = ONBOARDING_ONDERDELEN.length

/**
 * Gebruikersgerichte labels voor de "nog open"-opsomming onder de recap-strip.
 * Bewust in de tweede persoon en zonder hoofdletter, zodat ze midden in een
 * zin passen ("Nog open: je uitgaven en je pensioen.").
 */
export const ONBOARDING_ONDERDEEL_LABELS: Record<OnboardingOnderdeelKey, string> = {
  naam: 'je naam',
  inkomen: 'je inkomen',
  uitgaven: 'je uitgaven',
  bezittingen: 'je bezittingen',
  schulden: 'je schulden',
  pensioen: 'je pensioen',
  eindstrategie: 'je eindstrategie',
}

export interface OnboardingCompletenessInput {
  /** `identity.full_name` — ruwe invoer, wordt hier getrimd. */
  fullName: string
  /** `identity.date_of_birth` — 'YYYY-MM-DD' of ''. */
  dateOfBirth: string
  /**
   * Genormaliseerd netto maandinkomen in euro's (0 = niet ingevuld). De
   * orchestrator levert dit al afgeleid aan (`netMonthlyIncomeForKlaar`), zodat
   * de maand/jaar-terugval hier niet nóg een keer geïmplementeerd wordt.
   */
  netMonthlyIncome: number
  /** Geschatte maanduitgaven in euro's (0 = niet ingevuld). */
  monthlyExpenses: number
  /** Aantal toegevoegde bezittingen uit de quick-add stap. */
  assetCount: number
  /** Aantal toegevoegde schulden uit de quick-add stap. */
  debtCount: number
  /**
   * Uitkomst van `buildPensionParseResult(state.pension)` — `null` wanneer de
   * gebruiker de pensioenstap oversloeg of niets bruikbaars invulde.
   */
  pensioenResultaat: object | null
  /** Heeft de gebruiker de eindstrategie-stap gepasseerd? Zie punt 7 hierboven. */
  eindstrategieBeantwoord: boolean
}

export interface OnboardingCompleteness {
  /** Aantal gevulde onderdelen — de teller van "6 van 7". */
  gevuld: number
  /** Altijd `ONBOARDING_TOTAAL_ONDERDELEN`; meegegeven zodat de UI niets hardcodeert. */
  totaal: number
  /** De nog niet gevulde onderdelen, in flow-volgorde. */
  open: OnboardingOnderdeelKey[]
  /** Per onderdeel of het gevuld is — voedt eventuele detail-weergave. */
  perOnderdeel: Record<OnboardingOnderdeelKey, boolean>
  /** True wanneer alle zeven onderdelen gevuld zijn. */
  isCompleet: boolean
}

/**
 * Berekent hoeveel van de zeven onboarding-onderdelen daadwerkelijk data
 * bevatten. Puur en synchroon — geen state, geen fetch: de aanroeper levert de
 * al afgeleide waarden aan.
 */
export function computeOnboardingCompleteness(
  input: OnboardingCompletenessInput,
): OnboardingCompleteness {
  const perOnderdeel: Record<OnboardingOnderdeelKey, boolean> = {
    naam: input.fullName.trim() !== '' && input.dateOfBirth.trim() !== '',
    inkomen: Number.isFinite(input.netMonthlyIncome) && input.netMonthlyIncome > 0,
    uitgaven: Number.isFinite(input.monthlyExpenses) && input.monthlyExpenses > 0,
    bezittingen: input.assetCount > 0,
    schulden: input.debtCount > 0,
    pensioen: input.pensioenResultaat !== null,
    eindstrategie: input.eindstrategieBeantwoord,
  }

  const open = ONBOARDING_ONDERDELEN.filter((key) => !perOnderdeel[key])
  const gevuld = ONBOARDING_TOTAAL_ONDERDELEN - open.length

  return {
    gevuld,
    totaal: ONBOARDING_TOTAAL_ONDERDELEN,
    open,
    perOnderdeel,
    isCompleet: open.length === 0,
  }
}

/**
 * Zet de open onderdelen om naar een leesbare opsomming ("je uitgaven, je
 * pensioen en je eindstrategie"). Kapt af na `max` items zodat de zin onder de
 * recap-strip nooit een waslijst wordt: "je uitgaven, je pensioen en 3 andere".
 */
export function formatOpenOnderdelen(
  open: readonly OnboardingOnderdeelKey[],
  max = 3,
): string {
  if (open.length === 0) return ''
  const labels = open.map((key) => ONBOARDING_ONDERDEEL_LABELS[key])
  if (labels.length <= max) {
    if (labels.length === 1) return labels[0]
    return `${labels.slice(0, -1).join(', ')} en ${labels[labels.length - 1]}`
  }
  const rest = labels.length - max
  return `${labels.slice(0, max).join(', ')} en ${rest} ${rest === 1 ? 'ander onderdeel' : 'andere'}`
}
