/**
 * De eerste ophaal van een bankkoppeling: hoe ver terug, en in welke stukken.
 *
 * Puur — geen Supabase, geen fetch, geen klok. De aanroeper geeft `today` mee;
 * dat maakt de grensgevallen ("historie van vandaag") testbaar zonder de
 * systeemtijd te manipuleren.
 *
 * Dit bestand is de EIGENAAR van het startpunt-contract (plan §fase 1). De
 * callback (fase 5) en het herkoppelpad (fase 7) consumeren `planInitialFetch`
 * en definiëren het startpunt niet opnieuw — lees de signatuur hier, niet uit
 * een fasebeschrijving.
 *
 * Twee regels, uit besluit B8/B9:
 *
 * - **Lege rekening (B8): zo ver terug als de provider geeft, in blokken.** Zonder
 *   `from` valt TrueLayer terug op zijn standaard van ~88 dagen; met een
 *   expliciete begindatum leverde dezelfde Rabobank-rekening 747 (7 mnd), 1.355
 *   (13 mnd) en 3.086 transacties (19 mnd). Het koppelmoment is het enige moment
 *   waarop de gebruiker sowieso wacht, en later alsnog ophalen kost extra
 *   verzoeken tegen dezelfde bank-eigen limiet.
 * - **Rekening mét transacties (B9): start bij de nieuwste bestaande transactie
 *   −3 dagen.** De marge vangt naboekingen met terugwerkende datum en ligt bewust
 *   boven de ±1-dagstolerantie van de cross-bron-dedup (fase 2). Géén blok-lus:
 *   gaten vóór de bestaande historie worden bewust niet gevuld — de aangewezen
 *   route daarvoor is een CSV-import op die rekening (B7/fase 3).
 */

/** Marge onder de nieuwste bestaande transactie (besluit 4 / B9). */
export const INITIAL_FETCH_MARGIN_DAYS = 3

/**
 * Grootte van één historisch blok. Zes maanden is een compromis: klein genoeg
 * dat een provider-limiet halverwege niet een heel jaar historie meesleurt,
 * groot genoeg dat een volledige terugblik binnen een handvol verzoeken past
 * (24 maanden = 4 verzoeken).
 */
export const INITIAL_FETCH_BLOCK_MONTHS = 6

/**
 * Maximale terugblik op een lege rekening. De Rabobank-meting stopte na ~19
 * maanden op de bank-eigen limiet; 24 maanden geeft ruimte aan banken die méér
 * leveren, en de limiet wordt toch netjes afgevangen. Verder terug vragen kost
 * alleen maar verzoeken tegen diezelfde limiet.
 */
export const INITIAL_FETCH_MAX_LOOKBACK_MONTHS = 24

/** Eén ophaalvenster; `from`/`to` zijn inclusief, formaat `YYYY-MM-DD`. */
export type FetchBlock = { from: string; to: string }

export type InitialFetchPlan = {
  /**
   * `incremental` = er stond al historie op deze rekening, dus één venster vanaf
   * D−3 (B9). `historical` = lege rekening, dus de blok-lus (B8).
   */
  mode: 'incremental' | 'historical'
  /** Vroegste datum die dit plan probeert op te halen (= `blocks.at(-1).from`). */
  startDate: string
  /**
   * De op te halen vensters, **nieuwste eerst**. Die volgorde is functioneel: kapt
   * de bank-eigen limiet de lus af, dan houdt de gebruiker de meest recente —
   * en meest relevante — historie over in plaats van de oudste.
   *
   * Aangrenzende blokken delen hun grensdatum (`blocks[n].from === blocks[n+1].to`).
   * Een dag overlap is gratis (de dedup vangt 'm), een dag gat is stil verlies.
   */
  blocks: FetchBlock[]
}

export type PlanInitialFetchOptions = {
  /** Vandaag, `YYYY-MM-DD`. Bewust een parameter: deze module kent geen klok. */
  today: string
  /**
   * Datum van de nieuwste transactie die al op de doelrekening staat, of
   * null/undefined bij een lege rekening.
   */
  newestExistingDate?: string | null
  maxLookbackMonths?: number
  blockMonths?: number
  marginDays?: number
}

