// ── Het doelgroep-lexicon: welke woorden een doelgroepclaim mogen dragen ─────
//
// G6 van de duidingspoort (1F fase 2). Een doelgroepregel is een uitspraak over
// WIE dit raakt. Zo'n uitspraak moet uit de bron komen; verzint het model 'm,
// dan landt het artikel bij de verkeerde lezer — en dat is erger dan geen
// artikel. Maar "staat het in de bron" is voor een doelgroep geen numerieke
// vraag: er valt niets te gronden aan `wonen in [huur-sociaal]`.
//
// Daarom deze gesloten tabel: per doelgroepsleutel de woorden die het DOMEIN
// benoemen, en per waarde (bij `keuze`/`meerkeuze`) de woorden die de
// KWALIFICATIE benoemen. Eén treffer volstaat per niveau; matchen gaat op
// genormaliseerde deelstring, zodat "woninghuur" het trefwoord "huur" dekt.
//
// TWEE NIVEAUS, BEWUST VERSCHILLEND GEBRUIKT:
//   - `sleutel`-woorden zijn breed ("huur", "inkomen", "pensioen"). Ze toetsen
//     alleen de DOELGROEPREGEL: noemt de bron dit domein überhaupt?
//   - `waarden`-woorden zijn de kwalificaties ("sociale sector", "vrije
//     sector", "zzp", "lijfrente"). Die toetsen óók de SAMENVATTING: een
//     samenvatting die het onderscheid maakt terwijl de bron dat niet doet,
//     verzint de helft van haar inhoud. De brede sleutelwoorden blijven daar
//     bewust buiten — anders degradeert elke samenvatting die het woord
//     "huishoudens" gebruikt terwijl het fragment "huishouden" niet noemt.
//
// Voor `jaartal` en `band` is er geen waardelijst: het getal zelf valt al onder
// G1 (elk getal in de samenvatting moet gegrond zijn) en de bandsleutels
// ('25k-50k') zijn interne notatie, geen woorden uit een tekst.
//
// De dekking is HARD: `doelgroep-lexicon.test.ts` eist een ingang voor elke
// sleutel in `DOELGROEP_SLEUTELS` en voor elke waarde van een keuze- of
// meerkeuzeveld. Een nieuwe sleutel of waarde zonder lexicon-ingang maakt die
// test rood — anders zou er stil iets ongepolicied doorheen glippen.
//
// PUUR: alleen constanten — client-veilig.

import { DOELGROEP_SLEUTELS, type DoelgroepSleutel } from './profiel-velden'

export interface LexiconIngang {
  /** Woorden die het domein van deze sleutel benoemen; één ervan moet in de grondslag staan. */
  sleutel: readonly string[]
  /** Per waarde de kwalificerende woorden. Leeg bij `jaartal`/`band`. */
  waarden: Readonly<Record<string, readonly string[]>>
}

