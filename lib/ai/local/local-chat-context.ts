// ── Lokale Fin-chat: compacte financiële context (fase C1b) ──────────────────
//
// Bouwt een KLEIN, getypeerd overzicht-object met exact de kerncijfers die de
// C1a-proefset gebruikte (gemeten en bewezen: `spikes/litert-lm/c1a-resultaat.md`).
// De server-page (`app/(app)/mijn/lokale-chat/page.tsx`) roept dit aan en geeft
// het object door aan de client; `buildLocalChatSystemPrompt` rendert het in de
// FINANCIEEL OVERZICHT-sectie van de lokale systeemprompt.
//
// CONSUME, DON'T RECOMPUTE (harde regel, CLAUDE.md): élk cijfer komt uit de
// canonieke laag. De kern-cijfers (netto vermogen, vrijheids-%, FIRE-doel,
// spaarquote, SWR, dagtarief, maandinkomen/-uitgaven) komen sinds C2b uit de
// gedeelde extractor `buildWillFinancialFacts` (`lib/ai/context/will-financial-
// facts.ts`) — DEZELFDE bron die `buildSharedContext` (cloud-Fin) leest, op de
// canonieke MET-terugval ADR 0009-grondslag. Daardoor ziet Fin lokaal exact
// dezelfde getallen als de cloud-Fin én de gebruiker in de app, en delen het
// vrijheids-% en het FIRE-doel één grondslag (vóór C2b las het lokale pad het
// vrijheids-% uit de zonder-terugval loader-variant → 0% in het randgeval,
// terwijl het FIRE-doel al met-terugval was: een interne grondslag-mismatch).
// De noodbuffer (`emergencyFundMonths`) is lokaal-only en blijft hier; er wordt
// NIETS zelf opgeteld of herberekend.
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
import { buildWillFinancialFacts } from '@/lib/ai/context/fin-financial-facts'

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
 * Klein, getypeerd financieel overzicht voor de lokale Fin-chat. Mapt 1-op-1 op
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
  // Gedeelde kern-cijfers (netto vermogen, vrijheids-%, FIRE-doel, spaarquote,
  // SWR, dagtarief, maandbedragen) op de canonieke MET-terugval ADR 0009-
  // grondslag. Dit corrigeert de vroegere lokale afwijking (vrijheids-% uit de
  // zonder-terugval loader-variant → 0% in het randgeval) en trekt vrijheids-%
  // en FIRE-doel op één grondslag.
  const facts = buildWillFinancialFacts(coreData, profileResult.data)

  // Geen enkele financiële data → minimaal overzicht (de prompt duidt dit).
  if (!facts.hasData) {
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
      swrPct: Math.round(facts.swr * 1000) / 10,
      noodbuffer: null,
    }
  }

  // Noodbuffer: maanden = canonieke `emergencyFundMonths`; bedrag = het liquide
  // potje dat daaraan ten grondslag ligt (maanden × maanduitgaven — consistent,
  // geen losse eigen som van een ander begrip). Lokaal-only, niet in FinFacts.
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
    nettoVermogen: facts.nettoVermogen,
    vrijheidstijd: formatVrijheidstijd(facts.freedomYears, facts.freedomMonths),
    fireDoel: Math.round(facts.fireDoel),
    // Consume de canonieke ADR 0009-vrijheids-% (met-terugval; dezelfde bron én
    // grondslag als cloud-Fin en als het FIRE-doel hierboven).
    vrijheidsPct: Math.round(facts.vrijheidsPct * 10) / 10,
    maandinkomen: facts.maandinkomen,
    maanduitgaven: facts.maanduitgaven,
    spaarquotePct: facts.spaarquotePct,
    dagtarief: Math.round(facts.dagtarief),
    swrPct: Math.round(facts.swr * 1000) / 10,
    noodbuffer,
  }
}
