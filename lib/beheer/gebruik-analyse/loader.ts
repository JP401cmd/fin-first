import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActivityModule } from '@/lib/activity/modules'
import { isOntbrekendSchema } from '@/lib/supabase/ontbrekend-schema'
import {
  DOMINANT_MIN_DAGEN,
  WAARDESTROMEN_SLEUTEL,
  parseWaardestromen,
  type Waardestroom,
} from '@/lib/waardestromen'
import {
  GEBRUIK_K,
  aandeel,
  onderdrukCel,
  onderdrukVerdeling,
  type Aandeel,
  type Cel,
} from './onderdrukking'
import { DoorstroomRuwSchema, KNOOP_GEEN, KNOOP_MEERDERE, naarSankey, type GebruikSankey } from './doorstroom'
import { STROOM_RITME_LABEL, ritmeVoorStroom } from './ritme'
import { GebruikAnalyseRuwSchema, LAATST_ACTIEF, type GebruikAnalyseRuw } from './schema'

/**
 * Laadlogica voor /beheer/gebruik (ADR 0153).
 *
 * Eén RPC — `admin_gebruik_analyse` — met de service-role. Alle aggregatie en
 * de eerste onderdrukkingslaag gebeuren in de database; hier komt alleen nog de
 * aanvullende onderdrukking bij (`onderdrukVerdeling`) en de vertaling naar een
 * view-model met {@link Cel}len. Er gaat geen gebruikers-id, e-mailadres of
 * losse datum naar de pagina: de database levert ze niet, en het schema weigert
 * een vorm waarin ze zouden passen.
 *
 * De stroomindeling komt uit de opgeslagen config (`app_settings.waardestromen`)
 * en valt terug op de standaard — nooit een hardgecodeerde lijst.
 */

export const GEBRUIK_PERIODES = [30, 90, 365] as const
export type GebruikPeriode = (typeof GEBRUIK_PERIODES)[number]
export const GEBRUIK_STANDAARD_PERIODE: GebruikPeriode = 30

/**
 * De periodes zijn DISJUNCTE BANDEN, geen geneste vensters (eigenaarsbesluit
 * 17-09-2026, security-review 🟡3): met "laatste 30" naast "laatste 90" gaf het
 * verschil van twee zichtbare tellingen een kleine groep exact prijs. De sleutel
 * (30/90/365) blijft de URL-waarde en het RPC-argument.
 */
export const GEBRUIK_BANDEN: Record<GebruikPeriode, { vanDagenGeleden: 0 | 30 | 90; totDagenGeleden: 29 | 89 | 364; label: string }> = {
  30: { vanDagenGeleden: 0, totDagenGeleden: 29, label: 'Laatste 30 dagen' },
  90: { vanDagenGeleden: 30, totDagenGeleden: 89, label: '30–89 dagen geleden' },
  365: { vanDagenGeleden: 90, totDagenGeleden: 364, label: '90–364 dagen geleden' },
}

export type LaatstActief = (typeof LAATST_ACTIEF)[number]

export function parsePeriode(raw: unknown): GebruikPeriode {
  const n = Number(Array.isArray(raw) ? raw[0] : raw)
  return (GEBRUIK_PERIODES as readonly number[]).includes(n) ? (n as GebruikPeriode) : GEBRUIK_STANDAARD_PERIODE
}

export function parseIntern(raw: unknown): boolean {
  const v = Array.isArray(raw) ? raw[0] : raw
  return v === '1' || v === 'true'
}

export interface GebruikStroom {
  id: string
  naam: string
  modules: ActivityModule[]
  /** Positie in de opgeslagen indeling (0..5) — bepaalt de kleur, niet de rangorde. */
  kleurIndex: number
  ritmeDagen: number | null
  ritmeLabel: string | null
}

/** De Sankey heeft een eigen databasefunctie en dus een eigen staat. */
export type GebruikSankeyResultaat =
  | { status: 'ok'; data: GebruikSankey }
  | { status: 'niet-uitgerold' }
  | { status: 'fout' }

