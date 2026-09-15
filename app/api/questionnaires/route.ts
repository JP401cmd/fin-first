import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { unauthorized, serverError } from '@/lib/api/respond'
import { laadGebruikerContext } from '@/lib/questionnaires/gebruiker-context'
import { UITNODIGING_KOLOMMEN, naarUitnodigingStaat } from '@/lib/questionnaires/uitnodiging-rij'
import { groepMatch, parseGroepRegels, vraagtStromen, type DynamischeGroep } from '@/lib/gebruikersgroepen'
import {
  isOpenVoorGebruiker,
  parseVerspreiding,
  popupKandidaat,
  popupToegestaan,
  telOpen,
  zichtbaarVoor,
  type GebruikerContext,
  type OpenLijstInput,
  type Regel,
  type UitnodigingStaat,
  type Verspreiding,
} from '@/lib/questionnaires/verspreiding'

/**
 * GET /api/questionnaires — de vragenlijsten die voor DEZE gebruiker openstaan,
 * met je eigen voortgang per lijst. Een lijst zonder vragen telt niet mee: die
 * kun je niet invullen, dus het icoon in de chat hoort er dan ook niet voor te
 * verschijnen.
 *
 * Sinds ADR 0147 (gerichte verspreiding) filtert deze route ook op doelgroep.
 * De regels staan in `questionnaires.verspreiding` (jsonb) en worden hier
 * COMPUTE-ON-READ geëvalueerd tegen eigen-rij meta (registratiedatum, actieve
 * dagen) — geen batch, geen cron. Targeting is een verspreidingsvoorkeur, geen
 * beveiligingsgrens: de RLS op `questionnaires` blijft `is_active`, het
 * wegfilteren gebeurt hier in de applicatielaag.
 *
 * Fase 2 en 3: een regel kan de dominante waardestroom vragen (dan leest de
 * context ook de eigen module-dagen), en een lijst kan op gebruikersgroepen
 * staan — lid van een statische groep (eigen lidmaatschap-rij) of voldoen aan
 * de regels van een dynamische groep. Ook dat is compute-on-read, met de
 * sessie-client en zonder gematerialiseerde uitnodigingen.
 *
 * TOLERANT OP EEN NIET-UITGEROLDE MIGRATIE. De kolom `verspreiding` en de tabel
 * `questionnaire_invitations` komen in dezelfde migratie als deze route. Zolang
 * die niet draait valt alles terug op het oude gedrag (iedereen ziet elke
 * actieve lijst, geen popup) in plaats van een 500 in de chat bij Fin.
 */

/** Postgres: kolom bestaat niet — `verspreiding` vóór de migratie. */
const KOLOM_ONBEKEND = '42703'

const LIJST_KOLOMMEN = 'id, title, description, created_at, questionnaire_questions(id)'

interface LijstRij {
  id: string
  title: string
  description: string | null
  created_at: string
  verspreiding?: unknown
  questionnaire_questions?: { id: string }[] | null
}

interface SessieRij {
  id: string
  questionnaire_id: string
  completed_at: string | null
  questionnaire_responses?: { question_id: string }[] | null
}

/**
 * De actieve lijsten mét hun verspreiding, met een terugval op de oude
 * kolomlijst wanneer de kolom nog niet bestaat. Alleen op 42703 — elke andere
 * fout blijft een echte fout.
 */
async function laadActieveLijsten(
  supabase: SupabaseClient,
): Promise<{ data: LijstRij[] | null; error: unknown }> {
  const query = (kolommen: string) =>
    supabase
      .from('questionnaires')
      .select(kolommen)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

  const met = await query(`${LIJST_KOLOMMEN}, verspreiding`)
  if (!met.error || (met.error as { code?: string }).code !== KOLOM_ONBEKEND) {
    return { data: met.data as unknown as LijstRij[] | null, error: met.error }
  }

  const zonder = await query(LIJST_KOLOMMEN)
  return { data: zonder.data as unknown as LijstRij[] | null, error: zonder.error }
}

