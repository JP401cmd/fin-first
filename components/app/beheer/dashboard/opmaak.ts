import type { Impact, StatusToon } from '@/lib/beheer/dashboard/status'
import { formatAmsterdamDayMonth, formatAmsterdamDayMonthYear, formatAmsterdamTime, isSameAmsterdamDay, isSameAmsterdamYear } from '@/lib/tz'

/**
 * Pure opmaak voor het beheerdashboard: tijdstippen, getallen en de klassen bij
 * een toon. Geen berekening van cijfers.
 *
 * Tijd is altijd absoluut en in Nederlandse wandkloktijd (nooit "2 uur
 * geleden"): een beheerder legt een tijdstip naast een log.
 */

/** `vandaag 14:32`, `28 sep 19:14` of `5 mrt 2025`. */
export function momentTekst(iso: string | null | undefined, nu: Date): string {
  if (!iso) return 'onbekend'
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return 'onbekend'
  const d = new Date(ms)
  if (isSameAmsterdamDay(d, nu)) return `vandaag ${formatAmsterdamTime(d)}`
  if (isSameAmsterdamYear(d, nu)) return `${formatAmsterdamDayMonth(d)} ${formatAmsterdamTime(d)}`
  return formatAmsterdamDayMonthYear(d)
}

export function getal(n: number): string {
  return n.toLocaleString('nl-NL')
}

/** `+3`, `−2` of `0`. Het minteken is het typografische, niet het koppelteken. */
export function verschilTekst(verschil: number): string {
  if (verschil > 0) return `+${getal(verschil)}`
  if (verschil < 0) return `−${getal(Math.abs(verschil))}`
  return '0'
}

/** De impact in één regel: eerst wie of hoeveel, dan de toelichting. */
export function impactKop(impact: Impact): string {
  switch (impact.soort) {
    case 'iedereen':
      return 'Iedereen'
    case 'aantal':
      return `${impact.ondergrens ? 'Minstens ' : ''}${getal(impact.aantal)} ${
        impact.aantal === 1 ? ENKELVOUD[impact.eenheid] : impact.eenheid
      }`
    case 'onbekend':
      return 'Onbekend'
    case 'geen-direct':
    default:
      return 'Geen direct effect'
  }
}

const ENKELVOUD: Record<Extract<Impact, { soort: 'aantal' }>['eenheid'], string> = {
  gebruikers: 'gebruiker',
  koppelingen: 'koppeling',
  'e-mails': 'e-mail',
  meldingen: 'melding',
}

export interface ToonKlassen {
  /** Achtergrond plus tekst, voor een label. */
  chip: string
  tekst: string
  /** Linkerrand van een blok. */
  rand: string
}

// Stoplichtsemantiek via de gedeelde tokens; bewust géén module-accent: dit is
// status, geen identiteit. De neutrale toon gebruikt een teksttoken dat op
// --subtle nog AA haalt (--ink-4 is geen teksttoken).
export const TOON_KLASSEN: Record<StatusToon, ToonKlassen> = {
  positive: { chip: 'bg-positive-bg text-positive', tekst: 'text-positive', rand: 'border-positive' },
  negative: { chip: 'bg-negative-bg text-negative', tekst: 'text-negative', rand: 'border-negative' },
  warning: { chip: 'bg-warning-bg text-warning', tekst: 'text-warning', rand: 'border-warning' },
  neutral: {
    chip: 'bg-[var(--subtle)] text-[var(--ink-meta)]',
    tekst: 'text-[var(--ink-meta)]',
    rand: 'border-[var(--border-md)]',
  },
}
