/**
 * Household-projectie (FASE 6 stap 5A — kernel-only) — het **huishouden-oppervlak**
 * (`lib/household-projection.ts` → /toekomst-huishoudsectie + de huishouden-vergelijking-
 * widget). Sinds de v2-verwijdering rekent het huishouden via de **horizon-kernel**.
 *
 * ## Wat de kernel-tak doet
 *  - **GECOMBINEERD** = één kernel-**huishouden-run**: de head (oudste partner) drijft de
 *    tijdas/instellingen; de andere partner komt via de **PT-parameterlaag**
 *    (`adapter/household.ts#buildPartnerParams` → `box3.personen = 2`, `leefsituatie =
 *    'Samenwonend'`, partner-inkomen/-AOW). Géén tweede persoon in de maandloop.
 *  - **PER-PARTNER** = twee **solo**-kernel-runs via `buildPerspectiefInputs`
 *    (eigenaar-splitsing: persoonlijke potten 1:1, gedeelde potten naar aandeel; Σ =
 *    huishouden). Elke solo-run draait op z'n eigen tijdas + eigen instellingen.
 *
 * Elke run loopt via de gedeelde `runKernelUnified`-helper (adapter → solver → bridge).
 *
 * ## Geschiktheids-poorten → reden i.p.v. motorkeuze
 * Ontbrekende rauwe context, een niet-2-persoons-huishouden, ontbrekende geboortedatum of
 * ontbrekende jaaruitgave → `{ ok: false, reason }`. Er is geen v2-motor meer om op terug
 * te vallen: de AANROEPER (`household-projection.ts`) kiest op zo'n reden zélf een
 * synthetisch kernel-pad (aggregaat/privacy-degrade via het scalar-router-patroon). Elke
 * kern-fout → idem (crash-vangnet). De vlag mag het oppervlak nooit laten crashen.
 *
 * ## Partner-pensioen-/AOW-notices
 * De adapter kent geen partner-pensioen in het profiel-oppervlak → gedocumenteerde
 * defaults + `EventMappingNotice`s (`buildPartnerParams`). Die reizen mee in `notices`.
 *
 * Consumeert uitsluitend adapter/bridge/run-unified. Deze module logt NOOIT (`console.*`).
 */

import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { LifeEvent } from '@/lib/horizon-data'
import type { AowLeeftijdRow } from '@/lib/aow-leeftijd'
import type { TaxYear } from '@/lib/box3-data'
import {
  buildPerspectiefInputs,
  type EventMappingNotice,
  type KernelAdapterInput,
  type KernelAdapterProfile,
} from '@/lib/horizon-kernel/adapter'
import { runKernelUnified } from '@/lib/horizon-kernel/run-unified'
import type { KernelUnifiedResult } from '@/lib/horizon-kernel/bridge'

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
   * (`yearlyExpensesForMember`). Moet > 0 zijn; anders levert de router een reden.
   */
  readonly yearlyExpenses: number
}

/**
 * De rauwe huishouden-context waaruit de kernel-runs worden samengesteld. `assets`/
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
  /** Rauwe context voor de kernel-tak; afwezig → `{ ok: false }` (de aanroeper degradeert). */
  readonly rawContext?: HouseholdKernelRawContext
}

/**
 * Uitkomst van één huishouden-run-set: de kernel-runs óf een reden waarop de aanroeper een
 * synthetisch kernel-pad kiest.
 */
export type HouseholdProjectionOutcome =
  | {
      readonly ok: true
      /** GECOMBINEERDE kernel-run (head-as + partner-PT). */
      readonly combined: KernelUnifiedResult
      /** Per `userId` de SOLO-perspectief-kernel-run. */
      readonly perMember: Readonly<Record<string, KernelUnifiedResult>>
      /** Partner-pensioen/-AOW-notices uit de adapter (doorvoer naar beheer/UI). */
      readonly notices: readonly EventMappingNotice[]
    }
  | {
      readonly ok: false
      readonly reason: string
    }

/**
 * Profiel-kloon die de post-pensioen-uitgave FORCEERT op `yearly` via de canonieke
 * `essential_budgets`-methode. Zo landt de reeds-bepaalde huishoud-/lid-uitgave in het
 * kernel-FIRE-doel zonder de kern/adapter te patchen. De overige velden (inkomen, huidige
 * uitgaven, strategie, rendement) blijven ongemoeid — die drijft de kern natively.
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
 * Bereken de huishouden-projectie-set via de kernel, of geef een reden terug waarop de
 * aanroeper degradeert. Zie de module-doc voor de geschiktheids-poorten en het contract.
 */
export function computeHouseholdProjection(
  params: ComputeHouseholdProjectionParams,
): HouseholdProjectionOutcome {
  const { rawContext } = params

  // Zonder rauwe context kan de kernel-invoer niet worden samengesteld.
  if (!rawContext) {
    return { ok: false, reason: 'geen rauwe huishouden-context beschikbaar' }
  }

  const { head, partner, combinedYearlyExpenses } = rawContext

  // Geschiktheids-poorten — de aanroeper degradeert naar een synthetisch/aggregaat-pad.
  if (!head.profile.date_of_birth || !partner.profile.date_of_birth) {
    return { ok: false, reason: 'geboortedatum van een partner ontbreekt' }
  }
  if (head.userId === partner.userId) {
    return { ok: false, reason: 'head en partner delen hetzelfde user_id' }
  }
  if (!(combinedYearlyExpenses > 0) || !(head.yearlyExpenses > 0) || !(partner.yearlyExpenses > 0)) {
    return { ok: false, reason: 'ontbrekende jaaruitgave (gecombineerd of per lid)' }
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

    const combinedRun = runKernelUnified({ adapterInput: perspectief.gecombineerd, yearlyExpenses: combinedYearlyExpenses })
    const hoofdRun = runKernelUnified({ adapterInput: hoofdSolo, yearlyExpenses: head.yearlyExpenses })
    const partnerRun = runKernelUnified({ adapterInput: partnerSolo, yearlyExpenses: partner.yearlyExpenses })

    return {
      ok: true,
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
    // Elke kern-fout (bv. ontbrekende geboortedatum, splitsings-fout) mag het huishouden-
    // oppervlak nooit laten crashen → reden; de aanroeper degradeert naar het aggregaat-pad.
    const message = err instanceof Error ? err.message : 'onbekende kernel-fout'
    return { ok: false, reason: `kernel-fout: ${message}` }
  }
}