/**
 * De eigen uitnodigingsrijen, per vragenlijst-id. Faalt de query (tabel nog niet
 * uitgerold, of geen leesrecht) dan is het antwoord "geen uitnodigingen" — dat
 * is precies het gedrag van vóór ADR 0147 en nooit een 500.
 */
async function laadUitnodigingen(
  supabase: SupabaseClient,
  userId: string,
  nu: Date,
): Promise<Map<string, UitnodigingStaat>> {
  const perLijst = new Map<string, UitnodigingStaat>()
  const { data, error } = await supabase
    .from('questionnaire_invitations')
    .select(UITNODIGING_KOLOMMEN)
    .eq('user_id', userId)

  if (error || !data) return perLijst
  for (const rij of data as { questionnaire_id?: string | null }[]) {
    if (!rij.questionnaire_id) continue
    perLijst.set(rij.questionnaire_id, naarUitnodigingStaat(rij, nu))
  }
  return perLijst
}

interface GroepMeta {
  /** Statische groepen (uit de gevraagde id's) waar de gebruiker lid van is. */
  eigenStatisch: ReadonlySet<string>
  /** Dynamische groepen (uit de gevraagde id's) met hun regels. */
  dynamisch: DynamischeGroep[]
}

const GEEN_GROEPEN: GroepMeta = { eigenStatisch: new Set(), dynamisch: [] }

/**
 * Lidmaatschap en dynamische groepsregels voor de gevraagde groep-id's (ADR
 * 0147, fase 3) — met de SESSIE-client:
 *  - `user_group_members`: alleen de eigen rijen (eigen-rij SELECT);
 *  - `user_groups`: alleen `id, soort, regels` van DYNAMISCHE groepen — dat is
 *    het kolomrecht van authenticated. Nooit `select('*')`: de naam en
 *    omschrijving die beheer aan een groep gaf zijn niet voor de gebruiker.
 *
 * Tolerant: een ontbrekende tabel of een fout geeft "geen lid, geen dynamische
 * groepen" — de lijst blijft dan onzichtbaar (fail-closed), nooit een 500.
 */
async function laadGroepMeta(
  supabase: SupabaseClient,
  userId: string,
  groepIds: string[],
): Promise<GroepMeta> {
  const [ledenRes, groepenRes] = await Promise.all([
    supabase.from('user_group_members').select('group_id').eq('user_id', userId),
    supabase.from('user_groups').select('id, soort, regels').in('id', groepIds).eq('soort', 'dynamisch'),
  ])

  const eigenStatisch = new Set<string>()
  if (!ledenRes.error && ledenRes.data) {
    for (const r of ledenRes.data as { group_id?: string | null }[]) {
      if (r.group_id) eigenStatisch.add(r.group_id)
    }
  }

  const dynamisch: DynamischeGroep[] = []
  if (!groepenRes.error && groepenRes.data) {
    for (const g of groepenRes.data as { id?: string | null; soort?: string | null; regels?: unknown }[]) {
      // Dubbele bewaking naast de .eq(): een statische groep zonder regels mag
      // hier nooit als "dynamisch" meelopen.
      if (!g.id || g.soort !== 'dynamisch') continue
      dynamisch.push({ id: g.id, regels: parseGroepRegels(g.regels) })
    }
  }

  return { eigenStatisch, dynamisch }
}

/**
 * Groepsmeta en gebruikerscontext, in de juiste volgorde en zo zuinig mogelijk.
 *
 * Groepsqueries alleen als er een lijst op 'groepen' staat (eindreview fase 1:
 * deze route draait bij elke app-load). De context (registratiedatum, actieve
 * dagen, eventueel stromen) alleen als een regel hem nodig heeft — een regel
 * op een lijst óf in een dynamische groep. De dominante stroom kost twee extra
 * queries en wordt alleen berekend als een van die regels er om vraagt.
 */
