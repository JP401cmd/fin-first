/**
 * REKENMOTOR — Grenzenpot (persoonlijke uitgavengrens per periode).
 *
 * Puur en server-safe: geen React, geen Supabase, geen `new Date()` zonder dat
 * de aanroeper 'm meegeeft. Alles hierin is met statische invoer exact na te
 * rekenen (spiegelt lib/transaction-insights.ts, dat om precies die reden los te
 * unit-testen is). De data-toevoer zit in lib/spend-limits/loader.ts.
 *
 * ── ÉÉN CANONIEKE PLEK (consume, don't recompute) ───────────────────────────
 * Elk oppervlak dat een grenzenpot toont — de sectie op de transactiepagina, en
 * later de prestatieweergave en de widget — consumeert het `SpendLimitReport`
 * dat hier uit komt. Er wordt nergens anders een matching-bedrag, overschrijding
 * of reeks herrekend.
 *
 * ── WAAROM ON-THE-FLY EN NIET OPGESLAGEN (keuze A, ADR 0089) ────────────────
 * Er wordt geen enkele periode-uitkomst weggeschreven. Er is maar één waarheid —
 * de transacties — dus een refund, chargeback, correctie, dubbele boeking of een
 * gewijzigde regel leidt automatisch tot de juiste uitkomst bij de eerstvolgende
 * weergave. De idempotentie-eis is daarmee een eigenschap van het ontwerp in
 * plaats van een herberekenpad dat gebouwd en onderhouden moet worden.
 * Keerzijde, bewust aanvaard: een regelwijziging werkt met terugwerkende kracht
 * en kan dus een lopende reeks breken of herstellen. De UI zegt dat erbij.
 *
 * ── GRONDSLAG IN DE VELDNAAM (ADR 0073) ─────────────────────────────────────
 * `periodMatchedAmount` is een GEREALISEERD kalenderperiode-getal met de
 * periodesleutel ernaast. Meng het nooit met `monthlyExpenses` uit de
 * dashboard-bundel: dat is de *effective* grondslag waar een handmatige
 * profielinschatting kan winnen.
 *
 * ── DE AANMAAKDATUM IS DE ONDERGRENS — ALLEEN VOOR DE TREND ─────────────────
 * Een periode ZONDER transacties telt als "binnen de grens" (bewuste regel, zie
 * `computeStreaks`). Gevolg: een splinternieuwe pot heeft meteen een volle
 * historie van lege periodes van vóór zijn bestaan. Voor de MIJLPAAL-MELDING is
 * dat afgevangen in de meldingenlaag (`streakStartsAfterCreation` in
 * lib/notifications/spend-limit.ts); voor de TREND was het nergens afgevangen,
 * dus kaart, pane en widget toonden een richting over periodes waarin de grens
 * niet bestond. `computeSpendLimitTrend` legt daarom `rule.createdAt` als
 * ondergrens — met dezelfde semantiek en dezelfde datavlek-regel.
 *
 * De REEKS-GETALLEN (`computeStreaks`) en de PERIODE-UITKOMSTEN
 * (`computePeriodOutcome`) blijven daarbij ONGEWIJZIGD: die zijn kale datafeiten
 * over afgesloten periodes, en hun enige gebruik als *prestatie* (de mijlpaal)
 * heeft zijn eigen poort al. De trend is de enige afgeleide die zonder poort een
 * uitspraak over gedrag deed.
 */

import { isRealAggRow } from '@/lib/server-data/tx-aggregates'

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * De periodesoorten die de MOTOR uitrekent. Sinds 10-08-2026 vijf: dag en week
 * kwamen erbij bovenop de drie kalenderperiodes van fase 5.
 *
 * ── PERIODESLEUTEL- EN LABEL-FORMATEN ZIJN EEN CONTRACT ─────────────────────
 * Ze staan in deeplinks (`?periode=`), in notificatie-id's en in de
 * breakdown-route. Wijzig ze nooit zonder die drie mee te nemen:
 *
 *   | soort     | periodKey       | label              |
 *   |-----------|-----------------|--------------------|
 *   | `day`     | `'2026-08-10'`  | `'10 augustus 2026'` |
 *   | `week`    | `'2026-W33'`    | `'week 33, 2026'`  |
 *   | `month`   | `'2026-08'`     | `'augustus 2026'`  |
 *   | `quarter` | `'2026-Q3'`     | `'Q3 2026'`        |
 *   | `year`    | `'2026'`        | `'2026'`           |
 *
 * De dag-sleutel is met opzet een volledige ISO-datum en niet iets korters: hij
 * is daarmee identiek aan `slice.since`/`slice.until` van diezelfde periode, en
 * aan de `bucket_start` die de SQL teruggeeft. Eén formaat, geen omrekening.
 */
export type SpendLimitPeriodKind = 'day' | 'week' | 'month' | 'quarter' | 'year'