export const DOELGROEP_LEXICON: Record<DoelgroepSleutel, LexiconIngang> = {
  geboortejaar: {
    sleutel: ['geboortejaar', 'geboren', 'leeftijd', 'cohort', 'jaargang', 'aow', 'ouderen', 'jongeren'],
    waarden: {},
  },
  huishouden: {
    sleutel: ['huishouden', 'partner', 'alleenstaand', 'gezin', 'samenwon', 'gehuwd'],
    waarden: {
      alleen: ['alleenstaand', 'zonder partner', 'eenpersoons', 'alleenwonend'],
      'fiscaal-partner': ['fiscaal partner', 'fiscale partner', 'fiscaal partnerschap', 'gehuwd', 'getrouwd', 'geregistreerd partnerschap'],
      'samenwonend-zonder-fiscaal-partner': ['samenwonend', 'samenwonen', 'zonder fiscaal partner', 'tweepersoons'],
    },
  },
  kinderen: {
    sleutel: ['kind', 'kinderen', 'gezin', 'kinderopvang', 'kinderbijslag', 'ouders'],
    waarden: {
      geen: ['geen kinderen', 'zonder kinderen', 'kinderloos'],
      'jongste-0-3': ['kinderopvang', 'peuter', 'baby', 'jonge kinderen', '0 tot 3'],
      'jongste-4-11': ['basisschool', 'basisonderwijs', 'schoolgaande', '4 tot 11'],
      'jongste-12-17': ['middelbare school', 'voortgezet onderwijs', 'tiener', '12 tot 17'],
      'alleen-18-plus': ['18 jaar', 'volwassen kinderen', 'meerderjarig', 'studerende kinderen'],
    },
  },
  werk: {
    sleutel: ['werk', 'baan', 'arbeid', 'beroep', 'werkend', 'banen'],
    waarden: {
      loondienst: ['loondienst', 'werknemer', 'werkgever', 'salaris', 'in dienst'],
      zelfstandig: ['zelfstandig', 'zzp', 'ondernemer', 'eenmanszaak', 'freelance', 'winst uit onderneming'],
      dga: ['dga', 'directeur-grootaandeelhouder', 'aanmerkelijk belang', 'box 2'],
      uitkering: ['uitkering', 'bijstand', 'ww', 'wia', 'wajong', 'participatiewet'],
      pensioen: ['gepensioneerd', 'met pensioen', 'aow', 'pensioenuitkering'],
      studie: ['student', 'studie', 'studeren', 'studiefinanciering', 'duo'],
    },
  },
  inkomen: {
    sleutel: ['inkomen', 'salaris', 'loon', 'verdien', 'koopkracht', 'inkomens'],
    waarden: {},
  },
  wonen: {
    sleutel: ['woning', 'wonen', 'huur', 'huis', 'woonlasten', 'hypotheek'],
    waarden: {
      'huur-sociaal': ['sociale huur', 'sociale sector', 'woningcorporatie', 'corporatie', 'gereguleerde huur'],
      'huur-vrije-sector': ['vrije sector', 'vrijesector', 'geliberaliseerde huur', 'vrije huursector', 'particuliere verhuur'],
      'koop-met-hypotheek': ['hypotheek', 'eigenwoningschuld', 'hypothecaire lening', 'eigen woning'],
      'koop-zonder-hypotheek': ['zonder hypotheek', 'hypotheekvrij', 'volledig afgelost'],
      inwonend: ['inwonend', 'thuiswonend', 'bij de ouders', 'kamer huren'],
    },
  },
  hypotheek_restschuld: {
    sleutel: ['hypotheek', 'restschuld', 'eigenwoningschuld', 'hypotheekschuld'],
    waarden: {},
  },
  hypotheek_rentevast: {
    sleutel: ['rentevast', 'hypotheekrente', 'rentevaste periode', 'hypotheek'],
    waarden: {
      'tot-1-jaar': ['tot 1 jaar', '1 jaar vast', 'korte rentevaste periode', 'jaarlijks herzien'],
      '2-5-jaar': ['5 jaar vast', '2 tot 5 jaar', '2-5 jaar', 'korte rentevaste periode'],
      'boven-5-jaar': ['10 jaar vast', '20 jaar vast', '30 jaar vast', 'lange rentevaste periode', 'langer dan 5 jaar'],
      variabel: ['variabele rente', 'variabele hypotheekrente', 'zonder rentevaste periode'],
    },
  },
  woonplan: {
    sleutel: ['kopen', 'koopplan', 'woningmarkt', 'starter', 'verhuizen', 'huis kopen'],
    waarden: {
      'kopen-binnen-2-jaar': ['huis kopen', 'woning kopen', 'starter', 'op zoek naar een woning', 'binnen 2 jaar'],
      'geen-koopplan': ['geen koopplan', 'blijft huren', 'niet van plan te kopen'],
    },
  },
  spaargeld: {
    sleutel: ['spaargeld', 'sparen', 'spaarrekening', 'spaartegoed', 'vermogen', 'box 3', 'spaarder'],
    waarden: {},
  },
  beleggingen: {
    sleutel: ['beleg', 'belegging', 'vermogen', 'box 3', 'portefeuille', 'rendement'],
    waarden: {},
  },
  beleggingen_vorm: {
    sleutel: ['beleg', 'belegging', 'vermogen', 'box 3'],
    waarden: {
      fondsen: ['fonds', 'beleggingsfonds', 'etf', 'indexfonds', 'tracker'],
      aandelen: ['aandeel', 'aandelen', 'beurs', 'effecten'],
      crypto: ['crypto', 'bitcoin', 'cryptovaluta', 'digitale munt'],
      'tweede-woning': ['tweede woning', 'vakantiewoning', 'verhuurde woning', 'beleggingspand', 'tweede huis'],
    },
  },
  schulden: {
    sleutel: ['schuld', 'lening', 'krediet', 'aflossen', 'schulden'],
    waarden: {
      'studieschuld-tot-15k': ['studieschuld', 'studielening', 'studiefinanciering', 'duo'],
      'studieschuld-15k-40k': ['studieschuld', 'studielening', 'studiefinanciering', 'duo'],
      'studieschuld-boven-40k': ['studieschuld', 'studielening', 'studiefinanciering', 'duo'],
      'consumptief-krediet': ['consumptief krediet', 'persoonlijke lening', 'doorlopend krediet', 'roodstand', 'creditcard'],
      geen: ['geen schulden', 'schuldenvrij', 'zonder schulden'],
    },
  },
  pensioen_werkgever: {
    sleutel: ['pensioen', 'pensioenopbouw', 'pensioenfonds', 'pensioenregeling'],
    waarden: {
      ja: ['pensioenregeling', 'bouwt pensioen op', 'via de werkgever', 'pensioenfonds', 'deelnemer'],
      nee: ['geen pensioenregeling', 'geen pensioenopbouw', 'witte vlek', 'bouwt geen pensioen op'],
      'weet-niet': ['weet niet', 'onbekend of', 'onduidelijk of'],
    },
  },
  pensioen_lijfrente: {
    sleutel: ['lijfrente', 'jaarruimte', 'derde pijler', 'banksparen', 'pensioengat'],
    waarden: {
      ja: ['lijfrente', 'jaarruimte', 'banksparen', 'derde pijler'],
      nee: ['geen lijfrente', 'zonder lijfrente', 'geen jaarruimte'],
    },
  },
}

/** Alle kwalificerende woorden (waardeniveau) van het hele lexicon, ontdubbeld. */
export const KWALIFICATIE_WOORDEN: readonly string[] = [
  ...new Set(Object.values(DOELGROEP_LEXICON).flatMap((ingang) => Object.values(ingang.waarden).flat())),
].sort()

/** Zelfde normalisatie aan beide kanten: kleine letters, één spatie, koppeltekens gelijk. */
export function normaliseerVoorLexicon(tekst: string): string {
  return tekst
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Staat één van `woorden` in de (genormaliseerde) tekst? */
export function dektEenWoord(genormaliseerdeTekst: string, woorden: readonly string[]): boolean {
  return woorden.some((w) => genormaliseerdeTekst.includes(normaliseerVoorLexicon(w)))
}

/** Het soort van een doelgroepsleutel — bepaalt of waarden een eigen lexicon hebben. */
export function heeftWaardeLexicon(sleutel: DoelgroepSleutel): boolean {
  const soort = DOELGROEP_SLEUTELS[sleutel].soort
  return soort === 'keuze' || soort === 'meerkeuze'
}
