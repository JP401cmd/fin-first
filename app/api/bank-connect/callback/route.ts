import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exchangeCode, getAccounts, getBaseUrls } from '@/lib/truelayer/client'
import { syncAccountBalance } from '@/lib/truelayer/balance-sync'
import { selectOrphanConnectionIds } from '@/lib/truelayer/orphan-connections'
import { ensureCashAssetForBankAccount } from '@/lib/truelayer/cash-asset-backfill'
import { loadOccupyingLinks, loadTargetAccount } from '@/lib/truelayer/target-account'
import { mapAccountType } from '@/lib/truelayer/mapper'
import { syncBudgetingActive } from '@/lib/budgeting-active'
import { blindIndex, encryptField } from '@/lib/crypto/field-encryption'
import { accountNumberWriteColumns } from '@/lib/asset-account-number'

/**
 * GET /api/bank-connect/callback — de OAuth-terugkomst van TrueLayer.
 *
 * ## DEZE ROUTE HAALT NOOIT TRANSACTIES OP (ADR 0069 — harde regel)
 *
 * Hier wordt de koppeling gelegd en het SALDO opgehaald; transacties komen
 * uitsluitend via `POST /api/bank-connect/sync`, dat de gebruiker zelf start.
 * Dat is geen luiheid en geen "nog niet af": het is precies wat het
 * CORRECTIEMOMENT op de success-pagina mogelijk maakt. Zolang er nog geen
 * transactie is geïmporteerd, is een verkeerd gelande koppeling gratis te
 * verhangen (`POST /api/bank-connect/relink`) — daarna niet meer, want
 * her-attributie van al geïmporteerde transacties staat buiten scope.
 *
 * **Wie hier "handig" transacties gaat ophalen om de eerste sync te versnellen,
 * sloopt dat correctiemoment.** Zie ADR 0069 vóór je die optimalisatie doet.
 */

/**
 * De partiële unieke index die "één ACTIEVE koppeling per TriFinity-rekening"
 * afdwingt (fase 6, FR5). Staat hier als benoemde constante omdat de callback zijn
 * fouten móet kunnen ONDERSCHEIDEN: een botsing hierop is een herstelbare toestand
 * met een eigen uitweg, elke andere schrijffout niet.
 */
const ONE_ACTIVE_LINK_PER_ACCOUNT_INDEX = 'bank_connection_accounts_one_active_per_bank_account'

/**
 * Is deze gefaalde koppelrij-write de BEZET-botsing? (fase 7, overdracht van fase 6)
 *
 * Het bereikbare pad, zonder aanvaller: bank A op rekening X → verbreken (X komt
 * vrij) → bank B op X → bank A herverbinden. Schakel 1 (identiteit) hergebruikt de
 * rij van A en zet `is_active` terug op `true`, wat botst met de koppeling van B.
 * Doorvallen naar schakel 4 mag daar níet — de historische transacties staan op X
 * en een verse rij laat ze verweesd achter — dus de write blíjft geweigerd. Fase 6
 * ving alleen het symptoom af (één generieke `?error=geen_koppeling`); hier krijgt
 * de oorzaak een eigen melding, zodat de wizard de uitweg kan noemen.
 *
 * **Bewust niet "elke `23505`".** Op deze tabel staat een tweede unieke index
 * (`bank_connection_accounts_one_per_external`, één rij per gebruiker + externe
 * rekening) met een compleet andere oorzaak en een andere uitweg; die als "drager
 * bezet" presenteren zou de gebruiker naar een koppeling sturen die niet bestaat.
 * Daarom code én constraintnaam.
 */
