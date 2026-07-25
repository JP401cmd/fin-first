// ── Lokale Fin-chat: compacte financiële context (fase C1b + verrijking) ──────
//
// Bouwt een KLEIN, getypeerd overzicht-object met de kerncijfers plus de drie
// "concrete-tip"-bronnen die de cloud-Fin ook krijgt: jaarruimte, aandachts-
// punten (kansen) en openstaande acties. De server-page
// (`app/(app)/mijn/lokale-chat/page.tsx`) en `/api/local-chat-overview` roepen
// dit aan; `buildLocalChatSystemPrompt` rendert het in de FINANCIEEL OVERZICHT-
// sectie van de lokale systeemprompt.
//
// CONSUME, DON'T RECOMPUTE (harde regel, CLAUDE.md): élk cijfer komt uit de
// canonieke laag. De kern-cijfers (netto vermogen, vrijheids-%, FIRE-doel,
// spaarquote, SWR, dagtarief, maandinkomen/-uitgaven) komen sinds C2b uit de
// gedeelde extractor `buildWillFinancialFacts` (`lib/ai/context/fin-financial-
// facts.ts`) — DEZELFDE bron die `buildSharedContext` (cloud-Fin) leest, op de
// canonieke MET-terugval ADR 0009-grondslag. De noodbuffer (`emergencyFund-
// Months`) is lokaal-only en blijft hier; er wordt NIETS zelf opgeteld.
//
// VERRIJKING (waarom de lokale chat vóór dit generieke tips gaf): het lokale
// model kreeg alléén ~10 aggregaat-cijfers en géén jaarruimte/kansen/acties, dus
// het viel terug op standaardadvies. We voegen nu — parity-van-bedoeling met de
// cloud, alles-in-context (geen tools lokaal) — drie bronnen toe, elk uit de
// canonieke motor:
//   • JAARRUIMTE via `computeJaarruimteFacts` (`lib/jaarruimte-facts.ts` → net→
//     bruto + `computeJaarruimte` + `jaarruimteBesparing`), IDENTIEK aan wat de
//     tax-context-builder de cloud-Fin voedt. Dit dicht het gedocumenteerde gat
//     ("jaarruimte bewust buiten de POC-context") nu de chat productie wordt.
//   • KANSEN via `collectAandachtspunten` (dezelfde bus als /overzicht en de
//     cloud-aandachtspunten-context; al gesorteerd op besparing en al ontdaan
//     van reeds-geactioneerde punten). Cap 3; de jaarruimte-kans filteren we eruit
//     omdat die al als eigen blok staat.
//   • OPENSTAANDE ACTIES via de `actions`-tabel (own-row RLS), zodat Fin "je hebt
//     dit al als actie staan" kan zeggen — spiegelt wil-context's OPENSTAANDE
//     ACTIES. Cap 3.
//
// GEEN CLOUD-GUARDRAILS: dit is het on-device pad. De cijfers zijn het eigen
// financiële beeld van de gebruiker en gaan van de server naar diens éigen
// browser — precies zoals elke /overzicht-pagina. Er is geen egress naar een
// externe AI-provider, dus `sanitizeForAI`/`maskPIIInOutput`/token-logging zijn
// hier N.V.T. (ADR 0043 §5).

import type { SupabaseClient } from '@supabase/supabase-js'
import { loadCoreData } from '@/lib/core-data-loader'
import { buildWillFinancialFacts } from '@/lib/ai/context/fin-financial-facts'
import { computeJaarruimteFacts } from '@/lib/jaarruimte-facts'
import { resolvePensionFactorA } from '@/lib/jaarruimte'
import { collectAandachtspunten } from '@/lib/aandachtspunten-loader'
import { type Aandachtspunt, JAARRUIMTE_AANDACHTSPUNT_ID } from '@/lib/aandachtspunten'
import { loadActionedAandachtspuntIds } from '@/lib/aandachtspunten-actions'
import { getCachedUser } from '@/lib/supabase/cached-user'

/** Belastingjaar voor de jaarruimte-afleiding (gelijk aan de cloud tax-context). */
const TAX_YEAR = 2026 as const
/** Max. aantal kansen/acties in het compacte overzicht — een klein 8k-model niet overladen. */
const MAX_ITEMS = 3

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

/** Jaarruimte-lever: onbenutte pensioen-aftrekruimte + geschatte belastingbesparing. */
export interface LocalChatJaarruimte {
  /** Onbenutte aftrekruimte in EUR. */
  onbenut: number
  /** Geschatte Box 1-belastingbesparing bij volledige benutting (EUR). */
  besparing: number
  /** Besparing omgerekend naar vrijheidsdagen (besparing ÷ dagtarief). */
  vrijheidsdagen: number
}

