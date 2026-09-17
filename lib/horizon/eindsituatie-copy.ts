/**
 * Copy bij de eindsituatie-duiding op /toekomst en in het totaalplan (pure).
 *
 * De detector (`eindsituatie-duiding.ts`) levert de feiten; deze module maakt er
 * gewone taal van. Hij kent geen React en formatteert zelf geen bedragen: de consument
 * geeft `bedragTekst` mee (masked-aware, exact één deflatie via `lib/euro-display.ts`),
 * zodat de copy volledig unit-testbaar blijft. Spiegelt `deficit-loan-copy.ts`.
 *
 * WFT-GRENS (toongrendel): elke zin beschrijft een REKENUITKOMST. Geen opdrachten,
 * geen aanbevelingen, geen beloftes. `eindsituatie-copy.test.ts` grendelt dit over alle
 * oorzaken.
 */

import type { EindOorzaak, EindsituatieDuiding, NominaalOpLeeftijd } from './eindsituatie-duiding'

export interface EindsituatieCopyInput {
  duiding: EindsituatieDuiding
  endForm: 'deplete' | 'legacy' | 'perpetual'
  /** Formatteer een nominaal bedrag voor weergave (deflatie + masked in de consument). */
  bedragTekst: (b: NominaalOpLeeftijd) => string
}

export interface EindsituatieCopy {
  kop: string
  samenvatting: string
  /** Eén zin per oorzaak, in de volgorde van de detector. */
  oorzaken: string[]
  /** Huis en opeetschuld, apart benoemd, of null. */
  context: string | null
  /** Zin wanneer er niet één regel aan te wijzen is, of null. */
  onduidelijk: string | null
  /** Vooraf ingevulde vraag voor Fin — bewust zonder bedragen. */
  finVraag: string
  /**
   * De oorzaken uit deze melding in de ik-vorm voor het Fin-gesprek — instellingen en
   * leeftijden, bewust zonder bedragen. Fins AI-context kent de tekort-lening, het
   * opeetplafond en de eindsituatie-detector niet; zonder deze regel valt Fin terug op
   * een algemene rendementsuitleg.
   */
  finContext: string
  disclaimer: string
}

export const EINDSITUATIE_INSTELLING_HREF = '/toekomst/voorkeuren?regel=eindstrategie'
export const EINDSITUATIE_INSTELLING_LABEL = 'Bekijk of wijzig je plan →'

function heel(age: number | null): number | null {
  return age != null && Number.isFinite(age) ? Math.floor(age) : null
}

function oorzaakZin(o: EindOorzaak, input: EindsituatieCopyInput): string {
  const age = heel(o.age)
  const opLeeftijd = age != null ? `je ${age}e` : 'een later moment'
  switch (o.id) {
    case 'nu-stoppen':
      return 'Je vermogen is nu al groot genoeg om te stoppen. Het vroegste stopmoment is daarom vandaag, en wat je in je plan niet nodig hebt, blijft staan en groeit door.'
    case 'geen-tekort-lening': {
      // Een dieptepunt ≤ €0 is een korte brug die binnen een jaar weer is afgelost (ADR 0149):
      // dan is het geld óp, en een negatief bedrag zou alleen verwarren.
      const stand =
        o.bedrag && o.bedrag.bedrag > 0 ? `bijna op (${input.bedragTekst(o.bedrag)})` : 'op'
      return `Omdat je plan geen tekort-lening gebruikt (standaard), bepaalt ${opLeeftijd} je stopmoment: daar is je liquide geld ${stand}. Eerder stoppen zou op dat moment een lening vragen. Daarna groeit het weer, en dat blijft aan het eind over.`
    }
    case 'opeet-plafond':
      return `Op ${opLeeftijd} is het leenplafond van je opeethypotheek bereikt. Daarna komt er geen nieuw geld uit je huis en draagt je liquide vermogen de jaren erna zelf. Dat bepaalt mee hoe vroeg je kunt stoppen.`
    case 'later-inkomen':
      return `Vanaf ${opLeeftijd} dekt je inkomen, zoals AOW, pensioen of de bijdrage van je partner, je uitgaven. Je vermogen wordt dan niet meer aangesproken en groeit door met rendement.`
    case 'late-baten': {
      const bedrag = o.bedrag ? `${input.bedragTekst(o.bedrag)} ` : 'geld '
      return `Op ${opLeeftijd} komt er eenmalig ${bedrag}binnen, bijvoorbeeld uit een erfenis of een verkoop. Dat geld is na je stopmoment niet meer nodig om rond te komen en blijft staan.`
    }
    case 'dalend-profiel':
      return `Vanaf ${opLeeftijd} rekent je plan met lagere uitgaven dan in de eerste jaren na je stopmoment. Wat daardoor niet wordt uitgegeven, blijft staan.`
  }
}

