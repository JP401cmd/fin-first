// ── Mijlpaal-tijdlijn — pure presentatie-ordening ────────────────────
//
// Van een platte log naar de leesvorm van de pagina /mijn/mijlpalen: per rij
// de krant-copy, en de rijen gegroepeerd per kalenderjaar (nieuwste eerst).
//
// Dit bestand REKENT NIETS en HAALT NIETS OP. Het ordent en labelt wat er al
// is: de copy komt uit `buildMilestoneCopy` (`copy.ts`), de rijen uit de log.
// Daardoor is de hele datalogica van het scherm puur testbaar — de server-page
// blijft een dunne schil om een query.
//
// De €→vrijheidstijd-vertaling loopt uitsluitend via `buildMilestoneCopy`; het
// dagtarief wordt hier doorgegeven, nooit afgeleid (grondslag-gate
// `npm run check:freedom-basis`).

import { buildMilestoneCopy } from './copy'
import { amsterdamParts } from '@/lib/tz'
import type { AchievedMilestoneRow } from './types'

/** Minimale doel-verwijzing die de naam-resolutie nodig heeft. */
export interface MilestoneGoalRef {
  id: string
  name: string
  user_id: string
}

export interface MilestoneTimelineEntry {
  row: AchievedMilestoneRow
  /** Krant-titel uit `buildMilestoneCopy`. */
  titel: string
  /**
   * Betekenis-zin uit `buildMilestoneCopy` — of `null` wanneer die zin niets
   * zou toevoegen: bij `kind='vermogen'` zonder dagtarief is de betekenis een
   * letterlijke herhaling van de titel (review-punt 31 aug), dus dan liever
   * geen tweede regel.
   */
  betekenis: string | null
  /**
   * Hoe zeker de datum is:
   *  - 'exact'     — waargenomen passage (`source='detect'`)
   *  - 'omstreeks' — seed-rij die historisch op snapshots is gedateerd
   *  - 'onbekend'  — seed-rij waarvoor GEEN datering bestond (schuldenvrij/
   *    noodfonds, of snapshots die niet ver genoeg teruggaan): `achieved_at`
   *    is dan het seed-moment zelf en zegt niets over de gebeurtenis. Die
   *    rijen landen in de "Zonder datum"-bak i.p.v. een vals jaar te claimen.
   */
  dateKind: 'exact' | 'omstreeks' | 'onbekend'
  /**
   * Compacter renderen (één regel, geen betekenis-zin). Waar voor
   * doel-checkpoints en voor stil gelogde (`source='seed'`) doel-rijen: dat
   * zijn tussenstations, geen gebeurtenissen waar de pagina naartoe leest.
   */
  secondary: boolean
  /**
   * Het euro-bedrag dat LETTERLIJK in `titel`/`betekenis` voorkomt, of `null`
   * wanneer de copy geen bedrag draagt. Alleen `kind='vermogen'` levert een
   * bedrag: bij `vrijheid` staan procenten in `threshold_value` en bij
   * `noodfonds` MAANDEN — die als euro's tonen zou een willekeurig getal
   * opleveren (zie de kolom-noot in `types.ts`).
   *
   * De consument gebruikt dit om het bedrag door de privacy-maskering te
   * halen; zonder maskering verandert er niets aan de zin.
   */
  euroAmount: number | null
}

export interface MilestoneTimelineYear {
  /** Kalenderjaar, of `null` wanneer `achieved_at` niet te lezen was. */
  year: number | null
  entries: MilestoneTimelineEntry[]
}

/**
 * Doelnaam voor een `doel`-mijlpaal. De log-rij draagt bewust geen naam; de
 * sleutelvormen zijn `doel-behaald:<id>` en `doel-checkpoint:<id>:<pct>`.
 *
 * De eigenaarscheck is defence-in-depth: doelenlijsten in deze app zijn vaak
 * huishoud-gescoopt (own-or-shared), en een partner-doelnaam mag nooit aan een
 * eigen mijlpaal-rij hangen. Onbekend doel (verwijderd, van een ander) → null;
 * de copy blijft dan generiek. Spiegelt `resolveFreshGoalName` in
 * `components/overview/overzicht-secondary-loader.tsx`.
 */
export function resolveMilestoneGoalName(
  milestoneKey: string,
  goals: readonly MilestoneGoalRef[],
  userId: string | null,
): string | null {
  if (!userId) return null
  const match = milestoneKey.match(/^doel-(?:behaald|checkpoint):([^:]+)/)
  if (!match) return null
  return goals.find((g) => g.id === match[1] && g.user_id === userId)?.name ?? null
}

/**
 * Krijgt deze rij de compacte (secundaire) regel?
 *
 * Twee gevallen: een checkpoint op een ver doel (tussenstation, per definitie
 * onderweg) en een doel dat stil is gelogd bij de seed-run (nooit gevierd, dus
 * ook nu geen hoofdregel). Alle andere seed-rijen — vermogen, vrijheid,
 * schuldenvrij, noodfonds — zijn wél echte gebeurtenissen uit je historie en
 * blijven volwaardig in beeld; alleen hun datum krijgt het "omstreeks"-voorbehoud.
 */
export function isSecondaryMilestone(row: AchievedMilestoneRow): boolean {
  if (row.milestone_key.startsWith('doel-checkpoint:')) return true
  return row.kind === 'doel' && row.source === 'seed'
}

/**
 * Kalenderjaar van `achieved_at` in Europe/Amsterdam (NIET de server-tijdzone:
 * op Vercel/UTC zou een passage om 00:30 NL-tijd anders in het vorige jaar
 * vallen — zelfde valkuil die lib/tz.ts app-breed afdekt), of `null` bij een
 * onleesbare waarde.
 */
