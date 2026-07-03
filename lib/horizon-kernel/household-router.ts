/**
 * Household-engine-router (FASE 5, stap 2d) — de dunne motorschakelaar voor het
 * **huishouden-oppervlak** (`lib/household-projection.ts` → `/toekomst`-huishoudsectie +
 * de huishouden-vergelijking-widget). Kiest per huishouden-run tussen de nieuwe
 * **horizon-kernel** (achter de per-gebruiker-vlag `horizon_kernel_household`) en het
 * bestaande **v2-grootboek-pad** dat `household-projection.ts` vandaag draait.
 *
 * ## Wat de kernel-tak doet (vlag aan, besluit V3)
 *  - **GECOMBINEERD** = één kernel-**huishouden-run**: de head (oudste partner) drijft de
 *    tijdas/instellingen; de andere partner komt via de **PT-parameterlaag**
 *    (`adapter/household.ts#buildPartnerParams` → `box3.personen = 2`, `leefsituatie =
 *    'Samenwonend'`, partner-inkomen/-AOW). Géén tweede persoon in de maandloop.
 *  - **PER-PARTNER** = twee **solo**-kernel-runs via `buildPerspectiefInputs`
 *    (eigenaar-splitsing: persoonlijke potten 1:1, gedeelde potten naar aandeel; Σ =
 *    huishouden). Elke solo-run draait op z'n eigen tijdas + eigen instellingen.
 *
 * Elke run loopt: `buildKernelInputFromAppWithNotices` → `solveFire` → `kernelToUnified-
 * Result` (bridge). De uitvoer is `UnifiedProjectionResult`-vormig — exact wat
 * `household-projection.ts` vandaag uit `runSelectedProjection` haalt en met
 * `toSimResult`/`simResultToProjection` verwerkt. Het **household-specifieke** deel
 * (financials, split-labels, privacy-degrade, "samen sterker"-vergelijking) blijft
 * volledig in `household-projection.ts` — deze router raakt het niet aan.
 *
 * ## Byte-identiteit (harde eis)
 * Bij `kernelEnabled === false` (default) of een niet-kernel-geschikt geval geeft de
 * router `engine: 'v2'` terug **zonder iets te berekenen** — `household-projection.ts`
 * draait dan letterlijk z'n bestaande v2-pad, byte-identiek aan vandaag.
 *
 * ## Defensieve terugval (crash-vangnet, spiegel van de peer-routers)
 * Ontbrekende rauwe context, een niet-2-persoons-huishouden, ontbrekende geboortedatum,
 * privacy-degrade (partner deelt alleen totalen / verbergt toekomst) of ELKE kernel-fout
 * → schone `engine: 'v2'`-terugval met reden. De vlag mag het oppervlak nooit laten
 * crashen. `household-projection.ts` valt dan terug op v2 (privacy/aggregaat-paden lopen
 * sowieso al buiten de kernel).
 *
 * ## Partner-pensioen-/AOW-notices
 * De adapter kent geen partner-pensioen in het profiel-oppervlak → gedocumenteerde
 * defaults + `EventMappingNotice`s (`buildPartnerParams`). Die reizen mee in
 * `notices` zodat de beheer-/UI-kant er later iets mee kan; deze router bouwt geen UI.
 *
 * Consumeert uitsluitend kern/adapter/bridge/flag. Deze module logt NOOIT (`console.*`).
 */

import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { LifeEvent } from '@/lib/horizon-data'
import type { AowLeeftijdRow } from '@/lib/aow-leeftijd'
import type { TaxYear } from '@/lib/box3-data'
import { solveFire } from '@/lib/horizon-kernel/solver'
import {
  buildKernelInputFromAppWithNotices,
  buildPerspectiefInputs,
  deriveEigenHuisIds,
  type EventMappingNotice,
  type KernelAdapterInput,
  type KernelAdapterProfile,
} from '@/lib/horizon-kernel/adapter'
import {
  kernelToUnifiedResult,
  buildKernelSlotMeta,
  type KernelUnifiedResult,
} from '@/lib/horizon-kernel/bridge'

