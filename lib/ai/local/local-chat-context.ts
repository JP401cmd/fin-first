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
import { applyActionPriorityOrder } from '@/lib/action-sort'
import { buildWillFinancialFacts } from '@/lib/ai/context/fin-financial-facts'
import { computeJaarruimteFacts } from '@/lib/jaarruimte-facts'
import { collectAandachtspunten } from '@/lib/aandachtspunten-loader'
import { type Aandachtspunt, JAARRUIMTE_AANDACHTSPUNT_ID } from '@/lib/aandachtspunten'
import { loadActionedAandachtspuntIds } from '@/lib/aandachtspunten-actions'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { loadBudgetSummary, type BudgetSummary } from '@/lib/ai/context/budget-summary'
import { loadVasteLastenSummary, type VasteLastenSummary } from '@/lib/vaste-lasten-summary'
import { buildCategorySpending } from '@/lib/spending-patterns'
import { localMonthStartMonthsAgo } from '@/lib/month-range'

/** Belastingjaar voor de jaarruimte-afleiding (gelijk aan de cloud tax-context). */
const TAX_YEAR = 2026 as const
/** Max. aantal kansen/acties in het compacte overzicht — een klein 8k-model niet overladen. */
const MAX_ITEMS = 3
/** Max. uitgavenpatronen (categorieën) — de grootste posten dragen het gesprek. */
const MAX_PATRONEN = 5
/** Historievenster voor de patronen, gelijk aan de cloud spending-patterns-context. */
const PATROON_MAANDEN = 17
/** Minimaal aantal maanden data vóór een gemiddelde iets betekent (cloud-pariteit). */
const MIN_PATROON_MAANDEN = 6

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
  /**
   * Of factor A bekend is (`JaarruimteFacts.factorAKnown`, H23). False → beide
   * bedragen zijn een BOVENGRENS omdat er zonder pensioenaftrek is gerekend;
   * de prompt-renderers zetten er dan `JAARRUIMTE_BOVENGRENS_SUFFIX` achter.
   * Stuurt uitsluitend de weergave, nooit de motor.
   */
  factorAKnown: boolean
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
  /** Budgetten van deze maand (hoofdcategorieën), of null zonder budgetten. */
  budgetten: LocalChatBudgetten | null
  /** Gemiddelde maanduitgave per categorie over 12+ maanden, max 5. Leeg = geen. */
  uitgavenpatronen: LocalChatPatroon[]
  /** Abonnementen + vaste lasten, of null wanneer er niets terugkerends is. */
  terugkerend: LocalChatTerugkerend | null
}

/** Eén hoofdbudget deze maand: besteed t.o.v. limiet. */
export interface LocalChatBudgetCategorie {
  naam: string
  /** Maandlimiet in EUR. */
  limiet: number
  /** Deze maand besteed in EUR. */
  besteed: number
}

/**
 * Budgetten deze maand, bewust op HOOFDCATEGORIE-niveau. De cloud toont ook alle
 * subbudgetten; dat zijn al gauw dertig regels, en die passen niet in een venster
 * dat óók de DNA, de kennisbank, de vraag, het antwoord én de hele
 * gespreksgeschiedenis moet dragen. Wat een gebruiker nodig heeft om verder te
 * praten is het beeld plus de uitschieters — vandaar `overschrijdingen`.
 */
export interface LocalChatBudgetten {
  categorieen: LocalChatBudgetCategorie[]
  /** Subbudgetten die op of over hun limiet zitten, max 3 — de uitschieters. */
  overschrijdingen: { naam: string; besteed: number; limiet: number }[]
}

/** Gemiddelde maanduitgave in één categorie (12+ maanden historie). */
export interface LocalChatPatroon {
  categorie: string
  /** Gemiddeld per maand in EUR. */
  gemiddeldPerMaand: number
}

/** Terugkerende lasten: abonnementen en vaste lasten, met hun maandtotalen. */
export interface LocalChatTerugkerend {
  abonnementenAantal: number
  abonnementenPerMaand: number
  vasteLastenAantal: number
  vasteLastenPerMaand: number
  /** De grootste posten (beide soorten door elkaar), max 3. */
  grootste: { naam: string; perMaand: number }[]
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
      // Canonieke prioriteitsvolgorde (lib/action-sort.ts): priority_score desc,
      // sort_order asc, created_at desc — dezelfde top-N als het actiebord.
      .order('priority_score', { ascending: false })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(MAX_ITEMS)
    return (data ?? []) as OpenActionRow[]
  } catch {
    return []
  }
}

/**
 * Dicht de laatste bekende parity-kloof met de cloud-Fin: budgetten van deze
 * maand. Consumeert `loadBudgetSummary` — DEZELFDE extractor die
 * `buildKernContext` leest — en dunt alleen uit voor het venster: hoofdcategorieën
 * plus de subbudgetten die daadwerkelijk over hun limiet gaan.
 */
function toBudgetten(summary: BudgetSummary): LocalChatBudgetten | null {
  if (!summary.hasBudgets) return null

  const categorieen = summary.parents
    .filter((p) => p.type !== 'income')
    .map((p) => ({ naam: p.name, limiet: Math.round(p.limit), besteed: Math.round(p.spent) }))

  // De uitschieters over álle hoofdcategorieën heen, zwaarste eerst: dát is waar
  // een gesprek over budgetten in de praktijk over gaat.
  const overschrijdingen = summary.parents
    .flatMap((p) => p.children)
    .filter((c) => c.limit > 0 && c.status !== 'OK')
    .sort((a, b) => b.pct - a.pct)
    .slice(0, MAX_ITEMS)
    .map((c) => ({ naam: c.name, besteed: Math.round(c.spent), limiet: Math.round(c.limit) }))

  if (categorieen.length === 0 && overschrijdingen.length === 0) return null
  return { categorieen, overschrijdingen }
}

