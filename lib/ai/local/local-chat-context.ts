// ── Lokale Will-chat: compacte financiële context (fase C1b) ──────────────────
//
// Bouwt een KLEIN, getypeerd overzicht-object met exact de kerncijfers die de
// C1a-proefset gebruikte (gemeten en bewezen: `spikes/litert-lm/c1a-resultaat.md`).
// De server-page (`app/(app)/mijn/lokale-chat/page.tsx`) roept dit aan en geeft
// het object door aan de client; `buildLocalChatSystemPrompt` rendert het in de
// FINANCIEEL OVERZICHT-sectie van de lokale systeemprompt.
//
// CONSUME, DON'T RECOMPUTE (harde regel, CLAUDE.md): élk cijfer komt uit de
// canonieke laag — `loadCoreData` (dezelfde React-cached bron als /overzicht en
// /core) plus de canonieke engines (`computeCoreData`, `computeFreedomProgress`
// via `healthScoreInput.freedomPct`, `dailyExpenseRate`, `emergencyFundMonths`).
// Er wordt NIETS zelf opgeteld of herberekend; de freedom-%- en FIRE-doel-
// grondslag (incl./excl. eigen woning, ADR 0009) spiegelt exact `buildShared-
// Context` en `loadCoreData`, zodat Will lokaal dezelfde getallen ziet als de
// gebruiker in de app. (Toekomstige opruiming: één gedeelde numerieke extractor
// achter zowel deze builder als `buildSharedContext`.)
//
// GEEN CLOUD-GUARDRAILS: dit is het on-device pad. De cijfers zijn het eigen
// financiële beeld van de gebruiker en gaan van de server naar diens éigen
// browser — precies zoals elke /overzicht-pagina. Er is geen egress naar een
// externe AI-provider, dus `sanitizeForAI`/`maskPIIInOutput`/token-logging zijn
// hier N.V.T. (ADR 0043 §5).
//
// JAARRUIMTE — BEWUST BUITEN DE POC-CONTEXT: de C1a-proefset toonde een jaar-
// ruimte-regel, maar dat cijfer zit NIET in `loadCoreData`/`CorePageData`. De
// canonieke waarde komt uit een aparte motor (`lib/jaarruimte.ts` →
// `computeJaarruimte` + `resolvePensionFactorA`) die pensioen-/factor-A-invoer
// vereist die deze context niet laadt. "Consume, don't recompute" verbiedt het
// hier alsnog uit te rekenen; een nieuwe query/engine-call optuigen valt buiten
// de POC-scope. Daarom bevat het overzicht GEEN jaarruimte, en noemt het model
// er — conform de DNA-regel "verzin nooit zelf cijfers" — dus ook geen bedrag
// over. (Vervolgstap wanneer de chat productie wordt: jaarruimte via de
// canonieke motor toevoegen, net als de tax-context-builder dat doet.)

import type { SupabaseClient } from '@supabase/supabase-js'
import { loadCoreData } from '@/lib/core-data-loader'
import { computeCoreData, inclHomeTargetFromScalar, type FinancialInput } from '@/lib/core-metrics'
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
 * Compacte noodbuffer-stand: het liquide potje in maanden dekking (canonieke
 * `emergencyFundMonths` uit de gezondheidsscore-input) + het bijbehorende bedrag.
 */
export interface LocalChatBuffer {
  /** Bedrag in EUR (liquide pot = maanden × maanduitgaven; consistent met `maanden`). */
  bedrag: number
  /** Aantal maanden uitgaven dat de liquide buffer dekt (1 decimaal). */
  maanden: number
}

/**
 * Klein, getypeerd financieel overzicht voor de lokale Will-chat. Mapt 1-op-1 op
 * de FINANCIEEL OVERZICHT-velden uit de C1a-proefset (`c1a-data.json`).
 */
export interface LocalChatOverview {
  /**
   * False wanneer er nog geen financiële data is (geen bezit/schuld/transacties).
   * De prompt toont dan een korte "nog geen data"-regel i.p.v. de cijfers.
   */
  hasData: boolean
  /** Netto vermogen in EUR (bezittingen − schulden). */
  nettoVermogen: number
  /** Vrijgekochte tijd als leesbare string, bv. "2 jaar en 9 maanden". */
  vrijheidstijd: string
  /** FIRE-doel (volledige vrijheid) in EUR, op dezelfde grondslag als het vrijheids-%. */
  fireDoel: number
  /** Vrijheids-% (0–100), canonieke ADR 0009-grondslag. */
  vrijheidsPct: number
  /** Netto maandinkomen in EUR. */
  maandinkomen: number
  /** Maanduitgaven in EUR. */
  maanduitgaven: number
  /** Canonieke 6-maands spaarquote (%). */
  spaarquotePct: number
  /** Dagtarief: uitgaven per dag in EUR (`dailyExpenseRate`). */
  dagtarief: number
  /** Persoonlijk veilig opnamepercentage (SWR) in %. */
  swrPct: number
  /** Noodbuffer-stand, of null wanneer er geen liquide buffer/uitgaven zijn. */
  noodbuffer: LocalChatBuffer | null
}

