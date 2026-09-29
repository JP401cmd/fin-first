// ── Tijdlijn lezen: de eigen tijdlijn via de SESSIE-client ──────────────────
//
// Krant 1C fase 2 (B31, B32, U13; ADR 0183). Lezen gaat — net als de
// testsectie (lib/krant/testeditie.ts) — uitsluitend over de EIGEN rijen van
// de aanroeper, via de sessie-client onder de own-row-RLS van migratie
// 20260922120000 (`user_id = (select auth.uid())`). Nooit de service-role, en
// geen parameter waarmee je een andere lezer kiest. De `.eq('user_id', …)` is
// dubbel op de RLS en staat er expres: hij maakt de scoping leesbaar in de bron
// (tijdlijn-lezen.gate.test.ts bewaakt beide).
//
// Wat de lezer ziet:
//   · de nieuwste TIJDLIJN_PAGINA berichten, nieuwste verversing bovenaan en
//     binnen één verversing op positie (= score, direct eerst — B31);
//   · daaronder een archief per week (B32), opvraagbaar per week met dezelfde
//     cursor; na 120 dagen ruimt `ruimTijdlijnOp` de verversing op;
//   · de Achtergrond van de laatste verversing (B37) en — alleen zolang de
//     tijdlijn minder dan KATERN_ONDER berichten telt — het algemene katern (U13).
//
// De CURSOR is (created_at, positie, id) van het laatste getoonde bericht. De
// kaart noemde (created_at, id); positie zit ertussen omdat de berichten van
// één verversing dezelfde created_at delen (één insert) en anders op uuid
// zouden sorteren in plaats van op score. `id` maakt de sleutel uniek.
//
// ACTUELE DUIDING (eindreview M2 fase 1): een teruggetrokken bericht verdwijnt
// al uit de tijdlijn (verwijderUitTijdlijnen, B4), maar Achtergrond en katern
// staan als jsonb op de verversing. Die filteren we bij het lezen op de
// actuele `duiding_status`. `news_articles` is voor sessies niet leesbaar
// (policy service/superadmin), dus loopt dat via de RPC `krant_geduide_artikelen`
// (migratie 20261004120000): SECURITY DEFINER, geeft alleen de id's terug die
// nu 'geduid' zijn — publieke metadata, niets van een lezer.
//
// euro-only (B2, ADR 0172): dit bestand rekent niets; het geeft terug wat de
// matcher in de rij heeft gezet.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AlgemeenItem, EditieVorm } from './matcher'
import { VELD_SJABLOON, renderSjabloon, type SjabloonId } from './sjablonen'

/** Hoeveel berichten op de pagina, en per archief-pagina (B32). */
export const TIJDLIJN_PAGINA = 20

/** Het algemene katern verschijnt alleen onder zoveel berichten (U13). */
export const KATERN_ONDER = 5

/** Kolommen van `krant_editie_items` die de lezer ziet — de eigen rij, meta + momentopname. */
export const TIJDLIJN_ITEM_KOLOMMEN =
  'id, editie_id, created_at, positie, vorm, tekst, ai_tekst, ai_toegevoegd, waarom, wat_mist, deadline, snapshot, krant_edities!inner(week_key)'

/**
 * Het vormtype van een tijdlijnbericht: de matchervormen plus (Krant 1E) 'ai' —
 * door de AI-laag toegevoegd, met een getoetste AI-tekst — en 'ai-oud' — omgezet
 * uit de oude AI-Krant (K7): kop en samenvatting door het oude model, zonder
 * AI-tekst, als geheel gelabeld "Uit de eerdere Krant met AI".
 */
export type TijdlijnVorm = EditieVorm | 'ai' | 'ai-oud'

