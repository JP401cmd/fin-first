import type { SupabaseClient } from '@supabase/supabase-js'
import type { GebruikerContext } from './verspreiding'
import { dominanteStroom, parseWaardestromen, WAARDESTROMEN_SLEUTEL } from '@/lib/waardestromen'
import { leesBeheerInstelling } from '@/lib/app-settings/beheer-instelling'

/**
 * De eigen-rij meta waarop verspreidingsregels worden getoetst (ADR 0147).
 *
 * De eigen rijen zijn leesbaar met de SESSIE-client van de gebruiker zelf: de
 * eigen profielrij, de eigen activiteitsdagen, de eigen module-dagen. Alleen de
 * globale waardestromen-config is beheer-content en komt server-side via de
 * service-role (`leesBeheerInstelling`, ADR 0163) — nog steeds geen inhoud van
 * andere gebruikers, precies dezelfde grens als ADR 0146 aan de beheerkant.
 *
 * Tolerant: een tabel die nog niet is uitgerold (`user_activity_days`,
 * `user_activity_modules`) levert `null`, en een regel op null-meta matcht
 * nooit. Liever een lijst die pas verschijnt zodra de meting draait dan een 500
 * in de chat.
 */

export interface GebruikerContextOpties {
  /**
   * Ook de dominante waardestroom berekenen (fase 2). Alleen nodig als een regel
   * `dominante_stroom` in het spel is — anders twee queries verspilling.
   */
  metStromen?: boolean
}

export async function laadGebruikerContext(
  supabase: SupabaseClient,
  userId: string,
  nu: Date = new Date(),
  opties: GebruikerContextOpties = {},
): Promise<GebruikerContext> {
  const sinds30 = new Date(nu.getTime() - 30 * 86_400_000).toISOString().slice(0, 10)

  const [profielRes, dagenRes, laatsteRes, modulesRes, stromenWaarde] = await Promise.all([
    supabase.from('profiles').select('created_at').eq('id', userId).maybeSingle(),
    supabase
      .from('user_activity_days')
      .select('day', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('day', sinds30),
    supabase
      .from('user_activity_days')
      .select('day')
      .eq('user_id', userId)
      .order('day', { ascending: false })
      .limit(1),
    opties.metStromen
      ? supabase
          .from('user_activity_modules')
          .select('day, module')
          .eq('user_id', userId)
          .gte('day', sinds30)
          // 31 dagen × 11 modules — ruim boven het maximum, dus nooit stil afgekapt.
          .limit(400)
      : Promise.resolve(null),
    // De waardestromen-indeling is beheer-content: server-side via de
    // service-role (ADR 0163), niet via de sessie-client van de gebruiker.
    opties.metStromen ? leesBeheerInstelling(WAARDESTROMEN_SLEUTEL) : Promise.resolve(null),
  ])

  const registratieIso = (profielRes.data as { created_at?: string | null } | null)?.created_at ?? null
  const registratie = registratieIso ? new Date(registratieIso) : null

  const actieveDagen30 = dagenRes.error ? null : (dagenRes.count ?? 0)
  const laatsteDag = laatsteRes.error ? null : ((laatsteRes.data?.[0] as { day?: string } | undefined)?.day ?? null)
  const laatstActief = laatsteDag ? new Date(`${laatsteDag}T12:00:00Z`) : null

  let stroom: string | null = null
  let dagenPerStroom: Record<string, number> | undefined
  if (modulesRes && !modulesRes.error && modulesRes.data) {
    // Een ontbrekende config-rij is geen fout: dan geldt de standaardindeling.
    const config = parseWaardestromen(stromenWaarde)
    const uitkomst = dominanteStroom(modulesRes.data as { day: string; module: string }[], config)
    stroom = uitkomst.stroom
    dagenPerStroom = uitkomst.dagenPerStroom
  }

  return {
    registratie: registratie && !Number.isNaN(registratie.getTime()) ? registratie : null,
    actieveDagen30,
    laatstActief: laatstActief && !Number.isNaN(laatstActief.getTime()) ? laatstActief : null,
    dominanteStroom: stroom,
    ...(dagenPerStroom ? { dagenPerStroom } : {}),
    nu,
  }
}
