/**
 * Registerplicht (A11, ADR 0142): élk parameterblok van `KernelInput` is
 * toegewezen aan een plek in de plan-review — een van de vijf stappen, het
 * afsluitscherm "Voor wie wil" (laag 2), of expliciet BUITEN de review omdat het
 * brondata is (bezittingen/schulden/inkomen zelf) of een weergavekeuze.
 *
 * De `Record<keyof KernelInput, …>` dwingt via het type af dat een NIEUW veld op
 * `KernelInput` hier een dekking krijgt vóór `tsc` groen is; `register.test.ts`
 * bewaakt dat elke stap minstens één blok draagt en dat de dekkingen geldig zijn.
 * Zo kan een nieuwe instelling die de kern raakt niet stil buiten de review blijven.
 */

import type { KernelInput } from '@/lib/horizon-kernel/types'
import type { PlanReviewStap } from './types'

/**
 * Waar een kernel-blok in de review landt:
 *  - een stap-sleutel     → de gebruiker bevestigt/wijzigt het in die stap;
 *  - `'laag2'`            → bereikbaar vanuit het afsluitscherm (bestaande Voorkeuren-kaarten);
 *  - `'brondata'`         → volgt uit de eigen bezittingen/schulden/inkomsten; geen review-keuze;
 *  - `'kern-intern'`      → kern-afstemming zonder gebruikersvrijheid (oracle-vlaggen, parity).
 */
export type PlanReviewDekking = PlanReviewStap | 'laag2' | 'brondata' | 'kern-intern'

export const PLAN_REVIEW_DEKKINGEN: readonly PlanReviewDekking[] = [
  'plan',
  'uitgaven',
  'inkomsten',
  'woning',
  'potten',
  'laag2',
  'brondata',
  'kern-intern',
]

/**
 * Het register. Één regel per `KernelInput`-veld; de toelichting zegt welk
 * app-veld het voedt en waar dat in de review zit.
 */
export const KERNEL_INPUT_REVIEW_REGISTER: Record<keyof KernelInput, { dekking: PlanReviewDekking; toelichting: string }> = {
  startLeeftijd: { dekking: 'brondata', toelichting: 'Geboortedatum (/mijn/profiel) — geen review-keuze.' },
  inflatie: { dekking: 'laag2', toelichting: 'profiles.inflation_rate — Voorkeuren-kaart Inflatie.' },
  box3: { dekking: 'laag2', toelichting: 'profiles.box3_method + heffingvrij inkomen — Voorkeuren-kaarten (TPR-10/12).' },
  assetPotten: { dekking: 'brondata', toelichting: 'Bezittingen zelf; rendement per bezitting via het bezittingenoverzicht (laag 2 verwijst). sale_config: zie potLiquidaties.' },
  schuldPotten: { dekking: 'brondata', toelichting: 'Schulden zelf.' },
  persoon: { dekking: 'brondata', toelichting: 'Geboortejaar/AOW-leeftijd uit de geboortedatum.' },
  inkomenUitgaven: { dekking: 'uitgaven', toelichting: 'uitgaveNaPensioenPerJaar = retirement_expense_method/-amount (stap 2); inkomen/uitgaven nu = brondata.' },
  tekortLeningRente: { dekking: 'laag2', toelichting: 'profiles.deficit_loan_rate — in de eindstrategie-pane van Voorkeuren.' },
  strategie: { dekking: 'potten', toelichting: 'Onttrekkingsstrategie-selectors (vast/afnemend/oplopend/guardrails).' },
  eindstrategie: { dekking: 'plan', toelichting: 'Stop-anker × eind-vorm × eindleeftijd × nalatenschap (fire_*-kolommen).' },
  woning: { dekking: 'woning', toelichting: 'housing_strategy_config — woonstrategie + trigger + expertvelden.' },
  onttrekkingsprofiel: { dekking: 'potten', toelichting: 'withdrawal_profile_config (profiel + fasecurve + flex) en guardrails.' },
  onzekerheid: { dekking: 'laag2', toelichting: 'Marktvolatiliteit uit fire_assumptions (beheer) — band/Monte Carlo, niet per gebruiker.' },
  ts: { dekking: 'potten', toelichting: 'pot_rules: onttrekkingsvolgorde, verdeling bij toename, afname-volgorde, categorie-prio’s.' },
  gebeurtenissen: { dekking: 'brondata', toelichting: 'Handmatige life-events op /toekomst/gebeurtenissen.' },
  autoGebeurtenissen: { dekking: 'inkomsten', toelichting: 'AOW-event (leefsituatie, jaren buiten NL) en pensioenpotten — inline instelbaar in stap 3 (TPR-15).' },
  partner: { dekking: 'brondata', toelichting: 'Huishoudtype/partnerkoppeling (/mijn/profiel); hoofdgrafiek draait solo.' },
  werkStrategie: { dekking: 'inkomsten', toelichting: 'Optionele werk-strategie (life_event werk) — inline instelbaar in stap 3 (TPR-15).' },
  potMutaties: { dekking: 'kern-intern', toelichting: 'Generieke pot-mutaties (V9) — geen app-veld.' },
  potLiquidaties: { dekking: 'woning', toelichting: 'sale_config per eigen niet-liquide bezitting — stap 4 inline (PATCH /api/assets/[id]/sale-config, TPR-15); ook in het bezittingenformulier.' },
  tekortAflossingUitLiquide: { dekking: 'kern-intern', toelichting: 'Transitionele oracle-vlag (ADR 0033).' },
  reachedNowVereistBereikbaarDoel: { dekking: 'kern-intern', toelichting: 'Gap-besluit V21 (bevinding M6) — geen gebruikerskeuze.' },
  echteAnnuiteitAflossing: { dekking: 'kern-intern', toelichting: 'Annuïteitsaflossing-vlag van de adapter — volgt uit de schuldgegevens.' },
  stopAnker: { dekking: 'plan', toelichting: 'Het stop-anker van het plan (fire_stop_anchor/fire_stop_age) — stap 1.' },
}

/** Alle kernel-blokken die een stap dekt — voor de test en voor de i-info. */
export function kernelBlokkenVoorStap(stap: PlanReviewStap): (keyof KernelInput)[] {
  return (Object.keys(KERNEL_INPUT_REVIEW_REGISTER) as (keyof KernelInput)[]).filter(
    (k) => KERNEL_INPUT_REVIEW_REGISTER[k].dekking === stap,
  )
}
