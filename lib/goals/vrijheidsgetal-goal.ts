/**
 * Het vrijheidsgetal-doel als LIVE consument van de canonieke FIRE-motor.
 *
 * AANLEIDING (bevinding C10, 24-08-2026): /overzicht zei "nog 0j 1m — 99%
 * vrij", /toekomst/doelen zei bij hetzelfde doel "58% — aug 2039". Dertien jaar
 * verschil op de kernvraag van de app. De oorzaak was NIET een tweede
 * berekening met een andere grondslag, maar het ONTBREKEN van een berekening:
 * het doel "Volledige vrijheid (FIRE)" is een gewone `goals`-rij waarvan
 * `current_value` en `target_date` statisch in de database staan. Er bestond
 * geen synchronisatiepad voor — `autolinkGoalCurrentValues` ververst alleen
 * asset/debt-gekoppelde doelen, `injectParameterGoalCurrentValues` alleen
 * lab-parameterdoelen — dus de kaart toonde tot in lengte van dagen het bedrag
 * en de datum die ooit bij het aanmaken zijn ingevuld.
 *
 * Dat generaliseert naar elke gebruiker: de quick-add-kiezer
 * (`components/future/doel-toevoegen-sheet.tsx`) biedt "Vrijheidsgetal — FIRE =
 * 25x jaaruitgaven" als hét voorgestelde FIRE-doel en schrijft daarbij
 * `current_value: 0` weg.
 *
 * ## Wat deze module doet
 * Zij levert géén nieuwe rekenmotor. Zij VERTAALT de canonieke FIRE-uitkomst
 * (kernel-run via `lib/fire-target-shared.ts#computeHorizonFireSim`, grondslag
 * via `lib/core-metrics.ts#selectFreedomProgressBasis`, datum via
 * `lib/horizon/fire-scalar.ts#deriveCountdown`) naar de drie velden die een
 * doelkaart toont: huidige waarde, doelwaarde en verwachte datum. Precies
 * dezelfde teller/noemer/datum die de FIRE-prognose op /overzicht toont —
 * consume, don't recompute.
 *
 * ## Waarom de preset-marker en niet `goal_type`
 * `net_worth`-doelen worden óók voor niet-FIRE-doeleinden aangemaakt ("Eerste
 * 10K belegd", "Erfenis structureren"). Een auto-sync op het kale doel-type zou
 * die onterecht aan de FIRE-motor knopen. De discriminant is dus de
 * preset-marker `metadata.standaardDoel === 'vrijheidsgetal'` die de quick-add-
 * kiezer al wegschrijft — bewust ONAFHANKELIJK van `goal_type`, omdat die
 * preset vandaag de niet-canonieke waarde `'wealth'` schrijft (aparte bevinding;
 * zodra die is rechtgetrokken hoeft hier niets te wijzigen).
 */

import { selectFreedomProgressBasis } from '@/lib/core-metrics'
import { deriveCountdown } from '@/lib/horizon/fire-scalar'

/**
 * Preset-key van het standaard-doel "Vrijheidsgetal" (`lib/goals/standaard-doelen.ts`),
 * zoals de quick-add-kiezer 'm als `metadata.standaardDoel` wegschrijft.
 */
export const VRIJHEIDSGETAL_PRESET_KEY = 'vrijheidsgetal'

/**
 * Is dit het vrijheidsgetal-doel (en dus een live FIRE-tracker)? Defensief:
 * `metadata` kan ontbreken (oude rijen), `null` of `{}` zijn.
 */
export function isVrijheidsgetalGoal(goal: { metadata?: Record<string, unknown> | null }): boolean {
  const m = goal.metadata
  return (
    typeof m === 'object' &&
    m !== null &&
    (m as Record<string, unknown>).standaardDoel === VRIJHEIDSGETAL_PRESET_KEY
  )
}

/**
 * De canonieke FIRE-stand, vertaald naar doelkaart-velden. `null`-velden
 * betekenen "de motor kon dit niet leveren" — de aanroeper laat de opgeslagen
 * waarde dan staan in plaats van een verzonnen getal te tonen.
 */
