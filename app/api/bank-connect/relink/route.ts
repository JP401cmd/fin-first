import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { badRequest, conflict, notFound, serverError, unauthorized } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { resolveTargetAccount } from '@/lib/truelayer/target-account'
import { ensureCashAssetForBankAccount } from '@/lib/truelayer/cash-asset-backfill'
import { revertBankBalanceRevaluation } from '@/lib/truelayer/balance-valuation'

/**
 * POST /api/bank-connect/relink — HET CORRECTIEMOMENT (fase 5, SC-07).
 *
 * Verhangt één gekoppelde bankrekening (`bank_connection_accounts`) naar een
 * andere TriFinity-rekening. Dit is de uitweg die de precedentieketen in de
 * callback nodig heeft: identiteit (`external_account_id`) wint dáár altijd van
 * de expliciete keuze, dus het is mogelijk dat de koppeling ergens ánders landt
 * dan de gebruiker in de wizard aanwees. Een verplichte keuze die stil genegeerd
 * wordt is erger dan geen keuze — vandaar dat de success-pagina voor ÉLKE
 * gekoppelde rekening laat zien wie hem draagt, met deze route als correctie.
 *
 * ## Waarom dit werkt, en waar de grens ligt (ADR 0069)
 *
 * De callback haalt alleen SALDO op, nooit transacties. Tot de eerste sync is een
 * verkeerde koppeling daarom gratis te corrigeren.
 *
 * **Ná een sync weigert deze route, en dat is een serverregel, geen UI-tekst.**
 * Her-attributie van al geïmporteerde transacties staat expliciet buiten scope;
 * verhangen zou de koppeling verplaatsen en de historie achterlaten. Dat halve
 * resultaat is erger dan een geweigerde actie, dus het wordt geweigerd — niet
 * uitgelegd en dan alsnog uitgevoerd. Het signaal is `last_synced_at` /
 * `sync_cursor` op de KOPPELING: dat is "deze koppeling heeft al opgehaald".
 * Bewust NIET "staan er transacties op de doelrekening": een rekening mét
 * CSV-historie kiezen is juist het hoofdgeval van dit hele plan.
 *
 * ## Wat er wél meeverhuist
 *
 * `sync_cursor` gaat op `null`. Die cursor is een uitspraak over de vórige
 * rekening; laten staan zou de eerstvolgende ophaal op de nieuwe rekening
 * afkappen bij een datum die daar niets betekent. Met een lege cursor bepaalt de
 * sync-route het startpunt opnieuw via `planInitialFetch` (fase 1) — op de
 * historie van de nieuwe doelrekening.
 *
 * ## En sinds fase 8: het SALDO gaat ook mee terug
 *
 * "Corrigeerbaar tot de eerste sync" gold voor transacties, maar niet voor het
 * saldo: de callback schrijft dat al vóór dit moment (stap 5), dus de verkeerde
 * rekening draagt op dit punt een banksaldo dat niet van haar is — en dat telt
 * mee in het netto vermogen. Deze route draait dat terug met een
 * **compenserende waardering** (`lib/truelayer/balance-valuation.ts`):
 * append-only, met de vorige waarde uit het grootboek, nooit met een `delete`.
 */

const RelinkSchema = z.object({
  /** De te verhangen `bank_connection_accounts`-rij. */
  connection_account_id: z.string().uuid('ongeldige koppeling'),
  /** De TriFinity-rekening die hem voortaan moet dragen. */
  bank_account_id: z.string().uuid('ongeldige rekening'),
})

