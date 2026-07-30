import type { SupabaseClient } from '@supabase/supabase-js'
import { getAccountBalance } from './client'
import {
  bankSyncValuationDate,
  isSameBalance,
  recordBankBalanceRevaluation,
} from './balance-valuation'
import type { TLBalance } from './types'

export type BalanceSyncResult = {
  /** Rauwe TrueLayer-saldi, zoals de balances-route ze bij uitblijvende sync teruggeeft. */
  balances: TLBalance[]
  /**
   * Gevuld zodra het saldo daadwerkelijk is weggeschreven; null als er niets te
   * schrijven viel (geen saldo van TrueLayer, of geen bankrekening om op te
   * schrijven). Een mislukte schrijfactie levert géén `synced: null` op maar een
   * throw — zie de helper hieronder.
   */
  synced: {
    balance: number
    currency: string
    /**
     * De waarde die het cash-bezit vóór deze sync droeg — de "van" in "saldo
     * overgenomen van de bank: €a → €b".
     *
     * `null` wanneer de bankrekening géén gekoppeld cash-bezit heeft: dan is er
     * geen vermogenswaarde die verspringt en dus ook geen "vorige waarde" om
     * over te melden. Dit is de grondslag van het netto vermogen
     * (`assets.current_value`), niet `bank_accounts.balance` — die twee lopen in
     * lockstep, maar het is de bezitting die in de verloop-banden en de
     * FIRE-motor terechtkomt.
     */
    previous: number | null
    /**
     * `true` als deze sync een herwaardering heeft weggeschreven (een
     * `valuations`-rij + snapshot-mirror). Onwaar wanneer het saldo ongewijzigd
     * was of er geen cash-bezit is.
     *
     * Staat er als eigen veld naast `previous` zodat de vergelijking "is dit
     * een échte wijziging?" op één plek leeft (in hele centen, zie
     * `isSameBalance`) in plaats van bij elke consumer opnieuw.
     */
    revalued: boolean
  } | null
}

/**
 * Haalt het saldo bij TrueLayer op en schrijft het weg naar `bank_accounts.balance`
 * én — via `linked_asset_id` — naar de gekoppelde cash-asset, zodat het saldo in
 * één keer klopt op de Kas-pagina én in het netto vermogen.
 *
 * Gedeeld tussen de balances-route (expliciete saldo-verversing) en de sync-route
 * (saldo hoort bij elke sync, zie de aanroep daar). Eén implementatie: anders
 * dreigt drift tussen "saldo via de knop" en "saldo via de sync" — precies het
 * soort dubbele som dat de bundel-conventie verbiedt.
 *
 * De caller levert een al ontsleuteld/ververst accessToken; deze helper doet
 * bewust geen tokenbeheer en geen rate-limit-boekhouding.
 *
 * **Gooit bij een mislukte schrijfactie.** Een gevulde `synced` betekent dat het
 * saldo écht in de database staat — niet slechts dat TrueLayer een getal gaf.
 * De alternatieve lijn (stil `synced: null` teruggeven) is verworpen: in de
 * balances-route is die null niet te onderscheiden van "TrueLayer had geen
 * saldo", waardoor een RLS-/constraint-fout onzichtbaar blijft. Alle callers
 * vangen deze throw niet-fataal af, dus luidruchtig falen kost hier niets.
 *
 * **Sinds fase 8 landt een gewijzigd saldo via het canonieke herwaarderingspad**
 * (`lib/truelayer/balance-valuation.ts`): een `valuations`-rij plus de mirror
 * naar `balance_snapshots`, hetzelfde pad dat een handmatige herwaardering en de
 * historische invoer volgen. Dat spoor hoort hier en niet bij de aanroepers: het
 * is onlosmakelijk deel van "het saldo is weggeschreven", en drie aanroepers met
 * elk hun eigen kopie zou de stille overschrijving gewoon verplaatsen.
 * Ongewijzigd saldo → géén waardering; anders zou elke sync de
 * herwaarderingshistorie vullen met ruis.
 */