/** Dezelfde oorzaak als `oorzaakZin`, in de ik-vorm en zonder bedragen (voor Fin). */
function finOorzaak(o: EindOorzaak): string {
  const age = heel(o.age)
  const op = age != null ? `mijn ${age}e` : 'een later moment'
  switch (o.id) {
    case 'nu-stoppen':
      return 'mijn vermogen is nu al groot genoeg om te stoppen, dus het vroegste stopmoment is vandaag en wat ik niet nodig heb blijft staan'
    case 'geen-tekort-lening':
      return `mijn plan gebruikt geen tekort-lening (standaardinstelling); rond ${op} is mijn liquide geld (bijna) op en dat moment bepaalt mijn vroegste stopmoment, eerder stoppen zou daar een lening vragen, en daarna groeit het vermogen weer`
    case 'opeet-plafond':
      return `op ${op} is het leenplafond van mijn opeethypotheek bereikt; daarna komt er geen nieuw geld uit mijn huis en draagt mijn liquide vermogen de jaren erna zelf, wat mee bepaalt hoe vroeg ik kan stoppen`
    case 'later-inkomen':
      return `vanaf ${op} dekt inkomen (AOW, pensioen of de bijdrage van mijn partner) mijn uitgaven, zodat mijn vermogen niet meer wordt aangesproken en doorgroeit`
    case 'late-baten':
      return `op ${op} komt er eenmalig geld binnen (bijvoorbeeld erfenis of verkoop) dat na mijn stopmoment niet meer nodig is`
    case 'dalend-profiel':
      return `vanaf ${op} rekent mijn plan met lagere uitgaven dan in de eerste jaren na mijn stopmoment`
  }
}

/** Bouw de uitleg bij een gedetecteerde eindsituatie. Alle getallen komen uit dezelfde run. */
export function buildEindsituatieCopy(input: EindsituatieCopyInput): EindsituatieCopy {
  const { duiding, endForm } = input
  const eind = heel(duiding.eindAge)

  const kop =
    endForm === 'legacy'
      ? 'Aan het eind blijft er meer over dan de nalatenschap die je koos'
      : endForm === 'perpetual'
        ? 'Aan het eind is er meer dan "niet laten slinken" vraagt'
        : 'Aan het eind blijft er meer over dan "vermogen opeten" doet verwachten'

  const samenvatting = `Op je ${eind}e staat er in deze berekening ${input.bedragTekst(duiding.overschot)} meer dan je plan daar nodig heeft.`

  const oorzaken = duiding.oorzaken.map((o) => oorzaakZin(o, input))

  const { huis, opeetschuld } = duiding.context
  let context: string | null = null
  if (huis && opeetschuld) {
    context = `Daarnaast staat er vermogen dat niet in dit bedrag zit: de overwaarde van je huis (${input.bedragTekst(huis)}) telt niet mee in "opeten", en de opeetschuld (${input.bedragTekst(opeetschuld)}) staat tegenover je huis en wordt bij een verkoop met de opbrengst verrekend.`
  } else if (huis) {
    context = `Daarnaast staat er vermogen dat niet in dit bedrag zit: de overwaarde van je huis (${input.bedragTekst(huis)}) telt niet mee in "opeten".`
  } else if (opeetschuld) {
    context = `De opeetschuld (${input.bedragTekst(opeetschuld)}) zit niet in dit bedrag; die staat tegenover je huis en wordt bij een verkoop met de opbrengst verrekend.`
  }

  const bindend = duiding.oorzaken.filter((o) => o.id === 'nu-stoppen' || o.id === 'geen-tekort-lening' || o.id === 'opeet-plafond')
  const onduidelijk = duiding.eenduidig
    ? null
    : bindend.length > 1
      ? 'Hier spelen meerdere regels tegelijk, dus er is niet één oorzaak aan te wijzen.'
      : 'Er is uit de berekening niet één regel aan te wijzen die dit verklaart.'

  const vorm = endForm === 'legacy' ? 'een nalatenschap' : endForm === 'perpetual' ? '"niet laten slinken"' : '"vermogen opeten"'
  const finVraag = `Ik heb ${vorm} gekozen, maar in mijn plan blijft er op mijn ${eind}e veel meer over dan ik verwacht. Hoe komt dat? Leg per oorzaak uit hoe die instelling of dat moment dit eindbedrag veroorzaakt en welke het zwaarst weegt, in plaats van een algemene uitleg over rendement.`

  const finDelen: string[] = []
  if (duiding.oorzaken.length > 0) {
    finDelen.push(
      `De uitleg bij mijn plan noemt deze oorzaken: ${duiding.oorzaken.map((o, i) => `(${i + 1}) ${finOorzaak(o)}`).join('; ')}.`,
    )
  }
  if (huis || opeetschuld) {
    const buiten = [
      huis ? 'de overwaarde van mijn huis' : null,
      opeetschuld ? 'de opeetschuld (die tegenover mijn huis staat)' : null,
    ].filter(Boolean)
    finDelen.push(`Niet in het overschot zit: ${buiten.join(' en ')}.`)
  }
  if (onduidelijk) finDelen.push(onduidelijk.replace(/^Hier spelen/, 'Volgens de uitleg spelen').replace(/^Er is uit/, 'Volgens de uitleg is er uit'))
  const finContext = finDelen.join(' ')

  return {
    kop,
    samenvatting,
    oorzaken,
    context,
    onduidelijk,
    finVraag,
    finContext,
    disclaimer: 'Indicatie, geen advies — een rekenuitkomst bij je huidige aannames.',
  }
}
