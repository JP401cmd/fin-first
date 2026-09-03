// ── Lokale aanbevelingen ("Golden Nuggets"): KANDIDATEN, deterministisch ─────
//
// Dit bestand is de kern van het herontwerp waarmee de tips on-device kunnen
// draaien. De cloudroute (`app/api/ai/recommendations/route.ts`) vraagt het model
// drie dingen tegelijk: redeneren over het volledige profiel, RÉKENEN
// (vrijheidsdagen, compound groei, NIBUD-delta's) en een genest schema vullen dat
// `generateObject` + zod afdwingen. Voor een 2B-model op het toestel is dat alle
// drie onhaalbaar: rekenen mag het niet (huisregel "consume, don't recompute"),
// het schema is niet afdwingbaar (de LiteRT-web-SDK kent geen constrained
// decoding) en de context van `buildRecommendationContext` (2.500-4.000 tokens)
// plus prompt en uitvoer loopt tegen het 8.192-tokenvenster aan.
//
// DE OMKERING: niet het model kiest de kans en rekent 'm door — TypeScript doet
// dat hier, server-side, uit precies de motoren die de lokale chat al consumeert.
// Het model krijgt daarna per kandidaat één kort blok en levert UITSLUITEND TAAL
// (titel, toelichting, actietitels). Elke euro en elke vrijheidsdag in de
// uiteindelijke aanbeveling komt uit dit bestand.
//
// BRONNEN (alle canoniek, geen eigen sommen):
//   • `collectAandachtspunten` (lib/aandachtspunten-loader.ts) — de gedeelde bus
//     achter /overzicht en de cloud-aandachtspunten-context. Dekt tax (incl. de
//     NIBUD-budgetoverschrijdingen via `calculateBenchmarks`), debt en asset, is
//     al gesorteerd op besparing en al ontdaan van reeds-geactioneerde punten.
//   • `computeJaarruimteFacts` (lib/jaarruimte-facts.ts) — de fiscale lever,
//     identiek aan wat de cloud tax-context en de lokale chat gebruiken.
//   • `loadVasteLastenSummary` (lib/vaste-lasten-summary.ts) — de canonieke
//     wrapper om `detectRecurringTransactions`; levert abonnementen met hun
//     genormaliseerde maandbedrag.
//   • `buildWillFinancialFacts` — voor het canonieke dagtarief (€ → vrijheidsdagen).
//
// GEEN CLOUD-GUARDRAILS: dit is het on-device pad. De cijfers gaan van de server
// naar de éigen browser van de gebruiker, precies zoals elke /overzicht-pagina.
// Er is geen egress naar een externe AI-provider, dus `sanitizeForAI` /
// `maskPIIInOutput` / token-logging zijn hier N.V.T. (ADR 0043 §5).

import type { SupabaseClient } from '@supabase/supabase-js'
import { loadCoreData } from '@/lib/core-data-loader'
import { buildWillFinancialFacts } from '@/lib/ai/context/fin-financial-facts'
import { computeJaarruimteFacts, JAARRUIMTE_BOVENGRENS_SUFFIX } from '@/lib/jaarruimte-facts'
import { collectAandachtspunten } from '@/lib/aandachtspunten-loader'
import { type Aandachtspunt, JAARRUIMTE_AANDACHTSPUNT_ID } from '@/lib/aandachtspunten'
import { loadVasteLastenSummary } from '@/lib/vaste-lasten-summary'
import { getCachedUser } from '@/lib/supabase/cached-user'
import type { RecommendationType } from '@/lib/recommendation-data'

/** Belastingjaar voor de jaarruimte-afleiding (gelijk aan de cloud tax-context). */
const TAX_YEAR = 2026 as const

/**
 * Max. aantal kandidaten dat het toestel aangeboden krijgt — DRIE, gelijk aan wat
 * het cloudpad per ronde genereert ("genereer 3 optimalisatietips").
 *
 * Elke kandidaat is één losse, korte generate-call (~1.000 tokens). Bij ~9-12
 * tok/s kost een ronde daarmee ~60-75 s; de UI toont de tips één voor één, dus de
 * gebruiker wacht nooit op het geheel. Hoger zetten kost lineair meer wachttijd
 * én meer her-afleidingen van deze lijst (elke opslag-POST bouwt 'm opnieuw op).
 */