/**
 * Waar een pot over gaat, AFGELEID uit zijn regels (nooit opgeslagen — de kolom
 * `spend_limits.rule_type` is legacy sinds 10-08-2026):
 *
 *  - `budget`       — elke regel kiest alleen budgetten
 *  - `counterparty` — elke regel kiest alleen tegenpartijen
 *  - `mixed`        — er is minstens één regel die beide dimensies combineert,
 *                     óf de pot heeft regels van beide soorten naast elkaar
 *
 * `mixed` is bewust een EIGEN waarde en niet "budget met een uitzondering": een
 * oppervlak dat een budget-icoon of een budget-uitsplitsing toont, hoort bij een
 * gemengde pot iets anders te zeggen dan bij een zuivere budget-pot.
 */
export type SpendLimitRuleType = 'budget' | 'counterparty' | 'mixed'

/**
 * De SQL-korrel waarop de sommen voor een periodesoort worden opgehaald
 * (`p_grain` van `public.spend_limit_rule_aggregate`).
 *
 * Maand, kwartaal en jaar delen de maand-korrel omdat ze alle drie op
 * kalendermaandgrenzen vallen; dag en week hebben hun eigen korrel omdat een
 * dag- of weekbedrag per definitie niet uit een maandsom af te leiden is.
 *
 * DE HARDE EIS onder `sliceContainsBucket`: een bucket mag NOOIT over een
 * periodegrens heen liggen. Deze map is de plek waar dat gegarandeerd wordt —
 * wie hier een korrel grover maakt dan de periode, breekt de optelling stil.
 */
export type SpendLimitGrain = 'day' | 'week' | 'month'

export const SPEND_LIMIT_GRAIN_BY_PERIOD: Record<SpendLimitPeriodKind, SpendLimitGrain> = {
  day: 'day',
  week: 'week',
  month: 'month',
  quarter: 'month',
  year: 'month',
}

/**
 * Vensterlengte per periodesoort, INCLUSIEF de lopende periode. 31 dagen = 30
 * afgesloten dagen plus de voorlopige vandaag; 14 weken = 13 + 1; 13 maanden =
 * 12 + 1; 9 kwartalen = 8 + 1; 4 jaren = 3 + 1. Maximaal 48 onderliggende
 * kalendermaanden.
 *
 * Waarom dag en week een KORTER venster in periodes hebben dan een maand: de
 * reeks moet over een tijdspanne gaan waarin gedrag betekenis heeft. 30 dagen en
 * 13 weken beslaan ruwweg een maand en een kwartaal aan werkelijke tijd —
 * vergelijkbaar met wat de andere soorten aan geschiedenis tonen — terwijl 365
 * dagbolletjes op een verlooplijn onleesbaar zouden zijn.
 *
 * Eén home: de loader importeert deze map, herhaalt de getallen niet. Zie ook de
 * chunking in lib/spend-limits/loader.ts — 48 maanden aan aggregaat-rijen zou
 * zonder chunking tegen de PostgREST `max_rows`-cap kunnen lopen.
 */
export const SPEND_LIMIT_WINDOW_BY_PERIOD: Record<SpendLimitPeriodKind, number> = {
  day: 31,
  week: 14,
  month: 13,
  quarter: 9,
  year: 4,
}

/**
 * Vanaf welk aandeel van de grens een periode "dicht tegen de grens" heet.
 * Vaste motor-constante, geen kolom en geen instelbare drempel: de melding (B6),
 * de widget (B2) en de pane (B1) lezen `isNearLimit`, nooit dit getal — zo kan er
 * geen tweede drempellogica ontstaan.
 */
export const SPEND_LIMIT_NEAR_LIMIT_PCT = 0.8

/** Aantal afgesloten periodes per trend-blok (voortschrijdend gemiddelde). */
export const SPEND_LIMIT_TREND_WINDOW = 3

/**
 * Onder welk procentueel verschil tussen twee trend-blokken de richting 'stable'
 * heet — de ruisdrempel van de trend. Vaste motor-constante, net als de twee
 * hierboven: de UI leest `direction`, nooit dit getal, zodat er geen tweede
 * "is dit nog vlak?"-oordeel naast dat van de motor kan ontstaan.
 */
export const SPEND_LIMIT_TREND_STABLE_PCT = 5

/** De regel zoals de rekenmotor 'm nodig heeft (subset van de DB-rij). */
export interface SpendLimitRule {
  ruleType: SpendLimitRuleType
  /** Grensbedrag per periode, ≥ 0. */
  limitAmount: number
  period: SpendLimitPeriodKind
  /**
   * `spend_limits.created_at` — de ONDERGRENS VAN BETEKENIS voor de TREND (zie
   * de kop van dit bestand en `computeSpendLimitTrend`). Geen weergaveveld en
   * geen rekengrootheid: het zegt alleen vanaf wanneer een periode-uitkomst iets
   * over de gebruiker zegt in plaats van over een lege historie.
   *
   * OPTIONEEL EN INERT ZONDER WAARDE. Weglaten (of een onleesbare waarde) levert
   * exact de trend van vóór deze ondergrens op — dezelfde asymmetrische
   * datavlek-regel als `streakStartsAfterCreation`: liever één keer zichtbaar te
   * vroeg dan stil en permanent uit. Fixtures en losse motor-tests kunnen 'm dus
   * weglaten; de app-adapter (`lib/spend-limits/loader.ts`) hoort 'm te vullen
   * met `config.createdAt`, anders bereikt de ondergrens het scherm niet.
   *
   * Een volledige ISO-tijdstempel mag: alleen de eerste tien tekens tellen.
   */
  createdAt?: string | null
}