function parseIsoDate(iso: string): Date {
  // `YYYY-MM-DD` als UTC-middernacht: geen zomertijd, geen lokale-tijd-drift.
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addDays(iso: string, days: number): string {
  const date = parseIsoDate(iso)
  date.setUTCDate(date.getUTCDate() + days)
  return toIsoDate(date)
}

function addMonths(iso: string, months: number): string {
  const date = parseIsoDate(iso)
  const day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + months)
  // 31 maart − 1 maand is 28/29 februari, niet 3 maart: klem op de laatste dag
  // van de doelmaand in plaats van door te rollen naar de volgende.
  const lastDayOfTargetMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  date.setUTCDate(Math.min(day, lastDayOfTargetMonth))
  return toIsoDate(date)
}

/**
 * Bepaal startpunt en ophaalblokken voor een sync op een rekening.
 *
 * Nooit een venster in de toekomst: `to` is altijd hooguit `today`. Een
 * `newestExistingDate` die in de toekomst ligt (rommelige import) wordt op
 * `today` geklemd in plaats van een leeg venster op te leveren.
 */
export function planInitialFetch(opts: PlanInitialFetchOptions): InitialFetchPlan {
  const {
    today,
    newestExistingDate,
    maxLookbackMonths = INITIAL_FETCH_MAX_LOOKBACK_MONTHS,
    blockMonths = INITIAL_FETCH_BLOCK_MONTHS,
    marginDays = INITIAL_FETCH_MARGIN_DAYS,
  } = opts

  if (newestExistingDate) {
    // B9 — de rekening draagt al historie. Eén venster, geen blok-lus: er is
    // niets om terug te halen, en elk extra verzoek telt tegen de bank-eigen
    // limiet. Wint óók van maxLookbackMonths als de historie ouder is.
    const anchor = newestExistingDate > today ? today : newestExistingDate
    const from = addDays(anchor, -marginDays)
    return { mode: 'incremental', startDate: from, blocks: [{ from, to: today }] }
  }

  // B8 — lege rekening: zo ver terug als de provider geeft, in blokken van
  // `blockMonths`, nieuwste eerst.
  const startDate = addMonths(today, -maxLookbackMonths)
  const blocks: FetchBlock[] = []

  let to = today
  while (to > startDate) {
    const from = addMonths(to, -blockMonths)
    blocks.push({ from: from < startDate ? startDate : from, to })
    to = from
  }

  // Alleen bereikbaar bij maxLookbackMonths === 0 (of blockMonths >= lookback in
  // één stap): dan is er precies één dag te halen en is de lus leeg gebleven.
  if (blocks.length === 0) {
    blocks.push({ from: startDate, to: today })
  }

  return { mode: 'historical', startDate, blocks }
}

/**
 * Vertaal één blok naar de `from`/`to`-queryparameters van TrueLayer.
 *
 * **Beide grenzen gaan altijd mee.** Data API v1 past het venster alleen toe
 * als `from` én `to` er zijn; met alleen `from` valt de provider stilzwijgend
 * terug op zijn standaardvenster van ~88 dagen en levert hij rijen die vóór het
 * gevraagde startpunt liggen. Dat is geen theorie: een sync van 4 aug 2026 met
 * `from=2026-07-30` kreeg transacties vanaf 8 mei terug — exact 88 dagen. Op de
 * blok-lus (B8) is dat een STIL GAT: het nieuwste blok van zes maanden dekte
 * dan feitelijk 88 dagen, terwijl het volgende blok pas op −6 maanden begint.
 *
 * Een kale `to=<vandaag>` mag het echter niet worden: TrueLayer leest een kale
 * datum als middernacht UTC en zou dan alles wat vandaag geboekt is afkappen —
 * precies de transacties waarvoor de gebruiker synchroniseert. Vandaar een
 * expliciete bovengrens op het einde van de dag.
 */
export function toProviderRange(block: FetchBlock, today: string): { from: string; to: string } {
  return block.to >= today
    ? { from: block.from, to: `${today}T23:59:59Z` }
    : { from: block.from, to: block.to }
}
