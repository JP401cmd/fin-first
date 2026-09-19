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
 *  - `'laag2'`            → inline in te stellen op het afsluitscherm "Voor wie wil" (TPR-15), zonder markering;
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
  'grondslag',
  'laag2',
  'brondata',
  'kern-intern',
]

/**
 * Het register. Één regel per `KernelInput`-veld; de toelichting zegt welk
 * app-veld het voedt en waar dat in de review zit.
 *
 * Eén kernel-blok kan in MEER dan één stap landen. `inkomenUitgaven` draagt twee dingen:
 * de uitgave ná stoppen (stap "Leven na stoppen") en de kasstroom van vandaag, waarvan
 * de grondslag sinds W-009 in de stap "Waar je cijfers op rusten" te kiezen is. `dekking`
 * blijft de PRIMAIRE plek (waar het blok inhoudelijk hoort); `ook` noemt de extra stappen,
 * zodat `kernelBlokkenVoorStap` niet liegt en de registerplicht (A11) sluitend blijft.
 */
export const KERNEL_INPUT_REVIEW_REGISTER: Record<
  keyof KernelInput,
  { dekking: PlanReviewDekking; ook?: readonly PlanReviewDekking[]; toelichting: string }
> = {
  startLeeftijd: { dekking: 'brondata', toelichting: 'Geboortedatum (/mijn/profiel) — geen review-keuze.' },
  inflatie: { dekking: 'laag2', toelichting: 'profiles.inflation_rate — inline in "Voor wie wil" (VoorkeurBewerkenBody, PUT /api/parameters, TPR-15); ook de Voorkeuren-kaart Inflatie.' },
  box3: { dekking: 'laag2', toelichting: 'profiles.box3_method + heffingvrij inkomen — inline in "Voor wie wil" (Box3MethodeBody, PUT /api/parameters, TPR-15); ook de Voorkeuren-kaart (TPR-10/12).' },
  assetPotten: { dekking: 'brondata', toelichting: 'Bezittingen zelf. Rendement per eigen bezitting inline in "Voor wie wil" (PATCH /api/assets/[id]/expected-return, TPR-15); het terugvalrendement (profiles.expected_return) ook daar. sale_config: zie potLiquidaties.' },
  schuldPotten: { dekking: 'brondata', toelichting: 'Schulden zelf.' },
  persoon: { dekking: 'brondata', toelichting: 'Geboortejaar/AOW-leeftijd uit de geboortedatum.' },
  inkomenUitgaven: {
    dekking: 'uitgaven',
    ook: ['grondslag'],
    toelichting:
      'uitgaveNaPensioenPerJaar = retirement_expense_method/-amount (stap 2). Inkomen/uitgaven NU zijn brondata, ' +
      'maar hun GRONDSLAG (profiles.income_source/expenses_source + cashflow_basis_prefs, ADR 0103) stuurt via ' +
      'withResolvedKernelBedragen rechtstreeks nettoJaarinkomen en de uitgaven — sinds W-009 te kiezen in de stap ' +
      '"Waar je cijfers op rusten" (CashflowGrondslagBody, PUT /api/parameters).',
  },
  tekortLeningRente: { dekking: 'plan', toelichting: 'profiles.deficit_loan_rate — in de eindstrategie-body, dus inline in stap 1 (TPR-15) en in de eindstrategie-pane van Voorkeuren.' },
  strategie: { dekking: 'potten', toelichting: 'Onttrekkingsstrategie-selectors (vast/afnemend/oplopend/guardrails).' },
  eindstrategie: { dekking: 'plan', toelichting: 'Stop-anker × eind-vorm × eindleeftijd × nalatenschap (fire_*-kolommen).' },
  woning: { dekking: 'woning', toelichting: 'housing_strategy_config — woonstrategie + trigger + expertvelden.' },
  onttrekkingsprofiel: { dekking: 'potten', toelichting: 'withdrawal_profile_config (profiel + fasecurve + flex) en guardrails.' },
  onzekerheid: { dekking: 'kern-intern', toelichting: 'Marktvolatiliteit uit fire_assumptions (beheer) — band/Monte Carlo, niet per gebruiker; buiten de review.' },
  ts: { dekking: 'potten', toelichting: 'pot_rules: onttrekkingsvolgorde, verdeling bij toename, afname-volgorde, categorie-prio’s.' },
  gebeurtenissen: { dekking: 'brondata', toelichting: 'Handmatige life-events op /toekomst/gebeurtenissen.' },
  autoGebeurtenissen: { dekking: 'inkomsten', toelichting: 'AOW-event (leefsituatie, jaren buiten NL) en pensioenpotten — inline instelbaar in stap 3 (TPR-15).' },
  partner: { dekking: 'brondata', toelichting: 'Huishoudtype/partnerkoppeling (/mijn/profiel). In het gecombineerde perspectief rekent de hoofdgrafiek als huishouden via de partner-parameterlaag (TPR-07); de review en de wizard rekenen op het eigen perspectief (snapshot zonder partnerblok).' },
  werkStrategie: { dekking: 'inkomsten', toelichting: 'Optionele werk-strategie (life_event werk) — inline instelbaar in stap 3 (TPR-15).' },
  potMutaties: { dekking: 'kern-intern', toelichting: 'Generieke pot-mutaties (V9) — geen app-veld.' },
  potLiquidaties: { dekking: 'woning', toelichting: 'sale_config per eigen niet-liquide bezitting — stap 4 inline (PATCH /api/assets/[id]/sale-config, TPR-15); ook in het bezittingenformulier.' },
  tekortAflossingUitLiquide: { dekking: 'kern-intern', toelichting: 'Transitionele oracle-vlag (ADR 0033).' },
  reachedNowVereistBereikbaarDoel: { dekking: 'kern-intern', toelichting: 'Gap-besluit V21 (bevinding M6) — geen gebruikerskeuze.' },
  echteAnnuiteitAflossing: { dekking: 'kern-intern', toelichting: 'Annuïteitsaflossing-vlag van de adapter — volgt uit de schuldgegevens.' },
  stopAnker: { dekking: 'plan', toelichting: 'Het stop-anker van het plan (fire_stop_anchor/fire_stop_age) — stap 1.' },
  geenTekortLening: { dekking: 'plan', toelichting: 'ADR 0149 — "Geen tekort-lening in mijn plan" (profiles.fire_no_deficit_loan, PUT /api/fire-settings): planvoorwaarde naast het stop-anker — stap 1.' },
  pensioenNominaalVast: { dekking: 'kern-intern', toelichting: 'Gap-besluit V25 (ADR 0167) — eigen pensioen "Geïndexeerd = Nee" is nominaal vast; app-pad altijd aan, geen gebruikerskeuze (de keuze zelf zit op het pensioen-event).' },
}

/** Alle kernel-blokken die een stap dekt — voor de test en voor de i-info. */
export function kernelBlokkenVoorStap(stap: PlanReviewStap): (keyof KernelInput)[] {
  return (Object.keys(KERNEL_INPUT_REVIEW_REGISTER) as (keyof KernelInput)[]).filter((k) => {
    const reg = KERNEL_INPUT_REVIEW_REGISTER[k]
    return reg.dekking === stap || (reg.ook?.includes(stap) ?? false)
  })
}