export interface GebruikAnalyse {
  k: number
  /** Doorstroom per actieve dag (Sankey); los geladen via admin_gebruik_doorstroom. */
  sankey: GebruikSankeyResultaat
  vensterDagen: GebruikPeriode
  /** De band van `vensterDagen` (disjunct). */
  band: (typeof GEBRUIK_BANDEN)[GebruikPeriode]
  intern: boolean
  gemetenSindsWeek: string | null
  modulesGemetenSindsWeek: string | null
  stromen: GebruikStroom[]
  kerncijfers: {
    segmentTotaal: Cel
    /** Partitie van het segment op de laatste actieve dag (band-onafhankelijk). */
    laatstActief: { totaal: Cel; verdeling: Array<{ wanneer: LaatstActief; gebruikers: Cel }> }
    /** Actief in de band. */
    actiefVenster: Cel
    nieuwVenster: Cel
  }
  weektrend: Array<{ week: string; actief: Cel; nieuw: Cel }>
  stroomWeken: Array<{ id: string; gebruikers: Cel; weken: Array<{ week: string; actief: Cel }> }>
  dominant: { totaal: Cel; verdeling: Array<{ stroom: string | null; gebruikers: Cel }> }
  overlap: { totaal: Cel; verdeling: Array<{ aantalStromen: number; gebruikers: Cel }> }
  ritme: Array<{
    id: string
    ritmeDagen: number | null
    geschikt: Cel
    /** null = stroom zonder ritme */
    terug: Cel | null
    nietTerug: Cel | null
    aandeelTerug: Aandeel | null
    mediaanDagen: number | null
    /** Alleen bij ≥ k bijdragers; anders null (ook een 0 niet — die pinde Sankey-cellen vast). */
    gatenGebruikers: Cel | null
  }>
  samen: {
    modules: Array<{ module: ActivityModule; gebruikers: Cel }>
    paren: Array<{ a: ActivityModule; b: ActivityModule; gebruikers: Cel }>
  }
  cohorten: Array<{
    /** `YYYY-MM`, of null = één rij "eerder" (alle aanmelders van vóór de getoonde maanden). */
    maand: string | null
    dekking: 'geen' | 'deels' | 'volledig'
    aangemeld: Cel
    onboardingAfgerond: Cel
    gemeten: Cel
    eersteDag: Cel
    tweedeDag: Cel
    week25Noemer: Cel
    week25: Cel
    maand2Noemer: Cel
    maand2: Cel
  }>
  eersteErvaring: {
    totaal: Cel
    onboardingAfgerond: Cel
    rondleiding: { totaal: Cel; verdeling: Array<{ uitkomst: string; gebruikers: Cel }> }
    gids: { totaal: Cel; verdeling: Array<{ stand: string; gebruikers: Cel }> }
    uitgesteld: Array<{ veld: string; gebruikers: Cel }>
    briefingMailAan: Cel
    checkinMinstensEen: Cel
    homeScreen: { totaal: Cel; verdeling: Array<{ waarde: string; gebruikers: Cel }> }
    displayMode: { totaal: Cel; verdeling: Array<{ waarde: string; gebruikers: Cel }> }
  }
}

export type GebruikAnalyseResultaat =
  | { status: 'ok'; data: GebruikAnalyse }
  /** De functie staat (nog) niet op deze database. */
  | { status: 'niet-uitgerold'; vensterDagen: GebruikPeriode; intern: boolean }
  /** Echte storing of een onverwachte vorm — nooit als nul tonen. */
  | { status: 'fout'; vensterDagen: GebruikPeriode; intern: boolean }

/** De config zoals de database hem krijgt: alleen id's, modules en ritme — geen namen. */
export function bouwRpcConfig(stromen: readonly Waardestroom[]) {
  return {
    stromen: stromen.map((s) => ({ id: s.id, modules: s.modules, ritme_dagen: ritmeVoorStroom(s.id) })),
    dominant_min_dagen: DOMINANT_MIN_DAGEN,
  }
}

/** Een verdeling uit de database met aanvullende onderdrukking terug in rijvorm. */
function verdeel<T extends { gebruikers: number | null }, K extends object>(
  rijen: readonly T[],
  totaal: number | null,
  sleutel: (r: T) => K,
): { totaal: Cel; verdeling: Array<K & { gebruikers: Cel }> } {
  const o = onderdrukVerdeling(
    rijen.map((r) => r.gebruikers),
    totaal,
  )
  return {
    totaal: o.totaal,
    verdeling: rijen.map((r, i) => ({ ...sleutel(r), gebruikers: o.cellen[i] })),
  }
}

const VERBORGEN: Cel = { soort: 'verborgen' }

