// ── Accountstatus — één bron voor "wat staat er al in dit account?" ─────────
//
// AANLEIDING (kaart M1). Dezelfde ja/nee-vragen — heeft deze gebruiker al een
// bank, budgetten, doelen, levensgebeurtenissen? — stonden VIER keer los in de
// app, met onderling afwijkende definities:
//
//   · `app/(app)/layout.tsx`      → CoachDataGaps (live, coach-bubble)
//   · `app/api/next-steps`        → eigen telling (nul consumenten)
//   · `lib/next-steps/engine.ts`  → live, consume-don't-recompute
//
// "Bank gekoppeld" had daarmee drie definities, "doelen" telde in de layout
// ACTIES in plaats van doelen, en "levensgebeurtenissen" telde in de ene bron
// de afgeleide `aow` mee en in de andere niet. Elke nieuwe consument (de
// welkomstgids, de coach-suggesties) zou een vijfde definitie zijn.
//
// Deze module is die ene bron. Twee lagen, bewust gesplitst op KOSTEN:
//
//   · `loadAccountStatusCore` — precies de signalen die de shell-layout op
//     ÉLKE route al ophaalde. Netto nul extra queries.
//   · `loadAccountStatus`     — core + de drie signalen die alleen de gids
//     nodig heeft (doelen, bankkoppeling, bezochte functies). Alleen /overzicht
//     en de gids-route betalen die drie kleine queries.
//
// HARDE EIGENSCHAPPEN
//   1. EIGEN-ACCOUNT-GESCOPED, geen perspectief. Een compleetheids-checklist
//      gaat over jouw account: zonder deze scoping vinkt de gids "bezittingen
//      geregistreerd" af omdat je PARTNER ze heeft. De gedeelde fetchers uit
//      `lib/server-data/base.ts` leveren RLS-breed (eigen + huishoud-gedeeld);
//      hier filteren we op `user_id` na. De RLS-brede varianten blijven apart
//      beschikbaar onder `rlsScoped` — uitsluitend voor de coach-pariteit.
//   2. `cache()`-GEWRAPT. Layout en pagina delen binnen één request dezelfde
//      query-set; de zware `loadDashboardData` blijft daarmee buiten blok 1 van
//      /overzicht (de streaming-opzet mag niet sneuvelen).
//   3. CONSUME, DON'T RECOMPUTE. Hier staat geen rekenlogica en geen
//      kerngetal — alleen bestaansvragen. De bedragen wonen in de bundel.
//   4. ELKE DEFINITIE EXPLICIET. Waar meerdere lezingen bestonden, staat de
//      gekozen lezing hieronder mét reden. Kies je hier de verkeerde, dan vinkt
//      de gids stappen af die niet gedaan zijn.

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getActiveAssets, getActiveDebts, getOwnProfile } from '@/lib/server-data/base'
import { GUIDE_VISIT_SLUGS, type GuideAccountFacts } from '@/lib/welcome-guide'
import type { CoachDataGaps } from '@/lib/coach-suggestions'

/**
 * Bezoek-marker die de /toekomst-setup wegschrijft. Canoniek gedefinieerd als
 * `HORIZON_SETUP_COMPLETED_SLUG` in de horizon-loader; hier bewust
 * als losse constante herhaald i.p.v. geïmporteerd, zodat deze lichte helper
 * (die in de shell-layout op élke route draait) de horizon-kernel niet in zijn
 * importgraaf trekt. Zelfde afweging als `APP_SETUP_SLUGS` in
 * `lib/app-setup-status.ts`.
 */
const HORIZON_SETUP_SLUG = 'horizon_setup_completed'

/** Default van `profiles.retirement_expense_method` (NOT NULL in de DB). */
const RETIREMENT_EXPENSE_DEFAULT = 'essential_budgets'

// ── Types ───────────────────────────────────────────────────────────────────

/** RLS-brede (eigen + huishoud-gedeelde) varianten. Zie `rlsScoped` hieronder. */
export interface AccountStatusRlsScoped {
  hasAssets: boolean
  hasCashAsset: boolean
  hasDebts: boolean
}

export interface AccountStatusCore {
  /** Minstens één actieve bezitting op de eigen naam. */
  hasAssets: boolean
  /** Minstens één actieve bezitting van het type `cash` (de coach-lezing van "bank"). */
  hasCashAsset: boolean
  /** Minstens één actieve schuld op de eigen naam. */
  hasDebts: boolean
  /** Minstens één TOP-LEVEL budget (`parent_id is null`) — sub-budgetten tellen niet. */
  hasBudgets: boolean
  /** Minstens één transactie (bestaansvraag, geen telling). */
  hasTransactions: boolean
  hasHoldings: boolean
  hasHoldingsWithIsin: boolean
  /**
   * `expected_return` of `inflation_rate` gevuld. LET OP: beide kolommen hebben
   * een DB-default (0.07 / 0.02), dus dit is bijna altijd waar. Bestaand
   * coach-signaal; ongeschikt als "heeft de gebruiker iets gekozen".
   */
  hasFireParams: boolean
  /** Minstens één actieve levensgebeurtenis, EXCLUSIEF de afgeleide `aow`. */
  hasLifeEvents: boolean
  /**
   * ALLEEN voor pariteit met de bestaande coach-data-gaps, die op de RLS-brede
   * rijen rekenen. Nooit gebruiken voor een compleetheids-oordeel: een gedeelde
   * bezitting van je partner zegt niets over de volledigheid van jouw invoer.
   */
  rlsScoped: AccountStatusRlsScoped
}