/** Eén concrete kans (aandachtspunt) uit de canonieke aandachtspunten-bus. */
export interface LocalChatKans {
  /** Korte titel, bv. "Bespaar op boodschappen". */
  titel: string
  /** Geschatte besparing in EUR/jaar (0 = onbekend). */
  besparingPerJaar: number
  /**
   * Expliciete maandelijkse euro-impact uit de canonieke bron (bv. de NIBUD-
   * maandoverschrijding), indien gezet. Wordt door `resolveFinActionIntent`
   * geprefereerd boven JAAR÷12 — spiegelt `aandachtspuntToActionPayload`, zodat
   * dezelfde actie op /overzicht en in de lokale chat hetzelfde €/mnd toont.
   */
  euroImpactMonthly?: number
  /** Vrijheidsdagen-equivalent van de jaarbesparing. */
  vrijheidsdagen: number
  /** Vrije-tekst deadline of ISO-datum, indien bekend. */
  deadline?: string
}

/** Eén openstaande actie van de gebruiker (own-row). */
export interface LocalChatActie {
  /** Actietitel. */
  titel: string
  /** Vrijheidsdagen-impact van de actie. */
  vrijheidsdagen: number
  /** Status: 'open' | 'postponed'. */
  status: string
}

/**
 * Klein, getypeerd financieel overzicht voor de lokale Fin-chat. De kern-velden
 * mappen 1-op-1 op de C1a-proefset; de drie verrijkings-velden (jaarruimte,
 * kansen, openstaandeActies) voeden de "geef één concrete tip"-vragen.
 */
