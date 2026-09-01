/**
 * Standaard-doelen — ÉÉN bron van waarheid voor de pre-gevulde doel-sjablonen.
 *
 * Achtergrond: het noodfonds was verspreid over vier inconsistente definities
 * (widget/bundel 6× uitgaven, quick-add-preset €5.000, onboarding 3× uitgaven,
 * goal-slug "3–6 maanden") plus twee losse preset-lijsten. Deze module unificeert
 * dat: alle standaard-doelen leven hier, met hun `computeTarget(ctx)` afgeleid uit
 * de CANONIEKE bundel-cijfers (`monthlyIncome`/`monthlyExpenses` = de effectieve
 * maandbedragen uit `resolveEffectiveIncomeExpenses`) — nooit lokaal uit
 * transacties herrekend ("consume, don't recompute").
 *
 * Grondslag-keuze (productbeslissing, optie A): het noodfonds is 6× de maandelijkse
 * UITGAVEN — dezelfde grondslag als de noodfonds-widget/bundel (`TARGET_EMERGENCY_MONTHS`
 * × `effectiveMonthlyExpenses`) én de Nibud-richtlijn. Zo tonen widget, aan te maken
 * doel en onboarding-tegel exact hetzelfde bedrag.
 *
 * Consumenten: `components/future/doel-toevoegen-sheet.tsx` (quick-add-kiezer) en
 * `lib/onboarding-presets.ts` (`computeNoodfondsTarget` delegeert hierheen).
 */

import { CLASSIC_MULTIPLIER, TARGET_EMERGENCY_MONTHS } from '@/lib/constants'

/**
 * Canonieke maand-cijfers waarmee een standaard-doel zijn richtbedrag berekent.
 * Altijd de effectieve maandbedragen uit de bundel/loader — niet zelf afleiden.
 */
export interface StandaardDoelContext {
  monthlyIncome: number
  monthlyExpenses: number
}

/**
 * Doel-type zoals de quick-add-sheet het verstaat (`savings`/`wealth`/`debt`).
 * Bewust NIET het volledige `GoalType`-uniom: alle euro-spaardoelen dragen hun
 * noodfonds-/FIRE-semantiek via naam + icoon, niet via een aparte enum met een
 * afwijkende UI-eenheid (spiegelt de bewuste keuze in `lib/onboarding-presets.ts`).
 */
export type StandaardDoelGoalType = 'savings' | 'wealth' | 'debt'

/** Kleur-token zoals geaccepteerd door de `goals`-tabel. */
export type StandaardDoelColor = 'teal' | 'amber' | 'blue' | 'purple' | 'emerald' | 'red'

export interface StandaardDoel {
  key: string
  /** Emoji voor de kiezer-tegel. */
  emoji: string
  /** Weergavenaam + default doel-naam bij aanmaken. */
  label: string
  /** Korte toelichting onder de tegel (< 40 tekens). */
  hint: string
  goalType: StandaardDoelGoalType
  /** Lucide-icoonnaam voor de aangemaakte goal-rij. */
  icon: string
  color: StandaardDoelColor
  /**
   * Richt-doelbedrag (€) uit de canonieke maand-cijfers. `0` = geen zinvol bedrag
   * af te leiden (bv. noodfonds/vrijheidsgetal zonder inkomen/uitgaven, of een
   * schuldenvrij-doel dat de gebruiker zelf invult) → de UI laat het bedrag leeg
   * met de hint als richting. Statische richtbedragen negeren `ctx`.
   */
  computeTarget: (ctx: StandaardDoelContext) => number
}

/** Rond af op een leesbare stap (voorkomt "€7.327,42" in de UI). */
function roundToStep(value: number, step: number): number {
  if (step <= 0) return Math.round(value)
  return Math.round(value / step) * step
}