export interface TijdlijnBericht {
  id: string
  verversingId: string
  /** ISO — wanneer het bericht in de tijdlijn kwam (de verversing). */
  createdAt: string
  weekKey: string
  positie: number
  vorm: TijdlijnVorm
  /** De kop boven de regel — alleen bij 'raakt' ("Over jouw situatie", sjabloon raakt-kop, B37); anders null. */
  kop: string | null
  /** De regel voor jou (sjabloon, geattesteerd). Leeg bij vorm 'ai': dan is er geen matcherregel. */
  tekst: string
  /** Krant 1E: de toelichting van het model onder de regel (label "met AI"); null = geen. */
  aiTekst: string | null
  /** Krant 1E: het model koos dit bericht (label "door AI toegevoegd"). */
  aiToegevoegd: boolean
  /** "Waarom zie ik dit?" — leesbare zinnen uit de catalogus (`leesbaarWaarom`), nooit de codes van de matcher. */
  waarom: string[]
  /** Profielvelden die ontbraken voor een bedrag — leesbare namen uit de catalogus (`leesbaarWatMist`). */
  watMist: string[]
  deadline: unknown
  titel: string | null
  rubriek: string | null
  bron: string | null
  url: string | null
  gepubliceerd: string | null
  /** ADR 0191 regel 3: zonder echte publicatiedatum wanneer wij het zagen; null bij een echte datum of een oude momentopname. */
  gezienOp: string | null
  samenvatting: string | null
}

export interface TijdlijnCursor {
  createdAt: string
  positie: number
  id: string
}

export interface TijdlijnPagina {
  berichten: TijdlijnBericht[]
  /** Opaak; null als er niets meer is. */
  volgende: string | null
}

export interface TijdlijnWeek {
  weekKey: string
  aantal: number
}

export interface TijdlijnBlok {
  kop: string
  label: string
  items: AlgemeenItem[]
}

export interface TijdlijnOverzicht {
  pagina: TijdlijnPagina
  /** Aantal berichten in de hele tijdlijn (som van item_count over de verversingen). */
  totaal: number
  /** Weken met berichten, nieuwste eerst — voor het archief. */
  archief: TijdlijnWeek[]
  /** created_at van de laatste verversing (ook een lege); null = nog nooit ververst. */
  laatstVernieuwd: string | null
  /** nieuwsprofiel.tijdlijn_gelezen_tot — "nieuw sinds je laatste bezoek". */
  gelezenTot: string | null
  achtergrond: TijdlijnBlok | null
  /** Alleen als totaal < KATERN_ONDER (U13). */
  katern: TijdlijnBlok | null
  /** De lege tekst van de laatste verversing als de hele tijdlijn leeg is. */
  legeTekst: string | null
  /**
   * Krant 1E: had de LAATSTE verversing geen AI terwijl de laag wel draaide?
   * 'quotum' = de weeklimiet was op; 'anders' = teruggevallen of geweigerd
   * (model, guards, een poort); null = met AI, leeg, of geen AI-laag. De
   * client toont het alleen aan een lezer die de Krant met AI koos.
   */
  laatsteZonderAi: 'quotum' | 'anders' | null
}

// ── Cursor ───────────────────────────────────────────────────────────────────