export interface AccountStatus extends AccountStatusCore, GuideAccountFacts {
  /** Minstens één actieve bankkoppeling (`bank_connections.status = 'active'`). */
  hasBankConnection: boolean
  /** Minstens één niet-voltooid doel in `goals` — nadrukkelijk NIET open acties. */
  hasGoals: boolean
  /** De /toekomst-setup is afgerond (bezoek-marker). */
  hasHorizonSetup: boolean
  /** Uitgave-na-pensioen bewust gekozen (waarde wijkt af van de DB-default). */
  hasRetirementExpenseChoice: boolean
  /** `profiles.toekomst_scenario_prefs` gevuld (grafiek-instellingen bewaard). */
  hasScenarioPrefs: boolean
  /** Bezochte feature-slugs uit `user_feature_visits` (alleen de gids-slugs + setup). */
  visitedSlugs: readonly string[]
}

// ── Core (nul extra queries t.o.v. de bestaande shell-layout) ───────────────

/**
 * De signalen die de shell-layout op élke route al ophaalde. `getActiveAssets`/
 * `getActiveDebts`/`getOwnProfile` zijn `cache()`-gewrapt en draaien daar toch
 * al; de vier queries hieronder zijn letterlijk de queries die uit `layout.tsx`
 * hierheen zijn verhuisd.
 */
export const loadAccountStatusCore = cache(
  async (supabase: SupabaseClient, userId: string): Promise<AccountStatusCore> => {
    const [assetsRes, debtsRes, profileRes, budgetsRes, txRes, holdingsRes, lifeEventsRes] =
      await Promise.all([
        getActiveAssets(supabase),
        getActiveDebts(supabase),
        getOwnProfile(supabase),
        // Alleen top-level budgetten: sub-budgetten zijn een indeling, geen plan.
        // Head-only + count: geen rijen over de lijn.
        supabase
          .from('budgets')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .is('parent_id', null),
        // BESTAANSVRAAG, geen telling. De `.order('date')` is een planner-anker
        // (zie de toelichting bij de oorspronkelijke query in layout.tsx): zonder
        // sortering kiest de planner soms een Seq Scan met een pathologische
        // worst case.
        supabase
          .from('transactions')
          .select('id')
          .eq('user_id', userId)
          .order('date', { ascending: false })
          .limit(1),
        supabase
          .from('investment_holdings')
          .select('id, isin')
          .eq('user_id', userId)
          .eq('is_active', true),
        supabase
          .from('life_events')
          .select('id, event_type')
          .eq('user_id', userId)
          .eq('is_active', true),
      ])

    const allAssets = (assetsRes.data ?? []) as Array<{
      user_id?: string | null
      asset_type?: string | null
    }>
    const allDebts = (debtsRes.data ?? []) as Array<{ user_id?: string | null }>
    const ownAssets = allAssets.filter((a) => a.user_id === userId)
    const ownDebts = allDebts.filter((d) => d.user_id === userId)

    const holdings = (holdingsRes.data ?? []) as Array<{ isin?: string | null }>
    // 'aow' is een door de app afgeleide systeemgebeurtenis: die telt niet als
    // "de gebruiker heeft levensgebeurtenissen ingevuld".
    const lifeEvents = (lifeEventsRes.data ?? []).filter((e) => e.event_type !== 'aow')

    const profile = profileRes.data as {
      expected_return?: number | null
      inflation_rate?: number | null
    } | null

    return {
      hasAssets: ownAssets.length > 0,
      hasCashAsset: ownAssets.some((a) => a.asset_type === 'cash'),
      hasDebts: ownDebts.length > 0,
      hasBudgets: (budgetsRes.count ?? 0) > 0,
      hasTransactions: (txRes.data?.length ?? 0) > 0,
      hasHoldings: holdings.length > 0,
      hasHoldingsWithIsin: holdings.some((h) => h.isin !== null && h.isin !== ''),
      hasFireParams: profile?.expected_return != null || profile?.inflation_rate != null,
      hasLifeEvents: lifeEvents.length > 0,
      rlsScoped: {
        hasAssets: allAssets.length > 0,
        hasCashAsset: allAssets.some((a) => a.asset_type === 'cash'),
        hasDebts: allDebts.length > 0,
      },
    }
  },
)