/**
 * Abonnementen en vaste lasten uit `loadVasteLastenSummary` — exact dezelfde
 * detectie als de Vaste-lasten-pagina, de cashflow-kaart en de cloud-context.
 */
function toTerugkerend(summary: VasteLastenSummary): LocalChatTerugkerend | null {
  if (summary.count === 0) return null
  const grootste = [...summary.subscriptions, ...summary.vasteKosten]
    .sort((a, b) => b.monthlyAmount - a.monthlyAmount)
    .slice(0, MAX_ITEMS)
    .map((i) => ({ naam: i.name, perMaand: Math.round(i.monthlyAmount) }))

  return {
    abonnementenAantal: summary.subscriptions.length,
    abonnementenPerMaand: Math.round(summary.totalMonthlySubscriptions),
    vasteLastenAantal: summary.vasteKosten.length,
    vasteLastenPerMaand: Math.round(summary.totalMonthlyVasteKosten),
    grootste,
  }
}

/**
 * Gemiddelde maanduitgave per categorie over 12+ maanden, via de canonieke
 * `buildCategorySpending` (dezelfde motor als de cloud spending-patterns-context).
 *
 * Faal-zacht en pariteits-bewust: minder dan {@link MIN_PATROON_MAANDEN} maanden
 * data → geen patronen, precies zoals de cloudbuilder. Een gemiddelde over twee
 * maanden is geen patroon maar ruis, en ruis in een 8k-venster is duur.
 */
async function loadUitgavenpatronen(supabase: SupabaseClient): Promise<LocalChatPatroon[]> {
  try {
    const startDate = localMonthStartMonthsAgo(new Date(), PATROON_MAANDEN)
    const [budgetsResult, transactionsResult] = await Promise.all([
      supabase
        .from('budgets')
        .select('id, name, icon, parent_id, budget_type, is_essential, default_limit')
        .order('sort_order', { ascending: true }),
      supabase
        .from('transactions')
        .select('budget_id, amount, date, is_income, transaction_type')
        .gte('date', startDate)
        .not('budget_id', 'is', null),
    ])

    const budgets = budgetsResult.data ?? []
    // GEEN transfer-filter meer op de rijen die de SOM voeden: die woont sinds
    // 30 aug 2026 in `buildCategorySpending` zelf. Hier blijft alleen de
    // data-genoeg-poort, en die telt terecht geen maanden mee waarin er
    // uitsluitend tussen eigen rekeningen geschoven is.
    const transactions = transactionsResult.data ?? []
    if (budgets.length === 0 || transactions.length === 0) return []

    const maanden = new Set(
      transactions
        .filter(
          (t) =>
            (t as { transaction_type?: string | null }).transaction_type !== 'transfer' &&
            (t as { transaction_type?: string | null }).transaction_type !== 'joint_transfer',
        )
        .map((t) => String(t.date).slice(0, 7)),
    )
    if (maanden.size < MIN_PATROON_MAANDEN) return []

    return buildCategorySpending(
      transactions as { budget_id: string; amount: number; date: string; is_income: boolean; transaction_type: string | null }[],
      budgets as { id: string; name: string; icon: string; parent_id: string | null; budget_type: string; is_essential: boolean }[],
    )
      .filter((c) => c.averageMonthly > 0)
      .sort((a, b) => b.averageMonthly - a.averageMonthly)
      .slice(0, MAX_PATRONEN)
      .map((c) => ({ categorie: c.budgetName, gemiddeldPerMaand: Math.round(c.averageMonthly) }))
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
  const [
    coreData,
    profileResult,
    aandachtspunten,
    actieRows,
    actionedIds,
    // ── C2b: de drie bronnen waar de cloud-Fin wél over kon praten en de
    // lokale niet. Alle drie via een GEDEELDE loader, geen tweede optelling:
    // budgetten via dezelfde extractor als buildKernContext, terugkerende
    // lasten via dezelfde detectie als de Vaste-lasten-pagina, patronen via
    // dezelfde motor als de cloud spending-patterns-context.
    budgetSummary,
    vasteLasten,
    uitgavenpatronen,
  ] = await Promise.all([
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
    // Alle drie falen zacht (interne try/catch → lege waarde), zodat één
    // haperende sectie het overzicht nooit sloopt.
    loadBudgetSummary(supabase),
    loadVasteLastenSummary(supabase).catch(() => null),
    loadUitgavenpatronen(supabase),
  ])

  const { rawFinancials, healthScoreInput } = coreData
  const facts = buildWillFinancialFacts(coreData, profileResult.data)

  // ── Jaarruimte (zelfde canonieke motoren als de cloud tax-context) ──────────
  // Consume `computeJaarruimteFacts` (net→bruto + computeJaarruimte + besparing).
  // NB: in de no-data-tak (geen bezit/schuld/transacties) laten we jaarruimte
  // hieronder BEWUST weg om de "nog geen data"-boodschap niet tegen te spreken;
  // dáár wijkt het af van de cloud tax-context (die jaarruimte ook income-only toont).
  // Het PROFIEL gaat mee, niet een losgetrokken `factorA`-getal: zo reist de
  // "factor A onbekend"-kwalificatie (H23) mee tot in de prompttekst.
  const jf = computeJaarruimteFacts(
    Number(profileResult.data?.net_monthly_income ?? 0),
    profileResult.data,
    TAX_YEAR,
  )
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
          factorAKnown: jf.factorAKnown,
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
      budgetten: null,
      uitgavenpatronen: [],
      terugkerend: null,
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
    budgetten: toBudgetten(budgetSummary),
    uitgavenpatronen,
    terugkerend: vasteLasten ? toTerugkerend(vasteLasten) : null,
  }
}