/**
 * Een telling x van een groep met publiek totaal T heeft een complement T − x
 * ("zonder afgeronde onboarding", "niet actief"). Dat paar is een verdeling:
 * is x óf T − x klein, dan gaat x dicht (security-review 17-09-2026, 🟡2).
 */
function metComplement(x: number | null, ...totalen: Array<number | null>): Cel {
  const eigen = onderdrukCel(x)
  if (eigen.soort !== 'waarde') return eigen
  for (const t of totalen) {
    if (t == null || t < eigen.n) continue
    if (onderdrukVerdeling([eigen.n, t - eigen.n], t).cellen[0].soort !== 'waarde') return VERBORGEN
  }
  return eigen
}

/**
 * Een verdeling waarvan het totaal elders verborgen moest worden: elke zichtbare
 * niet-nul cel dicht. Nullen en "< 5" blijven zoals ze waren — die verraden
 * zonder totaal niets extra's.
 */
function sluitCellen(cellen: Cel[]): Cel[] {
  return cellen.map((c) => (c.soort === 'waarde' && c.n > 0 ? VERBORGEN : c))
}
const sluitTotaal = (c: Cel): Cel => (c.soort === 'waarde' && c.n > 0 ? VERBORGEN : c)

function sluitVerdeling<V extends { totaal: Cel; verdeling: Array<{ gebruikers: Cel }> }>(v: V): V {
  const cellen = sluitCellen(v.verdeling.map((r) => r.gebruikers))
  return { ...v, totaal: sluitTotaal(v.totaal), verdeling: v.verdeling.map((r, i) => ({ ...r, gebruikers: cellen[i] })) }
}

function sluitSankey(s: GebruikSankey): GebruikSankey {
  const dagen = sluitCellen(s.dagenVerdeling.verdeling.map((d) => d.gebruikers))
  return {
    dagenVerdeling: { totaal: sluitTotaal(s.dagenVerdeling.totaal), verdeling: s.dagenVerdeling.verdeling.map((d, i) => ({ ...d, gebruikers: dagen[i] })) },
    stappen: s.stappen.map((st) => {
      const knopen = sluitCellen(st.knopen.map((kn) => kn.gebruikers))
      return { ...st, totaal: sluitTotaal(st.totaal), knopen: st.knopen.map((kn, i) => ({ ...kn, gebruikers: knopen[i] })) }
    }),
    overgangen: s.overgangen.map((o) => ({ ...o, zichtbaar: false, cellen: [] })),
  }
}

