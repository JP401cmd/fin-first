import type { SupabaseClient } from '@supabase/supabase-js'
import { USER_REPORT_SCREENSHOT_RETENTION_DAYS, retentionCutoffDaysIso } from '@/lib/retention'

/**
 * Single source of truth voor de STORAGE-kant van het AVG-datamodel — ADR 0152,
 * tegenhanger van lib/user-data-tables.ts (de tabellen).
 *
 * `storage.objects` heeft géén foreign key naar `auth.users`. De ON DELETE
 * CASCADE die bij tabellen het vangnet is (migratie 20260721140000) bestaat hier
 * dus niet: wat in een bucket staat, blijft staan tot iemand het expliciet wist.
 * Precies dat gebeurde niet — een gebruiker die zijn account verwijderde liet
 * zijn schermafbeeldingen (beelden van financiële schermen) onbeperkt achter
 * onder zijn oude UUID.
 *
 * DRIFT-BAKEN: {@link ALL_BUCKETS} moet élke bucket bevatten die de repo aanmaakt
 * (migratie `INSERT INTO storage.buckets` of `createBucket(...)` in code), in
 * PRECIES ÉÉN partitie — user-scoped (gewist bij verwijdering/reset) of
 * niet-persoonlijk (met reden). De vitest lib/user-data-buckets.test.ts scant de
 * bron en wordt rood zodra een nieuwe upload-bucket hier niet is ingedeeld.
 *
 * UITROLVOLGORDE: een entry in USER_SCOPED_BUCKETS moet remote BESTAAN vóór de
 * code landt — `list()` op een onbekende bucket gooit, en stap 0 van
 * deleteAllUserData faalt dan hard, waarmee élke verwijdering én reset een 500
 * wordt. Bucket-migratie eerst, entry daarna (zelfde release mag, andere
 * volgorde niet).
 */

/**
 * Buckets waarvan het eerste padsegment de `user_id` is (afgedwongen door de
 * storage-policies). `deleteAllUserData` wist bij een service-client de hele
 * prefix `<user-id>/` — bij reset én bij volledige verwijdering, net als de
 * persoonlijke tabellen.
 */
export const USER_SCOPED_BUCKETS: readonly string[] = [
  // Schermafbeeldingen bij meldingen: `{user_id}/{report_id}.<ext>`, privé,
  // geen DELETE-policy voor de gebruiker (migratie 20260806104500). Daarnaast
  // een bewaartermijn van 90 dagen (retentie-cron, zie purgeReportScreenshots).
  'user-report-screenshots',
  // Pensioenoverzichten (PDF): `{user_id}/{life_event_id}/pensioenoverzicht.pdf`,
  // privé, eigen-rij DELETE-policy (migratie 20260316500001). Lag tot ADR 0152
  // eveneens buiten de wis; geen bewaartermijn — het document is eigen inhoud
  // van de gebruiker en volgt de levensduur van het account.
  'pension-documents',
] as const

/**
 * Buckets ZONDER persoonsgegevens van gebruikers; vallen bewust buiten de wis.
 * De waarde is de reden.
 */
export const NON_PERSONAL_BUCKETS: Record<string, string> = {
  'guide-help':
    'Beheer-content: door de superadmin geüploade uitlegschermen per helpKey ' +
    '(`{helpKey}/{nn}-{slug}.<ext>`, openbaar). Geen gebruikersupload, geen user_id in het pad.',
}

/** Canonieke inventaris — vergeleken met de bron door de dekkings-vitest. */
export const ALL_BUCKETS: readonly string[] = [
  ...USER_SCOPED_BUCKETS,
  ...Object.keys(NON_PERSONAL_BUCKETS),
] as const

/** Bucket waarvan de retentie-cron de schermafbeeldingen opruimt. */
export const USER_REPORT_SCREENSHOT_BUCKET = 'user-report-screenshots'

