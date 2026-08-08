// ── Gedeelde Fin-cijferbron: één canonieke ADR 0009-afleiding ────────────────
//
// `buildWillFinancialFacts` is de ÉNE plek waar de kern-cijfers die zowel de
// cloud-Fin (`buildSharedContext`) als de lokale Fin (`buildLocalChatOverview`)
// tonen worden afgeleid. Vóór C2b bestond deze afleiding dubbel — met een subtiel
// verschil dat tot uiteenlopende getallen leidde:
//
//   • cloud: vrijheids-% via `computeFreedomProgressWithBasis` op de MET-terugval
//     grondslag (`requiredPortfolio = fireTargetFromHorizon ?? core.fireTarget`).
//   • lokaal: vrijheids-% uit `healthScoreInput.freedomPct` — de loader-variant
//     ZONDER terugval (`requiredPortfolio = fireTargetFromHorizon > 0 ? … : null`),
//     die in het randgeval (`fireTargetFromHorizon === null`) 0% teruggaf, terwijl
//     het lokale FIRE-doel WÉL de met-terugval-grondslag gebruikte → interne
//     grondslag-mismatch binnen de lokale Fin.
//
// Eigenaarsbesluit (2026-07, C2b): de canonieke grondslag = MET-terugval — exact
// wat cloud-Fin en de dashboard-widgets al doen. Deze extractor legt die keuze op
// één plek vast; beide renderers consumeren 'm en tonen daardoor gegarandeerd
// hetzelfde vrijheids-% én FIRE-doel op dezelfde grondslag.
//
// PURE FUNCTIE — geen SupabaseClient, geen queries. Werkt uitsluitend op reeds-
// geladen `CorePageData` (uit `loadCoreData`) + het profielveld
// `housing_strategy_config`. CONSUME, DON'T RECOMPUTE (CLAUDE.md): elke waarde komt
// uit de canonieke laag (`loadCoreData`, `computeCoreData`, `computeFreedom-
// ProgressWithBasis`, `dailyExpenseRate`). De INCL.-woning noemer/`displayFireGoal`
// komt sinds WF-KRUIS-23 uit de kernel zelf (`fireNetWorthTargetFromHorizon` =
// Prognose!I@FIRE, hetzelfde cijfer als /overzicht en /toekomst); de
// `inclHomeTargetFromScalar`-benadering is alleen nog fallback als de kernel-run
// niet kon draaien.
//
// JAARRUIMTE BEWUST BUITEN DE STRUCT: jaarruimte vereist `computeJaarruimte` /
// `resolvePensionFactorA` (pensioen-/factor-A-invoer die `loadCoreData` niet laadt)
// en zit daarom niet in `FinFacts`. Zie `local-chat-context.ts`-kop en FR-C2b.3.

import type { CorePageData } from '@/lib/core-data-loader'
import { computeCoreData, computeFreedomProgressWithBasis, inclHomeTargetFromScalar, type FinancialInput } from '@/lib/core-metrics'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import {
  parseHousingStrategy,
  deriveHousingContext,
  getFireEligibleNetWorth,
  isHomeExcludedFromFire,
} from '@/lib/housing-strategy'
import { dailyExpenseRate } from '@/lib/format'

/**
 * De canonieke kern-cijfers die beide Fins nodig hebben. Alle EUR-/%-waarden zijn
 * ONGEROND — elke renderer rondt/format zelf exact zoals vandaag (byte-identiek).
 */
