// lib/vaste-lasten-benchmarks.ts
//
// REDACTIONELE DUIDING — géén rekenconstanten.
//
// De cijfers hieronder zijn externe, gepubliceerde benchmarks (Nibud,
// marktonderzoek naar abonnementen) die we als journalistieke context tonen
// naast de eigen cijfers van de gebruiker. Ze horen BEWUST NIET in
// `lib/constants.ts` (dat is de rekenmotor-laag: SWR, forfaits, dagtarief):
// een benchmark is een geciteerde bewering over "de gemiddelde Nederlander",
// geen grondslag waarmee we het vermogen of de vrijheidstijd berekenen.
//
// Single source: de vaste-lasten-inzichten-lib importeert `SUBSCRIPTION_BENCHMARK`
// alleen om een DELTA te duiden ("jij zit X onder/boven het gemiddelde"), niet
// om een kerngetal van de gebruiker te (her)berekenen.

/**
 * Abonnementen-benchmark voor Nederlandse huishoudens.
 * Bronnen (redactioneel, ter duiding): marktonderzoek naar streaming-/
 * abonnementsuitgaven (o.a. Deloitte Digital Consumer Trends; Nederlandse
 * consumentenpanels). Cijfers zijn richtinggevend, geen exacte norm.
 */
export const SUBSCRIPTION_BENCHMARK = {
  /** Gemiddelde abonnementsuitgave per persoon, per maand (€). */
  avgMonthlyPerPerson: 149,
  /** Gemiddeld aantal actieve abonnementen per huishouden. */
  avgCountPerHousehold: 14,
  /** Aandeel mensen dat het eigen aantal abonnementen onderschat (%). */
  pctUnderestimate: 90,
  /** Aandeel mensen dat vergeet een ongebruikt abonnement op te zeggen (%). */
  pctForgetToCancel: 28,
} as const

/**
 * Nibud-richtlijn voor vaste lasten als aandeel van het netto-inkomen.
 * Ter duiding bij de vaste-lastenquote-meter — de meter-zones zelf komen uit
 * `VASTE_LASTEN_GOOD_MAX`/`VASTE_LASTEN_WARN_MAX` (lib/cashflow-cards.ts).
 */
export const VASTE_LASTEN_BENCHMARK_COPY = {
  nibud:
    'Het Nibud houdt als vuistregel aan dat je vaste lasten bij voorkeur onder de helft van je netto-inkomen blijven. Boven ongeveer 70% wordt je begroting kwetsbaar: er blijft weinig ruimte om te sparen of tegenvallers op te vangen.',
  fiftyThirtyTwenty:
    'In de bekende 50/30/20-regel vallen je vaste lasten onder de "50% noodzakelijke uitgaven" — de andere helft is voor wensen (30%) en vrijheid opbouwen (20%).',
} as const

/**
 * Duiding-teksten voor het abonnementen-sluipverbruik-blok. `{n}`-placeholders
 * worden door de UI ingevuld; de kale statistieken staan hier als geciteerde
 * redactionele tekst.
 */
export const SUBSCRIPTION_BENCHMARK_COPY = {
  sluipverbruik:
    'Abonnementen zijn sluipverbruik: klein per stuk, groot bij elkaar. Onderzoek laat zien dat mensen hun aantal abonnementen structureel onderschatten en er geregeld eentje vergeten die ze niet meer gebruiken.',
  underestimate: `Ongeveer ${SUBSCRIPTION_BENCHMARK.pctUnderestimate}% van de mensen onderschat hoeveel abonnementen ze hebben.`,
  forget: `Naar schatting ${SUBSCRIPTION_BENCHMARK.pctForgetToCancel}% vergeet een abonnement op te zeggen dat niet meer gebruikt wordt.`,
  average: `Een gemiddeld huishouden heeft zo'n ${SUBSCRIPTION_BENCHMARK.avgCountPerHousehold} abonnementen en geeft rond de € ${SUBSCRIPTION_BENCHMARK.avgMonthlyPerPerson} per persoon per maand uit.`,
} as const
