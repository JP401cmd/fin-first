/**
 * Fiscale kalender — pure deadline-engine met afteller.
 *
 * Geen Supabase- of React-afhankelijkheid. Volgt het patroon van box3-data.ts.
 *
 * Deze module vraagt NOOIT zelf de huidige tijd op (geen impliciete klok-aanroep):
 * 'now' wordt altijd als parameter doorgegeven, zodat alles deterministisch
 * testbaar is. Geld-formattering hoort hier niet — dat doet de UI.
 *
 * Naamgevingsconventie: officiële NL fiscale termen (Box, aangifte, peildatum,
 * jaarruimte, lijfrente, aanslag) blijven Nederlands in labels/beschrijvingen;
 * generieke code-termen (deadline, date, daysUntil, box) zijn Engels.
 */

// ── Types ────────────────────────────────────────────────────

/** De Box waarop een deadline betrekking heeft, of null voor box-overstijgend. */
export type DeadlineBox = 1 | 2 | 3 | null

export interface TaxDeadline {
  id: string
  label: string
  description: string
  box: DeadlineBox
  /** ISO yyyy-mm-dd van de eerstvolgende voorkomende deadline t.o.v. 'now'. */
  date: string
  /** Hele dagen vanaf 'now' (>= 0). */
  daysUntil: number
}

// ── Definitie van jaarlijks terugkerende deadlines ───────────

interface DeadlineTemplate {
  id: string
  label: string
  description: string
  box: DeadlineBox
  /** Maand 1-12 van het vaste voorkomen. */
  month: number
  /** Dag van de maand van het vaste voorkomen. */
  day: number
}

/**
 * Vaste, jaarlijks terugkerende fiscale deadlines.
 *
 * Bron: gangbare NL aangifte-/aanslagkalender; indicatie — verifieer tegen
 * Belastingdienst 2026. De exacte data wijken in de praktijk soms af
 * (bv. aangifte loopt 1 mrt–1 mei; we hanteren 1 mei als deadline-datum).
 */
export const TAX_DEADLINES: DeadlineTemplate[] = [
  {
    id: 'box3-peildatum',
    label: 'Peildatum Box 3',
    description:
      'De waarde van je Box 3 vermogen op 1 januari bepaalt je belasting voor het hele jaar. Plan grote aankopen of stortingen rondom deze datum.',
    box: 3,
    month: 1,
    day: 1,
  },
  {
    id: 'aangifte-ib',
    label: 'Aangifte inkomstenbelasting',
    description:
      'De aangifte inkomstenbelasting kan vanaf 1 maart en moet uiterlijk 1 mei binnen zijn. Uitstel is op aanvraag mogelijk.',
    box: null,
    month: 5,
    day: 1,
  },
  {
    id: 'voorlopige-aanslag',
    label: 'Voorlopige aanslag bijstellen',
    description:
      'Controleer halverwege het jaar of je voorlopige aanslag nog klopt en stel die bij om naheffing of teruggave te voorkomen.',
    box: null,
    month: 7,
    day: 1,
  },
  {
    id: 'dga-leengrens',
    label: 'Leengrens DGA + dividendtiming',
    description:
      'Schulden bij je eigen BV boven € 500.000 worden als fictief dividend belast (Wet excessief lenen). Beoordeel je rekening-courant en de timing van dividenduitkeringen vóór jaareinde.', // indicatie — verifieer tegen Belastingdienst 2026
    box: 2,
    month: 12,
    day: 31,
  },
  {
    id: 'jaarruimte-lijfrente',
    label: 'Jaarruimte lijfrente inleg',
    description:
      'Een lijfrente-inleg binnen je jaarruimte is aftrekbaar in Box 1, maar moet vóór het einde van het kalenderjaar zijn betaald.',
    box: 1,
    month: 12,
    day: 31,
  },
  {
    id: 'box3-arbitrage',
    label: 'Box 3 peildatum-planning',
    description:
      'In het venster rond de jaarwisseling kun je je Box 3 grondslag sturen (arbitrage tussen spaargeld, beleggingen en schulden) richting de peildatum van 1 januari.',
    box: 3,
    month: 12,
    day: 31,
  },
]

// ── Date-helpers (UTC, klok-vrij) ────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Pakt de UTC-datum (middernacht) van een Date, zonder tijdcomponent. */
function startOfUtcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

/**
 * Bepaalt het eerstevolgende kalenderjaar waarin (month, day) op of na 'now' valt.
 * Als de deadline dit jaar al gepasseerd is, schuift hij door naar volgend jaar.
 */
function nextOccurrenceYear(nowUtc: number, month: number, day: number): number {
  const nowYear = new Date(nowUtc).getUTCFullYear()
  const thisYear = Date.UTC(nowYear, month - 1, day)
  return thisYear >= nowUtc ? nowYear : nowYear + 1
}

// ── Public API ───────────────────────────────────────────────

/**
 * Geeft alle fiscale deadlines terug, elk met de eerstvolgende voorkomende
 * datum t.o.v. 'now' en het aantal hele dagen tot dan. Gesorteerd op
 * daysUntil oplopend (bij gelijke daysUntil stabiel op definitievolgorde).
 *
 * @param now   Referentiemoment (verplicht — de lib gebruikt geen interne klok).
 * @param year  Optioneel; momenteel niet gebruikt voor datumkeuze (deadlines zijn
 *              jaarlijks terugkerend), maar gereserveerd voor jaar-specifieke
 *              uitbreiding. Geaccepteerd voor API-stabiliteit.
 */
export function getTaxDeadlines(now: Date, year?: number): TaxDeadline[] {
  void year // gereserveerd voor toekomstige jaar-specifieke deadlines
  const nowUtc = startOfUtcDay(now)

  const deadlines: TaxDeadline[] = TAX_DEADLINES.map((t) => {
    const occYear = nextOccurrenceYear(nowUtc, t.month, t.day)
    const occUtc = Date.UTC(occYear, t.month - 1, t.day)
    const daysUntil = Math.round((occUtc - nowUtc) / MS_PER_DAY)
    return {
      id: t.id,
      label: t.label,
      description: t.description,
      box: t.box,
      date: toIsoDate(occYear, t.month, t.day),
      daysUntil,
    }
  })

  // Stabiele sortering op daysUntil oplopend.
  return deadlines
    .map((d, i) => ({ d, i }))
    .sort((a, b) => a.d.daysUntil - b.d.daysUntil || a.i - b.i)
    .map(({ d }) => d)
}
