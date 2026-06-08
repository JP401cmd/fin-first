/**
 * Pure engine voor de check-in "gespreksstarters" (reflectievragen).
 *
 * Spiegelt lib/aandachtspunten.ts: geen Supabase, geen I/O. De route
 * (app/api/checkin/gespreksstarters/route.ts) haalt data op, stelt
 * GespreksstartersInput samen en roept buildGespreksstarters() aan.
 */
// Engine-uitvoertype: wordt door buildGespreksstarters() geproduceerd en
// door de route (app/api/checkin/gespreksstarters/route.ts) afgenomen.
import type { GesprekStarterData } from '@/lib/checkin-types'

// ── Voice (aanspreekvorm) ──────────────────────────────────────────────
// Nederlands vervoegt werkwoorden per onderwerp; Voice levert vooraf-
// vervoegde fragmenten zodat elke template één keer geschreven wordt.

export type Audience = 'solo' | 'household'

export interface Voice {
  audience: Audience
  subj: string      // 'je' | 'jullie'
  subjCap: string   // 'Je' | 'Jullie'
  poss: string      // 'je' | 'jullie'      → "{poss} vermogen"
  hebt: string      // 'hebt' | 'hebben'
  wilt: string      // 'wilt' | 'willen'
  bent: string      // 'bent' | 'zijn'
  voelt: string     // 'voel je je' | 'voelen jullie je'
  samen: string     // 'voor jezelf' | 'samen'
}

export function buildVoice(audience: Audience): Voice {
  if (audience === 'household') {
    return {
      audience,
      subj: 'jullie', subjCap: 'Jullie', poss: 'jullie',
      hebt: 'hebben', wilt: 'willen', bent: 'zijn',
      voelt: 'voelen jullie je', samen: 'samen',
    }
  }
  return {
    audience,
    subj: 'je', subjCap: 'Je', poss: 'je',
    hebt: 'hebt', wilt: 'wilt', bent: 'bent',
    voelt: 'voel je je', samen: 'voor jezelf',
  }
}

// ── Freedom-time helpers (verplaatst uit de route) ─────────────────────

// EUR-formattering hergebruikt de canonieke helper (incl. NaN-guard) i.p.v. dupliceren.
// Geïmporteerd als lokale naam zodat detectoren in deze module formatEUR(...) kunnen aanroepen.
import { formatCurrency as formatEUR } from '@/lib/format'
export { formatEUR }

export function freedomDays(amount: number, dailyExpenses: number): number {
  if (dailyExpenses <= 0) return 0
  return Math.round(Math.abs(amount) / dailyExpenses)
}

export function freedomLabel(days: number): string {
  if (days >= 365) {
    const years = Math.floor(days / 365)
    const months = Math.round((days % 365) / 30)
    return months > 0 ? `${years} jaar en ${months} maanden` : `${years} jaar`
  }
  if (days >= 30) {
    const m = Math.floor(days / 30)
    const d = days % 30
    return d > 0 ? `${m} maanden en ${d} dagen` : `${m} maanden`
  }
  return `${days} ${days === 1 ? 'dag' : 'dagen'}`
}

// ── Kandidaat-model + selectie ─────────────────────────────────────────

export type StarterTheme =
  | 'vermogen' | 'sparen' | 'uitgaven' | 'doelen'
  | 'schulden' | 'acties' | 'fire' | 'algemeen'

export interface StarterVariant {
  vraag: string
  actie: string
  context: string
  vrijheidstijd?: string
}

export interface StarterCandidate {
  id: string
  theme: StarterTheme
  sentiment: 'positive' | 'neutral' | 'alert'
  /** Relevantie 0..100 (magnitude-gedreven). */
  score: number
  /** 2-4 formuleringen; de engine roteert per maand. */
  variants: Array<(v: Voice) => StarterVariant>
}

const MAX_STARTERS = 5
const MIN_STARTERS = 2
const MAX_PER_THEME = 2

function materialize(c: StarterCandidate, v: Voice, monthIndex: number): GesprekStarterData {
  const n = c.variants.length
  const idx = ((monthIndex % n) + n) % n // veilig voor negatieve monthIndex
  const variant = c.variants[idx](v)
  return {
    id: c.id,
    sentiment: c.sentiment,
    vraag: variant.vraag,
    context: variant.context,
    actie: variant.actie,
    vrijheidstijd: variant.vrijheidstijd,
  }
}

/**
 * Kies de te tonen starters: score-gesorteerd, max 2 per thema, min 2
 * (aangevuld uit fallback), max 5. Variant gekozen via maand-rotatie.
 */
export function selectStarters(
  candidates: StarterCandidate[],
  voice: Voice,
  monthIndex: number,
  fallback: StarterCandidate[],
): GesprekStarterData[] {
  const sorted = [...candidates].sort(
    (a, b) => b.score - a.score || a.id.localeCompare(b.id),
  )

  const perTheme: Record<string, number> = {}
  const chosen: StarterCandidate[] = []
  for (const c of sorted) {
    if (chosen.length >= MAX_STARTERS) break
    const used = perTheme[c.theme] || 0
    if (used >= MAX_PER_THEME) continue
    perTheme[c.theme] = used + 1
    chosen.push(c)
  }

  for (const f of fallback) {
    if (chosen.length >= MIN_STARTERS) break
    if (chosen.some(c => c.id === f.id)) continue
    chosen.push(f)
  }

  return chosen.slice(0, MAX_STARTERS).map(c => materialize(c, voice, monthIndex))
}

// ── Util ───────────────────────────────────────────────────────────────
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

// suppress unused-variable warning — clamp is used by Task 3+ detectors
void clamp