/** Welke motor de huishouden-run daadwerkelijk berekende. */
export type HouseholdEngine = 'kernel' | 'v2'

/**
 * Eén huishoudlid in de kernel-context: profiel + eigen (persoonlijke) gebeurtenissen +
 * de al-bepaalde jaaruitgave-ná-pensioen voor diens SOLO-perspectief-run. `userId` moet
 * overeenkomen met de `user_id` op de potten (voor de eigenaar-splitsing).
 */
export interface HouseholdKernelMember {
  readonly userId: string
  readonly profile: KernelAdapterProfile
  /** Eigen persoonlijke levensgebeurtenissen voor de solo-perspectief-run (gedeeld hoort in de combined). */
  readonly lifeEvents?: readonly LifeEvent[]
  /** AOW-leeftijd-tabel voor dit lid; leeg → kern-fallback 67. */
  readonly aowRows?: readonly AowLeeftijdRow[]
  /**
   * Jaaruitgave ná pensioen (reëel/koopkracht-nu) voor de SOLO-perspectief-run van dit
   * lid — de grondslag onder het eigen FIRE-doel. Al bepaald door `household-projection.ts`
   * (`yearlyExpensesForMember`). Moet > 0 zijn; anders valt de router terug op v2.
   */
  readonly yearlyExpenses: number
}

/**
 * De rauwe huishouden-context waaruit de kernel-runs worden samengesteld. Bevat exact de
 * data die het v2-pad óók al geladen heeft (privacy-gated) — géén verbreding. `assets`/
 * `debts` zijn de VOLLEDIGE, itemized huishoud-potten met correcte `user_id` + `ownership`.
 */
export interface HouseholdKernelRawContext {
  /** De HEAD (oudste partner): drijft de gecombineerde tijdas/instellingen + eigen solo-run. */
  readonly head: HouseholdKernelMember
  /** De andere partner: PT-laag in de gecombineerde run + eigen solo-perspectief-run. */
  readonly partner: HouseholdKernelMember
  /** Volledige itemized huishoud-bezittingen (persoonlijk beide leden + gedeeld). */
  readonly assets: readonly Asset[]
  /** Volledige itemized huishoud-schulden. */
  readonly debts: readonly Debt[]
  /** Gebeurtenissen voor de GECOMBINEERDE run (persoonlijk beide + gedeeld, gededupliceerd). */
  readonly combinedLifeEvents?: readonly LifeEvent[]
  /** Aandeel (0..1) van de head in de GEDEELDE potten; partner = 1 − aandeel. */
  readonly gedeeldAandeelHoofd: number
  /**
   * Huishoud-brede jaaruitgave ná pensioen (reëel/koopkracht-nu) — de gekozen methode
   * (auto_shared/sum_partners/custom). Drijft het GECOMBINEERDE FIRE-doel. Moet > 0 zijn.
   */
  readonly combinedYearlyExpenses: number
  /** Box 3-belastingjaar; default = meest recente (adapter-default). */
  readonly taxYear?: TaxYear
}

/** Parameters voor `computeHouseholdProjection`. */
export interface ComputeHouseholdProjectionParams {
  /** Is de kernel-vlag (`horizon_kernel_household`) aan voor de kijkende gebruiker? */
  readonly kernelEnabled: boolean
  /** Rauwe context voor de kernel-tak; afwezig → v2-terugval met reden. */
  readonly rawContext?: HouseholdKernelRawContext
}

/**
 * Uitkomst van één huishouden-run-set. Bij `engine === 'kernel'` zijn `combined` +
 * `perMember` gevuld (per `userId`); bij `engine === 'v2'` niets (de aanroeper draait
 * z'n eigen v2-pad).
 */
