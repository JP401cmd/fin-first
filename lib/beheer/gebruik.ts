import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Gebruiksprofiel van één gebruiker voor /beheer/gebruikers — ADR 0146
 * "Beheer ziet gebruik, geen inhoud".
 *
 * Dit vervangt de oude financiële supportview (vermogen, schulden, rekeningen
 * met saldo) en de admin-export. De grens:
 *
 *   - WEL: dát en wanneer iemand iets deed, en hoeveel records er bestaan.
 *   - NIET: bedragen, namen van rekeningen/bezittingen, omschrijvingen,
 *     tegenpartijen, check-in-cijfers of -tekst, chat (titels of inhoud).
 *
 * Elke query hieronder selecteert daarom uitsluitend meta-kolommen
 * (`created_at`, `status`, `feature`, `feature_slug`, `key`) of is een
 * head-only telling. `lib/beheer/geen-inhoud.test.ts` scant de beheer-bronnen
 * en wordt rood zodra een financiële tabel met een inhoudskolom gelezen wordt.
 *
 * Chat blijft er bewust helemaal buiten: de migratie van de gespreks-
 * geschiedenis (ADR 0137) belooft dat er geen service-role-leespad op die
 * tabellen bestaat — ook geen telling.
 */

export interface GebruikAiFunctie {
  feature: string
  aanroepen: number
}

/** Aantal nieuwste AI-aanroepen waarover de verdeling per functie wordt geteld. */
export const AI_STEEKPROEF = 1000

/** Tellingen zijn `null` als de query faalde (of de meting nog niet bestaat) — nooit een stille 0. */
export interface GebruikersActiviteit {
  /** Aantal dagen met app-gebruik in de laatste 30 dagen; null = nog niet gemeten/onbekend. */
  actieveDagen30: number | null
  laatsteActieveDag: string | null
  aiAanroepen30: number | null
  aiPerFunctie: GebruikAiFunctie[]
  /** true = de verdeling per functie beslaat alleen de nieuwste {@link AI_STEEKPROEF} aanroepen. */
  aiPerFunctieSteekproef: boolean
  /** Apps waarvan de setup is afgerond (slug zonder `_setup_completed`). */
  appsIngericht: string[]
  gidsStappenBekeken: number
  aantallen: {
    bezittingen: number | null
    schulden: number | null
    transacties: number | null
    /** Moment waarop het laatst een transactie werd toegevoegd (import/sync/handmatig). */
    laatsteTransactieToegevoegd: string | null
  }
  bank: {
    koppelingen: number | null
    laatsteSync: string | null
    laatsteSyncStatus: string | null
  }
  /** Maanden (YYYY-MM) waarin een check-in is opgeslagen — alleen dát, niet wat. */
  checkinMaanden: string[]
  meldingen: number | null
}

/** Tel AI-aanroepen per functie, meest gebruikte eerst. */
export function groepeerAiAanroepen(rows: { feature: string | null }[]): GebruikAiFunctie[] {
  const tel = new Map<string, number>()
  for (const r of rows) {
    const f = r.feature || 'onbekend'
    tel.set(f, (tel.get(f) ?? 0) + 1)
  }
  return [...tel.entries()]
    .map(([feature, aanroepen]) => ({ feature, aanroepen }))
    .sort((a, b) => b.aanroepen - a.aanroepen || a.feature.localeCompare(b.feature))
}

const SETUP_SUFFIX = '_setup_completed'

/** Splits de feature-visit-markers in afgeronde app-setups en bekeken gidsstappen. */
export function duidFeatureVisits(slugs: string[]): { appsIngericht: string[]; gidsStappenBekeken: number } {
  const appsIngericht = slugs
    .filter((s) => s.endsWith(SETUP_SUFFIX))
    .map((s) => s.slice(0, -SETUP_SUFFIX.length))
    .sort()
  const gidsStappenBekeken = slugs.filter((s) => s.startsWith('guide_')).length
  return { appsIngericht, gidsStappenBekeken }
}

/**
 * Maanden uit de check-in-sleutels `checkin_snapshot_<uid>_<YYYY-MM>`. Alleen
 * de sleutelnaam wordt gelezen, nooit de waarde. Nieuwste eerst.
 */