/** Pure vertaling ruw → view-model. Los exporteerbaar voor tests. */
export function naarViewModel(
  ruw: GebruikAnalyseRuw,
  stromen: readonly Waardestroom[],
  sankey: GebruikSankeyResultaat = { status: 'niet-uitgerold' },
): GebruikAnalyse {
  const c = (x: number | null) => onderdrukCel(x)
  const ee = ruw.eerste_ervaring
  const k = ruw.kerncijfers

  const ritme = ruw.ritme.map((r) => {
    // [terug, niet terug] vormen samen `geschikt`: aanvullend onderdrukken.
    // Zonder ritme (Toekomst, Fin) is er geen "op tijd terug": null, geen 0.
    const paar = r.ritme_dagen != null ? onderdrukVerdeling([r.terug, r.niet_terug], r.geschikt) : null
    const geschiktEigen = paar ? paar.totaal : c(r.geschikt)
    // geschikt ⊆ S en gaten ⊆ S (S = gebruikers van deze stroom in de band, zichtbaar
    // in de small multiples), en terug ⊆ gaten. Die paren zijn complementen
    // (security-review 17-09-2026, 🟡1): is er één dicht, dan de hele ritmerij.
    const S = ruw.stromen.find((st) => st.id === r.id)?.gebruikers ?? null
    const complementDicht =
      metComplement(r.geschikt, S).soort === 'verborgen' ||
      (r.gaten_gebruikers != null && r.gaten_gebruikers > 0 && metComplement(r.gaten_gebruikers, S).soort === 'verborgen') ||
      (r.ritme_dagen != null && r.terug != null && r.gaten_gebruikers != null && r.gaten_gebruikers >= r.terug &&
        metComplement(r.terug, r.gaten_gebruikers).soort === 'verborgen')
    const dichtOf = (cel: Cel): Cel => (complementDicht && cel.soort === 'waarde' && cel.n > 0 ? VERBORGEN : cel)
    const geschikt = dichtOf(geschiktEigen)
    const terug = paar ? dichtOf(paar.cellen[0]) : null
    const nietTerug = paar ? dichtOf(paar.cellen[1]) : null
    const gatenZichtbaar = r.gaten_gebruikers != null && r.gaten_gebruikers >= GEBRUIK_K && !complementDicht
    return {
      id: r.id,
      ritmeDagen: r.ritme_dagen,
      geschikt,
      terug,
      nietTerug,
      aandeelTerug: terug ? aandeel(terug, geschikt) : null,
      // De mediaan zelf verraadt geen aantal; hij blijft staan zolang ≥ k bijdragen.
      mediaanDagen: onderdrukCel(r.gaten_gebruikers).soort === 'waarde' && r.gaten_gebruikers !== 0 ? r.mediaan_dagen : null,
      gatenGebruikers: gatenZichtbaar ? c(r.gaten_gebruikers) : null,
    }
  })

  // Verdelingen met een zichtbaar totaal krijgen aanvullende onderdrukking
  // (alles-of-niets, zie onderdrukking.ts). Het totaal geldt als publiek: het
  // segmenttotaal staat bovenaan én onder vier profielverdelingen, de kolommen
  // "aangemeld" en "onboarding klaar" tellen via de rij "eerder" exact op tot hun
  // totaal, en aanmeldingen per (afgekapte) week tot "nieuw in de periode".
  const rondleiding = verdeel(ee.rondleiding, ee.totaal, (r) => ({ uitkomst: r.uitkomst as string }))
  const gids = verdeel(ee.gids, ee.totaal, (r) => ({ stand: r.stand as string }))
  const homeScreen = verdeel(ee.home_screen, ee.totaal, (r) => ({ waarde: r.waarde as string }))
  const displayMode = verdeel(ee.display_mode, ee.totaal, (r) => ({ waarde: r.waarde as string }))
  const aangemeld = onderdrukVerdeling(
    ruw.cohorten.map((h) => h.aangemeld),
    ee.totaal,
  )
  const onboarding = onderdrukVerdeling(
    ruw.cohorten.map((h) => h.onboarding_afgerond),
    ee.onboarding_afgerond,
  )
  const nieuwPerWeek = onderdrukVerdeling(
    ruw.weektrend.map((w) => w.nieuw),
    k.nieuw_venster,
  )

  // Binaire tellingen van het segment tegen hun complement (🟡2).
  const segT = k.segment_totaal
  const laatstActief = verdeel(k.laatst_actief, segT, (r) => ({ wanneer: r.wanneer }))
  // "Actief in de laatste 30 dagen" = vandaag + 1–6 + 7–29. Is één van die drie
  // cellen dicht, dan mag niets anders die som alsnog tonen: de actief-telling van
  // band 30 niet, en het dominant-totaal (modules, laatste 30 dagen) evenmin.
  const recentDicht = laatstActief.verdeling.slice(0, 3).some((r) => r.gebruikers.soort !== 'waarde')
  const actiefVensterEigen = metComplement(k.actief_venster, segT)
  // Band 90: wie laatst actief was 30–89 dagen geleden, zit per definitie in "actief
  // in band 90"; band 365 idem met "90+". Het verschil (= wie daarna terugkwam) is een
  // complement (security-review 17-09-2026, 🟡2). Band 30 is exact de som van drie cellen.
  const deelcel = (w: LaatstActief) => k.laatst_actief.find((x) => x.wanneer === w)?.gebruikers ?? null
  const deelZichtbaar = (w: LaatstActief) =>
    laatstActief.verdeling.find((x) => x.wanneer === w)?.gebruikers.soort === 'waarde'
  const bandDicht =
    ruw.venster_dagen === 30
      ? recentDicht
      : (() => {
          const w: LaatstActief = ruw.venster_dagen === 90 ? '30_89' : '90_plus'
          const L = deelcel(w)
          return !deelZichtbaar(w) || metComplement(L, k.actief_venster).soort === 'verborgen'
        })()
  const actiefVenster: Cel = bandDicht && actiefVensterEigen.soort === 'waarde' ? VERBORGEN : actiefVensterEigen
  const nieuwVenster = metComplement(k.nieuw_venster, segT)
  const onboardingTotaal = metComplement(ee.onboarding_afgerond, ee.totaal)

  // Moest zo'n totaal dicht, dan ook elke verdeling die er exact op optelt —
  // anders geeft de som van haar zichtbare cellen het totaal alsnog prijs.
  const dicht = (c: Cel) => c.soort !== 'waarde'
  const nieuwCellen = dicht(nieuwVenster) ? sluitCellen(nieuwPerWeek.cellen) : nieuwPerWeek.cellen
  const onboardingCellen = dicht(onboardingTotaal) ? sluitCellen(onboarding.cellen) : onboarding.cellen
  const dominantV = verdeel(ruw.dominant.verdeling, ruw.dominant.totaal, (r) => ({ stroom: r.stroom }))
  const overlapV = verdeel(ruw.overlap.verdeling, ruw.overlap.totaal, (r) => ({ aantalStromen: r.aantal_stromen }))
  const sankeyUitkomst: GebruikSankeyResultaat =
    sankey.status === 'ok' && dicht(actiefVenster) ? { status: 'ok', data: sluitSankey(sankey.data) } : sankey

  /** Cohortstap: primair, tegen de partitie over cohorten en tegen elk eigen noemer-complement. */
  const stap = (partitieCel: Cel | null, x: number | null, ...noemers: Array<number | null>): Cel => {
    const eigen = metComplement(x, ...noemers)
    if (eigen.soort !== 'waarde') return eigen
    return partitieCel && partitieCel.soort !== 'waarde' ? VERBORGEN : eigen
  }

  return {
    k: ruw.k,
    sankey: sankeyUitkomst,
    vensterDagen: ruw.venster_dagen,
    band: GEBRUIK_BANDEN[ruw.venster_dagen],
    intern: ruw.intern,
    gemetenSindsWeek: ruw.gemeten_sinds_week,
    modulesGemetenSindsWeek: ruw.modules_gemeten_sinds_week,
    stromen: stromen.map((s, i) => ({
      id: s.id,
      naam: s.naam,
      modules: [...s.modules],
      kleurIndex: i,
      ritmeDagen: ritmeVoorStroom(s.id),
      ritmeLabel: STROOM_RITME_LABEL[s.id] ?? null,
    })),
    kerncijfers: {
      segmentTotaal: c(k.segment_totaal),
      laatstActief,
      actiefVenster,
      nieuwVenster,
    },
    weektrend: ruw.weektrend.map((w, i) => ({ week: w.week, actief: c(w.actief), nieuw: nieuwCellen[i] })),
    stroomWeken: ruw.stromen.map((s) => ({
      id: s.id,
      gebruikers: c(s.gebruikers),
      weken: s.weken.map((w) => ({ week: w.week, actief: c(w.actief) })),
    })),
    // Dominant-totaal (modules, 30 d) en overlap-totaal (venster) vallen in de praktijk
    // samen met actief 30 d en actief in de periode: moest dat dicht, dan deze ook.
    dominant: recentDicht ? sluitVerdeling(dominantV) : dominantV,
    overlap: dicht(actiefVenster) ? sluitVerdeling(overlapV) : overlapV,
    ritme,
    samen: {
      modules: ruw.samen.modules.map((m) => ({ module: m.module, gebruikers: c(m.gebruikers) })),
      paren: ruw.samen.paren.map((p) => ({ a: p.a, b: p.b, gebruikers: c(p.gebruikers) })),
    },
    cohorten: ruw.cohorten.map((h, i) => ({
      maand: h.maand,
      dekking: h.dekking,
      aangemeld: aangemeld.cellen[i],
      onboardingAfgerond: stap(onboardingCellen[i], h.onboarding_afgerond, h.aangemeld),
      gemeten: metComplement(h.gemeten, h.aangemeld),
      eersteDag: stap(null, h.eerste_dag, h.gemeten),
      // tweede ⊆ eerste: ook het verschil ("precies één dag") is een complement.
      tweedeDag: stap(null, h.tweede_dag, h.gemeten, h.eerste_dag),
      week25Noemer: metComplement(h.week2_5_noemer, h.gemeten),
      week25: stap(null, h.week2_5, h.week2_5_noemer),
      maand2Noemer: metComplement(h.maand2_noemer, h.gemeten),
      maand2: stap(null, h.maand2, h.maand2_noemer),
    })),
    eersteErvaring: {
      totaal: c(ee.totaal),
      onboardingAfgerond: onboardingTotaal,
      rondleiding,
      gids,
      uitgesteld: ee.uitgesteld.map((u) => ({ veld: u.veld, gebruikers: c(u.gebruikers) })),
      briefingMailAan: metComplement(ee.briefing_mail_aan, ee.totaal),
      checkinMinstensEen: metComplement(ee.checkin_minstens_een, ee.totaal),
      homeScreen,
      displayMode,
    },
  }
}

