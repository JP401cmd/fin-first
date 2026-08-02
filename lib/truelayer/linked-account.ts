import type { BankLinkHealth } from '@/lib/bank-connection-status'
import type { BankSyncBalanceChange } from '@/lib/truelayer/balance-valuation'

/**
 * Wat `GET /api/bank-connect/linked-accounts` per gekoppelde bankrekening
 * teruggeeft — de wire-vorm die de success-pagina consumeert.
 *
 * Woont in `lib/` en niet in het route-bestand: een `'use client'`-component mag
 * geen module uit `app/api/**` importeren, ook niet type-only. Zelfde reden als
 * bij `TargetAccountOption`.
 *
 * Deze vorm bestaat voor het CORRECTIEMOMENT (fase 5, SC-07): per gekoppelde
 * rekening moet zichtbaar zijn wélke TriFinity-rekening hem draagt — niet alleen
 * voor de rekening die de gebruiker expliciet aanwees. De precedentieketen in de
 * callback laat identiteit (`external_account_id`) namelijk altijd van de
 * expliciete keuze winnen, dus de koppeling kán ergens anders landen dan gekozen.
 * Dat stil laten gebeuren zou de keuze uit fase 4 tot schijnkeuze maken.
 */
export type LinkedAccountView = {
  /** `bank_connection_accounts.id` — de sleutel voor sync, voor `relink` én voor het herstelpad. */
  id: string
  /** Naam zoals de bank de rekening noemt. */
  account_name: string | null
  /** Laatste vier tekens van de IBAN bij de bank — méér verlaat de server niet. */
  iban_tail: string | null
  provider_name: string | null
  provider_logo: string | null
  /**
   * `bank_connections.provider_id` — de TrueLayer-provider waarmee de
   * autorisatie opnieuw gestart moet worden.
   *
   * Staat hier sinds fase 7 (B6): het herstelpad vanaf de rekening slaat de
   * bank-kiesstap over, en dan moet de wizard weten mét welke bank hij
   * herverbindt. Zonder dit veld zou de gebruiker zijn eigen bank opnieuw moeten
   * aanwijzen op een pad waar die al vaststaat.
   */
  provider_id: string | null
  /**
   * Het oordeel over deze koppeling, **server-side afgeleid** met
   * `deriveBankLinkHealth` uit `lib/bank-connection-status.ts`.
   *
   * Bewust het oordeel en niet de vier rauwe signalen: dan zou élke consumer de
   * afleiding opnieuw moeten doen en kon de detailpagina iets anders zeggen dan
   * de rekeningkaart — precies de drift die fase 7 wegneemt ("consume, don't
   * recompute").
   */
  health: BankLinkHealth
  /** De TriFinity-rekening die de data draagt, of `null` als de aanmaak faalde. */
  bank_account_id: string | null
  /** Naam van die TriFinity-rekening. */
  carrier_name: string | null
  /** Laatste vier tekens van de IBAN van die TriFinity-rekening. */
  carrier_iban_tail: string | null
  /**
   * Wanneer deze koppeling voor het laatst transacties ophaalde, of `null` als
   * dat nog nooit gebeurde.
   *
   * **Dit veld is de GATE van het correctiemoment, en het staat er daarom als
   * server-feit en niet als clientstate.** Verhangen is alleen zinvol zolang er
   * nog geen transacties zijn geïmporteerd (ADR 0069); zou de UI die grens uit
   * `useState` halen — gevuld door de sync-knop in dezelfde render-sessie — dan
   * heropent één refresh de grens stilzwijgend. `relink` weigert 'm ook
   * server-side; dit veld zorgt dat de knop niet eerst iets belooft dat de route
   * daarna afwijst.
   */
  last_synced_at: string | null
  /**
   * Hoeveel sync-verzoeken deze koppeling vandaag al deed, en op welke dag die
   * teller voor het laatst is gezet (`YYYY-MM-DD`).
   *
   * Staan hier sinds de rekeningdetail (`ConnectedAccountCard`) op deze route
   * overstapte. Die kaart las `bank_connection_accounts` tot dan client-direct,
   * en dat was de laatste lezer van de PLAINTEXT `iban`-kolom — de kolom die
   * gedropt gaat worden. Zonder deze twee velden kon die kaart niet verhuizen:
   * ze voeden samen de "N/10 verzoeken vandaag"-teller en de vraag of de
   * synchroniseer-knop nog aan mag staan.
   *
   * Rauwe tellers en geen afgeleid "mag synchroniseren", omdat de reset-regel
   * (teller geldt alleen vandaag) ook de zichtbare tekst voedt; één afgeleide
   * boolean zou het getal alsnog apart moeten meesturen.
   */
  daily_requests: number
  rate_limit_reset_date: string | null
  /**
   * Wat de bank vandaag aan saldo heeft overgenomen op de dragende rekening:
   * `{ previous, current }`, of `null` als er vandaag niets is overgenomen.
   *
   * **Server-afgeleid uit het grootboek** (`valuations`, de banksync-waardering
   * van vandaag), niet uit de redirect-URL: bedragen in een querystring belanden
   * in browserhistorie en serverlogs, en een client-aangeleverd "vorige saldo"
   * zou een feit zijn dat de database al draagt.
   *
   * Dit is de enige manier waarop de gebruiker het saldo dat de CALLBACK schreef
   * te zien krijgt — die schrijfactie gebeurt vóór de success-pagina laadt en
   * heeft dus geen respons om op mee te liften (besluit 3: melding, geen
   * blokkerende dialoog).
   */
  balance_change: BankSyncBalanceChange | null
}

/** Laatste vier tekens van een IBAN, of `null`. Spaties tellen niet mee. */
export function ibanTail(iban: string | null | undefined): string | null {
  const compact = iban?.replace(/\s/g, '') || null
  return compact && compact.length >= 4 ? compact.slice(-4) : null
}
