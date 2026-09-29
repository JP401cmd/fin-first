/**
 * Statusmodel van het beheerdashboard (/beheer).
 *
 * Eén vocabulaire voor elke indicator op het dashboard, zodat "gezond" overal
 * hetzelfde betekent. Puur: geen IO, geen klok.
 *
 * DE KERNREGEL: een ontbrekende meting is nooit gezond. Een bron die niet
 * gelezen kon worden, leeg is of verouderd is, krijgt zijn eigen toestand en
 * telt niet mee als "in orde". Dat onderscheid maakt de rest van dit model.
 *
 * `laden` staat hier bewust niet tussen: dat is een toestand van het scherm
 * (de Suspense-grens), niet van de meting.
 */

export type MeetStatus =
  | 'gezond'
  | 'afwijkend'
  | 'geen-gegevens'
  | 'verouderd'
  | 'meting-mislukt'
  | 'nvt'

/** Hoe zwaar een afwijking weegt. Alleen betekenisvol bij `afwijkend`. */
export type Ernst = 'kritiek' | 'hoog' | 'middel' | 'laag'

/** Stoplichtsemantiek; nooit een module-accent (kleurconventie in CLAUDE.md). */
export type StatusToon = 'positive' | 'warning' | 'negative' | 'neutral'

export const MEET_STATUS_META: Record<MeetStatus, { label: string; betekenis: string }> = {
  gezond: { label: 'Gezond', betekenis: 'Gemeten en binnen de norm van de bron.' },
  afwijkend: { label: 'Afwijkend', betekenis: 'Gemeten en buiten de norm van de bron.' },
  'geen-gegevens': {
    label: 'Geen gegevens',
    betekenis: 'De bron is bereikbaar, maar bevat nog geen metingen voor dit onderdeel.',
  },
  verouderd: {
    label: 'Verouderd',
    betekenis: 'De laatste meting is ouder dan het venster waarin de bron hoort te verversen.',
  },
  'meting-mislukt': {
    label: 'Meting mislukt',
    betekenis: 'De bron kon niet worden gelezen. Dit zegt niets over het onderdeel zelf.',
  },
  nvt: { label: 'N.v.t.', betekenis: 'Niet ingericht of bewust niet bewaakt.' },
}

export const ERNST_META: Record<Ernst, { label: string; betekenis: string }> = {
  kritiek: { label: 'Kritiek', betekenis: 'Een functie werkt voor niemand.' },
  hoog: { label: 'Hoog', betekenis: 'Een functie werkt niet voor een deel van de gebruikers, of dreigt uit te vallen.' },
  middel: { label: 'Middel', betekenis: 'Werkvoorraad of een gedeeltelijk resultaat.' },
  laag: { label: 'Laag', betekenis: 'Onderhoud zonder direct effect voor gebruikers.' },
}

/** Rangorde voor sorteren: laag getal = eerst. */
export const ERNST_RANG: Record<Ernst, number> = { kritiek: 0, hoog: 1, middel: 2, laag: 3 }

/**
 * Rangorde van de statustabel: wat ingrijpen vraagt bovenaan, dan wat we niet
 * kunnen zien, en pas daarna wat in orde is.
 */
export const MEET_STATUS_RANG: Record<MeetStatus, number> = {
  afwijkend: 0,
  'meting-mislukt': 1,
  verouderd: 2,
  'geen-gegevens': 3,
  gezond: 4,
  nvt: 5,
}

/** Toon van een status; bij `afwijkend` bepaalt de ernst of het rood of oranje is. */
export function statusToon(status: MeetStatus, ernst: Ernst | null = null): StatusToon {
  switch (status) {
    case 'gezond':
      return 'positive'
    case 'afwijkend':
      return ernst === 'kritiek' || ernst === 'hoog' ? 'negative' : 'warning'
    case 'verouderd':
    case 'meting-mislukt':
      return 'warning'
    case 'geen-gegevens':
    case 'nvt':
    default:
      return 'neutral'
  }
}

/** Een status zonder geldige, actuele meting. Telt nooit als gezond. */
export function isZonderMeting(status: MeetStatus): boolean {
  return status === 'geen-gegevens' || status === 'verouderd' || status === 'meting-mislukt'
}

/** Wat er geteld is. Een koppeling of een melding is geen gebruiker; het scherm zegt wat het telt. */
export type ImpactEenheid = 'gebruikers' | 'koppelingen' | 'e-mails' | 'meldingen'

/**
 * Wat een afwijking voor gebruikers betekent. Aantallen alleen waar de bron ze
 * levert; `ondergrens` zegt dat het werkelijke aantal hoger kan zijn (bv.
 * foutregels zonder gebruiker tellen niet mee).
 */
export type Impact =
  | { soort: 'iedereen'; toelichting: string }
  | { soort: 'aantal'; aantal: number; eenheid: ImpactEenheid; ondergrens: boolean; toelichting: string }
  | { soort: 'onbekend'; toelichting: string }
  | { soort: 'geen-direct'; toelichting: string }

const EENHEID_PLAFOND = 999_999

/**
 * Rangorde op impact: iedereen, dan getelde gebruikers (groot eerst), dan wat in
 * een andere eenheid geteld is, dan onbekend, dan geen. Gebruikers gaan vóór
 * andere eenheden: vijftig mislukte e-mails zijn niet "meer" dan drie getroffen
 * gebruikers, het zijn andere dingen. Binnen één eenheid telt het aantal.
 */
export function impactRang(impact: Impact): number {
  switch (impact.soort) {
    case 'iedereen':
      return Number.MAX_SAFE_INTEGER
    case 'aantal':
      return (
        (impact.eenheid === 'gebruikers' ? 2_000_000 : 1_000_000) + Math.min(Math.max(impact.aantal, 0), EENHEID_PLAFOND)
      )
    case 'onbekend':
      return 1
    case 'geen-direct':
    default:
      return 0
  }
}

/** Uitkomst van één leesactie. Een fout is geen lege uitkomst. */
export type Bron<T> =
  | { soort: 'ok'; data: T }
  | { soort: 'fout' }
  /** Het schema-object bestaat (nog) niet op deze omgeving. */
  | { soort: 'niet-uitgerold' }

export function bronOk<T>(data: T): Bron<T> {
  return { soort: 'ok', data }
}
