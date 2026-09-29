// ── Nieuwsprofiel via de native API (Krant 3A, ADR 0187) ─────────────────────
//
// De vertaling tussen de `nieuwsprofiel`-rij en de v1-contractvorm
// (`profielResponseSchema` / `profielPutBodySchema` in lib/krant/contract.ts),
// plus de twee DB-stappen van de route. Geen eigen validatie van banden: die
// staat in `nieuwsprofielV1Schema` (lib/krant/profiel.ts) en de CHECKs van
// migratie 20260922120000.
//
// Schrijven = own-row read-modify-write via de BEARER-client (RLS: eigen rij),
// spiegel van app/api/appearance. De kolomgrant van migratie 20261004120000
// laat een sessie alleen de profielvelden, `herkomst`, `tijdlijn_gelezen_tot`,
// `updated_at` en `user_id` schrijven — `krant_variant`, `afgeleid_at` en
// `tijdlijn_vernieuwd_at` kan deze code dus niet eens raken, ook niet per
// ongeluk. `putNaarKolommen` noemt ze bovendien nooit (v1-profiel.test.ts).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { z } from 'zod'
import type { ProfielPutBody, profielResponseSchema } from './contract'
import { PROFIEL_VERSIE, type NieuwsprofielV1 } from './profiel'
import { PROFIEL_VELDEN, type ProfielVeld } from './profiel-velden'
import { zelfWaarde, type Herkomst, type NieuwsprofielRij } from './profiel-afleiding'

export type ProfielV1Response = z.infer<typeof profielResponseSchema>

/** Wat de route van de rij leest — expliciet, geen `*` (dus nooit krant_variant/tijdlijn-kolommen). */
export const NIEUWSPROFIEL_V1_KOLOMMEN =
  'user_id, profiel_versie, geboortejaar, huishouden, kinderen, werk, inkomen, wonen, hypotheek_restschuld, hypotheek_rentevast, woonplan, spaargeld, beleggingen, beleggingen_vorm, schulden, pensioen_werkgever, pensioen_lijfrente, rubrieken, herkomst, afgeleid_at'

/** Alleen bekende velden met een bekende herkomst — de jsonb-kolom is niet getypeerd. */
export function schoneHerkomst(ruw: unknown): Herkomst {
  const uit: Herkomst = {}
  if (!ruw || typeof ruw !== 'object' || Array.isArray(ruw)) return uit
  for (const veld of PROFIEL_VELDEN) {
    const w = (ruw as Record<string, unknown>)[veld]
    if (w === 'zelf' || w === 'afgeleid') uit[veld] = w
  }
  return uit
}

/**
 * De rij naar de contractvorm. PER VELD gevalideerd (`zelfWaarde`): één
 * ongeldige kolom maakt alleen dat veld `null`, niet het hele profiel leeg.
 * Geen rij = het lege profiel.
 */
export function rijNaarV1Profiel(rij: NieuwsprofielRij | null): ProfielV1Response {
  const profiel = { versie: PROFIEL_VERSIE } as Record<string, unknown>
  for (const veld of PROFIEL_VELDEN) profiel[veld] = rij ? zelfWaarde(rij, veld) : leegVeld(veld)
  return {
    profiel: profiel as NieuwsprofielV1,
    herkomst: schoneHerkomst(rij?.herkomst),
    afgeleidAt: rij?.afgeleid_at ?? null,
  }
}

function leegVeld(veld: ProfielVeld): unknown {
  if (veld === 'hypotheek') return { restschuld: null, rentevast: null }
  if (veld === 'beleggingen') return { band: null, vorm: null }
  if (veld === 'pensioenopbouw') return { werkgever: null, lijfrente: null }
  return null
}

/** Eén profielveld naar zijn kolom(men) in `nieuwsprofiel`. */
function veldNaarKolommen<K extends ProfielVeld>(veld: K, waarde: NieuwsprofielV1[K]): Record<string, unknown> {
  switch (veld) {
    case 'hypotheek': {
      const h = waarde as NieuwsprofielV1['hypotheek']
      return { hypotheek_restschuld: h.restschuld, hypotheek_rentevast: h.rentevast }
    }
    case 'beleggingen': {
      const b = waarde as NieuwsprofielV1['beleggingen']
      return { beleggingen: b.band, beleggingen_vorm: b.vorm }
    }
    case 'pensioenopbouw': {
      const p = waarde as NieuwsprofielV1['pensioenopbouw']
      return { pensioen_werkgever: p.werkgever, pensioen_lijfrente: p.lijfrente }
    }
    default:
      return { [veld]: waarde }
  }
}

/**
 * De PUT-body naar de upsert-rij: alleen de meegegeven velden, elk met
 * herkomst `zelf` bovenop de bestaande herkomst. Nooit krant_variant,
 * afgeleid_at of tijdlijn_* — die staan niet in de body en worden hier niet
 * genoemd.
 */
export function putNaarKolommen(
  body: ProfielPutBody,
  bestaandeHerkomst: Herkomst,
  userId: string,
  nu: string,
): Record<string, unknown> {
  const herkomst: Herkomst = { ...bestaandeHerkomst }
  let kolommen: Record<string, unknown> = {}
  for (const veld of PROFIEL_VELDEN) {
    if (!(veld in body)) continue
    kolommen = { ...kolommen, ...veldNaarKolommen(veld, body[veld] as NieuwsprofielV1[typeof veld]) }
    herkomst[veld] = 'zelf'
  }
  return { user_id: userId, ...kolommen, herkomst, updated_at: nu }
}

/** De eigen rij, of null. `.eq('user_id')` bovenop de own-row-RLS: scoping leesbaar in de bron. */
export async function leesEigenProfiel(client: SupabaseClient, userId: string): Promise<NieuwsprofielRij | null> {
  const { data, error } = await client
    .from('nieuwsprofiel')
    .select(NIEUWSPROFIEL_V1_KOLOMMEN)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return (data as NieuwsprofielRij | null) ?? null
}

/** Read-modify-write op de eigen rij; geeft de rij na het schrijven terug. */
export async function schrijfEigenProfiel(
  client: SupabaseClient,
  userId: string,
  body: ProfielPutBody,
  nu: Date = new Date(),
): Promise<NieuwsprofielRij> {
  const bestaand = await leesEigenProfiel(client, userId)
  const rij = putNaarKolommen(body, schoneHerkomst(bestaand?.herkomst), userId, nu.toISOString())
  const { data, error } = await client
    .from('nieuwsprofiel')
    .upsert(rij, { onConflict: 'user_id' })
    .select(NIEUWSPROFIEL_V1_KOLOMMEN)
    .single()
  if (error) throw error
  return data as NieuwsprofielRij
}
