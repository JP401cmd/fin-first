// ── Mijlpaal-motor (server-IO) ───────────────────────────────────────
//
// De enige plek die `achieved_milestones` schrijft. Draait in-band bij de
// /overzicht-load (ADR 0123 §1) — er is geen cron, en een viering hoort bij het
// moment waarop de gebruiker kijkt.
//
// DRIE HARDE EIGENSCHAPPEN:
//
//  1. IDEMPOTENT. Alle inserts gaan via `upsert(..., { onConflict:
//     'user_id,milestone_key', ignoreDuplicates: true })`. Een drempel die na
//     een dip opnieuw wordt gepasseerd botst op de bestaande rij: geen tweede
//     rij, geen tweede viering. De log is historie, geen stand.
//
//  2. NOOIT FATAAL. Elke fout wordt zacht gelogd en levert `{ fresh: null }`.
//     De /overzicht-load mag hier niet op stuklopen — een mislukte
//     mijlpaal-detectie is een gemist briefje, geen kapotte pagina.
//
//  3. NOOIT SERVICE-ROLE. Alles loopt via de meegegeven anon-RLS-client; RLS
//     scopet op `auth.uid() = user_id`. De client is een parameter en geen
//     import, precies zodat dit bestand nooit stilletjes naar een sleutel met
//     meer rechten kan grijpen.

import type { SupabaseClient } from '@supabase/supabase-js'
import { evaluateGoalCheckpoints, evaluateMilestones } from './detect'
import {
  goalMilestoneKey,
  type AchievedMilestoneRow,
  type GoalCheckpointObservation,
  type MilestoneCandidate,
  type MilestoneObservation,
  type MilestoneSource,
} from './types'

const TABLE = 'achieved_milestones'
const CONFLICT_TARGET = 'user_id,milestone_key'

/** Voltooid doel zoals de loader het aanlevert (uit `goals`). */
export interface CompletedGoalInput {
  id: string
  /** ISO-tijdstip van voltooiing; `null` → we weten het niet en dateren op nu. */
  completedAt: string | null
}

export interface MilestoneRunResult {
  /**
   * De nieuwste nog niet bevestigde mijlpaal, of `null`.
   *
   * Op het seed-pad ALTIJD `null`: de eerste run viert niets (ADR 0123 §5).
   */
  fresh: AchievedMilestoneRow | null
}

const NOTHING_FRESH: MilestoneRunResult = { fresh: null }

/** Rij zoals hij de DB in gaat (id/achieved_at-defaults laten we niet aan de DB over). */
type MilestoneInsert = {
  user_id: string
  milestone_key: string
  kind: MilestoneCandidate['kind']
  threshold_value: number | null
  observed_value: number | null
  achieved_at: string
  acknowledged_at: string | null
  source: MilestoneSource
}

/**
 * Eén snapshot-rij voor de historische datering.
 *
 * NUMERIC-kolommen kunnen als string binnenkomen; alles gaat daarom door
 * `toNumber` vóór er mee vergeleken wordt. `"9000" >= 10000` is in JS `false`
 * maar `"9000" >= "10000"` is `true` (lexicografisch) — precies de foutklasse
 * die een geseede mijlpaal stil zou misdateren.
 */
