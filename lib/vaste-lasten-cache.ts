// lib/vaste-lasten-cache.ts
//
// Vingerafdruk-cache voor de VASTE-LASTENSAMENVATTING (`loadVasteLastenSummary`).
//
// Aanleiding (perf): die loader haalt het volledige 12-maands transactievenster
// op — alle rijen, acht kolommen breed, in meerdere pagina's — en laat daar
// vervolgens `detectRecurringTransactions` overheen lopen: honderden regexes per
// tegenpartij-groep, tientallen tot honderden milliseconden synchrone server-CPU.
// Dat gebeurt op minstens vier oppervlakken (cashflow-hub, vaste-lastenpagina,
// de statusroute en binnen `loadDashboardData`), en React `cache()` overleeft
// geen request-grens — dus per request opnieuw. Terwijl de uitkomst tussen twee
// requests door bijna nooit verandert.
//
// VORM: gespiegeld op lib/cashflow-status-cache.ts en lib/page-status/status-cache.ts
// — bewust GEEN derde variant. Eén verschil: die twee zijn puur TTL-gestuurd, deze
// hangt aan een VINGERAFDRUK van de onderliggende gegevens. De TTL is hier het
// vangnet, niet het mechanisme.
//
// WAAROM DEZE CACHE MAG EN DIE OP /api/cashflow/settings NIET (T2.2-review, commit
// 316586b9): die cachete VELDEN DIE DE GEBRUIKER ZELF INVULT en gaf na een
// opslag-actie de waarde van vóór de bewerking terug — de gebruiker las zijn eigen
// invoer verkeerd terug. Deze cachet een AFGELEIDE SAMENVATTING: een detectie-
// uitkomst over transactiehistorie, die niemand invult. Lees die verwijdering dus
// niet als "caches horen hier niet" — de meetlat is of de gecachete waarde een
// invoerveld is dat de gebruiker terugleest. Precies daarom draagt de vingerafdruk
// hieronder óók de INHOUD van de bevestigde `recurring_transactions`: dát zijn wél
// door de gebruiker bewerkte velden (naam, bedrag, frequentie, de
// 'excluded'-markering), en die moeten meteen doorwerken, niet pas na de TTL.
//
// BEGRENSD: de Map wordt gesleuteld op user-id; de vingerafdruk staat ÍN de entry.
// Zou de vingerafdruk in de Map-sleutel staan, dan liet elke import een nieuwe
// entry achter die pas na de TTL vervalt — bij een reeks mutaties een stapel dode
// samenvattingen in het geheugen. Nu geldt: hooguit één entry per gebruiker, en
// een verse vingerafdruk overschrijft de vorige.
//
// GEEN expliciete invalidatie: de Map leeft per lambda-instance, dus een
// mutatie-getriggerde purge werkt niet cross-instance en zou schijnzekerheid
// geven. Invalidatie is impliciet — een import of mutatie verandert de
// vingerafdruk, dus de entry mist vanzelf.
//
// Cross-account-veiligheid: de sleutel is ALTIJD de user-id, dus een entry kan
// nooit naar een andere gebruiker lekken; entries verlopen vanzelf, dus een logout
// hoeft de cache niet te wissen. Het PERSPECTIEF zit bewust NIET in de sleutel:
// `loadVasteLastenSummary` neemt geen perspectief aan en leest puur wat RLS
// zichtbaar maakt (eigen rijen + gedeelde huishoudrijen), dus de uitkomst is per
// definitie perspectief-blind. Anders dan bij de statusroute, waar
// `loadCashflowData(supabase, perspective)` de uitkomst wél stuurt. Zou deze
// loader ooit een perspectief-parameter krijgen, dan MOET die alsnog de sleutel in.

import type { VasteLastenSummary } from '@/lib/vaste-lasten-summary'

/**
 * Time-to-live van een cache-entry (ms). Ruimer dan de statuscaches (45 s) omdat
 * de vingerafdruk het echte invalidatiemechanisme is; de TTL vangt alleen af wat
 * de vingerafdruk niet ziet (zie `VasteLastenFingerprintInput`).
 */
export const VASTE_LASTEN_CACHE_TTL_MS = 30 * 60_000

/**
 * De goedkope ronde waaruit de vingerafdruk wordt gebouwd. Alles hierin is een
 * aggregaat of een kleine, begrensde rijenset — nooit het transactievenster zelf.
 *
 * WAT DE VINGERAFDRUK ZIET:
 *  - rijen erbij of eraf in het venster (`txCount`);
 *  - een verschoven venstergrens bij een maandwissel (`windowStart`);
 *  - een nieuwe of gewijzigde bevestigde vaste last, inclusief hernoemen,
 *    bedrag wijzigen en op 'excluded' zetten (`recurring`, op inhoud);
 *  - een import (`txCount` + `txMaxCreatedAt`).
 *
 * WAT HIJ NIET SLUITEND ZIET: een bewerking op een BESTAANDE transactierij die
 * het aantal en de maxima ongemoeid laat. `txMaxUpdatedAt` vangt dat op voor de
 * paden die `updated_at` meeschrijven (het transactieformulier, de
 * categorisatie), maar er is geen trigger op die kolom, dus dat signaal is
 * best-effort en geen garantie. Bewust aanvaard: zo'n bewerking verschuift een
 * gemiddelde over minstens drie voorvallen — de TTL is daar het vangnet voor.
 */