/**
 * Eén aggregaat-rij, al toegesneden op één grenzenpot. De loader kiest welke
 * rijen bij welke pot horen (welke regel-indexen) en ontdubbelt; de motor telt
 * alleen nog op.
 *
 * Vorm spiegelt `public.spend_limit_rule_aggregate`: `sumPositief` ≥ 0 (o.a.
 * refunds/chargebacks), `sumNegatief` ≤ 0 (uitgaven).
 */
export interface SpendLimitAggregateRow {
  /**
   * De EERSTE DAG van de bucket, als ISO-datum 'YYYY-MM-DD' — de dag zelf bij
   * dag-korrel, de maandag bij week-korrel, de eerste van de maand bij
   * maand-korrel.
   *
   * Bewust een datum en geen periodesleutel: de bereik-match
   * (`sliceContainsBucket`) is daarmee één kale ISO-datumvergelijking die voor
   * álle vijf periodesoorten hetzelfde werkt. Vóór 10-08-2026 stond hier een
   * `month: 'YYYY-MM'` met een eigen lexicografische maandvergelijking; die kon
   * per definitie geen dag- of weekgrens uitdrukken.
   */
  bucketStart: string
  transactionType: string | null
  sumPositief: number
  sumNegatief: number
  count: number
  /** Alleen bij regels mét tegenpartij-dimensie: welke namen matchten. */
  matchedNames?: string[]
}

export interface SpendLimitPeriodSlice {
  /** Stabiele sleutel: '2026-08' | '2026-Q3' | '2026' (zie SpendLimitPeriodKind). */
  periodKey: string
  label: string
  /** Inclusieve start, ISO 'yyyy-mm-dd'. */
  since: string
  /** Inclusief einde, ISO 'yyyy-mm-dd'. */
  until: string
  /** True zolang de periode nog loopt — telt NIET mee voor de reeks. */
  isOpen: boolean
}

export type SpendLimitStatus = 'within' | 'exceeded'

export interface SpendLimitPeriodOutcome extends SpendLimitPeriodSlice {
  /** Netto gerealiseerde uitgave in DEZE kalenderperiode (refunds al verrekend). */
  periodMatchedAmount: number
  limitAmount: number
  /** Bedrag boven de grens; 0 zolang je binnen blijft. */
  periodOverAmount: number
  /** Ruimte onder de grens; 0 zodra je erboven zit. */
  periodHeadroom: number
  status: SpendLimitStatus
  /**
   * Nog binnen de grens, maar op of boven SPEND_LIMIT_NEAR_LIMIT_PCT ervan.
   * `near` en `exceeded` sluiten elkaar per definitie uit (de vlag eist
   * `status === 'within'`), en een grens van 0 telt nooit als "dichtbij" —
   * anders zou elke nul-grens permanent een seintje geven.
   */
  isNearLimit: boolean
  matchedTransactionCount: number
  /** Tegenpartij-namen die in deze periode meetelden (leeg bij budget-regels). */
  matchedCounterpartyNames: string[]
}

export interface SpendLimitStreaks {
  /** Aaneengesloten AFGESLOTEN periodes binnen de grens, tot en met de laatste. */
  currentStreak: number
  /** Langste aaneengesloten reeks binnen de grens in het bekeken venster. */
  longestStreak: number
  /** Sleutel van de laatste afgesloten periode die binnen de grens bleef. */
  lastWithinPeriodKey: string | null
  /** Aantal afgesloten periodes boven de grens in het bekeken venster. */
  exceededPeriodCount: number
  /** Hoeveel afgesloten periodes het venster bevat (context bij de reeks). */
  closedPeriodCount: number
}

/**
 * Richting van de trend. BEWUST NIET 'up'/'down': de grootheid is een uitgave,
 * dus minder uitgeven is `improving` en méér uitgeven is `worsening`. Een
 * pijl-omhoog-idioom zou hier precies het verkeerde zeggen.
 */
export type SpendLimitTrendDirection = 'improving' | 'stable' | 'worsening' | 'unknown'

/**
 * Trend over AFGESLOTEN periodes die volledig NÁ het aanmaken van de pot
 * beginnen (zie `computeSpendLimitTrend`). Grootheid is `periodMatchedAmount`
 * (gemeten gedrag), niet de overschrijding of de ruimte: die twee zijn
 * afhankelijk van de grens, en een grenswijziging zou dan als gedragsverandering
 * ogen.
 *
 * Elk bedragveld draagt `MatchedAmount` in de naam (ADR 0073-grondslag:
 * gerealiseerd, per afgesloten kalenderperiode) — nooit te verwarren met de
 * *effective* `monthlyExpenses` uit de dashboardbundel.
 */