export const MAX_TIP_CANDIDATES = 3

/**
 * Minimale jaarbesparing voordat een abonnement als kans wordt opgevoerd. Onder
 * deze grens is de tip meer ruis dan winst (en verdringt hij een échte kans uit
 * de top-5).
 */
const MIN_ABONNEMENT_JAARBESPARING = 60

/**
 * Terugkijkvenster voor de dedupe op afgeronde aanbevelingen. Een tip die de
 * gebruiker recent heeft afgewezen of die is verlopen bieden we niet meteen
 * opnieuw aan; ná dit venster mag hij weer meedoen (situaties veranderen).
 */
const DEDUPE_CLOSED_DAYS = 90

/** Waar een kandidaat vandaan komt. Bepaalt deterministisch het `recommendation_type`. */
export type LocalTipSource = 'budget' | 'debt' | 'asset' | 'tax' | 'jaarruimte' | 'abonnement'

/**
 * Eén doorgerekende kans. Alles behalve de uiteindelijke formulering staat hier
 * al vast — het model voegt straks alleen taal toe.
 */
export interface LocalTipCandidate {
  /**
   * Stabiele identiteit van de kans over generaties heen. Voor aandachtspunten is
   * dat de namespaced bus-id (`budget:boodschappen`, `debt:<uuid>`), voor de
   * fiscale lever `tax:jaarruimte` en voor een abonnement `abonnement:<key>`.
   * Deze id is óók de dedupe- en idempotentiesleutel bij het opslaan.
   */
  id: string
  bron: LocalTipSource
  /** Canonieke titel uit de bron — vangnet wanneer het model geen titel levert. */
  titel: string
  /** Canonieke onderbouwing in één zin, of null wanneer de bron er geen draagt. */
  toelichting: string | null
  /** Besparing in EUR/jaar (canoniek, afgerond). */
  besparingPerJaar: number
  /** Maandelijkse euro-impact wanneer de bron die draagt; anders null. */
  euroImpactMonthly: number | null
  /**
   * Vrijheidsdagen per jaar — AL door de compliance-regel gehaald: 0 zodra de
   * regel niet geldt. Zie {@link resolveTipFreedomDays}.
   */
  vrijheidsdagen: number
  /**
   * Mag er in de tekst over vrijheidsdagen gesproken worden? Stuurt of de
   * `Vrijheidsdagen:`-regel in het KANS-blok verschijnt (de prompt hangt op die
   * letterlijke string).
   */
  vrijheidsdagenToegestaan: boolean
  /** Budget-slug voor `related_budget_slug`, of null. */
  budgetSlug: string | null
  /** Deterministisch afgeleid uit `bron` — nooit door het model gekozen. */
  type: RecommendationType
  /** Geklemde prioriteit 1-5, afgeleid uit de rangorde op besparing. */
  priority: number
}

export interface LocalTipCandidates {
  /** De aangeboden kansen, gesorteerd op besparing (desc), max {@link MAX_TIP_CANDIDATES}. */
  candidates: LocalTipCandidate[]
  /**
   * False wanneer er niets te tippen valt (geen data, of alles staat al als
   * aanbeveling). De UI toont dan een eerlijke lege staat i.p.v. het model
   * nutteloos te laten draaien.
   */
  hasCandidates: boolean
}

/* ── Deterministische afleidingen (puur, los testbaar) ────────────────────── */

/**
 * Bron → `recommendation_type`. Dit stond in de cloudprompt als een lijst van vijf
 * enums waaruit het model moest kiezen; een 2B-model kiest daar aantoonbaar slecht
 * in en een verkeerd type stuurt de deeplink en de filtering op /overzicht/tips
 * de verkeerde kant op. Daarom een tabel in plaats van een instructie.
 *
 * `income_increase` en `savings_boost` ontbreken bewust: geen enkele van onze
 * deterministische kandidaatbronnen levert zo'n kans op. Een type toekennen dat
 * niet uit de data volgt zou precies de gok zijn die we hier uitbannen.
 */