function yearOf(achievedAt: string): number | null {
  const ms = Date.parse(achievedAt)
  return Number.isNaN(ms) ? null : amsterdamParts(new Date(ms)).year
}

/**
 * Zie `MilestoneTimelineEntry.dateKind`. De grens van 48 uur tussen
 * `achieved_at` en `created_at` scheidt "historisch gedateerd" van "terugval
 * op het seed-moment": een échte datering ligt maanden of jaren vóór de
 * seed-run, de terugval is exact hetzelfde moment.
 */
const SEED_DATERING_DREMPEL_MS = 48 * 60 * 60 * 1000

function dateKindOf(row: AchievedMilestoneRow): 'exact' | 'omstreeks' | 'onbekend' {
  if (row.source !== 'seed') return 'exact'
  const achieved = Date.parse(row.achieved_at)
  const created = row.created_at ? Date.parse(row.created_at) : Number.NaN
  if (Number.isNaN(achieved)) return 'onbekend'
  if (Number.isNaN(created)) return 'omstreeks'
  return created - achieved > SEED_DATERING_DREMPEL_MS ? 'omstreeks' : 'onbekend'
}

/**
 * Bouw de leesvorm: rijen chronologisch aflopend, gegroepeerd per jaar.
 *
 * @param rows      de eigen rijen uit `achieved_milestones` (volgorde maakt
 *                  niet uit — er wordt hier gesorteerd)
 * @param goals     eigen doelen voor de naam-resolutie (`id`, `name`, `user_id`)
 * @param userId    de ingelogde gebruiker (eigenaarscheck op de doelnaam)
 * @param dagtarief canoniek €/dag uit de bundel, of `null` — wordt ongewijzigd
 *                  doorgegeven aan `buildMilestoneCopy`
 */
export function buildMilestoneTimeline(
  rows: readonly AchievedMilestoneRow[],
  goals: readonly MilestoneGoalRef[],
  userId: string | null,
  dagtarief: number | null,
): MilestoneTimelineYear[] {
  // Decoreer-sorteer-groepeer: het jaar dat een rij claimt wordt ÉÉN keer
  // bepaald en daarna zowel gesorteerd als gegroepeerd.
  //
  // Die koppeling is de fix voor WF-MIJN-32. Eerder sorteerde de comparator op
  // de RAUWE `achieved_at` terwijl de groepering het jaar op `null` zette voor
  // 'onbekend'-rijen. Voor zo'n rij is `achieved_at` het seed-moment (vandaag)
  // — een volstrekt geldige datum, dus de NaN-tak ving 'm niet af en hij
  // sorteerde gewoon tussen de echte rijen van dit jaar in. Omdat de groepering
  // alleen AANEENGESLOTEN gelijke jaren samenvoegt, brak zo'n rij het jaar in
  // tweeën: "2026" → "Zonder datum" → "2026". Nu volgt de volgorde per
  // definitie de groepering: geen jaar ⇒ achteraan, dus de "Zonder datum"-bak
  // is altijd precies één aaneengesloten groep aan het eind.
  const decorated = rows.map((row) => {
    const dateKind = dateKindOf(row)
    // 'onbekend' claimt geen jaar: achieved_at is daar het seed-moment, niet de
    // gebeurtenis. Een onleesbare datum levert via `yearOf` óók null op.
    return { row, dateKind, year: dateKind === 'onbekend' ? null : yearOf(row.achieved_at) }
  })

  decorated.sort((a, b) => {
    // Jaarloze rijen ("Zonder datum") altijd achteraan, ongeacht hun timestamp.
    if (a.year === null || b.year === null) {
      if (a.year === b.year) return a.row.milestone_key.localeCompare(b.row.milestone_key)
      return a.year === null ? 1 : -1
    }
    // Hier is een jaar bekend, dus `achieved_at` is per definitie parsebaar
    // (`yearOf` geeft null zodra Date.parse NaN oplevert) — geen NaN-tak nodig.
    const ta = Date.parse(a.row.achieved_at)
    const tb = Date.parse(b.row.achieved_at)
    // Deterministische tiebreaker: het detect-pad schrijft alle rijen van één
    // run met dezelfde nowIso, en PostgreSQL geeft binnen gelijke ORDER-BY-
    // sleutels geen vaste volgorde — zonder tweede sleutel kan de tijdlijn
    // tussen twee bezoeken wisselen.
    return tb - ta || a.row.milestone_key.localeCompare(b.row.milestone_key)
  })

  const years: MilestoneTimelineYear[] = []

  for (const { row, dateKind, year } of decorated) {
    const goalName = resolveMilestoneGoalName(row.milestone_key, goals, userId)
    const { titel, betekenis } = buildMilestoneCopy(row, dagtarief, { goalName })

    const entry: MilestoneTimelineEntry = {
      row,
      titel,
      // Zonder dagtarief is de vermogens-betekenis een herhaling van de titel
      // ("€ 100.000 bereikt" / "Je netto vermogen passeerde € 100.000.") —
      // dan liever geen tweede regel dan hetzelfde feit twee keer.
      betekenis: row.kind === 'vermogen' && dagtarief === null ? null : betekenis,
      dateKind,
      secondary: isSecondaryMilestone(row),
      euroAmount:
        row.kind === 'vermogen' ? (row.threshold_value ?? row.observed_value ?? 0) : null,
    }

    // `year` komt uit de decoratie hierboven — dezelfde waarde waarop gesorteerd
    // is, zodat een jaargroep nooit door een jaarloze rij doorbroken kan worden.
    const last = years[years.length - 1]
    if (last && last.year === year) last.entries.push(entry)
    else years.push({ year, entries: [entry] })
  }

  return years
}