function isCarrierOccupiedCollision(
  error: { code?: string | null; message?: string | null; details?: string | null } | null | undefined,
): boolean {
  if (!error || error.code !== '23505') return false
  // Alleen `message`, bewust NIET `details`. Postgres zet de constraintnaam in
  // `message`; `details` bevat de sleutel-WAARDEN
  // (`Key (user_id, external_account_id)=(…) already exists`), en
  // `external_account_id` komt van de provider. Zou `details` meetellen, dan kan een
  // providerrespons met de indexnaam ín het account-id een botsing op de ándere
  // unieke index als "drager bezet" laten classificeren — en de gebruiker naar een
  // koppeling sturen die niet bestaat. (Security-review fase 7.)
  return (error.message ?? '').includes(ONE_ACTIVE_LINK_PER_ACCOUNT_INDEX)
}
export async function GET(req: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/core/cash/connect?error=missing_code`)
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(`${appUrl}/login`)
  }

  try {
    // Extract connection ID from state
    const connectionId = state.split(':')[0]

    const { data: connection } = await supabase
      .from('bank_connections')
      .select('*')
      .eq('id', connectionId)
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .single()

    if (!connection) {
      return NextResponse.redirect(`${appUrl}/core/cash/connect?error=connection_not_found`)
    }

    const redirectUri = `${appUrl}/api/bank-connect/callback`

    // Exchange code for tokens
    const tokens = await exchangeCode(supabase, code, redirectUri)

    // Update connection with tokens
    const now = new Date()
    const tokenExpiresAt = new Date(now.getTime() + tokens.expires_in * 1000)

    // Encrypted-only write (Stage A / PR2): tokens live solely in the
    // *_encrypted columns. The plaintext access_token/refresh_token columns are
    // no longer written and are dropped by a follow-up migration
    // (see supabase/migrations/*_drop_plaintext_bank_tokens.sql).
    await supabase
      .from('bank_connections')
      .update({
        access_token_encrypted: encryptField(tokens.access_token),
        refresh_token_encrypted: encryptField(tokens.refresh_token ?? null),
        token_expires_at: tokenExpiresAt.toISOString(),
        status: 'active',
        authorized_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', connection.id)

    // Fetch accounts from TrueLayer
    const { dataUrl } = await getBaseUrls(supabase)
    const tlAccounts = await getAccounts(tokens.access_token, dataUrl)

    // ══ DE PRECEDENTIEKETEN ═══════════════════════════════════════════════════
    //
    // Welke TriFinity-`bank_accounts`-rij gaat de bankdata dragen? Vier schakels,
    // in deze volgorde, en elke volgorde-omkering is een bekend defect:
    //
    //  1. `external_account_id` — IDENTITEIT. Was deze externe rekening hier al
    //     eerder gekoppeld, dan is dát de waarheid. Identiteit wint óók van de
    //     expliciete keuze: anders verhangt een herautorisatie (elke 90 dagen!)
    //     een bestaande koppeling naar een andere rij, en verspringt de historie
    //     van de gebruiker zonder dat hij daarom vroeg.
    //  2. `bank_connections.target_bank_account_id` — de EXPLICIETE KEUZE uit
    //     wizardstap 2 (fase 4). Wint van de IBAN-heuristiek: die heuristiek is
    //     precies wat dit plan repareert. Zou `iban_hash` erboven staan, dan werd
    //     een keuze voor rekening A stil overruled zodra rekening B dezelfde IBAN
    //     draagt — de stille beslissing die fase 4/5 wegneemt.
    //     Voorwaarden, alle drie hard: alleen bij `link_intent = 'nieuw'` (bij
    //     'herautoriseren' is de keuze een UX-kortere weg, geen nieuwe binding —
    //     daar hoort identiteit te claimen), alleen voor de EERSTE TL-rekening die
    //     door schakel 1 valt, en alleen als de doelrekening niet al door schakel
    //     1 geclaimd is.
    //  3. `iban_hash` — de heuristiek. Voor de óverige rekeningen uit een consent
    //     met N rekeningen, en voor het herautorisatiepad.
    //  4. Nieuwe rekening + cash-bezit aanmaken.
    //
    // **Alle N teruggegeven rekeningen blijven gekoppeld.** De bank bepaalt wat er
    // in de consent zit; er stilzwijgend één laten vallen is gegevensverlies dat de
    // gebruiker niet ziet. De voorkeur bindt hooguit één ervan.
    //
    // Twee nummeringen in dit bestand, bewust niet door elkaar: **schakel** 1-4 is
    // de precedentieketen hierboven (wie draagt de data?), **stap** 2b/3/4/5 zijn
    // de fasen van de lus eronder. Schakel 4 = "Stap 3: pas nu aanmaken".
    //
    // Schakel 1 wordt hieronder voor ÁLLE rekeningen vooraf opgelost, niet
    // onderweg. Anders zou de uitkomst van de lus-volgorde afhangen: een latere
    // rekening kan de doelrekening op identiteit opeisen, en dan mag een eerdere
    // rekening haar niet al via de voorkeur hebben ingepikt.
    const targetBankAccountId = (connection.target_bank_account_id as string | null) ?? null
    const linkIntent = (connection.link_intent as string | null) ?? null

    // ── Schakel 1, vooraf: identiteit ─────────────────────────────────────────
    // Bewust GEEN filter op is_active: een reconnect na een soft disconnect moet
    // de bestaande rij hergebruiken en heractiveren, niet dupliceren.
    const identityLinks = new Map<string, { id: string; bank_account_id: string | null }>()
    for (const tlAccount of tlAccounts) {
      const { data: existingLink } = await supabase
        .from('bank_connection_accounts')
        .select('id, bank_account_id')
        .eq('user_id', user.id)
        .eq('external_account_id', tlAccount.account_id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (existingLink) {
        identityLinks.set(tlAccount.account_id, {
          id: existingLink.id as string,
          bank_account_id: (existingLink.bank_account_id as string | null) ?? null,
        })
      }
    }

    // ── De "bezet"-set: welke TriFinity-rekening is niet meer beschikbaar? ─────
    // Twee bronnen, en de tweede is sinds fase 6 geen luxe maar noodzaak:
    //
    //  (a) rekeningen die schakel 1 al heeft opgeëist — binnen één callback
    //      draagt één TriFinity-rekening hooguit één TL-rekening. Zonder die regel
    //      belanden twee rekeningen uit dezelfde consent op één rij.
    //  (b) rekeningen die BUITEN deze callback al een actieve koppeling dragen
    //      (FR5). Die zijn sinds fase 6 door de partiële unieke index
    //      `bank_connection_accounts_one_active_per_bank_account` verboden — en
    //      een `insert` via supabase-js gooit niet, hij geeft een `error` terug die
    //      de lus hieronder historisch niet las. Zonder deze bron zou een
    //      IBAN-treffer (schakel 3) op een al gekoppelde rekening dus STIL geen
    //      koppelrij opleveren: geen fout, geen rekening, geen data. De rijen van
    //      déze callback zelf horen er níet bij — die worden hieronder bijgewerkt,
    //      niet gedupliceerd.
    //
    // Schakels 2 en 3 slaan een bezette rij over en vallen door naar aanmaak
    // (schakel 4). Schakel 1 staat er bewust buiten: identiteit wint altijd, en
    // bestaande duplicaten zijn een pre-flight-probleem, niet dat van deze lus.
    const identityLinkIds = new Set([...identityLinks.values()].map((link) => link.id))
    const occupyingLinks = await loadOccupyingLinks(supabase, user.id)

    const boundAccountIds = new Set<string>(
      [...identityLinks.values()]
        .map((link) => link.bank_account_id)
        .filter((id): id is string => !!id),
    )

    for (const [bankAccountId, link] of occupyingLinks) {
      if (!identityLinkIds.has(link.id)) boundAccountIds.add(bankAccountId)
    }

    // ── Schakel 2, vooraf: welke TL-rekening krijgt de voorkeur? ───────────────
    // Drie voorwaarden, en `boundAccountIds` dekt er sinds fase 6 twee van: de
    // doelrekening mag niet al door schakel 1 geclaimd zijn én niet al een actieve
    // koppeling van buiten deze callback dragen (FR5). Een voorkeur die op zo'n
    // rekening wijst zakt door naar schakel 3/4 in plaats van stil te sneuvelen op
    // de unieke index — `auth-link` weigert die keuze al met een 409, maar tussen
    // de wizard en deze terugkomst kan er een andere koppeling geland zijn.
    //
    // **AMENDEMENT op fase 5, besluit 3 (fase 7, na de security-review).** Daar sloeg
    // `link_intent = 'herautoriseren'` schakel 2 volledig over, met als motivering:
    // "identiteit claimt daar sowieso terug, en anders is `iban_hash` de juiste
    // val-terug". Die tweede helft is feitelijk onjuist. Schakel 3 filtert op
    // `bank_accounts.is_active = true`, en juist op het herstelpad is een drager mét
    // `is_active = false` een LEGITIEME toestand ("budgetteren staat uit"; de
    // geschiktheidsregel laat zulke dragers expliciet toe). Geeft de bank bij de
    // nieuwe consent een ander `external_account_id`, dan mist schakel 1, mist
    // schakel 3, en maakt schakel 4 een VERSE rekening aan: de herautorisatie landt
    // ergens anders dan de rekening die de gebruiker aan het repareren was, de
    // historie blijft op de oude (onzichtbare) rij, en de SC-13-reactivatie — het
    // enige argument om de geschiktheidstoets op dit pad over te slaan — draait niet.
    // De voorkeur werd op dat pad dus wél weggeschreven en nooit geconsumeerd: dode
    // data, en het slechtste van twee werelden.
    //
    // Schakel 2 geldt nu op béide paden, en blijft strikt een val-terug ná schakel 1:
    // de `tlAccounts.find(...)` hieronder levert alleen een rekening die door
    // identiteit NIET geclaimd is. Identiteit wint dus onverkort (fase 5, besluit 1).
    const targetCandidate: string | null =
      targetBankAccountId && !boundAccountIds.has(targetBankAccountId)
        ? tlAccounts.find((a) => !identityLinks.get(a.account_id)?.bank_account_id)?.account_id ?? null
        : null

    // De EIGENAAR van de kolomwaarde is geborgd in de datalaag (zie de noot bij
    // schakel 2 hieronder), maar GESCHIKTHEID is een tweede, andere regel:
    // een rekening waarvan het cash-bezit is gedeactiveerd mag geen koppeling
    // dragen, want dan komen saldo en transacties binnen op een rij die nergens
    // in de app zichtbaar is (SC-13). `auth-link` toetst dat op schrijfmoment —
    // maar tussen de wizard en deze terugkomst kan de gebruiker het bezit hebben
    // gedeactiveerd. Daarom hier opnieuw, met dezelfde ene regel uit
    // `lib/truelayer/target-account.ts`; valt de voorkeur af, dan zakt de
    // rekening door naar schakel 3.
    //
    // **Behalve op het herstelpad, en dat is dezelfde asymmetrie die `auth-link`
    // documenteert.** Daar IS een gedeactiveerd bezit geen afwijzingsgrond maar juist
    // de reden dat het pad bestaat (SC-13): stap 2b reactiveert het. De waarde is er
    // veilig zonder deze toets, want ze is per constructie server-afgeleid uit de
    // koppelrij en de trigger `guard_bank_connection_target_account` borgt de
    // eigenaar. `link_intent` is óók een serverfeit — `auth-link` schrijft het, geen
    // client — dus het mag hier de tak bepalen.
    // De leesronde kost tijd, dus pas nadat vaststaat dát er een rekening te binden is.
    const targetForExternalId: string | null =
      targetCandidate &&
      targetBankAccountId &&
      (linkIntent === 'herautoriseren' ||
        (await loadTargetAccount(supabase, user.id, targetBankAccountId)))
        ? targetCandidate
        : null

    /**
     * Hoeveel rekeningen uit deze consent kregen daadwerkelijk een koppelrij?
     *
     * Nodig sinds fase 6 de unieke indexen op deze tabel legde. Er is één tak die
     * niet naar aanmaak kan doorvallen: schakel 1 (identiteit) hergebruikt een
     * bestaande rij en zet `is_active` terug op `true`. Draagt diezelfde rekening
     * inmiddels een ándere actieve koppeling (verbreken → een andere bank op
     * dezelfde rekening → de eerste bank herverbinden), dan botst die update op
     * `bank_connection_accounts_one_active_per_bank_account`. Doorvallen naar
     * schakel 4 mag daar níet: de historische transacties staan op die rekening, en
     * de koppeling naar een verse rij verhuizen laat ze verweesd achter.
     *
     * Dus blijft het bij een geweigerde write — maar dan mag de flow niet "geslaagd"
     * melden. Landde er van deze consent GÉÉN enkele koppeling, dan is er niets dat
     * ooit gaat synchroniseren en gaat de gebruiker terug naar de wizard met uitleg
     * in plaats van naar een succespagina die niets toont.
     */
    let linkedCount = 0

    /**
     * De rekeningen die niet gekoppeld konden worden omdat hun TriFinity-drager al
     * een ándere actieve koppeling draagt — het pad uit
     * {@link isCarrierOccupiedCollision}.
     *
     * Apart van `linkedCount` omdat de twee samen de uitkomst bepalen: landde er
     * niets én was er minstens één bezet-botsing, dan is er een concrete uitweg
     * ("verbreek die koppeling eerst bij die rekening") in plaats van de generieke
     * "er ging iets mis". Landde er wél iets, dan gaan de geslaagde koppelingen door
     * maar mag de flow niet doen alsof alles gelukt is.
     */
    const blockedCarriers: Array<{ externalAccountId: string; bankAccountId: string }> = []

    // Process each account
    for (const tlAccount of tlAccounts) {
      const iban = tlAccount.account_number?.iban ?? null
      const accountName = tlAccount.display_name || connection.provider_name
      const existingLink = identityLinks.get(tlAccount.account_id) ?? null

      // Schakel 1 — identiteit.
      let bankAccountId: string | null = existingLink?.bank_account_id ?? null

      // ── Schakel 2: de expliciete keuze ─────────────────────────────────────
      // Het EIGENAARSCHAP van de kolomwaarde is geborgd in de datalaag: de
      // trigger `guard_bank_connection_target_account` (`security definer`,
      // `search_path = ''`) dwingt af dat ze naar een rekening van dezelfde
      // gebruiker wijst óf `null` is — RLS scope't de RÍJ, niet de WAARDE van
      // een FK-kolom daarop (fase 4, besluit 6). De GESCHIKTHEID is hierboven
      // opnieuw getoetst; zie de noot bij `targetIsUsable`.
      if (!bankAccountId && targetForExternalId === tlAccount.account_id) {
        bankAccountId = targetBankAccountId
      }

      // ── Schakel 3: IBAN-fallback ───────────────────────────────────────────
      // Alleen nodig als schakel 1 en 2 niets opleverden (eerste keer koppelen op
      // een handmatig aangemaakte rekening, of een tweede rekening uit dezelfde
      // consent).
      if (!bankAccountId && iban) {
        // Look up existing bank_account by IBAN. We use the blind index so
        // this keeps working once the plaintext `iban` column is dropped in
        // PR2. Existing rows that haven't been backfilled yet have a NULL
        // iban_hash and would silently miss — the backfill script
        // (scripts/encrypt-existing-bank-credentials.mjs) populates iban_hash
        // for every existing row before we deploy this code path to prod.
        //
        // maybeSingle() i.p.v. single(): single() gooit óók bij méér dan één
        // treffer, en die fout landde in de "maak een nieuwe aan"-tak — precies
        // het gedrag dat bestaande duplicaten liet dóórgroeien. Oudste eerst,
        // zodat we deterministisch op de rij mét historie uitkomen.
        const ibanHash = blindIndex(iban)
        const { data: existing } = await supabase
          .from('bank_accounts')
          .select('id')
          .eq('user_id', user.id)
          .eq('iban_hash', ibanHash)
          .eq('is_active', true)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()

        // Een rij die binnen déze callback al een andere TL-rekening draagt komt
        // niet in aanmerking — zie de noot bij `boundAccountIds`.
        bankAccountId = existing?.id && !boundAccountIds.has(existing.id) ? existing.id : null
      }

      // ── Schakel 4 / Stap 3: pas nu aanmaken ────────────────────────────────
      // Vlag voor stap 4b: een hier aangemaakte rij krijgt haar cash-bezit in
      // dezelfde tak, dus de backfill hoeft er niet nog een leesronde aan te wijden.
      let createdNewAccount = false
      if (!bankAccountId) {
        createdNewAccount = true
        // Create linked asset (cash-as-asset)
        const assetName = iban ? `${connection.provider_name} ${iban.slice(-4)}` : connection.provider_name

        // ── B3: het rekeningtype komt van de BANK, niet uit een aanname ───────
        // Deze tak stempelde élke rekening als betaalrekening — ook een
        // spaarrekening of creditcard uit dezelfde consent (SC-05). Dat is een
        // GRONDSLAGFOUT: `is_liquid` voedt het liquide vermogen en daarmee
        // noodfonds, spaarquote en de FIRE-motor, en downstream is dat niet meer
        // te herstellen. Onbekend type → betaalrekening (het gedrag van vóór B3),
        // nooit een throw: een nieuw providertype mag geen OAuth-callback slopen.
        const mappedType = mapAccountType(tlAccount.account_type)

        // Both encrypt + index helpers tolerate null inputs (return null), so
        // we can pass `iban` directly even when this TrueLayer account has no
        // IBAN at all.
        const { data: newAsset } = await supabase
          .from('assets')
          .insert({
            user_id: user.id,
            name: assetName,
            asset_type: 'cash',
            current_value: 0,
            purchase_value: 0,
            expected_return: 0,
            monthly_contribution: 0,
            institution: connection.provider_name,
            ...accountNumberWriteColumns(iban),
            is_liquid: mappedType.is_liquid,
            subtype: mappedType.subtype,
            has_budget_tracking: true,
            ownership: 'personal',
            net_worth_inclusion_pct: 100,
            is_active: true,
          })
          .select('id')
          .single()

        // Create bank account linked to asset
        const { data: newAccount } = await supabase
          .from('bank_accounts')
          .insert({
            user_id: user.id,
            name: assetName,
            iban,
            iban_encrypted: encryptField(iban),
            iban_hash: iban ? blindIndex(iban) : null,
            bank_name: connection.provider_name,
            account_type: mappedType.account_type,
            balance: 0,
            sort_order: 0,
            linked_asset_id: newAsset?.id ?? null,
          })
          .select('id')
          .single()

        bankAccountId = newAccount?.id ?? null
      }

      // Vanaf hier is deze rij bezet voor de rest van deze callback.
      if (bankAccountId) boundAccountIds.add(bankAccountId)

      // ── Stap 4: koppeling bijwerken of aanmaken ────────────────────────────
      // `existingLink` komt uit schakel 1 — bewust niet opnieuw opgehaald, zodat
      // "welke rij hergebruiken we" op één plek beslist wordt.
      //
      // **De fout wordt gelezen, en dat is sinds fase 6 geen netheid maar een
      // vereiste.** Op deze tabel staan twee unieke indexen (één actieve koppeling
      // per rekening; één rij per gebruiker+externe rekening) en een
      // eigenaarschapstrigger. `supabase-js` gooit daar niet op — het geeft een
      // `error` terug. Werd die niet gelezen, dan verdween de hele koppeling
      // geruisloos: de gebruiker ziet een geslaagde koppelflow en daarna een
      // rekening die nooit synchroniseert. Niet-fataal (de overige rekeningen uit
      // de consent horen wél door te gaan), maar wél in de log, en de saldo-stap
      // hieronder wordt overgeslagen: een saldo op een rekening zonder koppelrij is
      // een cijfer dat niemand meer kan verklaren.
      // ── De cursor hoort bij de DRAGER, niet bij de koppelrij ─────────────────
      // Schakel 1 hergebruikt de bestaande rij inclusief haar `sync_cursor`.
      // Verhuist die rij naar een ándere `bank_account_id` — verwijderen en
      // opnieuw koppelen levert een verse rekening op — dan beschrijft de cursor
      // historie die op de nieuwe drager niet bestaat. De sync leest 'm dan als
      // "dit is niet de eerste ophaal" en slaat de volle terugblik (B8) over:
      // de gebruiker koppelt juist opnieuw óm zijn historie te halen en houdt
      // één venster vanaf de oude cursor over (waargenomen 4 aug 2026).
      //
      // Nullen dus zodra de drager wisselt; `last_synced_at` gaat mee, want een
      // synchronisatiemoment van een andere rekening is hier een onwaarheid.
      // Blijft de drager gelijk (de gewone herautorisatie elke 90 dagen), dan
      // blijft de cursor staan — dáár is hij juist correct en voorkomt hij een
      // onnodige volledige ophaal tegen de bank-eigen verzoeklimiet.
      const carrierChanged = !!existingLink && existingLink.bank_account_id !== bankAccountId

      const linkWrite = existingLink
        ? await supabase
            .from('bank_connection_accounts')
            .update({
              connection_id: connection.id,
              bank_account_id: bankAccountId,
              iban,
              iban_encrypted: encryptField(iban),
              iban_hash: iban ? blindIndex(iban) : null,
              account_name: accountName,
              is_active: true,
              ...(carrierChanged ? { sync_cursor: null, last_synced_at: null } : {}),
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingLink.id)
        : await supabase
            .from('bank_connection_accounts')
            .insert({
              user_id: user.id,
              connection_id: connection.id,
              bank_account_id: bankAccountId,
              external_account_id: tlAccount.account_id,
              iban,
              iban_encrypted: encryptField(iban),
              iban_hash: iban ? blindIndex(iban) : null,
              account_name: accountName,
            })

      if (linkWrite.error) {
        console.error(
          '[bank-connect:callback] koppelrij niet weggeschreven voor',
          tlAccount.account_id,
          linkWrite.error,
        )
        // Bezet-botsing? Dan is de oorzaak bekend én uit te leggen (fase 7). De
        // drager moet een echte rij zijn: de partiële index geldt alleen `where
        // is_active and bank_account_id is not null`, dus een write zonder drager
        // kan hier per definitie niet op gebotst zijn.
        if (bankAccountId && isCarrierOccupiedCollision(linkWrite.error)) {
          blockedCarriers.push({ externalAccountId: tlAccount.account_id, bankAccountId })
        }
        continue
      }

      linkedCount += 1

      if (!bankAccountId) {
        // Alleen bereikbaar als de `bank_accounts`-insert van schakel 4 faalde: de
        // koppelrij bestaat dan wél (met `bank_account_id = null`) maar er is geen
        // rekening om een bezit aan te hangen of een saldo op te schrijven. De
        // success-pagina toont die toestand als fout mét uitweg (fase 5, besluit 12).
        console.error('TrueLayer callback: geen bankrekening voor', tlAccount.account_id)
        continue
      }

      // ── Stap 4b: cash-as-asset backfill + SC-13-herstel ────────────────────
      // Nieuw aangemaakte rekeningen krijgen hun asset via schakel 4 (of via de
      // trigger fn_auto_link_bank_account_asset); alleen bestaande rijen van vóór
      // cash-as-asset kunnen nog zonder zitten. Draait dus voor élke hergebruikte
      // rekening — via identiteit, via de voorkeur én via `iban_hash`.
      //
      // Sinds fase 7 doet diezelfde stap óók het HERSTEL van een gedeactiveerd
      // cash-bezit (SC-13): zonder dat komt het saldo binnen op een rij die
      // `cash-overview` wegfiltert op `is_active !== false`, en dan werkt de
      // koppeling wel maar ziet de gebruiker niets. Het herstelpad van `auth-link`
      // laat de geschiktheidstoets daarom bewust vallen — hier wordt die keuze
      // waargemaakt. Sinds het eigenaarsbesluit van 30 juli zet dat herstel béide
      // assen terug (zichtbaarheid én budgettracking); de tweede gaat via
      // `setBudgetTracking`, de ene schrijver van dat drieluik — zie de docstring
      // in `cash-asset-backfill.ts`.
      //
      // **De plaats in de lus is het punt, en die is bij de security-review van fase
      // 7 verschoven van vóór de koppelwrite naar hierná.** Stond dit ervóór, dan
      // herstelde een MISLUKTE koppelpoging (bezet-botsing → `continue`) alsnog een
      // door de gebruiker "verwijderd" cash-bezit, of liet ze een vers €0-bezit
      // achter: een half toegepaste mutatie die stil het netto vermogen wijzigt
      // terwijl de gebruiker een foutmelding leest. Dat weegt sinds 30 juli zwaarder,
      // niet lichter: het herstel raakt nu óók de budgetten.
      // `POST /api/bank-connect/relink` maakte dezelfde afweging al en legt dezelfde
      // reden vast. Nog steeds vóór stap 5, dus het saldo landt op een rekening die
      // haar bezit al heeft.
      // Alleen voor een HERGEBRUIKTE rij: schakel 4 maakt bezit en rekening in één
      // tak aan, dus daar is er niets bij te vullen en niets te herstellen.
      if (!createdNewAccount) {
        const backfill = await ensureCashAssetForBankAccount(supabase, {
          userId: user.id,
          bankAccountId,
          providerName: connection.provider_name,
          providerIban: iban,
        })

        // Loggen, niet melden: het is een herstelde toestand, geen fout. Wél
        // waarneembaar, want dit is precies het defect dat SC-13 beschrijft en dat
        // eerder alleen als "rekening blijft onzichtbaar" naar boven kwam.
        if (backfill.reactivated) {
          console.info(
            '[bank-connect:callback] gedeactiveerd cash-bezit hersteld (SC-13: zichtbaar + budgettracking) voor rekening',
            bankAccountId,
          )
        }
      }

      // ── Stap 5: saldo meteen ophalen ───────────────────────────────────────
      // Zonder dit blijft de rekening (en daarmee de gekoppelde cash-asset) op 0
      // staan tot de gebruiker zelf "Synchroniseer nu" klikt — en op het
      // onboarding-pad hieronder bestaat die knop niet eens, dus telde elke
      // eerste koppeling daar als €0 mee in het netto vermogen. De inserts
      // hierboven houden bewust hun 0-startwaarde: het saldo is op dát moment nog
      // niet bekend, en de aanmaak van de rekening mag niet afhangen van een
      // externe call die kan falen.
      //
      // Bewust géén ophoging van `daily_requests`: die teller is een rem op
      // sync-spam op de sync-route, geen spiegel van het TrueLayer-quotum — de
      // `getAccounts`-call hierboven telt om dezelfde reden al niet mee.
      //
      // Niet-fataal (het saldo volgt anders bij de eerstvolgende sync); zie
      // syncAccountBalance voor het schrijfcontract.
      try {
        await syncAccountBalance(supabase, {
          accessToken: tokens.access_token,
          dataUrl,
          externalAccountId: tlAccount.account_id,
          bankAccountId,
          userId: user.id,
        })
      } catch (balanceErr) {
        console.error('TrueLayer saldo bij koppeling (niet-fataal) mislukt:', balanceErr)
      }
    }

    // ── Stap 5a: de voorkeur is verbruikt (consume-once) ──────────────────────
    // `target_bank_account_id` geldt voor DÉZE koppelpoging en niet voor de
    // volgende. Blijft hij staan, dan herhaalt de herautorisatie van over 90 dagen
    // stilletjes een voorkeur die de gebruiker toen uitsprak en nu niet ziet.
    //
    // Bewust ook nullen wanneer de voorkeur NIET is toegepast (schakel 1 claimde de
    // rekening al, of `link_intent = 'herautoriseren'`): een voorkeur die overleeft
    // omdat ze even niet paste, past een volgende keer wél — en slaat dan stil toe.
    //
    // Bewust ná de lus en niet meegelift op de token-/statusupdate hierboven: die
    // draait vóórdat de voorkeur is toegepast, en dan zou het nullen "de callback
    // is begonnen" betekenen in plaats van "de voorkeur is verbruikt".
    //
    // `link_intent` blijft juist staan — dat is een FEIT over deze koppelpoging
    // (fase 4, en fase 7 leest het), geen eenmalig te verbruiken instructie.
    if (targetBankAccountId) {
      await supabase
        .from('bank_connections')
        .update({ target_bank_account_id: null, updated_at: new Date().toISOString() })
        .eq('id', connection.id)
        .eq('user_id', user.id)
    }

    // ── Geen sync_cursor-write, en dat is een keuze ────────────────────────────
    // De plantekst van fase 5 vroeg om het startpunt uit `planInitialFetch`
    // initieel in `sync_cursor` te zetten bij een hergebruikte rekening. Sinds
    // fase 1 is dat niet alleen overbodig maar schadelijk: de sync-route bepaalt
    // het startpunt zélf zodra er nog géén cursor staat
    // (`isFirstFetch = !date_from && !sync_cursor` → `loadNewestTransactionDate`
    // → `planInitialFetch`). Hier een cursor wegschrijven zou (a) van "eerste
    // ophaal" een gewone cursor-sync maken en daarmee de blok-lus (B8) op een lege
    // hergebruikte rekening overslaan, en (b) het startpunt bevriezen op het
    // koppelmoment — importeert de gebruiker tussen koppelen en synchroniseren nog
    // een CSV, dan is de bevroren datum verkeerd. Eén eigenaar van het
    // startpunt-contract, en dat is `lib/truelayer/initial-fetch.ts`.

    // ── Stap 5b: budget-module-gate meesyncen ─────────────────────────────────
    // De asset-inserts hierboven zetten `has_budget_tracking: true`, maar
    // `profiles.budgeting_active` — dé vlag die álle budget-surfaces als gate
    // lezen (budgets-client, dashboard-data-loader, assets-client) — bleef op
    // zijn oude waarde staan. Na een eerste bankkoppeling stond budgetteren
    // daardoor "uit" tot de gebruiker toevallig een ánder schrijfpad raakte dat
    // de gate wél herberekent (rekening bewerken, /api/budgetteren/setup,
    // /api/assets/toggle-budget).
    //
    // Eén keer ná de rekeningen-lus: de gate is een gebruiker-brede herberekening
    // over álle cash-assets, niet iets per rekening.
    //
    // Niet-fataal, zoals de andere aanroepers: een gefaalde gate-write mag een
    // geslaagde koppeling nooit in de catch-tak (en dus naar
    // ?error=callback_failed) duwen. Wél server-side loggen — een geruisloos
    // geslikte gate-desync is precies het defect dat hier gerepareerd wordt, en
    // dat mag geen tweede keer onzichtbaar terugkomen. De fout blijft binnen
    // deze catch en bereikt de client niet.
    await syncBudgetingActive(supabase, user.id).catch((gateErr) => {
      console.error('[bank-connect:callback] budgeting_active sync mislukt:', gateErr)
    })

    // ── Stap 6: verweesde verbindingen opruimen ───────────────────────────────
    // Elke klik op "Verbind" maakt via /api/bank-connect/auth-link een `pending`
    // rij aan die niemand ooit opruimde — afgebroken pogingen stapelden zich op.
    // En na een herautorisatie blijft de vórige verbinding op 'active' staan met
    // een levend refresh token, terwijl al haar rekeningen hierboven naar de
    // nieuwe verbinding zijn verhangen.
    //
    // We ruimen daarom alle ándere verbindingen van deze gebruiker op die géén
    // enkele rekening meer dragen: die zijn per definitie verweesd. Verbindingen
    // die nog wél rekeningen hebben (bv. een andere bank) blijven ongemoeid.
    // Het token van een verweesde verbinding gaat mee weg.
    //
    // Let op de grenzen daarvan — dit is géén volledige intrekking:
    // (a) een via "Verbreken" zacht ontkoppelde rekening blijft als rij bestaan,
    //     dus haar verbinding telt hieronder nog als "in gebruik" en wordt nooit
    //     opgeruimd; (b) we roepen geen revoke-endpoint bij TrueLayer aan, dus de
    //     consent zelf blijft daar staan tot ze vanzelf verloopt. Beide zijn
    //     bekende, aparte vervolgpunten.
    //
    // Wélke verbindingen dat precies zijn — en waarom een verse `pending` van
    // een andere, nog lopende koppeling erbuiten valt — staat in
    // selectOrphanConnectionIds.
    const { data: linkedConnections } = await supabase
      .from('bank_connection_accounts')
      .select('connection_id')
      .eq('user_id', user.id)

    const inUse = new Set(
      (linkedConnections ?? []).map((row) => row.connection_id as string),
    )
    inUse.add(connection.id)

    const { data: ownConnections } = await supabase
      .from('bank_connections')
      .select('id, status, created_at')
      .eq('user_id', user.id)

    const orphanIds = selectOrphanConnectionIds(
      (ownConnections ?? []).map((c) => ({
        id: c.id as string,
        status: c.status as string | null,
        created_at: c.created_at as string | null,
      })),
      inUse,
    )

    if (orphanIds.length > 0) {
      await supabase
        .from('bank_connections')
        .update({
          status: 'expired',
          access_token_encrypted: encryptField(''),
          refresh_token_encrypted: null,
          updated_at: new Date().toISOString(),
        })
        .in('id', orphanIds)
        .eq('user_id', user.id)
    }

    // Check if user has completed onboarding. If not, redirect back to
    // the onboarding flow instead of the in-app success page — the (app)
    // layout would redirect them anyway since it gates on onboarding_completed.
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('id', user.id)
      .single()

    // ── Geen enkele koppelrij? Dan is dit geen succes ─────────────────────────
    // Zie de noot bij `linkedCount`. Bewust "geen énkele" en niet "niet alle": bij
    // een consent met N rekeningen horen de geslaagde koppelingen wél door te gaan,
    // en die zijn op de success-pagina per rekening zichtbaar. Alleen wanneer er
    // niets landde is de hele flow een leugen.
    //
    // Twee uitkomsten sinds fase 7, en het verschil is de UITWEG:
    //
    //  - `?error=drager_bezet&drager=<bank_accounts.id>` — de dragende rekening is
    //    al door een andere bank in gebruik. Dat kan de gebruiker zélf opheffen,
    //    dus de wizard krijgt de id van die rekening mee en kan er rechtstreeks naar
    //    linken. **Alleen de id in de URL** — géén banknaam, géén IBAN: een
    //    query-parameter belandt in browserhistorie, referers en logs.
    //  - `?error=geen_koppeling` — blijft bestaan voor alle óverige oorzaken. Eén
    //    generieke tekst is daar het eerlijke antwoord.
    //
    // Draagt méér dan één rekening dezelfde toestand, dan noemt de URL de eerste;
    // de parameter is een aanknopingspunt, niet een volledige inventaris (die staat
    // in de serverlog hierboven).
    if (tlAccounts.length > 0 && linkedCount === 0) {
      console.error(
        '[bank-connect:callback] geen enkele koppelrij weggeschreven voor verbinding',
        connection.id,
        blockedCarriers.length > 0 ? `(bezette dragers: ${blockedCarriers.length})` : '',
      )

      // Het onboardingpad blijft ongewijzigd: daar bestaat de wizard-uitleg niet en
      // is `?bank_error=1` de enige toestand die de onboarding-stap kent.
      if (profile && !profile.onboarding_completed) {
        return NextResponse.redirect(`${appUrl}/onboarding?bank_error=1`)
      }

      if (blockedCarriers.length > 0) {
        return NextResponse.redirect(
          `${appUrl}/core/cash/connect?error=drager_bezet&drager=${encodeURIComponent(blockedCarriers[0].bankAccountId)}`,
        )
      }

      return NextResponse.redirect(`${appUrl}/core/cash/connect?error=geen_koppeling`)
    }

    if (profile && !profile.onboarding_completed) {
      return NextResponse.redirect(`${appUrl}/onboarding?bank_connected=1`)
    }

    // ── Gedeeltelijk geslaagd: een AANTAL, geen id's ───────────────────────────
    // Sommige rekeningen landden, andere botsten op een bezette drager. De
    // geslaagde koppelingen gaan door — maar de success-pagina mag niet doen alsof
    // alles gelukt is (fase 6 liet deze toestand alleen in de serverlog achter).
    //
    // Alleen het aantal in de URL, geen id's: dan is de melding per constructie
    // waar ("N rekening(en) kon niet gekoppeld worden") en lekt er niets in
    // browserhistorie of logs. Wélke rekeningen het zijn, leest de pagina uit
    // `GET /api/bank-connect/linked-accounts` — dáár staat per koppeling wie hem
    // draagt, achter authenticatie.
    if (blockedCarriers.length > 0) {
      return NextResponse.redirect(
        `${appUrl}/core/cash/connect/success?geblokkeerd=${blockedCarriers.length}`,
      )
    }

    return NextResponse.redirect(`${appUrl}/core/cash/connect/success`)
  } catch (err) {
    console.error('TrueLayer callback error:', err)

    // If callback fails during onboarding, redirect back to onboarding
    // with an error param so the user can retry without hitting the (app)
    // layout gate.
    const { data: { user: errUser } } = await supabase.auth.getUser()
    if (errUser) {
      const { data: errProfile } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', errUser.id)
        .single()
      if (errProfile && !errProfile.onboarding_completed) {
        return NextResponse.redirect(`${appUrl}/onboarding?bank_error=1`)
      }
    }

    return NextResponse.redirect(`${appUrl}/core/cash/connect?error=callback_failed`)
  }
}