export interface LocalChatOverview {
  /**
   * False wanneer er nog geen financiële data is (geen bezit/schuld/transacties).
   * De prompt toont dan een korte "nog geen data"-regel i.p.v. de kern-cijfers.
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
  /** Jaarruimte-lever, of null bij geen/onvoldoende inkomen of ruimte 0. */
  jaarruimte: LocalChatJaarruimte | null
  /** Top concrete kansen (aandachtspunten), max 3. Leeg = geen. */
  kansen: LocalChatKans[]
  /** Openstaande acties van de gebruiker, max 3. Leeg = geen. */
  openstaandeActies: LocalChatActie[]
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
 * Herkent de jaarruimte-kans, zodat die niet dubbel (eigen blok + kans) verschijnt.
 * Matcht op de STABIELE namespaced id (`tax:jaarruimte`, `lib/aandachtspunten.ts`),
 * niet op de titel — die titel is prompt-dna-copy en kan hernoemd worden.
 */
function isJaarruimteAandachtspunt(a: Aandachtspunt): boolean {
  return a.id === JAARRUIMTE_AANDACHTSPUNT_ID
}

/** Rij-vorm van de openstaande-acties-query (own-row). */
interface OpenActionRow {
  title: string
  freedom_days_impact: number | null
  status: string
}

/**
 * Openstaande acties (own-row RLS, prioriteit desc, cap MAX_ITEMS) — spiegelt de
 * OPENSTAANDE ACTIES-sectie van wil-context. Faal-zacht: bij welke query-/client-
 * fout dan ook → lege lijst, zodat het overzicht nooit sneuvelt op een falende
 * acties-lees (net als de faal-zachte aandachtspunten-bus).
 */
async function loadOpenActions(supabase: SupabaseClient): Promise<OpenActionRow[]> {
  try {
    // RLS is de canonieke own-row-waarborg; het expliciete `user_id`-filter is
    // defense-in-depth — gelijk aan het zusterpatroon in aandachtspunten-loader,
    // robuust tegen een toekomstige RLS-regressie.
    const user = await getCachedUser(supabase)
    if (!user) return []
    const { data } = await supabase
      .from('actions')
      .select('title, freedom_days_impact, status')
      .eq('user_id', user.id)
      .in('status', ['open', 'postponed'])
      .order('priority_score', { ascending: false })
      .limit(MAX_ITEMS)
    return (data ?? []) as OpenActionRow[]
  } catch {
    return []
  }
}

/**
 * Bouw het compacte overzicht voor de lokale chat uit de canonieke bronnen.
 * Leest uitsluitend `loadCoreData` + canonieke engines — geen eigen sommen.
 */
export async function buildLocalChatOverview(supabase: SupabaseClient): Promise<LocalChatOverview> {
  // Alles parallel voor de latentie. De verrijkings-fan-out (aandachtspunten/acties)
  // draait óók in de zeldzame no-data-tak, waar we 'm daarna weggooien — bewust
  // geruild tegen de parallelliteit; het overzicht wordt per chat-open één keer gebouwd.
  const [coreData, profileResult, aandachtspunten, actieRows, actionedIds] = await Promise.all([
    loadCoreData(supabase),
    supabase
      .from('profiles')
      .select('housing_strategy_config, net_monthly_income, pension_factor_a, pension_factor_a_source')
      .maybeSingle(),
    // `collectAandachtspunten` faalt intern zacht (per producent → []); de extra
    // `.catch` is puur defensief zodat één onverwachte fout het overzicht niet sloopt.
    collectAandachtspunten(supabase).catch(() => [] as Aandachtspunt[]),
    // OPENSTAANDE ACTIES — faal-zacht (zie `loadOpenActions`).
    loadOpenActions(supabase),
    // Geactioneerde aandachtspunt-ids (faal-zacht → lege set) — voor de
    // jaarruimte-suppressie hieronder. Dezelfde bron als de bus en de cloud
    // tax-context, zodat "benut je jaarruimte" op élk oppervlak verdwijnt zodra
    // de gebruiker de actie nam.
    loadActionedAandachtspuntIds(supabase),
  ])

  const { rawFinancials, healthScoreInput } = coreData
  const facts = buildWillFinancialFacts(coreData, profileResult.data)

  // ── Jaarruimte (zelfde canonieke motoren als de cloud tax-context) ──────────
  // Consume `computeJaarruimteFacts` (net→bruto + computeJaarruimte + besparing).
  // NB: in de no-data-tak (geen bezit/schuld/transacties) laten we jaarruimte
  // hieronder BEWUST weg om de "nog geen data"-boodschap niet tegen te spreken;
  // dáár wijkt het af van de cloud tax-context (die jaarruimte ook income-only toont).
  const factorA = resolvePensionFactorA({
    pension_factor_a: profileResult.data?.pension_factor_a,
    pension_factor_a_source: profileResult.data?.pension_factor_a_source,
  }).factorA
  const jf = computeJaarruimteFacts(Number(profileResult.data?.net_monthly_income ?? 0), factorA, TAX_YEAR)
  // ONDERDRUKKING: heeft de gebruiker de jaarruimte-kans al als actie (open of
  // recent afgerond ≤9 mnd), laat het blok dan weg — anders blijft de lokale Fin
  // "benut je jaarruimte" tippen terwijl de actie al genomen is. Faal-open: bij
  // een lege set (geen actie of query-fout) blijft het blok, gelijk aan de bus.
  const jaarruimteActioned = actionedIds.has(JAARRUIMTE_AANDACHTSPUNT_ID)
  const jaarruimte: LocalChatJaarruimte | null =
    jf.hasData && !jaarruimteActioned
      ? {
          onbenut: jf.onbenut,
          besparing: jf.besparing,
          // Vrijheidsdagen via het canonieke dagtarief (uitgaven per dag); 0 bij geen uitgaven.
          vrijheidsdagen: facts.dagtarief > 0 ? Math.round(jf.besparing / facts.dagtarief) : 0,
        }
      : null

  // ── Kansen (aandachtspunten) ────────────────────────────────────────────────
  // Al gesorteerd op besparing en al ontdaan van geactioneerde punten. De
  // jaarruimte-kans filteren we eruit (staat al als eigen blok). Cap 3.
  const kansen: LocalChatKans[] = aandachtspunten
    .filter((a) => !isJaarruimteAandachtspunt(a))
    .slice(0, MAX_ITEMS)
    .map((a) => ({
      titel: a.title,
      besparingPerJaar: Math.round(a.savings),
      vrijheidsdagen: Math.round(a.freedomDays),
      // Expliciete maand-euro canoniek doorgeven wanneer de bron 'm draagt (bv.
      // NIBUD-budgetoverschrijding); de resolver prefereert 'm boven JAAR÷12.
      ...(a.euroImpactMonthly != null ? { euroImpactMonthly: a.euroImpactMonthly } : {}),
      ...(a.deadline ? { deadline: a.deadline } : {}),
    }))

  // ── Openstaande acties ──────────────────────────────────────────────────────
  const openstaandeActies: LocalChatActie[] = actieRows.map((a) => ({
    titel: a.title,
    vrijheidsdagen: Math.round(a.freedom_days_impact ?? 0),
    status: a.status,
  }))

  // Geen enkele kern-financiële data → minimaal overzicht (de prompt duidt dit).
  // De verrijkings-blokken laten we hier bewust weg: zonder kern-cijfers past het
  // niet bij de "nog geen data"-boodschap, en de gebruiker is nog niet ingericht.
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
      jaarruimte: null,
      kansen: [],
      openstaandeActies: [],
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
    jaarruimte,
    kansen,
    openstaandeActies,
  }
}
