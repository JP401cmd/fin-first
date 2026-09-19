/**
 * De plan-instellingen voor Fins context — tekort-lening, opeethypotheek, eind-vorm.
 *
 * WAAROM DIT BESTAAT (kaart "Fin kent je plan-instellingen niet", laag A): de
 * eindsituatie-melding op /toekomst legt uit waaróm er aan het eind veel overblijft
 * (geen tekort-lening bindt het stopmoment, het leenplafond van de opeethypotheek is
 * bereikt, het inkomen dekt de uitgaven later). Fin kende die instellingen zelf niet —
 * een grep over `lib/ai/**` gaf nul treffers op tekort-lening / opeethypotheek. Buiten
 * de knop "Bespreek met Fin" om bleef elk antwoord op "waarom kan ik pas op mijn 54e
 * stoppen?" daardoor oppervlakkig.
 *
 * ## Harde grenzen
 *
 * **CONSUME, DON'T RECOMPUTE.** Deze bouwer resolvet niets zelf. De opeet-parameters
 * komen via `buildWoning` uit `lib/horizon-kernel/adapter/params.ts` — exact zoals de
 * kernel ze kreeg — en de tekort-lening-rente via `resolveDeficitLoanRate`. Een eigen
 * `?? 0.055` / `?? 0.50` zou een tweede waarheid naast `REVERSE_MORTGAGE_DEFAULT_*`
 * zetten; de eind-vorm komt uit de al-geresolveerde `FirePlan` (die kent de
 * tegenspraak-regel D2 die een rauwe `fire_end_strategy`-lezing mist).
 *
 * **GEEN BEDRAGEN.** Het blok draagt uitsluitend enums, leeftijden en percentages.
 * Dat sluit aan op de bestaande grendel "geen bedragen in de kick-off-vraag"
 * (`eindsituatie-copy.ts`) en houdt het blok klein. Het nalatenschapsbedrag, het
 * overschot, het dieptepunt en de overwaarde blijven er dus bewust uit — bewaakt met
 * een regex-grendel in de test.
 *
 * **GEEN TWEEDE STOPMOMENT.** Het blok noemt nooit een stop- of vrijheidsleeftijd: die
 * staat al in `buildAnkerContextLine` / `buildFireMomentLine`. Twee formuleringen van
 * hetzelfde moment laten het model kiezen. De plan-eindleeftijd verschijnt alleen onder
 * een NIET-vast anker — onder een vast anker draagt de anker-regel al "plan tot X".
 *
 * **NOOIT PARTNERDATA.** `profile` is per contract de EIGEN profielrij
 * (`ConvergentieRawContext.profile`), nooit `rawContext.partner`. Vandaag draait de
 * AI-run als `personal` (partner = null), maar een latere perspectief-wissel naar
 * `household` mag partnergegevens niet stil de prompt in duwen — zelfde val als de
 * `.eq('user_id', …)`-scoping die `horizon-context.ts` al moest repareren.
 *
 * **WFT/TOON.** Elke zin beschrijft een rekenuitkomst of een instelling, nooit een
 * opdracht of aanbeveling — dezelfde grendel als `eindsituatie-copy.ts`.
 */

import type { FirePlan } from '@/lib/fire-strategy'
import { buildWoning, resolveDeficitLoanRate } from '@/lib/horizon-kernel/adapter/params'
import type { EindsituatieDuiding } from '@/lib/horizon/eindsituatie-duiding'
import { eindOorzaakKort } from '@/lib/horizon/eindsituatie-copy'
import { formatPercentage } from './formatter'

/**
 * De drie profielvelden die dit blok leest. Bewust smal: zo past zowel de rauwe
 * kernel-profielrij als de losse `profiles`-select uit `buildSharedContext` erin, en is
 * per type zichtbaar dat hier niets anders uit het profiel wordt gelezen.
 */
export interface PlanContextProfile {
  fire_no_deficit_loan?: boolean | null
  deficit_loan_rate?: number | null
  housing_strategy_config?: unknown
}

export interface PlanContextInput {
  /** Het geresolveerde plan van DEZE run; `null` ⇒ geen eind-vorm-regel. */
  firePlan: FirePlan | null
  /** De EIGEN profielrij (nooit een partnerblok); `null` ⇒ alleen de eind-vorm-regel. */
  profile: PlanContextProfile | null
  /**
   * Ligt het stopmoment vast (stop-anker)? Dan draagt `buildAnkerContextLine` de
   * plan-eindleeftijd al en laat deze bouwer 'm weg.
   */
  anchorFixed: boolean
  /** Duiding uit dezelfde run (laag C); `null` ⇒ geen oorzaak-regel. */
  eindsituatie: EindsituatieDuiding | null
}

/** Percentage uit een fractie (0..1), met de gedeelde context-formatter. */
function pct(fractie: number): string {
  return formatPercentage(fractie * 100)
}

/** De eind-vorm in gewone taal. De leeftijd alleen waar hij iets toevoegt. */
function eindVormRegel(plan: FirePlan, anchorFixed: boolean): string {
  // Onder `perpetual` is er geen betekenisvolle eindleeftijd (de horizon-cap is geen
  // keuze van de gebruiker); onder een vast anker draagt de anker-regel 'm al.
  const tot = !anchorFixed && plan.endForm !== 'perpetual' ? ` Het plan rekent tot je ${plan.endAge}e.` : ''
  switch (plan.endForm) {
    case 'legacy':
      return `Eind-vorm van je plan: nalatenschap — er moet aan het eind nog een door jou ingesteld bedrag staan.${tot}`
    case 'perpetual':
      return 'Eind-vorm van je plan: niet laten slinken — je vermogen moet op peil blijven in plaats van op te gaan.'
    case 'deplete':
    default:
      return `Eind-vorm van je plan: vermogen opeten — je vermogen mág aan het eind op zijn.${tot}`
  }
}

