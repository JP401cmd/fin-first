// ── Mijlpaal-copy (krantstijl) ───────────────────────────────────────
//
// Eén rij in, twee zinnen uit: een titel die de gebeurtenis benoemt en een
// betekenis die 'm in vrijheidstijd vertaalt.
//
// TOON — bewust NIET de stijl van `lib/freedom-milestones.ts` (die draagt nog
// "🎉"-teksten uit een eerdere generatie):
//  - geen emoji, geen uitroeptekens, geen aanmoedigingstaal;
//  - constateren, nooit aanraden (Wft): een mijlpaal is een feitelijke
//    vaststelling over cijfers die de gebruiker al had, geen aanbeveling om
//    iets te doen of te laten;
//  - één feit per zin, de krant-registertoon van de rest van de app.
//
// REKENEN DOET DIT BESTAND NIET. De €→tijd-vertaling gaat uitsluitend via
// `calculateFreedomTime` uit `lib/format.ts` — nooit een eigen €/dag-som.

import {
  calculateFreedomTime,
  credibleDailyExpense,
  formatCurrency,
  formatFreedomTimeString,
} from '@/lib/format'
import type { AchievedMilestoneRow } from './types'

export interface MilestoneCopy {
  titel: string
  betekenis: string
}

/** Titel per vrijheidspercentage. Onbekend percentage → neutrale terugval. */
function freedomTitle(pct: number): string {
  switch (pct) {
    case 25:
      return 'Een kwart van je vrijheid'
    case 50:
      return 'Halverwege je vrijheid'
    case 75:
      return 'Driekwart van je vrijheid'
    case 100:
      return 'Volledige vrijheid bereikt'
    default:
      return `${formatMonths(pct)}% van je vrijheid`
  }
}

/** Maanden/procenten met hooguit één decimaal, nl-NL — geen geldformattering. */
function formatMonths(value: number): string {
  return new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 }).format(value)
}

/**
 * "12 jaar en 3 maanden" voor een bedrag, of `null` als het dagtarief niet
 * geloofwaardig is. `credibleDailyExpense` is de canonieke geloofwaardigheids-
 * drempel; zonder die gate zou een gebruiker met €0,30 aan geregistreerde
 * dagelijkse uitgaven "2.700 jaar vrijheid" te lezen krijgen.
 */
function freedomTimeFor(amount: number, dailyExpenseRate: number | null): string | null {
  const daily = credibleDailyExpense(dailyExpenseRate)
  if (daily <= 0) return null
  const breakdown = calculateFreedomTime(amount, daily)
  if (breakdown.isInfinite || breakdown.totalDays <= 0) return null
  return formatFreedomTimeString(breakdown)
}

/**
 * Krant-copy voor één gelogde mijlpaal.
 *
 * @param row               de rij uit `achieved_milestones`
 * @param dailyExpenseRate  canoniek dagtarief (€/dag) uit de bundel
 *                          (`DashboardData.dailyExpenseRate`), of `null`
 */
export function buildMilestoneCopy(
  row: AchievedMilestoneRow,
  dailyExpenseRate: number | null,
  context?: {
    /**
     * Doelnaam voor `doel`-mijlpalen (behaald/checkpoint). De rij draagt zelf
     * geen naam — bewust: de log is minimaal. De aanroeper (loader) lost de
     * naam op uit `finData.goals`; ontbreekt hij, dan blijft de zin generiek.
     */
    goalName?: string | null
  },
): MilestoneCopy {
  switch (row.kind) {
    // ── Vermogen — het enige geval met een écht bedrag ───────────────
    case 'vermogen': {
      const bedrag = row.threshold_value ?? row.observed_value ?? 0
      const tijd = freedomTimeFor(bedrag, dailyExpenseRate)
      return {
        titel: `${formatCurrency(bedrag)} bereikt`,
        betekenis: tijd
          ? `Dat is ${tijd} vrijheid tegen je huidige uitgaven.`
          : `Je netto vermogen passeerde ${formatCurrency(bedrag)}.`,
      }
    }

    // ── Vrijheid — procenten, geen bedrag ────────────────────────────
    case 'vrijheid': {
      const pct = row.threshold_value ?? 0
      return {
        titel: freedomTitle(pct),
        betekenis:
          pct >= 100
            ? 'Je vermogen dekt je vrijheidsdoel volledig.'
            : `Je vermogen dekt ${formatMonths(pct)}% van je vrijheidsdoel.`,
      }
    }

    case 'schuldenvrij':
      return {
        titel: 'Schuldenvrij',
        betekenis: 'Er staan geen schulden meer open.',
      }

    // ── Noodfonds — MAANDEN, geen euro's ─────────────────────────────
    // `threshold_value`/`observed_value` staan hier in maanden dekking. Ze door
    // de vrijheidstijd-vertaling halen zou maanden als euro's lezen en een
    // volstrekt willekeurig getal opleveren — vandaar geen €→tijd-zin hier.
    case 'noodfonds': {
      const gedekt = row.observed_value
      const doel = row.threshold_value
      return {
        titel: 'Noodfonds gevuld',
        betekenis:
          gedekt !== null && doel !== null
            ? `Je buffer dekt ${formatMonths(gedekt)} maanden; je doel stond op ${formatMonths(doel)} maanden.`
            : 'Je buffer dekt het aantal maanden dat je als doel hebt staan.',
      }
    }

    case 'doel': {
      const naam = context?.goalName ?? null
      // Checkpoint op een ver doel (sleutel `doel-checkpoint:<id>:<pct>`) —
      // onderscheiden op de sleutel, want de `kind` is gedeeld met behaald.
      if (row.milestone_key.startsWith('doel-checkpoint:')) {
        const pct = row.threshold_value ?? 0
        const stuk = pct === 25 ? 'Een kwart' : pct === 50 ? 'De helft' : pct === 75 ? 'Driekwart' : `${formatMonths(pct)}%`
        return {
          titel: naam ? `${stuk} van "${naam}"` : `${stuk} van je doel`,
          betekenis: naam
            ? `Je voortgang op "${naam}" passeerde ${formatMonths(pct)}%.`
            : `Je voortgang op een langetermijndoel passeerde ${formatMonths(pct)}%.`,
        }
      }
      return {
        titel: naam ? `Doel behaald: "${naam}"` : 'Doel behaald',
        betekenis: 'Een doel dat je zelf stelde staat op honderd procent.',
      }
    }

    default:
      // Runtime-data houdt zich niet aan de union (oude rij, nieuw soort).
      // Nooit crashen op copy — een neutrale constatering is altijd waar.
      return {
        titel: 'Mijlpaal bereikt',
        betekenis: 'Je passeerde een punt dat je eerder als mijlpaal markeerde.',
      }
  }
}