export interface VasteLastenFingerprintInput {
  /** Ondergrens van het 12-maandsvenster (`YYYY-MM-01`). */
  windowStart: string
  txCount: number | null
  txMaxDate: string | null
  txMaxCreatedAt: string | null
  txMaxUpdatedAt: string | null
  /** De actieve `recurring_transactions`, op INHOUD (zie de kop van dit bestand). */
  recurring: {
    id: string
    counterparty_name: string | null
    amount: number | string | null
    name: string | null
    frequency: string | null
    category_override: string | null
    end_date?: string | null
  }[]
}

/**
 * Stabiele 64-bits digest (twee onafhankelijke 32-bits accumulatoren, plus de
 * lengte van de invoer). Bewust pure JS en geen `node:crypto`: dit bestand hangt
 * aan een loader die ook in een niet-Node-runtime geladen kan worden. Een botsing
 * zou een verouderde samenvatting opleveren; met 64 bits tegen één opgeslagen
 * vingerafdruk per gebruiker is die kans binnen een TTL-venster verwaarloosbaar.
 */
function digest(input: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x1b873593
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193)
    h2 = Math.imul(h2 + c, 0x85ebca6b) ^ (h2 >>> 13)
  }
  return `${(h1 >>> 0).toString(36)}.${(h2 >>> 0).toString(36)}.${input.length.toString(36)}`
}

/**
 * Bouwt de vingerafdruk. Twee dingen zijn hier wezenlijk:
 *
 *  1. De recurring-rijen worden op `id` gesorteerd voordat ze meegaan: PostgREST
 *     geeft zonder `order` geen volgordegarantie, en een vingerafdruk die op
 *     rijvolgorde reageert zou willekeurig missen.
 *  2. De invoer wordt via JSON samengesteld, niet met een scheidingsteken aan
 *     elkaar geplakt. Elk teken dat als scheiding zou dienen mág namelijk in een
 *     naam voorkomen, en dan levert {naam: 'Huur', frequentie: 'monthly'} exact
 *     dezelfde tekst op als {naam: 'Huurmonthly', frequentie: ''} — een botsing
 *     vóór het hashen, die geen aantal hash-bits meer kan repareren.
 */
export function vasteLastenFingerprint(input: VasteLastenFingerprintInput): string {
  const recurring = [...input.recurring]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((r) => [
      r.id,
      r.counterparty_name,
      r.amount,
      r.name,
      r.frequency,
      r.category_override,
      r.end_date ?? null,
    ])
  return digest(
    JSON.stringify([
      input.windowStart,
      input.txCount,
      input.txMaxDate,
      input.txMaxCreatedAt,
      input.txMaxUpdatedAt,
      recurring,
    ]),
  )
}

interface CacheEntry {
  fingerprint: string
  summary: VasteLastenSummary
  expiresAt: number
}

const store = new Map<string, CacheEntry>()

/**
 * Uitkomst van een cache-lezing. Discriminated union, net als bij de
 * cashflow-statuscache: `hit: true` gárandeert een samenvatting, zodat een lege
 * samenvatting nooit als hit door te gaan is.
 */
export type VasteLastenCacheRead =
  | { hit: true; summary: VasteLastenSummary }
  | { hit: false; summary: null }

/**
 * Lees de entry van deze gebruiker. `hit` is alleen waar als de entry bestaat,
 * niet verlopen is, én op dezelfde vingerafdruk staat.
 *
 * Een VERLOPEN entry wordt meteen opgeruimd (hij is dood). Een entry met een
 * ándere vingerafdruk blijft staan: de aanroeper schrijft er direct hierna
 * overheen, dus opruimen levert niets op, en een lezing die een geldige entry
 * vernietigt is een verrassing die niemand van een `read` verwacht.
 */
export function readVasteLastenCache(
  userId: string,
  fingerprint: string,
  now: number = Date.now(),
): VasteLastenCacheRead {
  const entry = store.get(userId)
  if (!entry) return { hit: false, summary: null }
  if (entry.expiresAt <= now) {
    store.delete(userId)
    return { hit: false, summary: null }
  }
  if (entry.fingerprint !== fingerprint) return { hit: false, summary: null }
  return { hit: true, summary: entry.summary }
}

/** Schrijf de entry van deze gebruiker met TTL vanaf `now` (overschrijft de vorige). */
export function writeVasteLastenCache(
  userId: string,
  fingerprint: string,
  summary: VasteLastenSummary,
  now: number = Date.now(),
  ttlMs: number = VASTE_LASTEN_CACHE_TTL_MS,
): void {
  store.set(userId, { fingerprint, summary, expiresAt: now + ttlMs })
}

/** Alleen voor tests: wist de volledige cache. */
export function __resetVasteLastenCache(): void {
  store.clear()
}