export interface SpendLimitTrend {
  /** Aantal afgesloten periodes per blok (= SPEND_LIMIT_TREND_WINDOW). */
  windowPeriods: number
  /**
   * Voortschrijdend gemiddelde per afgesloten periode, oud → nieuw. `null`
   * zolang er nog geen `windowPeriods` periodes vóór (en inclusief) deze zijn —
   * een gemiddelde over 1 of 2 punten is geen gemiddelde.
   *
   * Bevat UITSLUITEND periodes vanaf de aanmaak-ondergrens; deze reeks is dus
   * korter dan `report.closedPeriods` zodra een pot jonger is dan zijn venster.
   * De verloopgrafiek zoekt op `periodKey` (geen index-zip), waardoor periodes
   * van vóór die ondergrens simpelweg geen punt op de gemiddelde-lijn krijgen —
   * precies de bedoeling: over lege pre-bestaan-periodes hoort geen lijn.
   */
  movingAvgMatchedAmountByPeriod: { periodKey: string; movingAvgMatchedAmount: number | null }[]
  /** Gemiddelde van de laatste `windowPeriods` afgesloten periodes; null bij < 3. */
  recentAvgMatchedAmount: number | null
  /** Gemiddelde van de `windowPeriods` dáárvóór; null bij < 6 afgesloten periodes. */
  priorAvgMatchedAmount: number | null
  /** recent − prior in euro's; null zodra een van beide null is. */
  avgMatchedAmountChange: number | null
  /**
   * De verandering in PROCENTPUNTEN t.o.v. |prior| — dus `-12.5` betekent
   * "12,5% minder uitgegeven", niet de fractie 0,125. Null bij een prior van 0
   * met een niet-nul recent (delen door nul; nooit `Infinity%` tonen).
   */
  avgMatchedAmountChangePct: number | null
  direction: SpendLimitTrendDirection
}

export interface SpendLimitReport {
  /** De lopende, nog niet afgesloten periode — altijd VOORLOPIG. */
  currentPeriod: SpendLimitPeriodOutcome
  /** De meest recente afgesloten periode, of null bij een leeg venster. */
  lastClosedPeriod: SpendLimitPeriodOutcome | null
  /** Alle afgesloten periodes in het venster, oud → nieuw. */
  closedPeriods: SpendLimitPeriodOutcome[]
  streaks: SpendLimitStreaks
  /** Trend over de afgesloten periodes; de lopende telt bewust niet mee. */
  trend: SpendLimitTrend
}

// ── Datum-helpers (lokaal geparsed, geen UTC-drift) ─────────────────────────

const MONTH_NAMES = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
]

function iso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * De MAANDAG van de ISO-week waarin `d` valt (maandag = eerste dag, de
 * Nederlandse en ISO-8601-conventie).
 *
 * `(getDay() + 6) % 7` maakt van zondag=0…zaterdag=6 een maandag=0…zondag=6.
 * Rekenen gebeurt op lokale kalendercomponenten, nooit op tijdstempels: de
 * SQL-kant doet hetzelfde met `extract(isodow …)` op een `date`-kolom zonder
 * tijdzone, en een UTC-omweg zou daar rond middernacht een dag van afwijken.
 */
function mondayOf(d: Date): Date {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  t.setDate(t.getDate() - ((t.getDay() + 6) % 7))
  return t
}

/**
 * ISO-weeknummer en ISO-JAAR van de week die op `monday` begint.
 *
 * Het ISO-jaar is niet altijd het kalenderjaar van de maandag: de week van 29
 * december 2025 t/m 4 januari 2026 is ISO-week 1 van 2026. De donderdag van de
 * week beslist (ISO-8601), en week 1 is de week met 4 januari erin.
 *
 * De dagafstand wordt afgerond en niet gedeeld-en-afgekapt: over een
 * zomertijdovergang scheelt een etmaal 23 of 25 uur, en `Math.round` vangt dat
 * op waar een kale deling een week zou kunnen verspringen.
 */
function isoWeekParts(monday: Date): { year: number; week: number } {
  const thursday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 3)
  const year = thursday.getFullYear()
  const week1Monday = mondayOf(new Date(year, 0, 4))
  const days = Math.round((thursday.getTime() - week1Monday.getTime()) / 86_400_000)
  return { year, week: Math.floor(days / 7) + 1 }
}

// ── Periodevensters ──────────────────────────────────────────────────────────

/**
 * De laatste `count` kalenderperiodes, oud → nieuw, met de LOPENDE periode als
 * laatste element.
 *
 * `isOpen` volgt uit de datum, niet uit de positie in de reeks: een periode is
 * open zolang haar einddatum vandaag of later is. Op de laatste dag van de maand
 * is die maand dus nog steeds voorlopig — de dag is immers niet voorbij. Dat is
 * exact de regel die de reeks eerlijk houdt, en ze geldt onveranderd voor alle
 * vijf de soorten (bij `day` betekent ze: vandaag is altijd de open periode).
 *
 * KALENDERGRENZEN: kwartaal = jan-mrt/apr-jun/jul-sep/okt-dec, jaar = 1 jan t/m
 * 31 dec, week = maandag t/m zondag (ISO-8601). Een verschoven ("gebroken")
 * boekjaar of een week die op zondag begint bestaat hier bewust niet. Daarop
 * leunt `sliceContainsBucket`: de SQL-korrel die bij een soort hoort
 * (`SPEND_LIMIT_GRAIN_BY_PERIOD`) is altijd fijn genoeg om binnen deze grenzen
 * te vallen, dus een bucket ligt nooit over twee periodes tegelijk.
 *
 * De periodeKey/label-formaten zijn een CONTRACT — zie `SpendLimitPeriodKind`.
 */
