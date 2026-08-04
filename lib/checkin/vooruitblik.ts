/**
 * Pure engine voor de check-in-stap "Vooruitblik".
 *
 * De vooruitblik toont wat er komende maand STRUCTUREEL langskomt: de vaste
 * lasten en abonnementen uit `loadVasteLastenSummary` — dezelfde bron als de
 * Vaste-lasten-pagina en de cashflow-kaart (consume, don't recompute). Die
 * samenvatting is per tegenpartij gemiddeld over 12 maanden en eist een
 * minimum aantal herhalingen per frequentie, dus een eenmalige aankoop komt er
 * per constructie niet in.
 *
 * Wat hier NIET meer gebeurt (de bug): zelf transacties groeperen op
 * tegenpartij en alles met ≥2 boekingen "terugkerend" noemen. Twee losse
 * HEMA-aankopen in dezelfde maand haalden die drempel, en de sortering pakte
 * bovendien de KLEINSTE bedragen eerst — vandaar een vooruitblik vol posten
 * van €15 die niemand herkent als vaste last.
 */
import type { VasteLastenItem } from '@/lib/vaste-lasten-summary'
import { FREQUENCY_LABELS } from '@/lib/recurring-data'

export interface VooruitblikItem {
  name: string
  /** Negatief = uitgave. Afgerond op hele euro's. */
  amount: number
  /** Periode-label, bv. "september" of "september · jaarlijks (maandgemiddelde)". */
  date: string
}

export const VOORUITBLIK_LIMIT = 10

/** Bron-vorm: exact de twee lijsten die de vaste-lasten-samenvatting levert. */
type VooruitblikSource = {
  subscriptions: VasteLastenItem[]
  vasteKosten: VasteLastenItem[]
}

function periodLabel(monthName: string, frequency: VasteLastenItem['frequency']): string {
  // Maandelijks/wekelijks landt daadwerkelijk komende maand; kwartaal en jaar
  // zijn omgerekend naar een maandgemiddelde en zeggen dat er dus bij.
  if (frequency === 'monthly' || frequency === 'weekly') return monthName
  const label = (FREQUENCY_LABELS[frequency] ?? frequency).toLowerCase()
  return `${monthName} · ${label} (maandgemiddelde)`
}

/**
 * Zet de vaste-lasten-samenvatting om naar de vooruitblik-lijst: grootste post
 * eerst, uitgaven negatief, afgekapt op `limit`.
 */
export function buildVooruitblikItems(
  source: VooruitblikSource,
  nextMonthName: string,
  limit: number = VOORUITBLIK_LIMIT,
): VooruitblikItem[] {
  return [...source.vasteKosten, ...source.subscriptions]
    .map(i => ({
      name: i.name,
      amount: -Math.round(Math.abs(i.monthlyAmount)),
      date: periodLabel(nextMonthName, i.frequency),
    }))
    // Posten die naar € 0 afronden zijn ruis in een lijst van vaste lasten.
    .filter(i => i.amount !== 0)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount) || a.name.localeCompare(b.name))
    .slice(0, limit)
}