export async function syncAccountBalance(
  supabase: SupabaseClient,
  opts: {
    accessToken: string
    dataUrl: string
    externalAccountId: string
    bankAccountId: string | null
    /**
     * De ingelogde gebruiker — eigenaar van de `valuations`- en
     * `balance_snapshots`-rijen die het herwaarderingsspoor vormen, én de scope
     * van élke lees- en schrijfronde hieronder.
     *
     * **Dat filter is een control, geen dubbelop.** `balance_snapshots` is
     * eigen-rij-RLS, maar de SELECT-policy op `bank_accounts`, `assets` én
     * `valuations` is bréder: huishoud-gedeelde partnerrijen komen erdoor. RLS
     * scope't bovendien de RÍJ en niet de WAARDE van een FK-kolom daarop, dus
     * `bank_accounts.linked_asset_id` kan (zonder guard-trigger) naar een
     * gedeelde bezitting van de partner wijzen. Zonder deze filter zou dit pad
     * een `valuations`- en `balance_snapshots`-rij onder de synchroniserende
     * gebruiker hangen aan de bezitting van iemand anders — en wél vóórdat de
     * eigendomstoets op de update faalt. Zelfde redenering als
     * `loadTargetAccount` en `ensureCashAssetForBankAccount`.
     */
    userId: string
  },
): Promise<BalanceSyncResult> {
  const balances = await getAccountBalance(opts.accessToken, opts.dataUrl, opts.externalAccountId)

  const preferred = balances[0]
  if (!preferred || !opts.bankAccountId) {
    return { balances, synced: null }
  }

  // `current` (niet `available`): het boekhoudkundige saldo is de grootheid die
  // met de transactiereeks meeloopt; `available` verrekent nog niet-geboekte
  // reserveringen en zou het vermogen laten schommelen zonder transactie.
  const balance = preferred.current

  // ── De drager eerst LEZEN, niet meteen schrijven ────────────────────────────
  // Tot fase 8 was dit één `.update().select('linked_asset_id')`: het saldo
  // wegschrijven en de bezitting opzoeken in één round-trip. Dat kan niet meer.
  // Er staan nu schrijfacties tússen die twee (de waardering en de
  // snapshot-mirror), en elke daarvan kan gooien — dan zou `bank_accounts` het
  // nieuwe saldo dragen terwijl `assets.current_value` het oude houdt. Precies
  // de drift die deze helper hoort te voorkomen. De volgorde is daarom
  // omgekeerd: grootboek → bezitting → bankrekening, zodat de laatste, minst
  // ingrijpende schrijfactie de enige is die kan achterblijven.
  const { data: carrier, error: carrierError } = await supabase
    .from('bank_accounts')
    .select('linked_asset_id')
    .eq('id', opts.bankAccountId)
    .eq('user_id', opts.userId)
    .maybeSingle()

  if (carrierError) {
    throw new Error(`Bankrekening lezen mislukt: ${carrierError.message}`)
  }

  if (!carrier) {
    throw new Error(
      `Bankrekening ${opts.bankAccountId} niet gevonden of niet zichtbaar (RLS) — saldo niet weggeschreven`,
    )
  }

  const linkedAssetId = (carrier as { linked_asset_id: string | null }).linked_asset_id
  let previous: number | null = null
  let revalued = false

  if (linkedAssetId) {
    // De huidige waarde is de "van"-waarde van de herwaardering en tegelijk de
    // toets of er überhaupt iets verandert. Deze lezing levert meteen de velden
    // die de snapshot-mirror nodig heeft (naam, subtype, weegfactor).
    const { data: assetRow, error: assetReadError } = await supabase
      .from('assets')
      .select('id, name, asset_type, current_value, net_worth_inclusion_pct')
      .eq('id', linkedAssetId)
      .eq('user_id', opts.userId)
      .maybeSingle()

    if (assetReadError) {
      throw new Error(`Gekoppelde asset lezen mislukt: ${assetReadError.message}`)
    }

    if (!assetRow) {
      throw new Error(
        `Gekoppelde asset ${linkedAssetId} niet gevonden of niet van deze gebruiker — vermogen loopt achter op het banksaldo`,
      )
    }

    const asset = assetRow as unknown as {
      id: string
      name: string
      asset_type: string
      current_value: number
      net_worth_inclusion_pct: number | null
    }
    previous = Number(asset.current_value)

    // Ongewijzigd saldo: niets aan de bezitting schrijven. Niet alleen geen
    // waardering — ook geen `updated_at`-tik, want "bijgewerkt" zonder wijziging
    // is een onwaarheid in elk oppervlak dat die datum toont.
    if (!isSameBalance(previous, balance)) {
      // Grootboek vóór de afgeleide waarde — zelfde volgorde als de live
      // herwaardering in `assets-client.tsx`. Faalt de waardering, dan staat de
      // bezitting nog op haar oude waarde en is er niets half toegepast.
      await recordBankBalanceRevaluation(supabase, {
        userId: opts.userId,
        asset: {
          id: asset.id,
          name: asset.name,
          subtype: asset.asset_type,
          netWorthInclusionPct: asset.net_worth_inclusion_pct,
        },
        previous,
        value: balance,
        date: bankSyncValuationDate(),
      })

      // `.select()` op de update: PostgREST geeft géén `error` wanneer een
      // update nul rijen raakt. De cash-asset stil laten achterlopen op de
      // bankrekening is precies de drift die deze helper hoort te voorkomen.
      const { data: updatedAsset, error: assetError } = await supabase
        .from('assets')
        .update({ current_value: balance, updated_at: new Date().toISOString() })
        .eq('id', asset.id)
        .eq('user_id', opts.userId)
        .select('id')
        .maybeSingle()

      if (assetError) {
        throw new Error(`Saldo wegschrijven naar de gekoppelde asset mislukt: ${assetError.message}`)
      }

      if (!updatedAsset) {
        throw new Error(
          `Gekoppelde asset ${asset.id} niet gevonden of niet zichtbaar (RLS) — vermogen loopt achter op het banksaldo`,
        )
      }

      revalued = true
    }
  }

  // Sluitstuk: het saldo op de bankrekening zelf. Dit gebeurt ook wanneer er
  // niets te herwaarderen viel — `bank_accounts.balance` is de rekeningstand die
  // de Kas-pagina toont en die mag niet achterlopen op een rekening zonder
  // cash-bezit.
  const { data: updatedCarrier, error: carrierWriteError } = await supabase
    .from('bank_accounts')
    .update({ balance, updated_at: new Date().toISOString() })
    .eq('id', opts.bankAccountId)
    .eq('user_id', opts.userId)
    .select('id')
    .maybeSingle()

  if (carrierWriteError) {
    throw new Error(`Saldo wegschrijven naar bank_accounts mislukt: ${carrierWriteError.message}`)
  }

  if (!updatedCarrier) {
    throw new Error(
      `Bankrekening ${opts.bankAccountId} niet gevonden of niet zichtbaar (RLS) — saldo niet weggeschreven`,
    )
  }

  return { balances, synced: { balance, currency: preferred.currency, previous, revalued } }
}
