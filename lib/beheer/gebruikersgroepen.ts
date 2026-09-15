import type { SupabaseClient } from '@supabase/supabase-js'
import { parseGroepRegels, type GroepSoort } from '@/lib/gebruikersgroepen'
import type { Regel } from '@/lib/questionnaires/verspreiding'

/**
 * Serverhelpers voor het beheer van gebruikersgroepen (ADR 0147, fase 3).
 *
 * UITSLUITEND met de service-role-client, en uitsluitend ná `superadminGate()`:
 * `user_groups` en `user_group_members` hebben geen superadmin-tak in RLS.
 *
 * GRENS (ADR 0146). Beheer leest hier configuratie die het zelf maakte (naam,
 * omschrijving, regels) en lidmaatschap dat het zelf koos, plus het e-mailadres
 * van de gekozen personen om ze te herkennen. Geen antwoorden, geen bedragen,
 * geen gebruiksinhoud. Staat deze map daarom in de bron-gate
 * (`lib/beheer/geen-inhoud.test.ts`), dan is dat bewust.
 *
 * AFKAPPEN. PostgREST kapt een lezing stil af op `max_rows` (standaard 1000);
 * een statische groep mag er tot 2000 leden hebben. Ledenlijsten worden daarom
 * gepagineerd gelezen en e-mailadressen in stukken opgehaald — een stil
 * afgekapte lijst zou bij het synchroniseren leden onterecht "nieuw" maken.
 */

/** Client-veilige melding (503) zolang de groepen-migratie niet is uitgerold. */
export const NIET_UITGEROLD = 'Gebruikersgroepen zijn nog niet beschikbaar'

export const GROEP_BEHEER_KOLOMMEN = 'id, naam, omschrijving, soort, regels, created_at, updated_at'

/** Paginagrootte ruim onder `max_rows`, zodat een volle pagina altijd "er is meer" betekent. */
const LEDEN_PAGINA = 500

/** Stukgrootte voor `.in()`-filters en RPC-argumenten: houdt de URL/body klein. */
export const ID_STUK = 200

export interface BeheerGroepRij {
  id: string
  naam: string
  omschrijving: string | null
  soort: GroepSoort
  regels: unknown
  created_at: string
  updated_at: string
}

export interface BeheerGroep {
  id: string
  naam: string
  omschrijving: string | null
  soort: GroepSoort
  /** `null` bij een statische groep; bij een dynamische de (null-veilig) geparste regels. */
  regels: Regel[] | null
  created_at: string
  updated_at: string
}

export function naarBeheerGroep(rij: BeheerGroepRij): BeheerGroep {
  return {
    id: rij.id,
    naam: rij.naam,
    omschrijving: rij.omschrijving ?? null,
    soort: rij.soort,
    regels: rij.soort === 'dynamisch' ? parseGroepRegels(rij.regels) : null,
    created_at: rij.created_at,
    updated_at: rij.updated_at,
  }
}

export function inStukken<T>(lijst: readonly T[], grootte: number = ID_STUK): T[][] {
  const stukken: T[][] = []
  for (let i = 0; i < lijst.length; i += grootte) stukken.push(lijst.slice(i, i + grootte))
  return stukken
}

export interface GroepLidRij {
  user_id: string
  added_at: string | null
}

/**
 * Alle leden van één groep, gepagineerd. Geeft `{ error }` door zodat de
 * aanroeper kan kiezen tussen een lege stand (tabel ontbreekt) en een 500.
 */
export async function laadLedenVanGroep(
  service: SupabaseClient,
  groupId: string,
): Promise<{ data: GroepLidRij[]; error: unknown }> {
  const leden: GroepLidRij[] = []
  for (let van = 0; ; van += LEDEN_PAGINA) {
    const { data, error } = await service
      .from('user_group_members')
      .select('user_id, added_at')
      .eq('group_id', groupId)
      .order('user_id', { ascending: true })
      .range(van, van + LEDEN_PAGINA - 1)
    if (error) return { data: leden, error }
    const pagina = (data ?? []) as GroepLidRij[]
    leden.push(...pagina)
    if (pagina.length < LEDEN_PAGINA) return { data: leden, error: null }
  }
}

/**
 * E-mailadressen bij user-id's via de service-role-only RPC
 * `admin_emails_for_user_ids`. Tolerant: een ontbrekende RPC of een fout geeft
 * een lege map, en de aanroeper toont dan `email: null` — een ledenlijst zonder
 * adressen is beter dan geen ledenlijst.
 */
export async function emailsVoorUserIds(
  service: SupabaseClient,
  userIds: readonly string[],
): Promise<Map<string, string | null>> {
  const emails = new Map<string, string | null>()
  for (const stuk of inStukken(userIds)) {
    const { data, error } = await service.rpc('admin_emails_for_user_ids', { p_ids: stuk })
    if (error) {
      console.error('[beheer:gebruikersgroepen] admin_emails_for_user_ids faalde', (error as { code?: string }).code)
      return emails
    }
    for (const r of (data ?? []) as { id?: string | null; email?: string | null }[]) {
      if (r.id) emails.set(r.id, r.email ?? null)
    }
  }
  return emails
}
