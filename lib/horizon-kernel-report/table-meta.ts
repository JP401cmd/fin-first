/**
 * Horizon-kernel · beheer-transparantie — tabel-metadata (client-veilig).
 *
 * Pure data: geen node, geen getters, geen kern-runtime. Beschrijft per geporte
 * maandtabel wat de stap doet, welke keuzes erin zitten en hoe hij doorstroomt —
 * in gewone taal, zodat een beheerder (leek) de rekenstap kan volgen. Gedeeld door
 * de beheer-client (uitleg-blokken + tab-lijst) én de API-route/verificatie (de
 * `id`/`sheet`/`headerRows`-koppeling). De kolom-getters wonen bewust apart in
 * `table-columns.ts` (server) zodat dit bestand client-veilig blijft.
 */

/** Stabiele id van een geporte maandtabel (query-param + projectie-veld-sleutel). */
export type KernelTableId =
  | 'cf'
  | 'bel'
  | 'ont'
  | 'af'
  | 'toename-afname'
  | 'verdeling'
  | 'bez'
  | 's'
  | 'prognose'
  | 'werk'
  | 'pt'

/** Curatie per tabel: uitleg + keuzes + doorstroom + de standaard-kolommen (letters). */
export interface KernelTableMeta {
  readonly id: KernelTableId
  /** Excel-tabnaam (voor de verificatie-vergelijking). */
  readonly sheet: string
  /** Weergavenaam in de UI. */
  readonly naam: string
  /** Korte ondertitel. */
  readonly kicker: string
  /** Header-rijen bovenaan de Excel-tab (grid-offset voor de fixture-vergelijking). */
  readonly headerRows: number
  /** Wat doet deze stap? (2-3 zinnen, leek-taal). */
  readonly uitleg: string
  /** Welke keuzes/aannames zitten in deze stap? */
  readonly keuzes: readonly string[]
  /** Hoe stroomt het resultaat door naar de volgende stap? */
  readonly doorstroom: string
  /** Excel-kolomletters die standaard (compacte weergave) worden getoond. */
  readonly kernLetters: readonly string[]
}

/**
 * De elf geporte maandtabellen in de leesvolgorde van de rekenflow: van cashflow
 * en belasting, via de verdeel-waterval, naar de bezittingen/schulden en de
 * prognose die de solver leest.
 */