type SnapshotRow = {
  snapshot_date: string | null
  net_worth: number | string | null
  freedom_percentage: number | string | null
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * DATE (`YYYY-MM-DD`) → ISO-tijdstip. Middag UTC, niet middernacht: middernacht
 * UTC valt in Amsterdam op dezelfde kalenderdag, maar een DST-/weergaveronde
 * naar een lokale datum kan er een dag naast gaan zitten. 12:00Z ligt in beide
 * richtingen ruim binnen de dag.
 */
function snapshotDateToIso(date: string, nowIso: string): string {
  const iso = `${date}T12:00:00.000Z`
  const parsed = Date.parse(iso)
  if (!Number.isFinite(parsed)) return nowIso
  // Een snapshot in de toekomst is een data-anomalie; nooit vooruit dateren.
  return parsed > Date.parse(nowIso) ? nowIso : new Date(parsed).toISOString()
}

/**
 * Vroegste snapshot waarin de drempel al gehaald was → historische datering.
 * Geen enkele snapshot die hem haalt (of geen snapshots) → `null`, de aanroeper
 * valt dan terug op nu.
 */
function earliestDateFor(
  snapshots: SnapshotRow[],
  field: 'net_worth' | 'freedom_percentage',
  threshold: number,
  nowIso: string,
): string | null {
  for (const snap of snapshots) {
    if (!snap.snapshot_date) continue
    const value = toNumber(snap[field])
    if (value === null) continue
    if (value >= threshold) return snapshotDateToIso(snap.snapshot_date, nowIso)
  }
  return null
}

/**
 * Detecteer en log gepasseerde mijlpalen voor één gebruiker.
 *
 * @param supabase       anon-RLS-client (server), NOOIT service-role
 * @param userId         eigenaar; RLS dwingt dit ook zelf af
 * @param obs             de vijf canonieke waarden uit de bundel
 * @param completedGoals  voltooide doelen — worden STIL gelogd (ADR 0123 §7)
 * @param checkpointGoals actieve VERRE doelen (voor-gefilterd met
 *                        `isFarHorizonGoal`) met canonieke voortgang — hun
 *                        25/50/75%-checkpoints tellen als gewone mijlpalen
 *                        (plan-voorstel 3c; laagste vieringsprioriteit).
 */
export async function runMilestoneDetection(
  supabase: SupabaseClient,
  userId: string,
  obs: MilestoneObservation,
  completedGoals: CompletedGoalInput[] = [],
  checkpointGoals: GoalCheckpointObservation[] = [],
): Promise<MilestoneRunResult> {
  try {
    const nowIso = new Date().toISOString()

    // ── 1. Stand van zaken: is er ooit geseed, en wat staat er al? ────
    const [profileRes, existingRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('milestones_seeded_at')
        .eq('id', userId)
        .maybeSingle(),
      supabase
        .from(TABLE)
        .select('milestone_key')
        .eq('user_id', userId),
    ])

    if (profileRes.error) {
      console.error('[milestones:run] profiel lezen mislukt', profileRes.error)
      return NOTHING_FRESH
    }
    if (existingRes.error) {
      console.error('[milestones:run] bestaande mijlpalen lezen mislukt', existingRes.error)
      return NOTHING_FRESH
    }

    const seededAt = (profileRes.data as { milestones_seeded_at?: string | null } | null)
      ?.milestones_seeded_at ?? null
    const existingKeys = new Set(
      ((existingRes.data ?? []) as { milestone_key: string }[]).map((r) => r.milestone_key),
    )

    // Checkpoints tellen als gewone kandidaten mee: op het seed-pad worden
    // reeds gepasseerde checkpoints dus stil gelogd, op het detect-pad vallen
    // ze onder dezelfde vieringsregen-rem als de rest (laagste prioriteit).
    const candidates = [...evaluateMilestones(obs), ...evaluateGoalCheckpoints(checkpointGoals)]
    const goalCandidates = completedGoals.filter((g) => g.id)

    // ── 2a. Seed-pad — de eerste run viert niets ─────────────────────
    if (!seededAt) {
      const snapshots = await loadSnapshotsForDating(supabase, userId)

      const rows: MilestoneInsert[] = candidates
        .filter((c) => !existingKeys.has(c.key))
        .map((c) => ({
          user_id: userId,
          milestone_key: c.key,
          kind: c.kind,
          threshold_value: c.thresholdValue,
          observed_value: c.observedValue,
          // Alleen vermogen en vrijheid zijn historisch te dateren: dat zijn de
          // twee grootheden die `net_worth_snapshots` bewaart. Voor de rest
          // weten we het moment niet en is "nu" de eerlijkste vastlegging.
          achieved_at:
            (c.kind === 'vermogen' && c.thresholdValue !== null
              ? earliestDateFor(snapshots, 'net_worth', c.thresholdValue, nowIso)
              : c.kind === 'vrijheid' && c.thresholdValue !== null
                ? earliestDateFor(snapshots, 'freedom_percentage', c.thresholdValue, nowIso)
                : null) ?? nowIso,
          acknowledged_at: nowIso,
          source: 'seed',
        }))

      for (const goal of goalCandidates) {
        const key = goalMilestoneKey(goal.id)
        if (existingKeys.has(key)) continue
        rows.push({
          user_id: userId,
          milestone_key: key,
          kind: 'doel',
          threshold_value: null,
          observed_value: null,
          achieved_at: goal.completedAt ?? nowIso,
          acknowledged_at: nowIso,
          source: 'seed',
        })
      }

      if (rows.length > 0) {
        const { error } = await supabase
          .from(TABLE)
          .upsert(rows, { onConflict: CONFLICT_TARGET, ignoreDuplicates: true })
        if (error) {
          // Bewust GEEN seed-markering zetten als de log niet geschreven is:
          // dan zou de volgende run alle bestaande drempels als "vers" zien en
          // een verse gebruiker een reeks vieringen geven die nooit gebeurde.
          console.error('[milestones:run] seed-insert mislukt', error)
          return NOTHING_FRESH
        }
      }

      // Ook bij nul rijen zetten: een verse gebruiker met nul gepasseerde
      // drempels moet uit de seed-modus komen, anders slikt hij zijn eerste
      // échte €10.000 stil in (ADR 0123 §5).
      const { error: seedError } = await supabase
        .from('profiles')
        .update({ milestones_seeded_at: nowIso })
        .eq('id', userId)
      if (seedError) {
        console.error('[milestones:run] seed-markering zetten mislukt', seedError)
      }

      return NOTHING_FRESH
    }

    // ── 2b. Detect-pad ───────────────────────────────────────────────
    // Vieringsregen-rem (review M4): één grote sprong (bv. een eerste broker-
    // import van €0 → €150k) passeert meerdere drempels tegelijk. Zes
    // opeenvolgende vieringen over zes bezoeken is precies de devaluatie die
    // ADR 0123 §7 wil voorkomen. Daarom: alleen de meest betekenisvolle nieuwe
    // kandidaat blijft onbevestigd (= wordt gevierd); de rest wordt stil
    // gelogd. De volledige log blijft compleet voor de latere tijdlijn.
    const verse = candidates.filter((c) => !existingKeys.has(c.key))
    // `doel` (checkpoints) expliciet op 0: een doel-checkpoint is de lichtste
    // mijlpaal en verliest dus altijd van een vermogens-/vrijheidsdrempel die
    // in dezelfde run passeert.
    const KIND_GEWICHT: Record<string, number> = { vrijheid: 4, schuldenvrij: 3, vermogen: 2, noodfonds: 1, doel: 0 }
    const teVieren =
      verse.length > 1
        ? [...verse].sort(
            (a, b) =>
              (KIND_GEWICHT[b.kind] ?? 0) - (KIND_GEWICHT[a.kind] ?? 0) ||
              (b.thresholdValue ?? 0) - (a.thresholdValue ?? 0),
          )[0]
        : verse[0]
    const rows: MilestoneInsert[] = verse.map((c) => ({
      user_id: userId,
      milestone_key: c.key,
      kind: c.kind,
      threshold_value: c.thresholdValue,
      observed_value: c.observedValue,
      achieved_at: nowIso,
      acknowledged_at: c === teVieren ? null : nowIso,
      source: 'detect',
    }))

    // Een behaald doel wordt WEL gelogd maar NIET gevierd: het doelen-scherm
    // viert het al in context. Twee vieringen voor één gebeurtenis devalueert
    // beide (ADR 0123 §7). Vandaar `acknowledged_at = nu` bij het insert.
    for (const goal of goalCandidates) {
      const key = goalMilestoneKey(goal.id)
      if (existingKeys.has(key)) continue
      rows.push({
        user_id: userId,
        milestone_key: key,
        kind: 'doel',
        threshold_value: null,
        observed_value: null,
        achieved_at: goal.completedAt ?? nowIso,
        acknowledged_at: nowIso,
        source: 'detect',
      })
    }

    if (rows.length > 0) {
      const { error } = await supabase
        .from(TABLE)
        .upsert(rows, { onConflict: CONFLICT_TARGET, ignoreDuplicates: true })
      if (error) {
        console.error('[milestones:run] detect-insert mislukt', error)
        // Doorgaan: een eerder gelogde, nog onbevestigde mijlpaal mag hier niet
        // door een mislukt insert onzichtbaar worden.
      }
    }

    // ── 3. De verse mijlpaal ─────────────────────────────────────────
    // Onbevestigd = nog niet gevierd. Bewust een verse SELECT en geen afleiding
    // uit `rows`: een mijlpaal van gisteren die de gebruiker nog niet zag hoort
    // er ook bij, en een parallel request kan er net één geschreven hebben.
    const { data: freshRow, error: freshError } = await supabase
      .from(TABLE)
      .select('*')
      .eq('user_id', userId)
      .is('acknowledged_at', null)
      .order('achieved_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (freshError) {
      console.error('[milestones:run] verse mijlpaal lezen mislukt', freshError)
      return NOTHING_FRESH
    }

    return { fresh: (freshRow as AchievedMilestoneRow | null) ?? null }
  } catch (err) {
    console.error('[milestones:run] onverwachte fout', err)
    return NOTHING_FRESH
  }
}

/**
 * Snapshots voor de historische datering, oplopend op datum. Faalt zacht:
 * zonder snapshots dateert de seed-run gewoon op nu.
 */
async function loadSnapshotsForDating(
  supabase: SupabaseClient,
  userId: string,
): Promise<SnapshotRow[]> {
  const { data, error } = await supabase
    .from('net_worth_snapshots')
    .select('snapshot_date, net_worth, freedom_percentage')
    .eq('user_id', userId)
    .order('snapshot_date', { ascending: true })
  if (error) {
    console.error('[milestones:run] snapshots lezen mislukt', error)
    return []
  }
  return (data ?? []) as SnapshotRow[]
}