export function checkinMaandenUitSleutels(keys: string[], userId: string): string[] {
  const prefix = `checkin_snapshot_${userId}_`
  const maanden = keys
    .filter((k) => k.startsWith(prefix))
    .map((k) => k.slice(prefix.length))
    .filter((m) => /^\d{4}-\d{2}$/.test(m))
  return [...new Set(maanden)].sort().reverse()
}

function isoDagenGeleden(dagen: number, nu: Date): string {
  const d = new Date(nu)
  d.setUTCDate(d.getUTCDate() - dagen)
  return d.toISOString()
}

/**
 * Laad het gebruiksprofiel. `service` MOET de service-role-client zijn (cross-
 * user lezen) en de aanroeper MOET de superadmin-check al gedaan hebben.
 */
export async function laadGebruikersActiviteit(
  service: SupabaseClient,
  userId: string,
  nu: Date = new Date(),
): Promise<GebruikersActiviteit> {
  const sinds30 = isoDagenGeleden(30, nu)
  const dag30 = sinds30.slice(0, 10)

  const [
    dagenRes,
    laatsteDagRes,
    aiTelRes,
    aiRes,
    visitsRes,
    bezitRes,
    schuldRes,
    txCountRes,
    laatsteTxRes,
    koppelRes,
    syncRes,
    checkinRes,
    meldingRes,
  ] = await Promise.all([
    service
      .from('user_activity_days')
      .select('day', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('day', dag30),
    service
      .from('user_activity_days')
      .select('day')
      .eq('user_id', userId)
      .order('day', { ascending: false })
      .limit(1),
    // Totaal als head-telling: een rij-select kapt stil af op PostgREST
    // max_rows (1000, ADR 0050) — het totaal mag daar nooit van afhangen.
    service
      .from('ai_token_usage')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', sinds30),
    // Verdeling per functie over de nieuwste AI_STEEKPROEF aanroepen.
    service
      .from('ai_token_usage')
      .select('feature')
      .eq('user_id', userId)
      .gte('created_at', sinds30)
      .order('created_at', { ascending: false })
      .limit(AI_STEEKPROEF),
    service.from('user_feature_visits').select('feature_slug').eq('user_id', userId),
    service.from('assets').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_active', true),
    service.from('debts').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_active', true),
    service.from('transactions').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    service
      .from('transactions')
      .select('created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1),
    service
      .from('bank_connections')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_active', true),
    service
      .from('bank_sync_log')
      .select('created_at, status')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1),
    service.from('app_settings').select('key').like('key', `checkin_snapshot_${userId}_%`),
    service.from('user_reports').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ])

  // Een mislukte query wordt null ("onbekend"), nooit een misleidende 0 —
  // "0 transacties" is voor support een ander verhaal dan "kon niet tellen".
  // Voor user_activity_days betekent null ook: tabel nog niet uitgerold.
  const aiRows = aiRes.error ? [] : ((aiRes.data ?? []) as { feature: string | null }[])
  const aiTotaal = telling(aiTelRes)
  const slugs = ((visitsRes.data ?? []) as { feature_slug: string }[]).map((v) => v.feature_slug)
  const sync = (syncRes.data?.[0] ?? null) as { created_at: string; status: string } | null

  return {
    actieveDagen30: telling(dagenRes),
    laatsteActieveDag: (laatsteDagRes.data?.[0]?.day as string | undefined) ?? null,
    aiAanroepen30: aiTotaal,
    aiPerFunctie: groepeerAiAanroepen(aiRows),
    aiPerFunctieSteekproef: aiTotaal !== null && aiTotaal > aiRows.length,
    ...duidFeatureVisits(slugs),
    aantallen: {
      bezittingen: telling(bezitRes),
      schulden: telling(schuldRes),
      transacties: telling(txCountRes),
      laatsteTransactieToegevoegd: (laatsteTxRes.data?.[0]?.created_at as string | undefined) ?? null,
    },
    bank: {
      koppelingen: telling(koppelRes),
      laatsteSync: sync?.created_at ?? null,
      laatsteSyncStatus: sync?.status ?? null,
    },
    checkinMaanden: checkinMaandenUitSleutels(
      ((checkinRes.data ?? []) as { key: string }[]).map((r) => r.key),
      userId,
    ),
    meldingen: telling(meldingRes),
  }
}

/** Head-telling → getal, of null als de query faalde. */
export function telling(res: { count: number | null; error: unknown }): number | null {
  return res.error ? null : (res.count ?? 0)
}