/**
 * De tekort-lening-regel. `fire_no_deficit_loan` staat standaard AAN (NULL/afwezig =
 * aan): alleen een expliciete `false` staat lenen toe — dezelfde lezing als de
 * kernel-adapter (ADR 0149).
 */
function tekortLeningRegel(profile: PlanContextProfile): string {
  if (profile.fire_no_deficit_loan === false) {
    // De resolver leest uitsluitend `deficit_loan_rate`; `date_of_birth` is alleen
    // nodig om aan het bredere profieltype te voldoen.
    const rente = resolveDeficitLoanRate({ date_of_birth: null, deficit_loan_rate: profile.deficit_loan_rate })
    return `Tekort-lening: AAN — komt je plan onderweg tekort, dan leent het dat bedrag tegen ${pct(rente)} rente per jaar.`
  }
  // Bewust GEEN tweede zin over wat die eis met het stopmoment doet: dat is duiding,
  // geen instelling, en zou ook meegaan wanneer er niets te duiden valt. Speelt het wél,
  // dan draagt `eindsituatieRegel` het mét leeftijd.
  return 'Tekort-lening: UIT (de standaardinstelling) — je plan mag onderweg nooit lenen om een tekort te dekken.'
}

/**
 * De woonstrategie — alleen bij "verkopen" en "opeethypotheek". Bij "meerekenen" en
 * "uitsluiten" is er geen mechaniek te vertellen; die zouden alleen tokens kosten.
 * Alle waarden komen uit `buildWoning`, dus letterlijk wat de kernel kreeg.
 */
function woningRegel(housingConfigRaw: unknown): string | null {
  const w = buildWoning(housingConfigRaw)
  const opBehoefte = w.trigger === 'Wanneer nodig'

  if (w.selector === 'Opeethypotheek') {
    // Zelfde bewoording als de verkoop-tak hieronder: de kernel gebruikt voor beide
    // triggers dezelfde `drempelMaandenUitgave`, dus twee formuleringen zouden twee
    // drempels suggereren. "Bijna op" suggereert bovendien nul.
    const start = opBehoefte
      ? `zodra je liquide vermogen onder je marge zakt (uiterlijk op je ${w.opeetStartleeftijdOpname}e)`
      : `vanaf je ${w.opeetStartleeftijdOpname}e`
    return (
      `Woonstrategie: opeethypotheek — ${start} neemt je plan geld op uit de overwaarde van je huis, ` +
      `tot maximaal ${pct(w.opeetMaxLeningPctOverwaarde)} van die overwaarde, tegen ${pct(w.opeetRentePerJaar)} rente per jaar. ` +
      'Is dat leenplafond bereikt, dan stopt de opname en moet de rest uit je liquide vermogen komen.'
    )
  }

  if (w.selector === 'Verkopen') {
    const moment = opBehoefte
      ? `zodra je liquide vermogen onder je marge zakt (uiterlijk op je ${w.verkoopleeftijd}e)`
      : `op je ${w.verkoopleeftijd}e`
    return `Woonstrategie: huis verkopen — je plan verkoopt de woning ${moment} en rekent daarna met woonlasten zonder eigen huis.`
  }

  return null
}

/**
 * De reden-regel bij een onverwacht hoog eindbedrag. Consume-only in twee opzichten:
 * de oorzaken en leeftijden komen kant-en-klaar uit `detectEindsituatie` op DEZELFDE
 * run, en de BEWOORDING komt uit `eindOorzaakKort` — dezelfde tabel die de
 * "Bespreek met Fin"-kick-off in de ik-vorm gebruikt. Zo krijgt het model dezelfde
 * redenen niet twee keer in twee formuleringen, en is "noem ze letterlijk" waar.
 * De bedragen uit de duiding (overschot, dieptepunt, overwaarde, opeetschuld)
 * blijven er bewust uit: `eindOorzaakKort` draagt ze per contract niet.
 */
function eindsituatieRegel(duiding: EindsituatieDuiding): string | null {
  if (duiding.oorzaken.length === 0) return null
  const zinnen = duiding.oorzaken.map((o) => eindOorzaakKort(o, 'je'))
  return `Waarom er aan het eind van je plan veel overblijft: ${zinnen.join('; ')}.`
}

/**
 * De plan-instellingen als contextregels. Leeg wanneer er niets te vertellen valt;
 * elke regel is afzonderlijk conditioneel, zodat een gebruiker met een eenvoudig plan
 * niet betaalt voor mechaniek die niet aan staat.
 */
export function buildPlanInstellingenLines(input: PlanContextInput): string[] {
  const lines: string[] = []

  if (input.firePlan) lines.push(eindVormRegel(input.firePlan, input.anchorFixed))
  if (input.profile) {
    lines.push(tekortLeningRegel(input.profile))
    const woning = woningRegel(input.profile.housing_strategy_config)
    if (woning) lines.push(woning)
  }
  if (input.eindsituatie) {
    const reden = eindsituatieRegel(input.eindsituatie)
    if (reden) lines.push(reden)
  }

  if (lines.length === 0) return []
  lines.push(
    'Deze plan-instellingen staan op /toekomst en zijn de regels waar de projectie mee rekent. ' +
      'Gebruik ze letterlijk; leid er zelf geen bedragen, leeftijden of percentages uit af.',
  )
  return lines
}