async function laadDoelgroepMeta(
  supabase: SupabaseClient,
  userId: string,
  perLijst: readonly { verspreiding: Verspreiding }[],
  nu: Date,
): Promise<{ groepen: GroepMeta; ctx: GebruikerContext }> {
  const groepIds = [
    ...new Set(
      perLijst
        .filter(({ verspreiding }) => verspreiding.doelgroep.modus === 'groepen')
        .flatMap(({ verspreiding }) => verspreiding.doelgroep.groep_ids),
    ),
  ]
  const groepen = groepIds.length > 0 ? await laadGroepMeta(supabase, userId, groepIds) : GEEN_GROEPEN

  const lijstRegels = perLijst
    .filter(({ verspreiding }) => verspreiding.doelgroep.modus === 'regels')
    .flatMap(({ verspreiding }) => verspreiding.doelgroep.regels)
  const regelsInSpel = perLijst.some(({ verspreiding }) => verspreiding.doelgroep.modus === 'regels')

  if (!regelsInSpel && groepen.dynamisch.length === 0) {
    return {
      groepen,
      ctx: { registratie: null, actieveDagen30: null, laatstActief: null, dominanteStroom: null, nu },
    }
  }

  const metStromen = vraagtStromen([...lijstRegels, ...groepen.dynamisch.flatMap((g) => g.regels)])
  const ctx = await laadGebruikerContext(supabase, userId, nu, { metStromen })
  return { groepen, ctx }
}

/**
 * Leg vast dát en waarom deze gebruiker is uitgenodigd — via regels op de lijst
 * (`bron_detail: { gematcht }`) of via een groep (`bron_detail: { groep_ids }`).
 * `regel` is de enige bron die de gebruiker zelf mag aanmaken (RLS: eigen rij,
 * bron 'regel', actieve lijst); ook een groepsmatch wordt dus als 'regel'
 * genoteerd, met de gematchte groepen als bevroren naslag. De rij bepaalt de
 * volgorde van de popup-kandidaten.
 *
 * Fouten worden ingeslikt: twee gelijktijdige verzoeken botsen op de PK, en een
 * lijst die je nú mag zien hoort niet te verdwijnen omdat de administratie
 * daarvan faalt. De lokaal geconstrueerde staat is identiek aan wat de insert
 * zou hebben opgeleverd.
 */
async function noteerRegelUitnodiging(
  supabase: SupabaseClient,
  questionnaireId: string,
  userId: string,
  bronDetail: { gematcht: Regel[] } | { groep_ids: string[] },
  nu: Date,
): Promise<UitnodigingStaat> {
  const lokaal: UitnodigingStaat = {
    bron: 'regel',
    invited_at: nu.toISOString(),
    shown_at: null,
    snoozed_until: null,
    dismissed_at: null,
    dismiss_count: 0,
  }

  const { data } = await supabase
    .from('questionnaire_invitations')
    .insert({ questionnaire_id: questionnaireId, user_id: userId, bron: 'regel', bron_detail: bronDetail })
    .select(UITNODIGING_KOLOMMEN)
    .maybeSingle()

  return data ? naarUitnodigingStaat(data as { bron?: string | null }, nu) : lokaal
}