export interface VrijheidsgetalSnapshot {
  /** Teller: hetzelfde vermogen dat de vrijheidsvoortgang op /overzicht telt. */
  currentValue: number
  /** Noemer: het benodigde vermogen op DEZELFDE grondslag als de teller. */
  targetValue: number | null
  /** Verwachte datum uit de FIRE-countdown ("aug 2039"); `null` als onbekend. */
  eta: string | null
  /** Fractionele FIRE-leeftijd waar de `eta` uit volgt (diagnostiek/tests). */
  fireAgeFractional: number | null
  /**
   * Eindsaldo op de LEVENSVERWACHTING-proxy (`profiles.fire_end_age`, default 90
   * — zie lib/persoonlijk-plan-assembly.ts:147-158): de stand in de laatste
   * projectierij op `SimResult.displayEndAge`. Voedt het `end_balance`-doel.
   *
   * GRONDSLAG (bewust, CLAUDE.md-waarschuwing): dit is de LIQUIDE FIRE-
   * portefeuille (`SimRow.endPortfolio`), NIET het netto vermogen incl. eigen
   * woning. Reden: de kernelrijen dragen alleen de portefeuille, en dit is
   * dezelfde grondslag als `requiredFirePortfolio` — de noemer waar de rest van
   * de FIRE-kaart al op staat. Een incl.-woning eindsaldo zou een tweede
   * grondslag op dezelfde kaart zetten, precies de menging die verboden is.
   *
   * EENHEID: NOMINAAL (kernel-native), gelijk aan `targetValue` hierboven, die
   * óók nominaal uit de kernel komt. Wil een oppervlak "geld van vandaag" tonen,
   * dan deflateert het via `factorAtAge` op `HorizonFireSim.unifiedRows`
   * (lib/euro-display.ts) — nooit met een eigen machtsverheffing, en nooit twee
   * keer (ADR 0090/0093).
   *
   * OPTIONEEL/ADDITIEF (zelfde patroon als `SimResult.requiredFireNetWorth?`):
   * stub-/mock-snapshots die het veld niet zetten blijven geldig; `undefined` en
   * `null` betekenen allebei "de motor kon dit niet leveren" ⇒ de opgeslagen
   * doelwaarde blijft staan.
   */
  endBalanceAtEndAge?: number | null
}

/** Minimale rij-/resultaatvorm die `pickEndBalanceAtEndAge` leest. */
export interface EndBalanceSimShape {
  rows: readonly { age: number; endPortfolio: number }[]
  displayEndAge: number
}

/**
 * Eindsaldo op `displayEndAge` uit een REEDS GEDRAAIDE kernel-run — geen tweede
 * solve, puur een rij-selectie.
 *
 * Keuze van de rij: de laatste rij met `age <= displayEndAge`. Dat is robuuster
 * dan een exacte match (rijen kunnen op fractionele leeftijden of net onder de
 * eindleeftijd stoppen) en robuuster dan "de allerlaatste rij" (die kan bij een
 * afwijkende clip vóórbij de eindleeftijd liggen). Geen enkele rij binnen bereik
 * ⇒ `null`: liever niets dan het saldo van een andere leeftijd.
 */
export function pickEndBalanceAtEndAge(sim: EndBalanceSimShape | null | undefined): number | null {
  if (!sim || !Array.isArray(sim.rows) || sim.rows.length === 0) return null
  const endAge = sim.displayEndAge
  if (!Number.isFinite(endAge)) return null

  let best: { age: number; endPortfolio: number } | null = null
  for (const row of sim.rows) {
    if (!Number.isFinite(row.age) || row.age > endAge) continue
    if (best === null || row.age > best.age) best = row
  }
  if (best === null) return null
  const value = Number(best.endPortfolio)
  return Number.isFinite(value) ? value : null
}

/**
 * Invoer voor `buildVrijheidsgetalSnapshot` — exact de grootheden die de
 * loaders al hebben liggen voor `computeFreedomProgressWithBasis` en
 * `simFireCountdown`. Bewust primitieven: deze module kiest de grondslag niet
 * zelf en draait geen kernel.
 */
export interface VrijheidsgetalSnapshotInput {
  /** True ⇒ eigen woning uitgesloten van FIRE ⇒ EXCL.-grondslag (ADR 0009 herzien). */
  homeExcludedFromFire: boolean
  netWorthInclHome: number
  fireEligibleNetWorth: number
  requiredNetWorthInclHome: number | null
  requiredPortfolioExclHome: number | null
  /** `SimResult.fireAgeFractional` uit de canonieke kernel-run. */
  fireAgeFractional: number | null
  /** Huidige leeftijd (`ageAtDate(dateOfBirth)`); `null` zonder geboortedatum. */
  currentAge: number | null
  /**
   * Eindsaldo op `displayEndAge` uit DEZELFDE kernel-run — de aanroeper haalt 'm
   * met `pickEndBalanceAtEndAge(run.sim)`. Weglaten ⇒ `null` (geen eindsaldo-doel
   * te synchroniseren); bestaande aanroepers blijven daarmee ongewijzigd geldig.
   */
  endBalanceAtEndAge?: number | null
}

