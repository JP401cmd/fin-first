import type { SupabaseClient } from '@supabase/supabase-js'
import { calculateBox2, type TaxYear } from '@/lib/box2-data'
import { dgaLeningTotalForUser, type DgaLeningSources } from '@/lib/box2-dga-lening'

/**
 * Twee gates op Box 2, bewust náást elkaar — ze beantwoorden een ándere vraag:
 *
 *  · RELEVANTIE (`hasBox2Relevance` / `hasBox2RelevanceFromRows`) — "bestaat er
 *    een Box 2-positie?". Stuurt of een Box 2-oppervlak überhaupt getoond wordt
 *    (de box-kaart op de hub, de empty-state op /overzicht/belasting/box2, en
 *    sinds bevinding L8 ook de DGA-items in de fiscale kalender).
 *
 *  · MATERIALITEIT (`loadBox2Materiality`) — "valt er iets te DOEN?". Stuurt
 *    uitsluitend de aandacht-vragende statusbanner. Een DGA met een klein belang,
 *    geen uitkering en een symbolische rekening-courant heeft wél een relevante
 *    positie, maar géén heffing — die hoort de rustige pagina te zien, niet een
 *    "AANDACHT"-banner (bevinding L8: alarmmoeheid).
 *
 * Verwar ze niet: de pagina blijft op relevantie draaien, alleen de banner kijkt
 * naar materialiteit.
 */

/**
 * Bepaalt of Box 2 (aanmerkelijk belang) relevant is voor de gebruiker.
 *
 * Spiegelt de detectie-breedte van /api/household/box2 (zie
 * app/api/household/box2/route.ts): Box 2 wordt berekend uit drie bronnen —
 * deelneming-assets, DGA-vorderingen (asset_type 'vordering' + subtype
 * 'dga_lening') en DGA-schulden (debt_type 'dga_schuld', voor de Wet
 * excessief lenen). Een eerdere versie checkte alléén op deelneming-assets,
 * waardoor de Box 2-empty-state een echte excessief-lenen-heffing verborg
 * voor een DGA die wél DGA-leningen registreert maar geen losse deelneming.
 *
 * Query is user-scoped (RLS dekt dit al; eq('user_id') houdt het expliciet),
 * en stopt bij het eerste resultaat (`limit(1)`) — puur een ja/nee-gate.
 */