/** Supabase Storage geeft per `list()` maximaal dit aantal terug; we pagineren. */
const LIST_PAGE_SIZE = 1000
/** `remove()` in brokken, zodat één te groot verzoek niet de hele wis laat stranden. */
const REMOVE_CHUNK_SIZE = 100

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface StorageEntry {
  name: string
  /** null = map (Storage kent geen echte mappen; dit is de enige aanwijzing). */
  id: string | null
  created_at: string | null
}

export interface StoredObject {
  path: string
  createdAt: string | null
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * Alle objecten onder `prefix` (recursief). Storage `list()` geeft één niveau:
 * bestanden mét `id`, "mappen" zonder. Pensioendocumenten zitten twee niveaus
 * diep (`{user}/{event}/…`), dus een platte listing zou die missen.
 * Gooit bij een storage-fout — de aanroeper beslist wat dat betekent.
 */
export async function listObjectsUnderPrefix(
  service: SupabaseClient,
  bucket: string,
  prefix: string,
): Promise<StoredObject[]> {
  const out: StoredObject[] = []
  const pending: string[] = [prefix]
  while (pending.length > 0) {
    const dir = pending.pop() as string
    for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
      const { data, error } = await service.storage
        .from(bucket)
        .list(dir, { limit: LIST_PAGE_SIZE, offset })
      if (error) {
        throw new Error(`[storage] listing van ${bucket}/${dir} mislukt: ${error.message}`)
      }
      const entries = (data ?? []) as StorageEntry[]
      for (const entry of entries) {
        const path = dir ? `${dir}/${entry.name}` : entry.name
        if (entry.id === null) pending.push(path)
        else out.push({ path, createdAt: entry.created_at })
      }
      if (entries.length < LIST_PAGE_SIZE) break
    }
  }
  return out
}

/** Verwijdert `paths` in brokken; gooit bij de eerste fout. Geeft het aantal terug. */
export async function removeObjects(
  service: SupabaseClient,
  bucket: string,
  paths: readonly string[],
): Promise<number> {
  for (const part of chunk(paths, REMOVE_CHUNK_SIZE)) {
    const { error } = await service.storage.from(bucket).remove(part)
    if (error) {
      throw new Error(`[storage] wissen van ${part.length} objecten in ${bucket} mislukt: ${error.message}`)
    }
  }
  return paths.length
}

/**
 * Wist de prefix `<userId>/` in élke user-scoped bucket. Aangeroepen door
 * `deleteAllUserData` als ALLEREERSTE stap wanneer een service-client meekomt.
 *
 * Bewust HARD falend (throw), anders dan `serviceWipeTable` in seed-persona.ts:
 * daar is de DB-cascade het vangnet als de wis mislukt, hier is er geen vangnet.
 * Door vóór de tabellen te draaien blijft bij een fout het account intact en
 * kan de gebruiker het gewoon opnieuw proberen — een half gewist account met
 * achtergebleven beeld is het scenario dat we juist uitsluiten.
 *
 * Geeft per bucket het aantal gewiste objecten terug (0 als de prefix leeg is).
 */
export async function wipeUserBucketPrefixes(
  service: SupabaseClient,
  userId: string,
): Promise<Record<string, number>> {
  // Vangrail: een lege of niet-UUID prefix zou de WORTEL listen en dus álle
  // gebruikers wissen. Elke aanroeper geeft een geverifieerde auth-id mee, maar
  // deze functie is de laatste die het kan zien.
  if (!UUID_RE.test(userId)) {
    throw new Error('[storage] prefix-wis geweigerd: userId is geen UUID')
  }
  const counts: Record<string, number> = {}
  for (const bucket of USER_SCOPED_BUCKETS) {
    const objects = await listObjectsUnderPrefix(service, bucket, userId)
    counts[bucket] = await removeObjects(
      service,
      bucket,
      objects.map((o) => o.path),
    )
  }
  return counts
}