/**
 * Laad de analyse. `service` MOET de service-role-client zijn en de aanroeper
 * MOET de superadmin-check al gedaan hebben (zie de pagina).
 */
export async function laadGebruikAnalyse(
  service: SupabaseClient,
  opties: { dagen: GebruikPeriode; intern: boolean },
): Promise<GebruikAnalyseResultaat> {
  const { dagen, intern } = opties
  const configRes = await service.from('app_settings').select('value').eq('key', WAARDESTROMEN_SLEUTEL).maybeSingle()
  // Een leesfout op de config is geen reden om te stoppen: de standaardindeling
  // is dan het eerlijke vertrekpunt (zelfde gedrag als GET /api/admin/waardestromen).
  const stromen = parseWaardestromen((configRes.data as { value?: unknown } | null)?.value ?? null).stromen

  const args = { p_dagen: dagen, p_intern: intern, p_config: bouwRpcConfig(stromen) }
  const [rpc, doorstroomRpc] = await Promise.all([
    service.rpc('admin_gebruik_analyse', args),
    service.rpc('admin_gebruik_doorstroom', args),
  ])
  if (rpc.error) {
    if (isOntbrekendSchema(rpc.error)) return { status: 'niet-uitgerold', vensterDagen: dagen, intern }
    console.error('[beheer:gebruik] admin_gebruik_analyse', rpc.error)
    return { status: 'fout', vensterDagen: dagen, intern }
  }

  const parsed = GebruikAnalyseRuwSchema.safeParse(rpc.data)
  if (!parsed.success || parsed.data.k !== GEBRUIK_K || !bandKlopt(parsed.data.band, dagen)) {
    console.error('[beheer:gebruik] onverwachte vorm', parsed.success ? `k=${parsed.data.k}` : parsed.error.issues.slice(0, 5))
    return { status: 'fout', vensterDagen: dagen, intern }
  }
  const idsDb = parsed.data.stromen.map((s) => s.id).join(',')
  if (idsDb !== stromen.map((s) => s.id).join(',')) {
    console.error('[beheer:gebruik] stroom-ids wijken af van de config')
    return { status: 'fout', vensterDagen: dagen, intern }
  }
  return { status: 'ok', data: naarViewModel(parsed.data, stromen, sankeyUit(doorstroomRpc, stromen, dagen, intern)) }
}