export interface HouseholdProjectionOutcome {
  readonly engine: HouseholdEngine
  /** Alleen gezet bij een terugval op v2 terwijl de vlag aan stond. */
  readonly fallbackReason?: string
  /** GECOMBINEERDE kernel-run (head-as + partner-PT). Alleen bij `engine === 'kernel'`. */
  readonly combined?: KernelUnifiedResult
  /** Per `userId` de SOLO-perspectief-kernel-run. Alleen bij `engine === 'kernel'`. */
  readonly perMember?: Readonly<Record<string, KernelUnifiedResult>>
  /**
   * Partner-pensioen/-AOW-notices uit de adapter (doorvoer naar beheer/UI; nog niet
   * geconsumeerd). Alleen bij `engine === 'kernel'`.
   */
  readonly notices?: readonly EventMappingNotice[]
}

/**
 * Profiel-kloon die de post-pensioen-uitgave FORCEERT op `yearly` via de canonieke
 * `essential_budgets`-methode. Zo landt de reeds-bepaalde huishoud-/lid-uitgave in het
 * kernel-FIRE-doel zonder de kern/adapter te patchen (zelfde mechaniek als de
 * convergentie-router die `yearly_essential_expenses` injecteert). De overige velden
 * (inkomen, huidige uitgaven, strategie, rendement) blijven ongemoeid — die drijft de
 * kern natively.
 */
function withPostRetirementExpense(
  profile: KernelAdapterProfile,
  yearly: number,
): KernelAdapterProfile {
  return {
    ...profile,
    retirement_expense_method: 'essential_budgets',
    yearly_essential_expenses: yearly,
  }
}

/**
 * Draai één kernel-invoer door de volledige keten (adapter → solver → bridge) en lever
 * het `UnifiedProjectionResult` + de adapter-notices. `yearlyExpenses` is de reële
 * jaaruitgave voor de bridge-`implicitWithdrawalRate` (zoals de v2-adapter-optie).
 */
function runKernelOnce(
  adapterInput: KernelAdapterInput,
  yearlyExpenses: number,
): { readonly result: KernelUnifiedResult; readonly notices: readonly EventMappingNotice[] } {
  const { input: kernelInput, notices } = buildKernelInputFromAppWithNotices(adapterInput)
  const solve = solveFire(kernelInput)
  const eigenHuisIds = deriveEigenHuisIds(adapterInput.assets)
  const { assetSlotMeta, debtSlotMeta } = buildKernelSlotMeta(
    adapterInput.assets,
    adapterInput.debts,
    eigenHuisIds,
  )
  const result = kernelToUnifiedResult(solve, {
    input: kernelInput,
    yearlyExpenses,
    assetSlotMeta,
    debtSlotMeta,
  })
  return { result, notices }
}

/** Dedupliceer notices op boodschap (partner-notices komen alleen uit de combined run). */
function dedupeNotices(notices: readonly EventMappingNotice[]): EventMappingNotice[] {
  const seen = new Set<string>()
  const out: EventMappingNotice[] = []
  for (const n of notices) {
    if (seen.has(n.message)) continue
    seen.add(n.message)
    out.push(n)
  }
  return out
}

/**
 * Bereken de huishouden-projectie-set via de kernel (vlag aan + geschikt) of geef het
 * v2-signaal terug (vlag uit / terugval). Zie de module-doc voor de byte-identiteit- en
 * terugval-garanties.
 */