export function codeerCursor(c: TijdlijnCursor): string {
  return Buffer.from(JSON.stringify([c.createdAt, c.positie, c.id]), 'utf8').toString('base64url')
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Strikt: een cursor die niet precies (iso, int ≥ 0, uuid) is, is ongeldig (null). Hij gaat in een PostgREST-filter. */
export function decodeerCursor(tekst: string | null | undefined): TijdlijnCursor | null {
  if (!tekst || tekst.length > 200) return null
  try {
    const v = JSON.parse(Buffer.from(tekst, 'base64url').toString('utf8')) as unknown
    if (!Array.isArray(v) || v.length !== 3) return null
    const [createdAt, positie, id] = v as [unknown, unknown, unknown]
    if (typeof createdAt !== 'string' || !ISO.test(createdAt)) return null
    if (typeof positie !== 'number' || !Number.isInteger(positie) || positie < 0 || positie > 1000) return null
    if (typeof id !== 'string' || !UUID.test(id)) return null
    return { createdAt, positie, id }
  } catch {
    return null
  }
}

/** ISO-week zoals amsterdamWeekKey hem schrijft: 2026-W40. */
export const WEEK_KEY = /^\d{4}-W\d{2}$/

// ── Rijen → berichten ────────────────────────────────────────────────────────

interface ItemRij {
  id: string
  editie_id: string
  created_at: string
  positie: number
  vorm: TijdlijnVorm
  tekst: string
  ai_tekst?: string | null
  ai_toegevoegd?: boolean | null
  waarom: string[] | null
  wat_mist: string[] | null
  deadline: unknown
  snapshot: Record<string, unknown> | null
  krant_edities: { week_key: string } | Array<{ week_key: string }> | null
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null)

/** Een catalogustekst, of null als het id niet (meer) bestaat of een slot mist. */
function uitCatalogus(id: string, slots: Record<string, string> = {}): string | null {
  try {
    return renderSjabloon(id as SjabloonId, 0, slots) || null
  } catch {
    return null
  }
}

/**
 * De rij bewaart in `waarom` de CODES van de matcher (`thema:sparen-rente`,
 * `impact:ontbreekt`, `reden:reden-spaargeld-5k`, `redactie:spaarbuffer`, …).
 * Die zijn voor beheer en de meting; de lezer zag ze tot 30-09-2026 letterlijk
 * onder "Waarom zie ik dit?" (security G2 — de schermtest gebruikte zinnen en
 * zag het niet). De lezer krijgt alleen de REDENEN, als de zin uit de
 * geattesteerde catalogus ("Volgens je profiel heb je € 5.000 of meer
 * spaargeld."). Dat zijn ook de gevoelige redenen (inkomen, uitkering,
 * krediet): die staan bewust niet in de regel maar wél hier, achter een klik
 * (compliance-keuze 4). Alle andere codes vallen weg — ook
 * `redactie:spaarbuffer`: "weinig spaargeld" heeft geen zin in de catalogus en
 * krijgt er geen.
 */
export function leesbaarWaarom(codes: readonly string[] | null | undefined): string[] {
  const zinnen: string[] = []
  for (const code of codes ?? []) {
    if (typeof code !== 'string' || !code.startsWith('reden:reden-')) continue
    const reden = uitCatalogus(code.slice('reden:'.length))
    const zin = reden ? uitCatalogus('raakt-reden', { reden }) : null
    if (zin && !zinnen.includes(zin)) zinnen.push(zin)
  }
  return zinnen
}

/** De profielsleutels van `wat_mist` als leesbare namen ("je spaargeld"); een onbekende sleutel valt weg. */
export function leesbaarWatMist(velden: readonly string[] | null | undefined): string[] {
  const namen: string[] = []
  for (const veld of velden ?? []) {
    if (typeof veld !== 'string' || !Object.hasOwn(VELD_SJABLOON, veld)) continue
    const naam = uitCatalogus(VELD_SJABLOON[veld as keyof typeof VELD_SJABLOON])
    if (naam && !namen.includes(naam)) namen.push(naam)
  }
  return namen
}

export function rijNaarBericht(r: ItemRij): TijdlijnBericht {
  const s = r.snapshot ?? {}
  const editie = Array.isArray(r.krant_edities) ? r.krant_edities[0] : r.krant_edities
  return {
    id: r.id,
    verversingId: r.editie_id,
    createdAt: r.created_at,
    weekKey: editie?.week_key ?? '',
    positie: r.positie,
    vorm: r.vorm,
    kop: r.vorm === 'raakt' ? renderSjabloon('raakt-kop', 0) : null,
    tekst: r.tekst,
    aiTekst: str(r.ai_tekst),
    aiToegevoegd: r.ai_toegevoegd === true,
    waarom: leesbaarWaarom(r.waarom),
    watMist: leesbaarWatMist(r.wat_mist),
    deadline: r.deadline ?? null,
    titel: str(s.titel),
    rubriek: str(s.rubriek),
    bron: str(s.bron),
    url: str(s.url),
    gepubliceerd: str(s.gepubliceerd),
    gezienOp: str(s.gezienOp),
    samenvatting: str(s.samenvatting),
  }
}

// ── Lezen ────────────────────────────────────────────────────────────────────

/**
 * Eén pagina van de eigen tijdlijn: nieuwste eerst, binnen een verversing op
 * positie. Met `week` alleen die archiefweek. Eén extra rij ophalen zegt of er
 * een volgende pagina is.
 */
export async function laadTijdlijnPagina(
  supabase: SupabaseClient,
  userId: string,
  opts: { cursor?: TijdlijnCursor | null; week?: string | null } = {},
): Promise<TijdlijnPagina> {
  let q = supabase
    .from('krant_editie_items')
    .select(TIJDLIJN_ITEM_KOLOMMEN)
    .eq('user_id', userId)
    .eq('tijdlijn', true)
  if (opts.week) q = q.eq('krant_edities.week_key', opts.week)
  const c = opts.cursor
  if (c) {
    // (created_at, positie, id) strikt ná de cursor in de volgorde desc, asc, asc.
    // De waarden zijn door decodeerCursor gevalideerd (iso / int / uuid): er kan
    // geen komma of haakje in dat het or-filter openbreekt.
    q = q.or(
      `created_at.lt."${c.createdAt}",and(created_at.eq."${c.createdAt}",positie.gt.${c.positie}),and(created_at.eq."${c.createdAt}",positie.eq.${c.positie},id.gt.${c.id})`,
    )
  }
  const { data, error } = await q
    .order('created_at', { ascending: false })
    .order('positie', { ascending: true })
    .order('id', { ascending: true })
    .limit(TIJDLIJN_PAGINA + 1)
  if (error) throw new Error(`[krant/tijdlijn-lezen] berichten lezen mislukt: ${error.message}`)
  const rijen = (data ?? []) as unknown as ItemRij[]
  const berichten = rijen.slice(0, TIJDLIJN_PAGINA).map(rijNaarBericht)
  const laatste = berichten[berichten.length - 1]
  return {
    berichten,
    volgende: rijen.length > TIJDLIJN_PAGINA && laatste ? codeerCursor({ createdAt: laatste.createdAt, positie: laatste.positie, id: laatste.id }) : null,
  }
}

interface VerversingRij {
  id: string
  week_key: string
  item_count: number
  leeg: boolean
  lege_tekst: string | null
  algemeen: { kop?: string; label?: string; items?: AlgemeenItem[]; achtergrond?: TijdlijnBlok } | null
  created_at: string
  ai_uitkomst?: string | null
}

/** De id's uit deze set die NU 'geduid' zijn (RPC, zie kopcommentaar). Leeg in → leeg uit, zonder roundtrip. */
export async function geduideArtikelen(supabase: SupabaseClient, ids: readonly string[]): Promise<Set<string>> {
  const uniek = [...new Set(ids)].filter((id) => UUID.test(id))
  if (uniek.length === 0) return new Set()
  const { data, error } = await supabase.rpc('krant_geduide_artikelen', { ids: uniek })
  if (error) throw new Error(`[krant/tijdlijn-lezen] duidingsstatus lezen mislukt: ${error.message}`)
  return new Set(((data ?? []) as Array<string | { krant_geduide_artikelen?: string }>).map((r) => (typeof r === 'string' ? r : (r.krant_geduide_artikelen ?? ''))))
}

function blok(b: Partial<TijdlijnBlok> | null | undefined, geduid: Set<string>): TijdlijnBlok | null {
  if (!b || !Array.isArray(b.items)) return null
  const items = b.items.filter((i) => geduid.has(i.artikelId))
  if (items.length === 0 || !b.kop || !b.label) return null
  return { kop: b.kop, label: b.label, items }
}

/** Het overzicht voor /nieuws: eerste pagina, archiefweken, Achtergrond en (onder 5) het katern. */
export async function laadTijdlijn(supabase: SupabaseClient, userId: string): Promise<TijdlijnOverzicht> {
  const [pagina, verversingenRes, profielRes] = await Promise.all([
    laadTijdlijnPagina(supabase, userId),
    // Meta per verversing; ≤ ~1000 in 120 dagen (cron 1×/dag + de knop, die
    // alleen schrijft als er iets nieuws is). Nieuwste eerst.
    supabase
      .from('krant_edities')
      .select('id, week_key, item_count, leeg, lege_tekst, algemeen, created_at, ai_uitkomst')
      .eq('user_id', userId)
      .eq('bron', 'tijdlijn')
      .order('created_at', { ascending: false })
      .limit(1000),
    supabase.from('nieuwsprofiel').select('tijdlijn_gelezen_tot').eq('user_id', userId).maybeSingle(),
  ])
  if (verversingenRes.error) throw new Error(`[krant/tijdlijn-lezen] verversingen lezen mislukt: ${verversingenRes.error.message}`)
  if (profielRes.error) throw new Error(`[krant/tijdlijn-lezen] gelezen-tot lezen mislukt: ${profielRes.error.message}`)

  const verversingen = (verversingenRes.data ?? []) as VerversingRij[]
  const laatste = verversingen[0] ?? null

  const perWeek = new Map<string, number>()
  let totaal = 0
  for (const v of verversingen) {
    if (v.item_count <= 0) continue
    totaal += v.item_count
    perWeek.set(v.week_key, (perWeek.get(v.week_key) ?? 0) + v.item_count)
  }
  const archief = [...perWeek.entries()].map(([weekKey, aantal]) => ({ weekKey, aantal })).sort((a, b) => (a.weekKey < b.weekKey ? 1 : -1))

  const alg = laatste?.algemeen ?? null
  const toonKatern = totaal < KATERN_ONDER
  const kandidaatIds = [...(alg?.achtergrond?.items ?? []), ...(toonKatern ? (alg?.items ?? []) : [])].map((i) => i.artikelId)
  // Een fout in de RPC mag de berichten niet meenemen (eindreview G10): dan
  // vallen Achtergrond en katern weg (lege set = niets geduid), de tijdlijn staat.
  const geduid = await geduideArtikelen(supabase, kandidaatIds).catch((err: unknown) => {
    console.error('[krant/tijdlijn-lezen] duidingsfilter mislukt, Achtergrond/katern weggelaten:', err)
    return new Set<string>()
  })

  return {
    pagina,
    totaal,
    archief,
    laatstVernieuwd: laatste?.created_at ?? null,
    gelezenTot: (profielRes.data?.tijdlijn_gelezen_tot as string | null | undefined) ?? null,
    achtergrond: blok(alg?.achtergrond, geduid),
    katern: toonKatern && alg ? blok({ kop: alg.kop, label: alg.label, items: alg.items }, geduid) : null,
    legeTekst: totaal === 0 ? (laatste?.lege_tekst ?? null) : null,
    laatsteZonderAi: zonderAiVan(laatste?.ai_uitkomst ?? null),
  }
}

/** ai_uitkomst van de laatste verversing → de regel "deze keer zonder AI" (K5). */
export function zonderAiVan(uitkomst: string | null): 'quotum' | 'anders' | null {
  if (uitkomst === 'quotum') return 'quotum'
  if (uitkomst === 'teruggevallen' || uitkomst === 'geweigerd') return 'anders'
  return null
}

/**
 * De nieuwsstip in de zijbalk: staat er een bericht dat nieuwer is dan
 * `tijdlijn_gelezen_tot`? Twee kleine lezingen op de eigen rij, geen inhoud.
 */
export async function heeftNieuw(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data: np, error: npFout } = await supabase.from('nieuwsprofiel').select('tijdlijn_gelezen_tot').eq('user_id', userId).maybeSingle()
  if (npFout) throw new Error(`[krant/tijdlijn-lezen] gelezen-tot lezen mislukt: ${npFout.message}`)
  let q = supabase.from('krant_editie_items').select('id').eq('user_id', userId).eq('tijdlijn', true)
  const tot = (np?.tijdlijn_gelezen_tot as string | null | undefined) ?? null
  if (tot) q = q.gt('created_at', tot)
  const { data, error } = await q.limit(1)
  if (error) throw new Error(`[krant/tijdlijn-lezen] nieuw lezen mislukt: ${error.message}`)
  return (data ?? []).length > 0
}