/**
 * Vertaal de canonieke FIRE-stand naar doelkaart-velden.
 *
 * Teller en noemer komen ALTIJD uit dezelfde `selectFreedomProgressBasis`-keuze
 * — nooit een incl.-woning teller tegen een excl.-woning noemer. Dat is de
 * harde invariant uit `lib/core-metrics.ts`, en meteen de reden dat we óók de
 * doelwaarde synchroniseren en niet alleen de huidige waarde: het opgeslagen
 * 25x-jaaruitgaven-bedrag staat op een ándere grondslag dan de canonieke teller,
 * dus die twee tegen elkaar afzetten zou een nieuw percentage opleveren — een
 * vierde antwoord op dezelfde vraag.
 *
 * De `eta` is de datum uit `deriveCountdown` — letterlijk dezelfde helper (en
 * dus dezelfde string) die `DashboardData.simFireCountdown.fireDate` voedt.
 */
export function buildVrijheidsgetalSnapshot(
  input: VrijheidsgetalSnapshotInput,
): VrijheidsgetalSnapshot {
  const { currentNetWorth, requiredPortfolio } = selectFreedomProgressBasis({
    homeExcludedFromFire: input.homeExcludedFromFire,
    netWorthInclHome: input.netWorthInclHome,
    fireEligibleNetWorth: input.fireEligibleNetWorth,
    requiredNetWorthInclHome: input.requiredNetWorthInclHome,
    requiredPortfolioExclHome: input.requiredPortfolioExclHome,
  })

  const fireAge =
    input.fireAgeFractional != null && Number.isFinite(input.fireAgeFractional)
      ? input.fireAgeFractional
      : null
  const age = input.currentAge != null && Number.isFinite(input.currentAge) ? input.currentAge : null

  // Zonder leeftijd of zonder kernel-uitkomst is er geen geprojecteerde datum.
  // Dan géén override: de kaart valt terug op de opgeslagen streefdatum, wat
  // eerlijker is dan `deriveCountdown`'s "Niet haalbaar"-tekst op een gat.
  const eta = fireAge != null && age != null ? deriveCountdown(fireAge, age).fireDate : null

  return {
    currentValue: Number.isFinite(currentNetWorth) ? currentNetWorth : 0,
    targetValue:
      requiredPortfolio != null && Number.isFinite(requiredPortfolio) && requiredPortfolio > 0
        ? requiredPortfolio
        : null,
    eta,
    fireAgeFractional: fireAge,
    endBalanceAtEndAge:
      input.endBalanceAtEndAge != null && Number.isFinite(input.endBalanceAtEndAge)
        ? input.endBalanceAtEndAge
        : null,
  }
}

/** Minimale doel-velden die de vrijheidsgetal-sync leest en muteert. */
type SyncableVrijheidsgetalGoal = {
  current_value: number
  target_value: number
  metadata?: Record<string, unknown> | null
}

/**
 * Overschrijf `current_value`/`target_value` van élk vrijheidsgetal-doel met de
 * canonieke stand. In-place (zelfde patroon als `autolinkGoalCurrentValues`) en
 * ALLES-OF-NIETS: zonder canonieke doelwaarde blijft óók de huidige waarde
 * staan, want een canonieke teller tegen een opgeslagen noemer is precies de
 * grondslag-menging die deze fix opheft.
 *
 * De DB-rij wordt niet aangeraakt — dit is een leespad-override, dus de
 * gebruiker houdt zijn ingevoerde bedrag en kan het in de bewerk-sheet zien.
 *
 * @returns hoeveel doelen daadwerkelijk gesynchroniseerd zijn (0 = de kaart
 *          toont nog de opgeslagen waarden; de UI moet dan geen "live"-belofte doen).
 */
export function applyVrijheidsgetalSync<T extends SyncableVrijheidsgetalGoal>(
  goals: T[],
  snapshot: VrijheidsgetalSnapshot | null,
): number {
  if (!snapshot || snapshot.targetValue == null) return 0
  let synced = 0
  for (const goal of goals) {
    if (!isVrijheidsgetalGoal(goal)) continue
    goal.current_value = snapshot.currentValue
    goal.target_value = snapshot.targetValue
    synced++
  }
  return synced
}