export const KERNEL_TABLES: readonly KernelTableMeta[] = [
  {
    id: 'cf',
    sheet: 'CF',
    naam: 'Cashflow (CF)',
    kicker: 'Stap 1 · maandelijkse geldstroom',
    headerRows: 1,
    uitleg:
      'De maandelijkse geldstroom: netto inkomen minus uitgaven geeft wat je overhoudt om te sparen. Gebeurtenis-baten (erfenis, meevallers) komen erbij, na FIRE komt de onttrekking uit je vermogen erbij. Alle bedragen worden nominaal gemaakt: een reëel bedrag van nu wordt met de inflatie opgehoogd naar het bedrag in dat toekomstige jaar.',
    keuzes: [
      'Eén-maand-lag: de Box 3-belasting in kolom K is die van de vórige maand (Bel!N van m−1) — het model rekent bewust met een maand vertraging, exact zoals het Excel.',
      'Vóór FIRE is de onttrekking 0; sparen = inkomen − uitgaven. Ná FIRE draait het om.',
      'Rente-vrijval (kolom G): valt een schuld weg, dan komt de rentelast vrij als extra ruimte.',
    ],
    doorstroom:
      'Kolom I (totaal extra geld) is het bedrag dat de stap "Toename en afname" over je potten gaat verdelen.',
    kernLetters: ['A', 'B', 'D', 'E', 'F', 'G', 'H', 'I', 'K'],
  },
  {
    id: 'bel',
    sheet: 'Bel',
    naam: 'Belasting Box 3 (Bel)',
    kicker: 'Stap 2 · vermogensbelasting',
    headerRows: 1,
    uitleg:
      'De Box 3-heffing per maand. Op basis van de grondslagen (spaargeld, beleggingen, schulden) van deze maand berekent het model zowel de forfaitaire heffing (fictief rendement × tarief) als — indien gekozen — de heffing op het werkelijke rendement. De canonieke heffing (kolom N) is de heffing die het model daadwerkelijk gebruikt.',
    keuzes: [
      'Methode-keuze P!B90: forfaitair rendement of werkelijk rendement bepaalt of kolom N uit de forfaitaire (K) of de werkelijke (M) tak komt.',
      'Heffingvrij vermogen en schuldendrempel worden per persoon geïndexeerd en × aantal fiscale personen geschaald.',
      'De fiscale kern-constanten (tarief, forfaits) komen uit de canonieke bron lib/box3-data.ts, niet uit een losse hardcode.',
    ],
    doorstroom:
      'De canonieke heffing (N) voedt volgende maand de Box 3-term van de cashflow; de forfaitaire heffing (K) telt cumulatief mee in de Prognose.',
    kernLetters: ['A', 'B', 'D', 'E', 'F', 'K', 'M', 'N'],
  },
  {
    id: 'ont',
    sheet: 'Ont',
    naam: 'Onttrekking (Ont)',
    kicker: 'Stap 3 · opname na FIRE',
    headerRows: 1,
    uitleg:
      'Hoeveel je na FIRE per maand uit je vermogen haalt om van te leven. De basis-onttrekking wordt bijgesteld met een fasefactor (go-go / slow-go / no-go: je geeft in je actieve jaren meer uit) en — bij het guardrails-profiel — met een correctie op basis van hoe je liquide vermogen zich verhoudt tot een ankerpunt.',
    keuzes: [
      'Onttrekkingsprofiel P!B69: Vast, Afnemend, Oplopend of Guardrails.',
      'Guardrails-anker P!B82 = het netto-liquide vermogen in de maand vlak vóór FIRE — het model legt dit zelf vast tijdens de doorrekening.',
      'Vóór FIRE is de onttrekking altijd 0 (kolom D); de fase-/guardrail-factoren zijn dan alleen weergave.',
    ],
    doorstroom:
      'De onttrekking (D) gaat terug de cashflow in en wordt door de Verdeling-waterval uit de juiste potten gehaald.',
    kernLetters: ['A', 'B', 'D', 'F', 'H', 'I'],
  },
  {
    id: 'af',
    sheet: 'Af',
    naam: 'Afname (Af)',
    kicker: 'Stap 4 · geplande kosten-gebeurtenissen',
    headerRows: 1,
    uitleg:
      'De som van alle geplande kosten-gebeurtenissen (negatieve posten uit de Gebeurtenissen-tabel) die in deze maand actief zijn, omgerekend naar nominaal. Denk aan een verbouwing of een grote eenmalige uitgave op een bepaalde leeftijd.',
    keuzes: [
      'Alleen negatieve gebeurtenis-posten (kosten) tellen hier; baten lopen via CF!H.',
      'Een post is actief tussen zijn start- en eind-maandindex; een eenmalige post vuurt precies één maand.',
    ],
    doorstroom:
      'De totale afname (D) is een extra uitgave-budget dat de Verdeling-waterval uit je potten haalt.',
    kernLetters: ['A', 'B', 'D'],
  },
  {
    id: 'toename-afname',
    sheet: 'Toename en afname',
    naam: 'Toename en afname',
    kicker: 'Stap 5 · verdeel-voorbereiding per categorie',
    headerRows: 2,
    uitleg:
      'Deze stap bepaalt per bezittings- en schuldcategorie hoeveel er bij komt (sparen/inleg) of af gaat (afname/onttrekking), volgens je strategie-prioriteiten. Het "extra geld" uit de cashflow wordt hier klaargezet om verdeeld te worden; ook het aflos-budget voor schulden ontstaat hier.',
    keuzes: [
      'De prio-mapping komt uit je toename-/afname-/onttrekkingsstrategie (P!B28/B29/B30).',
      'Zes bezittings-categorieën (Spaargeld, Beleggingen, Pensioen, Vastgoed, Eigen huis, Overig) en vijf schuld-categorieën.',
      'Standaard tonen we de totalen (kolom D–G); klap "alle kolommen" uit voor de per-categorie-bedragen.',
    ],
    doorstroom:
      'Het aflos-budget (som van de schuld-toename€) en de per-categorie-gewichten gaan naar de Verdeling-waterval.',
    kernLetters: ['A', 'B', 'D', 'E', 'F', 'G'],
  },
  {
    id: 'verdeling',
    sheet: 'Verdeling',
    naam: 'Verdeling (waterval)',
    kicker: 'Stap 6 · geld over de potten verdelen',
    headerRows: 3,
    uitleg:
      'De waterval die het budget (sparen, afname, onttrekking, aflossing) daadwerkelijk over de potten verdeelt. In meerdere "passes" wordt geld naar rato van gewichten toegewezen tot een pot vol/leeg is; wat overblijft gaat naar de reserve-categorieën. Zo respecteert het model je prioriteiten én de capaciteit van elke pot.',
    keuzes: [
      'Per onderwerp (afname, onttrekking, aflossing) draait dezelfde waterval-logica met eigen budgetten en caps.',
      'Prio 1–4 = gelijktijdig gewogen; prio 5 = reserve (alleen restant); niet-plaatsbaar aflos-budget vloeit terug naar bezitting-toename.',
      'Een tekort dat nergens past, wordt door de tekort-lening opgevangen (zichtbaar in de tabel S).',
    ],
    doorstroom:
      'De eind-toewijzingen per categorie gaan naar Bez (inleg/afname) en S (aflossing); onbenut budget wordt tekort.',
    kernLetters: ['A', 'B', 'D', 'BX', 'EQ'],
  },
  {
    id: 'bez',
    sheet: 'Bez',
    naam: 'Bezittingen (Bez)',
    kicker: 'Stap 7 · vermogen per pot',
    headerRows: 3,
    uitleg:
      'De waarde-ontwikkeling van elke bezittings-pot per maand: de waarde van vorige maand krijgt rendement, plus de nieuwe inleg uit de Verdeling. Onderaan staan de totalen per Box 3-type en per categorie, plus het woningblok (verkoop, huur, opeethypotheek).',
    keuzes: [
      'Tien potten (slots D…AG); de eigen woning heeft een vaste plek (slot 2) met een eigen woningblok.',
      'Rendement wordt over de waarde van vorige maand gerekend; inleg komt er ná het rendement bij.',
      'Standaard tonen we de totalen; klap "alle kolommen" uit voor de afzonderlijke potten en het woningblok.',
    ],
    doorstroom:
      'De totalen per Box 3-type voeden de belasting; de categorie-totalen en het woningblok voeden de Prognose en de cashflow.',
    kernLetters: ['A', 'B', 'AH', 'AI', 'AJ', 'AK', 'AL', 'AR'],
  },
  {
    id: 's',
    sheet: 'S',
    naam: 'Schulden (S)',
    kicker: 'Stap 8 · schulden incl. tekort-lening',
    headerRows: 3,
    uitleg:
      'De saldo-ontwikkeling van elke schuld-pot: het saldo van vorige maand minus de geplande en extra aflossing, plus rente. De laatste schuld-slot is de tekort-lening: een vangnet dat bijspringt als het model in enige maand geld tekortkomt — de piek daarvan bepaalt mede de FIRE-status.',
    keuzes: [
      'Zeven schuld-slots (D…AE, 4 kolommen per slot: saldo, aflossing, extra, rente).',
      'Slot 6 is de tekort-lening (kolom AB): startsaldo 0, groeit alleen bij een echt tekort.',
      'Totalen per Box 3-type (AF/AG) en per categorie (AJ…AN) staan rechts.',
    ],
    doorstroom:
      'De schuld-totalen voeden de Prognose (netto vermogen); de tekort-lening-piek gaat naar de solver-status.',
    kernLetters: ['A', 'B', 'D', 'AB', 'AF', 'AG', 'AH', 'AI'],
  },
  {
    id: 'prognose',
    sheet: 'Prognose',
    naam: 'Prognose',
    kicker: 'Stap 9 · netto vermogen & netto-liquide',
    headerRows: 1,
    uitleg:
      'De maandelijkse eindstand: totale bezittingen minus schulden geeft het netto vermogen (kolom I). Daarnaast berekent het model het netto-liquide vermogen (kolom J): het deel dat je écht kunt aanspreken, dus zonder de eigen woning en andere niet-liquide bezittingen. Dat onderscheid is cruciaal — de FIRE-toets kijkt naar netto-liquide, niet naar netto vermogen.',
    keuzes: [
      'Netto vermogen (I) telt álles mee; netto-liquide (J) laat niet-liquide bezit en niet-liquide leningen buiten beschouwing.',
      'De cumulatieve Box 3-heffing (G) wordt hier meegenomen.',
    ],
    doorstroom:
      'Kolom J (netto-liquide) is de lijn die de solver aftast: op de FIRE-maand moet die het doelbedrag halen.',
    kernLetters: ['A', 'B', 'D', 'E', 'H', 'I', 'J'],
  },
  {
    id: 'werk',
    sheet: 'Werk-strategie',
    naam: 'Werk-strategie',
    kicker: 'Stap 10 · salarisontwikkeling',
    headerRows: 1,
    uitleg:
      'De ontwikkeling van je (reële) salaris over de jaren: groei boven inflatie, salarissprongen en deeltijd-stappen. Het verschil met je basissalaris wordt nominaal gemaakt en — alleen zolang je werkt (vóór FIRE) — als extra inkomen aan de cashflow toegevoegd.',
    keuzes: [
      'Reële groei per jaar (boven inflatie); 0 = strategie effectief uit.',
      'Optioneel een plafond, salarissprongen en deeltijd-percentages.',
      'De delta is gegate op FIRE: na stoppen met werken vervalt het extra salaris.',
    ],
    doorstroom: 'De gegate salaris-delta (S) telt op bij het inkomen in de cashflow.',
    kernLetters: ['N', 'O', 'P', 'S'],
  },
  {
    id: 'pt',
    sheet: 'PT',
    naam: 'Partner (PT)',
    kicker: 'Stap 11 · partner-inkomen',
    headerRows: 1,
    uitleg:
      'Bij een huishouden-run: het inkomen van de partner per maand. Tot de partner-AOW-leeftijd telt het geïndexeerde werkinkomen mee; daarna de partner-AOW (plus eventueel partnerpensioen). Zonder partner blijft deze tabel leeg en is de projectie identiek aan een solo-run.',
    keuzes: [
      'De partner heeft een eigen tijdas (leeftijd, AOW-drempel) afgeleid van het geboortejaar.',
      'Dit beheer-scherm draait een solo-projectie; een echte huishouden-run is hier bewust niet meegenomen.',
    ],
    doorstroom: 'Het partner-totaal (K) telt op bij het inkomen in de cashflow en de onttrekking.',
    kernLetters: ['G', 'H', 'I', 'J', 'K'],
  },
]

/** Zoek de metadata van één tabel; `undefined` bij een onbekende id. */
export function findKernelTableMeta(id: string): KernelTableMeta | undefined {
  return KERNEL_TABLES.find((t) => t.id === id)
}