export async function POST(req: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const parsed = await parseBody(RelinkSchema, req)
  if (!parsed.ok) return parsed.response
  const { connection_account_id, bank_account_id } = parsed.data

  try {
    // ── De te verhangen koppeling ─────────────────────────────────────────────
    // `user_id` expliciet: de RLS-policy op `bank_connection_accounts` is
    // eigen-rij (`auth.uid() = user_id`), dus dit is hier wél dubbelop — maar het
    // is de goedkoopste manier om de eigenaarschapseis in de code leesbaar te
    // houden naast de tabellen waar RLS bréder is (`bank_accounts`, `assets`,
    // `transactions`). Zie de noot bij `loadTargetAccount`.
    const { data: link, error: linkError } = await supabase
      .from('bank_connection_accounts')
      .select('id, bank_account_id, account_name, last_synced_at, sync_cursor')
      .eq('id', connection_account_id)
      .eq('user_id', user.id)
      // Een zacht ontkoppelde rij is geen correctie-kandidaat: haar herstelpad is
      // opnieuw verbinden (fase 7), niet verhangen.
      .eq('is_active', true)
      .maybeSingle()

    if (linkError) return serverError(linkError, 'bankconnect-relink:POST')
    if (!link) return notFound('Deze koppeling bestaat niet')

    // ── De grens uit ADR 0069, server-side ────────────────────────────────────
    // Heeft deze koppeling al opgehaald, dan staan er transacties die niet
    // meeverhuizen. De UI verbergt de actie dan al (op ditzelfde server-feit),
    // maar een control die alleen in de UI leeft is geen control.
    if (link.last_synced_at || link.sync_cursor) {
      return conflict(
        'Er zijn al transacties opgehaald voor deze koppeling. Wijzigen kan alleen vóór de eerste synchronisatie.',
      )
    }

    // ── De nieuwe doelrekening ────────────────────────────────────────────────
    // Dezelfde volledige regel als de wizard en `auth-link` gebruiken
    // (`resolveTargetAccount` in `lib/truelayer/target-account.ts`) — één plek,
    // anders biedt het correctiemoment ooit iets aan dat de koppelroute weigert.
    //
    // 400 = bestaat niet / niet van jou / niet geschikt (één antwoord voor die
    // drie: geen existentie-orakel op andermans id's). 409 = de rekening draagt al
    // een actieve koppeling (FR5); dáár is de partiële unieke index
    // `bank_connection_accounts_one_active_per_bank_account` sinds fase 6 het
    // echte slot, want deze controle is een read-then-write en dus een TOCTOU —
    // twee gelijktijdige verhuizingen naar dezelfde rekening kwamen er beide door.
    // De controle blijft staan als de vriendelijke variant: zij noemt de bank en
    // de uitweg, de index geeft alleen een botsing.
    //
    // `exceptConnectionAccountId`: de koppeling die zelf verhuisd wordt bezet haar
    // eigen huidige rekening niet — anders zou de voorgeselecteerde optie een 409
    // opleveren in plaats van de idempotente "niets gewijzigd" hieronder.
    const resolved = await resolveTargetAccount(supabase, user.id, bank_account_id, {
      exceptConnectionAccountId: link.id,
    })

    if (!resolved.ok) {
      return resolved.reason === 'occupied'
        ? conflict(resolved.message)
        : badRequest(resolved.message)
    }

    const target = resolved.account

    // Idempotent: het correctiemoment is een lijst met de huidige drager
    // voorgeselecteerd, dus "opslaan zonder te wijzigen" is een normale klik en
    // geen fout.
    if (link.bank_account_id === target.id) {
      return NextResponse.json({ bank_account_id: target.id, changed: false })
    }

    const { data: updated, error: updateError } = await supabase
      .from('bank_connection_accounts')
      .update({
        bank_account_id: target.id,
        // De cursor was een uitspraak over de vórige rekening; laten staan zou de
        // eerstvolgende ophaal op de nieuwe rekening afkappen bij een datum die
        // daar niets betekent. `null` laat `planInitialFetch` (fase 1) het
        // startpunt opnieuw bepalen, op de historie van de nieuwe doelrekening.
        sync_cursor: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', link.id)
      .eq('user_id', user.id)
      // `.select()` op de update: PostgREST geeft géén `error` wanneer een update
      // nul rijen raakt (onzichtbaar onder RLS). Zonder de teruggegeven rij zou
      // deze route "verhangen" melden terwijl er niets is gewijzigd.
      .select('id')
      .maybeSingle()

    if (updateError) return serverError(updateError, 'bankconnect-relink:POST')
    if (!updated) return serverError(new Error('relink raakte 0 rijen'), 'bankconnect-relink:POST')

    // ── Pas NÁ de geslaagde verhanging het cash-bezit garanderen ──────────────
    // Zonder bezit blijft de rekening onzichtbaar in élk vermogens- en
    // cash-oppervlak terwijl saldo en transacties wél binnenkomen; dezelfde stap
    // als "Stap 2b" in de callback, met dezelfde helper.
    //
    // De volgorde is bewust: stond dit vóór de update, dan liet een gefaalde
    // verhanging een vers €0-cash-bezit achter op een rekening die de koppeling
    // niet kreeg — en dat ruimt niets op. Restrisico van deze kant: faalt de
    // backfill zelf, dan is de koppeling wél verhuisd naar een rekening zonder
    // bezit. Dat is zichtbaar en zelf-herstelbaar via de budgetteren-toggle, en
    // een volgende koppeling/relink probeert het opnieuw.
    const backfill = await ensureCashAssetForBankAccount(supabase, {
      userId: user.id,
      bankAccountId: target.id,
      providerName: target.bank_name ?? target.name,
    })

    if (!backfill.assetId) {
      console.error(
        '[bank-connect:relink] koppeling verhuisd naar een rekening zonder cash-bezit:',
        target.id,
      )
    }

    // ── Het banksaldo van de OUDE drager terugdraaien (fase 8) ────────────────
    // De callback schreef het saldo al op de rekening die de koppeling toen
    // kreeg. Blijft dat staan, dan draagt een rekening die niets meer met deze
    // bank te maken heeft een banksaldo — stil verkeerd in het netto vermogen,
    // de verloop-banden en de FIRE-motor.
    //
    // Ná de verhanging, om dezelfde reden als de backfill hierboven: een
    // mislukte verhanging mag geen saldo terugdraaien op een rekening die de
    // koppeling gewoon houdt. De helper gooit niet en is idempotent — ze doet
    // alleen iets als de LAATSTE waardering op die bezitting van de banksync is.
    if (link.bank_account_id) {
      const reverted = await revertBankBalanceRevaluation(supabase, {
        userId: user.id,
        bankAccountId: link.bank_account_id,
      })

      if (reverted.reverted) {
        console.info(
          '[bank-connect:relink] banksaldo teruggedraaid op de vorige drager',
          link.bank_account_id,
        )
      }
    }

    return NextResponse.json({ bank_account_id: target.id, changed: true })
  } catch (err) {
    return serverError(err, 'bankconnect-relink:POST')
  }
}