export function tipTypeForSource(bron: LocalTipSource): RecommendationType {
  switch (bron) {
    case 'budget':
    case 'abonnement':
      return 'budget_optimization'
    case 'debt':
      return 'debt_acceleration'
    case 'tax':
    case 'jaarruimte':
    case 'asset':
      return 'asset_reallocation'
  }
}

/**
 * De vrijheidsdagen-regel uit de cloudroute, als één gedeelde pure functie —
 * COMPLIANCE, geen sier. "Win je N vrijheidsdagen per jaar" mag alleen wanneer
 * BEIDE gelden:
 *   1. de kans hangt aan een budget dat als essentieel gemarkeerd is, en
 *   2. de gebruiker rekent zijn pensioenuitgaven af op `essential_budgets`.
 * In elk ander geval is de noemer (dagelijkse must-uitgaven) niet de grondslag
 * waarop de gebruiker zijn FIRE-doel berekent, en zou het getal een andere
 * belofte doen dan de rest van de app. Dan: 0.
 *
 * Zonder budget-slug (fiscale lever, schuld, bezit, abonnement) is er per definitie
 * geen essentieel budget → 0. Dat is exact wat de cloudroute doet
 * (`const isEssential = slug ? (budgetMap.get(slug) ?? false) : false`), dus de
 * lokale tips beloven nooit méér dan de cloud-tips.
 *
 * Deze functie draait TWEE keer: hier bij het bouwen van de kandidaat (zodat de
 * kaart toont wat er opgeslagen wordt) en nogmaals in de opslagroute op de
 * server (zodat een gemanipuleerde client de regel niet kan omzeilen).
 */
export function resolveTipFreedomDays(input: {
  budgetSlug: string | null
  rawFreedomDays: number
  essentialBudgetSlugs: ReadonlySet<string>
  usesEssentialBudgets: boolean
}): number {
  const { budgetSlug, rawFreedomDays, essentialBudgetSlugs, usesEssentialBudgets } = input
  if (!budgetSlug) return 0
  if (!usesEssentialBudgets) return 0
  if (!essentialBudgetSlugs.has(budgetSlug)) return 0
  if (!Number.isFinite(rawFreedomDays) || rawFreedomDays <= 0) return 0
  return Math.round(rawFreedomDays)
}

/**
 * Prioriteit uit de rangorde: de kandidatenlijst is al op besparing (desc)
 * gesorteerd, dus positie 0 is de grootste kans. 5 = hoogste. Geklemd op 1-5,
 * gelijk aan de DB-CHECK op `recommendations.priority_score`.
 *
 * Bewust NIET aan het model gevraagd: "hoe belangrijk is dit?" is een oordeel dat
 * een 2B-model per call los maakt, zonder de andere kansen te zien — dan krijgt
 * elke tip een 4 of 5 en is de sortering op /overzicht/tips betekenisloos.
 */
export function tipPriorityForRank(rank: number): number {
  return Math.min(5, Math.max(1, 5 - rank))
}

