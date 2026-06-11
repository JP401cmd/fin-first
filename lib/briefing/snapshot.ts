// ── Briefing Weekly Snapshot (server) ───────────────────────────────
//
// Bevriest de /overzicht-briefing per ISO-week (Europe/Amsterdam) — het is
// een *wekelijkse* briefing — en beheert de "1× per dag handmatig verversen"-
// regel. Opgeslagen als één jsonb-kolom `profiles.briefing_snapshot`.
//
// Gedrag:
//  - Eerste bezoek in een nieuwe ISO-week → automatisch een nieuwe snapshot
//    wegschrijven. De rest van de week blijft die bevroren, ook als de
//    onderliggende cijfers wijzigen.
//  - De gebruiker mag de briefing daarnaast 1× per kalenderdag handmatig
//    verversen (verse data → nieuwe briefjes); daarna staat de Ververs-knop
//    tot de volgende dag uit. De dag-teller staat los van de week-cyclus.
//
// Resilient: zolang de migratie (kolom) nog niet is toegepast falen lees/
// schrijf stil en valt /overzicht terug op vers-berekende briefjes per load
// (geen freeze, knop blijft beschikbaar maar persisteert niets).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { BriefingEntry, BriefingWeekHistoryItem } from '@/components/overview/briefing-panel'

/** Vrijheidstijd-meetpunt van deze week — basis voor de week-over-week delta. */
export interface FreedomSnapshotData {
  totalFreedomDays: number
  netWorth: number
  monthlyExpenses: number
  capturedAt: string
}

/** Slankere variant: alleen wat nodig is om de delta tegen af te zetten. */
export interface FreedomBaseline {
  totalFreedomDays: number
  capturedAt: string
}

export interface BriefingSnapshot {
  /** ISO-week-sleutel 'YYYY-Www' (Amsterdam) waarvoor de briefing bevroren is. */
  week: string
  /** Amsterdam-datum 'YYYY-MM-DD' van de laatste handmatige ververs ('' = nog niet). */
  lastManualRefresh: string
  /** ISO-tijdstip van de laatste (her)generatie. */
  refreshedAt: string
  /** De bevroren briefjes. */
  entries: BriefingEntry[]
  /** Vrijheidstijd-meetpunt van deze week (voor de hero-delta). */
  freedomSnapshot?: FreedomSnapshotData
  /** Vrijheidstijd-meetpunt van de vórige week (de diff-basis voor de delta). */
  previousFreedomSnapshot?: FreedomBaseline
  /** Eén-zin kop boven de briefjes (deterministisch, of AI bij handmatige ververs). */
  headline?: string
  /** Afgesloten weken (nieuwste laatst), gecapt op MAX_WEEK_HISTORY. Bij elke
   *  week-overgang schuift de aflopende week hierin. */
  history?: BriefingWeekHistoryItem[]
}

/** Max. aantal bewaarde voorbije weken in de snapshot-historie (~2 maanden). */
export const MAX_WEEK_HISTORY = 8

/** Opties voor snapshot-schrijfpaden: extra context + injecteerbare `now`. */
export interface SnapshotWriteOptions {
  freedom?: FreedomSnapshotData
  headline?: string
  now?: Date
}

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && isFinite(v)
}

/** Amsterdam-kalenderdatum als 'YYYY-MM-DD' (en-CA levert ISO-volgorde). */
export function amsterdamDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/** ISO-week-sleutel 'YYYY-Www' op basis van de Amsterdam-kalenderdag. */
export function amsterdamWeekKey(date: Date = new Date()): string {
  const [y, m, d] = amsterdamDateString(date).split('-').map(Number)
  // Bouw een UTC-datum uit de Amsterdam-kalenderdelen zodat de ISO-week-
  // berekening niet door de lokale tijdzone van de server verschuift.
  const dt = new Date(Date.UTC(y, m - 1, d))
  const dayNum = (dt.getUTCDay() + 6) % 7 // maandag = 0 … zondag = 6
  dt.setUTCDate(dt.getUTCDate() - dayNum + 3) // donderdag van deze week
  const isoYear = dt.getUTCFullYear()
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4))
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3)
  const week =
    1 + Math.round((dt.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000))
  return `${isoYear}-W${String(week).padStart(2, '0')}`
}

/** Geldige briefing-categorieën — moet matchen met CATEGORY_CONFIG in de panel. */
const VALID_CATEGORIES = new Set<BriefingEntry['category']>([
  'observation',
  'tip',
  'upcoming',
  'heads_up',
  'milestone',
  'market',
])

/**
 * Schoon de bevroren entries op: de snapshot is gebruiker-scoped jsonb dat de
 * engine omzeilt bij het lezen en mogelijk door een oudere code-versie is
 * geschreven. We laten alleen velden door die we veilig kunnen renderen —
 * onbekende categorieën (na schema-evolutie) zouden anders /overzicht laten
 * crashen, en href's worden tot interne paden beperkt.
 */
