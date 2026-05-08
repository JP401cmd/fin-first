/**
 * Life Event Stories — inspirerende vragen-flow vóór de drie impact-blokken.
 *
 * Per event-type kunnen we 2-5 warme vragen stellen die de gebruiker helpen
 * de financiële impact te bepalen — zonder direct te denken in eenmalig /
 * tijdelijk / continu. Antwoorden worden via `computeImpact` vertaald naar
 * de drie blokken (form-state). Bij heropen worden ze gereconstrueerd uit
 * `metadata.story_answers`.
 *
 * Niet elk event-type heeft een story. Types zonder story laten gewoon de
 * drie generieke blokken zien (zoals `custom`, `move`, etc.).
 */

import {
  nibudChildrenCost,
  berekenKinderopvangNetto,
  kinderbijslagPerMaand,
  NIBUD_CHILDREN_MONTHLY_COST,
} from '@/lib/horizon-data'

// ─── Question schema ──────────────────────────────────────────────

export type StoryAnswerValue = string | number | boolean

export type StoryQuestion =
  | {
      key: string
      type: 'tile'
      label: string
      microcopy?: string
      options: { value: string | number; label: string; emoji?: string; sublabel?: string }[]
      default: string | number
    }
  | {
      key: string
      type: 'segmented'
      label: string
      microcopy?: string
      options: { value: string | number; label: string }[]
      default: string | number
    }
  | {
      key: string
      type: 'slider'
      label: string
      microcopy?: string
      min: number
      max: number
      step?: number
      suffix?: string
      default: number
    }
  | {
      key: string
      type: 'number'
      label: string
      microcopy?: string
      min?: number
      max?: number
      step?: number
      suffix?: string
      default: number
    }
  | {
      key: string
      type: 'toggle'
      label: string
      microcopy?: string
      default: boolean
    }

/** Output van een story: partial impact-velden om in te mergen in form state. */
export interface StoryImpact {
  oneTimeAmount?: number
  oneTimeDirection?: 'income' | 'expense'
  tempEnabled?: boolean
  tempAmount?: number
  tempDirection?: 'income' | 'expense'
  tempDurationYears?: number
  tempIndexed?: boolean
  contEnabled?: boolean
  contAmount?: number
  contDirection?: 'income' | 'expense'
  contIndexed?: boolean
  /** Optionele suggested name & shared_age. */
  suggestedName?: string
  suggestedAge?: number
}

export interface LifeEventStory {
  /** Editorial intro shown above the questions. */
  intro: string
  /** Korte vraag bovenaan — vetgedrukt headline met optionele *italic* emphasis. */
  headline: string
  /** Het woord dat italic emphasis krijgt in de headline. */
  headlineEmphasis?: string
  questions: StoryQuestion[]
  /** Map answers → impact-deltas. baseAge = profiel currentAge fallback. */
  computeImpact: (answers: Record<string, StoryAnswerValue>, baseAge: number) => StoryImpact
}

// ─── Helpers ──────────────────────────────────────────────────────