/** Normaliseer een titel voor tolerante vergelijking (case-/witruimte-ongevoelig). */
function normTitle(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * De sleutel waaronder een kandidaat in `recommendations.ai_generation_id` wordt
 * vastgelegd. In het cloudpad groepeert dat veld de drie tips uit één
 * `generateObject`-call; in het lokale pad is één generate-call precies één tip,
 * dus valt "de generatie" samen met "de kans". Daarmee is dit veld — zonder
 * migratie — de stabiele dedupe- en idempotentiesleutel.
 */
export function tipGenerationId(candidateId: string): string {
  return `lokaal:${candidateId}`
}

/* ── Verzamelen ──────────────────────────────────────────────────────────── */

/** Rij-vorm van de dedupe-query op bestaande aanbevelingen. */
interface ExistingRecommendationRow {
  ai_generation_id: string | null
  related_budget_slug: string | null
  title: string
  status: string
  created_at: string
}

/**
 * Bestaande aanbevelingen die een kandidaat mogen verdringen: alles wat nog
 * open of geaccepteerd is, plus wat recent is afgewezen/verlopen. Faal-zacht:
 * bij een query-fout een lege lijst — dan biedt de gebruiker hooguit een dubbele
 * tip aan, wat veel minder erg is dan helemaal geen tips kunnen maken.
 */
async function loadExistingRecommendations(
  supabase: SupabaseClient,
  userId: string,
): Promise<ExistingRecommendationRow[]> {
  try {
    const { data } = await supabase
      .from('recommendations')
      .select('ai_generation_id, related_budget_slug, title, status, created_at')
      .eq('user_id', userId)
      .in('status', ['pending', 'postponed', 'accepted', 'rejected', 'expired'])
      .order('created_at', { ascending: false })
      .limit(200)
    return (data ?? []) as ExistingRecommendationRow[]
  } catch {
    return []
  }
}

/**
 * DEDUPE, DETERMINISTISCH (niet door het model). "Vermijd voorstellen die lijken
 * op eerdere voorstellen" is een lange-context-taak: het model zou álle bestaande
 * aanbevelingen in zijn venster moeten hebben én ze semantisch moeten vergelijken.
 * Dat doet een 2B-model slecht, en het kost precies de tokens die we niet hebben.
 * Hier filteren we de kandidaat wég vóórdat het model 'm ooit ziet.
 *
 * Drie sleutels, van sterk naar zwak:
 *   1. de generatie-sleutel (`lokaal:<kandidaat-id>`) — exact dezelfde kans;
 *   2. `related_budget_slug` — dezelfde budgetcategorie heeft al een voorstel;
 *   3. de genormaliseerde canonieke titel — vangt cloud-tips die uit dezelfde bus
 *      kwamen en dus dezelfde titel dragen.
 */
export function filterDuplicateCandidates(
  candidates: LocalTipCandidate[],
  existing: ExistingRecommendationRow[],
  now: Date = new Date(),
): LocalTipCandidate[] {
  const cutoff = now.getTime() - DEDUPE_CLOSED_DAYS * 86400 * 1000
  const relevant = existing.filter((r) => {
    if (r.status === 'pending' || r.status === 'postponed' || r.status === 'accepted') return true
    // rejected/expired tellen alleen zolang ze recent zijn.
    const created = Date.parse(r.created_at)
    return Number.isFinite(created) && created >= cutoff
  })

  const blockedGenerationIds = new Set(
    relevant.map((r) => r.ai_generation_id).filter((v): v is string => !!v),
  )
  const blockedSlugs = new Set(
    relevant.map((r) => r.related_budget_slug).filter((v): v is string => !!v),
  )
  const blockedTitles = new Set(relevant.map((r) => normTitle(r.title)).filter(Boolean))

  return candidates.filter((c) => {
    if (blockedGenerationIds.has(tipGenerationId(c.id))) return false
    if (c.budgetSlug && blockedSlugs.has(c.budgetSlug)) return false
    if (blockedTitles.has(normTitle(c.titel))) return false
    return true
  })
}

/**
 * Tussenvorm tijdens het verzamelen: de canonieke velden plús de RUWE
 * vrijheidsdagen van de bron. Die zijn nog niet door de compliance-regel gehaald
 * — dat gebeurt pas in stap 4, wanneer de essentiële-budget-set bekend is.
 */
type RawTipCandidate = Pick<
  LocalTipCandidate,
  'id' | 'bron' | 'titel' | 'toelichting' | 'besparingPerJaar' | 'euroImpactMonthly' | 'budgetSlug'
> & { rawFreedomDays: number }

/** Bron-afleiding uit de namespaced aandachtspunt-id (`{domain}:{bron-id}`). */
function sourceForAandachtspunt(a: Aandachtspunt): LocalTipSource {
  return a.domain
}

/** Budget-slug uit een aandachtspunt: alleen de budget-namespace draagt er een. */
function budgetSlugForAandachtspunt(a: Aandachtspunt): string | null {
  if (a.domain !== 'budget') return null
  const slug = a.id.slice('budget:'.length)
  return slug || null
}

/**
 * Bouw de kandidatenlijst voor het lokale tips-pad.
 *
 * Volgorde van de stappen is bewust: eerst álles verzamelen en doorrekenen, dan
 * de compliance-regel toepassen, dan dedupliceren, dan pas afkappen op
 * {@link MAX_TIP_CANDIDATES}. Andersom zou een kandidaat die tóch wegvalt een
 * plek in de top-5 bezet houden.
 */
export async function buildLocalTipCandidates(
  supabase: SupabaseClient,
): Promise<LocalTipCandidates> {
  const user = await getCachedUser(supabase)
  if (!user) return { candidates: [], hasCandidates: false }

  const [coreData, profileResult, budgetsResult, aandachtspunten, vasteLasten, existing] =
    await Promise.all([
      loadCoreData(supabase),
      supabase
        .from('profiles')
        .select(
          'housing_strategy_config, net_monthly_income, pension_factor_a, pension_factor_a_source, retirement_expense_method, budgeting_active',
        )
        .maybeSingle(),
      supabase.from('budgets').select('slug, is_essential'),
      // De bus faalt intern al zacht per producent; de extra catch is defensief.
      collectAandachtspunten(supabase).catch(() => [] as Aandachtspunt[]),
      loadVasteLastenSummary(supabase).catch(() => null),
      loadExistingRecommendations(supabase, user.id),
    ])

  const profile = profileResult.data
  const facts = buildWillFinancialFacts(coreData, profile)

  // Ontbrekende waarde = de app-default `essential_budgets`, gelijk aan de cloudroute.
  const usesEssentialBudgets =
    (profile?.retirement_expense_method ?? 'essential_budgets') === 'essential_budgets'
  // Alleen expliciet false schakelt budgetteren uit (fail-open, gelijk aan de cloudroute).
  const budgetingActive = profile?.budgeting_active !== false

  const essentialBudgetSlugs = new Set(
    (budgetsResult.data ?? [])
      .filter((b): b is { slug: string; is_essential: boolean } => !!b?.slug && b.is_essential === true)
      .map((b) => b.slug),
  )

  const raw: RawTipCandidate[] = []

  // ── 1. Aandachtspunten (tax incl. NIBUD-budgetten, debt, asset) ───────────
  for (const a of aandachtspunten) {
    // De fiscale lever krijgt hieronder een eigen, rijker blok (onbenutte ruimte
    // én besparing) — hier eruit filteren zodat hij niet dubbel verschijnt.
    if (a.id === JAARRUIMTE_AANDACHTSPUNT_ID) continue
    const bron = sourceForAandachtspunt(a)
    // Budgetteert de gebruiker niet, dan zijn er geen budgetcategorieën en geen
    // NIBUD-vergelijking om over te tippen — gelijk aan de "GEEN BUDGETTERING"-
    // regel van de cloudprompt. Abonnementen blijven wél staan: die komen uit
    // transactiedetectie, niet uit budgetten, dus die reden geldt daar niet.
    if (bron === 'budget' && !budgetingActive) continue
    raw.push({
      id: a.id,
      bron,
      titel: a.title,
      toelichting: a.description ?? null,
      besparingPerJaar: Math.round(a.savings),
      euroImpactMonthly:
        a.euroImpactMonthly != null && Number.isFinite(a.euroImpactMonthly)
          ? Math.round(a.euroImpactMonthly)
          : null,
      budgetSlug: budgetSlugForAandachtspunt(a),
      rawFreedomDays: a.freedomDays,
    })
  }

  // ── 2. De fiscale lever (jaarruimte) ──────────────────────────────────────
  // Zelfde motoren als de cloud tax-context en de lokale chat. De bus onderdrukt
  // 'm al wanneer de gebruiker de actie nam (`filterActionedAandachtspunten`),
  // dus we voegen 'm alleen toe wanneer hij daar nog in stond.
  const jaarruimteNogRelevant = aandachtspunten.some((a) => a.id === JAARRUIMTE_AANDACHTSPUNT_ID)
  if (jaarruimteNogRelevant) {
    // Het PROFIEL gaat mee, niet een losgetrokken `factorA`-getal: zo reist de
    // "factor A onbekend"-kwalificatie (H23) mee tot in de tip-toelichting —
    // die stroomt via `LocalTipCandidate.toelichting` door naar
    // `local-recommendations-prompt.ts`.
    const jf = computeJaarruimteFacts(Number(profile?.net_monthly_income ?? 0), profile, TAX_YEAR)
    if (jf.hasData && jf.besparing > 0) {
      raw.push({
        id: JAARRUIMTE_AANDACHTSPUNT_ID,
        bron: 'jaarruimte',
        titel: 'Benut je jaarruimte',
        toelichting: `je hebt €${Math.round(jf.onbenut).toLocaleString('nl-NL')} onbenutte aftrekruimte voor lijfrente- of pensioeninleg${jf.factorAKnown ? '' : JAARRUIMTE_BOVENGRENS_SUFFIX}`,
        besparingPerJaar: Math.round(jf.besparing),
        euroImpactMonthly: null,
        budgetSlug: null,
        rawFreedomDays: facts.dagtarief > 0 ? jf.besparing / facts.dagtarief : 0,
      })
    }
  }

  // ── 3. Abonnementen (canonieke vaste-lasten-detectie) ─────────────────────
  // `loadVasteLastenSummary` wrapt `detectRecurringTransactions` en normaliseert
  // elke frequentie naar een maandbedrag — wij tellen niets zelf op.
  for (const sub of vasteLasten?.subscriptions ?? []) {
    const maand = Math.round(sub.monthlyAmount)
    const jaar = Math.round(sub.monthlyAmount * 12)
    if (jaar < MIN_ABONNEMENT_JAARBESPARING) continue
    raw.push({
      id: `abonnement:${sub.id}`,
      bron: 'abonnement',
      titel: `Heroverweeg ${sub.name}`,
      // Zelfde EUR-notatie als `renderKansBlok` (duizendscheiding): anders ziet
      // het model "€1500" in de toelichting en "€1.500" in de besparingsregel
      // voor hetzelfde bedrag, terwijl de DNA "teken voor teken" eist.
      toelichting: `dit abonnement kost je €${maand.toLocaleString('nl-NL')} per maand`,
      besparingPerJaar: jaar,
      euroImpactMonthly: maand,
      budgetSlug: null,
      rawFreedomDays: facts.dagtarief > 0 ? (sub.monthlyAmount * 12) / facts.dagtarief : 0,
    })
  }

  // ── 4. Compliance-regel, sortering, dedupe, cap ───────────────────────────
  const withRules: LocalTipCandidate[] = raw
    .map(({ rawFreedomDays, ...rest }) => {
      const vrijheidsdagen = resolveTipFreedomDays({
        budgetSlug: rest.budgetSlug,
        rawFreedomDays,
        essentialBudgetSlugs,
        usesEssentialBudgets,
      })
      return {
        ...rest,
        vrijheidsdagen,
        vrijheidsdagenToegestaan: vrijheidsdagen > 0,
        type: tipTypeForSource(rest.bron),
        // Voorlopige waarde; hieronder pas definitief op basis van de rangorde.
        priority: 3,
      }
    })
    // Alleen kansen met een échte besparing: een tip zonder cijfer is geen tip.
    .filter((c) => c.besparingPerJaar > 0)
    .sort((a, b) => b.besparingPerJaar - a.besparingPerJaar)

  // RANGORDE VÓÓR DEDUPE — niet andersom. Het lokale pad slaat elke tip meteen
  // op, dus de vólgende POST bouwt deze lijst opnieuw op mét die zojuist
  // opgeslagen aanbeveling erin. Zou de rang ná de dedupe bepaald worden, dan
  // schuift de volgende kandidaat telkens naar positie 0 en krijgt élke tip
  // prioriteit 5 — precies de betekenisloze sortering die `tipPriorityForRank`
  // hierboven zegt te voorkomen. De rang hangt nu aan de volledige, canonieke
  // besparingsvolgorde en is dus stabiel over opeenvolgende rondes.
  const gerangschikt = withRules.map((c, i) => ({ ...c, priority: tipPriorityForRank(i) }))
  const candidates = filterDuplicateCandidates(gerangschikt, existing).slice(0, MAX_TIP_CANDIDATES)

  return { candidates, hasCandidates: candidates.length > 0 }
}