export interface BucketSweepResult {
  /** Objecten onder een prefix waarvan het account niet meer bestaat. */
  wees: number
  /** Objecten ouder dan de bewaartermijn, van bestaande accounts (alleen buckets mét termijn). */
  verlopen: number
  /** Prefixen die geen UUID zijn — niet door een gebruiker geüpload; bewust ongemoeid. */
  overgeslagenPrefixen: string[]
}

/** Bestaanscheck in brokken, zodat PostgREST's `max_rows` nooit stil rijen afkapt. */
const EXISTS_CHUNK_SIZE = 100

/** Alle prefixen (mappen) in de wortel van een bucket, gepagineerd. */
async function listRootPrefixes(
  service: SupabaseClient,
  bucket: string,
): Promise<{ userPrefixes: string[]; overgeslagenPrefixen: string[] }> {
  const prefixes: string[] = []
  for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
    const { data, error } = await service.storage
      .from(bucket)
      .list('', { limit: LIST_PAGE_SIZE, offset })
    if (error) {
      throw new Error(`[storage] listing van de wortel van ${bucket} mislukt: ${error.message}`)
    }
    const entries = (data ?? []) as StorageEntry[]
    // Bestanden ín de wortel zijn er per policy niet; mappen (id null) zijn de prefixen.
    prefixes.push(...entries.filter((e) => e.id === null).map((e) => e.name))
    if (entries.length < LIST_PAGE_SIZE) break
  }
  return {
    userPrefixes: prefixes.filter((p) => UUID_RE.test(p)),
    overgeslagenPrefixen: prefixes.filter((p) => !UUID_RE.test(p)),
  }
}

/**
 * Welke van deze prefixen zijn van een VERDWENEN account?
 *
 * Twee stappen, beide fail-closed (fout → throw, niets gewist — op een onzeker
 * antwoord het beeld van een levend account wissen is erger dan een nacht
 * overslaan):
 *  1. `profiles` (cascadeert vanaf auth.users; signup-trigger vult 'm). Wie
 *     hier staat, leeft. Goedkoop: één query per 100 prefixen.
 *  2. Wie hier NIET staat is pas een wees na bevestiging door
 *     `auth.admin.getUserById` — `profiles` heeft een eigen-rij ALL-policy, dus
 *     een gebruiker kan zijn profielrij zelf wissen terwijl zijn account
 *     bestaat. Alleen een expliciet "niet gevonden" telt; elke andere fout gooit.
 *     Kost nul calls zolang er geen kandidaten zijn.
 */
async function findOrphanPrefixes(service: SupabaseClient, prefixes: readonly string[]): Promise<Set<string>> {
  const live = new Set<string>()
  for (const part of chunk(prefixes, EXISTS_CHUNK_SIZE)) {
    const { data, error } = await service.from('profiles').select('id').in('id', part)
    if (error) {
      throw new Error(`[storage] bestaanscheck van prefixen mislukt: ${error.message}`)
    }
    for (const r of (data ?? []) as { id: string }[]) live.add(r.id)
  }
  const orphans = new Set<string>()
  for (const prefix of prefixes) {
    if (live.has(prefix)) continue
    const { data, error } = await service.auth.admin.getUserById(prefix)
    if (data?.user) continue
    const notFound = error?.status === 404 || error?.code === 'user_not_found'
    if (!notFound) {
      throw new Error(
        `[storage] bevestiging van wees-prefix mislukt: ${error?.message ?? 'geen gebruiker en geen fout'}`,
      )
    }
    orphans.add(prefix)
  }
  return orphans
}

interface SweepOptions {
  /** Epoch-ms; objecten van levende accounts met `created_at` eerder dan dit gaan weg. Undefined = geen termijn. */
  cutoffMs?: number
  /** Vóór het wissen `user_reports.screenshot_path` loskoppelen voor deze paden. */
  unlinkReportPaths?: boolean
}