export function resolveSpendLimitPeriods(
  period: SpendLimitPeriodKind,
  now: Date,
  count: number,
): SpendLimitPeriodSlice[] {
  const total = Math.max(1, Math.floor(count))
  const today = iso(now)
  const y = now.getFullYear()
  const m = now.getMonth()

  const slices: SpendLimitPeriodSlice[] = []
  for (let offset = -(total - 1); offset <= 0; offset++) {
    let start: Date
    let end: Date
    let periodKey: string
    let label: string

    if (period === 'day') {
      start = new Date(y, m, now.getDate() + offset)
      end = start
      periodKey = iso(start)
      label = `${start.getDate()} ${MONTH_NAMES[start.getMonth()]} ${start.getFullYear()}`
    } else if (period === 'week') {
      // Vanaf de maandag van de HUIDIGE week terugtellen in stappen van 7 dagen;
      // maand- en jaaroverloop rolt vanzelf om.
      const thisMonday = mondayOf(now)
      start = new Date(
        thisMonday.getFullYear(),
        thisMonday.getMonth(),
        thisMonday.getDate() + offset * 7,
      )
      end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)
      const { year, week } = isoWeekParts(start)
      periodKey = `${year}-W${String(week).padStart(2, '0')}`
      label = `week ${week}, ${year}`
    } else if (period === 'quarter') {
      // Eerste maand van het kwartaal waarin `now` valt, dan 3 maanden per stap.
      // `new Date(y, maand + 3, 0)` = dag 0 van de maand ná het kwartaal = de
      // laatste dag ervan; maand-overloop (< 0 of > 11) rolt vanzelf het jaar om.
      const quarterStartMonth = Math.floor(m / 3) * 3 + offset * 3
      start = new Date(y, quarterStartMonth, 1)
      end = new Date(y, quarterStartMonth + 3, 0)
      const q = Math.floor(start.getMonth() / 3) + 1
      periodKey = `${start.getFullYear()}-Q${q}`
      label = `Q${q} ${start.getFullYear()}`
    } else if (period === 'year') {
      start = new Date(y + offset, 0, 1)
      end = new Date(y + offset, 11, 31)
      periodKey = String(start.getFullYear())
      label = periodKey
    } else {
      start = new Date(y, m + offset, 1)
      end = new Date(y, m + offset + 1, 0)
      periodKey = iso(start).slice(0, 7)
      label = `${MONTH_NAMES[start.getMonth()]} ${start.getFullYear()}`
    }

    slices.push({
      periodKey,
      label,
      since: iso(start),
      until: iso(end),
      isOpen: iso(end) >= today,
    })
  }
  return slices
}

/**
 * Hoort deze aggregaat-bucket bij deze periode?
 *
 * ÉÉN HOME voor de bereik-match. `computePeriodOutcome` telt hiermee op en de
 * loader splitst er zijn uitsplitsingen mee uit; twee eigen varianten zouden bij
 * de eerste wijziging uiteenlopen.
 *
 * Waarom containment en niet `row.bucketStart === slice.periodKey`: die
 * gelijkheid werkt uitsluitend als korrel en periode toevallig samenvallen. Voor
 * een kwartaalpot is `'2026-08-01' !== '2026-Q3'` altijd waar, waardoor élke
 * periode op nul zou uitkomen en "binnen de grens" zou heten — zonder één
 * foutmelding.
 *
 * De vergelijking is een kale lexicografische ISO-datumvergelijking, en die is
 * hier EXACT omdat een bucket per constructie nooit over een periodegrens heen
 * ligt: `SPEND_LIMIT_GRAIN_BY_PERIOD` kiest per soort een korrel die binnen die
 * grenzen valt (zie `resolveSpendLimitPeriods`).
 */
export function sliceContainsBucket(slice: SpendLimitPeriodSlice, bucketStart: string): boolean {
  return bucketStart >= slice.since && bucketStart <= slice.until
}

/**
 * Dezelfde vraag voor een KALENDERMAAND-sleutel ('YYYY-MM').
 *
 * Blijft bestaan voor de oppervlakken die met `tx_month_aggregate` werken (dat
 * aggregaat draagt geen bucketdatum maar een maandsleutel). Bewust een dunne
 * omzetting naar `sliceContainsBucket` en geen tweede vergelijking: de eerste
 * van de maand ís de bucketdatum van die maand.
 */
export function sliceContainsMonth(slice: SpendLimitPeriodSlice, month: string): boolean {
  return sliceContainsBucket(slice, `${month}-01`)
}

// ── Optelling per periode ────────────────────────────────────────────────────

/**
 * Sluit (joint_)transfer-rijen uit. Eigen-rekening-overboekingen zijn geen
 * uitgave; ze zouden de pot dubbel opblazen. De typelijst heeft één eigenaar —
 * `isRealAggRow` in lib/server-data/tx-aggregates.ts — die hier bewust wordt
 * hergebruikt in plaats van gekopieerd.
 */
function isCountable(row: SpendLimitAggregateRow): boolean {
  return isRealAggRow({ transaction_type: row.transactionType })
}