function bandKlopt(band: { van_dagen_geleden: number; tot_dagen_geleden: number }, dagen: GebruikPeriode): boolean {
  const verwacht = GEBRUIK_BANDEN[dagen]
  return band.van_dagen_geleden === verwacht.vanDagenGeleden && band.tot_dagen_geleden === verwacht.totDagenGeleden
}

/** De Sankey valt apart terug: een ontbrekende of kapotte doorstroom laat de rest van de pagina staan. */
function sankeyUit(
  rpc: { data: unknown; error: unknown },
  stromen: readonly Waardestroom[],
  dagen: GebruikPeriode,
  intern: boolean,
): GebruikSankeyResultaat {
  if (rpc.error) {
    if (isOntbrekendSchema(rpc.error)) return { status: 'niet-uitgerold' }
    console.error('[beheer:gebruik] admin_gebruik_doorstroom', rpc.error)
    return { status: 'fout' }
  }
  const parsed = DoorstroomRuwSchema.safeParse(rpc.data)
  const knoopVolgorde = [...stromen.map((s) => s.id), KNOOP_MEERDERE, KNOOP_GEEN].join(',')
  if (
    !parsed.success ||
    parsed.data.k !== GEBRUIK_K ||
    parsed.data.venster_dagen !== dagen ||
    !bandKlopt(parsed.data.band, dagen) ||
    parsed.data.intern !== intern ||
    parsed.data.stappen.some((s) => s.knopen.map((k) => k.knoop).join(',') !== knoopVolgorde)
  ) {
    console.error('[beheer:gebruik] doorstroom: onverwachte vorm')
    return { status: 'fout' }
  }
  return { status: 'ok', data: naarSankey(parsed.data) }
}