function num(v: StoryAnswerValue | undefined, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}
function str(v: StoryAnswerValue | undefined, fallback: string): string {
  return typeof v === 'string' ? v : fallback
}
function bool(v: StoryAnswerValue | undefined, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

// ─── Stories ──────────────────────────────────────────────────────

export const LIFE_EVENT_STORIES: Record<string, LifeEventStory> = {

  children: {
    intro:
      'Een nieuw mens in je leven is geen kostenpost — het is een tijdperk. Hieronder vragen helpen je een eerlijk beeld te schetsen, zonder dat het zwaar wordt.',
    headline: 'Een kind in je leven',
    headlineEmphasis: 'kind',
    questions: [
      {
        key: 'aantal',
        type: 'tile',
        label: 'Hoeveel kindjes droom je over?',
        options: [
          { value: 1, label: 'Eén', emoji: '👶' },
          { value: 2, label: 'Twee', emoji: '👶👶' },
          { value: 3, label: 'Drie', emoji: '👶👶👶' },
          { value: 4, label: 'Vier of meer', emoji: '👶✨' },
        ],
        default: 1,
      },
      {
        key: 'startAge',
        type: 'slider',
        label: 'Wanneer komt het eerste?',
        microcopy: 'Jouw leeftijd op dat moment.',
        min: 18,
        max: 50,
        step: 1,
        suffix: 'jaar',
        default: 32,
      },
      {
        key: 'thuisTotJaren',
        type: 'tile',
        label: 'Hoelang verwacht je verhoogde kosten?',
        microcopy: 'Tot ze min of meer op eigen benen staan.',
        options: [
          { value: 18, label: 'Tot ~18', sublabel: 'Tot ze uit huis gaan' },
          { value: 23, label: 'Tot ~23', sublabel: 'Studie meegerekend' },
          { value: 27, label: 'Tot ~27', sublabel: 'Iets langer steun' },
        ],
        default: 23,
      },
      {
        key: 'opvangDagen',
        type: 'segmented',
        label: 'Kinderopvang doordeweeks?',
        microcopy: 'Netto kosten na toeslag — afhankelijk van inkomen.',
        options: [
          { value: 0, label: 'Nee' },
          { value: 2, label: '2 dagen' },
          { value: 3, label: '3 dagen' },
          { value: 4, label: '4-5 dagen' },
        ],
        default: 3,
      },
      {
        key: 'kinderbijslag',
        type: 'toggle',
        label: 'Kinderbijslag meerekenen',
        microcopy: 'SVB-uitkering, automatisch verrekend.',
        default: true,
      },
    ],
    computeImpact(answers, baseAge) {
      const aantal = num(answers.aantal, 1)
      const startAge = num(answers.startAge, baseAge + 2)
      const thuisTotJaren = num(answers.thuisTotJaren, 23)
      const opvangDagen = num(answers.opvangDagen, 3)
      const kinderbijslagAan = bool(answers.kinderbijslag, true)
      const nibudPerMnd = nibudChildrenCost(aantal)
      const opvangPerMnd = berekenKinderopvangNetto(opvangDagen, aantal)
      const bijslagPerMnd = kinderbijslagAan ? kinderbijslagPerMaand(aantal) : 0
      const monthlyExpense = Math.max(0, Math.round(nibudPerMnd + opvangPerMnd - bijslagPerMnd))
      const oneTime = aantal * 3000 // ~€3k uitzet per kind
      return {
        oneTimeAmount: oneTime,
        oneTimeDirection: 'expense',
        tempEnabled: true,
        tempAmount: monthlyExpense,
        tempDirection: 'expense',
        tempDurationYears: thuisTotJaren,
        tempIndexed: true,
        contEnabled: false,
        suggestedAge: startAge,
        suggestedName: aantal === 1 ? 'Mijn kind' : `${aantal} kinderen`,
      }
    },
  },

  sabbatical: {
    intro:
      'Een pauze om weer adem te halen, te reizen, te leren of helemaal niets. Een waardevolle investering — laten we kijken wat het kost.',
    headline: 'Tijd voor jezelf',
    headlineEmphasis: 'jezelf',
    questions: [
      {
        key: 'duurMnd',
        type: 'tile',
        label: 'Hoelang ben je weg?',
        options: [
          { value: 3, label: '3 maanden', emoji: '🌱' },
          { value: 6, label: '6 maanden', emoji: '🌿' },
          { value: 12, label: 'Een jaar', emoji: '🌳' },
          { value: 24, label: 'Twee jaar', emoji: '🌲' },
        ],
        default: 6,
      },
      {
        key: 'startAge',
        type: 'number',
        label: 'Vanaf welke leeftijd?',
        min: 18,
        max: 70,
        suffix: 'jaar',
        default: 40,
      },
      {
        key: 'nettoMaand',
        type: 'number',
        label: 'Wat verdien je nu netto per maand?',
        microcopy: 'Tijdens je sabbatical valt dit (deels) weg.',
        min: 0,
        step: 100,
        suffix: '€/mnd',
        default: 3000,
      },
      {
        key: 'doorbetaling',
        type: 'segmented',
        label: 'Werkgever betaalt door?',
        microcopy: 'Sommige cao-regelingen geven gedeeltelijk door.',
        options: [
          { value: 0, label: '0%' },
          { value: 25, label: '25%' },
          { value: 50, label: '50%' },
          { value: 100, label: '100%' },
        ],
        default: 0,
      },
      {
        key: 'bestemming',
        type: 'tile',
        label: 'Waar ga je heen?',
        microcopy: 'Bepaalt extra reis- en verblijfkosten.',
        options: [
          { value: 'thuis', label: 'Thuis blijven', emoji: '🏡', sublabel: 'Geen extra kosten' },
          { value: 'europa', label: 'Europa', emoji: '🇪🇺', sublabel: '€2.000 setup' },
          { value: 'wereld', label: 'Wereldwijd', emoji: '🌍', sublabel: '€6.000 setup' },
        ],
        default: 'europa',
      },
    ],
    computeImpact(answers) {
      const duurMnd = num(answers.duurMnd, 6)
      const nettoMaand = num(answers.nettoMaand, 3000)
      const doorbetaling = num(answers.doorbetaling, 0) / 100
      const verlies = Math.round(nettoMaand * (1 - doorbetaling))
      const bestemming = str(answers.bestemming, 'europa')
      const setup =
        bestemming === 'thuis' ? 0 : bestemming === 'europa' ? 2000 : 6000
      return {
        oneTimeAmount: setup,
        oneTimeDirection: 'expense',
        tempEnabled: verlies > 0,
        tempAmount: verlies,
        tempDirection: 'expense',
        tempDurationYears: Math.max(1, Math.round(duurMnd / 12)),
        tempIndexed: false,
        contEnabled: false,
        suggestedAge: num(answers.startAge, 40),
        suggestedName: 'Mijn sabbatical',
      }
    },
  },

  world_trip: {
    intro:
      'De wereld zien — alleen, met een rugzak, of met je gezin. Een avontuur vraagt budget en (vaak) een tijdelijke pauze van inkomen.',
    headline: 'Een grote reis',
    headlineEmphasis: 'reis',
    questions: [
      {
        key: 'duurMnd',
        type: 'tile',
        label: 'Hoelang reis je?',
        options: [
          { value: 2, label: '2 maanden', emoji: '🎒' },
          { value: 6, label: '6 maanden', emoji: '✈️' },
          { value: 12, label: 'Een jaar', emoji: '🌏' },
        ],
        default: 6,
      },
      {
        key: 'startAge',
        type: 'number',
        label: 'Vanaf welke leeftijd?',
        min: 18,
        max: 80,
        suffix: 'jaar',
        default: 35,
      },
      {
        key: 'reisstijl',
        type: 'tile',
        label: 'Hoe reis je?',
        options: [
          { value: 'budget', label: 'Backpack', emoji: '🎒', sublabel: '€60/dag p.p.' },
          { value: 'comfort', label: 'Comfortabel', emoji: '🏨', sublabel: '€120/dag p.p.' },
          { value: 'luxe', label: 'Luxe', emoji: '✨', sublabel: '€250/dag p.p.' },
        ],
        default: 'comfort',
      },
      {
        key: 'aantalPersonen',
        type: 'segmented',
        label: 'Met wie?',
        options: [
          { value: 1, label: 'Alleen' },
          { value: 2, label: 'Met partner' },
          { value: 3, label: 'Met 1 kind' },
          { value: 4, label: 'Met 2 kinderen' },
        ],
        default: 1,
      },
      {
        key: 'inkomensverlies',
        type: 'toggle',
        label: 'Werk valt weg tijdens de reis',
        microcopy: 'Geen inkomen, of werk je remote door?',
        default: true,
      },
      {
        key: 'maandinkomen',
        type: 'number',
        label: 'Huidig netto maandinkomen',
        microcopy: 'Alleen relevant als werk wegvalt.',
        min: 0,
        step: 100,
        suffix: '€/mnd',
        default: 3000,
      },
    ],
    computeImpact(answers) {
      const duurMnd = num(answers.duurMnd, 6)
      const reisstijl = str(answers.reisstijl, 'comfort')
      const aantalPersonen = num(answers.aantalPersonen, 1)
      const dagprijs = reisstijl === 'budget' ? 60 : reisstijl === 'comfort' ? 120 : 250
      const reiskostenTotaal = Math.round(duurMnd * 30 * dagprijs * aantalPersonen)
      const inkomensverlies = bool(answers.inkomensverlies, true)
      const maandinkomen = num(answers.maandinkomen, 3000)
      return {
        oneTimeAmount: reiskostenTotaal,
        oneTimeDirection: 'expense',
        tempEnabled: inkomensverlies && maandinkomen > 0,
        tempAmount: inkomensverlies ? maandinkomen : 0,
        tempDirection: 'expense',
        tempDurationYears: Math.max(1, Math.round(duurMnd / 12)),
        tempIndexed: false,
        contEnabled: false,
        suggestedAge: num(answers.startAge, 35),
        suggestedName: 'Mijn wereldreis',
      }
    },
  },

  inheritance: {
    intro:
      'Een onverwachte meevaller, of een al verwachte. Een erfenis kan vrijheid versnellen — afhankelijk van timing en bedrag.',
    headline: 'Een meevaller',
    headlineEmphasis: 'meevaller',
    questions: [
      {
        key: 'verwachtAge',
        type: 'slider',
        label: 'Op welke leeftijd verwacht je dit?',
        microcopy: 'Een ruwe schatting is genoeg.',
        min: 25,
        max: 90,
        step: 1,
        suffix: 'jaar',
        default: 65,
      },
      {
        key: 'nettoBedrag',
        type: 'number',
        label: 'Geschat netto bedrag',
        microcopy: 'Na erf- en schenkbelasting.',
        min: 0,
        step: 5000,
        suffix: '€',
        default: 50000,
      },
      {
        key: 'dividendOok',
        type: 'toggle',
        label: 'Levert dit ook structureel inkomen op?',
        microcopy: 'Bijvoorbeeld dividend, huur uit een woning.',
        default: false,
      },
      {
        key: 'dividendMaand',
        type: 'number',
        label: 'Hoeveel per maand?',
        microcopy: 'Alleen invullen als bovenstaande aan staat.',
        min: 0,
        step: 50,
        suffix: '€/mnd',
        default: 0,
      },
    ],
    computeImpact(answers) {
      const bedrag = num(answers.nettoBedrag, 50000)
      const dividendOok = bool(answers.dividendOok, false)
      const dividendMaand = dividendOok ? num(answers.dividendMaand, 0) : 0
      return {
        oneTimeAmount: bedrag,
        oneTimeDirection: 'income',
        tempEnabled: false,
        contEnabled: dividendMaand > 0,
        contAmount: dividendMaand,
        contDirection: 'income',
        contIndexed: true,
        suggestedAge: num(answers.verwachtAge, 65),
        suggestedName: 'Erfenis',
      }
    },
  },

  pension: {
    intro:
      'Pensioen verandert je inkomen voorgoed. Hieronder bouw je het zoals jouw cijfers het zeggen — bruto, ingangsleeftijd, indexatie.',
    headline: 'Pensioen',
    questions: [
      {
        key: 'startAge',
        type: 'number',
        label: 'Vanaf welke leeftijd?',
        microcopy: 'AOW + aanvullend pensioen — kies de gemiddelde startleeftijd.',
        min: 50,
        max: 75,
        suffix: 'jaar',
        default: 67,
      },
      {
        key: 'brutoMaand',
        type: 'number',
        label: 'Bruto maandbedrag',
        microcopy: 'Wat verwacht je per maand te ontvangen, vóór belasting.',
        min: 0,
        step: 50,
        suffix: '€/mnd',
        default: 1500,
      },
      {
        key: 'belastingPct',
        type: 'segmented',
        label: 'Geschatte effectieve belasting',
        microcopy: 'Een vuistregel — gepensioneerden zitten vaak rond 20%.',
        options: [
          { value: 0, label: '0%' },
          { value: 15, label: '15%' },
          { value: 20, label: '20%' },
          { value: 30, label: '30%' },
        ],
        default: 20,
      },
      {
        key: 'indexatie',
        type: 'toggle',
        label: 'Stijgt mee met inflatie',
        microcopy: 'De meeste pensioenfondsen indexeren (deels).',
        default: true,
      },
    ],
    computeImpact(answers) {
      const bruto = num(answers.brutoMaand, 1500)
      const belasting = num(answers.belastingPct, 20) / 100
      const netto = Math.round(bruto * (1 - belasting))
      return {
        oneTimeAmount: 0,
        oneTimeDirection: 'expense',
        tempEnabled: false,
        contEnabled: netto > 0,
        contAmount: netto,
        contDirection: 'income',
        contIndexed: bool(answers.indexatie, true),
        suggestedAge: num(answers.startAge, 67),
        suggestedName: 'Mijn pensioen',
      }
    },
  },

  renovation: {
    intro:
      'Een keuken, badkamer, dak — een ingreep die je woongenot verandert. Eenmalige uitgaven, soms met blijvende impact op vaste lasten.',
    headline: 'Verbouwing',
    questions: [
      {
        key: 'omvang',
        type: 'tile',
        label: 'Hoe groot is de ingreep?',
        options: [
          { value: 'klein', label: 'Klein', emoji: '🔧', sublabel: '€10-25K' },
          { value: 'middel', label: 'Middel', emoji: '🛠️', sublabel: '€25-60K' },
          { value: 'groot', label: 'Groot', emoji: '🏗️', sublabel: '€60-150K' },
        ],
        default: 'middel',
      },
      {
        key: 'startAge',
        type: 'number',
        label: 'Wanneer ga je het doen?',
        min: 18,
        max: 90,
        suffix: 'jaar',
        default: 45,
      },
      {
        key: 'eigenBedrag',
        type: 'number',
        label: 'Of: vul een eigen bedrag in',
        microcopy: 'Laat 0 om de tier-default te gebruiken.',
        min: 0,
        step: 5000,
        suffix: '€',
        default: 0,
      },
      {
        key: 'lagereLasten',
        type: 'toggle',
        label: 'Lagere energielasten daarna',
        microcopy: 'Bijv. isolatie of warmtepomp.',
        default: false,
      },
      {
        key: 'besparing',
        type: 'number',
        label: 'Geschatte maandelijkse besparing',
        microcopy: 'Alleen invullen als bovenstaande aan staat.',
        min: 0,
        step: 10,
        suffix: '€/mnd',
        default: 0,
      },
    ],
    computeImpact(answers) {
      const omvang = str(answers.omvang, 'middel')
      const tierBedrag = omvang === 'klein' ? 18000 : omvang === 'middel' ? 40000 : 100000
      const eigen = num(answers.eigenBedrag, 0)
      const bedrag = eigen > 0 ? eigen : tierBedrag
      const lagereLasten = bool(answers.lagereLasten, false)
      const besparing = lagereLasten ? num(answers.besparing, 0) : 0
      return {
        oneTimeAmount: bedrag,
        oneTimeDirection: 'expense',
        tempEnabled: false,
        contEnabled: besparing > 0,
        contAmount: besparing,
        contDirection: 'income',
        contIndexed: true,
        suggestedAge: num(answers.startAge, 45),
        suggestedName: 'Verbouwing',
      }
    },
  },

  house_purchase: {
    intro:
      'Een huis kopen — eenmalige kosten koper en een nieuwe maandelijkse routine. Hieronder snel het verschil tussen oud en nieuw.',
    headline: 'Een nieuw huis',
    headlineEmphasis: 'huis',
    questions: [
      {
        key: 'startAge',
        type: 'number',
        label: 'Op welke leeftijd?',
        min: 18,
        max: 80,
        suffix: 'jaar',
        default: 35,
      },
      {
        key: 'koopprijs',
        type: 'number',
        label: 'Koopprijs',
        microcopy: 'Bepaalt indirect de overdracht en notaris.',
        min: 0,
        step: 10000,
        suffix: '€',
        default: 400000,
      },
      {
        key: 'kostenKoperPct',
        type: 'segmented',
        label: 'Kosten koper',
        microcopy: 'Standaard ~6% (overdracht, notaris, advies).',
        options: [
          { value: 0, label: 'Geen' },
          { value: 4, label: '4%' },
          { value: 6, label: '6%' },
          { value: 10, label: '10%' },
        ],
        default: 6,
      },
      {
        key: 'maandlastVerschil',
        type: 'number',
        label: 'Verschil maandlasten t.o.v. nu',
        microcopy: '+ = duurder per maand, − = goedkoper.',
        step: 50,
        suffix: '€/mnd',
        default: 300,
      },
    ],
    computeImpact(answers) {
      const koopprijs = num(answers.koopprijs, 400000)
      const kkPct = num(answers.kostenKoperPct, 6) / 100
      const kostenKoper = Math.round(koopprijs * kkPct)
      const verschil = num(answers.maandlastVerschil, 300)
      return {
        oneTimeAmount: kostenKoper,
        oneTimeDirection: 'expense',
        tempEnabled: false,
        contEnabled: verschil !== 0,
        contAmount: Math.abs(verschil),
        contDirection: verschil >= 0 ? 'expense' : 'income',
        contIndexed: false,
        suggestedAge: num(answers.startAge, 35),
        suggestedName: 'Mijn nieuwe huis',
      }
    },
  },

  wedding: {
    intro:
      'Een dag om te vieren — en met grote impact op je spaarpot. Vul in zoals je het wilt, niet zoals het "hoort".',
    headline: 'De grote dag',
    headlineEmphasis: 'dag',
    questions: [
      {
        key: 'stijl',
        type: 'tile',
        label: 'Wat voor bruiloft?',
        options: [
          { value: 'intiem', label: 'Intiem', emoji: '💛', sublabel: '€5-10K' },
          { value: 'gemiddeld', label: 'Gemiddeld', emoji: '🎉', sublabel: '€15-25K' },
          { value: 'groots', label: 'Groots', emoji: '✨', sublabel: '€30-60K' },
        ],
        default: 'gemiddeld',
      },
      {
        key: 'startAge',
        type: 'number',
        label: 'Op welke leeftijd?',
        min: 18,
        max: 80,
        suffix: 'jaar',
        default: 30,
      },
      {
        key: 'eigenBedrag',
        type: 'number',
        label: 'Of: vul je eigen budget in',
        microcopy: 'Laat 0 om de tier te gebruiken.',
        min: 0,
        step: 1000,
        suffix: '€',
        default: 0,
      },
      {
        key: 'huwelijksreis',
        type: 'toggle',
        label: 'Plus een huwelijksreis',
        default: true,
      },
      {
        key: 'reisbedrag',
        type: 'number',
        label: 'Reisbudget',
        min: 0,
        step: 500,
        suffix: '€',
        default: 4000,
      },
    ],
    computeImpact(answers) {
      const stijl = str(answers.stijl, 'gemiddeld')
      const tier = stijl === 'intiem' ? 8000 : stijl === 'gemiddeld' ? 20000 : 45000
      const eigen = num(answers.eigenBedrag, 0)
      const trouwBedrag = eigen > 0 ? eigen : tier
      const reis = bool(answers.huwelijksreis, true) ? num(answers.reisbedrag, 4000) : 0
      return {
        oneTimeAmount: trouwBedrag + reis,
        oneTimeDirection: 'expense',
        tempEnabled: false,
        contEnabled: false,
        suggestedAge: num(answers.startAge, 30),
        suggestedName: 'Onze bruiloft',
      }
    },
  },
}

/** Voor types zonder eigen story — laat alleen de drie blokken zien. */
export function hasStory(type: string): boolean {
  return type in LIFE_EVENT_STORIES
}

/** Default-antwoorden uit story-config (key → default-waarde). */
export function defaultStoryAnswers(type: string): Record<string, StoryAnswerValue> {
  const story = LIFE_EVENT_STORIES[type]
  if (!story) return {}
  const out: Record<string, StoryAnswerValue> = {}
  for (const q of story.questions) out[q.key] = q.default
  return out
}

// Re-export NIBUD-data zodat tests kunnen verifiëren met dezelfde getallen.
export { NIBUD_CHILDREN_MONTHLY_COST }