/**
 * Netto uitgave uit een paar aggregaat-sommen — de ENIGE plek waar het teken en
 * de nul-normalisatie van het grens-rekenwerk staan.
 *
 * `sumNegatief ≤ 0`, `sumPositief ≥ 0` → netto uitgave = −(beide opgeteld). Een
 * refund of chargeback op dezelfde grens verlaagt het bedrag dus.
 *
 * De `Object.is`-normalisatie is geen kosmetiek: in IEEE-754 levert −(0 + 0) een
 * NEGATIEVE nul op, en dat is precies wat een lege periode oplevert. Die zou als
 * "−€ 0" op het scherm belanden en maakt elke `Object.is`-vergelijking
 * stroomafwaarts verrassend. Alleen −0 wordt omgezet; NaN blijft NaN, zodat een
 * echte rekenfout zichtbaar blijft in plaats van als 0 te worden gepoetst.
 *
 * Waarom geëxporteerd: de motor, de loader (`lib/spend-limits/loader.ts`) en de
 * breakdown-route lezen dezelfde aggregaten in drie verschillende RIJVORMEN. De
 * vormen laten zich niet samenvouwen, de REGEL wel — en die stond eerder drie
 * keer letterlijk overgeschreven met een comment "identiek aan de motor".
 * Accepteert `string` omdat Postgres numerieke sommen als string teruggeeft.
 */
export function netSpendFromSums(
  sumNegatief: number | string,
  sumPositief: number | string,
): number {
  const raw = -(Number(sumNegatief) + Number(sumPositief))
  return Object.is(raw, -0) ? 0 : raw
}

/**
 * Bereken de uitkomst van één periode uit de aggregaat-rijen die eraan toebehoren.
 *
 * `periodMatchedAmount` is NETTO: |uitgaven| − ontvangsten. Een refund of
 * chargeback op hetzelfde budget/dezelfde tegenpartij verlaagt dus het bedrag en
 * kan een periode van "boven" naar "binnen" duwen. Er wordt bewust NIET op 0
 * geklemd: een periode waarin netto geld terugkwam hoort een negatief bedrag te
 * tonen, niet een gepoetste nul. De afgeleiden (`periodOverAmount`,
 * `periodHeadroom`) worden wél geklemd, want "−€40 boven de grens" is onzin.
 *
 * De grens EXACT geraakt telt als BINNEN (`matched == limit` → 'within').
 */
export function computePeriodOutcome(
  slice: SpendLimitPeriodSlice,
  rows: SpendLimitAggregateRow[],
  limitAmount: number,
): SpendLimitPeriodOutcome {
  let sumPositief = 0
  let sumNegatief = 0
  let count = 0
  const names = new Set<string>()

  for (const row of rows) {
    if (!sliceContainsBucket(slice, row.bucketStart)) continue
    if (!isCountable(row)) continue
    sumPositief += row.sumPositief
    sumNegatief += row.sumNegatief
    count += row.count
    for (const n of row.matchedNames ?? []) if (n) names.add(n)
  }

  const periodMatchedAmount = netSpendFromSums(sumNegatief, sumPositief)
  const status: SpendLimitStatus = periodMatchedAmount > limitAmount ? 'exceeded' : 'within'

  return {
    ...slice,
    periodMatchedAmount,
    limitAmount,
    periodOverAmount: Math.max(0, periodMatchedAmount - limitAmount),
    periodHeadroom: Math.max(0, limitAmount - periodMatchedAmount),
    status,
    // `limitAmount > 0` is geen kosmetiek: op een nulgrens is élke uitgave al een
    // overschrijding, en zonder deze guard zou een lege periode (0 ≥ 0,8 × 0)
    // permanent "bijna over je grens" melden.
    isNearLimit:
      status === 'within' &&
      limitAmount > 0 &&
      periodMatchedAmount >= SPEND_LIMIT_NEAR_LIMIT_PCT * limitAmount,
    matchedTransactionCount: count,
    matchedCounterpartyNames: [...names].sort(),
  }
}

// ── Reeksen ──────────────────────────────────────────────────────────────────

/**
 * De vier reeks-getallen over AFGESLOTEN periodes, aangeleverd oud → nieuw.
 *
 * Twee regels die makkelijk misgaan en daarom expliciet zijn:
 *  - de LOPENDE periode hoort hier niet in (de aanroeper filtert 'm eruit) —
 *    anders zou een reeks kunnen breken op een maand die nog niet voorbij is;
 *  - een periode ZONDER transacties telt als BINNEN de grens, niet als
 *    "geen data". Je hebt dan immers niets uitgegeven; dat is de beste
 *    denkbare uitkomst voor een uitgavengrens.
 */
export function computeStreaks(closedPeriods: SpendLimitPeriodOutcome[]): SpendLimitStreaks {
  let longest = 0
  let run = 0
  let exceeded = 0
  let lastWithin: string | null = null

  for (const p of closedPeriods) {
    if (p.status === 'within') {
      run += 1
      if (run > longest) longest = run
      lastWithin = p.periodKey
    } else {
      run = 0
      exceeded += 1
    }
  }

  // `run` staat na de lus op de reeks die tot en met de LAATSTE afgesloten
  // periode loopt — precies de definitie van de huidige reeks.
  return {
    currentStreak: run,
    longestStreak: longest,
    lastWithinPeriodKey: lastWithin,
    exceededPeriodCount: exceeded,
    closedPeriodCount: closedPeriods.length,
  }
}