// ── Volledig (core + drie kleine queries, alleen waar de gids draait) ───────

export const loadAccountStatus = cache(
  async (supabase: SupabaseClient, userId: string): Promise<AccountStatus> => {
    const [core, profileRes, goalsRes, bankRes, visitsRes] = await Promise.all([
      loadAccountStatusCore(supabase, userId),
      getOwnProfile(supabase),
      // DOELEN = de `goals`-tabel. De coach-gap `hasGoals` leest `actions` — een
      // latente mislabel die hier bewust NIET wordt overgenomen.
      supabase
        .from('goals')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_completed', false),
      supabase
        .from('bank_connections')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .limit(1),
      supabase
        .from('user_feature_visits')
        .select('feature_slug')
        .eq('user_id', userId)
        .in('feature_slug', [...GUIDE_VISIT_SLUGS, HORIZON_SETUP_SLUG]),
    ])

    const profile = profileRes.data as {
      retirement_expense_method?: string | null
      toekomst_scenario_prefs?: unknown
    } | null

    // Ontbrekende tabel/kolom (legacy-DB) → lege lijst i.p.v. een harde fout:
    // de gids valt dan terug op handmatig afvinken.
    const visitedSlugs = (visitsRes.data ?? []).map((r) => r.feature_slug as string)

    return {
      ...core,
      hasBankConnection: (bankRes.data?.length ?? 0) > 0,
      hasGoals: (goalsRes.count ?? 0) > 0,
      hasHorizonSetup: visitedSlugs.includes(HORIZON_SETUP_SLUG),
      // `retirement_expense_method` is NOT NULL met default 'essential_budgets':
      // "gevuld" zegt dus niets. Alleen een afwijkende waarde bewijst een keuze.
      // Bewuste onderschatting: wie doelbewust de default kiest, vinkt handmatig af.
      hasRetirementExpenseChoice:
        (profile?.retirement_expense_method ?? RETIREMENT_EXPENSE_DEFAULT) !==
        RETIREMENT_EXPENSE_DEFAULT,
      hasScenarioPrefs: profile?.toekomst_scenario_prefs != null,
      visitedSlugs,
      // Nog geen live producent: de module-toggle is uit TriFinity verwijderd
      // (alle modules zijn altijd actief) en geen enkele gidsstap zit achter een
      // route-poort. Het VELD blijft eerstelijns onderdeel van het contract —
      // de drie-toestanden-telling en de weergave hangen eraan — zodat een
      // toekomstige poort (tier/module) alleen hier een producent hoeft te
      // krijgen, zonder de telling of de UI te raken.
      notApplicableStepIds: [],
    }
  },
)

// ── Coach-data-gaps uit dezelfde bron ───────────────────────────────────────

/**
 * Vertaal de accountstatus naar de bestaande `CoachDataGaps`-vorm.
 *
 * PARITEIT IS HIER DE EIS, geen schoonheid: deze functie reproduceert de
 * inline-berekening die in `app/(app)/layout.tsx` stond, inclusief twee
 * eigenaardigheden die bewust NIET zijn meegemigreerd naar de gids:
 *   · `hasBank` leest cash-BEZITTINGEN, niet `bank_connections`;
 *   · `hasGoals` leest OPEN ACTIES, niet `goals` (daarom een parameter — de
 *     status kent dat getal niet en moet het ook niet kennen).
 * En de drie rlsScoped-velden, omdat de coach altijd al op de RLS-brede rijen
 * rekende. Wie deze definities wil rechttrekken doet dat als eigen wijziging
 * mét eigen bewijs — niet als bijvangst van een ontdubbeling.
 *
 * `modules` gate-t identiek aan voorheen: staat een module uit, dan is het
 * signaal `true` zodat de bijbehorende gap niet vuurt.
 */
export function toCoachDataGaps(
  core: AccountStatusCore,
  input: {
    /** Openstaande/uitgestelde acties > 0 (de bestaande `hasGoals`-lezing). */
    hasOpenActions: boolean
    hasTransactionsModule: boolean
    hasHoldingsModule: boolean
    hasFireModule: boolean
  },
): CoachDataGaps {
  return {
    hasBank: core.rlsScoped.hasCashAsset,
    hasAssets: core.rlsScoped.hasAssets,
    hasBudgets: core.hasBudgets,
    hasGoals: input.hasOpenActions,
    hasDebts: core.rlsScoped.hasDebts,
    hasTransactions: input.hasTransactionsModule ? core.hasTransactions : true,
    hasHoldings: input.hasHoldingsModule ? core.hasHoldings : true,
    hasHoldingsWithIsin: input.hasHoldingsModule ? core.hasHoldingsWithIsin : true,
    hasFireParams: input.hasFireModule ? core.hasFireParams : true,
    hasLifeEvents: input.hasFireModule ? core.hasLifeEvents : true,
  }
}
