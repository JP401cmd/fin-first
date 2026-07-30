import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { badRequest, conflict, serverError, unauthorized } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { isTrueLayerEnabled } from '@/lib/truelayer/feature-flag'
import { buildAuthLink } from '@/lib/truelayer/client'
import { encryptField } from '@/lib/crypto/field-encryption'
import {
  accountFollowsBudgets,
  loadOccupyingLink,
  occupiedTargetAccountMessage,
  resolveTargetAccount,
  type TargetAccountRow,
  type TargetAssetRow,
} from '@/lib/truelayer/target-account'
import { setBudgetTracking } from '@/lib/budget-tracking'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * POST /api/bank-connect/auth-link — start een koppelpoging en lever de
 * autorisatie-URL van de bank.
 *
 * ## De doelrekening reist via een kolom, niet via de state (fase 4)
 *
 * De gebruiker kiest in wizardstap 2 wélke TriFinity-rekening de koppeling gaat
 * dragen. Die keuze wordt hier op de **pending** `bank_connections`-rij
 * weggeschreven (`target_bank_account_id`), waar de callback 'm straks (fase 5)
 * als vierde schakel in de precedentieketen leest en daarna op `null` zet
 * (consume-once).
 *
 * Waarom een kolom en niet de state-string: de pending-rij bestaat op dit moment
 * al, dus er is geen nieuw transportmechanisme nodig — en het state-formaat
 * blijft daarmee exact `${connection.id}:${user.id.slice(0,8)}-${Date.now()}`,
 * wat regressie-eis R2 vereist. Sleutel niets aan die opbouw.
 *
 * `link_intent` legt vast wat voor poging dit was. Anders dan de doelrekening is de
 * intentie een **feit** over de koppelpoging en blijft ze na de callback staan.
 *
 * ## Het HERSTELPAD: de intentie is een gevolg, geen client-invoer (fase 7, B6)
 *
 * De autorisatie verloopt elke 90 dagen, dus elke gebruiker komt binnen een
 * kwartaal op "verbinding kwijt — verbind opnieuw". Dat pad start hier met één
 * extra body-veld: `relink_connection_account_id`, de `bank_connection_accounts`-rij
 * die hersteld wordt. Is die aanwezig, dan schrijft deze route
 * `link_intent: 'herautoriseren'` en **leidt ze de doelrekening server-side af** uit
 * `bank_account_id` van die koppelrij.
 *
 * **Bewuste afwijking van de plantekst, en dit is de reden.** Fase 7 vroeg om "de
 * route accepteert `link_intent`" plus "bij `'herautoriseren'` is
 * `target_bank_account_id` verplicht". Beide zijn hier strikter ingevuld: de client
 * noemt de te herstellen KOPPELING, en de server leidt de doelrekening én de
 * intentie daaruit af. Dat haalt twee dingen weg. (1) Een client die
 * `link_intent: 'herautoriseren'` met een wíllekeurige doelrekening combineert —
 * die combinatie laat de callback schakel 2 overslaan (fase 5, besluit 3) en zou
 * dus een keuze accepteren die daarna stil genegeerd wordt. (2) Een tweede bron
 * voor hetzelfde feit: "welke rekening draagt deze koppeling" staat al ín de
 * koppelrij. De intentie is hiermee geen invoer meer maar een gevolg van "ik
 * herstel déze koppeling", en dat is niet te spoofen.
 *
 * **Om dezelfde reden komt óók de BANK van de server op dit pad.** `provider_id` is
 * daarom optioneel geworden (verplicht blijft het op het wizardpad, waar de body de
 * enige bron is): bij een herautorisatie is de bank een feit over de koppeling, dat
 * `bank_connections` al draagt. Zou de client hem hier moeten meesturen, dan (a) moet
 * élk oppervlak met een herstelknop eerst een provider-kolom meelezen die de server al
 * heeft — precies het gat waarop de eerste versie van dit pad strandde: de
 * rekeningkaart kende de kolom niet en de POST zou deterministisch 400'en — en (b) kon
 * een client een herautorisatie van koppeling X naar een ándere bank sturen, waarna
 * schakel 1 van de callback de rekening terugclaimt voor een bank die er niet bij hoort.
 * Een body-waarde wordt op dit pad dus overruled, niet aangevuld.
 *
 * Drie dingen die op dit pad expliciet ÁNDERS zijn dan op het wizardpad:
 *
 *  - **geen geschiktheidstoets op het cash-bezit.** `isEligibleTargetAccount`
 *    wijst een rekening af waarvan het cash-bezit gedeactiveerd is (fase 5,
 *    besluit 4 — saldo zou binnenkomen op een rij die nergens zichtbaar is). Op
 *    het herstelpad moet die afwijzing juist NIET gelden: dat is precies SC-13, en
 *    de backfill (`ensureCashAssetForBankAccount`) reactiveert zo'n bezit bewust
 *    zodra de koppeling landt. De docstring van `isEligibleTargetAccount` benoemt
 *    deze uitzondering al. Eigenaarschap wordt wél getoetst — de koppelrij is
 *    eigen-rij én de lezing filtert expliciet op `user_id`.
 *  - **geen budget-vinkje.** Er is geen wizardstap waarin de gebruiker het aanvinkt,
 *    dus `enable_budget_tracking` doet hier niets (besluit B2: niets stil aanzetten).
 *  - **de bank komt uit de koppeling**, niet uit de body (zie hierboven).
 *

 * ## Eén actieve koppeling per rekening (fase 6, FR5)
 *
 * Een rekening die al een actieve bankkoppeling draagt is geen geldige
 * doelrekening: twee bronnen op één `transactions.account_id` betekent twee
 * sync-cursors en twee saldi. Dat levert hier een **409 mét uitweg** ("verbreek
 * die koppeling eerst"), niet dezelfde 400 als "bestaat niet" — de gebruiker kan
 * deze toestand zélf opheffen. De wizard schakelt zulke opties al uit; deze route
 * is de grens, de partiële unieke index in de datalaag is het slot.
 *
 * **Op het herstelpad betekent die 409 iets anders, en hij is er juist dáár het
 * nuttigst.** De koppeling die hersteld wordt bezet haar eigen huidige rekening
 * niet (`exceptConnectionAccountId`), dus een 409 kan er alleen komen doordat een
 * ÁNDERE actieve koppeling die rekening inmiddels draagt. De callback laat schakel
 * 2 op dit pad over, dus de 409 beschermt hier niet de voorkeur — hij voorspelt de
 * botsing van schakel 1: identiteit hergebruikt de bestaande koppelrij en zet
 * `is_active` terug op `true`, wat op de partiële unieke index stuk gaat (het
 * bekende pad: bank A op X → verbreken → bank B op X → A herverbinden). Zonder
 * deze controle vertrekt de gebruiker naar zijn bank om daarna met een lege
 * koppeling terug te komen.
 *
 * ## Geen keuze = geldige body
 *
 * `target_bank_account_id` en `relink_connection_account_id` zijn beide optioneel;
 * ontbreken ze allebei, dan doet de callback wat hij altijd deed
 * (`external_account_id` → `iban_hash` → nieuwe rekening aanmaken). Dat houdt
 * oudere clients werkend en maakt "nieuwe rekening aanmaken" in de wizard tot een
 * expliciete keuze in de UI zonder dat de server er een aparte vlag voor nodig
 * heeft. Ze zijn wél wederzijds exclusief: twee bronnen voor één beslissing is
 * geen geldige body.
 */

/**
 * Vertaalt een (mogelijk technische, Engelse of SDK-)fout naar een vaste,
 * Nederlandse gebruikersmelding. De rauwe details blijven in de serverlog
 * (console.error) en bereiken nooit de UI — zie bug B-04.
 */
function toDutchAuthLinkError(err: unknown): string {
  const raw = err instanceof Error ? err.message : ''
  // Bekende, herkenbare oorzaak: de bankkoppeling is (nog) niet ingericht.
  if (raw.includes('credentials niet geconfigureerd')) {
    return 'De bankkoppeling is nog niet volledig ingesteld. Probeer het later opnieuw of neem contact op met de beheerder.'
  }
  return 'Verbinding maken is niet gelukt — probeer het later opnieuw.'
}

/**
 * Zod als whitelist (ADR 0044): alles wat hier niet staat wordt gestript, dus een
 * client kan geen kolom op `bank_connections` zetten die deze route niet
 * expliciet toestaat — `status`, `access_token_encrypted` en `user_id` blijven
 * server-bepaald.
 */
const AuthLinkSchema = z
  .object({
    /**
     * De bank waarmee geautoriseerd wordt.
     *
     * Verplicht op het WIZARDpad (de gebruiker koos daar een bank), en bewust
     * optioneel op het HERSTELpad: bij een herautorisatie staat de bank al vast —
     * ze is de verbinding van de te herstellen koppeling — en de server leidt haar
     * dáár uit af. Zou de client hem óók daar moeten meesturen, dan zou élk
     * oppervlak met een herstelknop eerst een provider-kolom moeten meelezen die
     * de server al heeft, en kon een client bovendien een herautorisatie van
     * koppeling X naar een ándere bank sturen. Zie de `.refine` hieronder en
     * {@link resolveRelinkCarrier}.
     */
    provider_id: z.string().min(1, 'provider_id is vereist').max(200).nullish(),
    provider_name: z.string().max(200).nullish(),
    provider_logo: z.string().max(2000).nullish(),
    /**
     * De in wizardstap 2 gekozen doelrekening. Afwezig/`null` = "maak een nieuwe
     * rekening aan" (of, bij een oudere client, geen voorkeur).
     */
    target_bank_account_id: z.string().uuid('ongeldige rekening').nullish(),
    /**
     * HERSTELPAD (fase 7): de `bank_connection_accounts`-rij waarvan de
     * autorisatie hersteld wordt. Aanwezig ⇒ dit is een herautorisatie: de route
     * zet `link_intent: 'herautoriseren'` en leidt de doelrekening af uit
     * `bank_account_id` van deze rij. De client kiest hier dus géén doelrekening
     * en géén intentie — zie de module-docstring.
     */
    relink_connection_account_id: z.string().uuid('ongeldige koppeling').nullish(),
    /**
     * Het voorgevinkte "neem deze rekening mee in mijn budgetten" uit dezelfde stap
     * (besluit B2). Alleen zinvol samen met een doelrekening die de budgetten nog
     * niet volgt; een nieuwe rekening krijgt budgetteren altijd aan zonder vraag.
     * Op het herstelpad genegeerd — daar is geen wizardstap.
     */
    enable_budget_tracking: z.boolean().optional(),
  })
  // Twee bronnen voor één beslissing bestaan niet: bij een herautorisatie IS de
  // doelrekening de drager van de te herstellen koppeling. Zou de route de
  // client-geleverde rekening dan óók accepteren, dan konden de twee uiteenlopen
  // en zou er stil één van de twee winnen.
  .refine(
    (body) => !(body.relink_connection_account_id && body.target_bank_account_id),
    { message: 'Kies óf een doelrekening óf een te herstellen koppeling, niet beide' },
  )
  // Buiten het herstelpad is er geen andere bron voor de bank dan de body.
  .refine((body) => !!body.relink_connection_account_id || !!body.provider_id, {
    message: 'provider_id is vereist',
  })

/**
 * De vaste 400-teksten van het herstelpad. Twee, niet één:
 *
 *  - `RELINK_LINK_UNAVAILABLE_MESSAGE` dekt "bestaat niet" én "niet van jou" met
 *    één antwoord — precies zoals `TARGET_ACCOUNT_UNAVAILABLE_MESSAGE` dat voor
 *    rekeningen doet. Geen existentie-orakel op andermans id's.
 *  - `RELINK_LINK_WITHOUT_CARRIER_MESSAGE` geldt pas nádat vaststaat dat de rij
 *    van deze gebruiker ÍS, dus een eigen tekst verklapt hier niets. Ze is nodig
 *    omdat de toestand echt bestaat (fase 5, besluit 12: `bank_account_id = null`
 *    betekent dat de aanmaak van de rekening destijds mislukte) en de uitweg een
 *    andere is dan "probeer het nog eens".
 */
const RELINK_LINK_UNAVAILABLE_MESSAGE = 'Deze koppeling bestaat niet of is niet van jou'
const RELINK_LINK_WITHOUT_CARRIER_MESSAGE =
  'Deze koppeling heeft geen rekening om te herstellen. Koppel de bank opnieuw via Bank koppelen.'
const RELINK_LINK_WITHOUT_PROVIDER_MESSAGE =
  'Van deze koppeling is niet meer te zien bij welke bank hij hoort. Koppel de bank opnieuw via Bank koppelen.'

type RelinkCarrierResolution =
  | {
      ok: true
      connectionAccountId: string
      bankAccountId: string
      /** De bank van de te herstellen koppeling — server-afgeleid, niet client-geleverd. */
      providerId: string
      providerName: string | null
      providerLogo: string | null
    }
  | { ok: false; reason: 'unavailable'; message: string }
  | { ok: false; reason: 'occupied'; message: string }

/** PostgREST levert een to-one embed soms als array (afhankelijk van de relatie-inferentie). */
function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

/**
 * De doelrekening van een HERSTELPOGING, afgeleid uit de koppelrij (fase 7).
 *
 * Drie regels, in deze volgorde — en de volgorde is de control:
 *
 *  1. **eigenaarschap.** `.eq('user_id', …)` staat er expliciet naast de eigen-rij
 *     RLS op `bank_connection_accounts`, zelfde leesbaarheidsregel als in de andere
 *     bank-connect-routes. Onbekend of andermans id → één vaste 400.
 *  2. **draagt deze koppeling een rekening?** Zonder drager is er niets te
 *     herstellen.
 *  3. **FR5, mét de eigen koppeling uitgezonderd.** `exceptConnectionAccountId`
 *     is hier geen comfort maar noodzaak: de rekening is per definitie bezet door
 *     precies de koppeling die we herautoriseren, dus zonder die uitzondering zou
 *     dit pad ALTIJD een 409 geven. Draagt een ÁNDERE actieve koppeling de rekening,
 *     dan hoort de 409 er wél te zijn — mét dezelfde uitweg-tekst als de wizard en
 *     `relink` gebruiken (`occupiedTargetAccountMessage`).
 *
 * Bewust GEEN `isEligibleTargetAccount`: zie de module-docstring (SC-13). En
 * bewust géén filter op `is_active` van de koppelrij en géén oordeel over of de
 * verbinding echt kapot is — opnieuw autoriseren van een gezonde koppeling is
 * ongevaarlijk (schakel 1 eist de rij sowieso terug), en een tweede plek die
 * "kapot" definieert zou naast `deriveBankLinkHealth` gaan drijven.
 */
async function resolveRelinkCarrier(
  supabase: SupabaseClient,
  userId: string,
  connectionAccountId: string,
): Promise<RelinkCarrierResolution> {
  const { data: link, error } = await supabase
    .from('bank_connection_accounts')
    .select('id, bank_account_id, bank_connections(provider_id, provider_name, provider_logo)')
    .eq('id', connectionAccountId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  if (!link) return { ok: false, reason: 'unavailable', message: RELINK_LINK_UNAVAILABLE_MESSAGE }

  const bankAccountId = (link.bank_account_id as string | null) ?? null
  if (!bankAccountId) {
    return { ok: false, reason: 'unavailable', message: RELINK_LINK_WITHOUT_CARRIER_MESSAGE }
  }

  // De bank komt uit de verbinding, niet uit de body: bij een herautorisatie IS de
  // bank een feit over de koppeling. `provider_id` is NOT NULL op
  // `bank_connections`, dus dit pad is er voor de vorm — maar een lege
  // provider-string zou verderop een onbruikbare autorisatie-URL bouwen, en dat
  // faalt dan bij de bank in plaats van hier.
  const connection = one(
    link.bank_connections as
      | { provider_id: string | null; provider_name: string | null; provider_logo: string | null }
      | { provider_id: string | null; provider_name: string | null; provider_logo: string | null }[]
      | null,
  )
  const providerId = connection?.provider_id ?? null
  if (!providerId) {
    return { ok: false, reason: 'unavailable', message: RELINK_LINK_WITHOUT_PROVIDER_MESSAGE }
  }

  const occupying = await loadOccupyingLink(supabase, userId, bankAccountId, {
    exceptConnectionAccountId: link.id as string,
  })

  if (occupying) {
    return {
      ok: false,
      reason: 'occupied',
      message: occupiedTargetAccountMessage(occupying.providerName),
    }
  }

  return {
    ok: true,
    connectionAccountId: link.id as string,
    bankAccountId,
    providerId,
    providerName: connection?.provider_name ?? null,
    providerLogo: connection?.provider_logo ?? null,
  }
}

export async function POST(req: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return unauthorized()
  }

  if (!(await isTrueLayerEnabled(supabase))) {
    return NextResponse.json({ error: 'Bank Connect is niet ingeschakeld' }, { status: 503 })
  }

  const parsed = await parseBody(AuthLinkSchema, req)
  if (!parsed.ok) return parsed.response
  const {
    provider_id,
    provider_name,
    provider_logo,
    target_bank_account_id,
    relink_connection_account_id,
    enable_budget_tracking,
  } = parsed.data

  try {
    // De twee feiten die de pending-rij straks draagt. Ze worden hieronder door
    // precies één van twee takken gezet — wizardpad of herstelpad — zodat er nooit
    // twee bronnen voor dezelfde beslissing naast elkaar leven.
    let targetAccountId: string | null = null
    let linkIntent: 'nieuw' | 'herautoriseren' = 'nieuw'
    /**
     * Alleen op het WIZARDpad gevuld: de rekening + het bezit waarop het
     * voorgevinkte budget-vinkje (B2) mag werken. Op het herstelpad blijft dit
     * `null`, want daar is geen wizardstap waarin de gebruiker iets aanvinkt.
     */
    let budgetTarget: { account: TargetAccountRow; asset: TargetAssetRow | null } | null = null
    /**
     * De bank waarmee straks geautoriseerd wordt. Op het wizardpad de
     * client-keuze; op het herstelpad de bank van de te herstellen koppeling — dat
     * is een feit over die koppeling en hoort dus niet uit de body te komen.
     */
    let effectiveProvider: { id: string; name: string | null; logo: string | null } = {
      id: provider_id ?? '',
      name: provider_name ?? null,
      logo: provider_logo ?? null,
    }

    // ── Herstelpad: de intentie volgt uit de koppeling (fase 7, B6) ────────────
    // De client noemt de te herstellen KOPPELING; de doelrekening, de intentie ÉN
    // de bank komen van de server. Zie de module-docstring voor de afwijking van de
    // plantekst en de drie dingen die dit pad wegneemt.
    if (relink_connection_account_id) {
      const herstel = await resolveRelinkCarrier(supabase, user.id, relink_connection_account_id)

      if (!herstel.ok) {
        return herstel.reason === 'occupied'
          ? conflict(herstel.message)
          : badRequest(herstel.message)
      }

      targetAccountId = herstel.bankAccountId
      linkIntent = 'herautoriseren'
      // Overrulet een eventuele body-waarde: anders kon een client een
      // herautorisatie van koppeling X naar een ándere bank sturen, en dan claimt
      // schakel 1 van de callback de rekening terug voor een bank die er niet bij
      // hoort.
      effectiveProvider = {
        id: herstel.providerId,
        name: herstel.providerName,
        logo: herstel.providerLogo,
      }
    }

    // ── Wizardpad: mag deze doelrekening? ─────────────────────────────────────
    // De grens ligt hier, niet in de wizard: de UI-lijst is comfort. Bewust vóór
    // de insert, zodat er nooit een pending-rij ontstaat die naar een vreemde of
    // bezette rekening verwijst.
    //
    // Twee afwijzingen met een eigen status (`resolveTargetAccount`):
    //  - 400 — bestaat niet / niet van jou / niet geschikt. Eén antwoord voor die
    //    drie: geen existentie-orakel op andermans id's.
    //  - 409 — FR5: de rekening draagt al een actieve koppeling. Dat is een
    //    toestand die de gebruiker zélf opheft, dus met een melding die de uitweg
    //    noemt in plaats van dezelfde onbruikbare 400.
    //
    // Geen van beide is het énige slot. De trigger
    // `guard_bank_connection_target_account` weigert een waarde die niet bij deze
    // gebruiker hoort, en de partiële unieke index
    // `bank_connection_accounts_one_active_per_bank_account` weigert de tweede
    // actieve koppeling — ook als iemand deze route omzeilt. Dit is de
    // vriendelijke variant van dezelfde twee regels: hier staat waaróm het
    // misgaat, de datalaag vangt wat hier nooit langskomt.
    const resolved = target_bank_account_id
      ? await resolveTargetAccount(supabase, user.id, target_bank_account_id)
      : null

    if (resolved && !resolved.ok) {
      return resolved.reason === 'occupied'
        ? conflict(resolved.message)
        : badRequest(resolved.message)
    }

    if (resolved?.ok) {
      targetAccountId = resolved.account.id
      budgetTarget = { account: resolved.account, asset: resolved.asset }
    }

    // ── B2: budgetteren aanzetten op de gekozen bestaande rekening ────────────
    // Vóór de pending-rij en vóór de redirect: gaat dit mis, dan is er nog niets
    // gebeurd en kan de gebruiker het gewoon opnieuw proberen. Een aangevinkte
    // optie stil negeren zou erger zijn dan een nette fout.
    //
    // Alleen wanneer de rekening de budgetten nog NIET volgt: een rekening mét
    // tracking blijft ongemoeid (B2), en een tweede identieke write zou de
    // module-gate onnodig herberekenen.
    //
    // `budgetTarget` is per constructie alleen op het wizardpad gevuld, dus het
    // herstelpad raakt de budgetteringsas niet — ook niet als een client daar
    // `enable_budget_tracking: true` meestuurt.
    if (
      budgetTarget &&
      enable_budget_tracking &&
      !accountFollowsBudgets(budgetTarget.account, budgetTarget.asset)
    ) {
      if (budgetTarget.asset) {
        const budgetResult = await setBudgetTracking(supabase, user.id, budgetTarget.asset.id, true)
        if (!budgetResult.ok) {
          return serverError(budgetResult.error, 'bankconnect-auth-link:POST')
        }
      }
      // Zonder cash-bezit is er geen canoniek pad om de budgetteringsvlag te
      // zetten (`setBudgetTracking` werkt op `assets`). Die combinatie is per
      // constructie onbereikbaar — een losse rekening zonder bezit is alleen
      // kandidaat als ze actief is, en dan volgt ze de budgetten al. Mocht ze
      // ooit ontstaan: de koppeling gaat door, het vinkje doet niets.
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const redirectUri = `${appUrl}/api/bank-connect/callback`
    const state = `${user.id.slice(0, 8)}-${Date.now()}`

    // Create pending connection record. The actual tokens are filled in by
    // the OAuth callback (see app/api/bank-connect/callback/route.ts) which
    // writes the encrypted columns only. The pending row starts with an empty
    // encrypted token; the plaintext access_token column is no longer written
    // (its NOT NULL constraint is dropped by
    // supabase/migrations/*_bank_connections_access_token_drop_notnull.sql,
    // which MUST be applied to remote before this code deploys — see runbook).
    const { data: connection, error: dbError } = await supabase
      .from('bank_connections')
      .insert({
        user_id: user.id,
        provider_id: effectiveProvider.id,
        provider_name: effectiveProvider.name || effectiveProvider.id,
        provider_logo: effectiveProvider.logo || null,
        access_token_encrypted: encryptField(''),
        status: 'pending',
        // Consume-once: de callback nult deze kolom zodra de voorkeur is
        // toegepast (fase 5), zodat een herautorisatie 90 dagen later niet
        // stilletjes dezelfde oude voorkeur herhaalt.
        //
        // Op het herstelpad staat hier de drager van de te herstellen koppeling —
        // sérver-afgeleid, niet client-geleverd. De callback slaat schakel 2 op dat
        // pad over (fase 5, besluit 3) omdat `external_account_id` de rekening
        // sowieso terugclaimt; de waarde is er dus de vastlegging van "hier hoorde
        // hij te landen" en de val-terug als identiteit ooit niet treft.
        target_bank_account_id: targetAccountId,
        link_intent: linkIntent,
      })
      .select('id')
      .single()

    if (dbError || !connection) {
      return serverError(dbError, 'bankconnect-auth-link:POST')
    }

    // Encode connection ID in state for callback lookup
    const fullState = `${connection.id}:${state}`
    const authUrl = await buildAuthLink(supabase, redirectUri, fullState, effectiveProvider.id)

    return NextResponse.json({ auth_url: authUrl })
  } catch (err) {
    // De NL-mapping blijft (bekende oorzaak = bruikbare tekst), maar de log loopt
    // via `serverError` zodat de echte fout een grep-bare tag krijgt (ADR 0044) en
    // de client de standaard `code: 'server_error'` ziet.
    return serverError(err, 'bankconnect-auth-link:POST', toDutchAuthLinkError(err))
  }
}