// ── Trend ────────────────────────────────────────────────────────────────────

function avgOf(values: number[]): number {
  let s = 0
  for (const v of values) s += v
  return s / values.length
}

/**
 * De afgesloten periodes die volledig NÁ het aanmaken van de pot beginnen.
 *
 * ── ÉÉN HOME VOOR DE ONDERGRENS-PRIMITIEF ───────────────────────────────────
 * De regel is `slice.since >= createdAt[0..10]` — dezelfde vergelijking die
 * `streakStartsAfterCreation` (lib/notifications/spend-limit.ts) als boolean over
 * één reeks toepast. Dit is de array-vorm van dezelfde ondergrens; er is bewust
 * geen tweede drempel, geen tweede datumnormalisatie en geen tweede
 * datavlek-regel bijgekomen. Wordt die meldingen-helper ooit aangeraakt, dan
 * hoort hij op deze primitief te worden samengevouwen.
 *
 * ── DE SEMANTIEK (bewust streng, gespiegeld) ────────────────────────────────
 * Een periode telt alleen mee als ze volledig ná de aanmaak begint. Een pot die
 * halverwege maart is aangemaakt, heeft dus geen maart: die maand liep al voordat
 * de grens bestond, dus "je gaf er die maand dit uit" zegt niets over hoe je je
 * aan je grens houdt. Vanaf april telt alles gewoon mee. Een pot die op de eerste
 * dag van een periode is aangemaakt, heeft die periode wél (`>=`).
 *
 * ── ONBEKENDE AANMAAKDATUM ⇒ NIET CLAMPEN ───────────────────────────────────
 * Bij een lege, ontbrekende of onleesbare `createdAt` komt de hele lijst
 * ongewijzigd terug. Asymmetrisch en met opzet, exact zoals de meldingenlaag:
 * clampen-bij-twijfel zou een datavlek de trend permanent op 'unknown' zetten
 * zonder dat iemand het merkt; niet-clampen levert hooguit één te vroege richting
 * op. Zichtbaar fout is beter dan stil kapot.
 *
 * De vergelijking is een kale ISO-datumvergelijking: `since` is een lokale
 * kalenderdatum, `createdAt` een UTC-tijdstempel. Rond middernacht kan dat een
 * dag schelen — irrelevant, want de grens ligt op periodegrenzen die maanden uit
 * elkaar liggen.
 *
 * Omdat `closedPeriods` chronologisch oud → nieuw komt en `since` dus monotoon
 * stijgt, is het resultaat altijd een aaneengesloten STAART — nooit een lijst met
 * gaten waarover een gemiddelde onzin zou zijn.
 */
export function closedPeriodsSinceCreation(
  closedPeriods: SpendLimitPeriodOutcome[],
  createdAt: string | null | undefined,
): SpendLimitPeriodOutcome[] {
  const createdDate = typeof createdAt === 'string' ? createdAt.slice(0, 10) : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(createdDate)) return closedPeriods
  return closedPeriods.filter((p) => p.since >= createdDate)
}

/**
 * De trend over AFGESLOTEN periodes, oud → nieuw aangeleverd.
 *
 * ── AANMAAK-ONDERGRENS ──────────────────────────────────────────────────────
 * Met een leesbare `createdAt` tellen alleen periodes mee die volledig ná de
 * aanmaak van de pot beginnen (`closedPeriodsSinceCreation`). Zonder die grens
 * kreeg een splinternieuwe pot een richting over lege periodes van vóór zijn
 * bestaan: de motor telt een periode zonder transacties immers als "binnen de
 * grens" (bewuste regel), waardoor "je geeft minder uit dan daarvóór" in feite
 * "je bestond daarvóór niet" betekende. Blijven er minder dan `windowPeriods`
 * over, dan is er geen recent gemiddelde; blijven er minder dan `2 ×
 * windowPeriods` over, dan blijft `direction` op 'unknown' — dat volgt uit de
 * bestaande null-regels hieronder, er is geen aparte tak voor. De oppervlakken
 * tonen bij 'unknown' al "nog niet genoeg historie".
 *
 * WAT NIET VERANDERT: de reeks-getallen (`computeStreaks`) en de
 * periode-uitkomsten (`computePeriodOutcome`) zien deze ondergrens NIET. Een
 * kaart die "12 maanden op rij binnen je grens" zegt, blijft dat zeggen; alleen
 * de richting zwijgt tot er echte historie is. De mijlpaal-MELDING over zo'n
 * reeks heeft zijn eigen poort in de meldingenlaag.
 *
 * Vergelijkt het gemiddelde van de laatste `windowPeriods` afgesloten periodes
 * met dat van de `windowPeriods` daarvóór, met een 5%-drempel — hetzelfde
 * trend-idioom als `TrendIndicator` in components/app/counterparty-analysis-panel.tsx,
 * zodat de app één begrip van "trend" houdt.
 *
 * LET OP — OMGEKEERDE TEKEN-SEMANTIEK t.o.v. dat component. Daar is de grootheid
 * een SALDO (uitgaven negatief), hier een UITGAVE (altijd positief bij normale
 * boekingen). Méér uitgeven is dus een POSITIEVE change en heet `worsening`;
 * minder uitgeven is `improving`. Wie dit idioom kopieert en het teken meeneemt,
 * draait de betekenis om.
 *
 * De randgevallen zijn expliciet omdat ze alle vier een NaN of `Infinity%` op het
 * scherm zouden kunnen zetten (tellingen ná de aanmaak-ondergrens):
 *  - < 3 meetellende periodes → recent = null, direction 'unknown';
 *  - < 6 meetellende periodes → prior = null, direction 'unknown';
 *  - prior = 0 én recent = 0 → 'stable' met changePct 0 (niets ↔ niets);
 *  - prior = 0 én recent ≠ 0 → richting uit het teken, changePct null.
 */