export function computeHouseholdProjection(
  params: ComputeHouseholdProjectionParams,
): HouseholdProjectionOutcome {
  const { kernelEnabled, rawContext } = params

  // Vlag uit → byte-identiek aan vandaag (de aanroeper draait z'n eigen v2-pad).
  if (!kernelEnabled) {
    return { engine: 'v2' }
  }

  // Zonder rauwe context kan de kernel-invoer niet worden samengesteld → v2.
  if (!rawContext) {
    return { engine: 'v2', fallbackReason: 'geen rauwe huishouden-context beschikbaar' }
  }

  const { head, partner, combinedYearlyExpenses } = rawContext

  // Geschiktheids-poorten (alles buiten deze band draait het v2-pad al buiten de kernel).
  if (!head.profile.date_of_birth || !partner.profile.date_of_birth) {
    return { engine: 'v2', fallbackReason: 'geboortedatum van een partner ontbreekt' }
  }
  if (head.userId === partner.userId) {
    return { engine: 'v2', fallbackReason: 'head en partner delen hetzelfde user_id' }
  }
  if (!(combinedYearlyExpenses > 0) || !(head.yearlyExpenses > 0) || !(partner.yearlyExpenses > 0)) {
    return { engine: 'v2', fallbackReason: 'ontbrekende jaaruitgave (gecombineerd of per lid)' }
  }

  try {
    // Gecombineerde huishouden-invoer: head-profiel (met huishoud-brede uitgave) + partner-
    // blok (PT-laag). De partner-profiel-uitgave is irrelevant voor de combined run (de
    // PT-laag levert alleen partner-INKOMEN/-AOW), dus die geven we ongewijzigd door.
    const household: KernelAdapterInput = {
      profile: withPostRetirementExpense(head.profile, combinedYearlyExpenses),
      assets: rawContext.assets,
      debts: rawContext.debts,
      lifeEvents: rawContext.combinedLifeEvents,
      aowRows: head.aowRows,
      taxYear: rawContext.taxYear,
      partner: {
        profile: partner.profile,
        aowRows: partner.aowRows,
        lifeEvents: partner.lifeEvents,
      },
    }

    // Eigenaar-splitsing (persoonlijk 1:1, gedeeld naar aandeel). `gecombineerd` === household.
    const perspectief = buildPerspectiefInputs(household, {
      hoofdUserId: head.userId,
      partnerUserId: partner.userId,
      gedeeldAandeelHoofd: rawContext.gedeeldAandeelHoofd,
    })

    // Solo-perspectieven: forceer de EIGEN post-pensioen-uitgave + eigen persoonlijke
    // gebeurtenissen (buildPerspectiefInputs erft de gecombineerde uitgave/events van het
    // head-profiel; die moeten per solo-run naar de lid-eigen grondslag).
    const hoofdSolo: KernelAdapterInput = {
      ...perspectief.hoofd,
      profile: withPostRetirementExpense(head.profile, head.yearlyExpenses),
      lifeEvents: head.lifeEvents,
    }
    const partnerSolo: KernelAdapterInput = {
      ...perspectief.partner,
      profile: withPostRetirementExpense(partner.profile, partner.yearlyExpenses),
      lifeEvents: partner.lifeEvents,
    }

    const combinedRun = runKernelOnce(perspectief.gecombineerd, combinedYearlyExpenses)
    const hoofdRun = runKernelOnce(hoofdSolo, head.yearlyExpenses)
    const partnerRun = runKernelOnce(partnerSolo, partner.yearlyExpenses)

    return {
      engine: 'kernel',
      combined: combinedRun.result,
      perMember: {
        [head.userId]: hoofdRun.result,
        [partner.userId]: partnerRun.result,
      },
      // Partner-notices leven op de combined run (die het partner-blok draagt); de solo-
      // runs zijn partner-loos. Aggregeer + dedupliceer defensief over alle drie.
      notices: dedupeNotices([
        ...combinedRun.notices,
        ...hoofdRun.notices,
        ...partnerRun.notices,
      ]),
    }
  } catch (err) {
    // Defensief: elke kernel-fout (bv. ontbrekende geboortedatum, splitsings-fout) mag het
    // huishouden-oppervlak nooit laten crashen achter de vlag → schone v2-terugval met reden.
    const message = err instanceof Error ? err.message : 'onbekende kernel-fout'
    return { engine: 'v2', fallbackReason: `kernel-fout, teruggevallen op v2: ${message}` }
  }
}