export async function GET() {
  const supabase = await createClient()
  // Read-auth via getClaims() — lokale JWKS-verificatie, geen getUser-roundtrip (ADR 0052).
  const claims = await getAuthClaims(supabase)
  if (!claims) return unauthorized()

  const { data: questionnaires, error } = await laadActieveLijsten(supabase)
  if (error) return serverError(error, 'questionnaires:GET')

  // Deze route draait sinds ADR 0147 bij élke app-load (de signaalprovider in
  // de layout), niet alleen bij chat-open. Zonder actieve lijsten is er niets
  // te evalueren — dan geen sessie-, uitnodigings- of contextqueries.
  const actieveLijsten = (questionnaires ?? []).filter((q) => (q.questionnaire_questions?.length ?? 0) > 0)
  if (actieveLijsten.length === 0) {
    return NextResponse.json({ questionnaires: [], open_count: 0, popup_kandidaat_id: null })
  }

  const { data: sessions, error: sessieFout } = await supabase
    .from('questionnaire_sessions')
    .select('id, questionnaire_id, completed_at, questionnaire_responses(question_id)')
    .eq('user_id', claims.sub)
    // Oudste eerst: `find` kiest dan dezelfde canonieke open sessie als de sessieroute.
    .order('started_at', { ascending: true })

  if (sessieFout) return serverError(sessieFout, 'questionnaires:GET')

  // Eén `nu` voor de hele beurt: anders kan een lijst net wél en de teller net
  // niet meer binnen een snooze vallen.
  const nu = new Date()
  // De gebruikerscontext (registratiedatum, actieve dagen) is alleen nodig
  // als er een regel in het spel is — op een lijst of in een dynamische groep;
  // voor 'iedereen'/'handmatig' zijn die eigen-rij queries verspilling
  // (eindreview 15-09-2026, #5). Groepsqueries idem: alleen bij een
  // groepen-lijst. Zie laadDoelgroepMeta.
  const perLijst = actieveLijsten.map((q) => ({ q, verspreiding: parseVerspreiding(q.verspreiding) }))
  const [uitnodigingen, { groepen, ctx }] = await Promise.all([
    laadUitnodigingen(supabase, claims.sub, nu),
    laadDoelgroepMeta(supabase, claims.sub, perLijst, nu),
  ])

  const eigenSessies = (sessions ?? []) as SessieRij[]
  const openLijsten: OpenLijstInput[] = []
  const result: Record<string, unknown>[] = []

  for (const { q, verspreiding } of perLijst) {
    const eigen = eigenSessies.filter((s) => s.questionnaire_id === q.id)
    const open = eigen.find((s) => !s.completed_at)

    let invitation = uitnodigingen.get(q.id) ?? null
    const gm =
      verspreiding.doelgroep.modus === 'groepen'
        ? groepMatch(verspreiding.doelgroep.groep_ids, groepen.eigenStatisch, groepen.dynamisch, ctx)
        : null
    const zicht = zichtbaarVoor({ verspreiding, ctx, invitation, heeftOpenSessie: !!open, groepMatch: gm?.match ?? false })
    if (!zicht.zichtbaar) continue

    if (zicht.via === 'regels' && !invitation) {
      invitation = await noteerRegelUitnodiging(supabase, q.id, claims.sub, { gematcht: zicht.gematcht ?? [] }, nu)
    } else if (zicht.via === 'groep' && !invitation) {
      invitation = await noteerRegelUitnodiging(supabase, q.id, claims.sub, { groep_ids: gm?.groepIds ?? [] }, nu)
    }

    const lijst: OpenLijstInput = {
      id: q.id,
      created_at: q.created_at,
      verspreiding,
      invitation,
      has_completed: eigen.some((s) => !!s.completed_at),
    }
    openLijsten.push(lijst)

    result.push({
      id: q.id,
      title: q.title,
      description: q.description,
      question_count: q.questionnaire_questions?.length ?? 0,
      answered_count: open?.questionnaire_responses?.length ?? 0,
      has_open_session: !!open,
      has_completed: lijst.has_completed,
      created_at: q.created_at,
      open: isOpenVoorGebruiker(lijst),
      popup: { aan: verspreiding.popup.aan, kandidaat: popupToegestaan(lijst, nu) },
      invitation,
    })
  }

  return NextResponse.json({
    questionnaires: result,
    open_count: telOpen(openLijsten),
    // Hoogstens ÉÉN popup tegelijk — welke, bepaalt het contract, niet de UI.
    popup_kandidaat_id: popupKandidaat(openLijsten, nu),
  })
}