export interface FinFacts {
  /** False wanneer er geen financiële data is (geen bezit/schuld/transacties). */
  hasData: boolean
  /** Netto vermogen in EUR (bezittingen − schulden) — `computeCoreData().netWorth`. */
  nettoVermogen: number
  /** Vrijgekochte tijd: hele jaren (`computeCoreData().freedomYears`). */
  freedomYears: number
  /** Vrijgekochte tijd: resterende maanden (`computeCoreData().freedomMonths`). */
  freedomMonths: number
  /** Vrijheids-% (0–100), canonieke ADR 0009-grondslag, MET-terugval. Ongerond. */
  vrijheidsPct: number
  /**
   * ADR 0034 FIRE-doel op DEZELFDE grondslag als `vrijheidsPct` (incl./excl.
   * eigen woning; INCL. = kernel-`requiredFireNetWorth`, met
   * `inclHomeTargetFromScalar` als fallback), of null wanneer er geen benodigde
   * portefeuille bepaald kon worden. Ongerond.
   */
  displayFireGoal: number | null
  /** Weer te geven FIRE-doel = `displayFireGoal ?? core.fireTarget`. Ongerond. */
  fireDoel: number
  /**
   * Staat `fireDoel` in door de kernel op de FIRE-maand geprojecteerde
   * (TOEKOMSTIGE) euro's? Alleen dan mag een consument het bedrag met de
   * kernel-deflator naar geld van vandaag omrekenen — zie de herkomst-toelichting
   * bij de afleiding hieronder. False bij elk terugvalpad dat (deels) al in euro's
   * van VANDAAG staat, en bij geen data.
   */
  fireDoelUitKernel: boolean
  /** Canonieke 6-maands spaarquote (%). 0 wanneer er geen data is. */
  spaarquotePct: number
  /** Persoonlijk veilig opnamepercentage (SWR) als rauw decimaal, bv. 0.0288. */
  swr: number
  /** Dagtarief: uitgaven per dag in EUR (`dailyExpenseRate`). Ongerond. 0 bij geen data. */
  dagtarief: number
  /** Netto maandinkomen in EUR. */
  maandinkomen: number
  /** Maanduitgaven in EUR. */
  maanduitgaven: number
}

/** Alleen `housing_strategy_config` is nodig; beide callers laden méér, maar delen dit veld. */
export type FinFactsProfile = { housing_strategy_config?: unknown } | null

/**
 * Leid de gedeelde Fin-cijfers af uit reeds-geladen `CorePageData` + profiel.
 * De enige home voor de MET-terugval ADR 0009-grondslag (vrijheids-% + FIRE-doel).
 */