function sanitizeEntries(raw: unknown[]): BriefingEntry[] {
  const out: BriefingEntry[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const e = item as Record<string, unknown>
    if (typeof e.id !== 'string' || typeof e.text !== 'string') continue
    if (typeof e.category !== 'string') continue
    if (!VALID_CATEGORIES.has(e.category as BriefingEntry['category'])) continue
    const entry: BriefingEntry = {
      id: e.id,
      category: e.category as BriefingEntry['category'],
      text: e.text,
    }
    if (typeof e.href === 'string' && e.href.startsWith('/')) entry.href = e.href
    if (e.span === 'wide' || e.span === 'narrow') entry.span = e.span
    if (typeof e.hefboom === 'string') entry.hefboom = e.hefboom as BriefingEntry['hefboom']
    if (e.impact && typeof e.impact === 'object') {
      entry.impact = e.impact as BriefingEntry['impact']
    }
    out.push(entry)
  }
  return out
}

function parseFreedomSnapshot(raw: unknown): FreedomSnapshotData | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const f = raw as Record<string, unknown>
  if (!isFiniteNum(f.totalFreedomDays) || !isFiniteNum(f.netWorth) || !isFiniteNum(f.monthlyExpenses)) {
    return undefined
  }
  return {
    totalFreedomDays: f.totalFreedomDays,
    netWorth: f.netWorth,
    monthlyExpenses: f.monthlyExpenses,
    capturedAt: typeof f.capturedAt === 'string' ? f.capturedAt : new Date().toISOString(),
  }
}

function parseFreedomBaseline(raw: unknown): FreedomBaseline | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const f = raw as Record<string, unknown>
  if (!isFiniteNum(f.totalFreedomDays)) return undefined
  return {
    totalFreedomDays: f.totalFreedomDays,
    capturedAt: typeof f.capturedAt === 'string' ? f.capturedAt : new Date().toISOString(),
  }
}

/** Valideer één historie-item (zelfde defensieve aanpak als de snapshot zelf). */
function parseHistoryItem(raw: unknown): BriefingWeekHistoryItem | null {
  if (!raw || typeof raw !== 'object') return null
  const h = raw as Record<string, unknown>
  if (typeof h.week !== 'string' || !Array.isArray(h.entries)) return null
  return {
    week: h.week,
    headline: typeof h.headline === 'string' ? h.headline : undefined,
    entries: sanitizeEntries(h.entries),
    freedomDays: isFiniteNum(h.freedomDays) ? h.freedomDays : undefined,
  }
}

/** Valideer een ruw jsonb-object naar een BriefingSnapshot (of null). */
function parseSnapshot(raw: unknown): BriefingSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  if (typeof s.week !== 'string' || !Array.isArray(s.entries)) return null
  const history = Array.isArray(s.history)
    ? s.history
        .map(parseHistoryItem)
        .filter((h): h is BriefingWeekHistoryItem => h !== null)
        .slice(-MAX_WEEK_HISTORY)
    : undefined
  return {
    week: s.week,
    lastManualRefresh:
      typeof s.lastManualRefresh === 'string' ? s.lastManualRefresh : '',
    refreshedAt:
      typeof s.refreshedAt === 'string' ? s.refreshedAt : new Date().toISOString(),
    entries: sanitizeEntries(s.entries),
    freedomSnapshot: parseFreedomSnapshot(s.freedomSnapshot),
    previousFreedomSnapshot: parseFreedomBaseline(s.previousFreedomSnapshot),
    headline: typeof s.headline === 'string' ? s.headline : undefined,
    history,
  }
}

/** Lees de opgeslagen snapshot. Bij ontbrekende kolom/rij/fout → null. */
export async function readBriefingSnapshot(
  supabase: SupabaseClient,
  userId: string,
): Promise<BriefingSnapshot | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('briefing_snapshot')
    .eq('id', userId)
    .single()
  if (error) return null
  const raw = (data as { briefing_snapshot?: unknown } | null)?.briefing_snapshot
  return parseSnapshot(raw)
}

/** Schrijf de snapshot weg. Returnt false bij fout (bv. kolom ontbreekt). */
async function writeBriefingSnapshot(
  supabase: SupabaseClient,
  userId: string,
  snapshot: BriefingSnapshot,
): Promise<boolean> {
  const { error } = await supabase
    .from('profiles')
    .update({ briefing_snapshot: snapshot })
    .eq('id', userId)
  if (error) {
    // 42703 = undefined_column → verwacht zolang de migratie niet is toegepast;
    // stil degraderen. Elke andere fout (RLS, transient) is een echte regressie
    // die anders onzichtbaar zou blijven omdat de render-pad niet logt.
    if (error.code !== '42703') {
      console.warn('[briefing/snapshot] write failed:', error.code, error.message)
    }
    return false
  }
  return true
}