export async function hasBox2Relevance(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const [assetsRes, debtsRes] = await Promise.all([
    supabase
      .from('assets')
      .select('id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .or('asset_type.eq.deelneming,and(asset_type.eq.vordering,subtype.eq.dga_lening)')
      .limit(1),
    supabase
      .from('debts')
      .select('id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('debt_type', 'dga_schuld')
      .limit(1),
  ])
  return (assetsRes.data?.length ?? 0) > 0 || (debtsRes.data?.length ?? 0) > 0
}

/** Minimale rij-vorm die de relevantie-detectie nodig heeft (assets). */
interface Box2AssetRow {
  asset_type?: string | null
  subtype?: string | null
  user_id?: string | null
}

/** Minimale rij-vorm die de relevantie-detectie nodig heeft (debts). */
interface Box2DebtRow {
  debt_type?: string | null
  user_id?: string | null
}

/**
 * Zelfde ja/nee-gate als `hasBox2Relevance`, maar op REEDS GELADEN rijen — voor
 * oppervlakken die de actieve assets/schulden toch al in geheugen hebben (bv. de
 * dashboard-loader via `getActiveAssets`/`getActiveDebts`). Zo kost het filter
 * daar geen extra query, terwijl de definitie van "Box 2-relevant" op één plek
 * blijft staan: deelneming-asset, DGA-vordering (`vordering` + subtype
 * `dga_lening`) óf DGA-schuld (`dga_schuld`).
 *
 * De rijen worden verondersteld al op `is_active = true` gefilterd te zijn (dat
 * doen de gedeelde base-fetchers), net als de DB-variant hierboven.
 *
 * @param userId Scope-eigenaar; `null` → false (niet ingelogd). Rijen van een
 *               partner tellen NIET mee, identiek aan de user-scoped DB-query.
 */
export function hasBox2RelevanceFromRows(
  assets: Box2AssetRow[],
  debts: Box2DebtRow[],
  userId: string | null,
): boolean {
  if (!userId) return false
  const hasAsset = assets.some(
    (a) =>
      a.user_id === userId &&
      (a.asset_type === 'deelneming' ||
        (a.asset_type === 'vordering' && a.subtype === 'dga_lening')),
  )
  if (hasAsset) return true
  return debts.some((d) => d.user_id === userId && d.debt_type === 'dga_schuld')
}

/** Uitkomst van de materialiteits-gate voor de Box 2-statusbanner. */
export interface Box2Materiality {
  /** Er bestaat een Box 2-positie (zelfde breedte als `hasBox2Relevance`). */
  relevant: boolean
  /**
   * Er is daadwerkelijk een heffing — Box 2-belasting over dividend en/of het
   * bovenmatige deel boven de €500.000-leengrens. Alleen dán een banner.
   */
  material: boolean
}

/**
 * Laadt de Box 2-cijfers van de INGELOGDE gebruiker en leidt daaruit de
 * materialiteit af (Optie A, bevinding L8). Bewust een eigen, lichte loader
 * i.p.v. `/api/household/box2`: die route bouwt óók de partner-, naam- en
 * vrijheidsdagen-weergave op, en dat is voor een ja/nee-banner verspilde egress.
 *
 * "Consume, don't recompute": de drempel (€500.000) en de staffel blijven in de
 * canonieke motor `calculateBox2` (lib/box2-data.ts) — hier staat geen enkele
 * fiscale constante. `hasPartner` en `dailyExpenses` mogen daarom weg:
 *   · `hasPartner` verschuift alléén de schijfgrens (24,5% vs. 31%), niet ÓF er
 *     heffing is — en materialiteit is een ja/nee, geen bedrag.
 *   · `dailyExpenses` voedt uitsluitend `freedomDays`, dat we hier niet tonen;
 *     0 doorgeven scheelt de 12-maands uitgaven-query.
 *
 * Scoping is user-scoped (eigen rijen), identiek aan `hasBox2Relevance` — de
 * banner van de gebruiker mag nooit op partnerdata afgaan.
 */
export async function loadBox2Materiality(
  supabase: SupabaseClient,
  userId: string,
  year: TaxYear = 2026,
): Promise<Box2Materiality> {
  const [deelnemingenRes, vorderingenRes, schuldenRes] = await Promise.all([
    supabase
      .from('assets')
      // Kolomregel (CLAUDE.md): geen select('*') op assets — de tabel draagt
      // *_encrypted/*_hash en de SELECT-policy is huishoud-gedeeld.
      .select('id, annual_dividend')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('asset_type', 'deelneming'),
    supabase
      .from('assets')
      .select('id, current_value, user_id, ownership')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('asset_type', 'vordering')
      .eq('subtype', 'dga_lening'),
    supabase
      .from('debts')
      .select('id, current_balance, user_id, ownership')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('debt_type', 'dga_schuld'),
  ])

  const deelnemingen = deelnemingenRes.data ?? []
  const vorderingen = (vorderingenRes.data ?? []) as {
    current_value: number | string | null
    user_id: string
    ownership: string
  }[]
  const schulden = (schuldenRes.data ?? []) as {
    current_balance: number | string | null
    user_id: string
    ownership: string
  }[]

  const relevant = deelnemingen.length > 0 || vorderingen.length > 0 || schulden.length > 0
  if (!relevant) return { relevant: false, material: false }

  // Leentotaal via de gedeelde aggregatie (Wet excessief lenen, Optie B) —
  // niet lokaal optellen.
  const dgaSources: DgaLeningSources = {
    schulden: schulden.map((d) => ({
      userId: d.user_id,
      ownership: d.ownership,
      amount: Number(d.current_balance),
    })),
    vorderingen: vorderingen.map((v) => ({
      userId: v.user_id,
      ownership: v.ownership,
      amount: Number(v.current_value),
    })),
  }

  const result = calculateBox2({
    deelnemingen: deelnemingen.map((d) => {
      // NULL ≠ 0 (bevinding H26): een niet-ingevuld dividend blijft `null`, zodat
      // de motor het als "onbekend" behandelt i.p.v. als zelfverzekerde €0.
      const raw = (d as { annual_dividend?: unknown }).annual_dividend
      const n = raw == null || raw === '' ? null : Number(raw)
      return {
        name: 'Deelneming',
        annual_dividend: n != null && Number.isFinite(n) ? n : null,
        // Geen datapad voor vervreemdingswinst (zie de route-toelichting).
        disposal_gain: 0,
      }
    }),
    year,
    hasPartner: false,
    dailyExpenses: 0,
    dgaLeningenTotal: dgaLeningTotalForUser(dgaSources, userId),
  })

  return { relevant: true, material: result.totalTaxInclDga > 0 }
}