/**
 * Noodfonds-richtbedrag = `TARGET_EMERGENCY_MONTHS` × maanduitgaven. Fallback op
 * 70% van het maandinkomen wanneer de uitgaven (nog) onbekend zijn. Afgerond op
 * €100. Geen inkomen én geen uitgaven → `0` (geen prefill forceren).
 *
 * Gedeelde bron: `lib/onboarding-presets.ts#computeNoodfondsTarget` delegeert
 * hierheen zodat onboarding en de Doelen-tab dezelfde grondslag gebruiken.
 */
export function computeNoodfondsTarget(ctx: StandaardDoelContext): number {
  if (ctx.monthlyExpenses <= 0 && ctx.monthlyIncome <= 0) return 0
  const base = ctx.monthlyExpenses > 0 ? ctx.monthlyExpenses : ctx.monthlyIncome * 0.7
  return roundToStep(base * TARGET_EMERGENCY_MONTHS, 100)
}

/**
 * Vrijheidsgetal (FIRE) = de klassieke `CLASSIC_MULTIPLIER` (25×) × jaaruitgaven.
 * Consumeert de canonieke FIRE-vuistregel-constante i.p.v. een lokale `25`.
 * Afgerond op €1.000. Zonder uitgaven → `0` (gebruiker vult zelf in).
 */
export function computeVrijheidsgetalTarget(ctx: StandaardDoelContext): number {
  if (ctx.monthlyExpenses <= 0) return 0
  return roundToStep(ctx.monthlyExpenses * 12 * CLASSIC_MULTIPLIER, 1000)
}

/**
 * De standaard-doelen-catalogus. Volgorde = weergavevolgorde in de kiezer:
 * eerst de twee uit-data-afgeleide fundamenten (noodfonds, vrijheidsgetal),
 * dan schuldenvrij, dan de spaar-richtbedragen (Nibud/CBS-indicaties).
 */
export const STANDAARD_DOELEN: StandaardDoel[] = [
  {
    key: 'noodfonds',
    emoji: '🛟',
    label: 'Noodfonds',
    hint: '6 maanden vaste lasten',
    goalType: 'savings',
    icon: 'ShieldCheck',
    color: 'teal',
    computeTarget: computeNoodfondsTarget,
  },
  {
    key: 'vrijheidsgetal',
    emoji: '🏁',
    label: 'Vrijheidsgetal',
    hint: 'FIRE = 25× jaaruitgaven',
    goalType: 'wealth',
    icon: 'Hourglass',
    color: 'purple',
    computeTarget: computeVrijheidsgetalTarget,
  },
  {
    key: 'schuldenvrij',
    emoji: '✂️',
    label: 'Schuldenvrij',
    hint: 'Aflossen tot 0',
    goalType: 'debt',
    icon: 'CreditCard',
    color: 'red',
    // Geen data-afgeleide richtwaarde: welk schuldsaldo je bedoelt hangt af van
    // WELKE schulden je koppelt. Sinds ADR 0125 schakelt deze preset door naar
    // het volledige formulier met `debt_payoff` voorgeselecteerd, waar je één of
    // meer schulden aanvinkt; het doelbedrag volgt uit die keuze.
    computeTarget: () => 0,
  },
  {
    key: 'vakantie',
    emoji: '🏖️',
    label: 'Vakantie',
    hint: 'Richtbedrag — pas aan',
    goalType: 'savings',
    icon: 'Sun',
    color: 'amber',
    computeTarget: () => 2500,
  },
  {
    key: 'auto',
    emoji: '🚗',
    label: 'Nieuwe auto',
    hint: 'Richtbedrag — pas aan',
    goalType: 'savings',
    icon: 'Car',
    color: 'blue',
    computeTarget: () => 10000,
  },
  {
    key: 'aanbetaling',
    emoji: '🏠',
    label: 'Aanbetaling woning',
    hint: 'Richtbedrag — pas aan',
    goalType: 'savings',
    icon: 'Home',
    color: 'emerald',
    computeTarget: () => 30000,
  },
]