export function buildWillFinancialFacts(coreData: CorePageData, profile: FinFactsProfile): FinFacts {
  const { rawFinancials } = coreData
  const totalAssets = rawFinancials.totalAssets
  const totalDebts = rawFinancials.totalDebts
  const effectiveSwr = coreData.fireParams.effectiveSwr

  // Geen enkele financiële data → minimaal, cijferloos overzicht. Spiegelt de
  // no-data-tak die beide callers vandaag hebben (SWR blijft de reële param).
  if (totalAssets === 0 && totalDebts === 0 && !coreData.hasTransactions) {
    return {
      hasData: false,
      nettoVermogen: 0,
      freedomYears: 0,
      freedomMonths: 0,
      vrijheidsPct: 0,
      displayFireGoal: null,
      fireDoel: 0,
      fireDoelUitKernel: false,
      spaarquotePct: 0,
      swr: effectiveSwr,
      dagtarief: 0,
      maandinkomen: rawFinancials.monthlyIncome,
      maanduitgaven: rawFinancials.monthlyExpenses,
    }
  }

  // Canonieke kern-metrics (netto vermogen, vrijgekochte tijd, FIRE-doel-fallback).
  const coreInput: FinancialInput = {
    totalAssets,
    totalDebts,
    monthlyIncome: rawFinancials.monthlyIncome,
    monthlyExpenses: rawFinancials.monthlyExpenses,
    yearlyMustExpenses: rawFinancials.yearlyRetirementExpenses ?? 0,
    monthlyContributions: 0,
    dateOfBirth: null,
  }
  const core = computeCoreData(coreInput, effectiveSwr)

  // Vrijheids-% op de canonieke grondslag (ADR 0009 herzien): standaard telt de
  // eigen woning mee (INCL.-grondslag); alleen bij exclude_from_fire → EXCL.
  // Noemer = benodigde portefeuille uit de unified projection, met TERUGVAL op het
  // strategie-loze fireTarget wanneer de projectie niet kon draaien.
  const housingStrategy = parseHousingStrategy(profile?.housing_strategy_config)
  const housingContext = deriveHousingContext(
    (coreData.fullAssets ?? []) as Asset[],
    (coreData.fullDebts ?? []) as Debt[],
  )
  const fireEligibleNetWorth = getFireEligibleNetWorth(core.netWorth, housingContext, housingStrategy)
  const requiredPortfolio = coreData.fireTargetFromHorizon ?? (core.fireTarget > 0 ? core.fireTarget : null)
  const homeExcludedFromFire = housingContext.hasEigenHuis && isHomeExcludedFromFire(housingStrategy)
  // INCL.-noemer: CONSUME de kernel-geprojecteerde `requiredFireNetWorth`
  // (Prognose!I@FIRE) uit dezelfde run die ook `fireTargetFromHorizon` leverde —
  // exact wat /overzicht en /toekomst tonen (dashboard-data-loader:
  // `simRequiredNetWorth ?? inclHomeTargetFromScalar(...)`). De scalar-benadering
  // (excl.-doel + overwaarde van VANDAAG) is enkel nog fallback wanneer de
  // kernel-run niet kon draaien; als hoofdroute gaf ze een structureel te hoog
  // FIRE-doel en een te laag vrijheids-% zodra er tussen nu en FIRE nog wordt
  // afgelost of de huiswaarde beweegt (WF-KRUIS-23).
  const requiredNetWorthInclHome =
    coreData.fireNetWorthTargetFromHorizon ??
    inclHomeTargetFromScalar(requiredPortfolio, core.netWorth, fireEligibleNetWorth)
  const vrijheidsPct = computeFreedomProgressWithBasis({
    homeExcludedFromFire,
    netWorthInclHome: core.netWorth,
    fireEligibleNetWorth,
    requiredNetWorthInclHome,
    requiredPortfolioExclHome: requiredPortfolio,
  })
  // FIRE-doel op DEZELFDE grondslag als het vrijheids-% (incl. woning tenzij
  // uitgesloten), met fallback op het simpele fireTarget.
  const displayFireGoal = homeExcludedFromFire
    ? requiredPortfolio
    : (requiredNetWorthInclHome ?? requiredPortfolio)

  // ── Herkomst van het getoonde doel (euro-weergave D14) ─────────────────────
  // Alleen een doel dat de KERNEL op de FIRE-maand projecteerde staat in
  // toekomstige euro's en mag dus met de kernel-deflator naar geld van vandaag
  // worden omgerekend. Twee terugvalpaden staan (deels) al in euro's van VANDAAG
  // en mogen dat NIET — ze kunnen bovendien samenvallen met een geslaagde run mét
  // rijen, want `computeHorizonFireTarget` nult beide doelen weg bij `<= 0`:
  //   • het 25×-doel (`core.fireTarget` = huidige jaaruitgaven ÷ SWR) zodra
  //     `fireTargetFromHorizon` null is;
  //   • de scalar-benadering (`inclHomeTargetFromScalar`) zodra
  //     `fireNetWorthTargetFromHorizon` null is én ze het kernel-doel ophoogt met
  //     de overwaarde van VANDAAG.
  // Zonder eigen woning (of bij een volledig meetellende woning) verschuift die
  // scalar níets — `netWorth === fireEligibleNetWorth`, dus het getal ís het
  // kernel-doel zelf. Die gelijkheid is precies wat de derde tak hieronder test,
  // zodat de gewone huis-loze gebruiker zijn omrekening houdt.
  const portfolioUitKernel = coreData.fireTargetFromHorizon != null
  const fireDoelUitKernel =
    displayFireGoal == null
      ? false
      : homeExcludedFromFire
        ? portfolioUitKernel
        : coreData.fireNetWorthTargetFromHorizon != null
          ? true
          : portfolioUitKernel && displayFireGoal === requiredPortfolio

  return {
    hasData: true,
    nettoVermogen: core.netWorth,
    freedomYears: core.freedomYears,
    freedomMonths: core.freedomMonths,
    vrijheidsPct,
    displayFireGoal,
    fireDoel: displayFireGoal ?? core.fireTarget,
    fireDoelUitKernel,
    spaarquotePct: coreData.savingsRate6m,
    swr: effectiveSwr,
    dagtarief: dailyExpenseRate(rawFinancials.monthlyExpenses),
    maandinkomen: rawFinancials.monthlyIncome,
    maanduitgaven: rawFinancials.monthlyExpenses,
  }
}
