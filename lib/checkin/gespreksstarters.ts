/**
 * Pure engine voor de check-in "gespreksstarters" (reflectievragen).
 *
 * Spiegelt lib/aandachtspunten.ts: geen Supabase, geen I/O. De route
 * (app/api/checkin/gespreksstarters/route.ts) haalt data op, stelt
 * GespreksstartersInput samen en roept buildGespreksstarters() aan.
 */
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

export function formatEUR(n: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}

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