/** Of de handmatige ververs vandaag nog beschikbaar is (max 1× per dag). */
export function canRefreshToday(
  snapshot: BriefingSnapshot | null,
  now: Date = new Date(),
): boolean {
  if (!snapshot) return true
  return snapshot.lastManualRefresh !== amsterdamDateString(now)
}

/**
 * Bepaal de diff-basis (vorige week) voor de hero-delta:
 *  - zelfde week → de al opgeslagen previousFreedomSnapshot (stabiel binnen de week)
 *  - nieuwe week → het meetpunt van de zojuist aflopende week (existing.freedomSnapshot)
 */
function derivePreviousBaseline(
  existing: BriefingSnapshot | null,
  week: string,
): FreedomBaseline | null {
  if (!existing) return null
  if (existing.week === week) return existing.previousFreedomSnapshot ?? null
  return existing.freedomSnapshot
    ? {
        totalFreedomDays: existing.freedomSnapshot.totalFreedomDays,
        capturedAt: existing.freedomSnapshot.capturedAt,
      }
    : null
}

/**
 * Historie voor de nieuwe snapshot: bij een week-overgang schuift de
 * aflopende week erin (nieuwste laatst, gecapt). Binnen dezelfde week blijft
 * de bestaande historie ongewijzigd.
 */
function deriveWeekHistory(
  existing: BriefingSnapshot | null,
  week: string,
): BriefingWeekHistoryItem[] | undefined {
  if (!existing) return undefined
  const base = existing.history ?? []
  if (existing.week === week) return base.length > 0 ? base : undefined
  const closed: BriefingWeekHistoryItem = {
    week: existing.week,
    headline: existing.headline,
    entries: existing.entries,
    freedomDays: existing.freedomSnapshot?.totalFreedomDays,
  }
  return [...base.filter((h) => h.week !== existing.week), closed].slice(-MAX_WEEK_HISTORY)
}

/**
 * Haal de snapshot van deze ISO-week op, of maak hem aan uit de vers-
 * gecomposeerde briefjes. Geeft naast de snapshot de `priorFreedom`-basis
 * terug zodat de page de week-over-week vrijheidstijd-delta kan berekenen.
 * De write is best-effort: faalt hij (migratie nog niet toegepast), dan komt
 * alsnog de verse snapshot terug zodat /overzicht werkt.
 */
export async function getOrCreateWeeklySnapshot(
  supabase: SupabaseClient,
  userId: string,
  composed: BriefingEntry[],
  opts: SnapshotWriteOptions = {},
): Promise<{ snapshot: BriefingSnapshot; priorFreedom: FreedomBaseline | null }> {
  const now = opts.now ?? new Date()
  const week = amsterdamWeekKey(now)
  const existing = await readBriefingSnapshot(supabase, userId)
  const priorFreedom = derivePreviousBaseline(existing, week)
  if (existing && existing.week === week) {
    return { snapshot: existing, priorFreedom }
  }
  const fresh: BriefingSnapshot = {
    week,
    lastManualRefresh: '',
    refreshedAt: now.toISOString(),
    entries: composed,
    freedomSnapshot: opts.freedom,
    previousFreedomSnapshot: priorFreedom ?? undefined,
    headline: opts.headline,
    history: deriveWeekHistory(existing, week),
  }
  await writeBriefingSnapshot(supabase, userId, fresh)
  return { snapshot: fresh, priorFreedom }
}

/**
 * Pas een handmatige ververs toe. Niet toegestaan wanneer er vandaag al
 * handmatig is ververst — dan komt de bestaande snapshot ongewijzigd terug
 * met `allowed: false`. Anders: schrijf de verse briefjes weg en zet de
 * dag-teller op vandaag. De vrijheidstijd-basis (vorige week) blijft behouden
 * zodat de delta week-over-week is, niet ververs-over-ververs.
 */
export async function applyManualRefresh(
  supabase: SupabaseClient,
  userId: string,
  composed: BriefingEntry[],
  opts: SnapshotWriteOptions = {},
): Promise<{ allowed: boolean; snapshot: BriefingSnapshot }> {
  const now = opts.now ?? new Date()
  const today = amsterdamDateString(now)
  const week = amsterdamWeekKey(now)
  const existing = await readBriefingSnapshot(supabase, userId)
  if (existing && existing.lastManualRefresh === today) {
    return { allowed: false, snapshot: existing }
  }
  const refreshed: BriefingSnapshot = {
    week,
    lastManualRefresh: today,
    refreshedAt: now.toISOString(),
    entries: composed,
    freedomSnapshot: opts.freedom,
    previousFreedomSnapshot: derivePreviousBaseline(existing, week) ?? undefined,
    headline: opts.headline,
    history: deriveWeekHistory(existing, week),
  }
  await writeBriefingSnapshot(supabase, userId, refreshed)
  return { allowed: true, snapshot: refreshed }
}