export function computeSpendLimitTrend(
  closedPeriods: SpendLimitPeriodOutcome[],
  windowPeriods: number = SPEND_LIMIT_TREND_WINDOW,
  createdAt?: string | null,
): SpendLimitTrend {
  const w = Math.max(1, Math.floor(windowPeriods))
  // Alles hieronder rekent op `eligible`, nooit op de rauwe lijst: één plek waar
  // de ondergrens wordt toegepast, zodat het gemiddelde, het voortschrijdend
  // gemiddelde en de richting per definitie dezelfde periodes zien.
  const eligible = closedPeriodsSinceCreation(closedPeriods, createdAt)
  const amounts = eligible.map((p) => p.periodMatchedAmount)

  const movingAvgMatchedAmountByPeriod = eligible.map((p, i) => ({
    periodKey: p.periodKey,
    movingAvgMatchedAmount: i + 1 >= w ? avgOf(amounts.slice(i + 1 - w, i + 1)) : null,
  }))

  const recentAvgMatchedAmount = amounts.length >= w ? avgOf(amounts.slice(-w)) : null
  const priorAvgMatchedAmount = amounts.length >= 2 * w ? avgOf(amounts.slice(-2 * w, -w)) : null

  const base: SpendLimitTrend = {
    windowPeriods: w,
    movingAvgMatchedAmountByPeriod,
    recentAvgMatchedAmount,
    priorAvgMatchedAmount,
    avgMatchedAmountChange: null,
    avgMatchedAmountChangePct: null,
    direction: 'unknown',
  }

  if (recentAvgMatchedAmount === null || priorAvgMatchedAmount === null) return base

  const change = recentAvgMatchedAmount - priorAvgMatchedAmount

  if (priorAvgMatchedAmount === 0) {
    if (change === 0) {
      return { ...base, avgMatchedAmountChange: 0, avgMatchedAmountChangePct: 0, direction: 'stable' }
    }
    return {
      ...base,
      avgMatchedAmountChange: change,
      avgMatchedAmountChangePct: null,
      direction: change > 0 ? 'worsening' : 'improving',
    }
  }

  const changePct = (change / Math.abs(priorAvgMatchedAmount)) * 100
  const direction: SpendLimitTrendDirection =
    Math.abs(changePct) < SPEND_LIMIT_TREND_STABLE_PCT ? 'stable' : change > 0 ? 'worsening' : 'improving'

  return {
    ...base,
    avgMatchedAmountChange: change,
    avgMatchedAmountChangePct: changePct,
    direction,
  }
}

// ── Volledig rapport ─────────────────────────────────────────────────────────

/**
 * Bouw het complete rapport voor één grenzenpot.
 *
 * `windowPeriods` is het aantal periodes in het venster INCLUSIEF de lopende —
 * de loader haalt het per periodesoort uit `SPEND_LIMIT_WINDOW_BY_PERIOD` (13
 * maanden = 12 afgesloten + de huidige; 9 kwartalen; 4 jaren).
 *
 * `rule.createdAt` gaat UITSLUITEND naar de trend (aanmaak-ondergrens). De
 * periode-uitkomsten, `closedPeriods` en de reeks-getallen worden er bewust niet
 * door aangeraakt — zie de kop van dit bestand.
 */
export function buildSpendLimitReport(args: {
  rule: SpendLimitRule
  rows: SpendLimitAggregateRow[]
  now: Date
  windowPeriods: number
}): SpendLimitReport {
  const { rule, rows, now, windowPeriods } = args
  const slices = resolveSpendLimitPeriods(rule.period, now, windowPeriods)
  const outcomes = slices.map((s) => computePeriodOutcome(s, rows, rule.limitAmount))

  const closedPeriods = outcomes.filter((o) => !o.isOpen)
  // De laatste slice is per constructie de lopende periode.
  const currentPeriod = outcomes[outcomes.length - 1]

  return {
    currentPeriod,
    lastClosedPeriod: closedPeriods.length > 0 ? closedPeriods[closedPeriods.length - 1] : null,
    closedPeriods,
    streaks: computeStreaks(closedPeriods),
    trend: computeSpendLimitTrend(closedPeriods, SPEND_LIMIT_TREND_WINDOW, rule.createdAt),
  }
}