/**
 * Veegt één user-scoped bucket: wezen altijd, verlopen alleen met `cutoffMs`.
 * Bij `unlinkReportPaths` gaat éérst het pad op NULL, dán het object weg — mislukt
 * het wissen, dan is het pad los maar het object nog oud en pakt de volgende
 * nacht het alsnog. Andersom zou een dood pad achterblijven dat de Notion-sync
 * elke keer opnieuw probeert te tekenen.
 */
async function sweepUserBucket(
  service: SupabaseClient,
  bucket: string,
  opts: SweepOptions,
): Promise<BucketSweepResult> {
  const { userPrefixes, overgeslagenPrefixen } = await listRootPrefixes(service, bucket)
  if (userPrefixes.length === 0) return { wees: 0, verlopen: 0, overgeslagenPrefixen }

  const orphans = await findOrphanPrefixes(service, userPrefixes)
  const weesPaden: string[] = []
  const verlopenPaden: string[] = []
  for (const prefix of userPrefixes) {
    const objects = await listObjectsUnderPrefix(service, bucket, prefix)
    if (orphans.has(prefix)) {
      weesPaden.push(...objects.map((o) => o.path))
      continue
    }
    if (opts.cutoffMs === undefined) continue
    for (const o of objects) {
      // Als epoch vergelijken, niet als tekst: Storage geeft `+00:00`-suffixen terug
      // waar onze cutoff op `Z` eindigt, en die twee sorteren als string verkeerd.
      const createdMs = o.createdAt ? Date.parse(o.createdAt) : Number.NaN
      if (Number.isFinite(createdMs) && createdMs < opts.cutoffMs) verlopenPaden.push(o.path)
    }
  }

  const alle = [...weesPaden, ...verlopenPaden]
  if (opts.unlinkReportPaths) {
    for (const part of chunk(alle, REMOVE_CHUNK_SIZE)) {
      const { error } = await service
        .from('user_reports')
        .update({ screenshot_path: null })
        .in('screenshot_path', part)
      if (error) {
        throw new Error(`[storage] loskoppelen van screenshot_path mislukt: ${error.message}`)
      }
    }
  }
  await removeObjects(service, bucket, alle)
  return { wees: weesPaden.length, verlopen: verlopenPaden.length, overgeslagenPrefixen }
}

/**
 * Nachtelijke veeg over ÁLLE user-scoped buckets (ADR 0152), via /api/cron/retention:
 *
 *  - WEZEN, in elke bucket: een prefix van een verdwenen account gaat volledig
 *    weg, ongeacht leeftijd. Vangnet voor uploads van vóór ADR 0152, voor een
 *    upload die nog in-flight was tijdens de wis (het sessie-JWT blijft geldig
 *    tot `auth.admin.deleteUser`) en voor een hersteld back-up-object. Ná ADR
 *    0152 wist de accountverwijdering zelf; dit is het tweede slot.
 *  - VERLOPEN, alleen in `user-report-screenshots`: objecten ouder dan
 *    {@link USER_REPORT_SCREENSHOT_RETENTION_DAYS} van bestaande accounts, mét
 *    loskoppeling van `user_reports.screenshot_path`. Pensioendocumenten zijn
 *    eigen inhoud zonder termijn.
 *
 * Gooit bij een storage-/DB-fout — de cron registreert dat als storing.
 */
export async function purgeUserScopedBuckets(
  service: SupabaseClient,
  now: Date = new Date(),
): Promise<Record<string, BucketSweepResult>> {
  const cutoffMs = Date.parse(retentionCutoffDaysIso(USER_REPORT_SCREENSHOT_RETENTION_DAYS, now))
  const result: Record<string, BucketSweepResult> = {}
  for (const bucket of USER_SCOPED_BUCKETS) {
    const isScreenshots = bucket === USER_REPORT_SCREENSHOT_BUCKET
    result[bucket] = await sweepUserBucket(service, bucket, {
      cutoffMs: isScreenshots ? cutoffMs : undefined,
      unlinkReportPaths: isScreenshots,
    })
  }
  return result
}

