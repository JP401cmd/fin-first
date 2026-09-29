// ── verversEigenTijdlijn: één verversing op verzoek van de lezer zelf ────────
//
// Krant 1C fase 2 (U11 "en een knop"). Eén helper voor twee ingangen: de
// knop "Vernieuwen" op /nieuws (POST /api/krant/tijdlijn/vernieuwen) en de
// laatste stap van de 2C-onboarding. Beide roepen hem aan met de id uit de
// SESSIE (auth.getUser), nooit met een id uit het verzoek.
//
// Schrijven gaat met de service-role, want krant_edities/items hebben bewust
// geen INSERT-policy voor sessies (migratie 20260922120000). Elke query draagt
// daarom een expliciete `.eq(…, userId)` op de eigen id.
//
// De rem (besluit 28-09, K-d): hoogstens één verversing per
// VERNIEUW_INTERVAL_MS, en "niets nieuws" zonder schrijven als er sinds de
// vorige verversing geen artikel is geduid. Zo levert een knop die iemand
// blijft indrukken geen lege rijen en geen matcherwerk op.
//
// Wie: alleen een lezer wiens /nieuws de tijdlijn ís (bepaalKrantBron, B40) en
// die de module nieuws heeft. Een bezwaar tegen de schaduwrun
// (profiles.krant_schaduw_bezwaar_at) staat de knop NIET in de weg: dat
// bezwaar gaat over verwerking op de achtergrond; de knop is het eigen,
// expliciete verzoek van de lezer.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getAowLeeftijden } from '@/lib/reference-cache'
import { isNewsOnly, resolveActiveModules } from '@/lib/modules/resolve'
import { laadKandidaten } from './editie-loader'
import { ruimTijdlijnOp, ververs } from './tijdlijn-run'
import { aiKrantToegestaan, bepaalKrantBron } from './tijdlijn-bron'
import { inTijdlijnBeta } from './tijdlijn-beta'

/** Hoogstens één verversing per tien minuten (K-d, 28-09). */
export const VERNIEUW_INTERVAL_MS = 10 * 60 * 1000

export type VernieuwUitkomst =
  | { status: 'ververst'; items: number; leeg: boolean }
  | { status: 'niets-nieuws' }
  | { status: 'te-snel'; opnieuwVanaf: string }
  | { status: 'geen-tijdlijn' }

export async function verversEigenTijdlijn(service: SupabaseClient, userId: string, opts: { now?: Date } = {}): Promise<VernieuwUitkomst> {
  const now = opts.now ?? new Date()

  const [profielRes, nieuwsRes, laatsteRes] = await Promise.all([
    service.from('profiles').select('role, active_modules, active_subscriptions, ai_enabled').eq('id', userId).maybeSingle(),
    service.from('nieuwsprofiel').select('krant_variant').eq('user_id', userId).maybeSingle(),
    service
      .from('krant_edities')
      .select('created_at')
      .eq('user_id', userId)
      .eq('bron', 'tijdlijn')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  if (profielRes.error) throw new Error(`[krant/tijdlijn-vernieuwen] profiel lezen mislukt: ${profielRes.error.message}`)
  if (nieuwsRes.error) throw new Error(`[krant/tijdlijn-vernieuwen] variant lezen mislukt: ${nieuwsRes.error.message}`)
  if (laatsteRes.error) throw new Error(`[krant/tijdlijn-vernieuwen] laatste verversing lezen mislukt: ${laatsteRes.error.message}`)
  if (!profielRes.data) return { status: 'geen-tijdlijn' }

  const modules = resolveActiveModules(profielRes.data)
  const variant = nieuwsRes.data?.krant_variant === 'ai' ? 'ai' : nieuwsRes.data?.krant_variant === 'tijdlijn' ? 'tijdlijn' : null
  const bron = bepaalKrantBron({
    krantAccount: isNewsOnly(modules),
    variant,
    inBeta: inTijdlijnBeta(profielRes.data.role as string | null),
    aiToegestaan: aiKrantToegestaan(profielRes.data),
  })
  if (bron !== 'tijdlijn' || !modules.includes('nieuws')) return { status: 'geen-tijdlijn' }

  // De rem is een ATOMAIRE claim op nieuwsprofiel.tijdlijn_vernieuwd_at
  // (eindreview Y3 / security Y1, 29-09): update … where (null of ouder dan
  // tien minuten) returning. Postgres toetst de WHERE opnieuw onder de rijlock,
  // dus van N gelijktijdige klikken wint er precies één. De kolom is
  // service-only en wisTijdlijn raakt hem niet: wisselen van variant reset de
  // rem niet. Eerst een rij garanderen (een nieuwe lezer heeft er nog geen).
  const { error: rijFout } = await service.from('nieuwsprofiel').upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true })
  if (rijFout) throw new Error(`[krant/tijdlijn-vernieuwen] profielrij garanderen mislukt: ${rijFout.message}`)
  const grens = new Date(now.getTime() - VERNIEUW_INTERVAL_MS).toISOString()
  const { data: claim, error: claimFout } = await service
    .from('nieuwsprofiel')
    .update({ tijdlijn_vernieuwd_at: now.toISOString() })
    .eq('user_id', userId)
    .or(`tijdlijn_vernieuwd_at.is.null,tijdlijn_vernieuwd_at.lt."${grens}"`)
    .select('tijdlijn_vernieuwd_at')
  if (claimFout) throw new Error(`[krant/tijdlijn-vernieuwen] rem claimen mislukt: ${claimFout.message}`)
  if ((claim ?? []).length !== 1) {
    const { data: rem } = await service.from('nieuwsprofiel').select('tijdlijn_vernieuwd_at').eq('user_id', userId).maybeSingle()
    const sinds = (rem?.tijdlijn_vernieuwd_at as string | null | undefined) ?? now.toISOString()
    return { status: 'te-snel', opnieuwVanaf: new Date(new Date(sinds).getTime() + VERNIEUW_INTERVAL_MS).toISOString() }
  }

  const vorige = (laatsteRes.data?.created_at as string | undefined) ?? null
  if (vorige) {
    // Niets nieuws geduid sinds de vorige verversing → niets te doen, niets schrijven.
    const { count, error } = await service
      .from('news_articles')
      .select('id', { count: 'exact', head: true })
      .eq('duiding_status', 'geduid')
      .gt('geduid_at', vorige)
    if (error) throw new Error(`[krant/tijdlijn-vernieuwen] nieuw-geduid tellen mislukt: ${error.message}`)
    if ((count ?? 0) === 0) return { status: 'niets-nieuws' }
  }

  const [{ artikelen }, aowRows] = await Promise.all([laadKandidaten(service, now), getAowLeeftijden(service)])
  try {
    const uitkomst = await ververs(service, { userId, now, aowRows, kandidaten: artikelen })
    await ruimTijdlijnOp(service, userId, now)
    return { status: 'ververst', items: uitkomst.items, leeg: uitkomst.leeg }
  } catch (err) {
    // 23505: de cron (of een tweede klik) was net eerder — de compensatie in
    // schrijfEditie haalde deze verversing weg, er staat niets dubbel.
    if (err instanceof Error && /23505|duplicate key/i.test(err.message)) return { status: 'niets-nieuws' }
    throw err
  }
}