/** Vrijgekochte-tijd string uit hele jaren + maanden (zelfde vorm als de context-formatter). */
function formatVrijheidstijd(years: number, months: number): string {
  if (years <= 0 && months <= 0) return '0 maanden'
  const parts: string[] = []
  if (years > 0) parts.push(`${years} jaar`)
  if (months > 0) parts.push(`${months} ${months === 1 ? 'maand' : 'maanden'}`)
  return parts.join(' en ')
}

/**
 * Bouw het compacte overzicht voor de lokale chat uit de canonieke bronnen.
 * Leest uitsluitend `loadCoreData` + canonieke engines — geen eigen sommen.
 */
export async function buildLocalChatOverview(supabase: SupabaseClient): Promise<LocalChatOverview> {
  const [coreData, profileResult] = await Promise.all([
    loadCoreData(supabase),
    supabase.from('profiles').select('housing_strategy_config').maybeSingle(),
  ])

  const { rawFinancials, healthScoreInput } = coreData
  const totalAssets = rawFinancials.totalAssets
  const totalDebts = rawFinancials.totalDebts

  // Geen enkele financiële data → minimaal overzicht (de prompt duidt dit).
  if (totalAssets === 0 && totalDebts === 0 && !coreData.hasTransactions) {
    return {
      hasData: false,
      nettoVermogen: 0,
      vrijheidstijd: '0 maanden',
      fireDoel: 0,
      vrijheidsPct: 0,
      maandinkomen: rawFinancials.monthlyIncome,
      maanduitgaven: rawFinancials.monthlyExpenses,
      spaarquotePct: 0,
      dagtarief: 0,
      swrPct: Math.round(coreData.fireParams.effectiveSwr * 1000) / 10,
      noodbuffer: null,
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
  const core = computeCoreData(coreInput, coreData.fireParams.effectiveSwr)

  // FIRE-doel op DEZELFDE grondslag als het vrijheids-% (incl. eigen woning
  // tenzij expliciet uitgesloten) — spiegelt `buildSharedContext`/`loadCoreData`
  // (ADR 0009) zodat teller, noemer en doelbedrag onderling consistent zijn.
  const housingStrategy = parseHousingStrategy(profileResult.data?.housing_strategy_config)
  const housingContext = deriveHousingContext(
    (coreData.fullAssets ?? []) as Asset[],
    (coreData.fullDebts ?? []) as Debt[],
  )
  const fireEligibleNetWorth = getFireEligibleNetWorth(core.netWorth, housingContext, housingStrategy)
  const requiredPortfolio = coreData.fireTargetFromHorizon ?? (core.fireTarget > 0 ? core.fireTarget : null)
  const homeExcludedFromFire = housingContext.hasEigenHuis && isHomeExcludedFromFire(housingStrategy)
  const requiredNetWorthInclHome = inclHomeTargetFromScalar(requiredPortfolio, core.netWorth, fireEligibleNetWorth)
  const displayFireGoal = homeExcludedFromFire
    ? requiredPortfolio
    : (requiredNetWorthInclHome ?? requiredPortfolio)

  // Noodbuffer: maanden = canonieke `emergencyFundMonths`; bedrag = het liquide
  // potje dat daaraan ten grondslag ligt (maanden × maanduitgaven — consistent,
  // geen losse eigen som van een ander begrip).
  const bufferMonths = healthScoreInput.emergencyFundMonths
  const noodbuffer: LocalChatBuffer | null =
    bufferMonths > 0 && rawFinancials.monthlyExpenses > 0
      ? {
          maanden: Math.round(bufferMonths * 10) / 10,
          bedrag: Math.round(bufferMonths * rawFinancials.monthlyExpenses),
        }
      : null

  return {
    hasData: true,
    nettoVermogen: core.netWorth,
    vrijheidstijd: formatVrijheidstijd(core.freedomYears, core.freedomMonths),
    fireDoel: Math.round(displayFireGoal ?? core.fireTarget),
    // Consume de canonieke ADR 0009-freedomPct (dezelfde die /overzicht toont).
    vrijheidsPct: Math.round(healthScoreInput.freedomPct * 10) / 10,
    maandinkomen: rawFinancials.monthlyIncome,
    maanduitgaven: rawFinancials.monthlyExpenses,
    spaarquotePct: coreData.savingsRate6m,
    dagtarief: Math.round(dailyExpenseRate(rawFinancials.monthlyExpenses)),
    swrPct: Math.round(coreData.fireParams.effectiveSwr * 1000) / 10,
    noodbuffer,
  }
}
